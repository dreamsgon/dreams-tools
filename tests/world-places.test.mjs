import test from "node:test";
import assert from "node:assert/strict";
import { decodePaint, mapSchema, newMap, playerMap, revealedRuns } from "../lib/encyclopedia/map-model.ts";
import { smoothLine, thinLine } from "../lib/encyclopedia/terrain-art.ts";
import { defaultWorldOptions, generateWorld, isGeneratedPlace, riverName, seeded } from "../lib/encyclopedia/world-generator.ts";

const base = () => ({ ...newMap("world", "island", "places", 12, 12), pins: [] });
const river = (patch = {}) => ({ id: "r1", kind: "river", name: "The Silverrun", points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }], visibility: "players", ...patch });
const label = (patch = {}) => ({ id: "l1", text: "The Glass Sea", x: 0.5, y: 0.5, size: "large", visibility: "players", ...patch });

test("maps hold rivers, roads, borders, names and kinds of place", () => {
  const m = { ...base(), paths: [river(), river({ id: "r2", kind: "road", name: "" }), river({ id: "r3", kind: "border" })], labels: [label()] };
  m.pins = [{ id: "p1", title: "Vell", x: 0.5, y: 0.5, notes: "", entryId: null, visibility: "gm", kind: "castle", areaMapId: "area-1" }];
  assert.ok(mapSchema.safeParse(m).success);
  assert.ok(mapSchema.safeParse(base()).success, "maps without them still load");
});

test("bad paths, labels and kinds are refused", () => {
  const bad = patch => !mapSchema.safeParse({ ...base(), ...patch }).success;
  assert.ok(bad({ paths: [river({ points: [{ x: 0.1, y: 0.1 }] })] }), "a line needs two points");
  assert.ok(bad({ paths: [river({ kind: "canal" })] }));
  assert.ok(bad({ paths: [river({ points: [{ x: 1.2, y: 0 }, { x: 0, y: 0 }] })] }), "points stay on the map");
  assert.ok(bad({ labels: [label({ text: "  " })] }));
  assert.ok(bad({ labels: [label({ size: "huge" })] }));
  assert.ok(bad({ paths: [river()], labels: [label({ id: "r1" })] }), "ids are unique across paths and labels");
  assert.ok(bad({ pins: [{ id: "p1", title: "A", x: 0, y: 0, notes: "", entryId: null, visibility: "gm", kind: "spaceport" }] }));
});

test("players get only shared paths and names", () => {
  const m = { ...base(), visibility: "players", paths: [river(), river({ id: "r2", visibility: "gm" })], labels: [label(), label({ id: "l2", visibility: "gm" })] };
  const seen = playerMap(m);
  assert.deepEqual(seen.paths.map(p => p.id), ["r1"]);
  assert.deepEqual(seen.labels.map(l => l.id), ["l1"]);
});

test("under fog, players get only the parts of a line they have explored", () => {
  // Reveal the top-left and bottom-right corners of a 12 × 12 map, but not the middle.
  const revealed = [0, 1, 12, 13, 130, 131, 142, 143];
  const m = { ...base(), visibility: "players", fog: { enabled: true, revealed }, paths: [river({ points: [{ x: 0.02, y: 0.02 }, { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }, { x: 0.98, y: 0.98 }] })], labels: [label(), label({ id: "l2", x: 0.05, y: 0.05 })] };
  const seen = playerMap(m);
  assert.equal(seen.paths.length, 2, "the hidden middle splits the river in two");
  for (const p of seen.paths) for (const pt of p.points) assert.ok(pt.x < 0.17 || pt.x > 0.83, "no hidden points are sent");
  assert.equal(new Set(seen.paths.map(p => p.id)).size, 2);
  assert.ok(mapSchema.safeParse(seen).success);
  assert.deepEqual(seen.labels.map(l => l.id), ["l2"], "a name in unexplored land stays hidden");
  assert.deepEqual(revealedRuns({ ...m, fog: undefined }, m.paths[0].points), [m.paths[0].points]);
});

