import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mapSource,pictureRequest,readPictureRequest,scenePicture} from '../lib/mcp/scene-picture.ts';

const env={AI_KEY_SECRET:'test-secret',VERCEL_PROJECT_PRODUCTION_URL:'tools.example.com'};
const P='users/u1/',id='0b5e8f7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',now=1_000_000;
const scene={id:'s1',name:'Cave',width:1000,height:800,mapId:'a1',tokens:[]};
const maps=src=>({assets:[{id:'a1',src}]});

test('the map image is named by where it is stored, never fetched from other sites',()=>{
 assert.deepEqual(mapSource(P,maps('/api/assets?id='+id),scene),{map:{b:'m',k:P+'images/'+id}});
 assert.deepEqual(mapSource(P,maps('/api/s3?key=maps%2Fcave.png'),scene),{map:{b:'s',k:'maps/cave.png'}});
 assert.equal(mapSource(P,maps('https://elsewhere.example/cave.png'),scene).map,null);
 assert.equal(mapSource(P,maps('/api/assets?id=../../x'),scene).map,null);
 assert.match(mapSource(P,{assets:[]},{...scene,mapId:null,drawing:{}}).note,/Map Creator/);
});

test('only a fresh request this server signed is read, and it stays inside its own user folder',()=>{
 const signed=pictureRequest(P,maps('/api/assets?id='+id),scene,'players',env,now);
 const r=readPictureRequest(signed.body,signed.signature,env,now);
 assert.equal(r.p,P);assert.equal(r.mode,'players');assert.deepEqual(r.map,{b:'m',k:P+'images/'+id});
 assert.equal(readPictureRequest(signed.body,signed.signature,{...env,AI_KEY_SECRET:'other'},now),null,'another secret');
 assert.equal(readPictureRequest(signed.body.replace(P,'users/u2/'),signed.signature,env,now),null,'a changed body');
 assert.equal(readPictureRequest(signed.body,null,env,now),null);
 assert.equal(readPictureRequest(signed.body,signed.signature,env,now+61_000),null,'expired');
 const other=pictureRequest(P,{assets:[]},scene,'gm',env,now);
 const forged=JSON.stringify({...JSON.parse(other.body),map:{b:'m',k:'users/u2/images/'+id}});
 assert.equal(readPictureRequest(forged,pictureRequest(P,{assets:[]},scene,'gm',env,now).signature,env,now),null);
 assert.equal(pictureRequest(P,maps('x'),scene,'gm',{},now),null,'no secret, no pictures');
});

test('the MCP side asks the picture route and passes its answer on',async()=>{
 let asked;
 const fake=async(url,init)=>{asked={url,init};return new Response(JSON.stringify({data:'abc',mimeType:'image/jpeg',note:'n'}),{status:200});};
 const pic=await scenePicture(P,maps('/api/assets?id='+id),scene,'gm',env,fake);
 assert.deepEqual(pic,{data:'abc',mimeType:'image/jpeg',note:'n'});
 assert.equal(asked.url,'https://tools.example.com/api/scene-picture');
 assert.ok(readPictureRequest(asked.init.body,asked.init.headers['X-Scene-Signature'],env),'the route would accept it');
 await assert.rejects(scenePicture(P,maps('x'),scene,'gm',{AI_KEY_SECRET:'s'},fake),/aren't set up/);
 await assert.rejects(scenePicture(P,maps('x'),scene,'gm',env,async()=>new Response('no',{status:500})),/couldn't be drawn/);
});

test('sharp is imported only by the two image routes',async()=>{
 const {execSync}=await import('node:child_process');
 const hits=execSync("grep -rlE \"from ['\\\"]sharp['\\\"]|import\\\\(['\\\"]sharp['\\\"]\\\\)\" lib app components || true").toString().trim().split('\n').filter(Boolean).sort();
 assert.deepEqual(hits,['lib/discord/avatar-image.ts','lib/mcp/scene-render.ts']);
 for(const f of ['lib/discord/avatar-image.ts','lib/mcp/scene-render.ts']){
  const name=f.split('/').pop().replace('.ts','');
  const users=execSync(`grep -rl "${name}" lib app components || true`).toString().trim().split('\n').filter(Boolean).filter(x=>x!==f);
  assert.ok(users.every(u=>u.startsWith('app/api/')),`${f} is imported only by its route: ${users}`);
 }
 assert.ok((await readFile(new URL('../app/api/scene-picture/route.ts',import.meta.url),'utf8')).includes('readPictureRequest'));
});
