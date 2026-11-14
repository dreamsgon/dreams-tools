"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {Search} from "lucide-react";
import {circleStyle} from "@/lib/encyclopedia/picture";
import {bookImageUrl,bookWorkspaceUrl} from "@/lib/maptable-member";
import {campaignCharacters,encyclopediaCharacters,pairedCampaign,type EncyclopediaCharacter,type EncyclopediaRaw} from "@/lib/encyclopedia-characters";

export type {EncyclopediaCharacter,EncyclopediaRaw};
export {encyclopediaCharacters,campaignCharacters,pairedCampaign};

let cached:Promise<EncyclopediaRaw>|null=null;
/** The signed-in user's Encyclopedia, read-only and fetched once per page unless refreshed. */
export function loadEncyclopedia(refresh=false):Promise<EncyclopediaRaw>{
 if(!cached||refresh){cached=fetch(bookWorkspaceUrl()).then(async r=>{const v=await r.json().catch(()=>({})) as {data?:EncyclopediaRaw;error?:string};if(!r.ok)throw new Error(r.status===401?"Sign in to use your Encyclopedia characters.":v.error??"Could not load your Encyclopedia.");return v.data??{};});cached.catch(()=>{cached=null;});}
 return cached;
}

const ALL_KEY="maptable:encyclopedia-tokens-all";
export const roleColor={pc:"#3f6f9a",companion:"#5f7d4a",npc:"#8f5a3c",creature:"#8a3b4a"} as const;
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]!.toUpperCase()).join("");

/** Lists Encyclopedia characters; Add token creates the token in Maptable's own data. Nothing is written to the Encyclopedia. */
export default function EncyclopediaTokens({disabled,onAdd,campaignId,coGm}:{disabled:boolean;onAdd:(c:EncyclopediaCharacter)=>void|Promise<void>;campaignId?:string|null;coGm?:boolean}){
 const [raw,setRaw]=useState<EncyclopediaRaw|null>(null),[all,setAll]=useState(()=>{try{return localStorage.getItem(ALL_KEY)==="1";}catch{return false;}}),[error,setError]=useState(""),[query,setQuery]=useState(""),[added,setAdded]=useState("");
 useEffect(()=>{const controller=new AbortController();
  loadEncyclopedia(true).then(raw=>{if(!controller.signal.aborted)setRaw(raw);})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load your Encyclopedia.");});
  return()=>controller.abort();},[]);
 const paired=raw?pairedCampaign(raw,campaignId):undefined,scoped=!!paired&&!all;
 const list=useMemo(()=>raw?campaignCharacters(raw,campaignId,all):null,[raw,campaignId,all]);
 const toggle=(on:boolean)=>{setAll(on);try{localStorage.setItem(ALL_KEY,on?"1":"0");}catch{}};
 const q=query.trim().toLowerCase();
 const shown=useMemo(()=>(list??[]).filter(c=>!q||`${c.name} ${c.detail} ${c.world} ${c.origin??""}`.toLowerCase().includes(q)),[list,q]);
 const worlds=[...new Set(shown.map(c=>c.world))];
 return <section className="encyclopedia-tokens">
  <label className="ency-token-search"><Search size={14}/><input aria-label="Find a character" placeholder="Find a character" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <p className="ency-token-hint">Adds a token to this map and to your token library, named after the character. Characters with a picture bring it with them; the rest are coloured by role.</p>
  {paired&&<label className="ency-token-toggle"><input type="checkbox" checked={all} onChange={e=>toggle(e.target.checked)}/>Show other campaigns and worlds</label>}
  {raw&&!paired&&!coGm&&<p className="ency-token-hint">This campaign isn&apos;t linked to an Encyclopedia campaign yet. Link them on the <Link href="/campaigns">Campaigns page</Link>.</p>}
  {disabled&&<p className="ency-token-hint">Open a map to add tokens.</p>}
  {added&&<p className="ency-token-hint" role="status">{added}</p>}
  {error?<p className="ency-token-hint" role="alert">{error}</p>:!list?<p className="ency-token-hint">Loading characters…</p>:!shown.length?<p className="ency-token-hint">{list.length?"No characters match.":scoped?"No characters in this campaign yet. Use “Show other campaigns and worlds” to bring in characters from elsewhere.":"No characters in your Encyclopedia yet."}</p>:
   worlds.map(w=><div key={w}>{worlds.length>1&&<h4 className="ency-token-world">{w}</h4>}{shown.filter(c=>c.world===w).map(c=><div className="ency-token-row" key={c.id}>
    {c.picture?<span className="ency-token-avatar ency-token-picture" aria-hidden="true" style={{boxShadow:`0 0 0 2px ${c.picture.ring??roleColor[c.role]}`,backgroundImage:`url("${bookImageUrl(c.picture.imageId)}")`,...circleStyle(c.picture,30)}}/>
     :<span className="ency-token-avatar" style={{background:roleColor[c.role]}} aria-hidden="true">{initials(c.name)}</span>}
    <span className="ency-token-text"><strong>{c.name}{c.origin&&<em className="ency-token-origin">{c.origin}</em>}</strong><small>{c.detail}</small></span>
    <button className="ency-token-add" disabled={disabled} onClick={async()=>{setAdded(c.picture?`Adding ${c.name}…`:"");try{await onAdd(c);setAdded(`${c.name} is on the map.`);}catch(e){setAdded(e instanceof Error?e.message:`Could not add ${c.name}.`);}}}>Add token</button>
   </div>)}</div>)}
 </section>;
}
