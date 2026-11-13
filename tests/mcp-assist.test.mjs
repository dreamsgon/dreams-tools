import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace,campaignExport} from '../lib/encyclopedia/world-model.ts';
import {EncyclopediaStore} from '../lib/encyclopedia/store.ts';
import {callTool,listTools} from '../lib/mcp/tools.ts';
import {handleMcp} from '../lib/mcp/protocol.ts';
import {makeCommit,checkScope} from '../lib/mcp/commit.ts';
import {readActivity,undoChanges,updateActivity,publicActivity} from '../lib/mcp/activity.ts';
import {mergeWorkspaces} from '../lib/encyclopedia/merge.ts';

/** An in-memory bucket that honours the same "only if" checks as the real one. */
function bucket(){
 const data=new Map();let n=0;
 return {data,failNext:0,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){
   const v=data.get(k);
   if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;
   if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;
   if(this.failNext&&k.endsWith('workspace.json')){this.failNext--;return null;}
   data.set(k,{text,etag:String(++n)});return {etag:String(n)};
  },
  async delete(k){data.delete(k);},
  async list(){return {objects:[],truncated:false};},
 };
}
const OWNER='gm-1',CAMPAIGN='demo-campaign';
async function setup({paused=false,send,discord=false}={}){
 const b=bucket(),store=new EncyclopediaStore(b),w=demoWorkspace();
 if(discord)w.campaigns.find(c=>c.id===CAMPAIGN).maptableCampaignId='map-campaign';
 await store.save(OWNER,w,0);
 if(paused)await updateActivity(b,OWNER,CAMPAIGN,l=>({...l,paused:true}));
 const sent=[];
 const base={maps:null,level:'assist'};
 const commit=makeCommit(b,{owner:OWNER,campaignId:CAMPAIGN,connectionId:'c1',connection:'Claude'},base,send??(async d=>{sent.push(d);}));
 const ctx=async()=>{const {data}=await store.read(OWNER),book=campaignExport(data,CAMPAIGN);return {...base,book,campaign:book.campaigns[0],commit,paused:(await readActivity(b,OWNER,CAMPAIGN)).paused};};
 const call=async(name,args={})=>{const r=await callTool(await ctx(),name,args);return {...r,text:r.content[0].text,data:r.isError?null:JSON.parse(r.content[0].text)};};
 return {b,store,call,sent,ctx,latest:async()=>(await store.read(OWNER)).data,log:()=>readActivity(b,OWNER,CAMPAIGN)};
}

test('assist adds the writing tools, and read connections cannot use them',async()=>{
 const names=listTools('assist').map(t=>t.name);
 for(const n of ['roll','create_page','append_to_page','add_quest_log','set_objective','set_quest_state','add_codex_find','write_session_notes'])assert.ok(names.includes(n),n);
 assert.ok(listTools('assist').filter(t=>t.name==='roll').every(t=>!t.annotations.readOnlyHint));
 const {ctx}=await setup();
 const r=await callTool({...(await ctx()),level:'read'},'roll',{dice:'1d20',for:'test'});
 assert.ok(r.isError);assert.match(r.content[0].text,/needs Assist/);
});

test('a new page is saved, logged, and undone from the log',async()=>{
 const s=await setup();
 const r=await s.call('create_page',{title:'The drowned chapel',kind:'place',text:'Bells under the water.'});
 assert.equal(r.isError,false,r.text);
 const page=(await s.latest()).entries.find(e=>e.title==='The drowned chapel');
 assert.equal(page.campaignId,CAMPAIGN);assert.equal(page.overviewVisibility,undefined,'GM only by default');
 const log=await s.log();
 assert.equal(log.entries[0].connection,'Claude');assert.match(log.entries[0].summary,/Created the place page/);
 assert.equal(publicActivity(log).entries[0].canUndo,true);assert.equal(publicActivity(log).entries[0].changes,undefined,'the panel never gets page copies');
 const {next,kept}=undoChanges(await s.latest(),log.entries[0].changes);
 assert.deepEqual(kept,[]);assert.ok(!next.entries.some(e=>e.id===page.id));
});

