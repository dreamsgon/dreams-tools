"use client";
import { useState } from "react";
import { pathDistance, uid, type Point, type Scene } from "@/lib/model";
import { Toggle } from "./dialogs";
import TokenColor from "./token-color";

export default function SavedMeasurements({scene,points,update,start,selected,select}: {scene:Scene;points:Point[];update:(fn:(scene:Scene)=>void)=>void;start:()=>void;selected:string|null;select:(id:string|null)=>void}) {
  const [name,setName]=useState("");
  const distance=(p:Point[])=>`${Number(pathDistance(p,scene.grid).toFixed(2))} ${scene.grid.unit}`;
  return <section className="saved-measurements"><h3>Measurements</h3>
    <button onClick={start}>Draw a measurement</button>
    <p className="muted">Drag to measure. Press Q during the drag to add waypoints, then save the path to keep it on this scene.</p>
    <label>Measurement label<input maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Route, range, distance…"/></label>
    <button disabled={points.length<2||scene.measurements.length>=100} onClick={()=>{
      update(s=>s.measurements.push({id:uid(),label:name.trim()||"Measurement",points:structuredClone(points),color:"#e9ad38",hidden:true}));setName("");
    }}>Save measurement{points.length>1?` · ${distance(points)}`:""}</button>
    <small>Saved measurements start visible only to the GM.</small>
    {scene.measurements.map(m=><details key={m.id} open={m.id===selected||undefined}><summary>{m.label||"Measurement"} · {distance(m.points)}{m.hidden?" · GM only":""}</summary><div className="organizer-editor">
      <button onClick={()=>select(m.id)}>{m.id===selected?"Selected on map":"Select on map"}</button>
      <label>Label<input maxLength={120} value={m.label} onChange={e=>update(s=>{s.measurements.find(x=>x.id===m.id)!.label=e.target.value;})}/></label>
      <TokenColor label="Measurement color" value={m.color} onChange={color=>update(s=>{s.measurements.find(x=>x.id===m.id)!.color=color;})}/>
      <Toggle label="Show to players and in exports" checked={!m.hidden} onChange={visible=>update(s=>{s.measurements.find(x=>x.id===m.id)!.hidden=!visible;})}/>
      <button onClick={()=>update(s=>{s.measurements=s.measurements.filter(x=>x.id!==m.id);})}>Remove measurement</button>
    </div></details>)}
  </section>;
}
