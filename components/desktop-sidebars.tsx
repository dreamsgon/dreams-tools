"use client";
import {useEffect,useState} from "react";
export function useDesktopSidebars(key:string){
 const [hidden,setHidden]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{try{setHidden(localStorage.getItem(key)==="hidden");}catch{}setReady(true);},[key]);
 useEffect(()=>{if(ready)try{localStorage.setItem(key,hidden?"hidden":"shown");}catch{}},[hidden,key,ready]);
 return {hidden,toggle:()=>setHidden(value=>!value)};
}
export default function DesktopSidebars({hidden,toggle}:{hidden:boolean;toggle:()=>void}){
 return <button className="desktop-sidebar-toggle" aria-expanded={!hidden} onClick={toggle}>{hidden?"Show sidebars":"Hide sidebars"}</button>;
}
