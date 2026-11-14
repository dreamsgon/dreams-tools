"use client";
/*
 * A quest's goals, written as sentences: a verb, a target (a page or just a name) and an optional second part, such as
 * "Find Arin Vale, last seen at the Old Mill". Each goal has its own status and its own eye for players.
 * Pickers open under their button on a computer and as a sheet from the bottom of the screen on a phone, so nothing
 * needs dragging; on a computer a page can still be dragged from the sidebar onto a target.
 */
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowDown,ArrowUp,BookOpen,Check,ChevronDown,Eye,EyeOff,FlaskConical,Flag,Handshake,LifeBuoy,Lock,MapPin,MessageCircle,MoreHorizontal,Package,PenLine,Plus,RotateCcw,Search,Shield,StickyNote,Swords,Trash2,Users,X} from 'lucide-react';
import './quest-goals.css';
import {newId,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {goalStatus,goalStatusNames,goalStatuses,goalText,goalVerbs,setGoalParts,whereLabel,withGoalStatus,type GoalStatus,type Objective,type Quest} from '@/lib/encyclopedia/quests';
import {PictureToken,usePictureSrc} from './character-picture';
import {PageDrop} from './page-drag';
import {confirmDialog} from '../confirm-dialog';

const verbIcons:Record<string,typeof Search>={Find:Search,Rescue:LifeBuoy,Recover:RotateCcw,Deliver:Package,Investigate:FlaskConical,Defeat:Swords,Escort:Users,Reach:Flag,Protect:Shield,Persuade:MessageCircle,Learn:BookOpen,Meet:Handshake};
export const VerbIcon=({verb,size=15}:{verb?:string;size?:number})=>{const I=(verb&&verbIcons[verb])||PenLine;return <I size={size} aria-hidden="true"/>;};

/** A small round face: the page's picture when it has one, otherwise its initials. */
export function Face({entry,size=26}:{entry?:Entry;size?:number}){
 const {src}=usePictureSrc(entry?.picture?.imageId);
 if(entry?.picture&&src)return <PictureToken picture={entry.picture} src={src} size={size} ring="var(--line-strong)"/>;
 const initials=(entry?.title??'?').split(/\s+/).filter(w=>/^\p{L}/u.test(w)).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
 return <span className="quest-face" aria-hidden="true" style={{width:size,height:size,fontSize:size*.4}}>{initials}</span>;
}

/** The header's progress: one segment per goal that counts, coloured by how it went. */
export function GoalBar({quest}:{quest:Quest}){
 const counted=quest.objectives.filter(o=>goalStatus(o)!=='dropped');
 if(!counted.length)return null;
 const done=counted.filter(o=>o.done).length;
 return <span className="goal-bar" role="img" aria-label={`${done} of ${counted.length} goals done`}>
  <span className="goal-bar-cells" aria-hidden="true">{counted.slice(0,20).map(o=><i key={o.id} className={`${goalStatus(o)}${o.hidden?' hidden':''}`}/>)}</span>
  <span><b>{done} of {counted.length}</b> goals done</span>
 </span>;
}

/** Closes a popover on Escape or a press outside it. */
function useDismiss(open:boolean,box:React.RefObject<HTMLElement|null>,close:()=>void){
 useEffect(()=>{
  if(!open)return;
  // The anchor around the popover holds the button that opened it, so pressing that button again only toggles it.
  const away=(e:PointerEvent)=>{const host=box.current?.parentElement??box.current;if(host&&!host.contains(e.target as Node))close();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();close();}};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',key,true);};
 },[open,box,close]);
}

