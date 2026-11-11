import test from 'node:test';
import assert from 'node:assert/strict';
import {countLabel} from '../lib/plural.ts';
test('count labels use the singular only for exactly one',()=>{
  assert.equal(countLabel(1,'token'),'1 token');
  assert.equal(countLabel(0,'token'),'0 tokens');
  assert.equal(countLabel(2,'effect'),'2 effects');
  assert.equal(countLabel(1,'entry','entries'),'1 entry');
  assert.equal(countLabel(3,'entry','entries'),'3 entries');
});
