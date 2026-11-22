'use client';
/*
 * A timeline page's Timeline tab (lib/encyclopedia/timelines.ts): the overview strip, eras and events in order, and the
 * GM's editing (an event, the eras, the timeline's settings). Players get the same view of their copy (PlayerTimeline).
 */
import {useMemo,useState,type CSSProperties,type ReactNode} from 'react';
import {BookOpen,CalendarDays,ChevronDown,ChevronUp,EyeOff,Layers,ListFilter,Milestone,Pencil,Plus,ScrollText,Search,Settings2,Star,Trash2,X} from 'lucide-react';
import {newId,visibleEntries,type Campaign,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {eraOf,newTimeline,readTimeline,restyle,STYLE_HINTS,STYLE_LABELS,TIMELINE_COLORS,timelineSchema,timelineStyles,type Timeline,type TimelineEra,type TimelineEvent,type TimelineItem,type TimelineView,type TimelineWhen} from '@/lib/encyclopedia/timelines';
import {idsForSaving,namesForEditing} from '@/lib/encyclopedia/link-names';
import {ToolDialog} from './tool-dialog';
import {confirmDialog} from '../confirm-dialog';
import './timeline.css';

type Page={id:string;title:string};

// ---- Text with [[links]] ------------------------------------------------------------------------

const LINK=/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g;
/** Short text: paragraphs, and [[links]] to pages the reader can open (by id or by name). Other links show their label. */
function LinkedText({text,pages,open}:{text:string;pages:readonly Page[];open:(id:string)=>void}){
 const find=(target:string)=>pages.find(p=>p.id===target)??pages.find(p=>p.title.toLowerCase()===target.trim().toLowerCase());
 return <>{text.trim().split(/\n\s*\n/).map((para,i)=>{
  const out:ReactNode[]=[];let at=0;
  for(const m of para.matchAll(LINK)){
   out.push(para.slice(at,m.index));const page=find(m[1]),label=(m[2]??'').trim()||page?.title||m[1];
   out.push(page?<button key={m.index} type="button" className="wiki-link" onClick={()=>open(page.id)}>{label}</button>:label);
   at=m.index!+m[0].length;
  }
  out.push(para.slice(at));
  return <p key={i}>{out}</p>;
 })}</>;
}

// ---- The view -----------------------------------------------------------------------------------

const played=(d:string)=>new Date(`${d}T12:00:00`).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});
const span=(view:TimelineView)=>{
 const years=[...view.items.flatMap(i=>i.year===undefined?[]:[i.year]),...view.eras.flatMap(e=>e.end===undefined?[e.start]:[e.start,e.end]),...(view.now?[view.now.year]:[])];
 if(!years.length)return null;
 const lo=Math.min(...years),hi=Math.max(...years);
 return hi>lo?{lo,hi}:null;
};

/**
 * Where a year sits on the strip, 0 to 1. Each stretch between era boundaries gets room by the square root of its
 * length, so a short recent era isn't a sliver beside thousands of years of myth.
 */
function stripScale(view:TimelineView,lo:number,hi:number){
 const stops=[...new Set([lo,hi,...view.eras.flatMap(e=>[e.start,...(e.end===undefined?[]:[e.end])])].filter(y=>y>=lo&&y<=hi))].sort((a,b)=>a-b);
 const w=stops.slice(1).map((y,i)=>Math.sqrt(y-stops[i])),total=w.reduce((a,b)=>a+b,0)||1;
 return (y:number)=>{let at=0;for(let i=1;i<stops.length;i++){if(y<=stops[i]){const len=stops[i]-stops[i-1];return (at+(len?w[i-1]*(y-stops[i-1])/len:0))/total;}at+=w[i-1];}return 1;};
}
/** The whole span at a glance: eras as bands, events as ticks, and today. */
function Strip({view,shown,onEra}:{view:TimelineView;shown:readonly TimelineItem[];onEra:(id:string)=>void}){
 const s=span(view);if(!s)return null;
 const scale=stripScale(view,s.lo,s.hi),at=(y:number)=>`${(0.01+scale(y)*0.98)*100}%`,cats=new Map(view.categories.map(c=>[c.id,c.color])),name=(y:number)=>view.yearNames[String(y)]??String(y);
 const ticks=[...new Map(shown.filter(i=>i.year!==undefined).map(i=>[`${i.year}-${i.major}`,i])).values()];
 return <div className="tl-strip" aria-label="The whole timeline at a glance">
  <div className="tl-strip-track">
   {view.eras.map(e=>{const end=Math.min(e.end??s.hi,s.hi);return <button key={e.id} type="button" className="tl-strip-era" title={`${e.name} · ${e.years}`} style={{left:at(e.start),width:`calc(${at(end)} - ${at(e.start)})`,'--era':e.color} as CSSProperties} onClick={()=>onEra(e.id)}><span>{e.name}</span></button>;})}
   {ticks.map(i=><span key={i.key} className={`tl-tick${i.major?' major':''}`} title={`${i.date} · ${i.title}`} style={{left:at(i.year!),background:i.categoryId?cats.get(i.categoryId):undefined}}/>)}
   {view.now&&<span className="tl-strip-now" style={{left:at(view.now.year)}} title={`Today: ${view.now.date}`}/>}
  </div>
  <div className="tl-strip-ends"><span>{name(s.lo)}</span><span>{view.now&&view.now.year===s.hi?`Today · ${view.now.date}`:name(s.hi)}</span></div>
 </div>;
}

