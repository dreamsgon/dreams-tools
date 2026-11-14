import test from 'node:test';
import assert from 'node:assert/strict';
import {newToken,tokenSchema} from '../lib/model.ts';

test('tokens can link to an Encyclopedia character, and older tokens still load',()=>{
 const old=newToken('Mire hound');delete old.encyclopediaEntryId;
 assert.equal(tokenSchema.parse(old).encyclopediaEntryId,undefined);
 const linked=tokenSchema.parse({...old,encyclopediaEntryId:'entry-mire-hound'});
 assert.equal(linked.encyclopediaEntryId,'entry-mire-hound');
 assert.equal(structuredClone(linked).encyclopediaEntryId,'entry-mire-hound','placing a library token copies the link');
 assert.throws(()=>tokenSchema.parse({...old,encyclopediaEntryId:'x'.repeat(121)}));
});
