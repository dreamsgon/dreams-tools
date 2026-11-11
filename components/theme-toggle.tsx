"use client";
import {useEffect,useState} from "react";
import {Moon,Sun} from "lucide-react";
export default function ThemeToggle(){
  const [dark,setDark]=useState(false);
  useEffect(()=>{
    let saved:string|null=null;try{saved=localStorage.getItem("maptable-theme");}catch{}
    const value=saved?saved==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme=value?"dark":"light";setDark(value);
  },[]);
  return <button className="theme-toggle icon-button" aria-label={dark?"Switch to light mode":"Switch to dark mode"} title={dark?"Switch to light mode":"Switch to dark mode"} onClick={()=>{
    const value=!dark;setDark(value);document.documentElement.dataset.theme=value?"dark":"light";
    try{localStorage.setItem("maptable-theme",value?"dark":"light");}catch{}
  }}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button>;
}