function Card({item,view,pages,open,onEdit,compact}:{item:TimelineItem;view:TimelineView;pages:readonly Page[];open:(id:string)=>void;onEdit?:(id:string)=>void;compact:boolean}){
 const cat=item.categoryId?view.categories.find(c=>c.id===item.categoryId):undefined,title=(id:string)=>pages.find(p=>p.id===id)?.title;
 const Source=item.source==='session'?ScrollText:item.source==='calendar'?CalendarDays:item.source==='linked'?Milestone:null;
 return <li className={`tl-item${item.major?' major':''}${item.gm?' gm':''} src-${item.source}`} style={cat?{'--cat':cat.color} as CSSProperties:undefined}>
  <div className="tl-when">{item.date||(item.played?<span className="tl-played">Played {played(item.played)}</span>:<span className="tl-undated">—</span>)}</div>
  <span className="tl-node" aria-hidden="true">{item.major&&<Star size={10}/>}</span>
  <article className="tl-card">
   <div className="tl-card-top">
    <span className="tl-when-inline">{item.date||(item.played?`Played ${played(item.played)}`:'')}</span>
    {cat&&<span className="tl-cat"><i/>{cat.name}</span>}
    {Source&&<span className="tl-src"><Source size={11}/>{item.source==='session'?'Session':item.source==='calendar'?'Calendar':`From ${item.fromTitle}`}</span>}
    {item.gm&&<span className="tl-gm" title="Players don’t see this"><EyeOff size={11}/> GM only</span>}
    {onEdit&&item.source==='event'&&<button type="button" className="tl-edit" aria-label={`Edit ${item.title}`} onClick={()=>onEdit(item.id)}><Pencil size={13}/></button>}
   </div>
   <h3>{item.source==='session'||item.source==='linked'?<button type="button" className="tl-title-link" onClick={()=>open(item.source==='session'?item.id:item.fromId!)}>{item.title}</button>:item.title}</h3>
   {!compact&&item.text.trim()&&<div className="tl-text"><LinkedText text={item.text} pages={pages} open={open}/></div>}
   {!compact&&item.steps.length>0&&<ul className="tl-steps">{item.steps.map((s,i)=><li key={i}>{s}</li>)}</ul>}
   {!compact&&(item.pageIds.length>0||(item.sessionId&&item.source!=='session'))&&<div className="tl-pages">
    {item.pageIds.map(id=>title(id)?<button key={id} type="button" className="tl-page" onClick={()=>open(id)}>{title(id)}</button>:null)}
    {item.sessionId&&item.source!=='session'&&title(item.sessionId)&&<button type="button" className="tl-page session" onClick={()=>open(item.sessionId!)}><ScrollText size={11}/>{title(item.sessionId)}</button>}
   </div>}
  </article>
 </li>;
}

