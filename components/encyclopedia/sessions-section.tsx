'use client';
/* Sessions: every session page of the campaign, newest first. It sits in the sidebar's top menu beside Quests and
   Characters (it used to be a folding section under Campaign Notes). Recaps are written from a session page. */
import {useState} from 'react';
import {Plus,ScrollText,Search,ChevronRight} from 'lucide-react';
import type {Campaign,Entry,Workspace} from '@/lib/encyclopedia/world-model';

const when=(e:Entry)=>e.recap?.playedOn??e.updatedAt.slice(0,10);
const shortDate=(d:string)=>{const t=new Date(d+'T12:00:00');return Number.isNaN(t.getTime())?d:t.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});};

export function SessionsSection({data,campaign,excerpt,onOpen,onNew}:{data:Workspace;campaign:Campaign;excerpt:(e:Entry)=>string;onOpen:(id:string)=>void;onNew:()=>void}){
 const [query,setQuery]=useState('');
 const all=data.entries.filter(e=>e.kind==='session'&&e.campaignId===campaign.id).sort((a,b)=>when(b).localeCompare(when(a))||b.title.localeCompare(a.title,undefined,{numeric:true}));
 const list=all.filter(e=>(e.title+' '+e.body).toLowerCase().includes(query.trim().toLowerCase()));
 return <section className="page-content sessions-directory"><div className="dashboard-intro"><div><span className="eyebrow">The story so far</span><h1>Sessions</h1><p className="subtitle">{campaign.name} · Every game you've played, newest first.</p></div><div className="button-row"><button className="button primary" onClick={onNew}><Plus size={16}/> New session</button></div></div>
  {all.length>4&&<label className="search-box sessions-search"><Search size={16}/><input aria-label="Search sessions" placeholder="Find a session…" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
  <ol className="session-list">{list.map(e=>{const text=excerpt(e);return <li key={e.id}><button className="session-row" onClick={()=>onOpen(e.id)}><ScrollText size={18}/><span className="session-main"><strong>{e.title}</strong>{text&&<small>{text}</small>}</span><span className="session-meta">{e.recap&&<span className={`session-recap ${e.recap.status}`}>{e.recap.status==='published'?'Recap shared':'Draft recap'}</span>}<time dateTime={when(e)}>{shortDate(when(e))}</time></span><ChevronRight size={15}/></button></li>;})}</ol>
  {!all.length&&<div className="character-empty"><ScrollText size={34} strokeWidth={1}/><h3>No sessions yet.</h3><p>Add a page for each game. From a session page you can write the recap yourself or draft it with AI.</p><button className="button" onClick={onNew}>Add the first session</button></div>}
  {all.length>0&&!list.length&&<p className="aside-hint">No session matches “{query}”.</p>}
 </section>;
}
