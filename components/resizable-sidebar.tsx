"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./resizable-sidebar.css";
export default function ResizableSidebar({children,storageKey,defaultWidth=285,className="",edge="right"}:{children:ReactNode;storageKey:string;defaultWidth?:number;className?:string;edge?:"left"|"right"}) {
 const [width,setWidth]=useState(defaultWidth),[ready,setReady]=useState(false),[dragging,setDragging]=useState(false);
 const start=useRef<{x:number;width:number}|null>(null);
 const maximum=()=>Math.max(220,Math.min(560,window.innerWidth * 0.35));
 const clamp=(n:number)=>Math.max(220,Math.min(maximum(),n));
 useEffect(()=>{let value=defaultWidth;try{const saved=Number(localStorage.getItem(storageKey));if(Number.isFinite(saved)&&saved>=220)value=saved;}catch{}setWidth(clamp(value));setReady(true);},[storageKey,defaultWidth]);
 useEffect(()=>{if(ready)try{localStorage.setItem(storageKey,String(width));}catch{}},[width,storageKey,ready]);
 useEffect(()=>{const resize=()=>setWidth(old=>clamp(old));window.addEventListener("resize",resize);return()=>window.removeEventListener("resize",resize);},[]);
 const finish=()=>{start.current=null;setDragging(false);};
 return <aside className={`${className} resizable-sidebar`} style={{"--sidebar-width":`${width}px`} as CSSProperties} data-resizing={dragging||undefined}>
 {children}
 <div className={`sidebar-resizer sidebar-resizer-${edge}`} role="separator" tabIndex={0} aria-label="Resize sidebar" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={560} aria-valuenow={Math.round(width)} aria-valuetext={`${Math.round(width)} pixels`} title="Drag to resize. Arrow keys adjust width; double-click to reset."
 onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);start.current={x:e.clientX,width};setDragging(true);}}
 onPointerMove={e=>{if(start.current)setWidth(clamp(start.current.width+(e.clientX-start.current.x)*(edge==="right"?1:-1)));}}
 onPointerUp={e=>{finish();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={finish} onLostPointerCapture={finish}
 onDoubleClick={()=>setWidth(clamp(defaultWidth))}
 onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();setWidth(old=>clamp(old+(e.key==="ArrowRight"?1:-1)*(edge==="right"?1:-1)*(e.shiftKey?40:10)));}else if(e.key==="Home"){e.preventDefault();setWidth(220);}else if(e.key==="End"){e.preventDefault();setWidth(maximum());}else if(e.key==="Enter"){e.preventDefault();setWidth(clamp(defaultWidth));}}}/>
 </aside>;
}
