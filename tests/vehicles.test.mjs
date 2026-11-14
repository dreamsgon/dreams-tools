import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,importCopy,searchableText,defaultCharacter} from '../lib/encyclopedia/world-model.ts';
import {starterVehicleTypes,vehicleTypeSchema,vehicleTypeOf,newVehicle,specRows,gaugeRows,nowRows,setValue,setGm,setGauge,gaugeStep,changeType,playerVehicle,remapVehicle,vehicleSchema,stationList,addStation,removeStation,editStation,seat,addCrew,editCrew,removeCrew,handRows,setHands,vehicleRolesOf,vehicleTypesOf,saveVehicleTypes,copyVehicleType,blankVehicleType,typeUse,typeFieldId,cargoOps,systemOps,cargoUsed,holdTitle,systemsTitle,validRoll} from '../lib/encyclopedia/vehicles.ts';

const C='demo-campaign',T='2026-11-14T10:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,...extra});
const types=starterVehicleTypes(),ship=types.find(t=>t.id==='starship'),sail=types.find(t=>t.id==='sailing-ship');
const ok=s=>workspaceSchema.safeParse(s);

function world(vehicle){
 const s=demoWorkspace();
 s.entries.push(
  page('cap','Ilsa Marrow','character',{character:defaultCharacter(),overviewVisibility:'players'}),
  page('spy','Agent Vey','character',{character:defaultCharacter()}),
  page('port','Port Authority','faction'),
  page('vesh','Vesh Station','place',{overviewVisibility:'players'}),
  page('gdn','GDN-205','vehicle',{vehicle}),
 );
 return s;
}

test('the five starter types are valid and keep fixed ids',()=>{
 assert.deepEqual(types.map(t=>t.id),['starship','sailing-ship','airship','carriage','car']);
 for(const t of types)assert.ok(vehicleTypeSchema.safeParse(t).success,t.name);
 assert.equal(vehicleTypeSchema.safeParse({...ship,gauges:[...ship.gauges,{id:'big',label:'Big',shape:'pips',colour:'other',max:50}]}).success,false,'pips stop at 20');
 assert.equal(vehicleTypeOf({typeId:'gone'}).id,'starship','a missing type falls back to the first');
});

test('a new vehicle starts GM only, with empty stats, full gauges and the type’s eyes',()=>{
 const v=newVehicle(ship);
 assert.ok(vehicleSchema.safeParse(v).success);
 assert.equal(v.visibility,'gm');
 assert.deepEqual(gaugeRows(v,ship).map(g=>[g.label,g.value,g.max]),[['Hull',40,40],['Shields',3,3],['Fuel',100,100]]);
 assert.equal(nowRows(v,ship).find(r=>r.id==='objective').gm,true,'Objective is GM only by default');
 assert.ok(specRows(v,ship).every(r=>r.value===''&&!r.gm));
});

test('values, eyes and gauges change one at a time and gauges stay in range',()=>{
 let v=newVehicle(ship);
 v=setValue(v,ship,'specs','model','  Liberator ');
 v=setGm(v,ship,'specs','registry',true);
 v=setGauge(v,ship,'hull',-5);
 assert.equal(specRows(v,ship).find(r=>r.id==='model').value,'Liberator');
 assert.equal(specRows(v,ship).find(r=>r.id==='registry').gm,true);
 assert.equal(gaugeRows(v,ship).find(g=>g.id==='hull').value,0);
 v=setGauge(v,ship,'shields',99);
 assert.equal(gaugeRows(v,ship).find(g=>g.id==='shields').value,3);
 v=setGm(v,ship,'gauges','fuel',true);v=setGauge(v,ship,'fuel',50);
 assert.deepEqual(gaugeRows(v,ship).find(g=>g.id==='fuel'),{id:'fuel',label:'Fuel',shape:'bar',colour:'fuel',max:100,value:50,gm:true},'a moved gauge keeps its eye');
 assert.equal(gaugeStep({shape:'pips',max:3}),1);assert.equal(gaugeStep({shape:'bar',max:100}),5);assert.equal(gaugeStep({shape:'bar',max:10}),1);
});

