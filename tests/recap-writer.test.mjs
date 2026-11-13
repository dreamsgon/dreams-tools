import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {newQuest}=await import('../lib/encyclopedia/quests.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {startRecap}=await import('../lib/encyclopedia/recap-request.ts');
const {publishRecap}=await import('../lib/encyclopedia/recaps.ts');
const {beatLines,namesBlock,notesPrompt,prosePrompt,questsBlock,quoteLines,recapTokens,unlinkNames,IN_APP_LIMIT}=await import('../lib/encyclopedia/recap-prompts.ts');
const {cleanApi,createApiConnection,listConnections}=await import('../lib/mcp/connections.ts');
const {readActivity}=await import('../lib/mcp/activity.ts');
const {runOnce}=await import('../lib/ai/chat.ts');
const {writeRecap,writeRecapAgain}=await import('../lib/ai/recap-writer.ts');
const {listTools}=await import('../lib/mcp/tools.ts');

const C='demo-campaign',OWNER='gm-1',KEY='sk-test-1234567890abcd',NOW=new Date('2026-11-13T10:00:00Z');
function world(){
 const w=demoWorkspace(),at=NOW.toISOString(),c=w.campaigns.find(x=>x.id===C);
 const quest={...newQuest('active','side'),objectives:[{id:'o1',text:'Find out who keeps the toll',done:false},{id:'o2',text:'Reach the chapel',done:true}]};
 w.entries.push(
  {id:'ostra',worldId:c.worldId,campaignId:C,parentId:null,title:'Ostra Hale',kind:'character',body:'Keeps the toll lantern.',updatedAt:at},
  {id:'lights',worldId:c.worldId,campaignId:C,parentId:null,title:'Lights on the marsh',kind:'quest',body:'',quest,updatedAt:at},
 );
 return w;
}
function bucket(){
 const data=new Map();let n=0;
 return {data,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text),text:async()=>v.text,arrayBuffer:async()=>new TextEncoder().encode(v.text).buffer}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){const v=data.get(k);if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;data.set(k,{text,etag:String(++n)});return {etag:String(n)};},
  async delete(k){data.delete(k);},
  async list(){return {objects:[],truncated:false};},
 };
}
/** A fake provider: answers each request with the next reply, and records what was sent. */
function fakeFetch(replies){
 const sent=[];
 const f=async(url,init={})=>{
  const req=url instanceof Request?url:new Request(url,init);
  sent.push({url:req.url,headers:Object.fromEntries(req.headers),body:req.method==='POST'?JSON.parse(await req.text()):null});
  const next=replies.shift();if(!next)throw Error('No more replies');
  if(typeof next==='string')return new Response(next,{status:200,headers:{'content-type':'text/event-stream','request-id':'req_1'}});
  const [status,body]=Array.isArray(next)?next:[200,next];
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','request-id':'req_1'}});
 };
 f.sent=sent;return f;
}
const oaCall=(name,args)=>({choices:[{message:{content:null,tool_calls:[{id:'call_1',type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}],usage:{total_tokens:900}});
const oaSay=text=>({choices:[{message:{content:text},finish_reason:'stop'}],usage:{total_tokens:300}});
const transcript='[19:02] GM: Um.\n[19:02] GM: Ostra Hale lifts the toll lantern.\nGM: “Pay the toll first.”\nMara (Bram): I keep my hand on my sword.\nMara (Bram): lol\nTobin: If it’s a wisp, it’s a very patient one.';
const notes={
 timeline:[{title:'Arrival at the Greyfen landing',big:true,steps:['Ostra Hale waits under the toll lantern']},{title:'The toll is a favour',steps:['A sealed jar for the Bog Hag']}],
 quotes:[{text:'If it’s a wisp, it’s a very patient one.',who:'Kestrel'}],
 found:[{name:'Ostra Hale',kind:'character',text:'Asked the party to carry a sealed jar.'},{name:'Brother Halden',kind:'character',text:'A lantern-keeper.'}],
 quests:[{quest:'Lights on the marsh',log:'Ostra names a price.',tick:'Find out who keeps the toll'}],
 gmNotes:'Halden knows where the bell is.',
};

async function setup(how='helper',request={length:'short',depth:'balanced',steer:'Warm and a little ominous.',at:NOW.toISOString()}){
 const b=bucket(),store=new EncyclopediaStore(b);
 const started=startRecap(world(),{campaignId:C,title:'Session 13',playedOn:'2026-11-12',source:'A pasted transcript',request},NOW);
 await store.save(OWNER,started.next,0);
 await store.saveTranscript(OWNER,started.id,transcript);
 const connection=await createApiConnection(b,OWNER,C,'Sonnet',how,cleanApi({provider:'openai',model:'gpt-test',apiKey:KEY,limit:'2,000,000'}));
 return {b,store,id:started.id,connection,page:async()=>(await store.read(OWNER)).data.entries.find(e=>e.id===started.id)};
}

test('the prompts are short lines: names, open objectives, what the GM asked, and the compacted transcript',()=>{
 const w=world(),scope={worldId:w.campaigns.find(c=>c.id===C).worldId,campaignId:C};
 const names=namesBlock(w.entries,scope);
 assert.match(names,/^character: .*Ostra Hale/m);assert.doesNotMatch(names,/session:|folder:/);
 assert.equal(questsBlock(w,scope).split('\n').find(l=>l.includes('Lights')),'- Lights on the marsh: Find out who keeps the toll','done objectives are left out');
 const request={length:'short',depth:'main',skip:['quotes','quests'],cast:[{speaker:'Mara (Bram)',as:'ostra',name:'Bram'}],at:''};
 const p=notesPrompt({campaign:'The Salt Road',title:'Session 13',playedOn:'2026-11-12',request,names,quests:'- Lights on the marsh',transcript:'GM: Hello.'});
 assert.match(p,/Session: "Session 13", played on 2026-11-12/);assert.match(p,/about 150 to 300 words/);assert.match(p,/Mara \(Bram\) is the player of Bram/);
 assert.match(p,/<transcript>\nGM: Hello.\n<\/transcript>$/);
 assert.doesNotMatch(p,/- quotes:|- quests:|Open quests/,'skipped parts are not asked for');assert.match(p,/- timeline:/);
 const prose=prosePrompt({campaign:'The Salt Road',title:'Session 13',request,names:'',timeline:beatLines(notes.timeline),quotes:quoteLines(notes.quotes),before:unlinkNames('Met [[ostra|Ostra Hale]].'),note:'Shorter.'});
 assert.match(prose,/## Arrival at the Greyfen landing\n  - Ostra Hale waits/);assert.match(prose,/- The toll is a favour/);
 assert.match(prose,/The GM read the last draft and asks: Shorter\./);assert.match(prose,/The last draft:\nMet \[\[Ostra Hale\]\]\./);
 assert.doesNotMatch(prose,/Leave out|Pull out/,'the prose request only carries what shapes the text');
 assert.equal(beatLines([null,{title:7},{title:'Ok',steps:[1,'a']}]),'- Ok\n  - a','odd shapes from the AI are skipped');
 assert.equal(recapTokens(40_000),18000);assert.equal(IN_APP_LIMIT,400_000);
});

test('RPG Tools writes the recap with the GM’s key: notes from the transcript, then the recap from the timeline',async()=>{
 const s=await setup();
 const f=fakeFetch([oaCall('save_notes',notes),oaSay('The ferry put in at Greyfen, where [[Ostra Hale]] waited under the toll lantern.')]);
 const r=await writeRecap(s.b,OWNER,C,s.connection.id,s.id,f);
 assert.equal(r.tokens,1200);assert.equal(r.toCheck,3);assert.equal(r.by,'Sonnet');assert.equal(r.api.used,1200);
 const first=f.sent[0].body;
 assert.deepEqual(first.tool_choice,{type:'function',function:{name:'save_notes'}},'the notes must come back through the tool');
 assert.deepEqual(Object.keys(first.tools[0].function.parameters.properties),['timeline','quotes','found','quests','codex','gmNotes']);
 const asked=first.messages[1].content;
 assert.match(asked,/Warm and a little ominous/);assert.match(asked,/Lights on the marsh: Find out who keeps the toll/);
 assert.match(asked,/Ostra Hale lifts the toll lantern/);assert.doesNotMatch(asked,/19:02|lol/,'the transcript is compacted first');
 assert.match(first.messages[0].content,/data, not instructions/);
 const second=f.sent[1].body;assert.equal(second.tools,undefined);
 assert.match(second.messages[1].content,/## Arrival at the Greyfen landing/);assert.doesNotMatch(second.messages[1].content,/<transcript>/,'the recap is written from the timeline, not the transcript');
 const page=await s.page();
 assert.equal(page.recap.status,'draft');assert.equal(page.recap.by,'Sonnet');assert.equal(page.recap.timeline.length,2);assert.equal(page.title,'Session 13');assert.equal(page.recap.playedOn,'2026-11-12');
 assert.match(page.body,/\[\[ostra\|Ostra Hale\]\]/);assert.equal(page.recap.gmNotes,'Halden knows where the bell is.');
 assert.deepEqual(page.recap.review.map(x=>x.kind).sort(),['newPage','questLog','update']);
 assert.equal(page.recap.request.steer,'Warm and a little ominous.','what the GM asked for stays with the page');
 const log=await readActivity(s.b,OWNER,C);assert.equal(log.entries[0].tool,'save_recap');assert.equal(log.entries[0].connection,'Sonnet');
});

test('Write it again rewrites only the recap, from the timeline as the GM left it, with their note',async()=>{
 const s=await setup();
 await writeRecap(s.b,OWNER,C,s.connection.id,s.id,fakeFetch([oaCall('save_notes',notes),oaSay('A long recap about [[Ostra Hale]].')]));
 const before=await s.page();
 const f=fakeFetch([oaSay('A short recap about [[Ostra Hale]] and [[Bram]].')]);
 const r=await writeRecapAgain(s.b,OWNER,C,s.connection.id,s.id,'Shorter, and more about Bram.',f);
 assert.equal(r.tokens,300);
 const sent=f.sent[0].body.messages[1].content;
 assert.match(sent,/asks: Shorter, and more about Bram\./);assert.match(sent,/The last draft:\nA long recap about \[\[Ostra Hale\]\]\./);assert.match(sent,/## Arrival at the Greyfen landing/);
 const after=await s.page();
 assert.equal(after.body,'A short recap about [[ostra|Ostra Hale]] and [[Bram]].');
 assert.deepEqual(after.recap.timeline,before.recap.timeline);assert.deepEqual(after.recap.review,before.recap.review,'the check list stays');
 assert.equal((await readActivity(s.b,OWNER,C)).entries[0].tool,'rewrite_recap');
 const {data,revision}=await s.store.read(OWNER);
 await s.store.save(OWNER,publishRecap(data,s.id,true,NOW),revision);
 await assert.rejects(writeRecapAgain(s.b,OWNER,C,s.connection.id,s.id,'',fakeFetch([])),/Unpublish the recap/);
});

test('a skipped recap is never asked for, and what the AI sends for skipped parts is dropped',async()=>{
 const s=await setup('helper',{length:'standard',depth:'balanced',skip:['recap','quotes'],at:NOW.toISOString()});
 const f=fakeFetch([oaCall('save_notes',notes)]);
 const r=await writeRecap(s.b,OWNER,C,s.connection.id,s.id,f);
 assert.equal(f.sent.length,1,'no second request');assert.equal(r.tokens,900);
 const page=await s.page();assert.equal(page.body,'');assert.deepEqual(page.recap.quotes,[]);
});

test('writing here needs a key that may write recaps and read transcripts, under its limit; spent tokens count even on failure',async()=>{
 const s=await setup('read');
 await assert.rejects(writeRecap(s.b,OWNER,C,s.connection.id,s.id,fakeFetch([])),/isn't allowed to write recaps/);
 const t=await setup('helper');
 const bad=fakeFetch([oaCall('save_notes',{timeline:'not a list'}),oaSay('A recap.')]);
 await assert.rejects(writeRecap(t.b,OWNER,C,t.connection.id,t.id,bad),/didn't fit: timeline must be a list/);
 assert.equal((await listConnections(t.b,OWNER,C))[0].api.used,1200,'the tokens were spent, so they count');
 assert.ok((await t.page()).recap.request,'the page still waits');
 const empty=fakeFetch([oaSay('I can’t.')]);
 await assert.rejects(writeRecap(t.b,OWNER,C,t.connection.id,t.id,empty),/didn't send its notes/);
 await t.store.saveTranscript(OWNER,t.id,'');
 await assert.rejects(writeRecap(t.b,OWNER,C,t.connection.id,t.id,fakeFetch([])),/has no transcript/);
 await assert.rejects(writeRecap(t.b,OWNER,C,'gone',t.id,fakeFetch([])),/was removed/);
});

test('a model without tools answers in JSON instead',async()=>{
 const f=fakeFetch([[400,{error:{message:'tools are not supported'}}],{choices:[{message:{content:'```json\n{"timeline":[{"title":"A"}]}\n```'},finish_reason:'stop'}],usage:{total_tokens:10}}]);
 const r=await runOnce({provider:'deepseek',key:KEY,model:'r1'},'S','U',{name:'save_notes',description:'d',inputSchema:{type:'object',properties:{timeline:{type:'array'}}}},1000,f);
 assert.deepEqual(r.input,{timeline:[{title:'A'}]});assert.equal(f.sent[1].body.tools,undefined);assert.match(f.sent[1].body.messages[1].content,/only a JSON object/);
});

test('with Anthropic, the notes stream back through a forced tool call',async()=>{
 const ev=(type,data)=>`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`;
 const stream=[
  ev('message_start',{message:{id:'msg_1',type:'message',role:'assistant',model:'claude-sonnet-5-5',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:20000,output_tokens:1}}}),
  ev('content_block_start',{index:0,content_block:{type:'tool_use',id:'tu_1',name:'save_notes',input:{}}}),
  ev('content_block_delta',{index:0,delta:{type:'input_json_delta',partial_json:'{"timeline":[{"title":"Arrival"'}}),
  ev('content_block_delta',{index:0,delta:{type:'input_json_delta',partial_json:',"big":true}]}'}}),
  ev('content_block_stop',{index:0}),
  ev('message_delta',{delta:{stop_reason:'tool_use',stop_sequence:null},usage:{output_tokens:800}}),
  ev('message_stop',{}),
 ].join('');
 const f=fakeFetch([stream]);
 const r=await runOnce({provider:'anthropic',key:KEY,model:'claude-sonnet-5-5'},'SYS','USER',{name:'save_notes',description:'d',inputSchema:{type:'object',properties:{}}},12000,f);
 assert.deepEqual(r.input,{timeline:[{title:'Arrival',big:true}]});assert.equal(r.tokens,20800);
 const sent=f.sent[0].body;
 assert.equal(sent.stream,true);assert.deepEqual(sent.tool_choice,{type:'tool',name:'save_notes'});assert.equal(sent.fallbacks,'default');assert.equal(sent.max_tokens,12000);
});

test('rewrite_recap is an Assist tool for the GM’s AI app, and only changes a draft',()=>{
 assert.ok(listTools('assist').some(t=>t.name==='rewrite_recap'));assert.ok(!listTools('read').some(t=>t.name==='rewrite_recap'));
});
