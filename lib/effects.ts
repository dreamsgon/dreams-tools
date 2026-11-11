import type { Effect, Grid, Point, Token } from "./model";

function world(e: Effect, p: Point): Point {
  const a = (e.rotation ?? 0) * Math.PI / 180;
  return { x: e.x + p.x * Math.cos(a) - p.y * Math.sin(a), y: e.y + p.x * Math.sin(a) + p.y * Math.cos(a) };
}
/** World-space outline shared by rendering and pointer hit tests. */
export function effectPolygon(e: Effect, grid: Grid): Point[] {
  const length = e.size * grid.size, half = length / 2;
  let points: Point[];
  if (e.type === "custom") points = e.points ?? [];
  else if (e.type === "line") {
    const w = (e.width ?? 1) * grid.size / 2;
    points = [{ x: 0, y: -w }, { x: length, y: -w }, { x: length, y: w }, { x: 0, y: w }];
  } else if (e.type === "cone") {
    // A cone is a circular sector: size measures reach along every ray.
    const angle = (e.angle ?? 90) * Math.PI / 180;
    const steps = Math.max(8, Math.ceil(angle * 24));
    points = [{ x: 0, y: 0 }];
    for (let i = 0; i <= steps; i++) {
      const a = -angle / 2 + angle * i / steps;
      points.push({ x: Math.cos(a) * length, y: Math.sin(a) * length });
    }
  } else points = [{ x: -half, y: -half }, { x: half, y: -half }, { x: half, y: half }, { x: -half, y: half }];
  return points.map(p => world(e, p));
}
export function effectContains(e: Effect, p: Point, grid: Grid): boolean {
  if (e.kind === "label") {
    const size = e.labelSize ?? 24;
    const x = e.x + (e.labelOffsetX ?? 0), y = e.y + (e.labelOffsetY ?? 0);
    return Math.abs(p.x-x) <= Math.max(size, e.label.length*size*.36) && Math.abs(p.y-y) <= size*.75;
  }
  if (e.type === "circle") return Math.hypot(p.x - e.x, p.y - e.y) <= e.size * grid.size;
  const points = effectPolygon(e, grid);
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function effectHandles(e: Effect, grid: Grid): { resize: Point; rotate: Point } {
  const length = e.size * grid.size;
  const extent = e.type === "custom" ? Math.max(20, ...(e.points ?? []).map(p => Math.hypot(p.x, p.y))) : e.type === "square" ? length / 2 : length;
  return { resize: world(e, { x: extent, y: 0 }), rotate: world(e, { x: extent + 32, y: 0 }) };
}

/** Attached areas use the token center, including temporary drag previews. */
export function resolveEffect(effect: Effect, tokens: readonly Token[]): Effect {
  const token = effect.tokenId ? tokens.find(token => token.id === effect.tokenId) : undefined;
  return token ? { ...effect, x: token.x, y: token.y } : effect;
}
export function effectVisibleToPlayers(effect: Effect, tokens: readonly Token[]): boolean {
  return !effect.hidden && !tokens.some(token => token.id === effect.tokenId && token.hidden);
}

/** Objects and map labels must survive clearing temporary spell areas. */
export function isOneOffArea(e: Effect) {
  return (!e.kind || e.kind === "area") && !e.persistent;
}
