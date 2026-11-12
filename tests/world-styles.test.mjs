import test from "node:test";
import assert from "node:assert/strict";
import { encodePaint, mapSchema, newMap, playerMap } from "../lib/encyclopedia/map-model.ts";
import { legendItems, mapLookOf, mapLooks, nameFonts } from "../lib/encyclopedia/map-looks.ts";

test("maps without a style keep the painted look", () => {
  const s = mapLookOf(newMap("world"));
  assert.equal(s.look, mapLooks.painted);
  assert.equal(s.font, nameFonts.serif.family);
  assert.equal(s.size, 1);
  const atlas = mapLookOf({ mapStyle: { look: "atlas", font: "hand", nameSize: "large" } });
  assert.equal(atlas.look.name, "Old atlas");
  assert.match(atlas.font, /cursive/);
  assert.equal(atlas.size, 1.25);
});

test("every look colours every terrain layer it changes, and the ink look has no colour", () => {
  for (const id of ["atlas", "ink"]) for (const layer of ["shallows", "land", "desert", "marsh", "forest", "hills", "mountains", "snow"]) assert.match(mapLooks[id].layers[layer], /^#[0-9a-f]{6}$/);
  const ink = mapLooks.ink;
  for (const c of [ink.sea, ...Object.values(ink.layers), ink.glyph.tree, ink.glyph.mountain]) assert.equal(c, "#ffffff");
});

test("styles are saved on the map; bad ones are refused; players get them", () => {
  const m = { ...newMap("world"), mapStyle: { look: "ink", font: "plain", nameSize: "small", legend: true, title: "The Lantern Coast" } };
  assert.ok(mapSchema.safeParse(m).success);
  assert.equal(mapSchema.safeParse({ ...m, mapStyle: { look: "neon" } }).success, false);
  assert.equal(mapSchema.safeParse({ ...m, mapStyle: { title: "x".repeat(101) } }).success, false);
  assert.deepEqual(playerMap({ ...m, visibility: "players" }).mapStyle, m.mapStyle);
});

test("the legend lists only what the map uses", () => {
  const cells = new Uint8Array(12 * 12).fill(1);
  cells.fill(2, 0, 20); cells.fill(4, 20, 30);
  const m = { ...newMap("world", "blank", "x", 12, 12), pins: [{ id: "a", title: "A", x: 0.5, y: 0.5, notes: "", entryId: null, visibility: "gm", kind: "castle" }], paths: [{ id: "r", kind: "river", name: "", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], visibility: "gm" }] };
  const items = legendItems(m, { columns: 12, rows: 12, cells: encodePaint(cells) });
  assert.deepEqual(items.map(i => i.name), ["Grassland", "Forest", "Mountains", "Castle", "River"]);
  assert.equal(legendItems({ ...m, mapStyle: { look: "ink" } }, { columns: 12, rows: 12, cells: encodePaint(cells) })[1].color, "#ffffff");
});
