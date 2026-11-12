import test from 'node:test';
import assert from 'node:assert/strict';
import {EncyclopediaStore,encyclopediaPrefix} from '../lib/encyclopedia/store.ts';
import {addVersion,emptyHistory,lineDiff,HISTORY_LIMIT,HISTORY_INTERVAL_MS} from '../lib/encyclopedia/history.ts';
import {demoWorkspace,playerCampaign,playerText,maptableLinks} from '../lib/encyclopedia/world-model.ts';
function harness(){
 const data=new Map();let sequence=0;
 const bucket={
  async get(key){const item=data.get(key);return item?{etag:item.etag,json:async()=>JSON.parse(item.text)}:null;},
  async put(key,text,options={}){const old=data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++sequence);data.set(key,{text,etag});return {etag};},
  async delete(key){data.delete(key);}
 };
 return {store:new EncyclopediaStore(bucket),data};
}
const edit=(w,id,body)=>{const c=structuredClone(w);const e=c.entries.find(e=>e.id===id);e.body=body;e.updatedAt=new Date().toISOString();return c;};

test('saving a changed page keeps its previous text as a version beside workspace.json',async()=>{
 const {store,data}=harness(),w=demoWorkspace();
 assert.equal(await store.save('alice',w,0),1);
 assert.equal((await store.history('alice','demo-greyhaven')).versions.length,0,'a first save has nothing earlier to keep');
 const original=w.entries.find(e=>e.id==='demo-greyhaven').body;
 const w2=edit(w,'demo-greyhaven','Rewritten');assert.equal(await store.save('alice',w2,1),2);
 const h=await store.history('alice','demo-greyhaven');
 assert.equal(h.versions.length,1);assert.equal(h.versions[0].body,original);
 assert(data.has(encyclopediaPrefix('alice')+'history/demo-greyhaven.json'));
 // workspace.json is unchanged in shape: still {data,revision}.
 assert.deepEqual(Object.keys(JSON.parse(data.get(encyclopediaPrefix('alice')+'workspace.json').text)).sort(),['data','revision']);
 // Another user's history is separate.
 assert.equal((await store.history('bob','demo-greyhaven')).versions.length,0);
});

test('typing for a while keeps at most one version per interval, and a restore always keeps the current text',async()=>{
 const {store}=harness(),w=demoWorkspace();await store.save('alice',w,0);
 const w2=edit(w,'demo-greyhaven','one');await store.save('alice',w2,1);
 const w3=edit(w2,'demo-greyhaven','two');await store.save('alice',w3,2);
 assert.equal((await store.history('alice','demo-greyhaven')).versions.length,1,'second edit within 10 minutes is not a new version');
 assert.equal(await store.checkpoint('alice','demo-greyhaven',{title:'Greyhaven',body:'two',tabs:[]}),true);
 const h=await store.history('alice','demo-greyhaven');assert.equal(h.versions.length,2);assert.equal(h.versions[1].body,'two');
 assert.equal(await store.checkpoint('alice','missing-entry',{title:'X',body:'',tabs:[]}),false);
 assert.equal(await store.checkpoint('alice','../workspace',{title:'X',body:'',tabs:[]}),false);
});

test('deleting an entry deletes its history',async()=>{
 const {store,data}=harness(),w=demoWorkspace();await store.save('alice',w,0);
 const w2=edit(w,'demo-mara','changed');await store.save('alice',w2,1);
 assert(data.has(encyclopediaPrefix('alice')+'history/demo-mara.json'));
 const w3=structuredClone(w2);w3.entries=w3.entries.filter(e=>e.id!=='demo-mara');await store.save('alice',w3,2);
 assert(!data.has(encyclopediaPrefix('alice')+'history/demo-mara.json'));
});

test('history keeps the newest versions only and skips duplicates',()=>{
 let h=emptyHistory();const start=Date.parse('2026-01-01T00:00:00Z');
 for(let i=0;i<HISTORY_LIMIT+5;i++)h=addVersion(h,{title:'T',body:'v'+i,tabs:[]},new Date(start).toISOString(),new Date(start+i*HISTORY_INTERVAL_MS));
 assert.equal(h.versions.length,HISTORY_LIMIT);assert.equal(h.versions[0].body,'v5');
 assert.equal(addVersion(h,{title:'T',body:'v'+(HISTORY_LIMIT+4),tabs:[]},'x',new Date(start+1e9),true),h);
});

test('line diff marks what a restore brings back and removes',()=>{
 assert.deepEqual(lineDiff('a\nb\nc','a\nB\nc'),[{kind:'same',text:'a'},{kind:'remove',text:'b'},{kind:'add',text:'B'},{kind:'same',text:'c'}]);
});

test('Maptable links open the GM scene; players only get the label',()=>{
 assert.deepEqual(maptableLinks('x [[maptable:abc-1|Town square]] y [[maptable:z]]'),[{sceneId:'abc-1',label:'Town square'},{sceneId:'z',label:'Battle map'}]);
 assert.equal(playerText('Go to [[maptable:abc-1|the square]].'),'Go to the square.');
 const s=demoWorkspace(),e=s.entries.find(e=>e.id==='demo-greyhaven');e.overviewVisibility='players';e.body='Map: [[maptable:SCENE-ID-123|Harbor]]';
 const text=JSON.stringify(playerCampaign(s,'demo-campaign'));assert(!text.includes('SCENE-ID-123'));assert(text.includes('Map: Harbor'));
});
