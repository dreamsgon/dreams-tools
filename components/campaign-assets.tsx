"use client";
import { uiZoom } from "@/lib/appearance";
import { useEffect, useRef, useState } from "react";
import {GripVertical,Folder,FolderPlus,ChevronRight,ChevronDown,Image as ImageIcon,UserRound} from "lucide-react";
import { uid, isTokenBorder, canMoveCollection, collectionPath, moveAssetToCampaign, moveLibraryTokenToCampaign, type Workspace } from "@/lib/model";
import { uploadAsset } from "@/lib/api";
import { useFolderExpansion } from "./folder-expansion";
import "./asset-gallery.css";
export default function CampaignAssets({workspace:w,campaignId,commit}: {
  workspace:Workspace; campaignId:string|null; commit:(fn:(w:Workspace)=>void)=>void;
}) {
  const [filter,setFilter]=useState("current");
  const [assetType,setAssetType]=useState("all"),[uploading,setUploading]=useState(false),[uploadError,setUploadError]=useState("");
  const borderUpload=useRef<HTMLInputElement>(null);
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState<string|null>(null);
  const [closed,setClosed]=useFolderExpansion("assets");
  const [location,setLocation]=useState<string|null>(null),[creating,setCreating]=useState(false),[name,setName]=useState("");
  type DragItem={id:string;name:string;kind:"folder"|"asset"|"token"};
  const drag=useRef<{item:DragItem;x:number;y:number;px:number;py:number;active:boolean;host:HTMLElement|null;target:string|null|undefined;since:number}|null>(null);
  const ghost=useRef<HTMLDivElement>(null);
  const [moving,setMoving]=useState<DragItem|null>(null),[over,setOver]=useState<string|null|undefined>(undefined),[message,setMessage]=useState("");
  const reset=()=>{drag.current=null;setMoving(null);setOver(undefined);};
  const accepts=(item:DragItem,target:string|null)=>{
    if(target!==null&&!w.assetFolders.some(f=>f.id===target))return false;
    if(item.kind==="folder")return w.assetFolders.find(f=>f.id===item.id)?.parentId!==target&&canMoveCollection(w.assetFolders,item.id,target);
    return ((item.kind==="asset"?w.assetLocations:w.libraryLocations)[item.id]??null)!==target;
  };
  const targetAt=(item:DragItem,x:number,y:number)=>{
    const value=document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-asset-drop]")?.dataset.assetDrop;
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
      const target=targetAt(d.item,d.px,d.py);
      if(target!==d.target){d.target=target;d.since=now;setOver(target);}
      if(target&&now-d.since>650)setClosed(old=>{if(!old.has(target))return old;const next=new Set(old);next.delete(target);return next;});
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener("keydown",cancel);};
  },[moving,w]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(""),4000);return()=>clearTimeout(timer);},[message]);
  const dropProps=(id:string|null)=>({"data-asset-drop":id??"root","data-drop-state":moving&&over===id?"ready":undefined});
  const grip=(item:DragItem)=><button className="organizer-grip" aria-label={`Drag ${item.name}${item.kind==="token"?" token":""}`} title="Drag into a folder or Assets root" onClick={e=>e.stopPropagation()}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={item,x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY,active:false,host:e.currentTarget.closest<HTMLElement>(".panel-content"),target:undefined,since:0};}}
    onPointerMove={e=>{const d=drag.current;if(!d)return;d.px=e.clientX;d.py=e.clientY;if(!d.active&&Math.hypot(d.px-d.x,d.py-d.y)>=6){d.active=true;setMoving(d.item);setMessage("");}}}
    onPointerUp={e=>{const d=drag.current;const target=d?.active?targetAt(d.item,e.clientX,e.clientY):undefined;
      if(d?.active&&target!==undefined){commit(next=>{if(d.item.kind==="folder")next.assetFolders.find(f=>f.id===d.item.id)!.parentId=target;else (d.item.kind==="asset"?next.assetLocations:next.libraryLocations)[d.item.id]=target;});if(target)setClosed(old=>{const next=new Set(old);next.delete(target);return next;});setMessage(`Moved ${d.item.name} to ${path(target)}. Undo restores the move.`);}
      else if(d?.active)setMessage("Not moved. Drop onto a folder or Assets root.");
      reset();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    }} onPointerCancel={reset} onLostPointerCapture={reset}><GripVertical size={16}/></button>;
  const current=w.assetFolders.find(f=>f.id===location);
  const selectedFolder=current?.id??null;
  const path=(id:string|null)=>id?collectionPath(w.assetFolders,id):"Assets root";
  const folderOptions=(exclude?:string)=><><option value="">Assets root</option>{w.assetFolders.filter(f=>!exclude||canMoveCollection(w.assetFolders,exclude,f.id)).map(f=><option key={f.id} value={f.id}>{path(f.id)}</option>)}</>;
  const folderSelect=(id:string,name:string,token=false)=><label>Folder<select aria-label={`Folder for ${name}`} value={(token?w.libraryLocations[id]:w.assetLocations[id])??""} onChange={e=>commit(next=>{(token?next.libraryLocations:next.assetLocations)[id]=e.target.value||null;})}>{folderOptions()}</select></label>;
  const tree=(parentId:string|null):React.ReactNode=>w.assetFolders.filter(f=>f.parentId===parentId).map(f=><div key={f.id} className="asset-folder-branch"><div {...dropProps(f.id)} className={"organizer-row "+(selectedFolder===f.id?"active":"")} data-dragging={moving?.id===f.id||undefined}>{grip({id:f.id,name:f.name,kind:"folder"})}<button aria-label={`${closed.has(f.id)?"Expand":"Collapse"} ${f.name}`} aria-expanded={!closed.has(f.id)} onClick={()=>setClosed(old=>{const next=new Set(old);if(next.has(f.id))next.delete(f.id);else next.add(f.id);return next;})}>{closed.has(f.id)?<ChevronRight size={15}/>:<ChevronDown size={15}/>}</button><button onClick={()=>{setLocation(f.id);setSelected(null);}}><Folder size={16}/><span>{f.name}</span></button></div>{!closed.has(f.id)&&<div className="organizer-children">{tree(f.id)}</div>}</div>);
  const campaigns=w.collections.filter((c)=>c.kind==="campaign");
  const visible=(name:string, owner:string|null|undefined)=>name.toLowerCase().includes(search.toLowerCase()) &&
    (filter==="all" || filter==="shared" ? filter==="all" || !owner : !owner || owner===campaignId);
  const destination=(value:string|null|undefined, name:string, move:(id:string|null)=>void)=><label>Move {name} to<select aria-label={`Move ${name} to campaign`} value={value??""} onChange={(e)=>move(e.target.value||null)}>
    <option value="">Shared across campaigns</option>
    {campaigns.map((c)=><option key={c.id} value={c.id}>{collectionPath(w.collections,c.id)}</option>)}
  </select></label>;
  const assets=w.assets.filter((a)=>visible(a.name,w.assetCampaigns[a.id])&&(assetType==="all"||(assetType==="border")===isTokenBorder(w,a.id))&&(search.trim()||(w.assetLocations[a.id]??null)===selectedFolder));
  const tokens=w.tokenLibrary.filter((t)=>visible(t.name,w.libraryCampaigns[t.id])&&(search.trim()||(w.libraryLocations[t.id]??null)===selectedFolder));
  return <section className="campaign-assets">
    {moving&&<div ref={ghost} className="organizer-drag-ghost" aria-hidden="true"><GripVertical size={16}/>{moving.name}</div>}
    <p className="asset-drag-status" role="status">{moving?`Moving ${moving.name} - ${over!==undefined?"release to move here":"choose a folder"}. Escape cancels.`:message||"Drag handles to move items into folders or back to Assets root."}</p>
    <input aria-label="Search assets" placeholder="Search all folders…" value={search} onChange={(e)=>setSearch(e.target.value)}/>
    <label>Asset type<select value={assetType} onChange={e=>setAssetType(e.target.value)}><option value="all">All assets</option><option value="border">Custom borders</option><option value="image">Images</option></select></label>
    <button disabled={uploading} onClick={()=>borderUpload.current?.click()}>{uploading?"Uploading border…":"Upload custom border"}</button>
    <input ref={borderUpload} type="file" accept="image/png,image/webp" hidden onChange={async e=>{
      const file=e.target.files?.[0];e.target.value="";if(!file)return;
      const folder=selectedFolder, owner=campaignId;
      setUploading(true);setUploadError("");
      try {
        if(file.size>20*1024*1024)throw new Error("Choose an image smaller than 20 MB.");
        const bitmap=await createImageBitmap(file);const width=bitmap.width,height=bitmap.height;bitmap.close();
        if(width>16000||height>16000)throw new Error("Image dimensions must be at most 16,000 pixels.");
        const result=await uploadAsset(file,file.name),id=uid();
        commit(next=>{next.assets.push({id,name:file.name,src:result.src,width,height,kind:"border"});next.assetLocations[id]=next.assetFolders.some(f=>f.id===folder)?folder:null;next.assetCampaigns[id]=owner;});
        setAssetType("border");setFilter("current");setLocation(folder);setSearch("");setSelected(id);setMessage("Border saved. Choose it from Border from Assets in any token’s options.");
      }catch(err){setUploadError(err instanceof Error?err.message:"Upload failed.");}finally{setUploading(false);}
    }}/>
    {uploadError&&<p role="alert">{uploadError}</p>}
    <label>Library<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="current">This campaign + shared</option><option value="all">All campaigns</option><option value="shared">Shared only</option></select></label>
    <section aria-label="Asset folders" className="organizer">
      <div className="asset-folder-toolbar"><button {...dropProps(null)} className="scene-root-link" onClick={()=>{setLocation(null);setSelected(null);setSearch("");}}><Folder size={16}/>Assets root</button>
      <button title="Create a folder at the root" onClick={()=>{setCreating(true);setName("");}}><FolderPlus size={16}/>New folder</button></div>
      {creating&&<form className="organizer-editor" onSubmit={e=>{e.preventDefault();if(!name.trim())return;const id=uid();commit(next=>next.assetFolders.push({id,name:name.trim(),kind:"folder",parentId:null}));setLocation(id);setCreating(false);setName("");}}>
        <label>Folder name<input autoFocus required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
        <div className="button-row"><button disabled={!name.trim()}>Create folder</button><button type="button" onClick={()=>setCreating(false)}>Cancel</button></div>
      </form>}
      {tree(null)}
      {current&&<details key={current.id} className="asset-folder-settings"><summary>Folder settings</summary><div className="organizer-editor">
        <label>Folder name<input key={current.id+current.name} maxLength={120} defaultValue={current.name} onBlur={e=>{const name=e.target.value.trim();if(name&&name!==current.name)commit(next=>{next.assetFolders.find(f=>f.id===current.id)!.name=name;});else e.target.value=current.name;}}/></label>
        <label>Move folder to<select value={current.parentId??""} onChange={e=>{const parent=e.target.value||null;if(canMoveCollection(w.assetFolders,current.id,parent))commit(next=>{next.assetFolders.find(f=>f.id===current.id)!.parentId=parent;});}}>{folderOptions(current.id)}</select></label>
        <button onClick={()=>{commit(next=>{next.assetFolders=next.assetFolders.filter(f=>f.id!==current.id);next.assetFolders.forEach(f=>{if(f.parentId===current.id)f.parentId=current.parentId;});for(const locations of [next.assetLocations,next.libraryLocations])for(const id in locations)if(locations[id]===current.id)locations[id]=current.parentId;});setLocation(current.parentId);}}>Remove folder, keep contents</button>
      </div></details>}
      <p className="muted">Viewing: {path(selectedFolder)}</p>
    </section>
    {search.trim()&&<p className="muted">Results across all folders</p>}
    <h3 className="asset-section-title"><ImageIcon size={16}/>{assetType==="border"?"Custom borders":"Images & borders"} <span>{assets.length}</span></h3>
    <div className="asset-gallery">{assets.map((a)=><div className={"asset-gallery-card "+(selected===a.id?"is-selected":"")} key={a.id} data-dragging={moving?.id===a.id||undefined}>
      <div className="asset-gallery-preview"><img src={a.src} alt={a.name} loading="lazy"/>{grip({id:a.id,name:a.name,kind:"asset"})}</div>
      <div className="asset-gallery-caption"><strong title={a.name}>{a.name}</strong><small>{isTokenBorder(w,a.id)?"Custom border":"Image"} · {a.width} × {a.height}</small>{search.trim()&&<small>{path(w.assetLocations[a.id]??null)}</small>}<button aria-label={`Edit ${a.name}`} aria-expanded={selected===a.id} onClick={()=>setSelected(selected===a.id?null:a.id)}>{selected===a.id?"Close details":"Edit details"}<ChevronRight size={14}/></button></div>
      {selected===a.id&&<div className="asset-item-details">
      <label>Name<input aria-label="Asset name" maxLength={120} value={a.name} onChange={e=>commit(next=>{next.assets.find(item=>item.id===a.id)!.name=e.target.value;})}/></label>
      <label>Asset type<select value={isTokenBorder(w,a.id)?"border":"image"} onChange={e=>commit(next=>{next.assets.find(item=>item.id===a.id)!.kind=e.target.value as "border"|"image";})}><option value="image">Image</option><option value="border">Custom border</option></select></label>
      {isTokenBorder(w,a.id)&&<small>Available in token options under Border from Assets.</small>}
      {folderSelect(a.id,a.name)}
      {destination(w.assetCampaigns[a.id],a.name,(id)=>commit((next)=>moveAssetToCampaign(next,a.id,id)))}</div>}
    </div>)}</div>
    {!assets.length && <p className="muted">{assetType==="border"?"No custom borders here yet. Upload one to reuse across your tokens.":"No matching images."}</p>}
    {assetType==="all"&&<><h3 className="asset-section-title"><UserRound size={16}/>Saved tokens <span>{tokens.length}</span></h3>
    <div className="asset-gallery">{tokens.map((t)=>{const image=w.assets.find(a=>a.id===t.assetId);return <div className={"asset-gallery-card "+(selected===t.id?"is-selected":"")} key={t.id} data-dragging={moving?.id===t.id||undefined}>
      <div className="asset-gallery-preview asset-gallery-token">{image?<img src={image.src} alt={t.name} loading="lazy"/>:<UserRound size={40} style={{color:t.color}}/>}{grip({id:t.id,name:t.name,kind:"token"})}</div>
      <div className="asset-gallery-caption"><strong title={t.name}>{t.name}</strong><small>Token preset</small>{search.trim()&&<small>{path(w.libraryLocations[t.id]??null)}</small>}<button aria-label={`Edit ${t.name} token`} aria-expanded={selected===t.id} onClick={()=>setSelected(selected===t.id?null:t.id)}>{selected===t.id?"Close details":"Edit details"}<ChevronRight size={14}/></button></div>
      {selected===t.id&&<div className="asset-item-details">{folderSelect(t.id,`${t.name} token`,true)}
      {destination(w.libraryCampaigns[t.id],`${t.name} token`,(id)=>commit((next)=>moveLibraryTokenToCampaign(next,t.id,id)))}</div>}
    </div>;})}</div>
    {!tokens.length && <p className="muted">No matching saved tokens.</p>}</>}
    <p className="muted">Use Undo to reverse a move.</p>
  </section>;
}
