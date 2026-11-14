'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Plus,Search} from 'lucide-react';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {standingNames,standings,type Standing} from '@/lib/encyclopedia/org-profile';
import {Avatar} from './org-parts';

/** Pages an organization may point at: its own campaign and shared lore in its world (the same rule the schema enforces). */
export const pickable=(data:Workspace,org:Entry,characters:boolean)=>data.entries.filter(e=>e.id!==org.id&&e.worldId===org.worldId&&(e.campaignId===null||e.campaignId===org.campaignId)&&(characters?e.kind==='character':e.kind!=='folder'));

/**
 * A search popover over the campaign's pages. With `characters` it lists characters, picks a standing and can make a new NPC
 * from what was typed; without, it lists any page (holdings, fact links).
 */
export function PagePicker({data,org,characters,exclude=[],label,onChoose,onCreate,onClose}:{data:Workspace;org:Entry;characters:boolean;exclude?:string[];label:string;onChoose:(entryId:string,standing:Standing)=>void;onCreate?:(name:string,standing:Standing)=>void;onClose:()=>void}){
 const [query,setQuery]=useState(''),[standing,setStanding]=useState<Standing>('neutral'),root=useRef<HTMLDivElement>(null);
 const pages=useMemo(()=>pickable(data,org,characters).filter(e=>!exclude.includes(e.id)).sort((a,b)=>a.title.localeCompare(b.title)),[data,org,characters,exclude]);
 const q=query.trim().toLowerCase(),found=(q?pages.filter(e=>e.title.toLowerCase().includes(q)):pages).slice(0,40);
 const exact=pages.some(e=>e.title.toLowerCase()===q);
 useEffect(()=>{
  const away=(e:MouseEvent)=>{const host=root.current?.parentElement??root.current;if(host&&!host.contains(e.target as Node))onClose();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};
  document.addEventListener('mousedown',away);document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('mousedown',away);document.removeEventListener('keydown',key,true);};
 },[onClose]);
 const sub=(e:Entry)=>e.kind==='character'?[e.character?.group,e.character?.location].filter(Boolean).join(' · '):e.kind;
 return <div className="org-picker" role="dialog" aria-label={label} ref={root}>
  <label className="org-picker-search"><Search size={14}/><input autoFocus placeholder={characters?'Search characters…':'Search pages…'} aria-label={characters?'Search characters':'Search pages'} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&found[0]){e.preventDefault();onChoose(found[0].id,standing);}}}/></label>
  {characters&&<label className="org-picker-standing">Standing<select aria-label="Standing" value={standing} onChange={e=>setStanding(e.target.value as Standing)}>{standings.map(s=><option key={s} value={s}>{standingNames[s]}</option>)}</select></label>}
  <ul className="org-picker-list">{found.map(e=><li key={e.id}><button type="button" onClick={()=>onChoose(e.id,standing)}>{characters&&<Avatar title={e.title} size={24}/>}<span><strong>{e.title}</strong>{sub(e)&&<small>{sub(e)}</small>}</span></button></li>)}
   {!found.length&&<li className="org-picker-none">{characters?'No characters match.':'No pages match.'}</li>}</ul>
  {characters&&onCreate&&q&&!exact&&<button type="button" className="org-picker-new" onClick={()=>onCreate(query.trim(),standing)}><Plus size={14}/> New character “{query.trim()}”</button>}
 </div>;
}
