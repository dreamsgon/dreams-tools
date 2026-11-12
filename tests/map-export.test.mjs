import test from "node:test";
import assert from "node:assert/strict";
import { roomNumbers, roomMarkers, roomMarkerPrefix, setUpDrawnMapScene, buildUvtt, exportName, stampPieces, placePieces } from "../lib/map-export.ts";
import { generateMap } from "../lib/map-generator.ts";
import { orderedShapes } from "../lib/map-drawing.ts";
import { newScene, newToken, pointOfInterestSchema, mapDrawingSchema, sceneSchema } from "../lib/model.ts";
import { parseVttImport } from "../lib/vtt-import.ts";

const GRID = 70;
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const map = generateMap({ kind: "dungeon", size: "small", rooms: 5, style: "stone", seed: "ember-42", grid: GRID });
const drawing = () => structuredClone(map.drawing);

test("the generated fixture has labels, doors and walls to work with", () => {
  assert.ok(roomNumbers(drawing()).length > 0);
  assert.ok(drawing().shapes.some(s => s.type === "door"));
});

test("roomNumbers returns only filled labels with non-empty text, at their point", () => {
  const d = drawing();
  const filled = d.shapes.filter(s => s.type === "label" && s.fill && s.name.trim());
  // Plain label: no fill, so it is not a room number.
  const plain = { ...structuredClone(filled[0]), id: "plain-label", fill: null, name: "9" };
  // Blank label: filled but empty text.
  const blank = { ...structuredClone(filled[0]), id: "blank-label", name: "   " };
  d.shapes.push(plain, blank);
  d.layerOrder = [];
  const numbers = roomNumbers(d);
  const ids = numbers.map(n => n.id);
  assert.ok(!ids.includes("plain-label"));
  assert.ok(!ids.includes("blank-label"));
  assert.equal(numbers.length, filled.length);
  for (const n of numbers) {
    const shape = d.shapes.find(s => s.id === n.id);
    assert.equal(n.text, shape.name.trim());
    assert.deepEqual({ x: n.x, y: n.y }, { x: shape.points[0].x, y: shape.points[0].y });
  }
});

test("roomNumbers trims the label text", () => {
  const d = drawing();
  const label = d.shapes.find(s => s.type === "label");
  label.name = "  7 ";
  label.fill = "#ffffff";
  assert.equal(roomNumbers(d).find(n => n.id === label.id).text, "7");
});

test("roomMarkers ids start with the room marker prefix", () => {
  const markers = roomMarkers(drawing());
  assert.ok(markers.length > 0);
  for (const m of markers) assert.ok(m.id.startsWith(roomMarkerPrefix), m.id);
});

test("roomMarkers names a numeric label 'Room N' and keeps other text", () => {
  const d = drawing();
  d.shapes.push({ ...structuredClone(d.shapes.find(s => s.type === "label")), id: "armoury", name: "Armoury", fill: "#ffffff" });
  d.shapes.push({ ...structuredClone(d.shapes.find(s => s.type === "label")), id: "numbered", name: "3", fill: "#ffffff" });
  const byId = Object.fromEntries(roomMarkers(d).map(m => [m.id, m]));
  assert.equal(byId[`${roomMarkerPrefix}numbered`].name, "Room 3");
  assert.equal(byId[`${roomMarkerPrefix}armoury`].name, "Armoury");
});

test("roomMarkers are hidden and each passes pointOfInterestSchema", () => {
  const markers = roomMarkers(drawing());
  for (const m of markers) {
    assert.equal(m.hidden, true);
    assert.doesNotThrow(() => pointOfInterestSchema.parse(m));
  }
});

test("setUpDrawnMapScene sets the grid to match the drawing", () => {
  const scene = newScene("Dungeon");
  scene.drawing = drawing();
  setUpDrawnMapScene(scene, { fog: false, markers: false, grid: { size: GRID, units: 10, unit: "m" } });
  assert.equal(scene.grid.type, "square");
  assert.equal(scene.grid.size, GRID);
  assert.equal(scene.grid.offsetX, 0);
  assert.equal(scene.grid.offsetY, 0);
  assert.equal(scene.grid.units, 10);
  assert.equal(scene.grid.unit, "m");
});

test("setUpDrawnMapScene with fog true enables fog with no strokes", () => {
  const scene = newScene();
  scene.drawing = drawing();
  setUpDrawnMapScene(scene, { fog: true, markers: false, grid: { size: GRID, units: 5, unit: "ft" } });
  assert.deepEqual(scene.fog, { enabled: true, base: true, strokes: [] });
});

