import { encodePaint, paintScale, tilesFromPaint, type MapData, type MapPaint, type MapPath, type MapPin } from "./map-model.ts";

/**
 * Making a whole world from a seed: land and sea shaped by the kind of map, mountains where the
 * ground is highest, climate from north to south, and towns with made-up names.
 * The same options and seed always give the same world.
 */
export type WorldKind = "continent" | "coast" | "archipelago" | "inland";
export type WorldClimate = "cold" | "temperate" | "warm" | "mixed";
export type WorldAcross = "region" | "kingdom" | "continent";
export type WorldOptions = {
  kind: WorldKind; across: WorldAcross; climate: WorldClimate; seed: string;
  seaLevel: number; mountains: number; places: boolean; columns: number; rows: number;
};

export const worldKinds: { id: WorldKind; name: string; hint: string }[] = [
  { id: "continent", name: "Continent", hint: "One big landmass" },
  { id: "coast", name: "Coast", hint: "Land on one side, sea on the other" },
  { id: "archipelago", name: "Archipelago", hint: "Scattered islands" },
  { id: "inland", name: "Inland", hint: "A region with lakes, no coast" },
];
export const worldAcross: Record<WorldAcross, { name: string; miles: number; places: number }> = {
  region: { name: "Region", miles: 200, places: 6 },
  kingdom: { name: "Kingdom", miles: 600, places: 9 },
  continent: { name: "Continent", miles: 2000, places: 12 },
};
export const worldClimates: { id: WorldClimate; name: string }[] = [
  { id: "cold", name: "Cold" }, { id: "temperate", name: "Temperate" }, { id: "warm", name: "Warm" }, { id: "mixed", name: "Mixed" },
];
export const defaultWorldOptions = (columns = 24, rows = 18, seed = "A new world"): WorldOptions =>
  ({ kind: "continent", across: "kingdom", climate: "temperate", seed, seaLevel: 0.5, mountains: 0.4, places: true, columns, rows });

function hash(text: string) {
  let n = 2166136261;
  for (const ch of text) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return n >>> 0;
}
/** A small seeded random number source. */
export function seeded(seed: string) {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function valueNoise(seed: number) {
  const at = (i: number, j: number) => {
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return a + (b - a) * v;
  };
}
function fbm(seed: number, octaves = 4) {
  const layers = Array.from({ length: octaves }, (_, k) => valueNoise(seed + k * 101));
  return (x: number, y: number) => {
    let sum = 0, amp = 1, freq = 1, total = 0;
    for (const n of layers) { sum += n(x * freq, y * freq) * amp; total += amp; amp *= 0.5; freq *= 2; }
    return sum / total;
  };
}
function quantile(values: Float32Array | number[], q: number) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)))];
}

