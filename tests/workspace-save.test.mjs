import test from "node:test";
import assert from "node:assert/strict";
import { saveWorkspace,workspacePatch } from "../lib/workspace-save.ts";
const ref = current => ({ current });
function harness(request) {
  const statuses=[], errors=[];
  return {state:ref({name:"before"}), revision:ref("r0"), generation:ref(1), savedGeneration:ref(0), saving:ref(false), blocked:ref(false), savePromise:ref(null), request, statuses, errors, setSaveStatus:value=>statuses.push(value), setSaveError:value=>errors.push(value)};
}
const response=(revision,status=200)=>new Response(JSON.stringify(status===200?{revision}:{error:"Save refused"}),{status});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
test("manual and automatic saves share one request and promise",async()=>{
  const gate=deferred();let calls=0;
  const h=harness(async()=>{calls++;return gate.promise;});
  const automatic=saveWorkspace(h), manual=saveWorkspace(h);
  assert.equal(automatic,manual);
  await Promise.resolve();assert.equal(calls,1);
  gate.resolve(response("r1"));assert.equal(await manual,true);
  assert.equal(h.savedGeneration.current,1);assert.equal(h.revision.current,"r1");
  assert.equal(h.saving.current,false);assert.equal(h.savePromise.current,null);
});
test("edits arriving during a save are drained with the updated revision",async()=>{
  const gate=deferred(), bodies=[];
  const h=harness(async(_url,options)=>{bodies.push(JSON.parse(options.body));return bodies.length===1?gate.promise:response("r2");});
  const saving=saveWorkspace(h);await Promise.resolve();
  h.state.current={name:"after"};h.generation.current++;
  gate.resolve(response("r1"));assert.equal(await saving,true);
  assert.deepEqual(bodies.map(x=>[x.workspace.name,x.revision]),[["before","r0"],["after","r1"]]);
  assert.equal(h.savedGeneration.current,2);
});
test("failed saves return false and can be retried without losing dirty state",async()=>{
  let calls=0;const h=harness(async()=>{if(++calls===1)throw new Error("Offline");return response("r1");});
  assert.equal(await saveWorkspace(h),false);assert.equal(h.savedGeneration.current,0);
  assert.equal(h.errors.at(-1),"Offline");assert.equal(h.statuses.at(-1),"Not saved");
  assert.equal(await saveWorkspace(h),true);assert.equal(h.errors.at(-1),"");
});
test("conflicts block manual retries and preserve the unsaved workspace",async()=>{
  let calls=0;const h=harness(async()=>{calls++;return response(null,409);});
  assert.equal(await saveWorkspace(h),false);assert.equal(h.blocked.current,true);
  assert.equal(await saveWorkspace(h),false);assert.equal(calls,1);
  assert.equal(h.savedGeneration.current,0);assert.deepEqual(h.state.current,{name:"before"});
});
test("a conflict detected while a request is in flight never reports success",async()=>{
  const gate=deferred();const h=harness(async()=>gate.promise);
  const pending=saveWorkspace(h);await Promise.resolve();h.blocked.current=true;
  gate.resolve(response("r1"));assert.equal(await pending,false);
  assert.notEqual(h.statuses.at(-1),"Saved to cloud");
});

