import test from "node:test";
import assert from "node:assert/strict";
import { decodePaint, encodePaint, isWater, mapSchema, newMap, paintSchema, resizeCells, terrainIndex, terrains, tilesFromPaint } from "../lib/encyclopedia/map-model.ts";
import { terrainLayerOf, terrainLayers } from "../lib/encyclopedia/terrain-art.ts";
import { legendItems } from "../lib/encyclopedia/map-looks.ts";
import { terrainCost } from "../lib/encyclopedia/hex-crawl.ts";
import { buildPlanet, defaultPlanetOptions, generatePlanet, planetChecks, planetFeatures, planetMapSize, planetPixels, planetStats, withPreset, PLANET_COLUMNS, PLANET_ROWS } from "../lib/encyclopedia/planet-generator.ts";

const options = (patch = {}) => ({ ...defaultPlanetOptions("salt-731"), ...patch });
const share = (cells, test) => cells.reduce((n, v) => n + (test(v) ? 1 : 0), 0) / cells.length;
const T = terrainIndex;

test("maps saved with the original eight terrains read exactly as before", () => {
  const old = "01.11.21.31.41.51.61.71.0" + (136).toString(36);
  const cells = decodePaint(12, 12, old);
  assert.deepEqual([...cells.slice(0, 9)], [0, 1, 2, 3, 4, 5, 6, 7, 0]);
  assert.equal(encodePaint(cells), old);
  assert.ok(paintSchema.safeParse({ columns: 12, rows: 12, cells: old }).success);
});

test("the new terrains are written as letters after 9 and read back", () => {
  const cells = Uint8Array.from({ length: 144 }, (_, i) => i % terrains.length);
  const text = encodePaint(cells);
  assert.match(text, /^[0-9A-Z][0-9a-z]+(\.[0-9A-Z][0-9a-z]+)*$/);
  assert.ok(text.includes("A1") && text.includes("H1"), text);
  assert.deepEqual(decodePaint(12, 12, text), cells);
  assert.ok(paintSchema.safeParse({ columns: 12, rows: 12, cells: text }).success);
  assert.equal(decodePaint(12, 12, "I" + (144).toString(36)), null, "a terrain past the list is refused");
  assert.equal(decodePaint(12, 12, "a" + (144).toString(36)), null, "lower case is a count, not a terrain");
});

test("water is sea, deep sea and sea ice; travel can't cross open water", () => {
  assert.deepEqual(terrains.map((_, i) => i).filter(isWater), [T.sea, T.deep, T.seaice]);
  assert.equal(terrainCost.length, terrains.length);
  assert.equal(terrainCost[T.deep], Infinity);
  assert.ok(Number.isFinite(terrainCost[T.seaice]));
  assert.equal(T.glacier, 10); assert.equal(T.boreal, 12);
});

test("every terrain has a drawing layer, and legends name the new ones", () => {
  for (let t = 1; t < terrains.length; t++) if (!isWater(t)) assert.notEqual(terrainLayerOf(t), "", terrains[t].id);
  assert.equal(terrainLayerOf(T.mountains), "mountains");
  assert.equal(terrainLayerOf(T.grassland), "land");
  const cells = new Uint8Array(24 * 24).fill(T.boreal); cells.fill(T.deep, 0, 100); cells.fill(T.jungle, 300, 400);
  const paint = { columns: 24, rows: 24, cells: encodePaint(cells) };
  const ids = terrainLayers(paint, 240, 240).map(l => l.id);
  assert.ok(ids.includes("deep") && ids.includes("boreal") && ids.includes("jungle") && ids.includes("land"), ids.join());
  const map = { ...newMap("world", "blank", "x", 4, 4), paint };
  const names = legendItems(map, paint).map(i => i.name);
  assert.ok(names.includes("Boreal forest") && names.includes("Jungle") && names.includes("Deep sea"), names.join());
});

test("the same seed always makes the same planet", () => {
  const a = buildPlanet(options(), 120, 60), b = buildPlanet(options(), 120, 60), c = buildPlanet(options({ seed: "salt-732" }), 120, 60);
  assert.deepEqual(a.cells, b.cells);
  assert.notDeepEqual(a.cells, c.cells);
});

