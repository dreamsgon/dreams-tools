import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceSchema,demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {emptyLibrary} from '../lib/encyclopedia/tables.ts';
import {importPack,readPack} from '../lib/encyclopedia/content-pack.ts';
import {dnd5eFile,readTemplateText,templatePrompt} from '../lib/encyclopedia/sheet-template.ts';
import {applyTemplate,pageFromTemplate} from '../lib/encyclopedia/templates.ts';
import {statRows} from '../lib/encyclopedia/stat-rolls.ts';

let n=0;const makeId=()=>`id${++n}`;
const where=(s)=>({worldId:s.worlds[0].id,campaignId:s.campaigns[0].id});
const stat=(id,label,over={})=>({id,label,section:'Old',type:'number',options:[],visibility:'players',archived:false,...over});
/** The demo world, its first campaign with a stat form from another game (and a Strength already on it). */
function setup(){
  const s=demoWorkspace();
  return workspaceSchema.parse({...s,campaigns:[{...s.campaigns[0],statFields:[stat('sanity','Sanity'),stat('mystr','strength')]},...s.campaigns.slice(1)]});
}
const importAll=(s,pack,scope='campaign')=>importPack(s,emptyLibrary(),pack,{templates:pack.templates.map(t=>t.id),stats:(pack.stats??[]).map(f=>f.id)},{...where(s),templates:scope,tables:'campaign'},makeId,'2026-11-21T00:00:00.000Z');

test('the ready-made D&D 5E template reads as a content pack', ()=>{
  const r=readTemplateText(JSON.stringify(dnd5eFile()));
  assert.equal(r.ok,true);
  const {stats,templates}=r.pack;
  assert.equal(stats.length,31);
  assert.equal(new Set(stats.map(f=>f.label)).size,31,'labels are unique');
  assert.equal(stats.filter(f=>f.section==='Skills').length,18);
  assert.equal(stats.filter(f=>f.look==='score'&&f.save).length,6);
  const t=templates[0];
  assert.equal(t.kind,'character');
  assert.deepEqual(t.stats.order,stats.map(f=>f.id),'every stat on, in file order');
  assert.deepEqual(t.trackers.map(x=>[x.label,x.value,x.max]),[['Hit points',10,10],['Temporary HP',0,10],['Hit dice',1,1],['Death save successes',0,3],['Death save failures',0,3],['Heroic Inspiration',0,1]]);
  assert.deepEqual(t.layout.facts.map(f=>f.label),['Player','Species','Class','Subclass','Level','Background']);
  assert.equal(t.layout.blocks.length,3,'the usual Profile blocks are filled in');
});

test('5E formulas work out bonuses and rolls, unticked skills included', ()=>{
  const {stats}=readTemplateText(JSON.stringify(dnd5eFile())).pack;
  const rows=Object.fromEntries(statRows(stats,{str:16,dex:14,wis:12,prof:2,athletics:true}).map(r=>[r.label,r]));
  assert.equal(rows.Strength.worked,3);
  assert.deepEqual(rows.Strength.rolls.map(r=>r.dice),['1d20+3','1d20+3']);
  assert.equal(rows.Athletics.worked,5,'proficient: Str mod + proficiency');
  assert.equal(rows.Athletics.rolls[0].dice,'1d20+5');
  assert.equal(rows.Acrobatics.worked,2,'a skill never ticked counts as not proficient');
  assert.equal(rows.Acrobatics.rolls[0].dice,'1d20+2');
  assert.equal(rows.Initiative.rolls[0].dice,'1d20+2');
  assert.equal(rows['Passive Perception'].worked,11);
  assert.equal(rows.Arcana.rolls[0].dice,null,'no Intelligence yet');
});

test('a hand or AI written file gets ids and defaults', ()=>{
  const pack=readPack({
    stats:[{label:'Might',section:'Attributes',type:'Number',look:'score',derived:'floor(({value}-10)/2)'},{label:'Class',type:'dropdown',options:'Fighter, Wizard'},{label:'Might',section:'Dup'},{label:'Brawl',type:'yes/no',visibility:'GM only'}],
    templates:[{name:'Hero',fields:[{label:'Home',type:'link'},{label:'Mood',type:'select',options:['Calm','Angry']}],tabs:['Backstory',{title:'Secrets',visibility:'gm'}],layout:{facts:['Player','Level']},
      trackers:['Luck',{label:'Wounds',max:40},{label:'Fate',max:3,value:9}],hiddenTabs:['Statblock','nonsense'],stats:{order:['Brawl','might'],off:['Class']}}],
  });
  assert.deepEqual(pack.stats.map(f=>[f.id,f.type,f.visibility]),[['might','number','players'],['class','select','players'],['might-2','number','players'],['brawl','checkbox','gm']]);
  assert.deepEqual(pack.stats[1].options,['Fighter','Wizard']);
  const t=pack.templates[0];
  assert.equal(t.kind,'character');
  assert.deepEqual(t.fields.map(f=>f.type),['url','choice']);
  assert.deepEqual(t.tabs,[{title:'Backstory',visibility:'players'},{title:'Secrets',visibility:'gm'}]);
  assert.deepEqual(t.hiddenTabs,['statblock']);
  assert.deepEqual(t.stats,{order:['brawl','might'],off:['class']},'stats named by label or id');
  assert.deepEqual(t.trackers.map(x=>[x.label,x.shape,x.value,x.max]),[['Luck','pips',1,1],['Wounds','bar',40,40],['Fate','pips',3,3]]);
  assert.ok(!Number.isNaN(Date.parse(t.updatedAt)));
});

