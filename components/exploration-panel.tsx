"use client";
import { useState, type DragEvent, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, CornerDownRight, EyeOff, Folder, FolderPlus, Globe2, Map as MapIcon, MapPin, Mountain, Pencil, Search, Swords, Trash2 } from "lucide-react";
import { collectionPath, uid, type PointOfInterest, type Scene, type Workspace } from "@/lib/model";
import { canMovePoiFolder, movePoiFolder, deletePoiFolder, poiFolderPath } from "@/lib/poi-folders";
import { resolvePointOfInterestTarget, sceneTargets } from "@/lib/exploration";
import { Field, Toggle } from "./dialogs";
import { addNotePage, notePages, removeNotePage, MAX_NOTE_PAGES, type NotePage } from "@/lib/map-notes";
import type { Workspace as EncyclopediaWorkspace } from "@/lib/encyclopedia/world-model";
import { PageSearch } from "./map-note-card";
import PanelTip from "./panel-tip";
import "./exploration-panel.css";

type Props = {workspace:Workspace;scene:Scene;pages:NotePage[];book:EncyclopediaWorkspace|null;bookError:string;update:(fn:(scene:Scene)=>void)=>void;selectedId:string|null;select:(id:string|null)=>void;place:(activation:"double"|"single")=>void;createMap:(type:Scene["mapType"])=>void;openScene:(id:string)=>void};
const mapTypes = ["world", "area", "encounter"] as const;
const mapNames = {world:"World",area:"Area",encounter:"Encounter"};
const mapIcons = {world:Globe2,area:Mountain,encounter:Swords};
const MARKER_COLOURS = ["#d4a44c", "#c0563f", "#3f7fbf", "#4f8a4a", "#8a5cc0", "#2c2c2c"];
const pointName = (point:PointOfInterest) => point.name.trim() || "Unnamed marker";
const DRAG_TYPE = "application/x-maptable-poi";

/**
 * Exploration: link maps together with markers. A world map's markers open area
 * maps, an area map's open encounters, and every map lists the maps that lead to it.
 */
