import test from "node:test";
import assert from "node:assert/strict";
import { mapStylePresets, applyMapStyle, unstyledColours, backgroundOps, shapeOps, roughPath } from "../lib/map-style.ts";
import { mapStyleSchema, mapDrawingSchema } from "../lib/model.ts";

const room = (id, extra = {}) => ({
  id, name: "", folderId: null, smooth: false, hidden: false, locked: false, type: "rect", roomParts: [],
  points: [{ x: 0, y: 0 }, { x: 140, y: 140 }], fill: "#cec7a9", stroke: "#414b3c", thickness: 8, closed: true, ...extra,
});
const drawing = (shapes, extra = {}) => ({ background: "#ffffff", style: null, shapes, folders: [], layerOrder: [], ...extra });
const solidStyle = { preset: "custom", floor: "#f0f0f0", wall: "#222222", hatch: "#777777", ink: "#222222", walls: "solid", outside: "solid", grid: "off", gridSize: 70, shadow: false };

test("every map style preset has five presets with the expected ids", () => {
  assert.deepEqual(mapStylePresets.map(p => p.id), ["stone", "parchment", "cave", "ink", "timber"]);
});

test("each map style preset passes mapStyleSchema", () => {
  for (const p of mapStylePresets) {
    assert.doesNotThrow(() => mapStyleSchema.parse(p.style), `preset ${p.id}`);
    assert.equal(mapStyleSchema.parse(p.style).preset, p.id);
  }
});

test("applyMapStyle moves rooms and walls in the unstyled colours to the new floor and wall", () => {
  const d = drawing([room("a")]);
  applyMapStyle(d, { ...solidStyle }, null);
  assert.equal(d.shapes[0].fill, "#f0f0f0");
  assert.equal(d.shapes[0].stroke, "#222222");
});

test("applyMapStyle matches the old colours case-insensitively", () => {
  const d = drawing([room("a", { fill: "#CEC7A9", stroke: "#414B3C" })]);
  applyMapStyle(d, { ...solidStyle }, null);
  assert.equal(d.shapes[0].fill, "#f0f0f0");
  assert.equal(d.shapes[0].stroke, "#222222");
});

test("applyMapStyle keeps a room with its own fill such as water", () => {
  const d = drawing([room("water", { fill: "#3366aa" })]);
  applyMapStyle(d, { ...solidStyle }, null);
  assert.equal(d.shapes[0].fill, "#3366aa");
});

test("applyMapStyle changes the background when given and keeps it when null", () => {
  const changed = drawing([room("a")]);
  applyMapStyle(changed, { ...solidStyle }, "#123456");
  assert.equal(changed.background, "#123456");

  const kept = drawing([room("a")], { background: "#abcdef" });
  applyMapStyle(kept, { ...solidStyle }, null);
  assert.equal(kept.background, "#abcdef");
});

test("applyMapStyle sets drawing.style to the new style", () => {
  const d = drawing([room("a")]);
  applyMapStyle(d, { ...solidStyle }, null);
  assert.deepEqual(d.style, solidStyle);
});

test("applyMapStyle uses the old style's colours on a second change", () => {
  const d = drawing([room("a")]);
  applyMapStyle(d, { ...solidStyle }, null);
  applyMapStyle(d, { ...solidStyle, floor: "#fafafa", wall: "#010101" }, null);
  assert.equal(d.shapes[0].fill, "#fafafa");
  assert.equal(d.shapes[0].stroke, "#010101");
});

test("unstyledColours are the Map Creator defaults", () => {
  assert.deepEqual(unstyledColours, { floor: "#cec7a9", wall: "#414b3c" });
});

test("mapDrawingSchema parses an old drawing without style and gives style null", () => {
  const parsed = mapDrawingSchema.parse({ background: "#ffffff", shapes: [room("a")] });
  assert.equal(parsed.style, null);
});

test("backgroundOps with no style gives one fill op of the background", () => {
  const ops = backgroundOps({ background: "#abcdef", style: null }, 300, 200);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].fill, "#abcdef");
  assert.equal(ops[0].stroke, undefined);
});

test("backgroundOps for hatched outside gives a fill plus a stroke in the hatch colour", () => {
  const ops = backgroundOps({ background: "#abcdef", style: { ...solidStyle, outside: "hatched" } }, 300, 200);
  assert.equal(ops.length, 2);
  assert.equal(ops[0].fill, "#abcdef");
  assert.equal(ops[1].stroke, "#777777");
});