const workspace=(x=0)=>({version:1,scenes:[{id:'a',name:'Active',tokens:[{id:'token',x}]},{id:'b',name:'Untouched',image:'large-image'.repeat(10000)}],collections:[{id:'campaign',kind:'campaign',name:'Campaign'}],activeId:'a',assets:[],tokenLibrary:[]});
test('scene edits only send the changed scene, with no unrelated campaign or assets',async()=>{
 const calls=[],h=harness(async(_url,options)=>{calls.push(options);return response('r1');});h.acknowledged=ref(workspace());h.state.current=workspace(3);
 assert.equal(await saveWorkspace(h),true);const body=JSON.parse(calls[0].body);
 assert.equal(calls[0].method,'PATCH');assert.deepEqual(Object.keys(body.patch),['scenes']);assert.deepEqual(body.patch.scenes.upsert.map(s=>s.id),['a']);assert.deepEqual(body.patch.scenes.remove,[]);assert.equal(body.workspace,undefined);assert.ok(calls[0].body.length<1000);
 assert.deepEqual(h.acknowledged.current,h.state.current);
});
test('campaign metadata, scene deletion, insertion, and reorder are explicit',()=>{
 const before=workspace(),after=structuredClone(before);after.collections[0].name='Renamed';after.scenes=[before.scenes[1],{id:'new',name:'New'}];
 const patch=workspacePatch(before,after);assert.deepEqual(patch.collections,after.collections);assert.deepEqual(patch.scenes,{upsert:[{id:'new',name:'New'}],remove:['a'],order:['b','new']});assert.equal(patch.assets,undefined);
});
test('incremental saves drain in-flight edits without repeating already acknowledged scenes',async()=>{
 const gate=deferred(),bodies=[],h=harness(async(_url,options)=>{bodies.push(JSON.parse(options.body));return bodies.length===1?gate.promise:response('r2');});h.acknowledged=ref(workspace());h.state.current=workspace(1);
 const saving=saveWorkspace(h);await Promise.resolve();h.state.current=structuredClone(h.state.current);h.state.current.scenes[1].name='Edited during save';h.generation.current++;
 gate.resolve(response('r1'));assert.equal(await saving,true);assert.deepEqual(bodies.map(b=>[b.revision,b.patch.scenes.upsert.map(s=>s.id)]),[['r0',['a']],['r1',['b']]]);assert.equal(h.savedGeneration.current,2);assert.deepEqual(h.acknowledged.current,h.state.current);
});
test('undo to acknowledged content needs no request; absent baseline uses a full initial save',async()=>{
 let calls=0;const h=harness(async(_url,options)=>{calls++;assert.equal(options.method,'PUT');return response('first');});h.acknowledged=ref(workspace());h.state.current=workspace();assert.equal(await saveWorkspace(h),true);assert.equal(calls,0);
 h.acknowledged.current=null;h.generation.current++;assert.equal(await saveWorkspace(h),true);assert.equal(calls,1);
});
test('failed and conflicting patches retain the acknowledged baseline and local draft',async()=>{
 for(const status of [500,409]){const h=harness(async()=>response(null,status));h.acknowledged=ref(workspace());h.state.current=workspace(9);const before=JSON.stringify(h.acknowledged.current);assert.equal(await saveWorkspace(h),false);assert.equal(JSON.stringify(h.acknowledged.current),before);assert.equal(h.state.current.scenes[0].tokens[0].x,9);assert.equal(h.savedGeneration.current,0);}
});
test('a stale response after reload cannot acknowledge or overwrite the new editing session',async()=>{
 const gate=deferred(),h=harness(async()=>gate.promise);h.loadEpoch=ref(0);h.acknowledged=ref(workspace());h.state.current=workspace(1);const pending=saveWorkspace(h);await Promise.resolve();
 h.loadEpoch.current++;h.state.current=workspace(40);h.acknowledged.current=workspace(40);h.revision.current='reload';h.generation.current=0;h.savedGeneration.current=0;gate.resolve(response('stale'));assert.equal(await pending,false);assert.equal(h.revision.current,'reload');assert.equal(h.savedGeneration.current,0);assert.equal(h.acknowledged.current.scenes[0].tokens[0].x,40);
});
test('missing acknowledgement revision never marks a patch saved',async()=>{const h=harness(async()=>new Response('{}'));h.acknowledged=ref(workspace());h.state.current=workspace(1);assert.equal(await saveWorkspace(h),false);assert.equal(h.savedGeneration.current,0);assert.equal(h.revision.current,'r0');assert.equal(h.acknowledged.current.scenes[0].tokens[0].x,0);});

test('large workspace saves stage bytes and only commit the transfer ID through the app',async()=>{
 const calls=[];let staged;
 const h=harness(async(url,options)=>{
  calls.push(url);
  if(url==='/api/transfers'){
   const metadata=JSON.parse(options.body);assert.equal(metadata.purpose,'workspace');assert.ok(metadata.size>3_000_000);
   return Response.json({id:'staged',url:'https://storage.example/upload',fields:{key:'private-transfer'}});
  }
  if(url==='https://storage.example/upload'){
   assert.equal(options.credentials,'omit');staged=JSON.parse(await options.body.get('file').text());return new Response(null,{status:204});
  }
  assert.equal(url,'/api/workspace');assert.equal(options.method,'PUT');assert.deepEqual(JSON.parse(options.body),{transferId:'staged'});return response('r1');
 });
 h.state.current={name:'x'.repeat(3_000_001)};
 assert.equal(await saveWorkspace(h),true);assert.equal(staged.revision,'r0');assert.deepEqual(staged.workspace,h.state.current);assert.equal(h.revision.current,'r1');assert.equal(calls.length,3);
});

test('failed direct workspace upload never commits or acknowledges the draft',async()=>{
 const h=harness(async(url)=>{
  if(url==='/api/transfers')return Response.json({id:'staged',url:'https://storage.example/upload',fields:{key:'private-transfer'}});
  assert.equal(url,'https://storage.example/upload');return new Response(null,{status:403});
 });
 h.state.current={name:'x'.repeat(3_000_001)};
 assert.equal(await saveWorkspace(h),false);assert.equal(h.savedGeneration.current,0);assert.equal(h.revision.current,'r0');assert.match(h.errors.at(-1),/Storage upload failed/);
});
