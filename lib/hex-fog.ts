import polygonClipping, { type Polygon } from "polygon-clipping";
import { flattenFogRegions, fogged } from "./fog.ts";
import { hexCell, hexCenter, type FogStroke, type Grid, type Point, type Scene, type Token } from "./model.ts";

/**
 * Revealing hexes around the party as it moves, for hex crawls. A scene with fog and
 * `fog.around` set (0 is the token's own hex, up to 3 hexes out) clears the hexes around each
 * party token that moves, for good. Only party tokens players can see do this, never pieces.
 */
export const REVEAL_AROUND_MAX = 3;

/** The centres of the hexes within `radius` steps of the hex holding `p`. */
export function hexesAround(p: Point, g: Grid, radius: number): Point[] {
  const c = hexCell(p, g), out: Point[] = [];
  for (let dq = -radius; dq <= radius; dq++)
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) out.push(hexCenter(c.q + dq, c.r + dr, g));
  return out;
}

/** A hex's six corners, a hair larger so neighbouring hexes overlap and leave no seams in the fog. */
export function hexCorners(centre: Point, g: Grid, scale = 1.02): Point[] {
  const turn = g.type === "hex-pointy" ? 30 : 0;
  return Array.from({ length: 6 }, (_, k) => {
    const a = (k * 60 + turn) * Math.PI / 180;
    return { x: round(centre.x + g.size * scale * Math.cos(a)), y: round(centre.y + g.size * scale * Math.sin(a)) };
  });
}
const round = (n: number) => Math.round(n * 100) / 100;

/** One reveal stroke covering these hexes as a single outline (or a few, if they are apart). */
export function revealHexes(centres: Point[], g: Grid): FogStroke | null {
  if (!centres.length) return null;
  const polygons: Polygon[] = centres.map(c => [hexCorners(c, g).map(p => [p.x, p.y] as [number, number])]);
  const union = polygonClipping.union(polygons[0], ...polygons.slice(1));
  const points: Point[] = [], parts: NonNullable<FogStroke["parts"]> = [];
  for (const polygon of union) for (const ring of polygon) {
    parts.push({ shape: "polygon", start: points.length, count: ring.length - 1 });
    points.push(...ring.slice(0, -1).map(([x, y]) => ({ x: round(x), y: round(y) })));
  }
  if (!parts.length) return null;
  return parts.length === 1
    ? { mode: "reveal", shape: "polygon", size: 5, points }
    : { mode: "reveal", shape: "merged", size: 5, fillRule: "evenodd", points, parts };
}

const reveals = (t: Token) => t.disposition === "party" && !t.pieceOf && !t.hidden;
/** Whether the scene clears hexes around the party as it moves. */
export const revealsAround = (s: Scene) => s.fog.enabled && s.grid.type.startsWith("hex") && typeof s.fog.around === "number";

/**
 * Clears the hexes around party tokens that moved (or arrived) since `before`, in place.
 * Hexes already clear are skipped, and nothing is added when all of them are.
 */
export function revealAroundTokens(before: Scene | undefined, scene: Scene) {
  if (!revealsAround(scene)) return;
  const radius = Math.max(0, Math.min(REVEAL_AROUND_MAX, Math.round(scene.fog.around!)));
  const was = new Map(before?.tokens.map(t => [t.id, t]) ?? []);
  for (const t of scene.tokens) {
    if (!reveals(t)) continue;
    const old = was.get(t.id);
    if (old && old.x === t.x && old.y === t.y && reveals(old)) continue;
    const hidden = hexesAround(t, scene.grid, radius).filter(c => c.x >= -scene.grid.size && c.y >= -scene.grid.size && c.x <= scene.width + scene.grid.size && c.y <= scene.height + scene.grid.size && fogged(scene, c));
    const stroke = revealHexes(hidden, scene.grid);
    if (!stroke) continue;
    // Long hex crawls add many strokes; near the limit the fog is flattened into one shape first.
    if (scene.fog.strokes.length >= 1990) {
      const flat = flattenFogRegions(scene.fog, scene.width, scene.height);
      if ("reason" in flat) return;
      scene.fog = { ...flat.fog, around: scene.fog.around };
    }
    scene.fog.strokes.push(stroke);
  }
}
