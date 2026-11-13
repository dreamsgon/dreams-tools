import { hexCell, hexCenter, snap, type Grid, type Point } from "./model.ts";

/** How far a ruler point is along the path, as the grid counts it. */
export type RulerBand = "walk" | "dash" | "over";
export type RulerCell = { center: Point; band: RulerBand };
export type Ruler = { legs: number[]; total: number; cells: RulerCell[] };

const near = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
/** A point is on the grid when snapping it would not move it. */
export function onGrid(point: Point, grid: Grid, size = 1) {
  return grid.snap && grid.type !== "none" && near(snap(point, grid, size), point);
}
/** Straight-line distance in grid units, for points dragged off the grid (Alt). */
export function freeDistance(a: Point, b: Point, grid: Grid) {
  const step = grid.type.startsWith("hex") ? grid.size * Math.sqrt(3) : grid.size;
  return Math.hypot(b.x - a.x, b.y - a.y) / step * grid.units;
}
export function rulerBand(cost: number, speed?: number | null): RulerBand {
  if (!speed || speed <= 0 || cost <= speed + 1e-9) return "walk";
  return cost <= speed * 2 + 1e-9 ? "dash" : "over";
}
const round = (value: number) => Math.round(value * 100) / 100;
export function formatDistance(value: number, unit: string) {
  return `${round(value)} ${unit}`.trim();
}

/**
 * Leg lengths, total and the squares (or hexes) along a token's path.
 * Legs between grid positions count the way the scene measures (equal, 5-10-5 or exact);
 * legs dragged off the grid with Alt count as straight lines.
 * Cells are only listed when `speed` is set, so a plain ruler stays plain.
 */
export function dragRuler(points: Point[], grid: Grid, options: { size?: number; speed?: number | null } = {}): Ruler {
  const size = options.size ?? 1, speed = options.speed && options.speed > 0 ? options.speed : null;
  const legs: number[] = [], cells: RulerCell[] = [], seen = new Set<string>();
  let straight = 0, diagonal = 0, exact = 0, free = 0;
  const cost = () => free + (grid.diagonal === "euclidean" ? exact : grid.diagonal === "alternating" ? straight + Math.floor(diagonal / 2) : straight) * grid.units;
  const hex = grid.type.startsWith("hex");
  const addCell = (center: Point, value: number) => {
    const key = `${Math.round(center.x)},${Math.round(center.y)}`;
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ center, band: rulerBand(value, speed) });
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], before = cost();
    if (near(a, b)) { legs.push(0); continue; }
    if (!onGrid(a, grid, size) || !onGrid(b, grid, size)) {
      free += freeDistance(a, b, grid);
      legs.push(cost() - before);
      continue;
    }
    if (hex) {
      const from = hexCell(a, grid), to = hexCell(b, grid);
      const steps = Math.max(Math.abs(from.q - to.q), Math.abs(from.r - to.r), Math.abs(from.q + from.r - to.q - to.r));
      for (let step = 1; step <= steps; step++) {
        const t = step / steps, c = hexCell({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, grid);
        straight++; exact++;
        if (speed) addCell(hexCenter(c.q, c.r, grid), cost());
      }
    } else {
      const dx = (b.x - a.x) / grid.size, dy = (b.y - a.y) / grid.size;
      const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
      let previous = a;
      const exactStart = exact, legExact = Math.hypot(dx, dy);
      for (let step = 1; step <= steps; step++) {
        const t = step / steps, next = step === steps ? b : snap({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, grid, size);
        const mx = Math.round(Math.abs(next.x - previous.x) / grid.size), my = Math.round(Math.abs(next.y - previous.y) / grid.size);
        straight += Math.max(mx, my); diagonal += Math.min(mx, my); exact = exactStart + legExact * t;
        previous = next;
        if (!speed) continue;
        // A large token fills several squares; colour them all.
        const span = Math.max(1, Math.round(size)), left = next.x - span * grid.size / 2, top = next.y - span * grid.size / 2;
        for (let col = 0; col < span; col++) for (let row = 0; row < span; row++)
          addCell({ x: left + (col + 0.5) * grid.size, y: top + (row + 0.5) * grid.size }, cost());
      }
    }
    legs.push(cost() - before);
  }
  return { legs: legs.map(round), total: round(cost()), cells };
}
