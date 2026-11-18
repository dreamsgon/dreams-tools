'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {useIdlePreload} from '@/lib/idle-preload';
import {parsePlayerHash,playerHash} from '@/lib/encyclopedia/player-place';
import {playerTitle} from '@/lib/page-title';
import {usePageTitle} from '../use-page-title';
import {colourStyle} from '@/lib/colour';
import {BookOpen,Users,Search,Eye,CalendarDays,House,Goal,Check,Gift,Library,Ship,Store,X,MessagesSquare} from 'lucide-react';
import {storeTabTitle} from '@/lib/encyclopedia/stores';
import {usePictureSrc} from './character-picture';
import {CategoryIcon} from './codex-icon';
import {LookBanner,LookFont} from './look-section';
import {lookAttributes} from '@/lib/encyclopedia/look';
import type {CSSProperties} from 'react';
import {FrontPageView} from '../front-page-view';
import {CharacterReadOnly} from './character-parts';
import {PlayerQuestLog} from './quest-log';
import {PlayerProse} from './player-prose';
import {playerHoldersByPlace,playerOrgListItems} from '@/lib/encyclopedia/org-holdings';
import type {PlayerCampaign} from '@/lib/encyclopedia/world-model';
import type {MyPages} from '@/lib/encyclopedia/player-edit';
import {PlayerEditor,PlayerPageBar,PlayerSubPages} from './player-edit';
import {PlayerSheetSection} from './player-sheet';
import {RollResults} from './rolls';
import type {SheetState} from '@/lib/encyclopedia/player-sheet';

