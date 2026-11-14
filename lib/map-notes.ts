/*
 * Map notes: a Maptable marker can carry read-aloud text and link Encyclopedia pages. These helpers turn the
 * GM's Encyclopedia (read-only, loaded in the browser) into the short page cards a note shows, and decide
 * what a player may see: only pages the paired Encyclopedia campaign already shares with players.
 */
import { plainExcerpt } from "./encyclopedia/inline.ts";
import { playerCampaign, visibleEntries, type Entry, type Workspace } from "./encyclopedia/world-model.ts";
import type { PointOfInterest } from "./model.ts";

export const MAX_NOTE_PAGES = 20;
export type NotePage = { id: string; title: string; kind: string; excerpt: string; group: PageGroup; picture?: Entry["picture"] };
export type PageGroup = "Places" | "Characters" | "Factions and lore" | "Quests" | "Notes";

const roleName = { pc: "Player character", companion: "Companion", npc: "NPC", creature: "Creature" } as const;
const kindName: Record<string, string> = { place: "Place", faction: "Organization", lore: "Lore", note: "Note", session: "Session", map: "Map", quest: "Quest" };
const groupOf = (kind: string): PageGroup | null =>
  kind === "place" || kind === "map" ? "Places" : kind === "character" ? "Characters" : kind === "faction" || kind === "lore" ? "Factions and lore"
    : kind === "quest" ? "Quests" : kind === "note" || kind === "session" ? "Notes" : null;
export const PAGE_GROUPS: PageGroup[] = ["Places", "Characters", "Factions and lore", "Quests", "Notes"];

/** The Encyclopedia campaign paired with a Maptable campaign, if any. */
export const pairedCampaign = (book: Workspace | null | undefined, maptableCampaignId: string | null) =>
  maptableCampaignId ? book?.campaigns?.find(c => c.maptableCampaignId === maptableCampaignId) ?? null : null;

export function kindLabel(e: Pick<Entry, "kind" | "character">) {
  if (e.kind === "character") return roleName[e.character?.role ?? "npc"] ?? "Character";
  return kindName[e.kind] ?? "Page";
}
function card(e: Entry, campaignName?: string): NotePage {
  const where = e.kind === "character" ? e.character?.faction || e.character?.location : "";
  return {
    id: e.id, title: e.title, group: groupOf(e.kind) ?? "Notes", picture: e.picture,
    kind: [kindLabel(e), where, campaignName].filter(Boolean).join(" · "),
    excerpt: plainExcerpt(e.body ?? "", 200),
  };
}

/**
 * Pages a GM can link from this Maptable campaign: the paired Encyclopedia campaign and its world's lore,
 * or every page outside templates when the campaign isn't paired. Folders and task lists are left out.
 */
export function linkablePages(book: Workspace | null | undefined, maptableCampaignId: string | null): NotePage[] {
  if (!book?.entries) return [];
  const paired = pairedCampaign(book, maptableCampaignId);
  const templates = new Set((book.worlds ?? []).filter(w => w.isTemplate).map(w => w.id));
  const names = new Map((book.campaigns ?? []).map(c => [c.id, c.name]));
  const entries = paired ? visibleEntries(book, paired.worldId, paired.id) : book.entries.filter(e => !templates.has(e.worldId));
  return entries.filter(e => groupOf(e.kind)).map(e => card(e, paired || !e.campaignId ? undefined : names.get(e.campaignId)))
    .sort((a, b) => PAGE_GROUPS.indexOf(a.group) - PAGE_GROUPS.indexOf(b.group) || a.title.localeCompare(b.title));
}

/** The GM's view of a note's pages, in the note's order. Pages deleted since are left out. */
export function notePages(book: Workspace | null | undefined, ids: readonly string[] | undefined): NotePage[] {
  if (!book?.entries || !ids?.length) return [];
  const names = new Map((book.campaigns ?? []).map(c => [c.id, c.name]));
  return ids.flatMap(id => { const e = book.entries.find(x => x.id === id); return e ? [card(e, e.campaignId ? names.get(e.campaignId) : undefined)] : []; });
}

/**
 * What players get from a note: nothing unless the GM shares it, then the read-aloud text and only those
 * linked pages the paired campaign already shows players, with their player text (no secrets, no GM tabs).
 */
export function playerNote(point: Pick<PointOfInterest, "name" | "hidden" | "playersSee" | "readAloud" | "pages">, book: Workspace | null | undefined, maptableCampaignId: string | null) {
  if (point.hidden || !point.playersSee) return null;
  const paired = pairedCampaign(book, maptableCampaignId);
  let pages: { id: string; title: string; kind: string; excerpt: string }[] = [];
  if (book && paired && point.pages?.length) {
    try {
      const shared = playerCampaign(book, paired.id).entries;
      pages = point.pages.flatMap(id => {
        const e = shared.find(x => x.id === id);
        if (!e) return [];
        const text = e.tabs[0]?.body ?? "";
        return [{ id: e.id, title: e.title, kind: kindLabel({ kind: e.kind, character: e.role ? { role: e.role } as Entry["character"] : undefined }), excerpt: plainExcerpt(text, 240) }];
      });
    } catch { pages = []; }
  }
  const readAloud = point.readAloud?.trim() ?? "";
  if (!readAloud && !pages.length) return null;
  return { name: point.name.trim() || "Marker", readAloud, pages };
}

/** Adds a page to a marker's note (once, up to the limit). Returns false when it can't. */
export function addNotePage(point: Pick<PointOfInterest, "pages">, id: string): boolean {
  const pages = point.pages ?? [];
  if (pages.includes(id) || pages.length >= MAX_NOTE_PAGES) return false;
  point.pages = [...pages, id];
  return true;
}
export function removeNotePage(point: Pick<PointOfInterest, "pages">, id: string) {
  point.pages = (point.pages ?? []).filter(x => x !== id);
}

/** Whether a marker has anything to show in its note card. */
export const hasNote = (p: Pick<PointOfInterest, "notes" | "readAloud" | "pages">) => !!(p.notes?.trim() || p.readAloud?.trim() || p.pages?.length);

/** Encyclopedia link for a page, opened in a new tab from Maptable. */
export const pageHref = (id: string) => `/encyclopedia?entry=${encodeURIComponent(id)}`;
/** Drag type for an Encyclopedia page dragged onto the map. */
export const PAGE_DRAG = "application/x-encyclopedia-page";
