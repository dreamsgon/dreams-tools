import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,newScene} from '../lib/model.ts';
import {saveWorkspace} from '../lib/workspace-storage.ts';
import {campaignSession,readBoth} from '../lib/campaigns-server.ts';
import {buildBackup,planImport,forumSetupOnly} from '../lib/campaign-backup.ts';
import {encyclopediaPrefix} from '../lib/encyclopedia/store.ts';
import {forumKey} from '../lib/forum/store.ts';
import {emptyForum} from '../lib/forum/model.ts';
import {listKey} from '../lib/members-server.ts';
import {emptyMemberList} from '../lib/members.ts';
import {themeKey} from '../lib/campaign-theme/store.ts';
import {emptyThemeFile} from '../lib/campaign-theme/model.ts';

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
const page=(id,campaignId,extra={})=>({id,worldId:'w1',campaignId,parentId:null,title:id,kind:'note',body:'',updatedAt:T,...extra});

function maps(){
 const w=initialWorkspace();
 w.collections=[{id:'shelf',name:'Dragonlance',kind:'folder',parentId:null},{id:'m1',name:'Dragon Queen',kind:'campaign',parentId:'shelf'},{id:'f1',name:'Act 1',kind:'folder',parentId:'m1'}];
 const scene=newScene('Vogler');scene.containerId='f1';
 w.scenes=[w.scenes[0],scene];
 return w;
}
function book(){
 return {schemaVersion:1,worlds:[{id:'w1',name:'Krynn',description:'',archived:false}],
  campaigns:[{id:'e1',worldId:'w1',name:'Dragon Queen',description:'Set up once.',github:gh,maptableCampaignId:'m1',forum:true,slug:'dragon-queen',calendars:[]}],
  entries:[page('lore',null,{body:'The gods returned.'}),page('p1','e1',{body:'See [[lore|the lore]] and [[p2]].'}),page('p2','e1',{kind:'session'})]};
}
const topicSummary={id:'t1',boardId:'ooc-chat',title:'Hello',by:{userId:'u2',as:null},at:T,last:{userId:'u2',as:null},lastAt:T,replies:0,pinned:false,locked:false,cast:[]};
async function setup(){
 const b=new Bucket(),s=campaignSession(b,'owner-1');
 await saveWorkspace(b,s.prefix,maps(),null);
 assert.equal(await s.book.save('owner-1',book(),0),1);
 const forum={...emptyForum(),topics:[topicSummary],counts:{u2:1},profiles:{u2:{pronouns:'they'}}};
 await b.put(forumKey('owner-1','e1'),JSON.stringify(forum));
 await b.put(encyclopediaPrefix('owner-1')+'forum/e1/topics/t1.json',JSON.stringify({schemaVersion:1,id:'t1',boardId:'ooc-chat',posts:[{id:'x1',by:{userId:'u2',as:null},body:'Hi all',at:T}]}));
 await b.put(encyclopediaPrefix('owner-1')+'transcripts/p2.txt','We met Kansaldi.',{httpMetadata:{contentType:'text/plain; charset=utf-8'}});
 await b.put(themeKey('owner-1','e1'),JSON.stringify({...emptyThemeFile(),saved:[]}));
 const list=emptyMemberList('e1','GM');list.members=[{userId:'u2',groupId:list.groups[0].id,joinedAt:T}].filter(()=>false);await b.put(listKey('owner-1','e1'),JSON.stringify(list));
 return {b,s};
}
/** Sends the browser's calls straight to the server functions. */
async function withServer(b,s,work){
 const server=await import('../lib/campaign-backup-server.ts');
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(url,init={})=>{
  const body=JSON.parse(init.body);
  try{
   const out=await ({files:()=>server.readFiles(s,b,body.key,body.paths),duplicate:()=>server.duplicateCampaign(s,b,body.key,body),importFiles:()=>server.importFiles(s,b,body.campaignId,body.files)})[body.action]();
   return Response.json(out);
  }catch(e){return Response.json({error:e.message},{status:400});}
 };
 try{return await work();}finally{globalThis.fetch=realFetch;}
}

test('planning a duplicate: its own name, the same folder, a shared or copied world, no web address', () => {
 const map=maps(),bk=book();
 const backup=buildBackup({name:'Dragon Queen',now:T,map,maptableId:'m1',book:bk,encyclopediaId:'e1',tables:null,members:null,dashboard:null});
 let n=0;const id=()=>`new-${++n}`;
 const shared=planImport(backup,{map,book:bk,tables:{tables:[]}},id,{name:'Dragon Queen B',folderId:'shelf'});
 assert.equal(shared.name,'Dragon Queen B');
 const c=shared.book.campaigns.at(-1);
 assert.equal(c.worldId,'w1','the world is shared');
 assert.equal(c.slug,undefined,'a web address is never used twice');
 assert.equal(shared.book.worlds.length,1);
 assert.equal(shared.map.collections.find(x=>x.id===shared.maptableId).parentId,'shelf','it sits beside the original');
 assert.equal(shared.book.entries.filter(e=>e.id==='lore').length,1,'shared lore is not copied');

 const own=planImport(backup,{map,book:bk,tables:{tables:[]}},id,{name:'Dragon Queen',copyWorld:true,folderId:'gone'});
 assert.equal(own.name,'Dragon Queen (copy)','a name already in use gets (copy)');
 assert.equal(own.book.worlds.length,2,'the world is copied');
 const nc=own.book.campaigns.at(-1),lore=own.book.entries.find(e=>e.campaignId===null&&e.worldId===nc.worldId);
 assert.ok(lore&&lore.id!=='lore'&&lore.body==='The gods returned.');
 assert.match(own.book.entries.find(e=>e.campaignId===nc.id&&e.kind==='note').body,new RegExp(`\\[\\[${lore.id}\\|`),'links follow the copied lore');
 assert.equal(own.map.collections.find(x=>x.id===own.maptableId).parentId,null,'a folder that is gone means the top level');
 assert.equal(bk.campaigns.length,1,'the account as read is not changed');
});

