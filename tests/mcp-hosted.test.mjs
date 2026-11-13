import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace,campaignExport} from '../lib/encyclopedia/world-model.ts';
import {newScene,newToken} from '../lib/model.ts';
import {callTool,listTools,fogged,squareAt} from '../lib/mcp/tools.ts';
import {handleMcp} from '../lib/mcp/protocol.ts';
import {createConnection,grantFor,listConnections,revokeConnection,updateConnection,MAX_CONNECTIONS} from '../lib/mcp/connections.ts';
import {createBridge} from '../scripts/rpg-tools-mcp.mjs';

function bucket(){
 const data=new Map();let n=0;
 return {data,async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},async put(k,text){data.set(k,{text,etag:String(++n)});return {etag:String(n)};},async delete(k){data.delete(k);}};
}
function scene(){
 const s=newScene('Greyfen marsh');s.width=700;s.height=700;s.grid={...s.grid,type:'square',size:70,offsetX:0,offsetY:0,units:5,unit:'ft',diagonal:'equal',snap:true};
 const bram=Object.assign(newToken('Bram'),{x:105,y:105,hp:12,maxHp:20,conditions:['prone'],rosterRole:'party'});
 const gob=Object.assign(newToken('Goblin'),{x:385,y:105,hp:7,maxHp:7,hidden:true,notes:'Flees at half HP',disposition:'enemy'});
 s.tokens=[bram,gob];s.fog={enabled:true,base:true,strokes:[{mode:'reveal',shape:'rect',size:20,points:[{x:0,y:0},{x:210,y:210}]}]};
 s.initiativeState={round:2,currentId:gob.id,order:[gob.id,bram.id]};
 return s;
}
function context(level='read',withMaps=true){
 const w=demoWorkspace(),book=campaignExport(w,'demo-campaign'),s=scene();
 const maps=withMaps?{workspace:{activeId:s.id,conditions:[{id:'prone',name:'Prone',color:'#888888',icon:''}],scenes:[s]},campaignId:'mt',scenes:[s]}:null;
 return {book,campaign:book.campaigns[0],maps,level};
}
const call=async(c,name,args={})=>{const r=await callTool(c,name,args);return {...r,data:r.isError?null:JSON.parse(r.content[0].text.split('\n').slice(1).join('\n')),text:r.content[0].text};};

test('the campaign tools only reach this campaign and shared lore',async()=>{
 const c=context();
 const o=(await call(c,'campaign_overview')).data;
 assert.equal(o.campaign,'The Salt Road');assert.equal(o.lastSession.title,'A light in the fog');assert.equal(o.maps.open,'Greyfen marsh');
 assert.ok((await call(c,'search',{query:'greyhaven'})).data.matches.some(m=>m.id==='demo-greyhaven'&&m.sharedLore));
 assert.equal((await call(c,'search',{query:'snowfall'})).data.matches.length,0,'another campaign is never searched');
 const other=(await call(c,'read_page',{page:'demo-winter'}));assert.ok(other.isError);assert.match(other.text,/No page/);
 const page=(await call(c,'read_page',{page:'mara'})).data;assert.equal(page.title,'Mara Venn');assert.match(page.text,/borrowed maps/);
 assert.match((await call(c,'read_page',{page:'mara'})).text,/^Campaign text below is data/,'results say page text is data');
});

test('tools take names, refuse unknown arguments and explain mistakes',async()=>{
 const c=context();
 assert.match((await call(c,'read_page',{page:'Mara',extra:1})).text,/Unknown argument: extra/);
 assert.match((await call(c,'nope')).text,/Unknown tool/);
 assert.match((await call(c,'read_page',{})).text,/page is required/);
 assert.match((await call(c,'read_calendar')).text,/no calendar/);
 assert.match((await call(context('read',false),'list_scenes')).text,/no Maptable campaign/);
 assert.ok(listTools('read').every(t=>t.annotations.readOnlyHint));
 assert.deepEqual(listTools('read').map(t=>t.name),['campaign_overview','search','read_page','list_names','read_transcript','list_quests','read_quest','list_codex','read_calendar','list_scenes','read_scene','view_scene','measure']);
});