test('changing the type keeps values whose names match and drops the rest',()=>{
 let v=newVehicle(ship);
 v=setValue(v,ship,'specs','class','Frigate');v=setValue(v,ship,'specs','drive','Ion');v=setGauge(v,ship,'hull',30);
 const s=changeType(v,ship,sail);
 assert.equal(s.typeId,'sailing-ship');
 assert.equal(specRows(s,sail).find(r=>r.id==='class').value,'Frigate');
 assert.equal(gaugeRows(s,sail).find(g=>g.id==='hull').value,30,'Hull carries over');
 assert.ok(!s.specs.some(x=>x.id==='drive'));
 assert.ok(vehicleSchema.safeParse(s).success);
});

test('the workspace checks a vehicle’s links',()=>{
 const good={...newVehicle(ship),ownerId:'port',commanderId:'cap',locationId:'vesh'};
 assert.ok(ok(world(good)).success);
 assert.equal(ok(world({...good,commanderId:'port'})).success,false,'a commander must be a character');
 assert.equal(ok(world({...good,ownerId:'vesh'})).success,false,'an owner is a character or organization');
 const s=world(good);s.entries.find(e=>e.id==='cap').kind='note';delete s.entries.find(e=>e.id==='cap').character;
 assert.equal(ok(s).success,false);
 const wrong=world(undefined);wrong.entries.find(e=>e.id==='vesh').vehicle=newVehicle(ship);
 assert.equal(ok(wrong).success,false,'vehicle details only on a vehicle page');
});

test('players get only shown values and links to pages they can read',()=>{
 let v={...newVehicle(ship),visibility:'players',subtitle:'Liberator · System frigate',ownerId:'port',commanderId:'cap',locationId:'vesh'};
 v=setValue(v,ship,'specs','model','Liberator');v=setValue(v,ship,'specs','registry','Forged');v=setGm(v,ship,'specs','registry',true);
 v=setValue(v,ship,'now','objective','Seize the Quiet Mercy');v=setGm(v,ship,'gauges','fuel',true);
 const s=world(v);
 const pv=playerCampaign(s,C).entries.find(e=>e.id==='gdn').vehicle;
 assert.equal(pv.subtitle,'Liberator · System frigate');
 assert.equal(pv.commanderId,'cap');assert.equal(pv.locationId,'vesh');
 assert.equal(pv.ownerId,undefined,'the owner page is GM only');
 assert.deepEqual(pv.specs.map(x=>x.label),['Model']);
 assert.deepEqual(pv.gauges.map(x=>x.label),['Hull','Shields']);
 assert.deepEqual(pv.now,[]);
 const text=JSON.stringify(playerCampaign(s,C));
 for(const secret of ['Forged','Quiet Mercy','Port Authority'])assert.ok(!text.includes(secret),secret);
 const hidden=world({...v,visibility:'gm',commanderGm:true});
 assert.equal(playerCampaign(hidden,C).entries.find(e=>e.id==='gdn'),undefined,'a GM-only vehicle is not shared at all');
 assert.equal(playerVehicle({...v,commanderGm:true},ship,()=>true,x=>x).commanderId,undefined);
});

test('search, import and remapping carry vehicles across',()=>{
 const v={...setValue(newVehicle(ship),ship,'specs','model','Liberator'),commanderId:'cap',locationText:'Kessin Gate'};
 const s=world(v);
 const e=s.entries.find(x=>x.id==='gdn');
 assert.match(searchableText(e),/Liberator/);assert.match(searchableText(e),/Kessin Gate/);
 const copy=importCopy(demoWorkspace(),s),moved=copy.entries.find(x=>x.title==='GDN-205'&&x.kind==='vehicle');
 assert.ok(moved.vehicle.commanderId&&moved.vehicle.commanderId!=='cap');
 assert.equal(copy.entries.find(x=>x.id===moved.vehicle.commanderId).title,'Ilsa Marrow');
 assert.equal(remapVehicle({...v,ownerId:'x'},id=>id==='cap'?'c2':undefined).ownerId,undefined);
});

