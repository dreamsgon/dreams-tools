import test from 'node:test';
import assert from 'node:assert/strict';
import {statRolls,statRollDice,statRollHint,statRollPreview,firstStatRoll,placeStat,derivedValue,rollOutcome,sheetOf,statNumber} from '../lib/encyclopedia/stat-rolls.ts';
import {statFieldSchema,workspaceSchema,demoWorkspace,playerCampaign} from '../lib/encyclopedia/world-model.ts';
import {characterRoll} from '../lib/encyclopedia/items.ts';
import {fileRollOf} from '../lib/encyclopedia/sheet-export.ts';

test('older single rolls read as one roll called Roll; named rolls win',()=>{
 assert.deepEqual(statRolls({roll:'d20'}),[{name:'Roll',formula:'1d20+{value}'}]);
 assert.deepEqual(statRolls({roll:'formula'}),[{name:'Roll',formula:'{value}'}]);
 assert.deepEqual(statRolls({roll:'custom',rollFormula:' 1d20+3 '}),[{name:'Roll',formula:'1d20+3'}]);
 assert.deepEqual(statRolls({roll:'none'}),[]);
 assert.deepEqual(statRolls({}),[]);
 assert.deepEqual(statRolls({roll:'d20',rolls:[]}),[],'saved on the sheet with no rolls');
 assert.deepEqual(statRolls({roll:'d20',rolls:[{name:'Save',formula:'1d20+{value}+2'}]}),[{name:'Save',formula:'1d20+{value}+2'}]);
});

test('a roll puts the value in, or says why it cannot',()=>{
 assert.equal(statRollDice('1d20+{value}',4),'1d20+4');
 assert.equal(statRollDice('1d20+{value}',-2),'1d20-2');
 assert.equal(statRollDice('1d20+{value}','+3'),'1d20+3');
 assert.equal(statRollDice('1d20-{value}',-2),'1d20+2');
 assert.equal(statRollDice('1d20+{value}+2',2),'1d20+4','plain numbers add up');
 assert.equal(statRollDice('1d20+{value}-2',2),'1d20');
 assert.equal(statRollDice('2d6+{value}+1d4',1),'2d6+1+1d4','only a single dice term is tidied');
 assert.equal(statRollDice('{value}d10>=8',5),'5d10>=8');
 assert.equal(statRollDice('{value}','2d8 + 3'),'2d8+3');
 assert.equal(statRollDice('2d6+1',null),'2d6+1','plain dice need no value');
 assert.equal(statRollDice('1d20+{value}',''),null);
 assert.equal(statRollDice('1d20+{value}',true),'1d20+1','a ticked checkbox counts as 1');
 assert.equal(statRollDice('1d20+{value}',false),'1d20');
 assert.equal(statRollDice('1d20+{value}','sword'),null);
 assert.equal(statRollDice('1d20+{value}','1|x'),null);
 assert.equal(statRollHint('1d20+{value}','', 'number'),'Type a number to roll.');
 assert.equal(statRollHint('{value}','', 'text'),'Type dice like 2d8+3 to roll them.');
 assert.match(statRollHint('Sword','', 'text'),/needs dice/);
 assert.equal(statRollHint('1d20+{value}',3,'number'),null);
 assert.equal(firstStatRoll({rolls:[{name:'A',formula:'1d20+{value}'},{name:'B',formula:'1d6'}]},''),'1d6');
});

test('the Add a stat dialog previews what a formula rolls',()=>{
 assert.deepEqual(statRollPreview('1d20+3','text'),{text:'Always rolls 1d20+3.',bad:false});
 assert.deepEqual(statRollPreview('1d20+{value}','number'),{text:'With 3 here: 1d20+3.',bad:false});
 assert.deepEqual(statRollPreview('{value}','text'),{text:'With 2d8+3 here: 2d8+3.',bad:false});
 assert.equal(statRollPreview('1d20+{value}','none').bad,true,'a stat with no value cannot use {value}');
 assert.equal(statRollPreview('Sword','text').bad,true);
 assert.equal(statRollPreview('','text').bad,false);
});

test('new stats join the end of their group',()=>{
 const f=(id,section)=>({id,section});
 assert.deepEqual(placeStat([f('a','A'),f('b','B'),f('c','A2')],f('n','B')).map(x=>x.id),['a','b','n','c']);
 assert.deepEqual(placeStat([f('a','A')],f('n','C')).map(x=>x.id),['a','n']);
});

