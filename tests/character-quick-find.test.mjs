import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,defaultCharacter} from '../lib/encyclopedia/world-model.ts';
import {defaultProfile} from '../lib/encyclopedia/character-profile.ts';
import {defaultItemSettings} from '../lib/encyclopedia/items.ts';
import {arrangeStats,shownStats,statGroups,moveStat,moveStatGroup,toggleStat,tidy,formFromArrangement,statOff} from '../lib/encyclopedia/stat-arrange.ts';
import {scorePairs,combineScorePairs} from '../lib/encyclopedia/stat-scores.ts';
import {modKey,statModifier,statRows,statRollDice,sheetOf} from '../lib/encyclopedia/stat-rolls.ts';
import {togglePin,movePin,isPinned,lineRef,pinnedLine,statblockLines,playerPins} from '../lib/encyclopedia/profile-pins.ts';

const C='demo-campaign',T='2026-11-14T10:00:00.000Z';
const f=(id,label,section='Abilities',extra={})=>({id,label,section,type:'number',options:[],visibility:'players',archived:false,...extra});
const ids=l=>l.map(x=>x.id);

test('arrangeStats orders by the arrangement and keeps unlisted stats after their form predecessor', () => {
 const fields=[{id:'a',section:'X'},{id:'b',section:'X'},{id:'c',section:'X'},{id:'d',section:'X'}];
 assert.deepEqual(ids(arrangeStats(fields)),['a','b','c','d']);
 assert.deepEqual(ids(arrangeStats(fields,{})),['a','b','c','d']);
 assert.deepEqual(ids(arrangeStats(fields,{order:[]})),['a','b','c','d']);
 assert.deepEqual(ids(arrangeStats(fields,{order:['d','c','b','a']})),['d','c','b','a']);
 // b and c are not listed: each stays after the stat before it in the form (a)
 assert.deepEqual(ids(arrangeStats(fields,{order:['d','a']})),['d','a','b','c']);
 // c is new: it follows b, wherever b was moved
 assert.deepEqual(ids(arrangeStats(fields,{order:['d','b','a']})),['d','b','c','a']);
 // an unlisted first stat goes to the front
 assert.deepEqual(ids(arrangeStats(fields,{order:['d','c']})).slice(0,1),['a']);
 // ids in the arrangement the form lacks are ignored
 assert.deepEqual(ids(arrangeStats(fields,{order:['zzz','b','a','c','d']})),['b','a','c','d']);
 // does not mutate
 assert.deepEqual(ids(fields),['a','b','c','d']);
});

test('shownStats leaves out the switched-off stats, in order', () => {
 const fields=[{id:'a'},{id:'b'},{id:'c'}];
 assert.deepEqual(ids(shownStats(fields,{order:['c','b','a'],off:['b']})),['c','a']);
 assert.deepEqual(ids(shownStats(fields,{off:['a']})),['b','c']);
 assert.deepEqual(ids(shownStats(fields,null)),['a','b','c']);
 assert.equal(statOff({off:['a']},'a'),true);assert.equal(statOff(undefined,'a'),false);
});

test('statGroups, moveStat and moveStatGroup move within groups and do nothing at the ends', () => {
 const fields=[{id:'a',section:'One'},{id:'b',section:'One'},{id:'c',section:'Two'},{id:'d',section:'Two'},{id:'e',section:'One'}];
 const groups=statGroups(fields);
 assert.deepEqual(groups.map(g=>[g.name,ids(g.fields)]),[['One',['a','b','e']],['Two',['c','d']]]);
 assert.deepEqual(moveStat(fields,'b',-1),['b','a','e','c','d']);
 assert.deepEqual(moveStat(fields,'b',1),['a','e','b','c','d']);
 assert.deepEqual(moveStat(fields,'a',-1),['a','b','e','c','d'],'no-op at the top of a group');
 assert.deepEqual(moveStat(fields,'e',1),['a','b','e','c','d'],'no-op at the bottom of a group');
 assert.deepEqual(moveStat(fields,'c',-1),['a','b','e','c','d'],'a stat does not leave its group');
 assert.deepEqual(moveStat(fields,'nope',1),['a','b','e','c','d']);
 assert.deepEqual(moveStatGroup(fields,'Two',-1),['c','d','a','b','e']);
 assert.deepEqual(moveStatGroup(fields,'One',1),['c','d','a','b','e']);
 assert.deepEqual(moveStatGroup(fields,'One',-1),['a','b','e','c','d']);
 assert.deepEqual(moveStatGroup(fields,'Two',1),['a','b','e','c','d']);
 assert.deepEqual(moveStatGroup(fields,'Missing',1),['a','b','e','c','d']);
});

