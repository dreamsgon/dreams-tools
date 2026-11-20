import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {newQuest} from '../lib/encyclopedia/quests.ts';
import {draftRecap,findItems} from '../lib/encyclopedia/recaps.ts';
import {cleanExtract,depthFor,extractKinds,extractNotes,highlightAsks,honourExtract,isOn,offAtFirst,partsOff,turnKind} from '../lib/encyclopedia/recap-extract.ts';
import {aiWritingSchema,saveExtract} from '../lib/encyclopedia/ai-styles.ts';
import {checkPrompt,notesPrompt} from '../lib/encyclopedia/recap-prompts.ts';
import {momentsMarkdown,nextMarkdown,playerRecapTabs} from '../lib/encyclopedia/recap-schema.ts';

const C='demo-campaign',NOW=new Date('2026-11-13T10:00:00Z');
function world(extract){
 const w=demoWorkspace(),at=NOW.toISOString(),c=w.campaigns.find(x=>x.id===C);
 c.aiWriting={...c.aiWriting,...(extract?{extract}:{})};
 const quest={...newQuest('active','side'),objectives:[{id:'o1',text:'Reach the chapel',done:false}]};
 w.entries.push(
  {id:'ostra',worldId:c.worldId,campaignId:C,parentId:null,title:'Ostra Hale',kind:'character',body:'',updatedAt:at},
  {id:'lights',worldId:c.worldId,campaignId:C,parentId:null,title:'Lights on the marsh',kind:'quest',body:'',quest,updatedAt:at},
  {id:'hag',worldId:c.worldId,campaignId:C,parentId:null,title:'Bog Hag',kind:'lore',body:'',codex:{category:'Bestiary',summary:'A marsh witch.',found:{}},updatedAt:at},
 );
 return {w,c};
}
const finds={
 found:[{name:'Brother Halden',kind:'character',text:'A lantern-keeper.'},{name:'The Greyfen Herald',kind:'faction',text:'A news-sheet.'},{name:'The Drowned Chapel',kind:'place',text:'Under the marsh.'},{name:'The first bell',kind:'lore',text:'Rang once.'}],
 quests:[{quest:'Lights on the marsh',log:'Ostra names a price.'},{quest:'The chapel bell',log:'The hag wants the bell.'}],
 codex:[{page:'Bog Hag'}],
};

test('a fresh campaign pulls out everything, at Balanced, and stores nothing',()=>{
 for(const k of extractKinds)assert.equal(isOn(undefined,k),!offAtFirst.includes(k),k);
 assert.deepEqual(offAtFirst,['spotlights','encounters']);
 assert.equal(depthFor(undefined),'balanced');
 assert.equal(cleanExtract({depth:'balanced',off:[]}),undefined);
 assert.deepEqual(saveExtract({chat:{length:'detailed'}},{depth:'balanced'}),{chat:{length:'detailed'}});
 assert.deepEqual(saveExtract(undefined,{depth:'main',off:['quotes','orgs','quotes']}),{extract:{depth:'main',off:['quotes','orgs']}});
 assert.ok(aiWritingSchema.safeParse({extract:{off:['people']}}).success);
 assert.equal(aiWritingSchema.safeParse({extract:{off:['dragons']}}).success,false);
 assert.deepEqual(extractNotes(undefined),[]);
});

test('kinds turned off are dropped from what the AI found, and quest moves are told from new quests',()=>{
 const all=findItems(world().w,world().c,finds);
 assert.equal(all.length,7);
 const {w,c}=world({off:['orgs','lore','rumours','codex']});
 const some=findItems(w,c,finds);
 assert.deepEqual(some.map(r=>`${r.kind}:${r.name}`),['newPage:Brother Halden','newPage:The Drowned Chapel','questLog:Lights on the marsh']);
 const {w:w2,c:c2}=world({off:['quests']});
 assert.deepEqual(findItems(w2,c2,{quests:finds.quests}).map(r=>r.kind),['newQuest']);
});

test('a draft leaves out the timeline, quotes and GM notes when they are off',()=>{
 const {w,c}=world({off:['timeline','quotes','gmNotes','people']});
 const page=draftRecap(w,c,{title:'Session 13',recap:'We reached Greyfen.',gmNotes:'Halden lies.',timeline:[{title:'Arrival'}],quotes:[{text:'Pay the toll.'}],found:finds.found},{by:'AI',now:NOW});
 assert.equal(page.body,'We reached Greyfen.');
 assert.deepEqual([page.recap.timeline,page.recap.quotes,page.recap.gmNotes],[[],[],'']);
 assert.ok(!page.recap.review.some(r=>r.name==='Brother Halden'));
 assert.equal(page.recap.review.length,3);
 assert.deepEqual(honourExtract({found:[{kind:'character'}]},undefined),{found:[{kind:'character'}]},'nothing off: untouched');
});

