import type { MapShape, Point } from "./model.ts";

/** The drawing tools, in rail order, with their one-key shortcuts. */
export const creatorTools = [
  { id: "select", label: "Select", key: "V" },
  { id: "rect", label: "Room", key: "R" },
  { id: "poly", label: "Shaped room", key: "P" },
  { id: "circle", label: "Round room", key: "C" },
  { id: "ellipse", label: "Oval room", key: "O" },
  { id: "line", label: "Wall", key: "W" },
  { id: "curve", label: "Curved wall", key: "A" },
  { id: "path", label: "Freehand", key: "F" },
  { id: "door", label: "Door", key: "D" },
  { id: "window", label: "Window", key: "N" },
  { id: "stamp", label: "Stamps", key: "S" },
  { id: "label", label: "Label", key: "T" },
] as const;
export type CreatorTool = typeof creatorTools[number]["id"];
export const toolForKey = (key: string): CreatorTool | null => creatorTools.find(t => t.key === key.toUpperCase())?.id ?? null;

/** How the drawing maps to the table: pixels per square, and what a square is worth. */
export type CreatorGrid = { size: number; units: number; unit: string };
export const defaultCreatorGrid: CreatorGrid = { size: 70, units: 5, unit: "ft" };

export function shapeBounds(s: Pick<MapShape, "points">) {
  const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** A distance in pixels as table units, rounded to a tidy half unit ("12.5 ft"). */
export function distance(px: number, grid: CreatorGrid): string {
  const value = Math.round(px / grid.size * grid.units * 2) / 2;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${grid.unit}`;
}
export const toUnits = (px: number, grid: CreatorGrid) => Math.round(px / grid.size * grid.units * 2) / 2;
export const fromUnits = (value: number, grid: CreatorGrid) => value / grid.units * grid.size;

/** Rooms are described by their size; walls, doors and windows by their length. */
export function isArea(s: Pick<MapShape, "type" | "closed">) {
  return s.type === "rect" || s.type === "ellipse" || s.type === "merged" || (s.type === "path" && s.closed);
}
export function lineLength(s: Pick<MapShape, "type" | "points">): number {
  if (s.type === "curve") {
    // A quadratic curve's length, close enough for a label.
    const [a, b, c] = s.points; let length = 0, prev = a;
    for (let i = 1; i <= 24; i++) { const t = i / 24, u = 1 - t; const p = { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; length += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
    return length;
  }
  let length = 0;
  for (let i = 1; i < s.points.length; i++) length += Math.hypot(s.points[i].x - s.points[i - 1].x, s.points[i].y - s.points[i - 1].y);
  return length;
}
export function sizeLabel(s: Pick<MapShape, "type" | "closed" | "points">, grid: CreatorGrid): string {
  if (isArea(s) || s.type === "stamp") { const b = shapeBounds(s); return `${distance(b.w, grid).replace(` ${grid.unit}`, "")} × ${distance(b.h, grid)}`; }
  return distance(lineLength(s), grid);
}

/** Snaps a point to the grid (or not), keeping it on the map. */
export function snapPoint(p: Point, step: number | null, width: number, height: number): Point {
  const round = (v: number) => step ? Math.round(v / step) * step : Math.round(v);
  return { x: Math.max(0, Math.min(width, round(p.x))), y: Math.max(0, Math.min(height, round(p.y))) };
}

/** Stretches a shape so its bounding box is w × h, keeping its top-left corner. */
export function resizeShape<T extends Pick<MapShape, "points">>(s: T, w: number, h: number): T {
  const b = shapeBounds(s);
  const sx = b.w ? w / b.w : 1, sy = b.h ? h / b.h : 1;
  return { ...s, points: s.points.map(p => ({ x: Math.round(b.x + (p.x - b.x) * sx), y: Math.round(b.y + (p.y - b.y) * sy) })) };
}

/** Moves a shape by dx, dy without letting it leave the map. */
export function offsetShape<T extends Pick<MapShape, "points">>(s: T, dx: number, dy: number, width: number, height: number): T {
  const b = shapeBounds(s);
  const x = Math.max(-b.x, Math.min(width - b.x - b.w, dx)), y = Math.max(-b.y, Math.min(height - b.y - b.h, dy));
  return { ...s, points: s.points.map(p => ({ x: p.x + x, y: p.y + y })) };
}

/** A straight piece of wall, with the shape it belongs to and how thick it is. */
export type WallSegment = { a: Point; b: Point; shapeId: string; thickness: number; floor: string | null };
const ring = (pts: Point[], closed: boolean) => pts.slice(0, closed ? pts.length : -1).map((a, i) => [a, pts[(i + 1) % pts.length]] as [Point, Point]);
function ellipsePoints(a: Point, b: Point, n = 32): Point[] {
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: cx + rx * Math.cos(i / n * Math.PI * 2), y: cy + ry * Math.sin(i / n * Math.PI * 2) }));
}
const rectPoints = (a: Point, b: Point): Point[] => [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
/** The four corners of a rectangle, clockwise from its first point. */
export const rectCorners = (s: Pick<MapShape, "points">) => rectPoints(s.points[0], s.points[1]);
function outline(type: string, points: Point[], closed: boolean): [Point, Point][] {
  if (type === "rect") return ring(rectPoints(points[0], points[1]), true);
  if (type === "ellipse") return ring(ellipsePoints(points[0], points[1]), true);
  if (type === "curve") {
    const [a, b, c] = points, pts = Array.from({ length: 13 }, (_, i) => { const t = i / 12, u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; });
    return ring(pts, false);
  }
  return ring(points, closed);
}
/** Every straight piece of wall a door or window could sit in. */
export function wallSegments(shapes: MapShape[]): WallSegment[] {
  const out: WallSegment[] = [];
  for (const s of shapes) {
    if (s.type === "door" || s.type === "window" || s.type === "opening" || s.type === "stamp" || s.type === "label") continue;
    // A merged room's wall is drawn twice as wide and half hidden under the floor.
    const thickness = s.type === "merged" ? s.thickness * 2 : s.thickness;
    const parts = s.type === "merged" ? s.roomParts.map(p => outline(p.type, s.points.slice(p.start, p.start + p.count), p.closed)) : [outline(s.type, s.points, s.closed)];
    // Walls inside a joined room are hidden under its floor, so doors skip them.
    const polygons = s.type === "merged" ? roomPolygons(s) : [];
    // A piece of wall with floor on both sides of it is hidden.
    const hidden = (a: Point, b: Point) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / len * 2, ny = (b.x - a.x) / len * 2, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return polygons.some(poly => inside({ x: m.x + nx, y: m.y + ny }, poly)) && polygons.some(poly => inside({ x: m.x - nx, y: m.y - ny }, poly));
    };
    parts.forEach(part => {
      for (const [a, b] of part) {
        if (a.x === b.x && a.y === b.y) continue;
        if (!polygons.length) { out.push({ a, b, shapeId: s.id, thickness, floor: s.fill }); continue; }
        // A wall can be partly inside another part: keep only the stretches you can see.
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10)), at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        let runStart: number | null = null;
        for (let i = 0; i <= n; i++) {
          const visible = i < n && !hidden(at(i / n), at((i + 1) / n));
          if (visible && runStart === null) runStart = i;
          if (!visible && runStart !== null) { out.push({ a: at(runStart / n), b: at(i / n), shapeId: s.id, thickness, floor: s.fill }); runStart = null; }
        }
      }
    });
  }
  return out;
}
/** Where p lands on segment ab: t from 0 to 1, the point itself, and how far away p is. */
export function project(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, point: q, distance: Math.hypot(p.x - q.x, p.y - q.y) };
}
export function nearestWall(walls: WallSegment[], p: Point, within: number): WallSegment | null {
  let best: WallSegment | null = null, bestDistance = within;
  for (const w of walls) { const d = project(p, w.a, w.b).distance; if (d <= bestDistance) { best = w; bestDistance = d; } }
  return best;
}
/**
 * A door or window placed in a wall: from where you pressed to where you let go, both
 * slid onto the wall. A click (or a very short drag) makes one a square wide, centred.
 */
export function openingOnWall(wall: WallSegment, start: Point, end: Point, width: number): [Point, Point] {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1, ux = (wall.b.x - wall.a.x) / len, uy = (wall.b.y - wall.a.y) / len;
  const at = (t: number) => ({ x: Math.round(wall.a.x + ux * t), y: Math.round(wall.a.y + uy * t) });
  const s = project(start, wall.a, wall.b).t * len, e = project(end, wall.a, wall.b).t * len;
  if (Math.abs(e - s) < width / 2) { const half = Math.min(width, len) / 2, c = Math.max(half, Math.min(len - half, s)); return [at(c - half), at(c + half)]; }
  return [at(Math.min(s, e)), at(Math.max(s, e))];
}

/** Rooms are filled rectangles, ovals and closed outlines (and rooms already joined). */
export const isRoom = (s: Pick<MapShape, "type" | "closed" | "fill">) => !!s.fill && isArea(s);
/** The outlines of a room as polygons (a joined room has several). */
export function roomPolygons(s: Pick<MapShape, "type" | "closed" | "points" | "roomParts">): Point[][] {
  const poly = (type: string, pts: Point[]) => type === "rect" ? rectPoints(pts[0], pts[1]) : type === "ellipse" ? ellipsePoints(pts[0], pts[1]) : pts;
  return s.type === "merged" ? s.roomParts.map(p => poly(p.type, s.points.slice(p.start, p.start + p.count))) : [poly(s.type, s.points)];
}
function inside(p: Point, poly: Point[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
/** Two walls cross, or lie along each other for more than a point (corners that just meet don't count). */
/** Inside a polygon and not just on its edge. */
function insideRoom(v: Point, poly: Point[], slack: number) { return inside(v, poly) && poly.every((c, k) => project(v, c, poly[(k + 1) % poly.length]).distance > slack); }
function segmentsMeet(a: Point, b: Point, c: Point, d: Point, slack: number) {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const touching = [project(a, c, d), project(b, c, d), project(c, a, b), project(d, a, b)].filter(r => r.distance <= slack).map(r => r.point);
  return touching.some(p => touching.some(q => Math.hypot(p.x - q.x, p.y - q.y) > slack * 2));
}
/** True when two room outlines overlap, or share a stretch of wall. */
export function roomsTouch(a: Pick<MapShape, "type" | "closed" | "points" | "roomParts">, b: Pick<MapShape, "type" | "closed" | "points" | "roomParts">, slack = 1): boolean {
  const ba = shapeBounds(a), bb = shapeBounds(b);
  if (ba.x > bb.x + bb.w + slack || bb.x > ba.x + ba.w + slack || ba.y > bb.y + bb.h + slack || bb.y > ba.y + ba.h + slack) return false;
  const pa = roomPolygons(a), pb = roomPolygons(b);
  for (const p of pa) for (const q of pb) {
    // A corner well inside the other room is an overlap; one sitting on its wall is checked below.
    if (p.some(v => insideRoom(v, q, slack)) || q.some(v => insideRoom(v, p, slack))) return true;
    for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) if (segmentsMeet(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length], slack)) return true;
  }
  return false;
}
/** The rooms a new room joins: filled rooms it overlaps or shares a wall with. */
export function touchingRooms<T extends Pick<MapShape, "id" | "type" | "closed" | "fill" | "points" | "roomParts">>(shape: T, others: T[], slack = 1): T[] {
  return others.filter(o => o.id !== shape.id && isRoom(o) && roomsTouch(shape, o, slack));
}

/** Which edge or corner stays put when the map changes size: 0 = left/top, .5 = centre, 1 = right/bottom. */
export type MapAnchor = { x: 0 | 0.5 | 1; y: 0 | 0.5 | 1 };
type Sized = { width: number; height: number; drawing: { shapes: MapShape[]; layerOrder?: string[] } };
const clampPoint = (p: Point, w: number, h: number) => ({ x: Math.max(0, Math.min(w, p.x)), y: Math.max(0, Math.min(h, p.y)) });

/**
 * A map at a new size. The anchor's side stays where it is, so the drawing moves by whole squares
 * (dx, dy) when the map grows or shrinks on the other side. Shapes past the new edge are trimmed to it,
 * and shapes left wholly outside are removed; `trimmed` names both.
 */
export function resizeMap<T extends Sized>(d: T, width: number, height: number, anchor: MapAnchor, step: number): T & { dx: number; dy: number; trimmed: string[] } {
  const w = Math.max(step, Math.round(width)), h = Math.max(step, Math.round(height));
  const dx = Math.round((w - d.width) * anchor.x / step) * step, dy = Math.round((h - d.height) * anchor.y / step) * step;
  const trimmed: string[] = [], gone = new Set<string>();
  const shapes = d.drawing.shapes.flatMap(s => {
    const points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    const b = shapeBounds({ points });
    if (b.x >= w || b.y >= h || b.x + b.w <= 0 || b.y + b.h <= 0) { trimmed.push(s.id); gone.add(s.id); return []; }
    const clamped = points.map(p => clampPoint(p, w, h));
    if (clamped.some((p, i) => p.x !== points[i].x || p.y !== points[i].y)) trimmed.push(s.id);
    return [{ ...s, points: clamped }];
  });
  const drawing = { ...d.drawing, shapes, ...(d.drawing.layerOrder ? { layerOrder: d.drawing.layerOrder.filter(id => !gone.has(id)) } : {}) };
  return { ...d, width: w, height: h, drawing, dx, dy, trimmed };
}

/**
 * Erases a stretch of wall, from a to b along it. A straight wall is shortened or split in two
 * (or removed when the whole of it goes); a room's wall, a curved wall or a freehand wall gets an opening there.
 * Returns the shapes and where the change goes in the layer order.
 */
export function eraseWall(shapes: MapShape[], wall: WallSegment, a: Point, b: Point, newId: () => string, background: string): { shapes: MapShape[]; added: MapShape[]; removed: string[] } {
  const target = shapes.find(s => s.id === wall.shapeId);
  if (!target || Math.hypot(b.x - a.x, b.y - a.y) < 1) return { shapes, added: [], removed: [] };
  if (target.type === "line" && target.points.length === 2) {
    const [p, q] = target.points, len = Math.hypot(q.x - p.x, q.y - p.y);
    const t0 = Math.min(project(a, p, q).t, project(b, p, q).t), t1 = Math.max(project(a, p, q).t, project(b, p, q).t);
    const at = (t: number) => ({ x: Math.round(p.x + (q.x - p.x) * t), y: Math.round(p.y + (q.y - p.y) * t) });
    const pieces = [[0, t0], [t1, 1]].filter(([s, e]) => (e - s) * len >= 2).map(([s, e]) => [at(s), at(e)]);
    if (!pieces.length) return { shapes: shapes.filter(s => s.id !== target.id), added: [], removed: [target.id] };
    const first = { ...target, points: pieces[0] };
    const added = pieces.slice(1).map(points => ({ ...target, id: newId(), name: `${target.name || "Wall"} (part)`.slice(0, 120), points }));
    return { shapes: [...shapes.map(s => s.id === target.id ? first : s), ...added], added, removed: [] };
  }
  const opening: MapShape = { ...target, id: newId(), type: "opening", name: "Opening", roomParts: [], stamp: null, rotation: 0, flip: false, smooth: false,
    points: [{ x: Math.round(a.x), y: Math.round(a.y) }, { x: Math.round(b.x), y: Math.round(b.y) }], fill: wall.floor ?? background, thickness: wall.thickness, closed: false };
  return { shapes: [...shapes, opening], added: [opening], removed: [] };
}

/** Walls with the openings erased into them taken out, for line of sight. */
export function cutOpenings(walls: WallSegment[], shapes: MapShape[]): WallSegment[] {
  const openings = shapes.filter(s => s.type === "opening" && s.points.length >= 2);
  if (!openings.length) return walls;
  return walls.flatMap(w => {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (!len) return [w];
    const cuts = openings.flatMap(o => {
      const [p, q] = o.points, near = w.thickness / 2 + 2, pa = project(p, w.a, w.b), pb = project(q, w.a, w.b);
      return pa.distance <= near && pb.distance <= near ? [[Math.min(pa.t, pb.t), Math.max(pa.t, pb.t)]] : [];
    }).sort((x, y) => x[0] - y[0]);
    if (!cuts.length) return [w];
    const at = (t: number) => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t });
    const out: WallSegment[] = []; let from = 0;
    for (const [s, e] of cuts) { if ((s - from) * len >= 1) out.push({ ...w, a: at(from), b: at(s) }); from = Math.max(from, e); }
    if ((1 - from) * len >= 1) out.push({ ...w, a: at(from), b: w.b });
    return out;
  });
}

/** Moves everything on a scene by dx, dy pixels, for a drawn map that grew or shrank on its top or left. */
export function shiftSceneContents(scene: { tokens: { x: number; y: number }[]; effects: { x: number; y: number }[]; pointsOfInterest?: { x: number; y: number }[]; measurements?: { points: Point[] }[]; fog: { strokes: { points: Point[] }[] }; crop?: { x: number; y: number } | null; savedCrops?: { x: number; y: number }[] }, dx: number, dy: number) {
  if (!dx && !dy) return;
  const move = (p: { x: number; y: number }) => { p.x += dx; p.y += dy; };
  scene.tokens.forEach(move); scene.effects.forEach(move); scene.pointsOfInterest?.forEach(move);
  scene.measurements?.forEach(m => m.points.forEach(move)); scene.fog.strokes.forEach(s => s.points.forEach(move));
  for (const c of [scene.crop, ...(scene.savedCrops ?? [])]) if (c) { c.x = Math.max(0, c.x + dx); c.y = Math.max(0, c.y + dy); }
}
