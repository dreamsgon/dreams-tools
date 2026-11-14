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

test('a campaign has Main, Side and Personal until it makes its own quest categories', async () => {
  const {questCategories,categoryOf,defaultCategory,setQuestCategories,removeQuestCategory}=await import('../lib/encyclopedia/quests.ts');
  let s=world([quest('bell','active',{type:'main'}),quest('kesh','active',{type:'personal'}),quest('barge','rumour')]);
  const campaign=()=>s.campaigns.find(c=>c.id==='demo-campaign');
  assert.deepEqual(questCategories(campaign()).map(c=>c.name),['Main','Side','Personal']);
  assert.equal(defaultCategory(questCategories(campaign())),'side');
  // Adding, renaming and reordering.
  s=workspaceSchema.parse(setQuestCategories(s,'demo-campaign',[{id:'order',name:'  Faction: the Order ',color:'gold'},...questCategories(campaign()).map(c=>c.id==='side'?{...c,name:'Errand'}:c)]));
  assert.deepEqual(questCategories(campaign()).map(c=>c.name),['Faction: the Order','Main','Errand','Personal']);
  s=workspaceSchema.parse(setQuestCategories(s,'demo-campaign',[...questCategories(campaign()),{id:'x',name:'   ',color:'teal'}]));
  assert.equal(questCategories(campaign()).length,4,'blank names are dropped');
  assert.equal(setQuestCategories(s,'demo-campaign',[{id:'a',name:'A',color:'teal'},{id:'a',name:'B',color:'teal'}]),s,'ids stay unique');
  // A quest can be in a custom category.
  s=workspaceSchema.parse({...s,entries:s.entries.map(e=>e.id==='barge'?{...e,quest:{...e.quest,type:'order'}}:e)});
  assert.equal(categoryOf(questCategories(campaign()),'order').name,'Faction: the Order');
  // Removing a category moves its quests.
  s=workspaceSchema.parse(removeQuestCategory(s,'demo-world','demo-campaign','main','personal',now));
  assert.equal(s.entries.find(e=>e.id==='bell').quest.type,'personal');
  assert.ok(!questCategories(campaign()).some(c=>c.id==='main'));
  assert.equal(removeQuestCategory(s,'demo-world','demo-campaign','order','main'),s,'quests only move to a category that is still there');
  let one=setQuestCategories(s,'demo-campaign',[{id:'only',name:'Only',color:'grey'}]);
  assert.equal(removeQuestCategory(one,'demo-world','demo-campaign','only','only'),one,'a campaign keeps one category');
  assert.equal(categoryOf(questCategories(campaign()),'gone').name,'Uncategorised');
  assert.equal(workspaceSchema.safeParse({...s,campaigns:s.campaigns.map(c=>c.id==='demo-campaign'?{...c,questCategories:[]}:c)}).success,false);
  assert.equal(workspaceSchema.safeParse({...s,campaigns:s.campaigns.map(c=>c.id==='demo-campaign'?{...c,questCategories:[{id:'a',name:'A',color:'blue'}]}:c)}).success,false);
});

test('players see the quest category name and colour, not its id', () => {
  let s=world([{...quest('barge','active',{type:'order'}),overviewVisibility:'players'}]);
  s={...s,campaigns:s.campaigns.map(c=>c.id==='demo-campaign'?{...c,questCategories:[{id:'order',name:'Faction: the Order',color:'gold'}]}:c)};
  const q=playerCampaign(workspaceSchema.parse(s),'demo-campaign').entries.find(e=>e.id==='barge').quest;
  assert.deepEqual(q.category,{name:'Faction: the Order',color:'gold'});
  const old=playerCampaign(world([{...quest('bell','active',{type:'main'}),overviewVisibility:'players'}]),'demo-campaign').entries.find(e=>e.id==='bell').quest;
  assert.deepEqual(old.category,{name:'Main',color:'accent'});
});

test('a quest category colour can be a named colour or any picked #rrggbb, and nothing else', async () => {
  const {questCategoriesSchema}=await import('../lib/encyclopedia/quests.ts');
  const ok=color=>questCategoriesSchema.safeParse([{id:'a',name:'A',color}]).success;
  assert(ok('gold')); assert(ok('#a1b2c3')); assert(ok('#A1B2C3'));
  for(const bad of ['crimson','#abc','#a1b2c3d','a1b2c3','red;x:y']) assert(!ok(bad),bad);
});

