import type { MapShape, Point } from "../model.ts";
import { mergeRooms, simplifyPoints } from "../map-drawing.ts";
import { stampById, stampBox } from "../map-stamps.ts";
import { generatorStyle, seededRandom, type GeneratedMap } from "../map-generator.ts";
import { makeLayout, type Layout, type LayoutId, type LayoutOptions, type Side } from "./layout.ts";
import { dressLayout, type DressOptions, type KeyEntry } from "./dressing.ts";

/**
 * The dungeon generator: a layout (lib/dungeon/layout.ts) turned into ordinary Map Creator shapes,
 * so everything it makes can be edited afterwards. The layout and the dressing have their own seeds,
 * so the dressing can be rerolled without changing the rooms.
 */
export const dungeonLayouts: { id: LayoutId; name: string; hint: string; style: string }[] = [
  { id: "branching", name: "Branching passages", hint: "Rooms off a main route, side branches", style: "stone" },
  { id: "halls", name: "Classic halls", hint: "A great hall, wide halls, rooms along them", style: "parchment" },
  { id: "caves", name: "Caverns", hint: "Natural caves, chambers and pools", style: "cave" },
  { id: "building", name: "Building", hint: "One building split into rooms", style: "timber" },
  { id: "village", name: "Village", hint: "Roads, houses and a square", style: "outdoor" },
];
export const dungeonSizes = { s: { cols: 24, rows: 18, name: "Small" }, m: { cols: 32, rows: 24, name: "Medium" }, l: { cols: 44, rows: 32, name: "Large" } } as const;
export type DungeonSize = keyof typeof dungeonSizes;
/** Everything the generator is asked for: the layout's options, plus size, seeds, style and the grid. */
export type FloorPattern = "plain" | NonNullable<MapShape["pattern"]>;
/** How the map looks: the floor pattern, wall thickness, the outside, the doors and the grid. */
export type LookOptions = { floor: FloorPattern; walls: "thin" | "medium" | "thick"; outside: "hatched" | "solid"; doors: "wood" | "iron" | "arch" | "mixed"; gridLines: boolean };
export const defaultLookOptions: LookOptions = { floor: "flag", walls: "medium", outside: "hatched", doors: "wood", gridLines: true };
/** The floor each layout starts with. */
export const layoutFloor: Record<LayoutId, FloorPattern> = { branching: "flag", halls: "tiles", caves: "earth", building: "boards", village: "boards" };
export const floorPatterns: { id: FloorPattern; name: string }[] = [{ id: "plain", name: "Plain" }, { id: "flag", name: "Flagstones" }, { id: "boards", name: "Boards" }, { id: "tiles", name: "Tiles" }, { id: "cobbles", name: "Cobbles" }, { id: "earth", name: "Earth" }];
/** Everything the generator is asked for: the layout's options, plus size, seeds, style, look, dressing and the grid. */
export type DungeonOptions = Omit<LayoutOptions, "cols" | "rows"> & LookOptions & DressOptions & { size: DungeonSize; seed: string; dressing: number; style: string; grid: number; numbers: boolean };
/** A generated map with its room key (GM only). */
export type DungeonMap = GeneratedMap & { key: KeyEntry[] };

/** Which options change each layout, so other settings don't reshuffle its rooms. */
const layoutFields: Record<LayoutId, (keyof LayoutOptions)[]> = {
  branching: ["rooms", "roomSize", "branching", "loops", "corridor", "symmetry", "curved", "entry"],
  halls: ["rooms", "roomSize", "loops", "corridor", "symmetry", "curved", "entry"],
  caves: ["rooms", "openness", "rough", "pools", "symmetry", "entry"],
  building: ["rooms", "roomSize", "loops", "bshape", "windows", "entry"],
  village: ["houses", "roads", "palisade", "fields"],
};
export const layoutKey = (o: DungeonOptions) => [o.layout, o.size, o.seed.trim() || "map", ...layoutFields[o.layout].map(k => JSON.stringify((o as Partial<LayoutOptions>)[k]))].join("|");

