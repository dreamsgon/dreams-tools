import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-trackers';
const {demoWorkspace,playerCampaign,workspaceSchema,defaultCharacter}=await import('../lib/encyclopedia/world-model.ts');
const T=await import('../lib/encyclopedia/trackers.ts');
const {changePlayerTrackers}=await import('../lib/encyclopedia/player-trackers.ts');
const R=await import('../lib/encyclopedia/player-sheet-request.ts');

const C='demo-campaign',AT='2026-11-14T10:00:00.000Z';
let n=0;const ids=()=>`t${++n}`;
const page=(id,title,character,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind:'character',body:'',updatedAt:AT,character:{...defaultCharacter(),...character},...extra});
const mine=new Set(['ilsa']),rights={edit:mine,subPages:new Set(),made:new Set()};
function world(){
 n=0;
 let list=T.addTracker([],{label:'Shields',shape:'pips',colour:'blue',max:3},false,ids);
 list=T.addTracker(list,{label:'Doom clock',shape:'pips',colour:'red',max:6},true,ids);
 const w=demoWorkspace();
 return workspaceSchema.parse({...w,entries:[...w.entries,
  page('ilsa','Ilsa Marrow',{role:'pc',trackers:list},{overviewVisibility:'players'}),
  page('vey','Agent Vey',{trackers:[{id:'x',label:'Cover',shape:'bar',colour:'green',max:10,value:4}]},{overviewVisibility:'players'}),
  page('rook','Tam Rook',{statsVisibility:'players',trackers:[{id:'y',label:'Ammo',shape:'bar',colour:'amber',max:30,value:12}]},{overviewVisibility:'players'})]});
}
const trackersOf=(w,id)=>w.entries.find(e=>e.id===id).character.trackers;

test('trackers stay in range, keep their values when reshaped, and pips stop at 20',()=>{
 let l=T.addTracker([],{label:'  Stress ',shape:'pips',colour:'purple',max:50},false,ids);
 assert.deepEqual(l[0],{id:l[0].id,label:'Stress',shape:'pips',colour:'purple',max:20,value:20},'pips stop at 20, and a new tracker starts full');
 l=T.setTrackerValue(l,l[0].id,-4);assert.equal(l[0].value,0);
 l=T.setTrackerValue(l,l[0].id,7);l=T.editTracker(l,l[0].id,{max:5,label:''});
 assert.deepEqual([l[0].label,l[0].max,l[0].value],['Stress',5,5],'a blank name keeps the old one; the value fits the new maximum');
 l=T.editTracker(l,l[0].id,{shape:'bar',max:400,gm:true});assert.equal(l[0].max,400);assert.equal(l[0].gm,true);
 assert.equal(T.trackerStep({shape:'bar',max:400}),20);assert.equal(T.trackerStep({shape:'pips',max:5}),1);
 assert.throws(()=>T.addTracker([],{label:'  ',shape:'bar',colour:'red',max:3}),T.TrackerError);
 assert.throws(()=>T.addTracker(Array.from({length:8},(_,i)=>({id:`a${i}`,label:'x',shape:'bar',colour:'red',max:1,value:1})),{label:'one more',shape:'bar',colour:'red',max:1}),/up to 8/);
 assert.equal(T.trackersSchema.safeParse([{id:'a',label:'x',shape:'pips',colour:'red',max:30,value:1}]).success,false);
 assert.equal(T.trackersSchema.safeParse([{id:'a',label:'x',shape:'bar',colour:'red',max:3,value:4}]).success,false,'never above the maximum');
 assert.deepEqual(T.removeTracker(l,l[0].id),[]);
});

test('players get shown trackers on shared stats or on their own character, never GM-only ones',()=>{
 const w=world();
 const share=playerCampaign(w,C).entries,member=playerCampaign(w,C,mine).entries;
 assert.equal(share.find(e=>e.id==='ilsa').trackers,undefined,'stats GM only, not theirs: nothing');
 assert.deepEqual(member.find(e=>e.id==='ilsa').trackers.map(t=>t.label),['Shields'],'their own character: the shown ones');
 assert.ok(!('gm' in member.find(e=>e.id==='ilsa').trackers[0]));
 assert.deepEqual(share.find(e=>e.id==='rook').trackers.map(t=>t.label),['Ammo'],'shared stats: everyone reading the page');
 assert.equal(member.find(e=>e.id==='vey').trackers,undefined);
 assert.ok(!JSON.stringify(playerCampaign(w,C,mine)).includes('Doom clock'));
});

