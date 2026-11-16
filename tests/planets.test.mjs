import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,importCopy,searchableText} from '../lib/encyclopedia/world-model.ts';
import {survey,defaultOptions,editWorld,findWorld,removeWorld,solSystem} from '../lib/encyclopedia/star-systems.ts';
import {planetSchema,planetOf,profileOf,mirrorPlanets,planetForWorldMap,hasSurface} from '../lib/encyclopedia/planets.ts';

const C='demo-campaign',T='2026-11-16T10:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,...extra});
/** A workspace with a system page and one charted world. */
function charted(){
  const s=survey({name:'Kel',star:'K',companions:[],premise:'',options:defaultOptions(),backdrop:'nebula',seed:'kel'});
  const w=s.bodies.find(b=>b.moons.length)??s.bodies[0],sys=editWorld(s,w.id,{pageId:'kel-world'});
  const ws=demoWorkspace();
  ws.entries.push(page('kel','Kel','system',{starSystem:sys}));
  ws.entries.push({...page('kel-world',w.name,'place',{planet:planetOf('kel',sys,findWorld(sys,w.id)),body:'Its story.',overviewVisibility:'players'}),parentId:'kel'});
  return {ws,w};
}

test('a charted world keeps a copy of its survey that follows the chart', () => {
  const {ws,w}=charted();
  assert.equal(workspaceSchema.safeParse(ws).success,true);
  const p=ws.entries.find(e=>e.id==='kel-world').planet;
  assert.equal(planetSchema.safeParse(p).success,true);
  assert.equal(p.profile.name,w.name);assert.equal(p.star,'K');
  const sys=ws.entries.find(e=>e.id==='kel');
  const edited={...sys,starSystem:editWorld(sys.starSystem,w.id,{name:'Corira',life:'complex',air:'dense'})};
  const next=mirrorPlanets(ws.entries.map(e=>e.id==='kel'?edited:e),'kel',T);
  const after=next.find(e=>e.id==='kel-world');
  assert.equal(after.title,'Corira','the page takes the new name');
  assert.equal(after.planet.profile.life,'complex');
  assert.equal(after.planet.profile.air,'dense');
  assert.ok(after.planet.profile.temp>p.profile.temp,'dense air warms it');
  assert.equal(mirrorPlanets(next,'kel',T).find(e=>e.id==='kel-world'),after,'nothing changed, the same page comes back');
  const gone=mirrorPlanets(next.map(e=>e.id==='kel'?{...e,starSystem:removeWorld(e.starSystem,w.id)}:e),'kel',T);
  assert.deepEqual(gone.find(e=>e.id==='kel-world').planet,after.planet,'removed from the chart, the page keeps its last survey');
});

test('moons know their planet, and the world map generator gets what it needs', () => {
  const {ws,w}=charted(),sys=ws.entries.find(e=>e.id==='kel').starSystem,moon=w.moons[0];
  assert.equal(profileOf(sys,moon).orbits,w.name);
  const m=planetForWorldMap(ws.entries.find(e=>e.id==='kel-world'));
  assert.deepEqual(Object.keys(m).sort(),['atmosphere','band','category','gravity','hazard','life','moonOf','name','seed','settled','size','star','temperature','type','water'].sort());
  assert.equal(m.seed,`kel:${w.id}`);
  assert.equal(m.star,'K');
  assert.equal(planetForWorldMap(page('x','X','place')),null);
  const sol=solSystem();
  assert.equal(hasSurface(profileOf(sol,sol.bodies[2])),true);
  assert.equal(hasSurface(profileOf(sol,sol.bodies[4])),false,'Jupiter has no ground');
});

test('planet pages stay with the GM, copy with their system, and refuse the wrong pages', () => {
  const {ws}=charted();
  assert.match(searchableText(ws.entries.find(e=>e.id==='kel-world')),/Its story/);
  const view=playerCampaign(ws,C),pv=view.entries.find(e=>e.id==='kel-world');
  assert.ok(pv,'the page itself can be shared');assert.equal('planet' in pv,false,'its survey copy is not');
  const copy=importCopy(demoWorkspace(),ws),sys=copy.entries.find(e=>e.title==='Kel'),world=copy.entries.find(e=>e.planet);
  assert.equal(world.planet.systemPageId,sys.id);
  assert.equal(sys.starSystem.bodies.flatMap(b=>[b,...b.moons]).find(x=>x.id===world.planet.bodyId).pageId,world.id);
  assert.equal(workspaceSchema.safeParse(copy).success,true);
  const wrongKind=demoWorkspace();wrongKind.entries.push(page('n','Note','note',{planet:ws.entries.find(e=>e.id==='kel-world').planet}));
  assert.equal(workspaceSchema.safeParse(wrongKind).success,false,'only a place page is a charted world');
  const wrongSystem=demoWorkspace();wrongSystem.entries.push(page('a','A place','place'),page('b','B','place',{planet:{...ws.entries.find(e=>e.id==='kel-world').planet,systemPageId:'a'}}));
  assert.equal(workspaceSchema.safeParse(wrongSystem).success,false,'it must point at a star system page');
  const wrongMap=charted().ws;wrongMap.entries=wrongMap.entries.map(e=>e.id==='kel-world'?{...e,planet:{...e.planet,worldMapId:'kel'}}:e);
  assert.equal(workspaceSchema.safeParse(wrongMap).success,false,'its world map must be a map page');
});
