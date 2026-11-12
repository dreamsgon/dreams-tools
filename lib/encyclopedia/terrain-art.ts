import { decodePaint, terrains, type MapPaint } from "./map-model.ts";

/**
 * Turning painted terrain into smooth shapes: each terrain becomes outlines traced around
 * its painted squares, rounded off, with small symbols for mountains, hills, forests and marsh.
 * Terrain numbers: 0 sea, 1 grassland, 2 forest, 3 hills, 4 mountains, 5 desert, 6 marsh, 7 snow.
 * Snow beside mountains is drawn as snowy peaks; other snow is a flat snowfield.
 */
export type TerrainLayer = { id: string; color: string; d: string };
export type TerrainGlyph = { kind: "mountain" | "snowpeak" | "hill" | "tree" | "marsh"; x: number; y: number; size: number };

export const shallowsColor = "#a3c4cb";
export const terrainLayerOrder: { id: string; color: string; test: (t: number) => boolean; grow?: number }[] = [
  { id: "shallows", color: shallowsColor, test: t => t !== 0, grow: 2 },
  { id: "land", color: terrains[1].color, test: t => t !== 0 },
  { id: "desert", color: terrains[5].color, test: t => t === 5 },
  { id: "marsh", color: terrains[6].color, test: t => t === 6 },
  { id: "forest", color: terrains[2].color, test: t => t === 2 },
  { id: "hills", color: terrains[3].color, test: t => t === 3 || t === 4 || t === ALPINE },
  { id: "mountains", color: "#a0947f", test: t => t === 4 || t === ALPINE },
  { id: "snow", color: terrains[7].color, test: t => t === 7 || t === ALPINE },
];

/** Snow next to mountains is a snowy peak; snow anywhere else is a flat snowfield. */
const ALPINE = 8;
export function classifySnow(cells: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(cells);
  const reach = Math.max(2, Math.round(Math.min(w, h) / 60));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (cells[y * w + x] !== 7) continue;
    let near = false;
    for (let dy = -reach; dy <= reach && !near; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && cells[yy * w + xx] === 4) { near = true; break; }
    }
    if (near) out[y * w + x] = ALPINE;
  }
  return out;
}

function grow(mask: Uint8Array, w: number, h: number, by: number): Uint8Array {
  let cur: Uint8Array = mask;
  for (let n = 0; n < by; n++) {
    const next = new Uint8Array(cur);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (cur[y * w + x]) continue;
      if ((x > 0 && cur[y * w + x - 1]) || (x < w - 1 && cur[y * w + x + 1]) || (y > 0 && cur[(y - 1) * w + x]) || (y < h - 1 && cur[(y + 1) * w + x])) next[y * w + x] = 1;
    }
    cur = next;
  }
  return cur;
}

/**
 * Outlines around the set squares of a mask (marching squares on a padded grid, so every outline closes).
 * Points are in square units, where square (x, y) has its centre at (x + 0.5, y + 0.5).
 */
