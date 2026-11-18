import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,newScene,newToken} from '../lib/model.ts';
import {loadWorkspace,saveWorkspace} from '../lib/workspace-storage.ts';
import {campaignSession,readBoth} from '../lib/campaigns-server.ts';
import {buildBackup,checkBackup,imageRefs,planImport,remapIds,removeBookCampaign,removeMapCampaign,removeTablesCampaign,remapFile,fileOrder} from '../lib/campaign-backup.ts';
import {startBackup,readFiles,importCampaign,importFiles,deleteCampaign,haveImages,deletedKey} from '../lib/campaign-backup-server.ts';
import {encyclopediaPrefix} from '../lib/encyclopedia/store.ts';
import {forumKey} from '../lib/forum/store.ts';
import {emptyForum} from '../lib/forum/model.ts';
import {listKey} from '../lib/members-server.ts';
import {emptyMemberList} from '../lib/members.ts';

class Bucket {
 data=new Map();n=0;
 obj(v){return {etag:v.etag,size:v.text.length,httpMetadata:{contentType:v.type},json:async()=>JSON.parse(v.text),arrayBuffer:async()=>new TextEncoder().encode(v.text).buffer};}
 async get(key){const v=this.data.get(key);return v?this.obj(v):null;}
 async head(key){return this.get(key);}
 async put(key,body,options={}){const old=this.data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++this.n);this.data.set(key,{text:typeof body==='string'?body:new TextDecoder().decode(body),etag,type:options.httpMetadata?.contentType??'application/json'});return {etag};}
 async delete(key){this.data.delete(key);}
 async signedGet(key){return 'https://signed.example/'+key;}
}
const gh={repository:'',branch:'main'},T='2026-11-01T00:00:00.000Z';
const IMG1='11111111-1111-4111-8111-111111111111',IMG2='22222222-2222-4222-8222-222222222222',IMG5='55555555-5555-4555-8555-555555555555';
const page=(id,campaignId,extra={})=>({id,worldId:'w1',campaignId,parentId:null,title:id,kind:'note',body:'',updatedAt:T,...extra});

function maps(){
 const w=initialWorkspace(),loose=w.scenes[0];
 w.collections=[{id:'m1',name:'Sunless Citadel',kind:'campaign',parentId:null},{id:'f1',name:'Act 1',kind:'folder',parentId:'m1'},{id:'m2',name:'Other',kind:'campaign',parentId:null}];
 const scene=newScene('Gate');scene.containerId='f1';scene.mapId='a1';
 const tok=newToken('Goblin');tok.assetId='a2';tok.sourceLibraryId='lib1';scene.tokens=[tok];
 const other=newScene('Elsewhere');other.containerId='m2';other.mapId='a3';
 w.scenes=[loose,scene,other];
 w.assets=[{id:'a1',name:'Gate map',src:`/api/assets?id=${IMG1}`,width:100,height:100},{id:'a2',name:'Goblin',src:`/api/assets?id=${IMG2}`,width:10,height:10},{id:'a3',name:'Other map',src:'/api/assets?id=33333333-3333-4333-8333-333333333333',width:10,height:10},{id:'a4',name:'Unused, Sunless',src:'/api/assets?id=44444444-4444-4444-8444-444444444444',width:10,height:10}];
 w.assetCampaigns={a1:'m1',a4:'m1',a3:'m2'};
 const lib=newToken('Goblin');lib.id='lib1';lib.assetId='a2';w.tokenLibrary=[lib];w.libraryCampaigns={lib1:'m1'};
 return w;
}
function book(){
 return {schemaVersion:1,worlds:[{id:'w1',name:'Ashenwood',description:'',archived:false}],
  campaigns:[{id:'e1',worldId:'w1',name:'Sunless Citadel',description:'',github:gh,maptableCampaignId:'m1',forum:true},{id:'e2',worldId:'w1',name:'Other',description:'',github:gh,maptableCampaignId:'m2'}],
  entries:[page('lore',null,{body:'The old world.'}),page('p1','e1',{body:'See [[lore|the lore]] and [[p2]].',picture:{imageId:IMG5,width:10,height:10,x:.5,y:.5,size:1}}),page('p2','e1',{kind:'session'}),page('q1','e2')]};
}
async function setup(){
 const b=new Bucket(),s=campaignSession(b,'owner-1');
 await saveWorkspace(b,s.prefix,maps(),null);
 assert.equal(await s.book.save('owner-1',book(),0),1);
 await s.book.saveTables('owner-1',{tables:[{id:'t1',name:'Loot',campaignIds:['e1'],rows:[]},{id:'t2',name:'Shared',campaignIds:['e1','e2'],rows:[]}]},0).catch(()=>{});
 const forum={...emptyForum()};
 await b.put(forumKey('owner-1','e1'),JSON.stringify(forum));
 await b.put(encyclopediaPrefix('owner-1')+'transcripts/p2.txt','We fought goblins.',{httpMetadata:{contentType:'text/plain; charset=utf-8'}});
 const list=emptyMemberList('e1','GM');list.members=[];await b.put(listKey('owner-1','e1'),JSON.stringify(list));
 await b.put(encyclopediaPrefix('owner-1')+'player-links/e1.json',JSON.stringify({hash:'ab'.repeat(32)}));
 await b.put('encyclopedia-player-keys/'+'ab'.repeat(32)+'.json',JSON.stringify({owner:'owner-1',campaignId:'e1'}));
 return {b,s};
}