test('a goal reads as a sentence from its verb, target and second part', async () => {
  const {goalText,setGoalParts,whereLabel}=await import('../lib/encyclopedia/quests.ts');
  const titles={mill:'the Old Mill',arin:'Arin Vale'},title=id=>titles[id];
  let g={id:'g',text:'Find',done:false,verb:'Find'};
  g=setGoalParts(g,{targetId:'arin',target:'Arin Vale'},title);
  assert.equal(g.text,'Find Arin Vale');
  g=setGoalParts(g,{whereId:'mill',where:'the Old Mill'},title);
  assert.equal(g.text,'Find Arin Vale, last seen at the Old Mill');
  // A renamed page reads with its new name.
  titles.arin='Brother Arin';
  assert.equal(goalText(g,title),'Find Brother Arin, last seen at the Old Mill');
  // The verb's own words lead into the second part; a word of the GM's own gets "at".
  assert.equal(setGoalParts(g,{verb:'Deliver'},title).text,'Deliver Brother Arin, to the Old Mill');
  assert.equal(whereLabel({verb:'Bribe'}),'at');
  assert.equal(whereLabel({verb:'Bribe',whereLabel:'behind'}),'behind');
  // Clearing a part removes it, and a typed name needs no page.
  g=setGoalParts(g,{whereId:null,where:undefined,targetId:null,target:'the chapel bell'},title);
  assert.equal(g.text,'Find the chapel bell');
  assert(!('whereId' in g)&&!('targetId' in g));
  // A goal written by hand keeps its words.
  assert.equal(goalText({id:'h',text:'Survive the night',done:false}),'Survive the night');
});

test('goal status: done, failed and dropped, and dropped goals leave the count', async () => {
  const {goalStatus,withGoalStatus}=await import('../lib/encyclopedia/quests.ts');
  const g={id:'g',text:'Find Arin',done:false};
  assert.equal(goalStatus(g),'todo');
  assert.deepEqual(withGoalStatus(g,'done'),{...g,done:true});
  const failed=withGoalStatus(withGoalStatus(g,'done'),'failed');
  assert.equal(failed.done,false);assert.equal(goalStatus(failed),'failed');
  assert(!('status' in withGoalStatus(failed,'todo')));
  const q={...newQuest(),objectives:[{id:'a',text:'A',done:true},{id:'b',text:'B',done:false,status:'failed'},{id:'c',text:'C',done:false,status:'dropped'},{id:'d',text:'D',done:false}]};
  assert.deepEqual(questProgress(q),{done:1,total:3});
  assert.equal(nextStep(q),'D');
  // Saved quests from before goals had parts still load, and new goals save.
  const s=world([quest('bell','active',q)]);
  assert.equal(s.entries.find(e=>e.id==='bell').quest.objectives.length,4);
  assert.equal(workspaceSchema.safeParse({...s,entries:s.entries.map(e=>e.id==='bell'?{...e,quest:{...e.quest,objectives:[{id:'x',text:'X',done:false,status:'lost'}]}}:e)}).success,false);
});

test('a goal can only point at pages in its campaign, and players only get links to pages they can read', () => {
  const secret={id:'secret-npc',worldId:'demo-world',campaignId:'demo-campaign',parentId:null,title:'The Drowned Choir',kind:'character',body:'',updatedAt:now};
  const goal={id:'g',text:'Rescue Arin, held at the Drowned Choir',done:false,verb:'Rescue',target:'Arin',targetId:'demo-mara',where:'The Drowned Choir',whereId:'secret-npc',note:'Start at the lake'};
  const s=world([secret,{...quest('bell','active',{objectives:[goal]}),overviewVisibility:'players'}]);
  const p=playerCampaign(s,'demo-campaign'),o=p.entries.find(e=>e.id==='bell').quest.objectives[0];
  assert.equal(o.verb,'Rescue');assert.equal(o.whereLabel,'held at');assert.equal(o.status,'todo');assert.equal(o.note,'Start at the lake');
  assert.equal(o.whereId,null,'the GM-only page is not linked');
  assert.equal(o.targetId,p.entries.some(e=>e.id==='demo-mara')?'demo-mara':null);
  const elsewhere={...s,entries:[...s.entries,{id:'far',worldId:'demo-world',campaignId:'demo-campaign-two',parentId:null,title:'Far',kind:'place',body:'',updatedAt:now}]};
  const pointing={...elsewhere,entries:elsewhere.entries.map(e=>e.id==='bell'?{...e,quest:{...e.quest,objectives:[{...goal,whereId:'far'}]}}:e)};
  assert.equal(workspaceSchema.safeParse(elsewhere).success,true);
  assert.equal(workspaceSchema.safeParse(pointing).success,false);
});
