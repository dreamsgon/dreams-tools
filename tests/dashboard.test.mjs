import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {dashboardSchema,defaultDashboard,toggleWidget,moveWidget,resizeWidget,setHeight,missingHalf,excerpt,dashWidgets,dashInfo} from '../lib/encyclopedia/dashboard.ts';
import {campaignSession,saveDashboard,loadHub,hubOf,lastEncounter} from '../lib/campaigns-server.ts';
import {initialWorkspace} from '../lib/model.ts';
import {saveWorkspace} from '../lib/workspace-storage.ts';
import {readHome,homeKey} from '../lib/home-store.ts';

function withDash(dashboard){const s=demoWorkspace();s.campaigns=s.campaigns.map(c=>c.id==='demo-campaign'?{...c,dashboard}:c);return s;}

test('a dashboard layout is checked with the campaign', () => {
  const d={...defaultDashboard(),threads:[{id:'t1',text:'Who sent the letter?',done:false}],notes:'Bring dice',links:[{label:'Sheets',url:'https://example.com'}]};
  assert.equal(workspaceSchema.safeParse(withDash(d)).success,true);
  assert.equal(dashboardSchema.safeParse({widgets:[{type:'next',size:'s'},{type:'next',size:'l'}]}).success,false);
  assert.equal(dashboardSchema.safeParse({widgets:[{type:'weather',size:'s'}]}).success,false);
  assert.equal(dashboardSchema.safeParse({widgets:[],links:[{label:'Bad',url:'javascript:alert(1)'}]}).success,false);
});

test('widgets are turned on and off, moved and resized', () => {
  let d=defaultDashboard({notes:'kept'});
  assert.deepEqual(d.widgets.map(w=>w.type),['next','scenes','links','quests','threads','party','initiative','recap','recent','notes']);
  d=toggleWidget(d,'board',true);
  assert.deepEqual(d.widgets.at(-1),{type:'board',size:'l'});
  assert.equal(toggleWidget(d,'board',true),d);
  d=toggleWidget(d,'next',false);
  assert.equal(d.widgets.some(w=>w.type==='next'),false);
  d=moveWidget(d,d.widgets.length-1,0);
  assert.equal(d.widgets[0].type,'board');
  assert.equal(moveWidget(d,0,99),d);
  d=resizeWidget(d,'board','s');
  assert.equal(d.widgets[0].size,'s');
  assert.equal(d.notes,'kept');
});

test('the last session excerpt drops links and markup', () => {
  assert.equal(excerpt('## Recap\n- The party met [[abc|Mira]] at **dawn**.'),'Recap The party met Mira at dawn.');
  assert.match(excerpt('word '.repeat(200),40),/…$/);
});

test('the hub brings quests, codex, the party and the saved layout to the dashboard', async () => {
  const {hubOf}=await import('../lib/campaigns-server.ts');
  const s=withDash({widgets:[{type:'board',size:'l'}],notes:'Hi'});
  const q=s.entries.find(e=>e.campaignId==='demo-campaign'||e.campaignId===null);
  s.entries.push({...q,id:'dash-quest',kind:'quest',title:'Find the bell',parentId:null,campaignId:'demo-campaign',quest:{state:'active',type:'main',objectives:[{id:'o1',text:'Ask the reeve',done:true},{id:'o2',text:'Climb the tower',done:false}],log:[]}});
  const data=workspaceSchema.parse(s);
  const hub=hubOf({map:null,book:{data}},'e:demo-campaign');
  const quest=hub.quests.find(x=>x.id==='dash-quest');
  assert.deepEqual({state:quest.state,done:quest.done,total:quest.total,next:quest.next},{state:'active',done:1,total:2,next:'Climb the tower'});
  assert.deepEqual(hub.dashboard.widgets,[{type:'board',size:'l'}]);
  assert.equal(hub.dashboard.notes,'Hi');
  assert.ok(Array.isArray(hub.codex)&&Array.isArray(hub.party));
});

const types=d=>d.widgets.map(w=>w.type);
const bothHalves={maps:true,notes:true},mapsOnly={maps:true,notes:false},notesOnly={maps:false,notes:true};

