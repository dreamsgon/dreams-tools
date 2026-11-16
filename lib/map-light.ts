import type { MapDrawing, MapShape, Point } from "./model.ts";
import { layerState, orderedShapes } from "./map-drawing.ts";
import { cutOpenings, wallSegments, type WallSegment } from "./map-creator.ts";
import { stampById, type Stamp } from "./map-stamps.ts";

/**
 * Lights on a drawn map: light shapes placed with the Light tool, and stamps from the Lights group
 * (torches, braziers...) that give light. A light has bright light near it and dim light further out,
 * in squares like a torch in the rules, and walls stop it unless it is set not to.
 */
export type LightKind = NonNullable<NonNullable<MapShape["light"]>["kind"]>;
export type LightPreset = { id: LightKind; name: string; bright: number; dim: number; colour: string; flicker: boolean };
export const lightKinds: LightPreset[] = [
  { id: "torch", name: "Torch", bright: 4, dim: 8, colour: "#ffb35c", flicker: true },
  { id: "brazier", name: "Brazier", bright: 4, dim: 8, colour: "#ffa047", flicker: true },
  { id: "candles", name: "Candles", bright: 1, dim: 3, colour: "#ffd27a", flicker: true },
  { id: "lantern", name: "Lantern", bright: 3, dim: 6, colour: "#ffd27a", flicker: false },
  { id: "magic", name: "Magic", bright: 3, dim: 6, colour: "#8fd0ff", flicker: false },
  { id: "crystal", name: "Crystal", bright: 2, dim: 5, colour: "#7fe3d0", flicker: false },
  { id: "fire", name: "Fire", bright: 4, dim: 8, colour: "#ff9a3c", flicker: true },
  { id: "plain", name: "Plain light", bright: 4, dim: 8, colour: "#fff1c9", flicker: false },
];
export const lightKind = (id: string | undefined) => lightKinds.find(k => k.id === id) ?? lightKinds[0];
/** Colours offered for a light: flame, warm, candle, white, cold magic, sea-green, violet and red. */
export const lightColours = ["#ffb35c", "#ffa047", "#ffd27a", "#fff1c9", "#8fd0ff", "#7fe3d0", "#c79bff", "#ff6b5c"];
/** How far a light can reach, in squares, in the Map Creator's sliders. */
export const LIGHT_MAX_BRIGHT = 12, LIGHT_MAX_DIM = 24;

/** One light on the map: where it is (pixels), its reach (squares), and how it shines. */
export type MapLight = { id: string; x: number; y: number; bright: number; dim: number; colour: string; on: boolean; flicker: boolean; walls: boolean; stamp: string | null };

/** The light a shape gives, with its settings filled in, or null for a shape that gives none. */
export function shapeLight(s: MapShape, stamp: Stamp | null = s.type === "stamp" ? stampById(s.stamp) : null): MapLight | null {
  let base: Omit<MapLight, "id" | "x" | "y" | "stamp"> | null = null;
  if (s.type === "light") { const k = lightKind(s.light?.kind); base = { bright: k.bright, dim: k.dim, colour: k.colour, flicker: k.flicker, on: true, walls: true }; }
  else if (s.type === "stamp" && stamp?.light) base = { bright: stamp.light.bright, dim: stamp.light.dim, colour: stamp.light.colour, flicker: !!stamp.light.flicker, on: true, walls: true };
  if (!base) return null;
  const o = s.light ?? {}, [a, b] = s.points;
  const bright = Math.max(0, o.bright ?? base.bright), dim = Math.max(bright, o.dim ?? base.dim);
  return { id: s.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, bright, dim, colour: o.colour ?? base.colour, on: o.on ?? base.on, flicker: o.flicker ?? base.flicker, walls: o.walls ?? base.walls, stamp: s.type === "stamp" ? s.stamp : null };
}

/** Every light on a drawing, in drawing order, leaving out hidden layers. Unlit lights are included with on: false. */
export function mapLights(d: Pick<MapDrawing, "shapes" | "folders" | "layerOrder">, find: (id: string | null) => Stamp | null = stampById): MapLight[] {
  return orderedShapes(d as MapDrawing).filter(s => !layerState(d as MapDrawing, s.id).hidden).flatMap(s => {
    if (s.type !== "light" && s.type !== "stamp") return [];
    const l = shapeLight(s, s.type === "stamp" ? find(s.stamp) : null);
    return l ? [l] : [];
  });
}

