import { mapSize, paintScale, type MapData } from "./map-model.ts";
import { generateWorld, type WorldOptions } from "./world-generator.ts";
import { planetClimate, planetMapSize, type Planet, type PlanetLand, type PlanetOptions } from "./planet-generator.ts";

/**
 * Making a map from a picture: a sketch on paper, a photo of a hand-drawn map, or a map from another tool.
 * Land is worked out from the picture (ink outlines, blue sea, or light land on a dark sea), then it gets heights,
 * climate, biomes, rivers and towns like a generated map. The picture is read in the browser and never saved or sent
 * anywhere; only the map made from it is kept. Runs in the browser only.
 */
export type LandIs = "auto" | "ink" | "blue" | "light";
export type PictureOptions = {
  /** How to tell land from sea; auto picks from the picture's colours. */
  landIs: LandIs;
  /** 20 to 90: how dark a line has to be to count as ink, as a share of the paper around it (or how light land has to be, on a dark picture). */
  threshold: number;
  /** 0 to 100: how closely coasts follow the picture, rather than wandering for a more natural look. */
  follow: number;
  /** Darker parts of the land become hills and mountains. */
  shading: boolean;
};
export const defaultPictureOptions = (): PictureOptions => ({ landIs: "auto", threshold: 60, follow: 75, shading: false });
export const landIsNames: Record<LandIs, string> = { auto: "Auto", ink: "Dark on light", blue: "Not blue", light: "Light on dark" };

/** A picture as read: where land is (1) and how dark the land is (0 to 1), at the size it was read. */
export type Picture = { w: number; h: number; land: Uint8Array; shade: Float32Array; found: Exclude<LandIs, "auto"> };

/** Pictures are read with their longest side at most this many pixels: enough for thin pen lines, quick to work with. */
export const PICTURE_SIDE = 1024;
export const pictureReadSize = (w: number, h: number) => { const k = Math.min(1, PICTURE_SIDE / Math.max(w, h, 1)); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }; };

/** Squares within r of a marked one, also marked: a quick square dilation in two passes. */
function grow(mask: Uint8Array, w: number, h: number, r: number) {
  const a = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) { let run = -1e9; for (let x = 0; x < w; x++) { if (mask[y * w + x]) run = x; a[y * w + x] = x - run <= r ? 1 : 0; } run = 1e9; for (let x = w - 1; x >= 0; x--) { if (mask[y * w + x]) run = x; if (run - x <= r) a[y * w + x] = 1; } }
  for (let x = 0; x < w; x++) { let run = -1e9; for (let y = 0; y < h; y++) { if (a[y * w + x]) run = y; out[y * w + x] = y - run <= r ? 1 : 0; } run = 1e9; for (let y = h - 1; y >= 0; y--) { if (a[y * w + x]) run = y; if (run - y <= r) out[y * w + x] = 1; } }
  return out;
}

/**
 * How bright the paper is around each pixel: the brightest nearby, smoothed, so a photo with a shadow across it
 * or a yellowed corner still tells ink from paper. Worked out on blocks, so it is quick on a big picture.
 */
function paperLight(lum: Float32Array, seen: Uint8Array, w: number, h: number) {
  const B = Math.max(4, Math.round(Math.max(w, h) / 48)), bw = Math.ceil(w / B), bh = Math.ceil(h / B), block = new Float32Array(bw * bh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, b = Math.floor(y / B) * bw + Math.floor(x / B); if (seen[i] && lum[i] > block[b]) block[b] = lum[i]; }
  // The brightest block within a few blocks, so a solid patch of ink still finds the paper beside it.
  const R = 3, near = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { let m = 0; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const yy = by + dy, xx = bx + dx; if (yy >= 0 && yy < bh && xx >= 0 && xx < bw && block[yy * bw + xx] > m) m = block[yy * bw + xx]; } near[by * bw + bx] = m; }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(bh - 1.001, (y + 0.5) / B - 0.5)), y0 = Math.floor(fy), v = fy - y0, y1 = Math.min(bh - 1, y0 + 1);
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, Math.min(bw - 1.001, (x + 0.5) / B - 0.5)), x0 = Math.floor(fx), u = fx - x0, x1 = Math.min(bw - 1, x0 + 1);
      out[y * w + x] = Math.max(0.2, (near[y0 * bw + x0] * (1 - u) + near[y0 * bw + x1] * u) * (1 - v) + (near[y1 * bw + x0] * (1 - u) + near[y1 * bw + x1] * u) * v);
    }
  }
  return out;
}

