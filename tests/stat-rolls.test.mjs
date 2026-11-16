import test from 'node:test';
import assert from 'node:assert/strict';
import {statRolls,statRollDice,statRollHint,statRollPreview,firstStatRoll,placeStat} from '../lib/encyclopedia/stat-rolls.ts';
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
 assert.equal(statRollDice('1d20+{value}',true),null);
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

test('named rolls and no-value stats save, export, roll from stores and stay off player pages',()=>{
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
 assert.ok(!mara.stats.some(x=>x.id==='push'),'a stat with no value is not a blank line for players');
});
