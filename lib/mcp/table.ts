/*
 * Changes to the Maptable table made by an AI connection at the "Run the game" level, and how they are
 * recorded so the GM can undo each one. A change is recorded in small parts (one token, one effect, the fog,
 * the combat order) so undoing an AI's damage roll doesn't also undo the GM's own token moves since.
 */
import type { Scene, Workspace as Maps } from "../model.ts";
import { syncConditionRounds } from "../initiative-tracker.ts";
import { syncTokenAttachments } from "../token-attachments.ts";
import { applyWorkspaceHpStates } from "../token-hp-state.ts";
import { stable } from "./activity.ts";

/** One part of a scene as it was before (undefined: it didn't exist) and a fingerprint of it after (null: removed). */
export type TablePart = { sceneId: string; scene: string; key: string; label: string; before?: unknown; after: string | null };

const FIELDS = ["fog", "initiativeState"] as const;

/** Runs an edit on one scene of the whole Maptable workspace, keeping attachments, condition rounds and 0 HP rules in step. */
export function editScene(maps: Maps, sceneId: string, edit: (s: Scene) => void): Maps {
  const index = maps.scenes.findIndex(s => s.id === sceneId), previous = maps.scenes[index];
  const draft = structuredClone(previous);
  edit(draft);
  syncConditionRounds(draft, previous);
  const synced = syncTokenAttachments(previous, draft);
  for (const effect of synced.effects) {
    if (!effect.tokenId) continue;
    const token = synced.tokens.find(t => t.id === effect.tokenId);
    if (token) { effect.x = token.x; effect.y = token.y; } else effect.tokenId = null;
  }
  const next = { ...maps, scenes: maps.scenes.map((s, i) => i === index ? synced : s) };
  applyWorkspaceHpStates(maps, next);
  return next;
}

function fp(v: unknown) {
  const s = stable(v);
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
type Parted = Map<string, { label: string; value: unknown }>;
function parts(s: Scene): Parted {
  const out: Parted = new Map();
  for (const t of s.tokens) out.set(`token:${t.id}`, { label: t.name, value: t });
  for (const e of s.effects) out.set(`effect:${e.id}`, { label: e.label || "an effect", value: e });
  for (const f of FIELDS) if (s[f] !== undefined) out.set(f, { label: f === "fog" ? "the fog" : "the combat order", value: s[f] });
  return out;
}

/** The parts of each scene that a change added, changed or removed. */
export function tableParts(before: Maps, after: Maps): TablePart[] {
  const out: TablePart[] = [];
  for (const s of after.scenes) {
    const was = before.scenes.find(x => x.id === s.id);
    if (!was || stable(was) === stable(s)) continue;
    const old = parts(was), now = parts(s);
    for (const [key, p] of now) { const o = old.get(key); if (!o || stable(o.value) !== stable(p.value)) out.push({ sceneId: s.id, scene: s.name, key, label: p.label, ...(o ? { before: o.value } : {}), after: fp(p.value) }); }
    for (const [key, o] of old) if (!now.has(key)) out.push({ sceneId: s.id, scene: s.name, key, label: o.label, before: o.value, after: null });
  }
  return out;
}

/** Puts parts back as they were. A part changed again since is left alone and named in `kept`. */
export function undoTable(maps: Maps, changes: TablePart[]) {
  const kept: string[] = [];
  const scenes = maps.scenes.map(s => {
    const mine = changes.filter(c => c.sceneId === s.id);
    if (!mine.length) return s;
    const draft = structuredClone(s), now = parts(draft);
    for (const c of [...mine].reverse()) {
      const current = now.get(c.key);
      if ((current ? fp(current.value) : null) !== c.after) { kept.push(`${c.label} in ${c.scene}`); continue; }
      const [kind, id] = c.key.split(":");
      if (kind === "token" || kind === "effect") {
        const list = (kind === "token" ? draft.tokens : draft.effects) as { id: string }[];
        const at = list.findIndex(x => x.id === id);
        if (c.before === undefined) { if (at >= 0) list.splice(at, 1); }
        else if (at >= 0) list[at] = c.before as { id: string };
        else list.push(c.before as { id: string });
      } else if (c.before === undefined) delete (draft as Record<string, unknown>)[kind];
      else (draft as Record<string, unknown>)[kind] = c.before;
    }
    return draft;
  });
  return { next: { ...maps, scenes }, kept: [...new Set(kept)] };
}

/** An AI change may only touch the scenes of its own Maptable campaign, and nothing else in the workspace. */
export function checkTableScope(before: Maps, after: Maps, sceneIds: string[]) {
  const allowed = new Set(sceneIds);
  const { scenes: a, ...restBefore } = before, { scenes: b, ...restAfter } = after;
  if (stable(restBefore) !== stable(restAfter)) throw Error("A change tried to edit Maptable settings.");
  if (stable(a.map(s => s.id)) !== stable(b.map(s => s.id))) throw Error("A change tried to add or remove scenes.");
  for (const s of b) if (!allowed.has(s.id) && stable(s) !== stable(a.find(x => x.id === s.id))) throw Error(`A change reached outside this campaign (${s.name}).`);
}
