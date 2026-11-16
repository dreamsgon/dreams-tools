import test from "node:test";
import assert from "node:assert/strict";
import { mapShapeSchema } from "../lib/model.ts";
import { shapeOps, patternPath, patternLimit } from "../lib/map-style.ts";
import { lightWalls } from "../lib/map-light.ts";
import { buildUvtt } from "../lib/map-export.ts";

const base = { roomParts: [], stamp: null, rotation: 0, flip: false, hidden: false, locked: false, folderId: null, smooth: false, fill: null, stroke: "#2b2b2b", thickness: 14, closed: false };
const rect = (id, x0, y0, x1, y1, extra = {}) => ({ ...base, id, name: id, type: "rect", fill: "#ffffff", closed: true, points: [{ x: x0, y: y0 }, { x: x1, y: y1 }], ...extra });
const merged = (id, extra = {}) => ({ ...base, id, name: id, type: "merged", fill: "#ffffff", closed: true,
  points: [{ x: 0, y: 0 }, { x: 280, y: 210 }, { x: 140, y: 140 }, { x: 420, y: 350 }],
  roomParts: [{ type: "rect", start: 0, count: 2, smooth: false, closed: true }, { type: "rect", start: 2, count: 2, smooth: false, closed: true }], ...extra });
const door = (id, kind) => ({ ...base, id, name: id, type: "door", thickness: 14, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], ...(kind === undefined ? {} : { door: kind }) });
const style = { preset: "stone", floor: "#e9e4d6", wall: "#222222", hatch: "#555555", ink: "#2b2b2b", walls: "solid", outside: "hatched", grid: "faint", gridSize: 70, shadow: true };
const d = { background: "#000000", style };
const patterns = ["flag", "boards", "tiles", "cobbles", "earth"];
const patternOp = ops => ops.find(o => o.stroke === style.ink && o.width === 1.5 && o.clip);

test("every pattern gives a clipped op on a rect and a merged room, and none when absent", () => {
  for (const p of patterns) for (const make of [rect, merged]) {
    const s = mapShapeSchema.parse(make === rect ? rect("r", 0, 0, 280, 210, { pattern: p }) : merged("m", { pattern: p }));
    const op = patternOp(shapeOps(s, d));
    assert.ok(op && op.d.length > 10 && op.clip, `${p} ${s.type}`);
    assert.ok(op.opacity >= .18 && op.opacity <= .25);
  }
  for (const s of [rect("r", 0, 0, 280, 210), rect("r", 0, 0, 280, 210, { pattern: null }), merged("m")]) assert.equal(patternOp(shapeOps(mapShapeSchema.parse(s), d)), undefined);
});

test("the pattern comes after the floor and before the grid", () => {
  const ops = shapeOps(mapShapeSchema.parse(rect("r", 0, 0, 280, 210, { pattern: "tiles" })), d);
  const floor = ops.findIndex(o => o.fill === "#ffffff"), pat = ops.indexOf(patternOp(ops)), grid = ops.findIndex(o => o.width === 1 && o.clip);
  assert.ok(floor < pat && pat < grid);
});

test("patterns are the same every time and differ between shapes", () => {
  for (const p of patterns) {
    const a = mapShapeSchema.parse(rect("same", 0, 0, 280, 210, { pattern: p })), b = mapShapeSchema.parse(rect("same", 0, 0, 280, 210, { pattern: p }));
    assert.equal(patternPath(a, p, 70), patternPath(b, p, 70));
  }
  const x = mapShapeSchema.parse(rect("one", 0, 0, 280, 210)), y = mapShapeSchema.parse(rect("two", 0, 0, 280, 210));
  assert.notEqual(patternPath(x, "cobbles", 70), patternPath(y, "cobbles", 70));
});

test("a big room's pattern stays small", () => {
  for (const p of patterns) {
    const s = mapShapeSchema.parse(rect("big", 0, 0, 70 * 60, 70 * 60, { pattern: p }));
    const path = patternPath(s, p, 70);
    assert.ok(path.length > 0 && path.length <= patternLimit, `${p} ${path.length}`);
    assert.ok(path.length < 40000);
  }
});

test("the schema takes the new fields and refuses others", () => {
  assert.equal(mapShapeSchema.parse(rect("r", 0, 0, 70, 70, { pattern: "flag" })).pattern, "flag");
  assert.equal(mapShapeSchema.parse(rect("r", 0, 0, 70, 70, { pattern: null })).pattern, null);
  assert.equal(mapShapeSchema.parse(rect("r", 0, 0, 70, 70)).pattern, undefined);
  assert.throws(() => mapShapeSchema.parse(rect("r", 0, 0, 70, 70, { pattern: "lava" })));
  for (const k of ["wood", "iron", "arch", "secret", null]) assert.equal(mapShapeSchema.parse(door("d", k)).door, k);
  assert.throws(() => mapShapeSchema.parse(door("d", "portcullis")));
});

test("door kinds draw differently", () => {
  const wood = shapeOps(mapShapeSchema.parse(door("d")), d), iron = shapeOps(mapShapeSchema.parse(door("d", "iron")), d);
  const arch = shapeOps(mapShapeSchema.parse(door("d", "arch")), d), secret = shapeOps(mapShapeSchema.parse(door("d", "secret")), d);
  assert.deepEqual(shapeOps(mapShapeSchema.parse(door("d", "wood")), d), wood);
  assert.equal(wood.length, 2);
  assert.ok(iron.length > wood.length && iron.some(o => o.width > 4) && iron.some(o => o.d.split("M").length > 3));
  // An arch has the gap and posts only: no leaf line or swing arc.
  assert.equal(arch.length, 2);
  assert.ok(!arch.some(o => o.d.includes(" A ")));
  assert.equal(secret.length, 2);
  assert.equal(secret[1].stroke, style.wall);
  assert.equal(secret[1].width, 14 * .55);
  assert.equal(secret[1].cap, "butt");
  assert.equal(shapeOps(mapShapeSchema.parse(door("d", "secret")), { background: "#000000", style: null })[1].stroke, "#2b2b2b");
});

test("an arch does not stop light, but other doors do", () => {
  const walls = kind => lightWalls({ shapes: [mapShapeSchema.parse(door("d", kind))], folders: [], layerOrder: [] });
  assert.equal(walls("arch").length, 0);
  for (const k of ["wood", "iron", "secret", undefined, null]) assert.equal(walls(k).length, 1, String(k));
});

test("exports: arch is an open portal, secret is no portal", () => {
  const out = shapes => buildUvtt({ background: "#000000", style: null, shapes: shapes.map(s => mapShapeSchema.parse(s)), folders: [], layerOrder: [] }, 700, 700, 70, "");
  assert.deepEqual(out([door("a", "arch")]).portals.map(p => p.closed), [false]);
  assert.equal(out([door("s", "secret")]).portals.length, 0);
  assert.deepEqual(out([door("w", "iron")]).portals.map(p => p.closed), [true]);
});
