"use client";
import {useState} from "react";
import {collectionPath,type Condition,type Workspace} from "@/lib/model";
import ConditionSymbol from "./condition-symbol";
export default function ConditionEntry({condition:c,workspace:w,commit}:{condition:Condition;workspace:Workspace;commit:(fn:(w:Workspace)=>void)=>void}){
  const [editing,setEditing]=useState(false);
  const patch=(values:Partial<Condition>)=>commit(next=>{const item=next.conditions.find(item=>item.id===c.id);if(item)Object.assign(item,values);});
  return <div className="condition-entry">
    <div className="condition-row condition-compact-row">
      <span style={{background:c.color}}>{c.assetId?<img className="condition-icon-image" src={w.assets.find(a=>a.id===c.assetId)?.src} alt=""/>:c.icon}</span>
      <strong>{c.name}</strong>
      <button aria-label={`${editing?"Done editing":"Edit"} ${c.name}`} aria-expanded={editing} onClick={()=>setEditing(!editing)}>{editing?"Done":"Edit"}</button>
    </div>
    {editing&&<div className="condition-entry-editor">
      <label>Name<input key={c.id} defaultValue={c.name} maxLength={40} onBlur={e=>{const name=e.target.value.trim();if(name&&name!==c.name)patch({name});else e.target.value=c.name;}}/></label>
      <label>Color<input type="color" value={c.color} onChange={e=>patch({color:e.target.value})}/></label>
      <label>Folder<select aria-label={`Folder for ${c.name}`} value={w.conditionLocations[c.id]??""} onChange={e=>commit(next=>{next.conditionLocations[c.id]=e.target.value||null;})}><option value="">Conditions root</option>{w.conditionFolders.map(f=><option key={f.id} value={f.id}>{collectionPath(w.conditionFolders,f.id)}</option>)}</select></label>
      <ConditionSymbol workspace={w} commit={commit} assetId={c.assetId??null} onAssetChange={assetId=>patch({assetId})} label={`Custom symbol for ${c.name}`} value={c.icon} onChange={icon=>patch({icon})}/>
      <button className="danger" aria-label={`Delete ${c.name}`} onClick={()=>commit(next=>{
        delete next.conditionLocations[c.id];next.conditions=next.conditions.filter(item=>item.id!==c.id);
        for(const scene of next.scenes)for(const token of scene.tokens)token.conditions=token.conditions.filter(id=>id!==c.id);
        for(const token of next.tokenLibrary)token.conditions=token.conditions.filter(id=>id!==c.id);
      })}>Delete condition</button>
    </div>}
  </div>;
}
