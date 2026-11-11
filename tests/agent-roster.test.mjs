import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {z} from 'zod';
import * as model from '../lib/model.ts';
import {applyWorkspaceHpStates} from '../lib/token-hp-state.ts';
import * as campaigns from '../lib/campaign-settings.ts';
const compile=async path=>ts.transpileModule((await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('export ','');
const campaignScenes=(w,id)=>{campaigns.requireCampaign(w,id);return w.scenes.filter(s=>campaigns.sceneCampaign(w,s.id)===id);};
const code=await compile('../lib/agent-roster.ts');
const {campaignRoster,agentRosterSchema,applyAgentRosterOperation:apply}=new Function('z','newToken','tokenSchema','workspaceSchema','snap','campaignScenes','applyWorkspaceHpStates',`${code};return {campaignRoster,agentRosterSchema,applyAgentRosterOperation};`)(z,model.newToken,model.tokenSchema,model.workspaceSchema,model.snap,campaignScenes,applyWorkspaceHpStates);
function fixture(){const w=model.initialWorkspace();w.collections=[{id:'a',name:'A',kind:'campaign',parentId:null},{id:'b',name:'B',kind:'campaign',parentId:null}];w.scenes[0].containerId='a';w.scenes.push({...model.newScene(),containerId:'b'});w.tokenLibrary=[{...model.newToken('Hero'),id:'hero',rosterRole:'party'},{...model.newToken('Foreign'),id:'foreign',rosterRole:'npc'},{...model.newToken(),id:'library'}];w.libraryCampaigns={hero:'a',foreign:'b',library:'a'};return w;}
const input=operation=>({revision:'abc',operation});
test('roster lists only campaign NPC and party entries',()=>{assert.deepEqual(campaignRoster(fixture(),'a').map(t=>t.id),['hero']);});
test('create and update validate token fields and leave other campaigns untouched',()=>{const w=fixture();const out=apply(w,'a',input({action:'create',role:'npc',token:{name:'Guard',hp:4}}));assert.equal(out.workspace.libraryCampaigns[out.characterId],'a');assert.equal(out.workspace.tokenLibrary.at(-1).name,'Guard');assert.deepEqual(out.workspace.tokenLibrary[1],w.tokenLibrary[1]);assert.equal(w.tokenLibrary.length,3);const updated=apply(out.workspace,'a',input({action:'update',characterId:out.characterId,role:'party',changes:{hp:3}}));assert.equal(updated.workspace.tokenLibrary.at(-1).hp,3);assert.equal(updated.workspace.tokenLibrary.at(-1).rosterRole,'party');for(const token of [{id:'hijack'},{attachedToId:'hero'},{rosterRole:'library'},{hp:-1}])assert.throws(()=>apply(w,'a',input({action:'create',role:'npc',token})));});
test('foreign character, scene, assets and conditions are rejected atomically',()=>{const w=fixture();for(const op of [{action:'delete',characterId:'foreign'},{action:'update',characterId:'library',changes:{}},{action:'place',characterId:'hero',sceneId:w.scenes[1].id,x:1,y:2},{action:'update',characterId:'hero',changes:{assetId:'foreign-image'}},{action:'update',characterId:'hero',changes:{conditions:['foreign-condition']}}])assert.throws(()=>apply(w,'a',input(op)));assert.equal(w.tokenLibrary.length,3);});
test('place produces detached snapped copy, and delete preserves placed snapshots',()=>{const w=fixture();w.tokenLibrary[0].attachedToId='old';w.scenes[0].grid.snap=true;const out=apply(w,'a',input({action:'place',characterId:'hero',sceneId:w.scenes[0].id,x:123,y:157}));const token=out.workspace.scenes[0].tokens.at(-1);assert.notEqual(token.id,'hero');assert.equal(token.id,out.tokenId);assert.equal(token.attachedToId,null);assert.deepEqual({x:token.x,y:token.y},model.snap({x:123,y:157},w.scenes[0].grid,1));assert.deepEqual(out.workspace.tokenLibrary[0],w.tokenLibrary[0]);out.workspace.libraryLocations.hero=null;const deleted=apply(out.workspace,'a',input({action:'delete',characterId:'hero'}));assert.equal(deleted.workspace.scenes[0].tokens.at(-1).id,token.id);assert.equal('hero' in deleted.workspace.libraryCampaigns,false);assert.equal('hero' in deleted.workspace.libraryLocations,false);});
test('campaign roster references allow assigned images and locally used conditions',()=>{const w=fixture();w.assets=[{id:'image',name:'Image',src:'https://example.com/a.png',width:10,height:10}];w.assetCampaigns.image='a';w.conditions=[{id:'poison',name:'Poison',color:'#ffffff',icon:'P'}];w.tokenLibrary[0].conditions=['poison'];assert.doesNotThrow(()=>apply(w,'a',input({action:'create',role:'npc',token:{assetId:'image',conditions:['poison']}})));});
const routeCode=await compile('../app/api/agent/roster/route.ts');
const route=auth=>new Function('agentContext','failure','privateHeaders','agentRosterSchema','workspaceSchema','applyAgentRosterOperation',`const loadWorkspace=async(bucket,prefix)=>{const item=await bucket.get(prefix+'workspace.json');return item?{workspace:await item.json(),revision:item.etag}:null;};const saveWorkspace=async(bucket,prefix,workspace,revision)=>{const item=await bucket.put(prefix+'workspace.json',JSON.stringify(workspace),{onlyIf:{etagMatches:revision}});return item?{revision:item.etag}:null;};${routeCode};return POST;`)(auth,e=>Response.json({error:e.message},{status:e.message==='Forbidden'?403:400}),{},agentRosterSchema,model.workspaceSchema,apply);
test('HTTP writes require edit, reject stale revisions and use conditional saves',async()=>{let writes=0,condition;const w=fixture();const bucket={get:async()=>({etag:'abc',json:async()=>w}),put:async(path,body,opts)=>{writes++;condition=opts.onlyIf;return {etag:'next'};}};const request=(revision='abc')=>new Request('https://maptable.test/api/agent/roster',{method:'POST',body:JSON.stringify({revision,operation:{action:'delete',characterId:'hero'}})});assert.equal((await route(async()=>({bucket,prefix:'u/',campaignId:'a',mode:'read'}))(request())).status,403);const edit=route(async()=>({bucket,prefix:'u/',campaignId:'a',mode:'edit'}));assert.equal((await edit(request('stale'))).status,409);assert.equal(writes,0);assert.equal((await edit(request())).status,200);assert.deepEqual(condition,{etagMatches:'abc'});bucket.put=async()=>null;assert.equal((await edit(request())).status,409);});



test('agent roster creates and updates zero HP policies, placement applies policy to new token',()=>{
 const w=fixture();
 const created=apply(w,'a',input({action:'create',role:'npc',token:{hp:0,zeroHpStatus:'dead'}}));
 assert.equal(created.workspace.tokenLibrary.at(-1).status,'dead');
 w.tokenLibrary[0].zeroHpStatus='unconscious';
 const down=apply(w,'a',input({action:'update',characterId:'hero',changes:{hp:0}})).workspace;
 assert.equal(down.tokenLibrary[0].status,'unconscious');
 const manual=apply(down,'a',input({action:'update',characterId:'hero',changes:{status:'active'}})).workspace;
 assert.equal(manual.tokenLibrary[0].status,'active');
 const placed=apply(manual,'a',input({action:'place',characterId:'hero',sceneId:w.scenes[0].id,x:10,y:10})).workspace;
 assert.equal(placed.scenes[0].tokens.at(-1).status,'unconscious');
 assert.equal(placed.tokenLibrary[0].status,'active');
});
