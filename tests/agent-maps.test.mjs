import {syncConditionRounds} from '../lib/initiative-tracker.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {z} from 'zod';
import * as model from '../lib/model.ts';
import {applyWorkspaceHpStates} from '../lib/token-hp-state.ts';
import * as campaigns from '../lib/campaign-settings.ts';
import {syncTokenAttachments} from '../lib/token-attachments.ts';
const source=await readFile(new URL('../lib/agent-maps.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('export ','');
const {campaignScenes,campaignAssets,applyAgentOperations}=new Function('z','newScene','sceneSchema','workspaceSchema','sceneCampaign','requireCampaign','syncTokenAttachments','applyWorkspaceHpStates','syncConditionRounds',`${compiled};return {campaignScenes,campaignAssets,applyAgentOperations};`)(z,model.newScene,model.sceneSchema,model.workspaceSchema,campaigns.sceneCampaign,campaigns.requireCampaign,syncTokenAttachments,applyWorkspaceHpStates,syncConditionRounds);
function fixture(){const w=model.initialWorkspace();w.collections=[{id:'a',name:'A',kind:'campaign',parentId:null},{id:'b',name:'B',kind:'campaign',parentId:null}];w.scenes[0].containerId='a';w.scenes.push({...model.newScene('Private B'),containerId:'b'});return w;}
const batch=operations=>({revision:'abc',operations});
test('agent reads only campaign scenes and campaign assets',()=>{const w=fixture();w.assets=[{id:'a',name:'A',src:'https://example.com/a.png',width:10,height:10},{id:'b',name:'B',src:'https://example.com/b.png',width:10,height:10}];w.assetCampaigns={a:'a',b:'b'};assert.equal(campaignScenes(w,'a').length,1);assert.deepEqual(campaignAssets(w,'a').map(a=>a.id),['a']);assert.throws(()=>campaignScenes(w,'missing'));});
test('agent creates scenes in campaign root without changing other campaigns',()=>{const w=fixture();const out=applyAgentOperations(w,'a',batch([{action:'createScene',changes:{name:'Forest',width:1800}}]));assert.equal(out.workspace.scenes.length,3);assert.equal(out.workspace.scenes[2].containerId,'a');assert.equal(out.workspace.scenes[2].width,1800);assert.deepEqual(out.workspace.scenes[1],w.scenes[1]);assert.equal(w.scenes.length,2);});
test('agent rejects foreign writes, credential fields, container moves and invalid geometry atomically',()=>{const w=fixture();for(const op of [{action:'updateScene',sceneId:w.scenes[1].id,changes:{name:'Oops'}},{action:'updateScene',sceneId:w.scenes[0].id,changes:{containerId:'b'}},{action:'createScene',changes:{width:99999}},{action:'createScene',changes:{webhook:'oops'}},{action:'createScene',changes:{mapId:'foreign'}}])assert.throws(()=>applyAgentOperations(w,'a',batch([op])));assert.equal(w.scenes[1].name,'Private B');});
test('agent updates retain attachment movement and reject cross-campaign links',()=>{const w=fixture(),s=w.scenes[0];s.tokens=[{...model.newToken('Horse'),id:'horse',x:100},{...model.newToken('Rider'),id:'rider',x:110,attachedToId:'horse'}];const tokens=structuredClone(s.tokens);tokens[0].x=200;const out=applyAgentOperations(w,'a',batch([{action:'updateScene',sceneId:s.id,changes:{tokens}}]));assert.equal(out.workspace.scenes[0].tokens[1].x,210);assert.throws(()=>applyAgentOperations(w,'a',batch([{action:'updateScene',sceneId:s.id,changes:{pointsOfInterest:[{id:'p',name:'Portal',x:1,y:1,color:'#ffffff',targetSceneId:w.scenes[1].id}]}}])));});
const routeSource=await readFile(new URL('../app/api/agent/maps/route.ts',import.meta.url),'utf8');
const routeCode=ts.transpileModule(routeSource.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('export ','');
const route=(auth,put)=>new Function('agentContext','failure','privateHeaders','agentBatchSchema','workspaceSchema','applyAgentOperations',`const loadWorkspace=async(bucket,prefix)=>{const item=await bucket.get(prefix+'workspace.json');return item?{workspace:await item.json(),revision:item.etag}:null;};const saveWorkspace=async(bucket,prefix,workspace,revision)=>{const item=await bucket.put(prefix+'workspace.json',JSON.stringify(workspace),{onlyIf:{etagMatches:revision}});return item?{revision:item.etag}:null;};${routeCode};return POST;`)(auth,e=>Response.json({error:e.message},{status:e.message==='Forbidden'?403:400}),{}, {parse:x=>x},model.workspaceSchema,applyAgentOperations);
test('read-only agent cannot write and stale revisions cannot overwrite',async()=>{let writes=0;const w=fixture();const bucket={get:async()=>({etag:'new',json:async()=>w}),put:async()=>{writes++;return null;}};const request=()=>new Request('https://maptable.test/api/agent/maps',{method:'POST',body:JSON.stringify(batch([{action:'createScene',changes:{name:'New'}}]))});const read=route(async()=>({bucket,prefix:'u/',campaignId:'a',mode:'read'}));assert.equal((await read(request())).status,403);const edit=route(async()=>({bucket,prefix:'u/',campaignId:'a',mode:'edit'}));assert.equal((await edit(request())).status,409);assert.equal(writes,0);});

const authSource=await readFile(new URL('../lib/agent-auth.ts',import.meta.url),'utf8');
const authCode=ts.transpileModule(authSource.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('export ','');
test('agent keys reject missing, unknown, revoked and changed grants',async()=>{
 const records={};const {agentContext,agentKeyHash}=new Function('getBucket',`${authCode};return {agentContext,agentKeyHash};`)(()=>({get:async k=>records[k]?{json:async()=>records[k]}:null}));
 const key='mt_'+'a'.repeat(64), hash=await agentKeyHash(key), request=()=>new Request('https://maptable.test/api/agent/maps',{headers:{authorization:'Bearer '+key}});
 await assert.rejects(()=>agentContext(request()));
 records[`agent-keys/${hash}.json`]={prefix:'u/',campaignId:'a',mode:'edit'};
 records['u/agent-access/a.json']={hash,mode:'edit'};
 assert.equal((await agentContext(request())).campaignId,'a');
 records['u/agent-access/a.json'].mode='read';await assert.rejects(()=>agentContext(request()));
 delete records['u/agent-access/a.json'];await assert.rejects(()=>agentContext(request()));
 await assert.rejects(()=>agentContext(new Request('https://maptable.test/api/agent/maps')));
});

test('agent writes use conditional persistence and return created IDs; raced saves fail',async()=>{
 const w=fixture();let persisted;let condition;
 const bucket={get:async()=>({etag:'abc',json:async()=>w}),put:async(path,body,options)=>{persisted=JSON.parse(body);condition=options.onlyIf;return {etag:'next'};}};
 const handler=route(async()=>({bucket,prefix:'u/',campaignId:'a',mode:'edit'}));
 const req=()=>new Request('https://maptable.test/api/agent/maps',{method:'POST',body:JSON.stringify(batch([{action:'createScene',changes:{name:'Forest'}}]))});
 const response=await handler(req());assert.equal(response.status,200);const result=await response.json();assert.equal(result.revision,'next');assert.equal(result.sceneIds.length,1);assert.deepEqual(condition,{etagMatches:'abc'});assert.deepEqual(persisted.scenes[1],w.scenes[1]);
 bucket.put=async()=>null;assert.equal((await handler(req())).status,409);
});



test('agent map token edits apply zero HP policy and retain manual override',()=>{
 const w=fixture(),s=w.scenes[0];
 s.tokens=[{...model.newToken('Guard'),hp:5,zeroHpStatus:'dead'}];
 const tokens=structuredClone(s.tokens);tokens[0].hp=0;
 const down=applyAgentOperations(w,'a',batch([{action:'updateScene',sceneId:s.id,changes:{tokens}}])).workspace;
 assert.equal(down.scenes[0].tokens[0].status,'dead');
 down.scenes[0].tokens[0].status='active';
 const edited=applyAgentOperations(down,'a',batch([{action:'updateScene',sceneId:s.id,changes:{name:'Renamed'}}])).workspace;
 assert.equal(edited.scenes[0].tokens[0].status,'active');
 assert.equal(w.scenes[0].tokens[0].hp,5);
});
