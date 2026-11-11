import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {storedJson} from '../lib/transfers.ts';
const source=(await readFile(new URL('../app/api/workspace/route.ts',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('export ','');
function route(bucket,auth=async()=>({bucket,prefix:'owner/'})) {return new Function('storedJson','context','failure','privateHeaders',"const loadWorkspace=async(bucket,prefix)=>{const item=await bucket.get(prefix+'workspace.json');return item?{workspace:await item.json(),revision:item.etag}:null;};"+code+';return GET;')(storedJson,auth,e=>Response.json({error:e.message},{status:401}),{'Cache-Control':'private, no-store'});}
test('unchanged poll returns private 304 without reading workspace body',async()=>{
 let reads=0;const get=route({head:async()=>({etag:'abc'}),get:async()=>{reads++;throw Error('Unexpected body read');}});
 for(const tag of ['abc','"abc"']) {const r=await get(new Request('https://local/api/workspace',{headers:{'If-None-Match':tag}}));assert.equal(r.status,304);assert.equal(r.headers.get('ETag'),'"abc"');assert.equal(await r.text(),'');}
 assert.equal(reads,0);
});
test('changed poll returns current revision and full state, including a racing newer save',async()=>{
 const get=route({head:async()=>({etag:'b'}),get:async()=>({etag:'c',json:async()=>({scenes:[]})})});
 const r=await get(new Request('https://local/api/workspace',{headers:{'If-None-Match':'a'}}));
 assert.deepEqual(await r.json(),{workspace:{scenes:[]},revision:'c'});assert.equal(r.headers.get('ETag'),'"c"');
});
test('poll remains authenticated',async()=>{
 const get=route({},async()=>{throw Error('Unauthorized');});
 assert.equal((await get(new Request('https://local/api/workspace',{headers:{'If-None-Match':'abc'}}))).status,401);
});
