import test from "node:test";
import assert from "node:assert/strict";
import { decodePaint, isWater, mapSchema, newMap, terrainIndex } from "../lib/encyclopedia/map-model.ts";
import { defaultPlanetOptions, generatePlanet, planetMapSize } from "../lib/encyclopedia/planet-generator.ts";
import { defaultWorldOptions } from "../lib/encyclopedia/world-generator.ts";
import { isPlanetMap } from "../lib/encyclopedia/land-shaping.ts";
import { defaultPictureOptions, pictureArea, picturePlanet, pictureReadSize, readPicture, sampleSketch } from "../lib/encyclopedia/picture-map.ts";

const T = terrainIndex;
const blankMap = () => ({ ...newMap("world", "island", "old", 24, 18), pins: [] });
const read = (s, patch = {}) => readPicture(s.px, s.w, s.h, { ...defaultPictureOptions(), ...patch });
/** A w × h picture painted pixel by pixel: f gives [r, g, b] or [r, g, b, a]. */
function paint(w, h, f) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b, a = 255] = f(x, y); px.set([r, g, b, a], (y * w + x) * 4); }
  return { px, w, h };
}
const at = (pic, fx, fy) => pic.land[Math.floor(fy * pic.h) * pic.w + Math.floor(fx * pic.w)];
const cellsOf = m => decodePaint(m.paint.columns, m.paint.rows, m.paint.cells);

test("pictures are read at most 1024 pixels across, keeping their shape", () => {
  assert.deepEqual(pictureReadSize(4000, 2000), { w: 1024, h: 512 });
  assert.deepEqual(pictureReadSize(600, 900), { w: 600, h: 900 });
});

test("a pen sketch on paper: outlines enclose land, and only the marks inside it count as high ground", () => {
  const s = sampleSketch(1024, 512), pic = read(s);
  assert.equal(pic.found, "ink");
  assert.equal(at(pic, 500 / 800, 200 / 400), 1, "inside the big island");
  assert.equal(at(pic, 0.02, 0.02), 0, "the paper around it is sea");
  assert.equal(at(pic, 360 / 800, 375 / 400), 0);
  const share = pic.land.reduce((a, b) => a + b, 0) / pic.land.length;
  assert.ok(share > 0.25 && share < 0.45, `land ${share}`);
  // The little peaks are dark; the coastline, though just as dark, is not.
  const shadeNear = (fx, fy) => { let m = 0; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) m = Math.max(m, pic.shade[(Math.floor(fy * pic.h) + dy) * pic.w + Math.floor(fx * pic.w) + dx]); return m; };
  assert.ok(shadeNear(192 / 800, 150 / 400) > 0.5, "a drawn peak");
  assert.ok(shadeNear(500 / 800, 150 / 400 - 92 * 1.0 / 400) < 0.1, "the north coast of the big island");
});

test("a photo with a shadow across it and a gap in the pen line still gives the land inside", () => {
  const w = 900, h = 600, cx = 450, cy = 300;
  const s = paint(w, h, (x, y) => {
    const paper = 235 - 110 * (x / w); // the right side is in shadow
    const d = Math.hypot(x - cx, (y - cy) * 1.4), a = Math.atan2(y - cy, x - cx);
    const line = Math.abs(d - 220) < 2.5 && Math.abs(a - 1) > 0.02; // a small gap in the line
    const v = line ? paper * 0.35 : paper;
    return [v, v - 5, v - 15];
  });
  const pic = read(s);
  assert.equal(pic.found, "ink");
  assert.equal(at(pic, 0.5, 0.5), 1, "the inside is land, though the sea could reach the gap");
  assert.equal(at(pic, 0.95, 0.5), 0, "paper in the shadow is still sea");
  assert.equal(at(pic, 0.05, 0.5), 0);
});

test("a coloured map: anything not blue is land, labels in the sea vanish, and lakes stay", () => {
  const w = 800, h = 500;
  const s = paint(w, h, (x, y) => {
    const land = Math.hypot(x - 400, y - 250) < 180, lake = Math.hypot(x - 420, y - 240) < 35;
    const label = y > 40 && y < 50 && x > 60 && x < 200 && (x % 6 < 2); // thin dark strokes of text in the sea
    if (label) return [20, 20, 20];
    return land && !lake ? [120, 160, 90] : [70, 120, 190];
  });
  const pic = read(s);
  assert.equal(pic.found, "blue");
  assert.equal(at(pic, 400 / 800, 150 / 500), 1);
  assert.equal(at(pic, 420 / 800, 240 / 500), 0, "the lake");
  assert.equal(at(pic, 100 / 800, 45 / 500), 0, "the label is gone");
});