/** The Timeline tab's reading view, for the GM (with onEdit) and for players. */
export function TimelineReader({view,pages,open,onEdit,toolbar,empty}:{view:TimelineView;pages:readonly Page[];open:(id:string)=>void;onEdit?:(id:string)=>void;toolbar?:ReactNode;empty?:ReactNode}){
 const [query,setQuery]=useState(''),[cats,setCats]=useState<string[]>([]),[majorOnly,setMajorOnly]=useState(false),[compact,setCompact]=useState(false),[filters,setFilters]=useState(false);
 const q=query.trim().toLowerCase();
 const used=view.categories.filter(c=>view.items.some(i=>i.categoryId===c.id));
 const shown=view.items.filter(i=>(!majorOnly||i.major)&&(!cats.length||(i.categoryId&&cats.includes(i.categoryId)))&&(!q||`${i.title} ${i.text} ${i.date} ${i.steps.join(' ')} ${i.fromTitle??''}`.toLowerCase().includes(q)));
 const anyDated=view.items.some(i=>i.sort!==undefined);
 // Groups: one per era (in order of the items), the undated ones last.
 type Group={key:string;era?:TimelineView['eras'][number];undated?:boolean;items:TimelineItem[]};
 const groups:Group[]=[];
 for(const i of shown){const undated=anyDated&&i.sort===undefined,era=undated?undefined:eraOf(view.eras,i.year),key=undated?'undated':era?.id??'none',last=groups.at(-1);
  if(last&&last.key===key)last.items.push(i);else groups.push({key,era,undated,items:[i]});}
 const nowAfter=view.now?shown.filter(i=>i.sort!==undefined&&i.sort<=view.now!.sort).at(-1)?.key??'':null;
 const toEra=(id:string)=>document.getElementById(`tl-era-${id}`)?.scrollIntoView({behavior:'smooth',block:'start'});
 const filtering=!!(q||cats.length||majorOnly);
 return <div className="tl">
  <div className="tl-bar">
   <label className="tl-search"><Search size={14}/><input aria-label="Search this timeline" placeholder="Search the timeline" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={13}/></button>}</label>
   <button type="button" className={`tl-chip${filters||cats.length||majorOnly?' on':''}`} aria-expanded={filters} onClick={()=>setFilters(!filters)}><ListFilter size={13}/> Filter{cats.length+(majorOnly?1:0)?` · ${cats.length+(majorOnly?1:0)}`:''}</button>
   <div className="segmented tl-density" role="group" aria-label="How much to show"><button type="button" className={compact?'':'on'} onClick={()=>setCompact(false)}>Detailed</button><button type="button" className={compact?'on':''} onClick={()=>setCompact(true)}>Compact</button></div>
   {toolbar}
  </div>
  {filters&&<div className="tl-filters">
   <button type="button" className={`tl-chip${majorOnly?' on':''}`} aria-pressed={majorOnly} onClick={()=>setMajorOnly(!majorOnly)}><Star size={12}/> Major events</button>
   {used.map(c=><button key={c.id} type="button" className={`tl-chip cat${cats.includes(c.id)?' on':''}`} aria-pressed={cats.includes(c.id)} style={{'--cat':c.color} as CSSProperties} onClick={()=>setCats(cats.includes(c.id)?cats.filter(x=>x!==c.id):[...cats,c.id])}><i/>{c.name}</button>)}
   {filtering&&<button type="button" className="text-button" onClick={()=>{setCats([]);setMajorOnly(false);setQuery('');}}>Show everything</button>}
  </div>}
  <Strip view={view} shown={shown} onEra={toEra}/>
  {!view.items.length&&!view.eras.length?empty??<p className="muted">Nothing on this timeline yet.</p>
  :!shown.length?<p className="muted tl-none">Nothing matches. <button type="button" className="text-button" onClick={()=>{setCats([]);setMajorOnly(false);setQuery('');}}>Show everything</button></p>
  :<div className={`tl-body${compact?' compact':''}`}>
   {nowAfter===''&&<Now date={view.now!.date}/>}
   {groups.map((g,n)=><section key={`${g.key}-${n}`} className={`tl-group${g.era?' era':''}`} id={g.era&&groups.findIndex(x=>x.key===g.key)===n?`tl-era-${g.era.id}`:undefined} style={g.era?{'--era':g.era.color} as CSSProperties:undefined}>
    {g.era?<header className="tl-era-head"><span className="tl-era-years">{g.era.years}</span><h2>{g.era.name}{g.era.visibility==='gm'&&<span className="tl-gm"><EyeOff size={11}/> GM only</span>}</h2>{g.era.text.trim()&&!compact&&<div className="tl-era-text"><LinkedText text={g.era.text} pages={pages} open={open}/></div>}</header>
    :g.undated?<header className="tl-era-head plain"><h2>Not dated yet</h2></header>:null}
    <ol className="tl-list">{g.items.map(i=><Row key={i.key} item={i} now={view.now&&nowAfter===i.key?view.now.date:undefined}>{<Card item={i} view={view} pages={pages} open={open} onEdit={onEdit} compact={compact}/>}</Row>)}</ol>
   </section>)}
   {!filtering&&view.eras.filter(e=>!groups.some(g=>g.era?.id===e.id)).length>0&&<div className="tl-empty-eras">{view.eras.filter(e=>!groups.some(g=>g.era?.id===e.id)).map(e=><span key={e.id} id={`tl-era-${e.id}`} style={{'--era':e.color} as CSSProperties}><i/>{e.name} <small>{e.years}</small></span>)}<small className="muted">Eras with no events yet</small></div>}
  </div>}
 </div>;
}
function Row({children,now}:{item:TimelineItem;children:ReactNode;now?:string}){return <>{children}{now&&<Now date={now}/>}</>;}
function Now({date}:{date:string}){return <li className="tl-now" role="note"><span>Today in the world</span><strong>{date}</strong></li>;}