test('widget heights: 1 to 3, optional, and old saves stay valid', () => {
  const ok=h=>dashboardSchema.safeParse({widgets:[{type:'links',size:'s',...(h===undefined?{}:{h})}]}).success;
  assert.equal(ok(undefined),true,'a save from before heights');
  for(const h of [1,2,3]) assert.equal(ok(h),true,String(h));
  for(const h of [0,4,1.5,'2',null]) assert.equal(ok(h),false,String(h));
  let d={widgets:[{type:'links',size:'s'},{type:'notes',size:'m'}]};
  d=setHeight(d,'links',3);
  assert.deepEqual(d.widgets[0],{type:'links',size:'s',h:3});
  d=resizeWidget(d,'links','m');
  assert.equal(d.widgets[0].h,3,'resizing the width keeps the height');
  d=setHeight(d,'links',1);
  assert.deepEqual(d.widgets[0],{type:'links',size:'m'},'1 row is left out');
  assert.deepEqual(d.widgets[1],{type:'notes',size:'m'});
});

test('the starting layout depends on the halves a campaign has', () => {
  const both=defaultDashboard({},bothHalves),maps=defaultDashboard({},mapsOnly),notes=defaultDashboard({},notesOnly);
  assert.deepEqual(both.widgets,defaultDashboard().widgets,'both is the default');
  assert.deepEqual(both.widgets.slice(0,4),[{type:'next',size:'s'},{type:'scenes',size:'m'},{type:'links',size:'s',h:2},{type:'quests',size:'m'}]);
  assert.deepEqual(types(maps),['next','scenes','links','initiative','threads','roll','notes']);
  assert.deepEqual(types(notes),['next','quests','links','party','recap','threads','recent','notes']);
  assert.equal(types(maps).some(t=>missingHalf(t,mapsOnly)),false,'maps-only starts with nothing it cannot show');
  for(const [layout,halves] of [[both,bothHalves],[maps,mapsOnly],[notes,notesOnly]]){
    assert.equal(dashboardSchema.safeParse(layout).success,true);
    assert.deepEqual(types(layout).filter(t=>missingHalf(t,halves)),[]);
  }
  assert.equal(maps.widgets.find(w=>w.type==='threads').h,undefined);
  assert.equal(both.widgets.find(w=>w.type==='threads').h,2);
  const kept=defaultDashboard({notes:'n',threads:[{id:'t',text:'x',done:false}],links:[{label:'a',url:'https://a.example'}]},mapsOnly);
  assert.deepEqual([kept.notes,kept.threads.length,kept.links.length],['n',1,1],'reset keeps threads, notes and links');
});

test('every widget names the half it needs', () => {
  assert.deepEqual(dashWidgets.filter(t=>dashInfo[t].tool==='maps'),['scenes','initiative']);
  assert.deepEqual(dashWidgets.filter(t=>dashInfo[t].tool==='notes').sort(),['board','codex','date','party','quests','recap','recent']);
  assert.equal(missingHalf('roll',{maps:false,notes:false}),null);
  assert.equal(missingHalf('links',{maps:false,notes:false}),null);
  assert.equal(missingHalf('scenes',notesOnly),'maps');
  assert.equal(missingHalf('quests',mapsOnly),'notes');
  assert.equal(dashboardSchema.safeParse({widgets:[{type:'initiative',size:'s'},{type:'roll',size:'s',h:2}]}).success,true);
});

class Bucket {
 data=new Map();n=0;
 async get(key){const v=this.data.get(key);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;}
 async head(key){return this.get(key);}
 async put(key,text,options={}){const old=this.data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++this.n);this.data.set(key,{text,etag});return {etag};}
 async delete(key){this.data.delete(key);}
}
async function mapOnly(){
  const b=new Bucket(),s=campaignSession(b,'owner-1');
  const w=initialWorkspace();w.collections=[{id:'m1',name:'One-shot',kind:'campaign',parentId:null},{id:'m2',name:'Other',kind:'campaign',parentId:null}];w.scenes[0].containerId='m1';
  await saveWorkspace(b,s.prefix,w,null);
  return {b,s,w};
}

