import type { DrawOp } from "../map-style.ts";
import { biomes, readHex, type Biome, type BiomeId, type TerrainId } from "./biomes.ts";
import { hexCells, hexOutline, round, type HexOrient } from "./layout.ts";
import type { HexLayer } from "./generate.ts";

/**
 * Draws a hex map as a short list of paths, grouped by colour, so the Map Creator (SVG) and
 * Maptable (canvas) draw it the same way and quickly. Every symbol is a simple shape drawn here.
 */
type Role = "main" | "dark" | "trunk" | "snow" | "lava" | "light" | "gold";
type Part = { d: string; role: Role; stroke?: number };
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

/** A small, fixed random number for a hex, so its look never changes between draws. */
const wobble = (i: number, salt: number) => { let n = Math.imul(i + 1, 374761393) ^ Math.imul(salt, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

/** The colour of a hex's ground. */
export function hexFill(b: BiomeId, t: TerrainId, i = 0) {
  const B = biomes[b], j = [-0.035, 0, 0.035][Math.floor(wobble(i, 1) * 3)];
  if (t === "deep") return b === "glacier" ? WATER.iceDeep : WATER.deep;
  if (t === "shallow") return b === "glacier" ? WATER.ice : WATER.shallow;
  if (t === "lake") return b === "glacier" ? WATER.ice : WATER.lake;
  if (t === "beach") return shade("#ead9a8", j);
  if (t === "mountain" || t === "peak") return shade(B.flat, j - 0.06);
  if (t === "hills") return shade(B.flat, j - 0.05);
  if (t === "forest") return shade(B.forest, j);
  if (t === "marsh") return shade(B.flat, j - 0.04);
  return shade(B.flat, j);
}

class Painter {
  private groups = new Map<string, { op: DrawOp; parts: string[] }>();
  private k: number;
  constructor(k: number) { this.k = k; }
  add(d: string, paint: { fill?: string; stroke?: string; width?: number; opacity?: number }) {
    const key = `${paint.fill ?? ""}|${paint.stroke ?? ""}|${paint.width ?? ""}|${paint.opacity ?? ""}`;
    let g = this.groups.get(key);
    if (!g) { g = { op: { d: "", ...paint }, parts: [] }; this.groups.set(key, g); }
    g.parts.push(d);
  }
  symbol(name: string, x: number, y: number, scale: number, colours: Partial<Record<Role, string>>) {
    for (const part of SYMBOLS[name]) {
      const colour = colours[part.role]; if (!colour) continue;
      const d = place(part.d, x, y, this.k * scale);
      if (part.stroke) this.add(d, { stroke: colour, width: round(part.stroke * this.k * scale * 10) / 10 });
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

type Drawable = Pick<HexLayer, "x" | "y" | "size" | "cols" | "rows" | "orient" | "cells" | "rivers">;
const cache = new WeakMap<Drawable, DrawOp[]>();
// The Map Creator copies the drawing on every change, so recent layers are also kept by what they hold.
const recent: { key: string; ops: DrawOp[] }[] = [];
/** What to draw for a hex map, in drawing pixels: ground, symbols, then rivers. */
export function hexLayerOps(layer: Drawable): DrawOp[] {
  const hit = cache.get(layer); if (hit) return hit;
  const key = [layer.x, layer.y, layer.size, layer.cols, layer.rows, layer.orient, layer.cells, JSON.stringify(layer.rivers)].join("|");
  const kept = recent.find(r => r.key === key);
  if (kept) { cache.set(layer, kept.ops); return kept.ops; }
  const ops = buildOps(layer);
  cache.set(layer, ops); recent.unshift({ key, ops }); recent.length = Math.min(recent.length, 4);
  return ops;
}
function buildOps(layer: Drawable): DrawOp[] {
  const k = layer.size / 10, orient: HexOrient = layer.orient;
  const cells = hexCells({ cols: layer.cols, rows: layer.rows, orient, outline: "rect", size: layer.size });
  const ground = new Painter(k), marks = new Painter(k), lines: string[] = [];
  for (const h of cells) {
    const hex = readHex(layer.cells, h.i); if (!hex) continue;
    const x = h.x + layer.x, y = h.y + layer.y, { biome: b, terrain: t } = hex, B: Biome = biomes[b];
    const fill = hexFill(b, t, h.i), outline = hexOutline(x, y, layer.size, orient);
    ground.add(outline, { fill, stroke: fill, width: round(0.6 * k * 10) / 10 });
    lines.push(outline);
    const r = (salt: number) => wobble(h.i, salt);
    const tree = { main: B.tree, trunk: "#5a4632", snow: "#f4f8fa", light: "#ffffff88" };
    if (t === "deep" && b !== "glacier" && r(2) < 0.18) marks.symbol("wave", x + (r(3) - 0.5) * 6 * k, y + (r(4) - 0.5) * 6 * k, 1, { light: "#ffffff66" });
    else if ((t === "deep" || t === "shallow" || t === "lake") && b === "glacier" && r(2) < 0.5) marks.symbol("ice", x, y, 1, { dark: "#9fb8c4" });
    else if (t === "forest") {
      const spots = B.treeKind === "jungle" ? [[-3, 1.6], [3, 1.4], [0, -2.6]] : [[-3.6, 2], [3.4, 1.8], [0, -2.4], [-0.2, 4.6]];
      const n = B.treeKind === "jungle" ? 3 : 3 + (r(5) < 0.5 ? 1 : 0);
      for (let s = 0; s < n; s++) marks.symbol(B.treeKind, x + (spots[s][0] + (r(6 + s) - 0.5) * 1.4) * k, y + (spots[s][1] + (r(10 + s) - 0.5) * 1.2) * k, B.treeKind === "jungle" ? 1 : 0.9, tree);
    } else if (t === "mountain" || t === "peak") {
      const scale = t === "peak" ? 1.25 : 1.05, mx = x - 0.3 * k, my = y + k;
      marks.symbol("peak", mx, my, scale, { main: shade(B.mount, 0.05), dark: shade(B.mount, -0.28) });
      if (b === "volcanic" && t === "peak") marks.symbol("crater", mx, my, scale, { lava: "#ff7a3d" });
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
      else if (b === "fey" && roll < 0.5) marks.symbol("spark", x, y, 1, { gold: "#f6d36b" });
      else if (b === "glacier" && roll < 0.35) marks.symbol("ice", x, y, 1, { dark: "#a9c0ca" });
      else if (b === "badlands" && roll < 0.25) marks.symbol("mesa", x, y, 0.8, { main: "#bd7f50", dark: "#9a6038" });
      else if (roll < 0.18 && !B.special && B.heat > 0.2) marks.symbol(B.treeKind, x + (r(21) - 0.5) * 6 * k, y + (r(22) - 0.5) * 5 * k, 0.8, tree);
    }
  }
  const ops = [...ground.ops(), { d: lines.join(""), stroke: "#000000", width: round(0.5 * k * 10) / 10, opacity: 0.14 }, ...marks.ops()];
  for (const river of layer.rivers) {
    const points = river.filter(i => i >= 0 && i < cells.length).map(i => ({ x: cells[i].x + layer.x, y: cells[i].y + layer.y }));
    if (points.length < 2) continue;
    const source = readHex(layer.cells, river[0]), cold = !!source && biomes[source.biome].heat < 1.2;
    ops.push({ d: smoothPath(points), stroke: cold ? WATER.coldRiver : WATER.river, width: round(2.2 * k * 10) / 10, opacity: 0.95 });
  }
  return ops;
}
