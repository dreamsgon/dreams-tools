import { biomeIds, biomes, hexCode, OUTSIDE, type BiomeId, type TerrainId } from "./biomes.ts";
import { fittingHexSize, hexCells, hexDistance, hexMapSize, hexNeighbours, type HexOrient, type HexOutline } from "./layout.ts";
import { clamp, hashText, layeredNoise, quantile, ranks, seededRandom } from "./noise.ts";

/**
 * The hex map generator. Land and sea come from the kind of land chosen, mountains follow
 * ridges, rivers run downhill to water, and each hex's biome is either the one chosen or picked
 * by hidden temperature and rainfall maps (the way Minecraft picks biomes from its climate).
 * The same options always make the same map.
 */
export const hexLands = [
  { id: "mainland", name: "Mainland", hint: "Land with sea on the sides you pick" },
  { id: "peninsula", name: "Peninsula", hint: "A finger of land into the sea" },
  { id: "island", name: "Island", hint: "One island in open sea" },
  { id: "archipelago", name: "Archipelago", hint: "Many small islands" },
  { id: "atoll", name: "Crescent atoll", hint: "A ring of land around a lagoon" },
  { id: "strait", name: "Strait", hint: "Two shores across a channel" },
  { id: "range", name: "Mountain range", hint: "A chain of peaks across the map" },
  { id: "basin", name: "Basin", hint: "Low ground ringed by high ground" },
  { id: "lakes", name: "Lake country", hint: "Inland, with lakes and no sea" },
] as const;
export type HexLand = typeof hexLands[number]["id"];
export type HexRelief = "flat" | "rolling" | "rugged" | "towering";
export type Side = "n" | "s" | "w" | "e";

