"use client";
import {useEffect,useState} from "react";
import {Send} from "lucide-react";
import type {Campaign} from "@/lib/encyclopedia/world-model";

type Discord=NonNullable<Campaign["discord"]>;
/**
 * Chooses which Maptable campaign's Discord channels this Encyclopedia campaign posts through. Which channel
 * each kind of post goes to is chosen in Maptable › Connections. With no choice, the paired campaign is used.
 */
export function DiscordRollsSetting({campaign,onChange}:{campaign:Campaign;onChange:(d:Discord|undefined)=>void}){
 const [campaigns,setCampaigns]=useState<{id:string;name:string}[]|null>(null),[error,setError]=useState("");
 useEffect(()=>{const controller=new AbortController();
  fetch("/api/encyclopedia/maptable-scenes",{signal:controller.signal}).then(async r=>{const v=await r.json() as {campaigns?:{id:string;name:string}[];error?:string};if(!r.ok)throw new Error(v.error??"Could not load your Maptable campaigns.");setCampaigns(v.campaigns??[]);})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load your Maptable campaigns.");});
  return()=>controller.abort();},[]);
 const d=campaign.discord,known=!d||!campaigns||campaigns.some(c=>c.id===d.maptableCampaignId);
 const paired=campaign.maptableCampaignId?campaigns?.find(c=>c.id===campaign.maptableCampaignId):undefined;
 return <div className="discord-rolls-setting">
  <div className="connection-label"><Send size={17}/>Discord</div>
  <p className="aside-hint">Your rolls, and the AI’s rolls, narration and recaps, go through the Discord channels of a Maptable campaign. Choose which channel each kind goes to in Maptable › Connections.</p>
  {error?<p className="info-note" role="alert">{error}</p>:<>
   <label className="field-label">Maptable campaign<select aria-label="Maptable campaign for Discord rolls" value={d?.maptableCampaignId??""} disabled={!campaigns} onChange={e=>onChange(e.target.value?{maptableCampaignId:e.target.value}:undefined)}>
    <option value="">{!campaigns?"Loading…":paired?`The paired campaign (${paired.name})`:"Don't post to Discord"}</option>
    {!known&&d&&<option value={d.maptableCampaignId}>A campaign that no longer exists</option>}
    {(campaigns??[]).filter(c=>c.id!==paired?.id||!!d).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
   </select></label>
   {campaigns&&!campaigns.length&&<p className="aside-hint">Create a campaign in Maptable and add its Discord webhook there first.</p>}
  </>}
 </div>;
}
