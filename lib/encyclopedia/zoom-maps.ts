import { decodePaint, encodePaint, isWater, mapPaint, mapSize, newMap, paintScale, terrainIndex, tilesFromPaint, type MapData, type MapLabel, type MapPath, type MapPin } from "./map-model.ts";
import { placeName, seeded } from "./world-generator.ts";

/**
 * Zooming in: frame a spot on a painted map to make a closer map of it, a continent, kingdom, region or hex area.
 * The closer map keeps the same seas and biomes, with finer coasts, hills and lakes added at its own scale, and the
 * places, rivers, roads and names inside the frame come along. It remembers where it sits on the map it came from
 * (`zoomOf`), so the bigger map can show it as a frame and the closer one can find its way back. Runs in the browser only.
 */
export type ZoomSize = "continent" | "kingdom" | "region" | "hex";
export const zoomSizes: { id: ZoomSize; name: string; miles: number }[] = [
  { id: "continent", name: "Continent", miles: 2000 }, { id: "kingdom", name: "Kingdom", miles: 600 },
  { id: "region", name: "Region", miles: 200 }, { id: "hex", name: "Hex area", miles: 123 },
];
export type ZoomFrame = { x: number; y: number; w: number; h: number };

const KM = 1.609;
/** The map's width in miles, or null when it has no width set. */
const widthMiles = (m: Pick<MapData, "scale">) => m.scale ? (m.scale.unit === "km" ? m.scale.width / KM : m.scale.width) : null;
/** Whole planets wrap east to west, and a mile east-west covers more of the map away from the equator. */
const isPlanet = (m: Pick<MapData, "planet" | "paint">) => !!m.planet && !!m.paint && m.paint.columns === m.paint.rows * 2;

/** The sizes of closer map this map can make: those clearly smaller than the map itself. */
export function zoomChoices(map: MapData) {
  const across = widthMiles(map);
  return map.source === "generated" && across ? zoomSizes.filter(z => z.miles < across * 0.8) : [];
}

/** An empty closer map of this size: hex areas are 20 × 14 six-mile hexes, the rest 24 × 18 with no grid. */
function blankChild(size: ZoomSize, name: string, unit: "mi" | "km"): MapData {
  const z = zoomSizes.find(s => s.id === size)!;
  if (size === "hex") return { ...newMap("hex", "blank", name, 20, 14), scale: { width: (unit === "km" ? 10 : 6) * 20.5, unit } };
  return { ...newMap(size === "continent" ? "world" : "region", "blank", name, 24, 18), scale: { width: unit === "km" ? Math.round(z.miles * KM) : z.miles, unit } };
}

/** The frame a closer map of this size covers, centred on a point of the map as near as it fits. */
export function zoomFrame(map: MapData, size: ZoomSize, x: number, y: number): ZoomFrame {
  const across = widthMiles(map) ?? 1, child = blankChild(size, "x", "mi"), childMiles = widthMiles(child)!;
  const ps = mapSize(map), cs = mapSize(child), tall = across * ps.height / ps.width;
  // On a planet the map is stretched east to west toward the poles, so the same miles take more of its width there.
  const stretch = isPlanet(map) ? 1 / Math.max(0.25, Math.cos((0.5 - y) * Math.PI)) : 1;
  const w = Math.min(1, childMiles * stretch / across), h = Math.min(1, childMiles * cs.height / cs.width / tall);
  return { x: Math.min(1 - w, Math.max(0, x - w / 2)), y: Math.min(1 - h, Math.max(0, y - h / 2)), w, h };
}

function hash(text: string) { let n = 2166136261; for (const ch of text) n = Math.imul(n ^ ch.charCodeAt(0), 16777619); return n >>> 0; }
const h2 = (x: number, y: number, s: number) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function noise(x: number, y: number, s: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy, s) * (1 - u) + h2(ix + 1, iy, s) * u, b = h2(ix, iy + 1, s) * (1 - u) + h2(ix + 1, iy + 1, s) * u;
  return a * (1 - v) + b * v;
}
function fbm(x: number, y: number, s: number, octaves = 4) { let v = 0, a = 0.5, f = 1, t = 0; for (let o = 0; o < octaves; o++) { v += noise(x * f, y * f, s + o * 31) * a; t += a; a *= 0.5; f *= 2; } return v / t; }

const T = terrainIndex;
const lakeLand = new Set([T.grassland, T.forest, T.boreal, T.marsh, T.tundra, T.jungle]);
const hillLand = new Set([T.grassland, T.forest, T.boreal, T.steppe, T.savanna, T.tundra, T.jungle, T.barren]);

