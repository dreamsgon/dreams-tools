import { encodePaint, isWater, paintScale, resizeCells, terrainIndex, terrains, tilesFromPaint, type MapData, type MapPath, type MapPin, type TerrainId } from "./map-model.ts";
import { isGeneratedPlace, placeName, riverName, seeded } from "./world-generator.ts";

/**
 * Making a whole planet from a seed: tectonic plates raise mountains where they push together,
 * the sea fills the lowest ground, warmth follows latitude, tilt and height, and wind carries rain
 * from the sea until mountains wring it out. Biomes come from warmth and rain. The map is
 * equirectangular (longitude across, latitude down) and wraps east to west.
 * The same options and seed always give the same planet. Runs in the browser only.
 */
export type PlanetLife = "none" | "simple" | "complex";
export type PlanetSize = "tiny" | "small" | "medium" | "large";
export type PlanetOptions = {
  seed: string;
  /** Share of the surface under water, 0 to 100. */
  water: number;
  /** -3 frozen to 3 scorching. */
  temp: number;
  /** 0 arid to 100 soaked. */
  rain: number;
  /** Axial tilt in degrees, 0 to 80. */
  tilt: number;
  rotation: "spin" | "locked";
  /** Plate count feel, 1 (few big continents) to 12 (many small ones). */
  plates: number;
  /** All land pulled into one supercontinent. */
  pangaea: boolean;
  mountains: number; volcanism: number; islands: number;
  /** 0 smooth to 100 fjords. */
  coast: number;
  life: PlanetLife;
  size: PlanetSize;
  /** How many towns, rivers; whether roads join the towns and landmarks are suggested. */
  places: number; rivers: number; roads: boolean; landmarks: boolean;
  /** Biomes this world doesn't have; land that would be one becomes the nearest kind that it does have. */
  biomesOff: TerrainId[];
};

export const planetSizes: Record<PlanetSize, { name: string; miles: number }> = {
  tiny: { name: "Tiny", miles: 6800 }, small: { name: "Small", miles: 13000 }, medium: { name: "Earth-sized", miles: 24900 }, large: { name: "Large", miles: 37000 },
};
export const temperatureWords: Record<string, string> = { "-3": "Frozen", "-2": "Cold", "-1": "Cool", "0": "Temperate", "1": "Warm", "2": "Hot", "3": "Scorching" };
export const rainWord = (v: number) => v < 15 ? "Arid" : v < 35 ? "Dry" : v < 60 ? "Average" : v < 80 ? "Wet" : "Soaked";

const base = { water: 70, temp: 0, rain: 50, tilt: 23, rotation: "spin", plates: 6, pangaea: false, mountains: 50, volcanism: 25, islands: 35, coast: 50, life: "complex" } as const;
export const defaultPlanetOptions = (seed = "A new world"): PlanetOptions =>
  ({ ...base, seed, size: "medium", places: 12, rivers: 10, roads: true, landmarks: true, biomesOff: [] });
export const planetPresets: { id: string; name: string; set: Partial<PlanetOptions> }[] = [
  { id: "earthlike", name: "Earth-like", set: {} },
  { id: "pangaea", name: "Supercontinent", set: { water: 66, plates: 4, pangaea: true, mountains: 55, islands: 20, coast: 45, tilt: 20, rain: 45 } },
  { id: "islands", name: "Many islands", set: { water: 84, temp: 1, rain: 65, tilt: 18, plates: 11, mountains: 35, volcanism: 45, islands: 85, coast: 75 } },
  { id: "ocean", name: "Ocean world", set: { water: 95, temp: 1, rain: 70, tilt: 15, plates: 9, islands: 70, coast: 60 } },
  { id: "desert", name: "Desert world", set: { water: 16, temp: 2, rain: 14, tilt: 25, mountains: 55, volcanism: 30, islands: 10, coast: 40 } },
  { id: "ice", name: "Ice world", set: { water: 60, temp: -2, rain: 35, tilt: 20 } },
  { id: "jungle", name: "Jungle world", set: { water: 62, temp: 2, rain: 88, tilt: 10 } },
  { id: "locked", name: "Tidally locked", set: { water: 55, rain: 55, tilt: 0, rotation: "locked" } },
  { id: "volcanic", name: "Volcanic", set: { water: 35, temp: 2, rain: 30, tilt: 12, volcanism: 95, mountains: 70, life: "simple" } },
];
/** Options for a preset, keeping the seed, size and what to add. */
export const withPreset = (o: PlanetOptions, id: string): PlanetOptions => ({ ...o, ...base, ...planetPresets.find(p => p.id === id)?.set, biomesOff: [] });

