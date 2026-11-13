/*
 * Joins the GM's unsaved Maptable edits with a save made somewhere else since (an AI running combat,
 * another device). Scenes are joined token by token and effect by effect, and the rest of each scene
 * and of the workspace field by field. Whoever changed a thing wins; when both changed the same thing,
 * the GM's version is kept and named in `both`.
 */
import { workspaceSchema, type Scene, type Workspace } from "./model.ts";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function pick<T>(was: T | undefined, mine: T | undefined, theirs: T | undefined, clash: () => void): T | undefined {
  if (same(mine, was)) return theirs;
  if (same(theirs, was) || same(mine, theirs)) return mine;
  clash();
  return mine;
}
function joinById<T extends { id: string }>(base: T[], mine: T[], theirs: T[], both: string[], name: (t: T) => string): T[] {
  const b = new Map(base.map(x => [x.id, x])), m = new Map(mine.map(x => [x.id, x])), t = new Map(theirs.map(x => [x.id, x]));
  const out: T[] = [], seen = new Set<string>();
  // Keep the GM's order (which also sets drawing layers), then add what only the other side has.
  for (const x of [...mine, ...theirs]) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    const v = pick(b.get(x.id), m.get(x.id), t.get(x.id), () => both.push(name(m.get(x.id) ?? t.get(x.id)!)));
    if (v) out.push(v);
  }
  return out;
}
function joinScene(base: Scene | undefined, mine: Scene, theirs: Scene, both: string[]): Scene {
  if (!base) return mine;
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const k = key as keyof Scene;
    if (k === "tokens") out.tokens = joinById(base.tokens, mine.tokens, theirs.tokens, both, t => t.name);
    else if (k === "effects") out.effects = joinById(base.effects, mine.effects, theirs.effects, both, e => e.label || "an effect");
    else {
      const v = pick(base[k], mine[k], theirs[k], () => both.push(`${mine.name}: ${k === "fog" ? "fog" : k === "initiativeState" ? "combat order" : k}`));
      if (v !== undefined) out[k] = v;
    }
  }
  return out as Scene;
}

export function mergeMaptable(base: Workspace, mine: Workspace, theirs: Workspace): { merged: Workspace; both: string[] } | null {
  const both: string[] = [], out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const k = key as keyof Workspace;
    if (k === "scenes") continue;
    const v = pick(base[k], mine[k], theirs[k], () => both.push(String(k)));
    if (v !== undefined) out[k] = v;
  }
  const b = new Map(base.scenes.map(s => [s.id, s])), m = new Map(mine.scenes.map(s => [s.id, s])), t = new Map(theirs.scenes.map(s => [s.id, s]));
  const scenes: Scene[] = [], seen = new Set<string>();
  for (const s of [...mine.scenes, ...theirs.scenes]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const was = b.get(s.id), my = m.get(s.id), their = t.get(s.id);
    if (my && their) scenes.push(same(my, was) ? their : same(their, was) ? my : joinScene(was, my, their, both));
    else { const v = pick(was, my, their, () => both.push((my ?? their)!.name)); if (v) scenes.push(v); }
  }
  out.scenes = scenes;
  const checked = workspaceSchema.safeParse(out);
  return checked.success ? { merged: checked.data, both } : null;
}