test('seats start as the type’s, and each vehicle can rename, pin, add and remove its own',()=>{
 let v=newVehicle(ship);
 assert.equal(v.stations,undefined,'a new vehicle keeps the type’s seats until it changes one');
 assert.deepEqual(stationList(v,ship).map(s=>[s.label,s.pic]),[['Pilot',true],['Gunner',true],['Engineer',true],['Sensors',true],['Medic',false],['Quartermaster',false]]);
 v=editStation(v,ship,'medic',{label:'  Ship’s doctor ',pic:true});
 v=editStation(v,ship,'gunner',{label:'   '});
 v=addStation(v,ship,'Tractor beam');
 v=removeStation(v,ship,'quartermaster');
 const list=stationList(v,ship);
 assert.deepEqual(list.map(s=>s.label),['Pilot','Gunner','Engineer','Sensors','Ship’s doctor','Tractor beam']);
 assert.equal(list.find(s=>s.label==='Ship’s doctor').pic,true);
 assert.equal(list.at(-1).pic,false,'a new seat starts in the Crew tab');
 assert.ok(vehicleSchema.safeParse(v).success);
 assert.equal(stationList(newVehicle(ship),ship).length,6,'the type itself is unchanged');
});

test('a character holds one seat at a time; names, the manifest and counts work',()=>{
 let v=seat(newVehicle(ship),ship,'pilot',{characterId:'cap'});
 v=seat(v,ship,'gunner',{characterId:'cap'});
 assert.equal(stationList(v,ship).find(s=>s.id==='pilot').characterId,undefined,'moving seats empties the old one');
 v=seat(v,ship,'engineer',{name:'  Osk '});v=seat(v,ship,'sensors',{characterId:'spy'});v=editStation(v,ship,'sensors',{gm:true});
 assert.equal(stationList(v,ship).find(s=>s.id==='engineer').name,'Osk');
 v=addCrew(v,{name:'Dr. Hale'},'Medic');v=addCrew(v,{characterId:'cap'});v=addCrew(v,{characterId:'cap'});v=addCrew(v,{name:'  '});
 assert.equal(v.crew.length,2,'no duplicates and no blank names');
 v=editCrew(v,v.crew[1].id,{role:'Owner’s eyes',gm:true});
 v=setHands(v,ship,'marines',{value:-3});v=setHands(v,ship,'crew',{value:22});v=setHands(v,ship,'nope',{value:5});
 assert.deepEqual(handRows(v,ship).map(h=>[h.label,h.value]),[['Crew',22],['Marines',0]]);
 assert.deepEqual(vehicleRolesOf({...v,commanderId:'cap'},ship,'cap'),['Captain','Gunner','Crew · Owner’s eyes']);
 assert.ok(vehicleSchema.safeParse(v).success);
 assert.equal(removeCrew(removeCrew(v,v.crew[0].id),v.crew[1].id).crew,undefined);
 assert.equal(vehicleSchema.safeParse({...v,crew:[{id:'x'}]}).success,false,'a crew member needs a page or a name');
});

test('changing the type keeps people in seats with the same name and never drops anyone',()=>{
 let v=seat(newVehicle(ship),ship,'pilot',{name:'Tam'});
 v=seat(v,ship,'quartermaster',{characterId:'cap'});
 v=seat(v,ship,'gunner',{name:'Rook'});
 v=setHands(v,ship,'marines',{value:8});
 const s=changeType(v,ship,sail),list=stationList(s,sail);
 assert.equal(list.find(x=>x.label==='Quartermaster').characterId,'cap','same seat name, same person');
 assert.ok(list.some(x=>x.name==='Tam'&&!x.pic),'an unmatched seat moves to the Crew tab');
 assert.ok(list.some(x=>x.name==='Rook'));
 assert.ok(!list.some(x=>x.label==='Engineer'),'empty seats of the old type go');
 assert.equal(handRows(s,sail).find(h=>h.label==='Marines').value,8);
 assert.ok(vehicleSchema.safeParse(s).success);
});

