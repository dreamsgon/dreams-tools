"use client";
import { useState } from "react";
import type { Scene } from "@/lib/model";
import { fogMergeReason, fogUnionReason, fogRegionParts, mergeFogRegions, unionFogRegions, flattenFogRegions, splitFogRegion } from "@/lib/fog";

export default function FogRegions({scene,update,onSelect,selected,onSelectionChange}: {
  scene:Scene; update:(fn:(scene:Scene)=>void)=>void; onSelect?:(index:number)=>void;
  selected:number[]; onSelectionChange:(indices:number[])=>void;
}) {
  const [error,setError]=useState("");
  const regions=scene.fog.strokes.map((stroke,index)=>({stroke,index}));
  const groupReason=fogMergeReason(scene.fog.strokes,selected);
  const unionReason=fogUnionReason(scene.fog.strokes,selected);
  const choose=(indices:number[])=>{setError("");onSelectionChange(indices);};
  const merge=(group:boolean)=>{
    const result=(group?mergeFogRegions:unionFogRegions)(scene.fog.strokes,selected);
    if("reason" in result){setError(result.reason);return;}
    update(s=>{s.fog.strokes=result.strokes;});
    choose([result.index]);onSelect?.(result.index);
  };
  if(!regions.length)return null;
  return <section className="fog-regions"><h3>Fog regions</h3>
    <p className="muted">Select regions below or Shift-click them on the map. Merge removes overlapping boundaries; Group keeps the original shapes.</p>
    <div className="fog-selection-actions">
      <button onClick={()=>choose(regions.map(r=>r.index))}>Select all</button>
      <button onClick={()=>choose(regions.filter(r=>r.stroke.mode==="reveal").map(r=>r.index))}>Reveals</button>
      <button onClick={()=>choose(regions.filter(r=>r.stroke.mode==="cover").map(r=>r.index))}>Covers</button>
      <button disabled={!selected.length} onClick={()=>choose([])}>Clear</button>
    </div>
    <p className="muted" role="status">{selected.length} of {regions.length} selected</p>
    <div className="fog-region-list">
      {regions.map(({stroke,index})=><div key={index} className="fog-region-row">
        <label><input type="checkbox" checked={selected.includes(index)} onChange={e=>choose(e.target.checked?[...selected,index]:selected.filter(i=>i!==index))}/>
          <span>{index+1}. {stroke.mode==="reveal"?"Reveal":"Cover"} · {stroke.fillRule==="evenodd"?"Unified region":stroke.shape==="merged"?`${fogRegionParts(stroke).length} grouped parts`:stroke.shape==="rect"?"Rectangle":stroke.shape==="brush"?"Brush":"Polygon"}</span>
        </label>
        {onSelect&&<button onClick={()=>onSelect(index)} aria-label={`Edit fog region ${index+1}`}>Edit</button>}
        {stroke.shape==="merged"&&stroke.fillRule!=="evenodd"&&<button disabled={scene.fog.strokes.length-1+(stroke.parts?.length??0)>2000} title="Restore individual shapes" onClick={()=>{update(s=>{const split=splitFogRegion(s.fog.strokes,index);if(split)s.fog.strokes=split;});choose([index]);onSelect?.(index);}}>Ungroup</button>}
      </div>)}
    </div>
    <div className="fog-merge-actions">
      <button className="primary" disabled={!!unionReason} title={unionReason??"Combine the selected shapes into one region"} onClick={()=>merge(false)}>Merge into one region</button>
      <button disabled={!!groupReason} title={groupReason??"Keep shapes together without removing edges"} onClick={()=>merge(true)}>Group regions</button>
    </div>
    {unionReason&&<p className="muted">{unionReason}</p>}
    <button className="fog-flatten" onClick={()=>{
      if(!confirm("Flatten all fog regions on this map into one region? This preserves the current visibility and replaces every brush stroke and shape, including unselected ones. Undo restores them."))return;
      const result=flattenFogRegions(scene.fog,scene.width,scene.height);
      if("reason" in result){setError(result.reason);return;}
      update(s=>{s.fog=result.fog;});choose(result.fog.strokes.length?[0]:[]);if(result.fog.strokes.length)onSelect?.(0);
    }}>Flatten all fog</button>
    <p className="muted">For mixed Reveal and Cover strokes, flatten the whole map to preserve the current visibility. Undo restores the original regions. Round brush edges become fine polygon outlines.</p>
    {error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
