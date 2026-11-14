import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-quest-log';
const M=await import('../lib/members.ts');
const {demoWorkspace,playerCampaign,workspaceSchema}=await import('../lib/encyclopedia/world-model.ts');
const {newQuest}=await import('../lib/encyclopedia/quests.ts');
const {linkerKey,PlayerSheetError}=await import('../lib/encyclopedia/player-sheet.ts');
const L=await import('../lib/encyclopedia/quest-log.ts');
const R=await import('../lib/encyclopedia/player-sheet-request.ts');

const C='demo-campaign',T='2026-11-14T10:00:00.000Z',NOW=new Date('2026-11-14T12:00:00Z'),OWNER='gm-1';
const MARA=linkerKey(OWNER,C,'mara'),WREN=linkerKey(OWNER,C,'wren');
const quest=(id,extra={},page={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title:id,kind:'quest',body:'',quest:{...newQuest('active'),...extra},updatedAt:T,...page});
function world(){
 const w=demoWorkspace();
 return workspaceSchema.parse({...w,entries:[...w.entries,
  quest('bell',{log:[{id:'gm1',at:T,text:'They reached the chapel.',players:true},{id:'gm2',at:T,text:'GM ONLY NOTE',players:false}]},{overviewVisibility:'players'}),
  quest('secret',{},{overviewVisibility:'gm'})]});
}
function list(){
 const l=M.emptyMemberList(C,'Dreams');
 return {...l,members:[{userId:'mara',name:'Mara',groups:['players'],joinedAt:''},{userId:'wren',name:'Wren',groups:['players'],joinedAt:''}]};
}
const rights=u=>M.pageRights(list(),u);
const log=(w,id='bell')=>w.entries.find(e=>e.id===id).quest.log;
const refuses=(fn,status)=>assert.throws(fn,e=>e instanceof PlayerSheetError&&e.status===status);
const add=(w,text='We should ask the miller.',who='mara',id='bell')=>L.addPlayerLog(w,C,rights(who),who==='mara'?MARA:WREN,{name:who==='mara'?'Mara':'Wren'},id,text,NOW);
/** Everything in the workspace except one quest's log. */
const rest=(w,id='bell')=>JSON.stringify({...w,entries:w.entries.map(e=>e.id===id?{...e,quest:{...e.quest,log:0}}:e)});

test('a member adds a shared, signed entry to a quest they can read, and nothing else changes',()=>{
 const w=world(),next=add(w,'  We should ask the miller.  ');
 const [l]=log(next);
 assert.equal(l.text,'We should ask the miller.');assert.equal(l.players,true);assert.equal(l.author,'Mara');assert.equal(l.authorId,MARA);assert.equal(l.at,NOW.toISOString());
 assert.deepEqual(log(next).slice(1),log(w),'the GM\'s entries are kept, newest first');
 assert.equal(rest(next),rest(w));
});

test('players cannot write in a quest they cannot read, an unknown page, or with empty or long text',()=>{
 const w=world();
 refuses(()=>add(w,'hi','mara','secret'),403);
 refuses(()=>add(w,'hi','mara','demo-mara'),403);
 refuses(()=>add(w,'hi','mara','nowhere'),403);
 refuses(()=>add(w,'   '),400);
 refuses(()=>add(w,'x'.repeat(2001)),400);
 // A quest shared in another campaign is not this member's.
 refuses(()=>L.addPlayerLog(w,'demo-campaign-two',rights('mara'),MARA,{name:'Mara'},'bell','hi',NOW),403);
});

test('a member edits and removes only their own entries',()=>{
 let w=add(world());const id=log(w)[0].id;
 w=L.editPlayerLog(w,C,rights('mara'),MARA,'bell',id,'Ask the miller first.',NOW);
 assert.equal(log(w)[0].text,'Ask the miller first.');assert.equal(log(w)[0].editedAt,NOW.toISOString());assert.equal(log(w)[0].authorId,MARA);
 refuses(()=>L.editPlayerLog(w,C,rights('wren'),WREN,'bell',id,'mine now',NOW),403);
 refuses(()=>L.removePlayerLog(w,C,rights('wren'),WREN,'bell',id),403);
 refuses(()=>L.editPlayerLog(w,C,rights('mara'),MARA,'bell','gm1','rewrite the GM',NOW),403);
 refuses(()=>L.removePlayerLog(w,C,rights('mara'),MARA,'bell','gm2'),403);
 refuses(()=>L.removePlayerLog(w,C,rights('mara'),MARA,'bell','gone'),404);
 const after=L.removePlayerLog(w,C,rights('mara'),MARA,'bell',id);
 assert.deepEqual(log(after),log(world()));
});

