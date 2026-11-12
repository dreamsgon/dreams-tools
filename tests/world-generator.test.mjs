import test from "node:test";
import assert from "node:assert/strict";
import { decodePaint, mapSchema, newMap } from "../lib/encyclopedia/map-model.ts";
import { traceMask } from "../lib/encyclopedia/terrain-art.ts";
import { defaultWorldOptions, generateWorld, placeName, seeded, worldAcross, worldTerrain } from "../lib/encyclopedia/world-generator.ts";

const options = (patch = {}) => ({ ...defaultWorldOptions(24, 18, "lantern-12"), ...patch });
const cellsOf = paint => decodePaint(paint.columns, paint.rows, paint.cells);
const share = (cells, test) => cells.reduce((n, v) => n + (test(v) ? 1 : 0), 0) / cells.length;

test("the same seed always makes the same world, and another seed a different one", () => {
  assert.deepEqual(worldTerrain(options()), worldTerrain(options()));
  assert.notEqual(worldTerrain(options()).cells, worldTerrain(options({ seed: "lantern-13" })).cells);
});

test("terrain covers the map at the paint resolution", () => {
  const paint = worldTerrain(options());
  assert.equal(paint.columns, 144); assert.equal(paint.rows, 108);
  assert.equal(cellsOf(paint).length, 144 * 108);
});

test("sea level sets how much of the map is sea", () => {
  for (const level of [0.3, 0.5, 0.7]) {
    const sea = share(cellsOf(worldTerrain(options({ seaLevel: level }))), v => v === 0);
    assert.ok(Math.abs(sea - level) < 0.03, `asked for ${level}, got ${sea.toFixed(2)}`);
  }
});

test("inland maps are mostly land with a few lakes", () => {
  const sea = share(cellsOf(worldTerrain(options({ kind: "inland", seaLevel: 0.8 }))), v => v === 0);
  assert.ok(sea > 0 && sea <= 0.17, `${sea}`);
});

test("continents keep their edges as sea; archipelagos break into many islands", () => {
  const paint = worldTerrain(options()), cells = cellsOf(paint), w = paint.columns, h = paint.rows;
  let edgeLand = 0;
  for (let x = 0; x < w; x++) edgeLand += (cells[x] ? 1 : 0) + (cells[(h - 1) * w + x] ? 1 : 0);
  assert.ok(edgeLand / (2 * w) < 0.25, "a continent's top and bottom edges are mostly sea");
  const islands = worldTerrain(options({ kind: "archipelago", seed: "isles" }));
  const land = cellsOf(islands).map(v => (v ? 1 : 0));
  assert.ok(traceMask(Uint8Array.from(land), islands.columns, islands.rows).length >= 4);
});

test("a coast has land along one side and sea along the other", () => {
  const paint = worldTerrain(options({ kind: "coast", seed: "shore" })), cells = cellsOf(paint), w = paint.columns, h = paint.rows;
  const sideLand = [
    Array.from({ length: h }, (_, y) => cells[y * w]),
    Array.from({ length: h }, (_, y) => cells[y * w + w - 1]),
    Array.from({ length: w }, (_, x) => cells[x]),
    Array.from({ length: w }, (_, x) => cells[(h - 1) * w + x]),
  ].map(edge => share(edge, v => v !== 0));
  assert.ok(Math.max(...sideLand) > 0.6 && Math.min(...sideLand) < 0.4, sideLand.map(n => n.toFixed(2)).join(" "));
});

test("more mountains means more mountain ground", () => {
  const few = share(cellsOf(worldTerrain(options({ mountains: 0 }))), v => v === 4 || v === 7);
  const many = share(cellsOf(worldTerrain(options({ mountains: 1 }))), v => v === 4 || v === 7);
  assert.ok(many > few * 2, `${few} vs ${many}`);
});

test("climate moves snow and desert", () => {
  const cold = cellsOf(worldTerrain(options({ climate: "cold" }))), warm = cellsOf(worldTerrain(options({ climate: "warm" })));
  assert.ok(share(cold, v => v === 7) > share(warm, v => v === 7));
  assert.ok(share(warm, v => v === 5) > share(cold, v => v === 5));
  assert.equal(share(cold, v => v === 5), 0, "no deserts in a cold world");
});

test("place names are made up, tidy and repeatable", () => {
  const a = seeded("names"), b = seeded("names");
  for (let i = 0; i < 20; i++) {
    const name = placeName(a);
    assert.match(name, /^[A-Z][a-z]+$/);
    assert.equal(name, placeName(b));
  }
});

test("towns sit on open land, spread out, with different names", () => {
  const map = { ...newMap("world", "blank", "x", 24, 18), pins: [] };
  const result = generateWorld(options({ places: true }), map);
  const paint = result.paint, cells = cellsOf(paint);
  assert.ok(result.pins.length >= 5 && result.pins.length <= worldAcross.kingdom.places, `${result.pins.length} towns`);
  assert.equal(new Set(result.pins.map(p => p.title)).size, result.pins.length);
  for (const p of result.pins) {
    const v = cells[Math.floor(p.y * paint.rows) * paint.columns + Math.floor(p.x * paint.columns)];
    assert.ok(v !== 0 && v !== 4 && v !== 7, `${p.title} is on terrain ${v}`);
    assert.equal(p.visibility, "gm");
  }
  for (const a of result.pins) for (const b of result.pins) if (a !== b) assert.ok(Math.hypot(a.x - b.x, (a.y - b.y) * 0.75) > 0.08);
  assert.ok(mapSchema.safeParse({ ...map, ...result }).success);
});

test("generating keeps the places already on the map and sets the map width", () => {
  const map = { ...newMap("world", "island", "x", 24, 18), scale: { width: 50, unit: "km" } };
  map.pins = [{ id: "keep", title: "Old Keep", x: 0.5, y: 0.5, notes: "Mine", entryId: null, visibility: "players" }];
  const result = generateWorld(options({ places: true, across: "continent" }), map);
  assert.deepEqual(result.pins[0], map.pins[0]);
  assert.deepEqual(result.scale, { width: 3218, unit: "km" });
  assert.equal(result.tiles.length, 24 * 18);
  assert.deepEqual(generateWorld(options({ places: false }), map).pins, map.pins);
  const full = { ...map, pins: Array.from({ length: 99 }, (_, i) => ({ ...map.pins[0], id: `p${i}`, title: `Place ${i}` })) };
  assert.equal(generateWorld(options({ places: true }), full).pins.length, 100);
});