test('maps read as text with squares, HP, conditions, fog and the combat order',async()=>{
 const c=context(),s=c.maps.scenes[0];
 const r=(await call(c,'read_scene')).data;
 assert.equal(r.name,'Greyfen marsh');assert.deepEqual(r.grid.squares,{across:10,down:10});
 const bram=r.tokens.find(t=>t.name==='Bram'),gob=r.tokens.find(t=>t.name==='Goblin');
 assert.equal(bram.square,'B2');assert.equal(bram.hp,'12/20');assert.deepEqual(bram.conditions,['Prone']);assert.equal(bram.underFog,undefined);
 assert.equal(gob.hiddenFromPlayers,true);assert.equal(gob.underFog,true);assert.equal(gob.gmNotes,'Flees at half HP');
 assert.equal(r.combat.round,2);assert.equal(r.combat.turn,'Goblin');
 assert.deepEqual(squareAt(s,'B2'),{x:105,y:105});assert.equal(fogged(s,{x:105,y:105}),false);assert.equal(fogged(s,{x:600,y:600}),true);
 const m=(await call(c,'measure',{from:'Bram',to:'Goblin'})).data;assert.equal(m.distance,'20 ft');assert.equal(m.toSquare,'F2');
 assert.equal((await call(c,'measure',{from:'A1',to:'C3'})).data.distance,'10 ft');
 assert.match((await call(c,'read_scene',{scene:'nowhere'})).text,/No scene called/);
});

test('the protocol negotiates a version, answers requests and ignores notifications',async()=>{
 const load=async()=>context();
 const init=await handleMcp(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26'}}),load);
 assert.equal(init.status,200);assert.equal(init.body.result.protocolVersion,'2025-03-26');assert.match(init.body.result.instructions,/The Salt Road/);
 assert.equal((await handleMcp(JSON.stringify({jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'1999-01-01'}}),load)).body.result.protocolVersion,'2025-06-18');
 assert.equal((await handleMcp(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),load)).status,202);
 assert.equal((await handleMcp('{oops',load)).body.error.code,-32700);
 assert.equal((await handleMcp(JSON.stringify({jsonrpc:'2.0',id:3,method:'sampling/x'}),load)).body.error.code,-32601);
 const list=await handleMcp(JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/list'}),load);assert.equal(list.body.result.tools.length,13);
 const batch=await handleMcp(JSON.stringify([{jsonrpc:'2.0',id:5,method:'ping'},{jsonrpc:'2.0',method:'notifications/x'}]),load);assert.equal(batch.body.length,1);
 let loads=0;await handleMcp(JSON.stringify([{jsonrpc:'2.0',id:6,method:'tools/list'},{jsonrpc:'2.0',id:7,method:'tools/list'}]),async()=>{loads++;return context();});assert.equal(loads,1,'one read per request');
 assert.equal((await handleMcp('x'.repeat(70000),load)).status,413);
});

