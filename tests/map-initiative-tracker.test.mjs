import test from 'node:test';
import assert from 'node:assert/strict';
import {newScene,newToken,sceneSchema} from '../lib/model.ts';
import {advanceInitiative,getCurrentInitiativeEntry,getInitiativeEntries,reorderInitiative,syncConditionRounds,conditionAge} from '../lib/initiative-tracker.ts';
import {initiativeSummary} from '../lib/initiative-summary.ts';
const fixture=()=>{const s=newScene();s.tokens=[{...newToken('Ada'),id:'a',initiative:20},{...newToken('Bat'),id:'b',initiative:10},{...newToken('Cat'),id:'c',initiative:5}];return s;};
test('turns wrap round, reverse, skip and stop at round one',()=>{
 const s=fixture();s.tokens[1].skipInitiative=true;
 advanceInitiative(s,1);assert.equal(s.initiativeState.currentId,'a');
 advanceInitiative(s,-1);assert.equal(s.initiativeState.currentId,'a');
 advanceInitiative(s,1);assert.equal(s.initiativeState.currentId,'c');
 advanceInitiative(s,1);assert.equal(s.initiativeState.round,2);
 advanceInitiative(s,-1);assert.equal(s.initiativeState.currentId,'c');assert.equal(s.initiativeState.round,1);
 s.tokens.forEach(t=>t.skipInitiative=true);advanceInitiative(s,1);assert.equal(s.initiativeState.currentId,null);assert.equal(s.initiativeState.round,1);
});
test('shared turns, unrolled entries and drag ordering survive schema parsing',()=>{
 const s=fixture();s.tokens[0].initiativeGroup='Swarm';s.tokens[1].initiativeGroup='Swarm';s.tokens.push({...newToken('Unrolled'),id:'d'});
 assert.equal(getInitiativeEntries(s).length,3);advanceInitiative(s,1);assert.equal(getCurrentInitiativeEntry(s).tokens.length,2);
 reorderInitiative(s,'c','group:Swarm');assert.deepEqual(getInitiativeEntries(s).map(e=>e.id),['c','group:Swarm','d']);
 assert.deepEqual(sceneSchema.parse(s).initiativeState,s.initiativeState);
});
test('condition timestamps distinguish additions, removals and unknown legacy ages',()=>{
 const s=fixture();s.tokens[0].conditions=['legacy'];const before=structuredClone(s);
 s.initiativeState={round:3,currentId:null,order:[]};s.tokens[0].conditions.push('new');syncConditionRounds(s,before);
 assert.equal(conditionAge(s.tokens[0],'legacy',5),null);assert.equal(conditionAge(s.tokens[0],'new',5),2);
 const previous=structuredClone(s);s.tokens[0].conditions=[];syncConditionRounds(s,previous);assert.equal(s.tokens[0].conditionRounds,undefined);
});
test('Discord includes current turn and condition age without hidden group names',()=>{
 const s=fixture();s.tokens[0].hidden=true;s.tokens[0].name='SECRET';s.tokens[0].initiativeGroup='SECRET GROUP';advanceInitiative(s,1);
 s.tokens[1].showDiscordConditions=true;s.tokens[1].conditions=['poison'];s.tokens[1].conditionRounds={poison:1};s.initiativeState.round=3;
 const content=initiativeSummary(s.name,s.tokens,[{id:'poison',name:'Poisoned',icon:'!',color:'#ff0000'}],s);
 assert.match(content,/Round 3 \| Current: Hidden turn/);assert.match(content,/Poisoned \(2 rounds\)/);assert.doesNotMatch(content,/SECRET/);
});