test('toggleStat, tidy and formFromArrangement', () => {
 assert.deepEqual(toggleStat(undefined,'a'),{off:['a']});
 assert.deepEqual(toggleStat({off:['a']},'b'),{off:['a','b']});
 assert.equal(toggleStat({off:['a']},'a'),undefined,'an empty arrangement is undefined');
 assert.deepEqual(toggleStat({order:['x','y'],off:['a']},'a'),{order:['x','y']});
 // tidy
 assert.equal(tidy(undefined),undefined);assert.equal(tidy({order:[],off:[]}),undefined);
 assert.deepEqual(tidy({order:['a','b','b'],off:[]}),{order:['a','b']});
 assert.deepEqual(tidy({order:['a','gone','b'],off:['gone','b']},new Set(['a','b'])),{order:['a','b'],off:['b']});
 assert.equal(tidy({order:['gone']},new Set(['a'])),undefined);
 // formFromArrangement: shown stats in order, off ones archived, already-archived at the end
 const all=[{id:'a',archived:false},{id:'b',archived:true},{id:'c',archived:false},{id:'d',archived:false}];
 const out=formFromArrangement(all,{order:['d','c','a'],off:['c']});
 assert.deepEqual(out.map(x=>[x.id,x.archived]),[['d',false],['c',true],['a',false],['b',true]]);
 assert.deepEqual(formFromArrangement(all,undefined).map(x=>x.id),['a','c','d','b']);
 assert.equal(all[2].archived,false,'does not mutate');
});

function scoreCampaign(){
 const s=demoWorkspace();
 const fields=[
  f('str-score','Strength score','Abilities'),
  f('str-mod','Strength modifier','Abilities',{rolls:[{name:'Roll',formula:'1d20+{value}'}]}),
  f('athletics','Athletics','Skills',{rolls:[{name:'Check',formula:'1d20+{Strength modifier}'}]}),
 ];
 s.campaigns=s.campaigns.map(c=>c.id===C?{...c,statFields:fields}:c);
 s.entries.push({id:'hero',worldId:'demo-world',campaignId:C,parentId:null,title:'Hero',kind:'character',body:'',updatedAt:T,
  character:{...defaultCharacter(),statsVisibility:'players',statsByCampaign:{[C]:{'str-score':16,'str-mod':3}}}});
 return s;
}

test('scorePairs finds "<Name> score" with "<Name> modifier" and skips existing names and boxes', () => {
 const s=scoreCampaign(),fields=s.campaigns.find(c=>c.id===C).statFields;
 const pairs=scorePairs(fields);
 assert.deepEqual(pairs.map(p=>[p.name,p.score.id,p.mod.id]),[['Strength','str-score','str-mod']]);
 // "mod" works and text modifiers are fine
 assert.equal(scorePairs([f('a','Dex score'),f('b','Dex mod','Abilities',{type:'text'})]).length,1);
 // different group: no pair
 assert.equal(scorePairs([f('a','Dex score','One'),f('b','Dex mod','Two')]).length,0);
 // a stat called Strength already exists: skipped
 assert.equal(scorePairs([...fields,f('x','Strength','Abilities')]).length,0);
 // already a box: skipped
 assert.equal(scorePairs([f('a','Dex score','Abilities',{look:'score'}),f('b','Dex mod')]).length,0);
 // archived stats are ignored
 assert.equal(scorePairs([f('a','Dex score'),f('b','Dex mod','Abilities',{archived:true})]).length,0);
});

