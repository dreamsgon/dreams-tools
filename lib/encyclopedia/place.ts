import type { Workspace } from "./world-model.ts";

/** Where you are in the Encyclopedia, kept in the address so a refresh or Back returns there. */
export const placeViews = ["dashboard", "overview", "characters", "maps", "calendar", "tables", "templates", "quests", "codex", "look"] as const;
export type PlaceView = typeof placeViews[number];
/** `tab` is the open tab of an open page (for example "profile"); absent means the page's first tab. */
export type Place = { worldId: string; campaignId: string | null; view: PlaceView; entryId: string | null; tab?: string | null };
const TAB = /^[A-Za-z0-9_-]{1,80}$/;

/** The tab a page opens on when none is named, so the address need not carry it. */
export const defaultTab = (kind: string) => kind === "map" ? "map" : kind === "faction" ? "profile" : "overview";

/** Whether going from one place to another is a new place (push a history entry) rather than a small change in the same one (replace). */
export function isNewPlace(a: Place | null, b: Place): boolean {
  return !a || a.worldId !== b.worldId || a.campaignId !== b.campaignId || a.view !== b.view || a.entryId !== b.entryId;
}

/** The address for a place, such as ?entry=<id> or ?world=<id>&view=maps. */
export function placeQuery(place: Place): string {
  const q = new URLSearchParams();
  if (place.entryId) {
    q.set("entry", place.entryId);
    if (place.tab && TAB.test(place.tab)) q.set("tab", place.tab);
  } else {
    if (place.worldId) q.set("world", place.worldId);
    if (place.campaignId) q.set("campaign", place.campaignId);
    // A campaign opens on its overview and a world on its dashboard, so those need no view.
    const view = place.view === "overview" && !place.campaignId ? "lore" : place.view;
    if (view !== (place.campaignId ? "overview" : "dashboard")) q.set("view", view);
  }
  const text = q.toString();
  return text ? `?${text}` : "";
}

/**
 * Reads a place from an address, checking it against the workspace. Anything that no
 * longer exists is dropped: a missing page falls back to its campaign or world.
 * Returns null when the address names nothing (so the caller can use its default).
 */
export function placeFromQuery(query: URLSearchParams, data: Workspace): Place | null {
  const entry = data.entries.find(e => e.id === query.get("entry"));
  if (entry) {
    const tab = query.get("tab");
    return { worldId: entry.worldId, campaignId: entry.campaignId ?? null, view: "overview", entryId: entry.id, ...(tab && TAB.test(tab) ? { tab } : {}) };
  }
  // ?maptable=<Maptable campaign id> (from Maptable's header) opens the paired campaign; no match is the same as no parameter.
  const paired = query.get("maptable");
  const campaign = data.campaigns.find(c => c.id === query.get("campaign")) ?? (paired ? data.campaigns.find(c => c.maptableCampaignId === paired) : undefined);
  const world = data.worlds.find(w => w.id === (campaign?.worldId ?? query.get("world")));
  if (!world) return null;
  const asked = query.get("view");
  const view: PlaceView = asked === "lore" ? "overview"
    : asked && (placeViews as readonly string[]).includes(asked) && asked !== "overview" && !((asked === "calendar" || asked === "quests" || asked === "codex" || asked === "look") && !campaign) ? asked as PlaceView
    : campaign ? "overview" : "dashboard";
  return { worldId: world.id, campaignId: campaign?.id ?? null, view, entryId: null };
}