test('named rolls and no-value stats save, export, roll from stores and reach player pages with their dice',()=>{
 const field={id:'push',label:'Push yourself',section:'Moves',type:'none',options:[],visibility:'players',archived:false,note:'Spends 1 Stress',rolls:[{name:'Roll',formula:'1d20+5'}]};
 assert.equal(statFieldSchema.safeParse(field).success,true);
 assert.equal(statFieldSchema.safeParse({...field,rolls:Array.from({length:7},(_,i)=>({name:'R'+i,formula:'1d6'}))}).success,false,'six rolls at most');
 assert.equal(statFieldSchema.safeParse({...field,note:'x'.repeat(121)}).success,false);
 const str={id:'str',label:'Strength',section:'Attributes',type:'number',options:[],visibility:'players',archived:false,rolls:[{name:'Check',formula:'1d20+{value}'},{name:'Save',formula:'1d20+{value}+2'}]};
 const s=demoWorkspace(),c=s.campaigns[0],e=s.entries.find(e=>e.id==='demo-mara');
 c.statFields=[str,field];
 e.character={role:'npc',group:'',tags:[],location:'',faction:'',status:'active',statsVisibility:'players',statsByCampaign:{[c.id]:{str:3}}};
 assert.equal(workspaceSchema.safeParse(s).success,true);
 assert.equal(characterRoll(e.character,c.statFields,c.id,'Strength'),'1d20+3');
 assert.equal(characterRoll(e.character,c.statFields,c.id,'strength save'),'1d20+5');
 assert.equal(characterRoll(e.character,c.statFields,c.id,'Push yourself'),'1d20+5');
 assert.equal(fileRollOf(str),'d20');
 assert.equal(fileRollOf({rolls:[{name:'Roll',formula:'{value}'}]}),'self');
 assert.equal(fileRollOf({rolls:[]}),undefined);
 const pc=playerCampaign(s,c.id),mara=pc.entries.find(x=>x.id==='demo-mara');
 assert.ok(mara.stats.some(x=>x.id==='str'));
 const push=mara.stats.find(x=>x.id==='push');
 assert.deepEqual(push.rolls,[{name:'Roll',dice:'1d20+5'}],'players get the worked-out dice');
 assert.equal(push.note,'Spends 1 Stress');
});

test('formulas read other stats, worked-out values and simple sums',()=>{
 const sheet=sheetOf([
  {id:'str',label:'Strength',type:'number',derived:'floor(({value}-10)/2)'},
  {id:'agi',label:'Agility',type:'number',derived:'floor(({value}-10)/2)'},
  {id:'tr',label:'Training',type:'number'},
  {id:'pil',label:'Piloting',type:'checkbox'},
  {id:'spot',label:'Spot',type:'number'},
  {id:'spoth',label:'Spot Hidden',type:'number'},
  {id:'old',label:'Gone',type:'number',archived:true},
 ],{str:14,agi:9,tr:2,pil:true,spot:1,spoth:45,old:5});
 assert.equal(derivedValue(sheet[0],sheet),2);
 assert.equal(derivedValue(sheet[1],sheet),-1,'rounds down');
 assert.equal(statRollDice('1d20+{Strength mod}',null,sheet),'1d20+2');
 assert.equal(statRollDice('1d20+{Agility mod}',null,sheet),'1d20-1');
 assert.equal(statRollDice('1d20+{agility MOD}+{Training}',null,sheet),'1d20+1','names ignore case');
 assert.equal(statRollDice('1d20+{Strength mod}+{Piloting*Training}',null,sheet),'1d20+4','a checkbox is 1 or 0');
 assert.equal(statRollDice('{Strength-10}d6',null,sheet),'4d6');
 assert.equal(statRollDice('{value+Training}d10>=8',3,sheet),'5d10>=8');
 assert.equal(statRollDice('1d100+{Spot Hidden}',null,sheet),'1d100+45','the longest name wins');
 assert.equal(statRollDice('1d20+{Spot}',null,sheet),'1d20+1');
 assert.equal(statRollDice('1d20+{floor(Strength/3)}',null,sheet),'1d20+4');
 assert.equal(statRollDice('1d20+{Gone}',null,sheet),null,'archived stats are not on the sheet');
 assert.equal(statRollDice('1d20+{Nope}',null,sheet),null);
 assert.equal(statRollDice('1d20+{Strength',null,sheet),null);
 const gap=sheetOf([{id:'a',label:'Agility',type:'number'}],{});
 assert.equal(statRollDice('1d20+{Agility}',null,gap),null);
 assert.equal(statRollHint('1d20+{Agility}',null,'none',gap),'Fill in Agility to roll this.');
 assert.match(statRollHint('1d20+{Nope}',null,'none',gap),/needs dice/);
 assert.equal(statNumber(' 4 '),4);assert.equal(statNumber('2d6'),null);
 const loop=sheetOf([{id:'a',label:'A',type:'number',derived:'{A mod}+1'}],{a:1});
 assert.equal(derivedValue(loop[0],loop),null,'a worked-out value that reads itself gives up');
});

