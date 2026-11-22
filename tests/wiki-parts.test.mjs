import test from 'node:test';
import assert from 'node:assert/strict';
import {EncyclopediaStore,encyclopediaPrefix} from '../lib/encyclopedia/store.ts';
import {demoWorkspace,workspaceSchema} from '../lib/encyclopedia/world-model.ts';
import {splitWorkspace,joinWorkspace,wikiPatch,applyWikiPatch,sizeProblem,partSizes,DamagedWikiError,MB} from '../lib/encyclopedia/wiki-parts.ts';

function harness(){
 const data=new Map(),log=[];let sequence=0;
 const bucket={
  async get(key){const item=data.get(key);return item?{etag:item.etag,json:async()=>JSON.parse(item.text)}:null;},
  async put(key,text,options={}){const old=data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++sequence);data.set(key,{text,etag});log.push(['put',key]);return {etag};},
  async delete(key){data.delete(key);log.push(['delete',key]);}
 };
 return {store:new EncyclopediaStore(bucket),data,log,bucket};
}
const root=encyclopediaPrefix('alice')+'workspace.json',partKeys=data=>[...data.keys()].filter(k=>k.startsWith(encyclopediaPrefix('alice')+'parts/'));
const index=data=>JSON.parse(data.get(root).text);
/** demoWorkspace plus a second world with its own campaign, pages shuffled so their order is not grouped by campaign. */
function bigger(){
 const w=demoWorkspace(),c=w.campaigns[0];
 w.worlds.push({...w.worlds[0],id:'world-two',name:'Second world'});
 const {maptableCampaignId:_m,slug:_s,...rest}=c;w.campaigns.push({...rest,id:'campaign-three',worldId:'world-two',name:'Third campaign'});
 const page=w.entries.find(e=>e.kind!=='folder'&&!e.mapData&&!e.character&&!e.quest&&!e.org&&!e.codex);
 for(let i=0;i<6;i++)w.entries.splice(i*2,0,{...page,id:`p-${i}`,title:`Page ${i}`,parentId:null,worldId:'world-two',campaignId:i%2?'campaign-three':null,tabs:[],ties:undefined,profile:undefined});
 return JSON.parse(JSON.stringify(workspaceSchema.parse(w)));
}
const pad=(w,campaignId,chars,id='pad')=>{const c=structuredClone(w);const page=c.entries.find(e=>e.kind!=='folder'&&!e.mapData&&!e.character&&!e.quest&&!e.org&&!e.codex);c.entries.push({...page,id,title:id,parentId:null,worldId:c.campaigns.find(x=>x.id===campaignId).worldId,campaignId,tabs:[{id:'t',title:'Long',body:'x'.repeat(90000),visibility:'gm'}],body:'y'.repeat(Math.min(chars,99000)),ties:undefined,profile:undefined});return c;};
/** Pads a campaign to about `bytes` with several long pages. */
let padded=0;
const grow=(w,campaignId,bytes)=>{let c=w;for(let i=0;i*190000<bytes;i++)c=pad(c,campaignId,99000,`${campaignId}-pad-${padded++}`);return c;};

test('splitting into parts and joining them gives back exactly the same workspace, order included',()=>{
 const w=bigger(),{layout,parts}=splitWorkspace(w);
 assert.deepEqual(joinWorkspace(layout,parts),w);
 assert.ok(parts.has('c:campaign-three')&&parts.has('w:world-two'));
 assert.ok(parts.get('c:campaign-three').entries.every(e=>e.campaignId==='campaign-three'));
 assert.ok(parts.get('w:world-two').entries.every(e=>e.campaignId===null));
 assert.ok(layout.runs.length>3,'interleaved pages keep their order through runs');
 // A part that lost a page, or a layout that names a missing campaign, is refused rather than joined.
 const short=new Map(parts);short.set('c:campaign-three',{...parts.get('c:campaign-three'),entries:parts.get('c:campaign-three').entries.slice(1)});
 assert.throws(()=>joinWorkspace(layout,short),DamagedWikiError);
 assert.throws(()=>joinWorkspace({...layout,campaigns:[...layout.campaigns,'gone']},parts),DamagedWikiError);
});

test('a patch carries only the campaigns that changed and rebuilds the same workspace',()=>{
 const before=bigger(),after=structuredClone(before);after.entries.find(e=>e.id==='p-1').body='changed';
 const patch=wikiPatch(before,after);
 assert.deepEqual(Object.keys(patch.parts),['c:campaign-three']);
 assert.deepEqual(applyWikiPatch(splitWorkspace(before).parts,patch),after);
 const gone=structuredClone(after);gone.entries=gone.entries.filter(e=>e.campaignId!=='campaign-three');gone.campaigns=gone.campaigns.filter(c=>c.id!=='campaign-three');
 const removal=wikiPatch(after,gone);assert.equal(removal.parts['c:campaign-three'],null);
 assert.deepEqual(applyWikiPatch(splitWorkspace(after).parts,removal),gone);
});

test('an account saved before the split is read as it is, then split on its next save with the old file kept',async()=>{
 const {store,data}=harness(),w=bigger(),legacy=JSON.stringify({data:w,revision:7});
 data.set(root,{text:legacy,etag:'old'});
 const read=await store.read('alice');assert.equal(read.revision,7);assert.deepEqual(read.data,w);assert.equal(read.limit,2*MB);
 const next=structuredClone(w);next.entries.find(e=>e.id==='p-0').body='edited after the split';
 assert.equal(await store.save('alice',next,7),8);
 const i=index(data);
 assert.equal(i.format,'wiki-parts-v1');assert.equal(i.data,undefined,'older code finds no data, so it refuses to save over the split Wiki');
 assert.equal(data.get(encyclopediaPrefix('alice')+'backups/before-wiki-split.json').text,legacy,'the old single file is kept exactly');
 assert.equal(partKeys(data).length,w.worlds.length+w.campaigns.length);
 assert.deepEqual((await store.read('alice')).data,next);
 // The second save does not replace that backup.
 await store.save('alice',w,8);assert.equal(data.get(encyclopediaPrefix('alice')+'backups/before-wiki-split.json').text,legacy);
});

