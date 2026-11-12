"use client";
import {createContext,useContext,useEffect,useRef,useState} from "react";
import {Dices,X,RotateCcw,Send,Check} from "lucide-react";
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

/** Where chips send their rolls. The Encyclopedia shows its own result card; Maptable passes rolls to its dice tray. */
export const RollHandler=createContext<((title:string,formula:string)=>void)|null>(null);

export function RollChip({title,formula,label,context}:{title:string;formula:string;label:string|null;context?:string}){
 const what=[context,label].filter(Boolean).join(" "),handler=useContext(RollHandler);
 return <button type="button" className="roll-chip" title={`Roll ${formula}`} onClick={()=>(handler??rollInline)(what?`${title} · ${what}`:title,formula)}><Dices size={12} aria-hidden="true"/>{label??formula}</button>;
}

export type DiscordTarget={campaignId:string;label:string};
type Sent={id:number;state:"sending"|"sent"|"error";message?:string};
const autoKey=(campaignId:string)=>`encyclopedia:discord-auto:${campaignId}`;

/** The latest roll, bottom right, with the few before it. Can send rolls to the campaign's Discord channel. */
export function RollResults({discord,onSetupDiscord}:{discord:DiscordTarget|null;onSetupDiscord?:()=>void}){
 const [rolls,setRolls]=useState<RollResult[]>([]),[sent,setSent]=useState<Sent|null>(null),[auto,setAuto]=useState(false);
 const target=useRef(discord);target.current=discord;const autoRef=useRef(auto);autoRef.current=auto;
 useEffect(()=>{let value=false;try{value=!!discord&&localStorage.getItem(autoKey(discord.campaignId))==="1";}catch{/* optional */}setAuto(value);},[discord]);
 const send=async(r:RollResult)=>{const d=target.current;if(!d)return;setSent({id:r.id,state:"sending"});
  try{const res=await fetch("/api/encyclopedia/discord-roll",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({campaignId:d.campaignId,title:r.title,formula:r.formula,total:r.total,detail:r.detail})});const v=await res.json().catch(()=>({})) as {error?:string};if(!res.ok)throw new Error(v.error??"Discord did not accept the roll.");setSent({id:r.id,state:"sent"});}
  catch(e){setSent({id:r.id,state:"error",message:e instanceof Error?e.message:"Could not send to Discord."});}};
 useEffect(()=>{const on=(e:Event)=>{const r=(e as CustomEvent<RollResult>).detail;setRolls(old=>[r,...old].slice(0,6));if(autoRef.current&&target.current)void send(r);};window.addEventListener(EVENT,on);return()=>window.removeEventListener(EVENT,on);},[]);
 const [latest,...earlier]=rolls;if(!latest)return null;
 const status=sent?.id===latest.id?sent:null;
 return <div className="roll-result" role="status" aria-live="polite">
  <div className="roll-result-main"><div className="roll-result-head"><span>{latest.title}</span><button className="icon-button" aria-label="Close roll result" onClick={()=>setRolls([])}><X size={14}/></button></div>
   <div className="roll-result-total"><strong key={latest.id}>{latest.total}</strong><span>{latest.formula}</span></div>
   <div className="roll-result-detail">Rolled {latest.detail}{earlier.length?` · Earlier: ${earlier.slice(0,4).map(r=>r.total).join(", ")}`:""}</div>
   {status?.state==="error"&&<p className="roll-result-error" role="alert">{status.message}</p>}</div>
  <div className="roll-result-foot">
   {discord?(status?.state==="sent"?<span className="roll-sent"><Check size={13}/> Sent to {discord.label}</span>:<button disabled={status?.state==="sending"} onClick={()=>void send(latest)}><Send size={13}/> {status?.state==="sending"?"Sending…":"Send to Discord"}</button>)
    :onSetupDiscord?<button onClick={onSetupDiscord}><Send size={13}/> Set up Discord</button>:<span>Only you see this roll</span>}
   <span className="spacer"/>
   {discord&&<label className="roll-auto" title="Send every roll from this campaign to Discord"><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);try{localStorage.setItem(autoKey(discord.campaignId),e.target.checked?"1":"0");}catch{/* optional */}}}/> Always</label>}
   <button onClick={()=>rollInline(latest.title,latest.formula)}><RotateCcw size={13}/> Roll again</button></div>
 </div>;
}