// Tabs a player opens one at a time load as separate chunks, so a shared page appears sooner;
// they are fetched while the browser is idle, so opening one is still instant.
const lazyParts={
 VehicleReadOnly:()=>import('./vehicle-sheet').then(x=>({default:x.VehicleReadOnly})),
 VehicleCrewReadOnly:()=>import('./vehicle-crew').then(x=>({default:x.VehicleCrewReadOnly})),
 HoldReadOnly:()=>import('./vehicle-hold').then(x=>({default:x.HoldReadOnly})),
 SystemsReadOnly:()=>import('./vehicle-hold').then(x=>({default:x.SystemsReadOnly})),
 LogReadOnly:()=>import('./vehicle-log').then(x=>({default:x.LogReadOnly})),
 PlayerTrackers:()=>import('./character-trackers').then(x=>({default:x.PlayerTrackers})),
 PlayerInventoryTab:()=>import('./player-items').then(x=>({default:x.PlayerInventoryTab})),
 PlayerSpellsTab:()=>import('./player-items').then(x=>({default:x.PlayerSpellsTab})),
 FeaturesPanel:()=>import('./features').then(x=>({default:x.FeaturesPanel})),
 PlayerStoreView:()=>import('./store-page').then(x=>({default:x.PlayerStoreView})),
 CalendarView:()=>import('./calendar-view').then(x=>({default:x.CalendarView})),
 ReadOnlyMap:()=>import('./map-canvas').then(x=>({default:x.ReadOnlyMap})),
 OrgReadOnly:()=>import('./org-parts').then(x=>({default:x.OrgReadOnly})),
 PlayerTies:()=>import('./player-ties').then(x=>({default:x.PlayerTies})),
 PlayerStatSheet:()=>import('./player-stat-sheet').then(x=>({default:x.PlayerStatSheet})),
};
const VehicleReadOnly=dynamic(lazyParts.VehicleReadOnly);
const VehicleCrewReadOnly=dynamic(lazyParts.VehicleCrewReadOnly);
const HoldReadOnly=dynamic(lazyParts.HoldReadOnly);
const SystemsReadOnly=dynamic(lazyParts.SystemsReadOnly);
const LogReadOnly=dynamic(lazyParts.LogReadOnly);
const PlayerTrackers=dynamic(lazyParts.PlayerTrackers);
const PlayerInventoryTab=dynamic(lazyParts.PlayerInventoryTab);
const PlayerSpellsTab=dynamic(lazyParts.PlayerSpellsTab);
const FeaturesPanel=dynamic(lazyParts.FeaturesPanel);
const PlayerStoreView=dynamic(lazyParts.PlayerStoreView);
const CalendarView=dynamic(lazyParts.CalendarView);
const ReadOnlyMap=dynamic(lazyParts.ReadOnlyMap);
const OrgReadOnly=dynamic(lazyParts.OrgReadOnly);
const PlayerTies=dynamic(lazyParts.PlayerTies);
const PlayerStatSheet=dynamic(lazyParts.PlayerStatSheet);
const preloadParts=Object.values(lazyParts);
export function PlayerView({data,playerToken,you,onChanged}:{data:PlayerCampaign;playerToken?:string;you?:{name:string;pages:MyPages;sheets?:Record<string,SheetState>};onChanged?:()=>void}){
 useIdlePreload(preloadParts);
 const [calendarId,setCalendarId]=useState(''),[codexOpen,setCodexOpen]=useState(false);
 const found=data.entries.filter(e=>e.codex);
 const activeCalendar=(data.calendars??[]).find(c=>c.id===calendarId);
 // A bookmarked link opens the page named after the token in the address hash (#<token>&entry=<id>&tab=<tab>).
 const first=data.frontPage?.widgets.length?'':data.entries[0]?.id??'';
 const [start]=useState(()=>{const p=playerToken&&typeof location!=='undefined'?parsePlayerHash(location.hash):null;return p?.entry&&data.entries.some(e=>e.id===p.entry)?{entry:p.entry,tab:p.tab??''}:{entry:first,tab:''};});
 const [selected,setSelected]=useState(start.entry),[tab,setTab]=useState(start.tab),[query,setQuery]=useState('');
 const entry=data.entries.find(e=>e.id===selected),tabs=entry?[...(entry.store?[{id:'store',title:storeTabTitle(entry.store.type),body:''}]:[]),...(entry.vehicle?[{id:'vehicle',title:'Overview',body:''},...(entry.vehicle.crewTab?[{id:'crew',title:entry.vehicle.crewTab.title,body:''}]:[]),...(entry.vehicle.holdTab?[{id:'hold',title:entry.vehicle.holdTab.title,body:''}]:[]),...(entry.vehicle.systemsTab?[{id:'systems',title:entry.vehicle.systemsTab.title,body:''}]:[]),...(entry.vehicle.logTab?[{id:'log',title:'Log',body:''}]:[])]:[]),...(entry.org||entry.profile?[{id:'profile',title:'Profile',body:''}]:[]),...(entry.mapData?[{id:'map',title:'Map',body:''}]:[]),...entry.tabs,...(entry.ties?.length?[{id:'connections',title:'Connections',body:''}]:[]),...(entry.stats.length?[{id:'stats',title:'Stats & Skills',body:''}]:[]),...(entry.features?.length?[{id:'features',title:'Features',body:''}]:[]),...(entry.inventory?[{id:'inventory',title:'Inventory',body:''}]:[]),...(entry.spells?[{id:'spells',title:data.campaign.items.spells.tab,body:''}]:[])]:[],active=tabs.find(t=>t.id===tab)??tabs[0];
 const look=lookAttributes(data.campaign.look);
 // Held places are tinted only by organizations whose Profile is shared, through the holdings players may see.
 const holders=useMemo(()=>playerHoldersByPlace(data.entries),[data.entries]);
 const found2=(e:{title:string;tabs:{body:string}[]})=>(e.title+' '+e.tabs.map(t=>t.body).join(' ')).toLowerCase().includes(query.toLowerCase()),orgs=playerOrgListItems(data.entries.filter(found2));
 // A signed-in member's own pages (each page's Who can edit): Edit, New sub-page and its sub-pages.
 const [editing,setEditing]=useState(''),mine=entry?you?.pages[entry.id]:undefined,memberRef=playerToken?.startsWith('m-')?playerToken.slice(2):'';
 // The member's own characters: who they buy, sell and put in as.
 const myCharacters=data.entries.filter(e=>e.kind==='character'&&you?.pages[e.id]?.edit).map(e=>({id:e.id,title:e.title,inventory:e.inventory})),characterList=data.entries.filter(e=>e.kind==='character').map(e=>({id:e.id,title:e.title}));
 const go=(id:string)=>{setCalendarId('');setSelected(id);setTab('');setCodexOpen(false);};
 usePageTitle(playerToken?playerTitle({entry:entry?.title,campaign:data.campaign.name}):'');
 // The open page is kept in the hash after the token (never in the query string). A new page is a history entry; a tab switch replaces.
 const shown=useRef<string|null>(null),latest=useRef({entries:data.entries,first});
 useEffect(()=>{latest.current={entries:data.entries,first};});
 useEffect(()=>{
  if(!playerToken)return;
  const hash=playerHash(playerToken,{entry:selected||null,tab:tab||null});
  if(hash!==window.location.hash){const url=window.location.pathname+window.location.search+hash;if(shown.current!==null&&shown.current!==selected)window.history.pushState(window.history.state,'',url);else window.history.replaceState(window.history.state,'',url);}
  shown.current=selected;
 },[playerToken,selected,tab]);
 useEffect(()=>{
  if(!playerToken)return;
  const back=()=>{const p=parsePlayerHash(window.location.hash),open=p.entry&&latest.current.entries.some(e=>e.id===p.entry);setCalendarId('');setCodexOpen(false);setSelected(open?p.entry!:latest.current.first);setTab(open?p.tab??'':'');};
  window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);
 },[playerToken]);
 return <div className="player-layout" {...look} style={look.style as CSSProperties}><LookFont look={data.campaign.look}/><aside><span className="eyebrow">{you&&Object.values(you.pages).some(p=>p.edit||p.subPages)?'PLAYER VIEW':'PLAYER VIEW · READ ONLY'}</span><h2>{data.campaign.name}</h2><p>{data.world.name}</p>{!!data.frontPage?.widgets.length&&<button className={!activeCalendar&&!entry&&!codexOpen?'active':''} onClick={()=>{setCalendarId('');setSelected('');setCodexOpen(false);}}><House size={16}/><span>Front page</span></button>}{found.length>0&&<button className={codexOpen&&!entry?'active':''} onClick={()=>{setCalendarId('');setSelected('');setCodexOpen(true);}}><Library size={16}/><span>Codex</span><small className="player-count">{found.length}</small></button>}<label className="search-box"><Search size={15}/><input aria-label="Search player notes" placeholder="Search visible notes…" value={query} onChange={e=>setQuery(e.target.value)}/></label>{(data.calendars??[]).map(c=><button key={c.id} className={calendarId===c.id?'active':''} onClick={()=>setCalendarId(c.id)}><CalendarDays size={16}/><span>{c.name}</span></button>)}{orgs.length>0&&<div className="player-orgs" role="group" aria-label="Organizations"><span className="player-side-heading">Organizations</span>{orgs.map(o=><button key={o.id} className={!activeCalendar&&selected===o.id?'active':''} onClick={()=>go(o.id)}><span className="org-dot" style={o.colour?{background:o.colour}:undefined} aria-hidden="true"/><span>{o.title}</span></button>)}</div>}{data.entries.filter(e=>e.kind!=='faction'&&found2(e)).map(e=><button key={e.id} className={!activeCalendar&&selected===e.id?'active':''} onClick={()=>{setCalendarId('');setSelected(e.id);setTab('');setCodexOpen(false);}}>{e.kind==='character'?<Users size={16}/>:e.kind==='quest'?<Goal size={16}/>:e.kind==='vehicle'?<Ship size={16}/>:e.kind==='store'?<Store size={16}/>:<BookOpen size={16}/>}<span>{e.title}</span></button>)}</aside><main>{!entry&&!activeCalendar&&<LookBanner look={data.campaign.look} playerToken={playerToken} className="player-banner"/>}<span className="eyebrow"><Eye size={13}/> SHARED BY YOUR GM</span>{activeCalendar?<><h1>{activeCalendar.name}</h1><CalendarView key={activeCalendar.id} calendar={activeCalendar}/></>:entry?<><h1>{entry.title}</h1>{entry.kind==='place'&&data.campaign.forum&&playerToken?.startsWith('m-')&&<p className="player-forum-link"><a className="button small" href={`/forum#${playerToken}&place=${encodeURIComponent(entry.id)}`}><MessagesSquare size={14}/> Forum scene here</a></p>}{mine&&memberRef&&editing!==entry.id&&<PlayerPageBar page={mine} entryId={entry.id} memberRef={memberRef} onEdit={()=>setEditing(entry.id)} onAdded={id=>{go(id);onChanged?.();}}/>}{mine&&memberRef&&editing===entry.id?<PlayerEditor key={entry.id} page={mine} entryId={entry.id} memberRef={memberRef} done={saved=>{setEditing('');if(saved)onChanged?.();}}/>:<>{entry.info&&<dl className="player-info">{entry.info.map((r,i)=><div key={i}><dt>{r.label}</dt><dd>{r.pageId?<button className="wiki-link" onClick={()=>{setSelected(r.pageId!);setTab('');}}>{r.value}</button>:r.value}</dd></div>)}</dl>}{(entry.sheet||you?.sheets?.[entry.id]?.canLink)&&<PlayerSheetSection title={entry.title} entryId={entry.id} sheet={entry.sheet} state={you?.sheets?.[entry.id]} memberRef={memberRef} onChanged={()=>onChanged?.()}/>}{entry.kind==='character'&&(!!entry.trackers?.length||(!!memberRef&&!!mine?.edit))&&<PlayerTrackers entryId={entry.id} trackers={entry.trackers??[]} memberRef={memberRef} canEdit={!!memberRef&&!!mine?.edit} onChanged={()=>onChanged?.()}/>}{!!entry.rides?.length&&<div className="player-rides" aria-label="Vehicles"><Ship size={14} aria-hidden="true"/>{entry.rides.map(r=><span key={r.id}><button className="wiki-link" onClick={()=>{setSelected(r.id);setTab('');}}>{r.title}</button> <small>{r.roles.join(', ')}</small></span>)}</div>}<div className="article-tabs" role="tablist">{tabs.map(t=><button role="tab" aria-selected={active?.id===t.id} key={t.id} onClick={()=>setTab(t.id)}>{t.title}</button>)}</div>{entry.codex&&(active?.id==='overview'||!active)&&<PlayerCodexEntry entry={entry} token={playerToken}/>}{entry.quest&&(active?.id==='overview'||!active)&&<PlayerQuestView entryId={entry.id} memberRef={memberRef} onChanged={onChanged} quest={entry.quest} entries={data.entries} names={id=>data.entries.find(e=>e.id===id)?.title??''} open={id=>{setSelected(id);setTab('');}}/>}{active?.id==='store'&&entry.store?<PlayerStoreView key={entry.id} entryId={entry.id} title={entry.title} store={entry.store} settings={data.campaign.items} memberRef={memberRef||undefined} mine={myCharacters} ownerName={entry.store.ownerId?data.entries.find(e=>e.id===entry.store!.ownerId)?.title:undefined} onChanged={()=>onChanged?.()}/>:active?.id==='inventory'&&entry.inventory?<PlayerInventoryTab key={entry.id} entry={entry} inventory={entry.inventory} settings={data.campaign.items} memberRef={memberRef||undefined} canEdit={!!mine?.edit} characters={characterList} mine={myCharacters} onChanged={()=>onChanged?.()} onOpen={go}/>:active?.id==='features'&&entry.features?<FeaturesPanel key={entry.id} name={entry.title} features={entry.features} gm={false}/>:active?.id==='spells'&&entry.spells?<PlayerSpellsTab key={entry.id} entry={entry} spells={entry.spells} trackers={entry.trackers??[]} settings={data.campaign.items} memberRef={memberRef||undefined} canEdit={!!mine?.edit} onChanged={()=>onChanged?.()}/>:active?.id==='log'&&entry.vehicle?.logTab?<LogReadOnly log={entry.vehicle.logTab}/>:active?.id==='hold'&&entry.vehicle?.holdTab?<HoldReadOnly hold={entry.vehicle.holdTab}/>:active?.id==='systems'&&entry.vehicle?.systemsTab?<SystemsReadOnly systems={entry.vehicle.systemsTab} vehicleName={entry.title}/>:active?.id==='crew'&&entry.vehicle?.crewTab?<VehicleCrewReadOnly vehicle={entry.vehicle} names={id=>data.entries.find(e=>e.id===id)?.title??''} open={id=>{setSelected(id);setTab('');}}/>:active?.id==='vehicle'&&entry.vehicle?<VehicleReadOnly vehicle={entry.vehicle} picture={entry.picture} token={playerToken} names={id=>data.entries.find(e=>e.id===id)?.title??''} open={id=>{setSelected(id);setTab('');}}/>:active?.id==='profile'&&entry.org?<OrgReadOnly org={entry.org} title={entry.title} campaignName={data.campaign.name} token={playerToken} open={id=>{setSelected(id);setTab('');}}/>:active?.id==='profile'&&entry.profile?<CharacterReadOnly profile={entry.profile} who={entry.title} settings={data.campaign.items} open={id=>{setSelected(id);setTab('');}}/>:active?.id==='map'&&entry.mapData?<ReadOnlyMap holders={holders} map={entry.mapData} campaignId={data.campaign.id} calendars={data.calendars} playerToken={playerToken} onOpen={id=>{setSelected(id);setTab('');}}/>:active?.id==='connections'&&entry.ties?<PlayerTies ties={entry.ties} entries={data.entries} open={id=>{setSelected(id);setTab('');}}/>:active?.id==='stats'?<PlayerStatSheet key={entry.id} title={entry.title} entryId={entry.id} stats={entry.stats} trackers={entry.trackers??[]} memberRef={memberRef||undefined} canRoll={!!mine?.edit} onChanged={()=>onChanged?.()}/>:active?(active.body.trim()?<PlayerProse text={active.body} entries={data.entries} open={id=>{setSelected(id);setTab('');}}/>:<div className="player-prose">No text on this tab yet.</div>):entry.codex||(entry.sheet&&!tabs.length)?null:<div className="player-prose">No text on this tab yet.</div>}</>}{mine&&memberRef&&editing!==entry.id&&<PlayerSubPages page={mine} memberRef={memberRef} open={go} readable={id=>data.entries.some(e=>e.id===id)} onChanged={()=>onChanged?.()}/>}</>:codexOpen&&found.length?<><h1>Codex</h1><PlayerCodex entries={found} token={playerToken} open={id=>{setSelected(id);setTab('');}}/></>:data.frontPage?.widgets.length?<><h1>{data.campaign.name}</h1><FrontPageView page={data.frontPage} open={id=>{setSelected(id);setTab('');}}/></>:<><h1>The story is waiting.</h1><p>Your GM has not shared any tabs yet.</p></>}</main><RollResults discord={null}/></div>;
}

