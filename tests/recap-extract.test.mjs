import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {newQuest} from '../lib/encyclopedia/quests.ts';
import {draftRecap,findItems} from '../lib/encyclopedia/recaps.ts';
import {cleanExtract,depthFor,extractKinds,extractNotes,highlightAsks,honourExtract,isOn,offAtFirst,partsOff,turnKind,whereOf,setWhere,inEncyclopedia,inFile,recapIn} from '../lib/encyclopedia/recap-extract.ts';
import {rpExportFiles,sessionFile} from '../lib/encyclopedia/rp-export.ts';
import {addFinds} from '../lib/encyclopedia/recaps.ts';
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
 assert.deepEqual(offAtFirst,['spotlights','encounters','creatures','dates']);
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
 assert.deepEqual(partsOff({off:['people','places','orgs','lore','codex','items','ties','gmNotes']}),['found','gmNotes']);
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

test('items, creatures, relationships and the in-world date wait in the check list and do their change',async()=>{
 const {applyItem,matchTieKind}=await import('../lib/encyclopedia/recaps.ts');
 const {builtInTieTypes}=await import('../lib/encyclopedia/ties.ts');
 assert.deepEqual(matchTieKind(builtInTieTypes,'Ally of'),{typeId:'ally',reversed:false,known:true});
 assert.deepEqual(matchTieKind(builtInTieTypes,'student of'),{typeId:'mentor',reversed:true,known:true});
 assert.equal(matchTieKind(builtInTieTypes,'Haunts').typeId,'linked');
 const ai={found:[{name:'Bog Hag',kind:'creature',text:'A marsh witch.'},{name:'Mire Toad',kind:'creature',text:'Huge.'}],loot:[{item:'Silver clapper',who:'Ostra Hale',note:'From the bell.'},{item:'Gold coins',who:'party',qty:40}],ties:[{from:'Ostra Hale',to:'Brother Halden',kind:'Owes a debt to',note:'For the ferry.'}],gameDate:{day:3,month:'nope',year:1}};
 let {w,c}=world();
 let items=findItems(w,c,ai);
 assert.deepEqual(items.map(r=>r.kind),['loot','loot','tie'],'creatures and dates start off');
 ({w,c}=world({on:['creatures','dates'],off:['ties']}));
 const {makeCalendar,calendarTemplates}=await import('../lib/encyclopedia/calendar-templates.ts');
 c.calendars=[makeCalendar(calendarTemplates[0].id)];
 const cal=c.calendars[0];
 ai.gameDate={day:2,month:'alturiak',year:1492};
 items=findItems(w,c,ai);
 assert.deepEqual(items.map(r=>`${r.kind}:${r.pageKind??''}`),['update:','newPage:creature','loot:','loot:','date:'],'Bog Hag has a page, so it is an update');
 assert.equal(items.find(r=>r.name==='Gold coins').pageId,undefined,'the party: the GM chooses who carries it');
 // Doing them
 const s={id:'s13',worldId:c.worldId,campaignId:C,parentId:null,title:'Session 13',kind:'session',body:'',recap:{status:'draft',timeline:[],quotes:[],gmNotes:'',review:[...items,...findItems(world().w,world().c,{ties:ai.ties})]},updatedAt:NOW.toISOString()};
 w.entries.push(s,{id:'halden',worldId:c.worldId,campaignId:C,parentId:null,title:'Brother Halden',kind:'character',body:'',character:{role:'npc',group:'',tags:[],location:'',faction:'',status:'active',statsVisibility:'gm',statsByCampaign:{}},updatedAt:NOW.toISOString()});
 const ostra=w.entries.find(e=>e.id==='ostra');ostra.character={role:'pc',group:'',tags:[],location:'',faction:'',status:'active',statsVisibility:'gm',statsByCampaign:{}};
 const by=k=>s.recap.review.find(r=>r.kind===k&&(k!=='loot'||r.pageId));
 let r=applyItem(w,'s13',items[1].id,NOW);
 assert.equal(r.next.entries.at(-1).character.role,'creature');assert.match(r.message,/creature page “Mire Toad”, GM only/);
 r=applyItem(r.next,'s13',by('loot').id,NOW);
 assert.deepEqual(r.next.entries.find(e=>e.id==='ostra').character.inventory.items.map(i=>[i.name,i.qty,i.note]),[['Silver clapper',1,'From the bell.']]);
 assert.throws(()=>applyItem(r.next,'s13',s.recap.review.find(x=>x.name==='Gold coins').id,NOW),/Choose who carries/);
 r=applyItem(r.next,'s13',by('tie').id,NOW);
 assert.deepEqual(r.next.entries.find(e=>e.id==='ostra').ties.map(t=>[t.toId,t.typeId,t.note,t.gm]),[['halden','debt','For the ferry.',true]]);
 assert.match(r.message,/Tied Ostra Hale to Brother Halden: Owes a debt to, GM only/);
 r=applyItem(r.next,'s13',by('date').id,NOW);const k=r.next.campaigns.find(x=>x.id===C).calendars[0];assert.deepEqual(k.current,{year:1492,periodId:'alturiak',day:2});assert.ok(k.events.some(e=>e.title==='Session 13'&&e.visibility==='gm'));assert.match(r.message,/Moved .* on to 2 Alturiak/);
});

