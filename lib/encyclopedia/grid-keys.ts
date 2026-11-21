/**
 * Moving between the cells of a hex or square map with the keyboard. Arrows move one column or row (on a hex map
 * with offset rows, up and down zigzag between the two hexes above or below), Home and End go to the ends of the row.
 * Returns null for any other key, and the same cell at an edge.
 */
export type GridStep = { c: number; r: number };
export function gridStep(key: string, at: GridStep, cols: number, rows: number): GridStep | null {
  const clamp = (c: number, r: number) => ({ c: Math.max(0, Math.min(cols - 1, c)), r: Math.max(0, Math.min(rows - 1, r)) });
  switch (key) {
    case "ArrowLeft": return clamp(at.c - 1, at.r);
    case "ArrowRight": return clamp(at.c + 1, at.r);
    case "ArrowUp": return clamp(at.c, at.r - 1);
    case "ArrowDown": return clamp(at.c, at.r + 1);
    case "Home": return clamp(0, at.r);
    case "End": return clamp(cols - 1, at.r);
    default: return null;
  }
}
