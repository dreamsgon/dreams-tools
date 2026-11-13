import { snap, type Grid, type Point, type Token } from "./model.ts";

/** Sizes the − and + buttons step through, in squares. */
export const SIZE_STEPS = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
export const MIN_SIZE = 0.25, MAX_SIZE = 20;

/** An angle in degrees, between -180 (exclusive) and 180. */
export function normalizeAngle(degrees: number) {
  const value = ((degrees % 360) + 360) % 360;
  return value > 180 ? value - 360 : value;
}
export function turnToken(token: Pick<Token, "facing">, degrees: number) {
  token.facing = normalizeAngle((token.facing ?? 0) + degrees);
}
export function flipToken(token: Pick<Token, "flipX" | "flipY">, axis: "x" | "y") {
  const key = axis === "x" ? "flipX" : "flipY";
  if (token[key]) delete token[key]; else token[key] = true;
}
/** The turn handle: the angle from the centre to the pointer, 0 pointing up, in 15° steps unless free (Alt). */
export function facingFromPointer(centre: Point, pointer: Point, free = false) {
  const degrees = Math.atan2(pointer.y - centre.y, pointer.x - centre.x) * 180 / Math.PI + 90;
  return normalizeAngle(free ? Math.round(degrees) : Math.round(degrees / 15) * 15);
}

export function stepSize(size: number, direction: 1 | -1) {
  const next = direction > 0 ? SIZE_STEPS.find(step => step > size + 1e-9) : [...SIZE_STEPS].reverse().find(step => step < size - 1e-9);
  return next ?? size;
}
export function clampSize(size: number) {
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, size));
}
/** "Medium 1×1", "Large 2×2", "Tiny ½". */
export function sizeLabel(size: number) {
  const name = size < 1 ? "Tiny" : size < 2 ? "Medium" : size < 3 ? "Large" : size < 4 ? "Huge" : "Gargantuan";
  const squares = size === 0.25 ? "¼" : size === 0.5 ? "½" : Number.isInteger(size) ? `${size}×${size}` : `${Math.round(size * 100) / 100}×`;
  return `${name} ${squares}`;
}

/** The token's footprint square (its top-left corner and side), which resizing keeps anchored at the top left. */
export function footprint(token: Pick<Token, "x" | "y" | "size">, grid: Grid) {
  const side = token.size * grid.size;
  return { left: token.x - side / 2, top: token.y - side / 2, side };
}
/** Size from dragging the bottom-right corner handle: whole squares (half and quarter below one) unless free. */
export function sizeFromHandle(token: Pick<Token, "x" | "y" | "size">, grid: Grid, pointer: Point, free = false) {
  const { left, top } = footprint(token, grid);
  const raw = Math.max(pointer.x - left, pointer.y - top) / grid.size;
  if (free) return clampSize(Math.round(raw * 20) / 20);
  return clampSize(raw < 0.75 ? (raw < 0.375 ? 0.25 : 0.5) : Math.round(raw));
}
/** Where the centre goes for a new size, keeping the top-left corner, then on the grid. */
export function resizedCentre(token: Pick<Token, "x" | "y" | "size">, grid: Grid, size: number, free = false): Point {
  const { left, top } = footprint(token, grid);
  const centre = { x: left + size * grid.size / 2, y: top + size * grid.size / 2 };
  return free ? centre : snap(centre, grid, size);
}
export function resizeToken(token: Token, grid: Grid, size: number, free = false) {
  const next = clampSize(size);
  Object.assign(token, resizedCentre(token, grid, next, free));
  token.size = next;
}
/** Back to facing up, unflipped. */
export function resetTransform(token: Pick<Token, "facing" | "flipX" | "flipY">) {
  delete token.facing; delete token.flipX; delete token.flipY;
}
