'use client';
/*
 * The Stats tab on the players' page: the campaign's sheet, read only, with its roll buttons. A member rolling their own
 * character rolls on the server (the roll log, Discord, and any spending like 1 Stress); anyone else rolls on this device.
 * The rows come from statRows on the server, worked out from the stats players can see, so no formula reaches here.
 */
import {useState} from 'react';
import {ChevronDown,ChevronRight,Dices,Info} from 'lucide-react';
import {outcomeOf,type StatRow} from '@/lib/encyclopedia/stat-rolls';
import type {PlayerTracker} from '@/lib/encyclopedia/trackers';
import {isSingleD20,type RollMode} from '@/lib/rolls';
import {rollInline} from './rolls';
import {rollStatFromSheet} from './player-sheet-api';
import './inventory.css';
import './stat-sheet.css';

const modeNames:Record<RollMode,string>={normal:'Normal',high:'Advantage',low:'Disadvantage'};
const signed=(n:number)=>n<0?`−${-n}`:`+${n}`;
const shown=(v:StatRow['value'])=>v===null||v===''?'—':typeof v==='boolean'?(v?'Yes':'No'):String(v);

export function PlayerStatSheet({title,entryId,stats,trackers,memberRef,canRoll,onChanged}:{title:string;entryId:string;stats:StatRow[];trackers:PlayerTracker[];memberRef?:string;canRoll:boolean;onChanged:()=>void}){
 const [mode,setMode]=useState<RollMode>('normal'),[error,setError]=useState(''),[open,setOpen]=useState<Set<string>>(new Set);
 const server=!!memberRef&&canRoll,anyRoll=stats.some(s=>s.rolls.some(r=>r.dice)),anyD20=stats.some(s=>s.rolls.some(r=>r.dice&&isSingleD20(r.dice)));
 const groups:{name:string;rows:StatRow[]}[]=[];
 for(const s of stats){const g=groups.find(x=>x.name===s.section);if(g)g.rows.push(s);else groups.push({name:s.section,rows:[s]});}
 const roll=(s:StatRow,r:StatRow['rolls'][number],dice:string)=>{
  setError('');
  const m=anyD20&&!isSingleD20(dice)?'normal':mode;setMode('normal');
  if(server)void rollStatFromSheet(memberRef!,entryId,s.id,r.name,m).then(x=>{if(x.spent)onChanged();}).catch(e=>setError(e instanceof Error?e.message:'Could not roll. Try again.'));
  else rollInline(`${title} · ${s.label}${s.rolls.length>1||r.name!=='Roll'?` · ${r.name}`:''}`,dice,{mode:m,log:true,...(r.need?{outcome:(t:number)=>outcomeOf(t,r.need)}:{})});
 };
 return <div className="stat-sheet player-stat-sheet">
  {anyRoll&&<div className="stat-sheet-tools">
   <p className="aside-hint">{server?`Your rolls appear in the roll log and in the campaign’s Discord channel as ${title}.`:'Rolls here stay on this device.'}</p>
   <div className="stat-sheet-mode" role="radiogroup" aria-label="Next roll">{(['normal','high','low'] as RollMode[]).map(m=><button key={m} type="button" role="radio" aria-checked={mode===m} className={mode===m?'on':''} onClick={()=>setMode(m)}>{anyD20||m==='normal'?modeNames[m]:m==='high'?'Keep higher':'Keep lower'}</button>)}</div>
  </div>}
  {error&&<p role="alert" className="stat-roll-hint">{error}</p>}
  {groups.map(g=><section key={g.name||'other'} className="inv-group stat-group">
   {(g.name||groups.length>1)&&<div className="inv-group-head"><h3>{g.name||'Other'}</h3><small>{g.rows.length}</small><span className="inv-rule"/></div>}
   <div className="inv-rows" role="list">{g.rows.map(s=>{
    const tracker=s.spend?trackers.find(t=>t.label.trim().toLowerCase()===s.spend!.tracker.trim().toLowerCase()):undefined;
    const short=!!s.spend&&server&&(!tracker||tracker.value<s.spend.n),hint=s.rolls.find(r=>!r.dice&&r.hint);
    return <div role="listitem" key={s.id} className="inv-row stat-row">
     <div className="inv-line stat-line">
      <span className="stat-main"><span className="store-name">{s.description?<button type="button" className="inv-name" aria-expanded={open.has(s.id)} title={s.description} onClick={()=>setOpen(o=>{const n=new Set(o);if(n.has(s.id))n.delete(s.id);else n.add(s.id);return n;})}>{open.has(s.id)?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<span>{s.label}</span><Info size={12} className="stat-info" aria-label="Has a description"/></button>:<strong className="inv-name stat-read-name">{s.label}</strong>}</span>{s.note&&<span className="stat-sub">{s.note}</span>}</span>
      {s.type!=='textarea'&&s.type!=='none'&&<span className="stat-value stat-read-value">{shown(s.value)}{s.worked!==undefined&&<span className="stat-worked">{signed(s.worked)}</span>}</span>}
      <span className="stat-actions">
       {s.rolls.map(r=>r.dice&&<button type="button" key={r.name} className="roll-chip stat-roll-chip" disabled={short}
        title={short?(tracker?`Needs ${s.spend!.n} ${tracker.label}; ${tracker.value} left`:`Needs a ${s.spend!.tracker} tracker on this character`):`Roll ${r.dice}${r.need?`, needs ${r.need.n} ${r.need.op==='atLeast'?'or more':'or under'}`:''}${s.spend&&server?`, spends ${s.spend.n} ${s.spend.tracker}`:''}`}
        onClick={()=>roll(s,r,r.dice!)}><Dices size={12} aria-hidden="true"/>{r.name}<span className="stat-dice">{r.dice}{r.need?` ${r.need.op==='atLeast'?'≥':'≤'} ${r.need.n}`:''}</span></button>)}
       {s.spend&&<small className={`stat-spend${short?' short':''}`}>−{s.spend.n} {tracker?.label??s.spend.tracker}{tracker?` (${tracker.value} left)`:''}</small>}
      </span>
     </div>
     {s.type==='textarea'&&<div className="stat-long player-prose">{shown(s.value)}</div>}
     {s.description&&open.has(s.id)&&<p className="stat-description stat-read-description">{s.description}</p>}
     {hint&&<p className="stat-roll-hint">{s.rolls.length>1?`${hint.name}: `:''}{hint.hint}</p>}
    </div>;})}</div>
  </section>)}
 </div>;
}
