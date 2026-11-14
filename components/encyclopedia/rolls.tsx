"use client";
import {createContext,useContext,useEffect,useRef,useState} from "react";
import {Dices,X,RotateCcw,Send,Check} from "lucide-react";
import {describeParts,partText,isSingleD20,rollDice,rollTwice,withKeepMode,type RollMode} from "@/lib/rolls";
import {markLocalRoll,recordLocalRoll} from "@/lib/local-roll-log";
import type {TableRoll} from "@/lib/encyclopedia/tables";
import type {TableResult} from "@/lib/encyclopedia/discord-table";

/** A random table rolled from a page: what came up, how to roll it again, and what to post to Discord. */
export type TableRollShown={title:string;roll:TableRoll;again:()=>void;result:TableResult};
export type RollResult={id:number;title:string;formula:string;total:number;detail:string;at:number;table?:TableRollShown;logId?:string;base?:string;mode?:RollMode};
const EVENT="encyclopedia-roll";
/** Pages listen for this to mark the row that came up in a table shown on them. */
export const TABLE_ROLL_EVENT="encyclopedia-table-roll";
let sequence=0;

/** "14 + 5" or "(5, 4) + 3": each dice group in brackets when it has more than one die. Dropped, exploding, success and plus/minus dice read as described in lib/rolls. */
export function rollDetail(parts:ReturnType<typeof rollDice>["parts"]){return describeParts(parts);}
export type RollOptions={
  /** Roll twice and keep the higher or lower: advantage on a single d20, otherwise the whole formula twice. */
  mode?:RollMode;
  /** Also add the roll to the per-browser roll log (the one Maptable shows). */
  log?:boolean;
};
const MODE_NAMES={d20:{high:"Advantage",low:"Disadvantage"},other:{high:"Keep higher",low:"Keep lower"}};
/** What a roll with a mode says, in the order rolled: "Disadvantage: rolled 13 and 5, kept 5, +5" or "Keep higher: rolled 9 and 14". */
function modeDetail(formula:string,mode:"high"|"low",kept:ReturnType<typeof rollDice>,first?:ReturnType<typeof rollDice>,second?:ReturnType<typeof rollDice>){
 const d20=isSingleD20(formula),name=MODE_NAMES[d20?"d20":"other"][mode];
 if(d20){const p=kept.parts[0],rest=kept.parts.slice(1).map(x=>`${x.sign<0?"−":"+"}${x.count?partText(x):x.constant}`);return [`${name}: rolled ${(p.rolled??p.dice).join(" and ")}`,`kept ${p.dice[0]}`,...rest].join(", ");}
 return `${name}: rolled ${first?.total} and ${second?.total}`;
}
/** Rolls a formula and shows the result card. Rolls never change the encyclopedia. */
export function rollInline(title:string,formula:string,options:RollOptions={}){
 const mode=options.mode&&options.mode!=="normal"?options.mode:null;let shownFormula=formula,detail:string,total:number;
 if(mode&&isSingleD20(formula)){const r=rollDice(withKeepMode(formula,mode));shownFormula=r.formula;total=r.total;detail=modeDetail(formula,mode,r);}
 else if(mode){const t=rollTwice(formula,mode);total=t.kept.total;detail=`${modeDetail(formula,mode,t.kept,t.first,t.second)} · kept ${rollDetail(t.kept.parts)}`;}
 else{const r=rollDice(formula);total=r.total;detail=rollDetail(r.parts);}
 const logged=options.log?recordLocalRoll({label:title,total,breakdown:`${shownFormula}${mode&&!isSingleD20(formula)?` (${MODE_NAMES.other[mode].toLowerCase()})`:""} · ${detail}`}):undefined;
 const result:RollResult={id:++sequence,title,formula:shownFormula,total,detail,at:Date.now(),base:formula,...(mode?{mode}:{}),...(logged?{logId:logged.id}:{})};
 window.dispatchEvent(new CustomEvent<RollResult>(EVENT,{detail:result}));return result;
}

/** Shows a table's result in the roll card. */
export function showTableRoll(t:TableRollShown){
 const result:RollResult={id:++sequence,title:t.title,formula:t.roll.roll,total:NaN,detail:t.roll.steps.map(s=>`${s.table}: ${s.text}`).join(" · "),at:Date.now(),table:t};
 window.dispatchEvent(new CustomEvent<RollResult>(EVENT,{detail:result}));window.dispatchEvent(new CustomEvent<TableRollShown>(TABLE_ROLL_EVENT,{detail:t}));return result;
}
/** Posts a table or oracle result to Discord: for an Encyclopedia campaign, or the Maptable campaign of the open scene. */
export async function postTableResult(where:{campaignId:string}|{maptableCampaignId:string},result:TableResult){
 const res=await fetch("/api/encyclopedia/discord-table",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...where,result})});
 const body=await res.json().catch(()=>({})) as {skipped?:boolean;error?:string};
 if(!res.ok)throw new Error(body.error??"Discord did not accept the result.");
 if(body.skipped)throw new Error("Dice rolls are set to “Don’t post” in Connections › Discord.");
}

