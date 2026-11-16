import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,searchableText,importCopy} from '../lib/encyclopedia/world-model.ts';
import {presetGalaxy} from '../lib/encyclopedia/galaxies.ts';
import {sectorSchema,generateSector,generateSystems,newSector,localBubble,realStars,hexDistance,hexLabel,lightYears,lightTime,nearestLanes,toggleLane,withoutSystem,laneSteps,newSystem,distanceBetween,maxSystems,LOCAL_BUBBLE} from '../lib/encyclopedia/sectors.ts';
import {defaultTab} from '../lib/encyclopedia/place.ts';

const C='demo-campaign',T='2026-11-16T10:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,...extra});
const opts={cols:12,rows:7,count:14,seed:'Coreward Reach',lanes:true,rumours:30,x:.5,y:.4,color:'#e0a84a',backdrop:'nebula'};

test('hex distances, labels and light-speed times', () => {
  assert.equal(hexDistance({c:0,r:0},{c:0,r:0}),0);
  assert.equal(hexDistance({c:0,r:0},{c:1,r:0}),1);
  assert.equal(hexDistance({c:0,r:0},{c:0,r:1}),1,'odd rows sit half a hex right');
  assert.equal(hexDistance({c:1,r:0},{c:0,r:1}),1);
  assert.equal(hexDistance({c:0,r:0},{c:3,r:4}),5);
  assert.equal(lightYears({c:0,r:0},{c:2,r:0}),10,'one hex is 5 ly');
  assert.equal(hexLabel({c:6,r:2}),'0703');
  assert.equal(lightTime(10),'10 years');
  assert.equal(lightTime(1),'1 year');
  assert.equal(lightTime(4.4),'4.4 years');
  assert.equal(lightTime(0),'Here');
});

test('a generated sector is valid, repeatable and spread out', () => {
  const a=generateSector(opts),b=generateSector(opts);
  assert.deepEqual(a,b);
  assert.equal(sectorSchema.safeParse(a).success,true);
  assert.equal(a.systems.length,14);
  const cells=new Set(a.systems.map(s=>`${s.c},${s.r}`));
  assert.equal(cells.size,14,'one system per hex');
  assert.ok(a.systems.some(s=>s.status==='rumour')&&a.systems.some(s=>s.status==='charted'));
  assert.ok(a.systems.filter(s=>s.status==='rumour').every(s=>s.note),'a rumour comes with its rumour');
  assert.ok(a.lanes.length>0);
  for(const l of a.lanes){const [x,y]=[a.systems.find(s=>s.id===l.a),a.systems.find(s=>s.id===l.b)];assert.equal(x.status,'charted');assert.equal(y.status,'charted');}
  assert.equal(generateSector({...opts,lanes:false}).lanes.length,0);
  assert.equal(generateSector({...opts,count:999}).systems.length<=maxSystems(12,7),true,'at most half the hexes');
  assert.notDeepEqual(generateSector({...opts,seed:'other'}).systems,a.systems);
});

test('generating again keeps the systems the GM changed', () => {
  const a=generateSector(opts),mine={...a.systems[3],name:'Corira',edited:true};
  const again=generateSystems({...opts,seed:'new seed'},[mine]);
  const kept=again.systems.find(s=>s.id===mine.id);
  assert.deepEqual(kept,mine);
  assert.equal(again.systems.filter(s=>s.c===mine.c&&s.r===mine.r).length,1,'nothing else lands on it');
  assert.equal(generateSystems({...opts,cols:4,rows:3},[{...mine,c:10}]).systems.some(s=>s.id===mine.id),false,'a kept system outside a smaller sector is dropped');
});

