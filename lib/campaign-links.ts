import type { Workspace as MapWorkspace } from "./model";
import type { Workspace as BookWorkspace } from "./encyclopedia/world-model";
import { scenesInOrder } from "./scene-order.ts";
import { sortSiblings } from "./folder-order.ts";

/**
 * One campaign list across Maptable and the Encyclopedia.
 *
 * The two tools keep their own saved data. The only link between them is the
 * optional `maptableCampaignId` on an Encyclopedia campaign. Nothing is moved or
 * copied, and removing the link leaves both campaigns exactly as they were.
 */

export type MapCampaign = { id: string; name: string; scenes: number };
export type BookCampaign = { id: string; name: string; description: string; worldId: string; worldName: string; archived: boolean; pages: number; characters: number; maptableCampaignId: string | null;
  /** When a page in this campaign last changed, or null when it has none. */
  lastEdited: string | null;
  /** How many of its pages are maps. */
  maps: number;
  /** Its most recently changed pages, newest first (at most three). */
  latest: RecentPage[] };
export type CampaignRow = { key: string; name: string; maptable: MapCampaign | null; encyclopedia: BookCampaign | null;
  /** The campaign folder it sits in on the Campaigns page, or null at the top level. */
  folderId: string | null };
/** A folder on the Campaigns page. These are Maptable collections of kind "folder" whose ancestors are all folders, never scene folders inside a campaign. */
export type CampaignFolder = { id: string; name: string; parentId: string | null };
/** A recently changed Encyclopedia page, for the home page. */
export type RecentPage = { id: string; title: string; kind: string; campaignId: string | null; campaignName: string | null; worldName: string;
  /** The folders it sits in, outermost first, e.g. "Places › The Fens". Empty at the top level. */
  path: string; updatedAt: string };
export type CampaignSummary = {
  rows: CampaignRow[];
  /** Campaign folders, in no particular order. See `campaignLayout` for the display order. */
  folders: CampaignFolder[];
  /** The most recently changed Encyclopedia pages, newest first. */
  recent: RecentPage[];
  worlds: { id: string; name: string; archived: boolean }[];
  /** Scenes that are not inside any Maptable campaign. */
  loose: number;
};

/** Folders whose whole chain of parents is folders (no campaign above them). */
export function campaignFolders(collections: MapWorkspace["collections"] | undefined | null): CampaignFolder[] {
  const all = new Map((collections ?? []).map(c => [c.id, c]));
  const ok = (id: string): boolean => {
    const seen = new Set<string>();
    for (let c = all.get(id); c; c = c.parentId ? all.get(c.parentId) : undefined) {
      if (c.kind !== "folder" || seen.has(c.id)) return false;
      seen.add(c.id);
      if (!c.parentId) return true;
    }
    return false;
  };
  return (collections ?? []).filter(c => c.kind === "folder" && ok(c.id)).map(c => ({ id: c.id, name: c.name, parentId: c.parentId }));
}

const mapCampaigns = (w: Pick<MapWorkspace, "collections" | "scenes"> | null): MapCampaign[] =>
  (w?.collections ?? []).filter(c => c.kind === "campaign").map(c => ({ id: c.id, name: c.name, scenes: scenesInOrder(w!, c.id).length }));

