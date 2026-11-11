import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createEncyclopediaServer} from '../scripts/encyclopedia-mcp.mjs';
const key='enc_'+'a'.repeat(64);
test('encyclopedia MCP rejects remote HTTP and malformed keys',()=>{
 assert.throws(()=>createEncyclopediaServer({url:'http://example.com',key}));
 assert.throws(()=>createEncyclopediaServer({url:'https://example.com/path',key}));
 assert.throws(()=>createEncyclopediaServer({url:'https://example.com',key:'invalid'}));
});
test('encyclopedia MCP lists read-only tools and downloads large responses without bearer credentials',async()=>{
 const calls=[];
 const server=createEncyclopediaServer({url:'https://example.com',key,fetchImpl:async(url,options)=>{
  calls.push({url:String(url),options});
  return Response.json(calls.length===1?{downloadUrl:'https://bucket.example/signed'}:{result:{content:[{type:'text',text:'campaign data'}]}});
 }});
 const client=new Client({name:'test',version:'1.0'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(a);await client.connect(b);
  const listed=await client.listTools();assert.equal(listed.tools.length,4);assert.ok(listed.tools.every(t=>t.annotations.readOnlyHint));
  const result=await client.callTool({name:'read_campaign',arguments:{campaign_id:'one'}});
  assert.equal(result.content[0].text,'campaign data');assert.equal(calls[0].options.headers.Authorization,`Bearer ${key}`);
  assert.equal(calls[1].options.headers,undefined);assert.equal(calls[1].options.credentials,'omit');assert.equal(calls[1].options.redirect,'error');
 }finally{await client.close();await server.close();}
});