test("light land on a dark sea, and transparent parts of a picture are sea", () => {
  const s = paint(400, 300, (x, y) => Math.hypot(x - 200, y - 150) < 90 ? [220, 210, 190] : [25, 30, 40]);
  const pic = read(s);
  assert.equal(pic.found, "light");
  assert.equal(at(pic, 0.5, 0.5), 1); assert.equal(at(pic, 0.05, 0.05), 0);
  const clear = paint(400, 300, x => x < 200 ? [0, 0, 0, 0] : [200, 200, 200]);
  const cut = read(clear, { landIs: "light" });
  assert.equal(at(cut, 0.25, 0.5), 0); assert.equal(at(cut, 0.75, 0.5), 1);
});

test("a map from a picture keeps its coasts, fits it in proportion, and is the same every time", () => {
  const pic = read(sampleSketch(1024, 512)), map = blankMap(), o = { ...defaultWorldOptions(24, 18, "moss-204"), across: "continent" };
  const area = pictureArea(pic, defaultPictureOptions(), o, map), next = { ...map, ...area };
  assert.ok(mapSchema.safeParse(next).success);
  assert.deepEqual(pictureArea(pic, defaultPictureOptions(), o, map), area);
  const cells = cellsOf(next), { columns: W, rows: H } = next.paint;
  // The 2:1 picture fills the 4:3 map's width and the middle two thirds of its height; above and below is sea.
  for (let x = 0; x < W; x++) assert.ok(isWater(cells[x]) && isWater(cells[(H - 1) * W + x]));
  // Land squares sit on the picture's land, more closely the more the map follows it.
  const agree = follow => {
    const c = cellsOf({ paint: pictureArea(pic, { ...defaultPictureOptions(), follow }, o, map).paint });
    let same = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = ((y + 0.5) / H - 1 / 6) / (2 / 3);
      if (v < 0 || v > 1) continue;
      n++; if (!isWater(c[y * W + x]) === !!at(pic, (x + 0.5) / W, v)) same++;
    }
    return same / n;
  };
  const close = agree(100), loose = agree(0);
  assert.ok(close > 0.95, `following closely, ${close}`);
  assert.ok(loose < close, `following freely wanders more, ${loose}`);
  assert.ok(area.pins.length > 0 && area.pins.every(p => !isWater(cells[Math.floor(p.y * H) * W + Math.floor(p.x * W)])), "towns are on land");
});

test("with shading on, the peaks drawn on the sketch become mountains", () => {
  const pic = read(sampleSketch(1024, 512)), map = blankMap(), o = { ...defaultWorldOptions(24, 18, "moss-204"), across: "kingdom", mountains: 0.3 };
  const near = (m, fx, fy) => { const c = cellsOf(m), { columns: W, rows: H } = m.paint, y0 = Math.floor((1 / 6 + fy * 2 / 3) * H), x0 = Math.floor(fx * W); let k = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const t = c[(y0 + dy) * W + x0 + dx]; if (t === T.mountains || t === T.snow || t === T.hills) k++; } return k; };
  const flat = pictureArea(pic, { ...defaultPictureOptions(), shading: false }, o, map), shaded = pictureArea(pic, { ...defaultPictureOptions(), shading: true }, o, map);
  assert.ok(near(shaded, 192 / 800, 145 / 400) > near(flat, 192 / 800, 145 / 400), "more high ground under the drawn peaks");
  assert.ok(near(shaded, 192 / 800, 145 / 400) >= 10);
});

test("a whole planet from a picture wraps like a globe, keeps its climate, and its towns are on land", () => {
  const pic = read(sampleSketch(1024, 512)), map = blankMap(), o = { ...defaultPlanetOptions("salt-731"), temp: 1, places: 10 };
  const world = picturePlanet(pic, defaultPictureOptions(), o), patch = generatePlanet(o, map, world), next = { ...map, ...patch, source: "generated" };
  const { w, h } = planetMapSize();
  assert.equal(world.w, w); assert.equal(world.h, h);
  assert.ok(isPlanetMap(next));
  assert.equal(next.planet.temp, 1);
  assert.ok(mapSchema.safeParse(next).success);
  const cells = cellsOf(next);
  assert.ok(!isWater(cells[Math.floor(0.5 * h) * w + Math.floor(0.62 * w)]), "the big island");
  assert.ok(patch.pins.length >= 5 && patch.pins.every(p => !isWater(cells[Math.floor(p.y * h) * w + Math.floor(p.x * w)])));
});
