"use client";
/*
 * A sector's hex map: a space backdrop, pointy-topped hexes in offset rows with their numbers, lanes as dashed lines,
 * charted systems as glowing stars and rumours as dashed rings. Tapping a hex calls onHex. One hex is 5 light years.
 * The star and backdrop drawing is shared with the sector dialog's preview.
 */
import {useEffect,useRef} from 'react';
import {galaxyRandom} from '@/lib/encyclopedia/galaxies';
import {hexLabel,starInfo,type Backdrop,type Hex,type Sector,type StarClass} from '@/lib/encyclopedia/sectors';

const S3=Math.sqrt(3);
/** Hex size and centres that fit a cols × rows map in a w × h box, leaving room for labels. */
export function hexGeometry(cols:number,rows:number,w:number,h:number){
 const s=Math.min(w/(S3*(cols+0.5)),(h-24)/(1.5*(rows-1)+2))*0.96;
 const W=S3*s*(cols+0.5),H=1.5*s*(rows-1)+2*s,ox=(w-W)/2+S3*s/2,oy=(h-H)/2+s+4;
 const center=(c:number,r:number):[number,number]=>[ox+S3*s*(c+((r&1)?0.5:0)),oy+1.5*s*r];
 /** The hex under a point, or null outside the map. */
 const at=(x:number,y:number):Hex|null=>{let best:Hex|null=null,bd=Infinity;
  const r0=Math.round((y-oy)/(1.5*s));for(let r=r0-1;r<=r0+1;r++){if(r<0||r>=rows)continue;const c0=Math.round((x-ox)/(S3*s)-((r&1)?0.5:0));for(let c=c0-1;c<=c0+1;c++){if(c<0||c>=cols)continue;const [cx,cy]=center(c,r),d=Math.hypot(x-cx,y-cy);if(d<bd){bd=d;best={c,r};}}}
  return bd<=s?best:null;};
 return {s,center,at};
}

const BACKDROP:Record<Backdrop,string[]>={nebula:['60,70,200','110,60,190','30,100,180'],dust:['170,60,40','120,40,60','200,110,60'],deep:['30,40,70','20,30,50'],core:['220,170,110','160,110,180','240,210,160']};
/** A starfield with soft clouds of colour. */
export function drawBackdrop(g:CanvasRenderingContext2D,kind:Backdrop,seed:string,w:number,h:number){
 const r=galaxyRandom(`sky|${kind}|${seed}`);
 g.fillStyle='#04060c';g.fillRect(0,0,w,h);
 const cols=BACKDROP[kind],blobs=kind==='deep'?4:12;
 for(let i=0;i<blobs;i++){const x=r()*w,y=r()*h,rad=(0.2+r()*0.45)*Math.max(w,h),col=cols[Math.floor(r()*cols.length)];const gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,`rgba(${col},${kind==='deep'?0.18:0.22})`);gr.addColorStop(1,`rgba(${col},0)`);g.fillStyle=gr;g.fillRect(0,0,w,h);}
 if(kind==='core'){const gr=g.createRadialGradient(w*0.8,h*0.15,0,w*0.8,h*0.15,w*0.5);gr.addColorStop(0,'rgba(255,230,190,.35)');gr.addColorStop(1,'rgba(255,230,190,0)');g.fillStyle=gr;g.fillRect(0,0,w,h);}
 const n=Math.round(w*h/900);for(let i=0;i<n;i++){const big=r()>0.92;g.fillStyle=`rgba(255,255,255,${0.25+r()*0.7})`;g.fillRect(r()*w,r()*h,big?1.6:1,big?1.6:1);}
}
/** A star as a glowing disc of radius rad, centred on x, y. */
export function drawStar(g:CanvasRenderingContext2D,star:StarClass,x:number,y:number,rad:number){
 const c=starInfo[star],gr=g.createRadialGradient(x,y,0,x,y,rad*2.2);
 gr.addColorStop(0,c.core);gr.addColorStop(0.3,c.core);gr.addColorStop(0.4,c.glow);gr.addColorStop(0.62,c.rim+'88');gr.addColorStop(1,c.rim+'00');
 g.fillStyle=gr;g.beginPath();g.arc(x,y,rad*2.2,0,Math.PI*2);g.fill();
}

