/* Layout rules for the breadcrumb trail in components/breadcrumbs.tsx. */

/**
 * How many levels fit: all of them, or the first plus as many of the last ones as
 * fit beside a "…" button, but never fewer than three. `widths` are the natural widths
 * of each level, `sep` the separator width and `more` the "…" button width.
 */
export function fitCount(widths: number[], available: number, sep = 16, more = 34) {
  const total = (ws: number[]) => ws.reduce((a, b) => a + b, 0) + sep * Math.max(0, ws.length - 1);
  if (total(widths) <= available || widths.length <= 3) return widths.length;
  for (let k = widths.length - 1; k > 3; k--) if (total([widths[0], ...widths.slice(-(k - 1))]) + more + sep <= available) return k;
  return 3;
}

/** Which levels to show: all of them, or the first, "…" for the middle, and the last `max - 1`. */
export function foldCrumbs<T>(items: T[], max: number): { shown: T[]; hidden: T[] } {
  if (items.length <= max || items.length <= 3) return { shown: items, hidden: [] };
  const keep = Math.max(2, max - 1);
  return { shown: [items[0], ...items.slice(-keep)], hidden: items.slice(1, -keep) };
}
