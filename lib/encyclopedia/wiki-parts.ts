/**
 * How the Wiki is stored: each campaign and each world in its own part, so the size limit applies to one campaign
 * (or one world's shared lore) at a time instead of the whole account.
 *
 * A part holds a campaign (or world) and its pages, in the order they had in the workspace. The layout says the
 * order of worlds, campaigns and pages, so joining the parts gives back exactly the workspace that was split.
 * Shared by the server (store.ts) and the browser (it sends only the parts that changed).
 */
import type { Campaign, Entry, World, Workspace } from './world-model.ts';

/** A part's key: `c:<campaign id>`, `w:<world id>`, or `o` for pages whose world is missing (never valid, kept so nothing is lost). */
export type PartKey = string;
export type Part = { world?: World; campaign?: Campaign; entries: Entry[] };
export type Layout = { worlds: string[]; campaigns: string[]; runs: [PartKey, number][] };
export type Split = { layout: Layout; parts: Map<PartKey, Part> };
/** The changes a save sends: the new layout and the parts that changed (null: the part is gone). */
export type WikiPatch = { layout: Layout; parts: Record<PartKey, Part | null> };

export const MB = 1_000_000;
/** The limit for one campaign or one world's shared lore unless the owner raised it. */
export const DEFAULT_PART_LIMIT = 2 * MB;
/** What the owner can choose in Wiki settings, Storage. */
export const PART_LIMITS = [2 * MB, 5 * MB, 10 * MB, 20 * MB] as const;
/** The whole Wiki, all campaigns together: a safety cap on what one load or save moves. */
export const TOTAL_LIMIT = 60 * MB;
export const partLimitOk = (n: unknown): n is number => typeof n === 'number' && (PART_LIMITS as readonly number[]).includes(n);

export const worldKey = (id: string) => `w:${id}`;
export const campaignKey = (id: string) => `c:${id}`;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Which part a page is kept in: its campaign's, else its world's shared lore. */
function partOf(e: Entry, campaigns: Set<string>, worlds: Set<string>): PartKey {
  if (e.campaignId && campaigns.has(e.campaignId)) return campaignKey(e.campaignId);
  return worlds.has(e.worldId) ? worldKey(e.worldId) : 'o';
}

export function splitWorkspace(w: Workspace): Split {
  const parts = new Map<PartKey, Part>();
  for (const world of w.worlds) parts.set(worldKey(world.id), { world, entries: [] });
  for (const campaign of w.campaigns) parts.set(campaignKey(campaign.id), { campaign, entries: [] });
  const campaigns = new Set(w.campaigns.map(c => c.id)), worlds = new Set(w.worlds.map(x => x.id)), runs: [PartKey, number][] = [];
  for (const e of w.entries) {
    const key = partOf(e, campaigns, worlds);
    if (!parts.has(key)) parts.set(key, { entries: [] });
    parts.get(key)!.entries.push(e);
    const last = runs[runs.length - 1];
    if (last && last[0] === key) last[1]++; else runs.push([key, 1]);
  }
  return { layout: { worlds: w.worlds.map(x => x.id), campaigns: w.campaigns.map(c => c.id), runs }, parts };
}

export class DamagedWikiError extends Error {}
/** The workspace a layout and its parts make. Throws when they don't fit together, so a damaged store is never saved over. */
export function joinWorkspace(layout: Layout, parts: ReadonlyMap<PartKey, Part>): Workspace {
  const damaged = (why: string) => new DamagedWikiError(`Your Wiki's storage does not add up (${why}). Nothing was changed.`);
  const worlds = layout.worlds.map(id => { const w = parts.get(worldKey(id))?.world; if (!w || w.id !== id) throw damaged('a world is missing'); return w; });
  const campaigns = layout.campaigns.map(id => { const c = parts.get(campaignKey(id))?.campaign; if (!c || c.id !== id) throw damaged('a campaign is missing'); return c; });
  const used = new Map<PartKey, number>(), entries: Entry[] = [];
  for (const [key, count] of layout.runs) {
    const part = parts.get(key), from = used.get(key) ?? 0;
    if (!part || !Number.isSafeInteger(count) || count < 1 || from + count > part.entries.length) throw damaged('pages are missing');
    for (let i = from; i < from + count; i++) entries.push(part.entries[i]);
    used.set(key, from + count);
  }
  for (const [key, part] of parts) if ((used.get(key) ?? 0) !== part.entries.length) throw damaged('pages are out of place');
  return { schemaVersion: 1, worlds, campaigns, entries };
}

/** What a save sends: only the parts that differ from the copy it was made against. */
export function wikiPatch(before: Workspace, after: Workspace): WikiPatch {
  const a = splitWorkspace(before), b = splitWorkspace(after), parts: Record<PartKey, Part | null> = {};
  for (const [key, part] of b.parts) { const old = a.parts.get(key); if (!old || JSON.stringify(old) !== JSON.stringify(part)) parts[key] = part; }
  for (const key of a.parts.keys()) if (!b.parts.has(key)) parts[key] = null;
  return { layout: b.layout, parts };
}
/** A patch taken onto the parts it was made against. */
export function applyWikiPatch(current: ReadonlyMap<PartKey, Part>, patch: WikiPatch): Workspace {
  if (!patch || typeof patch !== 'object' || !patch.layout || !patch.parts || typeof patch.parts !== 'object') throw new DamagedWikiError('That save is not in a form this Wiki understands. Reload and try again.');
  const parts = new Map(current);
  for (const [key, part] of Object.entries(patch.parts)) { if (part === null) parts.delete(key); else parts.set(key, part); }
  return joinWorkspace(patch.layout, parts);
}

export type PartSize = { key: PartKey; name: string; kind: 'campaign' | 'world' | 'other'; bytes: number };
/** How big each campaign and each world's shared lore is, biggest first. */
export function partSizes(w: Workspace): PartSize[] {
  const { parts } = splitWorkspace(w);
  return [...parts].map(([key, part]) => ({ key, bytes: bytes(part), kind: part.campaign ? 'campaign' as const : part.world ? 'world' as const : 'other' as const,
    name: part.campaign?.name ?? (part.world ? `${part.world.name} (shared lore)` : 'Pages outside any world') })).sort((x, y) => y.bytes - x.bytes);
}
export const formatMb = (n: number) => `${(n / MB).toFixed(n < 10 * MB ? 1 : 0).replace(/\.0$/, '')} MB`;
/** Why this workspace can't be saved under `limit` per part, or null when it can. */
export function sizeProblem(w: Workspace, limit = DEFAULT_PART_LIMIT): string | null {
  const sizes = partSizes(w), total = sizes.reduce((n, s) => n + s.bytes, 0), big = sizes.find(s => s.bytes > limit);
  if (big) return `${big.kind === 'campaign' ? `The campaign “${big.name}”` : big.name} is ${formatMb(big.bytes)}, over the ${formatMb(limit)} limit for one campaign. Raise the limit in Wiki settings, Storage, or move some pages out.`;
  if (total > TOTAL_LIMIT) return `Your whole Wiki would be ${formatMb(total)}, over the ${formatMb(TOTAL_LIMIT)} limit for all campaigns together.`;
  return null;
}
