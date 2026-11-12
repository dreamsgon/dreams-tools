import type { MapDrawing, MapShape, MapStyle, Point } from "./model.ts";
import { orderedShapes, roomPaths, shapePath, openingPath, labelBox } from "./map-drawing.ts";
import { roomPolygons, wallSegments } from "./map-creator.ts";
import { stampById, stampMatrix } from "./map-stamps.ts";

/**
 * Map styles: a preset look (Dungeon stone, Old parchment...) for the whole drawn map,
 * then fine-tuned walls, outside, grid and shadow. Both the Map Creator (SVG) and
 * Maptable (canvas) draw a map from the same list of paths, so they always match.
 */
export type MapStylePreset = { id: string; name: string; background: string; style: MapStyle };
const preset = (id: string, name: string, background: string, style: Omit<MapStyle, "preset" | "gridSize">): MapStylePreset =>
  ({ id, name, background, style: { preset: id, gridSize: 70, ...style } });
export const mapStylePresets: MapStylePreset[] = [
  preset("stone", "Dungeon stone", "#3a3d40", { floor: "#e9e4d6", wall: "#2b2b2b", hatch: "#55595d", ink: "#2b2b2b", walls: "solid", outside: "hatched", grid: "faint", shadow: true }),
  preset("parchment", "Old parchment", "#e2d2a8", { floor: "#f3e7c9", wall: "#5a3e22", hatch: "#b39b6c", ink: "#5a3e22", walls: "rough", outside: "hatched", grid: "faint", shadow: true }),
  preset("cave", "Cave", "#2a241d", { floor: "#b9ab92", wall: "#6e5d48", hatch: "#3d3328", ink: "#3d3328", walls: "rough", outside: "solid", grid: "off", shadow: true }),
  preset("ink", "Ink on white", "#ffffff", { floor: "#ffffff", wall: "#111111", hatch: "#9aa0a6", ink: "#111111", walls: "double", outside: "hatched", grid: "on", shadow: false }),
  preset("timber", "Timber hall", "#56604a", { floor: "#c79a63", wall: "#3b2a1a", hatch: "#56604a", ink: "#3b2a1a", walls: "solid", outside: "solid", grid: "faint", shadow: true }),
];
/** The colours the Map Creator draws with before any style is chosen. */
export const unstyledColours = { floor: "#cec7a9", wall: "#414b3c" };

/**
 * Gives a drawing a new style. Rooms, walls and doors in the old style's colours take the
 * new ones; a room with its own floor (water, grass) keeps it.
 */
export function applyMapStyle(d: MapDrawing, next: MapStyle, background: string | null) {
  const old = d.style ?? { ...unstyledColours };
  const swap = new Map<string, string>();
  if (background) swap.set(d.background.toLowerCase(), background);
  swap.set(old.floor.toLowerCase(), next.floor);
  swap.set(old.wall.toLowerCase(), next.wall);
  for (const s of d.shapes) {
    if (s.fill) s.fill = swap.get(s.fill.toLowerCase()) ?? s.fill;
    s.stroke = swap.get(s.stroke.toLowerCase()) ?? s.stroke;
  }
  if (background) d.background = background;
  d.style = { ...next };
}

/** One thing to draw: a path filled or stroked, maybe clipped to the inside of a room. */
export type DrawOp = { d: string; fill?: string; stroke?: string; width?: number; opacity?: number; clip?: string; cap?: "butt" | "round"; matrix?: [number, number, number, number, number, number]; text?: { value: string; x: number; y: number; size: number } };

