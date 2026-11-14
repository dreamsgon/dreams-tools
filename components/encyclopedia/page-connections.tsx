"use client";
/*
 * The Connections tab on every page: its ties (Parent of, Rival of, Sails from…) in both directions, plus connections
 * worked out from organizations, vehicles, quests and shared parents. A list in groups and a web. Ties are added with
 * Add a tie or by dragging a page in from the sidebar, and each tie chip opens its editor. A quest's own Connections tab
 * uses `useTies` to show and edit its ties beside the connections worked out from the quest.
 */
import {useMemo,useState,type ReactNode} from 'react';
import {Link2,ListTree,Network,Plus} from 'lucide-react';
import './ties.css';
import type {Campaign,Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {tieGroupInfo,tieGroups,tieTypesOf,type TieGroup} from '@/lib/encyclopedia/ties';
import {pageTies,tiePages,workedOutTies,type PageTie} from '@/lib/encyclopedia/tie-connections';
import {tieChoices} from '@/lib/encyclopedia/tie-edit';
import {groupOf} from '@/lib/encyclopedia/quest-connections';
import {ConnectionGroups,ConnectionWeb,tieTone,type Chip,type ConnectionRow} from './connection-list';
import {TargetPicker} from './quest-goals';
import {PageDrop} from './page-drag';
import {TieDialog} from './tie-dialog';
import {TieKinds} from './tie-types';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
const cut=(t:string,n:number)=>t.length>n?t.slice(0,n-1).trimEnd()+'…':t;

/** A page's ties, what can be tied to it, and the dialogs to add and change them. Without `change` the ties only show. */
export function useTies({entry,data,campaignId,change}:{entry:Entry;data:Workspace;campaignId:string|null;change?:Change}){
 const world=data.worlds.find(w=>w.id===entry.worldId);
 const types=useMemo(()=>tieTypesOf(world),[world]);
 const ties=useMemo(()=>pageTies(data,entry,types,campaignId),[data,entry,types,campaignId]);
 const pages=useMemo(()=>tiePages(data,entry,campaignId).filter(e=>tieChoices(types,entry,e).length).sort((a,b)=>a.title.localeCompare(b.title)),[data,entry,types,campaignId]);
 const [editing,setEditing]=useState<{otherId:string;tie?:PageTie}|null>(null),[kinds,setKinds]=useState(false);
 const other=editing?data.entries.find(e=>e.id===editing.otherId):undefined;
 /** Why a page can't be tied to this one, or null when it can. */
 const check=(id:string)=>id===entry.id?'That is this page.':!tiePages(data,entry,campaignId).some(e=>e.id===id)?'That page isn’t in this campaign or its world’s shared lore.':!pages.some(e=>e.id===id)?'No kind of tie fits those two pages. You can make one in Kinds of tie.':null;
 const chips=(otherId:string,only?:TieGroup):Chip[]=>ties.filter(x=>x.otherId===otherId&&(!only||x.type.group===only)).map(x=>({key:x.key,label:x.label,tone:tieTone(x.type.group),gm:!!x.tie.gm,title:[x.tie.note,x.tie.gm&&x.tie.cover?'Players see a cover story':'',change?'Change this tie':''].filter(Boolean).join(' · ')||undefined,onClick:change?()=>setEditing({otherId,tie:x}):undefined}));
 const notes=(otherId:string,only?:TieGroup)=>ties.filter(x=>x.otherId===otherId&&x.tie.note&&(!only||x.type.group===only)).map(x=>`${x.label}: ${cut(x.tie.note!,140)}`);
 const dialogs:ReactNode=change?<>
  {editing&&other&&<TieDialog key={editing.tie?.key??editing.otherId} entry={entry} other={other} data={data} types={types} editing={editing.tie} change={change} onClose={()=>setEditing(null)} onKinds={()=>{setEditing(null);setKinds(true);}}/>}
  {kinds&&world&&<TieKinds world={world} data={data} change={change} onClose={()=>setKinds(false)}/>}
 </>:null;
 return {types,ties,pages,check,chips,notes,dialogs,canEdit:!!change,add:(otherId:string)=>setEditing({otherId}),openKinds:()=>setKinds(true)};
}

/** The Connections tab on a page that isn't a quest. */
export function PageConnections({entry,data,campaign,change,onOpen}:{entry:Entry;data:Workspace;campaign?:Campaign;change:Change;onOpen:(id:string)=>void}){
 const campaignId=campaign?.id??entry.campaignId;
 const t=useTies({entry,data,campaignId,change});
 const worked=useMemo(()=>workedOutTies(data,entry,t.types,campaignId),[data,entry,t.types,campaignId]);
 const [filter,setFilter]=useState<TieGroup|'all'>('all'),[picking,setPicking]=useState(false),[web,setWeb]=useState(false),[refused,setRefused]=useState('');
 const byId=useMemo(()=>new Map(data.entries.map(e=>[e.id,e])),[data.entries]);
 const only=filter==='all'?undefined:filter;
 const counts=tieGroups.map(g=>({g,n:t.ties.filter(x=>x.type.group===g).length})).filter(x=>x.n);
 const rows:ConnectionRow[]=[...new Set([...t.ties.map(x=>x.otherId),...(only?[]:worked.map(w=>w.otherId))])].flatMap(id=>{
  const e=byId.get(id);if(!e)return [];
  const chips=[...t.chips(id,only),...(only?[]:worked.filter(w=>w.otherId===id).map((w,i):Chip=>({key:`w${i}:${w.label}`,label:w.detail?`${w.label} · ${cut(w.detail,24)}`:w.label,tone:`worked ${w.source}`,title:`Worked out from ${w.source==='organization'?'the organization’s Profile':w.source==='vehicle'?'the vehicle':w.source==='quest'?'the quest':'shared parents'}${w.detail?`: ${w.detail}`:''}`})))];
  return chips.length?[{entry:e,group:groupOf(e),chips,notes:t.notes(id,only),onAdd:()=>t.add(id)}]:[];
 }).sort((a,b)=>a.entry.title.localeCompare(b.entry.title));
 const total=rows.length;
 return <PageDrop className="qc-panel" label="Drop to tie this page" check={t.check} onPage={id=>{setRefused('');t.add(id);}} onRefuse={setRefused}>
  <div className="qc-head">
   <p className="aside-hint">Ties show on both pages. Each one can be shared with players or kept GM only. Organization members, vehicles, quests and siblings are worked out for you.</p>
   <div className="qc-actions goal-anchor">
    {total>0&&<button type="button" className="button small qc-web-toggle" aria-pressed={web} onClick={()=>setWeb(!web)}><Network size={14}/> {web?'Hide web':'Show web'}</button>}
    <button type="button" className="button small" onClick={()=>t.openKinds()}><ListTree size={14}/> Kinds of tie</button>
    <button type="button" className="button small primary" disabled={!t.pages.length} onClick={()=>setPicking(true)}><Link2 size={14}/> Add a tie</button>
    {picking&&<TargetPicker label="Tie this page to…" pages={t.pages} current="" onClose={()=>setPicking(false)} onPage={id=>{setPicking(false);t.add(id);}}/>}
   </div>
  </div>
  {counts.length>0&&<div className="tie-filter" role="group" aria-label="Show ties">
   <button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>All</button>
   {counts.map(({g,n})=><button type="button" key={g} className={tieTone(g)} aria-pressed={filter===g} onClick={()=>setFilter(filter===g?'all':g)} title={tieGroupInfo[g].about}><i aria-hidden="true"/>{tieGroupInfo[g].name} <small>{n}</small></button>)}
  </div>}
  {refused&&<p className="quest-fact-refused" role="status">{refused}</p>}
  {total===0?<div className="qc-empty"><Network size={22} aria-hidden="true"/><p>{only?'No ties of this kind.':'Nothing is connected yet. Add a tie, or drag a page here from the sidebar.'}</p>{!only&&<button type="button" className="button small" disabled={!t.pages.length} onClick={()=>setPicking(true)}><Plus size={14}/> Add a tie</button>}</div>
  :<div className={`qc-body${web?' web-open':''}`}>
   <ConnectionWeb title={entry.title} rows={rows} onOpen={onOpen}/>
   <ConnectionGroups rows={rows} onOpen={onOpen}/>
  </div>}
  {t.dialogs}
 </PageDrop>;
}
