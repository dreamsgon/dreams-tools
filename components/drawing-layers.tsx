"use client";
import {useEffect,useRef,useState} from "react";
import {Eye,EyeOff,Lock,Unlock,GripVertical} from "lucide-react";
import {uid,type MapDrawing} from "@/lib/model";
import {layerChildren,layerIds,moveLayer,layerState,dropLayers,type LayerDrop} from "@/lib/map-drawing";
export default function DrawingLayers({drawing:d,selected,selectedIds,select,change}:{drawing:MapDrawing;selected:string|null;selectedIds:string[];select:(id:string|null,additive?:boolean)=>void;change:(fn:(d:MapDrawing)=>void)=>void}){
  const [closed,setClosed]=useState<Set<string>>(new Set());
  const folders=d.folders??[];
  const drag=useRef<{ids:string[];x:number;y:number;active:boolean;target:LayerDrop|null}|null>(null);
  const [drop,setDrop]=useState<LayerDrop|null>(null),[dragging,setDragging]=useState(false),[status,setStatus]=useState("");
  const reset=()=>{drag.current=null;setDrop(null);setDragging(false);};
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==="Escape")reset();};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
  const targetAt=(x:number,y:number):LayerDrop|null=>{
    const el=document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-layer-target]");if(!el)return null;
    const id=el.dataset.layerTarget!;if(id==="root")return {id:null,mode:"inside"};
    const r=el.getBoundingClientRect(),ratio=(y-r.top)/r.height;
    return {id,mode:folders.some(f=>f.id===id)&&ratio>.25&&ratio<.75?"inside":ratio<.5?"before":"after"};
  };
  const grip=(id:string,name:string)=><button className="layer-grip" aria-label={`Drag layer ${name}`} disabled={layerState(d,id).locked} onPointerDown={e=>{
    if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={ids:selectedIds.includes(id)?selectedIds:[id],x:e.clientX,y:e.clientY,active:false,target:null};
  }} onPointerMove={e=>{const g=drag.current;if(!g)return;if(!g.active&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<5)return;g.active=true;setDragging(true);
    const t=targetAt(e.clientX,e.clientY);g.target=t&&dropLayers(structuredClone(d),g.ids,t)?t:null;setDrop(g.target);
    const host=e.currentTarget.closest<HTMLElement>(".creator-layer-panel");if(host){const r=host.getBoundingClientRect();if(e.clientY<r.top+35)host.scrollTop-=12;if(e.clientY>r.bottom-35)host.scrollTop+=12;}
  }} onPointerUp={e=>{const g=drag.current,t=targetAt(e.clientX,e.clientY);if(g?.active&&t&&dropLayers(structuredClone(d),g.ids,t)){change(next=>{dropLayers(next,g.ids,t);});if(t.mode==="inside"&&t.id)setClosed(old=>{const next=new Set(old);next.delete(t.id!);return next;});setStatus("Layers moved. Undo drawing restores the move.");}reset();}} onPointerCancel={reset} onLostPointerCapture={reset}><GripVertical size={14}/></button>;
  const dropStyle=(id:string|null)=>drop?.id===id?`layer-drop-${drop.mode}`:"";

  const shape=d.shapes.find(s=>s.id===selected),folder=folders.find(f=>f.id===selected);
  const parent=shape?.folderId??folder?.parentId??null;
  const protectedLayer=!!selected&&layerState(d,selected).locked;
  const allowed=(id:string)=>{let f=folders.find(f=>f.id===id);const seen=new Set<string>();while(f){if(f.id===selected||seen.has(f.id))return false;seen.add(f.id);f=folders.find(p=>p.id===f!.parentId);}return true;};
  const tree=(parent:string|null):React.ReactNode=>layerChildren(d,parent).reverse().map(id=>{
    const s=d.shapes.find(s=>s.id===id),f=folders.find(f=>f.id===id);
    return <div key={id}><div data-layer-target={id} className={"drawing-layer-row "+dropStyle(id)}>
      {grip(id,f?.name||s?.name||s?.type||"layer")}
      <button className="layer-state" aria-label={`${(s||f)!.hidden?"Show":"Hide"} layer ${f?.name||s?.name||s?.type}`} title="Show or hide layer" onClick={()=>change(next=>{const item=next.shapes.find(s=>s.id===id)||next.folders.find(f=>f.id===id);if(item)item.hidden=!item.hidden;})}>{layerState(d,id).hidden?<EyeOff size={14}/>:<Eye size={14}/>}</button>
      <button className="layer-state" aria-label={`${(s||f)!.locked?"Unlock":"Lock"} layer ${f?.name||s?.name||s?.type}`} title="Lock or unlock layer" onClick={()=>change(next=>{const item=next.shapes.find(s=>s.id===id)||next.folders.find(f=>f.id===id);if(item)item.locked=!item.locked;})}>{layerState(d,id).locked?<Lock size={14}/>:<Unlock size={14}/>}</button>
      {f && <button aria-label={`${closed.has(id)?"Expand":"Collapse"} layer folder ${f.name}`} onClick={()=>setClosed(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;})}>{closed.has(id)?"+":"-"}</button>}
      <button className={selected===id||selectedIds.includes(id)?"active":""} onClick={e=>select(id,e.shiftKey||e.ctrlKey||e.metaKey)}><span className="layer-swatch" style={{background:f?"#dce2d7":s?.fill??"#f7f8f3",borderColor:s?.stroke??"#aab9a4"}}>{f?"+":""}</span><span>{f?f.name:s?.name||s?.type}<small>{f?"Folder":s?.type}</small></span></button>
    </div>{f&&!closed.has(id)&&<div className="drawing-layer-children">{tree(id)}</div>}</div>;
  });
  return <section className="drawing-layers"><h3>Layers</h3><p className="muted">Drag between rows to reorder; onto a folder center to group. Top layers draw in front. Folder visibility and locks apply to their contents.</p>
    <div data-layer-target="root" className={"layer-root-drop "+dropStyle(null)}>Root layers - drop here to ungroup</div>
    <p role="status" className="muted layer-drag-status">{dragging?"Drop on a highlighted edge or folder. Escape cancels.":status}</p>
    <button onClick={()=>{const id=uid();change(next=>{next.layerOrder=[...layerIds(next),id];next.folders.push({id,name:"Layer folder",parentId:protectedLayer?null:folder?.id??parent,hidden:false,locked:false});});select(id);}}>New layer folder</button>
    {tree(null)}
    {(shape||folder)&&<div className="layer-details">{protectedLayer&&<p className="muted">Locked by this layer or a parent folder. Unlock before editing.</p>}
      <label>Layer name<input disabled={protectedLayer} key={selected} maxLength={120} defaultValue={shape?.name||folder?.name||shape?.type} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}} onBlur={e=>{const name=e.target.value.trim();if(name)change(next=>{const item=next.shapes.find(s=>s.id===selected)||next.folders.find(f=>f.id===selected);if(item)item.name=name;});}}/></label>
      <div className="button-row"><button disabled={protectedLayer||layerChildren(d,parent).at(-1)===selected} onClick={()=>change(next=>moveLayer(next,selected!,1))}>Move layer up</button><button disabled={protectedLayer||layerChildren(d,parent)[0]===selected} onClick={()=>change(next=>moveLayer(next,selected!,-1))}>Move layer down</button></div>
      <label>Move layer into<select disabled={protectedLayer} value={parent??""} onChange={e=>{const parentId=e.target.value||null;change(next=>{dropLayers(next,selectedIds.length?selectedIds:[selected!],{id:parentId,mode:"inside"});});}}><option value="">Root layers</option>{folders.filter(f=>allowed(f.id)).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      {folder&&<button disabled={protectedLayer} onClick={()=>{change(next=>{next.folders=next.folders.filter(f=>f.id!==folder.id);next.folders.forEach(f=>{if(f.parentId===folder.id)f.parentId=folder.parentId;});next.shapes.forEach(s=>{if(s.folderId===folder.id)s.folderId=folder.parentId;});next.layerOrder=next.layerOrder.filter(id=>id!==folder.id);});select(null);}}>Remove folder, keep layers</button>}
    </div>}
  </section>;
}