test('a backup imported where its web address is free keeps it', () => {
 const map=maps(),bk=book();
 const backup=buildBackup({name:'Dragon Queen',now:T,map,maptableId:'m1',book:bk,encyclopediaId:'e1',tables:null,members:null,dashboard:null});
 const plan=planImport(backup,{map:null,book:{schemaVersion:1,worlds:[],campaigns:[],entries:[]},tables:{tables:[]}});
 assert.equal(plan.book.campaigns[0].slug,'dragon-queen');
});

test('the forum without its posts keeps boards, settings and emoji only', () => {
 const f={...emptyForum(),topics:[topicSummary],counts:{u2:3},characters:['c1'],profiles:{u2:{}},uploads:[{id:'11111111-1111-4111-8111-111111111111',by:'u2',at:T,kind:'post'},{id:'22222222-2222-4222-8222-222222222222',by:'u1',at:T,kind:'emoji'}]};
 const out=JSON.parse(forumSetupOnly(JSON.stringify(f)));
 assert.deepEqual(out.boards,f.boards);
 assert.deepEqual([out.topics,out.counts,out.characters,out.profiles],[[],{},[],undefined]);
 assert.deepEqual(out.uploads.map(u=>u.kind),['emoji']);
});

test('duplicating a campaign: boards, theme, transcripts and groups come along; posts only when asked', async () => {
 const {duplicateCampaign}=await import('../lib/campaign-backup-client.ts');
 const {b,s}=await setup();
 const steps=[];
 const made=await withServer(b,s,()=>duplicateCampaign('e:e1',{name:'Dragon Queen B',copyWorld:false,posts:false,chats:false},t=>steps.push(t)));
 assert.equal(made.warning,'');
 assert.equal(made.name,'Dragon Queen B');
 const both=await readBoth(s),copy=both.book.data.campaigns.find(c=>c.name==='Dragon Queen B');
 assert.equal(made.key,`e:${copy.id}`);
 assert.equal(copy.worldId,'w1');
 assert.equal(copy.description,'Set up once.');
 assert.equal(copy.forum,true);
 assert.equal(copy.slug,undefined);
 const row=made.summary.rows.find(r=>r.key===made.key);
 assert.equal(row.folderId,'shelf');
 assert.equal(row.maptable.scenes,1);
 const p=encyclopediaPrefix('owner-1');
 const forum=JSON.parse(b.data.get(forumKey('owner-1',copy.id)).text);
 assert.deepEqual(forum.topics,[],'the forum starts empty');
 assert.equal(forum.boards.length,emptyForum().boards.length);
 assert.ok(!b.data.has(`${p}forum/${copy.id}/topics/t1.json`));
 assert.ok(b.data.has(themeKey('owner-1',copy.id)),'the theme comes along');
 const session=both.book.data.entries.find(e=>e.campaignId===copy.id&&e.kind==='session');
 assert.equal(b.data.get(`${p}transcripts/${session.id}.txt`).text,'We met Kansaldi.');
 assert.ok(b.data.has(listKey('owner-1',copy.id)),'member groups come along');
 // The original is untouched.
 assert.equal(JSON.parse(b.data.get(forumKey('owner-1','e1')).text).topics.length,1);
 assert.equal(both.book.data.campaigns.find(c=>c.id==='e1').slug,'dragon-queen');

 const again=await withServer(b,s,()=>duplicateCampaign('e:e1',{name:'Dragon Queen B',copyWorld:true,posts:true,chats:false},()=>{}));
 assert.equal(again.name,'Dragon Queen B (copy)');
 const after=await readBoth(s),third=after.book.data.campaigns.find(c=>c.name==='Dragon Queen B (copy)');
 assert.notEqual(third.worldId,'w1','its own world');
 assert.equal(after.book.data.worlds.length,2);
 assert.equal(JSON.parse(b.data.get(forumKey('owner-1',third.id)).text).topics.length,1);
 assert.equal(JSON.parse(b.data.get(`${p}forum/${third.id}/topics/t1.json`).text).posts[0].body,'Hi all');
 await assert.rejects(()=>withServer(b,s,()=>duplicateCampaign('e:e1',{name:'  ',copyWorld:false,posts:false,chats:false},()=>{})),/name/);
});
