"use client";
import {useEffect,useMemo,useRef,useState,type ComponentType,type KeyboardEvent} from "react";
import {Search,Plus,LayoutDashboard,Users,Map as MapIcon,CalendarDays,ArrowUpRight,Flag,Hash,X} from "lucide-react";
import {loadTags,TagList,useTags} from "../tags";
import {parseTagQuery,partialTag,suggestTags,tagsOn,targetKey,type Tag,type TaggedItem,type TargetKind} from "@/lib/tags";
import {searchableText,type Entry} from "@/lib/encyclopedia/world-model";

type Item={key:string;label:string;detail?:string;icon:ComponentType<{size?:number}>;tags?:Tag[];run:(newTab:boolean)=>void};
type Props={entries:Entry[];icons:Record<Entry["kind"],ComponentType<{size?:number}>>;labels:Record<Entry["kind"],string>;scopeName:(e:Entry)=>string;canCreate:boolean;
 onOpen:(id:string)=>void;onCreate:(title:string)=>void;onView:(view:"dashboard"|"characters"|"maps"|"calendar")=>void;onClose:()=>void;
 /** Tags to filter by when it opens, from clicking a tag. */
 initialTags?:string[];onManageTags?:()=>void};

/** Ranks entries: title starts with the query, then a word in the title does, then the title contains it, then any text does. */
export function rankEntries(entries:Entry[],query:string,limit=8){
 const q=query.trim().toLowerCase();
 if(!q)return entries.filter(e=>e.kind!=="folder").sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,limit);
 const score=(e:Entry)=>{const t=e.title.toLowerCase();return t===q?0:t.startsWith(q)?1:t.split(/[\s\-_/]+/).some(w=>w.startsWith(q))?2:t.includes(q)?3:searchableText(e).toLowerCase().includes(q)?4:9;};
 return entries.map(e=>({e,s:score(e)})).filter(x=>x.s<9).sort((a,b)=>a.s-b.s||a.e.title.localeCompare(b.e.title)).slice(0,limit).map(x=>x.e);
}

const SCOPES:[("all"|TargetKind),string][]=[["all","Everything"],["entry","Pages"],["scene","Maps & scenes"],["campaign","Campaigns"]];

/** Everything tagged with all of the chosen tags, narrowed by kind and by the words typed. */
export function taggedResults(items:TaggedItem[],tagIds:string[],scope:"all"|TargetKind,words:string){
 const q=words.trim().toLowerCase();
 return items.filter(it=>tagIds.every(t=>it.tagIds.includes(t))&&(scope==="all"||it.kind===scope)&&(!q||it.title.toLowerCase().includes(q)));
}

