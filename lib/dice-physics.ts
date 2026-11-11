import * as C from 'cannon-es';
import {Vector3,Quaternion} from 'three';
import {diceGeometry,diceFaces} from './dice-geometry.ts';
export type Pose=[number,number,number,number,number,number,number];
export type PhysicalBody={sides:number;value:number;labels?:'tens'|'units';impacts?:{time:number;strength:number}[];frames:Pose[]};
export type DiceMotion={bodies:PhysicalBody[];duration:number;width:number;height:number;collisions?:number};
export type PhysicalDie={sides:number;value:number;motion?:DiceMotion};
const supported=[4,6,8,10,12,20,100];
function model(sides:number){const geometry=diceGeometry(sides),faces=diceFaces(geometry),vertices:Vector3[]=[];for(const f of faces)for(const p of f.points)if(!vertices.some(v=>v.distanceToSquared(p)<1e-8))vertices.push(p.clone());const polygons=faces.map(f=>{const u=f.points[0].clone().sub(f.center).normalize(),v=f.normal.clone().cross(u);return f.points.slice().sort((a,b)=>Math.atan2(a.clone().sub(f.center).dot(v),a.clone().sub(f.center).dot(u))-Math.atan2(b.clone().sub(f.center).dot(v),b.clone().sub(f.center).dot(u))).map(p=>vertices.findIndex(v=>v.distanceToSquared(p)<1e-8));});geometry.dispose();return {vertices,faces,shape:new C.ConvexPolyhedron({vertices:vertices.map(v=>new C.Vec3(v.x,v.y,v.z)),faces:polygons})};}
export function landedResult(sides:number,rotation:{x:number;y:number;z:number;w:number}){const m=model(sides),q=new Quaternion(rotation.x,rotation.y,rotation.z,rotation.w);const directions=sides===4?m.vertices:m.faces.map(f=>f.normal);const top=directions.map((v,i)=>({i,z:v.clone().normalize().applyQuaternion(q).z})).sort((a,b)=>b.z-a.z)[0];return {value:top.i+1,confidence:top.z};}
export function landedValue(sides:number,rotation:{x:number;y:number;z:number;w:number}){return landedResult(sides,rotation).value;}
export function simulateDice(sidesList:number[],random:()=>number=Math.random,aspect=1.7):PhysicalDie[]{
 if(sidesList.length>100)throw Error('Roll at most 100 dice at once for physics rolls. Split this roll into smaller groups.');
 const results:PhysicalDie[]=sidesList.map(sides=>({sides,value:1+Math.floor(random()*sides)}));
 // Bound work per world; every standard die is simulated, including dice beyond the visual limit.
 for(let offset=0;offset<results.length;offset+=24){const batch=results.slice(offset,offset+24),width=aspect<1?18:30,height=width/Math.max(.5,Math.min(2,aspect)),world=new C.World({gravity:new C.Vec3(0,0,-24),allowSleep:true});world.defaultContactMaterial.friction=.38;world.defaultContactMaterial.restitution=.38;(world.solver as C.GSSolver).iterations=14;
  const floor=new C.Body({mass:0,shape:new C.Plane()});world.addBody(floor);
  for(const [x,y,sx,sy] of [[-width/2-1,0,1,height],[width/2+1,0,1,height],[0,-height/2-1,width,1],[0,height/2+1,width,1]]){const wall=new C.Body({mass:0,shape:new C.Box(new C.Vec3(sx,sy,12))});wall.position.set(x,y,5);world.addBody(wall);}
  const physical:{body:C.Body;record:PhysicalBody;target:PhysicalDie}[]=[];
  for(const target of batch){if(!supported.includes(target.sides))continue;const kinds=target.sides===100?['tens','units'] as const:[undefined];target.motion={bodies:[],duration:0,width,height};for(const labels of kinds){const sides=target.sides===100?10:target.sides,m=model(sides),index=physical.length,body=new C.Body({mass:1,shape:m.shape,linearDamping:.28,angularDamping:.28,sleepSpeedLimit:.22,sleepTimeLimit:.45});
    body.position.set(-width/2+2+(index%6)*2.4,-height/2+2+Math.floor(index/6)*2.4,4+Math.floor(index/24)*3+random()*2);body.velocity.set(5+random()*6,4+random()*5,1+random()*3);body.angularVelocity.set((random()-.5)*24,(random()-.5)*24,(random()-.5)*24);body.quaternion.setFromEuler(random()*Math.PI*2,random()*Math.PI*2,random()*Math.PI*2);world.addBody(body);const record:PhysicalBody={sides,value:0,labels,frames:[]};target.motion.bodies.push(record);physical.push({body,record,target});}}
  if(!physical.length)continue;let collisions=0;for(const p of physical)p.body.addEventListener('collide',(e:{body:C.Body})=>{if(e.body.mass>0)collisions++;});let steps=0;for(const p of physical){p.record.impacts=[];let last=-1;p.body.addEventListener('collide',(e:{body:C.Body;contact:C.ContactEquation})=>{const strength=Math.abs(e.contact.getImpactVelocityAlongNormal()),time=(steps+1)*1000/60;if(strength>.45&&time-last>45&&(e.body.mass===0||p.body.id<e.body.id)){p.record.impacts!.push({time,strength:Math.min(20,strength)});last=time;}});}const snapshot=()=>physical.forEach(({body:b,record})=>record.frames.push([b.position.x,b.position.y,b.position.z,b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w]));snapshot();
  for(;steps<1200;steps++){world.step(1/60);if(steps%2===1)snapshot();if(steps>90&&physical.every(p=>p.body.sleepState===C.Body.SLEEPING)){const cocked=physical.filter(p=>landedResult(p.record.sides,p.body.quaternion).confidence<.94);if(!cocked.length)break;for(const p of cocked){p.body.wakeUp();p.body.velocity.z=7;p.body.angularVelocity.set(random()*8+2,random()*8+2,random()*8+2);}}}
  if(!physical.every(p=>p.body.sleepState===C.Body.SLEEPING))throw Error('Dice did not settle. Please roll again. No result was saved.');
  snapshot();const duration=(physical[0].record.frames.length-1)*1000/30;
  for(const p of physical)p.record.value=landedValue(p.record.sides,p.body.quaternion);
  for(const target of batch){if(!target.motion)continue;target.motion.duration=duration;target.motion.collisions=collisions;const b=target.motion.bodies;target.value=target.sides===100?((b[0].value-1)*10+b[1].value-1)||100:b[0].value;}
 }return results;
}