/** Where chips send their rolls. The Encyclopedia shows its own result card; Maptable passes rolls to its dice tray. */
export const RollHandler=createContext<((title:string,formula:string)=>void)|null>(null);

export function RollChip({title,formula,label,context}:{title:string;formula:string;label:string|null;context?:string}){
 const what=[context,label].filter(Boolean).join(" "),handler=useContext(RollHandler);
 return <button type="button" className="roll-chip" title={`Roll ${formula}`} onClick={()=>(handler??rollInline)(what?`${title} · ${what}`:title,formula)}><Dices size={12} aria-hidden="true"/>{label??formula}</button>;
}

const short=(text:string)=>text.length>28?text.slice(0,27).trimEnd()+"…":text;
export type DiscordTarget={campaignId:string;label:string};
type Sent={id:number;state:"sending"|"sent"|"error";message?:string};
const autoKey=(campaignId:string)=>`encyclopedia:discord-auto:${campaignId}`;

/** The latest roll, bottom right, with the few before it. Can send rolls to the campaign's Discord channel. */
export function RollResults({discord,onSetupDiscord}:{discord:DiscordTarget|null;onSetupDiscord?:()=>void}){
 const [rolls,setRolls]=useState<RollResult[]>([]),[sent,setSent]=useState<Sent|null>(null),[auto,setAuto]=useState(false);
 const target=useRef(discord);target.current=discord;const autoRef=useRef(auto);autoRef.current=auto;
 useEffect(()=>{let value=false;try{value=!!discord&&localStorage.getItem(autoKey(discord.campaignId))==="1";}catch{/* optional */}setAuto(value);},[discord]);
 const send=async(r:RollResult)=>{const d=target.current;if(!d)return;setSent({id:r.id,state:"sending"});
  try{if(r.table){await postTableResult({campaignId:d.campaignId},r.table.result);setSent({id:r.id,state:"sent"});return;}
   const res=await fetch("/api/encyclopedia/discord-roll",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({campaignId:d.campaignId,title:r.title,formula:r.formula,total:r.total,detail:r.detail.slice(0,400)})});const v=await res.json().catch(()=>({})) as {error?:string};if(!res.ok)throw new Error(v.error??"Discord did not accept the roll.");setSent({id:r.id,state:"sent"});if(r.logId)markLocalRoll(r.logId,"Posted to Discord");}
  catch(e){setSent({id:r.id,state:"error",message:e instanceof Error?e.message:"Could not send to Discord."});}};
 useEffect(()=>{const on=(e:Event)=>{const r=(e as CustomEvent<RollResult>).detail;setRolls(old=>[r,...old].slice(0,6));if(autoRef.current&&target.current)void send(r);};window.addEventListener(EVENT,on);return()=>window.removeEventListener(EVENT,on);},[]);
 const [latest,...earlier]=rolls;if(!latest)return null;
 const status=sent?.id===latest.id?sent:null;
 return <div className="roll-result" role="status" aria-live="polite">
  <div className="roll-result-main"><div className="roll-result-head"><span>{latest.title}</span><button className="icon-button" aria-label="Close roll result" onClick={()=>setRolls([])}><X size={14}/></button></div>
   {latest.table?<><p className="roll-result-text" key={latest.id}>{latest.table.roll.text}</p>
    <div className="roll-result-detail">{[latest.formula,latest.detail].filter(Boolean).join(" · ")}{earlier.length?` · Earlier: ${earlier.slice(0,3).map(r=>r.table?short(r.table.roll.text):r.total).join(", ")}`:""}</div></>
   :<><div className="roll-result-total"><strong key={latest.id}>{latest.total}</strong><span>{latest.formula}</span></div>
   <div className="roll-result-detail">{latest.mode?"":"Rolled "}{latest.detail}{earlier.length?` · Earlier: ${earlier.slice(0,4).map(r=>r.table?short(r.table.roll.text):r.total).join(", ")}`:""}</div></>}
   {status?.state==="error"&&<p className="roll-result-error" role="alert">{status.message}</p>}</div>
  <div className="roll-result-foot">
   {discord?(status?.state==="sent"?<span className="roll-sent"><Check size={13}/> Sent to {discord.label}</span>:<button disabled={status?.state==="sending"} onClick={()=>void send(latest)}><Send size={13}/> {status?.state==="sending"?"Sending…":"Send to Discord"}</button>)
    :onSetupDiscord?<button onClick={onSetupDiscord}><Send size={13}/> Set up Discord</button>:<span>Only you see this roll</span>}
   <span className="spacer"/>
   {discord&&<label className="roll-auto" title="Send every roll from this campaign to Discord"><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);try{localStorage.setItem(autoKey(discord.campaignId),e.target.checked?"1":"0");}catch{/* optional */}}}/> Always</label>}
   <button onClick={()=>latest.table?latest.table.again():rollInline(latest.title,latest.base??latest.formula,{mode:latest.mode,log:!!latest.logId})}><RotateCcw size={13}/> Roll again</button></div>
 </div>;
}