test('reading a reply: code fences, other files and broken JSON', ()=>{
  const fenced='Here you go!\n```json\n'+JSON.stringify({format:'rpg-tools-content',version:1,stats:[{label:'Grit'}]})+'\n```\nEnjoy.';
  const r=readTemplateText(fenced);
  assert.equal(r.ok,true); assert.equal(r.pack.stats[0].label,'Grit');
  assert.match(readTemplateText('').error,/Paste/);
  assert.match(readTemplateText('no json here').error,/no JSON/);
  assert.match(readTemplateText('{"stats": [1,}').error,/complete JSON/);
  assert.match(readTemplateText(JSON.stringify({format:'rpgtools-sheet',version:1})).error,/Import sheet/);
  assert.match(readTemplateText(JSON.stringify({format:'rpg-tools-content',version:1})).error,/no template or stats/);
});

test('the example in the AI prompt and the guide page both read', ()=>{
  const prompt=templatePrompt('Pathfinder 2e');
  assert.match(prompt,/Pathfinder 2e/);
  const ex=readTemplateText(prompt.slice(prompt.indexOf('A small example')));
  assert.equal(ex.ok,true); assert.equal(ex.pack.stats.length,3);
  const guide=readFileSync('content/guide/Character-Sheet-Templates.md','utf8');
  const blocks=[...guide.matchAll(/```json\n([\s\S]*?)```/g)].map(m=>m[1]);
  assert.ok(blocks.length>0,'the guide has a JSON example');
  for(const b of blocks){const r=readTemplateText(b);assert.equal(r.ok,true,r.error);}
});

test('importing puts the template in the world and its stats on the campaign form', ()=>{
  const s=setup(),{pack}=readTemplateText(JSON.stringify(dnd5eFile()));
  const r=importAll(s,pack);
  const c=r.data.campaigns[0],t=r.data.worlds[0].templates.find(x=>x.name==='D&D 5E character');
  assert.ok(t); assert.equal(t.campaignId,c.id);
  assert.equal(c.statFields.length,2+30,'Strength matched the stat already there (by name)');
  assert.ok(t.stats.order.includes('mystr'),'the template uses the existing Strength');
  assert.deepEqual(t.stats.off,['sanity'],'another game’s stats start off on this template');
  assert.equal(t.trackers.length,6);
  // Importing again: stats are already there, the template comes in renamed.
  const again=importAll(r.data,pack,'world');
  assert.equal(again.data.campaigns[0].statFields.length,32);
  assert.ok(again.data.worlds[0].templates.some(x=>x.name==='D&D 5E character (2)'&&!x.campaignId));
});

test('a character from the template starts with its trackers; Use a template adds missing ones', ()=>{
  const s=setup(),{pack}=readTemplateText(JSON.stringify(dnd5eFile())),r=importAll(s,pack);
  const t=r.data.worlds[0].templates.find(x=>x.name==='D&D 5E character');
  const page=pageFromTemplate(t,{id:'pc1',title:'Mira',worldId:s.worlds[0].id,campaignId:s.campaigns[0].id,parentId:null,newId:makeId});
  assert.deepEqual(page.character.trackers.map(x=>[x.label,x.value]),t.trackers.map(x=>[x.label,x.value]));
  assert.ok(page.character.trackers.every((x,i)=>x.id!==t.trackers[i].id),'fresh ids');
  assert.deepEqual(page.character.statLayout,{order:t.stats.order,off:t.stats.off});
  // An older character with its own Hit points tracker.
  const old={...page,id:'pc2',templateId:undefined,character:{...page.character,trackers:[{id:'hp',label:'hit points',shape:'bar',colour:'green',max:30,value:12}],statLayout:undefined}};
  const ws={...r.data,entries:[...r.data.entries,old]};
  const after=applyTemplate(ws,'pc2',t.id,makeId).entries.find(e=>e.id==='pc2');
  assert.equal(after.character.trackers.length,6);
  assert.deepEqual(after.character.trackers[0],{id:'hp',label:'hit points',shape:'bar',colour:'green',max:30,value:12},'its own HP stays');
  assert.equal(workspaceSchema.safeParse({...ws,entries:ws.entries.map(e=>e.id==='pc2'?after:e)}).success,true);
});
