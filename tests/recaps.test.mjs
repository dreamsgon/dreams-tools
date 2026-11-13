import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace,campaignExport,playerCampaign,workspaceSchema} from '../lib/encyclopedia/world-model.ts';
import {newQuest} from '../lib/encyclopedia/quests.ts';
import {EncyclopediaStore} from '../lib/encyclopedia/store.ts';
import {applyItem,compactTranscript,discordText,draftRecap,linkNames,openItems,publishRecap,quoteInTranscript,skipItem,transcriptParts,wordCount} from '../lib/encyclopedia/recaps.ts';
import {timelineMarkdown} from '../lib/encyclopedia/recap-schema.ts';
import {playersBook} from '../lib/mcp/players-only.ts';
import {callTool,listTools} from '../lib/mcp/tools.ts';
import {makeCommit} from '../lib/mcp/commit.ts';
import {getPrompt,listPrompts} from '../lib/mcp/prompts.ts';
import {fromLevel} from '../lib/mcp/permissions.ts';

const C='demo-campaign',NOW=new Date('2026-11-13T10:00:00Z');
/** The demo world with the Greyfen pages a recap touches. */
function world(){
 const w=demoWorkspace(),at=NOW.toISOString(),c=w.campaigns.find(x=>x.id===C);
 const quest={...newQuest('active','side'),objectives:[{id:'o1',text:'Find out who keeps the toll',done:false},{id:'o2',text:'Reach the chapel',done:false}]};
 w.entries.push(
  {id:'ostra',worldId:c.worldId,campaignId:C,parentId:null,title:'Ostra Hale',kind:'character',body:'Keeps the toll lantern.',updatedAt:at},
  {id:'lights',worldId:c.worldId,campaignId:C,parentId:null,title:'Lights on the marsh',kind:'quest',body:'',quest,overviewVisibility:'players',updatedAt:at},
  {id:'hag',worldId:c.worldId,campaignId:C,parentId:null,title:'Bog Hag',kind:'lore',body:'Lives on stilts.',codex:{category:'Bestiary',summary:'A marsh witch.',found:{}},updatedAt:at},
 );
 return w;
}
const ai={
 title:'Session 13 · The toll at Greyfen',playedOn:'2026-11-12',source:'Pasted transcript',
 recap:'The ferry put in at Greyfen, and [[Ostra Hale]] was waiting. Inside the [[Bog Hag]]’s house they met [[Brother Halden]].\n\n::: secret\nHalden is lying.\n:::',
 gmNotes:'Halden knows where the bell is.',
 timeline:[{title:'Arrival at the Greyfen landing',big:true,steps:['Ostra Hale waits under the toll lantern']},{title:'The toll is a favour',steps:['A sealed jar for the Bog Hag']}],
 quotes:[{text:'Everyone’s here about the lights. Pay the toll first.',who:'Ostra Hale (GM)'},{text:'I never said that.',who:'Bram (Mara)'}],
 found:[{name:'Brother Halden',kind:'character',text:'A lantern-keeper who swears the lights are not wisps.'},{name:'ostra hale',kind:'character',text:'Asked the party to carry a sealed jar.'}],
 quests:[{quest:'Lights on the marsh',log:'Ostra names a price for what she knows.',tick:'Find out who',playersSee:true},{quest:'The chapel bell',log:'The Bog Hag wants the old chapel bell.',playersSee:true}],
 codex:[{page:'Bog Hag',label:'Session 13'},{page:'Ostra Hale'}],
};
const transcript=`[19:02] GM: Um.\n[19:02] GM: Ostra Hale lifts the toll lantern.\n[19:03] GM: “Everyone's here about the lights… Pay the toll first.”\nMara: ok\nMara: lol\nTobin: If it's a wisp, it's a very patient one.\nTobin: Seriously.`;

test('a transcript is compacted without rewording anyone',()=>{
 const t=compactTranscript(transcript);
 assert.equal(t,`GM: Ostra Hale lifts the toll lantern. “Everyone's here about the lights… Pay the toll first.”\nTobin: If it's a wisp, it's a very patient one. Seriously.`);
 assert.ok(t.length<transcript.length*.75);
 assert.equal(wordCount('a b  c\nd'),4);
});