test('combineScorePairs makes one score box, archives the modifier and rewrites rolls and values', () => {
 const s=scoreCampaign();
 assert.ok(workspaceSchema.safeParse(s).success);
 const {data,combined}=combineScorePairs(s,C);
 assert.deepEqual(combined,['Strength']);
 const fields=data.campaigns.find(c=>c.id===C).statFields,by=id=>fields.find(x=>x.id===id);
 assert.equal(by('str-score').label,'Strength');assert.equal(by('str-score').look,'score');
 assert.deepEqual(by('str-score').rolls,[{name:'Roll',formula:'1d20+{Strength mod}'}]);
 assert.equal(by('str-mod').archived,true);
 assert.equal(by('str-mod').label,'Strength modifier','the modifier stat is kept, just archived');
 assert.equal(by('athletics').rolls[0].formula,'1d20+{Strength mod}');
 const hero=data.entries.find(e=>e.id==='hero').character.statsByCampaign[C];
 assert.equal(hero[modKey('str-score')],3);assert.equal(hero['str-mod'],3,'the old value is kept');assert.equal(hero['str-score'],16);
 assert.ok(workspaceSchema.safeParse(data).success);
 // the rolls now work from the combined box
 const live=fields.filter(x=>!x.archived),rows=statRows(live,hero);
 assert.equal(rows.find(r=>r.id==='str-score').worked,3);
 assert.equal(rows.find(r=>r.id==='athletics').rolls[0].dice,'1d20+3');
 // does not mutate the input
 assert.equal(s.campaigns.find(c=>c.id===C).statFields[0].label,'Strength score');
 // running it again finds nothing more
 const again=combineScorePairs(data,C);assert.deepEqual(again.combined,[]);assert.equal(again.data,data);
 // an existing typed modifier is not overwritten
 const typed=structuredClone(s);typed.entries.find(e=>e.id==='hero').character.statsByCampaign[C][modKey('str-score')]=5;
 assert.equal(combineScorePairs(typed,C).data.entries.find(e=>e.id==='hero').character.statsByCampaign[C][modKey('str-score')],5);
 // skipped when a stat named Strength already exists
 const clash=structuredClone(s);clash.campaigns=clash.campaigns.map(c=>c.id===C?{...c,statFields:[...c.statFields,f('str','Strength','Other')]}:c);
 const r=combineScorePairs(clash,C);assert.deepEqual(r.combined,[]);assert.equal(r.data,clash);
 // an unknown campaign does nothing
 assert.deepEqual(combineScorePairs(s,'nope').combined,[]);
});

test('score boxes: modKey, statModifier and statRows prefer the typed modifier and fall back to the derived one', () => {
 assert.equal(modKey('abc'),'abc-mod');
 assert.equal(modKey('x'.repeat(200)).length,96+4);
 assert.equal(statModifier({value:16,mod:3},[]),3);
 assert.equal(statModifier({value:16,mod:'+4'},[]),4,'numeric text counts');
 assert.equal(statModifier({value:16,mod:'high'},[]),null,'unparseable typed text with no derived');
 assert.equal(statModifier({value:16,derived:'floor(({value}-10)/2)'},[]),3);
 assert.equal(statModifier({value:16,mod:5,derived:'floor(({value}-10)/2)'},[]),5,'typed wins');
 assert.equal(statModifier({value:16},[]),null);
 const box=f('str','Strength','Abilities',{look:'score',derived:'floor(({value}-10)/2)',rolls:[{name:'Check',formula:'1d20+{Strength mod}'}]});
 const row=vals=>statRows([box],vals)[0];
 assert.equal(row({str:16}).worked,3,'derived fallback');
 assert.equal(row({str:16}).look,'score');
 assert.equal(row({str:16,[modKey('str')]:7}).worked,7,'typed modifier');
 assert.equal(row({str:16,[modKey('str')]:7}).rolls[0].dice,'1d20+7');
 assert.equal(row({str:16}).rolls[0].dice,'1d20+3');
 const bare=f('dex','Dexterity','Abilities',{look:'score'});
 assert.equal(statRows([bare],{dex:14})[0].worked,undefined,'no typed modifier and no derived');
 assert.equal(statRows([bare],{dex:14,[modKey('dex')]:2})[0].worked,2);
 // statRollDice with a sheet that has the score and its typed modifier
 const fields=[f('str','Strength','Abilities',{look:'score'})];
 const sheet=sheetOf(fields,{str:16,[modKey('str')]:2});
 assert.equal(statRollDice('1d20+{Strength mod}',null,sheet),'1d20+2');
 assert.equal(statRollDice('1d20+{Strength}',null,sheet),'1d20+16');
 assert.equal(statRollDice('1d20+{Strength mod}',null,sheetOf(fields,{str:16})),null,'no modifier to read');
 assert.equal(statRollDice('1d20+{Strength mod}',null,sheetOf([{...fields[0],archived:true}],{str:16,[modKey('str')]:2})),null);
});

