'use client';
/*
 * Collapsible group headings on the Stats, Inventory and Spells tabs (Abilities, Skills, Weapons…). Which groups are
 * closed is remembered on this device only, per kind of list (and campaign for stats); nothing is saved to the page.
 */
import {useState,type ReactNode} from 'react';
import {ChevronDown,ChevronRight} from 'lucide-react';

const key=(scope:string)=>`encyclopedia:collapsed:${scope}`;
function read(scope:string):Set<string>{try{const v=JSON.parse(localStorage.getItem(key(scope))??'[]');return new Set(Array.isArray(v)?v.filter((x:unknown)=>typeof x==='string'):[]);}catch{return new Set();}}

/** The groups closed in this list, and a toggle that remembers the choice on this device. */
export function useCollapsed(scope:string){
 const [closed,setClosed]=useState<Set<string>>(()=>typeof window==='undefined'?new Set():read(scope));
 const toggle=(name:string)=>setClosed(c=>{const n=new Set(c);if(n.has(name))n.delete(name);else n.add(name);try{localStorage.setItem(key(scope),JSON.stringify([...n].slice(-200)));}catch{/* private mode: keep it for this visit */}return n;});
 return {isClosed:(name:string)=>closed.has(name),toggle};
}

/** A group's heading as a button that opens and closes it. `extra` sits after the rule (weights, arrange arrows). */
export function GroupHead({title,count,closed,onToggle,extra}:{title:string;count:ReactNode;closed:boolean;onToggle:()=>void;extra?:ReactNode}){
 return <div className={`inv-group-head inv-group-collapsible${closed?' is-closed':''}`}>
  <button type="button" className="inv-group-toggle" aria-expanded={!closed} title={closed?`Show ${title}`:`Hide ${title}`} onClick={onToggle}>{closed?<ChevronRight size={14} aria-hidden="true"/>:<ChevronDown size={14} aria-hidden="true"/>}<h3>{title}</h3><small>{count}</small></button>
  <span className="inv-rule"/>{extra}
 </div>;
}
