"use client";
import { Plus, Trash2 } from "lucide-react";
import type { Effect, Scene, Token } from "@/lib/model";
import { AURA_DIRECTIONS, AURA_SHAPES, MAX_SCENE_EFFECTS, MAX_TOKEN_AURAS, auraDistance, newTokenAura, reshapeAura, tokenAuras, type AuraShape } from "@/lib/token-auras";
import { NumberField } from "./dialogs";
import TokenColor from "./token-color";

type Update = (fn: (scene: Scene) => void) => void;

/**
 * The token editor's Auras section: areas that follow the token, such as a paladin's aura.
 * Each has a name, a shape, how far it reaches past the token's edge, a colour and whether players see it.
 * They are ordinary attached auras, so they also show (and can be edited) in the Auras & AoEs panel.
 */
export default function TokenAuras({ scene, token, update }: { scene: Scene; token: Token; update: Update }) {
  const auras = tokenAuras(scene, token.id);
  const unit = scene.grid.unit;
  const full = auras.length >= MAX_TOKEN_AURAS || scene.effects.length >= MAX_SCENE_EFFECTS;
  const change = (id: string, fn: (effect: Effect, token: Token) => void) => update(s => {
    const effect = s.effects.find(e => e.id === id), owner = s.tokens.find(t => t.id === token.id);
    if (effect && owner) fn(effect, owner);
  });
  const add = () => update(s => {
    const owner = s.tokens.find(t => t.id === token.id);
    if (!owner || tokenAuras(s, owner.id).length >= MAX_TOKEN_AURAS || s.effects.length >= MAX_SCENE_EFFECTS) return;
    s.effects.push(newTokenAura(owner, s.grid, tokenAuras(s, owner.id).length));
  });
  const remove = (id: string) => update(s => { s.effects = s.effects.filter(e => e.id !== id); });

  return <>
    {auras.map((aura, index) => <section key={aura.id} className="editor-card token-aura" aria-label={`Aura ${index + 1}: ${aura.label || "Aura"}`}>
      <div className="token-aura-head">
        <input type="text" aria-label="Aura name" maxLength={120} placeholder="Aura" value={aura.label} onChange={e => change(aura.id, a => { a.label = e.target.value; })} />
        <button type="button" className="icon-button danger" aria-label={`Remove ${aura.label || "aura"}`} title="Remove aura" onClick={() => remove(aura.id)}><Trash2 size={15} /></button>
      </div>
      <div className="te-sides token-aura-shapes" role="group" aria-label="Shape">
        {AURA_SHAPES.map(shape => <button key={shape.id} type="button" aria-pressed={aura.type === shape.id}
          onClick={() => change(aura.id, (a, owner) => reshapeAura(a, owner, { type: shape.id as AuraShape }, scene.grid))}>{shape.label}</button>)}
      </div>
      <div className="editor-grid two">
        <NumberField label={`Reach past the token (${unit})`} min={0} max={200 * scene.grid.units} step={scene.grid.units} value={auraDistance(aura, token, scene.grid)}
          onChange={distance => change(aura.id, (a, owner) => reshapeAura(a, owner, { distance }, scene.grid))} />
        {aura.type === "cone"
          ? <label className="field"><span>Points</span>
            <select aria-label="Cone direction" value={AURA_DIRECTIONS.find(d => d.rotation === Math.round(((aura.rotation % 360) + 540) % 360 - 180))?.rotation ?? ""}
              onChange={e => change(aura.id, a => { a.rotation = Number(e.target.value); })}>
              {!AURA_DIRECTIONS.some(d => d.rotation === Math.round(((aura.rotation % 360) + 540) % 360 - 180)) && <option value="">Turned by hand</option>}
              {AURA_DIRECTIONS.map(d => <option key={d.label} value={d.rotation}>{d.label}</option>)}
            </select></label>
          : <label className="field"><span>Fill</span>
            <input type="range" aria-label="Aura fill strength" min={0} max={0.6} step={0.02} value={aura.fillOpacity ?? 0.27}
              onChange={e => change(aura.id, a => { a.fillOpacity = Number(e.target.value); })} /></label>}
      </div>
      {aura.type === "cone" && <label className="field"><span>Fill</span>
        <input type="range" aria-label="Aura fill strength" min={0} max={0.6} step={0.02} value={aura.fillOpacity ?? 0.27}
          onChange={e => change(aura.id, a => { a.fillOpacity = Number(e.target.value); })} /></label>}
      <div className="token-aura-row">
        <div className="swatches"><div><span>Colour</span><TokenColor label="Aura colour" value={aura.color} onChange={color => change(aura.id, a => { a.color = color; })} /></div></div>
        <label className="switch"><input type="checkbox" role="switch" checked={aura.hidden} onChange={e => change(aura.id, a => { a.hidden = e.target.checked; })} /><span>Hidden from players</span></label>
      </div>
    </section>)}
    <section className="editor-card" aria-label="Add an aura">
      {!auras.length && <><h3>Auras</h3><small>An aura is an area that moves with the token, like a paladin&apos;s Aura of Protection. It reaches out from the token&apos;s edge, so it grows with the token.</small></>}
      <div className="button-row wrap"><button type="button" disabled={full} onClick={add}><Plus size={14} /> Add an aura</button></div>
      <small>Square counts grid squares, the usual way on a 5e grid. Circle measures true distance. A cone points one way from the token. {auras.length >= MAX_TOKEN_AURAS ? `A token holds up to ${MAX_TOKEN_AURAS} auras.` : full ? `This scene has the most areas it can hold (${MAX_SCENE_EFFECTS}).` : "Auras also appear in the Auras & AoEs panel. Hidden tokens hide their auras from players."}</small>
    </section>
  </>;
}
