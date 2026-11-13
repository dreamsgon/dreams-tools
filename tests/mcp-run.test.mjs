import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace,campaignExport} from '../lib/encyclopedia/world-model.ts';
import {EncyclopediaStore} from '../lib/encyclopedia/store.ts';
import {initialWorkspace,newScene,newToken} from '../lib/model.ts';
import {loadWorkspace,saveWorkspace} from '../lib/workspace-storage.ts';
import {campaignScenes} from '../lib/agent-maps.ts';
import {callTool,listTools} from '../lib/mcp/tools.ts';
import {makeCommit} from '../lib/mcp/commit.ts';
import {readActivity,publicActivity} from '../lib/mcp/activity.ts';
import {undoTable,checkTableScope,editScene} from '../lib/mcp/table.ts';
import {mergeMaptable} from '../lib/maptable-merge.ts';

function bucket(){
 const data=new Map();let n=0;
 return {data,failNext:0,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){
   const v=data.get(k);
   if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;
   if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;
   if(this.failNext&&k.endsWith('/workspace.json')&&!k.includes('encyclopedia')){this.failNext--;return null;}
   data.set(k,{text,etag:String(++n)});return {etag:String(n)};
  },
  async delete(k){data.delete(k);},
  async list(){return {objects:[],truncated:false};},
 };
}
const OWNER='gm-1',CAMPAIGN='demo-campaign',PREFIX=`users/${OWNER}/`;
function table(){
 const w=initialWorkspace();
 w.collections=[{id:'mt-salt',name:'The Salt Road',kind:'campaign',parentId:null},{id:'mt-other',name:'Other',kind:'campaign',parentId:null}];
 w.conditions=[{id:'frightened',name:'Frightened',color:'#aa66cc',icon:''},{id:'prone',name:'Prone',color:'#888888',icon:''}];
 const s=newScene('Greyfen marsh');s.containerId='mt-salt';s.width=700;s.height=700;
 s.grid={...s.grid,type:'square',size:70,offsetX:0,offsetY:0,units:5,unit:'ft',diagonal:'equal',snap:true};
 const bram=Object.assign(newToken('Bram'),{id:'bram',x:105,y:105,hp:31,maxHp:31,rosterRole:'party'});
 const hag=Object.assign(newToken('Bog Hag'),{id:'hag',x:385,y:105,hp:40,maxHp:40,hidden:true,disposition:'enemy'});
 const wenna=Object.assign(newToken('Wenna'),{id:'wenna',x:175,y:175,hp:18,maxHp:18,rosterRole:'party',tempHp:5});
 s.tokens=[bram,hag,wenna];s.fog={...s.fog,enabled:true,base:true,strokes:[]};
 const other=newScene('Elsewhere');other.containerId='mt-other';
 w.scenes=[s,other];w.activeId=s.id;
 return w;
}
async function setup(){
 const b=bucket(),store=new EncyclopediaStore(b),book=demoWorkspace();
 book.campaigns=book.campaigns.map(c=>c.id===CAMPAIGN?{...c,maptableCampaignId:'mt-salt'}:c);
 await store.save(OWNER,book,0);
 await saveWorkspace(b,PREFIX,table(),null);
 const base={maps:null,level:'run'};
 const commit=makeCommit(b,{owner:OWNER,campaignId:CAMPAIGN,connectionId:'c1',connection:'Claude'},base,async()=>{});
 const ctx=async()=>{const {data}=await store.read(OWNER),bk=campaignExport(data,CAMPAIGN),st=await loadWorkspace(b,PREFIX);
  return {...base,book:bk,campaign:bk.campaigns[0],maps:{workspace:st.workspace,campaignId:'mt-salt',scenes:campaignScenes(st.workspace,'mt-salt')},commit,paused:false};};
 const call=async(name,args={})=>{const r=await callTool(await ctx(),name,args);return {...r,text:r.content[0].text,data:r.isError?null:JSON.parse(r.content[0].text)};};
 const scene=async()=>(await loadWorkspace(b,PREFIX)).workspace.scenes[0];
 return {b,call,scene,maps:async()=>(await loadWorkspace(b,PREFIX)).workspace,log:()=>readActivity(b,OWNER,CAMPAIGN)};
}
const tok=(s,id)=>s.tokens.find(t=>t.id===id);

