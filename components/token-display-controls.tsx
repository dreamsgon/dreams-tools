"use client";

import type { Token, Workspace } from "@/lib/model";
import { getTokenDefaults } from "@/lib/token-defaults";
import TokenColor from "./token-color";

export default function TokenDisplayControls({ token, workspace, campaignId, onChange }: {
  token: Token;
  workspace: Workspace;
  campaignId: string | null | undefined;
  onChange: (update: Partial<Token>) => void;
}) {
  const defaults = getTokenDefaults(workspace, campaignId);
  const nameScale = token.nameScale ?? defaults.nameScale ?? 1;
  const hpWidth = token.hpBarWidth ?? defaults.hpBarWidth ?? 1;
  const hpHeight = token.hpBarHeight ?? defaults.hpBarHeight ?? 7;
  const disposition = token.disposition ?? (token.rosterRole === "party" ? "party" : token.rosterRole === "npc" ? "enemy" : "neutral");
  return <fieldset style={{ border: 0, padding: 0, margin: "12px 0" }}>
    <legend style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Token display</legend>
    <label>Campaign role<select value={token.rosterRole} onChange={event => onChange({rosterRole:event.target.value as Token["rosterRole"]})}><option value="library">Other token</option><option value="party">Party member</option><option value="npc">NPC</option></select></label>
    <label>Disposition<select value={disposition} onChange={event => onChange({ disposition: event.target.value as Token["disposition"], useDispositionColor: true })}>
      <option value="enemy">Enemy — red</option>
      <option value="party">Party — blue</option>
      <option value="ally">Ally — green</option>
      <option value="neutral">Neutral — purple</option>
    </select></label>
    <label><input type="checkbox" checked={token.useDispositionColor === true} onChange={event => onChange({ useDispositionColor: event.target.checked })} /> Use disposition border color</label>
    <label>Name visibility<select value={token.nameVisibility ?? (token.showName ? "inherit" : "hide")} onChange={event => onChange({ nameVisibility: event.target.value as Token["nameVisibility"] })}>
      <option value="inherit">Inherit campaign default</option><option value="show">Show</option><option value="hide">Hide</option>
    </select></label>
    <label>Name placement<select value={token.namePosition ?? ""} onChange={event => onChange({ namePosition: (event.target.value || undefined) as Token["namePosition"] })}>
      <option value="">Inherit campaign default</option>
      <option value="bottom">Normal (bottom)</option><option value="top">Top</option><option value="side">Side (vertical)</option><option value="wrap">Wrap around token</option>
    </select></label>
    <label>Name text size · {Math.round(nameScale*100)}% · {token.nameScale===undefined?"Campaign default":"Token override"}<input aria-label="Name text size" type="range" min={50} max={300} step={10} value={Math.round(nameScale*100)} onChange={e=>onChange({nameScale:Number(e.target.value)/100})}/></label>
    <button type="button" disabled={token.nameScale===undefined} onClick={()=>onChange({nameScale:undefined})}>Use campaign name size</button>
    {([["nameSpacing","Extra wrapped name spacing",0],["nameHpSpacing","Wrapped name / HP spacing",3],["hpSpacing","Extra HP bar spacing",0]] as const).filter(([key])=>!token.partyMarker||key!=="hpSpacing").map(([key,label,fallback])=><div key={key}><label>{label} · {token[key]??defaults[key]??fallback} px · {token[key]===undefined?"Campaign default":"Token override"}<input aria-label={label} type="range" min={0} max={60} step={1} value={token[key]??defaults[key]??fallback} onChange={e=>onChange({[key]:Number(e.target.value)})}/></label><button type="button" disabled={token[key]===undefined} onClick={()=>onChange({[key]:undefined})}>Use campaign {label.toLowerCase()}</button></div>)}
    <small>Name spacing adds room outside the border. Name / HP spacing applies where the wrapped name overlaps the HP bar.</small>
    <small>Choose Hide above for artwork that already includes a name. Edit the name in General.</small>
    {!token.partyMarker && <><label>HP visibility<select value={token.hpVisibility ?? (token.showHp ? "inherit" : "hide")} onChange={event => onChange({ hpVisibility: event.target.value as Token["hpVisibility"] })}>
      <option value="inherit">Inherit campaign default</option><option value="show">Show</option><option value="hide">Hide</option>
    </select></label>
    <label>HP bar placement<select value={token.hpPosition??""} onChange={e=>onChange({hpPosition:(e.target.value||undefined) as Token["hpPosition"]})}><option value="">Inherit campaign default</option><option value="bottom">Normal (bottom)</option><option value="top">Top</option><option value="side">Side (vertical)</option><option value="wrap">Wrap around token</option></select></label>
    <label>HP bar width · {Math.round(hpWidth*100)}% · {token.hpBarWidth===undefined?"Campaign default":"Token override"}<input aria-label="HP bar width" type="range" min={25} max={200} step={5} value={Math.round(hpWidth*100)} onChange={e=>onChange({hpBarWidth:Number(e.target.value)/100})}/></label>
    <button type="button" disabled={token.hpBarWidth===undefined} onClick={()=>onChange({hpBarWidth:undefined})}>Use campaign HP width</button>
    <label>HP bar thickness · {hpHeight} px · {token.hpBarHeight===undefined?"Campaign default":"Token override"}<input aria-label="HP bar thickness" type="range" min={2} max={40} step={1} value={hpHeight} onChange={e=>onChange({hpBarHeight:Number(e.target.value)})}/></label>
    <button type="button" disabled={token.hpBarHeight===undefined} onClick={()=>onChange({hpBarHeight:undefined})}>Use campaign HP thickness</button>
    <label>HP bar color<select value={token.hpBarColor===undefined?"inherit":token.hpBarColor===null?"auto":"custom"} onChange={e=>onChange({hpBarColor:e.target.value==="inherit"?undefined:e.target.value==="auto"?null:defaults.hpBarColor??"#63b88b"})}><option value="inherit">Inherit campaign default</option><option value="auto">Automatic (green / amber / red)</option><option value="custom">Custom color</option></select></label>
    {typeof token.hpBarColor==="string"&&<label>HP color<TokenColor label="HP color" value={token.hpBarColor} onChange={hpBarColor=>onChange({hpBarColor})}/></label>}
    <small>{token.hpBarColor===undefined?(defaults.hpBarColor?`Campaign HP color: ${defaults.hpBarColor}`:"Campaign HP color: automatic"):"Custom colors stay fixed; automatic colors change with remaining HP."}</small>
    <small>Adjust a size slider to override just that value for this token.</small>
    <small>Side bars use width as their length. Wrapped bars use width for their arc length. Sizes scale with map zoom.</small></>}
  </fieldset>;
}
