import type { DrawOp } from "../map-style.ts";
import { biomes, isWaterTerrain, readHex, terrainNames, type Biome, type BiomeId, type TerrainId } from "./biomes.ts";
import { hexCells, hexMapSize, hexOutline, round, type HexOrient } from "./layout.ts";
import { defaultHexLook, type HexLayer, type HexLook } from "./generate.ts";
import { isSettlement, placeKindNames, type HexPlace, type HexPlaceKind } from "./places.ts";

/**
 * Draws a hex map as a short list of paths, grouped by colour, so the Map Creator (SVG) and
 * Maptable (canvas) draw it the same way and quickly. Every symbol is a simple shape drawn here.
 * Three looks: Painted (colour and symbols), Flat colours (colour only) and Ink (black and white,
 * for printing), with optional hex numbers and a legend.
 */
type Role = "main" | "dark" | "trunk" | "snow" | "lava" | "light" | "gold";
/** A symbol's piece: filled (or stroked, `stroke` wide) in its role's colour, with an optional `edge` around a fill. */
type Part = { d: string; role: Role; stroke?: number; edge?: { role: Role; width: number } };
/** A circle as four curves, so it can be moved and scaled like any other path. */
function circle(cx: number, cy: number, r: number, ry = r) {
  const k = 0.5523;
  return `M${cx - r} ${cy}C${cx - r} ${cy - ry * k} ${cx - r * k} ${cy - ry} ${cx} ${cy - ry}C${cx + r * k} ${cy - ry} ${cx + r} ${cy - ry * k} ${cx + r} ${cy}`
    + `C${cx + r} ${cy + ry * k} ${cx + r * k} ${cy + ry} ${cx} ${cy + ry}C${cx - r * k} ${cy + ry} ${cx - r} ${cy + ry * k} ${cx - r} ${cy}Z`;
}
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;
const pine = "M0 -3.8L2.4 1.6L-2.4 1.6Z";
const SYMBOLS: Record<string, Part[]> = {
  round: [{ d: rect(-0.5, 0, 1, 2.6), role: "trunk" }, { d: circle(0, -1, 2.5), role: "main" }],
  pine: [{ d: rect(-0.45, 1.4, 0.9, 1.4), role: "trunk" }, { d: pine, role: "main" }],
  snowpine: [{ d: rect(-0.45, 1.4, 0.9, 1.4), role: "trunk" }, { d: pine, role: "main" }, { d: "M0 -3.8L1.2 -1.1L0.3 -1.6L-0.4 -1L-1.2 -1.1Z", role: "snow" }],
  acacia: [{ d: "M-0.3 2.8L0 -0.6M0 -0.6L1.2 -1.6M0 -0.6L-1.2 -1.4", role: "trunk", stroke: 0.6 }, { d: circle(0, -1.9, 3, 1.1), role: "main" }],
  jungle: [{ d: "M-0.6 1.6L0 2.8L0.6 1.6Z", role: "trunk" }, { d: circle(-1.6, 0, 2) + circle(1.6, 0.2, 2) + circle(0, -1.7, 2.2), role: "main" }],
  willow: [{ d: rect(-0.4, 0, 0.8, 2.6), role: "trunk" }, { d: "M-2.8 1.4C-2.8 -2.6 2.8 -2.6 2.8 1.4C2 0.2 1.2 1.2 0 0.2C-1.2 1.2 -2 0.2 -2.8 1.4Z", role: "main" }],
  cactus: [{ d: "M-0.6 2.8L-0.6 -2.4Q-0.6 -3 0 -3Q0.6 -3 0.6 -2.4L0.6 2.8Z M-0.6 0.6L-1.7 0.6L-1.7 -1.1Q-1.7 -1.6 -1.2 -1.6Q-0.7 -1.6 -0.7 -1.1L-0.7 -0.4L-0.6 -0.4Z M0.6 0L1.6 0L1.6 -1.6Q1.6 -2.1 1.1 -2.1Q0.6 -2.1 0.6 -1.6Z", role: "main" }],
  dead: [{ d: "M0 2.8L0 -1M0 0.4L-1.6 -1.4M0 -0.4L1.4 -2.2M-1 -0.6L-1.8 -1M0.8 -1.4L1.6 -1.2", role: "main", stroke: 0.55 }],
  twisted: [{ d: "M0 2.8C-0.8 1 0.8 0 0 -1.4M0 -0.2C1 -0.6 1.6 -1.6 2.2 -1.2M0 -1.4C-1 -2 -1.8 -1.6 -2.2 -2.4", role: "main", stroke: 0.6 }, { d: circle(2.2, -1.3, 0.7) + circle(-2.2, -2.4, 0.7), role: "main" }],
  mushroom: [{ d: rect(-0.55, -0.2, 1.1, 2.6), role: "trunk" }, { d: "M-2.6 0C-2.6 -3 2.6 -3 2.6 0Z", role: "main" }, { d: circle(-1, -1.1, 0.35) + circle(0.9, -1.5, 0.3), role: "light" }],
  peak: [{ d: "M-6 3.4L-0.4 -5L5.6 3.4Z", role: "main" }, { d: "M-0.4 -5L5.6 3.4L1.2 3.4L0.6 -1Z", role: "dark" }],
  cap: [{ d: "M-0.4 -5L-2.6 -1.7L-1.6 -2.3L-0.8 -1.5L0.3 -2.4L1.3 -1.6Z", role: "snow" }],
  crater: [{ d: "M-1.4 -3.6Q-0.4 -4.6 0.8 -3.6L0.2 -1.8L-0.8 -2Z", role: "lava" }],
  hill: [{ d: "M-5 2C-4 -1.6 -1.4 -1.6 -0.4 2M-0.6 2.4C0.4 -0.6 3 -0.6 4.2 2.4", role: "dark", stroke: 0.8 }],
  mesa: [{ d: "M-4.2 2.2L-3 -0.6L2.6 -0.6L3.8 2.2Z", role: "main" }, { d: "M-3.6 0.8L3.2 0.8", role: "dark", stroke: 0.45 }],
  marsh: [{ d: "M-3 1.4L-0.8 1.4M-2 1.4L-2 -0.4M-1.6 1.4L-0.8 -0.2M-2.4 1.4L-3 -0.1M1 3L3.4 3M2.2 3L2.2 1.4M2.6 3L3.3 1.6M1.8 3L1.2 1.7M-1 -1.8L0.6 -1.8", role: "dark", stroke: 0.5 }],
  dune: [{ d: "M-4.4 1.2Q-2 -1.4 0.6 1.2M0.4 -1.6Q2.4 -3.4 4.2 -1.4", role: "dark", stroke: 0.6 }],
  crack: [{ d: "M-4 -1L-1.6 0L-0.8 -1.8L1.2 -0.4L3.6 -1.2M-1.6 0L-2 2.2M1.2 -0.4L1.8 2", role: "lava", stroke: 0.55 }],
  ice: [{ d: "M-4 1.6L-1.4 0.4L0.4 1.4L3.4 -0.4M-1.4 0.4L-2 -1.8M0.4 1.4L1 3", role: "dark", stroke: 0.4 }],
  blight: [{ d: circle(-2, -0.6, 1.1) + circle(1.4, 1.2, 0.8) + circle(2, -1.8, 0.55), role: "main" }],
  spark: [{ d: "M0 -1.8L0.4 -0.4L1.8 0L0.4 0.4L0 1.8L-0.4 0.4L-1.8 0L-0.4 -0.4Z" + circle(-2.6, 1.4, 0.4), role: "gold" }],
  wave: [{ d: "M-2.4 0Q-1.2 -1 0 0Q1.2 1 2.4 0", role: "light", stroke: 0.45 }],
  // Places: "main" is the ink, "light" the paper around it.
  city: [{ d: circle(0, 0, 4.6), role: "light", edge: { role: "main", width: 1 } }, { d: "M-2.6 2L-2.6 -1.2L-1.6 -1.2L-1.6 -0.2L-0.5 -0.2L-0.5 -2.4L0.5 -2.4L0.5 -0.2L1.6 -0.2L1.6 -1.2L2.6 -1.2L2.6 2Z", role: "main" }],
  town: [{ d: circle(0, 0, 3.6), role: "light", edge: { role: "main", width: 1 } }, { d: circle(0, 0, 1.6), role: "main" }],
  village: [{ d: circle(0, 0, 2.6), role: "main", edge: { role: "light", width: 0.9 } }],
  ruin: [{ d: "M-3 2.6L-3 -1.2Q-3 -3.4 0 -3.4Q1.6 -3.4 2.4 -2.4L1.2 -1.4L2.4 -0.6L1.6 0.4L1.6 2.6L0.6 2.6L0.6 -0.8Q0.6 -1.8 -0.6 -1.8Q-1.8 -1.8 -1.8 -0.8L-1.8 2.6Z", role: "main", edge: { role: "light", width: 0.6 } }],
  tower: [{ d: "M-1.6 3L-1.6 -1.8L-2.2 -1.8L-2.2 -3.6L-1.2 -3.6L-1.2 -2.8L-0.4 -2.8L-0.4 -3.6L0.4 -3.6L0.4 -2.8L1.2 -2.8L1.2 -3.6L2.2 -3.6L2.2 -1.8L1.6 -1.8L1.6 3Z", role: "main", edge: { role: "light", width: 0.6 } }],
  cave: [{ d: "M-3.4 2.4Q-3.2 -3 0 -3Q3.2 -3 3.4 2.4Z", role: "main", edge: { role: "light", width: 0.6 } }, { d: "M-1.4 2.4Q-1.4 -0.6 0 -0.6Q1.4 -0.6 1.4 2.4Z", role: "light" }],
  shrine: [{ d: "M0 -3.6L3.2 2.6L-3.2 2.6Z", role: "main", edge: { role: "light", width: 0.6 } }, { d: circle(0, 0.8, 0.9), role: "light" }],
  lair: [{ d: circle(0, 0, 3.2), role: "lava", edge: { role: "light", width: 0.7 } }, { d: "M-1.6 -1.2L-0.6 1.6M0 -1.6L0 1.8M1.6 -1.2L0.6 1.6", role: "light", stroke: 0.6 }],
};

