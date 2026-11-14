"use client";
/*
 * A quest's Connections tab: the pages it touches, worked out from the quest (lib/encyclopedia/quest-connections.ts),
 * plus pages the GM links by hand. A list grouped by kind, and a web around the quest: beside each other on a
 * computer, the web behind a button on a phone.
 */
import {useMemo,useState,useSyncExternalStore} from 'react';
import {Link2,MapPin,Network,Plus,ScrollText,X} from 'lucide-react';
import './quest-connections.css';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import type {Quest} from '@/lib/encyclopedia/quests';
import {connectionGroups,questConnections,type Connection} from '@/lib/encyclopedia/quest-connections';
import {Face,TargetPicker,kindName} from './quest-goals';
import {PageDrop} from './page-drag';

const MAX_WEB=12;
const cut=(t:string,n:number)=>t.length>n?t.slice(0,n-1).trimEnd()+'…':t;
const why=(c:Connection)=>c.reasons.map(r=>r.label).join(' · ');

const NARROW='(max-width: 760px)';
const subscribe=(change:()=>void)=>{const m=window.matchMedia(NARROW);m.addEventListener('change',change);return()=>m.removeEventListener('change',change);};
/** Whether the screen is phone-sized, to draw the web tall instead of wide so its words stay readable. */
const useNarrow=()=>useSyncExternalStore(subscribe,()=>window.matchMedia(NARROW).matches,()=>false);

