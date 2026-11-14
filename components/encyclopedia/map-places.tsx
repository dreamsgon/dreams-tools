'use client';
/*
 * Map notes on Encyclopedia maps: the card a place, a river or a name opens when clicked, the "On this map"
 * list beside the map, and the picker that links a page to any of them.
 */
import {useState} from 'react';
import {ArrowUpRight,BookOpen,Eye,EyeOff,Map as MapIcon,MapPin,Pencil,Plus,Search,Trash2,X} from 'lucide-react';
import {linkedCount,mapThings,placeCard,type MapThing} from '@/lib/encyclopedia/map-places';
import {visibleEntries,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {kindLabel} from '@/lib/map-notes';
import type {Holder} from '@/lib/encyclopedia/org-holdings';
import {ToolDialog} from './tool-dialog';
import './map-places.css';

const initial=(t:string)=>t.trim().charAt(0).toUpperCase()||'?';
const tint=(kind:string)=>/character|npc|creature|companion/i.test(kind)?'#6a4f8a':/place|map|town|city|village/i.test(kind)?'#3f6f58':/faction|lore/i.test(kind)?'#5f5a8a':/quest/i.test(kind)?'#a0782c':'#8a5a2c';

export function PlaceCardView({data,map,thing,holders,onOpen,onLink,onEdit,onRemove,onClose}:{holders?:Holder[];data:Workspace;map:Entry;thing:MapThing;onOpen:(id:string)=>void;onLink:()=>void;onEdit?:()=>void;onRemove?:()=>void;onClose:()=>void}){
 const card=placeCard(data,map,thing.entryId),page=card.page,area=thing.areaMapId?data.entries.find(e=>e.id===thing.areaMapId):undefined;
 return <section className={`place-card${thing.x<.5?' right':''}`} aria-label={thing.title}>
  <header>
   <span className="place-card-badge" style={{background:tint(thing.kind)}} aria-hidden="true">{thing.type==='pin'?initial(thing.title):<MapPin size={16}/>}</span>
   <div>
    <div className="place-card-chips"><span>{thing.kind}</span>{page?(page.players&&thing.visibility==='players'?<span className="shared"><Eye size={11}/> Players know it</span>:<span className="gm"><EyeOff size={11}/> GM only</span>):thing.visibility==='gm'&&<span className="gm"><EyeOff size={11}/> GM only</span>}</div>
    <h3>{thing.title}</h3>
   </div>
   <button className="icon-button" aria-label="Close" onClick={onClose}><X size={15}/></button>
  </header>
  <div className="place-card-body">
   {page?<>
    {page.title!==thing.title&&<p className="place-card-page"><BookOpen size={12}/> {page.title}</p>}
    {card.lead&&<p className="place-card-lead">{card.lead}</p>}
    {!!holders?.length&&<div className="place-card-held"><h4>Held by</h4><ul>{holders.map((h,i)=><li key={h.id}><i style={{background:h.colour}} aria-hidden="true"/><button className="wiki-link" onClick={()=>onOpen(h.id)}>{h.title}</button>{i===0&&holders.length>1&&<small>colours the map</small>}{h.gm&&<small className="gm"><EyeOff size={10}/> GM only</small>}</li>)}</ul></div>}
    {card.info.length>0&&<dl className="place-card-info">{card.info.slice(0,6).map(r=><div key={r.id}><dt>{r.label}{r.gm&&<EyeOff size={10} aria-label="GM only"/>}</dt><dd>{r.pageId?<button className="wiki-link" onClick={()=>onOpen(r.pageId!)}>{r.value}</button>:r.value}</dd></div>)}</dl>}
    {thing.notes&&<p className="place-card-notes">{thing.notes}</p>}
    {card.secrets.length>0&&<><h4>GM notes</h4><div className="place-card-secret">{card.secrets.map((t,i)=><p key={i}>{t}</p>)}</div></>}
    {card.inside.length>0&&<><h4>In {page.title}</h4><ul className="place-card-inside">{card.inside.map(c=><li key={c.id}><button onClick={()=>onOpen(c.id)}>
     <span className="place-card-badge small" style={{background:tint(c.kind)}} aria-hidden="true">{initial(c.title)}</span>
     <span><strong>{c.title}</strong> <small>{c.kind}</small>{!c.players&&<small className="gm"><EyeOff size={10}/> GM only</small>}{c.excerpt&&<span className="place-card-excerpt">{c.excerpt}</span>}</span>
     <ArrowUpRight size={14} aria-hidden="true"/></button></li>)}</ul>{card.insideCount>card.inside.length&&<p className="aside-hint">and {card.insideCount-card.inside.length} more inside</p>}</>}
   </>:<div className="place-card-empty">{thing.notes&&<p className="place-card-notes">{thing.notes}</p>}<p>No page is linked yet. Link one and its text, info box, secrets and the pages inside it show here.</p></div>}
  </div>
  <footer>
   {page&&<button className="button small primary" onClick={()=>onOpen(page.id)}><BookOpen size={14}/> Open page</button>}
   {area&&<button className="button small" onClick={()=>onOpen(area.id)}><MapIcon size={14}/> Area map</button>}
   <button className="button small" onClick={onLink}>{page?<><Pencil size={13}/> Change page</>:<><Plus size={14}/> Link page</>}</button>
   {(onEdit||onRemove)&&<span className="place-card-more">{onEdit&&<button className="text-button" onClick={onEdit}>Edit pin</button>}{onRemove&&<button className="text-button danger" onClick={onRemove}><Trash2 size={12}/> Remove</button>}</span>}
  </footer>
 </section>;
}

export function OnThisMap({data,map,things,selected,onSelect,onLink}:{data:Workspace;map:Entry;things:MapThing[];selected:string;onSelect:(t:MapThing)=>void;onLink:(t:MapThing)=>void}){
 const places=things.filter(t=>t.type==='pin'),names=things.filter(t=>t.type!=='pin');
 const row=(t:MapThing)=>{const n=linkedCount(data,map,t.entryId);return <li key={t.type+t.id} className={selected===t.id?'active':''}>
  <button className="on-map-name" onClick={()=>onSelect(t)}><span>{t.title}</span>{t.visibility==='gm'&&<EyeOff size={12} aria-label="GM only"/>}</button>
  <small>{t.kind}</small>
  {n?<button className="on-map-count" title={`${n} linked page${n===1?'':'s'}`} onClick={()=>onSelect(t)}><BookOpen size={12}/> {n}</button>:<button className="on-map-link" onClick={()=>onLink(t)}><Plus size={12}/> Link page</button>}
 </li>;};
 return <section className="on-this-map" aria-label="On this map">
  <div className="section-heading"><h3>On this map</h3><span>{map.mapData!.pins.length} / 100 places</span></div>
  <p className="aside-hint">Click a place or a name to see its notes. The book shows how many pages it brings: its own and the pages inside it.</p>
  {places.length>0&&<><h4>Places</h4><ul>{places.map(row)}</ul></>}
  {names.length>0&&<><h4>Names on the map</h4><ul>{names.map(row)}</ul></>}
  {!things.length&&<p className="aside-hint">Choose Add pin, then click the map. Places can link to your pages, characters, or other maps.</p>}
 </section>;
}

export function LinkPageDialog({data,map,thing,onPick,onClose}:{data:Workspace;map:Entry;thing:MapThing;onPick:(id:string|null)=>void;onClose:()=>void}){
 const [query,setQuery]=useState('');
 const pages=visibleEntries(data,map.worldId,map.campaignId).filter(e=>e.id!==map.id&&e.kind!=='folder'&&e.kind!=='tasks');
 const q=query.trim().toLowerCase(),exact=pages.find(e=>e.title.toLowerCase()===thing.title.toLowerCase());
 const shown=(q?pages.filter(e=>e.title.toLowerCase().includes(q)):[...(exact?[exact]:[]),...pages.filter(e=>e!==exact)]).slice(0,60);
 return <ToolDialog title={`Link a page to ${thing.title}`} onClose={onClose}>
  <p className="modal-intro">Its text, info box, GM secrets and the pages inside it show when you click {thing.title} on the map. Players only see pages you already share.</p>
  <label className="search-box picker-search"><Search size={15}/><input autoFocus aria-label="Find a page" placeholder="Find a page…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="scene-pick-list">{shown.length?shown.map(e=><button key={e.id} className="scene-pick" onClick={()=>onPick(e.id)}><BookOpen size={16}/><span><strong>{e.title}</strong><small>{[kindLabel(e),e===exact&&!q?'Same name':''].filter(Boolean).join(' · ')}</small></span></button>):<p className="muted">No pages match.</p>}</div>
  {thing.entryId&&<button className="text-button danger" onClick={()=>onPick(null)}>Unlink the page</button>}
 </ToolDialog>;
}

export {mapThings};