const ring = (pts: Point[]) => `M ${pts.map(p => `${round(p.x)} ${round(p.y)}`).join(" L ")} Z`;
const round = (n: number) => Math.round(n * 10) / 10;
const area = (pts: Point[]) => pts.reduce((sum, p, i) => { const q = pts[(i + 1) % pts.length]; return sum + p.x * q.y - q.x * p.y; }, 0);
/** A room's floor as one path: every part wound the same way, so overlapping parts add up. */
function floorOutline(s: MapShape): string {
  return roomPolygons(s).map(p => ring(area(p) < 0 ? [...p].reverse() : p)).join(" ");
}
function bounds(s: MapShape) {
  const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function gridLines(s: MapShape, size: number): string {
  const b = bounds(s), out: string[] = [];
  for (let x = Math.ceil(b.x0 / size) * size; x <= b.x1; x += size) out.push(`M ${x} ${b.y0} V ${b.y1}`);
  for (let y = Math.ceil(b.y0 / size) * size; y <= b.y1; y += size) out.push(`M ${b.x0} ${y} H ${b.x1}`);
  return out.join(" ");
}
/** Diagonal hatching over the whole map. */
export function hatchLines(width: number, height: number, gap = 14): string {
  const out: string[] = [];
  for (let k = -height; k < width; k += gap) out.push(`M ${k} ${height} L ${k + height} 0`);
  return out.join(" ");
}
/** A small, steady wobble (the same every time it is drawn). */
function noise(seed: number, i: number) {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}
const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
/** The outline of a shape as rough, hand-cut stone. */
export function roughPath(pts: Point[], closed: boolean, amount: number, seed: string): string {
  const s = hash(seed), out: Point[] = [], step = Math.max(10, amount * 3);
  const count = closed ? pts.length : pts.length - 1;
  for (let k = 0; k < count; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const n = Math.max(1, Math.round(len / step)), nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    for (let i = 0; i < n; i++) {
      const t = i / n, j = i === 0 ? 0 : noise(s, out.length) * amount;
      out.push({ x: a.x + (b.x - a.x) * t + nx * j, y: a.y + (b.y - a.y) * t + ny * j });
    }
  }
  if (!closed) out.push(pts[pts.length - 1]);
  if (out.length < 2) return "";
  return `M ${out.map(p => `${round(p.x)} ${round(p.y)}`).join(" L ")}${closed ? " Z" : ""}`;
}
/** A shape's outline as points, for rough walls (curves are followed closely). */
function outlinePoints(type: string, pts: Point[], smooth: boolean, closed: boolean): { pts: Point[]; closed: boolean } {
  if (type === "rect" || type === "ellipse") return { pts: roomPolygons({ type, closed: true, points: pts, roomParts: [] })[0], closed: true };
  if (type === "curve") {
    const [a, b, c] = pts;
    return { pts: Array.from({ length: 17 }, (_, i) => { const t = i / 16, u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; }), closed: false };
  }
  if (smooth && pts.length > 2) {
    const n = pts.length, at = (i: number) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))], out: Point[] = [];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let k = 0; k < 6; k++) {
        const t = k / 6, t2 = t * t, t3 = t2 * t;
        const f = (a: number, b: number, c: number, d: number) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
      }
    }
    if (!closed) out.push(pts[n - 1]);
    return { pts: out, closed };
  }
  return { pts, closed };
}
function roughOutline(s: MapShape, amount: number): string {
  const parts = s.type === "merged"
    ? s.roomParts.map(p => outlinePoints(p.type, s.points.slice(p.start, p.start + p.count), p.smooth, p.closed))
    : [outlinePoints(s.type, s.points, s.smooth, s.closed)];
  return parts.map((p, i) => roughPath(p.pts, p.closed, amount, `${s.id}:${i}`)).join(" ");
}
const visibleWalls = (s: MapShape) => wallSegments([s]).map(w => `M ${round(w.a.x)} ${round(w.a.y)} L ${round(w.b.x)} ${round(w.b.y)}`).join(" ");
const isRoomShape = (s: MapShape) => !!s.fill && (s.type === "merged" || s.type === "rect" || s.type === "ellipse" || (s.type === "path" && s.closed));

