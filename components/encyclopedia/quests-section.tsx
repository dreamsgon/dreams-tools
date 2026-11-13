"use client";
import {useRef,useState,type DragEvent} from 'react';
import {Columns3,BookOpen,Plus,Search,Eye,EyeOff,MapPin,Gift,GripVertical,X,ChevronDown,ChevronRight,Goal,ArrowUpRight,Trash2,Tags} from 'lucide-react';
import {newId,type Entry,type Workspace,type Campaign} from '@/lib/encyclopedia/world-model';
import {categoryOf,column,defaultCategory,moveQuest,newQuest,nextStep,questCategories,questProgress,questsIn,questStates,stateNames,type Quest,type QuestCategory,type QuestState} from '@/lib/encyclopedia/quests';
import {CategoryChip,CategoryPicker,QuestCategoriesDialog} from './quest-categories';
import {ArticleBody} from './article-body';
import {PictureToken,usePictureSrc} from './character-picture';
import {confirmDialog} from '../confirm-dialog';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
/** 'all', or a quest category id. */
type Filter=string;

/** A small round face for the quest giver: their picture when they have one, otherwise their initials. */
function Face({entry,size=26}:{entry?:Entry;size?:number}){
 const {src}=usePictureSrc(entry?.picture?.imageId);
 if(entry?.picture&&src)return <PictureToken picture={entry.picture} src={src} size={size} ring="var(--line-strong)"/>;
 const initials=(entry?.title??'?').split(/\s+/).filter(w=>/^\p{L}/u.test(w)).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
 return <span className="quest-face" aria-hidden="true" style={{width:size,height:size,fontSize:size*.4}}>{initials}</span>;
}

const quest=(e:Entry)=>e.quest??newQuest();

