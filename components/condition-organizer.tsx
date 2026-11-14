"use client";
import { uiZoom } from "@/lib/appearance";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { moveSibling, canMoveSibling, placeBeside } from "@/lib/folder-order";
import { edgeAtPoint, altStep } from "./folder-reorder";
import {ChevronUp,Pencil,GripVertical,Folder,FolderPlus,ChevronRight,ChevronDown} from "lucide-react";
import { uid, canMoveCollection, collectionPath, type Condition, type Workspace } from "@/lib/model";
export default function ConditionOrganizer({workspace:w,commit,location,setLocation,renderCondition,onNewCondition}: {
  workspace:Workspace; commit:(fn:(w:Workspace)=>void)=>void;
  location:string|null; setLocation:(id:string|null)=>void; renderCondition:(condition:Condition)=>ReactNode;
  onNewCondition:()=>void;
}) {
  const [search,setSearch]=useState("");
  const [closed,setClosed]=useState<Set<string>>(new Set());
  const [creating,setCreating]=useState(false),[name,setName]=useState("");
  type DragItem={id:string;name:string;kind:"folder"|"condition"};
  const drag=useRef<{item:DragItem;x:number;y:number;px:number;py:number;active:boolean;host:HTMLElement|null;target:string|null|undefined;since:number}|null>(null);
  const ghost=useRef<HTMLDivElement>(null);
  const [moving,setMoving]=useState<DragItem|null>(null),[over,setOver]=useState<string|null|undefined>(undefined),[message,setMessage]=useState("");
  const [edgeAt,setEdgeAt]=useState<{id:string;place:"before"|"after"}|null>(null),[editing,setEditing]=useState<string|null>(null);const edgeRef=useRef<typeof edgeAt>(null);
  const reset=()=>{drag.current=null;edgeRef.current=null;setEdgeAt(null);setMoving(null);setOver(undefined);};
  const edgeFor=(item:DragItem,x:number,y:number)=>item.kind!=="folder"?null:edgeAtPoint(x,y,"data-condition-drop",id=>id!==item.id&&canMoveCollection(w.conditionFolders,item.id,w.conditionFolders.find(f=>f.id===id)?.parentId??null));
  const reorder=(id:string,delta:-1|1)=>{const f=w.conditionFolders.find(x=>x.id===id);if(!f||!canMoveSibling(w.conditionFolders,id,delta))return;commit(next=>{next.conditionFolders=moveSibling(next.conditionFolders,id,delta);});setMessage(`Moved ${f.name} ${delta<0?"up":"down"}.`);};
  const accepts=(item:DragItem,target:string|null)=>{
    if(target!==null&&!w.conditionFolders.some(f=>f.id===target))return false;
    if(item.kind==="folder")return w.conditionFolders.find(f=>f.id===item.id)?.parentId!==target&&canMoveCollection(w.conditionFolders,item.id,target);
    return (w.conditionLocations[item.id]??null)!==target;
  };
  const targetAt=(item:DragItem,x:number,y:number)=>{
    const value=document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-condition-drop]")?.dataset.conditionDrop;
    const target=value==="root"?null:value;
    return target!==undefined&&accepts(item,target)?target:undefined;
  };
  useEffect(()=>{
    if(!moving)return;
    const cancel=(e:KeyboardEvent)=>{if(e.key==="Escape"){reset();setMessage("Move cancelled.");}};
    window.addEventListener("keydown",cancel);
    let frame:number,previous=performance.now();
    const tick=(now:number)=>{
      const d=drag.current;if(!d)return;
      const dt=Math.min(32,now-previous);previous=now;
      if(ghost.current)ghost.current.style.transform=`translate3d(${Math.min(d.px+12,window.innerWidth-190)/uiZoom()}px,${Math.min(d.py+14,window.innerHeight-50)/uiZoom()}px,0)`;
      if(d.host){const r=d.host.getBoundingClientRect();const top=Math.max(0,r.top),bottom=Math.min(window.innerHeight,r.bottom);d.host.scrollTop+=(d.py<top+50?-1:d.py>bottom-50?1:0)*dt*.5;}
      const edge=edgeFor(d.item,d.px,d.py);if(edge?.id!==edgeRef.current?.id||edge?.place!==edgeRef.current?.place){edgeRef.current=edge;setEdgeAt(edge);}
      const target=edge?undefined:targetAt(d.item,d.px,d.py);
      if(target!==d.target){d.target=target;d.since=now;setOver(target);}
      if(target&&now-d.since>650)setClosed(old=>{if(!old.has(target))return old;const next=new Set(old);next.delete(target);return next;});
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener("keydown",cancel);};
  },[moving,w]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(""),4000);return()=>clearTimeout(timer);},[message]);
  const dropProps=(id:string|null)=>({"data-condition-drop":id??"root","data-drop-state":moving&&over===id?"ready":undefined,"data-drop-edge":id&&edgeAt?.id===id?edgeAt.place:undefined});
  const grip=(item:DragItem)=><button className="organizer-grip" aria-label={`Drag ${item.name}`} title="Drag into a folder or Conditions root" onClick={e=>e.stopPropagation()}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={item,x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY,active:false,host:e.currentTarget.closest<HTMLElement>(".panel-content"),target:undefined,since:0};}}
    onPointerMove={e=>{const d=drag.current;if(!d)return;d.px=e.clientX;d.py=e.clientY;if(!d.active&&Math.hypot(d.px-d.x,d.py-d.y)>=6){d.active=true;setMoving(d.item);setMessage("");}}}
    onPointerUp={e=>{const d=drag.current;const edge=d?.active?edgeFor(d.item,e.clientX,e.clientY):null;
      if(d?.active&&edge){commit(next=>{next.conditionFolders=placeBeside(next.conditionFolders,d.item.id,edge.id,edge.place);});setMessage(`Moved ${d.item.name} ${edge.place} ${w.conditionFolders.find(f=>f.id===edge.id)?.name??""}. Undo restores the move.`);reset();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);return;}
      const target=d?.active?targetAt(d.item,e.clientX,e.clientY):undefined;
      if(d?.active&&target!==undefined){commit(next=>{if(d.item.kind==="folder")next.conditionFolders.find(f=>f.id===d.item.id)!.parentId=target;else next.conditionLocations[d.item.id]=target;});if(target)setClosed(old=>{const next=new Set(old);next.delete(target);return next;});setMessage(`Moved ${d.item.name} to ${path(target)}. Undo restores the move.`);}
      else if(d?.active)setMessage("Not moved. Drop onto a folder or Conditions root.");
      reset();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    }} onPointerCancel={reset} onLostPointerCapture={reset}><GripVertical size={16}/></button>;
  const current=w.conditionFolders.find(f=>f.id===location);
  const selectedFolder=current?.id??null;
  const path=(id:string|null)=>id?collectionPath(w.conditionFolders,id):"Conditions root";
  const folderOptions=(exclude?:string)=><><option value="">Conditions root</option>{w.conditionFolders.filter(f=>!exclude||canMoveCollection(w.conditionFolders,exclude,f.id)).map(f=><option key={f.id} value={f.id}>{path(f.id)}</option>)}</>;
  const toggle=(id:string)=>setClosed(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});
  const tree=(parentId:string|null):React.ReactNode=>w.conditionFolders.filter(f=>f.parentId===parentId).map(f=><div key={f.id} className="asset-folder-branch"><div {...dropProps(f.id)} className={"organizer-row "+(selectedFolder===f.id?"active":"")} data-dragging={moving?.id===f.id||undefined} onClick={e=>{if(!(e.target as HTMLElement).closest("button,input,a")){toggle(f.id);setSearch("");}}} onKeyDown={e=>{const step=altStep(e);if(step){e.preventDefault();reorder(f.id,step);}}}>{grip({id:f.id,name:f.name,kind:"folder"})}<button aria-label={`${closed.has(f.id)?"Expand":"Collapse"} ${f.name}`} aria-expanded={!closed.has(f.id)} onClick={()=>toggle(f.id)}>{closed.has(f.id)?<ChevronRight size={15}/>:<ChevronDown size={15}/>}</button><button aria-expanded={!closed.has(f.id)} onClick={()=>{toggle(f.id);setLocation(f.id);setSearch("");}}><Folder size={16}/><span>{f.name}</span></button><button className="collection-edit" aria-label={`Edit ${f.name}`} title={`Edit ${f.name}`} aria-pressed={editing===f.id} onClick={()=>{setLocation(f.id);setEditing(editing===f.id?null:f.id);}}><Pencil size={14}/></button></div>{!closed.has(f.id)&&<div className="organizer-children">{tree(f.id)}</div>}</div>);
  const conditions=w.conditions.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()) && (search.trim() || (w.conditionLocations[c.id]??null)===selectedFolder));
  return <section className="campaign-assets condition-organizer">
    {moving&&<div ref={ghost} className="organizer-drag-ghost" aria-hidden="true"><GripVertical size={16}/>{moving.name}</div>}
    <p className="asset-drag-status" role="status">{moving?`Moving ${moving.name} - ${over!==undefined?"release to move here":"choose a folder"}. Escape cancels.`:message||"Drag handles to move conditions or folders into folders or back to Conditions root."}</p>
    <input aria-label="Search conditions" placeholder="Search all folders…" value={search} onChange={(e)=>setSearch(e.target.value)}/>
    <section aria-label="Condition folders" className="organizer">
      <div className="asset-folder-toolbar"><button {...dropProps(null)} className="scene-root-link" onClick={()=>{setLocation(null);setSearch("");}}><Folder size={16}/>Conditions root</button>
      </div><div className="button-row"><button title="Create a folder at the root" onClick={()=>{setCreating(true);setName("");}}><FolderPlus size={16}/>New folder</button><button onClick={onNewCondition}>New Condition</button></div>
      {creating&&<form className="organizer-editor" onSubmit={e=>{e.preventDefault();if(!name.trim())return;const id=uid();commit(next=>next.conditionFolders.push({id,name:name.trim(),kind:"folder",parentId:null}));setLocation(id);setCreating(false);setName("");}}>
        <label>Folder name<input autoFocus required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
        <div className="button-row"><button disabled={!name.trim()}>Create folder</button><button type="button" onClick={()=>setCreating(false)}>Cancel</button></div>
      </form>}
      {tree(null)}
      {current&&editing===current.id&&<details open key={current.id} className="asset-folder-settings"><summary>Folder settings</summary><div className="organizer-editor">
        <label>Folder name<input key={current.id+current.name} maxLength={120} defaultValue={current.name} onBlur={e=>{const name=e.target.value.trim();if(name&&name!==current.name)commit(next=>{next.conditionFolders.find(f=>f.id===current.id)!.name=name;});else e.target.value=current.name;}}/></label>
        <label>Move folder to<select value={current.parentId??""} onChange={e=>{const parent=e.target.value||null;if(canMoveCollection(w.conditionFolders,current.id,parent))commit(next=>{next.conditionFolders.find(f=>f.id===current.id)!.parentId=parent;});}}>{folderOptions(current.id)}</select></label>
        <div className="button-row organizer-order" role="group" aria-label={`Order of ${current.name}`}><button disabled={!canMoveSibling(w.conditionFolders,current.id,-1)} onClick={()=>reorder(current.id,-1)}><ChevronUp size={14} aria-hidden="true"/>Move up</button><button disabled={!canMoveSibling(w.conditionFolders,current.id,1)} onClick={()=>reorder(current.id,1)}><ChevronDown size={14} aria-hidden="true"/>Move down</button></div>
        <button onClick={()=>{commit(next=>{next.conditionFolders=next.conditionFolders.filter(f=>f.id!==current.id);next.conditionFolders.forEach(f=>{if(f.parentId===current.id)f.parentId=current.parentId;});for(const id in next.conditionLocations)if(next.conditionLocations[id]===current.id)next.conditionLocations[id]=current.parentId;});setLocation(current.parentId);}}>Remove folder, keep contents</button>
      </div></details>}
      <p className="muted">Viewing: {path(selectedFolder)}</p>
    </section>
    {search.trim()&&<p className="muted">Results across all folders</p>}
    {conditions.map(c=><div key={c.id} className="asset-list-item">
      <div className="asset-drag-row">{grip({id:c.id,name:c.name,kind:"condition"})}<div style={{flex:1,minWidth:0}}>{renderCondition(c)}</div></div>
    </div>)}
    {!conditions.length&&<p className="muted">{search.trim()?"No matching conditions.":"No conditions in this folder."}</p>}
    <p className="muted">Use Undo to reverse a move.</p>
  </section>;
}
