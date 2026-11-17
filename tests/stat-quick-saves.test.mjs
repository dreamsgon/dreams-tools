import test from 'node:test';
import assert from 'node:assert/strict';
import {statFieldSchema} from '../lib/encyclopedia/world-model.ts';
import {sheetRolls,sheetOf,statRows,saveKey,modKey,statRollDice} from '../lib/encyclopedia/stat-rolls.ts';
import {initiativeStat} from '../lib/encyclopedia/stat-scores.ts';

const box=(id,label,extra={})=>({id,label,section:'Abilities',type:'number',options:[],visibility:'players',archived:false,look:'score',...extra});
const dex=box('dex','Dexterity',{save:true}),str=box('str','Strength');
const values={dex:20,[modKey('dex')]:5,str:8,[modKey('str')]:-1};

test('a score box with no rolls of its own rolls a Check of d20 + its modifier', () => {
  const sheet=sheetOf([dex,str],values);
  assert.deepEqual(sheetRolls(str,values,sheet).map(r=>r.name),['Check']);
  assert.equal(statRollDice(sheetRolls(str,values,sheet)[0].formula,8,sheet),'1d20-1');
  const own={...str,rolls:[{name:'Athletics',formula:'1d20+{value}'}]};
  assert.deepEqual(sheetRolls(own,values,sheet).map(r=>r.name),['Athletics']);
});

test('a save uses the typed bonus, else the modifier, and rows carry it', () => {
  let rows=statRows([dex,str],values);
  const d=rows.find(r=>r.id==='dex');
  assert.equal(d.save,5);
  assert.deepEqual(d.rolls.map(r=>[r.name,r.dice]),[['Check','1d20+5'],['Save','1d20+5']]);
  rows=statRows([dex,str],{...values,[saveKey('dex')]:8});
  assert.equal(rows.find(r=>r.id==='dex').rolls[1].dice,'1d20+8');
  assert.equal(rows.find(r=>r.id==='str').save,undefined);
});

test('Initiative for Quick rolls from Dexterity when there is one, else its own value', () => {
  const i=initiativeStat([dex,str],'init');
  assert.equal(i.quick,true);
  assert.equal(i.type,'none');
  assert.equal(statRows([dex,str,i],values).find(r=>r.id==='init').rolls[0].dice,'1d20+5');
  assert.equal(statRows([dex,str,i],values).find(r=>r.id==='init').quick,true);
  const plain=initiativeStat([str],'init');
  assert.equal(plain.type,'number');
  assert.equal(plain.rolls[0].formula,'1d20+{value}');
  assert.equal(initiativeStat([str,{...plain}],'x'),null);
  assert.ok(statFieldSchema.safeParse(i).success);
  assert.ok(statFieldSchema.safeParse(dex).success);
});

