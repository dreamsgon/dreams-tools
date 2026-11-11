"use client";
import {useState} from "react";
import {createPortal} from "react-dom";
import {Settings2} from "lucide-react";
import type { Workspace } from "@/lib/model";
import { getTokenDefaults, applyCampaignDisplayDefaults } from "@/lib/token-defaults";
import TokenColor from "./token-color";
import { Field, Toggle, Modal } from "./dialogs";

export default function CampaignTokenDefaults({workspace,campaignId,commit}:{workspace:Workspace;campaignId:string|null;commit:(change:(w:Workspace)=>void)=>void}) {
  const [open,setOpen]=useState(false);
  const [applied,setApplied]=useState(false);
  if (!campaignId) return null;
  const defaults=getTokenDefaults(workspace,campaignId);
  const patch=(value:Partial<typeof defaults>)=>commit(w=>{
    const campaign=w.collections.find(c=>c.id===campaignId&&c.kind==="campaign");
    if(campaign) campaign.tokenDefaults={...getTokenDefaults(w,campaignId),...value};
  });
  return <><button className="campaign-defaults-button" onClick={()=>setOpen(true)}><Settings2 size={16}/> Campaign token defaults</button>{open&&createPortal(<Modal title="Campaign token defaults" close={()=>{setOpen(false);setApplied(false);}}><p className="muted">Applies to {workspace.collections.find(c=>c.id===campaignId)?.name}. Changes save automatically.</p>
    <p className="muted">Individual token overrides take priority. Party markers are excluded from automatic HP states.</p>
    {([['partyZeroHp','Party members at 0 HP'],['npcZeroHp','NPCs at 0 HP']] as const).map(([key,label])=><Field key={key} label={label}><select value={defaults[key]} onChange={e=>patch({[key]:e.target.value as 'off'|'unconscious'|'dead'})}><option value="off">Off — manual only</option><option value="unconscious">Unconscious</option><option value="dead">Dead</option></select></Field>)}
    <Toggle label="Show token names by default" checked={defaults.showName} onChange={showName=>patch({showName})}/>
    <Toggle label="Show HP bars by default" checked={defaults.showHp} onChange={showHp=>patch({showHp})}/>
    {([["namePosition","Default name placement"],["hpPosition","Default HP bar placement"]] as const).map(([key,label])=><Field key={key} label={label}><select value={defaults[key]??"bottom"} onChange={e=>patch({[key]:e.target.value as "bottom"|"top"|"side"|"wrap"})}><option value="bottom">Normal (bottom)</option><option value="top">Top</option><option value="side">Side (vertical)</option><option value="wrap">Wrap around token</option></select></Field>)}
    <label>Default name text size · {Math.round((defaults.nameScale??1)*100)}%<input aria-label="Default name text size" type="range" min={50} max={300} step={10} value={Math.round((defaults.nameScale??1)*100)} onChange={e=>patch({nameScale:Number(e.target.value)/100})}/></label>
    <label>Default HP bar width · {Math.round((defaults.hpBarWidth??1)*100)}%<input aria-label="Default HP bar width" type="range" min={25} max={200} step={5} value={Math.round((defaults.hpBarWidth??1)*100)} onChange={e=>patch({hpBarWidth:Number(e.target.value)/100})}/></label>
    <label>Default HP bar thickness · {defaults.hpBarHeight??7} px<input aria-label="Default HP bar thickness" type="range" min={2} max={40} step={1} value={defaults.hpBarHeight??7} onChange={e=>patch({hpBarHeight:Number(e.target.value)})}/></label>
    {([["nameSpacing","Extra wrapped name spacing",0],["hpSpacing","Extra HP bar spacing",0],["nameHpSpacing","Wrapped name / HP spacing",3]] as const).map(([key,label,fallback])=><label key={key}>{label} · {defaults[key]??fallback} px<input aria-label={label} type="range" min={0} max={60} step={1} value={defaults[key]??fallback} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>)}
    <small>Name spacing adds room outside the token border. Name / HP spacing applies when the wrapped name overlaps the HP bar. All spacing scales with map zoom.</small>
    <button type="button" onClick={()=>patch({nameSpacing:0,hpSpacing:0,nameHpSpacing:3})}>Reset campaign spacing</button>
    <button type="button" onClick={()=>patch({nameScale:1,hpBarWidth:1,hpBarHeight:7})}>Reset campaign sizes</button>
    <label>Default HP bar color<select value={defaults.hpBarColor?"custom":"auto"} onChange={e=>patch({hpBarColor:e.target.value==="auto"?null:"#63b88b"})}><option value="auto">Automatic (green / amber / red)</option><option value="custom">Custom color</option></select></label>
    {defaults.hpBarColor&&<label>Campaign HP color<TokenColor label="Campaign HP color" value={defaults.hpBarColor} onChange={hpBarColor=>patch({hpBarColor})}/></label>}
    <p className="muted">Tokens inherit these placements and sizes unless individually overridden. Existing overrides stay unchanged. In a token’s Appearance settings, use the campaign-size buttons to restore inheritance for each size.</p>
    <button type="button" onClick={()=>{commit(w=>{applyCampaignDisplayDefaults(w,campaignId);});setApplied(true);}}>Apply campaign defaults to all existing tokens</button>
    <p className="muted">Resets name/HP visibility, placement, size, spacing, and HP color overrides in every scene and saved token belonging to this campaign. Shared gallery tokens and other campaigns are excluded. Party-marker HP settings, HP values, and combat rules stay unchanged. Undo restores the previous settings.</p>
    {applied&&<p role="status">Campaign display defaults applied. You can undo this change from the map toolbar.</p>}
    <p className="muted">NPCs move behind other tokens when marked dead. Dead tokens remain dead when healed.</p>
  </Modal>,document.body)}</>;
}
