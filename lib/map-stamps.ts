import type { MapShape, Point } from "./model.ts";
import { spaceStamps } from "./space-stamps.ts";
import { moreStamps } from "./more-stamps.ts";

/**
 * The stamp library: furniture and features drawn as paths, so the Map Creator (SVG)
 * and Maptable (canvas) draw them the same way. Art is drawn 40 units to a square;
 * "ink" outlines take the map style's ink colour.
 */
export type StampPart = { d: string; fill?: string; stroke?: "ink" | string; width?: number };
/** Light a stamp gives when placed: bright and dim reach in squares, and its colour. */
export type StampLight = { bright: number; dim: number; colour: string };
export type Stamp = { id: string; name: string; category: StampCategory; w: number; h: number; parts: StampPart[]; image?: string; light?: StampLight };
export const stampCategories = ["Yours", "Dungeon", "Furniture", "Lights", "Town", "Outdoors", "Stars", "Worlds", "Space", "Stations and ships"] as const;
export type StampCategory = typeof stampCategories[number];

const R = (x: number, y: number, w: number, h: number) => `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
const C = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
const ink = (d: string, fill?: string, width = 2): StampPart => ({ d, fill, stroke: "ink", width });
const paint = (d: string, fill: string): StampPart => ({ d, fill });
const line = (d: string, width = 1.5, stroke: string = "ink"): StampPart => ({ d, stroke, width });

export const stamps: Stamp[] = [
  { id: "stairs", name: "Stairs", category: "Dungeon", w: 1, h: 1, parts: [ink(R(6, 6, 28, 28), "#d8d2c2"), line("M 6 12 H 34 M 6 18 H 34 M 6 24 H 34 M 6 30 H 34")] },
  { id: "pillar", name: "Pillar", category: "Dungeon", w: 1, h: 1, parts: [ink(C(20, 20, 12), "#9a958a"), line(C(20, 20, 6), 1)] },
  { id: "statue", name: "Statue", category: "Dungeon", w: 1, h: 1, parts: [ink(R(8, 8, 24, 24), "#c9c4b8"), ink(C(20, 17, 5), "#8f8a80", 1.5), ink("M 13 29 Q 20 20 27 29 Z", "#8f8a80", 1.5)] },
  { id: "chest", name: "Chest", category: "Dungeon", w: 1, h: 1, parts: [ink(R(8, 12, 24, 16), "#9a6a35"), line("M 8 18 H 32"), paint(R(18, 16, 4, 5), "#e3b341")] },
  { id: "altar", name: "Altar", category: "Dungeon", w: 2, h: 1, parts: [ink(R(8, 8, 64, 24), "#bdb7aa"), paint(C(18, 20, 3), "#e3b341"), paint(C(62, 20, 3), "#e3b341"), line(R(30, 14, 20, 12), 1)] },
  { id: "trapdoor", name: "Trapdoor", category: "Dungeon", w: 1, h: 1, parts: [ink(R(8, 8, 24, 24), "#8a5a2b"), line("M 8 16 H 32 M 8 24 H 32", 1), paint(C(27, 20, 2), "#2b2b2b")] },
  { id: "table", name: "Table", category: "Furniture", w: 2, h: 1, parts: [ink("M 10 9 H 70 Q 74 9 74 13 V 27 Q 74 31 70 31 H 10 Q 6 31 6 27 V 13 Q 6 9 10 9 Z", "#b07a42")] },
  { id: "chair", name: "Chair", category: "Furniture", w: 1, h: 1, parts: [ink(R(12, 14, 16, 14), "#b07a42"), ink(R(12, 9, 16, 5), "#8a5a2b", 1.5)] },
  { id: "bed", name: "Bed", category: "Furniture", w: 1, h: 2, parts: [ink(R(6, 6, 28, 68), "#e7e2d8"), ink(R(9, 9, 22, 12), "#ffffff", 1), ink(R(6, 30, 28, 44), "#7a8fb0", 1.5)] },
  { id: "barrel", name: "Barrel", category: "Furniture", w: 1, h: 1, parts: [ink(C(20, 20, 12), "#a06a35"), line(C(20, 20, 7), 1)] },
  { id: "crate", name: "Crate", category: "Furniture", w: 1, h: 1, parts: [ink(R(8, 8, 24, 24), "#c08a4a"), line("M 8 8 L 32 32 M 32 8 L 8 32")] },
  { id: "bookshelf", name: "Bookshelf", category: "Furniture", w: 2, h: 1, parts: [ink(R(4, 12, 72, 16), "#8a5a2b"), line("M 12 15 V 25 M 20 15 V 25 M 28 15 V 25 M 40 15 V 25 M 48 15 V 25 M 60 15 V 25 M 68 15 V 25", 3, "#e3d5b0")] },
  { id: "tree", name: "Tree", category: "Outdoors", w: 2, h: 2, parts: [ink(C(40, 40, 32), "#5f8a4a"), paint(C(29, 31, 11), "#7aa35f"), paint(C(50, 48, 9), "#7aa35f"), paint(C(47, 26, 6), "#7aa35f")] },
  { id: "rock", name: "Rock", category: "Outdoors", w: 1, h: 1, parts: [ink("M 7 26 L 11 12 L 22 7 L 33 15 L 31 28 L 17 32 Z", "#8f8f8a"), line("M 22 7 L 20 19 L 31 28 M 20 19 L 11 12", 1)] },
  { id: "bush", name: "Bush", category: "Outdoors", w: 1, h: 1, parts: [ink(C(14, 22, 8), "#6f9a52", 1.5), ink(C(26, 19, 8), "#6f9a52", 1.5), paint(C(21, 26, 6), "#6f9a52")] },
  { id: "tent", name: "Tent", category: "Outdoors", w: 2, h: 2, parts: [ink("M 10 70 L 40 10 L 70 70 Z", "#c9a36a"), line("M 40 10 V 70"), paint("M 34 70 L 40 52 L 46 70 Z", "#4a3a2a")] },
  { id: "campfire", name: "Campfire", category: "Outdoors", w: 1, h: 1, parts: [...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ink(C(20 + Math.cos(i * Math.PI / 4) * 12, 20 + Math.sin(i * Math.PI / 4) * 12, 3), "#8a8a84", 1)), paint("M 20 11 Q 27 19 20 27 Q 13 19 20 11 Z", "#e8742c"), paint("M 20 16 Q 24 21 20 25 Q 16 21 20 16 Z", "#f6c34a")] },
  { id: "well", name: "Well", category: "Outdoors", w: 1, h: 1, parts: [ink(C(20, 20, 13), "#a8a39a"), ink(C(20, 20, 7), "#3f6f8f", 1.5)] },
  ...moreStamps,
  ...spaceStamps,
];
export const stampById = (id: string | null | undefined, custom: Stamp[] = []) => stamps.find(s => s.id === id) ?? custom.find(s => s.id === id) ?? null;

/**
 * Tints recolour a placed stamp's paint (not its ink outlines): each colour keeps its lightness and
 * takes the tint's hue and strength, so wood can become stone, iron or gold. See-through colours stay see-through.
 */
export const stampTints = [
  { id: "oak", name: "Dark oak", swatch: "#6b4423", hue: 28, sat: .45, light: -.12 },
  { id: "stone", name: "Stone", swatch: "#9a9a94", hue: 45, sat: .05, light: 0 },
  { id: "iron", name: "Iron", swatch: "#5d6f80", hue: 210, sat: .14, light: -.06 },
  { id: "gold", name: "Gilded", swatch: "#d9a514", hue: 44, sat: .78, light: .04 },
  { id: "moss", name: "Mossy", swatch: "#5e8a3a", hue: 95, sat: .35, light: -.04 },
  { id: "crimson", name: "Crimson", swatch: "#9a2b2b", hue: 0, sat: .55, light: -.08 },
  { id: "frost", name: "Frost", swatch: "#8fc1d8", hue: 200, sat: .45, light: .08 },
] as const;
export type StampTint = typeof stampTints[number]["id"];
const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
function toRgba(colour: string): [number, number, number, number] | null {
  const h = colour.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (h) return [parseInt(h[1].slice(0, 2), 16), parseInt(h[1].slice(2, 4), 16), parseInt(h[1].slice(4, 6), 16), h[2] ? parseInt(h[2], 16) / 255 : 1];
  const r = colour.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  return r ? [+r[1], +r[2], +r[3], r[4] === undefined ? 1 : +r[4]] : null;
}
/** A colour in a tint, or the colour unchanged when there is no tint or it can't be read. */
export function tintColour(colour: string, tint: string | null | undefined): string {
  const t = stampTints.find(x => x.id === tint), c = toRgba(colour);
  if (!t || !c) return colour;
  const [r, g, b] = c.map((v, i) => i < 3 ? v / 255 : v), max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = Math.max(0, Math.min(1, (max + min) / 2 + t.light)), s = t.sat, h = t.hue / 360;
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const part = (x: number) => { x = (x + 1) % 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < .5 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  const out = `#${hex2(part(h + 1 / 3) * 255)}${hex2(part(h) * 255)}${hex2(part(h - 1 / 3) * 255)}`;
  return c[3] < 1 ? `${out}${hex2(c[3] * 255)}` : out;
}

