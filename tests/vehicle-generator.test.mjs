import test from 'node:test';
import assert from 'node:assert/strict';
import {starterVehicleTypes,vehicleSchema,cargoUsed,newVehicle,seat,addCrew,copyVehicleType,vehicleTypeSchema} from '../lib/encyclopedia/vehicles.ts';
import {generateVehicle,vehicleTemplates,applyGenerated} from '../lib/encyclopedia/vehicle-generator.ts';

const types=starterVehicleTypes(),ship=types[0],sail=types[1];

test('every template of every ready-made type gives a valid vehicle that fits its hold',()=>{
 for(const t of types)for(const tp of vehicleTemplates(t))for(let i=0;i<20;i++){
  const g=generateVehicle(t,`seed${i}`,tp.id);
  assert.ok(vehicleSchema.safeParse(g.vehicle).success,`${t.id} ${tp.id}`);
  assert.equal(g.templateId,tp.id);assert.ok(g.title.trim());
  assert.ok(cargoUsed(g.vehicle)<=g.vehicle.capacity+0.01,'never over capacity');
  assert.equal(g.vehicle.visibility,'gm','a rolled vehicle starts GM only');
 }
});

test('the same seed gives the same vehicle; templates and Any choose sensibly',()=>{
 const a=generateVehicle(ship,'abc'),b=generateVehicle(ship,'abc');
 assert.equal(a.title,b.title);assert.deepEqual(a.vehicle,b.vehicle);
 assert.notDeepEqual(generateVehicle(ship,'abd').vehicle,a.vehicle);
 assert.ok(vehicleTemplates(ship).some(t=>t.id===a.templateId),'Any picks one of the type’s templates');
 const frigate=generateVehicle(ship,'x','frigate');
 assert.equal(frigate.vehicle.specs.find(s=>s.id==='class').value,'Frigate');
 assert.ok(frigate.vehicle.systems.length>=3);
 assert.deepEqual(vehicleTemplates({art:'mech'}).map(t=>t.id),['walker']);
});

test('a type the GM made gets values for the fields whose names match',()=>{
 const own={...copyVehicleType(ship,types.map(t=>t.id)),specs:[{id:'model',label:'Model',kind:'text'},{id:'paint',label:'Paint job',kind:'text'}]};
 assert.ok(vehicleTypeSchema.safeParse(own).success);
 const g=generateVehicle(own,'s');
 assert.ok(g.vehicle.specs.find(s=>s.id==='model').value);
 assert.equal(g.vehicle.specs.find(s=>s.id==='paint').value,'','an unknown field stays empty');
 assert.equal(g.vehicle.typeId,own.id);
});

test('filling a page keeps its people, owner, location and visibility',()=>{
 let v={...newVehicle(ship),visibility:'players',holdVisibility:'players',ownerId:'port',locationText:'Docked at Vesh',subtitle:'Old line'};
 v=seat(v,ship,'pilot',{name:'Osk'});v=addCrew(v,{name:'Pell'},'Cabin boy');
 const g=generateVehicle(ship,'fill','courier').vehicle,out=applyGenerated(v,ship,ship,g);
 assert.equal(out.visibility,'players');assert.equal(out.holdVisibility,'players');assert.equal(out.ownerId,'port');assert.equal(out.locationText,'Docked at Vesh');
 assert.deepEqual(out.crew,v.crew);assert.deepEqual(out.stations,v.stations);
 assert.equal(out.subtitle,g.subtitle);assert.deepEqual(out.cargo,g.cargo);
 assert.ok(!('systemsVisibility' in out));
 const moved=applyGenerated(v,ship,sail,generateVehicle(sail,'fill').vehicle);
 assert.equal(moved.typeId,'sailing-ship');
 assert.ok(moved.stations.some(s=>s.name==='Osk'),'the pilot moves along, as changing the type does');
 assert.ok(vehicleSchema.safeParse(moved).success);
});
