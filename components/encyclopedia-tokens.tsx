"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {Plus,Search} from "lucide-react";
import TokenFace from "./token-face";
import {TokenTile,usePlacementGesture} from "./token-placement";
import {tokenSideLook} from "@/lib/token-defaults";
import {newToken,type Workspace} from "@/lib/model";
import {tokenInitials} from "@/lib/token-initials";
import {roleSide} from "@/lib/token-gallery";
import {encyclopediaPlacementId,toggleArmed,type ArmedToken} from "@/lib/token-arming";
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

/**
 * Lists Encyclopedia characters as the same compact tiles as the saved tokens: click one, then click the map, or drag it on.
 * Placing creates the token in Maptable's own data. Nothing is written to the Encyclopedia.
 */
export default function EncyclopediaTokens({disabled,onAdd,campaignId,coGm,workspace,armed,setArmed}:{disabled:boolean;onAdd:(c:EncyclopediaCharacter)=>void|Promise<void>;campaignId?:string|null;coGm?:boolean;workspace:Workspace;armed:ArmedToken|null;setArmed:(a:ArmedToken|null)=>void}){
 const [raw,setRaw]=useState<EncyclopediaRaw|null>(null),[all,setAll]=useState(()=>{try{return localStorage.getItem(ALL_KEY)==="1";}catch{return false;}}),[error,setError]=useState(""),[query,setQuery]=useState(""),[added,setAdded]=useState("");
 const gesture=usePlacementGesture(token=>{if(!disabled)setArmed(toggleArmed(armed,token));});
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
 const face=(c:EncyclopediaCharacter)=>{
  if(c.picture)return <span className="token-face ency-token-picture" aria-hidden="true" data-picture="true" style={{width:32,height:32,borderColor:c.picture.ring??roleColor[c.role],backgroundImage:`url("${bookImageUrl(c.picture.imageId)}")`,...circleStyle(c.picture,28)}}/>;
  const token={...newToken(c.name),disposition:roleSide[c.role],sideColours:true};
  return <TokenFace token={token} workspace={workspace} campaignId={campaignId} initials={tokenInitials(c.name)} size={32}/>;
 };
 const add=async(c:EncyclopediaCharacter)=>{setAdded(c.picture?`Adding ${c.name}…`:"");try{await onAdd(c);setAdded(`${c.name} is on the map.`);}catch(e){setAdded(e instanceof Error?e.message:`Could not add ${c.name}.`);}};
 return <section className="encyclopedia-tokens token-gallery-body"><div className="gallery-scroll">
  <label className="gallery-search ency-token-search"><Search size={14}/><input aria-label="Find a character" placeholder="Find a character" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  {paired&&<label className="ency-token-toggle"><input type="checkbox" checked={all} onChange={e=>toggle(e.target.checked)}/>Show other campaigns and worlds</label>}
  {raw&&!paired&&!coGm&&<p className="ency-token-hint">This campaign isn&apos;t linked to an Encyclopedia campaign yet. Link them on the <Link href="/campaigns">Campaigns page</Link>.</p>}
  {disabled&&<p className="ency-token-hint">Open a map to add tokens.</p>}
  {error?<p className="ency-token-hint" role="alert">{error}</p>:!list?<p className="ency-token-hint">Loading characters…</p>:!shown.length?<p className="ency-token-hint">{list.length?"No characters match.":scoped?"No characters in this campaign yet. Use “Show other campaigns and worlds” to bring in characters from elsewhere.":"No characters in your Encyclopedia yet."}</p>:
   worlds.map(w=><section className="gallery-group" key={w} aria-label={w}>{worlds.length>1&&<h3 className="ency-token-world-heading"><span>{w}</span></h3>}
    <div className="token-tile-grid">{shown.filter(c=>c.world===w).map(c=><TokenTile key={c.id} armed={armed?.id===encyclopediaPlacementId(c.id)} name={c.name} tint={roleSide[c.role]}
     title={`${c.name}${c.origin?` (${c.origin})`:""}. ${c.detail}. Click, then click the map to place it, or drag it onto the map.`}
     gesture={gesture.bind({id:encyclopediaPlacementId(c.id),name:c.name,source:"encyclopedia",side:roleSide[c.role]})} face={face(c)}
     tools={<button type="button" disabled={disabled} aria-label={`Add ${c.name} token`} title="Add to the middle of the map" onClick={()=>void add(c)}><Plus size={12}/></button>}/>)}</div></section>)}
  <p className="gallery-hint">Click a character, then click the map. Or drag it straight on. A character&apos;s picture comes with it; the rest use their side&apos;s colours (player characters Party, companions Allies, NPCs Neutral, creatures Enemy). The token is also saved to your token library.</p>
  {added&&<p className="ency-token-hint" role="status">{added}</p>}
  <p role="status" className="gallery-hint">{gesture.message}</p>
 </div>{gesture.ghost}</section>;
}
