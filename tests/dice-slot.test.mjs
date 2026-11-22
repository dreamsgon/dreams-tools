import test from 'node:test';
import assert from 'node:assert/strict';
import {diceSlotRef, diceSlotStore, rollsHere} from '../lib/dice-slot.ts';
import {diceDockBelow} from '../lib/dice-dock.ts';

test('dice buttons show on the pages people play from, not on home, account, guide or the campaign list',()=>{
  for(const path of ['/campaigns/e%3Ademo','/encyclopedia','/encyclopedia/player','/forum'])assert.equal(rollsHere(path),true,path);
  for(const path of ['/','/account','/campaigns','/guide','/guide/writing-wiki-pages','/join/abc','/agent',null])assert.equal(rollsHere(path),false,String(path));
});

test('the campaign bar slot registers and clears only itself',()=>{
  let calls=0;const stop=diceSlotStore.subscribe(()=>calls++);
  const a={id:'a'},b={id:'b'};
  const dropA=diceSlotRef(a);assert.equal(diceSlotStore.get(),a);
  const dropB=diceSlotRef(b);assert.equal(diceSlotStore.get(),b);
  dropA();assert.equal(diceSlotStore.get(),b,'an old bar going away leaves the new one');
  dropB();assert.equal(diceSlotStore.get(),null);
  assert.equal(diceSlotRef(null),undefined);
  assert.equal(calls,3);stop();
});

test('a tray opened from a top bar hangs below the button and keeps a usable height',()=>{
  const p=diceDockBelow({bottom:44,right:1300},1440,900);
  assert.equal(p.top,'52px');assert.equal(p.bottom,'auto');assert.equal(p.right,'140px');assert.equal(p['--dice-dock-space'],'836px');
  const q=diceDockBelow({bottom:850,right:1440},1440,900);
  assert.equal(q.right,'12px');assert.equal(q['--dice-dock-space'],'160px');
});
