"use client";
import {useEffect,useMemo,useRef,useState,type ComponentType,type KeyboardEvent} from "react";
import {Search,Plus,LayoutDashboard,Users,Map as MapIcon,CalendarDays,ArrowUpRight} from "lucide-react";
import {searchableText,type Entry} from "@/lib/encyclopedia/world-model";

type Item={key:string;label:string;detail?:string;icon:ComponentType<{size?:number}>;run:(newTab:boolean)=>void};
type Props={entries:Entry[];icons:Record<Entry["kind"],ComponentType<{size?:number}>>;labels:Record<Entry["kind"],string>;scopeName:(e:Entry)=>string;canCreate:boolean;
 onOpen:(id:string)=>void;onCreate:(title:string)=>void;onView:(view:"dashboard"|"characters"|"maps"|"calendar")=>void;onClose:()=>void};

/** Ranks entries: title starts with the query, then a word in the title does, then the title contains it, then any text does. */
export function rankEntries(entries:Entry[],query:string,limit=8){
 const q=query.trim().toLowerCase();
 if(!q)return entries.filter(e=>e.kind!=="folder").sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,limit);
 const score=(e:Entry)=>{const t=e.title.toLowerCase();return t===q?0:t.startsWith(q)?1:t.split(/[\s\-_/]+/).some(w=>w.startsWith(q))?2:t.includes(q)?3:searchableText(e).toLowerCase().includes(q)?4:9;};
 return entries.map(e=>({e,s:score(e)})).filter(x=>x.s<9).sort((a,b)=>a.s-b.s||a.e.title.localeCompare(b.e.title)).slice(0,limit).map(x=>x.e);
}

export function QuickSearch({entries,icons,labels,scopeName,canCreate,onOpen,onCreate,onView,onClose}:Props){
 const [query,setQuery]=useState(""),[active,setActive]=useState(0);
 const ref=useRef<HTMLDialogElement>(null),list=useRef<HTMLDivElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 const found=useMemo(()=>rankEntries(entries,query),[entries,query]);
 const name=query.trim();
 const exact=found.some(e=>e.title.toLowerCase()===name.toLowerCase());
 const go=(fn:()=>void)=>()=>{fn();onClose();};
 const results:Item[]=found.map(e=>({key:e.id,label:e.title,detail:`${labels[e.kind]} · ${scopeName(e)}`,icon:icons[e.kind],run:go(()=>onOpen(e.id))}));
 const actions:Item[]=[
  ...(name&&!exact&&canCreate?[{key:"create",label:`Create “${name.slice(0,160)}” as a new entry`,icon:Plus,run:go(()=>onCreate(name.slice(0,160)))}]:[]),
  ...([["dashboard","Go to Dashboard",LayoutDashboard],["characters","Go to Characters",Users],["maps","Go to Maps",MapIcon],["calendar","Go to Calendar",CalendarDays]] as const)
    .filter(([,label])=>!name||label.toLowerCase().includes(name.toLowerCase()))
    .map(([view,label,icon])=>({key:view,label,icon,run:go(()=>onView(view))})),
  ...(!name||"open maptable".includes(name.toLowerCase())?[{key:"maptable",label:"Open Maptable",icon:ArrowUpRight,run:(newTab:boolean)=>{if(newTab)window.open("/maptable","_blank","noopener");else window.location.assign("/maptable");onClose();}}]:[]),
 ];
 const all=[...results,...actions],current=Math.min(active,Math.max(all.length-1,0));
 useEffect(()=>{list.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({block:"nearest"});},[current]);
 function key(e:KeyboardEvent){
  if(e.key==="ArrowDown"){e.preventDefault();setActive((current+1)%Math.max(all.length,1));}
  else if(e.key==="ArrowUp"){e.preventDefault();setActive((current-1+all.length)%Math.max(all.length,1));}
  else if(e.key==="Enter"&&all[current]){e.preventDefault();all[current].run(e.ctrlKey||e.metaKey);}
 }
 const row=(item:Item,index:number)=>{const Icon=item.icon;return <button type="button" role="option" aria-selected={index===current} data-index={index} key={item.key} className="quick-row" onMouseMove={()=>setActive(index)} onClick={e=>item.run(e.ctrlKey||e.metaKey)}><Icon size={16}/><span><strong>{item.label}</strong>{item.detail&&<small>{item.detail}</small>}</span>{index===current&&<kbd>Enter</kbd>}</button>;};
 return <dialog ref={ref} className="quick-search" aria-label="Quick search" onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}>
  <div className="quick-input"><Search size={17}/><input autoFocus value={query} onChange={e=>{setQuery(e.target.value);setActive(0);}} onKeyDown={key} placeholder="Jump to an entry, or type a new name…" aria-label="Search entries" aria-controls="quick-results" role="combobox" aria-expanded="true"/><kbd>Esc</kbd></div>
  <div className="quick-results" id="quick-results" role="listbox" ref={list}>
   {results.length>0&&<div className="quick-group"><span className="eyebrow">{name?"Entries":"Recently edited"}</span>{results.map(row)}</div>}
   {name&&!results.length&&<p className="quick-empty">No entries match “{name}”.</p>}
   {actions.length>0&&<div className="quick-group"><span className="eyebrow">Actions</span>{actions.map((a,i)=>row(a,results.length+i))}</div>}
  </div>
  <div className="quick-foot"><span>↑ ↓ to move</span><span>Enter to open</span><span>Esc to close</span></div>
 </dialog>;
}
