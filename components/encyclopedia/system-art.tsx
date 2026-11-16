"use client";
/*
 * Star system pictures, all drawn on canvases from the system's data so the same world always looks the same:
 * - planet sprites: a lit sphere with terrain, bands, clouds and an air glow, by kind, type and air;
 * - the orbit scene: the star (and companions), orbits on a log scale, the green zone and frost line, belts, planets
 *   with rings and moons, animated unless the GM pauses it or the system asks for reduced motion;
 * - the horizon: the sky from a world, with its star at its true apparent size, the parent planet or moons overhead.
 * Space is always dark, whatever the app theme.
 */
import {useEffect,useRef} from 'react';
import {starInfo,type StarClass} from '@/lib/encyclopedia/sectors';
import {galaxyRandom} from '@/lib/encyclopedia/galaxies';
import {isGiant,parentOf,starSizeFrom,zones,type StarSystem,type World,type WorldKind} from '@/lib/encyclopedia/star-systems';
import {drawBackdrop,drawStar} from './sector-map';

type RGB=[number,number,number];
const PAL:Record<WorldKind,RGB[]>={
 rocky:[[70,66,62],[128,120,110],[170,160,146],[205,196,182]],
 desert:[[120,82,48],[176,128,78],[214,170,112],[236,206,150]],
 magma:[[24,18,18],[56,40,38],[84,58,50],[255,90,40]],
 ice:[[150,180,200],[190,214,228],[222,236,244],[250,252,255]],
 water:[[18,52,96],[30,86,140],[52,128,170],[120,150,100]],
 jungle:[[22,60,40],[40,98,52],[76,130,60],[30,70,120]],
 toxic:[[96,104,30],[150,150,48],[196,186,80],[220,214,140]],
 gas:[[150,98,58],[204,160,110],[232,206,160],[176,120,80]],
 'ice-giant':[[52,110,170],[96,160,210],[150,204,236],[70,130,190]],
};
const hash=(t:string)=>{let n=2166136261;for(const ch of t)n=Math.imul(n^ch.charCodeAt(0),16777619);return n>>>0;};
function noise(seed:number){const at=(i:number,j:number)=>{let n=Math.imul(i,374761393)+Math.imul(j,668265263)+Math.imul(seed,1442695041);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;};
 return (x:number,y:number)=>{const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),a=at(i,j)+(at(i+1,j)-at(i,j))*u,b=at(i,j+1)+(at(i+1,j+1)-at(i,j+1))*u;return a+(b-a)*v;};}
const fbm=(n:(x:number,y:number)=>number,x:number,y:number)=>{let s=0,a=0.5,f=1;for(let k=0;k<5;k++){s+=a*n(x*f,y*f);f*=2;a*=0.5;}return s;};
const mix=(a:RGB,b:RGB,t:number):RGB=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const ramp=(p:RGB[],t:number)=>{t=Math.max(0,Math.min(0.999,t));const k=t*(p.length-1),i=Math.floor(k);return mix(p[i],p[Math.min(i+1,p.length-1)],k-i);};

