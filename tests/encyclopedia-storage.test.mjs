import test from 'node:test';
import assert from 'node:assert/strict';
import {EncyclopediaStore,encyclopediaPrefix} from '../lib/encyclopedia/store.ts';
import {demoWorkspace,emptyWorkspace,campaignExport} from '../lib/encyclopedia/world-model.ts';
import {callReadTool} from '../lib/encyclopedia/mcp.ts';
import {newMap,fogBasis} from '../lib/encyclopedia/map-model.ts';
function harness(){
 const data=new Map();let sequence=0;
 const bucket={
  async get(key){const item=data.get(key);return item?{etag:item.etag,json:async()=>JSON.parse(item.text)}:null;},
  async put(key,text,options={}){const old=data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++sequence);data.set(key,{text,etag});return {etag};},
  async delete(key){data.delete(key);}
 };
 return {store:new EncyclopediaStore(bucket),data};
}
test('encyclopedia accounts are isolated from each other and Maptable; concurrent saves keep one winner',async()=>{
 const {store,data}=harness(),workspace=demoWorkspace();
 data.set('users/alice/workspace.json',{text:'{"maptable":"unchanged"}',etag:'map'});
 assert.equal(await store.save('alice',workspace,0),1);assert.deepEqual((await store.read('bob')).data,emptyWorkspace());
 assert.equal(await store.save('alice',workspace,0),null);
 const a=structuredClone(workspace),b=structuredClone(workspace);a.worlds[0].name='A';b.worlds[0].name='B';
 const results=await Promise.all([store.save('alice',a,1),store.save('alice',b,1)]);assert.equal(results.filter(v=>v!==null).length,1);assert.equal((await store.read('alice')).revision,2);
 assert.equal(data.get('users/alice/workspace.json').text,'{"maptable":"unchanged"}');
 assert.equal(encyclopediaPrefix('supabase:one'),'users/supabase%3Aone/encyclopedia/');
});
test('player keys only reveal shared fields; replacing, revoking, or removing a campaign prevents further reads',async()=>{
 const {store}=harness(),w=demoWorkspace(),entry=w.entries.find(e=>e.id==='demo-mara');
 entry.body='secret-GM-notes';entry.overviewVisibility='gm';entry.tabs=[{id:'shared',title:'Rumor',body:'Public rumor',visibility:'players'}];
 await store.save('alice',w,0);const token=await store.createLink('alice','demo-campaign');
 const shown=JSON.stringify(await store.player(token));assert.match(shown,/Public rumor/);assert.doesNotMatch(shown,/secret-GM-notes|demo-winter/);
 await store.revokeLink('bob','demo-campaign');assert.ok(await store.player(token));
 const replacement=await store.createLink('alice','demo-campaign');assert.equal(await store.player(token),null);
 await store.revokeLink('alice','demo-campaign');assert.equal(await store.player(replacement),null);
 const last=await store.createLink('alice','demo-campaign');await store.save('alice',emptyWorkspace(),1);assert.equal(await store.player(last),null);
});
test('encyclopedia agent grants and player links are independent and campaign-scoped',async()=>{
 const {store}=harness();await store.save('alice',demoWorkspace(),0);
 const agent=await store.createLink('alice','demo-campaign','agent'),player=await store.createLink('alice','demo-campaign');
 assert.equal(await store.grant(agent,'player'),null);assert.equal(await store.grant(player,'agent'),null);
 const grant=await store.grant(agent,'agent'),scope=campaignExport((await store.read(grant.owner)).data,grant.campaignId);
 assert.equal(callReadTool(scope,'list_worlds',{}).campaigns.length,1);
 assert.throws(()=>callReadTool(scope,'read_campaign',{campaign_id:'demo-campaign-two'}));
 await store.revokeLink('alice','demo-campaign','agent');assert.equal(await store.grant(agent,'agent'),null);assert.ok(await store.player(player));
});
test('player image access permits current fog masks only, rejects originals and stale masks',async()=>{
 const {store}=harness(),w=demoWorkspace(),original=crypto.randomUUID(),mask=crypto.randomUUID();
 const map={...newMap(),source:'image',imageId:original,tiles:[],visibility:'players',fog:{enabled:true,revealed:[0],previewImageId:mask,previewBasis:''}};
 map.fog.previewBasis=fogBasis(map);
 w.entries.push({...w.entries.find(e=>e.id==='demo-mara'),id:'shared-map',kind:'map',mapData:map});
 await store.save('alice',w,0);const token=await store.createLink('alice','demo-campaign');
 assert.equal(await store.playerImageOwner(token,original),null);assert.equal(await store.playerImageOwner(token,mask),'alice');assert.equal(await store.playerImageOwner(token,crypto.randomUUID()),null);
 w.entries.find(e=>e.id==='shared-map').mapData.fog.revealed=[1];await store.save('alice',w,1);
 assert.equal(await store.playerImageOwner(token,mask),null);
});
