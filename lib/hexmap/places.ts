import { biomes, type BiomeId, type TerrainId } from "./biomes.ts";
import { hexDistance, type HexCell } from "./layout.ts";
import { hashText, seededRandom } from "./noise.ts";

/**
 * Places on a hex map: settlements (a city, then towns, then villages) on good open land near
 * rivers and coasts, roads joining them along the cheapest ground, and ruins, towers, caves,
 * shrines and lairs in the wilds. Places use their own random numbers, so Reroll places moves
 * them without touching the land, and they never change the land either.
 */
export const hexPlaceKinds = ["city", "town", "village", "ruin", "tower", "cave", "shrine", "lair"] as const;
export type HexPlaceKind = typeof hexPlaceKinds[number];
export type HexPlace = { i: number; kind: HexPlaceKind; name: string };
export const isSettlement = (kind: HexPlaceKind) => kind === "city" || kind === "town" || kind === "village";
export const placeKindNames: Record<HexPlaceKind, string> = { city: "City", town: "Town", village: "Village", ruin: "Ruin", tower: "Tower", cave: "Cave", shrine: "Shrine", lair: "Lair" };

export type PlaceInput = {
  seed: string; roll: number; settlements: number; sites: number; roads: boolean; names: boolean;
  cells: HexCell[]; nb: number[][]; land: number[]; water: ArrayLike<number>; onRiver: ArrayLike<number>;
  terrain: TerrainId[]; biome: BiomeId[];
};

/** Kinds of wild place that suit each terrain. */
const SITES: Partial<Record<TerrainId, HexPlaceKind[]>> = {
  mountain: ["cave", "lair", "tower"], peak: ["lair", "cave"], hills: ["ruin", "tower", "cave"], forest: ["ruin", "shrine", "lair"],
  marsh: ["ruin", "shrine"], flat: ["ruin", "tower", "shrine"], beach: ["ruin", "shrine"],
};
/** How hard each terrain is for a road; water and high peaks cannot be crossed. */
const ROAD_COST: Partial<Record<TerrainId, number>> = { flat: 1, beach: 1, forest: 2, hills: 3, marsh: 4, mountain: 9 };

export function placeHexPlaces(input: PlaceInput): { places: HexPlace[]; roads: number[][] } {
  const { cells, nb, land, water, onRiver, terrain, biome } = input;
  const r = seededRandom(hashText(`${input.seed.trim() || "map"}#places${input.roll}`));
  const places: HexPlace[] = [], counts: Partial<Record<HexPlaceKind, number>> = {};
  const name = (kind: HexPlaceKind, b: BiomeId) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    if (!input.names) return kind === "city" ? "City" : `${placeKindNames[kind]} ${counts[kind]}`;
    return isSettlement(kind) ? settlementName(r, b) : siteName(r, kind);
  };
  const near = (i: number, gap: number) => places.some(p => hexDistance(cells[p.i], cells[i]) < gap);

  // Settlements: the best-placed open land, spread apart.
  const open = land.filter(i => !water[i] && (terrain[i] === "flat" || terrain[i] === "beach" || terrain[i] === "forest" || terrain[i] === "hills"));
  const score = (i: number) => (onRiver[i] ? 0.45 : 0) + (nb[i].some(j => terrain[j] === "shallow") ? 0.3 : 0) + (nb[i].some(j => terrain[j] === "lake") ? 0.2 : 0)
    + (terrain[i] === "flat" || terrain[i] === "beach" ? 0.25 : 0) - (biome[i] === "glacier" || biome[i] === "volcanic" || biome[i] === "blighted" ? 0.35 : 0)
    // Hexes on the map's edge have no land beyond them, so towns there look cut off.
    - (nb[i].length < 6 ? 0.6 : 0) + r() * 0.45;
  const ranked = open.map(i => [i, score(i)] as const).sort((a, b) => b[1] - a[1]);
  const gap = Math.max(3, Math.sqrt(land.length / Math.max(1, input.settlements)) * 0.62);
  for (const [i] of ranked) {
    if (places.length >= input.settlements) break;
    if (near(i, gap)) continue;
    const kind: HexPlaceKind = places.length === 0 ? "city" : places.length < 3 ? "town" : "village";
    places.push({ i, kind, name: name(kind, biome[i]) });
  }
  const settlements = places.slice();

  // Ruins and lairs: anywhere wild, kept a little apart from everything else.
  const wild = land.filter(i => !water[i] && SITES[terrain[i]]);
  for (let tries = 0; tries < 400 && places.length < settlements.length + input.sites && wild.length; tries++) {
    const i = wild[Math.floor(r() * wild.length)];
    if (near(i, 3)) continue;
    const kinds = SITES[terrain[i]]!, kind = kinds[Math.floor(r() * kinds.length)];
    places.push({ i, kind, name: name(kind, biome[i]) });
  }

  // Roads: join each settlement to the nearest one already joined, along the cheapest ground; old roads are cheap to follow.
  const roads: number[][] = [];
  if (input.roads && settlements.length > 1) {
    const onRoad = new Set<number>(), joined = [settlements[0]], waiting = settlements.slice(1);
    const cost = (i: number) => water[i] ? Infinity : onRoad.has(i) ? 0.45 : (ROAD_COST[terrain[i]] ?? Infinity) + (onRiver[i] ? 0.6 : 0);
    while (waiting.length) {
      let wi = 0, ji = 0, best = Infinity;
      waiting.forEach((a, x) => joined.forEach((b, y) => { const d = hexDistance(cells[a.i], cells[b.i]); if (d < best) { best = d; wi = x; ji = y; } }));
      const [a] = waiting.splice(wi, 1), b = joined[ji];
      joined.push(a);
      const path = cheapestPath(cells, nb, a.i, b.i, cost);
      if (path) { roads.push(path); path.forEach(p => onRoad.add(p)); }
    }
  }
  return { places, roads };
}

