import test from 'node:test';
import assert from 'node:assert/strict';
import {EncyclopediaStore,encyclopediaPrefix} from '../lib/encyclopedia/store.ts';
import {demoWorkspace,workspaceSchema} from '../lib/encyclopedia/world-model.ts';
import {wikiPatch,splitWorkspace,applyScopedPatch} from '../lib/encyclopedia/wiki-parts.ts';
import {campaignSummary} from '../lib/campaign-links.ts';
import {knownTag,KNOWN_TAG_HEADER} from '../lib/encyclopedia/wiki-scope-client.ts';

const P=encyclopediaPrefix('alice');
function harness(){
 const data=new Map(),reads=[];let sequence=0;
 const bucket={
  async get(key){reads.push(key);const item=data.get(key);return item?{etag:item.etag,json:async()=>JSON.parse(item.text)}:null;},
  async head(key){const item=data.get(key);return item?{etag:item.etag}:null;},
  async put(key,text,options={}){const old=data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++sequence);data.set(key,{text,etag});return {etag};},
  async delete(key){data.delete(key);}
 };
 return {store:new EncyclopediaStore(bucket),data,reads,partReads:()=>reads.filter(k=>k.startsWith(P+'parts/')).length};
}
/** demoWorkspace plus `n` more worlds, each with a campaign of three pages. */
function wiki(n=4){
 const w=demoWorkspace(),c=w.campaigns[0];
 const page=w.entries.find(e=>e.kind!=='folder'&&!e.mapData&&!e.character&&!e.quest&&!e.org&&!e.codex);
 const {maptableCampaignId:_m,slug:_s,...rest}=c;
 for(let i=0;i<n;i++){
  w.worlds.push({...w.worlds[0],id:`world-${i}`,name:`World ${i}`});
  w.campaigns.push({...rest,id:`camp-${i}`,worldId:`world-${i}`,name:`Campaign ${i}`});
  for(let k=0;k<3;k++)w.entries.push({...page,id:`p-${i}-${k}`,title:`Page ${i}.${k}`,parentId:null,worldId:`world-${i}`,campaignId:`camp-${i}`,tabs:[],ties:undefined,profile:undefined,updatedAt:new Date(Date.UTC(2026,0,1+i,k)).toISOString()});
 }
 return JSON.parse(JSON.stringify(workspaceSchema.parse(w)));
}
async function saved(n){const h=harness(),w=wiki(n);assert.equal(await h.store.save('alice',w,0),1);return {...h,w};}

test('a save from one campaign reads only the parts it changes, and stores what a full save would',async()=>{
 const {store,w,reads,partReads}=await saved(6);
 const got=await store.readScoped('alice',{campaignId:'camp-2'});
 const next=structuredClone(got.data);
 next.entries.find(e=>e.id==='p-2-0').title='Renamed';
 next.entries.push({...next.entries.find(e=>e.id==='p-2-1'),id:'p-2-new',title:'New page'});
 const patch=wikiPatch(got.data,next);
 // What the full path would have stored.
 const {layout,parts}=splitWorkspace(w),expected=applyScopedPatch(parts,layout,patch,got.scope);
 reads.length=0;
 const r=await store.saveScopedPatch('alice',patch,got.revision,got.scope);
 assert.equal(r.revision,2);
 assert.equal(partReads(),1,'only camp-2 is read, not the other campaigns');
 const all=(await store.read('alice')).data;
 assert.deepEqual(all.entries.map(e=>e.id),expected.entries.map(e=>e.id),'pages keep their order');
 assert.equal(all.entries.find(e=>e.id==='p-2-0').title,'Renamed');
 assert.equal(all.entries.length,w.entries.length+1);
 assert.deepEqual(all.campaigns.map(c=>c.id),w.campaigns.map(c=>c.id));
 // The index's numbers follow the save.
 const index=await store.readIndex('alice');
 assert.equal(index.stats['c:camp-2'].pages,4);
 assert.equal(index.stats['c:camp-2'].latest.length,4);
});

test('the campaign list from the index matches the one from every page',async()=>{
 const {store}=await saved(5);
 const full=(await store.read('alice')).data,index=await store.readIndex('alice');
 assert.ok(index,'a save writes the numbers the list needs');
 assert.deepEqual(campaignSummary(null,index,10),campaignSummary(null,full,10));
 assert.deepEqual(campaignSummary(null,index,6),campaignSummary(null,full,6));
});

