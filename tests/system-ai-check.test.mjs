import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {cleanApi,createApiConnection,listConnections}=await import('../lib/mcp/connections.ts');
const {survey,defaultOptions,editWorld,findWorld,allWorlds}=await import('../lib/encyclopedia/star-systems.ts');
const {cleanSystemChange,readSystemCheck,systemCheckPrompt,systemCheckRequest,systemCheckSchema,systemCheckTool}=await import('../lib/encyclopedia/system-check.ts');
const {checkSystem}=await import('../lib/ai/system-checker.ts');

const C='demo-campaign',OWNER='gm-1',NOW='2026-11-16T10:00:00.000Z';
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
 const f=async(url,init={})=>{const req=url instanceof Request?url:new Request(url,init);sent.push(JSON.parse(await req.text()));const [status,body]=Array.isArray(replies[0])?replies.shift():[200,replies.shift()];return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});};
 f.sent=sent;return f;
}
const oaCall=args=>({choices:[{message:{content:null,tool_calls:[{id:'call_1',type:'function',function:{name:'send_check',arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}],usage:{total_tokens:700}});
const userText=body=>body.messages.find(m=>m.role==='user').content;

const kel=()=>{
 const s=survey({name:'Kel',star:'K',companions:[{star:'M',separation:'wide'}],premise:'A mining frontier',options:{...defaultOptions(),holders:['guild']},backdrop:'nebula',seed:'kel'});
 const w=s.bodies[0];
 return {s:{...editWorld(s,w.id,{note:'The **old** mines.',holderId:'guild'}),hooks:s.hooks.map(h=>h.kind==='secret'?{...h,text:'The star is dying.'}:h)},w};
};

test('the survey goes out in words: star, zones, every world with its id, belts and hooks, never the secret',()=>{
 const {s,w}=kel(),r=systemCheckRequest(s,'Kel',id=>id==='guild'?'The Guild':undefined);
 assert.equal(systemCheckSchema.safeParse({...r,pages:[]}).success,true);
 assert.match(r.star,/^Class K orange star, .* with a class M .* companion far out\. Green zone .* AU, frost line .* AU\.$/);
 assert.equal(r.worlds.length,allWorlds(s).length,'moons are in too');
 const line=r.worlds.find(x=>x.id===w.id).line;
 assert.match(line,new RegExp(`^${w.name} \\[${w.id}\\]: `));
 assert.match(line,/held by The Guild/);assert.match(line,/Notes: The old mines\./);
 assert.deepEqual(r.hooks.map(h=>h.split(':')[0]),['Lure','Danger']);
 assert.doesNotMatch(JSON.stringify(r),/dying/);
 const text=systemCheckPrompt({...r,pages:[],note:'Keep it grim.'},{name:'Greyfen'},[]);
 assert.match(text,/^Campaign: Greyfen/);assert.match(text,/Star system: Kel\. Class K/);assert.match(text,/Science: Realistic\./);
 assert.match(text,/- air: none, thin, standard, dense, crushing, toxic/);
 assert.match(text,/What the GM wants: Keep it grim\./);assert.match(text,/check plausibility only/);
 assert.match(systemCheckPrompt({...r,pages:[]},{name:'G'},[{title:'The Reach',kind:'galaxy',text:''}],true),/^Check this star system[\s\S]*read_page tool: The Reach\./);
});

test('a big system leaves out notes to stay small',()=>{
 const {s}=kel(),long='x'.repeat(4000);
 const big={...s,bodies:s.bodies.map(b=>({...b,note:long,moons:Array.from({length:12},(_,i)=>({...(b.moons[0]??{...b,rings:undefined}),id:`${b.id}m${i}`,name:`${b.name} ${i}`,note:long}))}))};
 const r=systemCheckRequest(big,'Kel');
 assert.ok(r.worlds.reduce((n,x)=>n+x.line.length,0)<=40_000);
 assert.doesNotMatch(r.worlds[0].line,/Notes:/);
 assert.ok(JSON.stringify({...r,pages:[]}).length<60_000,'fits the route');
});

test('fixes are kept only for worlds that were sent, fields that exist and values in range, never on what fits',()=>{
 const {s,w}=kel(),r={...systemCheckRequest(s,'Kel'),pages:[]},ids=new Set(r.worlds.map(x=>x.id));
 assert.deepEqual(cleanSystemChange(w.id,'air','Dense',ids),{world:w.id,field:'air',value:'dense'});
 assert.deepEqual(cleanSystemChange(w.id,'temp','-400 °C',ids),{world:w.id,field:'temp',value:-273});
 assert.deepEqual(cleanSystemChange(w.id,'gravity',1.234,ids),{world:w.id,field:'gravity',value:1.23});
 assert.equal(cleanSystemChange(w.id,'air','plasma',ids),null);
 assert.equal(cleanSystemChange('nope','air','thin',ids),null);
 assert.equal(cleanSystemChange(w.id,'kind','gas',ids),null);
 const out=readSystemCheck({findings:[
  {title:'Too warm',fit:'doesnt',text:'Too close for that air.',change:{world:w.id,field:'air',value:'thin'}},
  {title:'Fine',fit:'fits',text:'Good.',change:{world:w.id,field:'life',value:'none'}},
  {title:'Ghost',fit:'stretch',text:'Odd.',change:{world:'ghost',field:'life',value:'none'}},
  {title:'',fit:'fits',text:'No title.'},
 ]},r);
 assert.equal(out.verdict,'doesnt');
 assert.deepEqual(out.findings.map(f=>f.title),['Too warm','Fine','Ghost']);
 assert.deepEqual(out.findings[0].change,{world:w.id,field:'air',value:'thin'});
 assert.equal(out.findings[1].change,undefined);assert.equal(out.findings[2].change,undefined);
 assert.deepEqual(systemCheckTool(r).inputSchema.properties.findings.items.properties.change.properties.world.enum,r.worlds.map(x=>x.id));
 const fixed=editWorld(s,w.id,{air:'thin'});
 assert.equal(findWorld(fixed,w.id).air,'thin');assert.ok(findWorld(fixed,w.id).edited.includes('air'),'an applied fix is marked as edited');
});

test('checking uses the GM’s own key with the pages it may read, saves nothing and counts the tokens',async()=>{
 const b=bucket(),ws=demoWorkspace(),c=ws.campaigns.find(x=>x.id===C);
 ws.entries.push({id:'reach',worldId:c.worldId,campaignId:C,parentId:null,title:'The Veiled Reach',kind:'lore',body:'Most worlds here are cold.',overviewVisibility:'players',updatedAt:NOW});
 await new EncyclopediaStore(b).save(OWNER,ws,0);
 const conn=await createApiConnection(b,OWNER,C,'Helper','helper',cleanApi({provider:'openai',model:'gpt-test',apiKey:'sk-test-1234567890abcd',limit:'100,000'}));
 const {s,w}=kel(),r={...systemCheckRequest(s,'Kel'),pages:['reach','missing']};
 const before=JSON.stringify((await new EncyclopediaStore(b).read(OWNER)).data);
 const f=fakeFetch([oaCall({verdict:'stretch',findings:[{title:'The Reach',fit:'stretch',text:'Warmer than the Reach.',quote:'Most worlds here are cold.',page:'The Veiled Reach',change:{world:w.id,field:'temp',value:-30}}]})]);
 const out=await checkSystem(b,OWNER,C,{connectionId:conn.id,apiKey:'sk-test-1234567890abcd'},r,f);
 assert.equal(out.findings[0].change.value,-30);assert.equal(out.skipped,1);assert.equal(out.tokens,700);
 assert.match(userText(f.sent[0]),/### The Veiled Reach \(lore\)\nMost worlds here are cold\./);
 assert.equal((await listConnections(b,OWNER,C))[0].api.used,700);
 assert.equal(JSON.stringify((await new EncyclopediaStore(b).read(OWNER)).data),before);
 await assert.rejects(checkSystem(b,OWNER,C,{connectionId:conn.id,apiKey:'sk-test-1234567890abcd'},r,fakeFetch([oaCall({verdict:'fits',findings:[]})])),/didn't send a check/);
});
