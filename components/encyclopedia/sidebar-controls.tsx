"use client";
import {useEffect,useState,useRef} from 'react';
const key='ttrpg-sidebar-layout';
export function useSidebarLayout(){
 const [width,setWidth]=useState(270),[collapsed,setCollapsed]=useState(false),[ready,setReady]=useState(false),[narrow,setNarrow]=useState(false),[maxWidth,setMaxWidth]=useState(440);
 useEffect(()=>{
  const query=matchMedia('(max-width:720px)');
  const resize=()=>{setNarrow(query.matches);setMaxWidth(Math.max(220,Math.min(440,Math.floor(innerWidth*.45))));};resize();
  window.addEventListener('resize',resize);
  try{const saved=JSON.parse(localStorage.getItem(key)??'null');if(saved){if(Number.isFinite(saved.width))setWidth(Math.max(220,Math.min(440,saved.width)));if(typeof saved.collapsed==='boolean')setCollapsed(saved.collapsed);}}catch{}
  setReady(true);return()=>window.removeEventListener('resize',resize);
 },[]);
 useEffect(()=>{if(ready)try{localStorage.setItem(key,JSON.stringify({width,collapsed}));}catch{}},[ready,width,collapsed]);
 return {width:Math.min(width,maxWidth),maxWidth,setWidth,collapsed,setCollapsed,narrow};
}
export function SidebarResize({width,maxWidth,onChange}:{width:number;maxWidth:number;onChange:(width:number)=>void}){
 const drag=useRef<{x:number;width:number}|null>(null);
 const clamp=(n:number)=>Math.round(Math.max(220,Math.min(maxWidth,n)));
 return <div className="sidebar-resize" role="separator" tabIndex={0} aria-label="Sidebar width" aria-orientation="vertical" aria-controls="workspace-sidebar" aria-valuemin={220} aria-valuemax={maxWidth} aria-valuenow={width} aria-valuetext={width+' pixels'} title="Drag to resize. Arrow keys adjust width; double-click to reset."
 onDoubleClick={()=>onChange(clamp(270))}
 onKeyDown={e=>{const next=e.key==='ArrowLeft'?width-10:e.key==='ArrowRight'?width+10:e.key==='Home'?220:e.key==='End'?maxWidth:undefined;if(next!==undefined){e.preventDefault();onChange(clamp(next));}}}
 onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.focus();drag.current={x:e.clientX,width};e.currentTarget.setPointerCapture(e.pointerId);}}
 onPointerMove={e=>{if(drag.current)onChange(clamp(drag.current.width+e.clientX-drag.current.x));}}
 onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} />;
}
export function useNavigationSections(){
 const [sections,setSections]=useState({lore:true,notes:true,orgs:true}),[ready,setReady]=useState(false);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('ttrpg-navigation-sections')??'null');if(saved)setSections({lore:typeof saved.lore==='boolean'?saved.lore:true,notes:typeof saved.notes==='boolean'?saved.notes:true,orgs:typeof saved.orgs==='boolean'?saved.orgs:true});}catch{}setReady(true);},[]);
 useEffect(()=>{if(ready)try{localStorage.setItem('ttrpg-navigation-sections',JSON.stringify(sections));}catch{}},[sections,ready]);
 return {sections,toggle:(key:'lore'|'notes'|'orgs')=>setSections(s=>({...s,[key]:!s[key]})),open:(key:'lore'|'notes'|'orgs')=>setSections(s=>({...s,[key]:true}))};
}