/** Stamps you upload are pictures kept as assets; a placed one names its asset with this prefix. */
export const customStampPrefix = "asset:";
export const customStampAsset = (id: string | null | undefined) => id?.startsWith(customStampPrefix) ? id.slice(customStampPrefix.length) : null;
type StampAsset = { id: string; name: string; src: string; width: number; height: number; kind?: string; squares?: { w: number; h: number } };
/** How many squares an uploaded picture covers at first: one square across its shorter side. */
export function defaultSquares(width: number, height: number) {
  const ratio = width / Math.max(1, height), clamp = (n: number) => Math.min(10, Math.max(1, Math.round(n)));
  return ratio >= 1 ? { w: clamp(ratio), h: 1 } : { w: 1, h: clamp(1 / ratio) };
}
/** Your uploaded stamps, as library stamps drawn from their picture. */
export function customStamps(assets: StampAsset[]): Stamp[] {
  return assets.filter(a => a.kind === "stamp").map(a => {
    const size = a.squares ?? defaultSquares(a.width, a.height);
    return { id: `${customStampPrefix}${a.id}`, name: (a.name.replace(/\.(png|webp|jpe?g|gif|svg)$/i, "").replace(/^./, c => c.toUpperCase()).slice(0, 60)) || "Stamp", category: "Yours", w: size.w, h: size.h, parts: [], image: a.src };
  });
}
/** The assets a drawing's uploaded stamps use, so they can be loaded before drawing. */
export function drawingStampAssets(d: { shapes: { type: string; stamp?: string | null }[] } | null | undefined): string[] {
  return [...new Set((d?.shapes ?? []).flatMap(s => { const id = s.type === "stamp" ? customStampAsset(s.stamp) : null; return id ? [id] : []; }))];
}