/** Land biomes a GM can leave out, and what each becomes instead. */
export const planetBiomes: TerrainId[] = ["glacier", "tundra", "boreal", "forest", "jungle", "grassland", "steppe", "savanna", "desert", "marsh", "volcanic"];
const fallback: Partial<Record<TerrainId, TerrainId>> = { glacier: "tundra", tundra: "steppe", boreal: "forest", forest: "grassland", jungle: "forest", grassland: "steppe", steppe: "grassland", savanna: "grassland", desert: "steppe", marsh: "grassland", volcanic: "mountains" };
const vegetation = new Set<TerrainId>(["boreal", "forest", "jungle", "grassland", "steppe", "savanna", "marsh"]);

function hash(text: string) {
  let n = 2166136261;
  for (const ch of text) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return n >>> 0;
}
function h3(i: number, j: number, k: number, s: number) {
  let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177) + Math.imul(s, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1103515245); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function noise3(x: number, y: number, z: number, s: number) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = h3(i, j, k, s), b = h3(i + 1, j, k, s), c = h3(i, j + 1, k, s), d = h3(i + 1, j + 1, k, s);
  const e = h3(i, j, k + 1, s), f = h3(i + 1, j, k + 1, s), g = h3(i, j + 1, k + 1, s), hh = h3(i + 1, j + 1, k + 1, s);
  const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (hh - g) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}
/** Fractal noise on the sphere, so the map has no seam. */
function fbm(x: number, y: number, z: number, s: number, octaves: number) {
  let sum = 0, amp = 1, total = 0, f = 1;
  for (let o = 0; o < octaves; o++) { sum += noise3(x * f + o * 17.3, y * f, z * f, s + o * 131) * amp; total += amp; amp *= 0.5; f *= 2.03; }
  return sum / total;
}
type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sph = (lat: number, lon: number): V3 => [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
function quantile(values: ArrayLike<number>, q: number) {
  const s = Float32Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))];
}
/** The height below which this share of the globe's surface lies, counting each row by its true area. */
function areaQuantile(e: Float32Array, w: number, h: number, q: number) {
  const order = Array.from(e.keys()).sort((a, b) => e[a] - e[b]), weight = (i: number) => Math.cos((0.5 - (Math.floor(i / w) + 0.5) / h) * Math.PI);
  let total = 0;
  for (let y = 0; y < h; y++) total += Math.cos((0.5 - (y + 0.5) / h) * Math.PI) * w;
  let sum = 0;
  for (const i of order) { sum += weight(i); if (sum >= total * q) return e[i]; }
  return e[order[order.length - 1]];
}
function randomUnit(r: () => number): V3 {
  const z = r() * 2 - 1, th = r() * Math.PI * 2, rr = Math.sqrt(1 - z * z);
  return [rr * Math.cos(th), rr * Math.sin(th), z];
}

export type PlanetLand = { w: number; h: number; e: Float32Array; up: Float32Array; sea: number; minE: number; maxE: number; peak: number; mtn: number; hill: number };
export type PlanetClimate = { e: Float32Array; temperature: Float32Array; rain: Float32Array; cells: Uint8Array };
export type Planet = PlanetLand & PlanetClimate;