/** Turns patches of `value` smaller than `min` pixels into the other value: specks of text become sea, holes in letters land. */
function dropSmall(mask: Uint8Array, w: number, h: number, value: 0 | 1, min: number) {
  const seen = new Uint8Array(mask.length), stack: number[] = [], patch: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (seen[s] || mask[s] !== value) continue;
    patch.length = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!, x = i % w;
      patch.push(i);
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < mask.length && !seen[j] && mask[j] === value) { seen[j] = 1; stack.push(j); }
    }
    if (patch.length < min) for (const i of patch) mask[i] = value ? 0 : 1;
  }
}

/**
 * Where the land is in a picture's RGBA pixels. Transparent pixels count as sea.
 * Dark on light: the sea is the paper that can be reached from the picture's edge without crossing a line, so a coast
 * drawn as an outline is enough. Not blue: anything that isn't blue water. Light on dark: anything lighter than the threshold.
 */
export function readPicture(px: ArrayLike<number>, w: number, h: number, o: Pick<PictureOptions, "landIs" | "threshold">): Picture {
  const n = w * h, lum = new Float32Array(n), seen = new Uint8Array(n), blue = new Uint8Array(n);
  let count = 0, blues = 0, light = 0;
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] < 128) continue;
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    seen[i] = 1; count++;
    lum[i] = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    // Water is blue: clearly bluer than it is red, and at least as blue as it is green (teal and turquoise seas too).
    if (b - r > 30 && b >= g - 10) { blue[i] = 1; blues++; }
    light += lum[i];
  }
  const found: Picture["found"] = o.landIs !== "auto" ? o.landIs : !count ? "ink" : blues / count > 0.08 ? "blue" : light / count > 0.4 ? "ink" : "light";
  const thr = Math.max(0.05, Math.min(0.95, o.threshold / 100)), land = new Uint8Array(n);
  let coastInk: Uint8Array | null = null, paper: Float32Array | null = null;
  if (found === "blue") for (let i = 0; i < n; i++) land[i] = seen[i] && !blue[i] ? 1 : 0;
  else if (found === "light") for (let i = 0; i < n; i++) land[i] = seen[i] && lum[i] > thr ? 1 : 0;
  else {
    // Ink is darker than the paper around it by the threshold. It is thickened while the sea floods in, so gaps in a
    // pen line don't let the sea pour into the land, then the sea is grown back by as much so the coast stays put.
    const raw = new Uint8Array(n);
    paper = paperLight(lum, seen, w, h);
    for (let i = 0; i < n; i++) raw[i] = seen[i] && lum[i] < paper[i] * thr ? 1 : 0;
    const close = Math.max(2, Math.round(Math.max(w, h) / 150)), ink = grow(raw, w, h, close);
    const sea = new Uint8Array(n), queue: number[] = [];
    const start = (i: number) => { if (!ink[i] && !sea[i]) { sea[i] = 1; queue.push(i); } };
    for (let x = 0; x < w; x++) { start(x); start((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { start(y * w); start(y * w + w - 1); }
    for (let i = 0; i < n; i++) if (!seen[i]) start(i);
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k], x = i % w;
      if (x > 0) start(i - 1);
      if (x < w - 1) start(i + 1);
      if (i >= w) start(i - w);
      if (i < n - w) start(i + w);
    }
    const open = grow(sea, w, h, close);
    for (let i = 0; i < n; i++) land[i] = open[i] ? 0 : 1;
    // The coastline's own ink is not high ground: only marks well inside the land count for shading.
    coastInk = grow(sea, w, h, close + Math.max(2, Math.round(Math.max(w, h) / 120)));
  }
  const speck = Math.max(4, Math.round(n * 0.00015));
  dropSmall(land, w, h, 1, speck);
  dropSmall(land, w, h, 0, speck);
  const shade = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!land[i] || !seen[i] || (coastInk && coastInk[i])) continue;
    shade[i] = found === "light" ? Math.max(0, Math.min(1, (1 - lum[i]) / Math.max(0.05, 1 - thr))) : Math.max(0, Math.min(1, 1 - lum[i] / (paper ? paper[i] * thr : 0.9)));
  }
  return { w, h, land, shade, found };
}

/**
 * The picture's land and shading averaged over a w × h grid, with the picture fitted inside a map of this shape
 * (width / height) and kept in proportion. Anything outside the picture is sea.
 */
