"use client";
/*
 * A quest's Connections tab: the pages it touches, worked out from the quest (lib/encyclopedia/quest-connections.ts),
 * pages the GM links by hand, and the quest's ties (Threatens, Hired by…). A list grouped by kind, and a web around
 * the quest: beside each other on a computer, the web behind a button on a phone.
 */
import {useMemo,useState} from 'react';
import {Link2,ListTree,Network,Plus} from 'lucide-react';
import './quest-connections.css';
import './ties.css';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import type {Quest} from '@/lib/encyclopedia/quests';
import {groupOf,questConnections} from '@/lib/encyclopedia/quest-connections';
import {ConnectionGroups,ConnectionWeb,type ConnectionRow} from './connection-list';
import {TargetPicker} from './quest-goals';
import {PageDrop} from './page-drag';
import {useTies} from './page-connections';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;

/** The Connections tab. Ties can be added and changed when `change` is given (on the quest's own page). */
export function QuestConnections({entry,data,quest:q,set,onOpen,change,campaignId=entry.campaignId}:{entry:Entry;data:Workspace;quest:Quest;set:(patch:Partial<Quest>)=>void;onOpen:(id:string)=>void;change?:Change;campaignId?:string|null}){
 const connections=questConnections(data,{...entry,quest:q});
 const pages=useMemo(()=>data.entries.filter(e=>e.id!==entry.id&&e.kind!=='folder'&&e.worldId===entry.worldId&&(e.campaignId===null||e.campaignId===entry.campaignId)).sort((a,b)=>a.title.localeCompare(b.title)),[data.entries,entry.id,entry.worldId,entry.campaignId]);
 const t=useTies({entry,data,campaignId,change});
 const [picking,setPicking]=useState<'link'|'tie'|null>(null),[web,setWeb]=useState(false),[refused,setRefused]=useState('');
 const links=q.linkIds??[];
 const link=(id:string)=>{if(links.includes(id)||links.length>=50)return;set({linkIds:[...links,id]});};
 const unlink=(id:string)=>{const next=links.filter(x=>x!==id);set({linkIds:next.length?next:undefined});};
 const check=(id:string)=>id===entry.id?'That is this quest.':!pages.some(e=>e.id===id)?'That page isn’t in this campaign.':links.includes(id)?'That page is already linked.':links.length>=50?'A quest can link 50 pages by hand.':null;
 const byId=new Map(data.entries.map(e=>[e.id,e]));
 const rows:ConnectionRow[]=[
  ...connections.map(c=>({entry:c.entry,group:c.group,chips:[...t.chips(c.entry.id),...c.reasons.map(r=>({key:r.kind+r.label,label:r.label,tone:r.kind}))],notes:t.notes(c.entry.id),onAdd:t.canEdit?()=>t.add(c.entry.id):undefined,onRemove:links.includes(c.entry.id)?()=>unlink(c.entry.id):undefined})),
  ...[...new Set(t.ties.map(x=>x.otherId))].filter(id=>!connections.some(c=>c.entry.id===id)).flatMap(id=>{const e=byId.get(id);return e?[{entry:e,group:groupOf(e),chips:t.chips(id),notes:t.notes(id),onAdd:t.canEdit?()=>t.add(id):undefined}]:[];}),
 ];
 return <PageDrop className="qc-panel" label="Drop to link this page" check={check} onPage={id=>{setRefused('');link(id);}} onRefuse={setRefused}>
  <div className="qc-head">
   <p className="aside-hint">Worked out from who gave it, the goals, the reward, where it happens and the links in its text and log. Link other pages here or drag one in from the sidebar{t.canEdit?', or add a tie to say how a page is tied to the quest':''}.</p>
   <div className="qc-actions goal-anchor">
    {rows.length>0&&<button type="button" className="button small qc-web-toggle" aria-pressed={web} onClick={()=>setWeb(!web)}><Network size={14}/> {web?'Hide web':'Show web'}</button>}
    {t.canEdit&&<button type="button" className="button small" onClick={()=>t.openKinds()}><ListTree size={14}/> Kinds of tie</button>}
    {t.canEdit&&<button type="button" className="button small" disabled={!t.pages.length} onClick={()=>setPicking('tie')}><Plus size={14}/> Add a tie</button>}
    <button type="button" className="button small" disabled={links.length>=50} onClick={()=>setPicking('link')}><Link2 size={14}/> Link a page</button>
    {picking==='link'&&<TargetPicker label="Link a page to this quest" pages={pages.filter(e=>!links.includes(e.id))} current="" onClose={()=>setPicking(null)} onPage={id=>{link(id);setPicking(null);}}/>}
    {picking==='tie'&&<TargetPicker label="Tie this quest to…" pages={t.pages} current="" onClose={()=>setPicking(null)} onPage={id=>{setPicking(null);t.add(id);}}/>}
   </div>
  </div>
  {refused&&<p className="quest-fact-refused" role="status">{refused}</p>}
  {rows.length===0?<div className="qc-empty"><Network size={22} aria-hidden="true"/><p>Nothing is connected yet. Set who gave it, a reward, where it happens or a goal’s target, link a page in the text, or link one here.</p><button type="button" className="button small" onClick={()=>setPicking('link')}><Plus size={14}/> Link a page</button></div>
  :<div className={`qc-body${web?' web-open':''}`}>
   <ConnectionWeb title={entry.title} rows={rows} onOpen={onOpen}/>
   <ConnectionGroups rows={rows} onOpen={onOpen}/>
  </div>}
  {t.dialogs}
 </PageDrop>;
}