function bookCampaigns(s: BookWorkspace): BookCampaign[] {
  const worlds = new Map(s.worlds.map(w => [w.id, w]));
  return s.campaigns.filter(c => !worlds.get(c.worldId)?.isTemplate).map(c => {
    const own = s.entries.filter(e => e.campaignId === c.id && e.kind !== "folder");
    const latest = newestFirst(own).slice(0, 3).map(e => recentPage(s, e));
    return {
      id: c.id, name: c.name, description: c.description, worldId: c.worldId,
      worldName: worlds.get(c.worldId)?.name ?? "", archived: worlds.get(c.worldId)?.archived ?? false,
      pages: own.length, characters: own.filter(e => e.kind === "character").length,
      maptableCampaignId: c.maptableCampaignId ?? null,
      lastEdited: own.reduce<string | null>((last, e) => !last || e.updatedAt > last ? e.updatedAt : last, null),
      maps: own.filter(e => e.kind === "map").length, latest,
    };
  });
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

export function campaignSummary(map: Pick<MapWorkspace, "collections" | "scenes" | "campaignFoldersOrdered"> | null, book: BookWorkspace): CampaignSummary {
  const maps = mapCampaigns(map), books = bookCampaigns(book);
  const mapById = new Map(maps.map(m => [m.id, m])), used = new Set<string>();
  // Folders list by name until someone re-orders them by hand; after that the saved order is kept.
  const found = campaignFolders(map?.collections), folders = map?.campaignFoldersOrdered ? found : sortSiblings(found, byName), folderIds = new Set(folders.map(f => f.id));
  const parentOf = new Map((map?.collections ?? []).map(c => [c.id, c.parentId]));
  const inFolder = (id: string | null | undefined) => id && folderIds.has(id) ? id : null;
  const bookFolders = new Map(book.campaigns.map(c => [c.id, c.folderId]));
  const rows: CampaignRow[] = books.map(b => {
    const paired = b.maptableCampaignId ? mapById.get(b.maptableCampaignId) ?? null : null;
    if (paired) used.add(paired.id);
    return { key: `e:${b.id}`, name: b.name, maptable: paired, encyclopedia: b, folderId: inFolder(paired ? parentOf.get(paired.id) : bookFolders.get(b.id)) };
  });
  for (const m of maps) if (!used.has(m.id)) rows.push({ key: `m:${m.id}`, name: m.name, maptable: m, encyclopedia: null, folderId: inFolder(parentOf.get(m.id)) });
  const inCampaign = new Set(maps.flatMap(m => scenesInOrder(map!, m.id).map(item => item.scene.id)));
  return {
    rows: rows.sort(byName), folders,
    worlds: book.worlds.filter(w => !w.isTemplate).map(w => ({ id: w.id, name: w.name, archived: w.archived })),
    loose: (map?.scenes ?? []).filter(s => !inCampaign.has(s.id)).length,
    recent: recentPages(book),
  };
}

export type LayoutItem =
  | { type: "folder"; folder: CampaignFolder; depth: number; count: number; open: boolean }
  | { type: "row"; row: CampaignRow; depth: number };

/**
 * The Campaigns table in display order, like Maptable's organizer: inside each level
 * folders come first (in their saved order), then campaigns by name. `rows` are the campaigns to show
 * (after any filters). Folders that are in `collapsed` hide their contents unless
 * `filtered` is set, which shows only folders holding a match, all expanded.
 */
export function campaignLayout(folders: CampaignFolder[], rows: CampaignRow[], collapsed: ReadonlySet<string> = new Set(), filtered = false): LayoutItem[] {
  const ids = new Set(folders.map(f => f.id));
  const subs = new Map<string | null, CampaignFolder[]>(), inside = new Map<string | null, CampaignRow[]>();
  for (const f of folders) { const k = f.parentId && ids.has(f.parentId) ? f.parentId : null; subs.set(k, [...(subs.get(k) ?? []), f]); }
  for (const r of rows) { const k = r.folderId && ids.has(r.folderId) ? r.folderId : null; inside.set(k, [...(inside.get(k) ?? []), r]); }
  const total = (id: string): number => (inside.get(id)?.length ?? 0) + (subs.get(id) ?? []).reduce((n, f) => n + total(f.id), 0);
  const out: LayoutItem[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of subs.get(parent) ?? []) { // folders keep their saved order (they can be re-ordered); campaigns are by name
      const count = total(f.id);
      if (filtered && !count) continue;
      const open = filtered || !collapsed.has(f.id);
      out.push({ type: "folder", folder: f, depth, count, open });
      if (open) walk(f.id, depth + 1);
    }
    for (const r of [...(inside.get(parent) ?? [])].sort(byName)) out.push({ type: "row", row: r, depth });
  };
  walk(null, 0);
  return out;
}

/** Every folder with its path (for example "Lantern Coast / Old games"), in display order, for pickers. */
export function folderChoices(folders: CampaignFolder[]): { id: string; path: string; depth: number }[] {
  const ids = new Set(folders.map(f => f.id)), out: { id: string; path: string; depth: number }[] = [];
  const walk = (parent: string | null, prefix: string, depth: number) => {
    for (const f of folders.filter(x => (x.parentId && ids.has(x.parentId) ? x.parentId : null) === parent).sort(byName)) {
      out.push({ id: f.id, path: prefix + f.name, depth });
      walk(f.id, `${prefix}${f.name} / `, depth + 1);
    }
  };
  walk(null, "", 0);
  return out;
}

