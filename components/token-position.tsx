"use client";

import type { Scene, Token } from "@/lib/model";
import { canAttachToken } from "@/lib/token-attachments";
import { Field, NumberField } from "./dialogs";

type Update = (fn: (scene: Scene) => void) => void;

/** Speed and elevation. With `patch` (a saved token) they change the token directly; otherwise through the scene. */
export function MovementCard({ unit, token, patch }: { unit: string; token: Token; patch: (update: Partial<Token>) => void }) {
  return <section className="editor-card" aria-label="Movement">
    <h3>Movement</h3>
    <div className="editor-grid two">
      <NumberField label={`Speed (${unit})`} value={token.speed ?? 0} min={0} max={100000} step={5} onChange={speed => patch({ speed: speed > 0 ? speed : undefined })} />
      <NumberField label={`Elevation (${unit})`} value={token.elevation ?? 0} min={-100000} max={100000} step={1} onChange={elevation => patch({ elevation })} />
    </div>
    <small>With a speed, the ruler colours the squares you drag across: green within it, amber for a dash (twice it), red beyond. 0 means no colours. Elevation is descriptive only and shows as a tag on the token; it does not change line of sight.</small>
  </section>;
}

/** Rider or carried token: follows another token and keeps its place beside it. */
export function RidingCard({ scene, token, update }: { scene: Scene; token: Token; update: Update }) {
  return <section className="editor-card" aria-label="Riding or carried">
    <h3>Riding or carried <small className="optional">optional</small></h3>
    <Field label="Attach to token" hint="A rider or carried token keeps its current relative offset and follows the attached token when it moves. Detaching keeps the current position.">
      <select value={token.attachedToId ?? ""} onChange={event => {
        const parentId = event.target.value || null;
        update(next => {
          const selected = next.tokens.find(item => item.id === token.id);
          if (selected && canAttachToken(next, token.id, parentId)) selected.attachedToId = parentId;
        });
      }}>
        <option value="">None (detached)</option>
        {scene.tokens.filter(item => item.id !== token.id).map(item =>
          <option key={item.id} value={item.id} disabled={!canAttachToken(scene, token.id, item.id)}>{item.name || "Unnamed token"}</option>)}
      </select>
    </Field>
  </section>;
}

/** Where the token draws among the others: higher layers are in front. */
export function LayerCard({ scene, token, update }: { scene: Scene; token: Token; update: Update }) {
  const index = scene.tokens.findIndex(item => item.id === token.id), last = scene.tokens.length - 1;
  const reorder = (destination: "back" | "front" | number) => update(next => {
    const current = next.tokens.findIndex(item => item.id === token.id);
    if (current < 0) return;
    const target = destination === "back" ? 0 : destination === "front"
      ? next.tokens.length - 1 : Math.max(0, Math.min(next.tokens.length - 1, current + destination));
    if (current === target) return;
    const [item] = next.tokens.splice(current, 1);
    next.tokens.splice(target, 0, item);
  });
  return <section className="editor-card" aria-label="Layer">
    <h3>Layer <small className="optional">{index + 1} of {scene.tokens.length} · higher layers draw in front</small></h3>
    <div className="button-row wrap">
      <button type="button" disabled={index < 0 || index >= last} onClick={() => reorder(1)}>Bring forward</button>
      <button type="button" disabled={index <= 0} onClick={() => reorder(-1)}>Send backward</button>
      <button type="button" disabled={index < 0 || index >= last} onClick={() => reorder("front")}>Bring to front</button>
      <button type="button" disabled={index <= 0} onClick={() => reorder("back")}>Send to back</button>
    </div>
  </section>;
}