test("water sets how much of the globe's surface is sea", () => {
  for (const water of [30, 70, 90]) {
    const sea = 1 - planetStats(buildPlanet(options({ water }), 120, 60)).land;
    assert.ok(Math.abs(sea - water / 100) < 0.02, `asked for ${water}% of the globe, got ${(sea * 100).toFixed(1)}%`);
  }
});

test("poles are colder than the equator, and frozen worlds are mostly ice", () => {
  const p = buildPlanet(options({ tilt: 23 }), 120, 60), row = y => p.temperature.slice(y * 120, (y + 1) * 120).reduce((a, b) => a + b) / 120;
  assert.ok(row(1) < row(30) - 20 && row(58) < row(30) - 20);
  const cold = [...buildPlanet(options({ temp: -3 }), 120, 60).cells].filter(v => !isWater(v) || v === T.seaice);
  assert.ok(share(cold, v => [T.glacier, T.tundra, T.snow, T.seaice].includes(v)) > 0.7);
});

test("a tidally locked world is hot under its sun and frozen on the far side", () => {
  const p = buildPlanet(options({ rotation: "locked", water: 50 }), 120, 60), mid = 30 * 120;
  assert.ok(p.temperature[mid + 60] > p.temperature[mid + 1] + 50);
});

test("without complex life there are no forests or grassland", () => {
  const cells = [...buildPlanet(options({ life: "none", water: 40 }), 120, 60).cells];
  for (const id of ["forest", "boreal", "jungle", "grassland", "steppe", "savanna", "marsh"]) assert.ok(!cells.includes(T[id]), id);
  assert.ok(cells.includes(T.barren));
});

test("biomes a world doesn't have become their nearest kind", () => {
  const all = [...buildPlanet(options({ water: 40 }), 120, 60).cells];
  assert.ok(all.includes(T.jungle) || all.includes(T.forest));
  const cells = [...buildPlanet(options({ water: 40, biomesOff: ["jungle", "forest", "boreal"] }), 120, 60).cells];
  for (const id of ["jungle", "forest", "boreal"]) assert.ok(!cells.includes(T[id]), id);
});

test("presets change the planet but keep the seed and what to add", () => {
  const o = withPreset(options({ places: 4, seed: "keep" }), "desert");
  assert.equal(o.seed, "keep"); assert.equal(o.places, 4); assert.equal(o.water, 16);
  const sea = share([...buildPlanet(o, 120, 60).cells], isWater);
  assert.ok(sea < 0.25);
});

test("rivers run downhill to the sea and towns stand on dry land", () => {
  const p = buildPlanet(options(), 240, 120), f = planetFeatures(options({ places: 12, rivers: 8 }), p);
  assert.ok(f.rivers.length >= 3, `only ${f.rivers.length} rivers`);
  for (const r of f.rivers) {
    assert.ok(p.e[r.cells[0]] > p.e[r.cells.at(-1)], "a river ends lower than it starts");
    assert.ok(r.cells.every((c, i) => i === 0 || c !== r.cells[i - 1]));
  }
  assert.ok(f.places.length >= 6);
  for (const t of f.places) assert.ok(!isWater(p.cells[t.i]));
  assert.ok(f.places.some(t => t.kind === "city") && f.places.some(t => t.kind === "village"));
});

test("a generated planet is a valid, savable map that wraps at 2:1", () => {
  const map = { ...newMap("world", "island", "old", 24, 18), pins: [] };
  const patch = generatePlanet(options(), map), next = { ...map, ...patch };
  assert.equal(next.columns, PLANET_COLUMNS); assert.equal(next.rows, PLANET_ROWS);
  assert.equal(next.paint.columns, next.paint.rows * 2);
  assert.equal(next.scale.width, 24900);
  const parsed = mapSchema.safeParse(next);
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3)));
  assert.deepEqual(next.tiles, tilesFromPaint(next, next.paint));
  assert.ok(next.pins.some(p => p.kind === "landmark"));
  assert.ok(next.paths.some(p => p.kind === "river") && next.paths.some(p => p.kind === "road"));
  // No river or road jumps across the map's east-west seam.
  for (const path of next.paths) for (let i = 1; i < path.points.length; i++) assert.ok(Math.abs(path.points[i].x - path.points[i - 1].x) < 0.5, path.id);
  assert.deepEqual(generatePlanet(options(), map), patch);
});