/** Plates, land and sea: height for every square of a w × h map, and how volcanic each square is. */
export function planetLand(o: PlanetOptions, w: number, h: number): PlanetLand {
  const r = seeded(`${o.seed}:plates`), s = hash(o.seed) % 100000, N = 14;
  const latOf = (y: number) => (0.5 - (y + 0.5) / h) * Math.PI, lonOf = (x: number) => ((x + 0.5) / w) * 2 * Math.PI - Math.PI;
  const plates = Array.from({ length: N }, () => {
    const c = randomUnit(r), m0: V3 = [r() - 0.5, r() - 0.5, r() - 0.5], d = dot(m0, c);
    return { c, m: [m0[0] - d * c[0], m0[1] - d * c[1], m0[2] - d * c[2]] as V3, base: 0, continental: false };
  });
  const order = plates.map((_, i) => i);
  let pole: V3 | null = null;
  if (o.pangaea) {
    const p = randomUnit(r); p[2] *= 0.3; const l = Math.hypot(...p);
    pole = [p[0] / l, p[1] / l, p[2] / l];
    order.sort((a, b) => dot(plates[b].c, pole!) - dot(plates[a].c, pole!));
  } else for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const continental = Math.max(1, Math.round(N * Math.min(0.8, 1 - o.water / 100 + 0.1)));
  order.slice(0, continental).forEach(i => (plates[i].continental = true));
  for (const p of plates) p.base = p.continental ? 0.2 + r() * 0.1 : -0.2 - r() * 0.1;
  const hotspots = Array.from({ length: 2 + Math.round(o.volcanism / 25) }, () => randomUnit(r));
  const coast = o.coast / 100, mtn = 0.3 + o.mountains / 100 * 1.1, isl = o.islands / 100, volc = o.volcanism / 100;
  const warpBy = 0.3 + coast * 0.35, f0 = 0.7 + o.plates * 0.16;
  const e = new Float32Array(w * h), up = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const lat = latOf(y);
    for (let x = 0; x < w; x++) {
      const p = sph(lat, lonOf(x)), i = y * w + x;
      const q: V3 = [0, 1, 2].map(k => p[k] + (fbm(p[0] * 1.6, p[1] * 1.6, p[2] * 1.6, s + 1 + k, 3) - 0.5) * warpBy) as V3;
      let a = 0, b = 0, da = -9, db = -9;
      for (let k = 0; k < N; k++) { const dd = dot(q, plates[k].c); if (dd > da) { db = da; b = a; da = dd; a = k; } else if (dd > db) { db = dd; b = k; } }
      const boundary = Math.exp(-(da - db) / 0.03);
      const across: V3 = [plates[b].c[0] - plates[a].c[0], plates[b].c[1] - plates[a].c[1], plates[b].c[2] - plates[a].c[2]];
      const conv = (dot(plates[a].m, across) - dot(plates[b].m, across)) / (Math.hypot(...across) || 1);
      let v = (fbm(q[0] * f0, q[1] * f0, q[2] * f0, s + 5, 6) - 0.5) * (1.1 + coast * 0.3);
      v += (plates[a].base * (1 - 0.5 * boundary) + plates[b].base * 0.5 * boundary) * 0.45;
      if (pole) v += 0.32 * dot(p, pole);
      v += boundary * conv * mtn * (conv > 0 ? 0.55 : 0.2);
      v += (fbm(p[0] * 8, p[1] * 8, p[2] * 8, s + 9, 3) - 0.5) * (0.06 + coast * 0.12);
      if (!plates[a].continental) v += isl * Math.max(0, fbm(p[0] * 9, p[1] * 9, p[2] * 9, s + 17, 3) - 0.56) * 2.4;
      for (const c of hotspots) { const ang = 1 - dot(p, c); v += volc * 0.55 * Math.exp(-ang / 0.0025); up[i] += volc * Math.exp(-ang / 0.004); }
      e[i] = v;
      up[i] += boundary * Math.max(0, conv) * volc;
    }
  }
  // Sea level is set by true area, so "70% sea" means 70% of the globe rather than 70% of the flat map's squares.
  const sea = o.water <= 0 ? -99 : o.water >= 100 ? 99 : areaQuantile(e, w, h, o.water / 100);
  const land = e.filter(v => v >= sea), share = 0.02 + 0.1 * o.mountains / 100;
  let minE = Infinity, maxE = -Infinity;
  for (const v of e) { if (v < minE) minE = v; if (v > maxE) maxE = v; }
  return {
    w, h, e, up, sea, minE, maxE,
    peak: land.length ? quantile(land, 1 - share * 0.25) : 99,
    mtn: land.length ? quantile(land, 1 - share) : 99,
    hill: land.length ? quantile(land, 1 - share * 2.6) : 99,
  };
}

const averageWarmth: Record<string, number> = { "-3": -38, "-2": -18, "-1": 2, "0": 14, "1": 24, "2": 36, "3": 58 };

