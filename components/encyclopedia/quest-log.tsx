"use client";
/*
 * A quest's Log as a conversation: oldest at the top, newest by the box at the bottom, a divider wherever the session
 * label changes. The GM sees every entry and who wrote it; players see the shared entries and can add their own
 * (POST /api/encyclopedia/player-quest-log), and change or remove only those.
 */
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Eye,EyeOff,Lock,MoreHorizontal,Pencil,SendHorizontal,Trash2} from 'lucide-react';
// The entry menus use the goal menus' look.
import './quest-goals.css';
import './quest-log.css';
import {newId,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import type {Quest,QuestLog} from '@/lib/encyclopedia/quests';
import {ArticleBody} from './article-body';
import {PlayerProse} from './player-prose';
import {confirmDialog} from '../confirm-dialog';

const day=(at:string,year=false)=>{const d=new Date(at);return Number.isNaN(d.getTime())?'':d.toLocaleDateString(undefined,{day:'numeric',month:'short',...(year?{year:'numeric'}:{})});};
const initials=(name:string)=>name.split(/\s+/).filter(w=>/^\p{L}/u.test(w)).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
/** A stable colour per name, from a small set that reads in both themes. */
const tint=(name:string)=>{let h=0;for(const c of name)h=(h*31+c.charCodeAt(0))>>>0;return `qlog-tint-${h%6}`;};

/** Oldest first. Entries are stored newest first by the app but appended by the AI tools and recaps, so go by the time. */
const oldestFirst=<T extends {at:string}>(log:readonly T[])=>[...log].reverse().sort((a,b)=>a.at.localeCompare(b.at));
type Line={id:string;at:string;label:string;author:string;gmOnly:boolean;node:ReactNode;tools?:ReactNode;edited?:boolean};
/** The messages, oldest first, with a divider whenever the session label changes. */
function Thread({lines,empty}:{lines:Line[];empty:string}){
 const end=useRef<HTMLDivElement>(null),seen=useRef(lines.length);
 // A new message scrolls into view; opening the log doesn't move the page.
 useEffect(()=>{if(lines.length>seen.current)end.current?.scrollIntoView?.({block:'nearest'});seen.current=lines.length;},[lines.length]);
 if(!lines.length)return <p className="aside-hint qlog-empty">{empty}</p>;
 // A divider above the first message of each session label.
 const dividers=lines.map((l,i)=>{const before=lines.slice(0,i).findLast(x=>x.label)?.label;return l.label&&l.label!==before?l.label:null;});
 return <><ol className="qlog" aria-label="Log">{lines.map((l,i)=>{
  const divider=dividers[i];
  const who=l.author||'GM';
  return <li key={l.id} className={`qlog-item${l.gmOnly?' gm-only':''}`}>
   {divider&&<div className="qlog-divider" role="separator"><span>{divider}</span></div>}
   <div className="qlog-msg">
    <span className={`qlog-face ${l.author?tint(l.author):'gm'}`} aria-hidden="true">{l.author?initials(l.author):'GM'}</span>
    <div className="qlog-bubble">
     <div className="qlog-who"><strong>{l.gmOnly&&<Lock size={11}/>}{who}{l.gmOnly&&' · GM only'}</strong><time dateTime={l.at}>{day(l.at)}</time>{l.edited&&<small>edited</small>}{l.tools}</div>
     <div className="qlog-text">{l.node}</div>
    </div>
   </div>
  </li>;})}</ol>
  <div ref={end} className="qlog-end"/></>;
}

function EntryMenu({children,label}:{children:ReactNode;label:string}){
 const [open,setOpen]=useState(false),box=useRef<HTMLSpanElement>(null);
 useEffect(()=>{if(!open)return;const away=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',away);return()=>document.removeEventListener('pointerdown',away);},[open]);
 return <span className="qlog-tools" ref={box}><button type="button" className="icon-button" aria-label={label} aria-expanded={open} onClick={()=>setOpen(!open)}><MoreHorizontal size={15}/></button>{open&&<div className="goal-menu right" role="menu" onClick={()=>setOpen(false)}>{children}</div>}</span>;
}

/** The GM's Log on a quest. */
export function QuestLogPanel({entry,data,quest:q,set,onOpen}:{entry:Entry;data:Workspace;quest:Quest;set:(patch:Partial<Quest>)=>void;onOpen:(id:string)=>void}){
 const [text,setText]=useState(''),[label,setLabel]=useState(()=>q.log[0]?.label??''),[players,setPlayers]=useState(true);
 const sessions=data.entries.filter(e=>e.kind==='session'&&e.worldId===entry.worldId&&e.campaignId===entry.campaignId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 const change=(id:string,patch:Partial<QuestLog>)=>set({log:q.log.map(x=>x.id===id?{...x,...patch}:x)});
 function send(){const t=text.trim();if(!t)return;set({log:[{id:newId(),at:new Date().toISOString(),label:label.trim().slice(0,80)||undefined,text:t.slice(0,4000),players},...q.log].slice(0,500)});setText('');}
 const lines:Line[]=oldestFirst(q.log).map(l=>({id:l.id,at:l.at,label:l.label??'',author:l.author??'',gmOnly:!l.players,edited:!!l.editedAt,
  node:<div className="prose"><ArticleBody entry={{...entry,body:l.text}} data={data} onOpen={onOpen} onChange={t=>change(l.id,{text:t})}/></div>,
  tools:<EntryMenu label="Entry options">
   <button role="menuitem" onClick={()=>change(l.id,{players:!l.players})}>{l.players?<><EyeOff size={14}/> Make it GM only</>:<><Eye size={14}/> Show it to players</>}</button>
   <button role="menuitem" className="danger" onClick={async()=>{if(await confirmDialog({title:'Delete this log entry?',message:l.author?`${l.author} wrote it.`:undefined,confirm:'Delete entry',danger:true}))set({log:q.log.filter(x=>x.id!==l.id)});}}><Trash2 size={14}/> Delete entry</button>
  </EntryMenu>}));
 return <div className="qlog-panel">
  <Thread lines={lines} empty="Nothing in the log yet. Write what the party learned or did, a session at a time. Players can add to it from their pages."/>
  <form className="qlog-composer" onSubmit={e=>{e.preventDefault();send();}}>
   <div className="qlog-composer-row">
    <textarea aria-label="Add to the log" placeholder="What happened?" value={text} maxLength={4000} rows={1} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();send();}}}/>
    <button className="button primary qlog-send" type="submit" aria-label="Add to the log" disabled={!text.trim()}><SendHorizontal size={16}/></button>
   </div>
   <div className="qlog-composer-tools">
    <input aria-label="Session" placeholder={sessions[0]?.title??'Session or date'} list={`qlog-when-${entry.id}`} value={label} maxLength={80} onChange={e=>setLabel(e.target.value)}/>
    <datalist id={`qlog-when-${entry.id}`}>{sessions.slice(0,8).map(s=><option key={s.id} value={s.title}/>)}</datalist>
    <button type="button" className={`qlog-toggle ${players?'on':'gm'}`} aria-pressed={players} onClick={()=>setPlayers(!players)}>{players?<><Eye size={12}/> Players see this</>:<><Lock size={12}/> GM only</>}</button>
   </div>
  </form>
 </div>;
}

type PlayerLog={id:string;at:string;label:string;text:string;author?:string;edited?:boolean;mine?:boolean};
async function call(body:Record<string,unknown>){
 let res:Response;
 try{res=await fetch('/api/encyclopedia/player-quest-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
 catch{throw new Error('Couldn’t reach RPG Tools. Check your connection and try again.');}
 const value=await res.json().catch(()=>null) as {error?:string}|null;
 if(!res.ok)throw new Error(value?.error??'Something went wrong. Try again.');
}

/** The Log on the player pages. A signed-in member (`memberRef`) can write in it. */
export function PlayerQuestLog({entryId,log,entries,open,memberRef,onChanged}:{entryId:string;log:PlayerLog[];entries:readonly {id:string;title:string}[];open:(id:string)=>void;memberRef?:string;onChanged?:()=>void}){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<{id:string;text:string}|null>(null);
 async function run(body:Record<string,unknown>,done:()=>void){setBusy(true);setError('');try{await call({ref:memberRef,entryId,...body});done();onChanged?.();}catch(e){setError(e instanceof Error?e.message:'Something went wrong.');}finally{setBusy(false);}}
 const lines:Line[]=oldestFirst(log).map(l=>({id:l.id,at:l.at,label:l.label,author:l.author??'',gmOnly:false,edited:!!l.edited,
  node:editing?.id===l.id?<form className="qlog-edit" onSubmit={e=>{e.preventDefault();void run({action:'edit',logId:l.id,text:editing.text},()=>setEditing(null));}}>
    <textarea aria-label="Your log entry" value={editing.text} maxLength={2000} rows={2} autoFocus onChange={e=>setEditing({id:l.id,text:e.target.value})}/>
    <div className="button-row"><button className="button small primary" type="submit" disabled={busy||!editing.text.trim()}>Save</button><button className="button small" type="button" onClick={()=>setEditing(null)}>Cancel</button></div>
   </form>:<PlayerProse text={l.text} entries={entries} open={open}/>,
  tools:l.mine&&memberRef?<EntryMenu label="Your entry’s options">
   <button role="menuitem" onClick={()=>setEditing({id:l.id,text:l.text})}><Pencil size={14}/> Edit</button>
   <button role="menuitem" className="danger" onClick={async()=>{if(await confirmDialog({title:'Delete your log entry?',confirm:'Delete entry',danger:true}))void run({action:'remove',logId:l.id},()=>{});}}><Trash2 size={14}/> Delete</button>
  </EntryMenu>:undefined}));
 return <div className="qlog-panel">
  <Thread lines={lines} empty={memberRef?'Nothing in the log yet. Write what the party learned or plans to do.':'Nothing in the log yet.'}/>
  {memberRef?<form className="qlog-composer" onSubmit={e=>{e.preventDefault();const t=text.trim();if(t)void run({action:'add',text:t},()=>setText(''));}}>
   <div className="qlog-composer-row">
    <textarea aria-label="Add to the log" placeholder="What did the party learn, or plan to do?" value={text} maxLength={2000} rows={1} onChange={e=>setText(e.target.value)}/>
    <button className="button primary qlog-send" type="submit" aria-label="Add to the log" disabled={busy||!text.trim()}><SendHorizontal size={16}/></button>
   </div>
   <p className="qlog-composer-note">Everyone who can read this quest sees what you write here, and so does your GM.</p>
   {error&&<p className="qlog-error" role="alert">{error}</p>}
  </form>:null}
 </div>;
}