test('seats and crew must be character pages, and players see only what is shown',()=>{
 let v={...newVehicle(ship),visibility:'players'};
 v=seat(v,ship,'pilot',{characterId:'cap'});v=seat(v,ship,'sensors',{characterId:'spy'});v=seat(v,ship,'engineer',{name:'Osk'});
 v=seat(v,ship,'medic',{name:'Doctor Secret'});v=editStation(v,ship,'gunner',{gm:true});
 v=addCrew(v,{name:'Hidden Stowaway'});v=editCrew(v,v.crew[0].id,{gm:true});v=addCrew(v,{characterId:'spy'},'Crown spy');v=addCrew(v,{name:'Bo'},'Cook');
 v=setHands(v,ship,'marines',{value:8,gm:true});v=setHands(v,ship,'crew',{value:22});
 assert.ok(ok(world(v)).success);
 assert.equal(ok(world(seat(v,ship,'pilot',{characterId:'port'}))).success,false,'an organization can’t sit in a seat');
 assert.equal(ok(world(addCrew(v,{characterId:'vesh'}))).success,false);
 let pv=playerCampaign(world(v),C).entries.find(e=>e.id==='gdn').vehicle;
 assert.deepEqual(pv.stations.map(s=>s.label),['Pilot','Engineer','Sensors'],'Crew tab not shared: pinned, shown seats only');
 assert.equal(pv.stations.find(s=>s.label==='Pilot').characterId,'cap');
 assert.deepEqual(pv.stations.find(s=>s.label==='Sensors'),{id:'sensors',label:'Sensors',pic:true,unknown:true},'a page players can’t read stays unnamed');
 assert.equal(pv.crewTab,undefined);
 v={...v,crewVisibility:'players'};
 pv=playerCampaign(world(v),C).entries.find(e=>e.id==='gdn').vehicle;
 assert.deepEqual(pv.stations.map(s=>s.label),['Pilot','Engineer','Sensors','Medic','Quartermaster']);
 assert.deepEqual(pv.crewTab.crew.map(c=>c.name??c.characterId),['Bo'],'GM-only and unreadable people are left out');
 assert.deepEqual(pv.crewTab.hands,[{id:'crew',label:'Crew',value:22}]);
 const text=JSON.stringify(playerCampaign(world(v),C));
 for(const secret of ['Hidden Stowaway','Crown spy','Agent Vey'])assert.ok(!text.includes(secret),secret);
 const hidden=world({...v,visibility:'gm'});
 assert.equal(playerCampaign(hidden,C).entries.find(e=>e.id==='gdn'),undefined,'a shared Crew tab on a GM-only vehicle is not shared');
});

test('imports carry seats and crew across and drop pages that didn’t come',()=>{
 let v=seat(newVehicle(ship),ship,'pilot',{characterId:'cap'});v=addCrew(v,{characterId:'cap'},'Owner');v=addCrew(v,{characterId:'gone'});
 const r=remapVehicle(v,id=>id==='cap'?'c2':undefined);
 assert.equal(stationList(r,ship).find(s=>s.id==='pilot').characterId,'c2');
 assert.deepEqual(r.crew.map(c=>c.characterId),['c2'],'a crew row with no page left and no name goes');
 const copy=importCopy(demoWorkspace(),world(seat(newVehicle(ship),ship,'pilot',{characterId:'cap'})));
 const moved=copy.entries.find(x=>x.title==='GDN-205'&&x.kind==='vehicle'),pilot=stationList(moved.vehicle,ship).find(s=>s.id==='pilot');
 assert.equal(copy.entries.find(x=>x.id===pilot.characterId).title,'Ilsa Marrow');
});

