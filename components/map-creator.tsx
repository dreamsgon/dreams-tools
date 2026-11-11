"use client";
import ResizableSidebar from "./resizable-sidebar";
import DesktopSidebars,{useDesktopSidebars} from "./desktop-sidebars";
import { useEffect, useRef, useState } from "react";
import { newScene, uid, type Scene, type Workspace, type MapDrawing, type MapShape, type Point } from "@/lib/model";
import DrawingShape from "./drawing-shape";
import DrawingLayers from "./drawing-layers";
import ThemeToggle from "./theme-toggle";
import { layerState, mergeRooms, simplifyPoints, orderedShapes, layerIds, shapePath } from "@/lib/map-drawing";
type Draft = { name:string; width:number; height:number; drawing:MapDrawing };
const blank = ():Draft => ({name:"New drawn map",width:1400,height:1000,drawing:{background:"#8b9b75",shapes:[],folders:[],layerOrder:[]}});
const fromScene=(s:Scene):Draft=>({name:s.name,width:s.width,height:s.height,drawing:structuredClone(s.drawing!)});
type Tool="select"|"rect"|"circle"|"ellipse"|"line"|"curve"|"path"|"door"|"window";
export default function MapCreator({workspace,initialId,destination,commit,close,saveStatus,persist}: {
  workspace:Workspace;initialId:string|null;destination:string|null;
  commit:(fn:(w:Workspace)=>void)=>void;close:(sceneId?:string)=>void;saveStatus:string;persist:()=>Promise<boolean>;
}) {
  const initial=workspace.scenes.find(s=>s.id===initialId && s.drawing);
  const [source,setSource]=useState<string|null>(initial?.id??null);
  const [draft,setDraft]=useState<Draft>(()=>initial?fromScene(initial):blank());
  const current=useRef(draft);current.current=draft;
  const [dirty,setDirty]=useState(false), [tool,setTool]=useState<Tool>("rect"), [selected,setSelected]=useState<string|null>(null);
  const [fill,setFill]=useState("#cec7a9"),[stroke,setStroke]=useState("#414b3c"),[thickness,setThickness]=useState(14);
  const [snap,setSnap]=useState(true),[zoom,setZoom]=useState(1);
  const [multi,setMulti]=useState<string[]>([]);
  const [addSelection,setAddSelection]=useState(false);
  const [selectedPoint,setSelectedPoint]=useState<number|null>(null);
  const [pointMode,setPointMode]=useState<"move"|"add"|"delete">("move");
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const savingRef=useRef(false);
  const [pending,setPending]=useState<(()=>void)|null>(null);
  const undo=useRef<Draft[]>([]),redo=useRef<Draft[]>([]);
  const svg=useRef<SVGSVGElement>(null);
  const gesture=useRef<{before:Draft;id:string;start:Point;index:number|null;newShape:boolean;ids?:string[]}|null>(null);
  useEffect(()=>{setSelectedPoint(null);setPointMode("move");},[selected]);
  const selectedShape=draft.drawing.shapes.find(s=>s.id===selected && !layerState(draft.drawing,s.id).hidden && !layerState(draft.drawing,s.id).locked);
  const selectedIds=[...new Set([selected,...multi])].filter((id):id is string=>!!id&&draft.drawing.shapes.some(s=>s.id===id)&&!layerState(draft.drawing,id).locked&&!layerState(draft.drawing,id).hidden);
  useEffect(()=>{if(!selected)setMulti([]);},[selected]);
  const choose=(id:string|null,additive=false)=>{
    setSelectedPoint(null);
    if(additive&&id&&draft.drawing.shapes.some(s=>s.id===id)){
      const ids=selectedIds.includes(id)?selectedIds.filter(x=>x!==id):[...selectedIds,id];
      setSelected(ids.at(-1)??null);setMulti(ids.slice(0,-1));
    }else{setSelected(id);setMulti([]);}
  };
  const apply=(next:Draft,previous=current.current)=>{
    undo.current=[...undo.current.slice(-49),previous];redo.current=[];
    current.current=next;setDraft(next);setDirty(true);setMessage("");
  };
  const change=(fn:(d:Draft)=>void)=>{const next=structuredClone(current.current);fn(next);apply(next);};
  const history=(back:boolean)=>{
    if(gesture.current)return;
    const stack=back?undo.current:redo.current,other=back?redo.current:undo.current;
    const previous=stack.pop();if(!previous)return;
    other.push(current.current);current.current=previous;setDraft(previous);setSelected(null);setDirty(true);
  };
  const save=async ():Promise<string|null>=>{
    if(savingRef.current)return null;
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    savingRef.current=true;setSaving(true);
    const id=source??uid(),data=structuredClone(current.current);
    commit(w=>{
      let scene=w.scenes.find(s=>s.id===id);
      if(!scene){scene=newScene(data.name);scene.id=id;scene.containerId=destination;w.scenes.push(scene);}
      Object.assign(scene,data,{mapId:null});
    });
    setSource(id);setDirty(false);setMessage("");
    try {
      if(!await persist()){setDirty(true);setMessage("Map changes are waiting to save. Retry Save before leaving.");return null;}
      setMessage("Map saved to cloud. You can reopen it here or use it as a scene.");
      return id;
    } finally { savingRef.current=false;setSaving(false); }
  };
  const guard=(action:()=>void)=>{if(savingRef.current)return;if(dirty)setPending(()=>action);else action();};
  const open=(id:string)=>{
    const s=workspace.scenes.find(s=>s.id===id && s.drawing);
    const next=s?fromScene(s):blank();setSource(s?.id??null);setDraft(next);current.current=next;
    setDirty(false);setSelected(null);undo.current=[];redo.current=[];setMessage("");
  };
  const patchShape=(patch:Partial<MapShape>)=>{if(selected)change(d=>{for(const s of d.drawing.shapes)if(selectedIds.includes(s.id))Object.assign(s,patch);});};
  useEffect(()=>{
    const unload=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};
    window.addEventListener("beforeunload",unload);return()=>window.removeEventListener("beforeunload",unload);
  },[dirty]);
  const point=(e:React.PointerEvent):Point=>{
    const matrix=svg.current!.getScreenCTM()!;
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
    const grid=(v:number,max:number)=>Math.max(0,Math.min(max,(snap && tool!=="path")?Math.round(v/20)*20:Math.round(v)));
    return {x:grid(p.x,draft.width),y:grid(p.y,draft.height)};
  };
  const start=(e:React.PointerEvent<SVGSVGElement>)=>{
    if(e.button!==0||gesture.current)return;
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p=point(e),before=structuredClone(current.current);
    if(tool==="select") {
      const target=(e.target as Element).closest("[data-shape]");
      const id=target?.getAttribute("data-shape");if(!id){choose(null);return;}
      if(layerState(before.drawing,id).locked||layerState(before.drawing,id).hidden)return;
      if(e.shiftKey||e.ctrlKey||e.metaKey||addSelection){choose(id,true);return;}
      const ids=selectedIds.includes(id)?selectedIds:[id];
      if(!selectedIds.includes(id))choose(id);
      const index=target?.getAttribute("data-point");
      const s=before.drawing.shapes.find(s=>s.id===id)!;
      if(pointMode==="add" && (s.type==="path" || s.type==="line")) {
        const after=index!==null ? Number(index) : nearestSegment(s,p);
        change(d=>{const shape=d.drawing.shapes.find(s=>s.id===id)!;shape.type="path";shape.points.splice(after+1,0,p);});setSelectedPoint(after+1);return;
      }
      if(pointMode==="delete" && index!==null){removePoint(id,Number(index));return;}
      setSelectedPoint(index===null?null:Number(index));
      gesture.current={before,id,start:p,index:ids.length>1?null:index===null?null:Number(index),newShape:false,ids};return;
    }
    const id=uid(),type=tool==="circle"?"ellipse":tool;
    const shape:MapShape={id,type,roomParts:[],hidden:false,locked:false,name:({rect:"Room",ellipse:"Round room",line:"Wall",curve:"Curved wall",path:"Freehand wall",door:"Door",window:"Window"} as Record<string,string>)[type]+" "+(before.drawing.shapes.length+1),folderId:before.drawing.folders?.some(f=>f.id===selected)&&!layerState(before.drawing,selected!).locked?selected:null,smooth:type==="path",points:type==="curve"?[p,p,p]:[p,p],fill:["rect","circle","ellipse","door","window"].includes(tool)?fill:null,stroke,thickness,closed:false};
    gesture.current={before,id,start:p,index:null,newShape:true};choose(id);
    const next=structuredClone(before);next.drawing.layerOrder=[...layerIds(next.drawing),id];next.drawing.shapes.push(shape);current.current=next;setDraft(next);
  };
  const move=(e:React.PointerEvent<SVGSVGElement>)=>{
    const g=gesture.current;if(!g)return;const p=point(e);
    let next:Draft;
    if(g.newShape){
      next=structuredClone(current.current);const s=next.drawing.shapes.find(s=>s.id===g.id)!;
      if(s.type==="path") {
        const last=s.points[s.points.length-1];
        if(Math.hypot(p.x-last.x,p.y-last.y)>=8 && s.points.length<2000)s.points.push(p);
      } else {
        let end=p;
        if(tool==="circle") {const size=Math.min(Math.abs(p.x-g.start.x),Math.abs(p.y-g.start.y));end={x:g.start.x+Math.sign(p.x-g.start.x)*size,y:g.start.y+Math.sign(p.y-g.start.y)*size};}
        s.points[1]=end;
        if(s.type==="curve")s.points[2]={x:(g.start.x+p.x)/2,y:(g.start.y+p.y)/2};
      }
    }else{
      next=structuredClone(g.before);const s=next.drawing.shapes.find(s=>s.id===g.id)!;
      if(g.index!==null)s.points[g.index]=p;
      else {
        const group=next.drawing.shapes.filter(s=>(g.ids??[g.id]).includes(s.id));
        const points=group.flatMap(s=>s.points);
        const dx=Math.max(-Math.min(...points.map(q=>q.x)),Math.min(next.width-Math.max(...points.map(q=>q.x)),p.x-g.start.x));
        const dy=Math.max(-Math.min(...points.map(q=>q.y)),Math.min(next.height-Math.max(...points.map(q=>q.y)),p.y-g.start.y));
        group.forEach(s=>{s.points=s.points.map(q=>({x:q.x+dx,y:q.y+dy}));});
      }
    }
    current.current=next;setDraft(next);
  };
  const finish=(e:React.PointerEvent<SVGSVGElement>)=>{
    if(!gesture.current)return;
    move(e);const g=gesture.current;gesture.current=null;
    const s=current.current.drawing.shapes.find(s=>s.id===g.id)!;
    if(g.newShape && s.type==="path")s.points=simplifyPoints(s.points,3);
    const changed=JSON.stringify(g.before)!==JSON.stringify(current.current);
    if(g.newShape && s.points.every(p=>p.x===g.start.x&&p.y===g.start.y)){current.current=g.before;setDraft(g.before);setSelected(null);return;}
    if(changed)apply(current.current,g.before);
  };
  const cancel=()=>{if(gesture.current){current.current=gesture.current.before;setDraft(current.current);gesture.current=null;setSelected(null);}};
  const nearestSegment=(s:MapShape,p:Point)=>{
    let best=Infinity,index=0;
    for(let i=0;i<s.points.length-(s.closed?0:1);i++){
      const a=s.points[i],b=s.points[(i+1)%s.points.length],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
      const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;
      const dist=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(dist<best){best=dist;index=i;}
    }return index;
  };
  const removePoint=(id:string,index:number)=>{
    const s=current.current.drawing.shapes.find(s=>s.id===id);if(!s||layerState(current.current.drawing,id).locked)return;
    if(s.type!=="path"&&s.type!=="line"){setMessage("Point deletion is available for paths and lines.");return;}
    if(s.points.length<=(s.closed?3:2)){setMessage("Keep at least two points (three for a closed outline), or delete the shape.");return;}
    change(d=>{d.drawing.shapes.find(s=>s.id===id)!.points.splice(index,1);});setSelectedPoint(null);
  };
  const deleteShape=()=>{if(!selectedShape)return;change(d=>{d.drawing.shapes=d.drawing.shapes.filter(s=>!selectedIds.includes(s.id));d.drawing.layerOrder=d.drawing.layerOrder.filter(id=>!selectedIds.includes(id));});setSelected(null);setSelectedPoint(null);};
  const sidebars=useDesktopSidebars("map-creator-sidebars");
  return <main className="map-creator" data-sidebars-hidden={sidebars.hidden} onKeyDown={e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();if(!pending)void save();return;}
    if(savingRef.current || pending || (e.target as HTMLElement).closest("input,select,textarea,[contenteditable=true]"))return;
    if(e.key==="Escape"){cancel();setSelected(null);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();history(!e.shiftKey);}
    if((e.key==="Delete"||e.key==="Backspace") && selectedShape){e.preventDefault();e.stopPropagation();if(selectedIds.length===1&&selectedPoint!==null)removePoint(selectedShape.id,selectedPoint);else deleteShape();}
  }}>
    <header className="creator-header"><DesktopSidebars {...sidebars}/><h1>Map Creator</h1><span role="status">{dirty?"Uncommitted changes":saveStatus}</span>
      <ThemeToggle/>
      <button disabled={saving} onClick={()=>guard(()=>close())}>Back</button><button disabled={saving} className="primary" onClick={()=>void save()}>{saving?"Saving…":"Save map"}</button><button disabled={saving} onClick={async()=>{const id=await save();if(id)close(id);}}>Save & use scene</button>
    </header>
    <div className="creator-layout" inert={saving}><ResizableSidebar className="creator-controls" storageKey="map-creator-controls" defaultWidth={290}>
      <label>Saved maps<select aria-label="Saved maps" value={source??""} onChange={e=>{const id=e.target.value;guard(()=>open(id));}}><option value="">New map</option>{workspace.scenes.filter(s=>s.drawing).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <button onClick={()=>guard(()=>open(""))}>New map</button>
      <label>Map name<input maxLength={120} value={draft.name} onChange={e=>change(d=>{d.name=e.target.value||"Untitled map";})}/></label>
      <div className="form-row">{(["width","height"] as const).map(key=><label key={key}>{key==="width"?"Width":"Height"}<input aria-label={`Map ${key}`} type="number" min={200} max={8000} step={20} value={draft[key]} onChange={e=>{const n=Number(e.target.value);if(n>=200&&n<=8000)change(d=>{d[key]=n;});}}/></label>)}</div>
      <label>Background<input type="color" value={draft.drawing.background} onChange={e=>change(d=>{d.drawing.background=e.target.value;})}/></label>
      <label className="creator-check"><input type="checkbox" checked={addSelection} onChange={e=>{setAddSelection(e.target.checked);setTool("select");}}/>Add to selection</label>
      <p className="muted">Shift-click shapes or layers to select several. {selectedIds.length} selected. Drag a selected shape to move the group.</p>
      <button disabled={selectedIds.length<2} onClick={()=>{
        const id=uid(),merged=mergeRooms(orderedShapes(current.current.drawing).filter(s=>selectedIds.includes(s.id)),id);
        if(!merged){setMessage("Select at least two filled rooms or closed floors to merge.");return;}
        change(d=>{d.drawing.shapes=d.drawing.shapes.filter(s=>!selectedIds.includes(s.id));d.drawing.shapes.push(merged);d.drawing.layerOrder=[...layerIds(d.drawing).filter(x=>!selectedIds.includes(x)&&x!==id),id];});choose(id);setTool("select");
      }}>Merge selected rooms</button>
      <p className="muted">Overlap or touch rooms before merging. The merged room uses the first room's colors; internal walls disappear. Drag Door or Window along a wall to place an opening. Floor color sets its gap color.</p>
      <label>Floor color<input type="color" value={selectedShape?.fill??fill} onChange={e=>{setFill(e.target.value);patchShape({fill:e.target.value});}}/></label>
      <label>Wall color<input type="color" value={selectedShape?.stroke??stroke} onChange={e=>{setStroke(e.target.value);patchShape({stroke:e.target.value});}}/></label>
      <label>Wall thickness<input type="range" min={1} max={60} value={selectedShape?.thickness??thickness} onChange={e=>{setThickness(+e.target.value);patchShape({thickness:+e.target.value});}}/>{selectedShape?.thickness??thickness} px</label>
      <label className="creator-check"><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>Snap shapes to 20 px (freehand stays smooth)</label>
      {selectedShape && <><h3>Selected {selectedShape.type}</h3><label className="creator-check"><input type="checkbox" checked={!!selectedShape.fill} onChange={e=>patchShape({fill:e.target.checked?fill:null})}/>Fill shape</label>
        {selectedShape.type==="path" && <label className="creator-check"><input type="checkbox" checked={selectedShape.closed} onChange={e=>patchShape({closed:e.target.checked})}/>Close outline</label>}
        {selectedShape.type==="path" && <label className="creator-check"><input type="checkbox" checked={selectedShape.smooth} onChange={e=>patchShape({smooth:e.target.checked})}/>Smooth curve</label>}
        {(selectedShape.type==="path"||selectedShape.type==="line") && <><div className="button-row">{(["move","add","delete"] as const).map(mode=><button key={mode} aria-pressed={pointMode===mode} onClick={()=>{setTool("select");setPointMode(mode);}}>{mode} points</button>)}</div>
        <p className="muted">Add: click a wall segment to insert a point. Delete: click a point handle. Move: drag handles. {selectedShape.points.length} points.</p>
        <button disabled={selectedPoint===null} onClick={()=>removePoint(selectedShape.id,selectedPoint!)}>Delete selected point</button></>}
        <button onClick={deleteShape}>Delete shape</button></>}
      <div className="button-row"><button disabled={!undo.current.length} onClick={()=>history(true)}>Undo drawing</button><button disabled={!redo.current.length} onClick={()=>history(false)}>Redo drawing</button></div>
      <label>Zoom<input type="range" min={1} max={3} step={0.25} value={zoom} onChange={e=>setZoom(+e.target.value)}/></label>
      <p className="muted">Drag to draw. Select / edit moves shapes; drag white handles to reshape them. Curved walls have a middle control handle. Delete / Backspace removes a selected point, or the shape when no point is selected. Zoom and scroll for detail. Save commits the drawing to its scene and saves it to cloud; reopen it here to edit later.</p>


    </ResizableSidebar><section className="creator-stage" aria-label="Map drawing area"><div style={{width:`${zoom*100}%`,minWidth:320}}>
      <svg ref={svg} tabIndex={0} aria-label="Editable map drawing" viewBox={`0 0 ${draft.width} ${draft.height}`} style={{background:draft.drawing.background,touchAction:"none",width:"100%",display:"block"}} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel}>
        <defs><pattern id="creator-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 H 0 V 20" fill="none" stroke="#ffffff" strokeOpacity=".18" strokeWidth="1"/></pattern></defs>
        <rect width={draft.width} height={draft.height} fill="url(#creator-grid)" pointerEvents="none"/>
        {orderedShapes(draft.drawing).map(s=><DrawingShape key={s.id} shape={s} background={draft.drawing.background}/>)}
        {tool==="select" && selectedIds.length>1 && draft.drawing.shapes.filter(s=>selectedIds.includes(s.id)).map(s=><path key={s.id} d={shapePath(s)} fill="none" stroke="#2684ff" strokeWidth={3} strokeDasharray="8 6" pointerEvents="none"/>)}
        {selectedShape && selectedIds.length===1 && tool==="select" && <g><path d={shapePath(selectedShape)} fill="none" stroke="#2684ff" strokeWidth={2} strokeDasharray="8 6" pointerEvents="none"/>{selectedShape.points.map((p,i)=><circle key={i} data-shape={selectedShape.id} data-point={i} cx={p.x} cy={p.y} r={9} fill={selectedPoint===i?"#ffcf60":"white"} stroke="#2684ff" strokeWidth={3} style={{cursor:"crosshair"}}/>)}</g>}
      </svg></div></section><ResizableSidebar className="creator-layer-panel" storageKey="map-creator-layers" defaultWidth={310} edge="left">      <DrawingLayers drawing={draft.drawing} selected={selected} selectedIds={selectedIds} select={(id,add)=>{setTool("select");choose(id,!!add||addSelection);}} change={fn=>change(d=>fn(d.drawing))}/></ResizableSidebar></div>
    <nav className="creator-bottom-tools" aria-label="Drawing tools">      <div className="creator-tools">{([["select","Select / edit"],["rect","Room / floor"],["circle","Circular room"],["ellipse","Oval room"],["line","Wall / line"],["curve","Curved wall"],["path","Freehand"],["door","Door"],["window","Window"]] as [Tool,string][]).map(([id,label])=><button key={id} aria-pressed={tool===id} className={tool===id?"active":""} onClick={()=>{setTool(id);setSelected(null);}}>{label}</button>)}</div></nav>
    {message && <div className="creator-message" role="status">{message}</div>}
    {pending && <div className="creator-prompt" role="dialog" aria-modal="true" aria-label="Uncommitted drawing"><div><h2>Keep your drawing?</h2><p>Save your changes before leaving this map.</p><div className="button-row"><button disabled={saving} onClick={async()=>{const action=pending;if(await save()){setPending(null);action();}}}>Save changes</button><button disabled={saving} onClick={()=>{const action=pending;setPending(null);action();}}>Discard changes</button><button disabled={saving} onClick={()=>setPending(null)}>Keep editing</button></div></div></div>}
  </main>;
}