const cache = new WeakMap<MapShape, { key: string; ops: DrawOp[] }>();
/** What to draw for one shape, in order, in the drawing's style. */
export function shapeOps(s: MapShape, d: Pick<MapDrawing, "background" | "style">): DrawOp[] {
  const key = `${d.background}|${JSON.stringify(d.style)}`, hit = cache.get(s);
  if (hit && hit.key === key) return hit.ops;
  const ops = buildShapeOps(s, d);
  cache.set(s, { key, ops });
  return ops;
}
function buildShapeOps(s: MapShape, d: Pick<MapDrawing, "background" | "style">): DrawOp[] {
  const style = d.style, background = d.background;
  if (s.type === "label") {
    const b = labelBox(s), p = s.points[0], r = b.h / 2, ops: DrawOp[] = [];
    // A badge is a circle for a number, or a pill for longer text.
    if (s.fill) ops.push({ d: `M ${b.x + r} ${b.y} H ${b.x + b.w - r} A ${r} ${r} 0 0 1 ${b.x + b.w - r} ${b.y + b.h} H ${b.x + r} A ${r} ${r} 0 0 1 ${b.x + r} ${b.y} Z`, fill: s.fill, stroke: s.stroke, width: Math.max(1.5, s.thickness / 9) });
    ops.push({ d: "", fill: s.stroke, text: { value: s.name, x: p.x, y: p.y, size: s.thickness } });
    return ops;
  }
  if (s.type === "stamp") {
    const stamp = stampById(s.stamp);
    if (!stamp) return [];
    const matrix = stampMatrix(s, stamp), ink = style?.ink ?? "#2b2b2b";
    return stamp.parts.map(part => ({ d: part.d, fill: part.fill, stroke: part.stroke === "ink" ? ink : part.stroke, width: part.width, matrix }));
  }
  if (s.type === "door" || s.type === "window") return [
    { d: shapePath(s), stroke: s.fill ?? background, width: s.thickness + 1, cap: "butt" },
    { d: openingPath(s), stroke: s.stroke, width: 2 },
  ];
  const walls = style?.walls ?? "solid", room = isRoomShape(s), merged = s.type === "merged";
  // A merged room's wall is drawn twice as wide with the floor over its inner half.
  const t = merged ? s.thickness * 2 : s.thickness;
  const gap = style?.outside === "clear" ? (s.fill ?? style.floor) : background;
  const outline = merged ? roomPaths(s) : [shapePath(s)];
  const wallPath = walls === "rough" ? roughOutline(s, Math.min(7, Math.max(2, s.thickness * .35))) : outline.join(" ");
  const ops: DrawOp[] = [];
  const wallOps = (): DrawOp[] => walls === "double"
    ? [{ d: wallPath, stroke: s.stroke, width: t }, { d: wallPath, stroke: gap, width: Math.max(1, t - 5) }]
    : [{ d: wallPath, stroke: s.stroke, width: t }];
  if (merged) ops.push(...wallOps());
  if (s.fill) outline.forEach(p => ops.push({ d: p, fill: s.fill! }));
  if (room && style) {
    const clip = merged ? floorOutline(s) : outline[0];
    if (style.grid !== "off") ops.push({ d: gridLines(s, style.gridSize), stroke: style.ink, width: 1, opacity: style.grid === "on" ? .35 : .16, clip });
    if (style.shadow) {
      const edge = merged ? visibleWalls(s) : outline[0], base = merged ? 0 : t;
      for (const [w, o] of [[30, .06], [18, .08], [8, .12]] as const) ops.push({ d: edge, stroke: s.stroke, width: base + w, opacity: o, clip, cap: "butt" });
    }
  }
  if (!merged) ops.push(...wallOps());
  else if (walls === "double") ops.push({ d: visibleWalls(s), stroke: s.stroke, width: 2.5 });
  return ops;
}

/** What to draw under the shapes: the outside of the rooms. */
export function backgroundOps(d: Pick<MapDrawing, "background" | "style">, width: number, height: number): DrawOp[] {
  const outside = d.style?.outside ?? "solid";
  if (outside === "clear") return [];
  const ops: DrawOp[] = [{ d: `M 0 0 H ${width} V ${height} H 0 Z`, fill: d.background }];
  if (outside === "hatched") ops.push({ d: hatchLines(width, height), stroke: d.style!.hatch, width: 3, cap: "butt" });
  return ops;
}

function drawOp(ctx: CanvasRenderingContext2D, op: DrawOp) {
  ctx.save();
  if (op.clip) ctx.clip(new Path2D(op.clip));
  if (op.matrix) ctx.transform(...op.matrix);
  if (op.opacity !== undefined) ctx.globalAlpha = op.opacity;
  if (op.text) {
    ctx.fillStyle = op.fill ?? "#000000"; ctx.font = `600 ${op.text.size}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(op.text.value, op.text.x, op.text.y);
    ctx.restore(); return;
  }
  const path = new Path2D(op.d);
  if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(path); }
  if (op.stroke) { ctx.lineCap = op.cap ?? "round"; ctx.lineJoin = "round"; ctx.strokeStyle = op.stroke; ctx.lineWidth = op.width ?? 1; ctx.stroke(path); }
  ctx.restore();
}
/** Draws a map drawing onto a canvas, as Maptable shows it. Shapes in `skip` (stamps that are pieces on the table) are left out. */
export function drawMapDrawing(ctx: CanvasRenderingContext2D, d: MapDrawing, width: number, height: number, skip?: ReadonlySet<string>) {
  for (const op of backgroundOps(d, width, height)) drawOp(ctx, op);
  for (const shape of orderedShapes(d)) if (!skip?.has(shape.id)) for (const op of shapeOps(shape, d)) drawOp(ctx, op);
}

/**
 * Draws a stamp on its own, unturned, in the middle of a square canvas as wide as its longer side,
 * for its picture as a piece on the table. The piece is turned on the table instead.
 */
export function drawStampPiece(ctx: CanvasRenderingContext2D, s: MapShape, d: Pick<MapDrawing, "background" | "style">, side: number) {
  const [p, q] = s.points, w = Math.abs(q.x - p.x), h = Math.abs(q.y - p.y), long = Math.max(w, h, 1), k = side / long;
  const centred: MapShape = { ...s, rotation: 0, points: [{ x: (long - w) / 2, y: (long - h) / 2 }, { x: (long + w) / 2, y: (long + h) / 2 }] };
  ctx.save(); ctx.scale(k, k);
  for (const op of buildShapeOps(centred, d)) drawOp(ctx, op);
  ctx.restore();
}
