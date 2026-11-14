"use client";
import {useRef,useState,type DragEvent} from 'react';
import {Columns3,BookOpen,Plus,Search,Eye,EyeOff,MapPin,Gift,GripVertical,ChevronDown,ChevronRight,Goal,ArrowUpRight,Tags,Lock} from 'lucide-react';
import {newId,type Entry,type Workspace,type Campaign} from '@/lib/encyclopedia/world-model';
import {categoryOf,column,defaultCategory,moveQuest,newQuest,nextStep,questCategories,questProgress,questsIn,questStates,stateNames,type Quest,type QuestCategory,type QuestState} from '@/lib/encyclopedia/quests';
import {categoryLook,CategoryChip,CategoryPicker,QuestCategoriesDialog} from './quest-categories';
import {ArticleBody} from './article-body';
import {Face,GoalBar,QuestGoals} from './quest-goals';
import {QuestFacts,QuestPrep} from './quest-facts';
import {QuestLogPanel} from './quest-log';
import {QuestConnections} from './quest-connections';
import {questConnections} from '@/lib/encyclopedia/quest-connections';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
/** 'all', or a quest category id. */
type Filter=string;

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
    {cats.map(c=><button key={c.id} className={filter===c.id?'on':''} aria-pressed={filter===c.id} onClick={()=>setFilter(c.id)}><span className={`quest-cat-dot ${categoryLook(c.color).className}`} style={categoryLook(c.color).style} aria-hidden="true"/>{c.name} <b>{all.filter(q=>q.quest.type===c.id).length}</b></button>)}
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
 const [tab,setTab]=useState<'overview'|'log'|'connections'|'gm'>('overview');
 const q=quest(entry),[title,setTitle]=useState(entry.title);
 const set=(patch:Partial<Quest>)=>update({quest:{...q,...patch}});
 const connected=questConnections(data,{...entry,quest:q}).length;
 const shared=entry.overviewVisibility==='players';
 return <div className="quest-detail">
  <div className="quest-detail-chips">
   <CategoryPicker categories={cats} value={q.type} onChange={type=>set({type})} onEdit={editCategories}/>
   <label className="quest-state-pick"><select aria-label="Quest state" value={q.state} onChange={e=>set({state:e.target.value as QuestState,rank:-1})}>{questStates.map(s=><option key={s} value={s}>{s==='rumour'?'Rumour':stateNames[s]}</option>)}</select></label>
   <button className={`quest-share ${shared?'on':''}`} aria-pressed={shared} onClick={()=>update({overviewVisibility:shared?'gm':'players'})}>{shared?<><Eye size={12}/> Shared with players</>:<><EyeOff size={12}/> GM only</>}</button>
   <GoalBar quest={q}/>
   {withTitle&&<button className="text-button quest-open" onClick={()=>onOpen(entry.id)}>Open page <ArrowUpRight size={13}/></button>}
  </div>
  {withTitle&&<input className="quest-title-input" aria-label="Quest name" value={title} maxLength={160} onChange={e=>{setTitle(e.target.value);if(e.target.value.trim())update({title:e.target.value.trim()});}} onBlur={()=>setTitle(entry.title)}/>}
  <div className="quest-tabs" role="tablist" aria-label="Quest">
   <button role="tab" aria-selected={tab==='overview'} onClick={()=>setTab('overview')}>Overview</button>
   <button role="tab" aria-selected={tab==='log'} onClick={()=>setTab('log')}>Log{q.log.length>0&&<span className="count">{q.log.length}</span>}</button>
   <button role="tab" aria-selected={tab==='connections'} onClick={()=>setTab('connections')}>Connections{connected>0&&<span className="count">{connected}</span>}</button>
   <button role="tab" aria-selected={tab==='gm'} onClick={()=>setTab('gm')}><Lock size={13} className="lock"/> GM</button>
  </div>
  {tab==='overview'&&<div className="quest-overview">
   <div className="quest-detail-main">
    {withTitle&&entry.body.trim()&&<div className="prose quest-summary"><ArticleBody entry={entry} data={data} onOpen={onOpen} onChange={body=>update({body})}/></div>}
    <QuestGoals entry={entry} data={data} quest={q} setGoals={objectives=>set({objectives})}/>
   </div>
   <QuestFacts entry={entry} data={data} quest={q} set={set} onOpen={onOpen}/>
  </div>}
  {tab==='log'&&<QuestLogPanel entry={entry} data={data} quest={q} set={set} onOpen={onOpen}/>}
  {tab==='connections'&&<QuestConnections entry={entry} data={data} quest={q} set={set} onOpen={onOpen}/>}
  {tab==='gm'&&<QuestPrep entry={entry} data={data} quest={q} set={set} onOpen={onOpen}/>}
  {editing&&campaign&&change&&<QuestCategoriesDialog data={data} worldId={entry.worldId} campaign={campaign} change={change} onClose={()=>setEditing(false)}/>}
 </div>;
}