/** A picker: a popover under its button on a computer, a sheet from the bottom on a phone. */
function Popover({label,onClose,children,wide=false}:{label:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
 const box=useRef<HTMLDivElement>(null),[up,setUp]=useState(false);
 useDismiss(true,box,onClose);
 // On a computer it opens upward when there's no room below it; on a phone it is a sheet and stays put.
 useLayoutEffect(()=>{const el=box.current;if(!el||getComputedStyle(el).position==='fixed')return;const r=el.getBoundingClientRect();if(r.bottom>window.innerHeight-8&&r.top-r.height-48>0)setUp(true);else el.scrollIntoView?.({block:'nearest'});},[]);
 return <><div className="goal-scrim" aria-hidden="true" onPointerDown={e=>{e.preventDefault();onClose();}}/><div ref={box} className={`goal-pop${wide?' wide':''}${up?' up':''}`} role="dialog" aria-label={label}><span className="goal-pop-grab" aria-hidden="true"/><div className="goal-pop-head"><strong>{label}</strong><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={15}/></button></div>{children}</div></>;
}

function VerbPicker({current,onPick,onWrite,onClose}:{current?:string;onPick:(verb:string)=>void;onWrite?:()=>void;onClose:()=>void}){
 const [own,setOwn]=useState(current&&!goalVerbs.some(v=>v.name===current)?current:'');
 return <Popover label="What must the party do?" onClose={onClose} wide>
  <div className="goal-verbs">{goalVerbs.map(v=><button type="button" key={v.name} aria-pressed={current===v.name} onClick={()=>onPick(v.name)}><VerbIcon verb={v.name} size={18}/>{v.name}</button>)}</div>
  <form className="goal-own-verb" onSubmit={e=>{e.preventDefault();const w=own.trim();if(w)onPick(w.slice(0,40));}}>
   <input aria-label="Your own word" placeholder="Or your own word, like Bribe" value={own} maxLength={40} onChange={e=>setOwn(e.target.value)}/>
   <button className="button small" type="submit" disabled={!own.trim()}>Use</button>
  </form>
  {onWrite&&<button type="button" className="text-button goal-write" onClick={onWrite}><PenLine size={14}/> Write the goal out instead</button>}
 </Popover>;
}

export const kindName=(e:Entry)=>e.kind==='character'?(e.character?.role==='creature'?'Creature':'Character'):e.kind==='faction'?'Organization':e.kind==='map'?'Map':e.kind==='place'?'Place':e.kind==='quest'?'Quest':e.kind==='session'?'Session':'Page';

export function TargetPicker({label,pages,current,onPage,onName,onClear,onClose}:{label:string;pages:Entry[];current?:string;onPage:(id:string)=>void;onName?:(name:string)=>void;onClear?:()=>void;onClose:()=>void}){
 const [query,setQuery]=useState(current??'');
 const q=query.trim().toLowerCase();
 const found=useMemo(()=>(q?pages.filter(e=>e.title.toLowerCase().includes(q)).sort((a,b)=>Number(!a.title.toLowerCase().startsWith(q))-Number(!b.title.toLowerCase().startsWith(q))):pages).slice(0,30),[pages,q]);
 const exact=pages.find(e=>e.title.toLowerCase()===q);
 return <Popover label={label} onClose={onClose}>
  <label className="goal-search"><Search size={14}/><input autoFocus aria-label="Search pages, or type a name" placeholder={onName?'Search pages, or type a name':'Search pages'} value={query} maxLength={160} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(found[0])onPage(found[0].id);else if(query.trim()&&onName)onName(query.trim());}}}/></label>
  <ul className="goal-pick-list">
   {found.map(e=><li key={e.id}><button type="button" onClick={()=>onPage(e.id)}>{e.kind==='character'||e.kind==='faction'?<Face entry={e} size={26}/>:<span className="goal-pick-icon"><MapPin size={14}/></span>}<span><strong>{e.title}</strong><small>{kindName(e)}</small></span></button></li>)}
   {query.trim()&&!exact&&onName&&<li><button type="button" onClick={()=>onName(query.trim())}><span className="goal-pick-icon"><PenLine size={14}/></span><span><strong>Use “{query.trim()}” as a name</strong><small>No page, just words in the goal</small></span></button></li>}
   {!found.length&&(!query.trim()||!onName)&&<li className="goal-pick-none">{query.trim()?'No pages match.':onName?'No pages in this campaign yet. Type a name.':'No pages in this campaign yet.'}</li>}
  </ul>
  {onClear&&<button type="button" className="text-button goal-write" onClick={onClear}><X size={14}/> Remove</button>}
 </Popover>;
}

