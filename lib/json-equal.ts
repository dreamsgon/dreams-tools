/**
 * JSON.stringify(a) === JSON.stringify(b), without writing either out. Maptable compared two copies of the whole
 * workspace as text on every edit; this walks them and stops at the first difference. Same rules as JSON: keys in
 * order, undefined, functions and symbols left out of objects (null in arrays), numbers that aren't finite as null,
 * and toJSON() used where a value has it.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  return same(prepare(a), prepare(b));
}
const skipped = (v: unknown) => v === undefined || typeof v === "function" || typeof v === "symbol";
function prepare(v: unknown): unknown {
  if (v !== null && typeof v === "object" && typeof (v as { toJSON?: unknown }).toJSON === "function") v = (v as { toJSON: () => unknown }).toJSON();
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  if (typeof v === "object" && v !== null && (v instanceof Number || v instanceof String || v instanceof Boolean)) return v.valueOf();
  return v;
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const arrayA = Array.isArray(a), arrayB = Array.isArray(b);
  if (arrayA !== arrayB) return false;
  if (arrayA) {
    const x = a as unknown[], y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) { const p = prepare(x[i]), q = prepare(y[i]); if (!same(skipped(p) ? null : p, skipped(q) ? null : q)) return false; }
    return true;
  }
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>, kx = Object.keys(x), ky = Object.keys(y);
  let i = 0, j = 0;
  while (true) {
    let p: unknown, q: unknown;
    while (i < kx.length && skipped(p = prepare(x[kx[i]]))) i++;
    while (j < ky.length && skipped(q = prepare(y[ky[j]]))) j++;
    if (i >= kx.length || j >= ky.length) return i >= kx.length && j >= ky.length;
    if (kx[i] !== ky[j] || !same(p, q)) return false;
    i++; j++;
  }
}