test('a member changes only the shown trackers on a character they may edit',()=>{
 let w=world();const shields=trackersOf(w,'ilsa')[0].id,doom=trackersOf(w,'ilsa')[1].id;
 w=changePlayerTrackers(w,C,rights,'ilsa',{action:'set',trackerId:shields,value:1});
 w=changePlayerTrackers(w,C,rights,'ilsa',{action:'add',tracker:{label:'Ammo',shape:'bar',colour:'amber',max:30}});
 const ammo=trackersOf(w,'ilsa')[2];
 assert.equal(ammo.gm,undefined,'a player’s tracker is always shown');
 w=changePlayerTrackers(w,C,rights,'ilsa',{action:'edit',trackerId:ammo.id,tracker:{label:'Rail slugs',max:12}});
 assert.deepEqual(trackersOf(w,'ilsa').map(t=>[t.label,t.value]),[['Shields',1],['Doom clock',6],['Rail slugs',12]]);
 const refused=(f,status)=>assert.throws(f,e=>e instanceof T.TrackerError&&e.status===status);
 refused(()=>changePlayerTrackers(w,C,rights,'ilsa',{action:'set',trackerId:doom,value:0}),404);
 refused(()=>changePlayerTrackers(w,C,rights,'ilsa',{action:'remove',trackerId:doom}),404);
 refused(()=>changePlayerTrackers(w,C,rights,'vey',{action:'set',trackerId:'x',value:0}),403);
 refused(()=>changePlayerTrackers(w,'demo-campaign-two',rights,'ilsa',{action:'set',trackerId:shields,value:0}),404);
 w=changePlayerTrackers(w,C,rights,'ilsa',{action:'remove',trackerId:ammo.id});
 assert.equal(trackersOf(w,'ilsa').length,2);
 assert.equal(w.entries.find(e=>e.id==='ilsa').updatedAt,AT,'a tracker move is not a page edit');
});

const REF='a'.repeat(64);
function setup(){
 const state={data:world(),revision:1,saves:[]};let who='mara';
 const deps={
  member:async ref=>ref!==REF?null:who==='out'?'signedOut':{owner:'gm-1',campaignId:C,userId:'mara',name:'Mara',rights},
  sameOrigin:r=>r.headers.get('Origin')==='https://rpg.example',
  store:{read:async()=>({data:state.data,revision:state.revision}),save:async(o,data,rev,by)=>{state.saves.push(by);if(rev!==state.revision)return null;state.data=data;state.revision++;return {};}},
  now:1000,
 };
 return {state,deps,as:u=>{who=u;}};
}
const req=(body,{origin='https://rpg.example'}={})=>new Request('https://rpg.example/api/encyclopedia/player-tracker',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const call=(s,body,o)=>R.handlePlayerTracker(req({ref:REF,entryId:'ilsa',...body},o),s.deps);

test('player tracker route: same origin, a signed-in member, valid changes, saved as the player',async()=>{
 R.resetThrottles();const s=setup();const shields=trackersOf(s.state.data,'ilsa')[0].id;
 assert.equal((await call(s,{action:'set',trackerId:shields,value:1},{origin:'https://evil.example'})).status,403);
 assert.equal((await R.handlePlayerTracker(req({ref:'b'.repeat(64),entryId:'ilsa',action:'set',trackerId:shields,value:1}),s.deps)).status,404,'a share link is not a member');
 s.as('out');assert.equal((await call(s,{action:'set',trackerId:shields,value:1})).status,401);s.as('mara');
 assert.equal((await call(s,{action:'set',trackerId:shields,value:1.5})).status,400);
 assert.equal((await call(s,{action:'add',tracker:{label:'Big',shape:'pips',colour:'pink',max:3}})).status,400);
 assert.equal((await call(s,{action:'set',trackerId:'x',value:1,entryId:'vey'})).status,403);
 const ok=await call(s,{action:'add',tracker:{label:'Ammo',shape:'bar',colour:'amber',max:30},gm:true});
 assert.equal(ok.status,200);
 assert.equal(trackersOf(s.state.data,'ilsa').at(-1).gm,undefined,'the browser can’t hide a tracker');
 assert.deepEqual(s.state.saves.at(-1),{name:'Mara',as:'player'});
 const codes=[];for(let i=0;i<34;i++)codes.push((await call(s,{action:'set',trackerId:shields,value:i%4})).status);
 assert.ok(codes.includes(429),'thirty changes in a few seconds is plenty');
});
