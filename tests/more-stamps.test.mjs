import test from "node:test";
import assert from "node:assert/strict";
import { stamps, stampById, stampCategories, findStamps, tintColour, stampTints } from "../lib/map-stamps.ts";
import { moreStamps } from "../lib/more-stamps.ts";
import { shapeOps } from "../lib/map-style.ts";
import { mapShapeSchema } from "../lib/model.ts";
import { stampPieces } from "../lib/map-export.ts";

test("more stamps join the library in known groups, with unique ids and parts that draw", () => {
  assert.ok(moreStamps.length >= 60);
  assert.equal(new Set(stamps.map(s => s.id)).size, stamps.length, "every stamp id is unique");
  for (const g of ["Lights", "Town"]) assert.ok(stampCategories.includes(g), g);
  for (const s of moreStamps) {
    assert.ok(stampCategories.includes(s.category), `${s.id}: ${s.category}`);
    assert.ok(s.w >= 1 && s.h >= 1 && s.w <= 3 && s.h <= 3, `${s.id} size`);
    assert.ok(s.parts.length > 0, `${s.id} parts`);
    for (const p of s.parts) { assert.doesNotMatch(p.d, /NaN|undefined|Infinity/, s.id); assert.ok(p.fill || p.stroke, `${s.id}: every part is drawn`); }
    assert.equal(stampById(s.id), s);
  }
});

test("every Lights stamp gives light, and only Lights stamps do", () => {
  for (const s of stamps) {
    if (s.category === "Lights") {
      assert.ok(s.light, `${s.id} gives light`);
      assert.ok(s.light.bright >= 0 && s.light.dim >= s.light.bright && s.light.dim <= 24, `${s.id} reach`);
      assert.match(s.light.colour, /^#[0-9a-f]{6}$/i);
    } else assert.equal(s.light, undefined, s.id);
  }
  assert.deepEqual(stampById("wall-torch").light, { bright: 4, dim: 8, colour: "#ffb35c" });
});

test("new stamps can be found by name or group", () => {
  assert.ok(findStamps("sarcoph").some(s => s.id === "sarcophagus"));
  assert.equal(findStamps("lights").length, 8);
  assert.ok(findStamps("town").length >= 10);
});

test("a tint recolours paint but keeps ink, lightness order and see-through colours", () => {
  assert.equal(tintColour("#9a6a35", null), "#9a6a35");
  assert.equal(tintColour("#9a6a35", "nope"), "#9a6a35");
  assert.equal(tintColour("not a colour", "gold"), "not a colour");
  const light = tintColour("#e8e2d0", "iron"), dark = tintColour("#3b3b40", "iron");
  const lum = h => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  assert.ok(lum(light) > lum(dark), "light stays lighter than dark");
  assert.match(tintColour("#9a6a35", "stone"), /^#[0-9a-f]{6}$/);
  assert.match(tintColour("rgba(255,210,122,0.4)", "frost"), /^#[0-9a-f]{8}$/, "alpha kept");
  for (const t of stampTints) assert.notEqual(tintColour("#b07a42", t.id), "#b07a42", t.id);
});

const shape = (extra = {}) => mapShapeSchema.parse({ id: "s1", type: "stamp", stamp: "chest", points: [{ x: 0, y: 0 }, { x: 70, y: 70 }], fill: null, stroke: "#2b2b2b", thickness: 1, closed: false, ...extra });
const drawing = { background: "#333333", style: { preset: "stone", floor: "#e9e4d6", wall: "#2b2b2b", hatch: "#55595d", ink: "#2b2b2b", walls: "solid", outside: "solid", grid: "off", gridSize: 70, shadow: false } };

test("a tinted stamp is saved, drawn in its tint and keeps its ink outline", () => {
  assert.equal(shape().tint, undefined, "old stamps have no tint");
  assert.throws(() => shape({ tint: "plaid" }));
  const plain = shapeOps(shape(), drawing), tinted = shapeOps(shape({ tint: "gold" }), drawing);
  assert.equal(tinted.length, plain.length);
  assert.notEqual(tinted[0].fill, plain[0].fill, "paint changes");
  assert.equal(tinted[0].stroke, "#2b2b2b", "ink stays the map's ink");
});

test("tinted stamps get their own piece picture", () => {
  const d = { ...drawing, shapes: [shape(), shape({ id: "s2", tint: "iron" })], folders: [], layerOrder: ["s1", "s2"] };
  const [a, b] = stampPieces(d, 70);
  assert.notEqual(a.look, b.look);
  assert.ok(!a.look.includes("|undefined"));
});