/** The walls that stop light: every wall, less the openings erased into it and its windows. Closed doors stop light. */
export function lightWalls(d: Pick<MapDrawing, "shapes" | "folders" | "layerOrder">): WallSegment[] {
  const shapes = orderedShapes(d as MapDrawing).filter(s => !layerState(d as MapDrawing, s.id).hidden);
  return cutOpenings(wallSegments(shapes), shapes.map(s => s.type === "window" ? { ...s, type: "opening" as const } : s));
}

/**
 * What a light at `o` can reach within `radius` pixels, as a polygon: a ray is cast at each wall end
 * (and just either side of it) and around the circle, and stops at the nearest wall.
 */
export function visibility(o: Point, radius: number, walls: Pick<WallSegment, "a" | "b">[]): Point[] {
  // Only walls that come within reach matter.
  const near = walls.filter(w => distanceToSegment(o, w.a, w.b) < radius);
  const angles: number[] = [];
  const steps = 72;
  for (let i = 0; i < steps; i++) angles.push(i / steps * Math.PI * 2);
  for (const w of near) for (const p of [w.a, w.b]) {
    if (Math.hypot(p.x - o.x, p.y - o.y) > radius) continue;
    const a = Math.atan2(p.y - o.y, p.x - o.x);
    angles.push(a - 1e-4, a, a + 1e-4);
  }
  // Where each wall crosses the edge of the circle, so the outline follows the circle up to the wall.
  for (const w of near) for (const p of circleCrossings(o, radius, w.a, w.b)) { const a = Math.atan2(p.y - o.y, p.x - o.x); angles.push(a - 1e-4, a + 1e-4); }
  const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const sorted = [...new Set(angles.map(a => Math.round(norm(a) * 1e6) / 1e6))].sort((x, y) => x - y);
  return sorted.map(a => {
    const dx = Math.cos(a), dy = Math.sin(a);
    let t = radius;
    for (const w of near) { const hit = rayHit(o, dx, dy, w.a, w.b); if (hit !== null && hit < t) t = hit; }
    return { x: o.x + dx * t, y: o.y + dy * t };
  });
}

function rayHit(o: Point, dx: number, dy: number, a: Point, b: Point): number | null {
  const ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return null;
  const fx = a.x - o.x, fy = a.y - o.y;
  const t = (fx * ey - fy * ex) / den, u = (fx * dy - fy * dx) / den;
  return t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}
function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function circleCrossings(o: Point, r: number, a: Point, b: Point): Point[] {
  const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - o.x, fy = a.y - o.y;
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r, disc = B * B - 4 * A * C;
  if (!A || disc < 0) return [];
  const s = Math.sqrt(disc);
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)].filter(t => t >= 0 && t <= 1).map(t => ({ x: a.x + dx * t, y: a.y + dy * t }));
}