test('long transcripts split into parts at line ends, and nothing is lost',()=>{
 const lines=Array.from({length:500},(_,i)=>`Speaker ${i%3}: line ${i} ${'word '.repeat(10)}`);
 const parts=transcriptParts(lines.join('\n'),2000);
 assert.ok(parts.length>5);assert.ok(parts.every(p=>p.length<=2000));
 assert.equal(parts.join('\n'),lines.join('\n'));
 const huge=transcriptParts('x '.repeat(3000),1000);
 assert.ok(huge.every(p=>p.length<=1000));
 assert.deepEqual(transcriptParts(''),['']);
});

test('quotes check against the transcript word for word, ignoring punctuation and case',()=>{
 assert.ok(quoteInTranscript('Everyone’s here about the lights. Pay the toll first.',transcript));
 assert.ok(quoteInTranscript('if it’s a wisp, it’s a very patient one',transcript));
 assert.equal(quoteInTranscript('I never said that.',transcript),false);
 assert.equal(quoteInTranscript('…',transcript),false);
});

test('names with pages are linked; others, tables and rolls are left alone',()=>{
 const w=world(),scope={worldId:w.campaigns[0].worldId,campaignId:C};
 assert.equal(linkNames('[[Ostra Hale]] met [[Nobody]] and rolled [[1d20+2]] on [[table:Weather]].',w.entries,scope),'[[ostra|Ostra Hale]] met [[Nobody]] and rolled [[1d20+2]] on [[table:Weather]].');
 assert.equal(linkNames('[[Greyhaven]]',w.entries,scope),`[[${w.entries.find(e=>e.title==='Greyhaven').id}|Greyhaven]]`,'shared world lore links too');
});

test('a draft matches what the AI found to pages and quests, and changes nothing else',()=>{
 const w=world(),c=w.campaigns.find(x=>x.id===C),folder=w.entries.find(e=>e.title==='Session Notes').id,page=draftRecap(w,c,ai,{by:'Claude Code',now:NOW,transcript,folderId:folder});
 assert.equal(page.kind,'session');assert.equal(page.recap.status,'draft');assert.equal(page.overviewVisibility,undefined);
 assert.equal(page.recap.by,'Claude Code');assert.equal(page.parentId,folder);
 assert.match(page.body,/\[\[ostra\|Ostra Hale\]\]/);assert.match(page.body,/\[\[Brother Halden\]\]/);
 assert.deepEqual(page.recap.review.map(r=>[r.kind,r.name,r.pageId??null]),[
  ['newPage','Brother Halden',null],['update','Ostra Hale','ostra'],['questLog','Lights on the marsh','lights'],['newQuest','The chapel bell',null],['codex','Bog Hag','hag'],
 ],'Ostra Hale has no codex entry, so it is left out');
 assert.deepEqual(page.recap.quotes.map(q=>q.checked),[true,false]);
 const next={...w,entries:[...w.entries,page]};
 assert.ok(workspaceSchema.safeParse(next).success);
 assert.deepEqual(next.entries.filter(e=>e.id!==page.id),w.entries,'no other page changed');
 assert.equal(timelineMarkdown(page.recap.timeline),'### Arrival at the Greyfen landing\n- Ostra Hale waits under the toll lantern\n\n- **The toll is a favour**\n    - A sealed jar for the Bog Hag');
});

test('a recap only belongs on a session page',()=>{
 const w=world(),c=w.campaigns.find(x=>x.id===C),page=draftRecap(w,c,ai,{by:'AI',now:NOW});
 assert.equal(workspaceSchema.safeParse({...w,entries:[...w.entries,{...page,kind:'note'}]}).success,false);
});

