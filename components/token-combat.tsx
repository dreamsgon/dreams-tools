"use client";
import { useId, useState } from "react";
import { Circle, Moon, Skull } from "lucide-react";
import type { Token } from "@/lib/model";
import { InitiativeField } from "./map-initiative";
import { NumberField } from "./dialogs";

const clampHp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(n)));
const hpTone = (hp: number, max: number) => hp / Math.max(1, max) > 0.5 ? "good" : hp / Math.max(1, max) > 0.25 ? "warn" : "bad";

/** Hit points: the big number, quick steps, a box to set it exactly, maximum and temporary HP. */
export function HitPointsCard({ token, patch }: { token: Token; patch: (update: Partial<Token>) => void }) {
  const [draft, setDraft] = useState("");
  const setHp = (n: number) => patch({ hp: clampHp(n, token.maxHp) });
  const commitDraft = () => { const n = Number(draft); if (draft.trim() && Number.isFinite(n)) setHp(n); setDraft(""); };
  return <section className="editor-card" aria-label="Hit points">
    <h3>Hit points</h3>
    <div className="hp-big"><strong aria-live="polite">{token.hp}</strong><span>/ {token.maxHp}</span>
      <div className="hp-meter" data-tone={hpTone(token.hp, token.maxHp)} role="meter" aria-label="Hit points" aria-valuemin={0} aria-valuemax={token.maxHp} aria-valuenow={token.hp}><i style={{ width: `${Math.min(100, token.hp / Math.max(1, token.maxHp) * 100)}%` }} /></div></div>
    <div className="hp-steps">
      {[-5, -1].map(n => <button key={n} type="button" aria-label={`${n < 0 ? "Lose" : "Gain"} ${Math.abs(n)} HP`} onClick={() => setHp(token.hp + n)}>{n < 0 ? "−" : "+"}{Math.abs(n)}</button>)}
      <input aria-label="Set HP to" placeholder="Set HP" inputMode="numeric" value={draft} onChange={e => setDraft(e.target.value)} onBlur={commitDraft} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      {[1, 5].map(n => <button key={n} type="button" aria-label={`Gain ${n} HP`} onClick={() => setHp(token.hp + n)}>+{n}</button>)}
    </div>
    <div className="editor-grid two">
      <NumberField label="Maximum HP" min={1} value={token.maxHp} onChange={maxHp => patch({ maxHp })} />
      <label className="field"><span>Temporary HP</span><input type="number" aria-label="Temp HP" min={0} max={1000000} step={1} value={token.tempHp ?? ""} onChange={e => {
        const value = e.target.value === "" ? null : Number(e.target.value);
        if (value === null || (Number.isInteger(value) && value >= 0 && value <= 1000000)) patch({ tempHp: value });
      }} /></label>
    </div>
    <small>Temp HP is recorded separately from HP.</small>
  </section>;
}

/** Active, unconscious or dead, what happens at 0 HP, and whether this counts as a party member or an NPC. */
export function StateCard({ token, patch }: { token: Token; patch: (update: Partial<Token>) => void }) {
  const value = token.status ?? "active";
  return <section className="editor-card" aria-label="State">
    <h3>State</h3>
    <div className="state-row">
      <div className="segmented" role="group" aria-label="Token state">
        {([["active", "Active", Circle], ["unconscious", "Unconscious", Moon], ["dead", "Dead", Skull]] as const).map(([id, text, Icon]) =>
          <button key={id} type="button" aria-pressed={value === id} onClick={() => patch({ status: id })}><Icon size={14} aria-hidden="true" />{text}</button>)}
      </div>
      {!token.partyMarker && <label className="inline">At 0 HP<select value={token.zeroHpStatus ?? "inherit"} onChange={e => patch({ zeroHpStatus: e.target.value === "inherit" ? undefined : e.target.value as NonNullable<Token["zeroHpStatus"]> })}>
        <option value="inherit">Campaign default</option><option value="off">Off — manual only</option><option value="unconscious">Mark unconscious</option><option value="dead">Mark dead</option></select></label>}
    </div>
    <small>Applies when HP reaches 0, or when enabled at 0 HP. Healing above 0 HP clears Unconscious. Dead stays marked until you choose Active.</small>
    {!token.partyMarker && <label className="inline">Counts as<select aria-label="Campaign role" value={token.rosterRole} onChange={e => patch({ rosterRole: e.target.value as Token["rosterRole"] })}>
      <option value="library">Other token</option><option value="party">Party member</option><option value="npc">NPC</option></select></label>}
  </section>;
}

