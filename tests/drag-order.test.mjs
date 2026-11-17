import test from 'node:test';
import assert from 'node:assert/strict';
import {moveTo} from '../lib/encyclopedia/drag-order.ts';

const l=['a','b','c','d'].map(id=>({id}));
const ids=x=>x.map(y=>y.id).join('');

test('moveTo drops an item before or after another', () => {
 assert.equal(ids(moveTo(l,'a','c',false)),'bacd');
 assert.equal(ids(moveTo(l,'a','c',true)),'bcad');
 assert.equal(ids(moveTo(l,'d','a',false)),'dabc');
 assert.equal(ids(moveTo(l,'d','a',true)),'adbc');
 assert.equal(ids(moveTo(l,'b','b',true)),'abcd');
 assert.equal(ids(moveTo(l,'x','b',true)),'abcd');
 assert.equal(ids(moveTo(l,'b','x',true)),'abcd');
 assert.equal(ids(l),'abcd','does not mutate');
});
