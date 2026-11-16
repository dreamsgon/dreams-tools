import { z } from "zod";
import { galaxyRandom } from "./galaxies.ts";

/**
 * Sector pages: a hex map of one part of a galaxy (a page inside the galaxy page). One hex is 5 light years.
 * Each hex can hold one star system: charted (its star is known) or a rumour (only a name and a story so far).
 * Lanes join systems. Hexes are pointy-topped in offset rows (odd rows shifted right), counted from 0 at the top left;
 * people see them as 0101 (column 1, row 1). Kept free of other modules: the workspace schema imports it.
 */
export const LY_PER_HEX = 5;
export const starClasses = ["O", "B", "A", "F", "G", "K", "M"] as const;
export type StarClass = typeof starClasses[number];
/** Colour words, glow colours (core, glow, rim) and a one-line description of each class of star. */
export const starInfo: Record<StarClass, { colour: string; core: string; glow: string; rim: string; note: string }> = {
  O: { colour: "Blue", core: "#d6f1ff", glow: "#3d8cff", rim: "#1d3cff", note: "Huge, fierce and short-lived." },
  B: { colour: "Blue-white", core: "#eef8ff", glow: "#8cc4ff", rim: "#3f7dff", note: "Bright and young." },
  A: { colour: "White", core: "#ffffff", glow: "#d6ecff", rim: "#8fbaff", note: "Brilliant white." },
  F: { colour: "Yellow-white", core: "#fffef4", glow: "#fff3c4", rim: "#ffe08a", note: "A little hotter than the Sun." },
  G: { colour: "Yellow", core: "#fffbe0", glow: "#ffe46b", rim: "#ffb21f", note: "Sun-like and steady." },
  K: { colour: "Orange", core: "#fff1d6", glow: "#ffab3d", rim: "#e0661a", note: "Calm and very long-lived." },
  M: { colour: "Red", core: "#ffd9c9", glow: "#ff6a3d", rim: "#b4241a", note: "Small, dim and common." },
};
export const backdrops = ["nebula", "dust", "deep", "core"] as const;
export type Backdrop = typeof backdrops[number];
export const backdropNames: Record<Backdrop, string> = { nebula: "Blue nebula", dust: "Red dust", deep: "Deep black", core: "Galactic core" };
export const sectorSizes = { small: { name: "Small", cols: 8, rows: 5 }, medium: { name: "Medium", cols: 12, rows: 7 }, large: { name: "Large", cols: 18, rows: 8 } } as const;
export type SectorSizeId = keyof typeof sectorSizes;
export const MAX_COLS = 30, MAX_ROWS = 20;

const sid = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
export const sectorSystemSchema = z.object({
  id: sid,
  c: z.number().int().min(0).max(MAX_COLS - 1), r: z.number().int().min(0).max(MAX_ROWS - 1),
  name: z.string().trim().min(1).max(80),
  star: z.enum(starClasses),
  status: z.enum(["charted", "rumour"]),
  /** A line or two: what is known, or the rumour itself. */
  note: z.string().trim().max(400),
  /** Changed by the GM, so Generate again keeps it. */
  edited: z.boolean().optional(),
  /** A real star (Local Bubble): its distance from the Sun in light years. */
  ly: z.number().finite().min(0).max(100000).optional(),
});
export type SectorSystem = z.infer<typeof sectorSystemSchema>;
export const sectorLaneSchema = z.object({ a: sid, b: sid });
export type SectorLane = z.infer<typeof sectorLaneSchema>;
export const sectorSchema = z.object({
  /** Where the sector sits on its galaxy's picture, as fractions of its width and height. */
  x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  cols: z.number().int().min(4).max(MAX_COLS), rows: z.number().int().min(3).max(MAX_ROWS),
  backdrop: z.enum(backdrops),
  seed: z.string().trim().min(1).max(80),
  /** The Milky Way's Local Bubble: real stars around the Sun. */
  real: z.boolean().optional(),
  systems: z.array(sectorSystemSchema).max(400),
  lanes: z.array(sectorLaneSchema).max(600),
}).superRefine((s, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: "custom", message });
  const ids = new Set(s.systems.map(x => x.id));
  if (ids.size !== s.systems.length) bad("System ids must be unique in a sector");
  const cells = new Set<string>();
  for (const x of s.systems) {
    if (x.c >= s.cols || x.r >= s.rows) bad("A system is outside its sector");
    const k = `${x.c},${x.r}`;
    if (cells.has(k)) bad("Only one system can sit in a hex");
    cells.add(k);
  }
  for (const l of s.lanes) if (!ids.has(l.a) || !ids.has(l.b) || l.a === l.b) bad("A lane must join two systems in its sector");
});
export type Sector = z.infer<typeof sectorSchema>;

