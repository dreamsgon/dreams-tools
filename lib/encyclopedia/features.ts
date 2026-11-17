import { z } from "zod";
import { rollSchema } from "./items.ts";

/*
 * Features: a character's class features, feats, racial traits and the like, on their own Features tab. Each has a name,
 * a group (Class, Species, Feat…), a description, optional uses with when they come back, and rolls. Everything is pure.
 */

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const text = (max: number) => z.string().trim().max(max);
export const MAX_FEATURES = 200;
/** Groups offered for a new feature; any group works. */
export const featureGroups = ["Class", "Species", "Background", "Feat", "Item", "Other"];

export const featureSchema = z.object({
  id, name: z.string().trim().min(1).max(80),
  group: text(40).optional(),
  /** A short line under the name, like "Level 3" or "Bonus action". */
  note: text(120).optional(),
  text: text(4000).optional(),
  /** Uses left and the most there can be, and when they come back (Short rest, Long rest, Dawn…). */
  uses: z.object({ value: z.number().int().min(0).max(1000), max: z.number().int().min(1).max(1000), reset: text(30).optional() }).refine(u => u.value <= u.max, "Uses can’t be above their maximum").optional(),
  rolls: z.array(rollSchema).max(8).optional(),
  /** Hidden from players, even the character's own player. */
  gm: z.boolean().optional(),
});
export type Feature = z.infer<typeof featureSchema>;
export const featuresSchema = z.array(featureSchema).max(MAX_FEATURES).refine(l => new Set(l.map(f => f.id)).size === l.length, "Feature ids must be unique");

export type PlayerFeature = Omit<Feature, "gm">;
/** The features players may see: not GM only, without the flag. */
export const playerFeatures = (list: Feature[] | undefined): PlayerFeature[] => (list ?? []).filter(f => !f.gm).map(({ gm: _g, ...rest }) => { void _g; return rest; });

/** The features in their groups, each group where its first feature is. */
export function featureGroupsOf<T extends { group?: string }>(list: readonly T[]): { name: string; features: T[] }[] {
  const out: { name: string; features: T[] }[] = [];
  for (const f of list) { const name = f.group?.trim() ?? ""; const g = out.find(x => x.name === name); if (g) g.features.push(f); else out.push({ name, features: [f] }); }
  return out;
}

/** Spends or gives back uses, kept between 0 and the maximum. */
export function setUses(list: Feature[], featureId: string, value: number): Feature[] {
  return list.map(f => f.id === featureId && f.uses ? { ...f, uses: { ...f.uses, value: Math.max(0, Math.min(f.uses.max, Math.round(value))) } } : f);
}

/** Every feature with uses that come back on this reset (case-insensitive), back to full. */
export const resetUses = (list: Feature[], reset: string): Feature[] => list.map(f => f.uses && f.uses.reset?.trim().toLowerCase() === reset.trim().toLowerCase() ? { ...f, uses: { ...f.uses, value: f.uses.max } } : f);

/** Moves a feature one place up (-1) or down (1). */
export function moveFeature(list: Feature[], featureId: string, dir: -1 | 1): Feature[] {
  const out = [...list], at = out.findIndex(f => f.id === featureId), to = at + dir;
  if (at < 0 || to < 0 || to >= out.length) return out;
  [out[at], out[to]] = [out[to], out[at]];
  return out;
}
