'use client';
import {useMemo,useState,useSyncExternalStore} from 'react';
import {Dices} from 'lucide-react';
import {isSingleD20,type RollMode} from '@/lib/rolls';
import {diceHelpText,type SheetRollGroup} from '@/lib/encyclopedia/sheet-rolls';
import {timeAgo} from '@/lib/encyclopedia/sheet-link';
import {readLocalRollLog,subscribeLocalRollLog} from '@/lib/local-roll-log';
import './character-sheet.css';

const modes:RollMode[]=['high','normal','low'];
/**
 * The Rolls area of a character sheet: each roll as a button with its formula, and the Advantage / Normal / Disadvantage
 * choice that applies to the next roll and then goes back to Normal. `twice` rolls a formula that isn't a single d20
 * twice and keeps the higher or lower total (the Encyclopedia); without it, other formulas just roll normally (Maptable's tray).
 */
export function SheetRolls({groups,twice,compact,onRoll}:{groups:SheetRollGroup[];twice:boolean;compact?:boolean;onRoll:(rollName:string,formula:string,mode:RollMode)=>void}){
 const [mode,setMode]=useState<RollMode>('normal');
 const formulas=groups.flatMap(g=>g.rows.flatMap(r=>r.buttons.map(b=>b.formula))),allD20=formulas.every(isSingleD20);
 const names:Record<RollMode,string>=allD20||!twice?{high:'Advantage',normal:'Normal',low:'Disadvantage'}:{high:'Keep higher',normal:'Normal',low:'Keep lower'};
 const hint=!twice?'Advantage shows only on d20 rolls.':allD20?'Advantage rolls two d20s and keeps the higher. Disadvantage keeps the lower.':'On a single d20 this is advantage or disadvantage. Other rolls are rolled twice and the higher or lower total is kept.';
 const go=(name:string,formula:string)=>{onRoll(name,formula,mode);setMode('normal');};
 return <div className={`sheet-roll-panel${compact?' compact':''}`}>
  <div className="sheet-mode" role="radiogroup" aria-label="Roll twice">
   {modes.map(m=><button key={m} type="button" role="radio" aria-checked={mode===m} className={mode===m?'on':''} onClick={()=>setMode(m)}>{names[m]}</button>)}
  </div>
  <small className="sheet-mode-hint">{hint}</small>
  {groups.map(g=><div className="sheet-roll-group" key={g.title}>
   <h4>{g.title}</h4>
   <ul>{g.rows.map(r=><li key={r.id}>
    {r.buttons.length>1&&<span className="sheet-roll-name">{r.name}</span>}
    <span className="sheet-roll-buttons">{r.buttons.map(b=><button key={b.rollName} type="button" className="sheet-roll-button" title={`Roll ${b.rollName}: ${b.formula}`} onClick={()=>go(b.rollName,b.formula)}>
     <Dices size={13} aria-hidden="true"/><span>{r.buttons.length>1?b.label:r.name}</span><code>{b.formula}</code></button>)}</span>
   </li>)}</ul>
  </div>)}
  {!compact&&<details className="sheet-dice-help"><summary>Dice help</summary><p>{diceHelpText}</p></details>}
 </div>;
}

let logVersion=0;
const subscribe=(cb:()=>void)=>subscribeLocalRollLog(()=>{logVersion++;cb();});
/** The latest rolls this browser made from a character's sheet, newest first: "Ayla · Stealth · 1d20+5 = 19". */
export function SheetRollLog({character,limit=4}:{character:string;limit?:number}){
 const version=useSyncExternalStore(subscribe,()=>logVersion,()=>0);
 const mine=useMemo(()=>readLocalRollLog().filter(e=>e.label.startsWith(`${character} · `)).slice(0,limit),[character,limit,version]); // eslint-disable-line react-hooks/exhaustive-deps
 if(!mine.length)return <p className="sheet-log-empty">No rolls from this sheet yet.</p>;
 return <ol className="sheet-roll-log" aria-label={`Latest rolls for ${character}`}>{mine.map(e=><li key={e.id}>
  <span>{e.label} · {e.breakdown.split(' · ')[0]} = <strong>{e.total}</strong></span>
  <small>{timeAgo(new Date(e.timestamp).toISOString())||'just now'}{e.outcome?` · ${e.outcome}`:''}</small></li>)}</ol>;
}
