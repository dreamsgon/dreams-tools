import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {emptyLibrary} from '../lib/encyclopedia/tables.ts';
import {importPack} from '../lib/encyclopedia/content-pack.ts';
import {READY_TEMPLATES,readTemplateText} from '../lib/encyclopedia/sheet-template.ts';
import {pageFromTemplate} from '../lib/encyclopedia/templates.ts';
import {statRows} from '../lib/encyclopedia/stat-rolls.ts';

let n=0;const makeId=()=>`id${++n}`;
const read=(t,o)=>{const r=readTemplateText(JSON.stringify(t.file(o)));assert.equal(r.ok,true,r.error);return r.pack;};
/** Every stat filled in: numbers 2, ticked boxes, the first option. */
const filled=stats=>Object.fromEntries(stats.map(f=>[f.id,f.type==='checkbox'?true:f.type==='select'?f.options[0]:f.type==='number'?2:'x']));
const variants=READY_TEMPLATES.flatMap(t=>[[t,{}],...(t.gestalt?[[t,{gestalt:true}]]:[])]);

test('the eight games are ready-made, four of them with a gestalt option', ()=>{
  assert.deepEqual(READY_TEMPLATES.map(t=>t.name),['D&D 5E character','Pathfinder 2E character','AD&D 2E character','D&D 3.5E character','Pathfinder 1E character','Masks character','City of Mist character','Daggerheart character']);
  assert.deepEqual(READY_TEMPLATES.filter(t=>t.gestalt).map(t=>t.id),['dnd5e','pf2e','dnd35','pf1e']);
});

for(const [t,o] of variants) test(`${t.name}${o.gestalt?' (gestalt)':''}: reads, fits a campaign, and every formula works out`, ()=>{
  const pack=read(t,o),{stats,templates}=pack,tpl=templates[0];
  assert.ok(stats.length>0&&stats.length<=100);
  assert.equal(new Set(stats.map(f=>f.label.toLowerCase())).size,stats.length,'labels are unique');
  assert.equal(new Set(stats.map(f=>f.id)).size,stats.length,'ids are unique');
  assert.equal(tpl.kind,'character');
  assert.ok(tpl.trackers.length<=8&&tpl.layout.facts.length<=12&&tpl.fields.length<=30);
  if(o.gestalt){
    assert.match(tpl.name,/gestalt/);
    assert.ok(tpl.layout.facts.some(f=>f.label==='Class (side A)')&&tpl.layout.facts.some(f=>f.label==='Class (side B)'));
    assert.ok(!tpl.layout.facts.some(f=>f.label==='Class'));
    assert.match(tpl.body,/\| 20 \| \| \|/,'a table of levels');
    assert.ok(stats.some(f=>f.label.endsWith('(side B)')),'spellcasting for each side');
  } else assert.doesNotMatch(tpl.name+tpl.body,/gestalt/i);
  const rows=statRows(stats,filled(stats));
  for(const r of rows){
    const f=stats.find(x=>x.label===r.label);
    if(f.derived) assert.notEqual(r.worked,null,`${r.label} works out`);
    for(const roll of r.rolls) assert.ok(roll.dice,`${r.label} ${roll.name} rolls`);
  }
  // Into the demo campaign: the template and its stats come in and a character made from it validates.
  const s=demoWorkspace(),w={worldId:s.worlds[0].id,campaignId:s.campaigns[0].id};
  const r=importPack(s,emptyLibrary(),pack,{templates:templates.map(x=>x.id),stats:stats.map(f=>f.id)},{...w,templates:'campaign',tables:'campaign'},makeId,'2026-11-22T00:00:00.000Z');
  const made=r.data.worlds[0].templates.find(x=>x.name===tpl.name);
  assert.ok(made);
  const page=pageFromTemplate(made,{id:'pc1',title:'Hero',...w,parentId:null,newId:makeId});
  assert.equal(page.character.trackers.length,tpl.trackers.length);
  assert.equal(workspaceSchema.safeParse({...r.data,entries:[...r.data.entries,page]}).success,true);
});

test('rules that differ from 5E work out right', ()=>{
  const pick=id=>READY_TEMPLATES.find(t=>t.id===id);
  const rowsOf=(id,values,o)=>{const {stats}=read(pick(id),o);const byLabel=Object.fromEntries(stats.map(f=>[f.label,f.id]));return Object.fromEntries(statRows(stats,Object.fromEntries(Object.entries(values).map(([k,v])=>[byLabel[k],v]))).map(r=>[r.label,r]));};
  // PF2E: trained adds level, untrained doesn't.
  const pf2=rowsOf('pf2e',{Level:5,Dexterity:4,Strength:1,Acrobatics:2,Stealth:0});
  assert.equal(pf2.Acrobatics.worked,11); assert.equal(pf2.Stealth.worked,4);
  assert.equal(pf2.Acrobatics.rolls[0].dice,'1d20+11');
  // 3.5: ranks plus modifier; grapple from BAB and Strength.
  const d35=rowsOf('dnd35',{Strength:16,Dexterity:13,'Base attack bonus':4,Hide:5,Fortitude:4,Constitution:14});
  assert.equal(d35.Hide.worked,6); assert.equal(d35.Grapple.worked,7); assert.equal(d35.Fortitude.rolls[0].dice,'1d20+6');
  // PF1: CMD.
  assert.equal(rowsOf('pf1e',{Strength:16,Dexterity:14,'Base attack bonus':3}).CMD.worked,18);
  // AD&D 2E: roll under an ability, at or over a save, under a thief skill.
  const {stats}=read(pick('add2e'));
  assert.deepEqual(stats.find(f=>f.label==='Wisdom').rolls[0].success,{op:'atMost',against:'{value}'});
  assert.deepEqual(stats.find(f=>f.label==='Spell').rolls[0].success,{op:'atLeast',against:'{value}'});
  assert.equal(stats.find(f=>f.label==='Open Locks').rolls[0].formula,'1d100');
  // Masks: a negative label.
  assert.equal(rowsOf('masks',{Danger:-1}).Danger.rolls[0].dice,'2d6-1');
  // Daggerheart: Hope and Fear dice plus the trait.
  assert.equal(rowsOf('daggerheart',{Agility:2}).Agility.rolls[0].dice,'1d12+1d12+2');
});