test("backgroundOps for clear outside gives no ops", () => {
  assert.deepEqual(backgroundOps({ background: "#abcdef", style: { ...solidStyle, outside: "clear" } }, 300, 200), []);
});

test("shapeOps for an unstyled rect room gives a fill op then a stroke op", () => {
  const ops = shapeOps(room("plain"), { background: "#ffffff", style: null });
  assert.equal(ops.length, 2);
  assert.equal(ops[0].fill, "#cec7a9");
  assert.equal(ops[1].stroke, "#414b3c");
});

test("shapeOps with grid on gives a clipped grid op at opacity .35", () => {
  const ops = shapeOps(room("grid"), { background: "#ffffff", style: { ...solidStyle, grid: "on" } });
  const grid = ops.find(op => op.opacity === 0.35);
  assert.ok(grid, "expected a grid op with opacity .35");
  assert.ok(grid.clip, "grid op should be clipped to the room");
  assert.equal(grid.stroke, "#222222");
});

test("shapeOps with shadow true adds clipped ops", () => {
  const withShadow = shapeOps(room("shadow"), { background: "#ffffff", style: { ...solidStyle, shadow: true } });
  const withoutShadow = shapeOps(room("noshadow"), { background: "#ffffff", style: { ...solidStyle, shadow: false } });
  const clipped = ops => ops.filter(op => op.clip);
  assert.ok(clipped(withShadow).length > 0, "shadow should add clipped ops");
  assert.equal(clipped(withoutShadow).length, 0);
});

test("shapeOps with double walls adds a second stroke in the background colour", () => {
  const ops = shapeOps(room("double"), { background: "#ffffff", style: { ...solidStyle, walls: "double" } });
  const wallStrokes = ops.filter(op => op.stroke && !op.clip);
  assert.equal(wallStrokes.length, 2);
  assert.equal(wallStrokes[0].stroke, "#414b3c");
  assert.equal(wallStrokes[1].stroke, "#ffffff");
});

test("shapeOps with rough walls strokes a different path from solid walls", () => {
  const solid = shapeOps(room("solidwall"), { background: "#ffffff", style: { ...solidStyle, walls: "solid" } });
  const rough = shapeOps(room("roughwall"), { background: "#ffffff", style: { ...solidStyle, walls: "rough" } });
  const solidStroke = solid.find(op => op.stroke === "#414b3c" || op.stroke === "#222222");
  const roughStroke = rough.find(op => op.stroke === "#414b3c" || op.stroke === "#222222");
  assert.ok(solidStroke && roughStroke);
  assert.notEqual(roughStroke.d, solidStroke.d);
});

test("roughPath is the same every time it is drawn with the same arguments", () => {
  const pts = [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 140 }, { x: 0, y: 140 }];
  const first = roughPath(pts, true, 3, "room-1:0");
  const second = roughPath(pts, true, 3, "room-1:0");
  assert.ok(first.length > 0);
  assert.equal(second, first);
});

test("roughPath on a closed square produces a non-empty path that closes", () => {
  const pts = [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 140 }, { x: 0, y: 140 }];
  const path = roughPath(pts, true, 3, "room-1:0");
  assert.ok(path.startsWith("M "));
  assert.ok(path.endsWith(" Z"));
});

test("shapeOps for a door gives two ops: a gap stroke and an opening", () => {
  const door = room("door", { type: "door", fill: null, stroke: "#222222", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }], thickness: 8, closed: false });
  const ops = shapeOps(door, { background: "#ffffff", style: null });
  assert.equal(ops.length, 2);
  assert.equal(ops[0].stroke, "#ffffff");
  assert.equal(ops[0].width, 9);
  assert.equal(ops[1].stroke, "#222222");
  assert.equal(ops[1].width, 2);
});

test("roughPath on an open two-point line starts at the first point and ends at the last", () => {
  const a = { x: 10, y: 20 }, b = { x: 110, y: 20 };
  const path = roughPath([a, b], false, 3, "line-1:0");
  assert.ok(path.startsWith("M 10 20 "), `starts at first point: ${path}`);
  assert.ok(path.endsWith("L 110 20"), `ends at last point: ${path}`);
  assert.ok(!path.endsWith(" Z"));
});