const starts = ["Ash", "Bel", "Bram", "Cal", "Cor", "Dun", "El", "Fen", "Gal", "Hal", "Ir", "Kel", "Lor", "Mar", "Nor", "Os", "Pell", "Quen", "Rav", "Sal", "Tor", "Ul", "Ver", "Wyn", "Yar", "Zan"];
const middles = ["", "", "a", "e", "i", "o", "an", "en", "ar", "or", "il"];
const ends = ["ford", "mere", "wick", "holm", "stead", "haven", "gate", "moor", "dale", "watch", "brook", "fell", "port", "crest", "by", "ton"];
/** A made-up place name. */
export function placeName(random: () => number) {
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  const name = pick(starts) + pick(middles) + pick(ends);
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/** Height, wetness and warmth for every paint square. */
export function worldTerrain(o: WorldOptions): MapPaint { return buildWorld(o).paint; }

type BuiltWorld = { paint: MapPaint; cells: Uint8Array; height: Float32Array; w: number; h: number; sea: number };
function buildWorld(o: WorldOptions): BuiltWorld {
  const k = paintScale(o.columns, o.rows), w = o.columns * k, h = o.rows * k, n = hash(o.seed || "world");
  const aspect = w / h, base = fbm(n, 5), detail = fbm(n + 7, 3), wet = fbm(n + 31, 4), warp = fbm(n + 53, 2);
  const freq = o.kind === "archipelago" ? 5.5 : 3.2;
  const side = n % 4;
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = y / (h - 1);
    const wx = u + (warp(u * 2, v * 2) - 0.5) * 0.25, wy = v + (warp(u * 2 + 9, v * 2 + 9) - 0.5) * 0.25;
    let e = base(wx * freq * aspect, wy * freq) * 0.75 + detail(u * 12 * aspect, v * 12) * 0.25;
    const dx = (wx - 0.5) * 2, dy = (wy - 0.5) * 2;
    if (o.kind === "continent") e += 0.28 - 0.55 * (dx * dx + dy * dy);
    if (o.kind === "coast") { const t = [wx, 1 - wx, wy, 1 - wy][side]; e += 0.45 * (1 - t) - 0.1; }
    if (o.kind === "archipelago") e -= 0.25 * Math.max(Math.abs(dx), Math.abs(dy)) ** 4;
    if (o.kind === "inland") e += 0.1;
    height[y * w + x] = e;
  }
  const seaShare = o.kind === "inland" ? Math.min(0.15, o.seaLevel * 0.2) : Math.min(0.9, Math.max(0.1, o.seaLevel));
  const sea = quantile(height, seaShare);
  const land = Array.from(height).filter(e => e >= sea);
  const mountainShare = 0.02 + 0.13 * o.mountains;
  const mountain = quantile(land, 1 - mountainShare), hill = quantile(land, 1 - mountainShare * 2.4), peak = quantile(land, 1 - mountainShare * 0.3);
  const warmth = { cold: -0.35, temperate: 0, warm: 0.35, mixed: 0 }[o.climate], spread = o.climate === "mixed" ? 1.3 : 0.6;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, e = height[i];
    if (e < sea) continue;
    const u = x / (w - 1), v = y / (h - 1);
    const lift = (e - sea) / Math.max(1e-6, (peak - sea));
    const temp = warmth + (v - 0.5) * spread - lift * 0.35 + (detail(u * 4 + 3, v * 4 + 3) - 0.5) * 0.3;
    const m = wet(u * 4 * aspect, v * 4);
    if (e >= mountain) { cells[i] = e >= peak ? 7 : 4; continue; }
    if (e >= hill) { cells[i] = temp < -0.45 ? 7 : 3; continue; }
    if (temp < -0.5) cells[i] = 7;
    else if (m > 0.62 && e < sea + (hill - sea) * 0.12) cells[i] = 6;
    else if (m > 0.55 - (temp < 0 ? 0.05 : 0)) cells[i] = 2;
    else if (temp > 0.25 && m < 0.42) cells[i] = 5;
    else cells[i] = 1;
  }
  return { paint: { columns: w, rows: h, cells: encodePaint(cells) }, cells, height, w, h, sea };
}

