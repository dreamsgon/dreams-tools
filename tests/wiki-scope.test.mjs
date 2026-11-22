import test from 'node:test';
import assert from 'node:assert/strict';
import {EncyclopediaStore,encyclopediaPrefix} from '../lib/encyclopedia/store.ts';
import {demoWorkspace,workspaceSchema} from '../lib/encyclopedia/world-model.ts';
import {wikiPatch,scopeKeys,splitWorkspace,DamagedWikiError} from '../lib/encyclopedia/wiki-parts.ts';

function harness(){
 const data=new Map(),reads=[];let sequence=0;
 const bucket={
  async get(key){reads.push(key);const item=data.get(key);return item?{etag:item.etag,json:async()=>JSON.parse(item.text)}:null;},
  async put(key,text,options={}){const old=data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++sequence);data.set(key,{text,etag});return {etag};},
  async delete(key){data.delete(key);}
 };
 return {store:new EncyclopediaStore(bucket),data,reads};
}
const P=encyclopediaPrefix('alice');
/** demoWorkspace plus a second world with its own campaign, and a template world. */
function wiki(){
 const w=demoWorkspace(),c=w.campaigns[0];
 w.worlds.push({...w.worlds[0],id:'world-two',name:'Second world'},{...w.worlds[0],id:'tpl',name:'Template',isTemplate:true});
 const {maptableCampaignId:_m,slug:_s,...rest}=c;w.campaigns.push({...rest,id:'campaign-three',worldId:'world-two',name:'Third campaign'});
 const page=w.entries.find(e=>e.kind!=='folder'&&!e.mapData&&!e.character&&!e.quest&&!e.org&&!e.codex);
 const plain=(id,worldId,campaignId)=>({...page,id,title:id,parentId:null,worldId,campaignId,tabs:[],ties:undefined,profile:undefined});
 w.entries.push(plain('two-lore','world-two',null),plain('three-page','world-two','campaign-three'),plain('tpl-page','tpl',null));
 return JSON.parse(JSON.stringify(workspaceSchema.parse(w)));
}
async function saved(){const h=harness(),w=wiki();assert.equal(await h.store.save('alice',w,0),1);return {...h,w};}

test('opening a campaign reads only its pages, its world lore and template worlds',async()=>{
 const {store,w,reads}=await saved();
 reads.length=0;
 const got=await store.readScoped('alice',{campaignId:'campaign-three'});
 assert.deepEqual(got.scope,['c:campaign-three','w:world-two','w:tpl']);
 assert.deepEqual(got.data.entries.map(e=>e.id).sort(),['three-page','tpl-page','two-lore']);
 assert.equal(got.data.campaigns.length,w.campaigns.length,'every campaign is listed');
 assert.equal(got.data.worlds.length,w.worlds.length);
 assert.equal(reads.filter(k=>k.startsWith(P+'parts/')).length,3,'the other campaigns are not read');
 assert.ok(got.sizes.some(s=>s.key===`c:${w.campaigns[0].id}`&&s.pages>0),'sizes cover parts not opened');
 // A link naming only a page finds the campaign it is in.
 const found=await store.readScoped('alice',{entryId:'three-page'});
 assert.ok(found.scope.includes('c:campaign-three'));
 // Without a place: the first live world.
 assert.deepEqual((await store.readScoped('alice',{})).scope,[`w:${w.worlds[0].id}`,'w:tpl']);
});

test('a save from one campaign keeps every other campaign as stored',async()=>{
 const {store,w}=await saved();
 const got=await store.readScoped('alice',{campaignId:'campaign-three'});
 const next=structuredClone(got.data);
 next.entries.find(e=>e.id==='three-page').title='Renamed';
 next.campaigns.find(c=>c.id===w.campaigns[0].id).name='Other campaign renamed';
 const r=await store.saveScopedPatch('alice',wikiPatch(got.data,next),got.revision,got.scope);
 assert.equal(r.revision,2);
 const all=(await store.read('alice')).data;
 assert.equal(all.entries.find(e=>e.id==='three-page').title,'Renamed');
 assert.equal(all.campaigns.find(c=>c.id===w.campaigns[0].id).name,'Other campaign renamed','a campaign not opened can still be renamed');
 assert.equal(all.entries.filter(e=>e.campaignId===w.campaigns[0].id).length,w.entries.filter(e=>e.campaignId===w.campaigns[0].id).length,'and keeps its pages');
 assert.equal(all.entries.length,w.entries.length);
 // A new campaign made in that tab can get pages straight away.
 const again=await store.readScoped('alice',{campaignId:'campaign-three'}),more=structuredClone(again.data);
 const {maptableCampaignId:_m,slug:_s,...rest}=w.campaigns[0];more.campaigns.push({...rest,id:'fresh',worldId:'world-two',name:'Fresh'});
 more.entries.push({...more.entries.find(e=>e.id==='three-page'),id:'fresh-page',campaignId:'fresh'});
 assert.ok(await store.saveScopedPatch('alice',wikiPatch(again.data,more),again.revision,again.scope));
 assert.ok((await store.read('alice')).data.entries.some(e=>e.id==='fresh-page'));
});

