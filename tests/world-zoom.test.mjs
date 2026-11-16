import test from "node:test";
import assert from "node:assert/strict";
import { decodePaint, isWater, mapSchema, newMap, playerMap, terrainIndex } from "../lib/encyclopedia/map-model.ts";
import { defaultPlanetOptions, generatePlanet } from "../lib/encyclopedia/planet-generator.ts";
import { defaultWorldOptions, generateWorld } from "../lib/encyclopedia/world-generator.ts";
import { zoomChoices, zoomFrame, zoomMap, zoomName } from "../lib/encyclopedia/zoom-maps.ts";
import { demoWorkspace, importCopy } from "../lib/encyclopedia/world-model.ts";

const T = terrainIndex;
const blank = () => ({ ...newMap("world", "island", "old", 24, 18), pins: [] });
const planet = () => { const m = blank(); return { ...m, ...generatePlanet(defaultPlanetOptions("salt-731"), m), source: "generated" }; };
const continent = () => { const m = blank(); return { ...m, ...generateWorld({ ...defaultWorldOptions(24, 18, "moss-204"), across: "continent", places: true }, m) }; };
const cellsOf = m => decodePaint(m.paint.columns, m.paint.rows, m.paint.cells);
const share = (cells, f) => cells.reduce((n, v) => n + (f(v) ? 1 : 0), 0) / cells.length;

test("only sizes clearly smaller than the map are offered, and only when its width is set", () => {
  assert.deepEqual(zoomChoices(planet()).map(z => z.id), ["continent", "kingdom", "region", "hex"]);
  assert.deepEqual(zoomChoices(continent()).map(z => z.id), ["kingdom", "region", "hex"]);
  assert.deepEqual(zoomChoices({ ...continent(), scale: undefined }), []);
  assert.deepEqual(zoomChoices({ ...continent(), scale: { width: 300, unit: "km" } }).map(z => z.id), ["hex"]);
});

test("a frame covers the closer map's miles, stays inside the map, and widens toward a planet's poles", () => {
  const m = planet(), f = zoomFrame(m, "kingdom", 0.5, 0.5);
  assert.ok(Math.abs(f.w - 600 / 24900) < 1e-9);
  assert.ok(Math.abs(f.h / f.w - 2 * 18 / 24) < 1e-9, "the frame has the closer map's shape");
  assert.ok(zoomFrame(m, "kingdom", 0.5, 0.15).w > f.w * 1.5);
  const corner = zoomFrame(m, "continent", 0.99, 0.01);
  assert.ok(corner.x + corner.w <= 1 && corner.y >= 0);
});

test("a closer map keeps the same seas and biomes, with finer coasts", () => {
  const m = continent(), cells = cellsOf(m), { columns: W, rows: H } = m.paint;
  // Find a coast: a land square next to the sea in the middle of the map.
  let at = -1;
  for (let y = 20; y < H - 20 && at < 0; y++) for (let x = 20; x < W - 20; x++) { const i = y * W + x; if (!isWater(cells[i]) && isWater(cells[i + 1])) { at = i; break; } }
  assert.ok(at >= 0);
  const frame = zoomFrame(m, "region", (at % W + 0.5) / W, (Math.floor(at / W) + 0.5) / H);
  const child = zoomMap(m, "parent-id", frame, "region", "Saltmarsh");
  const zc = cellsOf(child);
  const sea = share(zc, isWater);
  assert.ok(sea > 0.1 && sea < 0.9, `a coast has land and sea, got ${sea}`);
  // The closer map's terrains are ones from the frame (plus hills and lakes it adds).
  const near = new Set();
  for (let y = Math.floor(frame.y * H) - 3; y <= Math.ceil((frame.y + frame.h) * H) + 3; y++) for (let x = Math.floor(frame.x * W) - 3; x <= Math.ceil((frame.x + frame.w) * W) + 3; x++) near.add(cells[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))]);
  for (const t of new Set(zc)) assert.ok(near.has(t) || t === T.hills || t === T.sea, `terrain ${t}`);
  assert.equal(child.scale.width, 200);
  assert.deepEqual(child.zoomOf, { mapId: "parent-id", ...frame });
  assert.ok(mapSchema.safeParse(child).success, JSON.stringify(mapSchema.safeParse(child).error?.issues?.slice(0, 2)));
  assert.deepEqual(zoomMap(m, "parent-id", frame, "region", "Saltmarsh"), child, "the same frame always gives the same map");
});

test("zooming far into a planet still gives a varied hex area, not one flat colour", () => {
  const m = planet(), cells = cellsOf(m), { columns: W, rows: H } = m.paint;
  const i = cells.findIndex((t, k) => t === T.forest && Math.floor(k / W) > H * 0.3 && Math.floor(k / W) < H * 0.7);
  assert.ok(i >= 0);
  const child = zoomMap(m, "p", zoomFrame(m, "hex", (i % W + 0.5) / W, (Math.floor(i / W) + 0.5) / H), "hex", "Around the wood");
  assert.equal(child.category, "hex"); assert.equal(child.grid, "hex"); assert.equal(child.columns, 20);
  const zc = cellsOf(child), kinds = new Set(zc);
  assert.ok(kinds.size >= 2, `only ${[...kinds]}`);
  assert.ok(share(zc, t => t === T.forest) > 0.3);
  assert.ok(mapSchema.safeParse(child).success);
});

test("places, rivers, roads and names inside the frame come along at the closer scale", () => {
  const m = continent(), town = m.pins[0];
  const withLabel = { ...m, labels: [{ id: "lbl", text: "The Reach", x: town.x, y: town.y, size: "large", visibility: "players" }], pins: m.pins.map(p => p.id === town.id ? { ...p, notes: "Home", areaMapId: "old-area" } : p) };
  const frame = zoomFrame(withLabel, "kingdom", town.x, town.y), child = zoomMap(withLabel, "p", frame, "kingdom", "x");
  const moved = child.pins.find(p => p.id === town.id);
  assert.ok(moved && moved.notes === "Home" && moved.areaMapId === null);
  assert.ok(Math.abs(moved.x - (town.x - frame.x) / frame.w) < 1e-9);
  assert.ok(child.pins.every(p => p.x >= 0 && p.x <= 1));
  assert.equal(child.labels.length, 1);
  for (const p of child.paths) assert.ok(p.points.length >= 2 && p.points.every(q => q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1));
  assert.equal(zoomName(withLabel, frame, "kingdom").startsWith("Lands around "), true);
  assert.match(zoomName({ ...withLabel, pins: [] }, frame, "region"), /^[A-Z][a-z]+ (Reach|March|Coast|Vale|Wilds)$/);
});

test("players never get where a closer map sits, and imported copies keep the link between the copies", () => {
  const child = zoomMap(continent(), "p", { x: 0.2, y: 0.2, w: 0.3, h: 0.3 }, "kingdom", "x");
  assert.equal(playerMap({ ...child, visibility: "players" }).zoomOf, undefined);
  const w = demoWorkspace(), base = w.entries.find(e => e.id === "demo-mara");
  w.entries.push({ ...base, id: "world-map", kind: "map", mapData: continent() }, { ...base, id: "kingdom-map", kind: "map", mapData: { ...child, zoomOf: { ...child.zoomOf, mapId: "world-map" } } });
  const copy = importCopy({ ...w, entries: [], worlds: [], campaigns: [] }, w);
  const parent = copy.entries.find(e => e.title === base.title && e.mapData && !e.mapData.zoomOf), kid = copy.entries.find(e => e.mapData?.zoomOf);
  assert.ok(parent && kid);
  assert.equal(kid.mapData.zoomOf.mapId, parent.id);
});
