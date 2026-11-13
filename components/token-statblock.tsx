"use client";
import {useCallback,useEffect,useState} from "react";
import {ArrowUpRight,RefreshCw} from "lucide-react";
import {StatblockText} from "./encyclopedia/statblock-view";
import {RollHandler} from "./encyclopedia/rolls";
import {requestMapRoll} from "@/lib/map-rolls";
import {encyclopediaCharacters,loadEncyclopedia,type EncyclopediaRaw} from "./encyclopedia-tokens";
import type {Token} from "@/lib/model";

/**
 * The statblock of the Encyclopedia character a token is linked to. Read-only: the statblock is edited in the Encyclopedia.
 * Rolls go through Maptable's dice tray, which can post them to the campaign's Discord channel.
 */
export default function TokenStatblock({token,sceneId,campaignId,onLink}:{token:Token;sceneId:string;campaignId:string|null;onLink:(entryId:string|undefined)=>void}){
 const [raw,setRaw]=useState<EncyclopediaRaw|null>(null),[error,setError]=useState(""),[choosing,setChoosing]=useState(false);
 const load=useCallback((refresh=false)=>{setError("");loadEncyclopedia(refresh).then(setRaw).catch(e=>setError(e instanceof Error?e.message:"Could not load your Encyclopedia."));},[]);
 useEffect(()=>{load();},[load]);
 const roll=useCallback((title:string,formula:string)=>requestMapRoll({formula,context:{sceneId,campaignId,label:title.slice(0,120),tokenId:token.id}}),[sceneId,campaignId,token.id]);
 if(error)return <div className="token-statblock"><p className="token-statblock-hint" role="alert">{error}</p><button className="text-button" onClick={()=>load(true)}>Try again</button></div>;
 if(!raw)return <div className="token-statblock"><p className="token-statblock-hint">Loading your Encyclopedia…</p></div>;
 const linkedId=token.encyclopediaEntryId,entry=linkedId?raw.entries?.find(e=>e.id===linkedId&&e.kind==="character"):undefined;
 if(!linkedId||choosing){
  const characters=encyclopediaCharacters(raw).sort((a,b)=>Number(b.hasStatblock)-Number(a.hasStatblock));
  return <div className="token-statblock">
   <p className="token-statblock-hint">Link this token to an Encyclopedia character to see their statblock here and roll from it.</p>
   {characters.length?<label>Encyclopedia character<select aria-label="Encyclopedia character" value={choosing?"":linkedId??""} onChange={e=>{if(e.target.value){onLink(e.target.value);setChoosing(false);}}}>
    <option value="">Choose a character…</option>
    {characters.map(c=><option key={c.id} value={c.id}>{c.name} · {c.world}{c.hasStatblock?" · statblock":""}</option>)}
   </select></label>:<p className="token-statblock-hint">No characters in your Encyclopedia yet.</p>}
   <div className="token-statblock-actions">{choosing&&<button className="text-button" onClick={()=>setChoosing(false)}>Cancel</button>}<button className="text-button" onClick={()=>load(true)}><RefreshCw size={13}/> Reload</button></div>
  </div>;
 }
 if(!entry)return <div className="token-statblock"><p className="token-statblock-hint">The linked character is no longer in your Encyclopedia.</p><div className="token-statblock-actions"><button className="text-button" onClick={()=>setChoosing(true)}>Choose another</button><button className="text-button" onClick={()=>onLink(undefined)}>Unlink</button></div></div>;
 const text=entry.character?.statblock?.trim()?entry.character.statblock:"";
 return <div className="token-statblock">
  <div className="token-statblock-bar"><span>From the Encyclopedia</span><a href={`/encyclopedia?entry=${encodeURIComponent(entry.id)}`} target="_blank" rel="noreferrer">Open {entry.title} <ArrowUpRight size={12}/></a><button className="text-button" onClick={()=>setChoosing(true)}>Change</button><button className="icon-only" aria-label="Reload statblock" title="Reload after editing in the Encyclopedia" onClick={()=>load(true)}><RefreshCw size={13}/></button></div>
  {text?<RollHandler.Provider value={roll}><StatblockText title={token.name} text={text} detect={entry.character?.statblockRolls!==false}/></RollHandler.Provider>
   :<p className="token-statblock-hint">{entry.title} has no statblock yet. Open the character in the Encyclopedia and paste one in its Statblock tab.</p>}
  {text&&<p className="token-statblock-hint">Rolls go to the dice tray, which can post them to Discord.</p>}
 </div>;
}
