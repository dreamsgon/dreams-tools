"use client";
import "./token-ui.css";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Copy, Minus, Plus, Trash2, X } from "lucide-react";
import { Modal, NumberField } from "./dialogs";
import TokenFace from "./token-face";
import TokenColor from "./token-color";
import TokenBorder from "./token-border";
import TokenImage from "./token-image";
import TokenNotesControl from "./token-notes-control";
import TokenStatblock from "./token-statblock";
import { MovementCard, RidingCard, LayerCard } from "./token-position";
import { OnTheMapCard, FineLayout } from "./token-display-controls";
import { HitPointsCard, StateCard, InitiativeCard, StatsCard } from "./token-combat";
import { address, type Scene, type Token, type Workspace } from "@/lib/model";
import { resolveTokenForCampaign, tokenDisposition, sidePatch, usesSideColours, type TokenSide } from "@/lib/token-defaults";
import { resizeToken, sizeLabel, stepSize } from "@/lib/token-transform";
import { conditionAge } from "@/lib/initiative-tracker";

const SIDES: { id: TokenSide; label: string; name: string }[] = [
  { id: "party", label: "Party", name: "Party" }, { id: "ally", label: "Ally", name: "Allies" },
  { id: "neutral", label: "Neutral", name: "Neutral" }, { id: "enemy", label: "Enemy", name: "Enemy" },
];
const SIDE_DOT: Record<TokenSide, string> = { party: "#6f9cf2", ally: "#4fcf9a", neutral: "#e8a93a", enemy: "#f0685f" };

export type TokenEditorProps = {
  mode: "scene" | "saved";
  token: Token; workspace: Workspace; campaignId: string | null; initials: string;
  /** Change this token's own fields. */
  patch: (update: Partial<Token>) => void;
  commit: (fn: (w: Workspace) => void) => void;
  scene?: Scene; updateScene?: (fn: (scene: Scene) => void) => void;
  close: () => void;
  onDuplicate?: () => void; onCopy?: () => void; onDelete: () => void;
  /** The "Saved copy" tab. */
  savedCopy: ReactNode; savedSummary: string;
};

/**
 * The Edit token dialog, for a token on the map and for a saved token. A header with a live preview, name, side, size and visibility;
 * a left nav of sections with a one-line summary each; a footer with Duplicate, Copy and Delete. Changes apply as you make them.
 */