/** Moves and scales a path made of absolute M, L, Q and C commands. */
function place(d: string, x: number, y: number, k: number) {
  let even = true;
  return d.replace(/-?\d*\.?\d+(e-?\d+)?/g, n => { const v = even ? x + Number(n) * k : y + Number(n) * k; even = !even; return String(round(v)); });
}
/** Lightens (amount above 0) or darkens (below 0) a #rrggbb colour. */
export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return "#" + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
}
const WATER = { deep: "#4d84a5", shallow: "#7db1c6", lake: "#76aec0", ice: "#dbe8ee", iceDeep: "#c7dbe4", river: "#4f8fb4", coldRiver: "#bcd6e2" };
/** The Ink look: dark ink on paper, pale blue-grey water. */
const INK = { ink: "#2f2b26", paper: "#f8f5ee", shadow: "#d5d0c4", deep: "#dfe7ea", shallow: "#edf2f3", ice: "#f3f6f7", wave: "#6f8d99", river: "#4e6b78" };

/** A small, fixed random number for a hex, so its look never changes between draws. */
const wobble = (i: number, salt: number) => { let n = Math.imul(i + 1, 374761393) ^ Math.imul(salt, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/** The colour of a hex's ground in a look. */
export function hexFill(b: BiomeId, t: TerrainId, i = 0, look: HexLook["look"] = "painted") {
  const B = biomes[b], j = [-0.035, 0, 0.035][Math.floor(wobble(i, 1) * 3)], frozen = b === "glacier";
  if (look === "ink") return isWaterTerrain(t) ? (frozen ? INK.ice : t === "deep" ? INK.deep : INK.shallow) : INK.paper;
  if (t === "deep") return frozen ? WATER.iceDeep : WATER.deep;
  if (t === "shallow") return frozen ? WATER.ice : WATER.shallow;
  if (t === "lake") return frozen ? WATER.ice : WATER.lake;
  if (t === "beach") return shade("#ead9a8", j);
  if (t === "mountain" || t === "peak") return shade(look === "flat" ? B.mount : B.flat, j - 0.06);
  if (t === "hills") return shade(B.flat, j - 0.05);
  // Flat colours has no tree symbols, so a forest keeps its biome's colour, only darker.
  if (t === "forest") return shade(B.forest, look === "flat" ? j - 0.15 : j);
  if (t === "marsh") return shade(B.flat, j - 0.04);
  return shade(B.flat, j);
}

class Painter {
  private groups = new Map<string, { op: DrawOp; parts: string[] }>();
  private k: number; private ink: boolean;
  /** `ink`: draw symbols as ink outlines on paper instead of in colour. */
  constructor(k: number, ink = false) { this.k = k; this.ink = ink; }
  add(d: string, paint: { fill?: string; stroke?: string; width?: number; opacity?: number }) {
    const key = `${paint.fill ?? ""}|${paint.stroke ?? ""}|${paint.width ?? ""}|${paint.opacity ?? ""}`;
    let g = this.groups.get(key);
    if (!g) { g = { op: { d: "", ...paint }, parts: [] }; this.groups.set(key, g); }
    g.parts.push(d);
  }
  symbol(name: string, x: number, y: number, scale: number, colours: Partial<Record<Role, string>>) {
    for (const part of SYMBOLS[name]) {
      const colour = colours[part.role]; if (!colour) continue;
      const d = place(part.d, x, y, this.k * scale), width = (w: number) => round(w * this.k * scale * 10) / 10;
      if (this.ink) {
        // Ink keeps the shapes but not the colours; lava and glints have no ink version.
        if (part.role === "lava" || part.role === "gold") continue;
        if (part.stroke) this.add(d, { stroke: part.role === "light" ? INK.wave : INK.ink, width: width(part.stroke) });
        else if (part.role === "main" || part.role === "snow") this.add(d, { fill: INK.paper, stroke: INK.ink, width: width(part.role === "snow" ? 0.3 : 0.45) });
        else if (part.role === "dark") this.add(d, { fill: INK.shadow });
        else if (part.role === "trunk") this.add(d, { fill: INK.ink });
        continue;
      }
      if (part.stroke) this.add(d, { stroke: colour, width: width(part.stroke) });
      else if (part.edge && colours[part.edge.role]) this.add(d, { fill: colour, stroke: colours[part.edge.role], width: width(part.edge.width) });
      else this.add(d, { fill: colour });
    }
  }
  ops(): DrawOp[] { return [...this.groups.values()].map(g => ({ ...g.op, d: g.parts.join(""), cap: "round" as const })); }
}
function smoothPath(points: { x: number; y: number }[]) {
  let d = `M${round(points[0].x)} ${round(points[0].y)}`;
  for (let k = 1; k < points.length - 1; k++) {
    const p = points[k], n = points[k + 1];
    d += `Q${round(p.x)} ${round(p.y)} ${round((p.x + n.x) / 2)} ${round((p.y + n.y) / 2)}`;
  }
  const last = points[points.length - 1];
  return d + `L${round(last.x)} ${round(last.y)}`;
}

type Drawable = Pick<HexLayer, "x" | "y" | "size" | "cols" | "rows" | "orient" | "cells" | "rivers" | "miles"> & Partial<HexLook> & Partial<Pick<HexLayer, "places" | "roads">>;
const cache = new WeakMap<Drawable, DrawOp[]>();
// The Map Creator copies the drawing on every change, so recent layers are also kept by what they hold.
const recent: { key: string; ops: DrawOp[] }[] = [];
/** What to draw for a hex map, in drawing pixels: ground, outlines, symbols, rivers, numbers and the legend. */
export function hexLayerOps(layer: Drawable): DrawOp[] {
  const hit = cache.get(layer); if (hit) return hit;
  const look = lookOf(layer);
  const key = [layer.x, layer.y, layer.size, layer.cols, layer.rows, layer.orient, layer.miles, look.look, look.lines, look.numbers, look.legend, look.labels, layer.cells, JSON.stringify([layer.rivers, layer.roads, layer.places])].join("|");
  const kept = recent.find(r => r.key === key);
  if (kept) { cache.set(layer, kept.ops); return kept.ops; }
  const ops = buildOps(layer, look);
  cache.set(layer, ops); recent.unshift({ key, ops }); recent.length = Math.min(recent.length, 4);
  return ops;
}
const lookOf = (layer: Partial<HexLook>): HexLook => ({ look: layer.look ?? defaultHexLook.look, lines: layer.lines ?? defaultHexLook.lines, numbers: layer.numbers ?? defaultHexLook.numbers, legend: layer.legend ?? defaultHexLook.legend, labels: layer.labels ?? defaultHexLook.labels });

/** The symbols on one hex, in the Painted or Ink look. */
function hexMarks(marks: Painter, b: BiomeId, t: TerrainId, x: number, y: number, k: number, i: number, ink: boolean) {
  const B: Biome = biomes[b], r = (salt: number) => wobble(i, salt);
  const tree = { main: B.tree, trunk: "#5a4632", snow: "#f4f8fa", light: "#ffffff88" };
  if (t === "deep" && b !== "glacier" && r(2) < (ink ? 0.35 : 0.18)) marks.symbol("wave", x + (r(3) - 0.5) * 6 * k, y + (r(4) - 0.5) * 6 * k, 1, { light: "#ffffff66" });
  else if (ink && t === "shallow" && b !== "glacier" && r(2) < 0.2) marks.symbol("wave", x + (r(3) - 0.5) * 6 * k, y + (r(4) - 0.5) * 6 * k, 0.8, { light: "#ffffff66" });
  else if (isWaterTerrain(t) && b === "glacier" && r(2) < 0.5) marks.symbol("ice", x, y, 1, { dark: "#9fb8c4" });
  else if (t === "forest") {
    const spots = B.treeKind === "jungle" ? [[-3, 1.6], [3, 1.4], [0, -2.6]] : [[-3.6, 2], [3.4, 1.8], [0, -2.4], [-0.2, 4.6]];
    const n = B.treeKind === "jungle" ? 3 : 3 + (r(5) < 0.5 ? 1 : 0);
    for (let s = 0; s < n; s++) marks.symbol(B.treeKind, x + (spots[s][0] + (r(6 + s) - 0.5) * 1.4) * k, y + (spots[s][1] + (r(10 + s) - 0.5) * 1.2) * k, B.treeKind === "jungle" ? 1 : 0.9, tree);
  } else if (t === "mountain" || t === "peak") {
    const scale = t === "peak" ? 1.25 : 1.05, mx = x - 0.3 * k, my = y + k;
    marks.symbol("peak", mx, my, scale, { main: shade(B.mount, 0.05), dark: shade(B.mount, -0.28) });
    if (b === "volcanic" && t === "peak" && !ink) marks.symbol("crater", mx, my, scale, { lava: "#ff7a3d" });
    else if (t === "peak" || B.heat < 1.2) marks.symbol("cap", mx, my, scale, { snow: "#f5f8fa" });
  } else if (t === "hills") {
    if (b === "badlands") marks.symbol("mesa", x, y + 0.5 * k, 1, { main: "#bd7f50", dark: "#9a6038" });
    else marks.symbol("hill", x, y + 0.5 * k, 1, { dark: shade(B.flat, -0.38) });
  } else if (t === "marsh") marks.symbol("marsh", x, y, 1, { dark: shade(B.tree, 0.05) });
  else if (t === "flat") {
    const roll = r(20);
    if (b === "desert" && roll < 0.55) marks.symbol("dune", x, y, 1, { dark: "#c9ad6d" });
    else if (b === "volcanic" && roll < 0.5) marks.symbol("crack", x, y, 1, { lava: "#ff7a3d" });
    else if (b === "blighted" && roll < 0.5) marks.symbol("blight", x, y, 1, { main: "#8e5f9a" });
    else if (b === "fey" && roll < 0.5) marks.symbol(ink ? "mushroom" : "spark", x, y, ink ? 0.8 : 1, { gold: "#f6d36b", main: B.tree, trunk: "#5a4632" });
    else if (b === "glacier" && roll < 0.35) marks.symbol("ice", x, y, 1, { dark: "#a9c0ca" });
    else if (b === "badlands" && roll < 0.25) marks.symbol("mesa", x, y, 0.8, { main: "#bd7f50", dark: "#9a6038" });
    else if (roll < 0.18 && !B.special && B.heat > 0.2) marks.symbol(B.treeKind, x + (r(21) - 0.5) * 6 * k, y + (r(22) - 0.5) * 5 * k, 0.8, tree);
  }
}

function buildOps(layer: Drawable, look: HexLook): DrawOp[] {
  const k = layer.size / 10, orient: HexOrient = layer.orient, ink = look.look === "ink";
  const cells = hexCells({ cols: layer.cols, rows: layer.rows, orient, outline: "rect", size: layer.size });
  const ground = new Painter(k), marks = new Painter(k, ink), lines: string[] = [], numbers: DrawOp[] = [];
  const pad = (n: number) => String(n).padStart(2, "0");
  for (const h of cells) {
    const hex = readHex(layer.cells, h.i); if (!hex) continue;
    const x = h.x + layer.x, y = h.y + layer.y, { biome: b, terrain: t } = hex;
    const fill = hexFill(b, t, h.i, look.look), outline = hexOutline(x, y, layer.size, orient);
    ground.add(outline, { fill, stroke: fill, width: round(0.6 * k * 10) / 10 });
    if (look.lines) lines.push(outline);
    if (look.look !== "flat") hexMarks(marks, b, t, x, y, k, h.i, ink);
    if (look.numbers) numbers.push({ d: "", fill: ink ? "#2f2b26b3" : "#1c2329a6", text: { value: pad(h.c + 1) + pad(h.r + 1), x: round(x), y: round(y + layer.size * (orient === "flat" ? 0.64 : 0.72)), size: round(2.4 * k * 10) / 10, weight: 500 } });
  }
  const ops = ground.ops();
  if (lines.length) ops.push({ d: lines.join(""), stroke: ink ? INK.ink : "#000000", width: round(0.5 * k * 10) / 10, opacity: ink ? 0.33 : 0.14 });
  ops.push(...marks.ops());
  for (const river of layer.rivers) {
    const points = river.filter(i => i >= 0 && i < cells.length).map(i => ({ x: cells[i].x + layer.x, y: cells[i].y + layer.y }));
    if (points.length < 2) continue;
    const source = readHex(layer.cells, river[0]), cold = !!source && biomes[source.biome].heat < 1.2;
    ops.push({ d: smoothPath(points), stroke: ink ? INK.river : cold ? WATER.coldRiver : WATER.river, width: round((ink ? 1.4 : 2.2) * k * 10) / 10, opacity: 0.95 });
  }
  for (const road of layer.roads ?? []) {
    const points = road.filter(i => i >= 0 && i < cells.length).map(i => ({ x: cells[i].x + layer.x, y: cells[i].y + layer.y }));
    if (points.length >= 2) ops.push({ d: smoothPath(points), stroke: ink ? INK.ink : ROAD, width: round(1.1 * k * 10) / 10, opacity: 0.85, dash: [round(2.6 * k), round(1.8 * k)] });
  }
  ops.push(...numbers);
  // Settlements are on the map for everyone; ruins and lairs are GM-only, see `hexSiteOps`.
  ops.push(...placeOps(layer, cells, (layer.places ?? []).filter(p => isSettlement(p.kind)), look.labels));
  if (look.legend !== "none") ops.push(...legendOps(layer, look, cells.length));
  return ops;
}

const ROAD = "#7a5a3a", PLACE_COLOURS = { main: "#2b2620", light: "#fbf7ee", lava: "#7a1f1a" };
const LABEL_SIZE: Record<HexPlaceKind, number> = { city: 7, town: 6, village: 5, ruin: 4.6, tower: 4.6, cave: 4.6, shrine: 4.6, lair: 4.6 };
/** Place symbols and, with `labels`, their names above them. */
function placeOps(layer: Drawable, cells: { x: number; y: number }[], places: HexPlace[], labels: boolean): DrawOp[] {
  const k = layer.size / 10, marks = new Painter(k), names: DrawOp[] = [];
  for (const p of places) {
    const c = cells[p.i]; if (!c) continue;
    const x = c.x + layer.x, y = c.y + layer.y, size = LABEL_SIZE[p.kind] * k;
    marks.symbol(p.kind, x, y, 1.15, PLACE_COLOURS);
    if (labels) names.push({ d: "", fill: "#221d18", text: { value: p.name, x: round(x), y: round(y - 5.6 * k - size * 0.5), size: round(size), weight: p.kind === "city" ? 600 : 500, serif: true, italic: !isSettlement(p.kind), halo: "#fbf7eecc" } });
  }
  return [...marks.ops(), ...names];
}
/** The GM-only places (ruins, towers, caves, shrines and lairs), drawn over the map in the Map Creator but never into its picture. */
const siteCache = new WeakMap<Drawable, DrawOp[]>();
export function hexSiteOps(layer: Drawable): DrawOp[] {
  const hit = siteCache.get(layer); if (hit) return hit;
  const sites = (layer.places ?? []).filter(p => !isSettlement(p.kind));
  const ops = sites.length ? placeOps(layer, hexCells({ cols: layer.cols, rows: layer.rows, orient: layer.orient, outline: "rect", size: layer.size }), sites, lookOf(layer).labels) : [];
  siteCache.set(layer, ops);
  return ops;
}

/** What a legend row shows: a coloured hex, a symbol on a hex, a place's symbol, or a river or road line. */
type LegendRow = { label: string; fill?: string; symbol?: { biome: BiomeId; terrain: TerrainId }; river?: boolean; road?: boolean; place?: HexPlaceKind };
/** The rows of a hex map's legend, from what is on the map, for a look. */
export function hexLegendRows(layer: Pick<HexLayer, "cells" | "rivers"> & Partial<Pick<HexLayer, "places" | "roads">>, look: HexLook["look"], count = layer.cells.length / 2): LegendRow[] {
  const biomeCount = new Map<BiomeId, number>(), terrainBiome = new Map<TerrainId, Map<BiomeId, number>>();
  for (let i = 0; i < count; i++) {
    const hex = readHex(layer.cells, i); if (!hex) continue;
    if (!isWaterTerrain(hex.terrain)) biomeCount.set(hex.biome, (biomeCount.get(hex.biome) ?? 0) + 1);
    const t = hex.terrain === "peak" ? "mountain" : hex.terrain, m = terrainBiome.get(t) ?? new Map<BiomeId, number>();
    m.set(hex.biome, (m.get(hex.biome) ?? 0) + 1); terrainBiome.set(t, m);
  }
  const most = (t: TerrainId) => [...terrainBiome.get(t)!.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const rows: LegendRow[] = [];
  if (look !== "ink") for (const [b] of [...biomeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) rows.push({ label: biomes[b].name, fill: hexFill(b, "flat", 1, look) });
  for (const t of ["forest", "hills", "mountain", "marsh"] as const) {
    if (!terrainBiome.has(t)) continue;
    // Flat colours has no symbols, so only terrain with a colour of its own gets a row.
    if (look === "flat" && (t === "hills" || t === "marsh")) continue;
    const b = most(t);
    rows.push({ label: terrainNames[t], fill: hexFill(b, t, 1, look), symbol: look === "flat" ? undefined : { biome: b, terrain: t } });
  }
  const sea = terrainBiome.has("deep") || terrainBiome.has("shallow"), lake = terrainBiome.has("lake");
  if (sea || lake) rows.push({ label: sea && lake ? "Sea and lakes" : sea ? "Sea" : "Lakes", fill: hexFill("temperate", sea ? "shallow" : "lake", 1, look) });
  if (layer.rivers.length) rows.push({ label: "River", river: true });
  for (const kind of ["city", "town", "village"] as const) if (layer.places?.some(p => p.kind === kind)) rows.push({ label: placeKindNames[kind], place: kind });
  if (layer.roads?.length) rows.push({ label: "Road", road: true });
  return rows;
}

/** The legend: a box in one corner of the map with a row for each biome and kind of terrain on it. */
function legendOps(layer: Drawable, look: HexLook, count: number): DrawOp[] {
  const rows = hexLegendRows(layer, look.look, count); if (!rows.length) return [];
  const ink = look.look === "ink", { width: W, height: H } = hexMapSize(layer);
  const title = `One hex: ${+layer.miles.toFixed(1)} ${layer.miles === 1 ? "mile" : "miles"}`;
  const chars = Math.max(title.length * 1.08, ...rows.map(r => r.label.length));
  // Sized in "legend units": a little bigger than a hex's symbols, but never more than 35% of the map's width or 60% of its height.
  const boxW = 7 + 9 + chars * 2.9, boxH = 8 + 9 + rows.length * 9;
  const u = Math.min(layer.size / 10 * 1.3, W * 0.35 / boxW, H * 0.6 / boxH), m = layer.size * 0.35;
  const left = layer.x + (look.legend === "nw" || look.legend === "sw" ? m : W - m - boxW * u), top = layer.y + (look.legend === "nw" || look.legend === "ne" ? m : H - m - boxH * u);
  const at = (n: number) => Math.round(n * 10) / 10;
  const ops: DrawOp[] = [
    { d: `M${at(left)} ${at(top)}h${at(boxW * u)}v${at(boxH * u)}h${at(-boxW * u)}Z`, fill: ink ? INK.paper : "#fbf8f0", stroke: ink ? INK.ink : "#5a4632", width: at(0.4 * u), opacity: 0.95 },
    { d: "", fill: ink ? INK.ink : "#2b241d", text: { value: title, x: at(left + 4 * u), y: at(top + 8 * u), size: at(4.6 * u), align: "start", weight: 600 } },
  ];
  const icons = new Painter(u * 0.5, ink), swatches = new Painter(u), places = new Painter(u);
  rows.forEach((row, n) => {
    const cx = left + 8.5 * u, cy = top + (17.5 + n * 9) * u;
    if (row.place) places.symbol(row.place, cx, cy, 1, PLACE_COLOURS);
    else if (row.road) ops.push({ d: `M${at(cx - 4 * u)} ${at(cy)}L${at(cx + 4 * u)} ${at(cy)}`, stroke: ink ? INK.ink : ROAD, width: at(1.1 * u * 0.8), dash: [at(2 * u), at(1.4 * u)] });
    else if (row.river) ops.push({ d: `M${at(cx - 4 * u)} ${at(cy + 1.5 * u)}Q${at(cx - 2 * u)} ${at(cy - 2 * u)} ${at(cx)} ${at(cy)}T${at(cx + 4 * u)} ${at(cy - 1.5 * u)}`, stroke: ink ? INK.river : WATER.river, width: at((ink ? 1.4 : 2.2) * u * 0.8) });
    else {
      swatches.add(hexOutline(cx, cy, 4 * u, "flat"), { fill: row.fill, stroke: ink ? INK.ink : "#00000040", width: at(0.3 * u) });
      if (row.symbol) hexMarks(icons, row.symbol.biome, row.symbol.terrain, cx, cy - 0.4 * u, u * 0.5, 7, ink);
    }
    ops.push({ d: "", fill: ink ? INK.ink : "#2b241d", text: { value: row.label, x: at(left + 15 * u), y: at(cy), size: at(4.2 * u), align: "start", weight: 500 } });
  });
  ops.splice(2, 0, ...swatches.ops(), ...icons.ops(), ...places.ops());
  return ops;
}
