import * as THREE from 'three';
// Dual of a pentagonal antiprism: ten kite faces, rather than a ten-sided bipyramid.
function tenGeometry(){
 const vertices=Array.from({length:10},(_,i)=>new THREE.Vector3(Math.cos(i*Math.PI/5),Math.sin(i*Math.PI/5),i%2?.52:-.52));
 const faces:number[][]=[[0,2,4,6,8],[1,3,5,7,9]];for(let i=0;i<10;i++)faces.push([i,(i+1)%10,(i+2)%10]);
 const dual=faces.map(f=>{const a=vertices[f[0]],n=vertices[f[1]].clone().sub(a).cross(vertices[f[2]].clone().sub(a)).normalize();if(n.dot(a)<0)n.negate();return n.multiplyScalar(1/n.dot(a));});
 const positions:number[]=[];vertices.forEach((v,i)=>{const n=v.clone().normalize(),u=new THREE.Vector3().crossVectors(n,new THREE.Vector3(0,0,1)).normalize(),w=n.clone().cross(u);const points=faces.map((f,j)=>f.includes(i)?dual[j]:null).filter((p):p is THREE.Vector3=>!!p).sort((a,b)=>Math.atan2(a.dot(w),a.dot(u))-Math.atan2(b.dot(w),b.dot(u)));for(let j=1;j<points.length-1;j++)positions.push(...points[0].toArray(),...points[j].toArray(),...points[j+1].toArray());});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();g.computeBoundingSphere();g.scale(1.25/g.boundingSphere!.radius,1.25/g.boundingSphere!.radius,1.25/g.boundingSphere!.radius);return g;
}
export function diceGeometry(sides:number):THREE.BufferGeometry{
 if(sides===4)return new THREE.TetrahedronGeometry(1.35);if(sides===6)return new THREE.BoxGeometry(1.65,1.65,1.65);if(sides===8)return new THREE.OctahedronGeometry(1.3);if(sides===10)return tenGeometry();if(sides===12)return new THREE.DodecahedronGeometry(1.25);return new THREE.IcosahedronGeometry(1.3);
}
export function diceFaces(geometry:THREE.BufferGeometry){
 const g=geometry.index?geometry.toNonIndexed():geometry,p=g.getAttribute('position'),faces:{normal:THREE.Vector3;points:THREE.Vector3[];center:THREE.Vector3}[]=[];
 for(let i=0;i<p.count;i+=3){const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j)),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();let f=faces.find(f=>f.normal.dot(normal)>.9999);if(!f){f={normal,points:[],center:new THREE.Vector3()};faces.push(f);}for(const v of points)if(!f.points.some(p=>p.distanceToSquared(v)<1e-8))f.points.push(v);}
 for(const f of faces)f.center.copy(f.points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/f.points.length));if(g!==geometry)g.dispose();return faces;
}