test('the dialog previews with this character, and targets say success or fail',()=>{
 const sheet=sheetOf([{id:'a',label:'Agility',type:'number'},{id:'b',label:'Wits',type:'number'}],{a:4});
 assert.deepEqual(statRollPreview('1d20+{Agility}','none',sheet,null,'Chiree'),{text:'For Chiree this rolls 1d20+4.',bad:false});
 assert.deepEqual(statRollPreview('1d20+{Wits}','none',sheet,null,'Chiree'),{text:'Once Wits is filled in. With 3 there: 1d20+3.',bad:false});
 assert.equal(statRollPreview('1d20+{Charm}','none',sheet).bad,true);
 assert.deepEqual(rollOutcome(14,{op:'atLeast',against:'15'},null),{ok:false,text:'Fail · needed 15 or more'});
 assert.deepEqual(rollOutcome(40,{op:'atMost',against:'{value}'},55),{ok:true,text:'Success · needed 55 or under'});
 assert.deepEqual(rollOutcome(2,{op:'atLeast',against:'{Agility-3}'},null,sheet),{ok:true,text:'Success · needed 1 or more'});
 assert.equal(rollOutcome(2,{op:'atLeast',against:''},null),null);
 assert.equal(rollOutcome(2,undefined,null),null);
 assert.equal(rollOutcome(2,{op:'atMost',against:'{Wits}'},null,sheet),null,'no number to compare');
});

test('worked-out values, targets and spending save, and store rolls read other stats',()=>{
 const base={options:[],visibility:'players',archived:false,section:''};
 const agi={...base,id:'agi',label:'Agility',type:'number',derived:'floor(({value}-10)/2)',rolls:[{name:'Check',formula:'1d20+{Agility mod}',success:{op:'atLeast',against:'15'}}]};
 const push={...base,id:'push',label:'Push',type:'none',spend:{tracker:'Stress',n:1},rolls:[{name:'Roll',formula:'1d20+{Agility}'}]};
 assert.equal(statFieldSchema.safeParse(agi).success,true);
 assert.equal(statFieldSchema.safeParse(push).success,true);
 assert.equal(statFieldSchema.safeParse({...push,spend:{tracker:'Stress',n:0}}).success,false);
 assert.equal(statFieldSchema.safeParse({...agi,rolls:[{name:'Check',formula:'1d20',success:{op:'over',against:'1'}}]}).success,false);
 const ch={statsByCampaign:{c:{agi:16}}};
 assert.equal(characterRoll(ch,[agi,push],'c','Agility'),'1d20+3');
 assert.equal(characterRoll(ch,[agi,push],'c','Push'),'1d20+16');
 assert.equal(characterRoll(ch,[{...agi,archived:true},push],'c','Agility'),null);
});

test('part 3: a Maptable token finds the sheet of its own campaign, else the paired one', async () => {
  const { sheetCampaignOf } = await import('../lib/encyclopedia-characters.ts');
  const { statRows: rows } = await import('../lib/encyclopedia/stat-rolls.ts');
  const fields = [{ id: 'agi', label: 'Agility', section: 'Attributes', type: 'number', rolls: [{ name: 'Check', formula: '1d20+{value}', success: { op: 'atLeast', against: '15' } }] }];
  const raw = { campaigns: [{ id: 'c1', name: 'One', maptableCampaignId: 'm1', statFields: fields }, { id: 'c2', name: 'Two' }] };
  const lore = { campaignId: null, character: { statsByCampaign: { c1: { agi: 4 } } } };
  const s = sheetCampaignOf(raw, lore, 'm1');
  assert.equal(s.campaign.id, 'c1');
  assert.deepEqual(rows(s.campaign.statFields, s.values)[0].rolls, [{ name: 'Check', dice: '1d20+4', need: { op: 'atLeast', n: 15 } }]);
  assert.equal(sheetCampaignOf(raw, lore, 'other'), undefined, 'no paired campaign: no sheet');
  assert.equal(sheetCampaignOf(raw, { campaignId: 'c2' }, 'm1'), undefined, 'its own campaign has no sheet');
  assert.equal(sheetCampaignOf(raw, { campaignId: 'c1' }, null).values.agi, undefined);
});

