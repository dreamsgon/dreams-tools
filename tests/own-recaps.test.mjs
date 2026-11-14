import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {newQuest}=await import('../lib/encyclopedia/quests.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {startOwnRecap,startRecap,waitingForAi}=await import('../lib/encyclopedia/recap-request.ts');
const {addFinds,publishRecap}=await import('../lib/encyclopedia/recaps.ts');
const {checkPrompt,publishedRecaps,storyPrompt}=await import('../lib/encyclopedia/recap-prompts.ts');
const {cleanApi,createApiConnection,listConnections}=await import('../lib/mcp/connections.ts');
const {readActivity}=await import('../lib/mcp/activity.ts');
const {checkRecap,writeStory}=await import('../lib/ai/recap-writer.ts');
const {listTools}=await import('../lib/mcp/tools.ts');
const {toolAction}=await import('../lib/mcp/permissions.ts');

const C='demo-campaign',OWNER='gm-1',KEY='sk-test-1234567890abcd',NOW=new Date('2026-11-14T10:00:00Z');
function world(){
 const w=demoWorkspace(),at=NOW.toISOString(),c=w.campaigns.find(x=>x.id===C);
 const quest={...newQuest('active','side'),objectives:[{id:'o1',text:'Find the bell',done:false}]};
 w.entries.push(
  {id:'ostra',worldId:c.worldId,campaignId:C,parentId:null,title:'Ostra Hale',kind:'character',body:'Keeps the toll lantern.',updatedAt:at},
  {id:'bell',worldId:c.worldId,campaignId:C,parentId:null,title:'The Drowned Bell',kind:'quest',body:'',quest,updatedAt:at},
  {id:'s13',worldId:c.worldId,campaignId:C,parentId:null,title:'Session 13',kind:'session',body:'Prep: the bell rings at midnight.',updatedAt:at},
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
function fakeFetch(replies){
 const sent=[];
 const f=async(url,init={})=>{
  const req=url instanceof Request?url:new Request(url,init);
  sent.push({body:req.method==='POST'?JSON.parse(await req.text()):null});
  const next=replies.shift();if(!next)throw Error('No more replies');
  return new Response(JSON.stringify(next),{status:200,headers:{'content-type':'application/json','request-id':'req_1'}});
 };
 f.sent=sent;return f;
}
const oaCall=(name,args)=>({choices:[{message:{content:null,tool_calls:[{id:'call_1',type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}],usage:{total_tokens:700}});
const oaSay=text=>({choices:[{message:{content:text},finish_reason:'stop'}],usage:{total_tokens:300}});
const MINE='We reached Greyfen. [[Ostra Hale]] was waiting, and Tobin the ferryman agreed to wait. We found the bell.';

test('Write it myself makes the session page a recap the GM writes: notes kept on a GM-only tab, nothing waits for an AI',()=>{
 const next=startOwnRecap(world(),'s13',NOW),page=next.entries.find(e=>e.id==='s13');
 assert.equal(page.recap.mine,true);assert.equal(page.recap.status,'draft');assert.equal(page.recap.request,undefined);
 assert.equal(page.body,'');assert.deepEqual(page.tabs.map(t=>[t.title,t.visibility,t.body]),[['Notes before the recap','gm','Prep: the bell rings at midnight.']]);
 assert.equal(waitingForAi(page.recap),false);
 assert.equal(startOwnRecap(next,'s13',NOW),next,'a page that already has a recap is left alone');
 assert.throws(()=>startOwnRecap(world(),'ostra',NOW),/Only a session page/);
 // Written and published, it is a recap like any other: The story so far reads it.
 const written={...next,entries:next.entries.map(e=>e.id==='s13'?{...e,body:MINE}:e)};
 const out=publishedRecaps(publishRecap(written,'s13',true,NOW).entries,C);
 assert.deepEqual(out.recaps.map(r=>r.title),['Session 13']);
});

test('the New session recap dialog can make the page for the GM to write: no request is stored',()=>{
 const {next,id}=startRecap(world(),{campaignId:C,title:'Session 14',source:'A pasted transcript',mine:true},NOW);
 const page=next.entries.find(e=>e.id===id);
 assert.equal(page.recap.mine,true);assert.equal(page.recap.request,undefined);assert.equal(page.recap.source,'A pasted transcript');
 assert.throws(()=>startRecap(world(),{campaignId:C,title:'x',source:''},NOW),/Say what the AI should make/);
 const blank=startRecap(world(),{campaignId:C,title:'Session 15',source:'',mine:true},NOW);
 assert.equal(blank.next.entries.find(e=>e.id===blank.id).recap.source,undefined);
 // An AI asked for later takes over: the request is stored and the page is no longer the GM's own.
 const asked=startRecap(next,{campaignId:C,title:'Session 14',source:'A pasted transcript',pageId:id,request:{length:'short',depth:'main',at:''}},NOW);
 const again=asked.next.entries.find(e=>e.id===id);
 assert.equal(again.recap.mine,undefined);assert.ok(again.recap.request);
});

test('addFinds adds what the AI found to the check list, matched to pages, without changing the recap or adding twice',()=>{
 const w=startOwnRecap(world(),'s13',NOW),campaign=w.campaigns.find(c=>c.id===C);
 const page={...w.entries.find(e=>e.id==='s13'),body:MINE};
 const input={found:[{name:'Ostra Hale',kind:'character',text:'Waited at the landing.'},{name:'Tobin',kind:'character',text:'The ferryman.'}],quests:[{quest:'The Drowned Bell',log:'Found the bell.',tick:'Find the bell'}],codex:[]};
 const {added,entry}=addFinds(w,campaign,page,input);
 assert.deepEqual(added.map(r=>[r.kind,r.name]),[['update','Ostra Hale'],['newPage','Tobin'],['questLog','The Drowned Bell']]);
 assert.equal(entry.body,MINE);assert.equal(entry.recap.mine,true);
 const twice=addFinds(w,campaign,entry,input);
 assert.equal(twice.added.length,0,'what already waits isn’t added again');
});

test('add_recap_finds is an Assist tool under “Session notes and recaps”',()=>{
 const tool=listTools('assist').find(t=>t.name==='add_recap_finds');
 assert.ok(tool);assert.ok(!listTools('read').some(t=>t.name==='add_recap_finds'));
 assert.deepEqual(Object.keys(tool.inputSchema.properties),['page','found','quests','codex']);
 assert.equal(toolAction('add_recap_finds'),'notes');
 const save=listTools('assist').find(t=>t.name==='save_recap');
 assert.deepEqual(Object.keys(save.inputSchema.properties).slice(-3),['found','quests','codex'],'save_recap keeps the same lists');
});

async function setup(){
 const b=bucket(),store=new EncyclopediaStore(b);
 let w=startOwnRecap(world(),'s13',NOW);
 w={...w,entries:w.entries.map(e=>e.id==='s13'?{...e,body:MINE}:e)};
 await store.save(OWNER,w,0);
 const connection=await createApiConnection(b,OWNER,C,'Sonnet','helper',cleanApi({provider:'openai',model:'gpt-test',apiKey:KEY,limit:'2,000,000'}));
 return {b,store,connection,page:async()=>(await store.read(OWNER)).data.entries.find(e=>e.id==='s13')};
}

test('Check it with AI reads the GM’s recap and fills only the check list, through add_recap_finds',async()=>{
 const s=await setup();
 const f=fakeFetch([oaCall('save_finds',{found:[{name:'Tobin',kind:'character',text:'The ferryman at Greyfen.'}],quests:[{quest:'The Drowned Bell',log:'Found the bell.',tick:'Find the bell'}]})]);
 const r=await checkRecap(s.b,OWNER,C,s.connection.id,'s13',f);
 assert.equal(r.added,2);assert.equal(r.by,'Sonnet');assert.equal(r.tokens,700);
 const sent=f.sent[0].body;
 assert.deepEqual(sent.tool_choice,{type:'function',function:{name:'save_finds'}});
 assert.deepEqual(Object.keys(sent.tools[0].function.parameters.properties),['found','quests','codex']);
 const asked=sent.messages[1].content;
 assert.match(asked,/wrote the recap below themselves\. Don't rewrite it/);assert.match(asked,/<recap>\nWe reached Greyfen\. \[\[Ostra Hale\]\] was waiting/);
 assert.match(asked,/The Drowned Bell: Find the bell/);
 const page=await s.page();
 assert.equal(page.body,MINE,'the GM’s words stay as they were');
 assert.deepEqual(page.recap.review.map(x=>x.kind),['newPage','questLog']);assert.equal(page.recap.mine,true);
 assert.equal((await readActivity(s.b,OWNER,C)).entries[0].tool,'add_recap_finds');
 assert.equal((await listConnections(s.b,OWNER,C))[0].api.used,700);
});

test('Check it with AI needs a written recap',async()=>{
 const s=await setup();
 const {data,revision}=await s.store.read(OWNER);
 await s.store.save(OWNER,{...data,entries:data.entries.map(e=>e.id==='s13'?{...e,body:''}:e)},revision);
 await assert.rejects(checkRecap(s.b,OWNER,C,s.connection.id,'s13',fakeFetch([])),/Write the recap first/);
 assert.match(checkPrompt({campaign:'C',title:'T',names:'',quests:'',recap:'R'}),/This campaign has no pages yet/);
});

test('The story so far takes a note, can start fresh, and starts from the GM’s unsaved text',async()=>{
 const s=await setup();
 const {data,revision}=await s.store.read(OWNER);
 await s.store.save(OWNER,publishRecap(data,'s13',true,NOW),revision);
 const f=fakeFetch([oaSay('The party reached Greyfen.')]);
 const r=await writeStory(s.b,OWNER,C,s.connection.id,f,{note:'End on the bell.',before:'My own words so far.'});
 assert.equal(r.text,'The party reached Greyfen.');
 const asked=f.sent[0].body.messages[1].content;
 assert.match(asked,/The GM asks: End on the bell\./);assert.match(asked,/Keep what still holds:\nMy own words so far\./);
 const fresh=fakeFetch([oaSay('Fresh.')]);
 await writeStory(s.b,OWNER,C,s.connection.id,fresh,{keep:false,before:'My own words so far.'});
 assert.doesNotMatch(fresh.sent[0].body.messages[1].content,/Keep what still holds|My own words/);
 assert.doesNotMatch(storyPrompt({campaign:'C',recaps:[],left:0}),/The GM asks/);
});