export function buildDungeonMap(o: DungeonOptions): DungeonMap {
  const { cols, rows } = dungeonSizes[o.size];
  const key = layoutKey(o);
  const layout = makeLayout({ ...o, cols, rows }, seededRandom(key));
  const random = seededRandom(`${key}|dress|${o.dressing}`);
  const lightRandom = seededRandom(`${key}|light|${o.dressing}`);
  const g = o.grid, look = generatorStyle(o.style, g);
  const indoor = layout.kind === "dungeon" || layout.kind === "cave";
  const style = { ...look.style, outside: indoor ? o.outside : look.style.outside, grid: !o.gridLines ? "off" as const : look.style.grid === "off" ? "faint" as const : look.style.grid };
  const pattern = o.floor === "plain" ? null : o.floor;
  let count = 0;
  const id = (kind: string) => `${kind}-${++count}`;
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const cell = (x: number, y: number): Point => ({ x: Math.round(x * g * 100) / 100, y: Math.round(y * g * 100) / 100 });
  const wall = ({ thin: 5, medium: 8, thick: 12 } as const)[o.walls] + (layout.kind === "cave" ? 2 : 0);
  const base = (type: MapShape["type"], name: string, points: Point[], extra: Partial<MapShape> = {}): MapShape => ({
    id: id(type), name, folderId: null, smooth: false, hidden: false, locked: false, type, roomParts: [], points,
    fill: style.floor, stroke: style.wall, thickness: wall, closed: false, stamp: null, rotation: 0, flip: false, ...extra,
  });
  const rect = (x: number, y: number, w: number, h: number, name: string, extra: Partial<MapShape> = {}) => base("rect", name, [cell(x, y), cell(x + w, y + h)], extra);
  const ellipse = (cx: number, cy: number, rx: number, ry: number, name: string, extra: Partial<MapShape> = {}) => base("ellipse", name, [cell(cx - rx, cy - ry), cell(cx + rx, cy + ry)], extra);
  const outline = (loop: Point[], name: string, extra: Partial<MapShape> = {}) => base("path", name, loop.map(p => cell(p.x, p.y)), { closed: true, smooth: true, ...extra });
  const stamp = (stampId: string, x: number, y: number, rotation = 0) => {
    const s = stampById(stampId)!;
    return base("stamp", s.name, stampBox(s, cell(x, y), g, g, cols * g, rows * g), { stamp: stampId, rotation, fill: null, thickness: 1 });
  };
  const opening = (type: "door" | "window", d: { x: number; y: number; o: "h" | "v"; len?: number }, thickness: number, extra: Partial<MapShape> = {}) => {
    const half = (d.len ?? 1) / 2;
    const [a, b] = d.o === "h" ? [{ x: d.x - half, y: d.y }, { x: d.x + half, y: d.y }] : [{ x: d.x, y: d.y - half }, { x: d.x, y: d.y + half }];
    return base(type, type === "door" ? "Door" : "Window", [cell(a.x, a.y), cell(b.x, b.y)], { thickness, stroke: style.ink, ...extra });
  };
  const doorShapes: MapShape[] = [];
  const doorKind = (d: { x: number; y: number }, i: number): MapShape["door"] => o.doors === "mixed" ? (["wood", "iron", "arch"] as const)[Math.abs(Math.floor(d.x * 7 + d.y * 13)) % 3] : o.doors === "wood" ? null : o.doors;
  const ground: MapShape[] = [], floors: MapShape[] = [], over: MapShape[] = [], doors: MapShape[] = [], stamps: MapShape[] = [], labels: MapShape[] = [];
  const centreOf = (r: Layout["rooms"][number]) => r.cave && r.cx !== undefined && r.cy !== undefined ? { x: r.cx, y: r.cy } : { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  // Where nothing else should be put: rooms' centres keep their numbers clear.
  const taken: { x: number; y: number; w: number; h: number }[] = [];
  const free = (x: number, y: number, w: number, h: number) => !taken.some(t => x < t.x + t.w && t.x < x + w && y < t.y + t.h && t.y < y + h);
  const put = (stampId: string, x: number, y: number, rotation = 0) => { const s = stampById(stampId); if (!s) return false; const w = rotation % 180 ? s.h : s.w, h = rotation % 180 ? s.w : s.h; if (!free(x - w / 2, y - h / 2, w, h)) return false; taken.push({ x: x - w / 2, y: y - h / 2, w, h }); stamps.push(stamp(stampId, x, y, rotation)); return true; };

  let scatter: (() => void) | null = null;
  if (layout.kind === "dungeon") {
    const pieces = layout.floors.map(f => f.t === "rect" ? rect(f.x, f.y, f.w, f.h, "Room") : ellipse(f.cx, f.cy, f.rx, f.ry, "Round room"));
    const merged = mergeRooms(pieces, id("merged"));
    floors.push({ ...(merged ? { ...merged, name: "Dungeon floor" } : pieces[0]), pattern });
    layout.doors.forEach((d, i) => doors.push(doorShapes[i] = opening("door", d, wall * 2, { fill: style.floor, name: d.big ? "Great door" : "Door", door: doorKind(d, i) })));
  } else if (layout.kind === "cave" && layout.rock) {
    const rock = layout.rock;
    const loops = traceCells((x, y) => rock[y]?.[x] === 0, layout.cols, layout.rows);
    loops.filter(l => l.area > 0).forEach((l, i) => floors.push(outline(l.points, i ? "Cave" : "Cave floor", { pattern })));
    // Rock inside the cave: pillars of stone standing in the floor.
    loops.filter(l => l.area < 0).forEach(l => over.push(outline(l.points, "Rock", { fill: look.background })));
    const wet = new Set(layout.water.map(p => `${Math.floor(p.x)},${Math.floor(p.y)}`));
    for (const l of traceCells((x, y) => wet.has(`${x},${y}`), layout.cols, layout.rows).filter(l => l.area > 0))
      over.push(outline(l.points, "Pool", { fill: "#5b88a8", stroke: "#3f6f92", thickness: 2, seeThrough: true }));
  } else if (layout.kind === "building") {
    // The outer wall is thick; the rooms inside have thinner walls.
    const outer = layout.floors.map(f => f.t === "rect" ? rect(f.x, f.y, f.w, f.h, "Building", { thickness: wall * 2 }) : ellipse(f.cx, f.cy, f.rx, f.ry, "Building", { thickness: wall * 2 }));
    const merged = outer.length > 1 ? mergeRooms(outer, id("merged")) : null;
    floors.push(merged ? { ...merged, name: "Building" } : outer[0]);
    layout.rooms.forEach((r, i) => floors.push(rect(r.x, r.y, r.w, r.h, `Room ${i + 1}`, { thickness: Math.round(wall * .75), pattern })));
    layout.doors.forEach((d, i) => doors.push(doorShapes[i] = opening("door", d, d.outer ? wall * 2 + 2 : wall + 2, { fill: style.floor, name: d.outer ? "Front door" : "Door", door: doorKind(d, i) })));
    for (const w of layout.windows) doors.push(opening("window", w, wall * 2 + 2, { fill: style.floor }));
  } else if (layout.kind === "village") {
    for (const f of layout.fields) ground.push(rect(f.x, f.y, f.w, f.h, "Field", { fill: f.rot ? "#b9b46a" : "#a6b464", stroke: "#7d8a4a", thickness: 3, seeThrough: true }));
    for (const r of layout.roads) ground.push(base("path", r.ring ? "Ring road" : "Road", r.pts.map(p => cell(Math.max(0, Math.min(cols, p.x)), Math.max(0, Math.min(rows, p.y)))), { smooth: true, closed: !!r.ring, fill: null, stroke: "#b9a27a", thickness: Math.min(100, Math.round(r.w * g)), seeThrough: true }));
    if (layout.square) {
      const s = layout.square;
      ground.push(ellipse(s.cx, s.cy, s.rx, s.ry, "Square", { fill: "#cfc1a0", stroke: "#a48d66", thickness: 4, seeThrough: true }));
      taken.push({ x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 });
    }
    layout.rooms.forEach((r, i) => { floors.push(rect(r.x, r.y, r.w, r.h, `House ${i + 1}`, { pattern })); taken.push({ x: r.x - .5, y: r.y - .5, w: r.w + 1, h: r.h + 1 }); });
    layout.doors.forEach((d, i) => doors.push(doorShapes[i] = opening("door", d, wall + 2, { fill: style.floor, door: doorKind(d, i) })));
    if (layout.palisade) {
      const p = layout.palisade, fence = rect(p.x, p.y, p.w, p.h, "Palisade", { fill: null, stroke: "#6b4f2e", thickness: 10 });
      ground.push(fence);
      // Gates where the roads cross the palisade.
      for (const gate of crossings(layout.roads.filter(r => !r.ring), p)) doors.push(base("opening", "Gate", [cell(gate.a.x, gate.a.y), cell(gate.b.x, gate.b.y)], { fill: look.background, thickness: 10, stroke: style.wall }));
    }
    for (const f of layout.fields) taken.push(f);
    const roadNear = (x: number, y: number) => layout.roads.some(r => r.pts.some((p, i) => i > 0 && segmentDistance({ x, y }, r.pts[i - 1], p) < r.w / 2 + .8));
    scatter = () => { const trees = Math.round(cols * rows / 26);
    for (let i = 0, n = 0; i < trees * 5 && n < trees; i++) {
      const kind = pick(["tree", "tree", "pine-tree", "bush", "rock"]), x = random() * (cols - 1) + .5, y = random() * (rows - 1) + .5;
      if (roadNear(x, y) || (layout.palisade && x > layout.palisade.x - .6 && x < layout.palisade.x + layout.palisade.w + .6 && y > layout.palisade.y - .6 && y < layout.palisade.y + layout.palisade.h + .6 && kind !== "bush")) continue;
      if (put(kind, x, y, int(0, 3) * 90)) n++;
    } };
  }

  // The way in: stairs just inside the map edge, where the entrance reaches it.
  const e = layout.entrance, keep: Point[] = [];
  if (e && layout.kind !== "building" && layout.kind !== "village") {
    const inward: Record<Side, Point> = { N: { x: 0, y: .5 }, S: { x: 0, y: -.5 }, W: { x: .5, y: 0 }, E: { x: -.5, y: 0 } };
    const turn: Record<Side, number> = { S: 0, N: 180, E: 270, W: 90 };
    const x = Math.min(cols - .5, Math.max(.5, e.x + inward[e.dir].x)), y = Math.min(rows - .5, Math.max(.5, e.y + inward[e.dir].y));
    put("stairs", x, y, turn[e.dir]);
    keep.push({ x, y });
  }
  // Themes, furniture, columns, lights and secret doors (lib/dungeon/dressing.ts).
  const dressed = dressLayout(layout, o, random, lightRandom, keep);
  for (const p of dressed.placements) {
    const s = stampById(p.stamp); if (!s) continue;
    const w = p.rotation % 180 ? s.h : s.w, h = p.rotation % 180 ? s.w : s.h;
    taken.push({ x: p.x - w / 2, y: p.y - h / 2, w, h });
    const light = p.light ? { kind: "fire" as const, bright: 4, dim: 8, colour: "#ff9a3c", flicker: true, on: !p.unlit } : p.unlit ? { on: false } : undefined;
    stamps.push({ ...stamp(p.stamp, p.x, p.y, p.rotation), ...(light ? { light } : {}) });
  }
  for (const i of dressed.secretDoors) { const d = doorShapes[i]; if (d) { d.door = "secret"; d.name = "Secret door"; } }
  scatter?.();
  // Numbers on the rooms become GM markers in Maptable, named and noted from the room key.
  layout.rooms.forEach((r, i) => {
    const c = centreOf(r), k = dressed.key[i];
    if (o.numbers) labels.push(base("label", String(i + 1), [cell(c.x, c.y), cell(c.x, c.y)], { fill: "#ffffff", stroke: style.ink, thickness: 22, key: { name: k.name, note: keyNote(k) } }));
  });
  const all = [...ground, ...floors, ...over, ...doors, ...stamps, ...labels];
  const name = `${dungeonLayouts.find(l => l.id === o.layout)!.name} (${o.seed.trim() || "map"})`;
  return { name, width: cols * g, height: rows * g, drawing: { background: look.background, style, shapes: all, folders: [], layerOrder: all.map(s => s.id) }, key: dressed.key };
}

/** A room key line as a GM note: what is in the room, whether it is lit, and any secret door. */
export function keyNote(k: KeyEntry): string {
  const parts = [k.things.length ? `${k.things.join(", ")}.` : "Nothing in it."];
  if (k.lit === false) parts.push("Dark.");
  if (k.secret) parts.push("A secret door.");
  return parts.join(" ").slice(0, 1000);
}

/**
 * The outlines of a set of grid cells, as loops of corner points in squares: outer edges go one way round
 * (area > 0), holes the other (area < 0). Corners are cut at 45° and straight runs simplified, ready to draw smooth.
 */
export function traceCells(inside: (x: number, y: number) => boolean, cols: number, rows: number): { points: Point[]; area: number }[] {
  type Edge = { a: Point; b: Point; used?: boolean };
  const from = new Map<string, Edge[]>(), k = (p: Point) => `${p.x},${p.y}`;
  const add = (a: Point, b: Point) => { const e = { a, b }; const list = from.get(k(a)); if (list) list.push(e); else from.set(k(a), [e]); };
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && inside(x, y);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (!at(x, y)) continue;
    // Each edge is walked with the cells on its right (y runs down the map).
    if (!at(x, y - 1)) add({ x, y }, { x: x + 1, y });
    if (!at(x + 1, y)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (!at(x, y + 1)) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
    if (!at(x - 1, y)) add({ x, y: y + 1 }, { x, y });
  }
  const loops: { points: Point[]; area: number }[] = [];
  for (const list of from.values()) for (const first of list) {
    if (first.used) continue;
    const corners: Point[] = [];
    let e: Edge | undefined = first as Edge | undefined;
    while (e && !e.used) {
      e.used = true; corners.push(e.a);
      const cur: Edge = e;
      const dx: number = cur.b.x - cur.a.x, dy: number = cur.b.y - cur.a.y, next: Edge[] = (from.get(k(cur.b)) ?? []).filter(n => !n.used);
      // Where two cells only touch at a corner, turn right to keep them apart.
      const turn = (n: Edge): number => { const nx = n.b.x - n.a.x, ny = n.b.y - n.a.y, cross: number = dx * ny - dy * nx; return cross > 0 ? 0 : cross === 0 ? 1 : 2; };
      e = next.sort((p, q) => turn(p) - turn(q))[0];
    }
    if (corners.length < 4) continue;
    const area = corners.reduce((s, p, i) => { const q = corners[(i + 1) % corners.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
    // Cut every corner: the middle of each edge is a point of the outline.
    const mids = corners.map((p, i) => { const q = corners[(i + 1) % corners.length]; return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; });
    const simple = simplifyPoints([...mids, mids[0]], .3).slice(0, -1);
    loops.push({ points: simple.length >= 3 ? simple : mids, area });
  }
  return loops;
}

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** Where roads cross a rectangle's edges, as gaps two squares wide along the edge. */
function crossings(roads: { pts: Point[]; w: number }[], r: { x: number; y: number; w: number; h: number }) {
  const edges: [Point, Point][] = [[{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }], [{ x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }], [{ x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h }], [{ x: r.x, y: r.y }, { x: r.x, y: r.y + r.h }]];
  const out: { a: Point; b: Point }[] = [];
  for (const road of roads) for (let i = 1; i < road.pts.length; i++) for (const [a, b] of edges) {
    const p = road.pts[i - 1], q = road.pts[i], d1 = { x: q.x - p.x, y: q.y - p.y }, d2 = { x: b.x - a.x, y: b.y - a.y }, den = d1.x * d2.y - d1.y * d2.x;
    if (!den) continue;
    const t = ((a.x - p.x) * d2.y - (a.y - p.y) * d2.x) / den, u = ((a.x - p.x) * d1.y - (a.y - p.y) * d1.x) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const hit = { x: p.x + d1.x * t, y: p.y + d1.y * t }, half = road.w / 2 + .3, len = Math.hypot(d2.x, d2.y), ux = d2.x / len, uy = d2.y / len;
    out.push({ a: { x: hit.x - ux * half, y: hit.y - uy * half }, b: { x: hit.x + ux * half, y: hit.y + uy * half } });
  }
  return out;
}
