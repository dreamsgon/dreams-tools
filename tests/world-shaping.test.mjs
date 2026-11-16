import test from "node:test";
import assert from "node:assert/strict";
import { decodePaint, isWater, mapSchema, newMap, playerMap, terrainIndex } from "../lib/encyclopedia/map-model.ts";
import { defaultPlanetOptions, generatePlanet, handPlanet, planetMapSize, planetOptionsOf } from "../lib/encyclopedia/planet-generator.ts";
import { finishShape, heightsFromCells, isPlanetMap, redoPlanetPlaces, shapeStep, startShape } from "../lib/encyclopedia/land-shaping.ts";

const T = terrainIndex;
const options = (patch = {}) => ({ ...defaultPlanetOptions("salt-731"), ...patch });
const blankMap = () => ({ ...newMap("world", "island", "old", 24, 18), pins: [] });
/** A drag across the middle of the map with one brush. */
function drag(cells, w, h, mode, { strength = 60, radius = 6, passes = 1, wrap = true, heights = null, from = 0.3, to = 0.7, y = 0.5 } = {}) {
  const s = startShape(cells, w, h, { wrap, heights, at: { x: from, y } });
  for (let p = 0; p < passes; p++) for (let k = 0; k <= 20; k++) shapeStep(s, { x: p % 2 ? to - (to - from) * k / 20 : from + (to - from) * k / 20, y }, radius, mode, strength);
  return s;
}

test("drawing by hand starts with an empty sea, frozen at the poles of a cold world", () => {
  const map = blankMap(), patch = handPlanet(options({ temp: -1 }), map), { w, h } = planetMapSize();
  const cells = decodePaint(w, h, patch.paint.cells);
  assert.ok(cells.every(isWater));
  assert.ok(cells[0] === T.seaice && cells[(h / 2) * w] === T.sea);
  assert.deepEqual(patch.planet, { temp: -1, rain: 50, tilt: 23, rotation: "spin", life: "complex", size: "medium", volcanism: 25, biomesOff: [] });
  assert.ok(mapSchema.safeParse({ ...map, ...patch }).success);
  assert.ok(isPlanetMap({ ...map, ...patch }));
});

test("a planet map keeps its climate so later shaping matches, but players don't get it", () => {
  const map = { ...blankMap(), ...generatePlanet(options({ temp: 1, rain: 70, biomesOff: ["jungle"] }), blankMap()) };
  assert.equal(map.planet.temp, 1); assert.deepEqual(map.planet.biomesOff, ["jungle"]);
  assert.equal(planetOptionsOf(map).rain, 70); assert.equal(planetOptionsOf(map).seed, "salt-731");
  assert.ok(!mapSchema.safeParse({ ...map, planet: { ...map.planet, temp: 9 } }).success);
  assert.equal(playerMap({ ...map, visibility: "players" }).planet, undefined);
  assert.ok(!isPlanetMap({ ...blankMap(), paint: { columns: 24, rows: 18, cells: "0c0" } }));
});

test("heights read from terrain: sea below land, land rising inland, hills, mountains and peaks in order", () => {
  const w = 30, h = 12, cells = new Uint8Array(w * h).fill(T.sea);
  for (let y = 2; y < 10; y++) for (let x = 5; x < 25; x++) cells[y * w + x] = T.grassland;
  cells[6 * w + 14] = T.hills; cells[6 * w + 15] = T.mountains; cells[6 * w + 16] = T.snow; cells[0] = T.deep;
  const e = heightsFromCells(cells, w, h, false);
  assert.ok(e[0] < e[1] && e[1] < 0);
  assert.ok(e[2 * w + 5] > 0 && e[5 * w + 10] > e[2 * w + 5], "land rises away from the coast");
  assert.ok(e[5 * w + 10] < 0.15 && e[6 * w + 14] >= 0.15 && e[6 * w + 15] >= 0.3 && e[6 * w + 16] >= 0.42);
});

