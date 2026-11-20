import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,campaignExport,importCopy,defaultCharacter} from '../lib/encyclopedia/world-model.ts';
import {applyTemplate,characterStarters,hideTabsPatch,pageFromTemplate,saveTemplate,templateFromPage,templatesFor} from '../lib/encyclopedia/templates.ts';
import {defaultProfile} from '../lib/encyclopedia/character-profile.ts';

const T='2026-11-20T10:00:00.000Z';
let n=0;const newId=()=>`id${++n}`;
const base=()=>{const s=demoWorkspace();const c=s.campaigns[0];return {s:{...s,campaigns:[...s.campaigns,{...c,id:'other',name:'Other'}]},c};};
const tpl=(id,extra={})=>({id,name:id,kind:'character',fields:[],tabs:[],body:'',updatedAt:T,...extra});

test('templatesFor gives the world templates and only this campaign\'s own',()=>{
  const world={templates:[tpl('w'),tpl('mine',{campaignId:'c1'}),tpl('theirs',{campaignId:'c2'})]};
  assert.deepEqual(templatesFor(world,'c1').map(t=>t.id),['w','mine']);
  assert.deepEqual(templatesFor(world,null).map(t=>t.id),['w']);
});

test('character starters validate and leave out tabs',()=>{
  const {s,c}=base();const list=characterStarters(newId,T);
  const next={...s,worlds:s.worlds.map(w=>w.id===c.worldId?{...w,templates:list.map(t=>({...t,campaignId:c.id}))}:w)};
  assert.ok(workspaceSchema.safeParse(next).success);
  const npc=list.find(t=>t.name==='NPC');
  const page=pageFromTemplate(npc,{id:'p1',title:'Barkeep',worldId:c.worldId,campaignId:c.id,parentId:null,newId,profile:defaultProfile()});
  assert.deepEqual(page.hiddenTabs,['statblock','stats','features','inventory','spells']);
  assert.deepEqual(page.profile.facts.map(f=>f.label),['Species','Occupation','Where to find them','Secret']);
  assert.equal(page.profile.facts.at(-1).gm,true);
});

test('hiding a tab makes it GM only and players never get it, even their own',()=>{
  const {s,c}=base();
  const e={id:'pc',worldId:c.worldId,campaignId:c.id,parentId:null,title:'Pc',kind:'character',body:'',overviewVisibility:'players',updatedAt:T,
    character:{...defaultCharacter(),statsVisibility:'players',featuresVisibility:'players',features:[{id:'f',name:'Sneak'}]}};
  const patch=hideTabsPatch(e,['features','stats']);
  assert.deepEqual(patch.hiddenTabs,['stats','features']);
  assert.equal(patch.character.statsVisibility,'gm');assert.equal(patch.character.featuresVisibility,'gm');
  assert.equal(hideTabsPatch(e,[]).hiddenTabs,undefined);
  // Shown again as players-visible, but still hidden: the server leaves it out.
  const page={...e,...patch,character:{...patch.character,statsVisibility:'players'}};
  const parsed=workspaceSchema.safeParse({...s,entries:[...s.entries,page]});
  assert.ok(parsed.success,parsed.error?.message);
  const out=playerCampaign(parsed.data,c.id,new Set(['pc'])).entries.find(x=>x.id==='pc');
  assert.ok(out);assert.equal((out.stats??[]).length,0);assert.equal(out.features,undefined);
  // Not hidden: the same page gives the player its features.
  const shown=playerCampaign(workspaceSchema.parse({...s,entries:[...s.entries,e]}),c.id,new Set(['pc'])).entries.find(x=>x.id==='pc');
  assert.equal(shown.features.length,1);
});

