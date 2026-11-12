import type { MapDrawing, MapShape, MapStyle, Point } from "./model.ts";
import { mergeRooms } from "./map-drawing.ts";
import { mapStylePresets } from "./map-style.ts";
import { stampById, stampBox } from "./map-stamps.ts";

/**
 * The map generator: a dungeon, cave, village or wilderness from a seed. Every room,
 * door and stamp it makes is an ordinary shape, so it can be edited afterwards.
 * The same seed and settings always make the same map.
 */
export const generatorKinds = [
  { id: "dungeon", name: "Dungeon", hint: "Rooms and corridors" },
  { id: "cave", name: "Cave", hint: "Winding tunnels and caverns" },
  { id: "village", name: "Village", hint: "Houses, roads and a square" },
  { id: "wilderness", name: "Wilderness", hint: "Clearings, paths, a river" },
] as const;
export type GeneratorKind = typeof generatorKinds[number]["id"];
export const generatorSizes = { small: { cols: 20, rows: 15, name: "Small" }, medium: { cols: 30, rows: 20, name: "Medium" }, large: { cols: 40, rows: 30, name: "Large" } } as const;
export type GeneratorSize = keyof typeof generatorSizes;
export type GeneratorOptions = { kind: GeneratorKind; size: GeneratorSize; rooms: number; style: string; seed: string; grid: number };
export type GeneratedMap = { name: string; width: number; height: number; drawing: MapDrawing };

/** Outdoor maps have their own look: grass outside, no hatching. */
const outdoor: { background: string; style: MapStyle } = {
  background: "#7d9a5c",
  style: { preset: "outdoor", floor: "#c9a978", wall: "#4a3826", hatch: "#6b8a4c", ink: "#3b2a1a", walls: "solid", outside: "solid", grid: "off", gridSize: 70, shadow: true },
};
/** The style each kind is made in unless another is picked. */
export const suggestedStyle: Record<GeneratorKind, string> = { dungeon: "stone", cave: "cave", village: "outdoor", wilderness: "outdoor" };
export function generatorStyle(id: string, grid: number): { background: string; style: MapStyle } {
  const preset = mapStylePresets.find(p => p.id === id);
  const chosen = preset ? { background: preset.background, style: preset.style } : outdoor;
  return { background: chosen.background, style: { ...chosen.style, gridSize: grid } };
}

/** A small, fast random number generator that always gives the same numbers for a seed. */
export function seededRandom(seed: string): () => number {
  let a = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 1779033703);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const words = ["ember", "frost", "moss", "iron", "ash", "raven", "salt", "thorn", "amber", "dusk", "flint", "hollow"];
/** A new seed that is easy to read and type, such as "ember-42". */
export function randomSeed(random: () => number = Math.random): string {
  return `${words[Math.floor(random() * words.length)]}-${Math.floor(random() * 90) + 10}`;
}

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

