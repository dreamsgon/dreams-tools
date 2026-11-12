import type { Workspace as MapWorkspace } from "./model";
import type { Workspace as BookWorkspace } from "./encyclopedia/world-model";
import { scenesInOrder } from "./scene-order.ts";

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
  lastEdited: string | null };
export type CampaignRow = { key: string; name: string; maptable: MapCampaign | null; encyclopedia: BookCampaign | null };
/** A recently changed Encyclopedia page, for the home page. */
export type RecentPage = { id: string; title: string; kind: string; campaignName: string | null; worldName: string; updatedAt: string };
export type CampaignSummary = {
  rows: CampaignRow[];
  /** The most recently changed Encyclopedia pages, newest first. */
  recent: RecentPage[];
  worlds: { id: string; name: string; archived: boolean }[];
  /** Scenes that are not inside any Maptable campaign. */
  loose: number;
};

const mapCampaigns = (w: Pick<MapWorkspace, "collections" | "scenes"> | null): MapCampaign[] =>
  (w?.collections ?? []).filter(c => c.kind === "campaign").map(c => ({ id: c.id, name: c.name, scenes: scenesInOrder(w!, c.id).length }));

function bookCampaigns(s: BookWorkspace): BookCampaign[] {
  const worlds = new Map(s.worlds.map(w => [w.id, w]));
  return s.campaigns.filter(c => !worlds.get(c.worldId)?.isTemplate).map(c => {
    const own = s.entries.filter(e => e.campaignId === c.id && e.kind !== "folder");
    return {
      id: c.id, name: c.name, description: c.description, worldId: c.worldId,
      worldName: worlds.get(c.worldId)?.name ?? "", archived: worlds.get(c.worldId)?.archived ?? false,
      pages: own.length, characters: own.filter(e => e.kind === "character").length,
      maptableCampaignId: c.maptableCampaignId ?? null,
      lastEdited: own.reduce<string | null>((latest, e) => !latest || e.updatedAt > latest ? e.updatedAt : latest, null),
    };
  });
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

export function campaignSummary(map: Pick<MapWorkspace, "collections" | "scenes"> | null, book: BookWorkspace): CampaignSummary {
  const maps = mapCampaigns(map), books = bookCampaigns(book);
  const mapById = new Map(maps.map(m => [m.id, m])), used = new Set<string>();
  const rows: CampaignRow[] = books.map(b => {
    const paired = b.maptableCampaignId ? mapById.get(b.maptableCampaignId) ?? null : null;
    if (paired) used.add(paired.id);
    return { key: `e:${b.id}`, name: b.name, maptable: paired, encyclopedia: b };
  });
  for (const m of maps) if (!used.has(m.id)) rows.push({ key: `m:${m.id}`, name: m.name, maptable: m, encyclopedia: null });
  const inCampaign = new Set(maps.flatMap(m => scenesInOrder(map!, m.id).map(item => item.scene.id)));
  return {
    rows: rows.sort(byName),
    worlds: book.worlds.filter(w => !w.isTemplate).map(w => ({ id: w.id, name: w.name, archived: w.archived })),
    loose: (map?.scenes ?? []).filter(s => !inCampaign.has(s.id)).length,
    recent: recentPages(book),
  };
}

function recentPages(s: BookWorkspace, limit = 5): RecentPage[] {
  const worlds = new Map(s.worlds.map(w => [w.id, w])), campaigns = new Map(s.campaigns.map(c => [c.id, c.name]));
  return s.entries
    .filter(e => e.kind !== "folder" && !worlds.get(e.worldId)?.isTemplate && !worlds.get(e.worldId)?.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map(e => ({ id: e.id, title: e.title, kind: e.kind, campaignName: e.campaignId ? campaigns.get(e.campaignId) ?? null : null, worldName: worlds.get(e.worldId)?.name ?? "", updatedAt: e.updatedAt }));
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

export const cleanName = (name: unknown) => {
  if (typeof name !== "string" || !name.trim()) throw new Error("Give the campaign a name.");
  return name.trim().replace(/\s+/g, " ").slice(0, 120);
};
