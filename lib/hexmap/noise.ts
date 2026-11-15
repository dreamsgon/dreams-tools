/** Seeded randomness and smooth noise for the hex map generator. The same seed always gives the same numbers. */
export function hashText(text: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** A small random number source from a whole-number seed. */
export function seededRandom(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function valueNoise(seed: number) {
  const at = (i: number, j: number) => {
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return a + (b - a) * v;
  };
}
/** Layered noise from 0 to 1: big shapes with smaller detail on top. */
export function layeredNoise(seed: number, octaves: number) {
  const layers = Array.from({ length: octaves }, (_, k) => valueNoise((seed + k * 1013) | 0));
  return (x: number, y: number) => {
    let sum = 0, amp = 1, freq = 1, total = 0;
    layers.forEach((n, k) => { sum += n(x * freq + k * 17.3, y * freq + k * 9.1) * amp; total += amp; amp *= 0.5; freq *= 2; });
    return sum / total;
  };
}
export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
/** The value below which a share `q` of the values fall. */
export function quantile(values: ArrayLike<number>, q: number) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[clamp(Math.floor(sorted.length * q), 0, sorted.length - 1)];
}
/** Each value's place among the others, from 0 (lowest) to 1 (highest). */
export function ranks(values: ArrayLike<number>) {
  const n = values.length, order = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a] - values[b]);
  const out = new Float32Array(n);
  order.forEach((v, k) => { out[v] = n > 1 ? k / (n - 1) : 0.5; });
  return out;
}
