import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as campaign from '../lib/campaign-settings.ts';

const source=await readFile(new URL('../app/api/discord/test/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('export async function POST','async function POST');
const build=new Function('context','failure','privateHeaders','campaignSettingsKey','requireCampaign','validWebhook','fetch',`const loadWorkspace=async(bucket,prefix)=>{const item=await bucket.get(prefix+'workspace.json');return item?{workspace:await item.json(),revision:item.etag}:null;};${compiled}; return POST;`);

test('webhook test uses only the owned campaign saved endpoint and names its campaign',async()=>{
  const calls=[];
  const workspace={scenes:[],collections:[{id:'a',name:'Campaign A @everyone',kind:'campaign',parentId:null},{id:'b',name:'Campaign B',kind:'campaign',parentId:null}]};
  const records={'users/me/workspace.json':workspace,'users/me/campaign-settings/a.json':{webhook:'https://discord.com/api/webhooks/123/tokenA'},'users/me/campaign-settings/b.json':{webhook:'https://discord.com/api/webhooks/456/tokenB'}};
  const handler=build(async()=>({prefix:'users/me/',bucket:{get:async key=>records[key]?{json:async()=>records[key]}:null}}),e=>Response.json({error:e.message},{status:400}),{},campaign.campaignSettingsKey,campaign.requireCampaign,campaign.validWebhook,async(url,options)=>{calls.push({url,options});return Response.json({id:'message'});});
  const request=(id,route)=>new Request('https://maptable.test/api/discord/test',{method:'POST',body:JSON.stringify({campaignId:id,route})});
  assert.equal((await handler(request('a'))).status,200);
  assert.equal(calls[0].options.redirect,'manual');
  assert.equal(calls[0].url,'https://discord.com/api/webhooks/123/tokenA?wait=true');
  const payload=JSON.parse(calls[0].options.body);
  assert.match(payload.content,/Campaign A @everyone/);
  assert.deepEqual(payload.allowed_mentions,{parse:[]});
  assert.equal((await handler(request('foreign'))).status,400);
  delete records['users/me/campaign-settings/b.json'];
  assert.equal((await handler(request('b'))).status,400);
  assert.equal(calls.length,1);
  records['users/me/campaign-settings/a.json'].webhooks={combat:'https://discord.com/api/webhooks/789/combat'};
  assert.equal((await handler(request('a','combat'))).status,200);
  assert.equal(calls[1].url,'https://discord.com/api/webhooks/789/combat?wait=true');
  assert.match(JSON.parse(calls[1].options.body).content,/combat/);
  assert.equal((await handler(request('a','world'))).status,200);
  assert.equal(calls[2].url,'https://discord.com/api/webhooks/123/tokenA?wait=true');
  assert.equal((await handler(request('a','invalid'))).status,400);
  assert.equal(calls.length,3);
});

test('webhook failures do not report success or expose URLs',async()=>{
  const workspace={scenes:[],collections:[{id:'a',name:'A',kind:'campaign',parentId:null}]};
  const context=async()=>({prefix:'u/',bucket:{get:async key=>({json:async()=>key.endsWith('workspace.json')?workspace:{webhook:'https://discord.com/api/webhooks/123/secret'}})}});
  for(const status of [301,302,307,308,429,404]){
    const handler=build(context,e=>Response.json({error:e.message},{status:400}),{},campaign.campaignSettingsKey,campaign.requireCampaign,campaign.validWebhook,async()=>new Response('',{status}));
    const result=await handler(new Request('https://maptable.test/api/discord/test',{method:'POST',body:JSON.stringify({campaignId:'a'})}));
    assert.equal(result.status,400);
    const body=await result.text();assert.doesNotMatch(body,/secret|https:/);assert.match(body,status===429?/rate limiting/:/rejected/);
  }
});

test('map posting uses manual redirects and rejects redirects without forwarding the image',async()=>{
 const src=await readFile(new URL('../app/api/discord/route.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(src.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('export async function POST','async function POST');
 const make=new Function('context','failure','campaignSettingsKey','sceneCampaign','validWebhook','fetch',`const loadWorkspace=async(bucket,prefix)=>{const item=await bucket.get(prefix+'workspace.json');return item?{workspace:await item.json(),revision:item.etag}:null;};${code};return POST;`);
 const workspace={scenes:[{id:'scene',containerId:'a',mapType:'combat'}],collections:[{id:'a',kind:'campaign',parentId:null}]};
 for(const status of [200,204,302,307,429]){
  let calls=0;
  const handler=make(async()=>({prefix:'u/',bucket:{get:async key=>({json:async()=>key.endsWith('workspace.json')?workspace:{webhook:'https://discord.com/api/webhooks/123/secret'}})}}),e=>Response.json({error:e.message},{status:400}),campaign.campaignSettingsKey,campaign.sceneCampaign,campaign.validWebhook,async(url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.equal(options.body.get('files[0]').type,'image/png');return new Response(null,{status});});
  const body=new FormData();body.set('sceneId','scene');body.set('campaignId','a');body.set('file',new File(['test'],'map.png',{type:'image/png'}));
  const result=await handler(new Request('https://maptable.test/api/discord',{method:'POST',body}));
  assert.equal(result.status,status<300?200:400);assert.equal(calls,1);assert.doesNotMatch(await result.text(),/secret/);
 }
});

test('map posting accepts WebP, PNG and JPEG and derives attachment filenames from MIME type',async()=>{
 const src=await readFile(new URL('../app/api/discord/route.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(src.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('export async function POST','async function POST');
 const make=new Function('context','failure','campaignSettingsKey','sceneCampaign','validWebhook','fetch',`const loadWorkspace=async(bucket,prefix)=>{const item=await bucket.get(prefix+'workspace.json');return item?{workspace:await item.json(),revision:item.etag}:null;};${code};return POST;`);
 const workspace={scenes:[{id:'scene',containerId:'a',mapType:'combat'}],collections:[{id:'a',kind:'campaign',parentId:null}]};
 const calls=[];
 const handler=make(async()=>({prefix:'u/',bucket:{get:async key=>({json:async()=>key.endsWith('workspace.json')?workspace:{webhook:'https://discord.com/api/webhooks/123/secret'}})}}),e=>Response.json({error:e.message},{status:400}),campaign.campaignSettingsKey,campaign.sceneCampaign,campaign.validWebhook,async(url,options)=>{calls.push(options.body.get('files[0]'));return Response.json({id:'mock-message'});});
 for(const [type,extension] of [['image/webp','webp'],['image/png','png'],['image/jpeg','jpg']]){
  const body=new FormData();body.set('sceneId','scene');body.set('campaignId','a');
  // Deliberately incorrect incoming extension: actual MIME type must win.
  body.set('file',new File(['image bytes'],'wrong.gif',{type}));
  const result=await handler(new Request('https://maptable.test/api/discord',{method:'POST',body}));
  assert.equal(result.status,200);
  assert.equal(calls.at(-1).name,`map.${extension}`);
  assert.equal(calls.at(-1).type,type);
  assert.equal(await calls.at(-1).text(),'image bytes');
 }
 const body=new FormData();body.set('sceneId','scene');body.set('campaignId','a');body.set('file',new File(['image bytes'],'map.webp',{type:'image/gif'}));
 assert.equal((await handler(new Request('https://maptable.test/api/discord',{method:'POST',body}))).status,400);
 assert.equal(calls.length,3);
});