/** The quest in the middle and up to twelve pages around it, on an ellipse from the top: wide on a computer, tall on a phone. */
function Web({title,connections,onOpen}:{title:string;connections:Connection[];onOpen:(id:string)=>void}){
 const narrow=useNarrow(),shown=connections.slice(0,MAX_WEB);
 // A computer: an ellipse from the top. A phone: the quest at the top and the pages in two columns under it, so the words stay readable.
 const rows=Math.ceil(shown.length/2),box=narrow?`-180 -26 360 ${86+rows*56}`:'-310 -165 620 330',nameMax=narrow?16:20;
 const at=(i:number):[number,number]=>{if(narrow)return [i%2?92:-92,78+Math.floor(i/2)*56];const a=-Math.PI/2+i*2*Math.PI/shown.length;return [Math.cos(a)*225,Math.sin(a)*118];};
 const edge=(x:number,y:number)=>narrow?`M0 19 C 0 ${y*.6} ${x} ${y*.4} ${x} ${y-18}`:`M0 0 Q ${x*.55} ${y*.15} ${x} ${y}`;
 const hub=cut(title,narrow?18:26),hubW=Math.max(120,hub.length*7.4+28);
 return <figure className="qc-web">
  <svg viewBox={box} role="img" aria-label={`${title} and ${connections.length} connected page${connections.length===1?'':'s'}`}>
   {shown.map((c,i)=>{const [x,y]=at(i);return <path key={`e-${c.entry.id}`} className={`qc-edge ${c.group}`} d={edge(x,y)}/>;})}
   <g className="qc-hub"><rect x={-hubW/2} y={-19} width={hubW} height={38} rx={7}/><text x={0} y={5} textAnchor="middle">{hub}</text></g>
   {shown.map((c,i)=>{const [x,y]=at(i),name=cut(c.entry.title,nameMax),label=cut(c.reasons[0].label,18),w=Math.min(narrow?166:999,Math.max(92,Math.max(name.length*6.7,label.length*6)+22));
    return <g key={c.entry.id} className={`qc-node ${c.group}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} onClick={()=>onOpen(c.entry.id)}>
     <title>{`${c.entry.title}: ${why(c)}`}</title>
     <rect x={-w/2} y={-18} width={w} height={36} rx={6}/>
     <text className="qc-why" x={0} y={-4} textAnchor="middle">{label}</text>
     <text x={0} y={11} textAnchor="middle">{name}</text>
    </g>;})}
  </svg>
  {connections.length>MAX_WEB&&<figcaption>The web shows the first {MAX_WEB}. The list has all {connections.length}.</figcaption>}
 </figure>;
}

function Row({c,onOpen,onUnlink}:{c:Connection;onOpen:(id:string)=>void;onUnlink?:()=>void}){
 const e=c.entry,round=e.kind==='character'||e.kind==='faction';
 return <li className="qc-row">
  <button type="button" className="qc-page" onClick={()=>onOpen(e.id)}>
   {round?<Face entry={e} size={30}/>:<span className="qc-icon" aria-hidden="true">{c.group==='places'?<MapPin size={15}/>:<ScrollText size={15}/>}</span>}
   <span className="qc-name"><strong>{e.title}</strong><small>{kindName(e)}</small></span>
   <span className="qc-reasons">{c.reasons.map(r=><span key={r.kind+r.label} className={`qc-reason ${r.kind}`}>{r.label}</span>)}</span>
  </button>
  {onUnlink&&<button type="button" className="icon-button qc-unlink" aria-label={`Unlink ${e.title}`} title="Unlink this page" onClick={onUnlink}><X size={14}/></button>}
 </li>;
}

/** The Connections tab. */
export function QuestConnections({entry,data,quest:q,set,onOpen}:{entry:Entry;data:Workspace;quest:Quest;set:(patch:Partial<Quest>)=>void;onOpen:(id:string)=>void}){
 const connections=questConnections(data,{...entry,quest:q});
 const pages=useMemo(()=>data.entries.filter(e=>e.id!==entry.id&&e.kind!=='folder'&&e.worldId===entry.worldId&&(e.campaignId===null||e.campaignId===entry.campaignId)).sort((a,b)=>a.title.localeCompare(b.title)),[data.entries,entry.id,entry.worldId,entry.campaignId]);
 const [picking,setPicking]=useState(false),[web,setWeb]=useState(false),[refused,setRefused]=useState('');
 const links=q.linkIds??[];
 const link=(id:string)=>{if(links.includes(id)||links.length>=50)return;set({linkIds:[...links,id]});};
 const unlink=(id:string)=>{const next=links.filter(x=>x!==id);set({linkIds:next.length?next:undefined});};
 const check=(id:string)=>id===entry.id?'That is this quest.':!pages.some(e=>e.id===id)?'That page isn’t in this campaign.':links.includes(id)?'That page is already linked.':links.length>=50?'A quest can link 50 pages by hand.':null;
 return <PageDrop className="qc-panel" label="Drop to link this page" check={check} onPage={id=>{setRefused('');link(id);}} onRefuse={setRefused}>
  <div className="qc-head">
   <p className="aside-hint">Worked out from who gave it, the goals, the reward, where it happens and the links in its text and log. Link other pages here or drag one in from the sidebar.</p>
   <div className="qc-actions goal-anchor">
    {connections.length>0&&<button type="button" className="button small qc-web-toggle" aria-pressed={web} onClick={()=>setWeb(!web)}><Network size={14}/> {web?'Hide web':'Show web'}</button>}
    <button type="button" className="button small" disabled={links.length>=50} onClick={()=>setPicking(true)}><Link2 size={14}/> Link a page</button>
    {picking&&<TargetPicker label="Link a page to this quest" pages={pages.filter(e=>!links.includes(e.id))} current="" onClose={()=>setPicking(false)} onPage={id=>{link(id);setPicking(false);}}/>}
   </div>
  </div>
  {refused&&<p className="quest-fact-refused" role="status">{refused}</p>}
  {connections.length===0?<div className="qc-empty"><Network size={22} aria-hidden="true"/><p>Nothing is connected yet. Set who gave it, a reward, where it happens or a goal’s target, link a page in the text, or link one here.</p><button type="button" className="button small" onClick={()=>setPicking(true)}><Plus size={14}/> Link a page</button></div>
  :<div className={`qc-body${web?' web-open':''}`}>
   <Web title={entry.title} connections={connections} onOpen={onOpen}/>
   <div className="qc-groups">{connectionGroups.map(g=>{const rows=connections.filter(c=>c.group===g.id);return rows.length?<section key={g.id} className="qc-group" aria-label={g.name}>
    <span className="eyebrow">{g.name} <small>{rows.length}</small></span>
    <ul>{rows.map(c=><Row key={c.entry.id} c={c} onOpen={onOpen} onUnlink={links.includes(c.entry.id)?()=>unlink(c.entry.id):undefined}/>)}</ul>
   </section>:null;})}</div>
  </div>}
 </PageDrop>;
}