/** Warmth, rain and the terrain of every square, from the land (with any hand shaping added to its heights). */
export function planetClimate(o: PlanetOptions, land: PlanetLand, shaping?: Float32Array): PlanetClimate {
  const { w, h, sea, maxE } = land, n = w * h, locked = o.rotation === "locked", s = hash(o.seed) % 100000;
  const latOf = (y: number) => (0.5 - (y + 0.5) / h) * Math.PI, lonOf = (x: number) => ((x + 0.5) / w) * 2 * Math.PI - Math.PI;
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) e[i] = land.e[i] + (shaping ? shaping[i] : 0);
  const T = new Float32Array(n), P = new Float32Array(n), cells = new Uint8Array(n);
  const avg = averageWarmth[String(Math.max(-3, Math.min(3, Math.round(o.temp))))], spread = 46 - Math.min(o.tilt, 60) * 0.35, flipped = o.tilt > 54 && !locked;
  for (let y = 0; y < h; y++) {
    const lat = latOf(y), c2 = Math.cos(lat) ** 2;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, alt = e[i] >= sea ? (e[i] - sea) / Math.max(1e-6, maxE - sea) : 0;
      // A tidally locked world is warmest under its sun and dark and frozen on the far side.
      const t = locked ? avg + 44 * Math.cos(lat) * Math.cos(lonOf(x)) - 8 : avg + spread * (flipped ? (2 / 3 - c2) * 0.5 : c2 - 2 / 3);
      const p = sph(lat, lonOf(x));
      T[i] = t - alt * 34 + (fbm(p[0] * 3, p[1] * 3, p[2] * 3, s + 4242, 3) - 0.5) * 14;
    }
  }
  // Moisture carried by the wind along each row; rising ground wrings it out, leaving rain shadows behind mountains.
  const raw = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const a = Math.abs(latOf(y) * 180 / Math.PI);
    for (const half of locked ? [-1, 1] : [0]) {
      const dir = locked ? half : a < 30 ? -1 : a < 60 ? 1 : -1;
      let m = 0.6, prev = -1;
      for (let step = 0; step < w * 2; step++) {
        let x = dir > 0 ? step % w : w - 1 - (step % w);
        if (locked) { // the wind blows out from under the sun toward the dark side
          if (step >= w / 2) break;
          x = half > 0 ? (w / 2 + step) % w : ((Math.floor(w / 2) - 1 - step) % w + w) % w;
        }
        const i = y * w + x;
        if (e[i] < sea) m += (1 - m) * 0.25 * Math.min(1, Math.max(0.05, (T[i] + 15) / 45));
        else {
          const rise = prev >= 0 ? Math.max(0, e[i] - e[prev]) : 0, rain = Math.min(m, m * (0.05 + rise * 8));
          m -= rain;
          if (step >= w || locked) raw[i] = rain * 16;
        }
        prev = i;
      }
    }
  }
  for (let pass = 0; pass < 8; pass++) { // spread the rain a little
    const cp = Float32Array.from(raw);
    for (let y = 1; y < h - 1; y++) for (let x = 0; x < w; x++) { const i = y * w + x; raw[i] = (cp[i - w] + 2 * cp[i] + cp[i + w]) / 4; }
    const cq = Float32Array.from(raw);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; raw[i] = (cq[y * w + (x + w - 1) % w] + 2 * cq[i] + cq[y * w + (x + 1) % w]) / 4; }
  }
  const mult = 0.2 + o.rain / 100 * 1.6, off = new Set(o.biomesOff);
  for (let y = 0; y < h; y++) {
    const lat = latOf(y) * 180 / Math.PI, a = Math.abs(lat);
    const band = locked ? 0.1 : 0.45 * Math.exp(-((lat / 14) ** 2)) + 0.25 * Math.exp(-(((a - 55) / 16) ** 2)) - 0.22 * Math.exp(-(((a - 27) / 11) ** 2));
    for (let x = 0; x < w; x++) {
      const i = y * w + x, cold = Math.min(1, Math.max(0.15, (T[i] + 25) / 40));
      P[i] = Math.max(0, (raw[i] * 0.9 + band + 0.22) * mult * cold);
      cells[i] = terrainIndex[classify(o, land, e[i], T[i], P[i], land.up[i], off, i)];
    }
  }
  return { e, temperature: T, rain: P, cells };
}

function classify(o: PlanetOptions, L: PlanetLand, e: number, t: number, p: number, up: number, off: Set<TerrainId>, i: number): TerrainId {
  const { sea, peak, mtn, hill, minE } = L;
  if (e < sea) return t < -10 ? "seaice" : e < sea - (sea - minE) * 0.12 ? "deep" : "sea";
  const volcanic = up > 0.35 && h3(i, 7, 3, 99) < up * 0.9, low = e < sea + (hill - sea) * 0.1;
  let id: TerrainId;
  if (e >= mtn) id = volcanic && o.volcanism > 10 ? "volcanic" : e >= peak || t < -6 ? "snow" : "mountains";
  else if (e >= hill) id = volcanic && o.volcanism > 40 ? "volcanic" : t < -10 ? "tundra" : "hills";
  else if (t < -14) id = "glacier";
  else if (t < -3) id = "tundra";
  else if (t < 5) id = p < 0.25 ? "tundra" : "boreal";
  else if (t < 20) id = p < 0.2 ? "desert" : p < 0.4 ? "steppe" : p < 0.7 ? "grassland" : p > 1.25 && low ? "marsh" : "forest";
  else if (t < 42) id = p < 0.22 ? "desert" : p < 0.75 ? "savanna" : p > 1.3 && low ? "marsh" : "jungle";
  else id = p < 0.6 ? "desert" : "savanna";
  // Without complex life there are no forests or grassland: only bare ground (and marsh, for simple life).
  if (o.life !== "complex" && vegetation.has(id)) id = o.life === "simple" && id === "marsh" ? "marsh" : "barren";
  for (let k = 0; k < 4 && off.has(id) && fallback[id]; k++) id = fallback[id]!;
  return off.has(id) ? "barren" : id;
}

/** Height, warmth, rain and terrain for a whole planet. */
export function buildPlanet(o: PlanetOptions, w: number, h: number): Planet {
  const land = planetLand(o, w, h);
  return { ...land, ...planetClimate(o, land) };
}

