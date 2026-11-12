import test from "node:test";
import assert from "node:assert/strict";
import { creatorTools, toolForKey, distance, toUnits, fromUnits, sizeLabel, lineLength, snapPoint, resizeShape, offsetShape } from "../lib/map-creator.ts";

// 70 px per 5 ft square: 14 px per foot.
const grid = { size: 70, units: 5, unit: "ft" };

const rect = (x, y, w, h) => ({ type: "rect", closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });

test("tool shortcuts map lower and upper case keys to the right tool", () => {
  assert.equal(toolForKey("r"), "rect");
  assert.equal(toolForKey("R"), "rect");
  assert.equal(toolForKey("w"), "line");
  assert.equal(toolForKey("W"), "line");
  assert.equal(toolForKey("a"), "curve");
  assert.equal(toolForKey("v"), "select");
  assert.equal(toolForKey("n"), "window");
});

test("unknown keys return null", () => {
  assert.equal(toolForKey("z"), null);
  assert.equal(toolForKey(""), null);
  assert.equal(toolForKey("1"), null);
});

test("every creator tool has a unique shortcut key and id", () => {
  const keys = creatorTools.map(t => t.key);
  const ids = creatorTools.map(t => t.id);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(ids).size, ids.length);
});

test("distance converts pixels to table units", () => {
  assert.equal(distance(140, grid), "10 ft");
  assert.equal(distance(35, grid), "2.5 ft");
});

test("toUnits and fromUnits round trip for multiples of 35 px", () => {
  for (let px = 0; px <= 700; px += 35) {
    assert.equal(fromUnits(toUnits(px, grid), grid), px);
  }
  assert.equal(toUnits(140, grid), 10);
  assert.equal(fromUnits(10, grid), 140);
});

test("room labels give width × height in units", () => {
  assert.equal(sizeLabel(rect(0, 0, 350, 210), grid), "25 × 15 ft");
});

test("a straight wall is labelled by its length", () => {
  const wall = { type: "line", closed: false, points: [{ x: 0, y: 0 }, { x: 0, y: 140 }] };
  assert.equal(sizeLabel(wall, grid), "10 ft");
});

test("a closed path is labelled as an area, an open path as a length", () => {
  const square = [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 140 }, { x: 0, y: 140 }];
  assert.equal(sizeLabel({ type: "path", closed: true, points: square }, grid), "10 × 10 ft");
  assert.equal(sizeLabel({ type: "path", closed: false, points: square }, grid), "30 ft");
});

test("a curved wall is longer than the straight distance between its ends", () => {
  // Ends at (0,0) and (140,0); control point pulled well off the line.
  const curve = { type: "curve", closed: false, points: [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 70, y: -70 }] };
  const straight = 140;
  assert.ok(lineLength(curve) > straight, `curve length ${lineLength(curve)} should exceed ${straight}`);
  assert.notEqual(sizeLabel(curve, grid), "10 ft");
});

test("snapPoint snaps to the step", () => {
  assert.deepEqual(snapPoint({ x: 23, y: 47 }, 10, 100, 50), { x: 20, y: 50 });
  assert.deepEqual(snapPoint({ x: 104, y: 16 }, 10, 100, 50), { x: 100, y: 20 });
});

test("snapPoint clamps to the map's width and height", () => {
  assert.deepEqual(snapPoint({ x: -30, y: 120 }, 10, 100, 50), { x: 0, y: 50 });
  assert.deepEqual(snapPoint({ x: 250, y: -80 }, 10, 100, 50), { x: 100, y: 0 });
});

test("snapPoint with no step just rounds to whole pixels", () => {
  assert.deepEqual(snapPoint({ x: 12.6, y: 3.4 }, null, 100, 50), { x: 13, y: 3 });
  assert.deepEqual(snapPoint({ x: 12.4, y: 3.6 }, null, 100, 50), { x: 12, y: 4 });
});

test("resizeShape gives the requested bounds and keeps the top-left corner", () => {
  const resized = resizeShape(rect(70, 70, 140, 70), 280, 140);
  const bounds = { x: Math.min(...resized.points.map(p => p.x)), y: Math.min(...resized.points.map(p => p.y)),
    w: Math.max(...resized.points.map(p => p.x)) - Math.min(...resized.points.map(p => p.x)),
    h: Math.max(...resized.points.map(p => p.y)) - Math.min(...resized.points.map(p => p.y)) };
  assert.deepEqual(bounds, { x: 70, y: 70, w: 280, h: 140 });
  assert.equal(resized.points[0].x, 70);
  assert.equal(resized.points[0].y, 70);
});

test("resizeShape does not change its input", () => {
  const shape = rect(70, 70, 140, 70);
  const before = structuredClone(shape);
  const resized = resizeShape(shape, 280, 140);
  assert.notEqual(resized, shape);
  assert.deepEqual(shape, before);
});

test("offsetShape moves points by the requested amount", () => {
  const shape = rect(35, 35, 70, 70);
  const moved = offsetShape(shape, 20, 20, 140, 140);
  assert.deepEqual(moved.points, rect(55, 55, 70, 70).points);
});

test("offsetShape never moves a shape past the map edges", () => {
  const shape = rect(35, 35, 70, 70);
  const right = offsetShape(shape, 500, 500, 140, 140);
  assert.deepEqual(right.points, rect(70, 70, 70, 70).points);
  const left = offsetShape(shape, -500, -500, 140, 140);
  assert.deepEqual(left.points, rect(0, 0, 70, 70).points);
});
