import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {EncyclopediaStore} from '../lib/encyclopedia/store.ts';
import {createApiConnection,createConnection,grantFor,grantOf,listConnections,newKey,updateConnection} from '../lib/mcp/connections.ts';
import {checkConnection} from '../lib/mcp/check.ts';
import {presets} from '../lib/mcp/permissions.ts';
import {aiRequest,takeAiRequest} from '../lib/ai/chat-text.ts';

function bucket(){
 const data=new Map();let n=0;
 return {data,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){
   const v=data.get(k);
   if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;
   if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;
   data.set(k,{text,etag:String(++n)});return {etag:String(n)};
  },
  async delete(k){data.delete(k);},
  async list(){return {objects:[],truncated:false};},
 };
}
const OWNER='gm-1',CAMPAIGN='demo-campaign';
async function setup(){
 const b=bucket();await new EncyclopediaStore(b).save(OWNER,demoWorkspace(),0);
 const made=await createConnection(b,OWNER,CAMPAIGN,'Codex','helper');
 return {b,...made};
}

test('a new link replaces the key at once and keeps the name and what it may do',async()=>{
 const {b,key,connection}=await setup();
 await updateConnection(b,OWNER,CAMPAIGN,connection.id,{perms:{...presets.helper,rollOpen:'off'}});
 await grantFor(b,key);
 assert.ok((await listConnections(b,OWNER,CAMPAIGN))[0].lastUsedAt);
 const fresh=await newKey(b,OWNER,CAMPAIGN,connection.id);
 assert.match(fresh.key,/^rpg_[a-f0-9]{64}$/);assert.notEqual(fresh.key,key);
 assert.equal(await grantFor(b,key),null,'the old link stops working');
 const g=await grantFor(b,fresh.key);assert.equal(g.connectionId,connection.id);assert.equal(g.perms.rollOpen,'off');
 assert.equal(fresh.connection.name,'Codex');assert.equal(fresh.connection.perms.rollOpen,'off');
 assert.equal(fresh.connection.lastUsedAt,undefined,'"connected" starts again with the new link');
 assert.equal([...b.data.keys()].filter(k=>k.startsWith('mcp-keys/')).length,1,'the old key file is gone');
 await assert.rejects(newKey(b,OWNER,CAMPAIGN,'nope'),/already revoked/);
 const api=await createApiConnection(b,OWNER,CAMPAIGN,'Mine','helper',{provider:'anthropic',model:'claude-x',last4:'abcd',limit:null,month:'2026-11',used:0});
 await assert.rejects(newKey(b,OWNER,CAMPAIGN,api.id),/no link/);
});

test('fine-tuning one action from the dialog is saved',async()=>{
 const {b,connection}=await setup();
 const saved=await updateConnection(b,OWNER,CAMPAIGN,connection.id,{level:undefined,name:undefined,perms:{...presets.helper,writePages:'off'}});
 assert.equal(saved.perms.writePages,'off');assert.equal(saved.mode,'custom');
 assert.equal((await grantOf(b,OWNER,CAMPAIGN,connection.id)).perms.writePages,'off');
 await assert.rejects(updateConnection(b,OWNER,CAMPAIGN,connection.id,{perms:{...presets.helper,writePages:'maybe'}}),/Do it, Ask me or Off/);
});

test('Check it runs the server as an AI app would, and says whether the app has connected',async()=>{
 const {b,key,connection}=await setup();
 const before=await checkConnection(b,OWNER,CAMPAIGN,connection.id);
 assert.equal(before.ok,true);assert.ok(before.tools>5,`tools: ${before.tools}`);assert.equal(before.campaign,'The Salt Road');
 assert.equal(before.reached,false,'the app never used the link');
 assert.equal((await listConnections(b,OWNER,CAMPAIGN))[0].lastUsedAt,undefined,'checking is not the app connecting');
 await grantFor(b,key);
 const after=await checkConnection(b,OWNER,CAMPAIGN,connection.id);assert.equal(after.reached,true);assert.ok(after.lastUsedAt);
 await assert.rejects(checkConnection(b,OWNER,CAMPAIGN,'gone'),/already revoked/);
 const empty=bucket();const other=await createConnection(empty,OWNER,CAMPAIGN,'Lost','helper');
 const gone=await checkConnection(empty,OWNER,CAMPAIGN,other.connection.id);
 assert.equal(gone.ok,false);assert.match(gone.problem,/campaign/i);
});

test('the dashboard asks the panel for a chat, a tab or a question, which it takes once',()=>{
 Object.assign(aiRequest,{ask:'What does the hag want?'});
 assert.deepEqual(takeAiRequest(),{ask:'What does the hag want?'});
 assert.deepEqual(takeAiRequest(),{});
});