type Feature = { name: string; cells: number[] };
/** Rivers that run downhill to the sea, towns on coasts and rivers, roads between them, and a few landmarks. */
export function planetFeatures(o: PlanetOptions, world: Planet) {
  const { w, h, e, cells, rain, temperature: T, sea, hill, up } = world, n = w * h;
  const latOf = (y: number) => (0.5 - (y + 0.5) / h) * Math.PI;
  const dist = (a: number, b: number) => { let dx = Math.abs((a % w) - (b % w)); dx = Math.min(dx, w - dx); const ya = Math.floor(a / w), yb = Math.floor(b / w); return Math.hypot(dx * Math.cos(latOf((ya + yb) / 2)), ya - yb); };
  const near = (i: number, f: (j: number) => void) => {
    const x = i % w, y = Math.floor(i / w);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy; if ((dx || dy) && yy >= 0 && yy < h) f(yy * w + (x + dx + w) % w); }
  };
  const wet = (i: number) => e[i] < sea;
  // Steps to the nearest sea, so a river that finds no lower ground still heads for the coast.
  const toSea = new Int32Array(n).fill(-1), queue: number[] = [];
  for (let i = 0; i < n; i++) if (wet(i)) { toSea[i] = 0; queue.push(i); }
  for (let k = 0; k < queue.length; k++) { const i = queue[k]; near(i, j => { if (toSea[j] < 0) { toSea[j] = toSea[i] + 1; queue.push(j); } }); }
  const r = seeded(`${o.seed}:rivers`), used = new Int32Array(n).fill(-1), rivers: Feature[] = [];
  const sources: number[] = [];
  for (let i = 0; i < n; i++) if (!wet(i) && e[i] > hill && rain[i] > 0.35 && T[i] > -8 && toSea[i] > 3) sources.push(i);
  sources.sort((a, b) => e[b] - e[a]);
  const spacing = 9 * w / 320, picked: number[] = [];
  for (const i of sources) { if (picked.length > o.rivers * 4) break; if (picked.every(j => dist(i, j) > spacing)) picked.push(i); }
  for (const start of picked) {
    if (rivers.length >= o.rivers) break;
    const route = [start], seen = new Set(route);
    let cur = start;
    while (toSea[cur] > 0 && route.length < 400) {
      let best = -1, low = Infinity;
      near(cur, j => { if (!seen.has(j) && e[j] < e[cur]) { const v = e[j] + r() * 0.004; if (v < low) { low = v; best = j; } } });
      if (best < 0) near(cur, j => { if (toSea[j] >= 0 && toSea[j] < toSea[cur]) { const v = e[j] + r() * 0.02; if (v < low) { low = v; best = j; } } });
      if (best < 0) break;
      seen.add(best); route.push(best); cur = best;
      if (used[best] >= 0) break;
    }
    if (route.length < 7 * w / 320) continue;
    for (const i of route) if (used[i] < 0) used[i] = rivers.length;
    rivers.push({ name: riverName(r), cells: route });
  }
  // Towns: coasts and rivers in mild land with enough rain.
  const pr = seeded(`${o.seed}:places`), candidates: { i: number; score: number }[] = [];
  const unfit = new Set(["glacier", "snow", "mountains", "volcanic"].map(id => terrainIndex[id as TerrainId]));
  for (let i = 0; i < n; i++) {
    if (wet(i) || unfit.has(cells[i]) || T[i] < -4 || T[i] > 38) continue;
    candidates.push({ i, score: (toSea[i] <= 1 ? 1 : 0.2) + (used[i] >= 0 ? 0.8 : 0) + Math.min(0.6, rain[i] * 0.5) + (o.life === "complex" ? 0 : -0.3) + pr() * 0.7 });
  }
  candidates.sort((a, b) => b.score - a.score);
  const want = Math.min(o.places, Math.floor(candidates.length / (90 * (w * h) / (320 * 160)))), gap = Math.max(5 * w / 320, Math.sqrt(Math.max(1, candidates.length) / Math.max(1, want)) * 0.75);
  const places: { i: number; name: string; kind: "city" | "town" | "village" }[] = [], names = new Set<string>();
  for (const c of candidates) {
    if (places.length >= want) break;
    if (places.some(p => dist(p.i, c.i) < gap)) continue;
    let name = placeName(pr);
    for (let k = 0; names.has(name) && k < 5; k++) name = placeName(pr);
    if (names.has(name)) continue;
    names.add(name);
    places.push({ i: c.i, name, kind: places.length < Math.max(1, Math.round(want / 5)) ? "city" : places.length > want * 0.65 ? "village" : "town" });
  }
  // Roads: the shortest links joining the towns, leaving out long links and links over the sea.
  const roads: [number, number][] = [];
  if (o.roads && places.length > 1) {
    const joined = new Set([0]);
    while (joined.size < places.length) {
      let best: [number, number] = [0, 0], bd = Infinity;
      for (const a of joined) for (let b = 0; b < places.length; b++) if (!joined.has(b)) { const d = dist(places[a].i, places[b].i); if (d < bd) { bd = d; best = [a, b]; } }
      joined.add(best[1]);
      const A = places[best[0]].i, B = places[best[1]].i, ax = A % w, ay = Math.floor(A / w), bx = B % w, by = Math.floor(B / w);
      if (bd > 40 * w / 320 || Math.abs(bx - ax) > w / 2) continue;
      let sea = 0;
      for (let k = 1; k < 12; k++) if (wet(Math.round(ay + (by - ay) * k / 12) * w + Math.round(ax + (bx - ax) * k / 12))) sea++;
      if (sea <= 1) roads.push([A, B]);
    }
  }
  // Landmarks this world suggests, which the GM can move, rename or remove.
  const marks: { i: number; name: string; icon: string }[] = [];
  if (o.landmarks) {
    // Each landmark keeps clear of the towns and the other landmarks, so their names don't overlap.
    const clear = (i: number) => [...places, ...marks].every(p => dist(p.i, i) > 6 * w / 320);
    const bestOf = (ok: (i: number) => boolean, key: (i: number) => number) => { let bi = -1, bv = -Infinity; for (let i = 0; i < n; i++) if (ok(i) && clear(i)) { const v = key(i); if (v > bv) { bv = v; bi = i; } } return bi; };
    const is = (...ids: TerrainId[]) => { const set = new Set(ids.map(id => terrainIndex[id])); return (i: number) => set.has(cells[i]); };
    const add = (i: number, name: string, icon: string) => { if (i >= 0) marks.push({ i, name, icon }); };
    add(bestOf(is("volcanic"), i => up[i]), `Mount ${placeName(pr).replace(/(ford|mere|wick|holm|stead|haven|gate|moor|dale|watch|brook|fell|port|crest|by|ton)$/i, "")}`, "volcano");
    add(bestOf(is("desert"), i => toSea[i]), `Ruins of ${placeName(pr)}`, "ruins");
    add(bestOf(is("jungle", "forest"), i => toSea[i] + pr() * 3), "The Elder Tree", "tree");
    add(bestOf(is("tundra", "glacier"), i => toSea[i] + pr() * 2), "Starfall Crater", "crater");
    add(bestOf(is("grassland", "steppe", "barren"), () => pr()), "The Old Stones", "stones");
  }
  return { rivers, places, roads, marks };
}