test('pins: toggle, move, statblock line references and player pins', () => {
 let n=0;const id=()=>'p'+(++n);
 let pins=togglePin(undefined,'stat','s1',3,id);
 assert.deepEqual(pins,[{id:'p1',kind:'stat',ref:'s1'}]);
 pins=togglePin(pins,'item','i1',3,id);pins=togglePin(pins,'spell','sp1',3,id);
 assert.equal(pins.length,3);
 // full: unchanged
 assert.deepEqual(togglePin(pins,'stat','s2',3,id),pins);
 assert.notEqual(togglePin(pins,'stat','s2',3,id),pins,'a copy');
 // unpin, even when full
 assert.deepEqual(togglePin(pins,'item','i1',3,id).map(p=>p.ref),['s1','sp1']);
 // same ref, other kind is a different pin
 assert.equal(isPinned(pins,'stat','i1'),false);assert.equal(isPinned(pins,'item','i1'),true);assert.equal(isPinned(undefined,'item','i1'),false);
 // movePin
 assert.deepEqual(movePin(pins,'p2',-1).map(p=>p.id),['p2','p1','p3']);
 assert.deepEqual(movePin(pins,'p2',1).map(p=>p.id),['p1','p3','p2']);
 assert.deepEqual(movePin(pins,'p1',-1).map(p=>p.id),['p1','p2','p3'],'no-op at the start');
 assert.deepEqual(movePin(pins,'p3',1).map(p=>p.id),['p1','p2','p3'],'no-op at the end');
 assert.deepEqual(movePin(pins,'zz',1).map(p=>p.id),['p1','p2','p3']);
 // statblock lines
 const text='Goblin Boss\r\nAC 17, HP 21\n\n  Speed 30 ft.  \nMultiattack. Two attacks.';
 assert.deepEqual(statblockLines(text),['AC 17, HP 21','Speed 30 ft.','Multiattack. Two attacks.'],'the name line and blanks are left out');
 assert.deepEqual(statblockLines(undefined),[]);
 assert.equal(lineRef('  Speed 30 ft.  '),'Speed 30 ft.');
 assert.equal(lineRef('x'.repeat(400)).length,300);
 assert.equal(pinnedLine(text,'Speed 30 ft.'),'Speed 30 ft.');
 assert.equal(pinnedLine(text,'Gone'),undefined);
 assert.equal(pinnedLine(undefined,'x'),undefined);
 const long='Lore '+'y'.repeat(400);
 assert.equal(pinnedLine('Name\n'+long,lineRef(long)),long,'a long line is found by its shortened reference');
 // playerPins
 const shown={stats:[{id:'s1',label:'Str'}],items:[{id:'i1',name:'Rope'}],spells:[{id:'sp1',name:'Bolt'}]};
 const all=[{id:'a',kind:'stat',ref:'s1'},{id:'b',kind:'statblock',ref:'AC 17'},{id:'c',kind:'item',ref:'i1'},{id:'d',kind:'item',ref:'hidden'},{id:'e',kind:'spell',ref:'sp1'},{id:'f',kind:'stat',ref:'s9'}];
 const out=playerPins(all,shown);
 assert.deepEqual(out.map(p=>[p.id,p.kind]),[['a','stat'],['c','item'],['e','spell']]);
 assert.equal(out[0].stat,shown.stats[0]);assert.equal(out[1].item,shown.items[0]);assert.equal(out[2].spell,shown.spells[0]);
 assert.deepEqual(playerPins(undefined,shown),[]);
 assert.deepEqual(playerPins(all,{}),[]);
});

