"use client";
import {useState} from "react";
import { countLabel } from "@/lib/plural";
import {Globe2,Mountain,Swords,type LucideIcon} from "lucide-react";
import {Modal} from "./dialogs";
import {collectionPath,newScene,uid,type Scene,type Workspace} from "@/lib/model";
const MAP_KINDS:[Scene["mapType"],string,string,LucideIcon][]=[
  ["encounter","Encounter map","A battle map for a fight, on a grid.",Swords],
  ["area","Area map","A town, dungeon or region to explore.",Mountain],
  ["world","World map","Your whole setting. Its markers open area maps.",Globe2],
];
export default function AddScenes({workspace:w,campaignId,initialDestination,initialMapType="encounter",commit,close,importMap,splitMap,openScene}: {
  workspace:Workspace;campaignId:string|null;initialDestination:string|null;initialMapType?:Scene["mapType"];
  commit:(fn:(w:Workspace)=>void)=>void;close:()=>void;importMap:(destination:string|null,mapType:Scene["mapType"])=>void;splitMap:(destination:string|null)=>void;openScene:(id:string)=>void;
}) {
  const [destination,setDestination]=useState(initialDestination),[search,setSearch]=useState(""),[source,setSource]=useState("all"),[status,setStatus]=useState("");
  const [mapType,setMapType]=useState<Scene["mapType"]>(initialMapType);
  const mapName=mapType==="world"?"World Map":mapType==="area"?"Area Map":"Encounter Map";
  const [selection,setSelection]=useState<Set<string>>(new Set());
  const campaignFor=(id:string|null):string|null=>{while(id){const c=w.collections.find(c=>c.id===id);if(!c)return null;if(c.kind==="campaign")return c.id;id=c.parentId;}return null;};
  const campaign=w.collections.find(c=>c.id===campaignId);
  const targetName=campaign?.name??"Unfiled scenes";
  const candidates=w.scenes.filter(s=>campaignFor(s.containerId)!==campaignId&&(source==="all"||(campaignFor(s.containerId)??"unfiled")===source)&&`${s.name} ${collectionPath(w.collections,s.containerId)}`.toLowerCase().includes(search.toLowerCase()));
  const selected=w.scenes.filter(s=>selection.has(s.id)&&campaignFor(s.containerId)!==campaignId);
  const hiddenCount=selected.filter(s=>!candidates.some(c=>c.id===s.id)).length;
  const toggle=(id:string)=>setSelection(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});
  const transfer=(ids:string[],copy:boolean)=>{
    const originals=w.scenes.filter(s=>ids.includes(s.id)&&campaignFor(s.containerId)!==campaignId);if(!originals.length)return;
    const copiedIds=new Map(originals.map(s=>[s.id,uid()]));
    commit(next=>{
      for(const original of originals){
        if(copy){const scene=structuredClone(original);scene.id=copiedIds.get(original.id)!;scene.pointsOfInterest=scene.pointsOfInterest.map(p=>({...p,id:uid(),targetSceneId:p.targetSceneId?copiedIds.get(p.targetSceneId)??null:null}));scene.containerId=destination;scene.folder="";next.scenes.push(scene);}
        else {const scene=next.scenes.find(s=>s.id===original.id)!;scene.containerId=destination;scene.folder="";}
      }
    });
    setSelection(old=>new Set([...old].filter(id=>!originals.some(s=>s.id===id))));
    setStatus(`${originals.length===1?originals[0].name:`${originals.length} scenes`} ${copy?"copied":"moved"} into ${destination?collectionPath(w.collections,destination):targetName}. One Undo restores this entire action.`);
  };
  return <Modal title={`Add scenes to ${targetName}`} close={close} wide>
    <div className="add-scenes">
      <label>Destination folder<select value={destination??""} onChange={e=>setDestination(e.target.value||null)}>
        <option value={campaignId??""}>{targetName} / All scenes</option>
        {w.collections.filter(c=>c.kind==="folder"&&campaignFor(c.id)===campaignId).map(c=><option key={c.id} value={c.id}>{collectionPath(w.collections,c.id)}</option>)}
      </select></label>
      <div className="add-map-types" role="radiogroup" aria-label="Kind of map">
        <span className="add-step">1. What kind of map?</span>
        {MAP_KINDS.map(([type,label,hint,Icon])=><button key={type} type="button" role="radio" aria-checked={mapType===type} className="add-map-type" onClick={()=>setMapType(type)}><Icon size={22} aria-hidden="true"/><strong>{label}</strong><span>{hint}</span></button>)}
      </div>
      <span className="add-step">2. How do you want to start?</span>
      <div className="add-scene-actions">
        <button disabled={!campaignId} onClick={()=>splitMap(destination)}><strong>Split a large map</strong><span>{campaignId?"Preview numbered sections and create linked area scenes.":"Open a campaign to create linked map sections."}</span></button>
        <button onClick={()=>importMap(destination,mapType)}><strong>Upload or link {mapName}</strong><span>Use an image, Universal VTT export, URL, or connected storage.</span></button>
        <button onClick={()=>{const scene=newScene(`New ${mapName}`);scene.mapType=mapType;scene.containerId=destination;commit(next=>{next.scenes.push(scene);next.activeId=scene.id;});openScene(scene.id);}}><strong>Start a blank {mapName}</strong><span>Add terrain, labels, markers, and tokens.</span></button>
      </div>
      <h3>Bring in an existing scene</h3>
      <p className="muted">Copy keeps the original in its campaign. Move transfers it here. Both include its map, drawing, tokens, and fog.</p>
      <div className="form-row"><label>From campaign<select value={source} onChange={e=>setSource(e.target.value)}>
        <option value="all">All other campaigns</option>{campaignId!==null&&<option value="unfiled">Unfiled scenes</option>}
        {w.collections.filter(c=>c.kind==="campaign"&&c.id!==campaignId).map(c=><option key={c.id} value={c.id}>{collectionPath(w.collections,c.id)}</option>)}
      </select></label><label>Find a scene<input placeholder="Search scenes" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
      <div className="scene-bulk-actions">
        <div className="button-row"><button disabled={!candidates.length} onClick={()=>setSelection(old=>new Set([...old,...candidates.map(s=>s.id)]))}>Select all shown</button><button disabled={!selected.length} onClick={()=>setSelection(new Set())}>Clear selection</button></div>
        <span aria-live="polite">{selected.length} selected{hiddenCount>0?` (${hiddenCount} hidden by filters)`:""}</span>
        <div className="button-row"><button className="primary" disabled={!selected.length} onClick={()=>transfer(selected.map(s=>s.id),true)}>Copy selected here</button><button disabled={!selected.length} onClick={()=>transfer(selected.map(s=>s.id),false)}>Move selected here</button></div>
      </div>
      <div className="import-scene-list">{candidates.map(s=><div className={"import-scene-row "+(selection.has(s.id)?"is-selected":"")} key={s.id}><label className="import-scene-selection"><input type="checkbox" aria-label={`Select ${s.name}`} checked={selection.has(s.id)} onChange={()=>toggle(s.id)}/><span><strong>{s.name}</strong><small>{s.containerId?collectionPath(w.collections,s.containerId):"Unfiled scenes"} · {countLabel(s.tokens.length,"token")}</small></span></label><div className="button-row"><button aria-label={`Copy ${s.name} here`} onClick={()=>transfer([s.id],true)}>Copy here</button><button aria-label={`Move ${s.name} here`} onClick={()=>transfer([s.id],false)}>Move here</button></div></div>)}
      {!candidates.length&&<p className="muted">No scenes match. Try another campaign or upload a map above.</p>}</div>
      <p role="status">{status}</p>
    </div>
  </Modal>;
}
