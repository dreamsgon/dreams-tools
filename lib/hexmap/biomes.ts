/**
 * Biomes and terrain for hex maps. A hex has one biome (its climate and look) and one terrain
 * (what the ground does there: water, open land, forest, hills, mountains...).
 * Each is stored as one letter, so a whole map fits in a short string.
 */
export const biomeIds = ["temperate", "boreal", "tundra", "glacier", "desert", "savanna", "jungle", "swamp", "badlands", "volcanic", "blighted", "fey"] as const;
export type BiomeId = typeof biomeIds[number];

/** How a biome looks. `heat` runs from 0 (ice) to 4 (desert) and decides snow and frozen water. */
export type Biome = {
  name: string; hint: string; heat: number;
  flat: string; forest: string; tree: string; mount: string;
  /** The tree symbol drawn in its forests. */
  treeKind: TreeKind;
  /** Biomes that only appear when chosen or as rare patches, never from the climate. */
  special?: boolean;
};
export type TreeKind = "round" | "pine" | "snowpine" | "acacia" | "jungle" | "willow" | "cactus" | "dead" | "twisted" | "mushroom";

export const biomes: Record<BiomeId, Biome> = {
  temperate: { name: "Temperate", hint: "Fields and broadleaf woods", heat: 2, flat: "#a9c57b", forest: "#8fb466", tree: "#3e7a3a", mount: "#8f8a76", treeKind: "round" },
  boreal: { name: "Boreal", hint: "Pine forest and cool lakes", heat: 1, flat: "#97b083", forest: "#80a077", tree: "#2c5d45", mount: "#7f8580", treeKind: "pine" },
  tundra: { name: "Tundra", hint: "Moss, wind and thin trees", heat: 0.45, flat: "#c6cdb8", forest: "#b4c0ac", tree: "#4f7262", mount: "#9aa2a3", treeKind: "snowpine" },
  glacier: { name: "Glacier", hint: "Ice sheets and snowfields", heat: 0, flat: "#e8eff2", forest: "#dbe6ea", tree: "#7f9eab", mount: "#b9c9d1", treeKind: "snowpine" },
  desert: { name: "Desert", hint: "Dunes and dry stone", heat: 4, flat: "#ecd69e", forest: "#e2cc8e", tree: "#6f8f45", mount: "#c39a62", treeKind: "cactus" },
  savanna: { name: "Savanna", hint: "A sea of grass, lone trees", heat: 3.2, flat: "#d9c37b", forest: "#c8b86c", tree: "#6e7537", mount: "#a68a5c", treeKind: "acacia" },
  jungle: { name: "Jungle", hint: "Dense, wet canopy", heat: 3.5, flat: "#8cbd5d", forest: "#6aa449", tree: "#255f2a", mount: "#6f7d5a", treeKind: "jungle" },
  swamp: { name: "Swamp", hint: "Bogs, reeds and willows", heat: 2.4, flat: "#9db088", forest: "#87a077", tree: "#46613f", mount: "#7a816c", treeKind: "willow" },
  badlands: { name: "Badlands", hint: "Mesas and red rock", heat: 3.7, flat: "#d49c6b", forest: "#c98f60", tree: "#6f4a30", mount: "#a7653e", treeKind: "dead" },
  volcanic: { name: "Volcanic", hint: "Ash fields and lava", heat: 3, flat: "#6c6461", forest: "#615a57", tree: "#2e2927", mount: "#4d4644", treeKind: "dead", special: true },
  blighted: { name: "Blighted", hint: "Cursed, twisted land", heat: 2, flat: "#b8a0bf", forest: "#a58bac", tree: "#55345f", mount: "#7b6880", treeKind: "twisted", special: true },
  fey: { name: "Fey wilds", hint: "Glowing, strange woods", heat: 2, flat: "#a8dcc3", forest: "#8fcab0", tree: "#2f7f6c", mount: "#7aa597", treeKind: "mushroom", special: true },
};

export const terrainIds = ["deep", "shallow", "lake", "beach", "flat", "forest", "hills", "mountain", "peak", "marsh"] as const;
export type TerrainId = typeof terrainIds[number];
export const terrainNames: Record<TerrainId, string> = {
  deep: "Deep sea", shallow: "Shallows", lake: "Lake", beach: "Beach", flat: "Open land", forest: "Forest", hills: "Hills", mountain: "Mountains", peak: "High peaks", marsh: "Marsh",
};
export const isWaterTerrain = (t: TerrainId) => t === "deep" || t === "shallow" || t === "lake";

const biomeLetters = "abcdefghijkl", terrainLetters = "dslbfwhmpx";
/** The two letters a hex is stored as: biome, then terrain. A hex outside the map's outline is "..". */
export const hexCode = (b: BiomeId, t: TerrainId) => biomeLetters[biomeIds.indexOf(b)] + terrainLetters[terrainIds.indexOf(t)];
export const OUTSIDE = "..";
/** A hex read back from its two letters, or null when it is outside the outline. */
export function readHex(cells: string, i: number): { biome: BiomeId; terrain: TerrainId } | null {
  const b = biomeLetters.indexOf(cells[i * 2]), t = terrainLetters.indexOf(cells[i * 2 + 1]);
  return b < 0 || t < 0 ? null : { biome: biomeIds[b], terrain: terrainIds[t] };
}
/** Matches a valid cells string: pairs of biome and terrain letters, or "..". */
export const cellsPattern = /^([a-l][dslbfwhmpx]|\.\.)*$/;
