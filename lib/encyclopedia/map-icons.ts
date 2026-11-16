import { mapIconIds, type MapData, type PlaceKind } from "./map-model.ts";

/**
 * Icons for settlements and landmark stamps: 24 × 24 line drawings in ink, with a filled body.
 * `F` marks the filled parts; it becomes a paper-coloured fill when drawn (see iconMarkup).
 * Ids are listed in map-model (mapIconIds) so the server can check them without loading the drawings.
 */
export type MapIconGroup = "Settlements" | "Strongholds" | "Sci-fi" | "Nature" | "Wonders" | "Strange";
export const mapIcons: { id: string; name: string; group: MapIconGroup; svg: string }[] = [
  { id: "capital", name: "Capital", group: "Settlements", svg: `<path F d="M4 21V10l2-2 2 2v-3l4-3 4 3v3l2-2 2 2v11z"/><path d="M12 4V1.5l3 1-3 1M10 21v-4a2 2 0 0 1 4 0v4M4 13h16"/>` },
  { id: "city", name: "City", group: "Settlements", svg: `<path F d="M3 21v-9l3-2 3 2v9M9 21V7l3-3 3 3v14M15 21v-8l3-2 3 2v8z"/><path d="M3 21h18M11.2 10h1.6M11.2 13h1.6M5.3 15h1.4M17.3 16h1.4"/>` },
  { id: "town", name: "Town", group: "Settlements", svg: `<path F d="M3 21v-7l4-4 4 4v7zM11 21v-9l5-5 5 5v9z"/><path d="M6 21v-3h2v3M15 21v-4h2v4"/>` },
  { id: "village", name: "Village", group: "Settlements", svg: `<path F d="M5 21v-8l7-6 7 6v8z"/><path d="M10 21v-4h4v4M16 9V5h2v5.5"/>` },
  { id: "hamlet", name: "Hamlet", group: "Settlements", svg: `<path F d="M6 21v-6l6-5 6 5v6z"/><path d="M11 21v-3h2v3"/>` },
  { id: "farm", name: "Farmstead", group: "Settlements", svg: `<path F d="M4 21v-8l5-4 5 4v8z"/><path d="M7 21v-4h4v4M7 17l4-0M15 21v-9a2.5 2.5 0 0 1 5 0v9M14 21h7"/>` },
  { id: "port", name: "Port", group: "Settlements", svg: `<circle F cx="12" cy="5" r="2"/><path d="M12 7v14M8 10h8M4 15a8 6 0 0 0 16 0M4 15l-1.5 1.5M20 15l1.5 1.5"/>` },
  { id: "temple", name: "Temple", group: "Settlements", svg: `<path F d="M4 9l8-5 8 5zM5 21h14v-2H5z"/><path d="M7 10v9M10.3 10v9M13.7 10v9M17 10v9"/>` },
  { id: "inn", name: "Inn", group: "Settlements", svg: `<path F d="M5 21V11l7-6 7 6v10z"/><path d="M10 21v-4h4v4M19 9h2v4h-2"/><circle cx="20" cy="15.5" r="1.4"/>` },
  { id: "castle", name: "Castle", group: "Strongholds", svg: `<path F d="M3 21V9h3v2h2V9h3v2h2V9h3v2h2V9h3v12z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4M6 14h1M17 14h1"/>` },
  { id: "fort", name: "Fort", group: "Strongholds", svg: `<path F d="M3 21V11l1.5-2L6 11l1.5-2L9 11l1.5-2L12 11l1.5-2L15 11l1.5-2L18 11l1.5-2L21 11v10z"/><path d="M10 21v-5h4v5"/>` },
  { id: "tower", name: "Watchtower", group: "Strongholds", svg: `<path F d="M8 21l1-12h6l1 12zM7 9V5h2v2h2V5h2v2h2V5h2v4z"/><path d="M11 21v-3h2v3M11.5 12h1"/>` },
  { id: "camp", name: "Camp", group: "Strongholds", svg: `<path F d="M3 20l9-14 9 14z"/><path d="M12 6v14M9 20l3-5 3 5M2 20h20"/>` },
  { id: "mine", name: "Mine", group: "Strongholds", svg: `<path F d="M3 21a9 9 0 0 1 18 0z"/><path d="M8 21v-4a4 4 0 0 1 8 0v4M6 6l6 6M18 6l-6 6M4.5 7.5l3-3M19.5 7.5l-3-3"/>` },
  { id: "spaceport", name: "Spaceport", group: "Sci-fi", svg: `<path F d="M12 2c3 3 4 7 4 11l-2 3h-4l-2-3c0-4 1-8 4-11z"/><path d="M8 13l-3 4v2l4-2M16 13l3 4v2l-4-2M10 19l2 3 2-3"/><circle cx="12" cy="9" r="1.5"/>` },
  { id: "dome", name: "Colony dome", group: "Sci-fi", svg: `<path F d="M3 20a9 9 0 0 1 18 0z"/><path d="M2 20h20M12 11v9M7.5 13.5l2 6.5M16.5 13.5l-2 6.5M4.5 16.5h15"/>` },
  { id: "station", name: "Research station", group: "Sci-fi", svg: `<path F d="M5 21v-6h14v6z"/><path d="M12 15V9M7 4a6 6 0 0 0 10 4zM12 6l3-3M8 18h2M14 18h2"/>` },
  { id: "rig", name: "Mining rig", group: "Sci-fi", svg: `<path F d="M9 21l3-17 3 17z"/><path d="M10 14h4M10.6 10h2.8M5 21h14M15 7h5v3"/>` },
  { id: "volcano", name: "Volcano", group: "Nature", svg: `<path F d="M2 21l7-11h6l7 11z"/><path d="M9 10l1.5 2 1.5-1.5 1.5 1.5L15 10M10 7c0-2 2-2 2-4M14 7c0-1.5 1.5-2 1.5-3.5"/>` },
  { id: "peak", name: "Lone peak", group: "Nature", svg: `<path F d="M2 21L12 4l10 17z"/><path d="M9 9l3 2 3-2M12 4v7"/>` },
  { id: "tree", name: "Great tree", group: "Nature", svg: `<path F d="M12 2c4 0 7 3 7 6.5 0 2-1 3.5-3 4.5H8c-2-1-3-2.5-3-4.5C5 5 8 2 12 2z"/><path d="M12 13v8M9 21h6M12 16l-3-2M12 15l3-2"/>` },
  { id: "falls", name: "Waterfall", group: "Nature", svg: `<path F d="M3 6h18v4H3z"/><path d="M8 10v8M12 10v9M16 10v8M5 21c2-1.5 4-1.5 7 0s5 1.5 7 0"/>` },
  { id: "crater", name: "Crater", group: "Nature", svg: `<ellipse F cx="12" cy="14" rx="10" ry="6"/><ellipse cx="12" cy="14.5" rx="5.5" ry="3"/><path d="M5 9.5l-1-2M19 9.5l1-2M12 8V6"/>` },
  { id: "crystal", name: "Crystal spire", group: "Nature", svg: `<path F d="M12 2l4 6-1 13H9L8 8z"/><path d="M12 2v19M8 8h8M6 21l-1-7 3-2M18 21l1-7-3-2"/>` },
  { id: "geyser", name: "Geyser", group: "Nature", svg: `<ellipse F cx="12" cy="19" rx="8" ry="2.5"/><path d="M12 17V6M9 9c-2-1-2-4 0-5M15 9c2-1 2-4 0-5M12 6c-1.5-1-1.5-3 0-4"/>` },
  { id: "whirlpool", name: "Whirlpool", group: "Nature", svg: `<circle F cx="12" cy="12" r="9"/><path d="M12 12c0-2 2.5-2.5 3.5-.5s-1 5-4.5 4.5-5-4-3-7 7-3.5 9 0"/>` },
  { id: "cave", name: "Cave", group: "Nature", svg: `<path F d="M2 21l5-12 5-4 5 4 5 12z"/><path d="M8 21a4 5 0 0 1 8 0"/>` },
  { id: "stones", name: "Standing stones", group: "Wonders", svg: `<path F d="M3 21V11l3-1v11zM10 21V8l4-1v14zM18 21v-9l3 1v8z"/><path d="M2 21h20M9 7h6"/>` },
  { id: "ruins", name: "Ruins", group: "Wonders", svg: `<path F d="M4 21V8l2-1v14zM10 21v-9h2v9zM16 21V6l2 1v14z"/><path d="M3 8h5M15 6h5M2 21h20M12 17l3 1"/>` },
  { id: "monolith", name: "Monolith", group: "Wonders", svg: `<path F d="M9 21V4l3-2 3 2v17z"/><path d="M7 21h10M11 8h2M11 12h2"/>` },
  { id: "statue", name: "Colossus", group: "Wonders", svg: `<circle F cx="12" cy="5" r="2.2"/><path F d="M9 21v-7l-2-4 5-2 5 2-2 4v7z"/><path d="M7 10l-2-4M6 21h12"/>` },
  { id: "lighthouse", name: "Lighthouse", group: "Wonders", svg: `<path F d="M9 21l1.2-12h3.6L15 21z"/><path d="M9.5 9h5V6h-5zM12 6V4M14.5 7.5l5-2M9.5 7.5l-5-2M10 14h4M7 21h10"/>` },
  { id: "portal", name: "Portal", group: "Wonders", svg: `<path F d="M6 21V10a6 6 0 0 1 12 0v11z"/><path d="M9 21v-9a3 3 0 0 1 6 0v9M4 21h16M12 7v1"/>` },
  { id: "bones", name: "Dragon bones", group: "Strange", svg: `<path F d="M3 13c2-4 6-5 9-3l4-3 2 2-2 2 4 1-1 3-5-1c-3 3-7 4-11 2z"/><circle cx="17.5" cy="10" r=".6"/><path d="M6 16l-1 4M9 16.5l0 4M12 16l1 4"/>` },
  { id: "wreck", name: "Shipwreck", group: "Strange", svg: `<path F d="M3 16l15-5 3 3-14 6z"/><path d="M10 13.5V4l5 6M2 20c3-1 5-1 8 0s5 1 8 0"/>` },
  { id: "crash", name: "Crashed ship", group: "Strange", svg: `<path F d="M4 18l9-11 4 3-7 10z"/><path d="M13 7l2-4M17 10l4-1M2 21h20M7 16l2 1M17 14c1 1 3 1 4 0"/>` },
  { id: "floating", name: "Floating isle", group: "Strange", svg: `<path F d="M3 10h18l-4 6-5 3-5-3z"/><path d="M6 10l2-4 3 2 3-4 3 6M9 21l1-2M14 21l-1-2"/>` },
  { id: "skull", name: "Skull rock", group: "Strange", svg: `<path F d="M5 13a7 7 0 1 1 14 0v3l-2 1v3H7v-3l-2-1z"/><circle cx="9.5" cy="12.5" r="1.6"/><circle cx="14.5" cy="12.5" r="1.6"/><path d="M12 15v1.5M10 20v-2M14 20v-2"/>` },
];
export const settlementGroups: MapIconGroup[] = ["Settlements", "Strongholds", "Sci-fi"];
export const stampGroups: MapIconGroup[] = ["Nature", "Wonders", "Strange"];
const byId = new Map(mapIcons.map(i => [i.id, i]));
export const mapIcon = (id: string) => byId.get(id);