test('a backup holds only this campaign: its folders, scenes, tokens, pictures, pages and tables', async () => {
 const map=maps(),bk=book();
 const backup=buildBackup({name:'Sunless Citadel',now:T,map,maptableId:'m1',book:bk,encyclopediaId:'e1',tables:{tables:[{id:'t1',campaignIds:['e1']},{id:'t3',campaignIds:null},{id:'t4',campaignIds:['e2']}]},members:null,dashboard:null});
 assert.deepEqual(backup.maptable.collections.map(c=>c.id),['m1','f1']);
 assert.deepEqual(backup.maptable.scenes.map(s=>s.name),['Gate']);
 assert.deepEqual(backup.maptable.assets.map(a=>a.id).sort(),['a1','a2','a4'],'used or owned pictures, never another campaign\'s');
 assert.deepEqual(backup.maptable.tokenLibrary.map(t=>t.id),['lib1']);
 assert.deepEqual(backup.encyclopedia.workspace.entries.map(e=>e.id).sort(),['lore','p1','p2'],'the world lore comes along, the other campaign does not');
 assert.deepEqual(backup.tables.map(t=>t.id),['t1']);
 assert.deepEqual(imageRefs(backup).map(r=>`${r.tool}:${r.id}`).sort(),[`encyclopedia:${IMG5}`,`maptable:${IMG1}`,`maptable:${IMG2}`,'maptable:44444444-4444-4444-8444-444444444444']);
 assert.equal(checkBackup(backup).ok,true);
 assert.equal(checkBackup({format:'nope'}).ok,false);
 assert.ok(!JSON.stringify(backup).includes('webhook'));
});

