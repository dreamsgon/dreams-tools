"use client";
import {useEffect,useMemo,useState} from "react";
import {Search} from "lucide-react";
import {circleStyle} from "@/lib/encyclopedia/picture";
import type {Picture} from "@/lib/encyclopedia/world-model";
import {bookImageUrl,bookWorkspaceUrl} from "@/lib/maptable-member";

export type EncyclopediaCharacter={id:string;name:string;role:"pc"|"companion"|"npc"|"creature";detail:string;world:string;hasStatblock:boolean;picture?:Picture};
export type EncyclopediaRaw={worlds?:{id:string;name:string;isTemplate?:boolean}[];campaigns?:{id:string;name:string}[];entries?:{id:string;title:string;kind:string;worldId:string;campaignId:string|null;character?:{role?:string;location?:string;faction?:string;status?:string;statblock?:string;statblockRolls?:boolean};picture?:Picture}[]};

let cached:Promise<EncyclopediaRaw>|null=null;
/** The signed-in user's Encyclopedia, read-only and fetched once per page unless refreshed. */
export function loadEncyclopedia(refresh=false):Promise<EncyclopediaRaw>{
 if(!cached||refresh){cached=fetch(bookWorkspaceUrl()).then(async r=>{const v=await r.json().catch(()=>({})) as {data?:EncyclopediaRaw;error?:string};if(!r.ok)throw new Error(r.status===401?"Sign in to use your Encyclopedia characters.":v.error??"Could not load your Encyclopedia.");return v.data??{};});cached.catch(()=>{cached=null;});}
 return cached;
}

export const roleColor={pc:"#3f6f9a",companion:"#5f7d4a",npc:"#8f5a3c",creature:"#8a3b4a"} as const;
const roleName={pc:"Player character",companion:"Companion",npc:"NPC",creature:"Creature"} as const;

/** Characters from the signed-in user's Encyclopedia (read-only). Templates are left out. */
export function encyclopediaCharacters(raw:EncyclopediaRaw):EncyclopediaCharacter[]{
 const worlds=new Map((raw.worlds??[]).filter(w=>!w.isTemplate).map(w=>[w.id,w.name])),campaigns=new Map((raw.campaigns??[]).map(c=>[c.id,c.name]));
 return (raw.entries??[]).filter(e=>e.kind==="character"&&worlds.has(e.worldId)).map(e=>{
  const role:EncyclopediaCharacter["role"]=e.character?.role==="pc"||e.character?.role==="companion"||e.character?.role==="creature"?e.character.role:"npc";
  const detail=[roleName[role],e.character?.faction||e.character?.location,e.campaignId?campaigns.get(e.campaignId):"",e.character?.status&&e.character.status!=="active"?e.character.status:""].filter(Boolean).join(" · ");
  const hasStatblock=!!e.character?.statblock?.trim();
  return {id:e.id,name:e.title.slice(0,120),role,detail:hasStatblock?`${detail} · Statblock`:detail,world:worlds.get(e.worldId)!,hasStatblock,picture:e.picture};
 }).sort((a,b)=>a.world.localeCompare(b.world)||a.name.localeCompare(b.name));
}

const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]!.toUpperCase()).join("");

/** Lists Encyclopedia characters; Add token creates the token in Maptable's own data. Nothing is written to the Encyclopedia. */
export default function EncyclopediaTokens({disabled,onAdd}:{disabled:boolean;onAdd:(c:EncyclopediaCharacter)=>void|Promise<void>}){
 const [list,setList]=useState<EncyclopediaCharacter[]|null>(null),[error,setError]=useState(""),[query,setQuery]=useState(""),[added,setAdded]=useState("");
 useEffect(()=>{const controller=new AbortController();
  loadEncyclopedia(true).then(raw=>{if(!controller.signal.aborted)setList(encyclopediaCharacters(raw));})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load your Encyclopedia.");});
  return()=>controller.abort();},[]);
 const q=query.trim().toLowerCase();
 const shown=useMemo(()=>(list??[]).filter(c=>!q||`${c.name} ${c.detail} ${c.world}`.toLowerCase().includes(q)),[list,q]);
 const worlds=[...new Set(shown.map(c=>c.world))];
 return <section className="encyclopedia-tokens">
  <label className="ency-token-search"><Search size={14}/><input aria-label="Find a character" placeholder="Find a character" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <p className="ency-token-hint">Adds a token to this map and to your token library, named after the character. Characters with a picture bring it with them; the rest are coloured by role.</p>
  {disabled&&<p className="ency-token-hint">Open a map to add tokens.</p>}
  {added&&<p className="ency-token-hint" role="status">{added}</p>}
  {error?<p className="ency-token-hint" role="alert">{error}</p>:!list?<p className="ency-token-hint">Loading characters…</p>:!shown.length?<p className="ency-token-hint">{list.length?"No characters match.":"No characters in your Encyclopedia yet."}</p>:
   worlds.map(w=><div key={w}>{worlds.length>1&&<h4 className="ency-token-world">{w}</h4>}{shown.filter(c=>c.world===w).map(c=><div className="ency-token-row" key={c.id}>
    {c.picture?<span className="ency-token-avatar ency-token-picture" aria-hidden="true" style={{boxShadow:`0 0 0 2px ${c.picture.ring??roleColor[c.role]}`,backgroundImage:`url("${bookImageUrl(c.picture.imageId)}")`,...circleStyle(c.picture,30)}}/>
     :<span className="ency-token-avatar" style={{background:roleColor[c.role]}} aria-hidden="true">{initials(c.name)}</span>}
    <span className="ency-token-text"><strong>{c.name}</strong><small>{c.detail}</small></span>
    <button className="ency-token-add" disabled={disabled} onClick={async()=>{setAdded(c.picture?`Adding ${c.name}…`:"");try{await onAdd(c);setAdded(`${c.name} is on the map.`);}catch(e){setAdded(e instanceof Error?e.message:`Could not add ${c.name}.`);}}}>Add token</button>
   </div>)}</div>)}
 </section>;
}
