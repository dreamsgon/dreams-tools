"use client";
/*
 * Moving around and zooming an SVG drawing: drag the background to move, scroll or use the buttons to zoom, and fit it
 * again. The relationship web and family trees use it. When what is drawn changes (new bounds), the view is fitted again.
 */
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Maximize2,Minus,Plus} from 'lucide-react';

export type Bounds={x:number;y:number;w:number;h:number};
type View={x:number;y:number;k:number};
const FIT:View={x:0,y:0,k:1};

/**
 * `bounds` must keep its identity while the drawing stays the same (make it with useMemo). Drags that start on `skip`
 * are left to it. With `minScale`, a drawing too big to read when fitted starts zoomed in that far (in screen pixels per
 * unit), around `focus`.
 */
export function usePanZoom(bounds:Bounds,skip:string,opts:{minScale?:number;focus?:{x:number;y:number}}={}){
 const svg=useRef<SVGSVGElement>(null),drag=useRef<{x:number;y:number;view:View}|null>(null);
 const [moved,setMoved]=useState<{view:View;for:unknown}>({view:FIT,for:null}),[box,setBox]=useState<{w:number;h:number}|null>(null);
 useEffect(()=>{const el=svg.current;if(!el||typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(([e])=>setBox(b=>b&&b.w===e.contentRect.width&&b.h===e.contentRect.height?b:{w:e.contentRect.width,h:e.contentRect.height}));ro.observe(el);return()=>ro.disconnect();},[]);
 const start=():View=>{
  if(!opts.minScale||!box||!box.w||!box.h)return FIT;
  const k=Math.min(6,Math.max(1,opts.minScale/Math.min(box.w/bounds.w,box.h/bounds.h)));
  if(k===1)return FIT;
  const vw=bounds.w/k,mid=bounds.x+bounds.w/2,fx=opts.focus?.x??mid;
  return {x:Math.min(Math.max(fx,bounds.x+vw/2),bounds.x+bounds.w-vw/2)-mid,y:0,k};
 };
 // Moving and zooming belong to one drawing: when what is drawn changes, it starts again.
 const view=moved.for===bounds?moved.view:start();
 const setView=(next:View|((v:View)=>View))=>setMoved(m=>{const cur=m.for===bounds?m.view:start();return {view:typeof next==='function'?next(cur):next,for:bounds};});
 const unit=()=>{const el=svg.current;return el&&el.clientWidth?bounds.w/view.k/el.clientWidth:1;};
 const zoom=(f:number)=>setView(v=>({...v,k:Math.min(6,Math.max(0.3,v.k*f))}));
 // The wheel listener is added once (it must not be passive), so it calls the latest zoom through a ref.
 const zoomRef=useRef(zoom);
 useEffect(()=>{zoomRef.current=zoom;});
 useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();zoomRef.current(e.deltaY<0?1.15:1/1.15);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 const down=(e:ReactPointerEvent)=>{if((e.target as Element).closest(skip))return;drag.current={x:e.clientX,y:e.clientY,view};(e.currentTarget as Element).setPointerCapture(e.pointerId);};
 const move=(e:ReactPointerEvent)=>{const d=drag.current;if(!d)return;const u=unit();setView({...d.view,x:d.view.x-(e.clientX-d.x)*u,y:d.view.y-(e.clientY-d.y)*u});};
 const up=()=>{drag.current=null;};
 const w=bounds.w/view.k,h=bounds.h/view.k,cx=bounds.x+bounds.w/2+view.x,cy=bounds.y+bounds.h/2+view.y;
 return {svg,viewBox:`${cx-w/2} ${cy-h/2} ${w} ${h}`,k:view.k,handlers:{onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:up},zoom,fit:()=>setView(FIT)};
}

export function ZoomButtons({zoom,fit}:{zoom:(f:number)=>void;fit:()=>void}){
 return <div className="rw-zoom">
  <button type="button" className="icon-button" aria-label="Zoom in" onClick={()=>zoom(1.3)}><Plus size={15}/></button>
  <button type="button" className="icon-button" aria-label="Zoom out" onClick={()=>zoom(1/1.3)}><Minus size={15}/></button>
  <button type="button" className="icon-button" aria-label="Fit to the screen" onClick={fit}><Maximize2 size={15}/></button>
 </div>;
}
