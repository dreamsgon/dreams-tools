"use client";
import {useEffect,useState} from "react";
import {Send} from "lucide-react";
import type {Campaign} from "@/lib/encyclopedia/world-model";

type Discord=NonNullable<Campaign["discord"]>;
const routes=[["combat","Combat"],["exploration","Exploration"],["world","World"]] as const;

/** Chooses which Maptable campaign's Discord channel this Encyclopedia campaign's rolls go to. */
export function DiscordRollsSetting({campaign,onChange}:{campaign:Campaign;onChange:(d:Discord|undefined)=>void}){
 const [campaigns,setCampaigns]=useState<{id:string;name:string}[]|null>(null),[error,setError]=useState("");
 useEffect(()=>{const controller=new AbortController();
  fetch("/api/encyclopedia/maptable-scenes",{signal:controller.signal}).then(async r=>{const v=await r.json() as {campaigns?:{id:string;name:string}[];error?:string};if(!r.ok)throw new Error(v.error??"Could not load your Maptable campaigns.");setCampaigns(v.campaigns??[]);})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load your Maptable campaigns.");});
  return()=>controller.abort();},[]);
 const d=campaign.discord,known=!d||!campaigns||campaigns.some(c=>c.id===d.maptableCampaignId);
 return <div className="discord-rolls-setting">
  <div className="connection-label"><Send size={17}/>Rolls to Discord</div>
  <p className="aside-hint">Rolls in this campaign can go to the Discord channels you set up for a Maptable campaign.</p>
  {error?<p className="info-note" role="alert">{error}</p>:<>
   <label className="field-label">Maptable campaign<select aria-label="Maptable campaign for Discord rolls" value={d?.maptableCampaignId??""} disabled={!campaigns} onChange={e=>onChange(e.target.value?{maptableCampaignId:e.target.value,route:d?.route??"combat"}:undefined)}>
    <option value="">{campaigns?"Don't send rolls to Discord":"Loading…"}</option>
    {!known&&d&&<option value={d.maptableCampaignId}>A campaign that no longer exists</option>}
    {(campaigns??[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
   </select></label>
   {d&&<div className="discord-route" role="radiogroup" aria-label="Discord channel">{routes.map(([value,label])=><label key={value}><input type="radio" name={`discord-route-${campaign.id}`} checked={d.route===value} onChange={()=>onChange({...d,route:value})}/> {label}</label>)}</div>}
   {campaigns&&!campaigns.length&&<p className="aside-hint">Create a campaign in Maptable and add its Discord webhook there first.</p>}
  </>}
 </div>;
}
