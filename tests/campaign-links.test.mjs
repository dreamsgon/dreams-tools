import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignSummary,homeCampaigns,suggestPairs,applyPairs,cleanName} from '../lib/campaign-links.ts';
import {workspaceSchema,importCopy,emptyWorkspace} from '../lib/encyclopedia/world-model.ts';

const gh={repository:'',branch:'main'};
const map={collections:[
 {id:'m1',name:'The Sunless Citadel',kind:'campaign',parentId:null},
 {id:'f1',name:'Act 1',kind:'folder',parentId:'m1'},
 {id:'m2',name:'Ashen Crown',kind:'campaign',parentId:null},
 {id:'m3',name:'One-shots',kind:'campaign',parentId:null},
],scenes:[{id:'s1',containerId:'f1'},{id:'s2',containerId:'m1'},{id:'s3',containerId:'m2'},{id:'s4',containerId:null}]};
const page=(id,campaignId,kind='note')=>({id,worldId:'w1',campaignId,parentId:null,title:id,kind,body:'',updatedAt:'2026-01-01T00:00:00.000Z'});
const book=()=>workspaceSchema.parse({schemaVersion:1,
 worlds:[{id:'w1',name:'Ashenwood',description:'',archived:false},{id:'w2',name:'Old',description:'',archived:true}],
 campaigns:[{id:'e1',worldId:'w1',name:'Sunless Citadel',description:'',github:gh},{id:'e2',worldId:'w1',name:'Curse of the Ashen Crown',description:'',github:gh},{id:'e3',worldId:'w2',name:'Retired',description:'',github:gh}],
 entries:[page('p1','e1'),page('p2','e1','character'),page('p3',null)]});

test('campaign summary lists unpaired campaigns from both tools with their counts', () => {
  const s=campaignSummary(map,book());
  assert.deepEqual(s.rows.map(r=>[r.name,r.maptable?.id??null,r.encyclopedia?.id??null]),[
    ['Ashen Crown','m2',null],['Curse of the Ashen Crown',null,'e2'],['One-shots','m3',null],['Retired',null,'e3'],['Sunless Citadel',null,'e1'],['The Sunless Citadel','m1',null]]);
  assert.equal(s.rows.find(r=>r.maptable?.id==='m1').maptable.scenes,2);
  assert.deepEqual([s.rows.find(r=>r.encyclopedia?.id==='e1').encyclopedia.pages,s.rows.find(r=>r.encyclopedia?.id==='e1').encyclopedia.characters],[2,1]);
  assert.equal(s.rows.find(r=>r.encyclopedia?.id==='e3').encyclopedia.archived,true);
  assert.equal(s.loose,1);
  assert.equal(campaignSummary(null,book()).rows.length,3);
});

test('same names are suggested as pairs, ignoring case, punctuation and a leading The', () => {
  assert.deepEqual(suggestPairs(campaignSummary(map,book())),[{encyclopediaId:'e1',maptableId:'m1'}]);
});

test('pairing adds only an optional link, moves a pairing, and can be removed', () => {
  const before=book();
  const paired=workspaceSchema.parse(applyPairs(before,map,[{encyclopediaId:'e1',maptableId:'m1'},{encyclopediaId:'e2',maptableId:'m2'}]));
  assert.equal(paired.campaigns[0].maptableCampaignId,'m1');
  assert.deepEqual({...paired,campaigns:paired.campaigns.map(c=>{const copy={...c};delete copy.maptableCampaignId;return copy;})},before,'nothing else changes');
  const s=campaignSummary(map,paired);
  assert.equal(s.rows.length,4);
  assert.equal(s.rows.find(r=>r.encyclopedia?.id==='e1').maptable.id,'m1');
  const moved=applyPairs(paired,map,[{encyclopediaId:'e3',maptableId:'m1'}]);
  assert.equal(moved.campaigns.find(c=>c.id==='e1').maptableCampaignId,undefined,'a Maptable campaign is paired once');
  assert.equal(moved.campaigns.find(c=>c.id==='e3').maptableCampaignId,'m1');
  const removed=applyPairs(moved,map,[{encyclopediaId:'e3',maptableId:null}]);
  assert.equal('maptableCampaignId' in removed.campaigns.find(c=>c.id==='e3'),false);
  assert.throws(()=>applyPairs(before,map,[{encyclopediaId:'e1',maptableId:'f1'}]),/no longer exists/);
  assert.throws(()=>applyPairs(before,map,[{encyclopediaId:'nope',maptableId:'m1'}]),/no longer exists/);
});