export type Hex = { c: number; r: number };
const cube = (h: Hex) => { const x = h.c - (h.r - (h.r & 1)) / 2, z = h.r; return [x, -x - z, z]; };
/** Hexes between two hexes. */
export function hexDistance(a: Hex, b: Hex) {
  const A = cube(a), B = cube(b);
  return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2]));
}
/** A hex as people read it: column then row, from 01. */
export const hexLabel = (h: Hex) => String(h.c + 1).padStart(2, "0") + String(h.r + 1).padStart(2, "0");
/** Light years between two systems: hexes × 5. */
export const lightYears = (a: Hex, b: Hex) => hexDistance(a, b) * LY_PER_HEX;
/** Time at light speed, in words: a light year takes a year. */
export function lightTime(ly: number) {
  if (ly <= 0) return "Here";
  return ly < 1 ? `${Math.round(ly * 365)} days` : `${ly % 1 ? ly.toFixed(1) : ly} year${ly === 1 ? "" : "s"}`;
}

const SYL1 = ["Co", "Del", "Ve", "Tha", "Mar", "Is", "Ka", "Or", "Sel", "Vy", "Ae", "Bry", "Qua", "Ny", "Hal", "Tes", "Ul", "Zer"];
const SYL2 = ["ri", "lar", "ve", "tho", "an", "e", "ry", "sel", "ma", "do", "li", "ne", "cy"];
const SYL3 = ["ra", "vas", "x", "on", "is", "um", "a", "eth", "ion", "ar", "ly"];
const pick = <T>(random: () => number, xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
/** A made-up star name such as "Corira". */
export const starName = (random: () => number) => pick(random, SYL1) + pick(random, SYL2) + pick(random, SYL3);
const SECTOR_WORDS = ["Reach", "Verge", "Drift", "Marches", "Expanse", "Deep", "Shoals", "Frontier", "Rim", "Hollows"];
const SECTOR_FIRST = ["Coreward", "Ember", "Silent", "Outer", "Ashen", "Golden", "Broken", "Northern", "Pale", "Iron", "Far"];
export const sectorName = (random: () => number) => `${pick(random, SECTOR_FIRST)} ${pick(random, SECTOR_WORDS)}`;
const COLOURS = ["#e0a84a", "#e06a4a", "#9a8fe6", "#7fdc9a", "#8fb4ee", "#e68fc0", "#6fd3d0"];
export const sectorColour = (random: () => number) => pick(random, COLOURS);

/** A star class weighted like a real neighbourhood: mostly red and orange dwarfs, rarely a blue giant. */
export function randomStar(random: () => number): StarClass {
  const roll = random();
  return roll < 0.5 ? "M" : roll < 0.72 ? "K" : roll < 0.86 ? "G" : roll < 0.94 ? "F" : roll < 0.98 ? "A" : roll < 0.997 ? "B" : "O";
}

const RUMOURS = [
  "Lights where no star should be.", "Ships go in and come back a day late.", "A beacon still calls in a language nobody speaks.",
  "Pirates swear there is a hidden dock here.", "Old charts mark it, new ones do not.", "Something answers when you hail it.",
  "A blue star that eats ships whole.", "A dead fleet, still in formation.", "A world where the colony stopped writing home.",
];

/** Lanes from each charted system to its nearest charted neighbour, without doubles. */
export function nearestLanes(systems: SectorSystem[]): SectorLane[] {
  const charted = systems.filter(s => s.status === "charted"), lanes: SectorLane[] = [];
  for (const a of charted) {
    let best: SectorSystem | undefined, bestD = Infinity;
    for (const b of charted) { if (a === b) continue; const d = hexDistance(a, b); if (d < bestD || (d === bestD && best && b.id < best.id)) { bestD = d; best = b; } }
    if (best && !lanes.some(l => (l.a === a.id && l.b === best!.id) || (l.a === best!.id && l.b === a.id))) lanes.push({ a: a.id, b: best.id });
  }
  return lanes;
}

export type SectorOptions = { cols: number; rows: number; count: number; seed: string; lanes: boolean; rumours: number };
/** How many systems fit: at most half the hexes. */
export const maxSystems = (cols: number, rows: number) => Math.max(1, Math.floor(cols * rows / 2));

/**
 * Systems for a sector. Systems in `keep` stay where they are (the ones the GM has changed);
 * new ones fill free hexes. The same options and seed always give the same sector.
 */
export function generateSystems(o: SectorOptions, keep: SectorSystem[] = []): Pick<Sector, "systems" | "lanes"> {
  const random = galaxyRandom(`sector|${o.seed}|${o.cols}x${o.rows}|${o.count}`);
  const kept = keep.filter(s => s.c < o.cols && s.r < o.rows);
  const used = new Set(kept.map(s => `${s.c},${s.r}`)), names = new Set(kept.map(s => s.name));
  const systems = [...kept], target = Math.min(maxSystems(o.cols, o.rows), Math.max(kept.length, Math.round(o.count)));
  for (let i = 0; systems.length < target && i < target * 40; i++) {
    const c = Math.floor(random() * o.cols), r = Math.floor(random() * o.rows), k = `${c},${r}`;
    if (used.has(k)) continue;
    // Keep systems from crowding: no neighbour in the next hex, most of the time.
    if (systems.some(s => hexDistance(s, { c, r }) < 2) && random() < 0.7) continue;
    let name = starName(random);
    for (let n = 0; names.has(name) && n < 10; n++) name = starName(random);
    if (names.has(name)) name = `${name} ${systems.length + 1}`;
    used.add(k); names.add(name);
    const rumour = random() < o.rumours / 100;
    systems.push({ id: `s${hexLabel({ c, r })}${Math.floor(random() * 1e6).toString(36)}`, c, r, name, star: randomStar(random), status: rumour ? "rumour" : "charted", note: rumour ? pick(random, RUMOURS) : "" });
  }
  return { systems, lanes: o.lanes ? nearestLanes(systems) : [] };
}

/** A new generated sector. */
export function generateSector(o: SectorOptions & { x: number; y: number; color: string; backdrop: Backdrop }, keep: SectorSystem[] = []): Sector {
  return { x: o.x, y: o.y, color: o.color, cols: o.cols, rows: o.rows, backdrop: o.backdrop, seed: o.seed.trim().slice(0, 80) || "sector", ...generateSystems(o, keep) };
}

/**
 * Real stars near the Sun, with their distance in light years and rough direction (galactic longitude, degrees).
 * Placed on the map by distance and direction, flattened onto the galaxy's plane, so hex distances from Sol are close
 * to the real ones (within a hex or so).
 */
export const realStars: { name: string; star: StarClass; ly: number; l: number; note: string }[] = [
  { name: "Sol", star: "G", ly: 0, l: 0, note: "The Sun. Eight planets." },
  { name: "Alpha Centauri", star: "G", ly: 4.4, l: 316, note: "A triple star. Proxima b orbits in the habitable zone of its red dwarf." },
  { name: "Barnard's Star", star: "M", ly: 6, l: 31, note: "An old red dwarf, the fastest-moving star in our sky." },
  { name: "Wolf 359", star: "M", ly: 7.9, l: 244, note: "A small, flaring red dwarf." },
  { name: "Lalande 21185", star: "M", ly: 8.3, l: 185, note: "A red dwarf with at least two planets." },
  { name: "Sirius", star: "A", ly: 8.6, l: 227, note: "The brightest star in our sky, with a white dwarf companion." },
  { name: "Epsilon Eridani", star: "K", ly: 10.5, l: 196, note: "A young orange star with a dust disc and a gas giant." },
  { name: "Procyon", star: "F", ly: 11.5, l: 214, note: "A bright yellow-white star with a white dwarf companion." },
  { name: "61 Cygni", star: "K", ly: 11.4, l: 82, note: "A pair of orange dwarfs, the first star measured for distance." },
  { name: "Epsilon Indi", star: "K", ly: 11.9, l: 336, note: "An orange star with a gas giant and two brown dwarfs." },
  { name: "Tau Ceti", star: "G", ly: 11.9, l: 173, note: "A Sun-like star with a heavy debris disc." },
  { name: "Altair", star: "A", ly: 16.7, l: 48, note: "A fast-spinning white star, flattened at its poles." },
  { name: "Fomalhaut", star: "A", ly: 25, l: 21, note: "A white star ringed by a wide disc of dust." },
  { name: "Vega", star: "A", ly: 25, l: 67, note: "Once the north star, and will be again. Ringed by dust." },
];
export const LOCAL_BUBBLE = { cols: 13, rows: 11 };
const toHex = (fx: number, fy: number, sol: Hex): Hex => {
  // Point (in hex widths) to the nearest hex, through axial coordinates.
  const q = fx - fy / Math.sqrt(3), r = fy * 2 / Math.sqrt(3);
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry - (-q - r));
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dz > dy) rz = -rx - ry;
  const solCube = cube(sol), x = solCube[0] + rx, z = solCube[2] + rz;
  return { c: x + (z - (z & 1)) / 2, r: z };
};
/** The Milky Way's Local Bubble: the Sun in the middle and real stars around it. */
export function localBubble(o: { x: number; y: number; color: string }): Sector {
  const { cols, rows } = LOCAL_BUBBLE, sol = { c: 6, r: 5 }, used = new Set<string>(), systems: SectorSystem[] = [];
  for (const s of realStars) {
    const d = s.ly / LY_PER_HEX, a = s.l * Math.PI / 180;
    let h = toHex(Math.cos(a) * d, -Math.sin(a) * d, sol);
    // Two stars in one hex: the later one takes the free hex nearest to where it should be, at about the same distance.
    if (used.has(`${h.c},${h.r}`)) {
      let best: Hex | undefined, score = Infinity;
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
        if (used.has(`${c},${r}`)) continue;
        const sc = hexDistance(h, { c, r }) * 2 + Math.abs(hexDistance(sol, { c, r }) - Math.round(d));
        if (sc < score) { score = sc; best = { c, r }; }
      }
      h = best!;
    }
    used.add(`${h.c},${h.r}`);
    systems.push({ id: `real-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, ...h, name: s.name, star: s.star, status: "charted", note: s.note, ly: s.ly });
  }
  return { ...o, cols, rows, backdrop: "deep", seed: "local-bubble", real: true, systems, lanes: [] };
}

/** Light years between two systems: the real distance when both are real stars and one is the Sun, otherwise hexes × 5. */
export function distanceBetween(a: SectorSystem, b: SectorSystem) {
  if (a.ly !== undefined && b.ly !== undefined && (a.ly === 0 || b.ly === 0)) return Math.abs(a.ly - b.ly);
  return lightYears(a, b);
}

/** Lanes after removing a system. */
export const withoutSystem = (s: Sector, id: string): Sector => ({ ...s, systems: s.systems.filter(x => x.id !== id), lanes: s.lanes.filter(l => l.a !== id && l.b !== id) });
/** Adds a lane, or removes it if the two are already joined. */
export function toggleLane(s: Sector, a: string, b: string): Sector {
  if (a === b) return s;
  const has = s.lanes.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  return { ...s, lanes: has ? s.lanes.filter(l => !((l.a === a && l.b === b) || (l.a === b && l.b === a))) : [...s.lanes, { a, b }] };
}
/** Systems joined to this one by lanes, in steps. */
export function laneSteps(s: Sector, from: string, to: string): number | null {
  const next = new Map<string, string[]>();
  for (const l of s.lanes) { next.set(l.a, [...(next.get(l.a) ?? []), l.b]); next.set(l.b, [...(next.get(l.b) ?? []), l.a]); }
  const seen = new Map([[from, 0]]), queue = [from];
  while (queue.length) { const at = queue.shift()!; if (at === to) return seen.get(at)!; for (const n of next.get(at) ?? []) if (!seen.has(n)) { seen.set(n, seen.get(at)! + 1); queue.push(n); } }
  return null;
}
/** A new system in a free hex. */
export function newSystem(s: Sector, at: Hex, status: SectorSystem["status"], seed = `${Date.now()}`): SectorSystem {
  const random = galaxyRandom(`${seed}|${at.c},${at.r}`), names = new Set(s.systems.map(x => x.name));
  let name = starName(random);
  for (let i = 0; names.has(name) && i < 20; i++) name = starName(random);
  return { id: `s${hexLabel(at)}${Math.floor(random() * 1e6).toString(36)}`, c: at.c, r: at.r, name, star: randomStar(random), status, note: status === "rumour" ? pick(random, RUMOURS) : "", edited: true };
}

/** What a new sector page starts as: a medium sector seeded by its title, in the middle of its galaxy. */
export function newSector(title: string, at: { x: number; y: number } = { x: 0.5, y: 0.5 }): Sector {
  const seed = title.trim() || "sector", random = galaxyRandom(`colour|${seed}`);
  return generateSector({ ...sectorSizes.medium, count: 12, seed, lanes: true, rumours: 30, x: at.x, y: at.y, color: sectorColour(random), backdrop: "nebula" });
}
