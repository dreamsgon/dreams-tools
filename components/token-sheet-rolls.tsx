"use client";
import {useEffect,useRef} from "react";
import {createPortal} from "react-dom";
import {X} from "lucide-react";
import {SheetRolls} from "./encyclopedia/sheet-rolls";
import {requestMapRoll} from "@/lib/map-rolls";
import {withKeepMode} from "@/lib/rolls";
import type {SheetRollGroup} from "@/lib/encyclopedia/sheet-rolls";
import "./encyclopedia/character-sheet.css";
import "./token-sheet-rolls.css";

/**
 * A compact list of the rolls on the sheet linked to a token's Encyclopedia character, opened from the token's menu.
 * Rolling goes through the dice tray, so it lands in the roll log and the Discord card shows the token's picture.
 * Advantage and disadvantage work on single d20 rolls here; other rolls roll once.
 */
export default function TokenSheetRolls({character,groups,tokenId,sceneId,campaignId,at,onClose}:{character:string;groups:SheetRollGroup[];tokenId:string;sceneId:string;campaignId:string|null;at:{x:number;y:number};onClose:()=>void}){
 const box=useRef<HTMLDivElement>(null),close=useRef(onClose);
 useEffect(()=>{close.current=onClose;});
 useEffect(()=>{
  const down=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))close.current();};
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.stopImmediatePropagation();close.current();}};
  window.addEventListener("pointerdown",down,true);window.addEventListener("keydown",key,true);box.current?.focus();
  return()=>{window.removeEventListener("pointerdown",down,true);window.removeEventListener("keydown",key,true);};
 },[]);
 return createPortal(<div ref={box} tabIndex={-1} className="token-sheet-rolls" role="dialog" aria-label={`Roll from ${character}’s sheet`} style={{left:`min(${at.x}px, calc(calc(100vw / var(--ui-zoom, 1)) - 308px))`,top:`max(8px, min(${at.y}px, calc(calc(100vh / var(--ui-zoom, 1)) - 360px)))`}}>
  <header><strong>{character}’s sheet</strong><button type="button" className="icon-only" aria-label="Close" onClick={onClose}><X size={14}/></button></header>
  <SheetRolls groups={groups} twice={false} compact onRoll={(name,formula,mode)=>{requestMapRoll({formula:withKeepMode(formula,mode),context:{sceneId,campaignId,label:`${character} · ${name}`.slice(0,120),tokenId}});onClose();}}/>
 </div>,document.body);
}
