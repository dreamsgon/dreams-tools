import test from 'node:test';
import assert from 'node:assert/strict';
import {diceDockPosition} from '../lib/dice-dock.ts';
test('dice dock sits above the tool bar and aligns with its right edge',()=>{
  const p=diceDockPosition({top:700,right:1000},1280,800);
  assert.equal(p.bottom,'108px');
  assert.equal(p.right,'280px');
  assert.equal(p['--dice-dock-space'],'680px');
});
test('dice dock keeps a margin from the viewport edges and a usable height',()=>{
  const p=diceDockPosition({top:120,right:1280},1280,800);
  assert.equal(p.right,'12px');
  assert.equal(p['--dice-dock-space'],'160px');
  assert.equal(diceDockPosition({top:900,right:10},20,800).bottom,'12px');
});
