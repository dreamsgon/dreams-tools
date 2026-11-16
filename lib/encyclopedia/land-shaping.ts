import { isWater, terrainIndex, terrains, type MapData } from "./map-model.ts";
import { isGeneratedPlace } from "./world-generator.ts";
import { SHAPED, landFromHeights, planetClimate, planetOptionsOf, planetPlaces, type PlanetOptions } from "./planet-generator.ts";

/**
 * Shaping land by hand: draw land or sea, raise hills and mountains, lower or flatten them.
 * Painted maps keep only terrain, so heights are read back from it (sea, lowland, hills, mountains, peaks),
 * rising gently away from the coast so rivers still find the sea. On a planet map the climate follows the new land:
 * a range casts a rain shadow, cold heights freeze. Runs in the browser only.
 */
export type ShapeMode = "land" | "sea" | "raise" | "lower" | "flatten";
/** Planet options from a map's saved climate, for finishShape. */
export { planetOptionsOf };

const T = terrainIndex;
const relief = new Set([T.hills, T.mountains, T.snow, T.volcanic]);
/** Lowland: land that isn't hills, mountains, peaks or a volcano. */
const lowland = (t: number) => !isWater(t) && !relief.has(t);

/** How high each terrain stands, before the gentle rise away from the coast and the bumps of the ground. */
const baseHeight = (t: number) => t === T.deep ? -0.3 : isWater(t) ? -0.1 : t === T.snow ? 0.45 : t === T.mountains || t === T.volcanic ? 0.34 : t === T.hills ? 0.2 : 0.01;
/** How far land rises with distance from the sea, at most, so it never climbs into the next kind of ground. */
const riseCap = (t: number) => t === T.snow ? 0.2 : t === T.mountains || t === T.volcanic ? 0.005 : t === T.hills ? 0.025 : 0.06;
const h2 = (x: number, y: number) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
/**
 * Small bumps in the ground, the same every time for a square. Wind rising over them drops rain, so hand-drawn land
 * gets about as much rain as generated land rather than being dry and flat. Never enough to change the kind of ground.
 */
const bump = (i: number, w: number) => { const x = i % w, y = Math.floor(i / w); return 0.04 * h2(x, y) + 0.03 * h2(x >> 3, (y >> 3) + 7919); };

/** Heights for every square of a painted map, read from its terrain. Planet maps wrap east to west. */
export function heightsFromCells(cells: ArrayLike<number>, w: number, h: number, wrap: boolean) {
  const n = w * h, toSea = new Int32Array(n).fill(-1), queue: number[] = [];
  for (let i = 0; i < n; i++) if (isWater(cells[i])) { toSea[i] = 0; queue.push(i); }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], x = i % w, y = Math.floor(i / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let xx = x + dx; const yy = y + dy;
      if (wrap) xx = (xx + w) % w;
      if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
      const j = yy * w + xx;
      if (toSea[j] < 0) { toSea[j] = toSea[i] + 1; queue.push(j); }
    }
  }
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = cells[i];
    e[i] = baseHeight(t) + (isWater(t) ? 0 : bump(i, w) + Math.min(riseCap(t), 0.005 * (toSea[i] < 0 ? 40 : toSea[i])));
  }
  return e;
}

/** 0 deep sea, 1 sea, 2 lowland, 3 hills, 4 mountains, 5 peaks. */
const band = (e: number) => e < SHAPED.deep ? 0 : e < SHAPED.sea ? 1 : e < SHAPED.hill ? 2 : e < SHAPED.mtn ? 3 : e < SHAPED.peak ? 4 : 5;

export type ShapeStroke = {
  w: number; h: number; wrap: boolean;
  /** Terrain as the stroke draws it, and as it was before. */
  cells: Uint8Array; start: Uint8Array;
  heights: Float32Array; startHeights: Float32Array;
  /** Lowland terrain for new land when nothing grows nearby: grassland, or bare rock on a world without plants. */
  fallback: number;
  last: { x: number; y: number }; target: number | null;
};

/** Start a stroke on these terrain squares, with heights kept from the last stroke when the terrain hasn't changed since. */
export function startShape(cells: Uint8Array, w: number, h: number, opts: { wrap: boolean; heights?: Float32Array | null; bare?: boolean; at: { x: number; y: number } }): ShapeStroke {
  const startHeights = opts.heights && opts.heights.length === w * h ? opts.heights : heightsFromCells(cells, w, h, opts.wrap);
  return { w, h, wrap: opts.wrap, cells: Uint8Array.from(cells), start: Uint8Array.from(cells), heights: Float32Array.from(startHeights), startHeights, fallback: opts.bare ? T.barren : T.grassland, last: opts.at, target: null };
}

/** The lowland terrain most common near a square, so new land carries on the forest or desert it is drawn out from. */
function nearbyLowland(s: ShapeStroke, i: number) {
  const x = i % s.w, y = Math.floor(i / s.w), count = new Array(terrains.length).fill(0);
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    let xx = x + dx; const yy = y + dy;
    if (s.wrap) xx = (xx + s.w) % s.w;
    if (xx < 0 || xx >= s.w || yy < 0 || yy >= s.h) continue;
    const t = s.cells[yy * s.w + xx];
    if (lowland(t) && t !== T.glacier) count[t]++;
  }
  const most = Math.max(...count);
  return most ? count.indexOf(most) : s.fallback;
}