export function pictureField(pic: Picture, w: number, h: number, aspect: number) {
  const pa = pic.w / pic.h, fw = pa > aspect ? 1 : pa / aspect, fh = pa > aspect ? aspect / pa : 1, x0 = (1 - fw) / 2, y0 = (1 - fh) / 2;
  // Summed areas, so each square averages every picture pixel under it however big or small the picture.
  const W = pic.w + 1, sumL = new Float64Array(W * (pic.h + 1)), sumS = new Float64Array(W * (pic.h + 1));
  for (let y = 0; y < pic.h; y++) {
    let rl = 0, rs = 0;
    for (let x = 0; x < pic.w; x++) { const i = y * pic.w + x; rl += pic.land[i]; rs += pic.shade[i]; sumL[(y + 1) * W + x + 1] = sumL[y * W + x + 1] + rl; sumS[(y + 1) * W + x + 1] = sumS[y * W + x + 1] + rs; }
  }
  const box = (s: Float64Array, ax: number, ay: number, bx: number, by: number) => s[by * W + bx] - s[ay * W + bx] - s[by * W + ax] + s[ay * W + ax];
  const land = new Float32Array(w * h), shade = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u0 = (x / w - x0) / fw, u1 = ((x + 1) / w - x0) / fw, v0 = (y / h - y0) / fh, v1 = ((y + 1) / h - y0) / fh;
    if (u1 <= 0 || u0 >= 1 || v1 <= 0 || v0 >= 1) continue;
    const ax = Math.max(0, Math.min(pic.w - 1, Math.floor(u0 * pic.w))), bx = Math.max(ax + 1, Math.min(pic.w, Math.ceil(u1 * pic.w)));
    const ay = Math.max(0, Math.min(pic.h - 1, Math.floor(v0 * pic.h))), by = Math.max(ay + 1, Math.min(pic.h, Math.ceil(v1 * pic.h)));
    const area = (bx - ax) * (by - ay), inside = Math.min(1, (Math.min(1, u1) - Math.max(0, u0)) / (u1 - u0)) * Math.min(1, (Math.min(1, v1) - Math.max(0, v0)) / (v1 - v0));
    land[y * w + x] = box(sumL, ax, ay, bx, by) / area * inside;
    shade[y * w + x] = box(sumS, ax, ay, bx, by) / area * inside;
  }
  return { land, shade };
}

function blur(a: Float32Array, w: number, h: number, r: number, wrap: boolean) {
  let cur = Float32Array.from(a);
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(a.length), out = new Float32Array(a.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, k = 0; for (let d = -r; d <= r; d++) { let xx = x + d; if (wrap) xx = (xx + w) % w; else if (xx < 0 || xx >= w) continue; s += cur[y * w + xx]; k++; } t[y * w + x] = s / k; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, k = 0; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy < 0 || yy >= h) continue; s += t[yy * w + x]; k++; } out[y * w + x] = s / k; }
    cur = out;
  }
  return cur;
}
function hash(text: string) { let n = 2166136261; for (const ch of text) n = Math.imul(n ^ ch.charCodeAt(0), 16777619); return n >>> 0; }
const h2 = (x: number, y: number, s: number) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
/** Value noise; with a period it repeats east to west, so a planet has no seam. */
function noise(x: number, y: number, s: number, period: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const X = (i: number) => period ? ((i % period) + period) % period : i;
  const a = h2(X(ix), iy, s) * (1 - u) + h2(X(ix + 1), iy, s) * u, b = h2(X(ix), iy + 1, s) * (1 - u) + h2(X(ix + 1), iy + 1, s) * u;
  return a * (1 - v) + b * v;
}
function fbm(u: number, v: number, across: number, down: number, s: number, octaves: number, wrap: boolean) {
  let sum = 0, amp = 1, total = 0, f = 1;
  for (let o = 0; o < octaves; o++) { const p = Math.round(across * f); sum += noise(u * p, v * down * f, s + o * 131, wrap ? p : 0) * amp; total += amp; amp *= 0.5; f *= 2; }
  return sum / total;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Heights for a w × h map from a picture, with sea level at 0: the coast where the picture's land is half covered,
 * land rising away from the sea, ridges for mountains, and darker land higher when shading is on.
 */
export function pictureHeights(pic: Picture, w: number, h: number, o: { aspect: number; seed: string; mountains: number; follow: number; shading: boolean; wrap: boolean }) {
  const field = pictureField(pic, w, h, o.aspect), near = blur(field.land, w, h, 1, o.wrap), far = blur(field.land, w, h, Math.max(2, Math.round(w / 24)), o.wrap);
  const shade = o.shading ? blur(field.shade, w, h, 1, o.wrap) : null, s = hash(o.seed || "picture") % 100000;
  const loose = 1 - Math.max(0, Math.min(100, o.follow)) / 100, across = 5 * o.aspect, mtn = Math.max(0, Math.min(1, o.mountains));
  const e = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, u = (x + 0.5) / w, v = (y + 0.5) / h, m = near[i];
    const wob = (fbm(u, v, across, 5, s, 5, o.wrap) - 0.5) * (0.04 + loose * 0.5);
    const inland = smooth(0.5, 0.85, m), ridge = Math.max(0, fbm(u, v, across * 1.6, 8, s + 9, 3, o.wrap) - 0.55) * mtn * 1.4;
    e[i] = (m - 0.5) * 0.6 + wob + inland * (far[i] * 0.12 + ridge + (shade ? shade[i] * 0.5 : 0)) - (1 - smooth(0.2, 0.6, far[i])) * (1 - smooth(0.3, 0.5, m)) * 0.12;
  }
  return e;
}

