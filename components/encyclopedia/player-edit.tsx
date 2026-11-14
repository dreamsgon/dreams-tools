'use client';
import {useState} from 'react';
import {Pencil,Plus,Lock,FileText,Eye,EyeOff} from 'lucide-react';
import type {MyPages} from '@/lib/encyclopedia/player-edit';

/**
 * Editing from the player pages, for a signed-in member whose GM let them edit a page (its Who can edit):
 * the Edit and New sub-page buttons, the editor, and the page's sub-pages with who can see each.
 */
type Page=MyPages[string];
async function send(body:object){
 const r=await fetch('/api/encyclopedia/player-edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const value=await r.json().catch(()=>({})) as {error?:string;id?:string};
 if(!r.ok)throw new Error(value.error??'Could not save. Try again.');
 return value;
}
const seen=(shared:boolean)=>shared?'Players can see':'Only me and the GMs';

export function PlayerPageBar({page,entryId,memberRef,onEdit,onAdded}:{page:Page;entryId:string;memberRef:string;onEdit:()=>void;onAdded:(id:string)=>void}){
 const [adding,setAdding]=useState(false),[title,setTitle]=useState(''),[shared,setShared]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function add(){setBusy(true);setError('');try{const {id}=await send({action:'add',ref:memberRef,parentId:entryId,title,shared});setAdding(false);setTitle('');if(id)onAdded(id);}catch(e){setError(e instanceof Error?e.message:'Could not add the page.');}finally{setBusy(false);}}
 return <div className="player-edit-bar">
  <div className="player-edit-actions">{page.edit&&<button className="button primary small" onClick={onEdit}><Pencil size={14}/> Edit</button>}{page.subPages&&<button className="button small" aria-expanded={adding} onClick={()=>setAdding(!adding)}><Plus size={14}/> New sub-page</button>}</div>
  {adding&&<form className="player-new-page" onSubmit={e=>{e.preventDefault();void add();}}>
   <input autoFocus required maxLength={160} placeholder="Name, like Bram's journal" aria-label="Sub-page name" value={title} onChange={e=>setTitle(e.target.value)}/>
   <div className="player-seen-choice" role="radiogroup" aria-label="Who can see it">{[false,true].map(v=><button type="button" key={String(v)} role="radio" aria-checked={shared===v} onClick={()=>setShared(v)}>{v?<Eye size={13}/>:<EyeOff size={13}/>} {seen(v)}</button>)}</div>
   <button className="button primary small" disabled={busy||!title.trim()}>{busy?'Adding…':'Add'}</button><button type="button" className="button small" onClick={()=>setAdding(false)}>Cancel</button>
   {error&&<p className="player-edit-error" role="alert">{error}</p>}
  </form>}
 </div>;
}

export function PlayerEditor({page,entryId,memberRef,done}:{page:Page;entryId:string;memberRef:string;done:(saved:boolean)=>void}){
 const start=Object.fromEntries(page.tabs.filter(t=>!t.locked).map(t=>[t.id,t.body??''])) as Record<string,string>;
 const [text,setText]=useState(start),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const changed=Object.keys(text).filter(id=>text[id]!==start[id]);
 async function save(){if(!changed.length){done(false);return;}setBusy(true);setError('');try{await send({action:'save',ref:memberRef,entryId,tabs:changed.map(id=>({id,body:text[id]}))});done(true);}catch(e){setError(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}}
 return <div className="player-editor">
  {page.tabs.map(t=><label key={t.id} className="player-editor-tab"><span className="eyebrow">{t.title}</span>{t.locked?<p className="player-edit-locked"><Lock size={13}/> Your GM keeps secret notes in this part, so only they can change it.</p>:<textarea value={text[t.id]} rows={t.id==='overview'?10:6} onChange={e=>setText({...text,[t.id]:e.target.value})}/>}</label>)}
  <p className="player-edit-hint">Your GM sees that you made the change. Link a page with [[Its name]].</p>
  {error&&<p className="player-edit-error" role="alert">{error}</p>}
  <div className="player-edit-actions"><button className="button primary small" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save'}</button><button className="button small" disabled={busy} onClick={()=>done(false)}>Cancel</button></div>
 </div>;
}

export function PlayerSubPages({page,memberRef,open,readable,onChanged}:{page:Page;memberRef:string;open:(id:string)=>void;readable:(id:string)=>boolean;onChanged:()=>void}){
 const [error,setError]=useState(''),[busy,setBusy]=useState('');
 if(!page.children.length)return null;
 async function share(id:string,shared:boolean){setBusy(id);setError('');try{await send({action:'share',ref:memberRef,entryId:id,shared});onChanged();}catch(e){setError(e instanceof Error?e.message:'Could not change it.');}finally{setBusy('');}}
 return <section className="player-subpages"><span className="eyebrow">SUB-PAGES</span>
  {page.children.map(c=><div key={c.id} className="player-subpage"><FileText size={14}/>{readable(c.id)?<button className="inline-link" onClick={()=>open(c.id)}>{c.title}</button>:<span>{c.title}</span>}
   {c.made?<button className={`player-seen ${c.shared?'shared':''}`} disabled={busy===c.id} title={c.shared?'Keep it to you and the GMs':'Let the other players see it'} onClick={()=>void share(c.id,!c.shared)}>{seen(c.shared)}</button>:<span className={`player-seen ${c.shared?'shared':''}`}>{seen(c.shared)}</span>}</div>)}
  {error&&<p className="player-edit-error" role="alert">{error}</p>}
 </section>;
}