test("draw land and draw sea move the coast; new land joins the terrain around it", () => {
  const w = 60, h = 30, cells = new Uint8Array(w * h).fill(T.sea);
  for (let y = 0; y < h; y++) for (let x = 0; x < 15; x++) cells[y * w + x] = T.forest;
  const s = drag(cells, w, h, "land", { from: 0.2, to: 0.5, wrap: false });
  const mid = 15 * w + 20;
  assert.equal(s.cells[mid], T.forest, "new land next to a forest is forest");
  assert.equal(s.cells[15 * w + 45], T.sea, "the sea past the stroke is untouched");
  const far = drag(cells, w, h, "land", { from: 0.75, to: 0.9, wrap: false });
  assert.equal(far.cells[15 * w + 48], T.grassland, "land drawn far from any shore is grassland");
  const sea = drag(cells, w, h, "sea", { from: 0.05, to: 0.15, wrap: false });
  assert.equal(sea.cells[15 * w + 6], T.sea);
  assert.equal(sea.cells[2 * w + 6], T.forest);
});

test("raising land makes hills, then mountains, then peaks; lowering takes them back down", () => {
  const w = 60, h = 30, cells = new Uint8Array(w * h).fill(T.desert), at = 15 * w + 30;
  let s = drag(cells, w, h, "raise", { passes: 1 });
  assert.equal(s.cells[at], T.hills);
  s = drag(cells, w, h, "raise", { passes: 3 });
  assert.equal(s.cells[at], T.mountains);
  s = drag(cells, w, h, "raise", { passes: 6, strength: 100 });
  assert.equal(s.cells[at], T.snow);
  const lowered = drag(s.cells, w, h, "lower", { passes: 6, strength: 100, heights: s.heights });
  assert.ok(lowered.heights[at] > 0 && lowered.heights[at] < 0.15);
  assert.ok([T.desert, T.grassland].includes(lowered.cells[at]), "lowered back down, it is lowland again");
  const sunk = drag(cells, w, h, "lower", { passes: 8, strength: 100 });
  assert.ok(isWater(sunk.cells[at]), "lowered far enough, land goes under the sea");
  const volcano = Uint8Array.from(cells); volcano.fill(T.volcanic, at - 3, at + 3);
  assert.equal(drag(volcano, w, h, "raise", { passes: 1, from: 0.45, to: 0.55 }).cells[at], T.volcanic, "a volcano stays a volcano");
});

test("flatten pulls the ground toward the height where the stroke began", () => {
  const w = 60, h = 30, cells = new Uint8Array(w * h).fill(T.grassland);
  for (let x = 30; x < 45; x++) for (let y = 10; y < 20; y++) cells[y * w + x] = T.mountains;
  const s = drag(cells, w, h, "flatten", { from: 0.2, to: 0.7, passes: 8, strength: 100, radius: 5 });
  assert.ok(s.cells[15 * w + 36] !== T.mountains);
  assert.ok(!isWater(s.cells[15 * w + 36]));
});

test("on a planet, new land takes its climate's biome, and the shaping wraps across the seam", () => {
  const map = { ...blankMap(), ...handPlanet(options({ temp: 0 }), blankMap()) }, { w, h } = planetMapSize();
  const cells = decodePaint(w, h, map.paint.cells), o = planetOptionsOf(map);
  // A strip of land across the seam, from far north to the equator.
  const s = startShape(cells, w, h, { wrap: true, at: { x: 0.98, y: 0.1 } });
  for (let k = 0; k <= 30; k++) shapeStep(s, { x: (0.98 + k * 0.002) % 1, y: 0.1 + k * 0.013 }, 5, "land", 50);
  assert.ok(!isWater(s.cells[Math.floor(0.3 * h) * w + 1]) && !isWater(s.cells[Math.floor(0.3 * h) * w + w - 2]), "land on both sides of the seam");
  const out = finishShape(s, o);
  const north = out[Math.floor(0.12 * h) * w], south = out[Math.floor(0.48 * h) * w + 2];
  assert.ok([T.glacier, T.tundra].includes(north), `far north is frozen, got ${north}`);
  assert.ok(![T.glacier, T.tundra, T.boreal].includes(south), `near the equator it is warm, got ${south}`);
  assert.deepEqual(finishShape(s), s.cells, "without climate the drawn terrain stays");
});