/** A target or second part: the page with its face, or the typed name, or an empty slot. Takes a page dragged from the sidebar. */
function PartChip({id,name,page,empty,onOpen,canDrop,onDropPage,children}:{id?:string|null;name?:string;page?:Entry;empty:string;onOpen:()=>void;canDrop:(id:string)=>string|null;onDropPage:(id:string)=>void;children?:ReactNode}){
 const [refused,setRefused]=useState('');
 const body=page?<button type="button" className="goal-chip" onClick={onOpen}>{page.kind==='character'||page.kind==='faction'?<Face entry={page} size={24}/>:<span className="goal-chip-icon"><MapPin size={13}/></span>}<span>{page.title}</span></button>
  :name?<button type="button" className="goal-chip named" title="Just a name. Choose it to link a page instead." onClick={onOpen}>{name}</button>
  :id?<button type="button" className="goal-chip named" onClick={onOpen}>A page that’s gone</button>
  :<button type="button" className="goal-chip empty" onClick={onOpen}><Plus size={13}/> {empty}</button>;
 return <PageDrop className="goal-drop" label="Drop to use this page" check={canDrop} onPage={onDropPage} onRefuse={setRefused}>{body}{children}{refused&&<span className="goal-refused" role="status">{refused}</span>}</PageDrop>;
}

/** A copy of a goal without some of its optional parts. */
const without=(o:Objective,...keys:(keyof Objective)[]):Objective=>{const c={...o};for(const k of keys)delete c[k];return c;};

type Picker={goal:string;what:'verb'|'target'|'where'|'status'|'more'}|{goal:'new';what:'verb'};