export default function TokenEditor(p: TokenEditorProps) {
  const { token, workspace, campaignId, scene, mode } = p;
  const [active, setActive] = useState("basics");
  const prefix = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { window.addEventListener("maptable-tray-roll", p.close); return () => window.removeEventListener("maptable-tray-roll", p.close); }, [p.close]);

  const look = resolveTokenForCampaign(workspace, campaignId, token);
  const side = tokenDisposition(token), sideName = SIDES.find(s => s.id === side)!;
  const sideOn = usesSideColours(token), canSide = !token.assetId && !token.pieceOf;
  const unit = scene?.grid.unit ?? "ft";
  const round = scene?.initiativeState?.round ?? 1;
  const groups = [...new Set((scene?.tokens ?? []).map(t => t.initiativeGroup?.trim()).filter((g): g is string => !!g))].sort();

  const setSize = (direction: 1 | -1) => {
    const size = stepSize(token.size, direction);
    if (size === token.size) return;
    if (mode === "scene" && p.updateScene) p.updateScene(s => { const t = s.tokens.find(x => x.id === token.id); if (t) resizeToken(t, s.grid, size); });
    else p.patch({ size });
  };
  const setSide = (next: TokenSide) => p.patch(sidePatch(token, next));
  const setSideColours = (on: boolean) => p.patch(on ? { sideColours: true }
    : { sideColours: false, color: look.color, borderColor: look.borderColor ?? look.color, textColor: look.textColor ?? "#ffffff" });

  const conditions = workspace.conditions.filter(c => token.conditions.includes(c.id));
  const sections: { id: string; label: string; summary: string; content: ReactNode }[] = [
    { id: "basics", label: "Basics", summary: mode === "scene" ? "Movement, riding, layer" : "Movement, exact size", content: <>
      <MovementCard unit={unit} token={token} patch={p.patch} />
      {mode === "scene" && scene && p.updateScene && <>
        <RidingCard scene={scene} token={token} update={p.updateScene} />
        <LayerCard scene={scene} token={token} update={p.updateScene} />
      </>}
      <details className="editor-card fold">
        <summary><strong>Exact position</strong> {mode === "scene" && scene && <span>{address(token, scene.grid)}{address(token, scene.grid) ? " · " : ""}{Math.round(token.x)}, {Math.round(token.y)} px</span>}</summary>
        <div className="fold-body">
          <NumberField label="Size (cells)" title="Shift + scroll on the map to resize" min={0.25} max={20} step={0.25} value={token.size} onChange={size => p.patch({ size })} />
          {mode === "scene" && scene && <div className="editor-grid two">
            <NumberField label="X position (px)" max={scene.width} value={token.x} onChange={x => p.patch({ x })} />
            <NumberField label="Y position (px)" max={scene.height} value={token.y} onChange={y => p.patch({ y })} />
          </div>}
          <small>Drag the token to move it. Click or tap empty space to deselect; drag empty space to pan.</small>
        </div>
      </details>
    </> },
    { id: "look", label: "Look", summary: "Colours, picture, name, HP", content: <>
      <section className="editor-card" aria-label="Colours">
        <h3>Colours</h3>
        {canSide ? <label className="switch"><input type="checkbox" role="switch" checked={sideOn} onChange={e => setSideColours(e.target.checked)} /><span>Use the {sideName.name === "Allies" ? "Ally" : sideName.name} side colours</span></label>
          : <small>Side colours apply to tokens without a picture. This token&apos;s picture sits on the fill below.</small>}
        <div className="swatches">
          <div><span>Fill</span><TokenColor label="Fill color" disabled={sideOn} value={look.color} onChange={color => p.patch({ color, borderColor: token.borderColor ?? token.color })} /></div>
          <div><span>Ring</span><TokenColor label="Border color" disabled={sideOn} value={look.borderColor ?? look.color} onChange={borderColor => p.patch({ borderColor, useDispositionColor: false })} /></div>
          <div><span>Letters</span><TokenColor label="Text color" disabled={sideOn} value={look.textColor ?? "#ffffff"} onChange={textColor => p.patch({ textColor })} /></div>
        </div>
        {!sideOn && <label className="check"><input type="checkbox" checked={token.useDispositionColor === true} onChange={e => p.patch({ useDispositionColor: e.target.checked })} />Ring follows the side ({sideName.label.toLowerCase()})</label>}
        <small>{sideOn ? "Turn it off to pick your own colours. Side colours are set in Campaign token defaults." : "Picked colours stay as they are. Turn side colours on to follow the side again."}</small>
      </section>
      <div className="editor-card"><TokenImage token={token} workspace={workspace} commit={p.commit} saved={mode === "saved"} /></div>
      <div className="editor-card"><h3>Ring</h3><TokenBorder token={token} workspace={workspace} commit={p.commit} saved={mode === "saved"} /></div>
      <OnTheMapCard token={token} workspace={workspace} campaignId={campaignId} onChange={p.patch} />
      <FineLayout token={token} workspace={workspace} campaignId={campaignId} onChange={p.patch} />
    </> },
    { id: "combat", label: "Combat", summary: token.partyMarker ? "Initiative and stats" : `${token.hp} / ${token.maxHp} HP${token.initiative != null ? ` · Init ${token.initiative}` : ""}`, content: <>
      {!token.partyMarker && <HitPointsCard token={token} patch={p.patch} />}
      <StateCard token={token} patch={p.patch} />
      <InitiativeCard token={token} patch={p.patch} groups={groups} />
      <StatsCard token={token} patch={p.patch} />
    </> },
    ...(mode === "scene" && scene ? [
      { id: "conditions", label: "Conditions", summary: conditions.length ? conditions.map(c => c.name).join(", ") : "None", content: <section className="editor-card" aria-label="Conditions">
        <h3>Conditions</h3>
        <div className="condition-chips">
          {workspace.conditions.map(c => {
            const on = token.conditions.includes(c.id), age = conditionAge(token, c.id, round);
            return <button key={c.id} type="button" className={on ? "active" : ""} aria-pressed={on} onClick={() => p.patch({ conditions: on ? token.conditions.filter(id => id !== c.id) : [...token.conditions, c.id] })}>
              <span style={{ background: c.color }}>{c.assetId ? <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="condition-icon-image" src={workspace.assets.find(a => a.id === c.assetId)?.src} alt="" />
              </> : c.icon}</span>
              {c.name}{on && <small> · {age === null ? "round added unknown" : `${age} rounds`}</small>}
            </button>;
          })}
        </div>
        {!workspace.conditions.length && <small>No conditions are set up for this campaign yet.</small>}
      </section> },
      { id: "statblock", label: "Statblock", summary: token.encyclopediaEntryId ? "Linked to the Encyclopedia" : "Not linked", content: <section className="editor-card" aria-label="Statblock"><TokenStatblock token={token} sceneId={scene.id} campaignId={campaignId} onLink={encyclopediaEntryId => p.patch({ encyclopediaEntryId })} /></section> },
    ] : []),
    { id: "notes", label: "Notes", summary: token.notes?.trim() ? token.notes.trim().split("\n")[0].slice(0, 30) : "Empty", content: <section className="editor-card" aria-label="Notes">
      <TokenNotesControl section="notes" token={token} onChange={p.patch} sceneId={scene?.id ?? (mode === "saved" ? workspace.activeId : undefined)} campaignId={campaignId} />
    </section> },
    { id: "saved", label: "Saved copy", summary: p.savedSummary, content: p.savedCopy },
  ];
  const activeIndex = Math.max(0, sections.findIndex(s => s.id === active));

  return createPortal(<Modal title={mode === "scene" ? "Edit token" : `Edit ${token.name || "saved token"}`} bare className="token-editor-modal" close={p.close}>
    <header className="te-header">
      <TokenFace token={token} workspace={workspace} campaignId={campaignId} initials={p.initials} size={64} className="te-preview" />
      <div className="te-identity">
        <input className="te-name" aria-label="Token name" maxLength={120} value={token.name} onChange={e => p.patch({ name: e.target.value })} />
        <div className="te-sides" role="group" aria-label="Side">
          {SIDES.map(s => <button key={s.id} type="button" aria-pressed={side === s.id} onClick={() => setSide(s.id)}>
            <i style={{ background: SIDE_DOT[s.id] }} aria-hidden="true" />{s.label}</button>)}
        </div>
      </div>
      <div className="te-controls">
        <button type="button" className="te-close" aria-label="Close dialog" onClick={p.close}><X size={18} /></button>
        <div className="te-stepper" role="group" aria-label="Size">
          <button type="button" aria-label="Smaller" disabled={token.size <= 0.25} onClick={() => setSize(-1)}><Minus size={14} /></button>
          <span aria-live="polite">{sizeLabel(token.size)}</span>
          <button type="button" aria-label="Larger" disabled={token.size >= 20} onClick={() => setSize(1)}><Plus size={14} /></button>
        </div>
        <label className="switch"><input type="checkbox" role="switch" checked={token.hidden} onChange={e => p.patch({ hidden: e.target.checked })} /><span>Hidden from players</span></label>
      </div>
    </header>
    <div className="te-body">
      <nav className="te-nav" role="tablist" aria-label="Token options" aria-orientation="vertical">
        {sections.map((s, index) => <button key={s.id} type="button" role="tab" id={`${prefix}-${s.id}-tab`} aria-controls={`${prefix}-${s.id}-panel`} aria-selected={active === s.id}
          tabIndex={index === activeIndex ? 0 : -1} ref={node => { tabs.current[index] = node; }} onClick={() => setActive(s.id)}
          onKeyDown={e => {
            let next = index;
            if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (index + 1) % sections.length;
            else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (index + sections.length - 1) % sections.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = sections.length - 1;
            else return;
            e.preventDefault(); setActive(sections[next].id); tabs.current[next]?.focus();
          }}><strong>{s.label}</strong><small>{s.summary}</small></button>)}
      </nav>
      <div className="te-panels">
        {sections.map(s => <div key={s.id} hidden={s.id !== active} role="tabpanel" id={`${prefix}-${s.id}-panel`} aria-labelledby={`${prefix}-${s.id}-tab`} tabIndex={0} className="te-panel">{s.content}</div>)}
      </div>
    </div>
    <footer className="te-footer">
      <div className="te-actions">
        <button type="button" onClick={p.onDuplicate}><Copy size={14} /> Duplicate</button>
        {p.onCopy && <button type="button" onClick={p.onCopy}>Copy</button>}
        <button type="button" className="danger" onClick={p.onDelete}><Trash2 size={14} /> Delete</button>
      </div>
      <span className="te-note">Changes save as you go</span>
      <button type="button" className="primary" onClick={p.close}>Done</button>
    </footer>
  </Modal>, document.body);
}
