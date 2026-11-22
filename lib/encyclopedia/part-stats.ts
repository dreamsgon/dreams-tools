/**
 * A few numbers about each campaign (and each world's shared lore), kept in the Wiki index beside its part, so the
 * Campaigns page, a campaign switcher and the home page can list every campaign without reading every page.
 * Written whenever a part is saved (store.ts commit), and carried over unchanged for parts a save didn't touch.
 */
import type { Entry } from './world-model.ts';

/** A recently changed page, without the names of its campaign and world (those are looked up when listed, so a rename shows at once). */
export type LatestPage = { id: string; title: string; kind: string; campaignId: string | null; worldId: string; path: string; updatedAt: string };
export type PartStats = { pages: number; characters: number; maps: number; lastEdited: string | null; latest: LatestPage[] };
/** How many recent pages each part keeps: at least the most any list shows (the home page's Recent shows 10). */
export const LATEST_KEPT = 12;

/** The folders a page sits in, outermost first, as "Places › The Fens", from the pages of its own part. */
function pathOf(e: Entry, byId: ReadonlyMap<string, Entry>) {
  const names: string[] = [], seen = new Set<string>();
  for (let parent = e.parentId; parent && !seen.has(parent);) {
    seen.add(parent);
    const folder = byId.get(parent);
    if (!folder) break;
    names.unshift(folder.title);
    parent = folder.parentId;
  }
  return names.join(' › ');
}

export function partStats(entries: readonly Entry[]): PartStats {
  const pages = entries.filter(e => e.kind !== 'folder'), byId = new Map(entries.map(e => [e.id, e]));
  const newest = [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    pages: pages.length,
    characters: pages.filter(e => e.kind === 'character').length,
    maps: pages.filter(e => e.kind === 'map').length,
    lastEdited: newest[0]?.updatedAt ?? null,
    latest: newest.slice(0, LATEST_KEPT).map(e => ({ id: e.id, title: e.title, kind: e.kind, campaignId: e.campaignId, worldId: e.worldId, path: pathOf(e, byId), updatedAt: e.updatedAt })),
  };
}

/** True when `x` looks like stats this code wrote (an older index has none). */
export function isPartStats(x: unknown): x is PartStats {
  const s = x as PartStats;
  return !!s && typeof s === 'object' && Number.isSafeInteger(s.pages) && Number.isSafeInteger(s.characters) && Number.isSafeInteger(s.maps) && Array.isArray(s.latest);
}