test('the run level adds table tools that assist connections cannot use',async()=>{
 const run=listTools('run').map(t=>t.name);
 for(const n of ['move_token','damage','heal','set_condition','show_token','reveal_fog','start_combat','next_turn','end_combat'])assert.ok(run.includes(n),n);
 assert.ok(!listTools('assist').some(t=>t.name==='damage'));
});

test('moving, damage with temporary HP, healing and conditions',async()=>{
 const s=await setup();
 const m=await s.call('move_token',{token:'Bram',to:'C3'});assert.equal(m.isError,false,m.text);
 assert.equal(m.data.from,'B2');assert.equal(m.data.moved,'5 ft');
 let sc=await s.scene();assert.deepEqual([tok(sc,'bram').x,tok(sc,'bram').y],[175,175]);
 assert.match((await s.call('move_token',{token:'Bram',to:'Z99'})).text,/isn't a square/);
 const d=await s.call('damage',{token:'Wenna',amount:9,type:'slashing'});assert.equal(d.isError,false,d.text);
 sc=await s.scene();assert.equal(tok(sc,'wenna').hp,14);assert.equal(tok(sc,'wenna').tempHp??null,null);
 assert.match((await s.log()).entries[0].detail,/HP 18 → 14 \(5 from temporary HP\)/);
 await s.call('heal',{token:'Wenna',amount:100});assert.equal(tok(await s.scene(),'wenna').hp,18,'healing stops at max');
 assert.equal((await s.call('set_condition',{token:'Wenna',condition:'frightened'})).isError,false);
 assert.deepEqual(tok(await s.scene(),'wenna').conditions,['frightened']);
 assert.match((await s.call('set_condition',{token:'Wenna',condition:'Frightened'})).text,/already has/);
 assert.match((await s.call('set_condition',{token:'Wenna',condition:'Dazzled'})).text,/No condition/i);
});

test('fog and hidden tokens',async()=>{
 const s=await setup();
 const r=await s.call('reveal_fog',{around:'Bram',radius:1});assert.equal(r.isError,false,r.text);
 const st=(await s.scene()).fog.strokes;assert.equal(st.length,1);assert.equal(st[0].mode,'reveal');assert.deepEqual(st[0].points,[{x:0,y:0},{x:210,y:210}]);
 assert.equal((await s.call('show_token',{token:'Bog Hag',visible:true})).isError,false);
 assert.equal(tok(await s.scene(),'hag').hidden,false);
});

test('combat: start with given and rolled initiative, next turn, end',async()=>{
 const s=await setup();
 const r=await s.call('start_combat',{tokens:['Bram','Bog Hag','Wenna'],initiative:{Bram:15,Wenna:12},bonus:{'Bog Hag':1}});
 assert.equal(r.isError,false,r.text);
 let sc=await s.scene();assert.equal(tok(sc,'bram').initiative,15);assert.ok(tok(sc,'hag').initiative>=2&&tok(sc,'hag').initiative<=21);
 assert.equal(sc.initiativeState.round,1);assert.equal(r.data.turn,r.data.order[0].name);
 assert.match((await s.call('start_combat',{})).text,/already running/);
 for(let i=0;i<3;i++)assert.equal((await s.call('next_turn')).isError,false);
 sc=await s.scene();assert.equal(sc.initiativeState.round,2);
 const e=await s.call('end_combat');assert.equal(e.isError,false,e.text);assert.equal(e.data.rounds,2);
 sc=await s.scene();assert.equal(sc.initiativeState,undefined);assert.ok(sc.tokens.every(t=>t.initiative==null));
 assert.match((await s.call('next_turn')).text,/isn't running/);
});

test('table changes are undone part by part, leaving later GM changes alone',async()=>{
 const s=await setup();
 await s.call('damage',{token:'Bram',amount:9});
 await s.call('move_token',{token:'Wenna',to:'E5'});
 const [moveLine,hitLine]=(await s.log()).entries;
 assert.equal(publicActivity(await s.log()).entries[0].canUndo,true);
 // The GM moves Bram afterwards, then undoes the AI's damage on Bram: Bram's move wins, nothing is lost.
 let maps=await s.maps();maps=editScene(maps,maps.scenes[0].id,d=>{tok(d,'bram').x=245;});
 const {next,kept}=undoTable(maps,hitLine.table);
 assert.deepEqual(kept,['Bram in Greyfen marsh']);assert.equal(tok(next.scenes[0],'bram').hp,22);
 // Undoing Wenna's move works because nobody touched her since.
 const back=undoTable(maps,moveLine.table);assert.deepEqual(back.kept,[]);assert.deepEqual([tok(back.next.scenes[0],'wenna').x,tok(back.next.scenes[0],'wenna').y],[175,175]);
});

test('the AI can only change its own campaign\'s scenes',async()=>{
 const w=table(),[mine,other]=w.scenes;
 assert.throws(()=>checkTableScope(w,{...w,scenes:[mine,{...other,name:'x'}]},[mine.id]),/outside this campaign/);
 assert.throws(()=>checkTableScope(w,{...w,conditions:[]},[mine.id]),/Maptable settings/);
 assert.throws(()=>checkTableScope(w,{...w,scenes:[mine]},[mine.id]),/add or remove scenes/);
 const s=await setup();
 assert.match((await s.call('damage',{token:'Bram',amount:1,scene:'Elsewhere'})).text,/No scene/i);
});

test('a GM save in between is retried on the newer table',async()=>{
 const s=await setup();s.b.failNext=1;
 const r=await s.call('damage',{token:'Bram',amount:4});assert.equal(r.isError,false,r.text);
 assert.equal(tok(await s.scene(),'bram').hp,27);
});

test('Maptable joins the GM\'s unsaved edits with an AI save',()=>{
 const base=table(),id=base.scenes[0].id;
 const mine=editScene(base,id,d=>{tok(d,'bram').x=245;});
 const theirs=editScene(base,id,d=>{tok(d,'hag').hp=31;d.fog.strokes.push({mode:'reveal',shape:'rect',size:20,points:[{x:0,y:0},{x:70,y:70}]});});
 const {merged,both}=mergeMaptable(base,mine,theirs);
 const s=merged.scenes[0];
 assert.deepEqual(both,[]);assert.equal(tok(s,'bram').x,245);assert.equal(tok(s,'hag').hp,31);assert.equal(s.fog.strokes.length,1);
 const clash=editScene(base,id,d=>{tok(d,'bram').hp=1;});
 const r=mergeMaptable(base,mine,clash);assert.deepEqual(r.both,['Bram']);assert.equal(tok(r.merged.scenes[0],'bram').x,245);
});

test('view_scene draws the scene, keeping hidden tokens and fogged ground from the players view',async()=>{
 const {sceneSvg}=await import('../lib/mcp/scene-image.ts');
 const w=table(),s=w.scenes[0];
 s.fog.strokes=[{mode:'reveal',shape:'rect',size:20,points:[{x:0,y:0},{x:210,y:210}]}];
 const gm=sceneSvg(s,'gm',null).svg,players=sceneSvg(s,'players',null).svg;
 assert.match(gm,/Bog Hag \(hidden\)/);assert.doesNotMatch(players,/Bog Hag/);
 assert.match(players,/<mask id="fog"/);assert.match(players,/>C</);assert.match(players,/>3</);
 assert.equal(sceneSvg({...s,width:2800,height:1400},'gm',null).width,1280,'big maps are scaled down');
 assert.match(sceneSvg({...s,tokens:[{...s.tokens[0],name:'<b>&'}]},'gm',null).svg,/&lt;b&gt;&amp;/,'names are escaped');
 // Through the tool: an image plus a legend of squares.
 const book=demoWorkspace(),bk=campaignExport(book,CAMPAIGN),calls=[];
 const c={book:bk,campaign:bk.campaigns[0],level:'read',maps:{workspace:w,campaignId:'mt-salt',scenes:campaignScenes(w,'mt-salt')},picture:async(sc,mode)=>{calls.push([sc.name,mode]);return {data:'AAAA',mimeType:'image/jpeg'};}};
 const r=await callTool(c,'view_scene',{view:'players'});
 assert.equal(r.isError,false);assert.equal(r.content[0].type,'image');assert.deepEqual(calls,[['Greyfen marsh','players']]);
 assert.match(r.content[1].text,/Bram B2/);assert.doesNotMatch(r.content[1].text,/Bog Hag/);
 assert.match((await callTool({...c,picture:undefined},'view_scene',{})).content[0].text,/aren't available/);
 assert.match((await callTool(c,'view_scene',{view:'sideways'})).content[0].text,/gm or players/);
});