test('applyTemplate adds tabs, hides tabs, lays out the profile and keeps what is written',()=>{
  const {s,c}=base();
  const t=tpl('npc',{campaignId:c.id,tabs:[{title:'GM notes',visibility:'gm'}],hiddenTabs:['spells'],layout:{blocks:[],bar:{title:'Now',fields:[]},facts:[{id:'sp',label:'Species'}]}});
  const prof={...defaultProfile(),traits:[{id:'t',label:'Kind'}],facts:[{id:'x',label:'Species',value:'Elf'}]};
  const e={id:'npc1',worldId:c.worldId,campaignId:c.id,parentId:null,title:'N',kind:'character',body:'Hello',character:defaultCharacter(),profile:prof,updatedAt:T};
  let w={...s,worlds:s.worlds.map(x=>x.id===c.worldId?{...x,templates:[t]}:x),entries:[...s.entries,e]};
  w=applyTemplate(w,'npc1','npc',newId,T);
  const got=w.entries.find(x=>x.id==='npc1');
  assert.equal(got.templateId,'npc');assert.equal(got.body,'Hello');
  assert.deepEqual(got.tabs.map(x=>x.title),['GM notes']);
  assert.deepEqual(got.hiddenTabs,['spells']);
  assert.equal(got.profile.traits[0].label,'Kind');
  assert.equal(got.profile.facts.find(f=>f.label==='Species').value,'Elf');
  assert.ok(workspaceSchema.safeParse(w).success);
  // A place template can't go on a character, and another campaign's template is refused.
  const w2={...w,worlds:w.worlds.map(x=>x.id===c.worldId?{...x,templates:[t,tpl('place',{kind:'place'}),tpl('elsewhere',{campaignId:'other'})]}:x)};
  assert.throws(()=>applyTemplate(w2,'npc1','place',newId,T));
  assert.throws(()=>applyTemplate(w2,'npc1','elsewhere',newId,T));
});

test('save as template keeps hidden tabs and the profile layout',()=>{
  const {s,c}=base();
  const e={id:'pc',worldId:c.worldId,campaignId:c.id,parentId:null,title:'Pc',kind:'character',body:'',character:defaultCharacter(),hiddenTabs:['statblock'],profile:{...defaultProfile(),facts:[{id:'f',label:'Class',value:'Rogue'}]},updatedAt:T};
  const t=templateFromPage({...s,entries:[...s.entries,e]},e,'PC',newId,T);
  assert.deepEqual(t.hiddenTabs,['statblock']);
  assert.deepEqual(t.layout.facts.map(f=>f.label),['Class']);
  assert.equal(JSON.stringify(t.layout).includes('Rogue'),false);
  const w=saveTemplate(s,c.worldId,{...t,campaignId:c.id},newId,T);
  assert.ok(workspaceSchema.safeParse(w).success);
});

test('a campaign export leaves out other campaigns\' templates, and an import points them at the copy',()=>{
  const {s,c}=base();
  const w={...s,worlds:s.worlds.map(x=>x.id===c.worldId?{...x,templates:[tpl('world'),tpl('mine',{campaignId:c.id}),tpl('theirs',{campaignId:'other'})]}:x)};
  const out=campaignExport(w,c.id);
  assert.deepEqual(out.worlds[0].templates.map(t=>t.id),['world','mine']);
  const copy=importCopy(w,out),world=copy.worlds.at(-1),camp=copy.campaigns.at(-1);
  assert.equal(world.templates.find(t=>t.id==='mine').campaignId,camp.id);
  assert.equal(world.templates.find(t=>t.id==='world').campaignId,undefined);
});

test('a template carries which stats are on and their order',()=>{
  const {s,c}=base();
  const stats={order:['ath','acr'],off:['arc']};
  const t=tpl('pc',{stats});
  const page=pageFromTemplate(t,{id:'p9',title:'Kit',worldId:c.worldId,campaignId:c.id,parentId:null,newId});
  assert.deepEqual(page.character.statLayout,stats);
  assert.notEqual(page.character.statLayout.order,stats.order);
  // Save as template picks up a character's own arrangement; Use a template puts it on another, keeping values.
  const e={id:'old',worldId:c.worldId,campaignId:c.id,parentId:null,title:'Old',kind:'character',body:'',character:{...defaultCharacter(),statsByCampaign:{[c.id]:{acr:3}},statLayout:{order:['acr','ath']}},updatedAt:T};
  assert.deepEqual(templateFromPage({...s,entries:[...s.entries,e]},e,'X',newId,T).stats,{order:['acr','ath']});
  let w={...s,worlds:s.worlds.map(x=>x.id===c.worldId?{...x,templates:[t]}:x),entries:[...s.entries,e]};
  w=applyTemplate(w,'old','pc',newId,T);
  const got=w.entries.find(x=>x.id==='old').character;
  assert.deepEqual(got.statLayout,stats);assert.equal(got.statsByCampaign[c.id].acr,3);
  assert.ok(workspaceSchema.safeParse(w).success);
});