export function generateMap(options: GeneratorOptions): GeneratedMap {
  const random = seededRandom(`${options.kind}:${options.size}:${options.rooms}:${options.seed}`);
  const { cols, rows } = generatorSizes[options.size];
  const g = options.grid, look = generatorStyle(options.style, g), style = look.style;
  const shapes: MapShape[] = [];
  let count = 0;
  const id = (kind: string) => `${kind}-${++count}`;
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const base = (type: MapShape["type"], name: string, points: Point[], extra: Partial<MapShape> = {}): MapShape => ({
    id: id(type), name, folderId: null, smooth: false, hidden: false, locked: false, type, roomParts: [], points,
    fill: style.floor, stroke: style.wall, thickness: 8, closed: false, stamp: null, rotation: 0, flip: false, ...extra,
  });
  const cell = (x: number, y: number): Point => ({ x: x * g, y: y * g });
  const rect = (r: Rect, name: string, extra: Partial<MapShape> = {}) => base("rect", name, [cell(r.x, r.y), cell(r.x + r.w, r.y + r.h)], extra);
  const ellipse = (cx: number, cy: number, rx: number, ry: number, name: string, extra: Partial<MapShape> = {}) =>
    base("ellipse", name, [cell(cx - rx, cy - ry), cell(cx + rx, cy + ry)], extra);
  const label = (text: string, x: number, y: number) => base("label", text, [cell(x, y), cell(x, y)], { fill: "#ffffff", stroke: style.ink, thickness: 22 });
  const stamp = (stampId: string, x: number, y: number, rotation = 0) => {
    const s = stampById(stampId)!;
    return base("stamp", s.name, stampBox(s, cell(x, y), g, g, cols * g, rows * g), { stamp: stampId, rotation, fill: null, thickness: 1 });
  };
  const door = (a: Point, b: Point, thickness: number) => base("door", "Door", [cell(a.x, a.y), cell(b.x, b.y)], { thickness, stroke: style.ink });
  const labels: MapShape[] = [], stamps: MapShape[] = [], doors: MapShape[] = [];
  const want = Math.max(2, Math.min(20, Math.round(options.rooms)));

  if (options.kind === "dungeon") {
    const rooms: Rect[] = [];
    for (let i = 0; i < 600 && rooms.length < want; i++) {
      const w = int(3, 7), h = int(3, 6), r = { x: int(1, cols - w - 1), y: int(1, rows - h - 1), w, h };
      if (!rooms.some(o => overlaps(o, r, 2))) rooms.push(r);
    }
    rooms.sort((a, b) => a.x + a.y - b.x - b.y);
    const centre = (r: Rect) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });
    const corridors: Rect[] = [], links = connect(rooms.map(centre), random, 0.25);
    const inRoom = (x: number, y: number) => rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    const doorAt = new Set<string>();
    for (const [i, j] of links) {
      const a = centre(rooms[i]), b = centre(rooms[j]), across = random() < 0.5;
      const bend = across ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
      const path: Point[] = [];
      for (const [p, q] of [[a, bend], [bend, b]] as const) {
        corridors.push({ x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x) + 1, h: Math.abs(q.y - p.y) + 1 });
        const steps = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        for (let k = 0; k <= steps; k++) path.push({ x: p.x + Math.sign(q.x - p.x) * k, y: p.y + Math.sign(q.y - p.y) * k });
      }
      // A door where the corridor leaves or enters a room, on the shared edge.
      for (let k = 1; k < path.length; k++) {
        const p = path[k - 1], q = path[k];
        if (inRoom(p.x, p.y) === inRoom(q.x, q.y) || random() < 0.35) continue;
        const key = `${Math.max(p.x, q.x)},${Math.max(p.y, q.y)},${p.x === q.x}`;
        if (doorAt.has(key)) continue;
        doorAt.add(key);
        const edge = p.x === q.x ? { a: { x: p.x, y: Math.max(p.y, q.y) }, b: { x: p.x + 1, y: Math.max(p.y, q.y) } } : { a: { x: Math.max(p.x, q.x), y: p.y }, b: { x: Math.max(p.x, q.x), y: p.y + 1 } };
        doors.push(door(edge.a, edge.b, 16));
      }
    }
    const floor = mergeRooms([...rooms.map((r, i) => rect(r, `Room ${i + 1}`)), ...corridors.map(r => rect(r, "Corridor"))], id("merged"));
    if (floor) shapes.push({ ...floor, name: "Dungeon floor" });
    const things = ["chest", "barrel", "crate", "statue", "altar", "trapdoor", "bookshelf", "table"];
    rooms.forEach((r, i) => {
      const c = centre(r);
      labels.push(label(String(i + 1), c.x + .5, c.y + .5));
      if (i === 0) stamps.push(stamp("stairs", r.x + .5, r.y + .5));
      if (r.w >= 5 && r.h >= 5 && random() < 0.5) for (const [x, y] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) stamps.push(stamp("pillar", x + .5, y + .5));
      for (let k = int(0, 2); k > 0; k--) {
        const s = stampById(pick(things))!, x = int(r.x, r.x + r.w - s.w), y = int(r.y, r.y + r.h - s.h);
        if (Math.abs(x - c.x) < 1 && Math.abs(y - c.y) < 1) continue;
        stamps.push(stamp(s.id, x + s.w / 2, y + s.h / 2));
      }
    });
  } else if (options.kind === "cave") {
    const caverns: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < 600 && caverns.length < want; i++) {
      const r = 1.5 + random() * 2.2, c = { x: r + 1 + random() * (cols - 2 * r - 2), y: r + 1 + random() * (rows - 2 * r - 2), r };
      if (!caverns.some(o => Math.hypot(o.x - c.x, o.y - c.y) < o.r + c.r + 1.5)) caverns.push(c);
    }
    caverns.sort((a, b) => a.x + a.y - b.x - b.y);
    const parts: MapShape[] = caverns.map((c, i) => ellipse(c.x, c.y, c.r * (0.85 + random() * 0.3), c.r * (0.85 + random() * 0.3), `Cavern ${i + 1}`));
    for (const [i, j] of connect(caverns, random, 0.2)) {
      const a = caverns[i], b = caverns[j], length = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.ceil(length / 0.9);
      const wobble = (random() - 0.5) * 3;
      for (let k = 1; k < steps; k++) {
        const t = k / steps, bend = Math.sin(t * Math.PI) * wobble, nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
        const r = 0.75 + random() * 0.35;
        parts.push(ellipse(a.x + (b.x - a.x) * t + nx * bend, a.y + (b.y - a.y) * t + ny * bend, r, r, "Tunnel"));
      }
    }
    const floor = mergeRooms(parts, id("merged"));
    if (floor) shapes.push({ ...floor, name: "Cave floor" });
    caverns.forEach((c, i) => {
      labels.push(label(String(i + 1), c.x, c.y));
      for (let k = int(0, 3); k > 0; k--) {
        const a = random() * Math.PI * 2, d = c.r * (0.4 + random() * 0.35);
        stamps.push(stamp(random() < 0.8 ? "rock" : pick(["chest", "barrel", "campfire"]), c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, int(0, 3) * 90));
      }
    });
  } else {
    // Outdoor maps: a road (village) or a river and a path (wilderness), then houses or clearings.
    const lineAcross = (y: number, jitter: number) => Array.from({ length: Math.ceil(cols / 4) + 1 }, (_, i) => ({ x: Math.min(cols, i * 4), y: y + (random() - 0.5) * jitter }));
    const yAt = (line: Point[], x: number) => { const i = Math.max(0, Math.min(line.length - 2, Math.floor(x / 4))), a = line[i], b = line[i + 1], t = (x - a.x) / ((b.x - a.x) || 1); return a.y + (b.y - a.y) * Math.max(0, Math.min(1, t)); };
    const blocked: Rect[] = [];
    if (options.kind === "village") {
      const road = lineAcross(rows / 2, 2.5), plaza = { x: cols / 2, y: yAt(road, cols / 2) };
      shapes.push(base("path", "Road", road.map(p => cell(p.x, p.y)), { smooth: true, fill: null, stroke: "#b9a27a", thickness: g * 1.2 }));
      shapes.push(ellipse(plaza.x, plaza.y, 3, 2.4, "Square", { fill: "#cfc1a0", stroke: "#a48d66", thickness: 4 }));
      stamps.push(stamp("well", plaza.x, plaza.y));
      blocked.push({ x: plaza.x - 3.5, y: plaza.y - 3, w: 7, h: 6 });
      const houses: Rect[] = [];
      for (let i = 0; i < 800 && houses.length < want; i++) {
        const w = int(2, 4), h = int(2, 3), x = int(1, cols - w - 1), above = random() < 0.5;
        const roadY = yAt(road, x + w / 2), y = above ? Math.floor(roadY - 1.3 - h - int(0, 2)) : Math.ceil(roadY + 1.3 + int(0, 2));
        const r = { x, y, w, h };
        if (y < 1 || y + h > rows - 1 || houses.some(o => overlaps(o, r, 1)) || blocked.some(o => overlaps(o, r))) continue;
        let clear = true;
        for (let k = x; k <= x + w; k++) { const ry = yAt(road, k); if (ry + 0.9 > y && ry - 0.9 < y + h) clear = false; }
        if (!clear) continue;
        houses.push(r);
        const dx = x + Math.floor(w / 2), edgeY = above ? y + h : y;
        doors.push(door({ x: dx, y: edgeY }, { x: dx + 1, y: edgeY }, 8));
      }
      houses.sort((a, b) => a.x - b.x);
      houses.forEach((r, i) => {
        shapes.push(rect(r, `House ${i + 1}`));
        labels.push(label(String(i + 1), r.x + r.w / 2, r.y + r.h / 2));
        blocked.push({ x: r.x - .5, y: r.y - .5, w: r.w + 1, h: r.h + 1 });
        if (random() < 0.5) stamps.push(stamp(pick(["barrel", "crate"]), r.x + r.w + .5, r.y + .5));
      });
      for (let x = 0; x < cols; x++) { const ry = yAt(road, x + .5); blocked.push({ x, y: ry - 1.2, w: 1, h: 2.4 }); }
      scatter(["tree", "tree", "bush", "rock"], Math.round(cols * rows / 28));
    } else {
      const river = Array.from({ length: Math.ceil(rows / 3) + 1 }, (_, i) => ({ x: cols * (0.25 + random() * 0.5), y: Math.min(rows, i * 3) }));
      river[0].y = -0.5; river[river.length - 1].y = rows + 0.5;
      shapes.push(base("path", "River", river.map(p => cell(p.x, p.y)), { smooth: true, fill: null, stroke: "#4f86b0", thickness: g * 1.3 }));
      const clearings: { x: number; y: number; r: number }[] = [];
      for (let i = 0; i < 600 && clearings.length < want; i++) {
        const r = 1.6 + random() * 1.6, c = { x: r + 1 + random() * (cols - 2 * r - 2), y: r + 1 + random() * (rows - 2 * r - 2), r };
        const nearRiver = river.some((p, k) => k < river.length - 1 && segmentDistance(c, p, river[k + 1]) < r + 1);
        if (!nearRiver && !clearings.some(o => Math.hypot(o.x - c.x, o.y - c.y) < o.r + c.r + 2)) clearings.push(c);
      }
      clearings.sort((a, b) => a.x + a.y - b.x - b.y);
      for (const [i, j] of connect(clearings, random, 0)) {
        const a = clearings[i], b = clearings[j], mid = { x: (a.x + b.x) / 2 + (random() - 0.5) * 3, y: (a.y + b.y) / 2 + (random() - 0.5) * 3 };
        shapes.push(base("path", "Path", [a, mid, b].map(p => cell(p.x, p.y)), { smooth: true, fill: null, stroke: "#b49a6a", thickness: g * 0.55 }));
      }
      clearings.forEach((c, i) => {
        shapes.push(ellipse(c.x, c.y, c.r, c.r * (0.8 + random() * 0.3), `Clearing ${i + 1}`, { fill: "#a9bf7c", stroke: "#6b8a4c", thickness: 3 }));
        labels.push(label(String(i + 1), c.x, c.y));
        blocked.push({ x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 });
        if (i === 0) { stamps.push(stamp("tent", c.x - 1.2, c.y - 1.2)); stamps.push(stamp("campfire", c.x + 1, c.y + .5)); }
        else if (random() < 0.4) stamps.push(stamp(pick(["rock", "bush", "chest"]), c.x + c.r * .5, c.y - c.r * .3));
      });
      for (const [k, p] of river.entries()) if (k < river.length - 1) {
        const q = river[k + 1];
        for (let t = 0; t <= 1; t += 0.25) blocked.push({ x: p.x + (q.x - p.x) * t - 1.4, y: p.y + (q.y - p.y) * t - 1.4, w: 2.8, h: 2.8 });
      }
      scatter(["tree", "tree", "tree", "bush", "rock"], Math.round(cols * rows / 18));
    }
    function scatter(kinds: string[], n: number) {
      for (let i = 0; i < n * 4 && n > 0; i++) {
        const s = stampById(pick(kinds))!, x = random() * (cols - s.w), y = random() * (rows - s.h), r = { x, y, w: s.w, h: s.h };
        if (blocked.some(o => overlaps(o, r))) continue;
        blocked.push(r); n--;
        stamps.push(stamp(s.id, x + s.w / 2, y + s.h / 2, int(0, 3) * 90));
      }
    }
  }
  const all = [...shapes, ...doors, ...stamps, ...labels];
  const name = `${generatorKinds.find(k => k.id === options.kind)!.name} (${options.seed})`;
  return { name, width: cols * g, height: rows * g, drawing: { background: look.background, style, shapes: all, folders: [], layerOrder: all.map(s => s.id) } };
}

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** Joins places with the shortest set of links (plus a few loops), so every place can be reached. */
export function connect(points: Point[], random: () => number, loops: number): [number, number][] {
  if (points.length < 2) return [];
  const inTree = new Set([0]), links: [number, number][] = [];
  const d = (i: number, j: number) => Math.abs(points[i].x - points[j].x) + Math.abs(points[i].y - points[j].y);
  while (inTree.size < points.length) {
    let best: [number, number] | null = null;
    for (const i of inTree) for (let j = 0; j < points.length; j++) if (!inTree.has(j) && (!best || d(i, j) < d(...best))) best = [i, j];
    links.push(best!); inTree.add(best![1]);
  }
  for (let i = 0; i < points.length; i++) if (random() < loops) {
    const others = points.map((_, j) => j).filter(j => j !== i && !links.some(([a, b]) => (a === i && b === j) || (a === j && b === i))).sort((a, b) => d(i, a) - d(i, b));
    if (others.length) links.push([i, others[0]]);
  }
  return links;
}
