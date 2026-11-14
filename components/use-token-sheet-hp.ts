"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {currentGoogleToken,googleToken,readHpCell,writeHpCell} from "@/lib/encyclopedia/google-client";
import {checkHpCell,coalesceByKey} from "@/lib/encyclopedia/sheet-write";
import {chooseWrites,hpChanges} from "@/lib/maptable-sheet-hp";
import {mapMemberRef} from "@/lib/maptable-member";
import {loadEncyclopedia} from "./encyclopedia-tokens";
import type {Sheet} from "@/lib/encyclopedia/sheet-link";

export type HpStatus={tone:"ok"|"warn"|"error"|"info";text:string;signIn?:boolean;conflict?:{theirs:string;ours:number}};
type Job={entryId:string;name:string;hp:number;sheet:Sheet};
type Live={say:(id:string,s:HpStatus|null)=>void;notify:(text:string)=>void;setTokenHp:(entryId:string,hp:number)=>void;refreshSheets:()=>void};
type Shared={waiting:Map<string,Job>;chain:{p:Promise<void>};skip:Set<string>;queue:ReturnType<typeof coalesceByKey<number>>|null;live:Live|null};

export async function postSheetHp(body:object){
 let res:Response;
 try{res=await fetch("/api/encyclopedia/sheet-hp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});}
 catch{throw new Error("Couldn’t reach RPG Tools.");}
 if(!res.ok)throw new Error(((await res.json().catch(()=>null)) as {error?:string}|null)?.error??"Could not save to your Encyclopedia.");
}

async function attempt(s:Shared,job:Job,force:boolean){
 const live=s.live!,token=currentGoogleToken();
 if(!token){s.waiting.set(job.entryId,job);live.say(job.entryId,{tone:"warn",text:"Sign in with Google to write HP back",signIn:true});live.notify(`${job.name}’s HP wasn’t written to the sheet yet. Open Roll from sheet to sign in.`);return;}
 try{
  if(!force){
   const check=checkHpCell(await readHpCell(job.sheet,token),job.sheet.items.find(i=>i.kind==="hp")?.value,job.hp);
   if(check.kind==="formula"){s.waiting.delete(job.entryId);live.say(job.entryId,{tone:"error",text:"Couldn’t write HP: the HP cell holds a formula, and RPG Tools won’t overwrite it."});return;}
   if(check.kind==="changed"){s.waiting.set(job.entryId,job);live.say(job.entryId,{tone:"warn",text:`The sheet’s HP changed to ${check.theirs||"empty"} since it was read.`,conflict:{theirs:check.theirs,ours:job.hp}});live.notify(`${job.name}’s HP changed in the sheet. Open Roll from sheet to choose.`);return;}
  }
  await writeHpCell(job.sheet,job.hp,token);
  await postSheetHp({action:"hp",entryId:job.entryId,value:job.hp});
  s.waiting.delete(job.entryId);live.say(job.entryId,{tone:"ok",text:"HP written to the sheet just now"});live.refreshSheets();
 }catch(e){
  s.waiting.set(job.entryId,job);
  const msg=e instanceof Error?e.message:"something went wrong.";
  live.say(job.entryId,{tone:"error",text:`Couldn’t write HP: ${msg}`,signIn:/sign in again/i.test(msg)});
  live.notify(`Couldn’t write ${job.name}’s HP to the sheet: ${msg}`);
 }
}
const run=(s:Shared,job:Job,force=false)=>{s.chain.p=s.chain.p.then(()=>attempt(s,job,force));};
/** After the wait: read the newest Encyclopedia copy (the switch may have changed elsewhere) and decide again. */
async function flush(s:Shared,entryId:string,hp:number){
 try{
  // The copy already loaded says whether this character writes at all; only then fetch the newest one (the switch may have changed since).
  const change=[{entryId,tokenId:"",hp}];
  if(!chooseWrites(change,await loadEncyclopedia()).length)return;
  const pick=chooseWrites(change,await loadEncyclopedia(true))[0];if(pick)run(s,pick);
 }
 catch{/* Maptable works without the Encyclopedia */}
}

/**
 * Writes a token's HP to the Google Sheet of the Encyclopedia character it is linked to, when that sheet has Write HP
 * back switched on (GM only; never for a co-GM or the player view). `observe(before, after)` is called where scene changes
 * are applied: a click, a zero-HP rule, undo, redo or a change that came from the cloud. A change waits 1.5 s per
 * character; then the browser, with the person's own live Google token (it never opens a pop-up), checks the cell,
 * writes only the HP cell and stores the number on the Encyclopedia copy.
 */
export function useTokenSheetHp({enabled,notify,setTokenHp,refreshSheets}:{enabled:boolean;notify:(text:string)=>void;setTokenHp:(entryId:string,hp:number)=>void;refreshSheets:()=>void}){
 const [statuses,setStatuses]=useState<Record<string,HpStatus>>({});
 const box=useRef<Shared|null>(null);
 const get=useCallback(():Shared=>box.current??=({waiting:new Map(),chain:{p:Promise.resolve()},skip:new Set(),queue:null,live:null}),[]);
 const say=useCallback((id:string,st:HpStatus|null)=>setStatuses(m=>{const n={...m};if(st)n[id]=st;else delete n[id];return n;}),[]);
 useEffect(()=>{get().live={say,notify,setTokenHp,refreshSheets};});
 useEffect(()=>()=>{box.current?.queue?.cancel();},[]);

 const observe=useCallback((before:Parameters<typeof hpChanges>[0],after:Parameters<typeof hpChanges>[1])=>{
  if(!enabled||mapMemberRef())return;
  const shared=get();
  for(const c of hpChanges(before,after)){
   if(shared.skip.delete(c.entryId))continue;
   shared.queue??=coalesceByKey<number>((id,hp)=>{void flush(shared,id,hp);});
   shared.queue.push(c.entryId,c.hp);
  }
 },[enabled,get]);
 return {statuses,observe,
  async signIn(entryId:string){
   try{await googleToken();const shared=get(),job=shared.waiting.get(entryId);say(entryId,null);if(job)run(shared,job);}
   catch(e){say(entryId,{tone:"error",text:`Couldn’t write HP: ${e instanceof Error?e.message:"sign-in failed."}`,signIn:true});}
  },
  useSheetValue(entryId:string){
   const shared=get(),n=Number(statuses[entryId]?.conflict?.theirs),had=shared.waiting.delete(entryId);
   say(entryId,{tone:"ok",text:"Using the sheet’s HP."});
   if(!had||!Number.isInteger(n)||n<0)return;
   shared.skip.add(entryId);setTokenHp(entryId,n);
   postSheetHp({action:"hp",entryId,value:n}).then(()=>refreshSheets()).catch(()=>{});
  },
  writeOurs(entryId:string){const shared=get(),job=shared.waiting.get(entryId);if(job){say(entryId,{tone:"info",text:"Writing HP to the sheet…"});run(shared,job,true);}},
  async setWriteBack(entryId:string,on:boolean){await postSheetHp({action:"writeBack",entryId,on});refreshSheets();},
 };
}
