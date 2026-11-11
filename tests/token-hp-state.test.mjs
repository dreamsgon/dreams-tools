import test from 'node:test';
import assert from 'node:assert/strict';
import {newToken, initialWorkspace, newScene, tokenSchema} from '../lib/model.ts';
import {applyZeroHpState, applyWorkspaceHpStates} from '../lib/token-hp-state.ts';

const token = changes => ({...newToken('Hero'), ...changes});
const change = (previous, changes) => {const next={...previous,...changes}; applyZeroHpState(previous,next); return next;};

test('legacy and disabled tokens retain manual status when HP reaches zero',()=>{
 for(const policy of [undefined,'off']) {
  const before=token({hp:5,status:'active',zeroHpStatus:policy});
  assert.equal(change(before,{hp:0}).status,'active');
 }
 assert.throws(()=>tokenSchema.parse(token({zeroHpStatus:'active'})));
});

test('each enabled policy triggers on damage to zero and fresh zero-HP tokens',()=>{
 for(const policy of ['unconscious','dead']) {
  const before=token({hp:5,status:'active',zeroHpStatus:policy});
  assert.equal(change(before,{hp:0}).status,policy);
  assert.equal(before.status,'active');
  const fresh=token({hp:0,status:'active',zeroHpStatus:policy});
  applyZeroHpState(undefined,fresh);
  assert.equal(fresh.status,policy);
 }
});

test('enabling or changing policy at zero applies it, disabling preserves current status',()=>{
 const before=token({hp:0,status:'active'});
 assert.equal(change(before,{zeroHpStatus:'unconscious'}).status,'unconscious');
 const down={...before,zeroHpStatus:'unconscious',status:'unconscious'};
 assert.equal(change(down,{zeroHpStatus:'dead'}).status,'dead');
 assert.equal(change(down,{zeroHpStatus:'off'}).status,'unconscious');
 assert.equal(change(token({hp:5,status:'active'}),{zeroHpStatus:'dead'}).status,'active');
});

test('manual overrides and unrelated changes at zero persist; healing does not revive dead tokens',()=>{
 const before=token({hp:0,status:'dead',zeroHpStatus:'dead'});
 assert.equal(change(before,{status:'active'}).status,'active');
 assert.equal(change(before,{name:'Renamed',x:123}).status,'dead');
 assert.equal(change(before,{hp:5}).status,'dead');
 const active=change(before,{status:'active'});
 assert.equal(change(active,{name:'Moved',x:123}).status,'active');
 assert.equal(change({...active,hp:3},{hp:0}).status,'dead');
});

test('workspace processing matches token IDs within each scene and library',()=>{
 const before=initialWorkspace();
 before.scenes[0].tokens=[token({id:'same',hp:5,zeroHpStatus:'dead'})];
 before.scenes.push({...newScene('Second'),tokens:[token({id:'same',hp:0,status:'active',zeroHpStatus:'unconscious'})]});
 before.tokenLibrary=[token({id:'same',hp:5,zeroHpStatus:'unconscious'})];
 const next=structuredClone(before);
 next.scenes[0].tokens[0].hp=0;
 next.tokenLibrary[0].hp=0;
 next.scenes.push({...newScene('New'),tokens:[token({hp:0,zeroHpStatus:'dead'})]});
 applyWorkspaceHpStates(before,next);
 assert.equal(next.scenes[0].tokens[0].status,'dead');
 assert.equal(next.scenes[1].tokens[0].status,'active');
 assert.equal(next.scenes[2].tokens[0].status,'dead');
 assert.equal(next.tokenLibrary[0].status,'unconscious');
 assert.equal(before.scenes[0].tokens[0].hp,5);
});

test('healing clears unconscious regardless of zero HP policy, but preserves dead and explicit changes',()=>{
 for (const zeroHpStatus of ['off','unconscious','dead',undefined]) {
  const before=token({hp:0,status:'unconscious',zeroHpStatus});
  assert.equal(change(before,{hp:1}).status,'active');
  assert.equal(change(before,{name:'Renamed'}).status,'unconscious');
  assert.equal(change(before,{hp:1,status:'dead'}).status,'dead');
  assert.equal(change({...before,status:'dead'},{hp:1}).status,'dead');
 }
 assert.equal(change(token({hp:3,status:'unconscious'}),{hp:4}).status,'active');
 assert.equal(change(token({hp:3,status:'unconscious'}),{hp:2}).status,'unconscious');
});