test('a world keeps its own vehicle types, and saving them tidies its vehicles',()=>{
 let v=setGauge(setValue(newVehicle(ship),ship,'specs','drive','Ion'),ship,'hull',30);
 v=setHands(v,ship,'marines',{value:8});
 const s=world(v),w=s.worlds.find(x=>x.id==='demo-world');
 assert.deepEqual(vehicleTypesOf(w).map(t=>t.id),types.map(t=>t.id),'a world starts with the ready-made types');
 const mech={...copyVehicleType(ship,types.map(t=>t.id)),name:'Walker',art:'mech'};
 assert.notEqual(mech.id,'starship');assert.equal(mech.name,'Walker');
 const mine=[{...ship,specs:ship.specs.filter(f=>f.id!=='drive'),gauges:ship.gauges.map(g=>g.id==='hull'?{...g,max:20}:g),hands:ship.hands.filter(h=>h.id!=='marines')},mech,...types.filter(t=>t.id!=='starship'&&t.id!=='car')];
 const r=saveVehicleTypes(s.worlds,s.entries,'demo-world',mine);
 const next={...s,worlds:r.worlds,entries:r.entries};
 assert.ok(workspaceSchema.safeParse(next).success);
 const nv=next.entries.find(e=>e.id==='gdn').vehicle,nw=next.worlds.find(x=>x.id==='demo-world');
 assert.deepEqual(vehicleTypesOf(nw).map(t=>t.name),['Starship','Walker','Sailing ship','Airship','Carriage']);
 assert.ok(!nv.specs.some(x=>x.id==='drive'),'a removed stat’s value goes');
 assert.equal(gaugeRows(nv,vehicleTypeOf(nv,nw)).find(g=>g.id==='hull').value,20,'a gauge stays inside its new maximum');
 assert.equal(nv.hands,undefined);
 assert.throws(()=>saveVehicleTypes(s.worlds,s.entries,'demo-world',[]),/./,'a world keeps at least one type');
 assert.throws(()=>saveVehicleTypes(s.worlds,s.entries,'demo-world',[ship,ship]),/unique/);
 assert.equal(workspaceSchema.safeParse({...s,worlds:s.worlds.map(x=>x.id==='demo-world'?{...x,vehicleTypes:[{...ship,name:''}]}:x)}).success,false);
});

test('deleting a type in use moves its vehicles to the first type and keeps matching values',()=>{
 const v=setValue(setGauge(newVehicle(ship),ship,'hull',30),ship,'specs','class','Frigate');
 const s=world(v);
 assert.deepEqual(typeUse(s.entries,'demo-world',types),{starship:1});
 const r=saveVehicleTypes(s.worlds,s.entries,'demo-world',[sail]);
 const nv=r.entries.find(e=>e.id==='gdn').vehicle,nw=r.worlds.find(x=>x.id==='demo-world');
 assert.equal(nv.typeId,'sailing-ship');
 assert.equal(specRows(nv,vehicleTypeOf(nv,nw)).find(x=>x.id==='class').value,'Frigate');
 assert.equal(gaugeRows(nv,vehicleTypeOf(nv,nw)).find(x=>x.id==='hull').value,30);
 const blank=blankVehicleType(['new-type']);assert.notEqual(blank.id,'new-type');assert.ok(vehicleTypeSchema.safeParse(blank).success);
 assert.equal(typeFieldId('Rail guns!'),'rail-guns');
});