test("generating again keeps places the GM worked on and replaces the rest", () => {
  const map = { ...newMap("world", "island", "old", 24, 18), pins: [] };
  const first = { ...map, ...generatePlanet(options(), map) };
  const town = first.pins.find(p => p.kind === "town");
  const worked = { ...first, pins: first.pins.map(p => p.id === town.id ? { ...p, notes: "The party's home" } : p) };
  const again = generatePlanet(options({ seed: "other" }), worked);
  assert.ok(again.pins.some(p => p.id === town.id && p.notes));
  assert.ok(!again.pins.some(p => p.id !== town.id && first.pins.some(q => q.id === p.id)));
});

test("changing a map's size moves revealed fog, hex notes and the party to the same spots", () => {
  const map = { ...newMap("world", "island", "x", 10, 10), grid: "square", fog: { enabled: true, revealed: [0, 1, 10, 11] }, hexes: [{ cell: 99, title: "Corner", notes: "", visibility: "gm" }], party: { cell: 0, trail: [0], hours: 0, visibility: "gm" } };
  const r = resizeCells(map, 20, 10);
  assert.deepEqual(r.fog.revealed, [0, 1, 2, 3, 20, 21, 22, 23]);
  assert.equal(r.hexes[0].cell, 10 * 20 - 1);
  assert.equal(r.party.cell, 1, "the party stands where the middle of its old cell was");
  assert.equal(resizeCells(map, 10, 10).fog, map.fog);
});

test("stats weigh squares by their true area, so polar ice doesn't look bigger than it is", () => {
  const p = buildPlanet(options({ water: 70 }), 120, 60), stats = planetStats(p);
  assert.ok(Math.abs(stats.shares.reduce((a, b) => a + b) - 1) < 1e-9);
  assert.ok(Math.abs(stats.land - 0.3) < 0.02, `land ${stats.land}`);
  // Sea ice sits at the poles, so its share by area is smaller than its share of squares.
  const squares = [...p.cells].filter(v => v === T.seaice).length / p.cells.length;
  assert.ok(stats.shares[T.seaice] < squares);
  assert.ok(stats.livable > 0.2 && stats.livable <= 1);
  assert.ok(planetStats(buildPlanet(options({ temp: -3 }), 120, 60)).livable < stats.livable);
});

test("built-in checks flag settings that don't hang together", () => {
  const notes = o => planetChecks(options(o)).filter(c => c.kind === "note").map(c => c.text).join(" ");
  assert.equal(notes({}), "");
  assert.match(notes({ rotation: "locked", tilt: 23 }), /tilt is ignored/);
  assert.match(notes({ tilt: 70 }), /ice gathers near the equator/);
  assert.match(notes({ water: 10, rain: 80 }), /Very little sea/);
  assert.match(notes({ temp: 3, water: 70 }), /boil/);
  assert.match(notes({ temp: -3 }), /under the ice/);
  assert.match(notes({ size: "tiny" }), /loses its air/);
  assert.match(notes({ life: "none" }), /colonies or outposts/);
  assert.equal(planetChecks(options({ rotation: "locked", tilt: 0 }))[0].kind, "ok");
});

test("the planet's colours cover every square, and the map can reuse a planet already built", () => {
  const { w, h } = planetMapSize();
  assert.equal(w, h * 2);
  const world = buildPlanet(options(), w, h), px = planetPixels(world);
  assert.equal(px.length, w * h * 4);
  assert.ok(px.every((v, i) => i % 4 !== 3 || v === 255));
  const map = { ...newMap("world", "island", "old", 24, 18), pins: [] };
  assert.deepEqual(generatePlanet(options(), map, world), generatePlanet(options(), map));
});
