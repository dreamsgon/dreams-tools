import { defaultHexOptions, normalizeHexOptions, type HexMapOptions } from "./generate.ts";

/**
 * Ready-made hex maps. A preset fills in every setting except the seed and the Size section;
 * change anything afterwards and the settings are your own again.
 */
export type HexPreset = { id: string; name: string; hint: string; set: Partial<HexMapOptions> };
export const hexPresets: HexPreset[] = [
  { id: "frontier", name: "Green frontier", hint: "Mild, green mainland with a southern coast", set: { mode: "climate", temp: 0.05, rain: 0.15, variety: 0.4, coast: "s", rivers: 5, mountains: 0.45, wonders: 0 } },
  { id: "north", name: "Frozen north", hint: "Cold, rugged land with a frozen sea", set: { mode: "climate", temp: -0.75, variety: 0.45, coast: "nw", mountains: 0.65, relief: "rugged", rivers: 3 } },
  { id: "isles", name: "Sunken isles", hint: "Warm, wet islands scattered over the sea", set: { mode: "climate", temp: 0.35, rain: 0.45, variety: 0.55, land: "archipelago", water: 0.6, rivers: 2 } },
  { id: "sands", name: "Sand sea", hint: "Desert and red rock around a few oases", set: { mode: "mix", mix: "desert:5,badlands:2,savanna:1", land: "lakes", water: 0.15, rivers: 1, forest: 0.3 } },
  { id: "jungle", name: "Jungle coast", hint: "Grassland in the west, jungle and swamp to the eastern sea", set: { mode: "mix", mix: "savanna:1,jungle:4,swamp:2", mixLayout: "we", coast: "e", rivers: 6, forest: 0.7 } },
  { id: "blight", name: "Blighted marches", hint: "Cursed bogs spreading through a low basin", set: { mode: "mix", mix: "temperate:3,swamp:2,blighted:3", land: "basin", wetlands: 0.7, wonders: 2 } },
  { id: "fire", name: "Fire isles", hint: "Jungle shores under volcanic peaks", set: { mode: "mix", mix: "jungle:3,badlands:1,volcanic:2", mixLayout: "height", land: "island", mountains: 0.7, relief: "towering", rivers: 2 } },
  { id: "every", name: "Every climate", hint: "Small biomes of every kind, from ice to desert", set: { mode: "climate", variety: 1, biomeSize: 0, wonders: 3, coast: "sw" } },
];

/** The settings a preset gives, keeping the seed and the Size section from `current`. */
export function applyHexPreset(current: HexMapOptions, preset: HexPreset): HexMapOptions {
  const { seed, outline, cols, rows, orient, miles } = current;
  return normalizeHexOptions({ ...defaultHexOptions, ...preset.set, seed, outline, cols, rows, orient, miles });
}

/** The preset the settings still match, if any. */
export function matchingHexPreset(current: HexMapOptions): HexPreset | undefined {
  const now = JSON.stringify(normalizeHexOptions(current));
  return hexPresets.find(p => JSON.stringify(applyHexPreset(current, p)) === now);
}
