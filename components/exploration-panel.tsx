"use client";
import { useState, type DragEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Folder, EyeOff, MapPin, Trash2 } from "lucide-react";
import { collectionPath, uid, type PointOfInterest, type Scene, type Workspace } from "@/lib/model";
import { canMovePoiFolder, movePoiFolder, deletePoiFolder, poiFolderPath } from "@/lib/poi-folders";
import { resolvePointOfInterestTarget, sceneTargets } from "@/lib/exploration";
import { Field, Toggle } from "./dialogs";
type Props = {workspace:Workspace;scene:Scene;update:(fn:(scene:Scene)=>void)=>void;selectedId:string|null;select:(id:string|null)=>void;place:(activation:"double"|"single")=>void;createMap:(type:Scene["mapType"])=>void;openScene:(id:string)=>void};
const mapTypes = ["world", "area", "encounter"] as const;
const mapNames = {world:"World",area:"Area",encounter:"Encounter"};
const pointName = (point:PointOfInterest) => point.name.trim() || "Unnamed marker";
export default function ExplorationPanel({workspace,scene,update,selectedId,select,place,openScene,createMap}:Props) {
  const [closed,setClosed] = useState<Set<string>>(new Set());
  const [editingFolder,setEditingFolder] = useState<string|null>(null);
  const targets = sceneTargets(workspace,scene.id);
  const selected = scene.pointsOfInterest.find(point=>point.id===selectedId);
  const destination = selected ? resolvePointOfInterestTarget(workspace,scene.id,selected) : null;
  const patch = (values:Partial<PointOfInterest>) => { if(selected) update(current=>{const point=current.pointsOfInterest.find(p=>p.id===selected.id);if(point)Object.assign(point,values);}); };
  const drag = (event:DragEvent,type:"point"|"folder",id:string) => {event.stopPropagation();event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("application/x-maptable-poi",JSON.stringify({sceneId:scene.id,type,id}));};
  const drop = (event:DragEvent,folderId:string|null) => {
    event.preventDefault();event.stopPropagation();
    try { const item=JSON.parse(event.dataTransfer.getData("application/x-maptable-poi"));if(item.sceneId!==scene.id)return;
      update(current=>{if(item.type==="folder")movePoiFolder(current.poiFolders,item.id,folderId);else if(item.type==="point"){const point=current.pointsOfInterest.find(p=>p.id===item.id);if(point&&(folderId===null||current.poiFolders.some(f=>f.id===folderId)))point.folderId=folderId;}});
    } catch { /* Ignore unrelated external drags. */ }
  };
  const folderOptions=scene.poiFolders.map(f=><option key={f.id} value={f.id}>{poiFolderPath(scene.poiFolders,f.id)}</option>);
  const rowStyle={display:"flex",alignItems:"center",gap:6,minWidth:0,padding:"4px 0"} as const;
  const tree=(parentId:string|null,seen=new Set<string>()):ReactNode=><>
    {scene.poiFolders.filter(f=>f.parentId===parentId&&!seen.has(f.id)).map(folder=><div key={folder.id} onDragOver={e=>{e.preventDefault();e.stopPropagation();}} onDrop={e=>drop(e,folder.id)}>
      <div style={rowStyle} draggable onDragStart={e=>drag(e,"folder",folder.id)}>
        <button style={{flex:1,minWidth:0,textAlign:"left",overflowWrap:"anywhere"}} aria-expanded={!closed.has(folder.id)} onClick={()=>setClosed(previous=>{const next=new Set(previous);if(next.has(folder.id))next.delete(folder.id);else next.add(folder.id);return next;})}>{closed.has(folder.id)?<ChevronRight size={14}/>:<ChevronDown size={14}/>} <Folder size={15}/> {folder.name}</button>
        <button aria-label={`Edit folder ${folder.name}`} onClick={()=>setEditingFolder(editingFolder===folder.id?null:folder.id)}>Edit</button>
      </div>
      {editingFolder===folder.id&&<div>
        <Field label="Folder name"><input maxLength={120} value={folder.name} onChange={e=>update(current=>{const f=current.poiFolders.find(f=>f.id===folder.id);if(f)f.name=e.target.value;})}/></Field>
        <Field label="Parent folder"><select value={folder.parentId??""} onChange={e=>update(current=>{movePoiFolder(current.poiFolders,folder.id,e.target.value||null);})}><option value="">POI root</option>{scene.poiFolders.filter(f=>canMovePoiFolder(scene.poiFolders,folder.id,f.id)).map(f=><option key={f.id} value={f.id}>{poiFolderPath(scene.poiFolders,f.id)}</option>)}</select></Field>
        <button className="danger" onClick={()=>{update(current=>deletePoiFolder(current,folder.id));setEditingFolder(null);}}>Delete folder; keep contents</button>
      </div>}
      {!closed.has(folder.id)&&<div style={{paddingLeft:12}}>{tree(folder.id,new Set(seen).add(folder.id))}</div>}
    </div>)}
    {scene.pointsOfInterest.filter(p=>(p.folderId??null)===parentId).map(point=><div key={point.id} className="poi-list-row" style={rowStyle} draggable onDragStart={e=>drag(e,"point",point.id)}>
      <span style={{width:12,height:12,flex:"0 0 12px",borderRadius:"50%",background:point.color}} aria-hidden="true"/>
      <span style={{flex:1,minWidth:0,overflowWrap:"anywhere"}}>{point.activation==="single"?"-> ":""}{pointName(point)}</span>{point.hidden&&<EyeOff size={15} style={{width:15,height:15,flexShrink:0}} aria-label="Hidden from players"/>}
      <button style={{flex:"0 0 auto",width:"auto",minHeight:28,padding:"3px 8px"}} className={selectedId===point.id?"active":""} aria-label={`Edit ${pointName(point)}`} aria-pressed={selectedId===point.id} onClick={()=>select(point.id)}>Edit</button>
    </div>)}
  </>;
  return <>
    <h3>Exploration</h3>
    <div className="button-row map-type-actions"><button onClick={()=>createMap("world")}>New World Map</button><button onClick={()=>createMap("area")}>New Area Map</button></div>
    <Field label="Move map to"><select value={scene.mapType} onChange={e=>update(current=>{current.mapType=e.target.value as Scene["mapType"];})}>{mapTypes.map(type=><option key={type} value={type}>{mapNames[type]} Map</option>)}</select></Field>
    <p className="muted">Changing type moves this map between the campaign map groups and sets its default sharing destination. Its image, tokens, labels, fog, and links stay intact.</p>
    <details open><summary>Campaign maps</summary>{mapTypes.map(type=>{const maps=[scene,...targets].filter(map=>map.mapType===type);return <div key={type}><div className="section-heading"><h3>{mapNames[type]} maps</h3><span className="count">{maps.length}</span></div><div className="token-list">{maps.map(map=><button key={map.id} className={map.id===scene.id?"active":""} aria-current={map.id===scene.id?"page":undefined} onClick={()=>{if(map.id!==scene.id)openScene(map.id);}}>{map.name||"Unnamed map"}{map.id===scene.id?" (current)":""}</button>)}</div>{!maps.length&&<p className="empty-small">No {mapNames[type].toLowerCase()} maps.</p>}</div>;})}{!targets.length&&<p className="muted">Linked destinations appear when other maps are in this map's campaign.</p>}</details>
    <div className="section-heading"><h3>Points of interest</h3><span className="count">{scene.pointsOfInterest.length}</span></div>
    <div className="button-row" style={{flexWrap:"wrap"}}><button disabled={scene.poiFolders.length>=200} onClick={()=>update(current=>{current.poiFolders.push({id:uid(),name:"New folder",parentId:null});})}>New folder</button><button disabled={scene.pointsOfInterest.length>=500} onClick={()=>{select(null);place("double");}}><MapPin size={15} style={{width:15,height:15,flexShrink:0}}/> Add POI</button><button disabled={scene.pointsOfInterest.length>=500} onClick={()=>{select(null);place("single");}}>Add transition</button></div>
    <p className="muted">Choose Add, then click the map to place a marker. POIs open linked maps on double-click; transitions open them on a single click. Drag markers and folders to organize them, or use their Edit controls.</p>
    <div className="poi-tree" onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,null)}><div style={{padding:"8px 4px",border:"1px dashed var(--border)",borderRadius:4,margin:"8px 0"}}>POI root - Drop markers or folders here</div>{tree(null)}</div>
    {!scene.pointsOfInterest.length&&<p className="empty-small">No points of interest yet.</p>}
    {selected&&<>
      <div className="section-heading"><h3>Edit marker</h3><button className="text-button" onClick={()=>select(null)}>Deselect</button></div>
      <Field label="Marker name"><input maxLength={120} value={selected.name} onChange={e=>patch({name:e.target.value})}/></Field>
      <Field label="Folder"><select value={selected.folderId??""} onChange={e=>patch({folderId:e.target.value||null})}><option value="">POI root</option>{folderOptions}</select></Field>
      <Field label="Marker color"><input type="color" value={selected.color} onChange={e=>patch({color:e.target.value})}/></Field>
      <Field label="Notes"><textarea value={selected.notes??""} maxLength={2000} rows={3} onChange={e=>patch({notes:e.target.value})}/></Field>
      <Field label="Linked map"><select value={destination?.id??""} onChange={e=>patch({targetSceneId:e.target.value||null})}><option value="">None</option>{targets.map(map=><option key={map.id} value={map.id}>{collectionPath(workspace.collections,map.containerId)} / {map.name||"Unnamed map"} ({mapNames[map.mapType]})</option>)}</select></Field>
      {selected.targetSceneId&&!destination&&<p className="muted">The linked map is unavailable or outside this campaign. Choose another destination.</p>}
      <Field label="Open linked map on"><select value={selected.activation} onChange={e=>patch({activation:e.target.value as PointOfInterest["activation"]})}><option value="double">Double-click (POI)</option><option value="single">Single click (transition)</option></select></Field>
      <Toggle label="Hidden from players" checked={selected.hidden} onChange={hidden=>patch({hidden})}/>
      <button disabled={!destination} onClick={()=>{const target=resolvePointOfInterestTarget(workspace,scene.id,selected);if(target)openScene(target.id);}}>Open linked map</button>
      <button className="danger" onClick={()=>{update(current=>{current.pointsOfInterest=current.pointsOfInterest.filter(p=>p.id!==selected.id);});select(null);}}><Trash2 size={15} style={{width:15,height:15,flexShrink:0}}/> Delete marker</button>
    </>}
  </>;
}
