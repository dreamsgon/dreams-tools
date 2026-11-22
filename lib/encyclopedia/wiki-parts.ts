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
export const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Which part a page is kept in: its campaign's, else its world's shared lore. */
export function partOf(e: Entry, campaigns: ReadonlySet<string>, worlds: ReadonlySet<string>): PartKey {
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
  return sizesProblem(partSizes(w), limit, total);
}
/** sizeProblem from the sizes of every part, for a save that knows them without having every page. */
export function sizesProblem(sizes: PartSize[], limit = DEFAULT_PART_LIMIT, total = DEFAULT_TOTAL_LIMIT): string | null {
  const sum = sizes.reduce((n, s) => n + s.bytes, 0), big = sizes.find(s => s.bytes > limit), many = sizes.find(s => s.pages > PAGE_LIMIT);
  const named = (s: PartSize) => s.kind === 'campaign' ? `The campaign “${s.name}”` : s.name;
  if (many) return `${named(many)} has ${many.pages.toLocaleString('en-US')} pages, over the ${PAGE_LIMIT.toLocaleString('en-US')} pages one campaign can hold. Move some pages out, or into another campaign.`;
  if (big) return `${named(big)} is ${formatMb(big.bytes)}, over the ${formatMb(limit)} limit for one campaign. Raise the limit in Wiki settings, Storage, or move some pages out.`;
  if (sum > total) return `Your whole Wiki would be ${formatMb(sum)}, over the ${formatMb(total)} limit for all campaigns together. Raise it in Wiki settings, Storage, or archive a campaign you've finished.`;
  return null;
}

/* ---- Loading one campaign at a time ---- */

/** The worlds and campaigns themselves, without their pages: kept in the index so the Wiki can open one campaign without reading the rest. */
export type WikiMeta = { worlds: World[]; campaigns: Campaign[] };
/** Where the Wiki opens: a campaign, or a world's own lore. */
export type ScopePlace = { campaignId?: string | null; worldId?: string | null; /** A Maptable campaign: the Wiki campaign paired with it. */ maptableId?: string | null };
/**
 * The parts a place needs: the campaign's, its world's lore and the lore of worlds linked to it (a world's own view:
 * just that world's lore), and every template world, which new campaigns and pages can start from.
 */
export function scopeKeys(meta: WikiMeta, place: ScopePlace): PartKey[] {
  const keys: PartKey[] = [], add = (k: PartKey) => { if (!keys.includes(k)) keys.push(k); };
  const campaign = (place.campaignId ? meta.campaigns.find(c => c.id === place.campaignId) : undefined) ?? (place.maptableId ? meta.campaigns.find(c => c.maptableCampaignId === place.maptableId) : undefined);
  const world = campaign ? meta.worlds.find(w => w.id === campaign.worldId) : meta.worlds.find(w => w.id === place.worldId)
    ?? meta.worlds.find(w => !w.archived && !w.isTemplate) ?? meta.worlds.find(w => !w.isTemplate);
  if (campaign) { add(campaignKey(campaign.id)); add(worldKey(campaign.worldId)); for (const id of campaign.linkedWorldIds ?? []) if (meta.worlds.some(w => w.id === id)) add(worldKey(id)); }
  else if (world) add(worldKey(world.id));
  for (const w of meta.worlds) if (w.isTemplate) add(worldKey(w.id));
  return keys;
}
/** The Wiki with every world and campaign but only the pages of `keys`, in their usual order. */
export function scopedWorkspace(layout: Layout, meta: WikiMeta, parts: ReadonlyMap<PartKey, Part>, keys: PartKey[]): Workspace {
  const want = new Set(keys), used = new Map<PartKey, number>(), entries: Entry[] = [];
  for (const [key, count] of layout.runs) {
    if (!want.has(key)) continue;
    const part = parts.get(key), from = used.get(key) ?? 0;
    if (!part || from + count > part.entries.length) throw new DamagedWikiError("Your Wiki's storage does not add up (pages are missing). Nothing was changed.");
    entries.push(...part.entries.slice(from, from + count));
    used.set(key, from + count);
  }
  const worlds = new Map(meta.worlds.map(w => [w.id, w])), campaigns = new Map(meta.campaigns.map(c => [c.id, c]));
  return { schemaVersion: 1, worlds: layout.worlds.flatMap(id => worlds.get(id) ?? []), campaigns: layout.campaigns.flatMap(id => campaigns.get(id) ?? []), entries };
}
/**
 * A save from a Wiki that opened only `scope` (scopedWorkspace). Parts in the scope are taken as sent. Outside it the
 * browser has the world or campaign but not its pages: a changed one keeps its stored pages, and one it removed goes
 * with its pages (deleting a campaign or world). Pages outside the scope can't be sent.
 */
export function applyScopedPatch(current: ReadonlyMap<PartKey, Part>, layout: Layout, patch: WikiPatch, scope: PartKey[]): Workspace {
  if (!patch || typeof patch !== 'object' || !patch.layout || !Array.isArray(patch.layout.runs) || !patch.parts || typeof patch.parts !== 'object' || !Array.isArray(scope)) throw new DamagedWikiError('That save is not in a form this Wiki understands. Reload and try again.');
  // A part not stored yet (a campaign made in this tab) has no pages to lose, so it counts as opened.
  const inScope = new Set([...scope, ...Object.keys(patch.parts).filter(key => !current.has(key))]), parts = new Map(current);
  for (const [key, part] of Object.entries(patch.parts)) {
    if (part === null) { parts.delete(key); continue; }
    if (inScope.has(key)) { parts.set(key, part); continue; }
    if (part.entries?.length) throw new DamagedWikiError('That save has pages from a campaign this tab has not opened. Reload and try again.');
    parts.set(key, { ...(part.world ? { world: part.world } : {}), ...(part.campaign ? { campaign: part.campaign } : {}), entries: current.get(key)?.entries ?? [] });
  }
  if (patch.layout.runs.some(([key]) => !inScope.has(key))) throw new DamagedWikiError('That save has pages from a campaign this tab has not opened. Reload and try again.');
  // Pages outside the scope keep their place; the scope's pages follow in the order the browser has them.
  const runs: [PartKey, number][] = [...layout.runs.filter(([key]) => !inScope.has(key) && parts.has(key)), ...patch.layout.runs];
  return joinWorkspace({ worlds: patch.layout.worlds, campaigns: patch.layout.campaigns, runs }, parts);
}
