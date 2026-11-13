import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign} from '../lib/encyclopedia/world-model.ts';
import {column,moveQuest,newQuest,nextStep,questProgress} from '../lib/encyclopedia/quests.ts';

const now='2026-11-12T00:00:00.000Z';
const quest=(id,state,extra={})=>({id,worldId:'demo-world',campaignId:'demo-campaign',parentId:null,title:id,kind:'quest',body:'',quest:{...newQuest(state),...extra},updatedAt:now});
function world(extra){const s=demoWorkspace();s.entries.push(...extra);return workspaceSchema.parse(s);}

test('quests are pages with a state, steps and a log', () => {
  const s=world([quest('bell','active',{objectives:[{id:'a',text:'Reach the chapel',done:true},{id:'b',text:'Find who rang the bell',done:false}]})]);
  const q=s.entries.find(e=>e.id==='bell').quest;
  assert.deepEqual(questProgress(q),{done:1,total:2});
  assert.equal(nextStep(q),'Find who rang the bell');
  const wrongKind={...s,entries:s.entries.map(e=>e.id==='demo-mara'?{...e,quest:newQuest()}:e)};
  assert.equal(workspaceSchema.safeParse(wrongKind).success,false);
});

test('moving a card changes its column and order', () => {
  let s=world([quest('a','active'),quest('b','active'),quest('c','rumour')]);
  s=moveQuest(s,'demo-world','demo-campaign','c','active','b','2026-11-13T00:00:00.000Z');
  assert.deepEqual(column(s,'demo-world','demo-campaign','active').map(q=>q.entry.id),['a','c','b']);
  assert.equal(column(s,'demo-world','demo-campaign','rumour').length,0);
  assert.equal(s.entries.find(e=>e.id==='c').updatedAt,'2026-11-13T00:00:00.000Z');
  s=moveQuest(s,'demo-world','demo-campaign','a','done',null);
  assert.deepEqual(column(s,'demo-world','demo-campaign','done').map(q=>q.entry.id),['a']);
  assert.equal(workspaceSchema.safeParse(s).success,true);
});

test('players get shared quests without hidden steps or GM-only log entries', () => {
  const s=world([
    {...quest('bell','active',{giverId:'demo-mara',objectives:[{id:'a',text:'Open step',done:false},{id:'b',text:'SECRET STEP',done:false,hidden:true}],log:[{id:'l1',at:now,text:'They saw lights',players:true},{id:'l2',at:now,text:'GM ONLY LOG',players:false}]}),overviewVisibility:'players'},
    quest('hidden-quest','active',{objectives:[{id:'x',text:'UNSHARED QUEST STEP',done:false}]}),
  ]);
  const p=playerCampaign(s,'demo-campaign'),text=JSON.stringify(p);
  const bell=p.entries.find(e=>e.id==='bell');
  assert.deepEqual(bell.quest.objectives.map(o=>o.text),['Open step']);
  assert.deepEqual(bell.quest.log.map(l=>l.text),['They saw lights']);
  assert(!text.includes('SECRET STEP'));assert(!text.includes('GM ONLY LOG'));assert(!text.includes('UNSHARED QUEST STEP'));
  // The giver is only named when players can read their page.
  const readable=p.entries.some(e=>e.id==='demo-mara');
  assert.equal(bell.quest.giverId,readable?'demo-mara':null);
});
