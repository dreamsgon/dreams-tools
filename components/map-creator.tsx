"use client";
import ResizableSidebar from "./resizable-sidebar";
import DesktopSidebars,{useDesktopSidebars} from "./desktop-sidebars";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, MousePointer2, Square, Pentagon, Circle, Egg, Slash, Spline, PenLine, DoorOpen, AppWindow, Undo2, Redo2, Minus, Plus, Grid3x3, Magnet, Copy, Trash2, Merge } from "lucide-react";
import { newScene, uid, type Scene, type Workspace, type MapDrawing, type MapShape, type Point } from "@/lib/model";
import DrawingShape from "./drawing-shape";
import DrawingLayers from "./drawing-layers";
import AppearanceMenu from "./appearance-menu";
import "./map-creator.css";
import { creatorTools, toolForKey, wallSegments, nearestWall, openingOnWall, touchingRooms, isRoom, rectCorners, type WallSegment, defaultCreatorGrid, sizeLabel, shapeBounds, isArea, toUnits, fromUnits, distance, resizeShape, offsetShape, snapPoint, type CreatorTool, type CreatorGrid } from "@/lib/map-creator";
import { layerState, mergeRooms, simplifyPoints, orderedShapes, layerIds, shapePath } from "@/lib/map-drawing";
type Draft = { name:string; width:number; height:number; drawing:MapDrawing };
const blank = ():Draft => ({name:"New drawn map",width:1400,height:980,drawing:{background:"#8b9b75",shapes:[],folders:[],layerOrder:[]}});
const fromScene=(s:Scene):Draft=>({name:s.name,width:s.width,height:s.height,drawing:structuredClone(s.drawing!)});
type Tool=CreatorTool;
type Tab="selected"|"layers"|"map";
const gridOf=(s:Scene|undefined):CreatorGrid=>s?{size:s.grid.size,units:s.grid.units,unit:s.grid.unit}:defaultCreatorGrid;
const TOOL_ICONS:Record<Tool,ReactNode>={select:<MousePointer2 size={19}/>,rect:<Square size={19}/>,poly:<Pentagon size={19}/>,circle:<Circle size={19}/>,ellipse:<Egg size={19} style={{transform:"rotate(90deg)"}}/>,line:<Slash size={19}/>,curve:<Spline size={19}/>,path:<PenLine size={19}/>,door:<DoorOpen size={19}/>,window:<AppWindow size={19}/>};
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
  const [snap,setSnap]=useState(true),[zoom,setZoom]=useState(1),[tab,setTab]=useState<Tab>("selected");
  const grid=gridOf(workspace.scenes.find(s=>s.id===source));
  const [drawingId,setDrawingId]=useState<string|null>(null);
  const stage=useRef<HTMLElement>(null),pan=useRef<{x:number;y:number;left:number;top:number}|null>(null),[spaceHeld,setSpaceHeld]=useState(false);
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
  const gesture=useRef<{before:Draft;id:string;start:Point;index:number|null;newShape:boolean;ids?:string[];wall?:WallSegment;raw?:Point}|null>(null);
  // Shaped rooms are drawn a corner at a time; doors look for the wall under the pointer.
  const [polyPoints,setPolyPoints]=useState<Point[]|null>(null),[polyHover,setPolyHover]=useState<Point|null>(null),[hoverWall,setHoverWall]=useState<WallSegment|null>(null);
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
  const rawPoint=(e:React.PointerEvent):Point=>{
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return {x:p.x,y:p.y};
  };
  const walls=()=>wallSegments(orderedShapes(current.current.drawing).filter(s=>!layerState(current.current.drawing,s.id).locked));
  const pickTool=(next:Tool)=>{setTool(next);setPolyPoints(null);setPolyHover(null);setHoverWall(null);if(next!=="select")setSelected(null);};
  const finishPoly=(pts:Point[]|null=polyPoints)=>{
    setPolyPoints(null);setPolyHover(null);
    if(!pts||pts.length<3){if(pts?.length)setMessage("A shaped room needs at least three corners.");return;}
    const before=structuredClone(current.current),id=uid(),next=structuredClone(before);
    next.drawing.shapes.push({id,type:"path",roomParts:[],hidden:false,locked:false,name:`Room ${before.drawing.shapes.length+1}`,folderId:null,smooth:false,points:pts,fill,stroke,thickness,closed:true});
    next.drawing.layerOrder=[...layerIds(next.drawing),id];
    const joined=joinRooms(next,id,false);apply(next,before);choose(joined.id);if(joined.message)setMessage(joined.message);
  };
  /** A new room that touches or overlaps others becomes one room with them, with no wall between. */
  const joinRooms=(d:Draft,id:string,apart:boolean):{id:string;message:string}=>{
    const s=d.drawing.shapes.find(s=>s.id===id);if(!s||apart||!isRoom(s))return {id,message:""};
    const others=orderedShapes(d.drawing).filter(o=>o.id!==id&&!layerState(d.drawing,o.id).locked);
    const touching=touchingRooms(s,others,2);if(!touching.length)return {id,message:""};
    const joinedId=uid(),merged=mergeRooms([...touching,s],joinedId);if(!merged)return {id,message:""};
    const gone=[...touching.map(t=>t.id),id],order=layerIds(d.drawing),at=Math.min(...touching.map(t=>order.indexOf(t.id)));
    d.drawing.shapes=d.drawing.shapes.filter(x=>!gone.includes(x.id));d.drawing.shapes.push({...merged,name:touching[0].name||"Room"});
    const kept=order.slice(0,at).filter(x=>!gone.includes(x));d.drawing.layerOrder=[...kept,joinedId,...order.slice(at).filter(x=>!gone.includes(x))];
    return {id:joinedId,message:`Joined with ${touching.map(t=>t.name||"a room").join(", ")}. Press Ctrl+Z to keep them apart, or hold Alt while drawing.`};
  };
  const point=(e:React.PointerEvent):Point=>{
    const p=rawPoint(e);
    // Rooms and walls land on the same squares as the Maptable grid; Alt draws freely.
    return snapPoint(p,snap&&tool!=="path"&&!e.altKey?grid.size:null,draft.width,draft.height);
  };
  const start=(e:React.PointerEvent<SVGSVGElement>)=>{
    if(e.button!==0||gesture.current||spaceHeld)return;
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
      if(pointMode==="add" && (s.type==="path" || s.type==="line" || s.type==="rect")) {
        // A rectangle becomes a four-cornered outline the first time it gets an extra corner.
        const shaped=s.type==="rect"?{...s,type:"path" as const,closed:true,points:rectCorners(s)}:s;
        const after=index!==null&&s.type!=="rect" ? Number(index) : nearestSegment(shaped,p);
        change(d=>{const shape=d.drawing.shapes.find(s=>s.id===id)!;Object.assign(shape,{type:"path",closed:shaped.closed,points:[...shaped.points]});shape.points.splice(after+1,0,p);});setSelectedPoint(after+1);return;
      }
      if(pointMode==="delete" && index!==null){removePoint(id,Number(index));return;}
      setSelectedPoint(index===null?null:Number(index));
      gesture.current={before,id,start:p,index:ids.length>1?null:index===null?null:Number(index),newShape:false,ids};return;
    }
    if(tool==="poly"){
      if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
      const pts=polyPoints??[],last=pts.at(-1);
      if(pts.length>=3&&Math.hypot(p.x-pts[0].x,p.y-pts[0].y)<=grid.size*.4){finishPoly(pts);return;}
      if(!last||last.x!==p.x||last.y!==p.y)setPolyPoints([...pts,p]);
      return;
    }
    const id=uid(),type=tool==="circle"?"ellipse":tool as Exclude<Tool,"select"|"poly"|"circle">;
    const shape:MapShape={id,type,roomParts:[],hidden:false,locked:false,name:({rect:"Room",ellipse:"Round room",line:"Wall",curve:"Curved wall",path:"Freehand wall",door:"Door",window:"Window"} as Record<string,string>)[type]+" "+(before.drawing.shapes.length+1),folderId:before.drawing.folders?.some(f=>f.id===selected)&&!layerState(before.drawing,selected!).locked?selected:null,smooth:type==="path",points:type==="curve"?[p,p,p]:[p,p],fill:["rect","circle","ellipse","door","window"].includes(tool)?fill:null,stroke,thickness,closed:false};
    gesture.current={before,id,start:p,index:null,newShape:true};choose(id);setDrawingId(id);
    if(type==="door"||type==="window"){
      // Doors and windows sit in the nearest wall, a square wide, and slide along it.
      const raw=rawPoint(e),wall=nearestWall(walls(),raw,grid.size*.5);
      if(wall){shape.points=openingOnWall(wall,raw,raw,grid.size);shape.thickness=wall.thickness;shape.fill=wall.floor??before.drawing.background;gesture.current.wall=wall;gesture.current.raw=raw;setHoverWall(null);}
    }
    const next=structuredClone(before);next.drawing.layerOrder=[...layerIds(next.drawing),id];next.drawing.shapes.push(shape);current.current=next;setDraft(next);
  };
  const move=(e:React.PointerEvent<SVGSVGElement>)=>{
    const g=gesture.current;if(!g)return;const p=point(e);
    let next:Draft;
    if(g.newShape){
      next=structuredClone(current.current);const s=next.drawing.shapes.find(s=>s.id===g.id)!;
      if(g.wall&&g.raw) s.points=openingOnWall(g.wall,g.raw,rawPoint(e),grid.size);
      else if(s.type==="path") {
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
      if(g.index!==null&&s.type==="rect"){const corners=rectCorners(s);s.points=[corners[(g.index+2)%4],p];}
      else if(g.index!==null)s.points[g.index]=p;
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
    move(e);const g=gesture.current;gesture.current=null;setDrawingId(null);
    const s=current.current.drawing.shapes.find(s=>s.id===g.id)!;
    if(g.newShape && s.type==="path")s.points=simplifyPoints(s.points,3);
    const changed=JSON.stringify(g.before)!==JSON.stringify(current.current);
    if(g.newShape && s.points.every(p=>p.x===g.start.x&&p.y===g.start.y)){current.current=g.before;setDraft(g.before);setSelected(null);return;}
    if(!changed)return;
    const joined=g.newShape?joinRooms(current.current,g.id,e.altKey):{id:g.id,message:""};
    apply(current.current,g.before);
    if(joined.id!==g.id){choose(joined.id);setMessage(joined.message);}
  };
  const cancel=()=>{setDrawingId(null);if(gesture.current){current.current=gesture.current.before;setDraft(current.current);gesture.current=null;setSelected(null);}};
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
  const single=selectedShape&&selectedIds.length===1?selectedShape:null;
  // The size label follows the shape being drawn, or the one selected.
  const labelShape=(drawingId?draft.drawing.shapes.find(s=>s.id===drawingId):null)??(tool==="select"?single:null);
  const labelSize=Math.max(14,Math.min(draft.width,draft.height)/45);
  const label=labelShape&&labelShape.points.length>1?(()=>{const b=shapeBounds(labelShape),text=sizeLabel(labelShape,grid),w=text.length*labelSize*.62+labelSize,h=labelSize*1.8;
    const y=b.y-h-labelSize*.6<0?b.y+b.h+labelSize*.6:b.y-h-labelSize*.6,x=Math.max(0,Math.min(draft.width-w,b.x+b.w/2-w/2));
    return <g className="creator-size-label" pointerEvents="none"><rect x={x} y={y} width={w} height={h} rx={labelSize*.3} fill="#16191c" fillOpacity=".88"/><text x={x+w/2} y={y+h*.66} textAnchor="middle" fontSize={labelSize} fontWeight={500} fill="#ffffff">{text}</text></g>;})():null;
  const zoomBy=(step:number)=>setZoom(z=>Math.max(.5,Math.min(4,Math.round((z+step)*4)/4)));
  useEffect(()=>{
    const el=stage.current;if(!el)return;
    const wheel=(e:WheelEvent)=>{if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();zoomBy(e.deltaY<0?.25:-.25);};
    el.addEventListener("wheel",wheel,{passive:false});return()=>el.removeEventListener("wheel",wheel);
  },[]);
  useEffect(()=>{const up=(e:KeyboardEvent)=>{if(e.code==="Space")setSpaceHeld(false);};window.addEventListener("keyup",up);return()=>window.removeEventListener("keyup",up);},[]);
  const duplicate=()=>{if(!selectedIds.length)return;const ids:string[]=[];change(d=>{for(const id of selectedIds){const s=d.drawing.shapes.find(s=>s.id===id);if(!s)continue;const copy={...offsetShape(structuredClone(s),grid.size,grid.size,d.width,d.height),id:uid(),name:`${s.name||"Shape"} copy`.slice(0,120)};d.drawing.shapes.push(copy);d.drawing.layerOrder=[...layerIds(d.drawing),copy.id];ids.push(copy.id);}});setSelected(ids.at(-1)??null);setMulti(ids.slice(0,-1));};
  const merge=()=>{
    const id=uid(),merged=mergeRooms(orderedShapes(current.current.drawing).filter(s=>selectedIds.includes(s.id)),id);
    if(!merged){setMessage("Select at least two filled rooms or closed floors to merge.");return;}
    change(d=>{d.drawing.shapes=d.drawing.shapes.filter(s=>!selectedIds.includes(s.id));d.drawing.shapes.push(merged);d.drawing.layerOrder=[...layerIds(d.drawing).filter(x=>!selectedIds.includes(x)&&x!==id),id];});choose(id);setTool("select");
  };
  const opening=single?.type==="door"||single?.type==="window";
  const colours=<div className="creator-pair">
    {!opening&&<label>Floor<span className="creator-colour"><input type="color" aria-label="Floor colour" value={selectedShape?.fill??fill} onChange={e=>{setFill(e.target.value);patchShape({fill:e.target.value});}}/>{selectedShape&&<button type="button" className="creator-link" onClick={()=>patchShape({fill:selectedShape.fill?null:fill})}>{selectedShape.fill?"No floor":"Add floor"}</button>}</span></label>}
    <label>{opening?"Frame":"Walls"}<input type="color" aria-label={opening?"Frame colour":"Wall colour"} value={selectedShape?.stroke??stroke} onChange={e=>{setStroke(e.target.value);patchShape({stroke:e.target.value});}}/></label>
  </div>;
  const thicknessField=<label>Wall thickness <output>{selectedShape?.thickness??thickness} px</output><input type="range" min={1} max={60} value={selectedShape?.thickness??thickness} onChange={e=>{setThickness(+e.target.value);patchShape({thickness:+e.target.value});}}/></label>;
  const bounds=single?shapeBounds(single):null;
  const resize=(w:number,h:number)=>{if(!single||!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return;change(d=>{const s=d.drawing.shapes.find(s=>s.id===single.id);if(s)s.points=resizeShape(s,Math.min(d.width,fromUnits(w,grid)),Math.min(d.height,fromUnits(h,grid))).points;});};
  const selectedPanel=<div className="creator-panel">
    {!selectedIds.length&&<>
      <p className="creator-empty">Nothing selected. Pick a tool on the left and drag on the map, or press V and click a shape to edit it.</p>
      <h3>New shapes</h3>{colours}{thicknessField}
      <h3>Shortcuts</h3>
      <dl className="creator-keys">{creatorTools.map(t=><div key={t.id}><dt><kbd>{t.key}</kbd></dt><dd>{t.label}</dd></div>)}<div><dt><kbd>Alt</kbd></dt><dd>Draw off the grid</dd></div><div><dt><kbd>Space</kbd></dt><dd>Drag to pan</dd></div><div><dt><kbd>Ctrl</kbd> + scroll</dt><dd>Zoom</dd></div><div><dt><kbd>Ctrl</kbd> <kbd>D</kbd></dt><dd>Duplicate</dd></div></dl>
    </>}
    {single&&<>
      <label>Name<input key={single.id} maxLength={120} defaultValue={single.name} placeholder={single.type} onBlur={e=>{const name=e.target.value.trim();if(name&&name!==single.name)change(d=>{const s=d.drawing.shapes.find(s=>s.id===single.id);if(s)s.name=name;});}} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}/></label>
      {bounds&&isArea(single)&&single.type!=="merged"?<div className="creator-pair">
        <label>Width ({grid.unit})<input type="number" min={grid.units/2} step={grid.units/2} value={toUnits(bounds.w,grid)} onChange={e=>resize(+e.target.value,toUnits(bounds.h,grid))}/></label>
        <label>Length ({grid.unit})<input type="number" min={grid.units/2} step={grid.units/2} value={toUnits(bounds.h,grid)} onChange={e=>resize(toUnits(bounds.w,grid),+e.target.value)}/></label>
      </div>:<p className="creator-measure">{isArea(single)?"Size":"Length"}: <strong>{sizeLabel(single,grid)}</strong></p>}
      {colours}{thicknessField}
      {single.type==="path"&&<div className="creator-checks"><label className="creator-check"><input type="checkbox" checked={single.closed} onChange={e=>patchShape({closed:e.target.checked})}/>Close the outline</label><label className="creator-check"><input type="checkbox" checked={single.smooth} onChange={e=>patchShape({smooth:e.target.checked})}/>Smooth curve</label></div>}
      {(single.type==="path"||single.type==="line"||single.type==="rect")&&<div className="creator-points"><span>Corners ({single.type==="rect"?4:single.points.length})</span><div className="creator-seg" role="group" aria-label="Corner editing">{(["move","add","delete"] as const).map(mode=><button key={mode} aria-pressed={pointMode===mode} onClick={()=>{setTool("select");setPointMode(mode);}}>{mode==="move"?"Move":mode==="add"?"Add":"Remove"}</button>)}</div>
        <p className="muted">{pointMode==="add"?"Click a wall to add a corner there.":pointMode==="delete"?"Click a corner to remove it.":"Drag the white corners to reshape."}</p></div>}
    </>}
    {selectedIds.length>1&&<>
      <p className="creator-empty">{selectedIds.length} shapes selected. Drag any of them to move them together.</p>
      {colours}{thicknessField}
      <button onClick={merge}><Merge size={15}/> Merge into one room</button>
      <p className="muted">Rooms must touch or overlap. The walls between them disappear.</p>
    </>}
    {selectedIds.length>0&&<div className="creator-actions"><button onClick={duplicate}><Copy size={15}/> Duplicate</button><button onClick={deleteShape}><Trash2 size={15}/> Delete</button></div>}
    <label className="creator-check"><input type="checkbox" checked={addSelection} onChange={e=>{setAddSelection(e.target.checked);setTool("select");}}/>Tapping adds to the selection (for touch screens; Shift-click does the same)</label>
  </div>;
  const maxSquares=Math.floor(8000/grid.size);
  const squares=(key:"width"|"height")=><label>{key==="width"?"Width":"Length"} (squares)<input aria-label={`Map ${key} in squares`} type="number" min={3} max={maxSquares} value={Math.round(draft[key]/grid.size)} onChange={e=>{const n=Math.round(+e.target.value);if(n>=3&&n<=maxSquares)change(d=>{d[key]=n*grid.size;});}}/></label>;
  const mapPanel=<div className="creator-panel">
    <label>Open a saved map<select aria-label="Saved maps" value={source??""} onChange={e=>{const id=e.target.value;guard(()=>open(id));}}><option value="">New map</option>{workspace.scenes.filter(s=>s.drawing).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <button onClick={()=>guard(()=>open(""))}><Plus size={15}/> Start a new map</button>
    <h3>This map</h3>
    <div className="creator-pair">{squares("width")}{squares("height")}</div>
    <p className="creator-measure">{distance(draft.width,grid)} × {distance(draft.height,grid)}, in {grid.units} {grid.unit} squares of {grid.size} px, the same as its Maptable grid.</p>
    <label>Background<input type="color" value={draft.drawing.background} onChange={e=>change(d=>{d.drawing.background=e.target.value;})}/></label>
    <label className="creator-check"><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>Snap to the grid (freehand always stays smooth)</label>
    <p className="muted">Save keeps the drawing with its scene. Reopen it here any time to keep editing.</p>
  </div>;
  const tabs:[Tab,string][]=[["selected",selectedIds.length>1?`Selected (${selectedIds.length})`:"Selected"],["layers","Layers"],["map","Map"]];
  return <main className="map-creator" data-sidebars-hidden={sidebars.hidden} onKeyDown={e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();if(!pending)void save();return;}
    if(savingRef.current || pending || (e.target as HTMLElement).closest("input,select,textarea,[contenteditable=true]"))return;
    if(tool==="poly"&&polyPoints){
      if(e.key==="Enter"){e.preventDefault();finishPoly();return;}
      if(e.key==="Backspace"||e.key==="Delete"){e.preventDefault();setPolyPoints(polyPoints.length>1?polyPoints.slice(0,-1):null);return;}
      if(e.key==="Escape"){setPolyPoints(null);return;}
    }
    if(e.key==="Escape"){cancel();setSelected(null);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();history(!e.shiftKey);return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="d"){e.preventDefault();duplicate();return;}
    if(e.code==="Space"&&!(e.target as HTMLElement).closest("button")){e.preventDefault();setSpaceHeld(true);return;}
    if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.length===1){const next=toolForKey(e.key);if(next){pickTool(next);return;}}
    if((e.key==="Delete"||e.key==="Backspace") && selectedShape){e.preventDefault();e.stopPropagation();if(selectedIds.length===1&&selectedPoint!==null)removePoint(selectedShape.id,selectedPoint);else deleteShape();}
  }}>
    <header className="creator-header">
      <button className="creator-back" disabled={saving} onClick={()=>guard(()=>close())}><ArrowLeft size={16}/> Back</button>
      <h1>Map Creator</h1>
      <input className="creator-name" aria-label="Map name" maxLength={120} value={draft.name} onChange={e=>change(d=>{d.name=e.target.value||"Untitled map";})}/>
      <span className="creator-spacer"/>
      <span role="status" className="creator-status">{dirty?"Not saved yet":saveStatus}</span>
      <button className="creator-icon" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!undo.current.length} onClick={()=>history(true)}><Undo2 size={17}/></button>
      <button className="creator-icon" aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" disabled={!redo.current.length} onClick={()=>history(false)}><Redo2 size={17}/></button>
      <DesktopSidebars {...sidebars}/>
      <AppearanceMenu />
      <button disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save map"}</button>
      <button disabled={saving} className="primary" onClick={async()=>{const id=await save();if(id)close(id);}}>Save & use as scene</button>
    </header>
    <div className="creator-layout" inert={saving}>
      <nav className="creator-rail" aria-label="Drawing tools">{creatorTools.map(t=><button key={t.id} aria-pressed={tool===t.id} aria-label={`${t.label} (${t.key})`} title={`${t.label} (${t.key})`} className={tool===t.id?"active":""} onClick={()=>pickTool(t.id)}>{TOOL_ICONS[t.id]}<span>{t.key}</span></button>)}</nav>
      <div className="creator-canvas">
      <section ref={stage} className="creator-stage" aria-label="Map drawing area" data-panning={spaceHeld||undefined}
        onPointerDown={e=>{if(!spaceHeld&&e.button!==1)return;e.preventDefault();const el=stage.current!;pan.current={x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const p=pan.current;if(!p)return;const el=stage.current!;el.scrollLeft=p.left-(e.clientX-p.x);el.scrollTop=p.top-(e.clientY-p.y);}}
        onPointerUp={()=>{pan.current=null;}} onPointerCancel={()=>{pan.current=null;}}>
        <div className="creator-paper" style={{width:`${zoom*100}%`}}>
          <svg ref={svg} tabIndex={0} aria-label="Editable map drawing" viewBox={`0 0 ${draft.width} ${draft.height}`} style={{background:draft.drawing.background,touchAction:"none",width:"100%",display:"block"}} onPointerDown={start} onPointerUp={finish} onPointerCancel={cancel} onDoubleClick={()=>{if(tool==="poly"&&polyPoints&&polyPoints.length>=3)finishPoly();}}
            onPointerMove={e=>{if(!gesture.current){if(tool==="poly")setPolyHover(point(e));else if(tool==="door"||tool==="window")setHoverWall(nearestWall(walls(),rawPoint(e),grid.size*.5));}move(e);}}
            onPointerLeave={()=>{setPolyHover(null);setHoverWall(null);}}>
            <defs><pattern id="creator-grid" width={grid.size} height={grid.size} patternUnits="userSpaceOnUse"><path d={`M ${grid.size} 0 H 0 V ${grid.size}`} fill="none" stroke="#ffffff" strokeOpacity=".22" strokeWidth="1"/></pattern></defs>
            <rect width={draft.width} height={draft.height} fill="url(#creator-grid)" pointerEvents="none"/>
            {orderedShapes(draft.drawing).map(s=><DrawingShape key={s.id} shape={s} background={draft.drawing.background}/>)}
            {tool==="select" && selectedIds.length>1 && draft.drawing.shapes.filter(s=>selectedIds.includes(s.id)).map(s=><path key={s.id} d={shapePath(s)} fill="none" stroke="#2684ff" strokeWidth={3} strokeDasharray="8 6" pointerEvents="none"/>)}
            {single && tool==="select" && <g><path d={shapePath(single)} fill="none" stroke="#2684ff" strokeWidth={2} strokeDasharray="8 6" pointerEvents="none"/>{(single.type==="rect"?rectCorners(single):single.points).map((p,i)=><circle key={i} data-shape={single.id} data-point={i} cx={p.x} cy={p.y} r={9} fill={selectedPoint===i?"#ffcf60":"white"} stroke="#2684ff" strokeWidth={3} style={{cursor:"crosshair"}}/>)}</g>}
            {hoverWall&&(tool==="door"||tool==="window")&&<path d={`M ${hoverWall.a.x} ${hoverWall.a.y} L ${hoverWall.b.x} ${hoverWall.b.y}`} stroke="#2f80ed" strokeOpacity=".5" strokeWidth={hoverWall.thickness+8} strokeLinecap="round" pointerEvents="none"/>}
            {tool==="poly"&&polyPoints&&<g pointerEvents="none">
              <path d={`M ${polyPoints.map(p=>`${p.x} ${p.y}`).join(" L ")}${polyHover?` L ${polyHover.x} ${polyHover.y}`:""}`} fill={fill} fillOpacity=".55" stroke={stroke} strokeWidth={thickness} strokeLinejoin="round"/>
              {polyHover&&polyPoints.length>=2&&<path d={`M ${polyHover.x} ${polyHover.y} L ${polyPoints[0].x} ${polyPoints[0].y}`} stroke="#2684ff" strokeWidth={2} strokeDasharray="6 6"/>}
              {polyPoints.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={i===0&&polyPoints.length>=3?13:8} fill="#ffffff" stroke="#2684ff" strokeWidth={3}/>)}
            </g>}
            {label}
          </svg>
        </div>
      </section>
      {(tool==="poly"||tool==="door"||tool==="window")&&<div className="creator-overlay creator-tool-hint" role="status">{tool==="poly"?(polyPoints?.length?(polyPoints.length>=3?"Click the first corner, double-click or press Enter to close the room. Backspace takes back a corner.":"Keep clicking to add corners."):"Click to place each corner of the room."):"Point at a wall: the door sits in it, one square wide. Drag along the wall to make it wider."}</div>}
      <div className="creator-overlay creator-grid-status"><Grid3x3 size={15}/> {grid.units} {grid.unit} squares, same as Maptable<span/><button className="creator-link" aria-pressed={snap} onClick={()=>setSnap(v=>!v)}><Magnet size={15}/> Snap {snap?"on":"off"}</button>{snap&&<span className="muted">Hold Alt to draw freely</span>}</div>
      <div className="creator-overlay creator-zoom"><button aria-label="Zoom out" onClick={()=>zoomBy(-.25)}><Minus size={16}/></button><output aria-label="Zoom">{Math.round(zoom*100)}%</output><button aria-label="Zoom in" onClick={()=>zoomBy(.25)}><Plus size={16}/></button><button onClick={()=>setZoom(1)}>Fit</button></div>
      </div>
      <ResizableSidebar className="creator-layer-panel creator-inspector" storageKey="map-creator-layers" defaultWidth={310} edge="left">
        <div className="creator-tabs" role="tablist" aria-label="Inspector">{tabs.map(([id,name])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{name}</button>)}</div>
        {tab==="selected"?selectedPanel:tab==="map"?mapPanel:<DrawingLayers drawing={draft.drawing} selected={selected} selectedIds={selectedIds} select={(id,add)=>{setTool("select");choose(id,!!add||addSelection);}} change={fn=>change(d=>fn(d.drawing))}/>}
      </ResizableSidebar>
    </div>
    {message && <div className="creator-message" role="status">{message}</div>}
    {pending && <div className="creator-prompt" role="dialog" aria-modal="true" aria-label="Uncommitted drawing"><div><h2>Keep your drawing?</h2><p>Save your changes before leaving this map.</p><div className="button-row"><button disabled={saving} onClick={async()=>{const action=pending;if(await save()){setPending(null);action();}}}>Save changes</button><button disabled={saving} onClick={()=>{const action=pending;setPending(null);action();}}>Discard changes</button><button disabled={saving} onClick={()=>setPending(null)}>Keep editing</button></div></div></div>}
  </main>;
}