const questStateNames={rumour:'Rumour',active:'Active',done:'Done',failed:'Failed'} as const;
type Q=NonNullable<PlayerCampaign['entries'][number]['quest']>;
/** What the party knows about a quest: the steps the GM shares and the journal entries for players. */
function PlayerQuestView({entryId,memberRef,onChanged,quest,names,open,entries}:{entryId:string;memberRef?:string;onChanged?:()=>void;quest:Q;names:(id:string)=>string;open:(id:string)=>void;entries:readonly {id:string;title:string}[]}){
 return <div className="player-quest"><div className="player-quest-chips"><span className={`quest-type ${colourStyle('cat',quest.category?.color??'grey').className}`} style={colourStyle('cat',quest.category?.color??'grey').style}>{quest.category?.name??'Quest'}{quest.category?' quest':''}</span><span className="quest-state">{questStateNames[quest.state]}</span>{quest.giverId&&<button className="inline-link" onClick={()=>open(quest.giverId!)}>Given by {names(quest.giverId)}</button>}{quest.placeId&&<button className="inline-link" onClick={()=>open(quest.placeId!)}>{names(quest.placeId)}</button>}{quest.rewardHidden?<span><Gift size={12}/> Reward: not known yet</span>:(quest.reward||quest.rewardIds?.length)?<span><Gift size={12}/> {quest.reward}{quest.rewardIds?.map((id,i)=><span key={id}>{quest.reward||i?', ':''}<button className="inline-link" onClick={()=>open(id)}>{names(id)}</button></span>)}</span>:null}</div>
  {quest.objectives.length>0&&<ul className="player-quest-steps">{quest.objectives.map(o=>{const status=o.status??(o.done?'done':'todo'),part=(id:string|null|undefined,name:string|undefined)=>id?<button className="inline-link" onClick={()=>open(id)}>{names(id)||name}</button>:name;
   return <li key={o.id} className={status}><span className="player-goal-mark" aria-hidden="true">{status==='done'?<Check size={12}/>:status==='failed'?<X size={12}/>:null}</span><span className="player-goal-text">{o.verb?<><b>{o.verb}</b>{(o.targetId||o.target)&&<> {part(o.targetId,o.target)}</>}{(o.whereId||o.where)&&<>, {o.whereLabel} {part(o.whereId,o.where)}</>}</>:o.text}{status==='failed'&&<small> · Failed</small>}{status==='dropped'&&<small> · No longer needed</small>}{o.note&&<small className="player-goal-note">{o.note}</small>}</span></li>;})}</ul>}
  {(quest.log.length>0||!!memberRef)&&<section className="player-quest-log" aria-label="Log"><h2>Log</h2><PlayerQuestLog entryId={entryId} log={quest.log} entries={entries} open={open} memberRef={memberRef||undefined} onChanged={onChanged}/></section>}
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
