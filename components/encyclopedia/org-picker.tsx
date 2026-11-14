'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Plus,Search} from 'lucide-react';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {standingNames,standings,type Standing} from '@/lib/encyclopedia/org-profile';
import {Avatar} from './org-parts';
import {joinRefusal,joinable} from '@/lib/encyclopedia/character-profile';

/** Pages an organization may point at: its own campaign and shared lore in its world (the same rule the schema enforces). */
export const pickable=(data:Workspace,org:Entry,characters:boolean,ties=false)=>data.entries.filter(e=>e.id!==org.id&&e.worldId===org.worldId&&(e.campaignId===null||e.campaignId===org.campaignId)&&(ties?e.kind==='character'||e.kind==='faction':characters?e.kind==='character':e.kind!=='folder'));

/**
 * A search popover over the campaign's pages. With `characters` it lists characters, picks a standing and can make a new NPC
 * from what was typed; without, it lists any page (holdings, fact links). With `ties` it lists characters and organizations
 * (a character's ties), with no standing, and can still make a new NPC.
 */
export function PagePicker({data,org,characters,ties=false,exclude=[],label,onChoose,onCreate,onClose}:{data:Workspace;org:Entry;characters:boolean;ties?:boolean;exclude?:string[];label:string;onChoose:(entryId:string,standing:Standing)=>void;onCreate?:(name:string,standing:Standing)=>void;onClose:()=>void}){
 const [query,setQuery]=useState(''),[standing,setStanding]=useState<Standing>('neutral'),root=useRef<HTMLDivElement>(null);
 const pages=useMemo(()=>pickable(data,org,characters,ties).filter(e=>!exclude.includes(e.id)).sort((a,b)=>a.title.localeCompare(b.title)),[data,org,characters,ties,exclude]);
 const q=query.trim().toLowerCase(),found=(q?pages.filter(e=>e.title.toLowerCase().includes(q)):pages).slice(0,40);
 const exact=pages.some(e=>e.title.toLowerCase()===q);
 useEffect(()=>{
  const away=(e:MouseEvent)=>{const host=root.current?.parentElement??root.current;if(host&&!host.contains(e.target as Node))onClose();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};
  document.addEventListener('mousedown',away);document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('mousedown',away);document.removeEventListener('keydown',key,true);};
 },[onClose]);
 // Opened near the bottom of the screen, it scrolls up so the whole list shows.
 useEffect(()=>{root.current?.scrollIntoView?.({block:'nearest'});},[]);
 const sub=(e:Entry)=>e.kind==='character'?[e.character?.group,e.character?.location].filter(Boolean).join(' · '):e.kind==='faction'?'organization':e.kind;
 const people=characters||ties,label2=ties?'people and organizations':characters?'characters':'pages';
 return <div className="org-picker" role="dialog" aria-label={label} ref={root}>
  <label className="org-picker-search"><Search size={14}/><input autoFocus placeholder={`Search ${label2}…`} aria-label={`Search ${label2}`} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&found[0]){e.preventDefault();onChoose(found[0].id,standing);}}}/></label>
  {characters&&!ties&&<label className="org-picker-standing">Standing<select aria-label="Standing" value={standing} onChange={e=>setStanding(e.target.value as Standing)}>{standings.map(s=><option key={s} value={s}>{standingNames[s]}</option>)}</select></label>}
  <ul className="org-picker-list">{found.map(e=><li key={e.id}><button type="button" onClick={()=>onChoose(e.id,standing)}>{people&&<Avatar title={e.title} size={24}/>}<span><strong>{e.title}</strong>{sub(e)&&<small>{sub(e)}</small>}</span></button></li>)}
   {!found.length&&<li className="org-picker-none">{`No ${label2} match.`}</li>}</ul>
  {(characters||ties)&&onCreate&&q&&!exact&&<button type="button" className="org-picker-new" onClick={()=>onCreate(query.trim(),standing)}><Plus size={14}/> New character “{query.trim()}”</button>}
 </div>;
}

/**
 * A search popover over the organizations a character may join. It asks for their role (free text) and standing, and picks
 * an organization to join; an organization with no room for another member is shown but can't be picked.
 */
export function OrgJoinPicker({data,character,exclude=[],onJoin,onClose}:{data:Workspace;character:Entry;exclude?:string[];onJoin:(orgId:string,role:string,standing:Standing)=>void;onClose:()=>void}){
 const [query,setQuery]=useState(''),[role,setRole]=useState(''),[standing,setStanding]=useState<Standing>('neutral'),root=useRef<HTMLDivElement>(null);
 const orgs=useMemo(()=>joinable(data,character.id).filter(e=>!exclude.includes(e.id)).sort((a,b)=>a.title.localeCompare(b.title)),[data,character.id,exclude]);
 const q=query.trim().toLowerCase(),found=(q?orgs.filter(e=>e.title.toLowerCase().includes(q)):orgs).slice(0,40);
 useEffect(()=>{
  const away=(e:MouseEvent)=>{const host=root.current?.parentElement??root.current;if(host&&!host.contains(e.target as Node))onClose();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};
  document.addEventListener('mousedown',away);document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('mousedown',away);document.removeEventListener('keydown',key,true);};
 },[onClose]);
 // Opened near the bottom of the screen, it scrolls up so the whole list shows.
 useEffect(()=>{root.current?.scrollIntoView?.({block:'nearest'});},[]);
 const choose=(e:Entry)=>{if(!joinRefusal(data,character.id,e.id))onJoin(e.id,role.trim(),standing);};
 return <div className="org-picker" role="dialog" aria-label={`Join an organization`} ref={root}>
  <label className="org-picker-search"><Search size={14}/><input autoFocus placeholder="Search organizations…" aria-label="Search organizations" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&found[0]){e.preventDefault();choose(found[0]);}}}/></label>
  <label className="org-picker-standing">Role<input className="org-input" aria-label="Role" placeholder="For example Warden-Captain" maxLength={80} value={role} onChange={e=>setRole(e.target.value)}/></label>
  <label className="org-picker-standing">Standing<select aria-label="Standing" value={standing} onChange={e=>setStanding(e.target.value as Standing)}>{standings.map(s=><option key={s} value={s}>{standingNames[s]}</option>)}</select></label>
  <ul className="org-picker-list">{found.map(e=>{const why=joinRefusal(data,character.id,e.id);return <li key={e.id}><button type="button" disabled={!!why} onClick={()=>choose(e)}><Avatar title={e.title} size={24}/><span><strong>{e.title}</strong>{(why||e.org?.type)&&<small>{why??e.org?.type}</small>}</span></button></li>;})}
   {!found.length&&<li className="org-picker-none">{orgs.length?'No organizations match.':'There are no other organizations they can join yet.'}</li>}</ul>
 </div>;
}
