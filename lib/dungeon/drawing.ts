import type { MapShape, Point } from "../model.ts";
import { mergeRooms, simplifyPoints } from "../map-drawing.ts";
import { stampById, stampBox } from "../map-stamps.ts";
import { generatorStyle, seededRandom, type GeneratedMap } from "../map-generator.ts";
import { makeLayout, type Layout, type LayoutId, type LayoutOptions, type Side } from "./layout.ts";

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
export type DungeonOptions = Omit<LayoutOptions, "cols" | "rows"> & { size: DungeonSize; seed: string; dressing: number; style: string; grid: number; numbers: boolean };

/** Which options change each layout, so other settings don't reshuffle its rooms. */
const layoutFields: Record<LayoutId, (keyof LayoutOptions)[]> = {
  branching: ["rooms", "roomSize", "branching", "loops", "corridor", "symmetry", "curved", "entry"],
  halls: ["rooms", "roomSize", "loops", "corridor", "symmetry", "curved", "entry"],
  caves: ["rooms", "openness", "rough", "pools", "symmetry", "entry"],
  building: ["rooms", "roomSize", "loops", "bshape", "windows", "entry"],
  village: ["houses", "roads", "palisade", "fields"],
};
export const layoutKey = (o: DungeonOptions) => [o.layout, o.size, o.seed.trim() || "map", ...layoutFields[o.layout].map(k => JSON.stringify((o as Partial<LayoutOptions>)[k]))].join("|");