test('saved Encyclopedia data rejects a Maptable campaign paired twice, and imports drop pairings', () => {
  const data=book();data.campaigns[0].maptableCampaignId='m1';data.campaigns[1].maptableCampaignId='m1';
  assert.throws(()=>workspaceSchema.parse(data),/only one Encyclopedia campaign/);
  data.campaigns[1].maptableCampaignId=undefined;delete data.campaigns[1].maptableCampaignId;
  const parsed=workspaceSchema.parse(data);
  const copied=importCopy(emptyWorkspace(),parsed);
  assert.equal(copied.campaigns.some(c=>'maptableCampaignId' in c),false);
  assert.equal(cleanName('  Tomb   of the  Ash King '),'Tomb of the Ash King');
  assert.throws(()=>cleanName('  '),/name/);
});

const at=(n)=>`2026-02-${String(n).padStart(2,'0')}T00:00:00.000Z`;
const entry=(id,worldId,campaignId,updatedAt,kind='note')=>({...page(id,campaignId,kind),worldId,updatedAt});
const dated=(entries,extraWorlds=[])=>workspaceSchema.parse({schemaVersion:1,
 worlds:[{id:'w1',name:'Ashenwood',description:'',archived:false},{id:'w2',name:'Old',description:'',archived:true},...extraWorlds],
 campaigns:[{id:'e1',worldId:'w1',name:'Sunless Citadel',description:'',github:gh},{id:'e2',worldId:'w1',name:'Curse of the Ashen Crown',description:'',github:gh},{id:'e3',worldId:'w2',name:'Retired',description:'',github:gh}],
 entries});

test('recent lists the six newest pages first, with campaign name null for world lore', () => {
  const b=dated([1,2,3,4,5,6,7].map(n=>entry(`r${n}`,'w1',n===3?null:'e1',at(n))));
  const {recent}=campaignSummary(null,b);
  assert.deepEqual(recent.map(r=>r.id),['r7','r6','r5','r4','r3','r2']);
  assert.deepEqual(recent[0],{id:'r7',title:'r7',kind:'note',campaignId:'e1',campaignName:'Sunless Citadel',worldName:'Ashenwood',path:'',updatedAt:at(7)});
  const lore=campaignSummary(null,dated([entry('lore','w1',null,at(9))])).recent[0];
  assert.equal(lore.campaignName,null);
  assert.equal(lore.worldName,'Ashenwood');
  assert.deepEqual(campaignSummary(null,dated([])).recent,[]);
});

test('recent skips folders, archived worlds and template worlds', () => {
  const b=dated([entry('keep','w1','e1',at(1)),entry('dir','w1','e1',at(8),'folder'),entry('old','w2','e3',at(9)),entry('tpl','w3',null,at(10))],[{id:'w3',name:'Template',description:'',archived:false,isTemplate:true}]);
  assert.deepEqual(campaignSummary(null,b).recent.map(r=>r.id),['keep']);
});

test('each Encyclopedia campaign reports when its pages last changed, or null with no pages', () => {
  const b=dated([entry('a','w1','e1',at(2)),entry('b','w1','e1',at(5),'character'),entry('c','w1','e1',at(9),'folder'),entry('d','w1',null,at(12))]);
  const rows=campaignSummary(null,b).rows;
  const last=id=>rows.find(r=>r.encyclopedia?.id===id).encyclopedia.lastEdited;
  assert.equal(last('e1'),at(5),'folders and world lore do not count');
  assert.equal(last('e2'),null);
  assert.equal(last('e3'),null);
});

test('home campaigns are most recently edited first, then by name, without archived ones', () => {
  const b=dated([entry('a','w1','e1',at(2)),entry('b','w1','e2',at(6)),entry('x','w2','e3',at(20))]);
  const s=campaignSummary(map,b);
  assert.deepEqual(homeCampaigns(s).map(r=>r.name),['Curse of the Ashen Crown','Sunless Citadel','Ashen Crown','One-shots','The Sunless Citadel']);
  assert.equal(homeCampaigns(s).some(r=>r.encyclopedia?.archived),false);
  assert.equal(s.rows.length,6,'the summary itself is not changed');
});

test('pages carry the folders they sit in, and each campaign lists its three newest pages and its maps', () => {
  const inFolder=(e,parentId)=>({...e,parentId});
  const b=dated([entry('places','w1','e1',at(1),'folder'),inFolder(entry('fens','w1','e1',at(1),'folder'),'places'),
    inFolder(entry('greyfen','w1','e1',at(4)),'fens'),entry('a','w1','e1',at(2)),entry('b','w1','e1',at(5),'character')]);
  b.entries.push(entry('m1','w1','e1',at(3),'map'));
  const s=campaignSummary(null,b);
  assert.equal(s.recent.find(r=>r.id==='greyfen').path,'places › fens');
  const e1=s.rows.find(r=>r.encyclopedia?.id==='e1').encyclopedia;
  assert.deepEqual(e1.latest.map(p=>p.id),['b','greyfen','m1'],'folders are left out');
  assert.equal(e1.maps,1);
  assert.deepEqual(s.rows.find(r=>r.encyclopedia?.id==='e2').encyclopedia.latest,[]);
});