/** The goals of one quest. `set` saves the quest's goals. */
export function QuestGoals({entry,data,quest:q,setGoals}:{entry:Entry;data:Workspace;quest:Quest;setGoals:(objectives:Objective[])=>void}){
 const [picker,setPicker]=useState<Picker|null>(null),[noteFor,setNoteFor]=useState<string|null>(null),[writing,setWriting]=useState('');
 const close=()=>setPicker(null);
 const pages=useMemo(()=>data.entries.filter(e=>e.id!==entry.id&&e.kind!=='folder'&&e.worldId===entry.worldId&&(e.campaignId===null||e.campaignId===entry.campaignId)).sort((a,b)=>a.title.localeCompare(b.title)),[data.entries,entry.id,entry.worldId,entry.campaignId]);
 const byId=(id?:string|null)=>id?data.entries.find(e=>e.id===id):undefined;
 const title=(id:string)=>byId(id)?.title;
 const inScope=(id:string)=>pages.some(p=>p.id===id)?null:id===entry.id?'A quest can’t be its own goal.':'That page isn’t in this campaign.';
 const change=(id:string,f:(o:Objective)=>Objective)=>setGoals(q.objectives.map(o=>o.id===id?f(o):o));
 const parts=(id:string,patch:Parameters<typeof setGoalParts>[1])=>change(id,o=>setGoalParts(o,patch,title));
 const full=q.objectives.length>=50;
 function addGoal(verb:string){if(full)return;const id=newId();setGoals([...q.objectives,{id,verb,text:verb,done:false}]);setPicker({goal:id,what:'target'});}
 function writeGoal(){const text=writing.trim().slice(0,300);if(!text||full)return;setGoals([...q.objectives,{id:newId(),text,done:false}]);setWriting('');}
 function move(id:string,by:-1|1){const i=q.objectives.findIndex(o=>o.id===id),j=i+by;if(i<0||j<0||j>=q.objectives.length)return;const next=[...q.objectives];[next[i],next[j]]=[next[j],next[i]];setGoals(next);}

 return <section className="quest-goals" aria-label="Goals">
  <div className="quest-goals-head"><span className="eyebrow">Goals</span><small><Eye size={12}/> The eyes set what players see</small></div>
  {q.objectives.map((o,i)=>{
   const status=goalStatus(o),open=(what:Picker['what'])=>picker&&picker.goal===o.id&&picker.what===what;
   const target=byId(o.targetId),where=byId(o.whereId),label=whereLabel(o);
   return <article key={o.id} className={`quest-goal ${status}${o.hidden?' is-hidden':''}`}>
    <div className="quest-goal-top">
     <span className="quest-goal-n">Goal {i+1}</span>
     {o.hidden&&<span className="quest-goal-hidden"><Lock size={11}/> Hidden from players</span>}
     <span className="quest-goal-tools">
      <span className="goal-anchor">
       <button type="button" className={`goal-status ${status}`} aria-haspopup="menu" aria-expanded={!!open('status')} onClick={()=>setPicker(open('status')?null:{goal:o.id,what:'status'})}>{status==='done'&&<Check size={12}/>}{goalStatusNames[status]} <ChevronDown size={12}/></button>
       {open('status')&&<Menu onClose={close} label="Goal status">{goalStatuses.map(s=><button key={s} role="menuitemradio" aria-checked={s===status} className={`goal-status-item ${s}`} onClick={()=>{change(o.id,x=>withGoalStatus(x,s as GoalStatus));close();}}><span className={`goal-dot ${s}`}/>{goalStatusNames[s]}{s===status&&<Check size={13}/>}</button>)}</Menu>}
      </span>
      <button type="button" className={`icon-button goal-eye${o.hidden?' off':''}`} aria-pressed={!o.hidden} aria-label={o.hidden?'Show this goal to players':'Hide this goal from players'} title={o.hidden?'Players can’t see this goal':'Players can see this goal'} onClick={()=>change(o.id,x=>o.hidden?without(x,'hidden'):{...x,hidden:true})}>{o.hidden?<EyeOff size={15}/>:<Eye size={15}/>}</button>
      <span className="goal-anchor">
       <button type="button" className="icon-button" aria-label={`More for goal ${i+1}`} aria-haspopup="menu" aria-expanded={!!open('more')} onClick={()=>setPicker(open('more')?null:{goal:o.id,what:'more'})}><MoreHorizontal size={15}/></button>
       {open('more')&&<Menu onClose={close} label="Goal actions" right>
        <button role="menuitem" onClick={()=>{setNoteFor(o.id);close();}}><StickyNote size={14}/> {o.note?'Edit the note':'Add a note'}</button>
        {o.verb?<button role="menuitem" onClick={()=>{change(o.id,x=>({...without(x,'verb','targetId','target','whereId','where','whereLabel'),text:goalText(x,title)}));close();}}><PenLine size={14}/> Write it out instead</button>
         :<button role="menuitem" onClick={()=>{setPicker({goal:o.id,what:'verb'});}}><Flag size={14}/> Make it a verb and target</button>}
        <button role="menuitem" disabled={i===0} onClick={()=>{move(o.id,-1);close();}}><ArrowUp size={14}/> Move up</button>
        <button role="menuitem" disabled={i===q.objectives.length-1} onClick={()=>{move(o.id,1);close();}}><ArrowDown size={14}/> Move down</button>
        <button role="menuitem" className="danger" onClick={async()=>{close();if(await confirmDialog({title:'Remove this goal?',message:o.text,confirm:'Remove goal',danger:true}))setGoals(q.objectives.filter(x=>x.id!==o.id));}}><Trash2 size={14}/> Remove goal</button>
       </Menu>}
      </span>
     </span>
    </div>
    {o.verb?<div className="quest-goal-sentence">
     <span className="goal-anchor">
      <button type="button" className="goal-verb" aria-label={`What to do: ${o.verb}. Change`} onClick={()=>setPicker({goal:o.id,what:'verb'})}><VerbIcon verb={o.verb}/>{o.verb}<ChevronDown size={13}/></button>
      {open('verb')&&<VerbPicker current={o.verb} onClose={close} onPick={verb=>{parts(o.id,{verb});close();}}/>}
     </span>
     <span className="goal-anchor">
      <PartChip id={o.targetId} name={o.target} page={target} empty="Who or what?" onOpen={()=>setPicker({goal:o.id,what:'target'})} canDrop={inScope} onDropPage={id=>parts(o.id,{targetId:id,target:title(id)})}/>
      {open('target')&&<TargetPicker label={`${o.verb} who or what?`} pages={pages} current={target?.title??o.target} onClose={close} onPage={id=>{parts(o.id,{targetId:id,target:title(id)});close();}} onName={name=>{parts(o.id,{targetId:null,target:name.slice(0,160)});close();}} onClear={o.targetId||o.target?()=>{parts(o.id,{targetId:null,target:undefined});close();}:undefined}/>}
     </span>
     {(o.whereId||o.where)?<span className="goal-anchor goal-where"><span className="goal-joiner">{label}</span>
      <PartChip id={o.whereId} name={o.where} page={where} empty="" onOpen={()=>setPicker({goal:o.id,what:'where'})} canDrop={inScope} onDropPage={id=>parts(o.id,{whereId:id,where:title(id)})}/>
      {open('where')&&<TargetPicker label={`${o.verb} ${o.target||target?.title||''}, ${label}…`} pages={pages} current={where?.title??o.where} onClose={close} onPage={id=>{parts(o.id,{whereId:id,where:title(id)});close();}} onName={name=>{parts(o.id,{whereId:null,where:name.slice(0,160)});close();}} onClear={()=>{parts(o.id,{whereId:null,where:undefined});close();}}/>}
     </span>
     :<span className="goal-anchor"><button type="button" className="goal-add-part" onClick={()=>setPicker({goal:o.id,what:'where'})}><Plus size={13}/> {label}…</button>
      {open('where')&&<TargetPicker label={`${o.verb} ${o.target||target?.title||''}, ${label}…`} pages={pages} onClose={close} onPage={id=>{parts(o.id,{whereId:id,where:title(id)});close();}} onName={name=>{parts(o.id,{whereId:null,where:name.slice(0,160)});close();}}/>}
     </span>}
    </div>
    :<div className="goal-anchor"><textarea className="quest-goal-text" rows={1} aria-label={`Goal ${i+1}`} defaultValue={o.text} maxLength={300} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}} onBlur={e=>{const text=e.target.value.trim();if(text&&text!==o.text)change(o.id,x=>({...x,text}));else e.target.value=o.text;}}/>
     {open('verb')&&<VerbPicker onClose={close} onPick={verb=>{parts(o.id,{verb,target:o.text.replace(/^\S+\s*/,'')||undefined});close();}}/>}</div>}
    {(o.note||noteFor===o.id)&&<textarea className="quest-goal-note" rows={1} aria-label={`Note for goal ${i+1}`} placeholder="What to do, or where to start" defaultValue={o.note??''} maxLength={600} autoFocus={noteFor===o.id&&!o.note} onBlur={e=>{const note=e.target.value.trim();setNoteFor(null);if(note!==(o.note??''))change(o.id,x=>note?{...x,note}:without(x,'note'));}}/>}
   </article>;})}
  {!q.objectives.length&&<p className="aside-hint">No goals yet. Add what the party has to do: find someone, recover something, reach a place.</p>}
  <div className="quest-goals-add">
   <span className="goal-anchor">
    <button type="button" className="button small primary" disabled={full} onClick={()=>setPicker({goal:'new',what:'verb'})}><Plus size={14}/> Add goal</button>
    {picker?.goal==='new'&&<VerbPicker onClose={close} onPick={verb=>{close();addGoal(verb);}} onWrite={()=>{close();requestAnimationFrame(()=>document.getElementById(`goal-write-${entry.id}`)?.focus());}}/>}
   </span>
   <form className="quest-goals-write" onSubmit={e=>{e.preventDefault();writeGoal();}}><input id={`goal-write-${entry.id}`} aria-label="Write a goal out" placeholder="or write one out…" value={writing} maxLength={300} disabled={full} onChange={e=>setWriting(e.target.value)}/></form>
  </div>
 </section>;
}

function Menu({label,onClose,right=false,children}:{label:string;onClose:()=>void;right?:boolean;children:ReactNode}){
 const box=useRef<HTMLDivElement>(null);
 useDismiss(true,box,onClose);
 return <div ref={box} className={`goal-menu${right?' right':''}`} role="menu" aria-label={label}>{children}</div>;
}
