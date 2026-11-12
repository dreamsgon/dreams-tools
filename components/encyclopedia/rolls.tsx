"use client";
import {useEffect,useState} from "react";
import {Dices,X,RotateCcw} from "lucide-react";
import {rollDice} from "@/lib/rolls";

export type RollResult={id:number;title:string;formula:string;total:number;detail:string;at:number};
const EVENT="encyclopedia-roll";
let sequence=0;

/** "14 + 5" or "(5, 4) + 3": each dice group in brackets when it has more than one die. */
export function rollDetail(parts:ReturnType<typeof rollDice>["parts"]){
 return parts.map((p,i)=>{const text=p.count?(p.dice.length>1?`(${p.dice.join(", ")})`:String(p.dice[0]??0)):String(p.constant);return i===0?(p.sign<0?`−${text}`:text):`${p.sign<0?"−":"+"} ${text}`;}).join(" ");
}
/** Rolls a formula and shows the result card. Rolls never change the encyclopedia. */
export function rollInline(title:string,formula:string){
 const r=rollDice(formula);const result:RollResult={id:++sequence,title,formula:r.formula,total:r.total,detail:rollDetail(r.parts),at:Date.now()};
 window.dispatchEvent(new CustomEvent<RollResult>(EVENT,{detail:result}));return result;
}

export function RollChip({title,formula,label}:{title:string;formula:string;label:string|null}){
 return <button type="button" className="roll-chip" title={`Roll ${formula}`} onClick={()=>rollInline(label?`${title} · ${label}`:title,formula)}><Dices size={12} aria-hidden="true"/>{label??formula}</button>;
}

/** The latest roll, bottom right, with the few before it. */
export function RollResults(){
 const [rolls,setRolls]=useState<RollResult[]>([]);
 useEffect(()=>{const on=(e:Event)=>setRolls(old=>[(e as CustomEvent<RollResult>).detail,...old].slice(0,6));window.addEventListener(EVENT,on);return()=>window.removeEventListener(EVENT,on);},[]);
 const [latest,...earlier]=rolls;if(!latest)return null;
 return <div className="roll-result" role="status" aria-live="polite">
  <div className="roll-result-main"><div className="roll-result-head"><span>{latest.title}</span><button className="icon-button" aria-label="Close roll result" onClick={()=>setRolls([])}><X size={14}/></button></div>
   <div className="roll-result-total"><strong key={latest.id}>{latest.total}</strong><span>{latest.formula}</span></div>
   <div className="roll-result-detail">Rolled {latest.detail}</div></div>
  <div className="roll-result-foot">{earlier.length?<span>Earlier: {earlier.slice(0,4).map(r=>r.total).join(", ")}</span>:<span>Only you see this roll</span>}<span className="spacer"/><button onClick={()=>rollInline(latest.title,latest.formula)}><RotateCcw size={13}/> Roll again</button></div>
 </div>;
}
