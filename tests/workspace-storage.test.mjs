import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,newScene} from '../lib/model.ts';
import {loadWorkspace,saveWorkspace,patchWorkspace} from '../lib/workspace-storage.ts';
class Bucket {
 data=new Map();n=0;writes=[];
 async get(key){const value=this.data.get(key);return value?{etag:value.etag,json:async()=>JSON.parse(value.text)}:null;}
 async head(key){return this.get(key);}
 async put(key,text,options={}){const old=this.data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++this.n);this.data.set(key,{etag,text});this.writes.push(key);return {etag};}
}
test('legacy migration atomically publishes segments and unchanged objects are reused',async()=>{
 const b=new Bucket(),w=initialWorkspace();w.collections=[{id:'c',name:'Campaign',kind:'campaign',parentId:null}];await b.put('u/workspace.json',JSON.stringify(w));const old=await loadWorkspace(b,'u/');assert.equal(old.manifest,null);
 const saved=await saveWorkspace(b,'u/',old.workspace,old.revision);const loaded=await loadWorkspace(b,'u/');assert.equal(loaded.revision,saved.revision);assert.deepEqual(loaded.workspace,old.workspace);assert.deepEqual(await (await b.get(loaded.manifest.legacyBackup)).json(),w);
 b.writes=[];const scene={...loaded.workspace.scenes[0],name:'Changed'};const result=await patchWorkspace(b,'u/',loaded.revision,{scenes:{upsert:[scene],remove:[]}});assert.ok(result);assert.equal(b.writes.filter(k=>k.startsWith('u/workspace-segments/')).length,1);assert.equal((await loadWorkspace(b,'u/')).workspace.scenes[0].name,'Changed');
 assert.equal(await saveWorkspace(b,'u/',w,loaded.revision),null);
});
test('concurrent edits produce one CAS winner and reject stale scene order',async()=>{
 const b=new Bucket(),w=initialWorkspace(),saved=await saveWorkspace(b,'u/',w,null);const base=await loadWorkspace(b,'u/');
 const [a,c]=await Promise.all([patchWorkspace(b,'u/',saved.revision,{scenes:{upsert:[{...w.scenes[0],name:'A'}],remove:[]}}),patchWorkspace(b,'u/',saved.revision,{scenes:{upsert:[{...w.scenes[0],name:'B'}],remove:[]}})]);assert.equal([a,c].filter(Boolean).length,1);
 const current=await loadWorkspace(b,'u/');await assert.rejects(()=>patchWorkspace(b,'u/',current.revision,{scenes:{upsert:[],remove:[],order:['missing']}}),/Invalid scene order/);assert.equal(base.workspace.scenes.length,1);
});
test('campaign edit rewrites only its collection segment',async()=>{
 const b=new Bucket(),w=initialWorkspace();w.collections=[{id:'c',name:'Campaign',kind:'campaign',parentId:null}];const saved=await saveWorkspace(b,'u/',w,null);b.writes=[];await patchWorkspace(b,'u/',saved.revision,{collections:[{...w.collections[0],name:'Renamed'}]});assert.equal(b.writes.filter(k=>k.startsWith('u/workspace-segments/')).length,1);
});
test('failed staging leaves legacy root and data intact',async()=>{
 const b=new Bucket(),w=initialWorkspace();await b.put('u/workspace.json',JSON.stringify(w));const before=await loadWorkspace(b,'u/'),put=b.put.bind(b);b.put=async(key,text,options)=>{if(key.startsWith('u/workspace-segments/'))throw Error('storage failed');return put(key,text,options);};
 await assert.rejects(()=>saveWorkspace(b,'u/',before.workspace,before.revision),/storage failed/);const after=await loadWorkspace(b,'u/');assert.equal(after.revision,before.revision);assert.deepEqual(after.workspace,before.workspace);assert.equal(after.manifest,null);
});
test('failed manifest commit leaves only unreachable staged segments',async()=>{
 const b=new Bucket(),put=b.put.bind(b);b.put=async(key,text,options)=>{if(key==='u/workspace.json')throw Error('commit failed');return put(key,text,options);};
 await assert.rejects(()=>saveWorkspace(b,'u/',initialWorkspace(),null),/commit failed/);assert.equal(await b.get('u/workspace.json'),null);assert.ok(b.writes.some(key=>key.startsWith('u/workspace-segments/')));assert.equal(await loadWorkspace(b,'u/'),null);
});
test('combined workspace above 5 MB saves as separate scenes',async()=>{
 const b=new Bucket(),w=initialWorkspace(),points=Array.from({length:1000},(_,i)=>({x:i+0.123456,y:i+0.123456})),stroke={mode:'cover',shape:'brush',size:10,points};
 w.scenes=Array.from({length:3},(_,i)=>({...newScene(`Scene ${i}`),fog:{enabled:true,base:false,strokes:Array.from({length:60},()=>stroke)}}));w.activeId=w.scenes[0].id;
 assert.ok(JSON.stringify(w).length>5_000_000);const saved=await saveWorkspace(b,'u/',w,null);assert.ok(saved);const loaded=await loadWorkspace(b,'u/');assert.equal(loaded.workspace.scenes.length,3);
});
test('rejects unknown or malformed patches without changing the manifest',async()=>{
 const b=new Bucket(),w=initialWorkspace(),saved=await saveWorkspace(b,'u/',w,null);
 for(const patch of [{typo:true},{scenes:{upsert:[null],remove:[]}},{scenes:{upsert:[],remove:[],oops:true}}])await assert.rejects(()=>patchWorkspace(b,'u/',saved.revision,patch),/Invalid/);
 assert.equal((await loadWorkspace(b,'u/')).revision,saved.revision);
});
test('legacy folder IDs are stable across reads and scene patches migrate successfully',async()=>{
 const b=new Bucket(),w=initialWorkspace();w.scenes[0].folder='Old folder';await b.put('u/workspace.json',JSON.stringify(w));const a=await loadWorkspace(b,'u/'),c=await loadWorkspace(b,'u/');assert.equal(a.workspace.scenes[0].containerId,c.workspace.scenes[0].containerId);assert.equal(a.workspace.collections[0].id,c.workspace.collections[0].id);assert.equal((await (await b.get('u/workspace.json')).json()).scenes[0].folder,'Old folder');
 const scene={...a.workspace.scenes[0],name:'Edited'};const saved=await patchWorkspace(b,'u/',a.revision,{scenes:{upsert:[scene],remove:[]}});assert.ok(saved);const next=await loadWorkspace(b,'u/');assert.equal(next.workspace.scenes[0].containerId,a.workspace.collections[0].id);assert.equal(next.workspace.scenes[0].name,'Edited');
});