export function buildDungeonMap(o: DungeonOptions): GeneratedMap {
  const { cols, rows } = dungeonSizes[o.size];
  const key = layoutKey(o);
  const layout = makeLayout({ ...o, cols, rows }, seededRandom(key));
  const random = seededRandom(`${key}|dress|${o.dressing}`);
  const g = o.grid, look = generatorStyle(o.style, g), style = look.style;
  let count = 0;
  const id = (kind: string) => `${kind}-${++count}`;
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const cell = (x: number, y: number): Point => ({ x: Math.round(x * g * 100) / 100, y: Math.round(y * g * 100) / 100 });
  const wall = layout.kind === "cave" ? 10 : 8;
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
  const ground: MapShape[] = [], floors: MapShape[] = [], over: MapShape[] = [], doors: MapShape[] = [], stamps: MapShape[] = [], labels: MapShape[] = [];
  const centreOf = (r: Layout["rooms"][number]) => r.cave && r.cx !== undefined && r.cy !== undefined ? { x: r.cx, y: r.cy } : { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  // Where nothing else should be put: rooms' centres keep their numbers clear.
  const taken: { x: number; y: number; w: number; h: number }[] = [];
  const free = (x: number, y: number, w: number, h: number) => !taken.some(t => x < t.x + t.w && t.x < x + w && y < t.y + t.h && t.y < y + h);
  const put = (stampId: string, x: number, y: number, rotation = 0) => { const s = stampById(stampId); if (!s) return false; const w = rotation % 180 ? s.h : s.w, h = rotation % 180 ? s.w : s.h; if (!free(x - w / 2, y - h / 2, w, h)) return false; taken.push({ x: x - w / 2, y: y - h / 2, w, h }); stamps.push(stamp(stampId, x, y, rotation)); return true; };

  if (layout.kind === "dungeon") {
    const pieces = layout.floors.map(f => f.t === "rect" ? rect(f.x, f.y, f.w, f.h, "Room") : ellipse(f.cx, f.cy, f.rx, f.ry, "Round room"));
    const merged = mergeRooms(pieces, id("merged"));
    floors.push(merged ? { ...merged, name: "Dungeon floor" } : pieces[0]);
    for (const d of layout.doors) doors.push(opening("door", d, wall * 2, { fill: style.floor, name: d.big ? "Great door" : "Door" }));
  } else if (layout.kind === "cave" && layout.rock) {
    const rock = layout.rock;
    const loops = traceCells((x, y) => rock[y]?.[x] === 0, layout.cols, layout.rows);
    loops.filter(l => l.area > 0).forEach((l, i) => floors.push(outline(l.points, i ? "Cave" : "Cave floor")));
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
    layout.rooms.forEach((r, i) => floors.push(rect(r.x, r.y, r.w, r.h, `Room ${i + 1}`, { thickness: Math.round(wall * .75) })));
    for (const d of layout.doors) doors.push(opening("door", d, d.outer ? wall * 2 + 2 : wall + 2, { fill: style.floor, name: d.outer ? "Front door" : "Door" }));
    for (const w of layout.windows) doors.push(opening("window", w, wall * 2 + 2, { fill: style.floor }));
  } else if (layout.kind === "village") {
    for (const f of layout.fields) ground.push(rect(f.x, f.y, f.w, f.h, "Field", { fill: f.rot ? "#b9b46a" : "#a6b464", stroke: "#7d8a4a", thickness: 3, seeThrough: true }));
    for (const r of layout.roads) ground.push(base("path", r.ring ? "Ring road" : "Road", r.pts.map(p => cell(Math.max(0, Math.min(cols, p.x)), Math.max(0, Math.min(rows, p.y)))), { smooth: true, closed: !!r.ring, fill: null, stroke: "#b9a27a", thickness: Math.min(100, Math.round(r.w * g)), seeThrough: true }));
    if (layout.square) {
      const s = layout.square;
      ground.push(ellipse(s.cx, s.cy, s.rx, s.ry, "Square", { fill: "#cfc1a0", stroke: "#a48d66", thickness: 4, seeThrough: true }));
      taken.push({ x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 });
      stamps.push(stamp("well", s.cx, s.cy));
    }
    layout.rooms.forEach((r, i) => { floors.push(rect(r.x, r.y, r.w, r.h, `House ${i + 1}`)); taken.push({ x: r.x - .5, y: r.y - .5, w: r.w + 1, h: r.h + 1 }); });
    for (const d of layout.doors) doors.push(opening("door", d, wall + 2, { fill: style.floor }));
    if (layout.palisade) {
      const p = layout.palisade, fence = rect(p.x, p.y, p.w, p.h, "Palisade", { fill: null, stroke: "#6b4f2e", thickness: 10 });
      ground.push(fence);
      // Gates where the roads cross the palisade.
      for (const gate of crossings(layout.roads.filter(r => !r.ring), p)) doors.push(base("opening", "Gate", [cell(gate.a.x, gate.a.y), cell(gate.b.x, gate.b.y)], { fill: look.background, thickness: 10, stroke: style.wall }));
    }
    for (const f of layout.fields) taken.push(f);
    const roadNear = (x: number, y: number) => layout.roads.some(r => r.pts.some((p, i) => i > 0 && segmentDistance({ x, y }, r.pts[i - 1], p) < r.w / 2 + .8));
    const trees = Math.round(cols * rows / 26);
    for (let i = 0, n = 0; i < trees * 5 && n < trees; i++) {
      const kind = pick(["tree", "tree", "pine-tree", "bush", "rock"]), x = random() * (cols - 1) + .5, y = random() * (rows - 1) + .5;
      if (roadNear(x, y) || (layout.palisade && x > layout.palisade.x - .6 && x < layout.palisade.x + layout.palisade.w + .6 && y > layout.palisade.y - .6 && y < layout.palisade.y + layout.palisade.h + .6 && kind !== "bush")) continue;
      if (put(kind, x, y, int(0, 3) * 90)) n++;
    }
  }

  // Numbers on the rooms (they become GM markers in Maptable) keep the middle of each room clear.
  layout.rooms.forEach((r, i) => {
    const c = centreOf(r);
    taken.push({ x: c.x - .6, y: c.y - .6, w: 1.2, h: 1.2 });
    if (o.numbers) labels.push(base("label", String(i + 1), [cell(c.x, c.y), cell(c.x, c.y)], { fill: "#ffffff", stroke: style.ink, thickness: 22 }));
  });
  // The way in: stairs just inside the map edge, where the entrance reaches it.
  const e = layout.entrance;
  if (e && layout.kind !== "building" && layout.kind !== "village") {
    const inward: Record<Side, Point> = { N: { x: 0, y: .5 }, S: { x: 0, y: -.5 }, W: { x: .5, y: 0 }, E: { x: -.5, y: 0 } };
    const turn: Record<Side, number> = { S: 0, N: 180, E: 270, W: 90 };
    const x = Math.min(cols - .5, Math.max(.5, e.x + inward[e.dir].x)), y = Math.min(rows - .5, Math.max(.5, e.y + inward[e.dir].y));
    put("stairs", x, y, turn[e.dir]);
  }
  dress(layout, { random, int, pick, put });
  const all = [...ground, ...floors, ...over, ...doors, ...stamps, ...labels];
  const name = `${dungeonLayouts.find(l => l.id === o.layout)!.name} (${o.seed.trim() || "map"})`;
  return { name, width: cols * g, height: rows * g, drawing: { background: look.background, style, shapes: all, folders: [], layerOrder: all.map(s => s.id) } };
}

type Dresser = { random: () => number; int: (a: number, b: number) => number; pick: <T>(l: readonly T[]) => T; put: (id: string, x: number, y: number, rotation?: number) => boolean };
/** A light first dressing: a few things in each room, pillars in big halls, rocks in caves. Part 5 brings themes. */
function dress(layout: Layout, { random, int, pick, put }: Dresser) {
  const things = layout.kind === "building" ? ["table", "chair", "barrel", "crate", "bookshelf", "bed", "chest"]
    : layout.kind === "village" ? ["barrel", "crate", "sacks", "cart"]
    : layout.kind === "cave" ? ["rock", "rock", "rock", "mushrooms", "bones", "chest"]
    : ["chest", "barrel", "crate", "statue", "altar", "bookshelf", "table", "bones", "rubble"];
  layout.rooms.forEach(r => {
    if (layout.kind === "village") { if (random() < .5) put(pick(things), r.x + r.w + .5, r.y + .5); return; }
    if (!r.cave && !r.round && layout.kind === "dungeon" && r.w >= 6 && r.h >= 6 && random() < .5)
      for (const [x, y] of [[r.x + 1.5, r.y + 1.5], [r.x + r.w - 1.5, r.y + 1.5], [r.x + 1.5, r.y + r.h - 1.5], [r.x + r.w - 1.5, r.y + r.h - 1.5]]) put("pillar", x, y);
    for (let k = int(layout.kind === "cave" ? 1 : 0, layout.kind === "cave" ? 3 : 2), tries = 0; k > 0 && tries < 12; tries++) {
      const id = pick(things), s = stampById(id);
      if (!s) continue;
      let x: number, y: number;
      if (r.cave && r.cx !== undefined && r.cy !== undefined) { const a = random() * Math.PI * 2, d = (r.rad ?? 2) * (.3 + random() * .4); x = r.cx + Math.cos(a) * d; y = r.cy + Math.sin(a) * d; }
      else { if (r.w < s.w + 1 || r.h < s.h + 1) continue; x = r.x + .5 + s.w / 2 + Math.floor(random() * (r.w - s.w)); y = r.y + .5 + s.h / 2 + Math.floor(random() * (r.h - s.h)); x = Math.min(x, r.x + r.w - s.w / 2); y = Math.min(y, r.y + r.h - s.h / 2); }
      if (put(id, x, y, layout.kind === "cave" ? int(0, 3) * 90 : 0)) k--;
    }
  });
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