type Look=Pick<World,'id'|'kind'|'type'|'air'>;
const sprites=new Map<string,HTMLCanvasElement>();
/** A world as a lit sphere, px wide. Cached: the same world and size always gives the same picture. */
export function planetSprite(w:Look,px=96){
 const key=`${w.id}|${w.kind}|${w.type}|${w.air}|${px}`,hit=sprites.get(key);if(hit)return hit;
 const c=document.createElement('canvas');c.width=c.height=px;const g=c.getContext('2d');if(!g)return c;
 const img=g.createImageData(px,px),sd=hash(w.id),n=noise(sd),n2=noise(sd+7),R=px/2-1,pal=PAL[w.kind],L=[-0.62,-0.38,0.69],cr=galaxyRandom(w.id);
 const giant=isGiant(w.kind),cloudy=(w.kind==='water'||w.kind==='jungle'||w.air==='dense'||w.air==='toxic')&&w.kind!=='magma';
 for(let y=0;y<px;y++)for(let x=0;x<px;x++){
  const dx=(x+0.5-px/2)/R,dy=(y+0.5-px/2)/R,d2=dx*dx+dy*dy,o=(y*px+x)*4;if(d2>1)continue;
  const dz=Math.sqrt(1-d2),lon=Math.atan2(dx,dz),lat=Math.asin(dy),u=lon*1.6+3,v=lat*1.6+3;let col:RGB;
  if(giant){const t=fbm(n,u*0.7,v*0.6)*0.6,band=Math.sin(lat*(w.kind==='gas'?11:6)+t*4+fbm(n2,u,v*3)*2)*0.5+0.5;col=ramp(pal,band*0.85+0.08);
   if(w.type==='Storm'){const sx=lon-0.3,sy=lat-0.25;col=mix(col,[190,90,60],Math.exp(-(sx*sx*8+sy*sy*30))*0.9);}}
  else{const h=fbm(n,u,v);
   if(w.kind==='water')col=h>0.58?ramp([[70,110,60],[120,140,80],[170,150,110]],(h-0.58)*4):ramp([[10,40,90],[24,80,140],[60,140,170]],h/0.58);
   else if(w.kind==='jungle')col=h<0.42?ramp([[14,50,100],[30,90,140]],h/0.42):ramp([[24,70,36],[44,110,50],[90,130,60]],(h-0.42)*1.8);
   else if(w.kind==='magma'){const k=Math.abs(fbm(n2,u*2,v*2)-0.5);col=ramp(pal.slice(0,3),h);if(k<0.035)col=mix(col,[255,96+cr()*40,30],1-k/0.035);}
   else if(w.kind==='ice'){col=ramp(pal,h*1.1);if(Math.abs(fbm(n2,u*3,v*3)-0.5)<0.02)col=mix(col,[120,150,180],0.6);}
   else{col=ramp(pal,h*1.05);if(w.type==='Scarred'||w.type==='Cratered'){const k=fbm(n2,u*4,v*4);if(k>0.62)col=mix(col,[60,56,52],(k-0.62)*3);}}
   if(cloudy){const cl=fbm(n2,u*1.3+5,v*2.2);if(cl>0.55)col=mix(col,w.air==='toxic'?[220,210,140]:[245,248,250],Math.min(0.85,(cl-0.55)*3.2));}}
  let lit=Math.max(0,dx*L[0]+dy*L[1]+dz*L[2]);lit=0.16+0.95*Math.pow(lit,0.9);
  let r=col[0]*lit,gg=col[1]*lit,b=col[2]*lit;
  if(w.kind==='magma'&&col[0]>200){r=col[0];gg=col[1];b=col[2];}
  if(w.air!=='none'){const rim=Math.pow(1-dz,3)*(w.air==='thin'?0.35:0.8),at:RGB=w.kind==='toxic'||w.air==='toxic'?[230,210,110]:w.kind==='magma'?[255,120,60]:[140,200,255];r+=at[0]*rim*lit;gg+=at[1]*rim*lit;b+=at[2]*rim*lit;}
  img.data[o]=Math.min(255,r);img.data[o+1]=Math.min(255,gg);img.data[o+2]=Math.min(255,b);img.data[o+3]=d2>0.96?255*(1-(d2-0.96)/0.04):255;}
 g.putImageData(img,0,0);
 if(sprites.size>400)sprites.clear();
 sprites.set(key,c);return c;
}

/** A small round picture of a world (or a star), for lists. */
export function WorldDot({world,star,size}:{world?:Look;star?:StarClass;size:number}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const c=ref.current;if(!c)return;const dpr=Math.min(2,window.devicePixelRatio||1),px=Math.round(size*dpr);c.width=c.height=px;const g=c.getContext('2d');if(!g)return;g.clearRect(0,0,px,px);
  if(world)g.drawImage(planetSprite(world,Math.max(32,Math.min(128,px))),0,0,px,px);else if(star)drawStar(g,star,px/2,px/2,px/4.6);},[world?.id,world?.kind,world?.type,world?.air,star,size]); // eslint-disable-line react-hooks/exhaustive-deps -- the look is what matters
 return <canvas ref={ref} className="system-dot" style={{width:size,height:size}} aria-hidden="true"/>;
}

const SIZE_PX={tiny:30,small:38,medium:46,large:52,massive:58};
export const worldPx=(w:Pick<World,'size'>)=>SIZE_PX[w.size];

