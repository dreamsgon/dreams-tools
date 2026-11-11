"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./dialogs";

export default function TokenOptions({children, request=0, onRequestHandled}: {children:ReactNode; request?:number; onRequestHandled?:()=>void}) {
  const [open,setOpen]=useState(false);
  useEffect(()=>{if(request>0){setOpen(true);onRequestHandled?.();}},[request,onRequestHandled]);
  useEffect(()=>{const close=()=>setOpen(false);window.addEventListener("maptable-tray-roll",close);return()=>window.removeEventListener("maptable-tray-roll",close);},[]);
  return <><button className="token-edit-button" onClick={()=>setOpen(true)}>Edit selected token</button>{open && createPortal(<Modal title="Edit token" close={()=>setOpen(false)}><div className="token-options-popout">{children}</div></Modal>,document.body)}</>;
}
