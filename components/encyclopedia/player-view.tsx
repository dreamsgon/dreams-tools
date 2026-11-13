'use client';
import {useState} from 'react';
import {BookOpen,Users,Search,Eye,CalendarDays,House,Goal,Check,Gift,Library} from 'lucide-react';
import {usePictureSrc} from './character-picture';
import {CategoryIcon} from './codex-icon';
import {LookBanner,LookFont} from './look-section';
import {lookAttributes} from '@/lib/encyclopedia/look';
import type {CSSProperties} from 'react';
import {FrontPageView} from '../front-page-view';
import {CalendarView} from './calendar-view';
import {ReadOnlyMap} from './map-canvas';
import type {PlayerCampaign} from '@/lib/encyclopedia/world-model';
export function PlayerView({data,playerToken}:{data:PlayerCampaign;playerToken?:string}){
 const [calendarId,setCalendarId]=useState(''),[codexOpen,setCodexOpen]=useState(false);
 const found=data.entries.filter(e=>e.codex);
 const activeCalendar=(data.calendars??[]).find(c=>c.id===calendarId);
 const [selected,setSelected]=useState(data.frontPage?.widgets.length?'':data.entries[0]?.id??''),[tab,setTab]=useState(''),[query,setQuery]=useState('');
 const entry=data.entries.find(e=>e.id===selected),tabs=entry?[...(entry.mapData?[{id:'map',title:'Map',body:''}]:[]),...entry.tabs,...(entry.stats.length?[{id:'stats',title:'Stats',body:''}]:[])]:[],active=tabs.find(t=>t.id===tab)??tabs[0];
 const look=lookAttributes(data.campaign.look);
 return <div className="player-layout" {...look} style={look.style as CSSProperties}><LookFont look={data.campaign.look}/><aside><span className="eyebrow">PLAYER VIEW · READ ONLY</span><h2>{data.campaign.name}</h2><p>{data.world.name}</p>{!!data.frontPage?.widgets.length&&<button className={!activeCalendar&&!entry&&!codexOpen?'active':''} onClick={()=>{setCalendarId('');setSelected('');setCodexOpen(false);}}><House size={16}/><span>Front page</span></button>}{found.length>0&&<button className={codexOpen&&!entry?'active':''} onClick={()=>{setCalendarId('');setSelected('');setCodexOpen(true);}}><Library size={16}/><span>Codex</span><small className="player-count">{found.length}</small></button>}<label className="search-box"><Search size={15}/><input aria-label="Search player notes" placeholder="Search visible notes…" value={query} onChange={e=>setQuery(e.target.value)}/></label>{(data.calendars??[]).map(c=><button key={c.id} className={calendarId===c.id?'active':''} onClick={()=>setCalendarId(c.id)}><CalendarDays size={16}/><span>{c.name}</span></button>)}{data.entries.filter(e=>(e.title+' '+e.tabs.map(t=>t.body).join(' ')).toLowerCase().includes(query.toLowerCase())).map(e=><button key={e.id} className={!activeCalendar&&selected===e.id?'active':''} onClick={()=>{setCalendarId('');setSelected(e.id);setTab('');setCodexOpen(false);}}>{e.kind==='character'?<Users size={16}/>:e.kind==='quest'?<Goal size={16}/>:<BookOpen size={16}/>}<span>{e.title}</span></button>)}</aside><main>{!entry&&!activeCalendar&&<LookBanner look={data.campaign.look} playerToken={playerToken} className="player-banner"/>}<span className="eyebrow"><Eye size={13}/> SHARED BY YOUR GM</span>{activeCalendar?<><h1>{activeCalendar.name}</h1><CalendarView key={activeCalendar.id} calendar={activeCalendar}/></>:entry?<><h1>{entry.title}</h1><div className="article-tabs" role="tablist">{tabs.map(t=><button role="tab" aria-selected={active?.id===t.id} key={t.id} onClick={()=>setTab(t.id)}>{t.title}</button>)}</div>{entry.codex&&(active?.id==='overview'||!active)&&<PlayerCodexEntry entry={entry} token={playerToken}/>}{entry.quest&&(active?.id==='overview'||!active)&&<PlayerQuestView quest={entry.quest} names={id=>data.entries.find(e=>e.id===id)?.title??''} open={id=>{setSelected(id);setTab('');}}/>}{active?.id==='map'&&entry.mapData?<ReadOnlyMap map={entry.mapData} campaignId={data.campaign.id} calendars={data.calendars} playerToken={playerToken} onOpen={id=>{setSelected(id);setTab('');}}/>:active?.id==='stats'?<div className="stat-grid">{entry.stats.map(f=><div className="stat-readout" key={f.id}><small>{f.section}</small><strong>{f.label}</strong><span>{f.value===null?'—':typeof f.value==='boolean'?(f.value?'Yes':'No'):String(f.value)}</span></div>)}</div>:active?<div className="player-prose">{active.body||'No text on this tab yet.'}</div>:entry.codex?null:<div className="player-prose">No text on this tab yet.</div>}</>:codexOpen&&found.length?<><h1>Codex</h1><PlayerCodex entries={found} token={playerToken} open={id=>{setSelected(id);setTab('');}}/></>:data.frontPage?.widgets.length?<><h1>{data.campaign.name}</h1><FrontPageView page={data.frontPage} open={id=>{setSelected(id);setTab('');}}/></>:<><h1>The story is waiting.</h1><p>Your GM has not shared any tabs yet.</p></>}</main></div>;
}

