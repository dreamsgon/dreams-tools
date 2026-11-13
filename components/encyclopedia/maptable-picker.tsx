"use client";
import {useEffect,useState} from "react";
import {Map as MapIcon,Search} from "lucide-react";
import {ToolDialog} from "./tool-dialog";

export type MaptableScene={id:string;name:string;mapType:string;path:string};

/** Lists the signed-in user's own Maptable scenes (read-only) and returns the one picked. */
export function MaptablePicker({onPick,onClose}:{onPick:(scene:MaptableScene)=>void;onClose:()=>void}){
 const [scenes,setScenes]=useState<MaptableScene[]|null>(null),[error,setError]=useState(""),[query,setQuery]=useState("");
 useEffect(()=>{const controller=new AbortController();
  fetch("/api/encyclopedia/maptable-scenes",{signal:controller.signal}).then(async r=>{const v=await r.json() as {scenes?:MaptableScene[];error?:string};if(!r.ok)throw new Error(v.error==="Unauthorized"?"Sign in to see your Maptable scenes.":v.error??"Could not load your Maptable scenes.");setScenes(v.scenes??[]);})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load your Maptable scenes.");});
  return()=>controller.abort();},[]);
 const q=query.trim().toLowerCase(),shown=(scenes??[]).filter(s=>!q||(s.name+" "+s.path).toLowerCase().includes(q));
 return <ToolDialog title="Link a Maptable battle map" onClose={onClose}>
  <p className="modal-intro">Adds an Open in Maptable button to this page. Players only see the map’s name, never the link.</p>
  <label className="search-box picker-search"><Search size={15}/><input autoFocus aria-label="Find a scene" placeholder="Find a scene…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="scene-pick-list">
   {error?<p className="info-note" role="alert">{error}</p>:!scenes?<p className="muted">Loading your scenes…</p>:!shown.length?<p className="muted">{scenes.length?"No scenes match.":"You have no Maptable scenes yet."}</p>:
    shown.map(s=><button key={s.id} className="scene-pick" onClick={()=>onPick(s)}><MapIcon size={16}/><span><strong>{s.name}</strong><small>{[s.path,s.mapType==="encounter"?"Battle map":s.mapType==="world"?"World map":"Area map"].filter(Boolean).join(" · ")}</small></span></button>)}
  </div>
 </ToolDialog>;
}
