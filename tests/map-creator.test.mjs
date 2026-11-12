import test from "node:test";
import assert from "node:assert/strict";
import { creatorTools, toolForKey, distance, toUnits, fromUnits, sizeLabel, lineLength, snapPoint, resizeShape, offsetShape,
  rectCorners, roomsTouch, touchingRooms, wallSegments, nearestWall, openingOnWall } from "../lib/map-creator.ts";
import { mergeRooms } from "../lib/map-drawing.ts";

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

// Full shapes, as the drawing stores them.
const room = (id, a, b, extra = {}) => ({ id, type: "rect", closed: true, fill: "#ddd", stroke: "#000", thickness: 4,
  points: [a, b], roomParts: [], hidden: false, locked: false, name: id, folderId: null, smooth: false, ...extra });
const opening = (id, type, a, b) => ({ ...room(id, a, b), type, closed: false, fill: null });

test("rectCorners gives the four corners clockwise from the first point", () => {
  assert.deepEqual(rectCorners(room("r", { x: 10, y: 20 }, { x: 50, y: 60 })), [
    { x: 10, y: 20 }, { x: 50, y: 20 }, { x: 50, y: 60 }, { x: 10, y: 60 },
  ]);
});

test("roomsTouch is true for overlapping rooms", () => {
  assert.equal(roomsTouch(room("a", { x: 0, y: 0 }, { x: 100, y: 100 }), room("b", { x: 50, y: 50 }, { x: 150, y: 150 })), true);
});

test("roomsTouch is true for rooms sharing a whole wall, or part of one", () => {
  const a = room("a", { x: 0, y: 0 }, { x: 100, y: 100 });
  assert.equal(roomsTouch(a, room("b", { x: 100, y: 0 }, { x: 200, y: 100 })), true);
  assert.equal(roomsTouch(a, room("c", { x: 100, y: 50 }, { x: 200, y: 200 })), true);
});

test("roomsTouch is false for rooms that only meet at a corner, or 40 px apart", () => {
  const a = room("a", { x: 0, y: 0 }, { x: 100, y: 100 });
  assert.equal(roomsTouch(a, room("b", { x: 100, y: 100 }, { x: 200, y: 200 })), false);
  assert.equal(roomsTouch(a, room("c", { x: 140, y: 0 }, { x: 240, y: 100 })), false);
});

test("roomsTouch is true when one room is inside another", () => {
  assert.equal(roomsTouch(room("a", { x: 0, y: 0 }, { x: 300, y: 300 }), room("b", { x: 100, y: 100 }, { x: 150, y: 150 })), true);
});

test("touchingRooms returns only other filled rooms that touch the shape", () => {
  const a = room("a", { x: 0, y: 0 }, { x: 100, y: 100 });
  const others = [
    a,                                                            // the shape itself
    room("b", { x: 50, y: 50 }, { x: 150, y: 150 }),              // touching, filled
    room("unfilled", { x: 50, y: 50 }, { x: 150, y: 150 }, { fill: null }),
    room("far", { x: 140, y: 0 }, { x: 240, y: 100 }),           // 40 px away
  ];
  assert.deepEqual(touchingRooms(a, others).map(s => s.id), ["b"]);
});

test("wallSegments gives four segments for a rectangle", () => {
  assert.equal(wallSegments([room("a", { x: 0, y: 0 }, { x: 100, y: 100 })]).length, 4);
});

test("wallSegments skips doors and windows", () => {
  const walls = wallSegments([
    room("a", { x: 0, y: 0 }, { x: 100, y: 100 }),
    opening("d", "door", { x: 0, y: 0 }, { x: 10, y: 0 }),
    opening("w", "window", { x: 0, y: 50 }, { x: 10, y: 50 }),
  ]);
  assert.equal(walls.length, 4);
  assert.ok(walls.every(w => w.shapeId === "a"));
});

test("wallSegments leaves out walls hidden inside a joined room", () => {
  const merged = mergeRooms([
    room("r1", { x: 140, y: 140 }, { x: 560, y: 490 }),
    room("r2", { x: 560, y: 280 }, { x: 980, y: 700 }),
  ], "m");
  assert.ok(merged);
  const walls = wallSegments([merged]);
  assert.ok(walls.length > 0);
  for (const w of walls) {
    if (w.a.x === 560 && w.b.x === 560) {
      const lo = Math.min(w.a.y, w.b.y), hi = Math.max(w.a.y, w.b.y);
      assert.ok(hi <= 280 || lo >= 490, `wall at x=560 from y=${lo} to ${hi} is inside the joined room`);
    }
  }
});

test("a merged room's walls are drawn twice as thick", () => {
  const merged = mergeRooms([
    room("r1", { x: 140, y: 140 }, { x: 560, y: 490 }, { thickness: 4 }),
    room("r2", { x: 560, y: 280 }, { x: 980, y: 700 }, { thickness: 4 }),
  ], "m");
  assert.ok(wallSegments([merged]).every(w => w.thickness === 8));
  assert.ok(wallSegments([room("a", { x: 0, y: 0 }, { x: 100, y: 100 }, { thickness: 4 })]).every(w => w.thickness === 4));
});

test("nearestWall returns null when no wall is within range", () => {
  const walls = wallSegments([room("a", { x: 0, y: 0 }, { x: 100, y: 100 })]);
  assert.equal(nearestWall(walls, { x: 50, y: -20 }, 5), null);
});

test("nearestWall returns the closest wall within range", () => {
  const walls = wallSegments([room("a", { x: 0, y: 0 }, { x: 100, y: 100 })]);
  const top = nearestWall(walls, { x: 50, y: -3 }, 5);
  assert.deepEqual([top.a, top.b], [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  const right = nearestWall(walls, { x: 97, y: 50 }, 10);
  assert.deepEqual([right.a, right.b], [{ x: 100, y: 0 }, { x: 100, y: 100 }]);
});

test("a click makes an opening one width wide, centred on the click", () => {
  const wall = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
  assert.deepEqual(openingOnWall(wall, { x: 50, y: 3 }, { x: 50, y: 3 }, 20), [{ x: 40, y: 0 }, { x: 60, y: 0 }]);
});

test("near a wall's end the opening is pushed inside the wall", () => {
  const wall = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
  assert.deepEqual(openingOnWall(wall, { x: 2, y: 3 }, { x: 2, y: 3 }, 20), [{ x: 0, y: 0 }, { x: 20, y: 0 }]);
  assert.deepEqual(openingOnWall(wall, { x: 99, y: 3 }, { x: 99, y: 3 }, 20), [{ x: 80, y: 0 }, { x: 100, y: 0 }]);
});

test("a drag gives the dragged span along the wall", () => {
  const wall = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
  assert.deepEqual(openingOnWall(wall, { x: 30, y: 0 }, { x: 70, y: 0 }, 20), [{ x: 30, y: 0 }, { x: 70, y: 0 }]);
  assert.deepEqual(openingOnWall(wall, { x: 70, y: 0 }, { x: 30, y: 0 }, 20), [{ x: 30, y: 0 }, { x: 70, y: 0 }]);
});
