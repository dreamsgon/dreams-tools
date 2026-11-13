import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace} from '../lib/model.ts';
import {loadWorkspace,saveWorkspace} from '../lib/workspace-storage.ts';
import {campaignSession,campaignAction,readBoth,summaryOf,backupKey} from '../lib/campaigns-server.ts';

class Bucket {
 data=new Map();n=0;
 async get(key){const v=this.data.get(key);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;}
 async head(key){return this.get(key);}
 async put(key,text,options={}){const old=this.data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++this.n);this.data.set(key,{text,etag});return {etag};}
 async delete(key){this.data.delete(key);}
}
const gh={repository:'',branch:'main'};
async function setup(){
  const b=new Bucket(),s=campaignSession(b,'owner-1');
  const w=initialWorkspace();w.collections=[{id:'m1',name:'The Sunless Citadel',kind:'campaign',parentId:null},{id:'m2',name:'One-shots',kind:'campaign',parentId:null}];w.scenes[0].containerId='m1';
  await saveWorkspace(b,s.prefix,w,null);
  const book={schemaVersion:1,worlds:[{id:'w1',name:'Ashenwood',description:'',archived:false}],campaigns:[{id:'e1',worldId:'w1',name:'Sunless Citadel',description:'',github:gh}],entries:[]};
  assert.equal(await s.book.save('owner-1',book,0),1);
  return {b,s,w,book};
}

test('pairing writes only the Encyclopedia link, after a one-time backup of both tools', async () => {
  const {b,s,w,book}=await setup();
  const mapBefore=(await loadWorkspace(b,s.prefix)).revision;
  const summary=await campaignAction(s,{action:'pair',pairs:[{encyclopediaId:'e1',maptableId:'m1'}]});
  assert.equal(summary.rows.find(r=>r.encyclopedia?.id==='e1').maptable.id,'m1');
  assert.equal((await loadWorkspace(b,s.prefix)).revision,mapBefore,'Maptable is not touched');
  const backup=JSON.parse(b.data.get(backupKey('owner-1')).text);
  assert.deepEqual(backup.encyclopedia,book);
  assert.deepEqual(backup.maptable.collections,w.collections);
  await campaignAction(s,{action:'pair',pairs:[{encyclopediaId:'e1',maptableId:null}]});
  assert.deepEqual(JSON.parse(b.data.get(backupKey('owner-1')).text),backup,'the first backup is never overwritten');
  assert.equal((await s.book.read('owner-1')).data.campaigns[0].maptableCampaignId,undefined);
});

test('rename, create and complete change both tools and keep them paired', async () => {
  const {b,s}=await setup();
  await campaignAction(s,{action:'pair',pairs:[{encyclopediaId:'e1',maptableId:'m1'}]});
  let summary=await campaignAction(s,{action:'rename',encyclopediaId:'e1',maptableId:'m1',name:' The Sunless  Citadel ',description:'A ruined fortress.'});
  const map=await loadWorkspace(b,s.prefix),book=(await s.book.read('owner-1')).data;
  assert.equal(map.workspace.collections.find(c=>c.id==='m1').name,'The Sunless Citadel');
  assert.equal(book.campaigns[0].name,'The Sunless Citadel');
  assert.equal(book.campaigns[0].description,'A ruined fortress.');
  assert.equal(map.workspace.scenes.length,1,'scenes stay where they are');

  summary=await campaignAction(s,{action:'create',name:'Tomb of the Ash King',description:'',maptable:true,encyclopedia:true,worldId:'',newWorld:'Sword Coast'});
  const made=summary.rows.find(r=>r.name==='Tomb of the Ash King');
  assert.ok(made.maptable&&made.encyclopedia);
  assert.equal(made.encyclopedia.worldName,'Sword Coast');

  summary=await campaignAction(s,{action:'complete',maptableId:'m2',worldId:'w1'});
  assert.equal(summary.rows.find(r=>r.maptable?.id==='m2').encyclopedia.worldName,'Ashenwood');
  await assert.rejects(()=>campaignAction(s,{action:'complete',maptableId:'m2',worldId:'w1'}),/already has Encyclopedia notes/);

  summary=await campaignAction(s,{action:'create',name:'Notes only',maptable:false,encyclopedia:true,worldId:'w1'});
  const notesOnly=summary.rows.find(r=>r.name==='Notes only');
  assert.equal(notesOnly.maptable,null);
  summary=await campaignAction(s,{action:'complete',encyclopediaId:notesOnly.encyclopedia.id});
  assert.equal(summary.rows.find(r=>r.name==='Notes only').maptable.scenes,0);
  assert.equal(summary.rows.length,4);
});