test('undo leaves alone a page the GM changed since',async()=>{
 const s=await setup();
 await s.call('append_to_page',{page:'A light in the fog',text:'The bell rang twice.'});
 const change=(await s.log()).entries[0].changes;
 const w=await s.latest(),edited={...w,entries:w.entries.map(e=>e.id==='demo-first'?{...e,body:e.body+'\nGM edit'}:e)};
 const {next,kept}=undoChanges(edited,change);
 assert.deepEqual(kept,['A light in the fog']);assert.match(next.entries.find(e=>e.id==='demo-first').body,/GM edit/);
});

test('shared lore and other campaigns are out of reach',async()=>{
 const s=await setup();
 assert.match((await s.call('append_to_page',{page:'Mara Venn',text:'x'})).text,/shared|world lore/i);
 assert.match((await s.call('append_to_page',{page:'The first snowfall',text:'x'})).text,/No page/);
 const w=demoWorkspace();
 assert.throws(()=>checkScope(w,{...w,entries:w.entries.map(e=>e.id==='demo-winter'?{...e,body:'changed'}:e)},CAMPAIGN),/outside this campaign/);
 assert.throws(()=>checkScope(w,{...w,campaigns:w.campaigns.map(c=>({...c,name:'x'}))},CAMPAIGN),/campaign settings/);
 assert.doesNotThrow(()=>checkScope(w,{...w,entries:w.entries.map(e=>e.id==='demo-first'?{...e,body:'changed'}:e)},CAMPAIGN));
});

test('quests: log, objectives and state',async()=>{
 const s=await setup();
 await s.call('create_page',{title:'The Drowned Bell',kind:'quest'});
 {const r=await s.call('add_quest_log',{quest:'The Drowned Bell',text:'The reeds hide the bell rope.'});assert.equal(r.isError,false,r.text);}
 {const r=await s.call('set_objective',{quest:'The Drowned Bell',objective:'Find the bell rope'});assert.equal(r.isError,false,r.text);}
 {const r=await s.call('set_objective',{quest:'The Drowned Bell',objective:'Find the bell rope',done:true});assert.equal(r.isError,false,r.text);}
 {const r=await s.call('set_quest_state',{quest:'The Drowned Bell',state:'done'});assert.equal(r.isError,false,r.text);}
 const q=(await s.latest()).entries.find(e=>e.title==='The Drowned Bell').quest;
 assert.equal(q.state,'done');assert.ok(q.objectives.some(o=>o.text==='Find the bell rope'&&o.done));
 assert.ok(q.log.some(l=>/bell rope/.test(l.text)));
 assert.equal((await s.log()).entries.length,5);
});

test('session notes go in the sessions folder',async()=>{
 const s=await setup();
 const r=await s.call('write_session_notes',{title:'Session 2 · The drowned chapel',text:'They found the bell.',playersSee:true});
 assert.equal(r.isError,false,r.text);
 const e=(await s.latest()).entries.find(x=>x.title==='Session 2 · The drowned chapel');
 assert.equal(e.parentId,'demo-sessions');assert.equal(e.kind,'session');assert.equal(e.overviewVisibility,'players');
});

test('dice roll with a fair total, are logged, and only go to Discord when set up',async()=>{
 const s=await setup();
 const r=await s.call('roll',{dice:'2d6+3',for:'Bog Hag attacks Bram'});
 assert.equal(r.isError,false,r.text);assert.ok(r.data.total>=5&&r.data.total<=15);
 assert.equal(r.data.postedToDiscord,false);assert.equal(s.sent.length,0,'no Discord channel on this campaign');
 const line=(await s.log()).entries[0];assert.match(line.summary,/Rolled 2d6\+3 = \d+ for Bog Hag attacks Bram/);assert.equal(line.changes,undefined);
 assert.match((await s.call('roll',{dice:'banana',for:'x'})).text,/./);
 assert.ok((await s.call('roll',{dice:'banana',for:'x'})).isError);
});

