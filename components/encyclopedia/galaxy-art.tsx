"use client";
/*
 * Galaxy art: thousands of seeded star dots in the galaxy's shape (spiral arms, a bar, an elliptical swarm,
 * irregular clumps or a ring), drawn on a canvas at the size it is shown. The same seed, shape and arms always
 * draw the same galaxy. Also the page-kind icon for galaxy pages.
 */
import {useEffect,useRef} from 'react';
import {galaxyRandom,type GalaxyShape} from '@/lib/encyclopedia/galaxies';

export type GalaxyArtSpec={seed:string;shape:GalaxyShape;arms:number};

/** Draws a galaxy filling a w × h area of the context (in the context's own units). */
export function drawGalaxy(g:CanvasRenderingContext2D,spec:GalaxyArtSpec,w:number,h:number){
 const r=galaxyRandom(`${spec.seed}|${spec.shape}|${spec.arms}`);
 g.save();
 g.fillStyle='#03050a';g.fillRect(0,0,w,h);
 // Faint foreground stars of our own galaxy.
 for(let i=0;i<w*h/700;i++){g.fillStyle=`rgba(255,255,255,${0.15+r()*0.5})`;g.fillRect(r()*w,r()*h,1,1);}
 const cx=w/2,cy=h/2,R=Math.min(w,h)*0.46,shape=spec.shape,arms=Math.max(1,spec.arms||2);
 const gauss=()=>(r()+r()+r()-1.5)/1.5;
 g.globalCompositeOperation='lighter';
 const n=Math.min(14000,Math.round(w*h/7));
 // Irregular galaxies are a few clumps; their centres come from the seed so the clumps stay put.
 const clumps=Array.from({length:6},(_,k)=>{const c=galaxyRandom(`${spec.seed}|clump${k}`);return {x:cx+(c()-0.5)*R*1.1,y:cy+(c()-0.5)*R*0.8};});
 for(let i=0;i<n;i++){
  let x:number,y:number,col:string,a=0.35+r()*0.4;const s=r()<0.92?1:1.8;
  if(shape==='elliptical'){const rad=Math.abs(gauss())*R*0.9,th=r()*6.283;x=cx+Math.cos(th)*rad;y=cy+Math.sin(th)*rad*0.78;col=rad<R*0.25?'255,226,180':'235,205,170';a*=0.8;}
  else if(shape==='irregular'){const c=clumps[Math.floor(r()*clumps.length)];x=c.x+gauss()*R*0.25;y=c.y+gauss()*R*0.2;col=r()<0.2?'255,140,190':'190,210,255';}
  else if(shape==='ring'&&r()<0.75){const th=r()*6.283,rad=R*(0.72+gauss()*0.06);x=cx+Math.cos(th)*rad;y=cy+Math.sin(th)*rad*0.9;col=r()<0.15?'255,150,200':'180,205,255';}
  else{
   const t=Math.pow(r(),0.75);
   if(shape==='barred'&&r()<0.18){const along=gauss()*R*0.33,ang=0.5;x=cx+Math.cos(ang)*along+gauss()*R*0.04;y=cy+Math.sin(ang)*along+gauss()*R*0.04;col='255,220,170';}
   else if(t<0.14||shape==='ring'){const rad=Math.abs(gauss())*R*0.16,th=r()*6.283;x=cx+Math.cos(th)*rad;y=cy+Math.sin(th)*rad;col='255,225,180';}
   else{const k=Math.floor(r()*arms),wind=shape==='barred'?3.6:4.4;const th=k*6.283/arms+t*wind+gauss()*0.22*(1-t*0.4)+(shape==='barred'?0.5:0),rad=t*R;
    x=cx+Math.cos(th)*rad+gauss()*R*0.03;y=cy+Math.sin(th)*rad*0.92+gauss()*R*0.03;col=r()<0.06?'255,130,180':t<0.35?'240,225,200':'175,200,255';}
  }
  g.fillStyle=`rgba(${col},${a})`;g.fillRect(x,y,s,s);
 }
 const core=g.createRadialGradient(cx,cy,0,cx,cy,R*(shape==='elliptical'?0.7:0.3));
 core.addColorStop(0,'rgba(255,236,200,.85)');core.addColorStop(1,'rgba(255,236,200,0)');
 g.fillStyle=core;g.fillRect(0,0,w,h);
 g.restore();
}

/** A galaxy drawn to fill its box. Redraws when the box changes size. */
export function GalaxyArt({spec,className,label}:{spec:GalaxyArtSpec;className?:string;label:string}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const {seed,shape,arms}=spec;
 useEffect(()=>{
  const c=canvas.current;if(!c)return;
  const paint=()=>{const box=c.getBoundingClientRect();if(box.width<4||box.height<4)return;const dpr=Math.min(2,window.devicePixelRatio||1);
   c.width=Math.round(box.width*dpr);c.height=Math.round(box.height*dpr);const g=c.getContext('2d');if(!g)return;
   g.setTransform(dpr,0,0,dpr,0,0);drawGalaxy(g,{seed,shape,arms},box.width,box.height);};
  paint();
  if(typeof ResizeObserver==='undefined')return;
  let last=`${c.clientWidth}x${c.clientHeight}`;
  const watch=new ResizeObserver(()=>{const now=`${c.clientWidth}x${c.clientHeight}`;if(now!==last){last=now;paint();}});
  watch.observe(c);return ()=>watch.disconnect();
 },[seed,shape,arms]);
 return <canvas ref={canvas} className={className} role="img" aria-label={label}/>;
}

/** The icon for galaxy pages in lists and search: a two-armed spiral. */
export function GalaxyIcon({size=24,className}:{size?:number;className?:string}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
  <circle cx="12" cy="12" r="1.5"/>
  <path d="M12 10.5c2.5-3 7-2.5 8.5 1s-1 8-6 8.5"/>
  <path d="M12 13.5c-2.5 3-7 2.5-8.5-1s1-8 6-8.5"/>
 </svg>;
}