/** The quest board and journal for one campaign. */
export function QuestsSection({data,worldId,campaign,change,onOpen}:{data:Workspace;worldId:string;campaign:Campaign;change:Change;onOpen:(id:string)=>void}){
 const [mode,setMode]=useState<'board'|'journal'>('board'),[picked,setFilter]=useState<Filter>('all'),[selected,setSelected]=useState<string|null>(null),[editing,setEditing]=useState(false);
 const cats=questCategories(campaign),filter=picked==='all'||cats.some(c=>c.id===picked)?picked:'all';
 const [dragging,setDragging]=useState<string|null>(null),[dropAt,setDropAt]=useState<{state:QuestState;before:string|null}|null>(null);
 const all=questsIn(data,worldId,campaign.id),shown=(list:typeof all)=>list.filter(q=>filter==='all'||q.quest.type===filter);
 const byId=(id:string|null|undefined)=>id?data.entries.find(e=>e.id===id):undefined;
 const open=all.find(q=>q.entry.id===selected)??all.find(q=>q.quest.state==='active')??all[0];

 function create(state:QuestState){
  const id=newId(),now=new Date().toISOString();
  const ok=change(w=>{
   // New quests are filed in a top-level "Quests" page of the campaign, made the first time.
   let folder=w.entries.find(e=>e.worldId===worldId&&e.campaignId===campaign.id&&e.parentId===null&&e.title.trim().toLowerCase()==='quests');
   const extra:Entry[]=[];
   if(!folder){folder={id:newId(),worldId,campaignId:campaign.id,parentId:null,title:'Quests',kind:'folder',body:'',updatedAt:now};extra.push(folder);}
   const page:Entry={id,worldId,campaignId:campaign.id,parentId:folder.id,title:'New quest',kind:'quest',body:'',quest:{...newQuest(state,filter==='all'?defaultCategory(cats):filter),rank:-1},updatedAt:now};
   return {...w,entries:[...w.entries,...extra,page]};
  });
  if(ok!==false){setSelected(id);setMode('journal');}
 }
 function drop(e:DragEvent,state:QuestState,before:string|null){
  e.preventDefault();const id=e.dataTransfer.getData('text/quest')||dragging;setDragging(null);setDropAt(null);
  if(id)change(w=>moveQuest(w,worldId,campaign.id,id,state,before));
 }
 const over=(e:DragEvent,state:QuestState,before:string|null)=>{if(!dragging)return;e.preventDefault();e.stopPropagation();if(dropAt?.state!==state||dropAt.before!==before)setDropAt({state,before});};

 return <section className="page-content quests-page">
  <div className="quests-head">
   <h1>Quests</h1>
   <div className="segmented" role="group" aria-label="Quest view"><button className={mode==='board'?'on':''} aria-pressed={mode==='board'} onClick={()=>setMode('board')}><Columns3 size={14}/> Board</button><button className={mode==='journal'?'on':''} aria-pressed={mode==='journal'} onClick={()=>setMode('journal')}><BookOpen size={14}/> Journal</button></div>
   <span className="quests-spacer"/>
   <button className="button primary" onClick={()=>create('active')}><Plus size={16}/> New quest</button>
  </div>
  <div className="quests-filters">
   <div className="quest-chips" role="group" aria-label="Show quests">
    <button className={filter==='all'?'on':''} aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>All <b>{all.length}</b></button>
    {cats.map(c=><button key={c.id} className={filter===c.id?'on':''} aria-pressed={filter===c.id} onClick={()=>setFilter(c.id)}><span className={`quest-cat-dot cat-${c.color}`} aria-hidden="true"/>{c.name} <b>{all.filter(q=>q.quest.type===c.id).length}</b></button>)}
    <button className="quest-chips-edit" onClick={()=>setEditing(true)}><Tags size={14}/> Categories</button>
   </div>
   <p className="muted">{mode==='board'?'Drag a card to change its state. Players only see quests you share, and only the steps you haven’t hidden.':'Tick steps off and write what happened. Players see the entries you share.'}</p>
  </div>
  {mode==='board'?<div className="quest-board">{questStates.map(state=>{const cards=shown(column(data,worldId,campaign.id,state));return <div key={state} className={`quest-column ${dropAt?.state===state?'drop-target':''}`} onDragOver={e=>over(e,state,null)} onDrop={e=>drop(e,state,dropAt?.state===state?dropAt.before:null)}>
    <div className="quest-column-head"><strong>{stateNames[state]}</strong><span>{cards.length}</span><button className="icon-button" aria-label={`New quest in ${stateNames[state]}`} onClick={()=>create(state)}><Plus size={15}/></button></div>
    {cards.map(({entry,quest:q})=>{const p=questProgress(q),giver=byId(q.giverId),place=byId(q.placeId),closed=state==='done'||state==='failed',step=closed?(q.objectives.at(-1)?.text??''):nextStep(q);
     return <div key={entry.id} className="quest-card-slot" onDragOver={e=>{const r=e.currentTarget.getBoundingClientRect();const i=cards.findIndex(c=>c.entry.id===entry.id);over(e,state,e.clientY<r.top+r.height/2?entry.id:cards[i+1]?.entry.id??null);}}>
      {dropAt?.state===state&&dropAt.before===entry.id&&dragging!==entry.id&&<div className="quest-drop-line"/>}
      <button className={`quest-card ${dragging===entry.id?'dragging':''} ${closed?'closed':''}`} draggable onDragStart={e=>{e.dataTransfer.setData('text/quest',entry.id);e.dataTransfer.effectAllowed='move';setDragging(entry.id);}} onDragEnd={()=>{setDragging(null);setDropAt(null);}} onClick={()=>{setSelected(entry.id);setMode('journal');}}>
       <span className="quest-card-top"><CategoryChip category={categoryOf(cats,q.type)}/>{entry.overviewVisibility==='players'?<span className="quest-shared"><Eye size={11}/> Shared</span>:null}{place&&<span className="quest-place"><MapPin size={11}/> {place.title}</span>}<GripVertical className="quest-grip" size={14} aria-hidden="true"/></span>
       <strong className="quest-title">{entry.title}</strong>
       {step&&<span className={`quest-step ${state==='failed'?'struck':''}`}>{step}</span>}
       {p.total>0&&<span className="quest-progress" role="img" aria-label={`${p.done} of ${p.total} steps done`}><span style={{width:`${p.done/p.total*100}%`}}/></span>}
       {(giver||q.reward)&&<span className="quest-card-foot">{giver?<><Face entry={giver} size={24}/><span>{giver.title}</span></>:<span/>}{q.reward&&<span className="quest-reward"><Gift size={12}/> {q.reward}</span>}</span>}
      </button>
     </div>;})}
    {dropAt?.state===state&&dropAt.before===null&&<div className="quest-drop-line"/>}
    {!cards.length&&<p className="quest-empty">{dragging?`Drop to mark it ${stateNames[state].toLowerCase()}`:'Nothing here yet.'}</p>}
   </div>;})}</div>
  :<QuestJournal data={data} campaign={campaign} categories={cats} quests={shown(all)} open={open?.entry} onSelect={setSelected} change={change} onOpen={onOpen} onNew={()=>create('active')} onEditCategories={()=>setEditing(true)}/>}
  {editing&&<QuestCategoriesDialog data={data} worldId={worldId} campaign={campaign} change={change} onClose={()=>setEditing(false)}/>}
 </section>;
}

