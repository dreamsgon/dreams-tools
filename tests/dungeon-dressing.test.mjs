import test from "node:test";
import assert from "node:assert/strict";
import { buildDungeonMap, dungeonLayouts, defaultLookOptions } from "../lib/dungeon/drawing.ts";
import { defaultDressOptions, dungeonThemes, layoutTheme, themesFor } from "../lib/dungeon/dressing.ts";
import { defaultLayoutOptions } from "../lib/dungeon/layout.ts";
import { stampById } from "../lib/map-stamps.ts";
import { mapDrawingSchema } from "../lib/model.ts";
import { roomMarkers } from "../lib/map-export.ts";
import { mapLights } from "../lib/map-light.ts";

const options = (layout, extra = {}) => ({ ...defaultLayoutOptions, ...defaultLookOptions, ...defaultDressOptions, layout, theme: layoutTheme[layout], size: "m", seed: "ember-42", dressing: 0, style: dungeonLayouts.find(l => l.id === layout).style, grid: 70, numbers: true, ...extra });
const stampsOf = m => m.drawing.shapes.filter(s => s.type === "stamp");

test("every theme uses real stamps and fits its own kind of layout", () => {
  for (const t of dungeonThemes) {
    for (const p of [t.entrance, t.boss, ...Object.values(t.rooms)].filter(Boolean)) for (const id of [p.centre, ...p.wall, ...p.stamps].filter(Boolean)) assert.ok(stampById(id), `${t.id}: ${id}`);
    for (const k of Object.keys(t.mix)) assert.ok(t.rooms[k], `${t.id} mix ${k}`);
  }
  assert.deepEqual(themesFor("cave").map(t => t.id), themesFor("dungeon").map(t => t.id));
  assert.ok(themesFor("building").every(t => t.family === "building"));
});

test("every layout and theme makes a map that saves, with a room key and named markers", () => {
  for (const { id } of dungeonLayouts) for (const t of themesFor(id === "caves" ? "cave" : id === "building" ? "building" : id === "village" ? "village" : "dungeon")) {
    const m = buildDungeonMap(options(id, { theme: t.id }));
    mapDrawingSchema.parse(m.drawing);
    assert.equal(m.key.length, m.drawing.shapes.filter(s => s.type === "label").length, `${id} ${t.id}`);
    const markers = roomMarkers(m.drawing);
    assert.ok(markers.every(k => /^Room \d+: /.test(k.name) && k.notes), `${id} ${t.id} markers are named and noted`);
    assert.deepEqual(buildDungeonMap(options(id, { theme: t.id })), m);
  }
});

test("lights: off puts every lamp out, dark rooms keep theirs unlit, and kinds can be left out", () => {
  const on = buildDungeonMap(options("branching", { darkRooms: 0 }));
  const lit = mapLights(on.drawing).filter(l => l.on);
  assert.ok(lit.length > 0, "some lights");
  const off = buildDungeonMap(options("branching", { lights: false }));
  assert.equal(mapLights(off.drawing).filter(l => l.on).length, 0);
  const noTorches = buildDungeonMap(options("branching", { torches: false }));
  assert.ok(!stampsOf(noTorches).some(s => s.stamp === "wall-torch"));
  const dark = buildDungeonMap(options("branching", { darkRooms: 1 }));
  assert.ok(dark.key.some(k => k.lit === false), "some rooms are dark");
  assert.ok(dark.key.filter(k => k.lit === true).length <= 2, "only the entrance and the last room stay lit");
  // Changing the lights leaves the furniture where it was.
  const furniture = m => JSON.stringify(stampsOf(m).filter(s => !stampById(s.stamp)?.light).map(s => [s.stamp, s.points]));
  assert.equal(furniture(buildDungeonMap(options("halls", { lightDensity: .9 }))), furniture(buildDungeonMap(options("halls", { lightDensity: .1 }))));
});

test("look options: floor pattern, door kinds, secret doors, walls and grid", () => {
  const m = buildDungeonMap(options("branching", { floor: "cobbles", doors: "iron", secret: .5, walls: "thick", gridLines: false, outside: "solid" }));
  assert.ok(m.drawing.shapes.some(s => s.pattern === "cobbles"));
  const doors = m.drawing.shapes.filter(s => s.type === "door");
  assert.ok(doors.some(d => d.door === "iron") && doors.some(d => d.door === "secret"));
  assert.ok(m.key.some(k => k.secret));
  assert.equal(m.drawing.style.grid, "off");
  assert.equal(m.drawing.style.outside, "solid");
  const plain = buildDungeonMap(options("branching", { floor: "plain", secret: 0 }));
  assert.ok(!plain.drawing.shapes.some(s => s.pattern) && !plain.drawing.shapes.some(s => s.door === "secret"));
  assert.ok(buildDungeonMap(options("caves", { secret: .5 })).drawing.shapes.every(s => s.door !== "secret"), "caves have no secret doors");
  const thin = buildDungeonMap(options("halls", { walls: "thin" })), thick = buildDungeonMap(options("halls", { walls: "thick" }));
  assert.ok(thin.drawing.shapes.find(s => s.type === "merged").thickness < thick.drawing.shapes.find(s => s.type === "merged").thickness);
});

test("a room mix of nothing but one purpose fills the rooms with it", () => {
  const m = buildDungeonMap(options("branching", { theme: "crypt", mix: { tomb: 5, ossuary: 0, shrine: 0, guard: 0, vault: 0 }, rooms: 6 }));
  const middle = m.key.slice(1, -1).map(k => k.name);
  assert.ok(middle.every(n => n === "Tomb" || n === "Empty room"), middle.join());
  assert.ok(!buildDungeonMap(options("branching", { populate: false, columns: false, lights: false })).drawing.shapes.some(s => s.type === "stamp" && s.stamp !== "stairs"));
});

test("every room has the thing its name promises, even small cave chambers", () => {
  const family = { branching: "dungeon", halls: "dungeon", caves: "cave", building: "building", village: "village" };
  for (const { id } of dungeonLayouts) for (const t of themesFor(family[id])) for (const seed of ["seed-1", "seed-7", "seed-12", "seed-19"]) {
    const m = buildDungeonMap(options(id, { theme: t.id, size: "s", seed }));
    const purposes = [t.entrance, t.boss, ...Object.values(t.rooms)].filter(Boolean);
    for (const k of m.key) {
      const p = purposes.find(p => p.name === k.name), sig = p && (p.centre ?? p.stamps[0] ?? p.wall[0]);
      if (!sig) continue;
      const name = stampById(sig).name.toLowerCase();
      assert.ok(k.things.some(x => x.endsWith(name)), `${id} ${t.id} ${seed}: room ${k.number} (${k.name}) has no ${name}: ${k.things.join(", ")}`);
    }
  }
});
