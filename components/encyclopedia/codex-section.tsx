"use client";
import {useState} from 'react';
import {Inbox,BookOpen,Plus,Eye,EyeOff,Lock,X,ArrowUpRight,Goal,Library,CircleDot,Trash2} from 'lucide-react';
import {CategoryIcon} from './codex-icon';
import {newId,defaultCharacter,type Entry,type Workspace,type Campaign} from '@/lib/encyclopedia/world-model';
import {codexCategories,codexIn,isCreatureCategory,isNewFind,setFound,type Codex} from '@/lib/encyclopedia/codex';
import {newQuest} from '@/lib/encyclopedia/quests';
import {ArticleBody} from './article-body';
import {usePictureSrc} from './character-picture';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
const ALL='\u0000all',INBOX='\u0000inbox';

/** The entry's picture, cropped to fill a square, or its category's icon. */
function Thumb({entry,size}:{entry:Entry&{codex:Codex};size:number}){
 const {src}=usePictureSrc(entry.picture?.imageId);
 return <span className="codex-thumb" style={{width:size,height:size,backgroundImage:src?`url("${src}")`:undefined}} aria-hidden="true">{!src&&<CategoryIcon name={entry.codex.category} size={size*.4}/>}</span>;
}

/** Puts new pages in a top-level page of this name in the campaign, making it the first time. */
function filedUnder(w:Workspace,worldId:string,campaignId:string,title:string,now:string){
 const found=w.entries.find(e=>e.worldId===worldId&&e.campaignId===campaignId&&e.parentId===null&&e.title.trim().toLowerCase()===title.toLowerCase());
 return found?{folder:found,extra:[] as Entry[]}:(()=>{const folder:Entry={id:newId(),worldId,campaignId,parentId:null,title,kind:'folder',body:'',updatedAt:now};return {folder,extra:[folder]};})();
}