/** The icon for a generated town: the first city is the capital; a world without complex life gets colonies and outposts. */
function settlementIcon(kind: "city" | "town" | "village", first: boolean, settled: boolean) {
  if (!settled) return first ? "spaceport" : { city: "dome", town: "rig", village: "station" }[kind];
  return first ? "capital" : kind;
}

/** The map size a planet uses: twice as wide as it is tall, with the finest paint the map allows. */
export const PLANET_COLUMNS = 40, PLANET_ROWS = 20;

/** The paint size of a planet map, in squares. */
export const planetMapSize = () => { const k = paintScale(PLANET_COLUMNS, PLANET_ROWS); return { w: PLANET_COLUMNS * k, h: PLANET_ROWS * k }; };

/** The climate settings a planet map keeps, so shaping its land by hand later gives matching biomes. */
export const planetSettings = (o: PlanetOptions): NonNullable<MapData["planet"]> => ({
  temp: Math.max(-3, Math.min(3, Math.round(o.temp))), rain: Math.round(o.rain), tilt: Math.round(o.tilt), rotation: o.rotation, life: o.life, size: o.size,
  volcanism: Math.round(o.volcanism), biomesOff: [...o.biomesOff],
});
/** Options for a planet map from the settings it was made with (or Earth-like ones), using the map's seed. */
export const planetOptionsOf = (map: Pick<MapData, "seed" | "planet">, patch: Partial<PlanetOptions> = {}): PlanetOptions =>
  ({ ...defaultPlanetOptions(map.seed || "world"), ...map.planet, ...patch });

/**
 * Heights for land shaped by hand: sea level is 0, hills start at 0.15, mountains at 0.3 and snowy peaks at 0.42.
 * Deep sea is below -0.22. Volcanic squares stay volcanic.
 */
export const SHAPED = { sea: 0, deep: -0.22, hill: 0.15, mtn: 0.3, peak: 0.42 };
export function landFromHeights(e: Float32Array, cells: ArrayLike<number>, w: number, h: number): PlanetLand {
  const volcanic = terrainIndex.volcanic, up = new Float32Array(w * h);
  let maxE = 0.5;
  for (let i = 0; i < w * h; i++) { if (cells[i] === volcanic) up[i] = 1; if (e[i] > maxE) maxE = e[i]; }
  // classify() calls a square deep below sea - (sea - minE) * 0.12, so minE is set to put that at SHAPED.deep.
  return { w, h, e, up, sea: SHAPED.sea, minE: SHAPED.deep / 0.12, maxE, peak: SHAPED.peak, mtn: SHAPED.mtn, hill: SHAPED.hill };
}

