import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {LATEST_PROTOCOL_VERSION} from '@modelcontextprotocol/sdk/types.js';
import {demoWorkspace,campaignExport} from '../lib/encyclopedia/world-model.ts';
import {handleMcp} from '../lib/mcp/protocol.ts';
import {listTools} from '../lib/mcp/tools.ts';

// Antigravity and Gemini CLI connect with an MCP SDK Streamable HTTP client and hand each tool to Gemini as a function.
function context(level){
 const book=campaignExport(demoWorkspace(),'demo-campaign');
 return {book,campaign:book.campaigns[0],maps:null,level};
}
async function serve(level){
 const http=createServer(async(req,res)=>{
  const reply=req.method==='POST'?await (async()=>{let raw='';for await(const c of req)raw+=c;const r=await handleMcp(raw,async()=>context(level));return r.body===null?new Response(null,{status:202}):Response.json(r.body,{status:r.status});})():new Response(null,{status:405,headers:{Allow:'POST'}}); // as notAllowed in lib/mcp/http.ts
  res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(Buffer.from(await reply.arrayBuffer()));
 });
 await new Promise(r=>http.listen(0,'127.0.0.1',r));
 return http;
}

test('a current SDK client (as in Antigravity and Gemini CLI) connects over Streamable HTTP with the key in the URL',async()=>{
 const http=await serve('read');
 const client=new Client({name:'antigravity-like',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${http.address().port}/api/mcp/rpg_${'a'.repeat(64)}`));
 try{
  await client.connect(transport);
  assert.equal(transport.protocolVersion,LATEST_PROTOCOL_VERSION,'the version the client asks for first is spoken back');
  const {tools}=await client.listTools();assert.ok(tools.length>5);
  const r=await client.callTool({name:'campaign_overview',arguments:{}});
  assert.ok(!r.isError);assert.match(r.content[0].text,/The Salt Road/);
 }finally{await client.close();http.close();}
});

test('every tool fits Gemini function calling once Antigravity prefixes it',()=>{
 // Antigravity registers tools as mcp_<server>_<tool>; Gemini function names are at most 64 of [A-Za-z0-9_.:-].
 const ok=new Set(['type','description','properties','required','items','enum','minimum','maximum','minLength','maxLength','minItems','maxItems','pattern','additionalProperties','title','format','nullable','default','anyOf']);
 const walk=(s,where)=>{
  for(const [k,v] of Object.entries(s)){
   assert.ok(ok.has(k),`${where} uses ${k}, which Gemini may reject`);
   if(k==='type')assert.equal(typeof v,'string',`${where}: one type per field`);
   if(k==='enum')assert.ok(v.every(e=>typeof e==='string'),`${where}: Gemini enums are strings`);
   if(k==='properties')for(const [p,sub] of Object.entries(v))walk(sub,`${where}.${p}`);
   if(k==='items')walk(v,`${where}[]`);
   if(k==='anyOf')v.forEach((sub,i)=>walk(sub,`${where}|${i}`));
  }
 };
 for(const t of listTools('run')){
  assert.match(`mcp_rpg-tools_${t.name}`,/^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/);
  assert.equal(t.inputSchema.type,'object');walk(t.inputSchema,t.name);
 }
});