test('players see who wrote each shared entry and which are theirs, never the author key or GM-only entries',()=>{
 const w=add(add(world()),'I will scout the lake.','wren');
 const seen=(linker)=>playerCampaign(w,C,rights('mara').edit,linker).entries.find(e=>e.id==='bell').quest.log;
 const mine=seen(MARA);
 assert.deepEqual(mine.map(l=>[l.author,l.mine]),[['Wren',false],['Mara',true],['',false]]);
 assert.ok(mine.every(l=>l.edited===false));
 const id=log(w)[1].id,edited=L.editPlayerLog(w,C,rights('mara'),MARA,'bell',id,'Changed.',NOW);
 assert.equal(playerCampaign(edited,C,undefined,MARA).entries.find(e=>e.id==='bell').quest.log[1].edited,true,'players see that an entry was edited');
 assert.ok(!mine.some(l=>l.text==='GM ONLY NOTE'));
 const text=JSON.stringify(playerCampaign(w,C,undefined,MARA));
 assert.ok(!text.includes(MARA)&&!text.includes(WREN)&&!text.includes('authorId'),'the author key never reaches a player');
 assert.ok(seen(undefined).every(l=>l.mine===false),'a share link owns nothing');
});

test('a full log is refused',()=>{
 const w=world(),full={...w,entries:w.entries.map(e=>e.id==='bell'?{...e,quest:{...e.quest,log:Array.from({length:500},(_,i)=>({id:`l${i}`,at:T,text:'x',players:true}))}}:e)};
 refuses(()=>add(full),409);
});

// ---- The route's handler --------------------------------------------------------------------

const REF='a'.repeat(64);
function setup(){
 const state={data:world(),revision:1,saves:[]};
 const members={mara:{owner:OWNER,campaignId:C,userId:'mara',name:'Mara',rights:rights('mara')},wren:{owner:OWNER,campaignId:C,userId:'wren',name:'Wren',rights:rights('wren')}};
 let who='mara';
 const deps={
  member:async ref=>ref!==REF?null:who==='out'?'signedOut':members[who]??null,
  sameOrigin:r=>r.headers.get('Origin')==='https://rpg.example',
  store:{read:async()=>({data:state.data,revision:state.revision}),save:async(o,data,rev,by)=>{state.saves.push(by);if(rev!==state.revision)return null;state.data=data;state.revision++;return {};}},
  now:1000,
 };
 return {state,deps,as:u=>{who=u;}};
}
const req=(body,{origin='https://rpg.example'}={})=>new Request('https://rpg.example/api/encyclopedia/player-quest-log',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const call=(s,body,o)=>R.handlePlayerQuestLog(req({ref:REF,entryId:'bell',...body},o),s.deps);

test('player quest log route: same origin, a signed-in member, valid actions, saved as the player',async()=>{
 R.resetThrottles?.();const s=setup();
 assert.equal((await call(s,{action:'add',text:'hi'},{origin:'https://evil.example'})).status,403);
 assert.equal((await R.handlePlayerQuestLog(req({ref:'b'.repeat(64),action:'add',entryId:'bell',text:'hi'}),s.deps)).status,404,'a share link is not a member');
 s.as('out');assert.equal((await call(s,{action:'add',text:'hi'})).status,401);s.as('mara');
 assert.equal((await call(s,{action:'shout',text:'hi'})).status,400);
 assert.equal((await call(s,{action:'add',text:'hi',entryId:'secret'})).status,403);
 const ok=await call(s,{action:'add',text:'We go at dawn.',author:'GM',authorId:WREN,players:false});
 assert.equal(ok.status,200);
 const [l]=log(s.state.data);
 assert.equal(l.author,'Mara');assert.equal(l.authorId,MARA);assert.equal(l.players,true,'what the browser claims about author or visibility is ignored');
 assert.deepEqual(s.state.saves.at(-1),{name:'Mara',as:'player'});
 s.as('wren');assert.equal((await call(s,{action:'remove',logId:l.id})).status,403);
 s.as('mara');s.deps.now=60_000;assert.equal((await call(s,{action:'edit',logId:l.id,text:'We go at noon.'})).status,200);
 assert.equal(log(s.state.data)[0].text,'We go at noon.');
 assert.equal((await call(s,{action:'remove',logId:l.id})).status,200);
 assert.deepEqual(log(s.state.data),log(world()));
});

test('player quest log route retries a save that crossed another and throttles fast writers',async()=>{
 R.resetThrottles?.();const s=setup();
 const save=s.deps.store.save;let crossed=true;
 s.deps.store.save=async(...a)=>{if(crossed){crossed=false;s.state.revision++;return null;}return save(...a);};
 assert.equal((await call(s,{action:'add',text:'one'})).status,200);
 assert.equal(log(s.state.data)[0].text,'one');
 s.deps.store.save=save;
 const codes=[];for(let i=0;i<12;i++)codes.push((await call(s,{action:'add',text:`n${i}`})).status);
 assert.ok(codes.includes(429),'ten a few seconds is plenty');
});
