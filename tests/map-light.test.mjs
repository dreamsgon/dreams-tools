import test from "node:test";
import assert from "node:assert/strict";
import { visibility, lightArea, mapLights, lightWalls, shapeLight, lightKinds, lightKind } from "../lib/map-light.ts";
import { mapShapeSchema, mapDrawingSchema } from "../lib/model.ts";
import { shapeOps } from "../lib/map-style.ts";
import { wallSegments } from "../lib/map-creator.ts";
import { shapePath } from "../lib/map-drawing.ts";
import { toolForKey } from "../lib/map-creator.ts";

const base = { roomParts: [], stamp: null, rotation: 0, flip: false, hidden: false, locked: false, folderId: null, smooth: false, fill: null, stroke: "#2b2b2b", thickness: 14, closed: false };
const room = (id, x0, y0, x1, y1) => ({ ...base, id, name: id, type: "rect", fill: "#ffffff", points: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
const light = (id, x, y, l = {}) => ({ ...base, id, name: id, type: "light", thickness: 15, points: [{ x, y }, { x, y }], light: { kind: "torch", ...l } });
const stamp = (id, stampId, x, y, l) => ({ ...base, id, name: id, type: "stamp", stamp: stampId, thickness: 1, points: [{ x: x - 35, y: y - 35 }, { x: x + 35, y: y + 35 }], ...(l ? { light: l } : {}) });
const drawing = shapes => ({ background: "#000000", style: null, shapes, folders: [], layerOrder: [] });
const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };

test("the Light tool is on L, and every kind has sensible reach", () => {
  assert.equal(toolForKey("l"), "light");
  assert.equal(lightKinds.length, 8);
  for (const k of lightKinds) { assert.ok(k.dim >= k.bright && k.bright >= 0, k.id); assert.match(k.colour, /^#[0-9a-f]{6}$/i); }
  assert.equal(lightKind("nope").id, "torch");
});

test("a light shape saves, draws nothing itself and is no wall", () => {
  const s = mapShapeSchema.parse(light("l1", 100, 100, { bright: 2, dim: 5, colour: "#8fd0ff", on: false, flicker: true, walls: false }));
  assert.equal(s.type, "light");
  assert.deepEqual(shapeOps(s, { background: "#000000", style: null }), []);
  assert.deepEqual(wallSegments([s]), []);
  assert.match(shapePath(s), /^M 85 100 A 15 15/);
  assert.throws(() => mapShapeSchema.parse(light("l2", 0, 0, { colour: "orange" })));
  assert.throws(() => mapShapeSchema.parse(light("l3", 0, 0, { kind: "laser" })));
  // Old maps without lights still load.
  assert.equal(mapShapeSchema.parse(room("r", 0, 0, 70, 70)).light, undefined);
});

test("a light's settings come from its kind, then its own changes", () => {
  const plain = shapeLight(mapShapeSchema.parse(light("a", 70, 140)));
  assert.deepEqual({ ...plain }, { id: "a", x: 70, y: 140, bright: 4, dim: 8, colour: "#ffb35c", on: true, flicker: true, walls: true, stamp: null });
  const changed = shapeLight(mapShapeSchema.parse(light("b", 0, 0, { kind: "magic", bright: 6, dim: 2 })));
  assert.equal(changed.colour, "#8fd0ff");
  assert.equal(changed.flicker, false);
  assert.equal(changed.dim, 6, "dim light never reaches less far than bright");
});

test("light stamps give their light, which a shape can change or put out", () => {
  const d = drawing([room("r", 0, 0, 700, 700), stamp("t", "wall-torch", 105, 105), stamp("c", "chest", 300, 300), stamp("b", "brazier", 400, 400, { on: false, bright: 1 }), light("l", 500, 500)]);
  const lights = mapLights(mapDrawingSchema.parse(d));
  assert.deepEqual(lights.map(l => l.id), ["t", "b", "l"]);
  assert.deepEqual([lights[0].x, lights[0].y, lights[0].bright, lights[0].dim, lights[0].stamp], [105, 105, 4, 8, "wall-torch"]);
  assert.equal(lights[1].on, false);
  assert.equal(lights[1].bright, 1);
  // Hidden layers give no light.
  d.shapes[4].hidden = true;
  assert.deepEqual(mapLights(mapDrawingSchema.parse(d)).map(l => l.id), ["t", "b"]);
});

test("walls stop light, and the light stays in its room", () => {
  const r = room("r", 0, 0, 280, 280);
  const walls = lightWalls(drawing([r]));
  const poly = visibility({ x: 140, y: 140 }, 700, walls);
  assert.ok(poly.length >= 8);
  for (const p of poly) assert.ok(p.x >= -0.01 && p.x <= 280.01 && p.y >= -0.01 && p.y <= 280.01, `${p.x},${p.y} stays in the room`);
  assert.ok(inside({ x: 270, y: 270 }, poly), "the corners are lit");
  // With no walls near, it is a full circle.
  const open = visibility({ x: 0, y: 0 }, 100, []);
  for (const p of open) assert.ok(Math.abs(Math.hypot(p.x, p.y) - 100) < 1e-6);
});

test("a wall casts a shadow, and an opening or window lets light through", () => {
  // A wall from (200,0) to (200,400): a light at (100,200) can't reach (300,200).
  const wall = { ...base, id: "w", name: "w", type: "line", points: [{ x: 200, y: 0 }, { x: 200, y: 400 }] };
  const shut = visibility({ x: 100, y: 200 }, 300, lightWalls(drawing([wall])));
  assert.ok(!inside({ x: 300, y: 200 }, shut));
  assert.ok(inside({ x: 150, y: 200 }, shut));
  for (const type of ["opening", "window"]) {
    const gap = { ...base, id: "g", name: "g", type, points: [{ x: 200, y: 165 }, { x: 200, y: 235 }] };
    const through = visibility({ x: 100, y: 200 }, 300, lightWalls(drawing([wall, gap])));
    assert.ok(inside({ x: 300, y: 200 }, through), `${type} lets light through`);
    assert.ok(!inside({ x: 300, y: 20 }, through), `${type}: the rest of the wall still stops it`);
  }
  // A closed door stops light.
  const door = { ...base, id: "d", name: "d", type: "door", points: [{ x: 200, y: 165 }, { x: 200, y: 235 }] };
  assert.ok(!inside({ x: 300, y: 200 }, visibility({ x: 100, y: 200 }, 300, lightWalls(drawing([wall, door])))));
});

test("lightArea is a plain circle when nothing stops the light", () => {
  const far = lightArea({ id: "a", x: 1000, y: 1000, bright: 2, dim: 4, colour: "#ffffff", on: true, flicker: false, walls: true, stamp: null }, 70, lightWalls(drawing([room("r", 0, 0, 140, 140)])));
  assert.equal(far, null);
  const near = lightArea({ id: "a", x: 70, y: 70, bright: 2, dim: 4, colour: "#ffffff", on: true, flicker: false, walls: true, stamp: null }, 70, lightWalls(drawing([room("r", 0, 0, 140, 140)])));
  assert.match(near, /^M [\d. L-]+ Z$/);
  const ignoring = lightArea({ id: "a", x: 70, y: 70, bright: 2, dim: 4, colour: "#ffffff", on: true, flicker: false, walls: false, stamp: null }, 70, lightWalls(drawing([room("r", 0, 0, 140, 140)])));
  assert.equal(ignoring, null);
});

test("a map's ambient light saves, and old maps are in daylight", async () => {
  const { ambientShade, ambients } = await import("../lib/map-light.ts");
  assert.equal(mapDrawingSchema.parse(drawing([])).ambient, undefined);
  assert.equal(mapDrawingSchema.parse({ ...drawing([]), ambient: "dark" }).ambient, "dark");
  assert.throws(() => mapDrawingSchema.parse({ ...drawing([]), ambient: "night" }));
  assert.deepEqual(ambients.map(a => a.id), ["day", "dim", "dark"]);
  assert.equal(ambientShade(undefined, true), 0);
  assert.equal(ambientShade("day", true), 0);
  assert.ok(ambientShade("dark", true) > ambientShade("dark", false), "the GM sees the dark a little lighter");
  assert.ok(ambientShade("dark", true) > ambientShade("dim", true));
});

test("Maptable lights only lit lights, and a light piece shines from where it was moved", async () => {
  const { sceneLights } = await import("../lib/map-light.ts");
  const d = mapDrawingSchema.parse(drawing([room("r", 0, 0, 700, 700), stamp("t", "wall-torch", 105, 105), light("off", 300, 300, { on: false }), light("l", 500, 500)]));
  const lit = sceneLights(d, 70);
  assert.deepEqual(lit.map(l => l.id), ["t", "l"]);
  assert.ok(lit.every(l => typeof l.area === "string"), "the room's walls bound each light");
  const moved = sceneLights(d, 70, new Map([["t", { x: 350, y: 140 }]]));
  assert.deepEqual([moved[0].x, moved[0].y], [350, 140]);
});

test("Universal VTT export carries lit lights and the ambient light", async () => {
  const { buildUvtt } = await import("../lib/map-export.ts");
  const d = mapDrawingSchema.parse({ ...drawing([room("r", 0, 0, 700, 700), stamp("t", "wall-torch", 105, 105), light("off", 300, 300, { on: false }), light("m", 350, 420, { kind: "magic", walls: false })]), ambient: "dim" });
  const uvtt = buildUvtt(d, 700, 700, 70, "");
  assert.equal(uvtt.environment.ambient_light, "ff7f7f7f");
  assert.deepEqual(uvtt.lights, [
    { position: { x: 1.5, y: 1.5 }, range: 8, intensity: 1, color: "ffffb35c", shadows: true },
    { position: { x: 5, y: 6 }, range: 6, intensity: 1, color: "ff8fd0ff", shadows: false },
  ]);
});