function QuestJournal({data,campaign,categories,quests,open,onSelect,change,onOpen,onNew,onEditCategories}:{data:Workspace;campaign:Campaign;categories:QuestCategory[];quests:{entry:Entry;quest:Quest}[];open?:Entry;onSelect:(id:string)=>void;change:Change;onOpen:(id:string)=>void;onNew:()=>void;onEditCategories:()=>void}){
 const [query,setQuery]=useState(''),[closed,setClosed]=useState<Set<string>>(new Set(['done','failed']));
 const found=quests.filter(q=>q.entry.title.toLowerCase().includes(query.trim().toLowerCase()));
 const going=found.filter(q=>q.quest.state==='active'||q.quest.state==='rumour'),known=new Set(categories.map(c=>c.id));
 // Open quests are grouped by category in the campaign's order; closed ones by how they ended.
 const groups:[string,string,typeof found][]=[...categories.map(c=>[`cat:${c.id}`,`${c.name} quests`,going.filter(q=>q.quest.type===c.id)] as [string,string,typeof found]),['cat:?','Uncategorised quests',going.filter(q=>!known.has(q.quest.type))],['done','Completed',found.filter(q=>q.quest.state==='done')],['failed','Failed',found.filter(q=>q.quest.state==='failed')]];
 const page=useRef<HTMLDivElement>(null);
 // On a phone the list sits above the quest, so picking one scrolls down to it.
 const pick=(id:string)=>{onSelect(id);if(window.matchMedia('(max-width:760px)').matches)requestAnimationFrame(()=>page.current?.scrollIntoView({behavior:'smooth',block:'start'}));};
 const update=(id:string,patch:Partial<Entry>)=>change(w=>({...w,entries:w.entries.map(e=>e.id===id?{...e,...patch,updatedAt:new Date().toISOString()}:e)}));
 return <div className="quest-journal">
  <nav className="quest-list" aria-label="Quests">
   <label className="search-box"><Search size={15}/><input aria-label="Find a quest" placeholder="Find a quest" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   {groups.filter(([,,list])=>list.length||query).map(([id,label,list])=>{const shut=closed.has(id)&&!query;return <div key={id} className="quest-group"><button className="quest-group-head" aria-expanded={!shut} onClick={()=>setClosed(old=>{const n=new Set(old);if(n.has(id))n.delete(id);else n.add(id);return n;})}>{shut?<ChevronRight size={13}/>:<ChevronDown size={13}/>}<span>{label}</span><b>{list.length}</b></button>
    {!shut&&list.map(({entry,quest:q})=>{const place=q.placeId?data.entries.find(e=>e.id===q.placeId):undefined;return <button key={entry.id} className={`quest-list-item ${open?.id===entry.id?'on':''}`} aria-current={open?.id===entry.id?'true':undefined} onClick={()=>pick(entry.id)}><Goal size={14}/><span><strong>{entry.title}</strong><small>{[q.state==='rumour'?'Rumour':null,place?.title].filter(Boolean).join(' · ')||' '}</small></span></button>;})}
   </div>;})}
   {!quests.length&&<p className="muted">No quests yet.</p>}
   <button className="text-button" onClick={onNew}><Plus size={14}/> New quest</button>
  </nav>
  <div className="quest-journal-page" ref={page}>{open?<QuestDetail key={open.id} entry={open} data={data} campaign={campaign} update={patch=>update(open.id,patch)} onOpen={onOpen} onEditCategories={onEditCategories} withTitle/>:<div className="quest-empty-page"><h2>No quest chosen</h2><p className="muted">Pick one on the left, or start a new quest.</p></div>}</div>
 </div>;
}

/**
 * One quest: its state, the steps, the journal log and who gave it.
 * Shown in the journal and at the top of a quest's own page.
 */