test('a scoped save cannot carry pages from a campaign it did not open, and a stale one is refused',async()=>{
 const {store,w}=await saved();
 const got=await store.readScoped('alice',{campaignId:'campaign-three'});
 const full=(await store.read('alice')).data;
 const sneaky=structuredClone(got.data);sneaky.entries.push(...full.entries.filter(e=>e.campaignId===w.campaigns[0].id).slice(0,1).map(e=>({...e,title:'changed'})));
 await assert.rejects(()=>store.saveScopedPatch('alice',wikiPatch(got.data,sneaky),got.revision,got.scope),DamagedWikiError);
 assert.equal(await store.saveScopedPatch('alice',wikiPatch(got.data,got.data),0,got.scope),null);
 // Deleting a campaign that wasn't opened takes its pages with it, as deleting it in a full Wiki would.
 const gone=structuredClone(got.data);gone.campaigns=gone.campaigns.filter(c=>c.id!==w.campaigns[0].id);
 assert.ok(await store.saveScopedPatch('alice',wikiPatch(got.data,gone),got.revision,got.scope));
 const all=(await store.read('alice')).data;
 assert.ok(!all.campaigns.some(c=>c.id===w.campaigns[0].id));
 assert.ok(!all.entries.some(e=>e.campaignId===w.campaigns[0].id));
});

test('an account saved before the index named its campaigns, or never split, still opens one campaign',async()=>{
 const {store,data}=harness(),w=wiki();
 data.set(P+'workspace.json',{etag:'e1',text:JSON.stringify({revision:4,data:w})});
 const got=await store.readScoped('alice',{campaignId:'campaign-three'});
 assert.equal(got.revision,4);
 assert.deepEqual(got.data.entries.map(e=>e.id).sort(),['three-page','tpl-page','two-lore']);
 assert.ok(await store.saveScopedPatch('alice',wikiPatch(got.data,got.data),4,got.scope),'its first save splits it as before');
 assert.ok(JSON.parse(data.get(P+'workspace.json').text).meta,'and names its campaigns');
});

test('scopeKeys follows linked worlds and ignores missing ones',()=>{
 const w=wiki(),{parts}=splitWorkspace(w);
 const meta={worlds:w.worlds,campaigns:w.campaigns.map(c=>c.id==='campaign-three'?{...c,linkedWorldIds:[w.worlds[0].id,'gone']}:c)};
 assert.deepEqual(scopeKeys(meta,{campaignId:'campaign-three'}),['c:campaign-three','w:world-two',`w:${w.worlds[0].id}`,'w:tpl']);
 assert.ok(parts.size>3);
});

test('the browser side: the address it asks, where it opens, and what must be opened before a save',async()=>{
 const {scopedUrl,scopeHint,addPages,outsideScope,pagesIn}=await import('../lib/encyclopedia/wiki-scope-client.ts');
 assert.equal(scopedUrl({campaign:'c 1',parts:['c:a','w:b']}),'/api/encyclopedia/workspace?scope=1&campaign=c+1&parts=c%3Aa%2Cw%3Ab');
 assert.deepEqual(scopeHint(new URLSearchParams('entry=p1'),'?campaign=old'),{campaign:null,world:null,entry:'p1',maptable:null},'the address wins');
 assert.equal(scopeHint(new URLSearchParams(''),'?campaign=old').campaign,'old','else the last place');
 const {store,w}=await saved();
 const got=await store.readScoped('alice',{campaignId:'campaign-three'});
 const other=w.campaigns[0].id,known=new Set(got.sizes.map(s=>s.key));
 const next=structuredClone(got.data);next.entries.push({...next.entries.find(e=>e.id==='three-page'),id:'moved',worldId:w.campaigns[0].worldId,campaignId:other});
 assert.deepEqual(outsideScope(got.data,next,got.scope,known),[`c:${other}`],'a page put into a campaign not opened needs it opened first');
 assert.deepEqual(outsideScope(got.data,got.data,got.scope,known),[]);
 const more=await store.readScoped('alice',{keys:[`c:${other}`]});
 const joined=addPages(got.data,more.data);
 assert.ok(joined.entries.length>got.data.entries.length);
 assert.equal(addPages(joined,more.data),joined,'nothing twice');
 assert.equal(pagesIn(got.data,other,new Map([[`c:${other}`,7]])),7,'counted by the server when not opened');
});