export function QuickSearch({entries,icons,labels,scopeName,canCreate,onOpen,onCreate,onView,onClose,initialTags=[],onManageTags}:Props){
 const [query,setQuery]=useState(""),[active,setActive]=useState(0);
 const [tagIds,setTagIds]=useState<string[]>(initialTags),[scope,setScope]=useState<"all"|TargetKind>("all");
 const {library,items}=useTags();
 const ref=useRef<HTMLDialogElement>(null),list=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 useEffect(()=>{ref.current?.showModal();void loadTags(true);},[]);
 const partial=library?.tags.length?partialTag(query):null;
 const words=parseTagQuery(query).words;
 const chosen=library?tagIds.flatMap(id=>library.tags.find(t=>t.id===id)??[]):[];
 const filtering=chosen.length>0;
 const found=useMemo(()=>filtering?[]:rankEntries(entries,words),[entries,words,filtering]);
 const tagged=useMemo(()=>filtering&&items?taggedResults(items,chosen.map(t=>t.id),scope,words):[],[filtering,items,chosen,scope,words]);
 const name=words.trim();
 const exact=found.some(e=>e.title.toLowerCase()===name.toLowerCase());
 const go=(fn:()=>void)=>()=>{fn();onClose();};
 const visit=(href:string,newTab:boolean)=>{if(newTab)window.open(href,"_blank","noopener");else window.location.assign(href);onClose();};
 const addTag=(t:Tag)=>{setTagIds(ids=>ids.includes(t.id)?ids:[...ids,t.id]);setQuery(q=>q.replace(/(^|\s)#[^\s#]*$/,"$1").trimStart());setActive(0);input.current?.focus();};
 const suggestions:Item[]=partial===null||!library?[]:suggestTags(library,partial,6).filter(t=>!tagIds.includes(t.id)).map(t=>({key:"tag-"+t.id,label:`#${t.name}`,detail:"Filter by this tag",icon:Hash,tags:[t],run:()=>addTag(t)}));
 const kindIcon=(it:TaggedItem)=>it.kind==="scene"?MapIcon:it.kind==="campaign"?Flag:icons[(it.entryKind??"note") as Entry["kind"]]??icons.note;
 const byId=new Map((library?.tags??[]).map(t=>[t.id,t]));
 const results:Item[]=filtering
  ?tagged.map(it=>({key:it.key,label:it.title,detail:it.detail,icon:kindIcon(it),tags:it.tagIds.flatMap(id=>byId.get(id)??[]),run:(newTab:boolean)=>{const id=it.kind==="entry"?it.key.slice(6):null;if(id&&!newTab&&entries.some(e=>e.id===id)){onOpen(id);onClose();}else visit(it.href,newTab);}}))
  :found.map(e=>({key:e.id,label:e.title,detail:`${labels[e.kind]} · ${scopeName(e)}`,icon:icons[e.kind],tags:library?tagsOn(library,targetKey("entry",e.id)):[],run:go(()=>onOpen(e.id))}));
 const actions:Item[]=filtering||partial!==null?[]:[
  ...(name&&!exact&&canCreate?[{key:"create",label:`Create “${name.slice(0,160)}” as a new entry`,icon:Plus,run:go(()=>onCreate(name.slice(0,160)))}]:[]),
  ...([["dashboard","Go to Dashboard",LayoutDashboard],["characters","Go to Characters",Users],["maps","Go to Maps",MapIcon],["calendar","Go to Calendar",CalendarDays]] as const)
    .filter(([,label])=>!name||label.toLowerCase().includes(name.toLowerCase()))
    .map(([view,label,icon])=>({key:view,label,icon,run:go(()=>onView(view))})),
  ...(!name||"open maptable".includes(name.toLowerCase())?[{key:"maptable",label:"Open Maptable",icon:ArrowUpRight,run:(newTab:boolean)=>visit("/maptable",newTab)}]:[]),
 ];
 const all=[...suggestions,...results,...actions],current=Math.min(active,Math.max(all.length-1,0));
 useEffect(()=>{list.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({block:"nearest"});},[current]);
 function key(e:KeyboardEvent){
  if(e.key==="ArrowDown"){e.preventDefault();setActive((current+1)%Math.max(all.length,1));}
  else if(e.key==="ArrowUp"){e.preventDefault();setActive((current-1+all.length)%Math.max(all.length,1));}
  else if(e.key==="Enter"&&all[current]){e.preventDefault();all[current].run(e.ctrlKey||e.metaKey);}
  else if(e.key==="Backspace"&&!query&&tagIds.length){e.preventDefault();setTagIds(ids=>ids.slice(0,-1));}
 }
 const row=(item:Item,index:number)=>{const Icon=item.icon;return <button type="button" role="option" aria-selected={index===current} data-index={index} key={item.key} className="quick-row" onMouseMove={()=>setActive(index)} onClick={e=>item.run(e.ctrlKey||e.metaKey)}><Icon size={16}/><span><strong>{item.label}</strong>{item.detail&&<small>{item.detail}</small>}</span>{item.tags?.length?<TagList tags={item.tags} max={3}/>:index===current?<kbd>Enter</kbd>:<span/>}</button>;};
 return <dialog ref={ref} className="quick-search" aria-label="Quick search" onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}>
  <div className="quick-input"><Search size={17}/>
   {chosen.map(t=><span key={t.id} className={`tag-chip tag-${t.color}`}><span className="tag-chip-name"><i aria-hidden="true"/>{t.name}</span><button type="button" className="tag-chip-remove" aria-label={`Stop filtering by ${t.name}`} onClick={()=>{setTagIds(ids=>ids.filter(i=>i!==t.id));input.current?.focus();}}><X size={11}/></button></span>)}
   <input ref={input} autoFocus value={query} onChange={e=>{setQuery(e.target.value);setActive(0);}} onKeyDown={key} placeholder={filtering?"Add words or another #tag":"Jump to an entry, or type # for a tag…"} aria-label="Search entries" aria-controls="quick-results" role="combobox" aria-expanded="true"/><kbd>Esc</kbd></div>
  {filtering&&<div className="quick-scopes" role="group" aria-label="Show">{SCOPES.map(([id,label])=><button type="button" key={id} aria-pressed={scope===id} onClick={()=>{setScope(id);setActive(0);input.current?.focus();}}>{label}</button>)}<span>{items?`${tagged.length} result${tagged.length===1?"":"s"}`:"Loading…"}</span></div>}
  <div className="quick-results" id="quick-results" role="listbox" ref={list}>
   {suggestions.length>0&&<div className="quick-group"><span className="eyebrow">Tags</span>{suggestions.map(row)}</div>}
   {partial!==null&&!suggestions.length&&<p className="quick-empty">No tags match “{partial}”.</p>}
   {results.length>0&&<div className="quick-group">{!filtering&&<span className="eyebrow">{name?"Entries":"Recently edited"}</span>}{results.map((r,i)=>row(r,suggestions.length+i))}</div>}
   {name&&!filtering&&partial===null&&!results.length&&<p className="quick-empty">No entries match “{name}”.</p>}
   {filtering&&items&&!results.length&&<p className="quick-empty">Nothing{scope==="all"?"":" of this kind"} has {chosen.length>1?"all of these tags":"this tag"}{name?` and matches “${name}”`:""}.</p>}
   {actions.length>0&&<div className="quick-group"><span className="eyebrow">Actions</span>{actions.map((a,i)=>row(a,suggestions.length+results.length+i))}</div>}
  </div>
  <div className="quick-foot">{library?.tags.length?<span>Type # to filter by tag</span>:null}<span>↑ ↓ to move</span><span>Enter to open</span><span>Esc to close</span>{onManageTags&&<button type="button" className="quick-manage" onClick={()=>{onClose();onManageTags();}}>Manage tags</button>}</div>
 </dialog>;
}
