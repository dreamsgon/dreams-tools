import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace,campaignExport,defaultCharacter} from '../lib/encyclopedia/world-model.ts';
import {EncyclopediaStore} from '../lib/encyclopedia/store.ts';
import {callTool} from '../lib/mcp/tools.ts';
import {narrow} from '../lib/mcp/players-only.ts';
import {presets} from '../lib/mcp/permissions.ts';
import {makeCommit} from '../lib/mcp/commit.ts';
import {starterVehicleTypes,newVehicle,setValue,setGm,seat,addCrew,editCrew,cargoOps,systemOps,addLog,playerSafeVehicle,vehicleSchema} from '../lib/encyclopedia/vehicles.ts';

const C='demo-campaign',T='2026-11-16T10:00:00.000Z',ship=starterVehicleTypes()[0];
const page=(id,title,kind,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,...extra});
function world(){
 let v={...newVehicle(ship),visibility:'players',subtitle:'Liberator · System frigate',commanderId:'cap',ownerId:'port',ownerGm:true,crewVisibility:'players',holdVisibility:'players',systemsVisibility:'gm',logVisibility:'players'};
 v=setValue(v,ship,'specs','model','Liberator');v=setValue(v,ship,'specs','registry','Forged papers');v=setGm(v,ship,'specs','registry',true);
 v=seat(v,ship,'pilot',{name:'Osk'});v=addCrew(v,{name:'Vey'},'Crown spy');v=editCrew(v,v.crew[0].id,{gm:true});
 v=cargoOps.add(v,{name:'Spice',qty:12});v=cargoOps.add(v,{name:'Contraband rifles',qty:3,gm:true});
 v=systemOps.add(v,{name:'Laser battery',state:'ok',roll:'2d6+1'});
 v=addLog(v,{kind:'voyage',text:'Left Vesh.'});v=addLog(v,{kind:'note',text:'The cloak flickered on.',gm:true});
 const s=demoWorkspace();
 s.entries.push(page('cap','Ilsa Marrow','character',{character:defaultCharacter(),overviewVisibility:'players'}),page('port','Port Authority','faction'),page('gdn','GDN-205','vehicle',{vehicle:v}));
 return s;
}
const read=async(ctx,p)=>JSON.parse((await callTool(ctx,'read_page',{page:p})).content[0].text.replace(/^Campaign text.*\n/,''));

test('read_page gives a GM connection the whole vehicle in words, with GM-only parts marked',async()=>{
 const book=campaignExport(world(),C),r=await read({book,campaign:book.campaigns[0],maps:null,level:'read'},'GDN-205');
 const v=r.vehicle;
 assert.equal(v.type,'Starship');assert.equal(v.model,'Liberator · System frigate');
 assert.equal(v.owner,'Port Authority (GM only)');assert.equal(v.captain,'Ilsa Marrow');
 assert.ok(v.stats.includes('Registry: Forged papers (GM only)'));
 assert.ok(v.stations.includes('Pilot: Osk'));assert.deepEqual(v.crew,['Vey (Crown spy) (GM only)']);
 assert.deepEqual(v.hold.cargo,['12 Spice','3 Contraband rifles (GM only)']);
 assert.deepEqual(v.systems.list,['Laser battery: Working, roll 2d6+1']);assert.equal(v.systems.playersSee,false);
 assert.equal(v.log.latest[0],'Note: The cloak flickered on. (GM only)');
});

test('a players-only connection reads only what players see of a vehicle',async()=>{
 const full=campaignExport(world(),C),limited=narrow({book:full,campaign:full.campaigns[0],maps:null,level:'read',perms:{...presets.gm,seeSecrets:'off'}});
 const r=await read(limited,'GDN-205'),text=JSON.stringify(r);
 for(const secret of ['Forged','Port Authority','Crown spy','Contraband','cloak','Laser battery'])assert.ok(!text.includes(secret),secret);
 assert.ok(r.vehicle.stations.includes('Pilot: Osk'));assert.deepEqual(r.vehicle.hold.cargo,['12 Spice']);
 const hidden=world();hidden.entries.find(e=>e.id==='gdn').vehicle.visibility='gm';
 const h=campaignExport(hidden,C);
 assert.equal(narrow({book:h,campaign:h.campaigns[0],maps:null,level:'read',perms:{...presets.gm,seeSecrets:'off'}}).book.entries.find(e=>e.id==='gdn'),undefined,'a vehicle shared nowhere is left out');
 assert.ok(vehicleSchema.safeParse(playerSafeVehicle(world().entries.find(e=>e.id==='gdn').vehicle,x=>x)).success,'the narrowed vehicle is still a valid vehicle');
});

function bucket(){
 const data=new Map();let n=0;
 return {data,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){const v=data.get(k);if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;data.set(k,{text,etag:String(++n)});return {etag:String(n)};},
  async delete(k){data.delete(k);},
  async list(){return {objects:[],truncated:false};},
 };
}

test('create_page makes a vehicle of a chosen type, empty or rolled up, GM only',async()=>{
 const b=bucket(),store=new EncyclopediaStore(b);await store.save('gm-1',demoWorkspace(),0);
 const base={maps:null,level:'assist'},commit=makeCommit(b,{owner:'gm-1',campaignId:C,connectionId:'c1',connection:'Claude'},base,async()=>{});
 const call=async args=>{const {data}=await store.read('gm-1'),book=campaignExport(data,C);return callTool({...base,book,campaign:book.campaigns[0],commit},'create_page',args);};
 const find=async title=>(await store.read('gm-1')).data.entries.find(e=>e.title===title);
 assert.equal((await call({title:'The Gull',kind:'vehicle',vehicleType:'sailing ship',playersSee:true})).isError,false);
 const gull=await find('The Gull');
 assert.equal(gull.vehicle.typeId,'sailing-ship');assert.equal(gull.vehicle.visibility,'gm','the sheet starts GM only');assert.equal(gull.overviewVisibility,'players');
 assert.ok(gull.vehicle.specs.every(s=>!s.value),'an empty sheet');
 assert.equal((await call({title:'Mercy',kind:'vehicle',vehicleType:'Starship',rollUp:true,template:'Frigate'})).isError,false);
 const mercy=await find('Mercy');
 assert.equal(mercy.vehicle.specs.find(s=>s.id==='class').value,'Frigate');assert.ok(mercy.vehicle.systems.length>=3);
 assert.equal((await call({title:'X',kind:'vehicle',vehicleType:'Submarine'})).isError,true,'an unknown type is refused');
 assert.equal((await call({title:'Y',kind:'vehicle',rollUp:true,template:'Galleon'})).isError,true,'a template of another outline is refused');
});