type Hit={x:number;y:number;r:number;id:string};
/** Where each orbit sits on screen: a log scale from just inside the first world (or the green zone) to past the last. */
function orbitScale(s:StarSystem,maxR:number,r0:number){
 const z=zones(s),inner=Math.min(s.bodies[0]?.au??1,z.hzIn)*0.8,outer=Math.max(s.bodies[s.bodies.length-1]?.au??1,...s.belts.map(b=>b.au),z.frost)*1.05,lo=Math.log(inner),hi=Math.log(outer);
 return (au:number)=>r0+(Math.log(au)-lo)/(hi-lo||1)*(maxR-r0);
}
/** Paints the orbit scene at time t (seconds of animation). Returns where the worlds are, for taps. */
export function drawSystem(g:CanvasRenderingContext2D,s:StarSystem,w:number,h:number,t:number,o:{zones:boolean;selected?:string|null;seed:string}){
 drawBackdrop(g,s.backdrop,o.seed,w,h);
 const z=zones(s),cx=w/2,cy=h*0.5,ys=0.42,maxR=Math.min(w*0.46,h/ys*0.39),starR=Math.max(9,Math.min(22,w/36)),R=orbitScale(s,maxR,starR*2.1);
 const ring=(r:number,style:string,dash:number[]=[],lw=1)=>{g.beginPath();g.ellipse(cx,cy,r,r*ys,0,0,Math.PI*2);g.strokeStyle=style;g.lineWidth=lw;g.setLineDash(dash);g.stroke();g.setLineDash([]);};
 if(o.zones){const a=R(z.hzIn),b=R(z.hzOut);g.beginPath();g.ellipse(cx,cy,b,b*ys,0,0,Math.PI*2);g.ellipse(cx,cy,a,a*ys,0,0,Math.PI*2,true);g.fillStyle='rgba(110,220,150,.13)';g.fill('evenodd');ring(a,'rgba(127,220,154,.45)',[4,4]);ring(b,'rgba(127,220,154,.45)',[4,4]);ring(R(z.frost),'rgba(143,196,255,.5)',[6,5]);}
 for(const p of s.bodies)ring(R(p.au),'rgba(255,255,255,.14)');
 for(const b of s.belts){const r0=R(b.au),rr=galaxyRandom(`${b.id}|${o.seed}`);for(let i=0;i<220;i++){const a=rr()*Math.PI*2+t*0.02,d=r0+(rr()-0.5)*14,sz=0.8+rr()*1.8;g.fillStyle=rr()<0.5?'rgba(190,175,160,.8)':'rgba(140,155,175,.75)';g.fillRect(cx+Math.cos(a)*d,cy+Math.sin(a)*d*ys,sz,sz);}}
 const draws:{y:number;f:()=>void}[]=[],close=s.companions.some(c=>c.separation==='close');
 s.companions.forEach((c,i)=>{if(c.separation==='close'){const a=t*0.6+i*Math.PI+Math.PI,x=cx+Math.cos(a)*starR*1.6,y=cy+Math.sin(a)*starR*1.3*ys;draws.push({y,f:()=>drawStar(g,c.star,x,y,starR*0.55)});}
  else{const a=-0.7+t*0.01+i*2.2,x=cx+Math.cos(a)*maxR*1.02,y=cy+Math.sin(a)*maxR*1.02*ys;draws.push({y,f:()=>drawStar(g,c.star,x,y,starR*0.42)});}});
 draws.push({y:cy,f:()=>drawStar(g,s.star,close?cx-Math.cos(t*0.6)*starR*0.5:cx,cy,starR)});
 const hits:Hit[]=[],small=w<500?0.85:1;
 for(const p of s.bodies){const r=R(p.au),sp=0.35/Math.pow(Math.max(0.2,r/maxR*3),1.5),a=p.phase+t*sp,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*ys,pr=Math.max(4,worldPx(p)/5.2*small);
  draws.push({y,f:()=>{
   if(p.rings){g.beginPath();g.ellipse(x,y,pr*2,pr*0.6,-0.25,0,Math.PI*2);g.strokeStyle='rgba(225,205,170,.7)';g.lineWidth=2;g.stroke();}
   g.drawImage(planetSprite(p,96),x-pr,y-pr,pr*2,pr*2);
   p.moons.forEach((_,k)=>{const ma=t*1.4/(k+1)+k*2,md=pr+5+k*4;g.fillStyle='rgba(210,215,225,.9)';g.beginPath();g.arc(x+Math.cos(ma)*md,y+Math.sin(ma)*md*0.6,1.4,0,Math.PI*2);g.fill();});
   const on=o.selected===p.id||p.moons.some(m=>m.id===o.selected);
   if(on){g.beginPath();g.arc(x,y,pr+4,0,Math.PI*2);g.strokeStyle='#8fe3d6';g.lineWidth=1.6;g.stroke();}
   g.font='600 11px system-ui,sans-serif';g.textAlign='center';g.fillStyle='rgba(232,238,245,.92)';g.shadowColor='#000';g.shadowBlur=4;g.fillText(p.name,x,y+pr+13);g.shadowBlur=0;}});
  hits.push({x,y,r:pr+8,id:p.id});}
 draws.sort((a,b)=>a.y-b.y).forEach(d=>d.f());
 return hits;
}