test("setUpDrawnMapScene with fog false leaves the fog unchanged", () => {
  const scene = newScene();
  scene.drawing = drawing();
  scene.fog = { enabled: false, base: false, strokes: [] };
  const before = structuredClone(scene.fog);
  setUpDrawnMapScene(scene, { fog: false, markers: false, grid: { size: GRID, units: 5, unit: "ft" } });
  assert.deepEqual(scene.fog, before);
});

test("setUpDrawnMapScene with markers replaces room markers without duplicates", () => {
  const scene = newScene();
  scene.drawing = drawing();
  const options = { fog: false, markers: true, grid: { size: GRID, units: 5, unit: "ft" } };
  setUpDrawnMapScene(scene, options);
  setUpDrawnMapScene(scene, options);
  const ids = scene.pointsOfInterest.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate point ids");
  const roomIds = ids.filter(id => id.startsWith(roomMarkerPrefix));
  assert.equal(roomIds.length, roomNumbers(scene.drawing).length);
});

test("setUpDrawnMapScene with markers keeps other points of interest", () => {
  const scene = newScene();
  scene.drawing = drawing();
  const inn = { id: "inn", name: "The Inn", x: 10, y: 20, color: "#ff0000", hidden: false, folderId: null, targetSceneId: null, activation: "double" };
  scene.pointsOfInterest = [inn];
  setUpDrawnMapScene(scene, { fog: false, markers: true, grid: { size: GRID, units: 5, unit: "ft" } });
  setUpDrawnMapScene(scene, { fog: false, markers: true, grid: { size: GRID, units: 5, unit: "ft" } });
  assert.deepEqual(scene.pointsOfInterest.find(p => p.id === "inn"), inn);
});

test("setUpDrawnMapScene with markers false leaves pointsOfInterest alone", () => {
  const scene = newScene();
  scene.drawing = drawing();
  scene.pointsOfInterest = [{ id: "inn", name: "The Inn", x: 1, y: 2, color: "#ff0000", hidden: false, folderId: null, targetSceneId: null, activation: "double" }];
  const before = structuredClone(scene.pointsOfInterest);
  setUpDrawnMapScene(scene, { fog: false, markers: false, grid: { size: GRID, units: 5, unit: "ft" } });
  assert.deepEqual(scene.pointsOfInterest, before);
});

test("buildUvtt has the format, resolution and grid pixel size", () => {
  const uvtt = buildUvtt(drawing(), map.width, map.height, GRID, TINY_PNG);
  assert.equal(uvtt.format, 0.3);
  assert.equal(uvtt.resolution.map_size.x, map.width / GRID);
  assert.equal(uvtt.resolution.map_size.y, map.height / GRID);
  assert.equal(uvtt.resolution.pixels_per_grid, GRID);
  assert.equal(uvtt.image, TINY_PNG);
});

test("buildUvtt line of sight is a non-empty list of two-point segments inside the map", () => {
  const uvtt = buildUvtt(drawing(), map.width, map.height, GRID, TINY_PNG);
  const maxX = map.width / GRID, maxY = map.height / GRID;
  assert.ok(Array.isArray(uvtt.line_of_sight));
  assert.ok(uvtt.line_of_sight.length > 0);
  for (const seg of uvtt.line_of_sight) {
    assert.equal(seg.length, 2);
    for (const p of seg) {
      assert.ok(p.x >= 0 && p.x <= maxX, `x ${p.x}`);
      assert.ok(p.y >= 0 && p.y <= maxY, `y ${p.y}`);
    }
  }
});

test("buildUvtt has one portal per door or window, closed only for doors", () => {
  const d = drawing();
  const uvtt = buildUvtt(d, map.width, map.height, GRID, TINY_PNG);
  const expected = orderedShapes(d).filter(s => s.type === "door" || s.type === "window");
  assert.ok(expected.length > 0);
  assert.equal(uvtt.portals.length, expected.length);
  assert.deepEqual(uvtt.portals.map(p => p.closed), expected.map(s => s.type === "door"));
});

test("buildUvtt output round-trips through parseVttImport", () => {
  const uvtt = buildUvtt(drawing(), map.width, map.height, GRID, TINY_PNG);
  let parsed;
  assert.doesNotThrow(() => { parsed = parseVttImport(JSON.stringify(uvtt), "dungeon.uvtt"); });
  assert.equal(parsed.name, "dungeon");
  assert.equal(parsed.width, map.width);
  assert.equal(parsed.height, map.height);
  assert.equal(parsed.grid.size, GRID);
  assert.equal(parsed.image.extension, "png");
  assert.equal(parsed.image.mimeType, "image/png");
  assert.equal(parsed.metadata.counts.portals, uvtt.portals.length);
  assert.equal(parsed.metadata.counts.line_of_sight, uvtt.line_of_sight.length);
});