test('where each kind goes: the Encyclopedia, the session file, or both',()=>{
 assert.equal(whereOf(undefined,'timeline'),'both','session page kinds start in both, as the session file always had them');
 assert.equal(whereOf(undefined,'people'),'enc','pages start in the Encyclopedia only');
 let x=setWhere({},'moments','file');x=setWhere(x,'people','both');x=setWhere(x,'timeline','both');
 assert.deepEqual(x.where,{moments:'file',people:'both'},'only what differs is kept');
 assert.deepEqual(cleanExtract(x),{where:{moments:'file',people:'both'}});
 assert.equal(cleanExtract(setWhere(x,'moments','both')).where.moments,undefined);
 assert.ok(aiWritingSchema.safeParse({extract:{where:{quotes:'enc'}}}).success);
 assert.equal(aiWritingSchema.safeParse({extract:{where:{quotes:'drawer'}}}).success,false);
 assert.deepEqual([inEncyclopedia(x,'moments'),inFile(x,'moments'),inEncyclopedia(x,'people'),inFile(x,'people')],[false,true,true,true]);

 const ai={title:'Session 13',recap:'We went to the chapel.',timeline:[{title:'Arrival'}],quotes:[{text:'Pay twice.',who:'Tobin'}],gmNotes:'The hag lies.',moments:['Tobin reveals the toll is a debt.'],partyStatus:'At the chapel.',next:['Return the ledger.'],threads:['Who wrote the name?'],...finds,playedOn:'2026-11-12'};
 const extract={where:{moments:'file',quotes:'enc',places:'file',people:'both'}};
 const {w,c}=world(extract);
 const page=draftRecap(w,c,ai,{by:'AI',now:NOW});
 const state=n=>page.recap.review.find(r=>r.name===n)?.state;
 assert.equal(state('The Drowned Chapel'),'filed','a place set to Session file never waits in the check list');
 assert.equal(state('Brother Halden'),'open');
 assert.equal(state('The Greyfen Herald'),'open');
 // The page shows what goes to the Encyclopedia; players get the same.
 const shown=recapIn(page.recap,extract,'enc');
 assert.deepEqual(shown.moments,[]);assert.equal(shown.quotes.length,1);
 assert.deepEqual(playerRecapTabs({...page.recap,status:'published',shareMoments:true,shareQuotes:true},s=>s,extract).map(t=>t.title),['Quotes'],'a part only in the session file is not shared');
 // Brother Halden is added, so he is in the file's finds; the chapel is there as filed.
 page.recap.review=page.recap.review.map(r=>r.name==='Brother Halden'?{...r,state:'done'}:r);
 page.overviewVisibility='players';page.recap.status='published';page.recap.shareMoments=true;
 w.entries.push(page);
 const files=rpExportFiles(w,C,{includeGm:true,exportedAt:NOW.toISOString()});
 const pub=files.find(f=>f.path.startsWith('2-Story/Sessions/')&&f.text.includes(`rpg-tools-id: ${page.id}`)),gm=files.find(f=>f.path.startsWith('6-GM-Only/2-Story/Sessions/')&&f.text.includes(`rpg-tools-id: ${page.id}`));
 assert.ok(pub&&gm);
 assert.equal(pub.path,'2-Story/Sessions/2026-11-12-Session-13.md');
 assert.match(pub.text,/## Recap key moments\n\n- Tobin reveals the toll is a debt\./,'shared key moments are player-visible');
 assert.doesNotMatch(pub.text+gm.text,/Recap quotes|Pay twice/,'quotes set to the Encyclopedia only stay out of the file');
 assert.match(gm.text,/## Recap next time\n\n### Party status\nAt the chapel\./);
 assert.match(gm.text,/## Recap finds\n\n- People: Brother Halden - A lantern-keeper\.\n- Places: The Drowned Chapel - Under the marsh\./);
 assert.doesNotMatch(gm.text,/Greyfen Herald.*\n.*## Recap finds/,'organizations only go to the Encyclopedia');
 const one=sessionFile(w,C,page.id,{includeGm:true,exportedAt:NOW.toISOString()});
 assert.equal(one.path,'2026-11-12-Session-13.md');
 assert.match(one.text,/## Recap key moments[\s\S]*## GM only[\s\S]*### Recap next time[\s\S]*### Recap finds/);
 assert.doesNotMatch(sessionFile(w,C,page.id,{includeGm:false,exportedAt:NOW.toISOString()}).text,/GM only|The hag lies/);
 // Check it with AI doesn't add the chapel again while it is filed.
 const again=addFinds(w,c,page,{found:[{name:'The Drowned Chapel',kind:'place',text:'Again.'}]});
 assert.deepEqual(again.added,[]);
});