const still=()=>typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** The orbit scene as a canvas. Taps on a world call onPick. */
export function SystemOrbit({system,seed,playing,showZones,selected,onPick,className,label}:{system:StarSystem;seed:string;playing:boolean;showZones:boolean;selected?:string|null;onPick?:(id:string)=>void;className?:string;label:string}){
 const canvas=useRef<HTMLCanvasElement>(null),hits=useRef<Hit[]>([]),time=useRef(0);
 useEffect(()=>{
  const c=canvas.current;if(!c)return;let frame=0,last=performance.now(),size='';
  const paint=()=>{const box=c.getBoundingClientRect();if(box.width<4||box.height<4)return;const dpr=Math.min(2,window.devicePixelRatio||1),now=`${box.width}x${box.height}`;
   if(now!==size){size=now;c.width=Math.round(box.width*dpr);c.height=Math.round(box.height*dpr);}
   const g=c.getContext('2d');if(!g)return;g.setTransform(dpr,0,0,dpr,0,0);hits.current=drawSystem(g,system,box.width,box.height,time.current,{zones:showZones,selected,seed});};
  const animate=playing&&!still();
  const tick=(t:number)=>{time.current+=Math.min(0.05,(t-last)/1000);last=t;paint();frame=requestAnimationFrame(tick);};
  if(animate)frame=requestAnimationFrame(tick);else paint();
  const watch=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{if(!animate)paint();});watch?.observe(c);
  return ()=>{cancelAnimationFrame(frame);watch?.disconnect();};
 },[system,seed,playing,showZones,selected]);
 const click=(e:React.MouseEvent<HTMLCanvasElement>)=>{if(!onPick)return;const box=e.currentTarget.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;
  let best:Hit|null=null,bd=Infinity;for(const hh of hits.current){const d=Math.hypot(hh.x-x,hh.y-y);if(d<hh.r&&d<bd){bd=d;best=hh;}}if(best)onPick(best.id);};
 return <canvas ref={canvas} className={className} role="img" aria-label={label} onClick={click} style={onPick?{cursor:'pointer'}:undefined}/>;
}

