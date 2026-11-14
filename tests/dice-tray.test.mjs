import test from 'node:test';
import assert from 'node:assert/strict';
import {addDie,removeDie,cleanRollName,maxDicePerType} from '../lib/dice-tray.ts';
test('right-click removes one die the way left-click adds one',()=>{
  let c=addDie(addDie({},6),6);
  assert.deepEqual(c,{6:2});
  c=removeDie(c,6);
  assert.deepEqual(c,{6:1});
  c=removeDie(c,6);
  assert.deepEqual(c,{});
  assert.deepEqual(removeDie({},20),{},'removing a die that is not selected does nothing');
  assert.deepEqual(removeDie({6:1,8:2},8),{6:1,8:1},'other dice are kept');
});
test('adding dice stops at the per-type limit',()=>{
  assert.equal(addDie({4:maxDicePerType},4)[4],maxDicePerType);
});
test('roll names are trimmed and limited for the Discord card',()=>{
  assert.equal(cleanRollName('  Attack   on\ngoblin '),'Attack on goblin');
  assert.equal(cleanRollName('   '),'');
  assert.equal(cleanRollName('x'.repeat(300)).length,120);
});
