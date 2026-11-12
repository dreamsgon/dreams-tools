import test from "node:test";
import assert from "node:assert/strict";
import { stamps, stampCategories, stampById, findStamps, stampBox, stampMatrix, stampCorners, rotateStamp } from "../lib/map-stamps.ts";
import { shapeOps } from "../lib/map-style.ts";
import { shapePath } from "../lib/map-drawing.ts";
import { wallSegments } from "../lib/map-creator.ts";
import { mapShapeSchema } from "../lib/model.ts";

const stampShape = (extra = {}) => ({
  id: "s1", name: "", folderId: null, smooth: false, hidden: false, locked: false, type: "stamp", stamp: "bed",
  rotation: 0, flip: false, roomParts: [], points: [{ x: 0, y: 0 }, { x: 70, y: 140 }], fill: null, stroke: "#414b3c",
  thickness: 1, closed: false, ...extra,
});
const roundTo = (v) => Math.round(v * 1e6) / 1e6 + 0;
const apply = ([a, b, c, d, e, f], x, y) => ({ x: roundTo(a * x + c * y + e), y: roundTo(b * x + d * y + f) });
const near = (actual, expected) => {
  assert.equal(roundTo(actual.x), roundTo(expected.x), `x: got ${actual.x}, want ${expected.x}`);
  assert.equal(roundTo(actual.y), roundTo(expected.y), `y: got ${actual.y}, want ${expected.y}`);
};

test("every stamp has a unique id, a known category, a box of at least one square and at least one part", () => {
  const ids = stamps.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const s of stamps) {
    assert.ok(stampCategories.includes(s.category), `${s.id} category ${s.category}`);
    assert.ok(s.w >= 1, `${s.id} w`);
    assert.ok(s.h >= 1, `${s.id} h`);
    assert.ok(s.parts.length >= 1, `${s.id} has parts`);
  }
});

test("stampById finds a stamp by id and returns null for unknown or missing ids", () => {
  assert.equal(stampById("bed").name, "Bed");
  assert.equal(stampById("nope"), null);
  assert.equal(stampById(null), null);
  assert.equal(stampById(undefined), null);
});

test("findStamps with an empty query returns every stamp", () => {
  assert.equal(findStamps("").length, stamps.length);
  assert.equal(findStamps("   ").length, stamps.length);
});

test("findStamps matches names", () => {
  assert.deepEqual(findStamps("bar").map(s => s.name), ["Barrel"]);
});

test("findStamps matches the Outdoors category with six stamps", () => {
  const found = findStamps("outdoors");
  assert.equal(found.length, 6);
  assert.ok(found.every(s => s.category === "Outdoors"));
});

test("findStamps is case-insensitive", () => {
  assert.deepEqual(findStamps("BARREL").map(s => s.id), findStamps("barrel").map(s => s.id));
  assert.deepEqual(findStamps("OutDoors").map(s => s.id), findStamps("outdoors").map(s => s.id));
  assert.equal(findStamps("BARREL").length, 1);
});

test("stampBox snaps the top-left corner to the grid when size is given", () => {
  const [p, q] = stampBox({ w: 1, h: 1 }, { x: 100, y: 100 }, 70, 70, 1000, 1000);
  assert.deepEqual(p, { x: 70, y: 70 });
  assert.deepEqual(q, { x: 140, y: 140 });
});

test("stampBox centres the box on the point when size is null", () => {
  const [p, q] = stampBox({ w: 1, h: 1 }, { x: 300, y: 300 }, null, 70, 1000, 1000);
  assert.deepEqual(p, { x: 265, y: 265 });
  assert.deepEqual(q, { x: 335, y: 335 });
});

test("stampBox keeps the box inside the map at the top-left and bottom-right edges", () => {
  const [p0, q0] = stampBox({ w: 1, h: 1 }, { x: 0, y: 0 }, null, 70, 500, 400);
  assert.deepEqual(p0, { x: 0, y: 0 });
  assert.deepEqual(q0, { x: 70, y: 70 });

  const [p1, q1] = stampBox({ w: 1, h: 1 }, { x: 500, y: 400 }, null, 70, 500, 400);
  assert.deepEqual(p1, { x: 430, y: 330 });
  assert.deepEqual(q1, { x: 500, y: 400 });

  const [p2, q2] = stampBox({ w: 2, h: 1 }, { x: 0, y: 0 }, 70, 70, 500, 400);
  assert.deepEqual(p2, { x: 0, y: 0 });
  assert.deepEqual(q2, { x: 140, y: 70 });
});

test("stampBox gives a 2x1 stamp a box two squares wide", () => {
  const [p, q] = stampBox({ w: 2, h: 1 }, { x: 300, y: 300 }, 70, 70, 1000, 1000);
  assert.equal(q.x - p.x, 140);
  assert.equal(q.y - p.y, 70);
});

test("stampMatrix with no rotation or flip maps the art corners onto the box corners", () => {
  const bed = stampById("bed");
  const s = stampShape({ points: [{ x: 0, y: 0 }, { x: 70, y: 140 }] });
  const m = stampMatrix(s, bed);
  near(apply(m, 0, 0), { x: 0, y: 0 });
  near(apply(m, bed.w * 40, bed.h * 40), { x: 70, y: 140 });
});

test("stampMatrix with flip mirrors the art left to right", () => {
  const bed = stampById("bed");
  const s = stampShape({ flip: true, points: [{ x: 0, y: 0 }, { x: 70, y: 140 }] });
  const m = stampMatrix(s, bed);
  near(apply(m, 0, 0), { x: 70, y: 0 });
  near(apply(m, bed.w * 40, bed.h * 40), { x: 0, y: 140 });
});