/** A campaign with a stat players see, and a character with a pinned stat, item, GM item, spell and statblock line. */
function pinWorld({stats='players',inv='players',spells='players',layout}={}){
 const s=demoWorkspace();
 s.campaigns=s.campaigns.map(c=>c.id===C?{...c,items:defaultItemSettings(),statFields:[f('s1','Agility','Abilities',{type:'number'}),f('s2','Luck','Abilities',{visibility:'gm'})]}:c);
 s.entries.push({id:'pc',worldId:'demo-world',campaignId:C,parentId:null,title:'Pinned One',kind:'character',body:'',updatedAt:T,
  character:{...defaultCharacter(),statsVisibility:stats,statsByCampaign:{[C]:{s1:12,s2:4}},
   ...(layout?{statLayout:layout}:{}),
   inventory:{coins:0,visibility:inv,items:[{id:'i1',name:'Rope',qty:1},{id:'i2',name:'Poison vial',qty:1,gm:true}]},
   spellsVisibility:spells,spells:[{id:'sp1',name:'Spark'},{id:'sp2',name:'Secret spell',gm:true}]},
  profile:{...defaultProfile(),visibility:'players',pins:[
   {id:'a',kind:'stat',ref:'s1'},{id:'b',kind:'item',ref:'i1'},{id:'c',kind:'item',ref:'i2'},{id:'d',kind:'spell',ref:'sp1'},{id:'e',kind:'spell',ref:'sp2'},
   {id:'f',kind:'statblock',ref:'AC 17'},{id:'g',kind:'stat',ref:'s2'}]}});
 return s;
}
const pcOf=s=>playerCampaign(s,C).entries.find(e=>e.id==='pc');

test('players get pins only for stats, items and spells they already get, never statblock lines', () => {
 assert.ok(defaultItemSettings().spells.on,'spells are on by default');
 const s=pinWorld();
 assert.ok(workspaceSchema.safeParse(s).success);
 const pe=pcOf(s);
 assert.deepEqual(pe.profile.pins.map(p=>[p.id,p.kind]),[['a','stat'],['b','item'],['d','spell']]);
 assert.equal(pe.profile.pins[0].stat.label,'Agility');assert.equal(pe.profile.pins[0].stat.value,12);
 assert.equal(pe.profile.pins[1].item.name,'Rope');assert.equal(pe.profile.pins[2].spell.name,'Spark');
 const flat=JSON.stringify(pe.profile);
 for(const secret of ['Poison vial','Secret spell','AC 17','Luck'])assert.equal(flat.includes(secret),false,secret);
 // stats shared with GM only: the stat pin is gone, the rest stay
 assert.deepEqual(pcOf(pinWorld({stats:'gm'})).profile.pins.map(p=>p.kind),['item','spell']);
 // inventory GM only: item pins go
 assert.deepEqual(pcOf(pinWorld({inv:'gm'})).profile.pins.map(p=>p.kind),['stat','spell']);
 // spells GM only: spell pins go
 assert.deepEqual(pcOf(pinWorld({spells:'gm'})).profile.pins.map(p=>p.kind),['stat','item']);
 // nothing shared: no pins key at all
 const none=pcOf(pinWorld({stats:'gm',inv:'gm',spells:'gm'}));
 assert.equal(none.profile.pins,undefined);
 // spells switched off for the campaign: spell pins go
 const off=pinWorld();off.campaigns=off.campaigns.map(c=>c.id===C?{...c,items:{...defaultItemSettings(),spells:{...defaultItemSettings().spells,on:false}}}:c);
 assert.deepEqual(pcOf(off).profile.pins.map(p=>p.kind),['stat','item']);
 // a profile only for the GM sends nothing
 const gmProfile=pinWorld();gmProfile.entries=gmProfile.entries.map(e=>e.id==='pc'?{...e,profile:{...e.profile,visibility:'gm'}}:e);
 assert.equal(pcOf(gmProfile)?.profile,undefined);
});

test('a character\'s statLayout off removes the stat from the player entry (and its pin)', () => {
 const s=pinWorld({layout:{off:['s1']}});
 assert.ok(workspaceSchema.safeParse(s).success);
 const pe=pcOf(s);
 assert.deepEqual(pe.stats.map(r=>r.id),[]);
 assert.deepEqual(pe.profile.pins.map(p=>p.kind),['item','spell'],'the pinned stat is switched off, so the pin is gone');
 // a layout that only reorders keeps both stats' pins
 const wide=pinWorld();wide.campaigns=wide.campaigns.map(c=>c.id===C?{...c,statFields:[f('s1','Agility'),f('s3','Grit')]}:c);
 wide.entries=wide.entries.map(e=>e.id==='pc'?{...e,character:{...e.character,statLayout:{order:['s3','s1']}}}:e);
 assert.deepEqual(pcOf(wide).stats.map(r=>r.id),['s3','s1']);
 assert.deepEqual(pcOf(wide).profile.pins.filter(p=>p.kind==='stat').map(p=>p.stat.id),['s1']);
});