export function QuestDetail({entry,data,campaign,update,change,onOpen,onEditCategories,withTitle=false}:{entry:Entry;data:Workspace;campaign?:Campaign;update:(p:Partial<Entry>)=>void;change?:Change;onOpen:(id:string)=>void;onEditCategories?:()=>void;withTitle?:boolean}){
 const [editing,setEditing]=useState(false),cats=questCategories(campaign??data.campaigns.find(c=>c.id===entry.campaignId));
 // The board passes its own dialog; a quest's own page shows one here.
 const editCategories=onEditCategories??(campaign&&change?()=>setEditing(true):undefined);
 const q=quest(entry),[step,setStep]=useState(''),[log,setLog]=useState(''),[label,setLabel]=useState(''),[players,setPlayers]=useState(true),[title,setTitle]=useState(entry.title);
 const set=(patch:Partial<Quest>)=>update({quest:{...q,...patch}});
 const scope=data.entries.filter(e=>e.worldId===entry.worldId&&(e.campaignId===null||e.campaignId===entry.campaignId)&&e.id!==entry.id);
 const people=scope.filter(e=>e.kind==='character').sort((a,b)=>a.title.localeCompare(b.title)),places=scope.filter(e=>e.kind==='place'||e.kind==='map').sort((a,b)=>a.title.localeCompare(b.title));
 const giver=q.giverId?data.entries.find(e=>e.id===q.giverId):undefined,place=q.placeId?data.entries.find(e=>e.id===q.placeId):undefined;
 const shared=entry.overviewVisibility==='players';
 const sessions=scope.filter(e=>e.kind==='session'&&e.campaignId===entry.campaignId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 function addStep(){const text=step.trim();if(!text||q.objectives.length>=50)return;set({objectives:[...q.objectives,{id:newId(),text:text.slice(0,300),done:false}]});setStep('');}
 function addLog(){const text=log.trim();if(!text)return;set({log:[{id:newId(),at:new Date().toISOString(),label:label.trim().slice(0,80)||undefined,text:text.slice(0,4000),players},...q.log].slice(0,500)});setLog('');}
 const progress=questProgress(q);
 return <div className="quest-detail">
  <div className="quest-detail-chips">
   <CategoryPicker categories={cats} value={q.type} onChange={type=>set({type})} onEdit={editCategories}/>
   <label className="quest-state-pick"><select aria-label="Quest state" value={q.state} onChange={e=>set({state:e.target.value as QuestState,rank:-1})}>{questStates.map(s=><option key={s} value={s}>{s==='rumour'?'Rumour':stateNames[s]}</option>)}</select></label>
   <button className={`quest-share ${shared?'on':''}`} aria-pressed={shared} onClick={()=>update({overviewVisibility:shared?'gm':'players'})}>{shared?<><Eye size={12}/> Shared with players</>:<><EyeOff size={12}/> GM only</>}</button>
   {withTitle&&<button className="text-button quest-open" onClick={()=>onOpen(entry.id)}>Open page <ArrowUpRight size={13}/></button>}
  </div>
  {withTitle&&<input className="quest-title-input" aria-label="Quest name" value={title} maxLength={160} onChange={e=>{setTitle(e.target.value);if(e.target.value.trim())update({title:e.target.value.trim()});}} onBlur={()=>setTitle(entry.title)}/>}
  <div className="quest-detail-grid">
   <div className="quest-detail-main">
    {withTitle&&entry.body.trim()&&<div className="prose quest-summary"><ArticleBody entry={entry} data={data} onOpen={onOpen} onChange={body=>update({body})}/></div>}
    <div className="quest-objectives">
     <div className="quest-objectives-head"><span className="eyebrow">Objectives</span>{progress.total>0&&<small>{progress.done} of {progress.total}</small>}</div>
     {q.objectives.map((o,i)=><div key={o.id} className={`quest-objective ${o.done?'done':''}`}>
      <input type="checkbox" aria-label={`Done: ${o.text}`} checked={o.done} onChange={e=>set({objectives:q.objectives.map(x=>x.id===o.id?{...x,done:e.target.checked}:x)})}/>
      <textarea className="quest-objective-text" rows={1} aria-label={`Step ${i+1}`} defaultValue={o.text} maxLength={300} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}} onBlur={e=>{const text=e.target.value.trim();if(text&&text!==o.text)set({objectives:q.objectives.map(x=>x.id===o.id?{...x,text}:x)});else e.target.value=o.text;}}/>
      <button className={`quest-hide ${o.hidden?'on':''}`} aria-pressed={!!o.hidden} title={o.hidden?'Players can’t see this step':'Hide this step from players'} onClick={()=>set({objectives:q.objectives.map(x=>x.id===o.id?{...x,hidden:!x.hidden||undefined}:x)})}>{o.hidden?<><EyeOff size={12}/> Hidden</>:<EyeOff size={13} aria-label="Hide from players"/>}</button>
      <button className="icon-button quest-remove" aria-label={`Remove step ${o.text}`} onClick={()=>set({objectives:q.objectives.filter(x=>x.id!==o.id)})}><X size={13}/></button>
     </div>)}
     <form className="quest-add-step" onSubmit={e=>{e.preventDefault();addStep();}}><Plus size={14}/><input aria-label="Add a step" placeholder="Add a step…" value={step} maxLength={300} onChange={e=>setStep(e.target.value)}/></form>
    </div>
    <form className="quest-log-composer" onSubmit={e=>{e.preventDefault();addLog();}}>
     <textarea aria-label="Add to the log" placeholder="Add to the log. What happened?" value={log} maxLength={4000} rows={log?3:1} onChange={e=>setLog(e.target.value)}/>
     <div className="quest-log-tools">
      <input aria-label="When" placeholder={sessions[0]?.title??'Session or date'} list={`quest-when-${entry.id}`} value={label} maxLength={80} onChange={e=>setLabel(e.target.value)}/>
      <datalist id={`quest-when-${entry.id}`}>{sessions.slice(0,8).map(s=><option key={s.id} value={s.title}/>)}</datalist>
      <button type="button" className={`quest-share ${players?'on':''}`} aria-pressed={players} onClick={()=>setPlayers(!players)}>{players?<><Eye size={12}/> Players see this</>:<><EyeOff size={12}/> GM only</>}</button>
      <button className="button small primary" type="submit" disabled={!log.trim()}>Add to log</button>
     </div>
    </form>
    <ol className="quest-log">{q.log.map(l=><li key={l.id}>
     <div className="quest-log-when"><strong>{l.label||new Date(l.at).toLocaleDateString(undefined,{day:'numeric',month:'short'})}</strong>{l.label&&<small>{new Date(l.at).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}</small>}</div>
     <div className="quest-log-text"><div className="prose"><ArticleBody entry={{...entry,body:l.text}} data={data} onOpen={onOpen} onChange={text=>set({log:q.log.map(x=>x.id===l.id?{...x,text}:x)})}/></div>
      <div className="quest-log-actions"><button className={`quest-share ${l.players?'on':'gm'}`} aria-pressed={l.players} onClick={()=>set({log:q.log.map(x=>x.id===l.id?{...x,players:!x.players}:x)})}>{l.players?<><Eye size={12}/> Players see this entry</>:<><EyeOff size={12}/> GM only entry</>}</button><button className="icon-button" aria-label="Delete log entry" onClick={async()=>{if(await confirmDialog({title:'Delete this log entry?',confirm:'Delete entry',danger:true}))set({log:q.log.filter(x=>x.id!==l.id)});}}><Trash2 size={13}/></button></div></div>
    </li>)}</ol>
    {!q.log.length&&<p className="aside-hint">The log is empty. Write what the party learned or did, a session at a time.</p>}
   </div>
   <aside className="quest-facts">
    <div className="quest-fact"><span className="eyebrow">Given by</span>
    {giver?<button className="quest-giver" onClick={()=>onOpen(giver.id)}><Face entry={giver} size={40}/><span><strong>{giver.title}</strong><small>{giver.character?.group||giver.character?.faction||'Character'}</small></span></button>:null}
    <select aria-label="Given by" value={q.giverId??''} onChange={e=>set({giverId:e.target.value||null})}><option value="">{giver?'Nobody':'Choose a character…'}</option>{people.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
    <div className="quest-fact"><span className="eyebrow">Reward</span>
    <input aria-label="Reward" placeholder="120 gp, a favour…" defaultValue={q.reward??''} maxLength={300} onBlur={e=>{const reward=e.target.value.trim();if(reward!==(q.reward??''))set({reward:reward||undefined});}}/></div>
    <div className="quest-fact"><span className="eyebrow">Place</span>
    {place&&<button className="quest-place-link" onClick={()=>onOpen(place.id)}><MapPin size={13}/> {place.title}</button>}
    <select aria-label="Place" value={q.placeId??''} onChange={e=>set({placeId:e.target.value||null})}><option value="">{place?'No place':'Choose a place…'}</option>{places.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
   </aside>
  </div>
  {editing&&campaign&&change&&<QuestCategoriesDialog data={data} worldId={entry.worldId} campaign={campaign} change={change} onClose={()=>setEditing(false)}/>}
 </div>;
}