test("stampMatrix with rotation 90 maps the art centre to the box centre", () => {
  const bed = stampById("bed");
  const s = stampShape({ rotation: 90, points: [{ x: 0, y: 0 }, { x: 70, y: 140 }] });
  const m = stampMatrix(s, bed);
  near(apply(m, bed.w * 20, bed.h * 20), { x: 35, y: 70 });
});

test("stampCorners with no rotation gives the box corners in order", () => {
  const c = stampCorners(stampShape({ points: [{ x: 70, y: 140 }, { x: 0, y: 0 }] }));
  assert.deepEqual(c.map(p => ({ x: roundTo(p.x), y: roundTo(p.y) })), [
    { x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 140 }, { x: 0, y: 140 },
  ]);
});

test("stampCorners turned 90 degrees swaps width and height around the centre", () => {
  const c = stampCorners(stampShape({ rotation: 90, points: [{ x: 0, y: 0 }, { x: 70, y: 140 }] }));
  const xs = c.map(p => roundTo(p.x)), ys = c.map(p => roundTo(p.y));
  assert.equal(Math.max(...xs) - Math.min(...xs), 140);
  assert.equal(Math.max(...ys) - Math.min(...ys), 70);
  near({ x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 }, { x: 35, y: 70 });
});

test("rotateStamp wraps the rotation into 0..359", () => {
  assert.equal(rotateStamp(stampShape({ rotation: 0 }), -90, null).rotation, 270);
  assert.equal(rotateStamp(stampShape({ rotation: 270 }), 90, null).rotation, 0);
  assert.equal(rotateStamp(stampShape({ rotation: 350 }), 20, null).rotation, 10);
  assert.equal(rotateStamp(stampShape({ rotation: 0 }), 720, null).rotation, 0);
});

test("rotateStamp turning a 1x2 box a quarter turn keeps its footprint on whole squares", () => {
  const s = stampShape({ points: [{ x: 0, y: 0 }, { x: 70, y: 140 }] });
  const r = rotateStamp(s, 90, 70);
  assert.equal(r.rotation, 90);
  const c = stampCorners({ points: r.points, rotation: r.rotation });
  const minX = Math.min(...c.map(p => p.x)), minY = Math.min(...c.map(p => p.y));
  assert.equal(roundTo(minX % 70), 0, `left edge ${minX} on a square line`);
  assert.equal(roundTo(minY % 70), 0, `top edge ${minY} on a square line`);
  const maxX = Math.max(...c.map(p => p.x)), maxY = Math.max(...c.map(p => p.y));
  assert.equal(roundTo(maxX - minX), 140);
  assert.equal(roundTo(maxY - minY), 70);
});

test("rotateStamp with no grid size leaves the points unchanged", () => {
  const s = stampShape({ points: [{ x: 3.5, y: 9 }, { x: 73.5, y: 149 }] });
  const r = rotateStamp(s, 90, null);
  assert.equal(r.rotation, 90);
  assert.deepEqual(r.points, s.points);
});

test("shapeOps for a stamp returns one op per part, each with a matrix", () => {
  const bed = stampById("bed");
  const ops = shapeOps(stampShape(), { background: "#ffffff", style: null });
  assert.equal(ops.length, bed.parts.length);
  for (const op of ops) {
    assert.ok(Array.isArray(op.matrix) && op.matrix.length === 6, "matrix has six numbers");
  }
});

test("shapeOps for an unknown stamp id returns no ops", () => {
  assert.deepEqual(shapeOps(stampShape({ stamp: "nope" }), { background: "#ffffff", style: null }), []);
  assert.deepEqual(shapeOps(stampShape({ stamp: null }), { background: "#ffffff", style: null }), []);
});

test("shapeOps takes ink strokes from drawing.style.ink when a style is set", () => {
  const style = { ink: "#123456" };
  const ops = shapeOps(stampShape({ stamp: "bed" }), { background: "#ffffff", style });
  const bed = stampById("bed");
  bed.parts.forEach((part, i) => {
    if (part.stroke === "ink") assert.equal(ops[i].stroke, "#123456");
  });
  assert.ok(bed.parts.some(p => p.stroke === "ink"), "bed has ink parts to check");
});

test("shapeOps falls back to the default ink without a style", () => {
  const bed = stampById("bed");
  const ops = shapeOps(stampShape({ stamp: "bed" }), { background: "#ffffff", style: null });
  bed.parts.forEach((part, i) => {
    if (part.stroke === "ink") assert.equal(ops[i].stroke, "#2b2b2b");
  });
});

test("shapePath for a stamp is a closed four-corner path", () => {
  const d = shapePath(stampShape({ points: [{ x: 0, y: 0 }, { x: 70, y: 140 }] }));
  assert.equal(d, "M 0 0 L 70 0 L 70 140 L 0 140 Z");
  assert.equal(d.match(/ L /g).length, 3);
  assert.ok(d.endsWith(" Z"));
});

test("wallSegments ignores stamps", () => {
  assert.deepEqual(wallSegments([stampShape()]), []);
  const rect = { ...stampShape({ type: "rect", stamp: null, closed: true, points: [{ x: 0, y: 0 }, { x: 140, y: 140 }] }) };
  assert.ok(wallSegments([rect]).length > 0, "a rect still produces walls");
  assert.deepEqual(wallSegments([stampShape(), rect]).every(w => w.shapeId === rect.id), true);
});

test("mapShapeSchema fills in stamp, rotation and flip when they are missing", () => {
  const { stamp: _stamp, rotation: _rotation, flip: _flip, ...base } = stampShape();
  assert.equal("stamp" in base, false);
  const parsed = mapShapeSchema.parse(base);
  assert.equal(parsed.stamp, null);
  assert.equal(parsed.rotation, 0);
  assert.equal(parsed.flip, false);
});
