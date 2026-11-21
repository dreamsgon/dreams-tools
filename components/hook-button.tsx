"use client";
/*
 * "Roll a hook": adds a short story starter (from lib/hooks) to the end of a notes box. Each press rolls a new one.
 * When the notes are too full to take it, it says so instead. `shared` is a short line saying who else can read
 * the notes, shown so a GM doesn't put a secret where players will see it.
 */
import {useState} from "react";
import {Dices} from "lucide-react";
import {withHook} from "@/lib/hooks";

export function HookButton({roll,notes,max,onAdd,shared,className}:{roll:(seed:string)=>string;notes:string;max:number;onAdd:(next:string)=>void;shared?:string|false|null;className?:string}){
  const [full,setFull]=useState(false);
  return <span style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:"4px 10px"}}>
    <button type="button" className={className} title="Adds a short story starter to the notes. Press again for another." onClick={()=>{const next=withHook(notes,roll(`${Date.now()}:${Math.random()}`),max);setFull(!next);if(next)onAdd(next);}}><Dices size={14}/> Roll a hook</button>
    {full?<small role="status" style={{color:"var(--muted)"}}>The notes are too full for a hook. Shorten them first.</small>:shared?<small style={{color:"var(--muted)"}}>{shared}</small>:null}
  </span>;
}
