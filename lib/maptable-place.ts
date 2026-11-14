/** Where you are in Maptable, kept in the address as ?campaign=<id>&scene=<id> so it can be bookmarked. Other parameters are left alone. */
export type MaptablePlace = { campaignId: string | null; sceneId: string | null };
type Data = { scenes: { id: string }[]; collections: { id: string; kind: string }[] };

/** The address for a place. A scene carries its campaign; with nothing open both are dropped. Other parameters keep their place after these. */
export function maptableSearch(current: string, place: MaptablePlace): string {
  const old = new URLSearchParams(current), next = new URLSearchParams();
  if (place.campaignId) next.set("campaign", place.campaignId);
  if (place.sceneId) next.set("scene", place.sceneId);
  old.forEach((value, key) => { if (key !== "campaign" && key !== "scene") next.append(key, value); });
  const text = next.toString();
  return text ? `?${text}` : "";
}

/** Reads a place from an address, dropping a scene or campaign that does not exist (or that the user cannot see). */
export function readMaptablePlace(search: string, data: Data): MaptablePlace {
  const query = new URLSearchParams(search), scene = query.get("scene"), campaign = query.get("campaign");
  return {
    sceneId: scene && data.scenes.some(s => s.id === scene) ? scene : null,
    campaignId: campaign && data.collections.some(c => c.id === campaign && c.kind === "campaign") ? campaign : null,
  };
}