export default function ExplorationPanel({workspace,scene,pages,book,bookError,update,selectedId,select,place,openScene,createMap}:Props) {
  const [closed,setClosed] = useState<Set<string>>(new Set());
  const [editingFolder,setEditingFolder] = useState<string|null>(null);
  const [dragging,setDragging] = useState(false);
  const [query,setQuery] = useState("");
  const [adding,setAdding] = useState(false);
  const [pageHint,setPageHint] = useState("");
  const targets = sceneTargets(workspace,scene.id);
  const selected = scene.pointsOfInterest.find(point=>point.id===selectedId);
  const linkedName = (point:PointOfInterest) => resolvePointOfInterestTarget(workspace,scene.id,point)?.name || null;
  // Markers on other maps in this campaign that open this one.
  const backLinks = targets.flatMap(map=>map.pointsOfInterest.filter(p=>p.targetSceneId===scene.id).map(p=>({map,point:p})));
  const patch = (values:Partial<PointOfInterest>) => { if(selected) update(current=>{const point=current.pointsOfInterest.find(p=>p.id===selected.id);if(point)Object.assign(point,values);}); };
  const drag = (event:DragEvent,type:"point"|"folder",id:string) => {event.stopPropagation();event.dataTransfer.effectAllowed="move";event.dataTransfer.setData(DRAG_TYPE,JSON.stringify({sceneId:scene.id,type,id}));setDragging(true);};
  const drop = (event:DragEvent,folderId:string|null) => {
    event.preventDefault();event.stopPropagation();setDragging(false);
    try { const item=JSON.parse(event.dataTransfer.getData(DRAG_TYPE));if(item.sceneId!==scene.id)return;
      update(current=>{if(item.type==="folder")movePoiFolder(current.poiFolders,item.id,folderId);else if(item.type==="point"){const point=current.pointsOfInterest.find(p=>p.id===item.id);if(point&&(folderId===null||current.poiFolders.some(f=>f.id===folderId)))point.folderId=folderId;}});
    } catch { /* Ignore unrelated external drags. */ }
  };
  const q = query.trim().toLowerCase();
  const matches = (point:PointOfInterest) => !q || pointName(point).toLowerCase().includes(q) || (linkedName(point)??"").toLowerCase().includes(q);
  const toggleFolder = (id:string) => setClosed(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});

  const editor = (point:PointOfInterest) => {
    const destination = resolvePointOfInterestTarget(workspace,scene.id,point);
    return <div className="explore-editor" aria-label={`Edit ${pointName(point)}`}>
      <Field label="Name"><input maxLength={120} value={point.name} onChange={e=>patch({name:e.target.value})}/></Field>
      <div className="explore-link-row">
        <Field label="Opens map"><select value={destination?.id??""} onChange={e=>patch({targetSceneId:e.target.value||null})}><option value="">Nothing yet</option>{mapTypes.map(type=>{const maps=targets.filter(m=>m.mapType===type);return maps.length?<optgroup key={type} label={`${mapNames[type]} maps`}>{maps.map(map=><option key={map.id} value={map.id}>{map.name||"Unnamed map"}</option>)}</optgroup>:null;})}</select></Field>
        <button className="explore-open" disabled={!destination} aria-label={destination?`Open ${destination.name}`:"Open linked map"} title="Open linked map" onClick={()=>{if(destination)openScene(destination.id);}}><ArrowUpRight size={16}/></button>
      </div>
      {point.targetSceneId&&!destination&&<p className="muted">The linked map was deleted or moved out of this campaign. Choose another.</p>}
      {!targets.length&&<p className="muted">Add another map to this campaign to link to it.</p>}
      <div className="field"><span>Players open it with</span>
        <div className="explore-segments" role="group" aria-label="Players open it with">
          <button aria-pressed={point.activation==="double"} onClick={()=>patch({activation:"double"})}>Double-click</button>
          <button aria-pressed={point.activation==="single"} onClick={()=>patch({activation:"single"})}>One click</button>
        </div>
      </div>
      <div className="field"><span>Colour</span>
        <div className="explore-colours" role="radiogroup" aria-label="Marker colour">
          {MARKER_COLOURS.map(c=><button key={c} role="radio" aria-checked={point.color.toLowerCase()===c} aria-label={c} style={{background:c}} onClick={()=>patch({color:c})}/>)}
          <label className="explore-colour-custom" title="Another colour"><input type="color" aria-label="Another colour" value={point.color} onChange={e=>patch({color:e.target.value})}/></label>
        </div>
      </div>
      {scene.poiFolders.length>0&&<Field label="Folder"><select value={point.folderId??""} onChange={e=>patch({folderId:e.target.value||null})}><option value="">No folder</option>{scene.poiFolders.map(f=><option key={f.id} value={f.id}>{poiFolderPath(scene.poiFolders,f.id)}</option>)}</select></Field>}
      <Field label="Quick notes"><textarea value={point.notes??""} maxLength={2000} rows={2} placeholder="Only you see these" onChange={e=>patch({notes:e.target.value})}/></Field>
      <Field label="Read aloud"><textarea value={point.readAloud??""} maxLength={4000} rows={3} placeholder="What you read to the players when they get here" onChange={e=>patch({readAloud:e.target.value})}/></Field>
      <div className="field"><span>Pages from the Encyclopedia</span>
        {notePages(book,point.pages).map(page=><div key={page.id} className="explore-page"><span><strong>{page.title}</strong><small>{page.kind}</small></span><button className="explore-icon" aria-label={`Take ${page.title} off this marker`} title="Take off" onClick={()=>update(current=>{const p=current.pointsOfInterest.find(p=>p.id===point.id);if(p)removeNotePage(p,page.id);})}><Trash2 size={14}/></button></div>)}
        {bookError&&<p className="muted" role="alert">{bookError}</p>}
        {adding?<PageSearch autoFocus pages={pages} taken={point.pages} onPick={page=>{update(current=>{const p=current.pointsOfInterest.find(p=>p.id===point.id);if(p)addNotePage(p,page.id);});setAdding(false);}}/>
          :<button disabled={(point.pages?.length??0)>=MAX_NOTE_PAGES} onClick={()=>setAdding(true)}>Add a page</button>}
      </div>
      <Toggle label="Hidden from players" checked={point.hidden} onChange={hidden=>patch({hidden})}/>
      <Toggle label="Players see this note" checked={!!point.playersSee&&!point.hidden} onChange={playersSee=>patch({playersSee})}/>
      {point.playersSee&&!point.hidden&&<p className="muted explore-hint">Players can click the marker for its read-aloud text and the pages they can already read in the Encyclopedia. Quick notes stay yours.</p>}
      <div className="explore-editor-foot">
        <button className="danger" onClick={()=>{update(current=>{current.pointsOfInterest=current.pointsOfInterest.filter(p=>p.id!==point.id);});select(null);}}><Trash2 size={15}/> Delete marker</button>
        <button onClick={()=>select(null)}>Done</button>
      </div>
    </div>;
  };

  const tree=(parentId:string|null,seen=new Set<string>()):ReactNode=><>
    {scene.poiFolders.filter(f=>f.parentId===parentId&&!seen.has(f.id)).map(folder=><div key={folder.id} className="explore-folder" onDragOver={e=>{e.preventDefault();e.stopPropagation();}} onDrop={e=>drop(e,folder.id)}>
      <div className="explore-row explore-folder-row" draggable onDragStart={e=>drag(e,"folder",folder.id)} onDragEnd={()=>setDragging(false)}>
        <button className="explore-row-main" aria-expanded={!closed.has(folder.id)} onClick={()=>toggleFolder(folder.id)}>{closed.has(folder.id)?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<Folder size={15}/><span>{folder.name}</span><small>{scene.pointsOfInterest.filter(p=>p.folderId===folder.id).length}</small></button>
        <button className="explore-icon" aria-label={`Edit folder ${folder.name}`} aria-pressed={editingFolder===folder.id} onClick={()=>setEditingFolder(editingFolder===folder.id?null:folder.id)}><Pencil size={14}/></button>
      </div>
      {editingFolder===folder.id&&<div className="explore-editor">
        <Field label="Folder name"><input maxLength={120} value={folder.name} onChange={e=>update(current=>{const f=current.poiFolders.find(f=>f.id===folder.id);if(f)f.name=e.target.value;})}/></Field>
        <Field label="Inside"><select value={folder.parentId??""} onChange={e=>update(current=>{movePoiFolder(current.poiFolders,folder.id,e.target.value||null);})}><option value="">Top level</option>{scene.poiFolders.filter(f=>canMovePoiFolder(scene.poiFolders,folder.id,f.id)).map(f=><option key={f.id} value={f.id}>{poiFolderPath(scene.poiFolders,f.id)}</option>)}</select></Field>
        <div className="explore-editor-foot"><button className="danger" onClick={()=>{update(current=>deletePoiFolder(current,folder.id));setEditingFolder(null);}}>Delete folder, keep markers</button><button onClick={()=>setEditingFolder(null)}>Done</button></div>
      </div>}
      {!closed.has(folder.id)&&<div className="explore-children">{tree(folder.id,new Set(seen).add(folder.id))}</div>}
    </div>)}
    {scene.pointsOfInterest.filter(p=>(p.folderId??null)===parentId&&matches(p)).map(point=>{const linked=linkedName(point);const active=selectedId===point.id;return <div key={point.id} className={`explore-marker${active?" is-selected":""}`}>
      <div className="explore-row" draggable onDragStart={e=>drag(e,"point",point.id)} onDragEnd={()=>setDragging(false)}>
        <button className="explore-row-main" aria-pressed={active} aria-label={`${active?"Close":"Edit"} ${pointName(point)}`} onClick={()=>select(active?null:point.id)}>
          <i className="explore-dot" style={{background:point.color}} aria-hidden="true"/>
          <span><strong>{pointName(point)}</strong><small>{linked?<><CornerDownRight size={11}/>{linked}{point.activation==="single"?" · one click":""}</>:"Not linked to a map"}</small></span>
          {point.hidden&&<EyeOff size={14} aria-label="Hidden from players"/>}
        </button>
      </div>
      {active&&editor(point)}
    </div>;})}
  </>;

  return <div className="explore">
    <h3>Exploration</h3>
    <PanelTip more={<p>Markers open other maps, so players can travel from the world to a town to a fight. Players double-click a marker to open its map; a doorway opens with one click, for exits and stairs.</p>}>Markers here open other maps.</PanelTip>

    <div className="field"><span>This map is a</span>
      <div className="explore-segments explore-types" role="group" aria-label="Kind of map">
        {mapTypes.map(type=>{const Icon=mapIcons[type];return <button key={type} aria-pressed={scene.mapType===type} onClick={()=>update(current=>{current.mapType=type;})}><Icon size={13}/>{mapNames[type]}</button>;})}
      </div>
    </div>

    {backLinks.length>0&&<div className="explore-back">
      <span className="explore-label">Reached from</span>
      {backLinks.slice(0,4).map(({map,point})=><button key={map.id+point.id} onClick={()=>openScene(map.id)}><MapIcon size={14}/><span>{map.name||"Unnamed map"}</span><small>{pointName(point)}</small></button>)}
    </div>}

    <div className="section-heading"><h3>Markers</h3><span className="count">{scene.pointsOfInterest.length}</span></div>
    <div className="explore-actions">
      <button className="primary" disabled={scene.pointsOfInterest.length>=500} onClick={()=>{select(null);place("double");}}>Add marker</button>
      <button disabled={scene.pointsOfInterest.length>=500} onClick={()=>{select(null);place("single");}}>Add doorway</button>
      <button className="explore-icon" aria-label="New folder" title="New folder" disabled={scene.poiFolders.length>=200} onClick={()=>update(current=>{current.poiFolders.push({id:uid(),name:"New folder",parentId:null});})}><FolderPlus size={16}/></button>
    </div>
    <p className="muted explore-hint">Choose Add, then click the map.</p>
    {scene.pointsOfInterest.length>6&&<label className="explore-search"><Search size={14}/><input value={query} placeholder="Find a marker" aria-label="Find a marker" onChange={e=>setQuery(e.target.value)}/></label>}
    <div className="explore-tree" onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,null)}>
      {dragging&&scene.poiFolders.length>0&&<div className="explore-drop">Drop here to take it out of its folder</div>}
      {tree(null)}
    </div>
    {!scene.pointsOfInterest.length&&<div className="explore-empty"><MapPin size={20}/><p>No markers yet. Add one, click the map where it goes, then choose the map it opens.</p></div>}
    {q&&scene.pointsOfInterest.length>0&&!scene.pointsOfInterest.some(matches)&&<p className="empty-small">No markers match “{query}”.</p>}

    <div className="section-heading"><h3>Encyclopedia pages</h3></div>
    <PanelTip more={<p>Drag a page onto the map to pin it there as a note, or onto a marker to add it to that marker’s note. With a marker selected, click a page to add it.</p>}>Drag a page onto the map or a marker.</PanelTip>
    {bookError?<p className="muted" role="alert">{bookError}</p>:!book?<p className="muted">Loading your Encyclopedia…</p>:<PageSearch pages={pages} taken={selected?.pages} onPick={page=>{if(!selected){setPageHint("Select a marker first, or drag the page onto the map.");return;}let added=false;update(current=>{const p=current.pointsOfInterest.find(p=>p.id===selected.id);if(p)added=addNotePage(p,page.id);});setPageHint(added?`Added ${page.title} to ${pointName(selected)}.`:"That marker’s note is full.");}}/>}
    {pageHint&&<p className="muted explore-hint" role="status">{pageHint}</p>}

    <details className="explore-maps" open>
      <summary>Maps in this campaign</summary>
      {mapTypes.map(type=>{const maps=[scene,...targets].filter(map=>map.mapType===type);const Icon=mapIcons[type];return <div key={type} className="explore-map-group">
        <div className="explore-map-head"><Icon size={14}/><strong>{mapNames[type]} maps</strong><span className="count">{maps.length}</span>{type!=="encounter"&&<button className="text-button" onClick={()=>createMap(type)}>+ New</button>}</div>
        {maps.map(map=><button key={map.id} className={`explore-map${map.id===scene.id?" is-current":""}`} aria-current={map.id===scene.id?"page":undefined} onClick={()=>{if(map.id!==scene.id)openScene(map.id);}}><span>{map.name||"Unnamed map"}</span>{map.id===scene.id?<small>This map</small>:<small>{map.pointsOfInterest.length?`${map.pointsOfInterest.length} marker${map.pointsOfInterest.length===1?"":"s"}`:""}</small>}</button>)}
        {!maps.length&&<p className="empty-small">None yet.</p>}
      </div>;})}
      {!targets.length&&<p className="muted">{collectionPath(workspace.collections,scene.containerId)==="All campaigns & scenes"?"Put this map in a campaign to link it to other maps.":"Add more maps to this campaign to link them together."}</p>}
    </details>
  </div>;
}
