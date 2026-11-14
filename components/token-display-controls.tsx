"use client";

import type { Token, Workspace } from "@/lib/model";
import { getTokenDefaults } from "@/lib/token-defaults";
import TokenColor from "./token-color";

type Mode = "inherit" | "show" | "hide";
const PLACEMENTS = [["", "Campaign default"], ["bottom", "Below"], ["top", "Above"], ["side", "Side (vertical)"], ["wrap", "Wrap around"]] as const;

function Segmented({ label, value, onChange }: { label: string; value: Mode; onChange: (mode: Mode) => void }) {
  return <div className="segmented" role="group" aria-label={label}>
    {([["inherit", "Campaign default"], ["show", "Show"], ["hide", "Hide"]] as const).map(([id, text]) =>
      <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}
  </div>;
}

/** The "On the map" card: whether the name and HP bar show, where, and how big the name is. Defaults come from the campaign. */
export function OnTheMapCard({ token, workspace, campaignId, onChange }: {
  token: Token; workspace: Workspace; campaignId: string | null | undefined; onChange: (update: Partial<Token>) => void;
}) {
  const defaults = getTokenDefaults(workspace, campaignId);
  const nameScale = token.nameScale ?? defaults.nameScale ?? 1;
  return <section className="editor-card" aria-label="On the map">
    <h3>On the map</h3>
    <div className="map-row"><span>Name</span>
      <Segmented label="Name visibility" value={token.nameVisibility ?? (token.showName ? "inherit" : "hide")} onChange={nameVisibility => onChange({ nameVisibility })} />
      <select aria-label="Name placement" value={token.namePosition ?? ""} onChange={e => onChange({ namePosition: (e.target.value || undefined) as Token["namePosition"] })}>
        {PLACEMENTS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select>
    </div>
    {!token.partyMarker && <div className="map-row"><span>HP bar</span>
      <Segmented label="HP visibility" value={token.hpVisibility ?? (token.showHp ? "inherit" : "hide")} onChange={hpVisibility => onChange({ hpVisibility })} />
      <select aria-label="HP bar placement" value={token.hpPosition ?? ""} onChange={e => onChange({ hpPosition: (e.target.value || undefined) as Token["hpPosition"] })}>
        {PLACEMENTS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select>
    </div>}
    <div className="map-row"><span>Name size</span>
      <input aria-label="Name text size" type="range" min={50} max={300} step={10} value={Math.round(nameScale * 100)} onChange={e => onChange({ nameScale: Number(e.target.value) / 100 })} />
      <span className="value">{Math.round(nameScale * 100)}% · {token.nameScale === undefined ? "campaign default" : <button type="button" className="text-button" onClick={() => onChange({ nameScale: undefined })}>Use campaign name size</button>}</span>
    </div>
    <small>Choose Hide for artwork that already includes a name. Edit the name at the top of this dialog.</small>
  </section>;
}

/** Folded away: the remaining sliders and the HP bar colour. */
export function FineLayout({ token, workspace, campaignId, onChange }: {
  token: Token; workspace: Workspace; campaignId: string | null | undefined; onChange: (update: Partial<Token>) => void;
}) {
  const defaults = getTokenDefaults(workspace, campaignId);
  const hpWidth = token.hpBarWidth ?? defaults.hpBarWidth ?? 1;
  const hpHeight = token.hpBarHeight ?? defaults.hpBarHeight ?? 7;
  return <details className="editor-card fold">
    <summary><strong>Fine layout</strong> <span>HP bar width and thickness, spacing, HP colour</span></summary>
    <div className="fold-body">
      {([["nameSpacing", "Extra wrapped name spacing", 0], ["nameHpSpacing", "Wrapped name / HP spacing", 3], ["hpSpacing", "Extra HP bar spacing", 0]] as const).filter(([key]) => !token.partyMarker || key !== "hpSpacing").map(([key, label, fallback]) =>
        <div key={key}><label>{label} · {token[key] ?? defaults[key] ?? fallback} px · {token[key] === undefined ? "Campaign default" : "Token override"}<input aria-label={label} type="range" min={0} max={60} step={1} value={token[key] ?? defaults[key] ?? fallback} onChange={e => onChange({ [key]: Number(e.target.value) })} /></label>
          <button type="button" disabled={token[key] === undefined} onClick={() => onChange({ [key]: undefined })}>Use campaign {label.toLowerCase()}</button></div>)}
      <small>Name spacing adds room outside the border. Name / HP spacing applies where the wrapped name overlaps the HP bar.</small>
      {!token.partyMarker && <>
        <label>HP bar width · {Math.round(hpWidth * 100)}% · {token.hpBarWidth === undefined ? "Campaign default" : "Token override"}<input aria-label="HP bar width" type="range" min={25} max={200} step={5} value={Math.round(hpWidth * 100)} onChange={e => onChange({ hpBarWidth: Number(e.target.value) / 100 })} /></label>
        <button type="button" disabled={token.hpBarWidth === undefined} onClick={() => onChange({ hpBarWidth: undefined })}>Use campaign HP width</button>
        <label>HP bar thickness · {hpHeight} px · {token.hpBarHeight === undefined ? "Campaign default" : "Token override"}<input aria-label="HP bar thickness" type="range" min={2} max={40} step={1} value={hpHeight} onChange={e => onChange({ hpBarHeight: Number(e.target.value) })} /></label>
        <button type="button" disabled={token.hpBarHeight === undefined} onClick={() => onChange({ hpBarHeight: undefined })}>Use campaign HP thickness</button>
        <label>HP bar color<select value={token.hpBarColor === undefined ? "inherit" : token.hpBarColor === null ? "auto" : "custom"} onChange={e => onChange({ hpBarColor: e.target.value === "inherit" ? undefined : e.target.value === "auto" ? null : defaults.hpBarColor ?? "#63b88b" })}><option value="inherit">Inherit campaign default</option><option value="auto">Automatic (green / amber / red)</option><option value="custom">Custom color</option></select></label>
        {typeof token.hpBarColor === "string" && <label>HP color<TokenColor label="HP color" value={token.hpBarColor} onChange={hpBarColor => onChange({ hpBarColor })} /></label>}
        <small>{token.hpBarColor === undefined ? (defaults.hpBarColor ? `Campaign HP color: ${defaults.hpBarColor}` : "Campaign HP color: automatic") : "Custom colors stay fixed; automatic colors change with remaining HP."}</small>
        <small>Side bars use width as their length. Wrapped bars use width for their arc length. Sizes scale with map zoom.</small>
      </>}
    </div>
  </details>;
}
