import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createMaptableServer } from '../scripts/maptable-mcp.mjs';

const key='mt_'+'a'.repeat(64);
test('MCP only accepts safe origins and a campaign key',()=>{
  for(const url of ['http://remote.example','https://user:password@example.com','https://example.com/path','https://example.com/?key=x'])
    assert.throws(()=>createMaptableServer({url,key}));
  assert.throws(()=>createMaptableServer({url:'http://localhost:5173',key:'invalid'}));
});

test('real stdio MCP handshake, scoped reads, edits, roster, and permission errors',async()=>{
  let mode='edit',revision='r1',revoked=false; const writes=[];
  const http=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.headers.authorization!==`Bearer ${key}` || revoked){res.writeHead(401);return res.end('{}');}
    let body=''; for await(const chunk of req) body+=chunk;
    if(req.method==='POST'){
      if(mode==='read'){res.writeHead(403);return res.end('{}');}
      const data=JSON.parse(body);
      if(data.revision!==revision){res.writeHead(409);return res.end('{}');}
      writes.push({path:req.url,...data});revision=`r${writes.length+1}`;
      return res.end(JSON.stringify({revision,characterId:'hero',tokenId:'copy'}));
    }
    res.end(JSON.stringify({campaignId:'test',revision,mode,scenes:[{id:'scene',name:'Test'}],characters:[{id:'hero',rosterRole:'party'}]}));
  });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../scripts/maptable-mcp.mjs',import.meta.url))],env:{...process.env,MAPTABLE_URL:`http://127.0.0.1:${http.address().port}`,MAPTABLE_AGENT_KEY:key},stderr:'pipe'});
  const client=new Client({name:'test-client',version:'1.0.0'});
  try{
    await client.connect(transport);
    const tools=await client.listTools();assert.equal(tools.tools.length,8);
    const call=(name,args={})=>client.callTool({name,arguments:args});
    const data=result=>JSON.parse(result.content[0].text);
    const first=await call('read_campaign'); assert.equal(data(first).campaignId,'test',JSON.stringify(first));
    assert.equal(data(await call('read_scene',{sceneId:'scene'})).scene.name,'Test');
    assert.equal((await call('read_scene',{sceneId:'other-campaign'})).isError,true);
    assert.equal(data(await call('read_roster')).characters[0].id,'hero');
    await call('edit_maps',{revision,operations:[{action:'updateScene',sceneId:'scene',changes:{name:'Adjusted'}}]});
    assert.equal(writes[0].path,'/api/agent/maps');
    await call('create_character',{revision,role:'npc',token:{name:'Goblin'}});
    await call('update_character',{revision,characterId:'hero',changes:{hp:12}});
    await call('place_character',{revision,characterId:'hero',sceneId:'scene',x:70,y:70});
    await call('delete_character',{revision,characterId:'hero'});
    assert.deepEqual(writes.slice(1).map(x=>x.operation.action),['create','update','place','delete']);
    assert.equal((await call('delete_character',{revision:'r1',characterId:'hero'})).isError,true);
    mode='read';assert.equal((await call('create_character',{revision,role:'npc',token:{}})).isError,true);
    assert.equal(writes.length,5);
    revoked=true;const denied=await call('read_campaign');assert.equal(denied.isError,true);assert.ok(!JSON.stringify(denied).includes(key));
  } finally {await client.close();await new Promise(resolve=>http.close(resolve));}
});

