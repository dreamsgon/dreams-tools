import { stepSize, resizeToken } from "./token-transform.ts";
import type { Effect, Grid, MapShape, Point, Token } from "./model.ts";

/** Pixels of wheel travel that make one step. A mouse notch is 100 (50 on some high-density screens), so one notch is one step either way. */
export const WHEEL_STEP = 50;
/** Idle time after which a half-finished step is forgotten, and a burst of steps stops being one undo entry. */
export const WHEEL_IDLE_MS = 350;

/** A wheel event's travel in pixels. Shift often turns the wheel into deltaX (Chrome, macOS), so take whichever axis moved. */
export function wheelAmount(e: { deltaY: number; deltaX: number; deltaMode?: number }) {
  const raw = e.deltaY || e.deltaX || 0;
  return raw * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
}

/**
 * Adds a wheel movement to what was left over and takes out whole steps. Scrolling up (negative delta) is a positive step.
 * One event gives at most one step, so a trackpad flick does not leap through the whole range.
 */
export function accumulateWheel(carry: number, delta: number): { steps: number; carry: number } {
  let total = carry + delta;
  // Reversing direction starts again rather than paying back the old movement.
  if (carry && delta && Math.sign(carry) !== Math.sign(delta)) total = delta;
  if (Math.abs(total) < WHEEL_STEP) return { steps: 0, carry: total };
  return { steps: total < 0 ? 1 : -1, carry: 0 };
}

/** The token size after a number of steps up (positive) or down, through the same sizes as the - and + buttons. */
export function stepTokenSize(size: number, steps: number) {
  let next = size;
  for (let i = 0; i < Math.abs(steps); i++) next = stepSize(next, steps > 0 ? 1 : -1);
  return next;
}

export const EFFECT_MIN = 0.25, EFFECT_MAX = 200;
/** Areas, auras and objects step by a quarter square when small, then half, then whole squares. */
export function stepEffectSize(size: number, steps: number) {
  let next = size;
  for (let i = 0; i < Math.abs(steps); i++) {
    const up = steps > 0, edge = (limit: number) => up ? next < limit - 1e-9 : next <= limit + 1e-9;
    const unit = edge(2) ? 0.25 : edge(6) ? 0.5 : 1;
    next = up ? (Math.floor(next / unit + 1e-9) + 1) * unit : (Math.ceil(next / unit - 1e-9) - 1) * unit;
    next = Math.max(EFFECT_MIN, Math.min(EFFECT_MAX, next));
  }
  return next;
}

export const LABEL_MIN = 8, LABEL_MAX = 120;
/** A label's text size: two pixels at a time, then four above 40. */
export function stepLabelSize(size: number, steps: number, min = LABEL_MIN, max = LABEL_MAX) {
  let next = size;
  for (let i = 0; i < Math.abs(steps); i++) {
    const up = steps > 0, unit = (up ? next < 40 : next <= 40) ? 2 : 4;
    next = up ? (Math.floor(next / unit + 1e-9) + 1) * unit : (Math.ceil(next / unit - 1e-9) - 1) * unit;
    next = Math.max(min, Math.min(max, next));
  }
  return next;
}

/** Resizes a board token by wheel steps (keeping its top-left corner and the grid, as the size control does). */
export function wheelResizeToken(token: Token, grid: Grid, steps: number) {
  const next = stepTokenSize(token.size, steps);
  if (next !== token.size) resizeToken(token, grid, next);
}

/** Resizes an area, aura, object or label by wheel steps. Returns false when it is already at its limit. */
export function wheelResizeEffect(effect: Effect, steps: number): boolean {
  if (effect.kind === "label") {
    const next = stepLabelSize(effect.labelSize ?? 24, steps);
    if (next === (effect.labelSize ?? 24)) return false;
    effect.labelSize = next;
    return true;
  }
  const next = stepEffectSize(effect.size, steps);
  if (next === effect.size) return false;
  if (effect.type === "custom") {
    const factor = next / effect.size;
    effect.points = effect.points.map(point => ({ x: point.x * factor, y: point.y * factor }));
  }
  effect.size = next;
  return true;
}

/** Map Creator shapes that wheel-resize: not doors, windows or gaps (they belong to a wall) and not merged rooms. */
export const wheelScalable = (s: Pick<MapShape, "type">) => !["door", "window", "opening", "merged"].includes(s.type);
/** One wheel step in the Map Creator changes a shape by this much. */
export const CREATOR_SCALE = 1.1;
/** Creator label text sizes match the Text size slider. */
export const CREATOR_LABEL_MIN = 10, CREATOR_LABEL_MAX = 60;

/**
 * The points of a Map Creator shape after wheel steps, scaled about the centre of its box, or null when nothing changes.
 * Stamps stay between half a square and 20 squares; other shapes keep at least a quarter square. Nothing outgrows the map,
 * and the result is moved back onto the map if growing pushed it off an edge.
 */
export function wheelScaleShape(shape: Pick<MapShape, "type" | "points">, steps: number, gridSize: number, mapWidth: number, mapHeight: number): Point[] | null {
  const xs = shape.points.map(p => p.x), ys = shape.points.map(p => p.y);
  const left = Math.min(...xs), top = Math.min(...ys), w = Math.max(...xs) - left, h = Math.max(...ys) - top, extent = Math.max(w, h);
  if (!extent || !steps) return null;
  const stamp = shape.type === "stamp";
  const lo = gridSize * (stamp ? 0.5 : 0.25) / (stamp ? Math.min(w, h) || extent : extent);
  let hi = Math.min(w ? mapWidth / w : Infinity, h ? mapHeight / h : Infinity);
  if (stamp) hi = Math.min(hi, 20 * gridSize / extent);
  let factor = Math.pow(CREATOR_SCALE, steps);
  factor = Math.max(lo, Math.min(hi, factor));
  if ((steps > 0 && factor <= 1) || (steps < 0 && factor >= 1)) return null;
  const cx = left + w / 2, cy = top + h / 2;
  const scaled = shape.points.map(p => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor }));
  const sx = scaled.map(p => p.x), sy = scaled.map(p => p.y);
  const dx = Math.max(-Math.min(...sx), Math.min(mapWidth - Math.max(...sx), 0)), dy = Math.max(-Math.min(...sy), Math.min(mapHeight - Math.max(...sy), 0));
  return scaled.map(p => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
}
