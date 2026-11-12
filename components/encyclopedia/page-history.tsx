"use client";
import {useEffect,useState} from "react";
import {History,X,RotateCcw} from "lucide-react";
import {lineDiff,type PageVersion} from "@/lib/encyclopedia/history";
import type {Entry} from "@/lib/encyclopedia/world-model";

const when=(iso:string)=>{const d=new Date(iso);if(Number.isNaN(d.getTime()))return "Earlier";const today=new Date();const time=d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
 if(d.toDateString()===today.toDateString())return `Today, ${time}`;const y=new Date(today);y.setDate(today.getDate()-1);if(d.toDateString()===y.toDateString())return `Yesterday, ${time}`;
 return `${d.toLocaleDateString([], {month:"short",day:"numeric",...(d.getFullYear()!==today.getFullYear()?{year:"numeric"}:{})})}, ${time}`;};
const words=(s:string)=>s.trim()?s.trim().split(/\s+/).length:0;
function summary(v:PageVersion,next:Pick<PageVersion,"title"|"body"|"tabs">){
 const parts:string[]=[];if(v.title!==next.title)parts.push(`Titled “${v.title}”`);
 const dw=words(next.body)-words(v.body);if(dw)parts.push(`${dw>0?"+":"−"}${Math.abs(dw)} words after this`);
 const dt=(next.tabs?.length??0)-v.tabs.length;if(dt)parts.push(`${dt>0?"+":"−"}${Math.abs(dt)} tab${Math.abs(dt)===1?"":"s"} after this`);
 return parts.join(" · ")||"Small edits after this";}

/** The list of earlier versions of one entry. The parent shows the selected version's changes and restores it. */
export function PageHistory({entry,selected,onSelect,onRestore,onClose}:{entry:Entry;selected:PageVersion|null;onSelect:(v:PageVersion|null)=>void;onRestore:(v:PageVersion)=>Promise<void>;onClose:()=>void}){
 const [versions,setVersions]=useState<PageVersion[]|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{const controller=new AbortController();
  fetch(`/api/encyclopedia/history?entry=${encodeURIComponent(entry.id)}`,{signal:controller.signal}).then(async r=>{const v=await r.json() as {versions?:PageVersion[];error?:string};if(!r.ok)throw new Error(v.error??"Could not load page history.");setVersions([...(v.versions??[])].reverse());})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load page history.");});
  return()=>controller.abort();},[entry.id]);
 const current={title:entry.title,body:entry.body,tabs:entry.tabs??[]};
 return <aside className="history-drawer" aria-label="Page history">
  <header><h2><History size={15}/> Page history</h2><button className="icon-button" aria-label="Close page history" onClick={onClose}><X size={16}/></button></header>
  <div className="history-list">
   <button className={`history-row ${!selected?"on":""}`} onClick={()=>onSelect(null)}><strong>Current version<small>Now</small></strong><span>{when(entry.updatedAt)}</span></button>
   {error?<p className="info-note" role="alert">{error}</p>:!versions?<p className="muted history-note">Loading…</p>:!versions.length?<p className="muted history-note">No earlier versions yet. A version is kept when you change this page, at most one every 10 minutes, and the last 20 are kept.</p>:
    versions.map((v,i)=><button key={v.savedAt+i} className={`history-row ${selected===v?"on":""}`} onClick={()=>onSelect(v)}><strong>{when(v.at)}</strong><span>{summary(v,i===0?current:versions[i-1])}</span></button>)}
  </div>
  {selected&&<footer><p>Showing what restoring this version would change. Your current text is kept as a version first, so you can undo it.</p><div className="button-row"><button className="button primary" disabled={busy} onClick={async()=>{setBusy(true);try{await onRestore(selected);}finally{setBusy(false);}}}><RotateCcw size={14}/> Restore this version</button><button className="button" onClick={()=>void navigator.clipboard.writeText(selected.body)}>Copy text</button></div></footer>}
 </aside>;
}

/** Lines the version has that the current text doesn't are marked as coming back; current lines it lacks are struck. */
export function VersionDiff({current,version}:{current:Pick<PageVersion,"title"|"body"|"tabs">;version:PageVersion}){
 const diff=lineDiff(current.body,version.body),tabsNow=current.tabs.map(t=>t.title).join(", "),tabsThen=version.tabs.map(t=>t.title).join(", ");
 return <div className="version-diff">
  <p className="version-legend"><span className="diff-add">Comes back</span><span className="diff-remove">Goes away</span>{version.title!==current.title&&<span>Title becomes “{version.title}”</span>}{tabsNow!==tabsThen&&<span>Tabs become: {tabsThen||"none"}</span>}</p>
  {diff.every(d=>d.kind==="same")&&<p className="muted">The overview text is the same.</p>}
  <div className="diff-lines">{diff.map((d,i)=>d.text.trim()?<p key={i} className={`diff-${d.kind}`}>{d.text}</p>:<div key={i} className="paragraph-gap"/>)}</div>
 </div>;
}
