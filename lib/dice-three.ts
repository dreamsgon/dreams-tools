import {startDiceAudio} from './dice-audio.ts';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import type {DiceAppearance} from './dice-appearance';
export const DICE_ROLL_MS=1900;
type Die=import("./dice-physics").PhysicalDie;
import {diceGeometry,diceFaces} from './dice-geometry.ts';
export {diceGeometry,diceFaces} from './dice-geometry.ts';
export function startThreeDice(canvas:HTMLCanvasElement,dice:Die[],style:DiceAppearance,reduced:boolean){
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-16,16,10,-10,.1,100);camera.position.set(0,-12,35);camera.lookAt(0,0,0);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xeaf6ff,0x243326,.8));const key=new THREE.DirectionalLight(0xfff1cf,2.2);key.position.set(-6,8,14);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-25,right:25,top:20,bottom:-20});key.shadow.normalBias=.04;scene.add(key);const rim=new THREE.DirectionalLight(0x8edbff,1.2);rim.position.set(8,-5,8);scene.add(rim);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.ShadowMaterial({opacity:.24}));floor.position.z=0;floor.receiveShadow=true;scene.add(floor);
 const resources:{dispose:()=>void}[]=[floor.geometry,floor.material,env];
 const expanded=dice.slice(0,24).flatMap(d=>d.motion?.bodies||[]);
 const duration=Math.max(0,...dice.map(d=>d.motion?.duration??0)),bounds=dice.find(d=>d.motion)?.motion;
 const labelMaterials=new Map<string,THREE.MeshStandardMaterial>();
 const objects=expanded.map((d,index)=>{
  const geometry=diceGeometry(d.sides),faces=diceFaces(geometry),group=new THREE.Group(),material=new THREE.MeshPhysicalMaterial({color:style.color,metalness:style.material==="metal"?1:style.material==="glass"||style.material==="gemstone"?0:.25,roughness:style.roughness??(style.material==="glass"?.04:.18),transmission:style.material==="glass"?.92:style.material==="gemstone"?.58:0,transparent:style.material==="glass"||style.material==="gemstone",opacity:style.material==="glass"?.65:style.material==="gemstone"?.9:1,thickness:2,ior:style.material==="gemstone"?2.1:1.5,attenuationColor:new THREE.Color(style.color),attenuationDistance:style.material==="gemstone"?1.5:5,clearcoat:1,clearcoatRoughness:.1,flatShading:d.sides!==6,envMapIntensity:style.material==="metal"?2.2:1.2});resources.push(geometry,material);const body=d.sides===6?new RoundedBoxGeometry(1.65,1.65,1.65,3,.085):geometry;if(body!==geometry)resources.push(body);const mesh=new THREE.Mesh(body,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  const edges=new THREE.EdgesGeometry(geometry,15),edgeMaterial=new THREE.LineBasicMaterial({color:new THREE.Color(style.color).lerp(new THREE.Color('#fff2bc'),.45),transparent:true,opacity:.5});resources.push(edges,edgeMaterial);if(d.sides!==6)group.add(new THREE.LineSegments(edges,edgeMaterial));
  const vertices:THREE.Vector3[]=[];for(const face of faces)for(const point of face.points)if(!vertices.some(p=>p.distanceToSquared(point)<1e-8))vertices.push(point);
  const labels=faces.flatMap((face,i)=>d.sides===4?face.points.map(point=>({...face,center:face.center.clone().lerp(point,.48),value:vertices.findIndex(p=>p.distanceToSquared(point)<1e-8)+1})): [{...face,value:i+1}]);
  const highlights:THREE.Object3D[]=[];
  labels.forEach((face)=>{
   const value=d.labels==='tens'?String((face.value-1)*10).padStart(2,'0'):d.labels==='units'?String(face.value-1):String(face.value);let labelMaterial=labelMaterials.get(value);if(!labelMaterial){const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d')!;
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${value.length>2?88:116}px ${style.font}`;ctx.lineJoin='round';ctx.strokeStyle=style.borderColor;ctx.lineWidth=9;ctx.strokeText(value,128,128);ctx.fillStyle=style.textColor;ctx.fillText(value,128,128);if(value==='6'||value==='9'){ctx.fillRect(104,194,48,5);}
   const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());labelMaterial=new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.65,metalness:.05,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});labelMaterials.set(value,labelMaterial);resources.push(texture,labelMaterial);}
   const size=d.sides===20?.96:d.sides===4?.62:d.sides===10?.78:1.02,labelGeometry=new THREE.PlaneGeometry(size,size),label=new THREE.Mesh(labelGeometry,labelMaterial);label.position.copy(face.center).addScaledVector(face.normal,.008);label.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),face.normal);group.add(label);resources.push(labelGeometry);
   if(d.sides===20&&face.value===d.value){const outlineGeometry=new THREE.BufferGeometry().setFromPoints([...face.points,face.points[0]].map(p=>p.clone().multiplyScalar(1.012))),outlineMaterial=new THREE.LineBasicMaterial({color:0xffdc78,depthTest:false});const outline=new THREE.Line(outlineGeometry,outlineMaterial);const plateGeometry=new THREE.BufferGeometry().setFromPoints(face.points.map(p=>p.clone().multiplyScalar(1.004))),plateMaterial=new THREE.MeshBasicMaterial({color:style.borderColor,transparent:true,opacity:.85,side:THREE.DoubleSide,depthTest:false});const plate=new THREE.Mesh(plateGeometry,plateMaterial);plate.renderOrder=4;plate.visible=false;group.add(plate);highlights.push(plate);resources.push(plateGeometry,plateMaterial);label.renderOrder=6;
   outline.renderOrder=5;outline.visible=false;group.add(outline);highlights.push(outline);resources.push(outlineGeometry,outlineMaterial);const bright=labelMaterial.clone();bright.emissive.set(style.textColor);bright.emissiveIntensity=.5;label.material=bright;resources.push(bright);}

  });scene.add(group);return {group,frames:d.frames,index,highlights};
 });
 const stopAudio=reduced?()=>{}:startDiceAudio(expanded,style);
 let frame=0,disposed=false;const start=performance.now();let width=0,height=0;
 const draw=(now:number)=>{if(disposed)return;if(width!==innerWidth||height!==innerHeight){width=innerWidth;height=innerHeight;renderer.setSize(width,height,false);const viewHeight=Math.max((bounds?.height??20)+3,((bounds?.width??30)+3)*height/width);camera.left=-viewHeight*width/height/2;camera.right=-camera.left;camera.top=viewHeight/2;camera.bottom=-camera.top;camera.updateProjectionMatrix();}
  const elapsed=reduced?duration:Math.max(0,now-start);objects.forEach(({group,frames,highlights})=>{highlights.forEach(h=>h.visible=elapsed>=duration);const f=Math.min(frames.length-1,elapsed*30/1000),i=Math.floor(f),a=frames[i],b=frames[Math.min(i+1,frames.length-1)],t=f-i;group.position.set(THREE.MathUtils.lerp(a[0],b[0],t),THREE.MathUtils.lerp(a[1],b[1],t),THREE.MathUtils.lerp(a[2],b[2],t));group.quaternion.set(a[3],a[4],a[5],a[6]).slerp(new THREE.Quaternion(b[3],b[4],b[5],b[6]),t);});renderer.render(scene,camera);if(!reduced&&elapsed<duration)frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);
 const resize=()=>{if(!disposed){cancelAnimationFrame(frame);draw(performance.now());}};window.addEventListener('resize',resize);
 return ()=>{stopAudio();disposed=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);resources.forEach(r=>r.dispose());key.shadow.dispose();renderer.dispose();renderer.forceContextLoss();};
}
