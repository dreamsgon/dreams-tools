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