// ---- The GM's tab -------------------------------------------------------------------------------

const blankEvent=(t:Timeline):TimelineEvent=>({id:newId(),title:'',text:'',pageIds:[],visibility:t.visibility==='players'?'players':'gm',...(t.categories[0]?{categoryId:t.categories[0].id}:{})});

export function TimelineTab({entry,data,campaign,update,onOpen,setNotice}:{entry:Entry;data:Workspace;campaign?:Campaign;update:(p:Partial<Entry>)=>void;onOpen:(id:string)=>void;setNotice:(s:string)=>void}){
 const t=entry.timeline??newTimeline('history');
 const pages=useMemo(()=>visibleEntries(data,entry.worldId,campaign?.id??entry.campaignId).filter(e=>e.kind!=='folder'),[data,entry.worldId,entry.campaignId,campaign?.id]);
 const view=useMemo(()=>readTimeline({...entry,timeline:t},pages,campaign),[entry,t,pages,campaign]);
 // Shared lore can only point at shared lore; a campaign's timeline at its campaign's pages too.
 const linkable=useMemo(()=>pages.filter(p=>p.id!==entry.id&&(entry.campaignId===null?p.campaignId===null:true)),[pages,entry.id,entry.campaignId]);
 const [editing,setEditing]=useState<TimelineEvent|null>(null),[settings,setSettings]=useState(false),[eras,setEras]=useState(false);
 const save=(next:Timeline)=>{const ok=timelineSchema.safeParse(next);if(!ok.success){setNotice(ok.error.issues[0].message);return false;}update({timeline:ok.data});return true;};
 const calendar=t.calendarId?campaign?.calendars?.find(c=>c.id===t.calendarId):undefined;
 const toolbar=<div className="tl-gm-tools"><button type="button" className="button small primary" onClick={()=>setEditing(blankEvent(t))}><Plus size={14}/> Event</button><button type="button" className="button small" onClick={()=>setEras(true)}><Layers size={14}/> Eras{t.eras.length?` · ${t.eras.length}`:''}</button><button type="button" className="icon-button" aria-label="Timeline settings" title="Timeline settings" onClick={()=>setSettings(true)}><Settings2 size={15}/></button></div>;
 const gathered=[t.showSessions&&campaign?'sessions':'',t.showCalendar&&calendar?`${calendar.name} events`:'',t.focusId&&pages.find(p=>p.id===t.focusId)?`events naming ${pages.find(p=>p.id===t.focusId)!.title}`:''].filter(Boolean);
 return <div className="tl-tab">
  <p className="tl-summary"><span className="tl-style"><Milestone size={12}/>{STYLE_LABELS[t.style]}</span>{calendar?<span><CalendarDays size={12}/> {calendar.name}</span>:t.calendarId?<span className="tl-warn">Its calendar isn’t in this campaign</span>:null}{gathered.length>0&&<span>Gathers {gathered.join(', ')}</span>}</p>
  <TimelineReader view={view} pages={pages} open={onOpen} onEdit={id=>{const e=t.events.find(x=>x.id===id);if(e)setEditing({...e,text:namesForEditing(data,entry,e.text)});}} toolbar={toolbar}
   empty={<div className="tl-start"><Milestone size={26}/><h3>Start the timeline</h3><p>{STYLE_HINTS[t.style]}. Add events with a year, or a full date from {calendar?.name??'a calendar'}; group them into eras; link the pages they’re about.</p><div className="button-row"><button type="button" className="button primary" onClick={()=>setEditing(blankEvent(t))}><Plus size={14}/> Add an event</button><button type="button" className="button" onClick={()=>setEras(true)}><Layers size={14}/> Add eras</button><button type="button" className="button" onClick={()=>setSettings(true)}><Settings2 size={14}/> Type and calendar</button></div></div>}/>
  {editing&&<EventDialog key={editing.id} event={editing} timeline={t} calendar={calendar} pages={linkable} sessions={linkable.filter(p=>p.kind==='session')} onClose={()=>setEditing(null)}
   onSave={ev=>{const fixed={...ev,text:idsForSaving(data,entry,ev.text)};const exists=t.events.some(x=>x.id===ev.id);if(save({...t,events:exists?t.events.map(x=>x.id===ev.id?fixed:x):[...t.events,fixed]}))setEditing(null);}}
   onDelete={t.events.some(x=>x.id===editing.id)?async()=>{if(await confirmDialog({title:`Delete “${editing.title}”?`,message:'It comes off this timeline and any timeline that gathers it.',confirm:'Delete event',danger:true})){save({...t,events:t.events.filter(x=>x.id!==editing.id)});setEditing(null);}}:undefined}
   onMove={t.events.some(x=>x.id===editing.id)&&!editing.when?d=>{const i=t.events.findIndex(x=>x.id===editing.id),j=i+d;if(j<0||j>=t.events.length)return;const n=[...t.events];[n[i],n[j]]=[n[j],n[i]];save({...t,events:n});}:undefined}/>}
  {eras&&<ErasDialog timeline={t} onClose={()=>setEras(false)} onSave={list=>{if(save({...t,eras:list}))setEras(false);}}/>}
  {settings&&<SettingsDialog timeline={t} campaign={campaign} pages={linkable} onClose={()=>setSettings(false)} onSave={next=>{if(save(next))setSettings(false);}}/>}
 </div>;
}