test('the AI posts rolls as cards with who rolled, narration and recaps, and keeps secret rolls out of Discord',async()=>{
 const s=await setup({discord:true}),call=s.call;
 const r=await call('roll',{dice:'1d20+6',for:'Claws against Bram',as:'Bog Hag'});
 assert.equal(r.isError,false,r.text);assert.equal(JSON.parse(r.text).postedToDiscord,true);
 assert.deepEqual({...s.sent[0],total:0,detail:''},{kind:'roll',ai:true,title:'Claws against Bram',who:'Bog Hag',formula:'1d20+6',total:0,detail:'',natural:s.sent[0].natural});
 assert.equal(JSON.parse((await call('roll',{dice:'1d20',for:'Perception',discord:false})).text).postedToDiscord,false);assert.equal(s.sent.length,1);
 assert.equal((await call('post_to_discord',{text:'The reeds part.',title:'Greyfen marsh'})).isError,false);
 assert.deepEqual(s.sent[1],{kind:'narration',text:'The reeds part.',title:'Greyfen marsh'});
 assert.ok((await call('post_to_discord',{text:'x',kind:'gossip'})).isError);
 assert.ok((await (await setup()).call('post_to_discord',{text:'x'})).isError,'no channel, no post');
});

test('pausing refuses every change but keeps reading',async()=>{
 const s=await setup({paused:true});
 const r=await s.call('create_page',{title:'Nope',kind:'note'});
 assert.ok(r.isError);assert.match(r.text,/paused/);
 assert.ok(!(await s.latest()).entries.some(e=>e.title==='Nope'));
 assert.equal((await callTool(await s.ctx(),'campaign_overview',{})).isError,false);
});

test('a save in between is retried on the newer copy',async()=>{
 const s=await setup();
 s.b.failNext=2;
 const r=await s.call('create_page',{title:'Retried',kind:'note'});
 assert.equal(r.isError,false,r.text);
 assert.equal((await s.latest()).entries.filter(e=>e.title==='Retried').length,1);
});

test('prompts list and fill in',async()=>{
 const s=await setup(),load=()=>s.ctx();
 const list=(await handleMcp(JSON.stringify({jsonrpc:'2.0',id:1,method:'prompts/list'}),load)).body.result.prompts;
 assert.deepEqual(list.map(p=>p.name),['prep_session','recap_session','recap_from_source','story_so_far','run_scene','run_combat']);
 const got=(await handleMcp(JSON.stringify({jsonrpc:'2.0',id:2,method:'prompts/get',params:{name:'prep_session',arguments:{focus:'the drowned chapel'}}}),load)).body.result;
 assert.match(got.messages[0].content.text,/The Salt Road/);assert.match(got.messages[0].content.text,/the drowned chapel/);assert.match(got.messages[0].content.text,/create_page/);
 const read=(await handleMcp(JSON.stringify({jsonrpc:'2.0',id:3,method:'prompts/get',params:{name:'recap_session'}}),async()=>({...(await s.ctx()),level:'read'}))).body.result;
 assert.match(read.messages[0].content.text,/don't try to save/);
 assert.equal((await handleMcp(JSON.stringify({jsonrpc:'2.0',id:4,method:'prompts/get',params:{name:'nope'}}),load)).body.error.code,-32602);
});

test('the app joins its unsaved edits with a save made somewhere else',()=>{
 const base=demoWorkspace();
 const mine={...base,entries:base.entries.map(e=>e.id==='demo-first'?{...e,body:'mine'}:e)};
 const theirs={...base,entries:[...base.entries.map(e=>e.id==='demo-threads'?{...e,body:'theirs'}:e),{...base.entries.find(e=>e.id==='demo-first'),id:'ai-new',title:'AI page'}]};
 const {merged,both}=mergeWorkspaces(base,mine,theirs);
 assert.deepEqual(both,[]);
 assert.equal(merged.entries.find(e=>e.id==='demo-first').body,'mine');
 assert.equal(merged.entries.find(e=>e.id==='demo-threads').body,'theirs');
 assert.ok(merged.entries.some(e=>e.id==='ai-new'));
 const clash={...base,entries:base.entries.map(e=>e.id==='demo-first'?{...e,body:'theirs'}:e)};
 const r=mergeWorkspaces(base,mine,clash);
 assert.deepEqual(r.both,['A light in the fog']);assert.equal(r.merged.entries.find(e=>e.id==='demo-first').body,'mine');
 const gone={...base,entries:base.entries.filter(e=>e.id!=='demo-threads')};
 assert.ok(!mergeWorkspaces(base,mine,gone).merged.entries.some(e=>e.id==='demo-threads'),'a page removed elsewhere stays removed');
});
