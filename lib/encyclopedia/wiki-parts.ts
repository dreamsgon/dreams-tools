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
/** Pages in one campaign, or in one world's shared lore. The whole Wiki can hold many such campaigns. */
export const PAGE_LIMIT = 5000;
/** The whole Wiki, all campaigns together: every live campaign is loaded at once, so this keeps loads and saves quick. Archived campaigns don't count. */
export const DEFAULT_TOTAL_LIMIT = 60 * MB;
/** What the owner can choose for the whole Wiki in Wiki settings, Storage. */
export const TOTAL_LIMITS = [60 * MB, 100 * MB, 150 * MB] as const;
/** The biggest the whole Wiki can be under any setting. */
export const TOTAL_LIMIT = TOTAL_LIMITS[TOTAL_LIMITS.length - 1];
export const partLimitOk = (n: unknown): n is number => typeof n === 'number' && (PART_LIMITS as readonly number[]).includes(n);
export const totalLimitOk = (n: unknown): n is number => typeof n === 'number' && (TOTAL_LIMITS as readonly number[]).includes(n);

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

/** True when two parts hold the very same objects: an edit always makes new objects for what it changes, so they can't differ. */
const sameObjects = (a: Part, b: Part) => a.world === b.world && a.campaign === b.campaign && a.entries.length === b.entries.length && a.entries.every((e, i) => e === b.entries[i]);
/** What a save sends: only the parts that differ from the copy it was made against. */
export function wikiPatch(before: Workspace, after: Workspace): WikiPatch {
  const a = splitWorkspace(before), b = splitWorkspace(after), parts: Record<PartKey, Part | null> = {};
  // Only parts holding a changed object are written out to compare, so a big Wiki doesn't turn every save into a full copy.
  for (const [key, part] of b.parts) { const old = a.parts.get(key); if (!old || (!sameObjects(old, part) && JSON.stringify(old) !== JSON.stringify(part))) parts[key] = part; }
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

export type PartSize = { key: PartKey; name: string; kind: 'campaign' | 'world' | 'other'; bytes: number; pages: number };
/** How big each campaign and each world's shared lore is, biggest first. */
export function partSizes(w: Workspace): PartSize[] {
  const { parts } = splitWorkspace(w);
  return [...parts].map(([key, part]) => ({ key, bytes: bytes(part), pages: part.entries.length, kind: part.campaign ? 'campaign' as const : part.world ? 'world' as const : 'other' as const,
    name: part.campaign?.name ?? (part.world ? `${part.world.name} (shared lore)` : 'Pages outside any world') })).sort((x, y) => y.bytes - x.bytes);
}
export const formatMb = (n: number) => `${(n / MB).toFixed(n < 10 * MB ? 1 : 0).replace(/\.0$/, '')} MB`;
/** Why this workspace can't be saved under `limit` per part and `total` for the whole Wiki, or null when it can. */
export function sizeProblem(w: Workspace, limit = DEFAULT_PART_LIMIT, total = DEFAULT_TOTAL_LIMIT): string | null {
  const sizes = partSizes(w), sum = sizes.reduce((n, s) => n + s.bytes, 0), big = sizes.find(s => s.bytes > limit), many = sizes.find(s => s.pages > PAGE_LIMIT);
  const named = (s: PartSize) => s.kind === 'campaign' ? `The campaign “${s.name}”` : s.name;
  if (many) return `${named(many)} has ${many.pages.toLocaleString('en-US')} pages, over the ${PAGE_LIMIT.toLocaleString('en-US')} pages one campaign can hold. Move some pages out, or into another campaign.`;
  if (big) return `${named(big)} is ${formatMb(big.bytes)}, over the ${formatMb(limit)} limit for one campaign. Raise the limit in Wiki settings, Storage, or move some pages out.`;
  if (sum > total) return `Your whole Wiki would be ${formatMb(sum)}, over the ${formatMb(total)} limit for all campaigns together. Raise it in Wiki settings, Storage, or archive a campaign you've finished.`;
  return null;
}