/** Roll, shared turn group and skipping. */
export function InitiativeCard({ token, patch, groups }: { token: Token; patch: (update: Partial<Token>) => void; groups: string[] }) {
  const list = useId();
  return <section className="editor-card" aria-label="Initiative">
    <h3>Initiative</h3>
    <div className="editor-grid two">
      <label className="field"><span>Roll</span><InitiativeField label="Token initiative" value={token.initiative} onCommit={initiative => patch({ initiative })} /></label>
      <label className="field"><span>Shares a turn with</span><input aria-label="Token initiative group" list={list} maxLength={120} placeholder="Nobody" value={token.initiativeGroup ?? ""} onChange={e => patch({ initiativeGroup: e.target.value })} />
        <datalist id={list}>{groups.map(g => <option key={g} value={g} />)}</datalist></label>
    </div>
    <label className="switch"><input type="checkbox" role="switch" checked={token.skipInitiative ?? false} onChange={e => patch({ skipInitiative: e.target.checked })} /><span>Skip this token in initiative</span></label>
    <small>Tokens with the same group name share a turn.</small>
  </section>;
}

/** AC, DC and passive perception, and what shows in Discord initiative posts. */
export function StatsCard({ token, patch }: { token: Token; patch: (update: Partial<Token>) => void }) {
  const fields = [["ac", "showAc", "AC"], ["dc", "showDc", "DC"], ["passivePerception", "showPassivePerception", "Passive perception (PP)"]] as const;
  return <section className="editor-card" aria-label="Stats">
    <h3>Stats <small className="optional">shown in Discord initiative posts if you choose</small></h3>
    <div className="editor-grid three">
      {fields.map(([field, , label]) => <label key={field} className="field"><span>{label}</span>
        <input aria-label={label} type="number" min={0} max={1000000} step={1} value={token[field] ?? ""} onChange={e => {
          const value = e.target.value === "" ? null : Number(e.target.value);
          if (value === null || (Number.isInteger(value) && value >= 0 && value <= 1000000)) patch({ [field]: value });
        }} /></label>)}
    </div>
    <div className="check-list">
      {([...fields, ["tempHp", "showTempHp", "Temp HP"]] as const).map(([, visibility, label]) => <label key={visibility}><input type="checkbox" checked={token[visibility] ?? false} onChange={e => patch({ [visibility]: e.target.checked })} />Show {label} on Discord</label>)}
      <label><input type="checkbox" checked={token.showDiscordConditions ?? false} onChange={e => patch({ showDiscordConditions: e.target.checked })} />Show conditions on Discord</label>
    </div>
    <label>HP on Discord<select value={token.discordHpDisplay ?? "default"} onChange={e => patch({ discordHpDisplay: e.target.value as Token["discordHpDisplay"] })}>
      <option value="default">Default (NPCs/enemies: health; others: exact)</option><option value="exact">Exact HP</option><option value="health">Health descriptor</option><option value="hidden">Hidden</option></select></label>
    <small>Exact HP respects token and campaign HP visibility. Health descriptors can appear with HP bars hidden; choose Hidden to hide health entirely. Health uses Healthy (full), Injured (above half), Bloodied (above 15%), Critical, Dead or Unconscious.</small>
  </section>;
}