/** Stamps whose name or category matches the search, yours first. */
export function findStamps(query: string, custom: Stamp[] = []): Stamp[] {
  const q = query.trim().toLowerCase(), all = [...custom, ...stamps];
  return q ? all.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)) : all;
}

/** The box a stamp fills when dropped at a point: its squares, lined up with the grid. */
export function stampBox(stamp: Pick<Stamp, "w" | "h">, at: Point, size: number | null, gridSize: number, width: number, height: number): [Point, Point] {
  const w = stamp.w * gridSize, h = stamp.h * gridSize;
  let x = at.x - w / 2, y = at.y - h / 2;
  if (size) { x = Math.round(x / size) * size; y = Math.round(y / size) * size; }
  x = Math.max(0, Math.min(width - w, x)); y = Math.max(0, Math.min(height - h, y));
  return [{ x, y }, { x: x + w, y: y + h }];
}

/** Where a stamp's art is drawn: a matrix taking art units into the map, turned about the box centre. */
export function stampMatrix(s: Pick<MapShape, "points" | "rotation" | "flip">, stamp: Pick<Stamp, "w" | "h">): [number, number, number, number, number, number] {
  const [p, q] = s.points, vw = stamp.w * 40, vh = stamp.h * 40;
  const sx = Math.abs(q.x - p.x) / vw * (s.flip ? -1 : 1), sy = Math.abs(q.y - p.y) / vh;
  const t = (s.rotation ?? 0) * Math.PI / 180, cos = Math.cos(t), sin = Math.sin(t);
  const a = cos * sx, b = sin * sx, c = -sin * sy, d = cos * sy;
  const cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2;
  return [a, b, c, d, cx - (a * vw / 2 + c * vh / 2), cy - (b * vw / 2 + d * vh / 2)];
}

/** The four corners of a stamp's box after turning, for its outline. */
export function stampCorners(s: Pick<MapShape, "points" | "rotation">): Point[] {
  const [p, q] = s.points, cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2, t = (s.rotation ?? 0) * Math.PI / 180;
  const turn = (x: number, y: number) => ({ x: cx + (x - cx) * Math.cos(t) - (y - cy) * Math.sin(t), y: cy + (x - cx) * Math.sin(t) + (y - cy) * Math.cos(t) });
  const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
  return [turn(x0, y0), turn(x1, y0), turn(x1, y1), turn(x0, y1)];
}

/**
 * Turns a stamp a quarter turn (or any angle). After a quarter turn its box is moved so the
 * turned stamp still sits on whole squares.
 */
export function rotateStamp(s: Pick<MapShape, "points" | "rotation">, by: number, gridSize: number | null): { points: Point[]; rotation: number } {
  const rotation = ((((s.rotation ?? 0) + by) % 360) + 360) % 360;
  if (!gridSize || rotation % 90) return { points: s.points.map(p => ({ ...p })), rotation };
  const corners = stampCorners({ points: s.points, rotation });
  const x0 = Math.min(...corners.map(c => c.x)), y0 = Math.min(...corners.map(c => c.y));
  const dx = Math.round(x0 / gridSize) * gridSize - x0, dy = Math.round(y0 / gridSize) * gridSize - y0;
  return { points: s.points.map(p => ({ x: Math.round((p.x + dx) * 100) / 100, y: Math.round((p.y + dy) * 100) / 100 })), rotation };
}