function quantile(values: ArrayLike<number>, q: number) {
  const s = Float32Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))];
}

/** A whole planet from a picture, fitted over the world east to west, with the planet's own climate and biomes. */
export function picturePlanet(pic: Picture, p: Pick<PictureOptions, "follow" | "shading">, o: PlanetOptions): Planet {
  const { w, h } = planetMapSize(), e = pictureHeights(pic, w, h, { aspect: 2, seed: o.seed, mountains: o.mountains / 100, follow: p.follow, shading: p.shading, wrap: true });
  const landE = e.filter(v => v >= 0), share = 0.02 + 0.1 * o.mountains / 100, q = (f: number) => landE.length ? quantile(landE, f) : 99;
  let minE = Infinity, maxE = -Infinity;
  for (const v of e) { if (v < minE) minE = v; if (v > maxE) maxE = v; }
  const land: PlanetLand = { w, h, e, up: new Float32Array(w * h), sea: 0, minE, maxE, peak: q(1 - share * 0.25), mtn: q(1 - share), hill: q(1 - share * 2.6) };
  return { ...land, ...planetClimate(o, land) };
}

/** A continent, kingdom or region from a picture, fitted to the map, with the climate, rivers and towns of a generated one. */
export function pictureArea(pic: Picture, p: Pick<PictureOptions, "follow" | "shading">, o: WorldOptions, map: MapData) {
  const k = paintScale(o.columns, o.rows), w = o.columns * k, h = o.rows * k, size = mapSize({ ...map, source: "generated" });
  const e = pictureHeights(pic, w, h, { aspect: size.width / size.height, seed: o.seed, mountains: o.mountains, follow: p.follow, shading: p.shading, wrap: false });
  return generateWorld(o, map, e);
}

/**
 * A sample sketch to try: islands outlined in pen on parchment, with mountains drawn as little peaks.
 * Returned as RGBA pixels, like a picture read in the browser.
 */
export function sampleSketch(w = 800, h = 400) {
  const px = new Uint8ClampedArray(w * h * 4), sx = w / 800, sy = h / 400;
  const blobs = [[190, 165, 125, 85, 1], [500, 150, 160, 92, 2], [620, 300, 78, 46, 3], [330, 305, 62, 34, 4], [110, 330, 38, 22, 5], [730, 110, 26, 18, 6]];
  const peaks = [[170, 140], [192, 150], [214, 140], [470, 128], [492, 138], [514, 128], [536, 138], [600, 160]];
  const seg = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - ax - t * dx, y - ay - t * dy); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x / sx, Y = y / sy;
    let ink = false;
    for (const [cx, cy, rx, ry, k] of blobs) {
      const dx = (X - cx) / rx, dy = (Y - cy) / ry, d = Math.hypot(dx, dy), t = Math.atan2(dy, dx);
      const edge = 1 + 0.16 * Math.sin(3 * t + k) + 0.09 * Math.sin(7 * t + 2 * k) + 0.05 * Math.sin(13 * t + 3 * k);
      if (Math.abs(d - edge) * Math.min(rx, ry) < 1.7) { ink = true; break; }
    }
    if (!ink) for (const [px0, py0] of peaks) if (seg(X, Y, px0 - 9, py0 + 7, px0, py0 - 7) < 1.2 || seg(X, Y, px0, py0 - 7, px0 + 9, py0 + 7) < 1.2) { ink = true; break; }
    const i = (y * w + x) * 4, grain = ((x * 7 + y * 13) % 5) - 2;
    if (ink) { px[i] = 43; px[i + 1] = 33; px[i + 2] = 24; }
    else { px[i] = 243 + grain; px[i + 1] = 236 + grain; px[i + 2] = 220 + grain; }
    px[i + 3] = 255;
  }
  return { px, w, h };
}
