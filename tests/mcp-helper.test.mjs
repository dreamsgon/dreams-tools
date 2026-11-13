import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {EncyclopediaStore} from '../lib/encyclopedia/store.ts';
import {initialWorkspace,newScene,newToken} from '../lib/model.ts';
import {loadWorkspace,saveWorkspace} from '../lib/workspace-storage.ts';
import {callTool,listTools} from '../lib/mcp/tools.ts';
import {loadContext} from '../lib/mcp/load.ts';
import {createConnection,grantFor,listConnections,revokeConnection,updateConnection} from '../lib/mcp/connections.ts';
import {readActivity,publicActivity,updateActivity} from '../lib/mcp/activity.ts';
import {decideSuggestion} from '../lib/mcp/suggestions.ts';
import {presets,fromLevel,levelFor,modeOf,cleanPerms,toolAction,actions} from '../lib/mcp/permissions.ts';

function bucket(){
 const data=new Map();let n=0;
 return {data,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){
   const v=data.get(k);
   if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;
   if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;
   data.set(k,{text,etag:String(++n)});return {etag:String(n)};
  },
  async delete(k){data.delete(k);},
  async list(){return {objects:[],truncated:false};},
 };
}
const OWNER='gm-1',CAMPAIGN='demo-campaign',PREFIX=`users/${OWNER}/`;
function table(){
 const w=initialWorkspace();
 w.collections=[{id:'mt-salt',name:'The Salt Road',kind:'campaign',parentId:null}];
 w.conditions=[{id:'restrained',name:'Restrained',color:'#aa66cc',icon:''}];
 const s=newScene('Greyfen marsh');s.containerId='mt-salt';s.width=700;s.height=700;
 s.grid={...s.grid,type:'square',size:70,offsetX:0,offsetY:0,units:5,unit:'ft',diagonal:'equal',snap:true};
 s.tokens=[Object.assign(newToken('Bram'),{id:'bram',x:105,y:105,hp:31,maxHp:31,notes:'Owes the hag a favour'}),Object.assign(newToken('Bog Hag'),{id:'hag',x:385,y:315,hp:40,maxHp:40,disposition:'enemy'}),Object.assign(newToken('Lurker'),{id:'lurk',x:455,y:455,hidden:true})];
 w.scenes=[s];w.activeId=s.id;return w;
}
async function setup(how='helper'){
 const b=bucket(),store=new EncyclopediaStore(b),book=demoWorkspace();
 book.campaigns=book.campaigns.map(c=>c.id===CAMPAIGN?{...c,maptableCampaignId:'mt-salt'}:c);
 await store.save(OWNER,book,0);await saveWorkspace(b,PREFIX,table(),null);
 const {key,connection}=await createConnection(b,OWNER,CAMPAIGN,'Claude',how);
 const ctx=async()=>loadContext(b,await grantFor(b,key));
 const call=async(name,args={})=>{const r=await callTool(await ctx(),name,args),text=r.content[0].text;return {...r,text,data:r.isError?null:JSON.parse(text.replace(/^Campaign text[^\n]*\n/,''))};};
 return {b,key,connection,ctx,call,log:()=>readActivity(b,OWNER,CAMPAIGN),hag:async()=>(await loadWorkspace(b,PREFIX)).workspace.scenes[0].tokens.find(t=>t.id==='hag')};
}

test('ready-made sets, older levels and the checks on a set from the browser',()=>{
 assert.equal(modeOf(presets.helper),'helper');assert.equal(modeOf(presets.gm),'gm');assert.equal(modeOf({...presets.gm,moveTokens:'ask'}),'custom');
 assert.equal(levelFor(presets.helper),'run');assert.equal(levelFor(presets.read),'read');assert.equal(levelFor({...presets.read,notes:'ask'}),'assist');
 assert.deepEqual(fromLevel('run'),presets.gm);assert.equal(fromLevel('assist').moveTokens,'off');assert.equal(fromLevel('assist').writePages,'do');
 assert.throws(()=>cleanPerms({...presets.gm,seeSecrets:'ask'}),/not Ask me/);
 assert.throws(()=>cleanPerms({...presets.gm,rollOpen:'maybe'}));
 const {notes,...missing}=presets.gm;assert.throws(()=>cleanPerms(missing));
 assert.deepEqual(cleanPerms({...presets.helper,extra:'do'}),presets.helper);
 assert.equal(toolAction('roll',{discord:false}),'rollSecret');assert.equal(toolAction('roll',{}),'rollOpen');assert.equal(toolAction('read_page'),null);
 assert.equal(actions.length,12);
});