const SKY:Record<string,[string,string]>={none:['#000','#05070d'],thin:['#04060f','#1b2440'],dense:['#8a96a6','#e4e0d6'],crushing:['#3d2414','#b8713a'],toxic:['#4a4a12','#c9c060']};
/** The sky from a world: its star at its true apparent size (the Sun from Earth is 14 px), and what hangs overhead. */
export function drawHorizon(g:CanvasRenderingContext2D,s:StarSystem,wd:World,w:number,h:number){
 const r=galaxyRandom(`${wd.id}|sky`),air=wd.air,giant=isGiant(wd.kind),c=starInfo[s.star];
 const sk=air==='standard'?(s.star==='M'?['#3a1f2a','#c27a5a']:s.star==='K'?['#28406a','#d8a77a']:['#1f4f9a','#9cc6ee']):SKY[air];
 const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,sk[0]);gr.addColorStop(1,sk[1]);g.fillStyle=gr;g.fillRect(0,0,w,h);
 if(air==='none'||air==='thin')for(let i=0;i<w*h/250;i++){g.fillStyle=`rgba(255,255,255,${0.2+r()*0.7})`;g.fillRect(r()*w,r()*h*0.75,1,1);}
 const sd=Math.max(2.5,Math.min(h*1.4,14*starSizeFrom(wd.au,s.star))),sx=w*0.74,sy=h*0.32,glow=sd*2.6+18;
 const sg=g.createRadialGradient(sx,sy,0,sx,sy,glow);sg.addColorStop(0,c.core);sg.addColorStop(Math.min(0.9,sd/glow),c.glow);sg.addColorStop(1,c.rim+'00');g.fillStyle=sg;g.fillRect(0,0,w,h);
 g.beginPath();g.arc(sx,sy,sd/2,0,Math.PI*2);g.fillStyle=c.core;g.fill();
 const parent=parentOf(s,wd.id),hazy=air==='dense'||air==='crushing';
 if(parent){const ps=h*0.75;g.globalAlpha=hazy?0.45:0.95;g.drawImage(planetSprite(parent,128),w*0.12,-ps*0.25,ps,ps);g.globalAlpha=1;}
 if('moons' in wd)wd.moons.forEach((m,i)=>{const ms=Math.max(5,20-i*4);g.globalAlpha=air==='dense'?0.5:0.9;g.drawImage(planetSprite(m,48),w*(0.18+i*0.13),h*(0.15+(i%2)*0.14),ms,ms);g.globalAlpha=1;});
 if(air==='dense'||air==='toxic'||air==='crushing'){const hz=g.createLinearGradient(0,h*0.4,0,h);hz.addColorStop(0,'rgba(255,255,255,0)');hz.addColorStop(1,air==='toxic'?'rgba(220,210,120,.45)':air==='crushing'?'rgba(200,120,60,.5)':'rgba(240,240,235,.5)');g.fillStyle=hz;g.fillRect(0,0,w,h);}
 const pal=PAL[wd.kind],n=noise(hash(wd.id));
 if(giant){for(let i=0;i<5;i++){const y=h*(0.62+i*0.09),col=pal[i%pal.length];g.fillStyle=`rgba(${col.map(v=>Math.round(v*0.8)).join(',')},.92)`;g.beginPath();g.moveTo(0,h);for(let x=0;x<=w;x+=8)g.lineTo(x,y+Math.sin(x/40+i)*4+fbm(n,x/60,i)*10);g.lineTo(w,h);g.fill();}return;}
 const sea=wd.water==='ocean'||wd.water==='abundant',base=sea?h*0.74:h*0.68;
 const col:RGB=wd.kind==='ice'?[200,218,232]:wd.kind==='jungle'?[30,70,38]:wd.kind==='water'?[70,90,60]:pal[1];
 ([[0.9,0.55],[1,0.35]] as const).forEach(([dark,amp],li)=>{g.fillStyle=`rgb(${col.map(v=>Math.round(v*(li?0.55:0.8)*dark)).join(',')})`;g.beginPath();g.moveTo(0,h);
  for(let x=0;x<=w;x+=4)g.lineTo(x,base+li*h*0.08-fbm(n,x/(li?90:160),li*5)*h*amp*(sea&&!li?0.6:1)+(sea&&!li?h*0.1:0));g.lineTo(w,h);g.fill();});
 if(sea){g.fillStyle=air==='standard'?'rgba(30,80,140,.9)':'rgba(40,70,90,.9)';g.fillRect(0,h*0.8,w,h*0.2);g.fillStyle='rgba(255,255,255,.25)';g.fillRect(sx-sd,h*0.8,sd*2,2);}
 if(wd.kind==='magma'){g.strokeStyle='rgba(255,110,40,.9)';g.lineWidth=1.5;for(let i=0;i<7;i++){g.beginPath();let x=r()*w,y=h*0.85+r()*h*0.12;g.moveTo(x,y);for(let k=0;k<5;k++){x+=(r()-0.5)*30;y+=(r()-0.5)*8;g.lineTo(x,y);}g.stroke();}}
}
export function Horizon({system,world,className,label}:{system:StarSystem;world:World;className?:string;label:string}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const c=ref.current;if(!c)return;
  const paint=()=>{const box=c.getBoundingClientRect();if(box.width<4||box.height<4)return;const dpr=Math.min(2,window.devicePixelRatio||1);c.width=Math.round(box.width*dpr);c.height=Math.round(box.height*dpr);const g=c.getContext('2d');if(!g)return;g.setTransform(dpr,0,0,dpr,0,0);drawHorizon(g,system,world,box.width,box.height);};
  paint();if(typeof ResizeObserver==='undefined')return;let last=`${c.clientWidth}`;const watch=new ResizeObserver(()=>{if(`${c.clientWidth}`!==last){last=`${c.clientWidth}`;paint();}});watch.observe(c);return ()=>watch.disconnect();},[system,world]);
 return <canvas ref={ref} className={className} role="img" aria-label={label}/>;
}
