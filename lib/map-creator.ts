import type { MapShape, Point } from "./model.ts";

/** The drawing tools, in rail order, with their one-key shortcuts. */
export const creatorTools = [
  { id: "select", label: "Select", key: "V" },
  { id: "rect", label: "Room", key: "R" },
  { id: "circle", label: "Round room", key: "C" },
  { id: "ellipse", label: "Oval room", key: "O" },
  { id: "line", label: "Wall", key: "W" },
  { id: "curve", label: "Curved wall", key: "A" },
  { id: "path", label: "Freehand", key: "F" },
  { id: "door", label: "Door", key: "D" },
  { id: "window", label: "Window", key: "N" },
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
  if (isArea(s)) { const b = shapeBounds(s); return `${distance(b.w, grid).replace(` ${grid.unit}`, "")} × ${distance(b.h, grid)}`; }
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