// ---- Dialogs ------------------------------------------------------------------------------------

const toInt=(v:string)=>{const n=Number(v.trim().replace(/^−/,'-'));return v.trim()!==''&&Number.isInteger(n)?n:undefined;};

function DateFields({label,value,onChange,calendar}:{label:string;value:TimelineWhen|undefined;onChange:(w:TimelineWhen|undefined)=>void;calendar?:NonNullable<Campaign['calendars']>[number]}){
 const [year,setYear]=useState(value?String(value.year):'');
 const set=(p:Partial<TimelineWhen>&{yearText?:string})=>{const y=p.yearText!==undefined?toInt(p.yearText):value?.year;if(p.yearText!==undefined)setYear(p.yearText);if(y===undefined){onChange(undefined);return;}const {yearText:_,...rest}=p;void _;const next={...(value??{year:y}),...rest,year:y};if(!next.periodId){delete next.periodId;delete next.day;}if(!next.day)delete next.day;onChange(next);};
 const period=calendar&&value?.periodId?calendar.periods.find(p=>p.id===value.periodId):undefined;
 return <fieldset className="tl-date"><legend>{label}</legend>
  <label>Year<input inputMode="numeric" value={year} placeholder="351" onChange={e=>set({yearText:e.target.value})}/></label>
  {calendar&&<label>Month<select value={value?.periodId??''} disabled={!value} onChange={e=>set({periodId:e.target.value||undefined,day:undefined})}><option value="">—</option>{calendar.periods.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
  {calendar&&<label>Day<input inputMode="numeric" value={value?.day??''} disabled={!period} placeholder="—" onChange={e=>{const d=toInt(e.target.value);set({day:d&&d>=1&&d<=Math.max(1,period?.days??30)+5?d:undefined});}}/></label>}
 </fieldset>;
}

function PagesField({ids,pages,onChange}:{ids:string[];pages:readonly Entry[];onChange:(ids:string[])=>void}){
 const [q,setQ]=useState('');
 const matches=q.trim()?pages.filter(p=>!ids.includes(p.id)&&p.kind!=='timeline'&&p.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0,6):[];
 return <div className="tl-pages-field"><span className="tl-label">Pages it’s about</span>
  <div className="tl-pages">{ids.map(id=><span key={id} className="tl-page on">{pages.find(p=>p.id===id)?.title??'Missing page'}<button type="button" aria-label="Remove" onClick={()=>onChange(ids.filter(x=>x!==id))}><X size={11}/></button></span>)}</div>
  {ids.length<12&&<div className="tl-page-search"><input aria-label="Find a page to link" placeholder="Find a character, place, organization…" value={q} onChange={e=>setQ(e.target.value)}/>{matches.length>0&&<div className="tl-page-results">{matches.map(p=><button key={p.id} type="button" onClick={()=>{onChange([...ids,p.id]);setQ('');}}>{p.title}<small>{p.kind}</small></button>)}</div>}</div>}
 </div>;
}

function EventDialog({event,timeline:t,calendar,pages,sessions,onSave,onDelete,onMove,onClose}:{event:TimelineEvent;timeline:Timeline;calendar?:NonNullable<Campaign['calendars']>[number];pages:readonly Entry[];sessions:readonly Entry[];onSave:(e:TimelineEvent)=>void;onDelete?:()=>void;onMove?:(d:number)=>void;onClose:()=>void}){
 const [e,setE]=useState(event),[dated,setDated]=useState(!!event.when||!event.title),[spans,setSpans]=useState(!!event.end),[error,setError]=useState('');
 const set=(p:Partial<TimelineEvent>)=>setE(x=>({...x,...p}));
 const submit=()=>{
  if(!e.title.trim()){setError('Give the event a title.');return;}
  const out:TimelineEvent={...e,title:e.title.trim(),label:e.label?.trim()||undefined};
  if(!dated){delete out.when;delete out.end;delete out.approx;}
  else if(!out.when){setError('Type a year, or switch off “It has a date”.');return;}
  if(!spans||!dated)delete out.end;else if(!out.end){setError('Type the year it ended, or switch off “It lasted a while”.');return;}
  if(out.when&&out.end&&out.end.year<out.when.year){setError('It ends before it starts.');return;}
  if(!out.label)delete out.label;if(!out.approx)delete out.approx;if(!out.major)delete out.major;if(!out.categoryId)delete out.categoryId;if(!out.sessionId)delete out.sessionId;
  onSave(out);
 };
 return <ToolDialog title={event.title?'Edit event':'Add an event'} onClose={onClose} wide className="tl-dialog">
  <form className="tl-form" onSubmit={x=>{x.preventDefault();submit();}}>
   <label className="tl-wide">Title<input autoFocus required maxLength={200} value={e.title} placeholder="The Cataclysm" onChange={x=>set({title:x.target.value})}/></label>
   <div className="tl-switches"><label><input type="checkbox" checked={dated} onChange={x=>setDated(x.target.checked)}/> It has a date</label>{dated&&<><label><input type="checkbox" checked={!!e.approx} onChange={x=>set({approx:x.target.checked})}/> About (c.)</label><label><input type="checkbox" checked={spans} onChange={x=>setSpans(x.target.checked)}/> It lasted a while</label></>}</div>
   {dated&&<div className="tl-dates"><DateFields label={spans?'Started':'When'} value={e.when} calendar={calendar} onChange={w=>set({when:w})}/>{spans&&<DateFields label="Ended" value={e.end} calendar={calendar} onChange={w=>set({end:w})}/>}</div>}
   {dated&&<p className="tl-hint">{t.beforeSuffix?`Year 0 and below read as years ${t.beforeSuffix} (0 is 1 ${t.beforeSuffix}).`:'Years can be 0 or below for times before year 1.'}{calendar?` Months and days come from ${calendar.name}.`:''}</p>}
   {!dated&&<p className="tl-hint">With no date it stays where it is in the list, after the event before it.{onMove&&<> <button type="button" className="text-button" onClick={()=>onMove(-1)}><ChevronUp size={13}/> Earlier</button> <button type="button" className="text-button" onClick={()=>onMove(1)}><ChevronDown size={13}/> Later</button></>}</p>}
   <label className="tl-wide">Shown as <small>optional, instead of the date</small><input maxLength={80} value={e.label??''} placeholder="Before the gods walked" onChange={x=>set({label:x.target.value})}/></label>
   <div className="tl-row">
    <label>Category<select value={e.categoryId??''} onChange={x=>set({categoryId:x.target.value||undefined})}><option value="">None</option>{t.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {sessions.length>0&&<label>Session <small>it happened in</small><select value={e.sessionId??''} onChange={x=>set({sessionId:x.target.value||undefined})}><option value="">None</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
   </div>
   <label className="tl-wide">What happened<textarea rows={4} maxLength={4000} value={e.text} placeholder="Link pages with [[Page name]]" onChange={x=>set({text:x.target.value})}/></label>
   <PagesField ids={e.pageIds} pages={pages} onChange={pageIds=>set({pageIds})}/>
   <div className="tl-switches"><label><input type="checkbox" checked={!!e.major} onChange={x=>set({major:x.target.checked})}/> <Star size={13}/> Major event</label><label><input type="checkbox" checked={e.visibility==='players'} onChange={x=>set({visibility:x.target.checked?'players':'gm'})}/> Players can see it</label></div>
   {t.visibility==='gm'&&e.visibility==='players'&&<p className="tl-hint">The Timeline tab is GM only, so players see this once you share the tab.</p>}
   {error&&<p className="form-error">{error}</p>}
   <div className="tl-actions">{onDelete&&<button type="button" className="button tl-danger" onClick={onDelete}><Trash2 size={14}/> Delete</button>}<span/><button type="button" className="button" onClick={onClose}>Cancel</button><button type="submit" className="button primary">{event.title?'Save':'Add event'}</button></div>
  </form>
 </ToolDialog>;
}

function ErasDialog({timeline:t,onSave,onClose}:{timeline:Timeline;onSave:(eras:TimelineEra[])=>void;onClose:()=>void}){
 const [list,setList]=useState(()=>t.eras.map(e=>({...e,startText:String(e.start),endText:e.end===undefined?'':String(e.end)}))),[error,setError]=useState('');
 const set=(i:number,p:Partial<(typeof list)[number]>)=>setList(l=>l.map((x,j)=>j===i?{...x,...p}:x));
 const submit=()=>{
  const out:TimelineEra[]=[];
  for(const x of list){const start=toInt(x.startText),end=x.endText.trim()?toInt(x.endText):undefined;
   if(!x.name.trim()){setError('Every era needs a name.');return;}
   if(start===undefined){setError(`Type the year “${x.name}” starts.`);return;}
   if(x.endText.trim()&&end===undefined){setError(`The end of “${x.name}” isn’t a year.`);return;}
   if(end!==undefined&&end<start){setError(`“${x.name}” ends before it starts.`);return;}
   out.push({id:x.id,name:x.name.trim(),start,...(end!==undefined?{end}:{}),color:x.color,text:x.text,visibility:x.visibility});}
  onSave(out.sort((a,b)=>a.start-b.start));
 };
 return <ToolDialog title="Eras" onClose={onClose} wide className="tl-dialog">
  <p className="modal-intro">Ages, reigns or chapters. Events fall into the era their year is in; an era with no end lasts until the next one or now. Years 0 and below are the years before year 1.</p>
  <form className="tl-form" onSubmit={x=>{x.preventDefault();submit();}}>
   {list.map((x,i)=><div key={x.id} className="tl-era-edit" style={{'--era':x.color} as CSSProperties}>
    <div className="tl-row"><label className="grow">Name<input maxLength={80} value={x.name} onChange={e=>set(i,{name:e.target.value})}/></label><label className="year">From<input inputMode="numeric" value={x.startText} onChange={e=>set(i,{startText:e.target.value})}/></label><label className="year">To<input inputMode="numeric" value={x.endText} placeholder="Now" onChange={e=>set(i,{endText:e.target.value})}/></label></div>
    <div className="tl-swatches" role="radiogroup" aria-label="Colour">{TIMELINE_COLORS.map(c=><button key={c} type="button" role="radio" aria-checked={x.color===c} aria-label={c} style={{background:c}} onClick={()=>set(i,{color:c})}/>)}</div>
    <label className="tl-wide">About this era <small>optional</small><textarea rows={2} maxLength={1000} value={x.text} onChange={e=>set(i,{text:e.target.value})}/></label>
    <div className="tl-switches"><label><input type="checkbox" checked={x.visibility==='players'} onChange={e=>set(i,{visibility:e.target.checked?'players':'gm'})}/> Players can see it</label><button type="button" className="text-button tl-danger" onClick={()=>setList(l=>l.filter((_,j)=>j!==i))}><Trash2 size={13}/> Remove</button></div>
   </div>)}
   <button type="button" className="text-button" disabled={list.length>=40} onClick={()=>{const last=list.at(-1),start=last?(toInt(last.endText)??toInt(last.startText)??0)+1:1;setList([...list,{id:newId(),name:'',start,startText:String(start),endText:'',end:undefined,color:TIMELINE_COLORS[list.length%TIMELINE_COLORS.length],text:'',visibility:t.visibility==='players'?'players':'gm'}]);}}><Plus size={13}/> Add an era</button>
   {error&&<p className="form-error">{error}</p>}
   <div className="tl-actions"><span/><button type="button" className="button" onClick={onClose}>Cancel</button><button type="submit" className="button primary">Save eras</button></div>
  </form>
 </ToolDialog>;
}

function SettingsDialog({timeline,campaign,pages,onSave,onClose}:{timeline:Timeline;campaign?:Campaign;pages:readonly Entry[];onSave:(t:Timeline)=>void;onClose:()=>void}){
 const [t,setT]=useState(timeline);
 const set=(p:Partial<Timeline>)=>setT(x=>({...x,...p}));
 const calendars=campaign?.calendars??[],followable=pages.filter(p=>['character','faction','place','vehicle','lore','page'].includes(p.kind)).sort((a,b)=>a.title.localeCompare(b.title));
 const clean=(x:Timeline):Timeline=>{const out={...x};for(const k of ['yearSuffix','beforeSuffix','calendarId','focusId'] as const)if(!out[k]?.trim())delete out[k];if(!out.showCalendar)delete out.showCalendar;if(!out.showSessions)delete out.showSessions;return out;};
 return <ToolDialog title="Timeline settings" onClose={onClose} wide className="tl-dialog">
  <form className="tl-form" onSubmit={x=>{x.preventDefault();onSave(clean(t));}}>
   <div className="tl-styles" role="radiogroup" aria-label="Kind of timeline">{timelineStyles.map(s=><button key={s} type="button" role="radio" aria-checked={t.style===s} onClick={()=>setT(restyle(t,s))}><strong>{STYLE_LABELS[s]}</strong><small>{STYLE_HINTS[s]}</small></button>)}</div>
   <div className="tl-row">
    <label>Calendar<select value={t.calendarId??''} onChange={e=>set({calendarId:e.target.value||undefined})}><option value="">None: years only</option>{calendars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}{t.calendarId&&!calendars.some(c=>c.id===t.calendarId)&&<option value={t.calendarId}>A calendar not in this campaign</option>}</select></label>
    {!t.calendarId&&<label className="year">After years<input maxLength={20} value={t.yearSuffix??''} placeholder="AC" onChange={e=>set({yearSuffix:e.target.value})}/></label>}
    <label className="year">Before year 1<input maxLength={20} value={t.beforeSuffix??''} placeholder="PC" onChange={e=>set({beforeSuffix:e.target.value})}/></label>
   </div>
   <p className="tl-hint">{calendars.length?'With a calendar, events can have a month and day, dates read the calendar’s way, and Today shows the calendar’s current date.':'This campaign has no calendars yet; years work on their own.'} “Before year 1” writes year 0 as 1 PC, −499 as 500 PC.</p>
   <fieldset className="tl-gather"><legend>Gather in</legend>
    <label><input type="checkbox" checked={!!t.showSessions} disabled={!campaign} onChange={e=>set({showSessions:e.target.checked})}/> Sessions, with their recap’s big beats <small>placed by the in-world date the recap moved the calendar to, or by when they were played</small></label>
    <label><input type="checkbox" checked={!!t.showCalendar} disabled={!t.calendarId} onChange={e=>set({showCalendar:e.target.checked})}/> The calendar’s events <small>not yearly holidays</small></label>
    <label className="tl-follow">Follow a page <small>gathers events on every other timeline that names it</small><select value={t.focusId??''} onChange={e=>set({focusId:e.target.value||undefined})}><option value="">Nobody</option>{followable.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
   </fieldset>
   <fieldset className="tl-cats"><legend>Categories</legend>
    {t.categories.map((c,i)=><div key={c.id} className="tl-cat-edit"><input type="color" aria-label={`${c.name} colour`} value={c.color} onChange={e=>set({categories:t.categories.map((x,j)=>j===i?{...x,color:e.target.value}:x)})}/><input aria-label="Category name" maxLength={40} value={c.name} onChange={e=>set({categories:t.categories.map((x,j)=>j===i?{...x,name:e.target.value}:x)})}/><button type="button" className="icon-button" aria-label={`Remove ${c.name}`} onClick={()=>set({categories:t.categories.filter((_,j)=>j!==i)})}><Trash2 size={13}/></button></div>)}
    <button type="button" className="text-button" disabled={t.categories.length>=24} onClick={()=>set({categories:[...t.categories,{id:newId(),name:'New category',color:TIMELINE_COLORS[t.categories.length%TIMELINE_COLORS.length]}]})}><Plus size={13}/> Add a category</button>
   </fieldset>
   <div className="tl-actions"><span/><button type="button" className="button" onClick={onClose}>Cancel</button><button type="submit" className="button primary">Save settings</button></div>
  </form>
 </ToolDialog>;
}

// ---- Players ------------------------------------------------------------------------------------

export function PlayerTimeline({view,entries,open}:{view:TimelineView;entries:readonly Page[];open:(id:string)=>void}){
 return <TimelineReader view={view} pages={entries} open={open} empty={<p className="muted"><BookOpen size={14}/> Nothing on this timeline has been shared yet.</p>}/>;
}