/** The area a light reaches as an SVG path, or null when nothing near it stops it (a plain circle). */
export function lightArea(l: MapLight, gridSize: number, walls: Pick<WallSegment, "a" | "b">[]): string | null {
  const r = l.dim * gridSize;
  if (!l.walls || r <= 0) return null;
  if (!walls.some(w => distanceToSegment(l, w.a, w.b) < r)) return null;
  const pts = visibility(l, r, walls);
  return `M ${pts.map(p => `${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`).join(" L ")} Z`;
}

/** What players see where no light reaches. */
export type Ambient = NonNullable<MapDrawing["ambient"]>;
export const ambients: { id: Ambient; name: string; hint: string }[] = [
  { id: "day", name: "Daylight", hint: "Everything can be seen. Lights only add their glow." },
  { id: "dim", name: "Dim", hint: "Places no light reaches are shaded for players. You see them a little lighter." },
  { id: "dark", name: "Dark", hint: "Places no light reaches are dark for players. You see them shaded, so you can still run the map." },
];
/** How dark unlit places are: for players, and lighter for the GM so the map can still be run. */
export const ambientShade = (ambient: Ambient | undefined, player: boolean) =>
  ambient === "dark" ? (player ? .9 : .55) : ambient === "dim" ? (player ? .55 : .3) : 0;

/** The lit lights on a scene's drawing, with the area each reaches. A stamp that is a piece on the table shines from where the piece is. */
export type LitLight = MapLight & { area: string | null };
export function sceneLights(d: Pick<MapDrawing, "shapes" | "folders" | "layerOrder">, gridSize: number, pieces?: ReadonlyMap<string, Point>): LitLight[] {
  const lights = mapLights(d).filter(l => l.on && l.dim > 0);
  if (!lights.length) return [];
  const walls = lightWalls(d);
  return lights.map(l => { const at = pieces?.get(l.id), moved = at ? { ...l, x: at.x, y: at.y } : l; return { ...moved, area: lightArea(moved, gridSize, walls) }; });
}

// Maptable draws on a canvas, many times a second: each drawing's lights, their areas and its darkness are kept until it changes.
type Prepared = { key: string; lights: (LitLight & { path: Path2D | null })[]; dark: { key: string; canvas: HTMLCanvasElement } | null };
const prepared = new WeakMap<object, Prepared>();
function prepare(d: MapDrawing, gridSize: number, pieces?: ReadonlyMap<string, Point>): Prepared {
  const key = `${gridSize}|${pieces ? [...pieces].map(([id, p]) => `${id}:${Math.round(p.x)},${Math.round(p.y)}`).join(";") : ""}`;
  const hit = prepared.get(d);
  if (hit && hit.key === key) return hit;
  const lights = sceneLights(d, gridSize, pieces).map(l => ({ ...l, path: l.area ? new Path2D(l.area) : null }));
  const made = { key, lights, dark: null };
  prepared.set(d, made);
  return made;
}

/**
 * Draws the lights' glow over a drawn map on a canvas, as the Map Creator shows it: a tint in
 * daylight, a brighter glow in the dim or dark. Call it after the map and before the grid.
 */
export function drawLightGlow(ctx: CanvasRenderingContext2D, d: MapDrawing, gridSize: number, pieces?: ReadonlyMap<string, Point>) {
  const { lights } = prepare(d, gridSize, pieces);
  if (!lights.length) return;
  const day = !d.ambient || d.ambient === "day";
  ctx.save();
  ctx.globalCompositeOperation = day ? "multiply" : "screen";
  for (const l of lights) {
    const r = l.dim * gridSize, b = Math.max(.02, Math.min(1, l.bright / l.dim));
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, withAlpha(l.colour, .5)); g.addColorStop(b, withAlpha(l.colour, day ? .24 : .28)); g.addColorStop(1, withAlpha(l.colour, 0));
    ctx.save();
    if (l.path) ctx.clip(l.path);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Shades the places no light reaches, for a map that is dim or dark: darker for players than for the GM.
 * Each light takes darkness away (all of it in its bright light, about half in its dim light), so lights add up the same in any order.
 */
export function drawLightDarkness(ctx: CanvasRenderingContext2D, d: MapDrawing, width: number, height: number, gridSize: number, player: boolean, pieces?: ReadonlyMap<string, Point>) {
  const shade = ambientShade(d.ambient, player);
  if (!shade) return;
  const p = prepare(d, gridSize, pieces), key = `${d.ambient}|${player}|${width}x${height}`;
  if (!p.dark || p.dark.key !== key) {
    // Darkness is soft, so a smaller canvas stretched over the map is plenty.
    const scale = Math.min(1, 2048 / Math.max(width, height, 1)), canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const x = canvas.getContext("2d")!;
    x.scale(scale, scale);
    x.fillStyle = `rgba(6,7,12,${shade})`; x.fillRect(0, 0, width, height);
    x.globalCompositeOperation = "destination-out";
    for (const l of p.lights) {
      const r = l.dim * gridSize, b = Math.max(.02, Math.min(1, l.bright / l.dim));
      const g = x.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(b, "rgba(0,0,0,1)"); g.addColorStop(Math.min(.98, b + (1 - b) * .08), "rgba(0,0,0,.62)"); g.addColorStop(.9, "rgba(0,0,0,.48)"); g.addColorStop(1, "rgba(0,0,0,0)");
      x.save();
      if (l.path) x.clip(l.path);
      x.fillStyle = g; x.beginPath(); x.arc(l.x, l.y, r, 0, Math.PI * 2); x.fill();
      x.restore();
    }
    p.dark = { key, canvas };
  }
  ctx.drawImage(p.dark.canvas, 0, 0, width, height);
}
function withAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