/** The icon's drawing, ready to put inside a 24 × 24 SVG group, with its body filled in the paper colour. */
export function iconMarkup(id: string, paper: string) {
  const icon = byId.get(id);
  return icon ? icon.svg.replaceAll("<path F ", `<path fill="${paper}" `).replaceAll("<circle F ", `<circle fill="${paper}" `).replaceAll("<ellipse F ", `<ellipse fill="${paper}" `) : "";
}

/** The kind of place an icon stands for, so legends, routes and Maptable markers keep working. */
const kindOfIcon: Record<string, PlaceKind> = {
  capital: "city", city: "city", spaceport: "city", town: "town", port: "town", temple: "town", inn: "town", dome: "town",
  village: "village", hamlet: "village", farm: "village", station: "village", castle: "castle", fort: "castle", tower: "castle",
  camp: "camp", mine: "camp", rig: "camp", ruins: "ruin", cave: "dungeon",
};
export const iconKind = (id: string): PlaceKind => kindOfIcon[id] ?? "landmark";

/** The name of an icon, built in or uploaded to this map. */
export const iconName = (id: string, map?: Pick<MapData, "icons">) => byId.get(id)?.name ?? map?.icons?.find(i => i.id === id)?.name ?? "Icon";

/** Every built-in id in map-model has a drawing here; tests check the two lists match. */
export const iconsMatchModel = () => mapIconIds.length === mapIcons.length && mapIcons.every((i, n) => mapIconIds[n] === i.id);
