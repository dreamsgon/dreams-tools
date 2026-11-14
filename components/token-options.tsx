"use client";
import { useEffect, useState, type ReactNode } from "react";

/** The sidebar card for the selected token, with an Edit button that opens the Edit token dialog (`render` draws it). */
export default function TokenOptions({render, request=0, onRequestHandled, summary, onDeselect}: {render:(close:()=>void)=>ReactNode; request?:number; onRequestHandled?:()=>void; summary?:ReactNode; onDeselect?:()=>void}) {
  const [open,setOpen]=useState(false);
  useEffect(()=>{if(request>0){setOpen(true);onRequestHandled?.();}},[request,onRequestHandled]);
  useEffect(()=>{const close=()=>setOpen(false);window.addEventListener("maptable-tray-roll",close);return()=>window.removeEventListener("maptable-tray-roll",close);},[]);
  return <>{summary ? <div className="token-selected"><div className="token-selected-info">{summary}</div><button className="token-selected-edit" onClick={()=>setOpen(true)}>Edit</button>{onDeselect&&<button className="token-selected-edit" aria-label="Deselect token" onClick={onDeselect}>Deselect</button>}</div> : <button className="token-edit-button" onClick={()=>setOpen(true)}>Edit selected token</button>}{open && render(()=>setOpen(false))}</>;
}