/** The places, rivers and roads for a planet map; places already on the map that anyone has worked on stay. */
export function planetPlaces(o: PlanetOptions, map: MapData, world: Planet): Pick<MapData, "pins" | "paths"> {
  const { w, h } = world, found = planetFeatures(o, world), seed = o.seed.slice(0, 100);
  const at = (i: number) => ({ x: ((i % w) + 0.5) / w, y: (Math.floor(i / w) + 0.5) / h });
  const id = (kind: string, salt: string) => `${kind}-${hash(`${seed}:${salt}`).toString(36)}`;
  const kept = map.pins.filter(p => !isGeneratedPlace(p, map)), taken = new Set(kept.map(p => p.title.toLowerCase()));
  const added: MapPin[] = [
    ...found.places.map((p, n) => ({ id: id("place", `${p.i}`), title: p.name, kind: p.kind, icon: settlementIcon(p.kind, n === 0, o.life === "complex"), ...at(p.i), notes: "", entryId: null, visibility: "gm" as const })),
    ...found.marks.map(m => ({ id: id("place-mark", `${m.i}`), title: m.name, kind: "landmark" as const, icon: m.icon, ...at(m.i), notes: "", entryId: null, visibility: "gm" as const })),
  ].filter(p => !taken.has(p.title.toLowerCase()) && !kept.some(q => q.id === p.id));
  const pins = [...kept, ...added].slice(0, 100);
  const paths: MapPath[] = [];
  found.rivers.forEach((river, n) => {
    // A river that crosses the map's east-west seam is drawn as two pieces.
    let piece: number[] = [];
    const pieces: number[][] = [piece];
    river.cells.forEach((c, i) => { if (i && Math.abs((c % w) - (river.cells[i - 1] % w)) > w / 2) pieces.push(piece = []); piece.push(c); });
    pieces.filter(p => p.length > 2).forEach((p, part) => paths.push({
      id: id("gen-river", `${n}:${part}:${p[0]}`), kind: "river", name: river.name, visibility: "gm",
      points: p.filter((_, i) => i % 2 === 0 || i === p.length - 1).slice(0, 400).map(at),
    }));
  });
  const r = seeded(`${seed}:roads`);
  for (const [a, b] of found.roads) {
    const A = at(a), B = at(b), nx = -(B.y - A.y), ny = B.x - A.x, points = [A];
    for (const t of [0.33, 0.66]) { const wob = (r() - 0.5) * 0.18; points.push({ x: Math.min(1, Math.max(0, A.x + (B.x - A.x) * t + nx * wob)), y: Math.min(1, Math.max(0, A.y + (B.y - A.y) * t + ny * wob)) }); }
    points.push(B);
    paths.push({ id: id("gen-road", `${a}:${b}`), kind: "road", name: "", points, visibility: "gm" });
  }
  return { pins, paths: [...(map.paths ?? []).filter(p => !p.id.startsWith("gen-")), ...paths].slice(0, 300) };
}

type PlanetPatch = Pick<MapData, "columns" | "rows" | "fog" | "hexes" | "party" | "paint" | "tiles" | "seed" | "scale" | "pins" | "paths" | "planet">;
/** The map size, terrain, width and climate settings for a planet map made from these terrain squares. */
function planetMap(o: PlanetOptions, map: MapData, cells: Uint8Array) {
  const { w, h } = planetMapSize(), paint = { columns: w, rows: h, cells: encodePaint(cells) };
  const cellsNow = resizeCells(map, PLANET_COLUMNS, PLANET_ROWS), miles = planetSizes[o.size].miles;
  return {
    ...cellsNow, paint, tiles: tilesFromPaint({ ...map, ...cellsNow }, paint), seed: o.seed.slice(0, 100), planet: planetSettings(o),
    scale: { width: map.scale?.unit === "km" ? Math.round(miles * 1.609) : miles, unit: map.scale?.unit ?? "mi" as const },
  };
}

/**
 * The parts of a map that a generated planet replaces, from a planet already built at the map's size (or built here).
 * Places already on the map that anyone has worked on stay.
 */
export function generatePlanet(o: PlanetOptions, map: MapData, built?: Planet): PlanetPatch {
  const { w, h } = planetMapSize(), world = built && built.w === w && built.h === h ? built : buildPlanet(o, w, h);
  return { ...planetMap(o, map, world.cells), ...planetPlaces(o, map, world) };
}

/**
 * An empty sea the size of a planet to draw land on, with sea ice where this world is cold enough.
 * Places anyone has worked on stay; generated towns, rivers and roads go.
 */
