import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {librarySchema} from '../lib/encyclopedia/tables.ts';
import {makeCalendar} from '../lib/encyclopedia/calendar-templates.ts';
import {defaultItemSettings} from '../lib/encyclopedia/items.ts';
import {starterVehicleTypes} from '../lib/encyclopedia/vehicles.ts';
import {buildPack,exportable,importPack,importPreview,packGroups,readPack,tablesNeeded,PACK_FORMAT} from '../lib/encyclopedia/content-pack.ts';

const now='2026-11-21T00:00:00.000Z';
let n=0;const makeId=()=>`new${++n}`;
const stat=(id,label,over={})=>({id,label,section:'Abilities',type:'number',options:[],visibility:'players',archived:false,...over});

/** The Lantern Coast with a campaign full of reusable things, and a second world with an empty campaign. */
function setup(){
  const s=demoWorkspace();
  const cal={...makeCalendar('harptos'),id:'cal1',name:'Harptos',events:[{id:'ev1',title:'Midwinter',notes:'',date:{year:1492,periodId:makeCalendar('harptos').periods[0].id,day:1},annual:true,visibility:'players'}]};
  const ws=workspaceSchema.parse({...s,
    worlds:[{...s.worlds[0],
      templates:[{id:'tpl1',name:'Tavern',kind:'place',fields:[{id:'f1',label:'Owner',type:'text',visibility:'players'}],tabs:[],body:'',updatedAt:now,parentId:'demo-places',stats:{order:['str','dex'],off:['dex']}},
        {id:'tpl2',name:'Salt Road only',kind:'note',fields:[],tabs:[],body:'',updatedAt:now,campaignId:'demo-campaign'}],
      tieTypes:[{id:'oath',name:'Sworn to',reverse:'Has the oath of',group:'allegiance',from:['character'],to:['character','faction'],custom:true}],
      vehicleTypes:[...starterVehicleTypes(),{...starterVehicleTypes()[0],id:'skiff',name:'Sand skiff'}]},
      {id:'w2',name:'Second World',description:'',archived:false,templates:[{id:'tx',name:'Tavern',kind:'place',fields:[],tabs:[],body:'',updatedAt:now}]}],
    campaigns:[{...s.campaigns[0],statFields:[stat('str','Strength'),stat('dex','Dexterity'),stat('old','Gone',{archived:true})],calendars:[cal],
      questCategories:[{id:'main',name:'Main',color:'accent'},{id:'heist',name:'Heists',color:'grey'}],items:{...defaultItemSettings(),categories:['Relics']}},
      s.campaigns[1],
      {id:'c2',worldId:'w2',name:'New Campaign',description:'',github:{repository:'',branch:'main'},statFields:[stat('x','strength')]}],
  });
  const lib=librarySchema.parse({schemaVersion:1,tables:[
    {id:'verbs',name:'Verbs',category:'meaning',kind:'table',campaignIds:['demo-campaign'],mode:'weighted',updatedAt:now,rows:[{id:'v',text:'Abandon'}]},
    {id:'nouns',name:'Nouns',category:'meaning',kind:'table',campaignIds:null,mode:'weighted',updatedAt:now,rows:[{id:'n',text:'a promise'}]},
    {id:'pair',name:'Action',category:'meaning',kind:'pair',campaignIds:['demo-campaign'],pair:['verbs','nouns'],updatedAt:now},
    {id:'elsewhere',name:'Elsewhere',category:'other',kind:'table',campaignIds:['c2'],mode:'weighted',updatedAt:now,rows:[{id:'e',text:'x'}]},
  ]});
  return {ws,lib};
}
const here={worldId:'demo-world',campaignId:'demo-campaign'},there={worldId:'w2',campaignId:'c2'};