test('bad requests change nothing', async () => {
  const {b,s}=await setup();
  const before=summaryOf(await readBoth(s)),mapRev=(await loadWorkspace(b,s.prefix)).revision;
  await assert.rejects(()=>campaignAction(s,{action:'create',name:'X',maptable:true,encyclopedia:true}),/Choose a world/);
  assert.equal((await loadWorkspace(b,s.prefix)).revision,mapRev,'Maptable is untouched when the Encyclopedia half is invalid');
  await assert.rejects(()=>campaignAction(s,{action:'rename',encyclopediaId:'e1',name:'  '}),/name/);
  await assert.rejects(()=>campaignAction(s,{action:'pair',pairs:[{encyclopediaId:'e1',maptableId:'missing'}]}),/no longer exists/);
  await assert.rejects(()=>campaignAction(s,{action:'explode'}),/Unknown action/);
  assert.deepEqual(summaryOf(await readBoth(s)),before);
});

// Folders
async function folderSetup(){
  const r=await setup();
  const w=(await loadWorkspace(r.b,r.s.prefix)).workspace;
  w.collections.push({id:'fa',name:'Lantern Coast',kind:'folder',parentId:null},{id:'fb',name:'Old games',kind:'folder',parentId:'fa'},{id:'sf',name:'Act 1',kind:'folder',parentId:'m1'});
  await saveWorkspace(r.b,r.s.prefix,w,(await loadWorkspace(r.b,r.s.prefix)).revision);
  return r;
}
const mapOf=async({b,s})=>(await loadWorkspace(b,s.prefix)).workspace;
const bookOf=async({s})=>(await s.book.read('owner-1')).data;
const rowOf=(summary,key)=>summary.rows.find(r=>r.key===key);

test('new, rename and move folders; folders go only inside folders', async () => {
  const r=await folderSetup(),{s}=r;
  let summary=await campaignAction(s,{action:'newFolder',name:'  Salt   Road games ',parentId:'fa'});
  const made=summary.folders.find(f=>f.name==='Salt Road games');
  assert.equal(made.parentId,'fa');
  summary=await campaignAction(s,{action:'newFolder',name:'Top'});
  assert.equal(summary.folders.find(f=>f.name==='Top').parentId,null);
  await assert.rejects(()=>campaignAction(s,{action:'newFolder',name:'Bad',parentId:'m1'}),/no longer exists/,'a campaign is not a folder');
  await assert.rejects(()=>campaignAction(s,{action:'newFolder',name:'Bad',parentId:'sf'}),/no longer exists/,'a scene folder is not a campaign folder');
  await assert.rejects(()=>campaignAction(s,{action:'newFolder',name:'  '}),/folder a name/);
  summary=await campaignAction(s,{action:'renameFolder',folderId:made.id,name:'Greyfen marsh'});
  assert.ok(summary.folders.some(f=>f.name==='Greyfen marsh'));
  await assert.rejects(()=>campaignAction(s,{action:'renameFolder',folderId:'sf',name:'x'}),/Reload the page/);
  await assert.rejects(()=>campaignAction(s,{action:'renameFolder',folderId:'',name:'x'}),/Reload the page/);
  summary=await campaignAction(s,{action:'moveFolder',folderId:made.id,parentId:null});
  assert.equal(summary.folders.find(f=>f.id===made.id).parentId,null);
});

test('moveFolder refuses cycles and bad targets', async () => {
  const r=await folderSetup(),{s}=r;
  await assert.rejects(()=>campaignAction(s,{action:'moveFolder',folderId:'fa',parentId:'fb'}),/inside itself/);
  await assert.rejects(()=>campaignAction(s,{action:'moveFolder',folderId:'fa',parentId:'fa'}),/inside itself/);
  await assert.rejects(()=>campaignAction(s,{action:'moveFolder',folderId:'fa',parentId:'m1'}),/no longer exists/);
  const summary=await campaignAction(s,{action:'moveFolder',folderId:'fb',parentId:null});
  assert.equal(summary.folders.find(f=>f.id==='fb').parentId,null);
});

