import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {dashboardSchema,defaultDashboard,toggleWidget,moveWidget,resizeWidget,excerpt} from '../lib/encyclopedia/dashboard.ts';

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
  assert.deepEqual(d.widgets.map(w=>w.type),['next','quests','scenes','party','recent','codex','threads']);
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
