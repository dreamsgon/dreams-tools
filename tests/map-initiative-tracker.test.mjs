import test from 'node:test';
import assert from 'node:assert/strict';
import {newScene,newToken,sceneSchema} from '../lib/model.ts';
import {advanceInitiative,getCurrentInitiativeEntry,getInitiativeEntries,reorderInitiative,setTokenInitiativeGroup,renameInitiativeGroup,syncConditionRounds,conditionAge} from '../lib/initiative-tracker.ts';
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
test('joining and leaving a group keeps order and currentId valid',()=>{
 const s=fixture();s.initiativeState={round:1,currentId:'b',order:['c','a','b']};
 setTokenInitiativeGroup(s,'b','  Swarm ');assert.equal(s.tokens[1].initiativeGroup,'Swarm');
 assert.deepEqual(s.initiativeState.order,['c','a','group:Swarm']);assert.equal(s.initiativeState.currentId,'group:Swarm');
 setTokenInitiativeGroup(s,'a','Swarm');assert.deepEqual(s.initiativeState.order,['c','group:Swarm']);
 setTokenInitiativeGroup(s,'b','');assert.equal(s.tokens[1].initiativeGroup,undefined);
 assert.deepEqual(getInitiativeEntries(s).map(e=>e.id).sort(),['b','c','group:Swarm']);
 for(const id of s.initiativeState.order)assert.ok(getInitiativeEntries(s).some(e=>e.id===id));
 setTokenInitiativeGroup(s,'a',undefined);setTokenInitiativeGroup(s,'b','Solo');setTokenInitiativeGroup(s,'b',undefined);
 assert.equal(getInitiativeEntries(s).length,3);
});
test('leaving the last member drops the group and moves currentId to the token',()=>{
 const s=fixture();setTokenInitiativeGroup(s,'a','G');s.initiativeState={round:1,currentId:'group:G',order:['group:G','b','c']};
 setTokenInitiativeGroup(s,'a',undefined);
 assert.deepEqual(s.initiativeState.order,['a','b','c']);assert.equal(s.initiativeState.currentId,'a');
});
test('renaming a group maps order and currentId, and merges into an existing group',()=>{
 const s=fixture();s.tokens[0].initiativeGroup='Old';s.tokens[1].initiativeGroup='Old';
 s.initiativeState={round:1,currentId:'group:Old',order:['c','group:Old']};
 renameInitiativeGroup(s,'Old','New');
 assert.deepEqual(s.tokens.map(t=>t.initiativeGroup),['New','New',undefined]);
 assert.deepEqual(s.initiativeState.order,['c','group:New']);assert.equal(s.initiativeState.currentId,'group:New');
 s.tokens[2].initiativeGroup='Other';s.initiativeState.order=['group:Other','group:New'];
 renameInitiativeGroup(s,'New','Other');
 assert.deepEqual(s.tokens.map(t=>t.initiativeGroup),['Other','Other','Other']);
 assert.deepEqual(s.initiativeState.order,['group:Other']);assert.equal(s.initiativeState.currentId,'group:Other');
});
