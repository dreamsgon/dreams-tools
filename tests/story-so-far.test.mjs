import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {emptyRecap}=await import('../lib/encyclopedia/recap-schema.ts');
const {frontPageSchema,newWidget,resolveFrontPage,widgetNames}=await import('../lib/encyclopedia/front-page.ts');
const {publishedRecaps,storyNow,storyPrompt}=await import('../lib/encyclopedia/recap-prompts.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {cleanApi,createApiConnection,listConnections}=await import('../lib/mcp/connections.ts');
const {fromLevel}=await import('../lib/mcp/permissions.ts');
const {callTool}=await import('../lib/mcp/tools.ts');
const {getPrompt}=await import('../lib/mcp/prompts.ts');
const {writeStory}=await import('../lib/ai/recap-writer.ts');

const C='demo-campaign',OWNER='gm-1',NOW='2026-11-13T10:00:00.000Z';
const session=(id,title,playedOn,body,status='published',seen=status==='published'?'players':'gm')=>({id,worldId:'',campaignId:C,parentId:null,title,kind:'session',body,overviewVisibility:seen,recap:{...emptyRecap(),status,playedOn},updatedAt:NOW});
function world(story){
 const w=demoWorkspace(),c=w.campaigns.find(x=>x.id===C);
 w.entries=w.entries.filter(e=>!(e.kind==='session'&&e.campaignId===C));
 w.entries.push(
  {...session('s12','Session 12','2026-11-05','The party crossed the [[ostra|Salt Road]] to the Lantern Coast.\n:::secret\nThe ferryman is a smuggler.\n:::\nThey slept at the inn.'),worldId:c.worldId},
  {...session('s13','Session 13','2026-11-12','At the Greyfen landing, [[Ostra Hale]] asked for a sealed jar.'),worldId:c.worldId},
  {...session('s14','Session 14','2026-11-19','A draft nobody has checked.','draft'),worldId:c.worldId},
  {...session('s11','Session 11','2026-10-29','Published once, then hidden from players.','published','gm'),worldId:c.worldId},
 );
 if(story)c.frontPage={widgets:[{id:'story-1',type:'story',body:story}]};
 return w;
}

test('The story so far is a front page widget players see with the latest sessions under it',()=>{
 assert.equal(widgetNames.story,'The story so far');
 assert.deepEqual(newWidget('story','story-1'),{id:'story-1',type:'story',body:''});
 const page=frontPageSchema.parse({widgets:[{id:'s',type:'story',body:'The party crossed the Salt Road.',from:2,at:NOW}]});
 assert.equal(frontPageSchema.safeParse({widgets:[{id:'s',type:'story',body:'x'.repeat(6001)}]}).success,false,'up to 6,000 characters');
 const entries=['a','b','c','d'].map(id=>({id,title:`Session ${id}`,kind:'session',tabs:[{body:'x'}]}));
 const out=resolveFrontPage(page,{entries,calendars:[],clean:s=>s.replace('Salt','[clean]'),sessionsNewestFirst:['gone','d','c','b','a']});
 assert.deepEqual(out.widgets[0],{id:'s',type:'story',title:'The story so far',wide:false,body:'The party crossed the [clean] Road.',sessions:[{id:'d',title:'Session d'},{id:'c',title:'Session c'},{id:'b',title:'Session b'}]});
});

test('it is written only from recaps players can read: published, shared, secrets and links taken out, oldest first',()=>{
 const w=world();
 const {recaps,left}=publishedRecaps(w.entries,C);
 assert.deepEqual(recaps.map(r=>r.title),['Session 12','Session 13'],'drafts and recaps hidden from players are left out');
 assert.equal(recaps[0].text,'The party crossed the Salt Road to the Lantern Coast.\nThey slept at the inn.');
 assert.equal(recaps[1].text,'At the Greyfen landing, Ostra Hale asked for a sealed jar.');
 assert.equal(left,0);
 // Over budget, the newest are kept and the oldest left out; each is cut to `each` characters.
 const short=publishedRecaps(w.entries,C,70,50);
 assert.deepEqual(short.recaps.map(r=>r.title),['Session 13']);assert.equal(short.left,1);
 assert.ok(short.recaps[0].text.length<=51&&short.recaps[0].text.endsWith('…'));
 const p=storyPrompt({campaign:'The Salt Road',recaps:short.recaps,left:short.left,before:'They met [[ostra|Ostra Hale]].'});
 assert.match(p,/150 to 300 words/);assert.match(p,/Keep what still holds:\nThey met Ostra Hale\./);assert.match(p,/1 older recap is left out/);
 assert.match(p,/## Session 13 \(2026-11-12\)\nAt the Greyfen/);assert.doesNotMatch(p,/smuggler|draft nobody/);
 assert.equal(storyNow(world('Once upon a toll.').campaigns.find(c=>c.id===C)),'Once upon a toll.');
});

test('an AI app reads the recaps with read_recaps at any level, and the story_so_far prompt says how to use it',async()=>{
 const w=world('Once upon a toll.'),campaign=w.campaigns.find(c=>c.id===C);
 const ctx={book:w,campaign,maps:null,level:'read',perms:fromLevel('read'),connection:'Claude'};
 const r=await callTool(ctx,'read_recaps',{});
 assert.equal(r.isError,false);
 const out=JSON.parse(r.content[0].text.slice(r.content[0].text.indexOf('{')));
 assert.deepEqual(out.recaps.map(x=>x.title),['Session 12','Session 13']);assert.equal(out.storySoFar,'Once upon a toll.');
 assert.doesNotMatch(r.content[0].text,/smuggler/);
 const prompt=getPrompt(ctx,'story_so_far',{}).messages[0].content.text;
 assert.match(prompt,/Call read_recaps once/);assert.match(prompt,/Show it to me in the chat/);
});

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
  sent.push({url:req.url,body:req.method==='POST'?JSON.parse(await req.text()):null});
  const next=replies.shift();if(!next)throw Error('No more replies');
  return new Response(JSON.stringify(next),{status:200,headers:{'content-type':'application/json'}});
 };
 f.sent=sent;return f;
}