export type HexMapOptions = {
  seed: string;
  /** "single": every hex has `biome`. "climate": temperature and rainfall pick each hex's biome. */
  mode: "single" | "climate";
  biome: BiomeId;
  /** Climate: -1 (freezing) to 1 (scorching), -1 (arid) to 1 (soaked), and how wide a range of climates (0 to 1). */
  temp: number; rain: number; variety: number;
  /** Colder to the north and warmer to the south. */
  latitude: boolean;
  land: HexLand;
  /** The sides with sea on a mainland, as letters: "se" is sea to the south and east. */
  coast: string;
  /** The side a peninsula joins the mainland on. */
  joins: Side;
  water: number;
  /** How many hexes of shallows run along the coast; -1 picks for the map's size. */
  shallows: number;
  mountains: number; relief: HexRelief; forest: number; rivers: number; lakes: number; wetlands: number;
  outline: HexOutline; cols: number; rows: number; orient: HexOrient;
  /** Miles across one hex, flat side to flat side. */
  miles: number;
};
export const HEX_LIMITS = { cols: [10, 100], rows: [8, 80], rivers: [0, 12] } as const;
export const defaultHexOptions: HexMapOptions = {
  seed: "ember-42", mode: "climate", biome: "temperate", temp: 0, rain: 0, variety: 0.65, latitude: true,
  land: "mainland", coast: "se", joins: "s", water: 0.5, shallows: -1,
  mountains: 0.5, relief: "rolling", forest: 0.5, rivers: 4, lakes: 0.35, wetlands: 0.4,
  outline: "rect", cols: 35, rows: 25, orient: "flat", miles: 6,
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback;
const num = (value: unknown, lo: number, hi: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? clamp(value, lo, hi) : fallback;
const whole = (value: unknown, lo: number, hi: number, fallback: number) => Math.round(num(value, lo, hi, fallback));
/** Options read back from a saved map (or anything else), with every value checked and missing ones filled in. */
export function normalizeHexOptions(raw: unknown): HexMapOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, d = defaultHexOptions;
  return {
    seed: typeof o.seed === "string" ? o.seed.slice(0, 40) : d.seed,
    mode: pick(o.mode, ["single", "climate"] as const, d.mode),
    biome: pick(o.biome, biomeIds, d.biome),
    temp: num(o.temp, -1, 1, d.temp), rain: num(o.rain, -1, 1, d.rain), variety: num(o.variety, 0, 1, d.variety),
    latitude: typeof o.latitude === "boolean" ? o.latitude : d.latitude,
    land: pick(o.land, hexLands.map(l => l.id), d.land),
    coast: typeof o.coast === "string" ? [...new Set(o.coast.replace(/[^nsew]/g, ""))].join("") : d.coast,
    joins: pick(o.joins, ["n", "s", "w", "e"] as const, d.joins),
    water: num(o.water, 0, 1, d.water), shallows: whole(o.shallows, -1, 3, d.shallows),
    mountains: num(o.mountains, 0, 1, d.mountains), relief: pick(o.relief, ["flat", "rolling", "rugged", "towering"] as const, d.relief),
    forest: num(o.forest, 0, 1, d.forest), rivers: whole(o.rivers, 0, HEX_LIMITS.rivers[1], d.rivers),
    lakes: num(o.lakes, 0, 1, d.lakes), wetlands: num(o.wetlands, 0, 1, d.wetlands),
    outline: pick(o.outline, ["rect", "hex", "circle"] as const, d.outline),
    cols: whole(o.cols, HEX_LIMITS.cols[0], HEX_LIMITS.cols[1], d.cols), rows: whole(o.rows, HEX_LIMITS.rows[0], HEX_LIMITS.rows[1], d.rows),
    orient: pick(o.orient, ["flat", "pointy"] as const, d.orient), miles: num(o.miles, 0.1, 1000, d.miles),
  };
}

/** A generated hex map as it is saved on a drawing (see `hexLayerSchema` in lib/model.ts). */
export type HexLayer = {
  x: number; y: number; size: number; cols: number; rows: number; orient: HexOrient; outline: HexOutline; miles: number;
  /** Two letters per hex, row by row: biome then terrain ("..": outside the outline). */
  cells: string;
  /** Each river as the hexes it runs through, from its source to the water it reaches. */
  rivers: number[][];
  /** The options it was made with, so it can be made again. */
  options: Record<string, string | number | boolean>;
};
export type GeneratedHexMap = { layer: HexLayer; width: number; height: number; landShare: Partial<Record<BiomeId, number>> };

/** Hexes are generated at a fixed size, so the same options shape the same land at any drawing size. */
const U = 10;
const RELIEF: Record<HexRelief, number> = { flat: 0.45, rolling: 1, rugged: 1.5, towering: 2.2 };
const VEG_BIAS: Record<BiomeId, number> = { temperate: 0.05, boreal: 0.12, tundra: -0.18, glacier: -0.45, desert: -0.4, savanna: -0.12, jungle: 0.28, swamp: 0.05, badlands: -0.3, volcanic: -0.25, blighted: 0, fey: 0.15 };
/** The biome for a temperature and rainfall, both from 0 to 1 (a Minecraft-style climate table). */
export function climateBiome(t: number, m: number): BiomeId {
  const hot = t < 0.16 ? 0 : t < 0.34 ? 1 : t < 0.6 ? 2 : t < 0.8 ? 3 : 4, wet = m < 0.36 ? 0 : m < 0.66 ? 1 : 2;
  const table: BiomeId[][] = [["glacier", "glacier", "tundra"], ["tundra", "boreal", "boreal"], ["temperate", "temperate", "swamp"], ["badlands", "savanna", "jungle"], ["desert", "savanna", "jungle"]];
  return table[hot][wet];
}

export function generateHexMap(input: HexMapOptions, size?: number): GeneratedHexMap {
  const o = normalizeHexOptions(input);
  const shape = { cols: o.cols, rows: o.rows, orient: o.orient, outline: o.outline, size: U };
  const cells = hexCells(shape), nb = hexNeighbours(shape, cells), { width: W, height: H } = hexMapSize(shape);
  const inside = cells.filter(h => h.inside).map(h => h.i), N = cells.length;
  const edge = cells.map(h => h.inside && nb[h.i].length < 6);
  const seedN = hashText(o.seed.trim() || "map"), rand = seededRandom(seedN ^ 0x9e3779b9);
  const cont = layeredNoise(seedN + 1, 5), det = layeredNoise(seedN + 2, 3), rid = layeredNoise(seedN + 3, 4), warpN = layeredNoise(seedN + 4, 2),
    tN = layeredNoise(seedN + 5, 3), hN = layeredNoise(seedN + 6, 3), vegN = layeredNoise(seedN + 7, 3), arch = layeredNoise(seedN + 8, 4);
  const rel = RELIEF[o.relief], ang = rand() * Math.PI * 2, sides = new Set(o.coast);

  // Height: big land shapes, ridges for mountain chains, then the shape of the kind of land.
  const e = new Float64Array(N);
  for (const i of inside) {
    const h = cells[i], u = h.x / W, v = h.y / H, px = h.x / (U * 13), py = h.y / (U * 13);
    const wx = px + (warpN(px * 0.5, py * 0.5) - 0.5) * 1.6, wy = py + (warpN(px * 0.5 + 31, py * 0.5 + 17) - 0.5) * 1.6;
    let el = o.land === "archipelago" ? arch(wx * 1.3, wy * 1.3) * 0.8 + det(px * 2, py * 2) * 0.2
      : cont(wx * 0.55, wy * 0.55) * 0.7 + det(px * 1.6, py * 1.6) * 0.3 * Math.min(1.3, rel);
    const ridge = 1 - Math.abs(2 * rid(wx * 0.45 + 5, wy * 0.45 + 5) - 1);
    el += o.mountains * 0.35 * rel * ridge ** 3;
    const wob = (warpN(px * 1.2 + 7, py * 1.2) - 0.5) * 0.35;
    const du = (u - 0.5) * 2 + wob, dv = (v - 0.5) * 2 + wob * 0.8;
    const across = Math.abs(-Math.sin(ang) * du + Math.cos(ang) * dv);
    const fromSide = { n: v, s: 1 - v, w: u, e: 1 - u };
    switch (o.land) {
      case "mainland": { const reach = 0.16 + 0.32 * o.water;
        for (const k of ["n", "s", "w", "e"] as const) if (sides.has(k)) el -= 0.6 * Math.max(0, 1 - (fromSide[k] + wob * 0.3) / reach) ** 1.5;
        break; }
      case "island": el += 0.6 - 1.1 * (du * du + dv * dv); break;
      case "archipelago": el -= 0.4 * Math.max(Math.abs(du), Math.abs(dv)) ** 4; break;
      case "atoll": { const d = Math.hypot(du, dv), ring = 1 - Math.min(1, Math.abs(d - 0.62) * 4.5);
        el = el * 0.25 + ring * 0.9 - Math.max(0, Math.cos(Math.atan2(dv, du) - ang) - 0.35) * 1.4; break; }
      case "peninsula": { const t = fromSide[o.joins], along = o.joins === "n" || o.joins === "s" ? u : v;
        el += (0.42 * (1 - t * 0.75) - Math.abs(along - 0.5 - wob * 0.6)) * 1.8; break; }
      case "basin": el += 0.7 * (du * du + dv * dv) - 0.25; break;
      case "range": el += 0.9 * Math.max(0, 1 - across * 2.2) ** 2; break;
      case "strait": el -= 0.9 * Math.max(0, 1 - across * 5); break;
      case "lakes": break;
    }
    e[i] = el;
  }
  // Water: the lowest share of hexes, by kind of land and the Water setting.
  const share = {
    mainland: sides.size ? 0.04 + sides.size * (0.05 + 0.1 * o.water) : 0.02 + 0.07 * o.water,
    island: 0.38 + 0.3 * o.water, archipelago: 0.52 + 0.28 * o.water, atoll: 0.6 + 0.2 * o.water, peninsula: 0.38 + 0.25 * o.water,
    strait: 0.14 + 0.22 * o.water, range: 0.03 + 0.08 * o.water, basin: 0.05 + 0.14 * o.water, lakes: 0.07 + 0.16 * o.water,
  }[o.land];
  const sea = quantile(inside.map(i => e[i]), clamp(share, 0.01, 0.92));
  const water = new Uint8Array(N), terrain: TerrainId[] = new Array(N).fill("flat");
  for (const i of inside) water[i] = e[i] < sea ? 1 : 0;
  const eRank = new Float32Array(N); { const r = ranks(inside.map(i => e[i])); inside.forEach((i, k) => { eRank[i] = r[k]; }); }

  // Big water that reaches the edge is sea; the rest are lakes. Inland kinds of land have no sea.
  const inlandOnly = o.land === "range" || o.land === "basin" || o.land === "lakes", seen = new Uint8Array(N);
  for (const i of inside) if (water[i] && !seen[i]) {
    const stack = [i], members: number[] = []; seen[i] = 1; let touches = false;
    while (stack.length) { const k = stack.pop()!; members.push(k); if (edge[k]) touches = true; for (const j of nb[k]) if (water[j] && !seen[j]) { seen[j] = 1; stack.push(j); } }
    const kind: TerrainId = !inlandOnly && touches && members.length >= 6 ? "deep" : "lake";
    for (const k of members) terrain[k] = kind;
  }
  const depth = o.shallows < 0 ? (inside.length > 1400 ? 2 : 1) : o.shallows;
  const toLand = new Int32Array(N).fill(99); let ring = inside.filter(i => !water[i]);
  ring.forEach(i => { toLand[i] = 0; });
  for (let d = 1; d <= 3 && ring.length; d++) { const next: number[] = []; for (const k of ring) for (const j of nb[k]) if (toLand[j] > d) { toLand[j] = d; next.push(j); } ring = next; }
  for (const i of inside) if (terrain[i] === "deep" && toLand[i] <= depth) terrain[i] = "shallow";

  // Hills, mountains and high peaks on the highest land.
  const land = inside.filter(i => !water[i]), landE = land.map(i => e[i]);
  const mShare = clamp((0.02 + 0.2 * o.mountains) * (o.land === "range" ? 1.8 : 1) * Math.min(1.4, rel), 0, 0.5), hasPeaks = o.mountains >= 0.02;
  const peakT = quantile(landE, 1 - mShare * 0.3), mtT = quantile(landE, 1 - mShare), hillT = quantile(landE, 1 - Math.min(0.75, mShare * 2.2 + 0.05 * rel));
  for (const i of land) terrain[i] = hasPeaks && e[i] >= peakT ? "peak" : hasPeaks && e[i] >= mtT ? "mountain" : e[i] >= hillT ? "hills" : "flat";
  const lowland = new Float32Array(N); { const r = ranks(landE); land.forEach((i, k) => { lowland[i] = r[k]; }); }

  // Climate: hidden temperature and rainfall maps, cooler on high ground.
  const tRaw = inside.map(i => { const h = cells[i], n = tN(h.x / (U * 17), h.y / (U * 17)); return o.latitude ? n * 0.55 + (h.y / H) * 0.45 : n; });
  const mRaw = inside.map(i => hN(cells[i].x / (U * 15.6) + 50, cells[i].y / (U * 15.6) + 50));
  const tR = ranks(tRaw), mR = ranks(mRaw), spread = 0.25 + 0.95 * o.variety;
  const T = new Float32Array(N), M = new Float32Array(N);
  inside.forEach((i, k) => {
    const nearWater = nb[i].some(j => water[j]) ? 0.06 : 0;
    T[i] = clamp(0.5 + (tR[k] - 0.5) * spread + o.temp * 0.42 - Math.max(0, eRank[i] - 0.74) * 0.9, -0.2, 1.2);
    M[i] = clamp(0.5 + (mR[k] - 0.5) * spread + o.rain * 0.42 + nearWater, -0.2, 1.2);
  });
  const biome: BiomeId[] = new Array(N).fill(o.biome);
  if (o.mode === "climate") for (const i of inside) biome[i] = climateBiome(T[i], M[i]);

  // Extra lakes, then wetlands, forests and beaches on open land.
  const r2 = seededRandom(seedN ^ 0x5eed);
  for (let k = Math.round(o.lakes * inside.length / 160); k > 0; k--) {
    const i = land[Math.floor(r2() * land.length)];
    if (i === undefined || terrain[i] !== "flat" || nb[i].some(j => terrain[j] === "deep" || terrain[j] === "shallow")) continue;
    terrain[i] = "lake"; water[i] = 1;
    const flatNext = nb[i].filter(j => terrain[j] === "flat");
    if (flatNext.length && r2() < 0.6) { const j = flatNext[Math.floor(r2() * flatNext.length)]; terrain[j] = "lake"; water[j] = 1; }
  }
  for (const i of land) {
    if (terrain[i] !== "flat") continue;
    const h = cells[i], b = biome[i], nearWater = nb[i].some(j => water[j]);
    const wet = lowland[i] < 0.1 + 0.3 * o.wetlands && M[i] > 0.48 && (nearWater || M[i] > 0.75);
    if ((b === "swamp" && M[i] > 0.4 && r2() < 0.55 + 0.4 * o.wetlands) || (wet && r2() < o.wetlands * 1.2)) { terrain[i] = "marsh"; continue; }
    const score = vegN(h.x / (U * 8), h.y / (U * 8)) * 0.6 + clamp(M[i]) * 0.4 + VEG_BIAS[b];
    if (score > 1.02 - o.forest * 0.75) { terrain[i] = "forest"; continue; }
    if (nb[i].some(j => terrain[j] === "shallow" || terrain[j] === "deep") && (biomes[b].heat >= 2 || r2() < 0.25) && b !== "volcanic") terrain[i] = "beach";
  }
  // Water in the coldest places freezes.
  for (const i of inside) if (water[i] && o.mode === "climate" && T[i] < 0.12) biome[i] = "glacier";

  // Rivers: from high ground, downhill until they reach water or another river.
  const rivers: number[][] = [], onRiver = new Uint8Array(N);
  const sources = land.filter(i => terrain[i] === "mountain" || terrain[i] === "hills" || terrain[i] === "peak");
  const r3 = seededRandom(seedN ^ 0x41fe5);
  for (let k = sources.length - 1; k > 0; k--) { const j = Math.floor(r3() * (k + 1)); [sources[k], sources[j]] = [sources[j], sources[k]]; }
  for (const src of sources) {
    if (rivers.length >= o.rivers) break;
    if (rivers.some(rv => hexDistance(cells[rv[0]], cells[src]) < 5)) continue;
    const path = [src], visited = new Set([src]); let cur = src, ok = false;
    for (let step = 0; step < 60; step++) {
      const options = nb[cur].filter(j => !visited.has(j)); if (!options.length) break;
      let next = options[0], best = Infinity;
      for (const j of options) { const v = e[j] - (water[j] ? 1 : 0) + r3() * 0.01; if (v < best) { best = v; next = j; } }
      // Water only runs a little uphill; past that the river stops and pools into a lake.
      if (best > e[cur] + 0.02) break;
      path.push(next); visited.add(next);
      if (water[next] || onRiver[next]) { ok = true; break; }
      cur = next;
    }
    if (!ok && path.length > 3) { const end = path[path.length - 1]; if (terrain[end] === "flat" || terrain[end] === "forest" || terrain[end] === "marsh") { terrain[end] = "lake"; water[end] = 1; ok = true; } }
    if (ok && path.length >= 3) { rivers.push(path); for (const p of path) if (!water[p]) onRiver[p] = 1; }
  }

  let code = "";
  for (const h of cells) code += h.inside ? hexCode(biome[h.i], terrain[h.i]) : OUTSIDE;
  const counts: Partial<Record<BiomeId, number>> = {}, landCount = inside.filter(i => !water[i]).length || 1;
  for (const i of inside) if (!water[i]) counts[biome[i]] = (counts[biome[i]] ?? 0) + 1;
  const landShare = Object.fromEntries(Object.entries(counts).map(([b, n]) => [b, n! / landCount])) as Partial<Record<BiomeId, number>>;
  const R = size ?? fittingHexSize(o.cols, o.rows, o.orient), drawn = hexMapSize({ ...shape, size: R });
  return {
    layer: { x: 0, y: 0, size: R, cols: o.cols, rows: o.rows, orient: o.orient, outline: o.outline, miles: o.miles, cells: code, rivers, options: { ...o } },
    width: Math.ceil(drawn.width), height: Math.ceil(drawn.height), landShare,
  };
}

const SEED_WORDS = ["ember", "frost", "moss", "iron", "ash", "raven", "salt", "thorn", "amber", "dusk", "flint", "hollow", "reed", "cinder", "gale", "brine"];
/** A new seed that is easy to read and type, such as "moss-27". */
export function randomHexSeed(random: () => number = Math.random) {
  return `${SEED_WORDS[Math.floor(random() * SEED_WORDS.length)]}-${Math.floor(random() * 90) + 10}`;
}