test('the Local Bubble puts real stars at about their real distance from the Sun', () => {
  const s=localBubble({x:.6,y:.6,color:'#7fdc9a'});
  assert.equal(sectorSchema.safeParse(s).success,true);
  assert.equal(s.real,true);
  assert.equal(s.cols,LOCAL_BUBBLE.cols);
  assert.equal(s.systems.length,realStars.length);
  const sol=s.systems.find(x=>x.name==='Sol');
  for(const x of s.systems)assert.ok(Math.abs(hexDistance(sol,x)*5-x.ly)<=5.5,`${x.name}: ${hexDistance(sol,x)*5} ly on the map, ${x.ly} ly really`);
  const sirius=s.systems.find(x=>x.name==='Sirius');
  assert.equal(distanceBetween(sol,sirius),8.6,'the real distance from the Sun');
  assert.equal(distanceBetween(sirius,s.systems.find(x=>x.name==='Procyon')),lightYears(sirius,s.systems.find(x=>x.name==='Procyon')),'between two other stars, the map distance');
});

test('lanes: nearest neighbours, joining, removing and steps', () => {
  const sys=(id,c,r,status='charted')=>({id,c,r,name:id,star:'G',status,note:''});
  const s={...generateSector({...opts,count:0}),systems:[sys('a',0,0),sys('b',1,0),sys('c',5,0),sys('d',6,0,'rumour')],lanes:[]};
  assert.deepEqual(nearestLanes(s.systems),[{a:'a',b:'b'},{a:'c',b:'b'}]);
  let t=toggleLane(s,'a','b');assert.equal(t.lanes.length,1);
  t=toggleLane(t,'b','c');assert.equal(laneSteps(t,'a','c'),2);
  assert.equal(laneSteps(t,'a','d'),null);
  assert.equal(toggleLane(t,'b','a').lanes.length,1,'joining again removes the lane');
  const w=withoutSystem(t,'b');assert.equal(w.systems.length,3);assert.equal(w.lanes.length,0);
  assert.equal(sectorSchema.safeParse(w).success,true);
  const added=newSystem(s,{c:3,r:3},'rumour','x');assert.equal(added.status,'rumour');assert.ok(added.note);assert.equal(added.edited,true);
});

test('bad sectors are refused', () => {
  const a=generateSector(opts);
  assert.equal(sectorSchema.safeParse({...a,systems:[...a.systems,{...a.systems[0],id:'dup'}]}).success,false,'two systems in one hex');
  assert.equal(sectorSchema.safeParse({...a,systems:[{...a.systems[0],c:12}]}).success,false,'outside the sector');
  assert.equal(sectorSchema.safeParse({...a,lanes:[{a:'nope',b:a.systems[0].id}]}).success,false,'a lane to nowhere');
  assert.equal(sectorSchema.safeParse({...a,cols:31}).success,false);
});

test('a sector page inside a galaxy saves, searches and stays away from players', () => {
  const s=demoWorkspace();
  s.entries.push(page('mw','Milky Way','galaxy',{galaxy:presetGalaxy('milky')}));
  s.entries.push({...page('lb','Local Bubble','sector',{sector:localBubble({x:.6,y:.6,color:'#7fdc9a'}),overviewVisibility:'players',body:'Home.'}),parentId:'mw'});
  s.entries.push(page('cr','Coreward Reach','sector',{sector:newSector('Coreward Reach')}));
  assert.equal(workspaceSchema.safeParse(s).success,true);
  assert.match(searchableText(s.entries.find(e=>e.id==='lb')),/Sirius/);
  assert.equal(defaultTab('sector'),'sector');
  const view=playerCampaign(s,C),lb=view.entries.find(e=>e.id==='lb');
  assert.ok(lb);assert.equal('sector' in lb,false);
  assert.doesNotMatch(JSON.stringify(view),/Sirius/);
  const copy=importCopy(demoWorkspace(),s);
  assert.equal(copy.entries.find(e=>e.title==='Local Bubble')?.sector?.systems.length,realStars.length);
  const wrong=demoWorkspace();wrong.entries.push(page('n','Note','note',{sector:newSector('x')}));
  assert.equal(workspaceSchema.safeParse(wrong).success,false);
});
