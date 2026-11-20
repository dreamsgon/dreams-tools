import { scenesInOrder } from "./scene-order.ts";

/**
 * Where you are in Maptable, kept in the address as ?campaign=<id>&scene=<id> so it can be bookmarked. Other parameters are left alone.
 * `view: "scenes"` is a campaign's Scene Picker (?campaign=<id>&view=scenes); without it, ?campaign=<id> opens that campaign's table.
 * With no campaign, `view: "scenes"` is the Scene Picker for maps not in a campaign (?view=unfiled).
 */
export type MaptablePlace = { campaignId: string | null; sceneId: string | null; view?: "scenes" };
type Data = { scenes: { id: string; containerId?: string | null }[]; collections: { id: string; kind: string; parentId?: string | null }[] };

/** The address for a place. A scene carries its campaign; with nothing open both are dropped. Other parameters keep their place after these. */
export function maptableSearch(current: string, place: MaptablePlace): string {
  const old = new URLSearchParams(current), next = new URLSearchParams();
  if (place.campaignId) next.set("campaign", place.campaignId);
  if (place.sceneId) next.set("scene", place.sceneId);
  else if (place.view === "scenes") next.set("view", place.campaignId ? "scenes" : "unfiled");
  old.forEach((value, key) => { if (key !== "campaign" && key !== "scene" && key !== "view") next.append(key, value); });
  const text = next.toString();
  return text ? `?${text}` : "";
}

/** Reads a place from an address, dropping a scene or campaign that does not exist (or that the user cannot see). */
export function readMaptablePlace(search: string, data: Data): MaptablePlace {
  const query = new URLSearchParams(search), scene = query.get("scene"), campaign = query.get("campaign");
  const place: MaptablePlace = {
    sceneId: scene && data.scenes.some(s => s.id === scene) ? scene : null,
    campaignId: campaign && data.collections.some(c => c.id === campaign && c.kind === "campaign") ? campaign : null,
  };
  const view = query.get("view");
  if (!place.sceneId && (place.campaignId ? view === "scenes" : view === "unfiled" && !campaign)) place.view = "scenes";
  return place;
}

/**
 * The scene a ?campaign=<id> link opens, so "Open in Maptable" lands on that campaign's own table: the scene
 * that was open when it is already in that campaign, else the campaign's first scene in Scenes-panel order.
 * Null when the campaign has no scenes yet (its own scene list opens instead).
 */
export function campaignTableScene(data: Data, campaignId: string, openSceneId: string | null | undefined): string | null {
  const list = scenesInOrder(data as Parameters<typeof scenesInOrder>[0], campaignId);
  return (list.find(i => i.scene.id === openSceneId) ?? list[0])?.scene.id ?? null;
}

/**
 * The scene you last had open in a campaign (the campaign bar's switcher opens it), or null when none is remembered
 * or it was deleted or moved to another campaign. The caller then opens the campaign's Scene Picker; nothing is created.
 */
export function rememberedCampaignScene(data: Data, campaignId: string, rememberedSceneId: string | null | undefined): string | null {
  if (!rememberedSceneId) return null;
  return scenesInOrder(data as Parameters<typeof scenesInOrder>[0], campaignId).find(i => i.scene.id === rememberedSceneId)?.scene.id ?? null;
}

/** Where the last open scene of one campaign is kept (per tab and per browser, like the rest of Maptable's navigation state). */
export const campaignSceneKey = (scope: string, campaignId: string) => `maptable:last-scene:v1:${encodeURIComponent(scope)}:${encodeURIComponent(campaignId)}`;