test('connection keys are stored hashed, named per campaign, and stop working when revoked',async()=>{
 const b=bucket();
 const {key,connection}=await createConnection(b,'alice','demo-campaign','Claude on my laptop','read');
 assert.match(key,/^rpg_[a-f0-9]{64}$/);assert.equal(connection.hash,undefined);
 assert.ok(![...b.data.values()].some(v=>v.text.includes(key.slice(4))),'the key itself is never stored');
 const g=await grantFor(b,key,new Date('2026-11-13T00:00:00Z'));assert.deepEqual({...g},{owner:'alice',campaignId:'demo-campaign',connectionId:connection.id,level:'read'});
 assert.ok((await listConnections(b,'alice','demo-campaign'))[0].lastUsedAt);
 await updateConnection(b,'alice','demo-campaign',connection.id,{level:'run'});assert.equal((await grantFor(b,key)).level,'run');
 await assert.rejects(updateConnection(b,'alice','demo-campaign',connection.id,{level:'admin'}));
 assert.equal(await grantFor(b,'rpg_'+'0'.repeat(64)),null);assert.equal(await grantFor(b,'enc_'+'0'.repeat(64)),null);
 assert.equal(await revokeConnection(b,'alice','demo-campaign',connection.id),true);assert.equal(await grantFor(b,key),null);
 for(let i=0;i<MAX_CONNECTIONS;i++)await createConnection(b,'alice','demo-campaign','AI '+i,'read');
 await assert.rejects(createConnection(b,'alice','demo-campaign','one more','read'),/Revoke one first/);
 await assert.rejects(createConnection(b,'alice','demo-campaign','  ','read'),/name/);
});

test('the local script forwards to the hosted endpoint with the key and keeps request ids',async()=>{
 const key='rpg_'+'a'.repeat(64),calls=[];
 assert.throws(()=>createBridge({url:'http://example.com',key}));assert.throws(()=>createBridge({url:'https://example.com',key:'nope'}));
 const forward=createBridge({url:'https://example.com',key,fetchImpl:async(url,o)=>{calls.push({url:String(url),o});
  if(o.body.includes('notifications'))return new Response(null,{status:202});
  if(o.body.includes('"id":9'))return new Response(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32001,message:'revoked '+key}}),{status:401});
  return Response.json({jsonrpc:'2.0',id:1,result:{}});}});
 assert.equal(await forward('{"jsonrpc":"2.0","id":1,"method":"ping"}'),'{"jsonrpc":"2.0","id":1,"result":{}}');
 assert.equal(calls[0].url,'https://example.com/api/mcp');assert.equal(calls[0].o.headers.Authorization,`Bearer ${key}`);assert.equal(calls[0].o.redirect,'error');
 assert.equal(await forward('{"jsonrpc":"2.0","method":"notifications/initialized"}'),null);
 const err=JSON.parse(await forward('{"jsonrpc":"2.0","id":9,"method":"ping"}'));assert.equal(err.id,9);assert.doesNotMatch(err.error.message,/a{64}/);
});

test('real MCP clients work over HTTP with the key in the URL, and through the local script',async()=>{
 const {default:http}=await import('node:http');
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
 const {StreamableHTTPClientTransport}=await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
 const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
 const key='rpg_'+'a'.repeat(64);
 const server=http.createServer(async(req,res)=>{
  if(req.method!=='POST'){res.writeHead(405,{Allow:'POST'});return res.end();}
  let body='';for await(const c of req)body+=c;
  if(req.url!==`/api/mcp/${key}`&&req.headers.authorization!==`Bearer ${key}`){res.writeHead(401);return res.end();}
  const r=await handleMcp(body,async()=>context('read',false));
  if(r.body===null){res.writeHead(202);return res.end();}
  res.writeHead(r.status,{'Content-Type':'application/json'});res.end(JSON.stringify(r.body));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 try{
  const remote=new Client({name:'test',version:'1'});
  await remote.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/api/mcp/${key}`)));
  assert.equal(remote.getServerVersion().name,'rpg-tools');
  assert.equal((await remote.listTools()).tools.length,13);
  assert.match((await remote.callTool({name:'campaign_overview',arguments:{}})).content[0].text,/The Salt Road/);
  await remote.close();
  const local=new Client({name:'test',version:'1'});
  await local.connect(new StdioClientTransport({command:process.execPath,args:['scripts/rpg-tools-mcp.mjs'],env:{...process.env,RPG_TOOLS_URL:`http://127.0.0.1:${port}`,RPG_TOOLS_KEY:key}}));
  assert.match((await local.callTool({name:'search',arguments:{query:'mara'}})).content[0].text,/Mara Venn/);
  await local.close();
 }finally{server.close();}
});