export function handPlanet(o: PlanetOptions, map: MapData): PlanetPatch {
  const { w, h } = planetMapSize(), cells = new Uint8Array(w * h).fill(terrainIndex.sea);
  const climate = planetClimate(o, landFromHeights(new Float32Array(w * h).fill(-0.1), cells, w, h));
  return { ...planetMap(o, map, climate.cells), pins: map.pins.filter(p => !isGeneratedPlace(p, map)), paths: (map.paths ?? []).filter(p => !p.id.startsWith("gen-")) };
}

export type PlanetStats = {
  /** Share of the whole surface for each terrain number, weighted by true area (squares near the poles are smaller). */
  shares: number[];
  land: number; ice: number;
  /** Share of the land that is mild and open enough to live on. */
  livable: number;
};
/** How much of the surface is land, ice and each terrain, and how much of the land people could live on. */
export function planetStats(world: Pick<Planet, "w" | "h" | "cells" | "temperature">): PlanetStats {
  const { w, h, cells, temperature: T } = world, shares = new Array(terrains.length).fill(0);
  const harsh = new Set(["glacier", "snow", "desert", "barren", "volcanic", "mountains"].map(id => terrainIndex[id as TerrainId]));
  const frozen = new Set(["seaice", "glacier", "snow"].map(id => terrainIndex[id as TerrainId]));
  let total = 0, land = 0, ice = 0, livable = 0;
  for (let y = 0; y < h; y++) {
    const weight = Math.cos((0.5 - (y + 0.5) / h) * Math.PI);
    for (let x = 0; x < w; x++) {
      const i = y * w + x, t = cells[i];
      shares[t] += weight; total += weight;
      if (frozen.has(t)) ice += weight;
      if (isWater(t)) continue;
      land += weight;
      if (!harsh.has(t) && T[i] > -2 && T[i] < 34) livable += weight;
    }
  }
  return { shares: shares.map(v => v / total), land: land / total, ice: ice / total, livable: land ? livable / land : 0 };
}

export type PlanetCheck = { kind: "ok" | "note"; text: string };
/** Quick checks of whether the settings hang together, written for a GM rather than a physicist. */
export function planetChecks(o: PlanetOptions, stats?: PlanetStats): PlanetCheck[] {
  const out: PlanetCheck[] = [], note = (text: string) => out.push({ kind: "note", text });
  if (o.rotation === "locked") {
    out.push({ kind: "ok", text: "Tidally locked: the day side bakes, the night side freezes, and the livable land is a ring along the twilight edge." });
    if (o.tilt > 5) note("Tidally locked worlds end up with almost no tilt, so tilt is ignored here.");
  } else {
    out.push({ kind: "ok", text: "Deserts sit near 25 to 30 degrees north and south where dry air sinks; the wettest land is near the equator and on coasts the wind blows onto." });
    if (o.tilt > 54) note(`At ${o.tilt}° the poles get more sun over a year than the equator, so the ice gathers near the equator.`);
  }
  if (o.water < 15 && o.rain > 55) note("Very little sea to rain from. Rain this heavy needs water from somewhere, like great lakes or melting ice.");
  if (o.temp >= 3 && o.water > 40) note("Scorching with open seas: the heat would boil them into a thick, steamy sky.");
  if (o.temp <= -3 && o.life === "complex") note("Life can last under the ice of a frozen world, but forests and grassland on top are a stretch.");
  if (o.size === "tiny" && o.water > 20) note("A world this small has weak gravity and slowly loses its air and seas to space.");
  if (o.life !== "complex" && o.places > 0) note("No plants or animals, so towns read as colonies or outposts.");
  if (stats && o.places > 0 && stats.land > 0 && stats.livable < 0.08) note("Hardly any of the land is mild enough to live on, so towns will be few and far between.");
  if (o.pangaea && o.water > 85) note("A supercontinent needs land to gather: with this much sea it is only a large island.");
  return out;
}

const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const terrainRgb = terrains.map(t => rgb(t.color));
/** The planet's colours as RGBA pixels, lit from the north-west so mountains stand out; used for the globe and small previews. */
export function planetPixels(world: Pick<Planet, "w" | "h" | "cells" | "e" | "sea" | "maxE">): Uint8ClampedArray {
  const { w, h, cells, e, sea, maxE } = world, out = new Uint8ClampedArray(w * h * 4), relief = 6 / Math.max(1e-6, maxE - sea);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = terrainRgb[cells[i]] ?? terrainRgb[0];
    const k = isWater(cells[i]) ? 1 : Math.max(0.75, Math.min(1.2, 1 + (e[i] - e[y * w + (x + 1) % w] + e[i] - e[Math.min(h - 1, y + 1) * w + x]) * relief));
    out[i * 4] = c[0] * k; out[i * 4 + 1] = c[1] * k; out[i * 4 + 2] = c[2] * k; out[i * 4 + 3] = 255;
  }
  return out;
}