export function traceMask(mask: Uint8Array, w: number, h: number): [number, number][][] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  // Edge points are keyed by a number: horizontal edges and vertical edges in separate ranges.
  const W = w + 2;
  const hKey = (x: number, y: number) => ((y + 1) * W + (x + 1)) * 2;      // between (x,y) and (x+1,y)
  const vKey = (x: number, y: number) => ((y + 1) * W + (x + 1)) * 2 + 1;  // between (x,y) and (x,y+1)
  const pos = (key: number): [number, number] => {
    const v = key & 1, idx = key >> 1, x = (idx % W) - 1, y = Math.floor(idx / W) - 1;
    return v ? [x + 0.5, y + 1] : [x + 1, y + 0.5];
  };
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
    const c = tl * 8 + tr * 4 + br * 2 + bl;
    if (c === 0 || c === 15) continue;
    const top = hKey(x, y), bottom = hKey(x, y + 1), left = vKey(x, y), right = vKey(x + 1, y);
    switch (c) {
      case 1: case 14: link(left, bottom); break;
      case 2: case 13: link(bottom, right); break;
      case 3: case 12: link(left, right); break;
      case 4: case 11: link(top, right); break;
      case 6: case 9: link(top, bottom); break;
      case 7: case 8: link(left, top); break;
      case 5: link(left, top); link(bottom, right); break;
      case 10: link(top, right); link(left, bottom); break;
    }
  }
  const seen = new Set<number>(), loops: [number, number][][] = [];
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const loop: [number, number][] = [];
    let prev = -1, cur = start;
    while (!seen.has(cur)) {
      seen.add(cur); loop.push(pos(cur));
      const next = (links.get(cur) ?? []).find(n => n !== prev && !seen.has(n));
      if (next === undefined) break;
      prev = cur; cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Drops points in the middle of straight runs. */
export function straighten(points: [number, number][]): [number, number][] {
  const n = points.length;
  const out = points.filter((p, i) => {
    const a = points[(i + n - 1) % n], b = points[(i + 1) % n];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-9;
  });
  return out.length >= 3 ? out : points;
}

/** Rounds a closed outline by cutting its corners. */
export function smoothLoop(points: [number, number][], times = 2): [number, number][] {
  let pts = straighten(points);
  for (let n = 0; n < times; n++) {
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    pts = out;
  }
  return pts;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
function loopsPath(loops: [number, number][][], sx: number, sy: number) {
  return loops.map(loop => "M" + smoothLoop(loop).map(([x, y]) => `${r1(x * sx)} ${r1(y * sy)}`).join("L") + "Z").join("");
}

/** The terrain as layered shapes, bottom first, sized to a map of width × height. */
export function terrainLayers(paint: MapPaint, width: number, height: number): TerrainLayer[] {
  const raw = decodePaint(paint.columns, paint.rows, paint.cells);
  if (!raw) return [];
  const w = paint.columns, h = paint.rows, sx = width / w, sy = height / h, cells = classifySnow(raw, w, h);
  const out: TerrainLayer[] = [];
  for (const layer of terrainLayerOrder) {
    let mask: Uint8Array = new Uint8Array(w * h);
    let any = false;
    for (let i = 0; i < cells.length; i++) if (layer.test(cells[i])) { mask[i] = 1; any = true; }
    if (!any) continue;
    if (layer.grow) mask = grow(mask, w, h, layer.grow);
    out.push({ id: layer.id, color: layer.color, d: loopsPath(traceMask(mask, w, h), sx, sy) });
  }
  return out;
}

function jitter(x: number, y: number, salt: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Small symbols scattered over the terrain, kept clear of the edges of each area. */
export function terrainGlyphs(paint: MapPaint, width: number, height: number): TerrainGlyph[] {
  const raw = decodePaint(paint.columns, paint.rows, paint.cells);
  if (!raw) return [];
  const w = paint.columns, h = paint.rows, sx = width / w, sy = height / h, unit = Math.min(sx, sy), cells = classifySnow(raw, w, h);
  const t = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : cells[y * w + x]);
  const inside = (x: number, y: number, test: (v: number) => boolean, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!test(t(x + dx, y + dy))) return false;
    return true;
  };
  const out: TerrainGlyph[] = [];
  const scatter = (step: number, test: (v: number) => boolean, kind: (v: number) => TerrainGlyph["kind"], size: number, clear: number) => {
    for (let y = 0; y < h; y += step) for (let x = (Math.floor(y / step) % 2) * Math.floor(step / 2); x < w; x += step) {
      const v = t(x, y);
      if (!test(v) || !inside(x, y, test, clear)) continue;
      const jx = (jitter(x, y, 1) - 0.5) * step * 0.6, jy = (jitter(x, y, 2) - 0.5) * step * 0.6;
      out.push({ kind: kind(v), x: r1((x + 0.5 + jx) * sx), y: r1((y + 0.5 + jy) * sy), size: r1(unit * size * (0.85 + jitter(x, y, 3) * 0.3)) });
    }
  };
  scatter(4, v => v === 3, () => "hill", 2.4, 1);
  scatter(3, v => v === 2, () => "tree", 1.3, 1);
  scatter(4, v => v === 6, () => "marsh", 1.6, 1);
  scatter(4, v => v === 4 || v === ALPINE, v => (v === ALPINE ? "snowpeak" : "mountain"), 3, 1);
  return out.sort((a, b) => a.y - b.y);
}

/** A tidy scale bar length: 1, 2 or 5 times a power of ten, about a fifth of the map. */
export function scaleBarLength(mapWidthInUnits: number) {
  const target = mapWidthInUnits / 5, power = 10 ** Math.floor(Math.log10(target));
  const step = [5, 2, 1].map(n => n * power).find(n => n <= target) ?? power;
  return step;
}

/** Paints a round brush stroke from one point to the next onto a copy of the terrain. */
export function paintStroke(cells: Uint8Array, columns: number, rows: number, from: { x: number; y: number }, to: { x: number; y: number }, radius: number, terrain: number, landOnly: boolean) {
  const ax = from.x * columns, ay = from.y * rows, bx = to.x * columns, by = to.y * rows;
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(0.5, radius / 2)));
  let changed = false;
  for (let s = 0; s <= steps; s++) {
    const cx = ax + (bx - ax) * s / steps, cy = ay + (by - ay) * s / steps;
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(rows - 1, Math.ceil(cy + radius)); y++)
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(columns - 1, Math.ceil(cx + radius)); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > radius * radius) continue;
        const i = y * columns + x;
        if (cells[i] === terrain || (landOnly && terrain !== 0 && cells[i] === 0)) continue;
        cells[i] = terrain; changed = true;
      }
  }
  return changed;
}
