import type { Workspace } from "./world-model.ts";

/** Where you are in the Encyclopedia, kept in the address so a refresh or Back returns there. */
export const placeViews = ["dashboard", "overview", "characters", "maps", "calendar", "tables"] as const;
export type PlaceView = typeof placeViews[number];
export type Place = { worldId: string; campaignId: string | null; view: PlaceView; entryId: string | null };

/** The address for a place, such as ?entry=<id> or ?world=<id>&view=maps. */
export function placeQuery(place: Place): string {
  const q = new URLSearchParams();
  if (place.entryId) q.set("entry", place.entryId);
  else {
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
  if (entry) return { worldId: entry.worldId, campaignId: entry.campaignId ?? null, view: "overview", entryId: entry.id };
  const campaign = data.campaigns.find(c => c.id === query.get("campaign"));
  const world = data.worlds.find(w => w.id === (campaign?.worldId ?? query.get("world")));
  if (!world) return null;
  const asked = query.get("view");
  const view: PlaceView = asked === "lore" ? "overview"
    : asked && (placeViews as readonly string[]).includes(asked) && asked !== "overview" && !(asked === "calendar" && !campaign) ? asked as PlaceView
    : campaign ? "overview" : "dashboard";
  return { worldId: world.id, campaignId: campaign?.id ?? null, view, entryId: null };
}
