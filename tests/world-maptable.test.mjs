import test from "node:test";
import assert from "node:assert/strict";
import { cellShape, newMap, playerMap } from "../lib/encyclopedia/map-model.ts";
import { placeMarkers, sceneForMap, tableFog, tableGrid, tableImageSize, tablePicture } from "../lib/encyclopedia/map-to-maptable.ts";
import { areaMapFor, revealInParents } from "../lib/encyclopedia/hex-crawl.ts";
import { hexCell, hexCenter, newScene, newToken } from "../lib/model.ts";

const asset = { id: "asset-1", kind: "image", name: "Map", src: "/api/assets?id=6f1c2c1a-8a4b-4c3e-9a51-2f6a0f1b9d10", width: 10, height: 10 };
const pin = (patch = {}) => ({ id: "p1", title: "Saltmere", x: 0.25, y: 0.5, notes: "Port town", entryId: null, visibility: "players", kind: "town", ...patch });
const options = { markers: true, fog: true, grid: true };

test("the picture is table sized and keeps the map's shape", () => {
  const m = areaMapFor("Mistwood"), size = tableImageSize(m);
  assert.equal(size.width, 2400);
  const shape = cellShape(m, m.columns * m.rows - 1);
  assert.ok(Math.abs(size.height / size.width - (shape.y + shape.h / 2) / ((shape.x + shape.w / 2) + 0.0001)) < 0.05);
});

test("the table's hex grid lies exactly over the map's hexes", () => {
  const m = areaMapFor("Mistwood"), { scale } = tableImageSize(m), grid = tableGrid(m, newScene().grid);
  assert.equal(grid.type, "hex-pointy");
  assert.equal(grid.units, 6);
  assert.equal(grid.unit, "mi");
  for (const i of [0, 1, 20, 21, 137, 279]) {
    const c = cellShape(m, i), at = { x: c.x * scale, y: c.y * scale };
    const h = hexCell(at, grid), centre = hexCenter(h.q, h.r, grid);
    assert.ok(Math.hypot(centre.x - at.x, centre.y - at.y) < 0.01, `hex ${i}`);
  }
  const square = { ...newMap("region", "island", "x", 20, 15), grid: "square", scale: { width: 100, unit: "km" } };
  assert.equal(tableGrid(square, newScene().grid).size, 2400 / 20);
  assert.equal(tableGrid(square, newScene().grid).units, 5);
});

test("places become markers: hidden when GM only, opening an area map's scene", () => {
  const m = { ...areaMapFor("x"), pins: [pin({ areaMapId: "area" }), pin({ id: "p2", title: "Hideout", visibility: "gm", notes: "" })] };
  const [a, b] = placeMarkers(m, { area: "scene-9" });
  assert.equal(a.id, "place-p1");
  assert.equal(a.targetSceneId, "scene-9");
  assert.equal(a.activation, "double");
  assert.equal(a.hidden, false);
  assert.equal(a.notes, "Port town");
  assert.equal(a.x, 600);
  assert.equal(b.hidden, true);
  assert.equal(b.targetSceneId, null);
});

test("the explored cells become fog reveals on a covered table", () => {
  const m = { ...areaMapFor("x"), fog: { enabled: true, revealed: [3, 4] } };
  const fog = tableFog(m);
  assert.deepEqual([fog.enabled, fog.base, fog.strokes.length], [true, true, 2]);
  assert.equal(fog.strokes[0].shape, "polygon");
  assert.equal(fog.strokes[0].points.length, 6);
  assert.equal(tableFog(areaMapFor("x")).enabled, false);
});

test("the picture leaves out GM-only lines, names and everything drawn as markers", () => {
  const m = { ...areaMapFor("x"), pins: [pin()], paths: [{ id: "r", kind: "road", name: "", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], visibility: "gm" }], labels: [{ id: "l", text: "Sea", x: 0.5, y: 0.5, size: "large", visibility: "players" }], fog: { enabled: true, revealed: [] } };
  const p = tablePicture(m);
  assert.deepEqual([p.pins.length, p.paths.length, p.labels.length, p.fog, p.grid], [0, 0, 1, undefined, "none"]);
});

test("updating a scene swaps the picture and place markers but keeps the table's own things", () => {
  const m = { ...areaMapFor("x"), pins: [pin()] };
  const first = sceneForMap(m, "Mistwood", asset, options, {}, undefined, "camp");
  assert.equal(first.mapType, "area");
  assert.equal(first.containerId, "camp");
  assert.equal(first.mapId, "asset-1");
  const played = { ...first, tokens: [newToken("Mara")], pointsOfInterest: [...first.pointsOfInterest, { id: "mine", folderId: null, name: "Ambush", x: 1, y: 1, color: "#aa3333", hidden: true, targetSceneId: null, activation: "double" }] };
  const moved = { ...m, pins: [pin({ title: "Saltmere Port" })] };
  const next = sceneForMap(moved, "Mistwood", { ...asset, id: "asset-2" }, { ...options, fog: false }, {}, played);
  assert.equal(next.id, first.id);
  assert.equal(next.mapId, "asset-2");
  assert.equal(next.tokens[0].name, "Mara");
  assert.deepEqual(next.pointsOfInterest.map(p => p.name).sort(), ["Ambush", "Saltmere Port"]);
  assert.equal(sceneForMap(newMap("world", "island", "w"), "W", asset, options, {}).mapType, "world");
});

test("players never get the GM's Maptable scene", () => {
  assert.equal(playerMap({ ...areaMapFor("x"), maptableSceneId: "scene-1" }).maptableSceneId, undefined);
});

test("the party on an area map reveals its place on the world map", () => {
  const world = { ...newMap("world", "island", "w"), fog: { enabled: true, revealed: [] }, pins: [pin({ areaMapId: "area" })] };
  const w = { schemaVersion: 1, worlds: [], campaigns: [], entries: [{ id: "world", mapData: world }, { id: "area", mapData: areaMapFor("a") }] };
  const next = revealInParents(w, "area");
  assert.ok(next.entries[0].mapData.fog.revealed.length >= 4);
  assert.equal(revealInParents(next, "area"), next, "nothing changes the second time");
  assert.equal(revealInParents(w, "other"), w);
});
