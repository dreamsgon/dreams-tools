"use client";
/*
 * The parts a Connections tab is made of: a list of connected pages in groups (people, places, quests, things), each
 * with chips saying how it is connected, and a web with the page in the middle. A quest's Connections tab and every
 * other page's use them. A chip can be a button (a tie opens its editor) or just words (a worked-out connection).
 */
import {useSyncExternalStore} from 'react';
import {EyeOff,MapPin,Plus,ScrollText,X} from 'lucide-react';
import './quest-connections.css';
import type {Entry} from '@/lib/encyclopedia/world-model';
import {connectionGroups,type ConnectionGroup} from '@/lib/encyclopedia/quest-connections';
import {Face,kindName} from './quest-goals';

export type Chip={key:string;label:string;
 /** Classes for its colour: a tie's group (`tie tie-family`), or a quest reason's kind. */
 tone:string;title?:string;gm?:boolean;onClick?:()=>void};
export type ConnectionRow={entry:Entry;group:ConnectionGroup;chips:Chip[];notes?:string[];onAdd?:()=>void;onRemove?:()=>void;removeLabel?:string};

const MAX_WEB=12;
const cut=(t:string,n:number)=>t.length>n?t.slice(0,n-1).trimEnd()+'…':t;

const NARROW='(max-width: 760px)';
const subscribe=(change:()=>void)=>{const m=window.matchMedia(NARROW);m.addEventListener('change',change);return()=>m.removeEventListener('change',change);};
/** Whether the screen is phone-sized, to draw the web tall instead of wide so its words stay readable. */
const useNarrow=()=>useSyncExternalStore(subscribe,()=>window.matchMedia(NARROW).matches,()=>false);

/** The page in the middle and up to twelve pages around it, on an ellipse from the top: wide on a computer, tall on a phone. */
export function ConnectionWeb({title,rows,onOpen}:{title:string;rows:ConnectionRow[];onOpen:(id:string)=>void}){
 const narrow=useNarrow(),shown=rows.filter(r=>r.chips.length).slice(0,MAX_WEB);
 // A computer: an ellipse from the top. A phone: the page at the top and the others in two columns under it.
 const lines=Math.ceil(shown.length/2),box=narrow?`-180 -26 360 ${86+lines*56}`:'-310 -165 620 330',nameMax=narrow?16:20;
 const at=(i:number):[number,number]=>{if(narrow)return [i%2?92:-92,78+Math.floor(i/2)*56];const a=-Math.PI/2+i*2*Math.PI/shown.length;return [Math.cos(a)*225,Math.sin(a)*118];};
 const edge=(x:number,y:number)=>narrow?`M0 19 C 0 ${y*.6} ${x} ${y*.4} ${x} ${y-18}`:`M0 0 Q ${x*.55} ${y*.15} ${x} ${y}`;
 const hub=cut(title,narrow?18:26),hubW=Math.max(120,hub.length*7.4+28);
 return <figure className="qc-web">
  <svg viewBox={box} role="img" aria-label={`${title} and ${rows.length} connected page${rows.length===1?'':'s'}`}>
   {shown.map((r,i)=>{const [x,y]=at(i);return <path key={`e-${r.entry.id}`} className={`qc-edge ${r.group} ${r.chips[0].tone}`} d={edge(x,y)}/>;})}
   <g className="qc-hub"><rect x={-hubW/2} y={-19} width={hubW} height={38} rx={7}/><text x={0} y={5} textAnchor="middle">{hub}</text></g>
   {shown.map((r,i)=>{const [x,y]=at(i),name=cut(r.entry.title,nameMax),label=cut(r.chips[0].label,18),w=Math.min(narrow?166:999,Math.max(92,Math.max(name.length*6.7,label.length*6)+22));
    return <g key={r.entry.id} className={`qc-node ${r.group} ${r.chips[0].tone}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} onClick={()=>onOpen(r.entry.id)}>
     <title>{`${r.entry.title}: ${r.chips.map(c=>c.label).join(' · ')}`}</title>
     <rect x={-w/2} y={-18} width={w} height={36} rx={6}/>
     <text className="qc-why" x={0} y={-4} textAnchor="middle">{label}</text>
     <text x={0} y={11} textAnchor="middle">{name}</text>
    </g>;})}
  </svg>
  {rows.length>MAX_WEB&&<figcaption>The web shows the first {MAX_WEB}. The list has all {rows.length}.</figcaption>}
 </figure>;
}

function Row({row,onOpen}:{row:ConnectionRow;onOpen:(id:string)=>void}){
 const e=row.entry,round=e.kind==='character'||e.kind==='faction';
 return <li className="qc-row">
  <button type="button" className="qc-page" onClick={()=>onOpen(e.id)}>
   {round?<Face entry={e} size={30}/>:<span className="qc-icon" aria-hidden="true">{row.group==='places'?<MapPin size={15}/>:<ScrollText size={15}/>}</span>}
   <span className="qc-name"><strong>{e.title}</strong><small>{kindName(e)}</small></span>
  </button>
  <span className="qc-end"><span className="qc-reasons">{row.chips.map(c=>c.onClick
   ?<button type="button" key={c.key} className={`qc-reason ${c.tone}`} title={c.title} onClick={c.onClick}>{c.gm&&<EyeOff size={11} aria-label="GM only"/>}{c.label}</button>
   :<span key={c.key} className={`qc-reason ${c.tone}`} title={c.title}>{c.gm&&<EyeOff size={11} aria-label="GM only"/>}{c.label}</span>)}</span>
  {(row.onAdd||row.onRemove)&&<span className="qc-row-tools">
   {row.onAdd&&<button type="button" className="icon-button qc-unlink" aria-label={`Add a tie with ${e.title}`} title="Add a tie" onClick={row.onAdd}><Plus size={14}/></button>}
   {row.onRemove&&<button type="button" className="icon-button qc-unlink" aria-label={`${row.removeLabel??'Unlink'} ${e.title}`} title={row.removeLabel??'Unlink this page'} onClick={row.onRemove}><X size={14}/></button>}
  </span>}</span>
  {row.notes?.length?<p className="qc-notes">{row.notes.join(' · ')}</p>:null}
 </li>;
}

/** Rows in groups: people and organizations, places, quests, then everything else. */
export function ConnectionGroups({rows,onOpen}:{rows:ConnectionRow[];onOpen:(id:string)=>void}){
 return <div className="qc-groups">{connectionGroups.map(g=>{const list=rows.filter(r=>r.group===g.id);return list.length?<section key={g.id} className="qc-group" aria-label={g.name}>
  <span className="eyebrow">{g.name} <small>{list.length}</small></span>
  <ul>{list.map(r=><Row key={r.entry.id} row={r} onOpen={onOpen}/>)}</ul>
 </section>:null;})}</div>;
}

/** Turns a tie's kind group into the classes that colour it. */
export const tieTone=(group:string)=>`tie tie-${group}`;
export type {ConnectionGroup};
