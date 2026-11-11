"use client";

import type { Scene, Token } from "@/lib/model";
import { canAttachToken } from "@/lib/token-attachments";
import { Field, NumberField } from "./dialogs";

export default function TokenPosition({ scene, token, update }: {
  scene: Scene;
  token: Token;
  update: (fn: (scene: Scene) => void) => void;
}) {
  const index = scene.tokens.findIndex(item => item.id === token.id);
  const reorder = (destination: "back" | "front" | number) => update(next => {
    const current = next.tokens.findIndex(item => item.id === token.id);
    if (current < 0) return;
    const target = destination === "back" ? 0 : destination === "front"
      ? next.tokens.length - 1 : Math.max(0, Math.min(next.tokens.length - 1, current + destination));
    if (current === target) return;
    const [item] = next.tokens.splice(current, 1);
    next.tokens.splice(target, 0, item);
  });

  return <section className="token-position-options">
    <h3>Elevation, attachment & layers</h3>
    <NumberField label={`Elevation (${scene.grid.unit})`} value={token.elevation ?? 0}
      min={-100000} max={100000} step={1} onChange={elevation => update(next => {
        const selected = next.tokens.find(item => item.id === token.id);
        if (selected) selected.elevation = elevation;
      })}/>
    <small>Elevation is descriptive only. It does not automatically change line of sight.</small>
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
          <option key={item.id} value={item.id} disabled={!canAttachToken(scene, token.id, item.id)}>
            {item.name || "Unnamed token"}
          </option>)}
      </select>
    </Field>
    <p className="muted">Token layer {index + 1} of {scene.tokens.length} · Higher layers draw in front.</p>
    <div className="button-row">
      <button disabled={index <= 0} onClick={() => reorder("back")}>Send to back</button>
      <button disabled={index <= 0} onClick={() => reorder(-1)}>Move back one</button>
    </div>
    <div className="button-row">
      <button disabled={index < 0 || index >= scene.tokens.length - 1} onClick={() => reorder(1)}>Move forward one</button>
      <button disabled={index < 0 || index >= scene.tokens.length - 1} onClick={() => reorder("front")}>Bring to front</button>
    </div>
  </section>;
}