test('Check before publishing does each item, links new pages, and marks it done',()=>{
 const w=world(),c=w.campaigns.find(x=>x.id===C),page=draftRecap(w,c,ai,{by:'AI',now:NOW});
 let ws={...w,entries:[...w.entries,page]};
 const item=kind=>ws.entries.find(e=>e.id===page.id).recap.review.find(r=>r.kind===kind);
 // New page: made GM-only, and the recap now links to it.
 let r=applyItem(ws,page.id,item('newPage').id,NOW);ws=r.next;
 const halden=ws.entries.find(e=>e.title==='Brother Halden');
 assert.equal(halden.kind,'character');assert.equal(halden.overviewVisibility,undefined);assert.ok(halden.character);
 assert.match(halden.body,new RegExp(`From \\[\\[${page.id}\\|`));
 assert.match(ws.entries.find(e=>e.id===page.id).body,new RegExp(`\\[\\[${halden.id}\\|Brother Halden\\]\\]`));
 assert.match(r.message,/Made the character page “Brother Halden”, GM only/);
 // Update: a line added to the end of Ostra's page.
 ws=applyItem(ws,page.id,item('update').id,NOW).next;
 assert.match(ws.entries.find(e=>e.id==='ostra').body,/^Keeps the toll lantern\.\n\n\*From \[\[.+\]\]:\* Asked the party to carry a sealed jar\.$/);
 // Quest log: shared entry, objective ticked.
 r=applyItem(ws,page.id,item('questLog').id,NOW);ws=r.next;
 const q=ws.entries.find(e=>e.id==='lights').quest;
 assert.equal(q.log.at(-1).text,'Ostra names a price for what she knows.');assert.equal(q.log.at(-1).players,true);
 assert.deepEqual(q.objectives.map(o=>o.done),[true,false]);assert.match(r.message,/ticked “Find out who keeps the toll”/);
 // New quest: a rumour players can see.
 ws=applyItem(ws,page.id,item('newQuest').id,NOW).next;
 const bell=ws.entries.find(e=>e.title==='The chapel bell');
 assert.equal(bell.quest.state,'rumour');assert.equal(bell.overviewVisibility,'players');
 // Codex: found in this campaign.
 ws=applyItem(ws,page.id,item('codex').id,NOW).next;
 assert.ok(ws.entries.find(e=>e.id==='hag').codex.found[C]);
 const done=ws.entries.find(e=>e.id===page.id).recap;
 assert.equal(openItems(done).length,0);assert.ok(done.review.every(x=>x.state==='done'));
 assert.equal(applyItem(ws,page.id,done.review[0].id).message,'Already done.');
 assert.ok(workspaceSchema.safeParse(ws).success);
});

test('skipping changes nothing but the list; a gone page is a clear error',()=>{
 const w=world(),c=w.campaigns.find(x=>x.id===C),page=draftRecap(w,c,ai,{by:'AI',now:NOW});
 let ws={...w,entries:[...w.entries,page]};
 const [first,second]=page.recap.review;
 ws=skipItem(ws,page.id,first.id);
 assert.equal(ws.entries.find(e=>e.id===page.id).recap.review[0].state,'skipped');
 assert.deepEqual(ws.entries.filter(e=>e.id!==page.id),w.entries);
 ws={...ws,entries:ws.entries.filter(e=>e.id!=='ostra')};
 assert.throws(()=>applyItem(ws,page.id,second.id),/“Ostra Hale” is gone/);
});

test('players never get a draft; a published recap shares its text, and timeline and quotes when chosen',()=>{
 const w=world(),c=w.campaigns.find(x=>x.id===C),page=draftRecap(w,c,ai,{by:'AI',now:NOW});
 let ws={...w,entries:[...w.entries,{...page,overviewVisibility:'players',recap:{...page.recap,shareTimeline:true}}]};
 assert.equal(playerCampaign(ws,C).entries.some(e=>e.id===page.id),false,'a draft is left out even when marked visible');
 assert.equal(playersBook(campaignExport(ws,C),C).entries.some(e=>e.id===page.id),false,'and from a players-only AI connection');
 ws=publishRecap(ws,page.id,true,NOW);
 const shared=playerCampaign(ws,C).entries.find(e=>e.id===page.id);
 assert.deepEqual(shared.tabs.map(t=>t.title),['Overview','Timeline']);
 assert.doesNotMatch(shared.tabs[0].body,/Halden is lying/);
 assert.equal(shared.recap,undefined);assert.doesNotMatch(JSON.stringify(shared),/bell is/,'GM notes never go');
 const book=playersBook(campaignExport(ws,C),C).entries.find(e=>e.id===page.id);
 assert.equal(book.recap,undefined);assert.deepEqual(book.tabs.map(t=>t.title),['Timeline']);
 ws=publishRecap(ws,page.id,false,NOW);
 assert.equal(playerCampaign(ws,C).entries.some(e=>e.id===page.id),false);
});

