import test from "node:test";
import assert from "node:assert/strict";
import { resizeMap, eraseWall, cutOpenings, wallSegments, shiftSceneContents } from "../lib/map-creator.ts";
import { buildUvtt } from "../lib/map-export.ts";
import { shapeOps } from "../lib/map-style.ts";
import { mapDrawingSchema } from "../lib/model.ts";

const shape = (id, type, points, extra = {}) => ({ id, name: id, folderId: null, smooth: false, hidden: false, locked: false, type, roomParts: [], points, fill: null, stroke: "#333333", thickness: 10, closed: false, stamp: null, rotation: 0, flip: false, ...extra });
const room = shape("room", "rect", [{ x: 70, y: 70 }, { x: 350, y: 280 }], { fill: "#ddccaa" });
const map = (shapes) => ({ name: "Test", width: 700, height: 490, drawing: { background: "#8b9b75", style: null, shapes, folders: [], layerOrder: shapes.map(s => s.id) } });

test("growing the map on the right keeps the drawing where it is", () => {
  const r = resizeMap(map([room]), 980, 490, { x: 0, y: 0 }, 70);
  assert.equal(r.width, 980);
  assert.deepEqual([r.dx, r.dy], [0, 0]);
  assert.deepEqual(r.drawing.shapes[0].points, room.points);
  assert.deepEqual(r.trimmed, []);
});

test("growing on the left or from the centre moves the drawing by whole squares", () => {
  const left = resizeMap(map([room]), 980, 490, { x: 1, y: 0 }, 70);
  assert.equal(left.dx, 280);
  assert.deepEqual(left.drawing.shapes[0].points[0], { x: 350, y: 70 });
  const centre = resizeMap(map([room]), 840, 630, { x: .5, y: .5 }, 70);
  assert.deepEqual([centre.dx, centre.dy], [70, 70]);
});

test("shrinking trims shapes past the new edge and removes ones left outside", () => {
  const far = shape("far", "line", [{ x: 600, y: 400 }, { x: 680, y: 450 }]);
  const r = resizeMap(map([room, far]), 280, 490, { x: 0, y: 0 }, 70);
  assert.deepEqual(r.trimmed.sort(), ["far", "room"]);
  assert.equal(r.drawing.shapes.length, 1);
  assert.deepEqual(r.drawing.shapes[0].points[1], { x: 280, y: 280 });
  assert.deepEqual(r.drawing.layerOrder, ["room"]);
  assert.equal(mapDrawingSchema.safeParse(r.drawing).success, true);
});

test("erasing the middle of a straight wall splits it in two", () => {
  const wall = shape("w", "line", [{ x: 0, y: 140 }, { x: 700, y: 140 }]);
  const [seg] = wallSegments([wall]);
  let n = 0;
  const r = eraseWall([wall], seg, { x: 210, y: 140 }, { x: 420, y: 140 }, () => `new${++n}`, "#8b9b75");
  assert.equal(r.shapes.length, 2);
  assert.deepEqual(r.shapes[0].points, [{ x: 0, y: 140 }, { x: 210, y: 140 }]);
  assert.deepEqual(r.shapes[1].points, [{ x: 420, y: 140 }, { x: 700, y: 140 }]);
  assert.equal(r.added[0].id, "new1");
});

test("erasing a wall end shortens it, and erasing all of it removes it", () => {
  const wall = shape("w", "line", [{ x: 0, y: 140 }, { x: 280, y: 140 }]);
  const [seg] = wallSegments([wall]);
  const end = eraseWall([wall], seg, { x: 210, y: 140 }, { x: 280, y: 140 }, () => "x", "#fff");
  assert.deepEqual(end.shapes[0].points, [{ x: 0, y: 140 }, { x: 210, y: 140 }]);
  const all = eraseWall([wall], seg, { x: 0, y: 140 }, { x: 280, y: 140 }, () => "x", "#fff");
  assert.deepEqual(all.removed, ["w"]);
  assert.equal(all.shapes.length, 0);
});

test("erasing a room's wall leaves an opening in the floor colour, cut from line of sight", () => {
  const top = wallSegments([room]).find(w => w.a.y === 70 && w.b.y === 70);
  const r = eraseWall([room], top, { x: 140, y: 70 }, { x: 280, y: 70 }, () => "gap", "#8b9b75");
  const gap = r.shapes.find(s => s.id === "gap");
  assert.equal(gap.type, "opening");
  assert.equal(gap.fill, "#ddccaa");
  assert.equal(gap.thickness, 10);
  assert.equal(mapDrawingSchema.safeParse(map(r.shapes).drawing).success, true);
  // Drawn as a gap over the wall, with no door symbol.
  assert.equal(shapeOps(gap, { background: "#8b9b75", style: null }).length, 1);
  // The opening is not a wall, and line of sight has a hole where it is.
  const walls = cutOpenings(wallSegments(r.shapes), r.shapes);
  const topPieces = walls.filter(w => w.a.y === 70 && w.b.y === 70).map(w => [w.a.x, w.b.x].sort((a, b) => a - b));
  assert.deepEqual(topPieces.sort((a, b) => a[0] - b[0]), [[70, 140], [280, 350]]);
  const uvtt = buildUvtt(map(r.shapes).drawing, 700, 490, 70, "");
  assert.equal(uvtt.portals.length, 0);
  assert.equal(uvtt.line_of_sight.length, 5);
});

test("tokens, fog, notes and crops move with a drawing that grew on its top or left", () => {
  const scene = { tokens: [{ x: 10, y: 20 }], effects: [{ x: 5, y: 5 }], pointsOfInterest: [{ x: 1, y: 2 }], measurements: [{ points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] }], fog: { strokes: [{ points: [{ x: 3, y: 4 }] }] }, crop: { x: 10, y: 10 }, savedCrops: [{ x: 0, y: 0 }] };
  shiftSceneContents(scene, 70, -20);
  assert.deepEqual(scene.tokens[0], { x: 80, y: 0 });
  assert.deepEqual(scene.effects[0], { x: 75, y: -15 });
  assert.deepEqual(scene.pointsOfInterest[0], { x: 71, y: -18 });
  assert.deepEqual(scene.measurements[0].points[1], { x: 140, y: -20 });
  assert.deepEqual(scene.fog.strokes[0].points[0], { x: 73, y: -16 });
  assert.deepEqual(scene.crop, { x: 80, y: 0 });
  assert.deepEqual(scene.savedCrops[0], { x: 70, y: 0 });
});