test('renaming a campaign, moving a page, and deleting a campaign work from a partial save',async()=>{
 const {store,partReads,reads}=await saved(4);
 const all=await store.readScoped('alice',{keys:['c:camp-0','c:camp-1']});
 const next=structuredClone(all.data);
 next.campaigns.find(c=>c.id==='camp-3').name='Renamed from afar';
 const moved=next.entries.find(e=>e.id==='p-0-0');moved.campaignId='camp-1';moved.worldId='world-1';
 next.campaigns=next.campaigns.filter(c=>c.id!=='camp-2');
 reads.length=0;
 assert.ok(await store.saveScopedPatch('alice',wikiPatch(all.data,next),all.revision,all.scope));
 assert.ok(partReads()<=4,'only the parts in the patch');
 const after=(await store.read('alice')).data;
 assert.equal(after.campaigns.find(c=>c.id==='camp-3').name,'Renamed from afar');
 assert.equal(after.entries.filter(e=>e.campaignId==='camp-3').length,3,'a campaign renamed from afar keeps its pages');
 assert.equal(after.entries.find(e=>e.id==='p-0-0').campaignId,'camp-1');
 assert.ok(!after.campaigns.some(c=>c.id==='camp-2'));
 assert.ok(!after.entries.some(e=>e.campaignId==='camp-2'),'a deleted campaign takes its pages');
 assert.equal(campaignSummary(null,await store.readIndex('alice')).rows.find(r=>r.encyclopedia?.id==='camp-1').encyclopedia.pages,4);
});

test('a partial save keeps the size limits and refuses a stale revision',async()=>{
 const {store}=await saved(3);
 const got=await store.readScoped('alice',{campaignId:'camp-1'});
 const big=structuredClone(got.data);
 for(let i=0;i<30;i++)big.entries.push({...big.entries.find(e=>e.id==='p-1-0'),id:`big-${i}`,body:'x'.repeat(90000)});
 await assert.rejects(()=>store.saveScopedPatch('alice',wikiPatch(got.data,big),got.revision,got.scope),/over the 2 MB limit/);
 assert.equal(await store.saveScopedPatch('alice',wikiPatch(got.data,got.data),got.revision+5,got.scope),null);
});

test('an index from before the numbers were kept saves the full way once, then partially',async()=>{
 const {store,data,partReads,reads}=await saved(4);
 const index=JSON.parse(data.get(P+'workspace.json').text);
 for(const ref of Object.values(index.parts))delete ref.stats;
 data.set(P+'workspace.json',{etag:'old',text:JSON.stringify(index)});
 assert.equal(await store.readIndex('alice'),null,'the list reads everything until then');
 const got=await store.readScoped('alice',{campaignId:'camp-0'}),next=structuredClone(got.data);next.entries.find(e=>e.id==='p-0-0').title='One';
 reads.length=0;
 assert.ok(await store.saveScopedPatch('alice',wikiPatch(got.data,next),got.revision,got.scope));
 assert.ok(partReads()>4,'the first save reads everything');
 assert.ok(await store.readIndex('alice'),'and writes the numbers');
 const again=await store.readScoped('alice',{campaignId:'camp-0'}),more=structuredClone(again.data);more.entries.find(e=>e.id==='p-0-0').title='Two';
 reads.length=0;
 assert.ok(await store.saveScopedPatch('alice',wikiPatch(again.data,more),again.revision,again.scope));
 assert.equal(partReads(),1);
});

test('a page sent in a part it does not belong in is refused, and nothing changes',async()=>{
 const {store}=await saved(3);
 const got=await store.readScoped('alice',{campaignId:'camp-0'});
 const patch=wikiPatch(got.data,got.data);
 patch.parts['c:camp-0']={...splitWorkspace(got.data).parts.get('c:camp-0')};
 patch.parts['c:camp-0'].entries=[...patch.parts['c:camp-0'].entries];
 patch.parts['c:camp-0'].entries[0]={...patch.parts['c:camp-0'].entries[0],campaignId:null};
 await assert.rejects(()=>store.saveScopedPatch('alice',patch,got.revision,got.scope),/not in a form/);
 const after=await store.read('alice');
 assert.equal(after.revision,got.revision);
 assert.equal(after.data.entries.find(e=>e.id==='p-0-0').campaignId,'camp-0');
});

test('updateCampaign reads and writes only that campaign',async()=>{
 const {store,partReads,reads}=await saved(5);
 reads.length=0;
 const r=await store.updateCampaign('alice','camp-4',c=>({...c,description:'Changed'}));
 assert.equal(r.revision,2);
 assert.ok(partReads()<=2,'its own part only, not the other campaigns');
 const all=(await store.read('alice')).data;
 assert.equal(all.campaigns.find(c=>c.id==='camp-4').description,'Changed');
 assert.equal(all.entries.filter(e=>e.campaignId==='camp-4').length,3);
});

test('a link to a page finds its campaign from the index',async()=>{
 const {store,reads,partReads}=await saved(5);
 reads.length=0;
 const got=await store.readScoped('alice',{entryId:'p-3-1'});
 assert.ok(got.scope.includes('c:camp-3'));
 assert.equal(partReads(),got.scope.length,'no search through other campaigns');
});

test('worlds are unlimited',()=>{
 const w=wiki(0);
 for(let i=0;i<150;i++)w.worlds.push({...w.worlds[0],id:`many-${i}`,name:`Many ${i}`});
 assert.equal(workspaceSchema.parse(w).worlds.length,w.worlds.length);
});

test('the Wiki\'s "anything new?" check carries its tag in its own header',()=>{
 assert.equal(knownTag(new Headers({[KNOWN_TAG_HEADER]:'abc'})),'abc');
 assert.equal(knownTag(new Headers({'If-None-Match':'W/"abc"'})),'abc');
 assert.equal(knownTag(new Headers()),null);
});
