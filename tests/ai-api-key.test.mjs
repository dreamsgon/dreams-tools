import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {initialWorkspace,newScene,newToken}=await import('../lib/model.ts');
const {saveWorkspace}=await import('../lib/workspace-storage.ts');
const {cleanApi,createApiConnection,grantFor,listConnections,publicConnection,revokeConnection,updateApi,overLimit,addUsage}=await import('../lib/mcp/connections.ts');
const {readActivity}=await import('../lib/mcp/activity.ts');
const {cleanBaseUrl,cleanLimit,baseUrlFor,providers}=await import('../lib/ai/providers.ts');
const {lock,unlock,cleanApiKey,LockedKeyError}=await import('../lib/ai/secret.ts');
const {listModels,runChat,ProviderError}=await import('../lib/ai/chat.ts');
const {chatTurn,cleanHistory}=await import('../lib/ai/run.ts');

function bucket(){
 const data=new Map();let n=0;
 return {data,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){
   const v=data.get(k);
   if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;
   if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;
   data.set(k,{text,etag:String(++n)});return {etag:String(n)};
  },
  async delete(k){data.delete(k);},
  async list(){return {objects:[],truncated:false};},
 };
}
const OWNER='gm-1',CAMPAIGN='demo-campaign',PREFIX=`users/${OWNER}/`,KEY='sk-test-1234567890abcd';
function table(){
 const w=initialWorkspace();
 w.collections=[{id:'mt-salt',name:'The Salt Road',kind:'campaign',parentId:null}];
 w.conditions=[{id:'restrained',name:'Restrained',color:'#aa66cc',icon:''}];
 const s=newScene('Greyfen marsh');s.containerId='mt-salt';s.width=700;s.height=700;
 s.grid={...s.grid,type:'square',size:70,offsetX:0,offsetY:0,units:5,unit:'ft',diagonal:'equal',snap:true};
 s.tokens=[Object.assign(newToken('Bram'),{id:'bram',x:105,y:105,hp:31,maxHp:31}),Object.assign(newToken('Bog Hag'),{id:'hag',x:385,y:315,hp:40,maxHp:40,disposition:'enemy'})];
 w.scenes=[s];w.activeId=s.id;return w;
}
async function setup(provider='openai',how='helper',extra={}){
 const b=bucket(),book=demoWorkspace();
 book.campaigns=book.campaigns.map(c=>c.id===CAMPAIGN?{...c,maptableCampaignId:'mt-salt'}:c);
 await new EncyclopediaStore(b).save(OWNER,book,0);await saveWorkspace(b,PREFIX,table(),null);
 const connection=await createApiConnection(b,OWNER,CAMPAIGN,undefined,how,cleanApi({provider,model:provider==='anthropic'?'claude-opus-5-5':'gpt-test',apiKey:KEY,limit:'2,000,000',...extra}));
 return {b,connection};
}
/** A fake provider: answers each request with the next reply, and records what was sent. */
function fakeFetch(replies){
 const sent=[];
 const f=async(url,init={})=>{
  const req=url instanceof Request?url:new Request(url,init);
  sent.push({url:req.url,headers:Object.fromEntries(req.headers),body:req.method==='POST'?JSON.parse(await req.text()):null});
  const next=replies.shift();if(!next)throw Error('No more replies');
  const [status,body]=Array.isArray(next)?next:[200,next];
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','request-id':'req_1'}});
 };
 f.sent=sent;return f;
}
const oaCall=(name,args,id='call_1')=>({choices:[{message:{content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}],usage:{total_tokens:100}});
const oaSay=text=>({choices:[{message:{content:text},finish_reason:'stop'}],usage:{total_tokens:50}});

test('the address for Other must be public https, and limits are tokens',()=>{
 assert.equal(cleanBaseUrl('https://api.example.com/v1/'),'https://api.example.com/v1');
 for(const bad of ['http://api.example.com/v1','https://localhost:8080/v1','https://10.0.0.5/v1','https://192.168.1.2/v1','https://172.20.0.1','https://[::1]/v1','https://user:pw@api.example.com','https://intranet/v1','https://box.local/v1','https://api.example.com/v1?key=1','ftp://x.com'])
  assert.throws(()=>cleanBaseUrl(bad),undefined,bad);
 assert.equal(cleanLimit('2,000,000'),2_000_000);assert.equal(cleanLimit(''),null);assert.throws(()=>cleanLimit(5));
 assert.equal(baseUrlFor('xai'),'https://api.x.ai/v1');assert.equal(baseUrlFor('google'),'https://generativelanguage.googleapis.com/v1beta/openai');
 assert.ok(providers.some(p=>p.id==='google'&&p.name==='Google AI Studio'));
});

test('keys are stored locked, shown only by their last four characters, and need the same secret to open',async()=>{
 const locked=lock(KEY);assert.ok(locked.startsWith('v1:'));assert.ok(!locked.includes(KEY));assert.equal(unlock(locked),KEY);
 assert.throws(()=>unlock(locked,{AI_KEY_SECRET:'another'}),LockedKeyError);
 assert.throws(()=>cleanApiKey('has spaces in it'));assert.throws(()=>cleanApiKey('short'));
 const {b,connection}=await setup();
 assert.equal(connection.name,'GPT');assert.equal(connection.mode,'helper');assert.equal(connection.api.last4,'abcd');assert.equal(connection.api.limit,2_000_000);
 assert.equal(connection.api.key,undefined);assert.equal(connection.hash,undefined);
 for(const {text} of b.data.values())assert.ok(!text.includes(KEY),'the plain key is never saved');
 assert.equal(await grantFor(b,'rpg_'+'0'.repeat(64)),null);
 const swapped=await updateApi(b,OWNER,CAMPAIGN,connection.id,{model:'gpt-other',limit:null,apiKey:'sk-new-key-0000wxyz'});
 assert.equal(swapped.api.model,'gpt-other');assert.equal(swapped.api.limit,null);assert.equal(swapped.api.last4,'wxyz');
 assert.equal(unlock((await listConnections(b,OWNER,CAMPAIGN))[0].api.key),'sk-new-key-0000wxyz');
 assert.equal(await revokeConnection(b,OWNER,CAMPAIGN,connection.id),true);assert.equal((await listConnections(b,OWNER,CAMPAIGN)).length,0);
});

test('model lists come from the provider, and a refused key says so without echoing it',async()=>{
 const f=fakeFetch([{data:[{id:'models/gemini-pro'},{id:'gemini-flash'},{id:'gemini-flash'}]}]);
 assert.deepEqual(await listModels({provider:'google',key:KEY},f),['gemini-pro','gemini-flash']);
 assert.equal(f.sent[0].url,'https://generativelanguage.googleapis.com/v1beta/openai/models');assert.equal(f.sent[0].headers.authorization,`Bearer ${KEY}`);
 const refused=fakeFetch([[401,{error:{message:`Incorrect API key provided: ${KEY}`}}]]);
 await assert.rejects(listModels({provider:'openai',key:KEY},refused),e=>e instanceof ProviderError&&/refused the API key/.test(e.message)&&!e.message.includes(KEY));
 const claude=fakeFetch([{data:[{id:'claude-opus-5-5',type:'model',display_name:'Claude Opus 5.5',created_at:'2026-10-01T00:00:00Z'}],has_more:false,first_id:'claude-opus-5-5',last_id:'claude-opus-5-5'}]);
 assert.deepEqual(await listModels({provider:'anthropic',key:KEY},claude),['claude-opus-5-5']);
 assert.equal(claude.sent[0].headers.authorization,`Bearer ${KEY}`);
});

test('an OpenAI-style chat calls RPG Tools tools until it answers, and a model without tools still answers',async()=>{
 const tools=[{name:'campaign_overview',title:'Campaign overview',description:'Overview',inputSchema:{type:'object',properties:{}},readOnly:true}];
 const ran=[];const run=async(name,args)=>{ran.push([name,args]);return {text:'{"name":"The Salt Road"}',isError:false};};
 const f=fakeFetch([oaCall('campaign_overview',{}),oaSay('It is The Salt Road.')]);
 const r=await runChat({provider:'xai',key:KEY,model:'grok-test'},'SYSTEM',[{role:'user',text:'What campaign is this?'}],tools,run,f);
 assert.equal(r.reply,'It is The Salt Road.');assert.equal(r.tokens,150);assert.deepEqual(ran,[['campaign_overview',{}]]);
 assert.equal(r.steps[0].title,'Campaign overview');
 assert.equal(f.sent[0].url,'https://api.x.ai/v1/chat/completions');assert.equal(f.sent[0].body.messages[0].role,'system');assert.equal(f.sent[0].body.tools[0].function.name,'campaign_overview');
 const second=f.sent[1].body.messages;assert.equal(second.at(-1).role,'tool');assert.equal(second.at(-1).tool_call_id,'call_1');assert.equal(second.at(-2).tool_calls[0].function.name,'campaign_overview');
 const plain=fakeFetch([[400,{error:{message:'This model does not support tools'}}],oaSay('Hello.')]);
 const p=await runChat({provider:'deepseek',key:KEY,model:'r1'},'S',[{role:'user',text:'Hi'}],tools,run,plain);
 assert.equal(p.reply,'Hello.');assert.equal(p.toolsOff,true);assert.equal(plain.sent[1].body.tools,undefined);
});

test('the Anthropic chat sends tool results back and asks for the default fallback',async()=>{
 const msg=(content,stop,extra={})=>({id:'msg_1',type:'message',role:'assistant',model:'claude-opus-5-5',content,stop_reason:stop,stop_sequence:null,usage:{input_tokens:10,output_tokens:5},...extra});
 const f=fakeFetch([msg([{type:'tool_use',id:'tu_1',name:'read_scene',input:{}}],'tool_use'),msg([{type:'text',text:'Bram is at B2.'}],'end_turn')]);
 const tools=[{name:'read_scene',title:'Read a scene',description:'Scene',inputSchema:{type:'object',properties:{}},readOnly:true}];
 const r=await runChat({provider:'anthropic',key:KEY,model:'claude-opus-5-5'},'SYS',[{role:'user',text:'Where is Bram?'}],tools,async()=>({text:'Bram B2',image:{data:'AAAA',mimeType:'image/jpeg'},isError:false}),f);
 assert.equal(r.reply,'Bram is at B2.');assert.equal(r.tokens,30);
 const first=f.sent[0];assert.equal(first.url,'https://api.anthropic.com/v1/messages');assert.equal(first.body.fallbacks,'default');assert.match(first.headers['anthropic-beta'],/server-side-fallback-2026-07-01/);
 assert.equal(first.body.temperature,undefined);
 const result=f.sent[1].body.messages.at(-1).content[0];assert.equal(result.type,'tool_result');assert.equal(result.tool_use_id,'tu_1');assert.equal(result.content[0].type,'image');
 const refused=fakeFetch([msg([],'refusal')]);
 assert.equal((await runChat({provider:'anthropic',key:KEY,model:'claude-opus-5-5'},'S',[{role:'user',text:'x'}],[],async()=>({text:'',isError:false}),refused)).reply,'The AI declined to answer that.');
});

test('in the AI panel, a helper suggestion waits for the GM, tokens are counted, and the limit stops it',async()=>{
 assert.throws(()=>cleanHistory([{role:'assistant',text:'hi'}]),/Ask something/);
 assert.deepEqual(cleanHistory([{role:'assistant',text:'Hello'},{role:'user',text:'Hi'}]),[{role:'user',text:'Hi'}]);
 const {b,connection}=await setup('openai','helper');
 const f=fakeFetch([oaCall('set_condition',{token:'Bram',condition:'Restrained',on:true}),oaSay('Bram is grabbed. Approve Restrained below.')]);
 const r=await chatTurn(b,OWNER,CAMPAIGN,connection.id,[{role:'user',text:'The hag grabs Bram'}],'Greyfen marsh',f);
 assert.equal(r.steps[0].ok,true);assert.ok(r.steps[0].waiting,'set to Ask me, so it waits');assert.match(r.steps[0].summary,/Restrained/);
 assert.match(f.sent[0].body.messages[0].content,/Greyfen marsh/);
 assert.ok(!f.sent[0].body.tools.some(t=>t.function.name==='move_token'),'Off tools are not offered');
 const log=await readActivity(b,OWNER,CAMPAIGN);assert.equal(log.entries.find(e=>e.id===r.steps[0].waiting).connection,'GPT');
 assert.equal(r.api.used,150);
 await addUsage(b,OWNER,CAMPAIGN,connection.id,2_000_000);
 const [c]=await listConnections(b,OWNER,CAMPAIGN);assert.equal(overLimit(c.api),true);assert.equal(publicConnection(c).api.used,2_000_150);
 await assert.rejects(chatTurn(b,OWNER,CAMPAIGN,connection.id,[{role:'user',text:'More'}],undefined,fakeFetch([])),/used this month's 2,000,000 tokens/);
 const next=await addUsage(b,OWNER,CAMPAIGN,connection.id,1,new Date('2099-01-01T00:00:00Z'));assert.equal(next.api.used,1,'a new month starts at zero');
});
