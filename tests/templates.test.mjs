import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,playerCampaign} from '../lib/encyclopedia/world-model.ts';
import {starterTemplates,pageFromTemplate,templateFromPage,saveTemplate,deleteTemplate,cleanValue,infoRows,templateOf,templateUses} from '../lib/encyclopedia/templates.ts';

const now='2026-11-13T12:00:00.000Z';
let n=0;const newId=()=>`id-${++n}`;
const settlement={id:'t-settle',name:'Settlement',kind:'place',updatedAt:now,overviewVisibility:'players',body:'## At a glance\n',
 fields:[{id:'f-kind',label:'Kind',type:'choice',options:['Village','Town'],visibility:'players'},{id:'f-people',label:'People',type:'number',visibility:'players'},
  {id:'f-ruler',label:'Ruled by',type:'page',visibility:'players'},{id:'f-region',label:'Region',type:'page',visibility:'players'},{id:'f-secret',label:'Who really runs it',type:'text',visibility:'gm'}],
 tabs:[{title:'History',visibility:'players'},{title:'GM notes',visibility:'gm'}]};
const entry=(id,o={})=>({id,worldId:'w1',campaignId:'salt',parentId:null,title:id,kind:'note',body:'',updatedAt:now,...o});
const build=(entries,templates=[settlement])=>workspaceSchema.parse({schemaVersion:1,
 worlds:[{id:'w1',name:'The Lantern Coast',description:'',archived:false,templates}],
 campaigns:[{id:'salt',worldId:'w1',name:'The Salt Road',description:'',github:{repository:'',branch:'main'}}],entries});

test('values are cleaned to their field type: numbers stay numbers, a choice must be one of its options',()=>{
 const [kind,people,,,secret]=settlement.fields;
 assert.equal(cleanValue(people,'1,240'),1240);assert.equal(cleanValue(people,'lots'),undefined);assert.equal(cleanValue(people,''),undefined);
 assert.equal(cleanValue(kind,'Town'),'Town');assert.equal(cleanValue(kind,'Hamlet'),undefined);
 assert.equal(cleanValue(secret,'  The Bog Hag  '),'The Bog Hag');assert.equal(cleanValue(secret,'   '),undefined);
});

test('a page made from a template gets its kind, text, tabs and info box values',()=>{
 const page=pageFromTemplate(settlement,{id:'greyfen',title:' Greyfen ',worldId:'w1',campaignId:'salt',parentId:null,values:{'f-kind':'Village','f-people':'340','f-secret':'','f-unknown':'x'},newId,now});
 assert.equal(page.title,'Greyfen');assert.equal(page.kind,'place');assert.equal(page.body,'## At a glance\n');assert.equal(page.templateId,'t-settle');
 assert.deepEqual(page.fields,{'f-kind':'Village','f-people':340});
 assert.deepEqual(page.tabs.map(t=>[t.title,t.visibility,t.body]),[['History','players',''],['GM notes','gm','']]);
 assert.equal(page.overviewVisibility,'players');
 assert.doesNotThrow(()=>build([page]));
});

test('starter templates are valid, and any page can be saved as a template',()=>{
 const starters=starterTemplates(newId,now);
 assert.deepEqual(starters.map(t=>t.name),['Settlement','Tavern','Organization','Item','Session']);
 const s=build([entry('bram',{kind:'character',character:{role:'npc',group:'',tags:[],location:'',faction:'',status:'active',statsVisibility:'gm',statsByCampaign:{}},tabs:[{id:'x',title:'Secrets',body:'Owes the Bog Hag.',visibility:'gm'}]})],starters);
 const t=templateFromPage(s,s.entries[0],'Ferryman',newId,now);
 assert.equal(t.kind,'character');assert.deepEqual(t.tabs,[{title:'Secrets',visibility:'gm'}]);assert.deepEqual(t.fields,[]);
});

test('saving a template adds new tabs to its pages without touching what is written; deleting it keeps the pages',()=>{
 let s=build([entry('greyfen',{kind:'place',templateId:'t-settle',fields:{'f-kind':'Village'},tabs:[{id:'h',title:'history',body:'Founded on stilts.',visibility:'players'}]}),entry('other')]);
 assert.equal(templateUses(s,'t-settle'),1);
 s=saveTemplate(s,'w1',{...settlement,tabs:[...settlement.tabs,{title:'Rumours',visibility:'players'}]},newId,now);
 const page=s.entries.find(e=>e.id==='greyfen');
 assert.deepEqual(page.tabs.map(t=>t.title),['history','GM notes','Rumours']);
 assert.equal(page.tabs[0].body,'Founded on stilts.');
 assert.equal(s.worlds[0].templates[0].tabs.length,3);
 assert.equal(templateOf(s,page).name,'Settlement');
 s=deleteTemplate(s,'w1','t-settle');
 const kept=s.entries.find(e=>e.id==='greyfen');
 assert.equal(kept.templateId,undefined);assert.equal(kept.fields,undefined);assert.equal(kept.tabs.length,3);
 assert.deepEqual(s.worlds[0].templates,[]);
 assert.doesNotThrow(()=>workspaceSchema.parse(s));
});

test('players see only player fields, and page links only to pages they can read',()=>{
 const shown=[{id:'t',title:'Public',body:'Hello',visibility:'players'}];
 const s=build([
  entry('greyfen',{kind:'place',overviewVisibility:'players',templateId:'t-settle',fields:{'f-kind':'Village','f-people':1240,'f-ruler':'bram','f-region':'hag','f-secret':'The Bog Hag'}}),
  entry('bram',{tabs:shown,title:'Bram'}),
  entry('hag',{title:'Bog Hag'}),
  entry('hidden',{kind:'place',templateId:'t-settle',fields:{'f-kind':'Town'},tabs:shown}),
 ]);
 const gm=infoRows(s,settlement,s.entries[0]);
 assert.deepEqual(gm.map(r=>[r.label,r.value,r.gm]),[['Kind','Village',false],['People','1,240',false],['Ruled by','Bram',false],['Region','Bog Hag',false],['Who really runs it','The Bog Hag',true]]);
 const player=playerCampaign(s,'salt'),greyfen=player.entries.find(e=>e.id==='greyfen');
 assert.deepEqual(greyfen.info,[{label:'Kind',value:'Village'},{label:'People',value:'1,240'},{label:'Ruled by',value:'Bram',pageId:'bram'}]);
 assert.ok(!JSON.stringify(player).includes('The Bog Hag'));
 assert.equal(player.entries.find(e=>e.id==='hidden').info,undefined,'a GM-only overview hides the info box');
});