/** A* over the hexes: the cheapest way from one hex to another, or null if water or peaks cut it off. */
export function cheapestPath(cells: HexCell[], nb: number[][], from: number, to: number, cost: (i: number) => number): number[] | null {
  const g = new Map<number, number>([[from, 0]]), prev = new Map<number, number>(), done = new Set<number>();
  const heap: [number, number][] = [[0, from]];
  const push = (item: [number, number]) => { heap.push(item); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  while (heap.length) {
    const [, cur] = pop();
    if (cur === to) break;
    if (done.has(cur)) continue;
    done.add(cur);
    for (const j of nb[cur]) {
      const step = j === to ? 1 : cost(j);
      if (!Number.isFinite(step)) continue;
      const next = g.get(cur)! + step;
      if (next < (g.get(j) ?? Infinity)) { g.set(j, next); prev.set(j, cur); push([next + hexDistance(cells[j], cells[to]) * 0.45, j]); }
    }
  }
  if (from !== to && !prev.has(to)) return null;
  const path = [to];
  for (let c = to; c !== from;) { c = prev.get(c)!; path.push(c); }
  return path.reverse();
}

const STARTS = ["Ash", "Bel", "Bram", "Cal", "Cor", "Dun", "El", "Fen", "Gal", "Hal", "Ir", "Kel", "Lor", "Mar", "Nor", "Os", "Pell", "Quen", "Rav", "Sal", "Tor", "Ul", "Ver", "Wyn", "Yar", "Zan"];
const MIDDLES = ["", "", "a", "e", "i", "o", "an", "en", "ar", "or", "il"];
const ENDS = { cold: ["holm", "fell", "watch", "stead", "vik", "gard"], warm: ["sar", "ad", "esh", "um", "ara", "is"], wet: ["mere", "fen", "brook", "wick", "marsh", "pool"], any: ["ford", "haven", "gate", "dale", "by", "ton", "crest", "port"] };
const pickFrom = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
/** A made-up settlement name that sounds a little like its climate: Kelholm in the cold, Salesh in the heat. */
function settlementName(r: () => number, b: BiomeId) {
  const heat = biomes[b].heat, band = heat < 1.2 ? "cold" : heat > 3 ? "warm" : b === "swamp" ? "wet" : "any";
  const n = pickFrom(r, STARTS) + pickFrom(r, MIDDLES) + pickFrom(r, r() < 0.6 ? ENDS[band] : ENDS.any);
  return n[0] + n.slice(1).toLowerCase();
}
const SITE_NOUNS: Partial<Record<HexPlaceKind, string[]>> = { ruin: ["Ruins", "Old Keep", "Broken Hall"], tower: ["Tower", "Spire", "Watchtower"], cave: ["Caves", "Hollow", "Deep"], shrine: ["Shrine", "Standing Stones", "Altar"], lair: ["Lair", "Den", "Nest"] };
function siteName(r: () => number, kind: HexPlaceKind) {
  return `${pickFrom(r, ["Grey", "Hollow", "Sunken", "Ember", "Raven", "Thorn", "Whisper", "Old", "Bone", "Moon"])} ${pickFrom(r, SITE_NOUNS[kind]!)}`;
}