/** The campaign codex: categories, the inbox of notes from the table, the entries and the one you picked. */
export function CodexSection({data,worldId,campaign,change,onOpen}:{data:Workspace;worldId:string;campaign:Campaign;change:Change;onOpen:(id:string)=>void}){
 const entries=codexIn(data.entries,worldId,campaign.id),categories=codexCategories(entries,campaign.codexCategories),inbox=campaign.codexInbox??[];
 const [category,setCategory]=useState(ALL),[selected,setSelected]=useState<string|null>(null),[fresh,setFresh]=useState<string|null>(null),[adding,setAdding]=useState(false),[newName,setNewName]=useState(''),[note,setNote]=useState('');
 const shown=category===ALL||category===INBOX?entries:entries.filter(e=>e.codex.category.toLowerCase()===category.toLowerCase());
 const open=entries.find(e=>e.id===selected);
 const foundCount=shown.filter(e=>e.codex.found[campaign.id]).length;
 const setCampaign=(patch:Partial<Campaign>)=>change(w=>({...w,campaigns:w.campaigns.map(c=>c.id===campaign.id?{...c,...patch}:c)}));
 const update=(id:string,patch:Partial<Entry>)=>change(w=>({...w,entries:w.entries.map(e=>e.id===id?{...e,...patch,updatedAt:new Date().toISOString()}:e)}));

 function create(cat:string,title='New entry',summary='',dropNote?:string){
  const id=newId(),now=new Date().toISOString(),creature=isCreatureCategory(cat);
  const ok=change(w=>{
   const {folder,extra}=filedUnder(w,worldId,campaign.id,'Codex',now);
   const page:Entry={id,worldId,campaignId:campaign.id,parentId:folder.id,title:title.slice(0,160),kind:creature?'character':'lore',...(creature?{character:{...defaultCharacter(),role:'creature' as const}}:{}),body:'',codex:{category:cat,summary:summary.slice(0,2000),found:{}},updatedAt:now};
   return {...w,entries:[...w.entries,...extra,page],campaigns:dropNote?w.campaigns.map(c=>c.id===campaign.id?{...c,codexInbox:(c.codexInbox??[]).filter(n=>n.id!==dropNote)}:c):w.campaigns};
  });
  if(ok!==false){setSelected(id);setFresh(id);if(category===INBOX)setCategory(cat);}
 }
 function addCategory(){const name=newName.trim().slice(0,60);if(!name)return;if(!categories.some(c=>c.toLowerCase()===name.toLowerCase()))setCampaign({codexCategories:[...categories,name]});setCategory(name);setNewName('');setAdding(false);}
 function addNote(){const text=note.trim();if(!text)return;setCampaign({codexInbox:[{id:newId(),text:text.slice(0,1000),at:new Date().toISOString()},...inbox].slice(0,200)});setNote('');}
 const dropNote=(id:string)=>setCampaign({codexInbox:inbox.filter(n=>n.id!==id)});
 const quests=data.entries.filter(e=>e.kind==='quest'&&e.worldId===worldId&&(e.campaignId===null||e.campaignId===campaign.id)&&e.quest?.state!=='done'&&e.quest?.state!=='failed');
 function toQuest(noteId:string,questId:string){
  const n=inbox.find(x=>x.id===noteId),now=new Date().toISOString();if(!n)return;
  const ok=change(w=>({...w,campaigns:w.campaigns.map(c=>c.id===campaign.id?{...c,codexInbox:(c.codexInbox??[]).filter(x=>x.id!==noteId)}:c),entries:w.entries.map(e=>{if(e.id!==questId)return e;const q=e.quest??newQuest();return {...e,quest:{...q,log:[{id:newId(),at:n.at,text:n.text,players:false},...q.log].slice(0,500)},updatedAt:now};})}));
  if(ok!==false)setNote('');
 }

 const heading=category===ALL?'All entries':category===INBOX?'Inbox':category;
 return <section className="page-content codex-page">
  <nav className="codex-nav" aria-label="Codex categories">
   <span className="eyebrow">Codex</span>
   <button className={category===INBOX?'on':''} aria-current={category===INBOX?'true':undefined} onClick={()=>setCategory(INBOX)}><Inbox size={15}/><span>Inbox</span>{inbox.length>0&&<b className="codex-count-accent">{inbox.length}</b>}</button>
   <button className={category===ALL?'on':''} aria-current={category===ALL?'true':undefined} onClick={()=>setCategory(ALL)}><Library size={15}/><span>All entries</span><b>{entries.length}</b></button>
   {categories.map(c=><button key={c} className={category.toLowerCase()===c.toLowerCase()?'on':''} aria-current={category.toLowerCase()===c.toLowerCase()?'true':undefined} onClick={()=>setCategory(c)}><CategoryIcon name={c}/><span>{c}</span><b>{entries.filter(e=>e.codex.category.toLowerCase()===c.toLowerCase()).length}</b></button>)}
   {adding?<form className="codex-new-category" onSubmit={e=>{e.preventDefault();addCategory();}}><input autoFocus aria-label="Category name" placeholder="Category name" value={newName} maxLength={60} onChange={e=>setNewName(e.target.value)} onBlur={()=>{if(!newName.trim())setAdding(false);}}/></form>
    :<button className="text-button codex-add-category" onClick={()=>setAdding(true)}><Plus size={14}/> New category</button>}
  </nav>
  <div className="codex-main">
   <div className="codex-head"><h1>{heading}</h1>{category!==INBOX&&<span className="muted">{shown.length} {shown.length===1?'entry':'entries'} · players have found {foundCount}</span>}<span className="quests-spacer"/>
    <button className="button primary" onClick={()=>create(category===ALL||category===INBOX?categories[0]??'Bestiary':category)}><Plus size={16}/> New entry</button></div>
   <div className={`codex-inbox ${category===INBOX?'full':''}`}>
    <div className="codex-inbox-head"><Inbox size={15}/><strong>Inbox</strong><span className="muted">Quick notes from the table, waiting to be filed</span>{category!==INBOX&&inbox.length>1&&<button className="text-button" onClick={()=>setCategory(INBOX)}>All {inbox.length}</button>}</div>
    <form className="codex-jot" onSubmit={e=>{e.preventDefault();addNote();}}><Plus size={14}/><input aria-label="Jot a note" placeholder="Jot something down during the game… (Enter)" value={note} maxLength={1000} onChange={e=>setNote(e.target.value)}/></form>
    {(category===INBOX?inbox:inbox.slice(0,1)).map(n=><div key={n.id} className="codex-note">
     <p>{n.text}</p><small className="muted">{new Date(n.at).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'})}</small>
     <button className="icon-button" aria-label="Dismiss note" onClick={()=>dropNote(n.id)}><X size={14}/></button>
     <div className="codex-note-actions">
     <label className="codex-file"><BookOpen size={13}/><select aria-label="File as a codex entry" value="" onChange={e=>{if(e.target.value)create(e.target.value,n.text.length<=48&&!/[.?!]\s*\S/.test(n.text)?n.text.replace(/[.?!]+$/,''):'New entry',n.text,n.id);}}><option value="">File as…</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
     {quests.length>0&&<label className="codex-file"><Goal size={13}/><select aria-label="Add to a quest log" value="" onChange={e=>{if(e.target.value)toQuest(n.id,e.target.value);}}><option value="">Add to a quest…</option>{quests.map(q=><option key={q.id} value={q.id}>{q.title}</option>)}</select></label>}</div>
    </div>)}
    {category===INBOX&&!inbox.length&&<p className="muted codex-inbox-empty">Nothing waiting. Jot notes here during the game and file them later.</p>}
   </div>
   {category!==INBOX&&<div className="codex-grid">{shown.map(e=>{const f=e.codex.found[campaign.id];return <button key={e.id} className={`codex-card ${open?.id===e.id?'on':''} ${f?'':'unfound'}`} aria-current={open?.id===e.id?'true':undefined} onClick={()=>{setSelected(e.id);if(window.matchMedia('(max-width:1250px)').matches)requestAnimationFrame(()=>document.querySelector('.codex-detail')?.scrollIntoView({behavior:'smooth',block:'start'}));}}>
     {f||e.picture?<Thumb entry={e} size={60}/>:<span className="codex-thumb locked" aria-hidden="true"><Lock size={18}/></span>}
     <span className="codex-card-text"><strong>{e.title}{isNewFind(f)&&<span className="codex-new">New</span>}</strong>{e.codex.summary&&<span className="codex-summary">{e.codex.summary}</span>}
      {f?<span className="codex-found"><Eye size={11}/> Found{f.label?` · ${f.label}`:''}</span>:<span className="codex-unfound"><EyeOff size={11}/> Not found yet</span>}</span>
    </button>;})}
    {!shown.length&&<p className="muted codex-empty">Nothing in {heading} yet. Add a new entry, file a note from the inbox, or add any page from its sidebar.</p>}
   </div>}
   {category!==INBOX&&<p className="muted codex-hint">Codex entries are short and collectable. Mark one found and it appears in the players’ codex with a “New” badge. Longer write-ups still live in the page.</p>}
  </div>
  {open&&<aside className="codex-detail" aria-label={open.title}><CodexDetail key={open.id} entry={open} data={data} campaign={campaign} categories={categories} update={patch=>update(open.id,patch)} onOpen={onOpen} fresh={fresh===open.id} onClose={()=>setSelected(null)}/></aside>}
 </section>;
}

/** One codex entry: its picture, whether players found it, what they read, and the GM's page text. */
export function CodexDetail({entry,data,campaign,categories,update,onOpen,onClose,fresh=false}:{entry:Entry&{codex:Codex};data:Workspace;campaign:Campaign;categories:string[];update:(p:Partial<Entry>)=>void;onOpen:(id:string)=>void;onClose?:()=>void;fresh?:boolean}){
 const c=entry.codex,found=c.found[campaign.id],[title,setTitle]=useState(entry.title);
 const {src}=usePictureSrc(entry.picture?.imageId);
 const set=(patch:Partial<Codex>)=>update({codex:{...c,...patch}});
 const token=entry.kind==='character'&&campaign.maptableCampaignId?`/maptable?campaign=${encodeURIComponent(campaign.maptableCampaignId)}&addCharacter=${encodeURIComponent(entry.id)}`:null;
 return <div className="codex-detail-inner">
  {onClose&&<button className="icon-button codex-close" aria-label="Close" onClick={onClose}><X size={16}/></button>}
  {src?<div className="codex-hero" style={{backgroundImage:`url("${src}")`}}/>:<div className="codex-hero empty"><CategoryIcon name={c.category} size={54}/></div>}
  <div className="codex-detail-body">
   <div className="codex-chips">
    <label className="quest-type main"><select aria-label="Codex category" value={categories.find(x=>x.toLowerCase()===c.category.toLowerCase())??c.category} onChange={e=>set({category:e.target.value})}>{categories.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <button className={`quest-share ${found?'on':''}`} aria-pressed={!!found} onClick={()=>set(setFound(c,campaign.id,!found))}>{found?<><Eye size={12}/> Players found it</>:<><EyeOff size={12}/> Not found yet</>}</button>
    {found&&<input className="codex-found-label" aria-label="Found when" placeholder="Session 9" defaultValue={found.label??''} maxLength={80} onBlur={e=>{if(e.target.value.trim()!==(found.label??''))set(setFound(c,campaign.id,true,e.target.value));}}/>}
   </div>
   {onClose?<input className="quest-title-input codex-title" aria-label="Entry name" autoFocus={fresh} onFocus={e=>{if(fresh)e.currentTarget.select();}} value={title} maxLength={160} onChange={e=>{setTitle(e.target.value);if(e.target.value.trim())update({title:e.target.value.trim()});}} onBlur={()=>setTitle(entry.title)}/>:null}
   <label className="codex-summary-edit"><span className="eyebrow">What players read</span><textarea rows={3} placeholder="A line or two the party learns when they find it." defaultValue={c.summary} maxLength={2000} onBlur={e=>{if(e.target.value!==c.summary)set({summary:e.target.value});}}/></label>
   {onClose&&entry.body.trim()&&<div className="prose codex-body"><span className="eyebrow">The page</span><ArticleBody entry={entry} data={data} onOpen={onOpen} onChange={body=>update({body})}/></div>}
   <div className="button-row codex-actions">
    {onClose&&<button className="button small" onClick={()=>onOpen(entry.id)}><BookOpen size={14}/> Open full page <ArrowUpRight size={12}/></button>}
    {token&&<a className="button small" href={token}><CircleDot size={14}/> Add as token</a>}
    <button className="text-button codex-remove" onClick={()=>{if(confirm(`Take “${entry.title}” out of the codex? The page stays.`))update({codex:undefined});}}><Trash2 size={13}/> Remove from codex</button>
   </div>
  </div>
 </div>;
}

/** On any page: put it in the codex, or show its codex details. */
export function CodexPanel({entry,data,campaign,update,onOpen}:{entry:Entry;data:Workspace;campaign?:Campaign;update:(p:Partial<Entry>)=>void;onOpen:(id:string)=>void}){
 if(!campaign||entry.kind==='folder')return null;
 const categories=codexCategories(codexIn(data.entries,entry.worldId,campaign.id),campaign.codexCategories);
 if(!entry.codex)return <div className="aside-section"><div className="aside-heading"><span className="eyebrow">CODEX</span></div><label className="codex-add-page"><select aria-label="Add to the codex" value="" onChange={e=>{if(e.target.value)update({codex:{category:e.target.value,summary:'',found:{}}});}}><option value="">Add to the codex…</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label></div>;
 return <div className="aside-section codex-aside"><div className="aside-heading"><span className="eyebrow">CODEX</span></div><CodexDetail entry={entry as Entry&{codex:Codex}} data={data} campaign={campaign} categories={categories} update={update} onOpen={onOpen}/></div>;
}