test("on a planet, a new mountain range casts a rain shadow, but terrain the GM painted stays", () => {
  const map = { ...blankMap(), ...generatePlanet(options({ water: 40, rain: 45 }), blankMap()) }, { w, h } = planetMapSize();
  const cells = decodePaint(w, h, map.paint.cells), o = planetOptionsOf(map);
  // Paint one square as something the climate would never give, far from the stroke.
  const painted = 5 * w + 5; cells[painted] = T.volcanic;
  const s = startShape(cells, w, h, { wrap: true, at: { x: 0.4, y: 0.35 } });
  for (let p = 0; p < 6; p++) for (let k = 0; k <= 20; k++) shapeStep(s, { x: 0.4, y: 0.35 + (p % 2 ? 20 - k : k) * 0.015 }, 3, "raise", 100);
  const out = finishShape(s, o);
  let changedOutside = 0;
  for (let i = 0; i < out.length; i++) { const x = i % w; if ((x < 0.35 * w || x > 0.45 * w) && out[i] !== cells[i]) changedOutside++; }
  assert.ok(changedOutside > 0, "squares beyond the stroke changed with the climate");
  assert.equal(out[painted], T.volcanic);
  assert.ok(out.some((v, i) => v === T.mountains && cells[i] !== T.mountains));
});

test("redo rivers and towns keeps places the GM worked on and finds rivers on hand-raised land", () => {
  const map = { ...blankMap(), ...handPlanet(options(), blankMap()) }, { w, h } = planetMapSize();
  let cells = decodePaint(w, h, map.paint.cells), heights = null;
  // A big continent with a mountain spine.
  let s = startShape(cells, w, h, { wrap: true, at: { x: 0.3, y: 0.3 } });
  for (let y = 0.3; y <= 0.7; y += 0.04) for (let k = 0; k <= 20; k++) shapeStep(s, { x: 0.3 + k * 0.015, y }, 6, "land", 50);
  cells = finishShape(s, planetOptionsOf(map)); heights = s.heights;
  s = startShape(cells, w, h, { wrap: true, heights, at: { x: 0.45, y: 0.32 } });
  for (let p = 0; p < 6; p++) for (let k = 0; k <= 20; k++) shapeStep(s, { x: 0.45, y: 0.32 + (p % 2 ? 20 - k : k) * 0.018 }, 4, "raise", 100);
  cells = finishShape(s, planetOptionsOf(map)); heights = s.heights;
  const home = { id: "home", title: "Home", x: 0.4, y: 0.5, notes: "The party's home", entryId: null, visibility: "gm" };
  const patch = redoPlanetPlaces({ ...map, pins: [home] }, cells, heights);
  assert.ok(patch.pins.some(p => p.id === "home"));
  assert.ok(patch.pins.filter(p => p.kind === "city" || p.kind === "town").length >= 3);
  assert.ok(patch.paths.some(p => p.kind === "river"), "rivers run off the new mountains");
  for (const pin of patch.pins) assert.ok(!isWater(cells[Math.floor(pin.y * h) * w + Math.floor(pin.x * w)]), pin.title);
  const next = { ...map, ...patch };
  assert.ok(mapSchema.safeParse(next).success);
  assert.deepEqual(redoPlanetPlaces(next, cells, heights).pins.map(p => p.id).sort(), patch.pins.map(p => p.id).sort(), "the same land gives the same places again");
});
