import test from "node:test";
import assert from "node:assert/strict";
import { buildDungeonMap, dungeonLayouts, traceCells, layoutKey, defaultLookOptions } from "../lib/dungeon/drawing.ts";
import { defaultDressOptions, layoutTheme } from "../lib/dungeon/dressing.ts";
import { defaultLayoutOptions } from "../lib/dungeon/layout.ts";
import { mapDrawingSchema } from "../lib/model.ts";
import { lightWalls } from "../lib/map-light.ts";

const options = (layout, extra = {}) => ({ ...defaultLayoutOptions, ...defaultLookOptions, ...defaultDressOptions, theme: layoutTheme[layout], layout, size: "m", seed: "ember-42", dressing: 0, style: dungeonLayouts.find(l => l.id === layout).style, grid: 70, numbers: true, ...extra });

test("every layout makes a drawing that saves, stays on the map and is the same each time", () => {
  for (const { id } of dungeonLayouts) for (const seed of ["ember-42", "raven-17", "salt-90"]) for (const size of ["s", "m", "l"]) {
    const o = options(id, { seed, size }), map = buildDungeonMap(o);
    const parsed = mapDrawingSchema.parse(map.drawing);
    assert.equal(parsed.shapes.length, map.drawing.shapes.length, `${id} ${seed}`);
    assert.deepEqual(map.drawing.layerOrder, map.drawing.shapes.map(s => s.id));
    assert.equal(new Set(map.drawing.layerOrder).size, map.drawing.shapes.length, "ids are unique");
    for (const s of map.drawing.shapes) for (const p of s.points) assert.ok(p.x >= -1 && p.y >= -1 && p.x <= map.width + 1 && p.y <= map.height + 1, `${id} ${seed} ${size}: ${s.name} at ${p.x},${p.y}`);
    assert.deepEqual(buildDungeonMap(o), map, "the same seed makes the same map");
    assert.ok(map.drawing.shapes.some(s => s.type === "label"), `${id} numbers its rooms`);
  }
});

test("Reroll dressing keeps the rooms and changes what is in them", () => {
  for (const { id } of dungeonLayouts) {
    const a = buildDungeonMap(options(id)), b = buildDungeonMap(options(id, { dressing: 3 }));
    const rooms = m => m.drawing.shapes.filter(s => s.type !== "stamp").map(s => JSON.stringify([s.type, s.points]));
    assert.deepEqual(rooms(b), rooms(a), `${id}: the same rooms, doors and numbers`);
  }
  const stamps = m => JSON.stringify(m.drawing.shapes.filter(s => s.type === "stamp").map(s => [s.stamp, s.points]));
  assert.notEqual(stamps(buildDungeonMap(options("branching", { dressing: 1 }))), stamps(buildDungeonMap(options("branching", { dressing: 2 }))));
});

test("only the settings a layout uses change its rooms", () => {
  assert.equal(layoutKey(options("village", { symmetry: "lr" })), layoutKey(options("village")));
  assert.notEqual(layoutKey(options("branching", { symmetry: "lr" })), layoutKey(options("branching")));
  assert.equal(layoutKey(options("branching", { style: "ink", dressing: 4 })), layoutKey(options("branching")));
});

test("numbers can be left off, and roads, fields and pools let light through", () => {
  assert.ok(!buildDungeonMap(options("halls", { numbers: false })).drawing.shapes.some(s => s.type === "label"));
  const village = buildDungeonMap(options("village", { fields: true }));
  const open = village.drawing.shapes.filter(s => ["Road", "Ring road", "Field", "Square"].includes(s.name));
  assert.ok(open.length >= 2 && open.every(s => s.seeThrough), "roads and fields are see-through");
  const walls = new Set(lightWalls(village.drawing).map(w => w.shapeId));
  assert.ok(open.every(s => !walls.has(s.id)), "they stop no light");
  assert.ok(village.drawing.shapes.some(s => s.name.startsWith("House")) && [...walls].length > 0, "houses still do");
});

test("traceCells finds outlines and holes", () => {
  // A 5×5 block with the middle cell missing: one outline, one hole.
  const loops = traceCells((x, y) => x >= 1 && x <= 5 && y >= 1 && y <= 5 && !(x === 3 && y === 3), 8, 8);
  assert.equal(loops.filter(l => l.area > 0).length, 1);
  assert.equal(loops.filter(l => l.area < 0).length, 1);
  assert.equal(loops.find(l => l.area > 0).area, 25);
  assert.equal(loops.find(l => l.area < 0).area, -1);
  // Two cells touching only at a corner stay two outlines.
  assert.equal(traceCells((x, y) => (x === 0 && y === 0) || (x === 1 && y === 1), 3, 3).length, 2);
});