test("exportName turns a map name into a dashed file name", () => {
  assert.equal(exportName("Dungeon (ember-42)", "png"), "dungeon-ember-42.png");
});

test("exportName falls back to map for an empty or symbol-only name", () => {
  assert.equal(exportName("", "png"), "map.png");
  assert.equal(exportName("   ", "png"), "map.png");
  assert.equal(exportName("!!! ???", "png"), "map.png");
});

test("exportName cuts long names to 60 characters before the extension", () => {
  const name = exportName("a".repeat(100), "png");
  assert.equal(name, `${"a".repeat(60)}.png`);
});

test("exportName does not leave a trailing dash when the cut lands on a separator", () => {
  // 59 letters, a space, then more letters: the dash lands at position 60 and is cut in.
  const name = exportName(`${"a".repeat(59)} bbbb`, "png");
  assert.ok(!/-\.png$/.test(name), name);
});

// Stamps as pieces: a 2 x 1 table turned a quarter, a crate and a flipped crate.
const stamp = (id, kind, x, y, w, h, patch = {}) => ({ id, type: "stamp", stamp: kind, rotation: 0, flip: false, roomParts: [], hidden: false, locked: false, name: `${kind} ${id}`, folderId: null, smooth: false, points: [{ x, y }, { x: x + w * GRID, y: y + h * GRID }], fill: null, stroke: "#000000", thickness: 1, closed: false, ...patch });
const stamped = () => {
  const d = drawing();
  d.shapes = d.shapes.filter(s => s.type !== "stamp");
  d.shapes.push(stamp("t1", "table", 0, 0, 2, 1, { rotation: 270 }), stamp("c1", "crate", 140, 0, 1, 1), stamp("c2", "crate", 210, 70, 1, 1), stamp("c3", "crate", 280, 70, 1, 1, { flip: true }));
  d.layerOrder = [];
  return mapDrawingSchema.parse(d);
};

test("each stamp becomes a piece the size of its longer side, turned like the stamp", () => {
  const pieces = stampPieces(stamped(), GRID);
  assert.equal(pieces.length, 4);
  const table = pieces.find(p => p.shapeId === "t1");
  assert.deepEqual([table.x, table.y, table.size, table.rotation], [GRID, GRID / 2, 2, -90]);
  assert.equal(table.name, "table t1");
  const [c1, c2, c3] = ["c1", "c2", "c3"].map(id => pieces.find(p => p.shapeId === id));
  assert.equal(c1.look, c2.look, "two crates the same share a picture");
  assert.notEqual(c1.look, c3.look, "a flipped crate needs its own");
  assert.match(c1.lookName, /^Map piece: Crate 1×1 /);
});

test("pieces go on the scene once, stay where the GM moved them, and come off with the stamp", () => {
  const scene = { ...newScene("Crypt"), drawing: stamped(), tokens: [newToken("Mara")] };
  const looks = Object.fromEntries(stampPieces(scene.drawing, GRID).map(p => [p.look, `asset-${p.look.split("|")[0]}`]));
  setUpDrawnMapScene(scene, { fog: false, markers: false, grid: { size: GRID, units: 5, unit: "ft" }, pieces: looks });
  assert.equal(scene.tokens.length, 5);
  const crate = scene.tokens.find(t => t.pieceOf === "c1");
  assert.deepEqual([crate.id, crate.assetId, crate.showHp, crate.showName, crate.skipInitiative, crate.borderWidth], ["piece-c1", "asset-crate", false, false, true, 0]);
  assert.ok(sceneSchema.safeParse(scene).success);
  crate.x = 999;
  scene.drawing.shapes = scene.drawing.shapes.filter(s => s.id !== "c2");
  placePieces(scene, looks, GRID);
  assert.equal(scene.tokens.find(t => t.pieceOf === "c1").x, 999);
  assert.equal(scene.tokens.some(t => t.pieceOf === "c2"), false);
  assert.equal(scene.tokens.length, 4);
  placePieces(scene, null, GRID);
  assert.deepEqual(scene.tokens.map(t => t.name), ["Mara"], "unticked, the stamps go back into the map");
});

test("without the pieces option a scene's tokens are left alone", () => {
  const scene = { ...newScene("Crypt"), drawing: stamped(), tokens: [{ ...newToken("Crate"), pieceOf: "c1" }] };
  setUpDrawnMapScene(scene, { fog: false, markers: false, grid: { size: GRID, units: 5, unit: "ft" } });
  assert.equal(scene.tokens.length, 1);
});