/** What a square becomes when its height crosses into another kind of ground. */
function terrainFor(s: ShapeStroke, i: number) {
  const b = band(s.heights[i]), was = s.start[i];
  if (b === band(s.startHeights[i])) return was;
  if (b === 0) return T.deep;
  if (b === 1) return was === T.seaice ? was : T.sea;
  if (b === 2) return lowland(was) ? was : nearbyLowland(s, i);
  if (b === 5) return was === T.volcanic ? was : T.snow;
  return was === T.volcanic ? was : b === 3 ? T.hills : T.mountains;
}

/** Shape along a drag from the last point to this one (fractions of the map). Returns whether anything changed. */
export function shapeStep(s: ShapeStroke, to: { x: number; y: number }, radius: number, mode: ShapeMode, strength: number) {
  const { w, h } = s, ax = s.last.x * w, ay = s.last.y * h, bx = to.x * w, by = to.y * h, k = Math.max(0.05, Math.min(1, strength / 100));
  // Dabs fall every half brush along the drag, however often the pointer reports, so a stroke raises the same amount
  // whether it is drawn fast or slow. The first dab also sets the height Flatten works toward.
  const first = s.target === null, spacing = Math.max(0.5, radius / 2);
  let dx = bx - ax;
  if (s.wrap && Math.abs(dx) > w / 2) dx -= Math.sign(dx) * w;
  const dist = Math.hypot(dx, by - ay);
  if (first) { const i = Math.min(h - 1, Math.max(0, Math.floor(by))) * w + Math.min(w - 1, Math.max(0, Math.floor(bx))); s.target = s.heights[i]; }
  else if (dist < spacing) return false;
  const target = s.target!, steps = first ? 0 : Math.floor(dist / spacing);
  let changed = false, cx = bx, cy = by;
  for (let step = first ? 0 : 1; step <= steps; step++) {
    if (!first) { cx = ax + dx * step * spacing / dist; cy = ay + (by - ay) * step * spacing / dist; }
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(h - 1, Math.ceil(cy + radius)); y++)
      for (let x0 = Math.floor(cx - radius); x0 <= Math.ceil(cx + radius); x0++) {
        const d2 = ((x0 + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) / (radius * radius);
        if (d2 > 1) continue;
        const x = s.wrap ? (x0 % w + w) % w : x0;
        if (x < 0 || x >= w) continue;
        const i = y * w + x, e = s.heights[i], weight = 1 - d2;
        let next = e;
        if (mode === "land") next = e < 0 ? 0.01 + bump(i, w) : e;
        else if (mode === "sea") next = Math.min(e, -0.1);
        else if (mode === "raise") next = e + 0.05 * k * weight;
        else if (mode === "lower") next = e - 0.05 * k * weight;
        else next = e + (target - e) * 0.3 * k * weight;
        next = Math.max(-0.5, Math.min(0.8, next));
        if (next === e) continue;
        s.heights[i] = next;
        const t = terrainFor(s, i);
        if (t !== s.cells[i]) { s.cells[i] = t; changed = true; }
      }
  }
  s.last = first ? to : { x: (((cx / w) % 1) + 1) % 1, y: cy / h };
  return changed;
}

/**
 * The terrain once a stroke ends. With a planet's climate, ground that crossed into another kind takes the biome its new
 * warmth and rain give it, and squares elsewhere whose climate changed (a new rain shadow, say) follow too, unless the GM
 * painted them as something else.
 */
export function finishShape(s: ShapeStroke, climate?: PlanetOptions) {
  if (!climate) return s.cells;
  const before = planetClimate(climate, landFromHeights(s.startHeights, s.start, s.w, s.h)).cells;
  const after = planetClimate(climate, landFromHeights(s.heights, s.cells, s.w, s.h)).cells;
  const out = Uint8Array.from(s.start);
  for (let i = 0; i < out.length; i++) {
    if (band(s.heights[i]) !== band(s.startHeights[i])) out[i] = after[i];
    else if (s.start[i] === before[i] && after[i] !== before[i]) out[i] = after[i];
  }
  return out;
}

/** Whether a map is a whole planet: painted twice as wide as it is tall, with the climate it was made with. */
export const isPlanetMap = (map: Pick<MapData, "planet" | "paint">) => !!map.planet && !!map.paint && map.paint.columns === map.paint.rows * 2;

/**
 * New rivers, towns, roads and landmarks for a planet map from its terrain as it is now, as many as it has.
 * Places anyone has worked on stay.
 */
export function redoPlanetPlaces(map: MapData, cells: Uint8Array, heights?: Float32Array | null) {
  const { columns: w, rows: h } = map.paint!, e = heights && heights.length === w * h ? heights : heightsFromCells(cells, w, h, true);
  const generated = map.pins.filter(p => isGeneratedPlace(p, map));
  const rivers = new Set((map.paths ?? []).filter(p => p.id.startsWith("gen-river")).map(p => p.name)).size;
  const towns = generated.filter(p => p.kind !== "landmark").length;
  const o = planetOptionsOf(map, { places: towns || 12, rivers: rivers || 8, roads: towns ? (map.paths ?? []).some(p => p.id.startsWith("gen-road")) : true, landmarks: true });
  const land = landFromHeights(e, cells, w, h), world = { ...land, ...planetClimate(o, land), cells };
  return planetPlaces(o, map, world);
}