type BookEntry = BookWorkspace["entries"][number];
const newestFirst = (entries: BookEntry[]) => [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

function recentPage(s: BookWorkspace, e: BookEntry): RecentPage {
  const names: string[] = [], seen = new Set<string>();
  for (let parent = e.parentId; parent && !seen.has(parent);) {
    seen.add(parent);
    const folder = s.entries.find(f => f.id === parent);
    if (!folder) break;
    names.unshift(folder.title);
    parent = folder.parentId;
  }
  return { id: e.id, title: e.title, kind: e.kind, campaignId: e.campaignId,
    campaignName: e.campaignId ? s.campaigns.find(c => c.id === e.campaignId)?.name ?? null : null,
    worldName: s.worlds.find(w => w.id === e.worldId)?.name ?? "", path: names.join(" › "), updatedAt: e.updatedAt };
}

function recentPages(s: BookWorkspace, limit = 6): RecentPage[] {
  const worlds = new Map(s.worlds.map(w => [w.id, w]));
  return newestFirst(s.entries.filter(e => e.kind !== "folder" && !worlds.get(e.worldId)?.isTemplate && !worlds.get(e.worldId)?.archived))
    .slice(0, limit).map(e => recentPage(s, e));
}

/** Campaigns for the home page: not archived, most recently edited first, then by name. */
export function homeCampaigns(summary: CampaignSummary): CampaignRow[] {
  const edited = (r: CampaignRow) => r.encyclopedia?.lastEdited ?? "";
  return summary.rows.filter(r => !r.encyclopedia?.archived).sort((a, b) => edited(b).localeCompare(edited(a)) || byName(a, b));
}

const plain = (name: string) => name.trim().toLocaleLowerCase().replace(/^the\s+/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Suggested pairs for unpaired campaigns with the same name, ignoring case, punctuation and a leading "The". */
export function suggestPairs(summary: CampaignSummary): { encyclopediaId: string; maptableId: string }[] {
  const maps = summary.rows.filter(r => r.maptable && !r.encyclopedia).map(r => r.maptable!);
  const taken = new Set<string>(), out: { encyclopediaId: string; maptableId: string }[] = [];
  for (const row of summary.rows) {
    if (!row.encyclopedia || row.maptable) continue;
    const match = maps.find(m => !taken.has(m.id) && plain(m.name) === plain(row.encyclopedia!.name));
    if (match) { taken.add(match.id); out.push({ encyclopediaId: row.encyclopedia.id, maptableId: match.id }); }
  }
  return out;
}

/**
 * Set or clear pairings. `maptableId: null` removes a pairing. A Maptable
 * campaign that is already paired elsewhere is moved to the new pairing.
 */
export function applyPairs(book: BookWorkspace, map: Pick<MapWorkspace, "collections"> | null, pairs: { encyclopediaId: string; maptableId: string | null }[]): BookWorkspace {
  const maps = new Set((map?.collections ?? []).filter(c => c.kind === "campaign").map(c => c.id));
  let campaigns = book.campaigns;
  for (const { encyclopediaId, maptableId } of pairs) {
    if (!campaigns.some(c => c.id === encyclopediaId)) throw new Error("That Encyclopedia campaign no longer exists. Reload the page.");
    if (maptableId !== null && !maps.has(maptableId)) throw new Error("That Maptable campaign no longer exists. Reload the page.");
    campaigns = campaigns.map(c => {
      if (c.id === encyclopediaId) return withPair(c, maptableId);
      if (maptableId !== null && c.maptableCampaignId === maptableId) return withPair(c, null);
      return c;
    });
  }
  return { ...book, campaigns };
}

function withPair<T extends { maptableCampaignId?: string }>(c: T, maptableId: string | null): T {
  const next = { ...c };
  delete next.maptableCampaignId;
  return maptableId ? { ...next, maptableCampaignId: maptableId } : next;
}

export const cleanName = (name: unknown, what = "campaign") => {
  if (typeof name !== "string" || !name.trim()) throw new Error(`Give the ${what} a name.`);
  return name.trim().replace(/\s+/g, " ").slice(0, 120);
};
