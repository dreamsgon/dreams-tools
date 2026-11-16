import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace} from '../lib/encyclopedia/world-model.ts';
import {editWorld,findWorld,solSystem} from '../lib/encyclopedia/star-systems.ts';
import {planetOf,planetForWorldMap,hasSurface} from '../lib/encyclopedia/planets.ts';
import {surveyStart,tempStep,lockedToStar} from '../lib/encyclopedia/planet-from-system.ts';
import {generatePlanet} from '../lib/encyclopedia/planet-generator.ts';
import {newMap} from '../lib/encyclopedia/map-model.ts';

const C='demo-campaign',T='2026-11-16T10:00:00.000Z';
const sol=solSystem();
const byName=n=>{for(const b of sol.bodies){if(b.name===n)return b;const m=b.moons.find(x=>x.name===n);if(m)return m;}throw Error(n);};
/** A Sol world charted as a planet page, read as the world map generator reads it. */
const surveyed=(name,patch={})=>{const s=Object.keys(patch).length?editWorld(sol,byName(name).id,patch):sol,w=findWorld(s,byName(name).id);
 const entry={id:`p-${w.id}`,title:w.name,planet:planetOf('sol',s,w)};return {...planetForWorldMap(entry),day:entry.planet.profile.day};};

test('a surveyed world sets the planet generator from its kind, temperature, water, air, life, size and towns',()=>{
 const earth=surveyStart(surveyed('Earth'));
 assert.equal(earth.preset,'earthlike','a water world with sapient life keeps continents');
 assert.equal(earth.options.temp,0);assert.equal(earth.options.water,72);assert.equal(earth.options.life,'complex');
 assert.equal(earth.options.size,'medium');assert.equal(earth.options.rotation,'spin');assert.equal(earth.options.places,14);assert.equal(earth.options.roads,true);
 assert.equal(earth.options.seed,'sol:'+byName('Earth').id,'the seed is the world’s own');
 assert.deepEqual(surveyStart(surveyed('Earth')),earth,'the same world starts from the same settings');
 const mars=surveyStart(surveyed('Mars'));
 assert.equal(mars.preset,'desert');assert.equal(mars.options.temp,-3);assert.equal(mars.options.life,'none');assert.equal(mars.options.places,0);assert.equal(mars.options.roads,false);
 assert.ok(mars.options.rain<=12,'thin air carries little rain');
 assert.ok(mars.options.mountains>surveyStart(surveyed('Mars',{gravity:1})).options.mountains,'low gravity lets mountains stand taller');
 assert.match(mars.notes.join(' · '),/Desert world to start · -63 °C · seas under ice · thin air/);
 const ocean=surveyStart(surveyed('Earth',{life:'none',settled:'nobody'}));
 assert.equal(ocean.preset,'ocean');assert.equal(ocean.options.water,93);
 const io=surveyStart(surveyed('Io'));assert.equal(io.preset,'volcanic');assert.equal(io.options.volcanism,95);
 const europa=surveyStart(surveyed('Europa'));assert.ok(europa.options.temp<=-2);assert.equal(europa.options.water,88);
 assert.equal(surveyStart(surveyed('Earth',{life:'microbial'})).options.life,'simple');
 assert.equal(surveyStart(surveyed('Earth',{settled:'colony'})).options.places,6);
 assert.equal(surveyStart(surveyed('Earth',{size:'massive'})).options.size,'large');
 assert.equal(hasSurface({kind:'gas'}),false);
 assert.deepEqual([-80,-30,0,15,30,50,200].map(tempStep),[-3,-2,-1,0,1,2,3]);
});

test('only a planet with one face to its star is tidally locked; a moon locked to its planet still has days',()=>{
 assert.equal(lockedToStar({day:'Locked: one side faces the star',moonOf:null}),true);
 assert.equal(lockedToStar({day:'26 hours',moonOf:null}),false);
 assert.equal(lockedToStar({day:'Locked to Jupiter',moonOf:'Jupiter'}),false);
 const locked=surveyStart(surveyed('Earth',{day:'Locked: one side faces the star'}));
 assert.equal(locked.options.rotation,'locked');assert.equal(locked.options.tilt,0);assert.ok(locked.notes.includes('tidally locked'));
 assert.equal(surveyStart(surveyed('Europa')).options.rotation,'spin');
});

test('developing a planet page makes a world map page under it, linked from the planet, that generates a whole planet',()=>{
 const ws=demoWorkspace(),earth=byName('Earth'),sys=editWorld(sol,earth.id,{pageId:'earth'});
 ws.entries.push({id:'sol',worldId:'demo-world',campaignId:C,parentId:null,title:'Sol',kind:'system',body:'',starSystem:sys,updatedAt:T});
 const planetPage={id:'earth',worldId:'demo-world',campaignId:C,parentId:'sol',title:'Earth',kind:'place',body:'Home.',planet:planetOf('sol',sys,findWorld(sys,earth.id)),updatedAt:T};
 const map={...newMap('world','blank','Earth world map',24,18),compass:true,scaleBar:true};
 ws.entries.push({...planetPage,planet:{...planetPage.planet,worldMapId:'earth-map'}},{id:'earth-map',worldId:'demo-world',campaignId:C,parentId:'earth',title:'Earth world map',kind:'map',body:'',tabs:[],overviewVisibility:'gm',mapData:map,updatedAt:T});
 const parsed=workspaceSchema.safeParse(ws);assert.equal(parsed.success,true,parsed.error?.issues?.[0]?.message);
 const start=surveyStart({...planetForWorldMap(planetPage),day:planetPage.planet.profile.day});
 const made=generatePlanet(start.options,map);
 assert.equal(made.paint.columns,made.paint.rows*2,'a whole planet that wraps east to west');
 assert.ok(made.pins.filter(p=>p.kind!=='landmark').length>=10,'a homeworld gets towns');
 assert.equal(made.planet.life,'complex');
});