/** Towns spread over the land, near the coast where there is one, never on mountains. */
export function worldPlaces(paint: MapPaint, cells: Uint8Array, count: number, seed: string): MapPin[] {
  const random = seeded(`${seed}:places`), { columns: w, rows: h } = paint, out: MapPin[] = [], names = new Set<string>();
  const t = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : cells[y * w + x]);
  const candidates: { x: number; y: number; score: number }[] = [];
  const step = Math.max(2, Math.round(Math.min(w, h) / 40));
  const mx = Math.max(step, Math.round(w * 0.06)), my = Math.max(step, Math.round(h * 0.08));
  for (let y = my; y < h - my; y += step) for (let x = mx; x < w - mx; x += step) {
    if (x < w * 0.25 && y > h * 0.8) continue; // leave room for the scale bar
    const v = t(x, y);
    if (v === 0 || v === 4 || v === 7) continue;
    let coast = false;
    for (let dy = -3; dy <= 3 && !coast; dy++) for (let dx = -3; dx <= 3; dx++) if (t(x + dx * step / 2, y + dy * step / 2) === 0) { coast = true; break; }
    candidates.push({ x, y, score: (coast ? 1 : 0.5) + (v === 1 ? 0.3 : 0) + random() * 0.8 });
  }
  candidates.sort((a, b) => b.score - a.score);
  const gap = Math.hypot(w, h) / (count * 0.9 + 2);
  for (const c of candidates) {
    if (out.length >= count) break;
    if (out.some(p => Math.hypot(p.x * w - c.x, p.y * h - c.y) < gap)) continue;
    let name = placeName(random);
    for (let tries = 0; names.has(name) && tries < 5; tries++) name = placeName(random);
    if (names.has(name)) continue;
    names.add(name);
    out.push({ id: `place-${hash(`${seed}:${c.x}:${c.y}`).toString(36)}`, title: name, x: (c.x + 0.5) / w, y: (c.y + 0.5) / h, notes: "", entryId: null, visibility: "gm" });
  }
  return out;
}

const riverEnds = ["run", "water", "flow", "brook", "wash", "rill", "burn"];
/** A made-up river name. */
export function riverName(random: () => number) {
  const name = starts[Math.floor(random() * starts.length)] + riverEnds[Math.floor(random() * riverEnds.length)];
  return `The ${name.charAt(0).toUpperCase()}${name.slice(1).toLowerCase()}`;
}

/** Rivers that start high in the mountains and run downhill until they reach the sea or join another river. */
export function worldRivers(world: BuiltWorld, count: number, seed: string): MapPath[] {
  const { w, h, height, cells } = world, random = seeded(`${seed}:rivers`), used = new Int32Array(w * h).fill(-1), out: MapPath[] = [];
  const sources = Array.from(cells.keys()).filter(i => cells[i] === 4 || cells[i] === 7).sort((a, b) => height[b] - height[a]);
  const gap = Math.min(w, h) / 5, starts: number[] = [];
  for (const i of sources) {
    if (starts.length >= count * 3) break;
    if (starts.every(j => Math.hypot((i % w) - (j % w), Math.floor(i / w) - Math.floor(j / w)) > gap)) starts.push(i);
  }
  // Distance to the sea, so every step of a river gets closer to it.
  const toSea = new Int32Array(w * h).fill(-1), queue: number[] = [];
  for (let i = 0; i < w * h; i++) if (cells[i] === 0) { toSea[i] = 0; queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % w, y = Math.floor(i / w);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (toSea[j] < 0) { toSea[j] = toSea[i] + 1; queue.push(j); }
    }
  }
  for (const start of starts) {
    if (out.length >= count) break;
    if (toSea[start] < 0) continue;
    const route = [start];
    let cur = start, ended = false;
    while (toSea[cur] > 0) {
      const x = cur % w, y = Math.floor(cur / w);
      let best = -1, low = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (toSea[j] >= toSea[cur]) continue;
        const e = height[j] + random() * 0.03;
        if (e < low) { low = e; best = j; }
      }
      if (best < 0) break;
      route.push(best); cur = best;
      if (used[best] >= 0) break;
    }
    ended = toSea[cur] === 0 || used[cur] >= 0;
    if (!ended || route.length < Math.min(w, h) / 6) continue;
    for (const i of route) if (used[i] < 0) used[i] = out.length;
    const points = route.filter((_, i) => i % 3 === 0 || i === route.length - 1).map(i => ({ x: ((i % w) + 0.5) / w, y: (Math.floor(i / w) + 0.5) / h }));
    out.push({ id: `gen-river-${hash(`${seed}:${start}`).toString(36)}`, kind: "river", name: riverName(random), points: points.slice(0, 400), visibility: "gm" });
  }
  return out;
}