const questStateNames={rumour:'Rumour',active:'Active',done:'Done',failed:'Failed'} as const;
type Q=NonNullable<PlayerCampaign['entries'][number]['quest']>;
/** What the party knows about a quest: the steps the GM shares and the journal entries for players. */
function PlayerQuestView({quest,names,open}:{quest:Q;names:(id:string)=>string;open:(id:string)=>void}){
 return <div className="player-quest"><div className="player-quest-chips"><span className={`quest-type ${quest.type}`}>{quest.type==='main'?'Main':quest.type==='side'?'Side':'Personal'} quest</span><span className="quest-state">{questStateNames[quest.state]}</span>{quest.giverId&&<button className="inline-link" onClick={()=>open(quest.giverId!)}>Given by {names(quest.giverId)}</button>}{quest.placeId&&<button className="inline-link" onClick={()=>open(quest.placeId!)}>{names(quest.placeId)}</button>}{quest.reward&&<span><Gift size={12}/> {quest.reward}</span>}</div>
  {quest.objectives.length>0&&<ul className="player-quest-steps">{quest.objectives.map(o=><li key={o.id} className={o.done?'done':''}><span aria-hidden="true">{o.done&&<Check size={12}/>}</span>{o.text}</li>)}</ul>}
  {quest.log.length>0&&<ol className="quest-log">{quest.log.map(l=><li key={l.id}><div className="quest-log-when"><strong>{l.label||new Date(l.at).toLocaleDateString(undefined,{day:'numeric',month:'short'})}</strong></div><div className="quest-log-text player-prose">{l.text}</div></li>)}</ol>}
 </div>;
}

type PE=PlayerCampaign['entries'][number];
function CodexThumb({entry,size,token}:{entry:PE;size:number;token?:string}){const {src}=usePictureSrc(entry.picture?.imageId,token);return <span className="codex-thumb" aria-hidden="true" style={{width:size,height:size,backgroundImage:src?`url("${src}")`:undefined}}>{!src&&<CategoryIcon name={entry.codex!.category} size={size*.4}/>}</span>;}
const isNew=(at:string)=>Date.now()-Date.parse(at)<7*864e5;
/** Everything the party has found, by category. */
function PlayerCodex({entries,open,token}:{entries:PE[];open:(id:string)=>void;token?:string}){
 const groups=[...new Set(entries.map(e=>e.codex!.category))];
 return <div className="player-codex">{groups.map(g=><section key={g}><h2>{g}</h2><div className="codex-grid">{entries.filter(e=>e.codex!.category===g).sort((a,b)=>a.title.localeCompare(b.title)).map(e=><button key={e.id} className="codex-card" onClick={()=>open(e.id)}><CodexThumb entry={e} size={60} token={token}/><span className="codex-card-text"><strong>{e.title}{isNew(e.codex!.found.at)&&<span className="codex-new">New</span>}</strong>{e.codex!.summary&&<span className="codex-summary">{e.codex!.summary}</span>}{e.codex!.found.label&&<span className="codex-found">Found · {e.codex!.found.label}</span>}</span></button>)}</div></section>)}</div>;
}
function PlayerCodexEntry({entry,token}:{entry:PE;token?:string}){
 const {src}=usePictureSrc(entry.picture?.imageId,token);
 return <div className="player-codex-entry">{src&&entry.picture&&<span className="player-codex-picture" aria-hidden="true" style={{backgroundImage:`url("${src}")`,width:Math.round(340*entry.picture.width/entry.picture.height)}}/>}<div className="player-quest-chips"><span className="quest-type main">{entry.codex!.category}</span>{entry.codex!.found.label&&<span className="quest-state">Found · {entry.codex!.found.label}</span>}</div>{entry.codex!.summary&&<p className="player-codex-summary">{entry.codex!.summary}</p>}</div>;
}