test('with an API key, RPG Tools writes it from the published recaps, counts the tokens and saves nothing',async()=>{
 const b=bucket(),store=new EncyclopediaStore(b);
 await store.save(OWNER,world('They met Ostra Hale.'),0);
 const c=await createApiConnection(b,OWNER,C,'Sonnet','helper',cleanApi({provider:'openai',model:'gpt-test',apiKey:'sk-test-1234567890abcd',limit:'2,000,000'}));
 const f=fakeFetch([{choices:[{message:{content:'  The party crossed the Salt Road and met Ostra Hale at the Greyfen landing.  '},finish_reason:'stop'}],usage:{total_tokens:1200}}]);
 const before=(await store.read(OWNER)).revision;
 const out=await writeStory(b,OWNER,C,c.id,f);
 assert.equal(out.text,'The party crossed the Salt Road and met Ostra Hale at the Greyfen landing.');
 assert.equal(out.from,2);assert.equal(out.by,'Sonnet');assert.equal(out.tokens,1200);
 const sent=JSON.stringify(f.sent[0].body);
 assert.match(sent,/Keep what still holds/);assert.match(sent,/Session 13/);assert.doesNotMatch(sent,/smuggler|draft nobody|hidden from players/);
 assert.equal((await listConnections(b,OWNER,C)).find(x=>x.id===c.id).api.used,1200);
 assert.equal((await store.read(OWNER)).revision,before,'nothing is saved: the GM reads it in the editor first');
 // With nothing published yet, it says what to do first.
 const empty=world();for(const e of empty.entries)if(e.recap)e.recap.status='draft';
 await store.save(OWNER,empty,before);
 await assert.rejects(writeStory(b,OWNER,C,c.id,fakeFetch([])),/Publish a session recap first/);
});
