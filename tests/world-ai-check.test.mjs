import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {cleanApi,createApiConnection,listConnections,permsOf,updateConnection}=await import('../lib/mcp/connections.ts');
const {cleanChange,readWorldCheck,worldCheckPrompt,worldCheckSchema,worldCheckTool}=await import('../lib/encyclopedia/world-check.ts');
const {checkWorld}=await import('../lib/ai/world-checker.ts');

const C='demo-campaign',OWNER='gm-1',NOW=new Date('2026-11-16T10:00:00Z');
function world(){
 const w=demoWorkspace(),at=NOW.toISOString(),c=w.campaigns.find(x=>x.id===C);
 w.entries.push(
  {id:'reach',worldId:c.worldId,campaignId:C,parentId:null,title:'The Veiled Reach',kind:'lore',body:'Few worlds in the **Reach** know warmth. Most are old, cold and dim, and their seas lie under ice.',overviewVisibility:'players',updatedAt:at},
  {id:'secret',worldId:c.worldId,campaignId:C,parentId:null,title:'The Drowned Sun',kind:'lore',body:'The star is dying, and the Concord hides it.',overviewVisibility:'gm',updatedAt:at},
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
  sent.push(JSON.parse(await req.text()));
  const [status,body]=Array.isArray(replies[0])?replies.shift():[200,replies.shift()];
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 };
 f.sent=sent;return f;
}
const oaCall=args=>({choices:[{message:{content:null,tool_calls:[{id:'call_1',type:'function',function:{name:'send_check',arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}],usage:{total_tokens:900}});
const userText=body=>body.messages.find(m=>m.role==='user').content;
async function setup(){
 const b=bucket();
 await new EncyclopediaStore(b).save(OWNER,world(),0);
 const connection=await createApiConnection(b,OWNER,C,'Sonnet','helper',cleanApi({provider:'openai',model:'gpt-test',apiKey:'sk-test-1234567890abcd',limit:'100,000'}));
 return {b,connection};
}

const request=worldCheckSchema.parse({
 name:'Frostholme',what:'a whole planet, 24,900 miles around',
 settings:[{id:'temp',value:1,words:'Warm'},{id:'rain',value:50,words:'Average'},{id:'rotation',value:'spin',words:'Spins'},{id:'water',value:70,words:'70% sea'}],
 summary:['Land 31% of the surface, ice 4%.','12 towns and 8 rivers.'],
 pages:['reach','secret'],note:'A frontier world settlers struggle to tame.',
});
const answer={verdict:'stretch',findings:[
 {title:'The Veiled Reach',fit:'stretch',text:'Your galaxy page describes cold, icy worlds. This one is warm with open seas.',quote:'Most are old, cold and dim',page:'The Veiled Reach',change:{setting:'temp',value:-2}},
 {title:'Climate bands',fit:'fits',text:'Dry belts near 30° match a spinning world.',change:{setting:'rain',value:10}},
 {title:'Gravity',fit:'stretch',text:'Fine.',change:{setting:'tilt',value:0}},
 {title:'',fit:'fits',text:'No title.'},
 {title:'Odd',fit:'maybe',text:'Not a verdict.'},
]};

test('the prompt gives each setting in words and numbers with its scale, the map, the GM’s note and each page',()=>{
 const text=worldCheckPrompt(request,{name:'Greyfen',description:'A [[frontier]] campaign.'},[{title:'The Veiled Reach',kind:'lore',text:'Few worlds know warmth.'}]);
 assert.match(text,/^Campaign: Greyfen\. A frontier campaign\./);
 assert.match(text,/World: Frostholme, a whole planet, 24,900 miles around\./);
 assert.match(text,/- Temperature: Warm \(temp = 1; -3 frozen, .* 3 scorching\)/);
 assert.match(text,/- Water: 70% sea \(water = 70;/);
 assert.match(text,/- 12 towns and 8 rivers\./);
 assert.match(text,/What the GM wants: A frontier world settlers struggle to tame\./);
 assert.match(text,/### The Veiled Reach \(lore\)\nFew worlds know warmth\./);
 assert.doesNotMatch(text,/read_page/);
 const app=worldCheckPrompt(request,{name:'Greyfen'},[{title:'The Veiled Reach',kind:'lore',text:''}],true);
 assert.match(app,/^Check this world map/);
 assert.match(app,/read_page tool: The Veiled Reach\./);
 assert.match(worldCheckPrompt({...request,pages:[]},{name:'Greyfen'},[]),/check plausibility only/);
});

test('suggested changes are kept only for settings that were sent, within their range, and never on what already fits',()=>{
 assert.deepEqual(cleanChange('temp',-7),{setting:'temp',value:-3});
 assert.deepEqual(cleanChange('rain','22%'),{setting:'rain',value:22});
 assert.deepEqual(cleanChange('rotation','Locked'),{setting:'rotation',value:'locked'});
 assert.equal(cleanChange('rotation','sideways'),null);
 assert.equal(cleanChange('gravity',2),null);
 const out=readWorldCheck(answer,request);
 assert.equal(out.verdict,'stretch');
 assert.deepEqual(out.findings.map(f=>f.title),['The Veiled Reach','Climate bands','Gravity']);
 assert.deepEqual(out.findings[0].change,{setting:'temp',value:-2});
 assert.equal(out.findings[0].page,'The Veiled Reach');
 assert.equal(out.findings[1].change,undefined,'what fits needs no change');
 assert.equal(out.findings[2].change,undefined,'tilt was not one of the settings sent');
 assert.equal(readWorldCheck({findings:[{title:'A',fit:'doesnt',text:'x'}]},request).verdict,'doesnt','the verdict follows the findings when none is given');
 const tool=worldCheckTool(request);
 assert.deepEqual(tool.inputSchema.properties.findings.items.properties.change.properties.setting.enum,['temp','rain','rotation','water']);
});

test('checking calls the GM’s own key with the pages it may read, returns findings, saves nothing and counts the tokens',async()=>{
 const {b,connection}=await setup();
 const before=JSON.stringify((await new EncyclopediaStore(b).read(OWNER)).data);
 const f=fakeFetch([oaCall(answer)]);
 const out=await checkWorld(b,OWNER,C,connection.id,request,f);
 assert.equal(out.findings.length,3);assert.equal(out.by,'Sonnet');assert.equal(out.model,'gpt-test');assert.equal(out.tokens,900);assert.equal(out.skipped,0);
 assert.match(userText(f.sent[0]),/### The Veiled Reach \(lore\)\nFew worlds in the Reach know warmth\./);
 assert.match(userText(f.sent[0]),/The Drowned Sun/);
 assert.equal(f.sent[0].tools[0].function.name,'send_check');
 assert.equal((await listConnections(b,OWNER,C))[0].api.used,900);
 assert.equal(JSON.stringify((await new EncyclopediaStore(b).read(OWNER)).data),before,'nothing is saved');
});

test('a players-only connection never reads GM-only pages, and failures say so while spent tokens still count',async()=>{
 const {b,connection}=await setup();
 await updateConnection(b,OWNER,C,connection.id,{perms:{...permsOf(connection),seeSecrets:'off'}});
 const f=fakeFetch([oaCall(answer)]);
 const out=await checkWorld(b,OWNER,C,connection.id,request,f);
 assert.equal(out.skipped,1);
 assert.doesNotMatch(userText(f.sent[0]),/Drowned Sun|dying/);
 await assert.rejects(checkWorld(b,OWNER,C,connection.id,request,fakeFetch([oaCall({verdict:'fits',findings:[]})])),/didn't send a check/);
 assert.equal((await listConnections(b,OWNER,C))[0].api.used,1800);
 await assert.rejects(checkWorld(b,OWNER,C,'nope',request,fakeFetch([])),/was removed/);
 await assert.rejects(checkWorld(b,OWNER,C,connection.id,request,fakeFetch([[401,{error:{message:'Bad key'}}]])));
});