type Props={sector:Sector;selected?:Hex|null;from?:string|null;lanes?:boolean;onHex?:(h:Hex)=>void;className?:string;label:string};
export function SectorMap({sector,selected,from,lanes=true,onHex,className,label}:Props){
 const canvas=useRef<HTMLCanvasElement>(null),geo=useRef<ReturnType<typeof hexGeometry>|null>(null);
 useEffect(()=>{
  const c=canvas.current;if(!c)return;
  const paint=()=>{const box=c.getBoundingClientRect();if(box.width<4||box.height<4)return;const dpr=Math.min(2,window.devicePixelRatio||1),w=box.width,h=box.height;
   c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);const g=c.getContext('2d');if(!g)return;g.setTransform(dpr,0,0,dpr,0,0);
   drawBackdrop(g,sector.backdrop,sector.seed,w,h);
   const G=hexGeometry(sector.cols,sector.rows,w,h);geo.current=G;
   const hexPath=(x:number,y:number,r:number)=>{g.beginPath();for(let k=0;k<6;k++){const a=Math.PI/180*(60*k-30);if(k)g.lineTo(x+r*Math.cos(a),y+r*Math.sin(a));else g.moveTo(x+r*Math.cos(a),y+r*Math.sin(a));}g.closePath();};
   for(let r=0;r<sector.rows;r++)for(let cc=0;cc<sector.cols;cc++){const [x,y]=G.center(cc,r);hexPath(x,y,G.s*0.98);
    const on=selected&&selected.c===cc&&selected.r===r;
    if(on){g.fillStyle='rgba(143,227,214,.18)';g.fill();g.strokeStyle='#8fe3d6';g.lineWidth=2;}else{g.strokeStyle='rgba(200,220,240,.16)';g.lineWidth=1;}g.stroke();
    if(G.s>17){g.fillStyle='rgba(200,220,240,.32)';g.font=`500 ${Math.max(7,Math.min(9,G.s*0.28))}px ui-monospace,monospace`;g.textAlign='center';g.fillText(hexLabel({c:cc,r}),x,y-G.s*0.6);}}
   const byId=new Map(sector.systems.map(s=>[s.id,s]));
   if(lanes)for(const l of sector.lanes){const A=byId.get(l.a),B=byId.get(l.b);if(!A||!B)continue;const p=G.center(A.c,A.r),q=G.center(B.c,B.r);g.beginPath();g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1]);g.strokeStyle='rgba(143,227,214,.55)';g.lineWidth=1.5;g.setLineDash([5,4]);g.stroke();g.setLineDash([]);}
   // A label goes under its star, or over it when the star just left of it already has one under: neighbours' names would touch.
   const below=new Set<string>(),order=sector.systems.slice().sort((a,b)=>a.r-b.r||a.c-b.c);
   for(const sy of order){const [x,y]=G.center(sy.c,sy.r),rr=G.s*0.3,under=!below.has(`${sy.c-1},${sy.r}`);if(under)below.add(`${sy.c},${sy.r}`);
    if(from===sy.id){g.beginPath();g.arc(x,y,G.s*0.62,0,Math.PI*2);g.strokeStyle='#8fe3d6';g.lineWidth=2;g.setLineDash([4,3]);g.stroke();g.setLineDash([]);}
    if(sy.status==='rumour'){g.beginPath();g.arc(x,y,rr*0.85,0,Math.PI*2);g.setLineDash([3,3]);g.strokeStyle='rgba(220,230,240,.7)';g.lineWidth=1.2;g.stroke();g.setLineDash([]);}
    else drawStar(g,sy.star,x,y,rr*0.7);
    g.font=`${sy.status==='rumour'?'italic 500':'600'} ${Math.max(9,Math.min(11.5,G.s*0.34))}px system-ui,sans-serif`;g.textAlign='center';g.fillStyle=sy.status==='rumour'?'rgba(220,230,240,.75)':'#eef3f8';g.shadowColor='#000';g.shadowBlur=4;g.fillText(sy.name,x,under?y+G.s*0.72:y-G.s*0.5);g.shadowBlur=0;}
  };
  paint();
  if(typeof ResizeObserver==='undefined')return;
  let last=`${c.clientWidth}x${c.clientHeight}`;
  const watch=new ResizeObserver(()=>{const now=`${c.clientWidth}x${c.clientHeight}`;if(now!==last){last=now;paint();}});
  watch.observe(c);return ()=>watch.disconnect();
 },[sector,selected,from,lanes]);
 const click=(e:React.MouseEvent<HTMLCanvasElement>)=>{if(!onHex||!geo.current)return;const box=e.currentTarget.getBoundingClientRect();const h=geo.current.at(e.clientX-box.left,e.clientY-box.top);if(h)onHex(h);};
 return <canvas ref={canvas} className={className} role="img" aria-label={label} onClick={click} style={onHex?{cursor:'pointer'}:undefined}/>;
}
