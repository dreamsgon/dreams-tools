import test from 'node:test';
import assert from 'node:assert/strict';
import {inlineRollParts} from '../lib/map-rolls.ts';
import {mapDiscordMessage} from '../lib/map-discord-message.ts';
import {tokenHealth,initiativeSummary} from '../lib/initiative-summary.ts';
import {tokenSchema} from '../lib/model.ts';
import {initialWorkspace,newToken} from '../lib/model.ts';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {campaignSettingsKey,validWebhook} from '../lib/campaign-settings.ts';
test('plain notes preserve markup and only bounded supported dice become buttons',()=>{
 const text='<script>alert(1)</script> [[1d20+5]] [[alert(1)]] [[101d6]]';
 const parts=inlineRollParts(text);assert.equal(parts.map(p=>p.text).join(''),text);
 assert.deepEqual(parts.filter(p=>p.formula).map(p=>p.formula),['1d20+5']);
 assert.equal(inlineRollParts('x'.repeat(22000)).map(p=>p.text).join('').length,20000);
});
function fixture(){const w=initialWorkspace();w.collections=[{id:'campaign',name:'Campaign',kind:'campaign',parentId:null}];const s=w.scenes[0];s.containerId='campaign';s.tokens=[{...newToken('Visible'),initiative:10},{...newToken('Secret'),initiative:30,hidden:true}];return w;}
test('initiative is rebuilt from saved scene and hides secret tokens',()=>{
 const w=fixture(),result=mapDiscordMessage(w,{kind:'initiative',sceneId:w.activeId,campaignId:'campaign'});
 assert.match(result.content,/10: Visible/);assert.doesNotMatch(result.content,/Secret/);assert.equal(result.route,'combat');
});
test('roll route follows saved scene and rejects changed campaign or invalid formulas',()=>{
 const w=fixture();w.scenes[0].mapType='area';const input={kind:'roll',sceneId:w.activeId,campaignId:'campaign',label:'Attack',formula:'1d20+5',total:17,detail:'[12] +5'};
 assert.equal(mapDiscordMessage(w,input).route,'exploration');
 assert.throws(()=>mapDiscordMessage(w,{...input,campaignId:'other'}));
 assert.throws(()=>mapDiscordMessage(w,{...input,formula:'process.exit()'}));
 assert.throws(()=>mapDiscordMessage(w,{...input,sceneId:'missing'}));
});
test('message endpoint routes saved campaign, suppresses mentions and rejects redirects without leaks',async()=>{
 const source=await readFile(new URL('../app/api/discord/message/route.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('export async function POST','async function POST');
 const make=new Function('context','failure','privateHeaders','loadWorkspace','campaignSettingsKey','validWebhook','mapDiscordMessage','fetch',code+';return POST;');
 let reads=0,sends=0;
 const denied=make(async()=>{throw Error('Forbidden');},e=>Response.json({error:e.message},{status:403}),{},async()=>{reads++;},campaignSettingsKey,validWebhook,mapDiscordMessage,async()=>{sends++;});
 assert.equal((await denied(new Request('https://site.test/api/discord/message',{method:'POST',body:'{}'}))).status,403);assert.equal(reads,0);assert.equal(sends,0);
 for(const status of [200,302,429]){
  const w=fixture(),calls=[];w.scenes[0].mapType='world';
  const handler=make(async()=>({bucket:{put:async()=>{},get:async key=>({json:async()=>({webhooks:{world:'https://discord.com/api/webhooks/123/secret'}})})},prefix:'u/'}),e=>Response.json({error:e.message},{status:400}),{},async()=>({workspace:w}),campaignSettingsKey,validWebhook,mapDiscordMessage,async(url,options)=>{calls.push({url,options});return new Response(status===200?JSON.stringify({id:'12345'}):null,{status});});
  const request=campaignId=>new Request('https://site.test/api/discord/message',{method:'POST',body:JSON.stringify({kind:'initiative',campaignId,sceneId:w.activeId})});
  const result=await handler(request('campaign'));assert.equal(result.status,status===200?200:400);
  assert.equal(calls[0].url,'https://discord.com/api/webhooks/123/secret?wait=true');assert.equal(calls[0].options.redirect,'manual');
  assert.deepEqual(JSON.parse(calls[0].options.body).allowed_mentions,{parse:[]});assert.doesNotMatch(await result.text(),/secret|https:/);
  assert.equal((await handler(request('foreign'))).status,400);assert.equal(calls.length,1);
 }
});


test('optional combat fields preserve legacy tokens and reject invalid numbers',()=>{
 const old=newToken();assert.equal(tokenSchema.parse(old).ac,undefined);
 for(const field of ['ac','dc','passivePerception','tempHp']){
  for(const value of [Infinity,NaN,-1,1000001,1.5])assert.equal(tokenSchema.safeParse({...old,[field]:value}).success,false);
  assert.equal(tokenSchema.parse({...old,[field]:null})[field],null);
 }
});
test('Avrae health boundaries and explicit life state',()=>{
 const t={...newToken(),maxHp:100};
 for(const [hp,health] of [[100,'Healthy'],[99,'Injured'],[51,'Injured'],[50,'Bloodied'],[16,'Bloodied'],[15,'Critical'],[1,'Critical'],[0,'Dead']])assert.equal(tokenHealth({...t,hp}),health);
 assert.equal(tokenHealth({...t,hp:0,zeroHpStatus:'unconscious'}),'Unconscious');
 assert.equal(tokenHealth({...t,status:'unconscious'}),'Unconscious');
 assert.equal(tokenHealth({...t,status:'dead'}),'Dead');
});
test('initiative stats are opt in and health never reveals exact monster HP',()=>{
 const w=fixture(),t=w.scenes[0].tokens[0];Object.assign(t,{rosterRole:'npc',hp:17,maxHp:60,ac:23,dc:19,passivePerception:21,tempHp:8,conditions:['marked']});
 const post=()=>mapDiscordMessage(w,{kind:'initiative',sceneId:w.activeId,campaignId:'campaign'}).content;
 assert.match(post(),/Bloodied/);assert.doesNotMatch(post(),/17\/60|AC|DC|PP|Temp HP|Marked/);
 Object.assign(t,{showAc:true,showDc:true,showPassivePerception:true,showTempHp:true,showDiscordConditions:true});
 assert.match(post(),/AC 23.*DC 19.*PP 21.*Temp HP 8.*Marked/);
 t.discordHpDisplay='exact';assert.match(post(),/17\/60 HP/);
 t.showHp=false;assert.doesNotMatch(post(),/17\/60|Bloodied/);
 t.discordHpDisplay='health';assert.match(post(),/Bloodied/);assert.doesNotMatch(post(),/17\/60/);
 t.discordHpDisplay='default';assert.match(post(),/Bloodied/);
 t.discordHpDisplay='hidden';assert.doesNotMatch(post(),/17\/60|Bloodied/);
 t.discordHpDisplay='exact';
 t.showHp=true;t.hpVisibility='inherit';w.collections[0].tokenDefaults={showHp:false,showName:false,partyZeroHp:'unconscious',npcZeroHp:'dead'};
 assert.doesNotMatch(post(),/17\/60|Bloodied|Visible/);assert.match(post(),/Unknown/);
});
test('Discord summary uses aligned code rows and neutralizes fence and row injection',()=>{
 const tokens=[{...newToken('A```\nInjected'),initiative:4},{...newToken('B'),initiative:18}];
 const content=initiativeSummary('Scene```\nFake',tokens,[]);
 assert.match(content,/18: B/);assert.match(content,/ 4: A Injected/);assert.equal(content.split('```').length,3);
});


test('initiative updates only patch the privately recorded message for this user, scene and destination',async()=>{
 const source=await readFile(new URL('../app/api/discord/message/route.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('export async function POST','async function POST');
 const make=new Function('context','failure','privateHeaders','loadWorkspace','campaignSettingsKey','validWebhook','mapDiscordMessage','fetch',code+';return POST;');
 const records=new Map(),calls=[];let prefix='users/one/',webhook='https://discord.com/api/webhooks/123/secret',status=200;
 const w=fixture();
 const handler=make(async()=>({prefix,bucket:{get:async key=>key.includes('campaign-settings/')?{json:async()=>({webhook})}:records.has(key)?{json:async()=>JSON.parse(records.get(key))}:null,put:async(key,value)=>records.set(key,value)}}),e=>Response.json({error:e.message},{status:400}),{},async()=>({workspace:w}),campaignSettingsKey,validWebhook,mapDiscordMessage,async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'555'}),{status});});
 const request=action=>handler(new Request('https://site.test/api/discord/message',{method:'POST',body:JSON.stringify({kind:'initiative',action,sceneId:w.activeId,campaignId:'campaign'})}));
 assert.equal((await request('update')).status,400);assert.equal(calls.length,0);
 assert.equal((await request('post')).status,200);assert.equal(calls[0].options.method,'POST');
 assert.equal((await request('update')).status,200);assert.equal(calls[1].options.method,'PATCH');assert.equal(calls[1].url,webhook+'/messages/555');
 prefix='users/two/';assert.equal((await request('update')).status,400);assert.equal(calls.length,2);prefix='users/one/';
 const originalId=w.scenes[0].id;w.scenes[0].id='another-scene';w.activeId='another-scene';assert.equal((await request('update')).status,400);assert.equal(calls.length,2);w.scenes[0].id=originalId;w.activeId=originalId;
 w.scenes[0].containerId='foreign-campaign';w.collections.push({id:'foreign-campaign',name:'Other',kind:'campaign',parentId:null});assert.equal((await request('update')).status,400);assert.equal(calls.length,2);w.scenes[0].containerId='campaign';
 webhook='https://discord.com/api/webhooks/456/changed';assert.equal((await request('update')).status,400);assert.equal(calls.length,2);webhook='https://discord.com/api/webhooks/123/secret';
 status=404;assert.equal((await request('update')).status,400);assert.equal(calls.at(-1).options.method,'PATCH');assert.equal(calls.length,3);
 status=429;assert.equal((await request('update')).status,400);assert.equal(calls.length,4);assert.equal(calls.at(-1).options.method,'PATCH');
 assert.doesNotMatch([...records.values()].join(''),/secret|webhook/);
});
test('initiative live sends are explicit handlers with a synchronous lock and saved optional toggle',async()=>{
 const source=await readFile(new URL('../components/map-initiative.tsx',import.meta.url),'utf8');
 assert.match(source,/if\(sending.current\)return;sending.current=true/);assert.doesNotMatch(source,/useEffect/);
 assert.match(source,/if\(direction\)update/);assert.match(source,/await save\(\)/);assert.match(source,/initiativeLiveDiscord\?\?false/);
});
