/**
 * Where the hexes of a hex map sit. Columns and rows are "offset" coordinates that match
 * Maptable's hex grid: with flat-topped hexes every odd column is pushed down half a hex,
 * with pointed tops every odd row is pushed right. Hex `i` is column `i % cols`, row `i / cols`.
 */
export type HexOrient = "flat" | "pointy";
export type HexOutline = "rect" | "hex" | "circle";
export type HexShape = { cols: number; rows: number; orient: HexOrient; outline: HexOutline; size: number };
export type HexCell = { i: number; c: number; r: number; x: number; y: number; q: number; ar: number; inside: boolean };

const SQ3 = Math.sqrt(3);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;

/** The width and height a hex map covers, from its top-left corner. */
export function hexMapSize(s: Pick<HexShape, "cols" | "rows" | "orient" | "size">) {
  const R = s.size;
  return s.orient === "flat"
    ? { width: 1.5 * R * (s.cols - 1) + 2 * R, height: SQ3 * R * (s.rows + 0.5) }
    : { width: SQ3 * R * (s.cols + 0.5), height: 1.5 * R * (s.rows - 1) + 2 * R };
}

/** The largest hex (corner to centre, in pixels, up to `max`) that keeps the map within `limit` pixels each way. */
export function fittingHexSize(cols: number, rows: number, orient: HexOrient, max = 50, limit = 8000) {
  const one = hexMapSize({ cols, rows, orient, size: 1 });
  return Math.max(20, Math.min(max, Math.floor(Math.min(limit / one.width, limit / one.height))));
}

/** Every hex of the map, with its centre and whether it lies inside the outline. */
export function hexCells(s: HexShape): HexCell[] {
  const R = s.size, flat = s.orient === "flat", { width, height } = hexMapSize(s), cells: HexCell[] = [];
  for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
    const x = flat ? 1.5 * R * c + R : SQ3 * R * (c + 0.5 * (r & 1)) + SQ3 * R / 2;
    const y = flat ? SQ3 * R * (r + 0.5 * (c & 1)) + SQ3 * R / 2 : 1.5 * R * r + R;
    const q = flat ? c : c - ((r - (r & 1)) >> 1), ar = flat ? r - ((c - (c & 1)) >> 1) : r;
    cells.push({ i: r * s.cols + c, c, r, x, y, q, ar, inside: true });
  }
  if (s.outline === "circle") {
    const rad = Math.min(width, height) / 2 - R * 0.4;
    for (const h of cells) h.inside = Math.hypot(h.x - width / 2, h.y - height / 2) <= rad;
  } else if (s.outline === "hex") {
    const mid = cells.reduce((b, h) => Math.hypot(h.x - width / 2, h.y - height / 2) < Math.hypot(b.x - width / 2, b.y - height / 2) ? h : b, cells[0]);
    const n = Math.floor((Math.min(s.cols, s.rows) - 1) / 2);
    for (const h of cells) h.inside = hexDistance(h, mid) <= n;
  }
  return cells;
}

/** Steps between two hexes. */
export const hexDistance = (a: Pick<HexCell, "q" | "ar">, b: Pick<HexCell, "q" | "ar">) =>
  (Math.abs(a.q - b.q) + Math.abs(a.ar - b.ar) + Math.abs(a.q + a.ar - b.q - b.ar)) / 2;

/** The neighbours of each hex (indexes), counting only hexes inside the outline. */
export function hexNeighbours(s: HexShape, cells: HexCell[]): number[][] {
  const at = new Map<string, number>();
  for (const h of cells) if (h.inside) at.set(h.q + "," + h.ar, h.i);
  return cells.map(h => {
    if (!h.inside) return [];
    const out: number[] = [];
    for (const [dq, dr] of DIRS) { const j = at.get((h.q + dq) + "," + (h.ar + dr)); if (j !== undefined) out.push(j); }
    return out;
  });
}

/** The six corners of a hex as an SVG/canvas path, rounded to a tenth of a pixel. */
export function hexOutline(x: number, y: number, size: number, orient: HexOrient, scale = 1) {
  let d = "";
  for (let a = 0; a < 6; a++) {
    const t = Math.PI / 180 * (60 * a + (orient === "flat" ? 0 : 30));
    d += (a ? "L" : "M") + round(x + size * scale * Math.cos(t)) + " " + round(y + size * scale * Math.sin(t));
  }
  return d + "Z";
}
export const round = (n: number) => Math.round(n * 10) / 10;

/** Maptable's grid settings that line up exactly with a hex map drawn at (x, y). */
export function hexGridFor(s: Pick<HexShape, "orient" | "size"> & { x: number; y: number }) {
  const R = s.size;
  return s.orient === "flat"
    ? { type: "hex-flat" as const, size: R, offsetX: s.x, offsetY: s.y + SQ3 * R / 2 - R }
    : { type: "hex-pointy" as const, size: R, offsetX: s.x + SQ3 * R / 2 - R, offsetY: s.y };
}