/** Roads joining the towns: the shortest set of links that connects them all, leaving out links that cross open sea. */
export function worldRoads(world: BuiltWorld, towns: MapPin[], seed: string): MapPath[] {
  const { w, h, cells } = world, random = seeded(`${seed}:roads`), out: MapPath[] = [];
  const seaShare = (a: MapPin, b: MapPin) => {
    let sea = 0;
    for (let k = 1; k < 20; k++) { const x = Math.floor((a.x + (b.x - a.x) * k / 20) * w), y = Math.floor((a.y + (b.y - a.y) * k / 20) * h); if (!cells[y * w + x]) sea++; }
    return sea / 19;
  };
  if (towns.length < 2) return out;
  const joined = new Set([0]);
  while (joined.size < towns.length) {
    let best: [number, number] | null = null, dist = Infinity;
    for (const i of joined) for (let j = 0; j < towns.length; j++) {
      if (joined.has(j)) continue;
      const d = Math.hypot(towns[i].x - towns[j].x, (towns[i].y - towns[j].y) * h / w);
      if (d < dist) { dist = d; best = [i, j]; }
    }
    if (!best) break;
    const [i, j] = best;
    joined.add(j);
    const a = towns[i], b = towns[j];
    if (seaShare(a, b) > 0.15 || dist > 0.45) continue;
    const nx = -(b.y - a.y), ny = b.x - a.x, points = [{ x: a.x, y: a.y }];
    for (const t of [0.33, 0.66]) { const wob = (random() - 0.5) * 0.18; points.push({ x: Math.min(1, Math.max(0, a.x + (b.x - a.x) * t + nx * wob)), y: Math.min(1, Math.max(0, a.y + (b.y - a.y) * t + ny * wob)) }); }
    points.push({ x: b.x, y: b.y });
    out.push({ id: `gen-road-${hash(`${seed}:${a.id}:${b.id}`).toString(36)}`, kind: "road", name: "", points, visibility: "gm" });
  }
  return out;
}

/** Pins a generated world added earlier and nobody has changed since, which a new world replaces. */
export const isGeneratedPlace = (p: MapPin, map: MapData) => p.id.startsWith("place-") && !p.notes && !p.entryId && !p.areaMapId && !(map.routes ?? []).some(r => r.stops.includes(p.id));

/** The parts of a map that a generated world replaces. Places already on the map stay; new towns are added after them. */
export function generateWorld(o: WorldOptions, map: MapData): Pick<MapData, "paint" | "tiles" | "seed" | "scale" | "pins" | "paths"> {
  const world = buildWorld(o), paint = world.paint;
  const kept = map.pins.filter(p => !isGeneratedPlace(p, map));
  const taken = new Set(kept.map(p => p.title.toLowerCase()));
  const added = o.places ? worldPlaces(paint, world.cells, worldAcross[o.across].places, o.seed).filter(p => !taken.has(p.title.toLowerCase()) && !kept.some(q => q.id === p.id)) : [];
  added.forEach((p, i) => { p.kind = i < Math.max(1, Math.round(added.length / 5)) ? "city" : i >= added.length - Math.round(added.length / 3) ? "village" : "town"; });
  const pins = [...kept, ...added].slice(0, 100), placed = added.filter(p => pins.includes(p));
  const rivers = worldRivers(world, { region: 2, kingdom: 4, continent: 6 }[o.across], o.seed);
  const roads = o.places ? worldRoads(world, placed, o.seed) : [];
  const paths = [...(map.paths ?? []).filter(p => !p.id.startsWith("gen-")), ...rivers, ...roads].slice(0, 300);
  return {
    paint, tiles: tilesFromPaint({ ...map, columns: o.columns, rows: o.rows }, paint), seed: o.seed.slice(0, 100),
    scale: { width: map.scale?.unit === "km" ? Math.round(worldAcross[o.across].miles * 1.609) : worldAcross[o.across].miles, unit: map.scale?.unit ?? "mi" },
    pins, paths,
  };
}