test('connections made as a helper list only what they may do, and older ones keep their level',async()=>{
 const s=await setup('helper');
 assert.equal(s.connection.mode,'helper');assert.equal(s.connection.level,'run');
 const names=listTools('run',presets.helper).map(t=>t.name);
 assert.ok(!names.includes('move_token'),'Off is hidden');assert.ok(names.includes('damage'));assert.ok(names.includes('check_suggestions'));
 assert.ok(!listTools('run').map(t=>t.name).includes('check_suggestions'),'nothing waits for an OK on Run the game');
 assert.ok(listTools('assist').map(t=>t.name).includes('roll'));
 assert.match((await s.call('move_token',{token:'Bog Hag',to:'D6'})).text,/turned off “Move tokens”/);
 const updated=await updateConnection(s.b,OWNER,CAMPAIGN,s.connection.id,{perms:{...presets.helper,moveTokens:'ask',writePages:'off'}});
 assert.equal(updated.mode,'custom');assert.equal(updated.perms.moveTokens,'ask');
 assert.match((await s.call('create_page',{title:'Nope',kind:'note'})).text,/turned off/);
 assert.equal((await updateConnection(s.b,OWNER,CAMPAIGN,s.connection.id,{level:'gm'})).mode,'gm');
 assert.equal((await updateConnection(s.b,OWNER,CAMPAIGN,s.connection.id,{level:'assist'})).perms.moveTokens,'off','an older level clears the custom set');
});

test('Ask me waits in the panel with what it would do, and the suggested move is shown on the map',async()=>{
 const s=await setup('helper');
 await updateConnection(s.b,OWNER,CAMPAIGN,s.connection.id,{perms:{...presets.helper,moveTokens:'ask'}});
 const move=await s.call('move_token',{token:'Bog Hag',to:'D6'});
 assert.equal(move.isError,false,move.text);assert.equal(move.data.waitingForGM,true);
 assert.deepEqual(await s.hag().then(t=>[t.x,t.y]),[385,315],'nothing moved yet');
 const roll=await s.call('roll',{dice:'1d20+5',for:'Claws against Bram',as:'Bog Hag'});
 assert.equal(roll.data.waitingForGM,true);assert.equal(roll.data.summary,'Roll 1d20+5 for Bog Hag: Claws against Bram');
 const secret=await s.call('roll',{dice:'1d20',for:'Perception',discord:false});
 assert.ok(secret.data.total>=1,'secret rolls are Do it');
 const bad=await s.call('damage',{token:'Nobody',amount:3});assert.ok(bad.isError,'a mistake comes back at once');
 const view=publicActivity(await s.log());
 assert.deepEqual(view.waiting.map(w=>w.tool),['roll','move_token']);
 assert.match(view.waiting[1].summary,/Bog Hag moved to D6/);assert.deepEqual(view.waiting[1].preview,{sceneId:(await loadWorkspace(s.b,PREFIX)).workspace.scenes[0].id,tokenId:'hag',x:245,y:385});
 assert.deepEqual(view.entries.map(e=>e.tool),['roll'],'only the secret roll was done');
 assert.equal((await s.call('check_suggestions')).data.suggestions[0].state,'waiting');
});