test('the Discord text has no secrets and no link syntax',()=>{
 assert.equal(discordText('Met [[ostra|Ostra Hale]] and [[Bram]].\n\n::: secret\nHalden is lying.\n:::'),'Met Ostra Hale and Bram.');
 assert.ok(discordText('x'.repeat(5000)).length<=4000);
});

// ---- Storage and MCP ----------------------------------------------------------------------------

function bucket(){
 const data=new Map();let n=0;
 return {data,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text),arrayBuffer:async()=>new TextEncoder().encode(v.text).buffer}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){const v=data.get(k);if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;data.set(k,{text,etag:String(++n)});return {etag:String(n)};},
  async delete(k){data.delete(k);},
  async list(){return {objects:[],truncated:false};},
 };
}
const OWNER='gm-1';
async function setup(perms){
 const b=bucket(),store=new EncyclopediaStore(b);
 await store.save(OWNER,world(),0);
 const transcriptFn=perms?.seeSecrets==='off'?undefined:id=>store.readTranscript(OWNER,id);
 const base={maps:null,level:'assist',perms:perms??fromLevel('assist'),transcript:transcriptFn,connection:'Claude Code'};
 const commit=makeCommit(b,{owner:OWNER,campaignId:C,connectionId:'c1',connection:'Claude Code'},base);
 const ctx=async()=>{const {data}=await store.read(OWNER),book=campaignExport(data,C);return {...base,book,campaign:book.campaigns[0],commit};};
 const call=async(name,args={})=>{const r=await callTool(await ctx(),name,args);return {...r,text:r.content[0].text};};
 return {b,store,call,ctx,latest:async()=>(await store.read(OWNER)).data};
}
const body=r=>JSON.parse(r.text.slice(r.text.indexOf('{')));

test('transcripts are stored beside the workspace, only on session pages, and go with the page',async()=>{
 const {store,b}=await setup(),sessionId=(await store.read(OWNER)).data.entries.find(e=>e.title==='A light in the fog').id;
 await store.saveTranscript(OWNER,sessionId,transcript);
 assert.equal(await store.readTranscript(OWNER,sessionId),transcript);
 assert.ok([...b.data.keys()].some(k=>k.endsWith(`transcripts/${sessionId}.txt`)));
 await assert.rejects(store.saveTranscript(OWNER,'ostra','x'),/session page/);
 await assert.rejects(store.saveTranscript(OWNER,'../x','x'),/not valid/);
 const {data,revision}=await store.read(OWNER);
 await store.save(OWNER,{...data,entries:data.entries.filter(e=>e.id!==sessionId)},revision);
 assert.equal(await store.readTranscript(OWNER,sessionId),null,'deleting the page deletes its transcript');
});