test('the limit is per campaign: several big campaigns fit, one too-big campaign is refused until the owner raises it',async()=>{
 const {store,data}=harness();let w=bigger();
 await store.save('alice',w,0);
 // Two campaigns of about 1.5 MB each: 3 MB together, more than the old 2 MB for everything.
 w=grow(grow(w,'demo-campaign',1.4*MB),'campaign-three',1.4*MB);
 assert.ok(partSizes(w).filter(s=>s.bytes>1.2*MB).length===2);
 assert.equal(await store.save('alice',w,1),2);
 const tooBig=grow(w,'campaign-three',1*MB);
 assert.match(sizeProblem(tooBig),/Third campaign.*over the 2 MB limit/);
 await assert.rejects(()=>store.save('alice',tooBig,2),/Third campaign.*over the 2 MB limit/);
 assert.equal((await store.read('alice')).revision,2,'nothing was saved');
 await assert.rejects(()=>store.setPartLimit('alice',3*MB),/Choose one of the limits/);
 assert.ok(await store.setPartLimit('alice',5*MB));
 assert.equal(index(data).limit,5*MB);assert.equal((await store.read('alice')).limit,5*MB);
 assert.equal(await store.save('alice',tooBig,3),4);
 // Lowering it below a campaign's size is refused, and says which campaign.
 await assert.rejects(()=>store.setPartLimit('alice',2*MB),/Third campaign/);
});

test('a patch save writes only the changed campaign and removes the part it replaced',async()=>{
 const {store,data,log}=harness(),w=bigger();await store.save('alice',w,0);
 const before=index(data),after=structuredClone(w);after.entries.find(e=>e.id==='p-3').body='only this campaign';
 log.length=0;
 const saved=await store.savePatch('alice',wikiPatch(w,after),1);assert.equal(saved.revision,2);
 const puts=log.filter(([op,k])=>op==='put'&&k.includes('/parts/'));assert.equal(puts.length,1);assert.match(puts[0][1],/parts\/c%3Acampaign-three\//);
 assert.deepEqual(log.filter(([op])=>op==='delete').map(([,k])=>k),[before.parts['c:campaign-three'].key]);
 assert.deepEqual((await store.read('alice')).data,after);
 assert.equal(await store.savePatch('alice',wikiPatch(w,after),1),null,'a patch made against an older revision is refused');
 // A patch whose parts don't add up is refused and saves nothing.
 const bad=wikiPatch(w,after);bad.layout.runs[0][1]+=5;
 await assert.rejects(()=>store.savePatch('alice',bad,2),DamagedWikiError);assert.equal((await store.read('alice')).revision,2);
});

test('of two saves at once, one wins and the other leaves no stray parts behind',async()=>{
 const {store,data}=harness(),w=bigger();await store.save('alice',w,0);
 const a=structuredClone(w),b=structuredClone(w);a.entries.find(e=>e.id==='p-1').body='A';b.entries.find(e=>e.id==='p-1').body='B';
 const results=await Promise.all([store.save('alice',a,1),store.save('alice',b,1)]);
 assert.equal(results.filter(v=>v!==null).length,1);
 const used=new Set(Object.values(index(data).parts).map(r=>r.key));
 assert.deepEqual(partKeys(data).filter(k=>!used.has(k)),[]);
});

test('a missing part is reported, and nothing is saved over it',async()=>{
 const {store,data}=harness(),w=bigger();await store.save('alice',w,0);
 data.delete(index(data).parts['c:demo-campaign'].key);
 await assert.rejects(()=>store.read('alice'),DamagedWikiError);
 await assert.rejects(()=>store.save('alice',w,1),DamagedWikiError);
 assert.equal(index(data).revision,1);
});

test('the browser stages a save over 3 MB and follows a handed-over load',async()=>{
 const {putWorkspace,workspaceBody}=await import('../lib/encyclopedia/workspace-client.ts');
 const calls=[];
 const request=async(url,init={})=>{calls.push([url,init.method??'GET']);
  if(url==='/api/transfers')return Response.json({id:'00000000-0000-4000-8000-000000000000',url:'https://bucket.example/upload',fields:{key:'k'}});
  if(url==='https://bucket.example/upload')return new Response(null,{status:204});
  if(url==='https://bucket.example/download')return Response.json({data:{big:true},revision:3});
  return Response.json({ok:true,body:JSON.parse(init.body)});};
 const small=await (await putWorkspace('/api/encyclopedia/workspace',{data:{a:1},revision:1},request)).json();
 assert.deepEqual(small.body,{data:{a:1},revision:1});
 const big=await (await putWorkspace('/api/encyclopedia/workspace',{data:'x'.repeat(3_100_000),revision:1},request)).json();
 assert.deepEqual(big.body,{transferId:'00000000-0000-4000-8000-000000000000'});
 assert.deepEqual(calls.slice(-3).map(c=>c[0]),['/api/transfers','https://bucket.example/upload','/api/encyclopedia/workspace']);
 assert.deepEqual(await workspaceBody(Response.json({downloadUrl:'https://bucket.example/download'}),request),{data:{big:true},revision:3});
});