test('lists what a campaign can export, leaving out other campaigns and archived stats',()=>{
  const {ws,lib}=setup(),all=exportable(ws,lib,here);
  assert.deepEqual(all.tables.map(t=>t.id).sort(),['nouns','pair','verbs']);
  assert.deepEqual(all.stats.map(f=>f.id),['str','dex']);
  assert.deepEqual(all.templates.map(t=>t.id),['tpl1','tpl2']);
  assert.deepEqual(exportable(ws,lib,{worldId:'demo-world',campaignId:'demo-campaign-two'}).templates.map(t=>t.id),['tpl1']);
  assert.deepEqual(all.tieTypes.map(t=>t.id),['oath']);
  const kinds=packGroups(all).map(g=>g.kind);
  assert.deepEqual(kinds,['tables','templates','stats','calendars','questCategories','tieTypes','vehicleTypes','items']);
  // A world on its own has no campaign things.
  assert.equal(packGroups(exportable(ws,lib,{worldId:'demo-world',campaignId:null})).some(g=>g.kind==='stats'),false);
});

test('exports only what was ticked, with the tables a pair rolls on, and no links back to the campaign',()=>{
  const {ws,lib}=setup();
  const pack=buildPack(ws,lib,here,{tables:['pair'],templates:['tpl1'],stats:['str']},now);
  assert.equal(pack.format,PACK_FORMAT);
  assert.deepEqual(pack.from,{world:'The Lantern Coast',campaign:'The Salt Road'});
  assert.deepEqual(pack.tables.map(t=>t.id).sort(),['nouns','pair','verbs']);
  assert.ok(pack.tables.every(t=>t.campaignIds===null));
  assert.equal(pack.templates[0].parentId,undefined);
  assert.equal(pack.calendars,undefined);
  assert.deepEqual(pack.stats.map(f=>f.id),['str']);
  assert.deepEqual(tablesNeeded(exportable(ws,lib,here).tables,['pair']).map(t=>t.id).sort(),['nouns','verbs']);
});

test('imports everything into another world as copies with new ids',()=>{
  const {ws,lib}=setup();
  const all=exportable(ws,lib,here),ticked=Object.fromEntries(packGroups(all).map(g=>[g.kind,g.items.map(i=>i.id)]));
  const pack=readPack(JSON.parse(JSON.stringify(buildPack(ws,lib,here,ticked,now))));
  const notes=importPreview(ws,lib,pack,there);
  assert.match(notes.get('templates:tpl1'),/\(2\)/);
  assert.match(notes.get('stats:str'),/Already here/);
  const r=importPack(ws,lib,pack,ticked,{...there,templates:'campaign',tables:'campaign'},makeId,now);
  workspaceSchema.parse(r.data);
  const w2=r.data.worlds.find(w=>w.id==='w2'),c2=r.data.campaigns.find(c=>c.id==='c2');
  // Tables: three new ones used only in the new campaign, the pair pointing at the copies.
  const added=r.library.tables.slice(lib.tables.length);
  assert.equal(added.length,3);
  assert.ok(added.every(t=>JSON.stringify(t.campaignIds)==='["c2"]'&&!lib.tables.some(x=>x.id===t.id)));
  const pair=added.find(t=>t.kind==='pair');
  assert.ok(pair.pair.every(id=>added.some(t=>t.id===id)));
  // Templates: renamed when taken, scoped to the campaign, and the stat order follows the stats (Strength was already here as "strength").
  assert.deepEqual(w2.templates.map(t=>t.name),['Tavern','Tavern (2)','Salt Road only']);
  const tavern=w2.templates[1];
  assert.equal(tavern.campaignId,'c2');assert.equal(tavern.parentId,undefined);
  const dex=c2.statFields.find(f=>f.label==='Dexterity');
  assert.deepEqual(tavern.stats,{order:['x',dex.id],off:[dex.id]});
  assert.deepEqual(c2.statFields.map(f=>f.label),['strength','Dexterity']);
  // Calendar: new ids, GM only.
  assert.equal(c2.calendars.length,1);assert.notEqual(c2.calendars[0].id,'cal1');assert.equal(c2.calendars[0].visibility,'gm');
  assert.equal(c2.calendars[0].events[0].visibility,'gm');assert.notEqual(c2.calendars[0].events[0].id,'ev1');
  // Quest categories join the defaults; Main is already there.
  assert.deepEqual(c2.questCategories.map(q=>q.name),['Main','Side','Personal','Heists']);
  // World things.
  assert.deepEqual(w2.tieTypes.map(t=>t.name),['Sworn to']);
  assert.ok(w2.vehicleTypes.some(t=>t.name==='Sand skiff'));
  assert.equal(w2.vehicleTypes.length,starterVehicleTypes().length+1);
  assert.deepEqual(c2.items.categories,['Relics']);
  // The source is untouched.
  assert.deepEqual(r.data.worlds[0],ws.worlds[0]);
  assert.ok(r.summary.some(s=>s.startsWith('Character stats: 1 added, 1 already here')));
});