test('importing into the same account makes a new copy with new ids and keeps the world', async () => {
 const map=maps(),bk=book();
 const backup=buildBackup({name:'Sunless Citadel',now:T,map,maptableId:'m1',book:bk,encyclopediaId:'e1',tables:null,members:null,dashboard:null});
 let n=0;const plan=planImport(backup,{map,book:bk,tables:{tables:[]}},()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`);
 assert.equal(plan.name,'Sunless Citadel (imported)');
 assert.equal(plan.map.collections.length,5);
 const mc=plan.map.collections.find(c=>c.id===plan.maptableId);
 assert.equal(mc.name,'Sunless Citadel (imported)');
 const folder=plan.map.collections.find(c=>c.parentId===plan.maptableId);
 const scene=plan.map.scenes.find(s=>s.containerId===folder.id);
 assert.ok(scene&&scene.id!==map.scenes[1].id);
 assert.equal(scene.tokens[0].sourceLibraryId,plan.ids.lib1,'references follow the new ids');
 assert.equal(plan.map.libraryCampaigns[plan.ids.lib1],plan.maptableId);
 assert.equal(plan.map.assets.length,4,'pictures already here are not added twice');
 assert.equal(plan.book.worlds.length,1,'the world is still here, so the campaign joins it');
 const c=plan.book.campaigns.find(x=>x.id===plan.encyclopediaId);
 assert.equal(c.maptableCampaignId,plan.maptableId);
 const p1=plan.book.entries.find(e=>e.id===plan.ids.p1);
 assert.equal(p1.body,`See [[lore|the lore]] and [[${plan.ids.p2}]].`);
 assert.equal(plan.book.entries.filter(e=>e.id==='lore').length,1);
});

test('importing into an empty account brings the world too', async () => {
 const backup=buildBackup({name:'Sunless Citadel',now:T,map:maps(),maptableId:'m1',book:book(),encyclopediaId:'e1',tables:null,members:null,dashboard:null});
 const plan=planImport(backup,{map:null,book:{schemaVersion:1,worlds:[],campaigns:[],entries:[]},tables:{tables:[]}});
 assert.equal(plan.name,'Sunless Citadel');
 assert.equal(plan.book.worlds.length,1);
 assert.notEqual(plan.book.worlds[0].id,'w1');
 assert.equal(plan.book.entries.length,3);
 const p1=plan.book.entries.find(e=>e.id===plan.ids.p1);
 assert.equal(p1.body,`See [[${plan.ids.lore}|the lore]] and [[${plan.ids.p2}]].`);
 assert.deepEqual(plan.map.scenes.map(s=>s.name),['Gate']);
});

test('removing a campaign leaves the others, the world and shared pictures alone', () => {
 const map=removeMapCampaign(maps(),'m1');
 assert.deepEqual(map.collections.map(c=>c.id),['m2']);
 assert.ok(!map.scenes.some(s=>s.name==='Gate'));
 assert.deepEqual(map.assets.map(a=>a.id).sort(),['a2','a3'],'owned and unused pictures go; one another thing uses stays');
 assert.equal(map.tokenLibrary.length,0);
 const bk=removeBookCampaign(book(),'e1','m1');
 assert.deepEqual(bk.campaigns.map(c=>c.id),['e2']);
 assert.deepEqual(bk.entries.map(e=>e.id),['lore','q1']);
 const tables=removeTablesCampaign({tables:[{id:'t1',campaignIds:['e1']},{id:'t2',campaignIds:['e1','e2']},{id:'t3',campaignIds:null}]},'e1');
 assert.deepEqual(tables.tables.map(t=>[t.id,t.campaignIds]),[['t2',['e2']],['t3',null]]);
});

test('ids are replaced as values, keys and inside text, nothing else', () => {
 const ids={a:'A','11111111-1111-4111-8111-111111111111':'99999999-9999-4999-8999-999999999999'};
 assert.deepEqual(remapIds({k:'a',b:['ab','a'],c:{a:1},d:'[[11111111-1111-4111-8111-111111111111|x]]'},ids),{k:'A',b:['ab','A'],c:{A:1},d:'[[99999999-9999-4999-8999-999999999999|x]]'});
 const f=remapFile('transcripts/11111111-1111-4111-8111-111111111111.txt','text',ids);
 assert.equal(f.path,'transcripts/99999999-9999-4999-8999-999999999999.txt');
 assert.deepEqual([{path:'forum/forum.json'},{path:'forum/topics/x.json'}].sort(fileOrder).map(f=>f.path),['forum/topics/x.json','forum/forum.json']);
});

test('server: back up, import as a copy with its files, then delete the original', async () => {
 const {b,s}=await setup();
 const start=await startBackup(s,b,'e:e1');
 assert.deepEqual(start.files.sort(),['forum/forum.json','transcripts/p2.txt']);
 assert.equal(start.backup.members.groups.length,emptyMemberList('e1').groups.length);
 const {files}=await readFiles(s,b,'e:e1',start.files);
 assert.equal(files['transcripts/p2.txt'],'We fought goblins.');
 await assert.rejects(()=>readFiles(s,b,'e:e1',['../workspace.json']).then(r=>{if(Object.keys(r.files).length)throw Error('read');throw Error('none');}),/none/);

 const made=await importCampaign(s,b,JSON.parse(JSON.stringify(start.backup)));
 assert.equal(made.name,'Sunless Citadel (imported)');
 const ready=Object.entries(files).map(([path,text])=>remapFile(path,text,made.ids)).sort(fileOrder);
 assert.equal((await importFiles(s,b,made.encyclopediaId,ready)).written,2);
 assert.ok(b.data.has(forumKey('owner-1',made.encyclopediaId)));
 assert.equal(b.data.get(encyclopediaPrefix('owner-1')+`transcripts/${made.ids.p2}.txt`).text,'We fought goblins.');
 assert.ok(b.data.has(listKey('owner-1',made.encyclopediaId)),'the member groups come along');
 assert.equal(JSON.parse(b.data.get(listKey('owner-1',made.encyclopediaId)).text).members.length,0);
 await assert.rejects(()=>importFiles(s,b,made.encyclopediaId,[{path:'workspace.json',text:'{}'}]),/damaged/);

 await assert.rejects(()=>deleteCampaign(s,b,'e:e1','Sunless'),/Type the campaign's name/);
 const now=new Date('2026-11-18T10:00:00Z');
 const gone=await deleteCampaign(s,b,'e:e1','sunless citadel',now);
 assert.equal(gone.deleted,'Sunless Citadel');
 assert.ok(!gone.summary.rows.some(r=>r.encyclopedia?.id==='e1'||r.maptable?.id==='m1'));
 assert.ok(gone.summary.rows.some(r=>r.encyclopedia?.id===made.encyclopediaId&&r.maptable?.id===made.ids.m1),'the imported copy stays, paired');
 assert.ok(b.data.has(deletedKey('owner-1','e1',now)),'a private copy is kept first');
 assert.ok(!b.data.has(forumKey('owner-1','e1')));
 assert.ok(!b.data.has(encyclopediaPrefix('owner-1')+'transcripts/p2.txt'));
 assert.ok(!b.data.has(listKey('owner-1','e1')));
 assert.ok(!b.data.has(encyclopediaPrefix('owner-1')+'player-links/e1.json'),'player links stop working');
 assert.ok(!b.data.has('encyclopedia-player-keys/'+'ab'.repeat(32)+'.json'));
 const after=await readBoth(s);
 assert.ok(after.book.data.entries.some(e=>e.id==='lore'),'the world lore stays');
 assert.ok(after.map.workspace.scenes.some(sc=>sc.name==='Elsewhere'));
 assert.equal((await loadWorkspace(b,s.prefix)).workspace.collections.filter(c=>c.kind==='campaign').length,2);
 assert.deepEqual((await haveImages(s,b,[{tool:'maptable',id:IMG1}])).have,[]);
});

test('browser: the backup ZIP carries pictures and files, and imports back as a working copy', async () => {
 const {campaignBackupZip,importBackupZip,readBackupZip}=await import('../lib/campaign-backup-client.ts');
 const {startBackup:start,readFiles:files,imageUrls,haveImages:have,putImage,importCampaign:imp,importFiles:impFiles}=await import('../lib/campaign-backup-server.ts');
 class Bytes extends Bucket {
  obj(v){const bytes=v.bytes;return {etag:v.etag,size:bytes.length,httpMetadata:{contentType:v.type},json:async()=>JSON.parse(new TextDecoder().decode(bytes)),arrayBuffer:async()=>bytes.slice().buffer};}
  async put(key,body,options={}){const old=this.data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++this.n);const bytes=typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(body);this.data.set(key,{bytes,text:new TextDecoder().decode(bytes),etag,type:options.httpMetadata?.contentType??'application/json'});return {etag};}
  uploadForm(key,type){return {url:'https://upload.example/',fields:{key,'Content-Type':type}};}
 }
 const b=new Bytes(),s=campaignSession(b,'owner-1');
 await saveWorkspace(b,s.prefix,maps(),null);
 assert.equal(await s.book.save('owner-1',book(),0),1);
 await b.put(encyclopediaPrefix('owner-1')+'transcripts/p2.txt','We fought goblins.',{httpMetadata:{contentType:'text/plain'}});
 const png=new Uint8Array([0x89,0x50,0x4e,0x47,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0]);
 await b.put(s.prefix+'images/'+IMG1,png,{httpMetadata:{contentType:'image/png'}});
 const {createTransfer}=await import('../lib/transfers.ts');
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(url,init={})=>{
  url=String(url);
  if(url.startsWith('https://signed.example/')){const v=b.data.get(url.slice('https://signed.example/'.length));return v?new Response(v.bytes):new Response('',{status:404});}
  if(url==='/api/transfers')return Response.json(createTransfer(b,s.prefix,JSON.parse(init.body)));
  if(url==='https://upload.example/'){const f=init.body;await b.put(f.get('key'),new Uint8Array(await f.get('file').arrayBuffer()),{httpMetadata:{contentType:f.get('Content-Type')}});return new Response(null,{status:204});}
  let body=JSON.parse(init.body);
  if(body.transferId&&!body.action){const k=`transfers/${s.prefix}workspace/${body.transferId}`;body=JSON.parse(b.data.get(k).text);}
  try{
   const out=await ({start:()=>start(s,b,body.key),files:()=>files(s,b,body.key,body.paths),images:()=>imageUrls(s,b,body.images),have:()=>have(s,b,body.images),putImage:()=>putImage(s,b,body),import:()=>imp(s,b,body.backup),importFiles:()=>impFiles(s,b,body.campaignId,body.files)})[body.action]();
   return Response.json(out);
  }catch(e){return Response.json({error:e.message},{status:400});}
 };
 try{
  const steps=[];
  const made=await campaignBackupZip('e:e1',t=>steps.push(t));
  assert.equal(made.missing,3,'pictures not in storage are counted, not fatal');
  assert.match(made.name,/^sunless-citadel-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  const read=await readBackupZip(made.blob);
  assert.deepEqual(read.images.map(i=>`${i.tool}:${i.id}`),[`maptable:${IMG1}`]);
  assert.deepEqual(read.files.map(f=>f.path),['transcripts/p2.txt']);
  // A fresh account: the picture is uploaded, the campaign and its world arrive.
  const b2=new Bytes(),s2=campaignSession(b2,'owner-2');
  Object.assign(b,{data:b2.data,n:b2.n});Object.assign(s,s2);
  const done=await importBackupZip(made.blob,()=>{});
  assert.equal(done.name,'Sunless Citadel');
  assert.ok(b.data.has(s.prefix+'images/'+IMG1));
  const both=await readBoth(s),c=both.book.data.campaigns[0];
  assert.equal(c.name,'Sunless Citadel');
  assert.equal(both.map.workspace.collections.find(x=>x.id===c.maptableCampaignId).name,'Sunless Citadel');
  const session=both.book.data.entries.find(e=>e.kind==='session');
  assert.equal(b.data.get(encyclopediaPrefix('owner-2')+`transcripts/${session.id}.txt`).text,'We fought goblins.');
 }finally{globalThis.fetch=realFetch;}
});