test("curves go through the first and last points", () => {
  const d = smoothLine([{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }], 100, 50);
  assert.match(d, /^M0 0Q50 50 75 25L100 0$/);
  assert.equal(smoothLine([{ x: 0, y: 0 }, { x: 1, y: 1 }], 10, 10), "M0 0L10 10");
});

test("freehand lines are thinned but keep their ends", () => {
  const pts = Array.from({ length: 101 }, (_, i) => ({ x: i / 100, y: 0.5 }));
  const thin = thinLine(pts, 0.05);
  assert.ok(thin.length <= 22 && thin.length >= 19, `${thin.length}`);
  assert.deepEqual(thin[0], pts[0]); assert.deepEqual(thin.at(-1), pts.at(-1));
  assert.ok(thinLine(Array.from({ length: 2000 }, (_, i) => ({ x: i / 2000, y: (i % 2) / 2 })), 0).length <= 400);
});

test("river names are made up", () => {
  const r = seeded("rivers");
  for (let i = 0; i < 10; i++) assert.match(riverName(r), /^The [A-Z][a-z]+$/);
});

test("generated rivers run downhill into the sea; roads join towns", () => {
  const map = { ...newMap("world", "blank", "x", 24, 18), pins: [] };
  const world = generateWorld({ ...defaultWorldOptions(24, 18, "ember-42"), kind: "coast", places: true }, map);
  const rivers = world.paths.filter(p => p.kind === "river"), roads = world.paths.filter(p => p.kind === "road");
  assert.ok(rivers.length >= 2, `${rivers.length} rivers`);
  const cells = decodePaint(world.paint.columns, world.paint.rows, world.paint.cells);
  const at = p => cells[Math.min(world.paint.rows - 1, Math.floor(p.y * world.paint.rows)) * world.paint.columns + Math.min(world.paint.columns - 1, Math.floor(p.x * world.paint.columns))];
  for (const r of rivers) assert.ok([4, 7].includes(at(r.points[0])), `${r.name} starts in the mountains`);
  assert.ok(rivers.some(r => at(r.points.at(-1)) === 0), "at least one river reaches the sea");
  assert.ok(roads.length >= 2);
  for (const road of roads) {
    const ends = [road.points[0], road.points.at(-1)];
    for (const e of ends) assert.ok(world.pins.some(p => p.x === e.x && p.y === e.y), "roads end at towns");
  }
  assert.ok(world.pins.some(p => p.kind === "city") && world.pins.some(p => p.kind === "village"));
  assert.ok(mapSchema.safeParse({ ...map, ...world }).success);
});

test("a new world replaces what the last one generated but keeps your own work", () => {
  const map = { ...newMap("world", "blank", "x", 24, 18), pins: [] };
  const first = { ...map, ...generateWorld({ ...defaultWorldOptions(24, 18, "first"), places: true }, map) };
  const mine = { id: "mine", kind: "border", name: "My border", points: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }], visibility: "gm" };
  const kept = { ...first.pins[0], notes: "The duke lives here" };
  const edited = { ...first, paths: [...first.paths, mine], pins: [kept, ...first.pins.slice(1)] };
  assert.equal(isGeneratedPlace(kept, edited), false);
  assert.equal(isGeneratedPlace(first.pins[1], edited), true);
  const second = generateWorld({ ...defaultWorldOptions(24, 18, "second"), places: true }, edited);
  assert.ok(second.paths.some(p => p.id === "mine"));
  for (const p of first.paths) assert.ok(!second.paths.some(q => q.id === p.id), `${p.id} from the first world is gone`);
  assert.ok(second.pins.some(p => p.id === kept.id && p.notes === kept.notes));
  for (const p of first.pins.slice(1)) assert.ok(!second.pins.some(q => q.id === p.id), `${p.title} from the first world is gone`);
  assert.equal(new Set(second.pins.map(p => p.id)).size, second.pins.length);
});