test('a Maptable-only campaign saves its dashboard in the home file and loads it back', async () => {
  const {b,s}=await mapOnly();
  const first=await loadHub(s,'m:m1');
  assert.equal(first.dashboard,null,'nothing saved yet: the page uses the starting layout for its halves');
  const dash={widgets:[{type:'initiative',size:'m',h:2},{type:'roll',size:'s'}],notes:'Bring minis',threads:[{id:'t1',text:'Who is the spy?',done:false}]};
  const saved=await saveDashboard(s,'m:m1',dash);
  assert.deepEqual(saved.dashboard,dash);
  assert.deepEqual((await loadHub(s,'m:m1')).dashboard,dash);
  assert.equal((await loadHub(s,'m:m2')).dashboard,null,'another campaign is untouched');
  const home=await readHome(b,'owner-1');
  assert.deepEqual(home.layout.campaignDashboards,{'m:m1':dash});
  assert.ok(b.data.has(homeKey('owner-1')));
  // Saving again replaces it, and another campaign gets its own.
  await saveDashboard(s,'m:m2',{widgets:[{type:'links',size:'l'}]});
  await saveDashboard(s,'m:m1',{widgets:[{type:'notes',size:'s'}]});
  const both=(await readHome(b,'owner-1')).layout.campaignDashboards;
  assert.deepEqual(Object.keys(both).sort(),['m:m1','m:m2']);
  assert.deepEqual(both['m:m1'].widgets,[{type:'notes',size:'s'}]);
});

test('saving a dashboard checks the layout and the campaign', async () => {
  const {s}=await mapOnly();
  await assert.rejects(saveDashboard(s,'m:m1',{widgets:[{type:'weather',size:'s'}]}));
  await assert.rejects(saveDashboard(s,'m:m1',{widgets:[{type:'links',size:'s',h:4}]}));
  await assert.rejects(saveDashboard(s,'m:m1',{widgets:[{type:'links',size:'s'}],links:[{label:'x',url:'javascript:1'}]}));
  await assert.rejects(saveDashboard(s,'m:nope',{widgets:[]}),/Campaign not found/);
  await assert.rejects(saveDashboard(s,'e:nope',{widgets:[]}),/Campaign not found/);
});

test('a campaign with notes keeps its dashboard in the Encyclopedia; the stored Maptable one is the fallback', async () => {
  const {b,s}=await mapOnly();
  const stored={widgets:[{type:'scenes',size:'l'}]},notesDash={widgets:[{type:'quests',size:'l',h:3}]};
  await saveDashboard(s,'m:m1',stored);
  const book={schemaVersion:1,worlds:[{id:'w1',name:'W',description:'',archived:false}],campaigns:[{id:'e1',worldId:'w1',name:'One-shot',description:'',github:{repository:'',branch:'main'},maptableCampaignId:'m1'}],entries:[]};
  assert.equal(await s.book.save('owner-1',book,0),1);
  const hub=await loadHub(s,'e:e1');
  assert.deepEqual(hub.dashboard,stored,'until the Encyclopedia one is saved, the Maptable one shows');
  const saved=await saveDashboard(s,'e:e1',notesDash);
  assert.deepEqual(saved.dashboard,notesDash);
  assert.deepEqual((await s.book.read('owner-1')).data.campaigns[0].dashboard,notesDash,'saved on the Encyclopedia campaign');
  assert.deepEqual((await readHome(b,'owner-1')).layout.campaignDashboards['m:m1'],stored,'the home file copy is left alone');
});

const scene=(id,name,containerId,tokens,extra={})=>({id,name,containerId,mapType:'encounter',tokens,...extra});
const tok=(id,name,initiative,extra={})=>({id,name,initiative,hp:10,maxHp:20,...extra});

test('the last encounter is the active scene with initiative, else the last one in order', () => {
  const ws={activeId:'b',collections:[{id:'m1',name:'C',kind:'campaign',parentId:null}],scenes:[
    scene('a','Ruins','m1',[tok('t1','Brosca',18),tok('t2','Ogre',9)],{initiativeState:{round:3,currentId:'t2',order:[]}}),
    scene('b','Quiet room','m1',[tok('t3','Statue',null)]),
    scene('c','Bridge','m1',[tok('t4','Troll',12)]),
    scene('x','Elsewhere','m9',[tok('t5','Nope',30)])]};
  const last=lastEncounter(ws,'m1');
  assert.equal(last.sceneId,'c','the active scene has no initiative, so the last scene in order that has some');
  ws.activeId='a';
  const a=lastEncounter(ws,'m1');
  assert.equal(a.sceneId,'a');
  assert.equal(a.round,3);
  assert.deepEqual(a.rows.map(r=>[r.name,r.initiative,r.active,r.stats]),[['Brosca',18,false,'10/20 HP'],['Ogre',9,true,'10/20 HP']]);
  assert.equal(lastEncounter({...ws,scenes:[scene('b','Quiet','m1',[tok('t3','Statue',null)])]},'m1'),null);
  const hub=hubOf({map:{workspace:ws},book:{data:{worlds:[],campaigns:[],entries:[]}}},'m:m1');
  assert.equal(hub.initiative.sceneId,'a');
});