test('importing the same file twice skips what is already there',()=>{
  const {ws,lib}=setup();
  const pack=buildPack(ws,lib,here,{stats:['str','dex'],questCategories:['heist'],tieTypes:['oath']},now);
  const opts={...there,templates:'world',tables:'all'};
  const once=importPack(ws,lib,pack,{stats:['str','dex'],questCategories:['heist'],tieTypes:['oath']},opts,makeId,now);
  const twice=importPack(once.data,lib,pack,{stats:['str','dex'],questCategories:['heist'],tieTypes:['oath']},opts,makeId,now);
  assert.equal(twice.data.campaigns.find(c=>c.id==='c2').statFields.length,2);
  assert.ok(twice.summary.every(s=>/0 added/.test(s)));
  assert.equal(once.library,null);
});

test('templates and tables can go to the whole world, and campaign things need a campaign',()=>{
  const {ws,lib}=setup();
  const pack=buildPack(ws,lib,here,{templates:['tpl2'],tables:['nouns'],stats:['str']},now);
  const r=importPack(ws,lib,pack,{templates:['tpl2'],tables:['nouns']},{worldId:'w2',campaignId:null,templates:'campaign',tables:'campaign'},makeId,now);
  assert.equal(r.data.worlds.find(w=>w.id==='w2').templates.at(-1).campaignId,undefined);
  assert.equal(r.library.tables.at(-1).campaignIds,null);
  assert.throws(()=>importPack(ws,lib,pack,{stats:['str']},{worldId:'w2',campaignId:null,templates:'world',tables:'all'},makeId,now),/Open a campaign/);
});

test('reads random table and calendar exports, and refuses other files',()=>{
  const {lib}=setup();
  const tables=readPack({format:'rpg-tools-tables',version:1,tables:[lib.tables[1]]});
  assert.deepEqual(tables.tables.map(t=>t.name),['Nouns']);
  const cal=readPack({format:'world-manager-calendar',version:1,calendar:makeCalendar('harptos')});
  assert.equal(cal.calendars.length,1);
  assert.throws(()=>readPack({format:'ttrpg-map',version:1}),/map file/);
  assert.throws(()=>readPack({hello:1}),/Choose a content file/);
  assert.throws(()=>readPack({format:PACK_FORMAT,version:1,stats:[{id:'bad'}]}),/could not be read/);
});

test('too many is refused before anything changes',()=>{
  const {ws,lib}=setup();
  const full={...ws,campaigns:ws.campaigns.map(c=>c.id==='c2'?{...c,calendars:Array.from({length:12},(_,i)=>({...makeCalendar('harptos'),id:`k${i}`}))}:c)};
  const pack=buildPack(ws,lib,here,{calendars:['cal1']},now);
  assert.throws(()=>importPack(full,lib,pack,{calendars:['cal1']},{...there,templates:'world',tables:'all'},makeId,now),/up to 12 calendars/);
});
