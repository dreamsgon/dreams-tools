"use client";
import {useEffect,useLayoutEffect,useRef} from "react";
import {createPortal} from "react-dom";
import {X} from "lucide-react";
import {SheetRolls} from "./encyclopedia/sheet-rolls";
import {requestMapRoll} from "@/lib/map-rolls";
import {withKeepMode} from "@/lib/rolls";
import type {SheetRollGroup} from "@/lib/encyclopedia/sheet-rolls";
import type {Sheet} from "@/lib/encyclopedia/sheet-link";
import {SheetWriteBack} from "./encyclopedia/sheet-hp";
import type {HpStatus} from "./use-token-sheet-hp";
import "./encyclopedia/character-sheet.css";
import "./token-sheet-rolls.css";

/**
 * A compact list of the rolls on the sheet linked to a token's Encyclopedia character, opened from the token's menu.
 * Rolling goes through the dice tray, so it lands in the roll log and the Discord card shows the token's picture.
 * Advantage and disadvantage work on single d20 rolls here; other rolls roll once.
 */
/** The GM's Write HP back switch for this sheet, and the state of the last write (GM only; a player linked sheet can't be switched here). */
export type TokenSheetHp={sheet:Sheet;status?:HpStatus;onSwitch:(on:boolean)=>void;onSignIn:()=>void;onUseSheet:()=>void;onWriteOurs:()=>void};
export default function TokenSheetRolls({character,groups,tokenId,sceneId,campaignId,at,onClose,hp}:{character:string;groups:SheetRollGroup[];tokenId:string;sceneId:string;campaignId:string|null;at:{x:number;y:number};onClose:()=>void;hp?:TokenSheetHp}){
 const box=useRef<HTMLDivElement>(null),close=useRef(onClose);
 useEffect(()=>{close.current=onClose;});
 useEffect(()=>{
  const down=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))close.current();};
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.stopImmediatePropagation();close.current();}};
  window.addEventListener("pointerdown",down,true);window.addEventListener("keydown",key,true);box.current?.focus();
  return()=>{window.removeEventListener("pointerdown",down,true);window.removeEventListener("keydown",key,true);};
 },[]);
 // Keeps the whole panel on screen: its top is the click point, moved up when the panel (which grows with the HP status) would run past the bottom.
 useLayoutEffect(()=>{
  const el=box.current;if(!el)return;
  const place=()=>{const zoom=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-zoom"))||1;el.style.top=`${Math.max(8,Math.min(at.y,window.innerHeight/zoom-el.offsetHeight-8))}px`;};
  place();const watch=new ResizeObserver(place);watch.observe(el);window.addEventListener("resize",place);
  return()=>{watch.disconnect();window.removeEventListener("resize",place);};
 },[at.y]);
 return createPortal(<div ref={box} tabIndex={-1} className="token-sheet-rolls" role="dialog" aria-label={`Roll from ${character}’s sheet`} style={{left:`min(${at.x}px, calc(calc(100vw / var(--ui-zoom, 1)) - 308px))`}}>
  <header><strong>{character}’s sheet</strong><button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={14}/></button></header>
  {groups.length>0&&<SheetRolls groups={groups} twice={false} compact onRoll={(name,formula,mode)=>{requestMapRoll({formula:withKeepMode(formula,mode),context:{sceneId,campaignId,label:`${character} · ${name}`.slice(0,120),tokenId}});onClose();}}/>}
  {hp&&<>
   <SheetWriteBack sheet={hp.sheet} linker={hp.sheet.linkedById?hp.sheet.linkedBy??"The player":undefined} onChange={next=>hp.onSwitch(next.writeBack===true)}/>
   {hp.status&&<div className="sheet-hp-state" role="status">
    <p className={`sheet-hp-status is-${hp.status.tone}`}>{hp.status.text}</p>
    {hp.status.conflict&&<div className="sheet-hp-row"><button type="button" className="button small" onClick={hp.onUseSheet}>Use the sheet’s value</button><button type="button" className="button small" onClick={hp.onWriteOurs}>Write ours ({hp.status.conflict.ours})</button></div>}
    {hp.status.signIn&&!hp.status.conflict&&<button type="button" className="button small" onClick={hp.onSignIn}>Sign in with Google</button>}
   </div>}
  </>}
 </div>,document.body);
}