test('the New session recap dialog starts from the campaign settings',()=>{
 assert.deepEqual(partsOff({off:['people','places','orgs','lore','codex','gmNotes']}),['found','gmNotes']);
 assert.deepEqual(partsOff({off:['quests']}),[],'new quests still come');
 assert.deepEqual(partsOff({off:['quests','rumours','timeline']}),['timeline','quests']);
 assert.equal(depthFor({depth:'everything'}),'everything');
 assert.equal(depthFor({depth:'everything'},{depth:'main'}),'main','one session can ask for less');
});

test('the AI is told what is off, and the timeline is still asked for when the recap is written from it',()=>{
 const extract={off:['timeline','orgs']};
 const notes=notesPrompt({campaign:'The Salt Road',title:'Session 13',request:{length:'standard',depth:'balanced',at:''},names:'',quests:'',transcript:'GM: Hi.',extract});
 assert.match(notes,/turned these off in What it pulls out, so leave them out and send them empty: organizations \(factions\)\./);
 assert.match(notes,/- timeline:/);
 const check=checkPrompt({campaign:'The Salt Road',title:'Session 13',names:'',quests:'',recap:'We went.',extract});
 assert.match(check,/the timeline, organizations \(factions\)/);
 assert.doesNotMatch(checkPrompt({campaign:'X',title:'Y',names:'',quests:'',recap:'Z'}),/turned these off/);
});

test('kinds that start off are turned on with on, and the rest off with off',()=>{
 let x=turnKind({},'spotlights',true);
 assert.ok(isOn(x,'spotlights'));assert.deepEqual(cleanExtract(x),{on:['spotlights']});
 x=turnKind(x,'moments',false);assert.equal(isOn(x,'moments'),false);
 x=turnKind(x,'spotlights',false);assert.deepEqual(cleanExtract(x),{off:['moments']});
 assert.equal(isOn({on:['encounters'],off:['encounters']},'encounters'),false,'off wins');
 assert.deepEqual(extractNotes({}),[],'kinds that start off are never said to be off');
});

test('highlights and For next time are asked for when on, kept on the recap, and dropped when off',()=>{
 assert.deepEqual(highlightAsks(undefined).map(l=>l.split(':')[0]),['- moments','- partyStatus','- threads']);
 assert.equal(highlightAsks({on:['spotlights','encounters'],off:['moments','next','threads']}).length,2);
 const ai={title:'Session 13',recap:'We went.',timeline:[{title:'Arrival'}],moments:['Tobin reveals the toll is a debt.',' '],spotlights:[{who:'Bram',text:'Held the door.'}],encounters:[{name:'The ford',outcome:'Won, barely'}],partyStatus:'At the chapel, two hurt.',next:['Return the ledger.'],threads:['Who wrote Ostra’s name last?']};
 let {w,c}=world();
 let page=draftRecap(w,c,ai,{by:'AI',now:NOW});
 assert.deepEqual(page.recap.moments,['Tobin reveals the toll is a debt.']);
 assert.deepEqual([page.recap.spotlights,page.recap.encounters],[[],[]],'spotlights and encounters start off');
 assert.equal(page.recap.partyStatus,'At the chapel, two hurt.');
 assert.equal(nextMarkdown(page.recap),'### Party status\nAt the chapel, two hurt.\n\n### Next steps\n- Return the ledger.\n\n### Loose threads\n- Who wrote Ostra’s name last?');
 assert.equal(momentsMarkdown(page.recap),'- Tobin reveals the toll is a debt.','one section needs no heading');
 ({w,c}=world({on:['spotlights','encounters'],off:['next']}));
 page=draftRecap(w,c,ai,{by:'AI',now:NOW});
 assert.match(momentsMarkdown(page.recap),/### Character spotlights\n- \*\*Bram:\*\* Held the door\.\n\n### Encounters\n- \*\*The ford\*\*: Won, barely/);
 assert.equal(page.recap.partyStatus,undefined);assert.deepEqual(page.recap.next,[]);
 assert.deepEqual(playerRecapTabs({...page.recap,status:'published'},s=>s),[],'not shared until the GM shares it');
 assert.deepEqual(playerRecapTabs({...page.recap,status:'published',shareMoments:true},s=>s).map(t=>t.title),['Key moments']);
});
