'use client';
import {useMemo,useState,useSyncExternalStore} from 'react';
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
 const formulas=groups.flatMap(g=>g.rows.flatMap(r=>r.buttons.map(b=>b.formula))),anyD20=formulas.some(isSingleD20);
 // With any single d20 roll the choice is advantage and applies to those only; with none it is roll twice and applies to every roll.
 const names:Record<RollMode,string>=anyD20||!twice?{high:'Advantage',normal:'Normal',low:'Disadvantage'}:{high:'Keep higher',normal:'Normal',low:'Keep lower'};
 const hint=anyD20||!twice?'Advantage applies to d20 rolls.':'Rolls twice and keeps the higher or lower total.';
 const go=(name:string,formula:string)=>{onRoll(name,formula,anyD20&&!isSingleD20(formula)?'normal':mode);setMode('normal');};
 return <div className={`sheet-roll-panel${compact?' compact':''}`}>
  <div className="sheet-mode" role="radiogroup" aria-label="Roll twice">
   {modes.map(m=><button key={m} type="button" role="radio" aria-checked={mode===m} className={mode===m?'on':''} onClick={()=>setMode(m)}>{names[m]}</button>)}
  </div>
  <small className="sheet-mode-hint">{hint}</small>
  {groups.map(g=><div className="sheet-roll-group" key={g.title}>
   <h4>{g.title}</h4>
   <ul>{g.rows.map(r=>r.buttons.length>1
    ?<li key={r.id} className="sheet-roll-pair"><span className="sheet-roll-name">{r.name}</span>
     <span className="sheet-roll-buttons">{r.buttons.map(b=><RollButton key={b.rollName} label={b.label} b={b} go={go}/>)}</span></li>
    :<li key={r.id} className="sheet-roll-single"><RollButton label={r.name} b={r.buttons[0]} go={go}/></li>)}</ul>
  </div>)}
  {!compact&&<details className="sheet-dice-help"><summary>Dice help</summary><p>{diceHelpText}</p></details>}
 </div>;
}

function RollButton({label,b,go}:{label:string;b:{rollName:string;formula:string};go:(name:string,formula:string)=>void}){
 return <button type="button" className="sheet-roll-button" title={`Roll ${b.rollName}: ${b.formula}`} onClick={()=>go(b.rollName,b.formula)}><span>{label}</span><code>{b.formula}</code></button>;
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