test('part 4: every starter layout is a valid sheet whose rolls all roll once values are in', async () => {
  const { STAT_LAYOUTS, addLayout } = await import('../lib/encyclopedia/stat-layouts.ts');
  assert.deepEqual(STAT_LAYOUTS.map(l => l.id), ['d20', 'pool', 'd100', '2d6']);
  for (const l of STAT_LAYOUTS) {
    let n = 0;
    const { fields, added, skipped } = addLayout([], l, () => `${l.id}-${n++}`);
    assert.equal(added, l.stats.length); assert.deepEqual(skipped, []);
    for (const f of fields) assert.ok(statFieldSchema.safeParse(f).success, `${l.name}: ${f.label}`);
    const values = Object.fromEntries(fields.map(f => [f.id, f.type === 'checkbox' ? true : f.type === 'number' ? 12 : null]));
    const sheet = sheetOf(fields, values);
    for (const f of fields) for (const r of statRolls(f)) {
      assert.equal(statRollPreview(r.formula, f.type, sheet).bad, false, `${l.name}: ${f.label} ${r.name}`);
      assert.ok(statRollDice(r.formula, values[f.id], sheet), `${l.name}: ${f.label} ${r.name} rolls`);
      if (r.success) assert.notEqual(rollOutcome(50, r.success, values[f.id], sheet), null);
    }
  }
  const d20 = STAT_LAYOUTS[0], pool = STAT_LAYOUTS[1];
  let n = 0; const first = addLayout([], d20, () => `a${n++}`).fields, sheet = sheetOf(first, { a0: 16, a4: 2, a5: true });
  assert.equal(statRollDice(statRolls(first[5])[0].formula, true, sheet), '1d20+5', 'Climbing, trained: Might mod 3 + Training bonus 2');
  assert.equal(statRollDice(statRolls(first[5])[0].formula, false, sheet), '1d20+3');
  // Adding another layout keeps the sheet and skips names already on it.
  const both = addLayout(first, pool, () => `b${n++}`);
  assert.deepEqual(both.skipped, ['Sneaking']); assert.equal(both.fields.length, first.length + pool.stats.length - 1);
  assert.equal(addLayout(both.fields, pool, () => 'x').added, 0);
  assert.equal(JSON.stringify(STAT_LAYOUTS).match(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|Sanity)\b/), null, 'generic names, not a rulebook\'s');
});

test('part 4: renaming a stat renames it inside other stats\' braces only', async () => {
  const { renameStatRefs } = await import('../lib/encyclopedia/stat-rolls.ts');
  const fields = [
    { label: 'Brawn', derived: 'floor(({value}-10)/2)', rolls: [{ name: 'Check', formula: '1d20+{Body mod}' }] },
    { label: 'Climb', rolls: [{ name: 'Roll', formula: '1d20+{body mod+Body armour}', success: { op: 'atLeast', against: '{Body}' } }] },
    { label: 'Body armour', derived: '{Body}+1' },
    { label: 'Plain', roll: 'd20' },
  ];
  const out = renameStatRefs(fields, 'Body', 'Brawn');
  assert.equal(out[0].rolls[0].formula, '1d20+{Brawn mod}');
  assert.equal(out[1].rolls[0].formula, '1d20+{Brawn mod+Body armour}', 'a longer name that starts the same is left');
  assert.equal(out[1].rolls[0].success.against, '{Brawn}');
  assert.equal(out[2].derived, '{Brawn}+1');
  assert.equal(out[3], fields[3], 'untouched stats stay the same object');
  assert.equal(renameStatRefs(fields, 'Body', 'Body'), fields);
});

test('stat descriptions: optional, kept to 2000 characters, and only for stats players can see', () => {
  const base = { id: 'f', label: 'Second wind', section: 'Features', type: 'none', options: [], visibility: 'players', archived: false };
  assert.equal(statFieldSchema.parse({ ...base, description: '  Once per rest, heal.  ' }).description, 'Once per rest, heal.');
  assert.equal(statFieldSchema.safeParse({ ...base, description: 'x'.repeat(2001) }).success, false);
  assert.equal(statFieldSchema.parse(base).description, undefined);
  const w = demoWorkspace(), c = w.campaigns[0], e = w.entries.find(x => x.id === 'demo-mara');
  c.statFields = [{ ...base, description: 'Once per rest, heal.', rolls: [{ name: 'Heal', formula: '1d10' }] }, { ...base, id: 'g', label: 'Secret', visibility: 'gm', description: 'GM eyes only' }];
  e.character = { role: 'npc', group: '', tags: [], location: '', faction: '', status: 'active', statsVisibility: 'players', statsByCampaign: {} };
  const pc = playerCampaign(workspaceSchema.parse(w), c.id);
  const stats = pc.entries.find(x => x.id === e.id).stats;
  assert.equal(stats.find(s => s.id === 'f').description, 'Once per rest, heal.');
  assert.equal(JSON.stringify(pc).includes('GM eyes only'), false);
});