test('the hold and systems lists add, change and remove lines, and rolls must be dice',()=>{
 let v=newVehicle(ship);
 v=cargoOps.add(v,{name:'Spice',qty:12.5});v=cargoOps.add(v,{name:'Contraband rifles',qty:3,gm:true});
 assert.equal(cargoUsed(v),15.5);
 const spice=v.cargo[0].id;
 v=cargoOps.edit(v,spice,{note:'Sealed',qty:10});v=cargoOps.edit(v,spice,{note:undefined});
 assert.deepEqual(v.cargo[0],{id:spice,name:'Spice',qty:10},'a blank note goes');
 v=systemOps.add(v,{name:'Laser battery',state:'ok',roll:'2d6+1'});
 v=systemOps.edit(v,v.systems[0].id,{state:'damaged',gm:false});
 assert.equal(v.systems[0].state,'damaged');assert.ok(!('gm' in v.systems[0]));
 assert.ok(vehicleSchema.safeParse(v).success);
 assert.equal(vehicleSchema.safeParse({...v,systems:[{...v.systems[0],roll:'lots of dice'}]}).success,false,'a roll the roller can’t read');
 assert.equal(vehicleSchema.safeParse({...v,systems:[{...v.systems[0],state:'exploded'}]}).success,false);
 assert.equal(vehicleSchema.safeParse({...v,cargo:[v.cargo[0],v.cargo[0]]}).success,false,'ids are unique');
 assert.ok(validRoll('1d20+5'));assert.ok(!validRoll('d'));
 v=systemOps.remove(cargoOps.remove(cargoOps.remove(v,v.cargo[1].id),spice),v.systems[0].id);
 assert.ok(!('cargo' in v)&&!('systems' in v),'an empty list is left off');
 assert.deepEqual(types.map(t=>[holdTitle(t),t.holdUnit,systemsTitle(t)]),[['Cargo hold','t','Systems'],['Hold','casks','Guns and rigging'],['Gondola hold','crates','Envelope and engines'],['Luggage','trunks','Fittings'],['Boot','kg','Mods']]);
 const old={...ship};delete old.hold;delete old.holdUnit;delete old.systems;
 assert.ok(vehicleTypeSchema.safeParse(old).success,'types saved before the Hold existed still load');
 assert.deepEqual([holdTitle(old),systemsTitle(old)],['Hold','Systems']);
});

test('players see the Hold and Systems only when shared, without GM-only lines',()=>{
 let v={...newVehicle(ship),visibility:'players',capacity:40};
 v=cargoOps.add(v,{name:'Spice',qty:12,note:'For Vesh'});v=cargoOps.add(v,{name:'Contraband rifles',qty:3,gm:true});
 v=systemOps.add(v,{name:'Laser battery',state:'ok',roll:'2d6+1'});v=systemOps.add(v,{name:'Cloaking field',state:'offline',gm:true,note:'Secret prototype'});
 const pv=s=>playerCampaign(world(s),C).entries.find(e=>e.id==='gdn').vehicle;
 assert.equal(pv(v).holdTab,undefined);assert.equal(pv(v).systemsTab,undefined,'both tabs start GM only');
 const shared=pv({...v,holdVisibility:'players',systemsVisibility:'players'});
 assert.deepEqual(shared.holdTab,{title:'Cargo hold',unit:'t',capacity:40,used:12,cargo:[{id:v.cargo[0].id,name:'Spice',note:'For Vesh',qty:12}]},'the total counts only what players see');
 assert.deepEqual(shared.systemsTab.systems.map(x=>[x.name,x.state,x.roll]),[['Laser battery','ok','2d6+1']]);
 const text=JSON.stringify(playerCampaign(world({...v,holdVisibility:'players',systemsVisibility:'players'}),C));
 for(const secret of ['Contraband','Cloaking','Secret prototype'])assert.ok(!text.includes(secret),secret);
 assert.equal(playerCampaign(world({...v,visibility:'gm',holdVisibility:'players'}),C).entries.find(e=>e.id==='gdn'),undefined,'a GM-only vehicle shares no tab');
 assert.ok(searchableText(world(v).entries.find(e=>e.id==='gdn')).includes('Cloaking field'),'the GM’s search finds systems');
 const moved=changeType(v,ship,sail);
 assert.deepEqual([moved.cargo.length,moved.systems.length,moved.capacity],[2,2,40],'changing the type keeps the hold and systems');
});