test('approving runs it as that connection, skipping drops it, and neither can happen twice',async()=>{
 const s=await setup('helper');
 await updateConnection(s.b,OWNER,CAMPAIGN,s.connection.id,{perms:{...presets.helper,moveTokens:'ask'}});
 await s.call('move_token',{token:'Bog Hag',to:'D6'});await s.call('damage',{token:'Bram',amount:4});await s.call('roll',{dice:'2d6',for:'Mire Grip'});
 let [roll,dmg,move]=publicActivity(await s.log()).waiting;
 assert.match(await decideSuggestion(s.b,OWNER,CAMPAIGN,move.id,'approve',{token:'Bog Hag',to:'C6'}),/Done/);
 assert.deepEqual(await s.hag().then(t=>[t.x,t.y]),[175,385],'the GM changed the square');
 await assert.rejects(decideSuggestion(s.b,OWNER,CAMPAIGN,move.id,'approve'),/already approved/);
 assert.match(await decideSuggestion(s.b,OWNER,CAMPAIGN,dmg.id,'skip'),/Skipped/);
 assert.equal((await loadWorkspace(s.b,PREFIX)).workspace.scenes[0].tokens.find(t=>t.id==='bram').hp,31);
 const view=publicActivity(await s.log());
 assert.deepEqual(view.waiting.map(w=>w.id),[roll.id]);assert.match(view.entries[0].summary,/Bog Hag moved to C6/);assert.equal(view.entries[0].connection,'Claude');
 const mine=(await s.call('check_suggestions')).data.suggestions;
 assert.equal(mine.find(x=>x.id===move.id).state,'approved');assert.match(mine.find(x=>x.id===move.id).result,/changed it/);assert.equal(mine.find(x=>x.id===dmg.id).state,'skipped');
 // Approving still works while the AI is paused: it's the GM's own call.
 await updateActivity(s.b,OWNER,CAMPAIGN,l=>({...l,paused:true}));
 await decideSuggestion(s.b,OWNER,CAMPAIGN,roll.id,'approve');assert.match(publicActivity(await s.log()).entries[0].summary,/Rolled 2d6/);
});

test('a suggestion that fails or whose connection was revoked goes back on the list',async()=>{
 const s=await setup('helper');
 await s.call('damage',{token:'Bram',amount:4});
 const [w]=publicActivity(await s.log()).waiting;
 await assert.rejects(decideSuggestion(s.b,OWNER,CAMPAIGN,w.id,'approve',{token:'Nobody',amount:4}),/No token/);
 assert.equal(publicActivity(await s.log()).waiting.length,1);
 await assert.rejects(decideSuggestion(s.b,OWNER,CAMPAIGN,w.id,'approve',{token:'Bram',amount:4,surprise:true}),/Unknown argument/);
 await revokeConnection(s.b,OWNER,CAMPAIGN,s.connection.id);
 await assert.rejects(decideSuggestion(s.b,OWNER,CAMPAIGN,w.id,'approve'),/revoked/);
 assert.equal(publicActivity(await s.log()).waiting.length,1);
 await decideSuggestion(s.b,OWNER,CAMPAIGN,w.id,'skip');assert.equal(publicActivity(await s.log()).waiting.length,0);
});

test('with GM-only things off the AI reads the campaign as players see it, but changes keep everything',async()=>{
 const s=await setup('gm');
 await updateConnection(s.b,OWNER,CAMPAIGN,s.connection.id,{perms:{...presets.gm,seeSecrets:'off'}});
 const c=await s.ctx();
 assert.ok(c.book.entries.every(e=>e.kind==='folder'||e.overviewVisibility==='players'||e.tabs?.some(t=>t.visibility==='players')||e.codex||e.mapData),'GM-only pages are left out');
 assert.ok(c.book.entries.every(e=>!/:::\s*secret/i.test(e.body)));
 const scene=c.maps.scenes[0];assert.deepEqual(scene.tokens.map(t=>t.id).sort(),['bram','hag']);assert.equal(scene.tokens.find(t=>t.id==='bram').notes,undefined);
 let mode;c.picture=async(_s,m)=>{mode=m;return {data:'',mimeType:'image/jpeg'};};
 await callTool(c,'view_scene',{view:'gm'});assert.equal(mode,'players');
 const r=await s.call('damage',{token:'Bram',amount:2});assert.equal(r.isError,false,r.text);
 assert.ok((await loadWorkspace(s.b,PREFIX)).workspace.scenes[0].tokens.some(t=>t.id==='lurk'&&t.hidden),'the hidden token is still on the map');
});
