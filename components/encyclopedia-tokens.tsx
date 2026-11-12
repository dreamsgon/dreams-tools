"use client";
import {useEffect,useMemo,useState} from "react";
import {Search} from "lucide-react";

export type EncyclopediaCharacter={id:string;name:string;role:"pc"|"companion"|"npc";detail:string;world:string};
type Raw={worlds?:{id:string;name:string;isTemplate?:boolean}[];campaigns?:{id:string;name:string}[];entries?:{id:string;title:string;kind:string;worldId:string;campaignId:string|null;character?:{role?:string;location?:string;faction?:string;status?:string}}[]};

export const roleColor={pc:"#3f6f9a",companion:"#5f7d4a",npc:"#8f5a3c"} as const;
const roleName={pc:"Player character",companion:"Companion",npc:"NPC"} as const;

/** Characters from the signed-in user's Encyclopedia (read-only). Templates are left out. */
export function encyclopediaCharacters(raw:Raw):EncyclopediaCharacter[]{
 const worlds=new Map((raw.worlds??[]).filter(w=>!w.isTemplate).map(w=>[w.id,w.name])),campaigns=new Map((raw.campaigns??[]).map(c=>[c.id,c.name]));
 return (raw.entries??[]).filter(e=>e.kind==="character"&&worlds.has(e.worldId)).map(e=>{
  const role:EncyclopediaCharacter["role"]=e.character?.role==="pc"||e.character?.role==="companion"?e.character.role:"npc";
  const detail=[roleName[role],e.character?.faction||e.character?.location,e.campaignId?campaigns.get(e.campaignId):"",e.character?.status&&e.character.status!=="active"?e.character.status:""].filter(Boolean).join(" · ");
  return {id:e.id,name:e.title.slice(0,120),role,detail,world:worlds.get(e.worldId)!};
 }).sort((a,b)=>a.world.localeCompare(b.world)||a.name.localeCompare(b.name));
}

const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]!.toUpperCase()).join("");

/** Lists Encyclopedia characters; Add token creates the token in Maptable's own data. Nothing is written to the Encyclopedia. */
export default function EncyclopediaTokens({disabled,onAdd}:{disabled:boolean;onAdd:(c:EncyclopediaCharacter)=>void}){
 const [list,setList]=useState<EncyclopediaCharacter[]|null>(null),[error,setError]=useState(""),[query,setQuery]=useState(""),[added,setAdded]=useState("");
 useEffect(()=>{const controller=new AbortController();
  fetch("/api/encyclopedia/workspace",{signal:controller.signal}).then(async r=>{const v=await r.json() as {data?:Raw;error?:string};if(!r.ok)throw new Error(r.status===401?"Sign in to use your Encyclopedia characters.":v.error??"Could not load your Encyclopedia.");setList(encyclopediaCharacters(v.data??{}));})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load your Encyclopedia.");});
  return()=>controller.abort();},[]);
 const q=query.trim().toLowerCase();
 const shown=useMemo(()=>(list??[]).filter(c=>!q||`${c.name} ${c.detail} ${c.world}`.toLowerCase().includes(q)),[list,q]);
 const worlds=[...new Set(shown.map(c=>c.world))];
 return <section className="encyclopedia-tokens">
  <label className="ency-token-search"><Search size={14}/><input aria-label="Find a character" placeholder="Find a character" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <p className="ency-token-hint">Adds a token to this map and to your token library, named after the character and coloured by role.</p>
  {disabled&&<p className="ency-token-hint">Open a map to add tokens.</p>}
  {added&&<p className="ency-token-hint" role="status">{added}</p>}
  {error?<p className="ency-token-hint" role="alert">{error}</p>:!list?<p className="ency-token-hint">Loading characters…</p>:!shown.length?<p className="ency-token-hint">{list.length?"No characters match.":"No characters in your Encyclopedia yet."}</p>:
   worlds.map(w=><div key={w}>{worlds.length>1&&<h4 className="ency-token-world">{w}</h4>}{shown.filter(c=>c.world===w).map(c=><div className="ency-token-row" key={c.id}>
    <span className="ency-token-avatar" style={{background:roleColor[c.role]}} aria-hidden="true">{initials(c.name)}</span>
    <span className="ency-token-text"><strong>{c.name}</strong><small>{c.detail}</small></span>
    <button className="ency-token-add" disabled={disabled} onClick={()=>{onAdd(c);setAdded(`${c.name} is on the map.`);}}>Add token</button>
   </div>)}</div>)}
 </section>;
}
