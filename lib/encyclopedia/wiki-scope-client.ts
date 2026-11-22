/**
 * The Wiki app opening one campaign at a time (EncyclopediaStore.readScoped): the address it asks, where it opens, and
 * joining more parts into what it has. Pure, so it is tested without a browser.
 */
import { wikiPatch, type PartKey } from './wiki-parts.ts';
import type { Workspace } from './world-model.ts';

const WORKSPACE = '/api/encyclopedia/workspace';
/** The scoped load: a place (campaign, world, page, Maptable campaign) or exact parts. */
export function scopedUrl(place: { campaign?: string | null; world?: string | null; entry?: string | null; maptable?: string | null; parts?: PartKey[] }) {
  const q = new URLSearchParams({ scope: '1' });
  for (const name of ['campaign', 'world', 'entry', 'maptable'] as const) { const v = place[name]; if (v) q.set(name, v); }
  if (place.parts) q.set('parts', place.parts.join(','));
  return `${WORKSPACE}?${q}`;
}
/** Where the Wiki opens: the address when it names a place, else the place remembered from last time. */
export function scopeHint(query: URLSearchParams, remembered: string | null) {
  const from = (q: URLSearchParams) => ({ campaign: q.get('campaign'), world: q.get('world'), entry: q.get('entry'), maptable: q.get('maptable') });
  const asked = from(query);
  if (asked.campaign || asked.world || asked.entry || asked.maptable) return asked;
  return from(new URLSearchParams(remembered ?? ''));
}
/** `w` with the pages of `more` it doesn't have yet. */
export function addPages(w: Workspace, more: Workspace): Workspace {
  const have = new Set(w.entries.map(e => e.id)), add = more.entries.filter(e => !have.has(e.id));
  return add.length ? { ...w, entries: [...w.entries, ...add] } : w;
}
/** Stored parts a save would put pages into without this tab having opened them: those must be opened first. */
export function outsideScope(before: Workspace, after: Workspace, opened: PartKey[], known: ReadonlySet<PartKey>): PartKey[] {
  const patch = wikiPatch(before, after), open = new Set(opened);
  return Object.entries(patch.parts).filter(([key, part]) => part && part.entries.length && !open.has(key) && known.has(key)).map(([key]) => key);
}
/** How many pages a campaign has: counted when its pages are open here, else as the server last said. */
export function pagesIn(w: Workspace, campaignId: string, counts: ReadonlyMap<PartKey, number> | null) {
  const loaded = w.entries.filter(e => e.campaignId === campaignId && e.kind !== 'folder').length;
  return loaded || !counts ? loaded : counts.get(`c:${campaignId}`) ?? 0;
}