/** Terrain for a closer map: the bigger map's terrain under the frame, with coasts, hills and lakes at the closer scale. */
export function zoomPaint(parent: MapData, frame: ZoomFrame, child: MapData, seed: string) {
  const source = mapPaint(parent)!, cells = decodePaint(source.columns, source.rows, source.cells)!;
  const PW = source.columns, PH = source.rows, wrap = isPlanet(parent), s = hash(seed) % 100000;
  const k = paintScale(child.columns, child.rows), W = child.columns * k, H = child.rows * k, out = new Uint8Array(W * H);
  const at = (x: number, y: number) => { let xx = x; if (wrap) xx = ((xx % PW) + PW) % PW; else xx = Math.min(PW - 1, Math.max(0, xx)); return Math.min(PH - 1, Math.max(0, y)) * PW + xx; };
  const land = (x: number, y: number) => isWater(cells[at(x, y)]) ? 0 : 1;
  /** The nearest square to (fx, fy) whose terrain is land or water as asked, looking a few squares around. */
  const nearest = (fx: number, fy: number, wantLand: boolean) => {
    const cx = Math.floor(fx), cy = Math.floor(fy);
    let best = -1, bd = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const t = cells[at(cx + dx, cy + dy)];
      if (isWater(t) === wantLand) continue;
      const d = (cx + dx + 0.5 - fx) ** 2 + (cy + dy + 0.5 - fy) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best >= 0 ? best : wantLand ? T.grassland : T.sea;
  };
  // Noise is laid out in the closer map's own squares, so coasts get detail at its scale however far it zooms.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = (y + 0.5) / H, nx = x / 40, ny = y / 40;
    // A broad warp bends coasts and biome edges; a finer one breaks up the bigger map's square edges.
    const wx = (fbm(nx, ny, s + 1) - 0.5) * 1.4 + (fbm(nx * 5, ny * 5, s + 6, 3) - 0.5) * 1.1, wy = (fbm(nx, ny, s + 2) - 0.5) * 1.4 + (fbm(nx * 5, ny * 5, s + 7, 3) - 0.5) * 1.1;
    const fx = (frame.x + u * frame.w) * PW - 0.5 + wx, fy = (frame.y + v * frame.h) * PH - 0.5 + wy;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const shore = (land(x0, y0) * (1 - ax) + land(x0 + 1, y0) * ax) * (1 - ay) + (land(x0, y0 + 1) * (1 - ax) + land(x0 + 1, y0 + 1) * ax) * ay;
    const isLand = shore + (fbm(nx * 3, ny * 3, s + 3) - 0.5) * 0.45 > 0.5;
    let t = nearest(fx + 0.5, fy + 0.5, isLand);
    if (isLand) {
      const relief = fbm(nx * 2.2, ny * 2.2, s + 4), lake = fbm(nx * 4, ny * 4, s + 5);
      if (t === T.mountains && relief < 0.32) t = T.hills;
      else if (hillLand.has(t) && relief > 0.7) t = T.hills;
      else if (lakeLand.has(t) && lake < 0.2) t = T.sea;
    }
    out[y * W + x] = t;
  }
  return { columns: W, rows: H, cells: encodePaint(out) };
}

/** Points of a line inside the frame, as runs at the closer map's scale. */
function inside(points: { x: number; y: number }[], f: ZoomFrame) {
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) run.push({ x: (p.x - f.x) / f.w, y: (p.y - f.y) / f.h });
    else { if (run.length >= 2) runs.push(run); run = []; }
  }
  if (run.length >= 2) runs.push(run);
  return runs;
}

/**
 * A closer map of the frame: its terrain, and the places, rivers, roads and names inside it.
 * Places keep their ids, icons, notes and linked pages, so they stand for the same places; changes to one map stay on that map.
 */
export function zoomMap(parent: MapData, parentId: string, frame: ZoomFrame, size: ZoomSize, name: string): MapData {
  const unit = parent.scale?.unit ?? "mi", seed = `${parent.seed || "map"}:${size}:${Math.round(frame.x * 1000)}:${Math.round(frame.y * 1000)}`.slice(0, 100);
  const child = { ...blankChild(size, name, unit), seed };
  const paint = zoomPaint(parent, frame, child, seed);
  const within = (p: { x: number; y: number }) => p.x >= frame.x && p.x <= frame.x + frame.w && p.y >= frame.y && p.y <= frame.y + frame.h;
  const move = (p: { x: number; y: number }) => ({ x: Math.min(1, Math.max(0, (p.x - frame.x) / frame.w)), y: Math.min(1, Math.max(0, (p.y - frame.y) / frame.h)) });
  const pins: MapPin[] = parent.pins.filter(within).map(p => ({ ...p, ...move(p), areaMapId: null }));
  const paths: MapPath[] = (parent.paths ?? []).flatMap(p => inside(p.points, frame).map((points, n) => ({ ...p, id: n ? `${p.id}-${n}`.slice(0, 100) : p.id, points: points.slice(0, 400) })));
  const labels: MapLabel[] = (parent.labels ?? []).filter(within).map(l => ({ ...l, ...move(l) }));
  const icons = parent.icons?.filter(i => pins.some(p => p.icon === i.id));
  return {
    ...child, paint, tiles: tilesFromPaint(child, paint), pins, paths, labels, ...(icons?.length ? { icons } : {}),
    compass: true, scaleBar: true, ...(parent.mapStyle ? { mapStyle: { look: parent.mapStyle.look, font: parent.mapStyle.font, nameSize: parent.mapStyle.nameSize } } : {}),
    zoomOf: { mapId: parentId, ...frame },
  };
}

/** A name for a closer map: around the biggest place inside the frame, or a made-up name for the land there. */
export function zoomName(parent: MapData, frame: ZoomFrame, size: ZoomSize) {
  const order = ["city", "castle", "town", "village"], rank = (p: MapPin) => { const i = order.indexOf(p.kind ?? ""); return i < 0 ? 9 : i; };
  const best = parent.pins.filter(p => p.x >= frame.x && p.x <= frame.x + frame.w && p.y >= frame.y && p.y <= frame.y + frame.h).sort((a, b) => rank(a) - rank(b))[0];
  if (best) return (size === "hex" ? `Around ${best.title}` : `Lands around ${best.title}`).slice(0, 160);
  const r = seeded(`${parent.seed}:${Math.round(frame.x * 1000)}:${Math.round(frame.y * 1000)}`);
  return `${placeName(r).replace(/(ford|mere|wick|holm|stead|haven|gate|moor|dale|watch|brook|fell|port|crest|by|ton)$/i, "")} ${["Reach", "March", "Coast", "Vale", "Wilds"][Math.floor(r() * 5)]}`;
}