test('moveCampaign handles Maptable-only, Encyclopedia-only and paired rows', async () => {
  const r=await folderSetup(),{s}=r;
  let summary=await campaignAction(s,{action:'moveCampaign',key:'m:m2',folderId:'fa'});
  assert.equal(rowOf(summary,'m:m2').folderId,'fa');
  assert.equal((await mapOf(r)).collections.find(c=>c.id==='m2').parentId,'fa');
  summary=await campaignAction(s,{action:'moveCampaign',key:'e:e1',folderId:'fb'});
  assert.equal(rowOf(summary,'e:e1').folderId,'fb');
  assert.equal((await bookOf(r)).campaigns[0].folderId,'fb');
  assert.equal((await mapOf(r)).collections.find(c=>c.id==='m1').parentId,null,'an unpaired Encyclopedia row does not touch Maptable');
  summary=await campaignAction(s,{action:'pair',pairs:[{encyclopediaId:'e1',maptableId:'m1'}]});
  summary=await campaignAction(s,{action:'moveCampaign',key:'e:e1',folderId:'fa'});
  assert.equal(rowOf(summary,'e:e1').folderId,'fa');
  assert.equal((await mapOf(r)).collections.find(c=>c.id==='m1').parentId,'fa');
  assert.equal((await bookOf(r)).campaigns[0].folderId,'fa');
  summary=await campaignAction(s,{action:'moveCampaign',key:'e:e1',folderId:null});
  assert.equal(rowOf(summary,'e:e1').folderId,null);
  assert.equal((await mapOf(r)).collections.find(c=>c.id==='m1').parentId,null);
  assert.equal('folderId' in (await bookOf(r)).campaigns[0],false);
  assert.equal((await mapOf(r)).scenes[0].containerId,'m1','scenes stay in their campaign');
  await assert.rejects(()=>campaignAction(s,{action:'moveCampaign',key:'m:nope',folderId:null}),/no longer exists/);
  await assert.rejects(()=>campaignAction(s,{action:'moveCampaign',key:'m:m2',folderId:'nope'}),/no longer exists/);
  await assert.rejects(()=>campaignAction(s,{action:'moveCampaign',key:'m:m2',folderId:'sf'}),/no longer exists/);
});

test('removing a folder moves everything up a level and never deletes', async () => {
  const r=await folderSetup(),{s}=r;
  const w=await mapOf(r);
  w.collections.find(c=>c.id==='m2').parentId='fb';
  w.scenes[0].containerId='fb';
  await saveWorkspace(r.b,s.prefix,w,(await loadWorkspace(r.b,s.prefix)).revision);
  await campaignAction(s,{action:'moveCampaign',key:'e:e1',folderId:'fb'});
  const scenesBefore=(await mapOf(r)).scenes.length;
  let summary=await campaignAction(s,{action:'removeFolder',folderId:'fb'});
  assert.equal(summary.folders.some(f=>f.id==='fb'),false);
  assert.equal(rowOf(summary,'m:m2').folderId,'fa','campaigns go to the parent');
  assert.equal(rowOf(summary,'e:e1').folderId,'fa','Encyclopedia folderIds go to the parent');
  const after=await mapOf(r);
  assert.equal(after.scenes.find(sc=>sc.containerId==='fa')!==undefined,true,'scenes directly in it go up too');
  assert.equal(after.scenes.length,scenesBefore);
  assert.equal(['m1','m2','sf'].every(id=>after.collections.some(c=>c.id===id)),true);
  summary=await campaignAction(s,{action:'removeFolder',folderId:'fa'});
  assert.equal(rowOf(summary,'m:m2').folderId,null);
  assert.equal(rowOf(summary,'e:e1').folderId,null);
  assert.equal('folderId' in (await bookOf(r)).campaigns[0],false);
  assert.equal(summary.rows.length,3,'every campaign is still there');
  await assert.rejects(()=>campaignAction(s,{action:'removeFolder',folderId:'fa'}),/no longer exists/);
  await assert.rejects(()=>campaignAction(s,{action:'removeFolder',folderId:'m1'}),/no longer exists/);
});

test('folders can be made before a Maptable workspace exists', async () => {
  const b=new Bucket(),s=campaignSession(b,'owner-2');
  await s.book.save('owner-2',{schemaVersion:1,worlds:[{id:'w1',name:'Ashenwood',description:'',archived:false}],campaigns:[{id:'e1',worldId:'w1',name:'Sunless Citadel',description:'',github:gh}],entries:[]},0);
  let summary=await campaignAction(s,{action:'newFolder',name:'Lantern Coast'});
  const id=summary.folders[0].id;
  summary=await campaignAction(s,{action:'moveCampaign',key:'e:e1',folderId:id});
  assert.equal(rowOf(summary,'e:e1').folderId,id);
});