test('the AI reads a transcript in parts and saves a draft recap for the GM to check',async()=>{
 const s=await setup(),sessionId=(await s.latest()).entries.find(e=>e.title==='A light in the fog').id;
 const names=listTools('assist').map(t=>t.name);
 for(const n of ['list_names','read_transcript','save_recap'])assert.ok(names.includes(n),n);
 assert.ok(listTools('read').some(t=>t.name==='read_transcript'));assert.ok(!listTools('read').some(t=>t.name==='save_recap'));
 let r=await s.call('read_transcript');
 assert.ok(r.isError);assert.match(r.text,/None of the latest sessions has a transcript/);
 await s.store.saveTranscript(OWNER,sessionId,transcript);
 r=await s.call('read_transcript');
 assert.equal(r.isError,false,r.text);
 const part=body(r);
 assert.equal(part.page,'A light in the fog');assert.equal(part.part,1);assert.equal(part.of,1);assert.doesNotMatch(part.text,/19:02|lol/);
 r=await s.call('read_transcript',{page:'A light',part:2});assert.match(r.text,/has 1 part/);
 const names2=body(await s.call('list_names'));
 assert.deepEqual(names2.character,['Mara Venn','Ostra Hale']);assert.equal(names2.session,undefined);
 r=await s.call('save_recap',{...ai,page:'A light in the fog'});
 assert.equal(r.isError,false,r.text);
 const saved=body(r);
 assert.equal(saved.saved.id,sessionId);assert.equal(saved.toCheck.length,5);
 const page=(await s.latest()).entries.find(e=>e.id===sessionId);
 assert.equal(page.recap.status,'draft');assert.equal(page.recap.by,'Claude Code');assert.equal(page.title,ai.title);
 assert.equal((await s.latest()).entries.find(e=>e.id==='ostra').body,'Keeps the toll lantern.','nothing else changed');
 r=await s.call('read_page',{page:ai.title});
 assert.equal(body(r).recap.status,'draft');assert.equal(body(r).recap.waitingForGM,5);
});

test('save_recap makes a new page in the session folder, and checks its input',async()=>{
 const s=await setup();
 const r=await s.call('save_recap',{title:'Session 14',recap:'Short.',timeline:[{title:'Nothing much'}]});
 assert.equal(r.isError,false,r.text);
 const data=await s.latest(),page=data.entries.find(e=>e.title==='Session 14');
 assert.equal(data.entries.find(e=>e.id===page.parentId).title,'Session Notes');
 assert.match((await s.call('save_recap',{title:'x',recap:'y',timeline:[],playedOn:'Nov 12'})).text,/YYYY-MM-DD/);
 assert.match((await s.call('save_recap',{title:'x',recap:'y',timeline:[],found:[{name:'a',kind:'dragon',text:'b'}]})).text,/found kind/);
 assert.match((await s.call('save_recap',{title:'x',recap:'y',timeline:'z'})).text,/timeline must be a list/);
 assert.match((await s.call('save_recap',{title:'x',recap:'y',timeline:[],page:'Ostra Hale'})).text,/No session page called/);
});

test('a players-only connection cannot read transcripts, and Ask me waits for the GM',async()=>{
 const off=await setup({...fromLevel('assist'),seeSecrets:'off'});
 assert.match((await off.call('read_transcript')).text,/can't read transcripts/);
 const ask=await setup({...fromLevel('assist'),notes:'ask'});
 const c=await ask.ctx(),suggested=[];
 const r=await callTool({...c,suggest:async x=>{suggested.push(x);return 's1';}},'save_recap',{title:'Session 14',recap:'Short.',timeline:[]});
 assert.match(r.content[0].text,/waitingForGM/);assert.equal(suggested[0].summary,'Drafted the recap “Session 14”');
 assert.equal((await ask.latest()).entries.some(e=>e.title==='Session 14'),false);
});

test('the recap prompt reads cheaply and saves a draft',()=>{
 assert.ok(listPrompts().some(p=>p.name==='recap_from_source'));
 const c={campaign:{name:'The Salt Road'},level:'assist',book:{entries:[]}};
 const own=getPrompt(c,'recap_from_source',{page:'Session 13'}).messages[0].content.text;
 assert.match(own,/read_transcript \(page "Session 13"\)/);assert.match(own,/save_recap with page "Session 13"/);assert.match(own,/never read a part twice/);
 const notion=getPrompt(c,'recap_from_source',{source:'https://www.notion.so/Session-13'}).messages[0].content.text;
 assert.match(notion,/your own tools/);assert.doesNotMatch(notion,/read_transcript/);
 assert.match(getPrompt({...c,level:'read'},'recap_from_source',{}).messages[0].content.text,/don't try to save/);
});
