import test from "node:test";
import assert from "node:assert/strict";
import {
  generateMap, generatorKinds, generatorSizes, generatorStyle, randomSeed, seededRandom, connect, suggestedStyle,
} from "../lib/map-generator.ts";
import { labelBox } from "../lib/map-drawing.ts";
import { shapeOps } from "../lib/map-style.ts";
import { mapDrawingSchema } from "../lib/model.ts";

const GRID = 70;
const options = (kind, size = "small", extra = {}) => ({
  kind, size, rooms: 8, style: suggestedStyle[kind], seed: "ember-42", grid: GRID, ...extra,
});
const pointsOf = (shape) => shape.points;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("seededRandom gives the same sequence for the same seed", () => {
  const a = seededRandom("ember-42"), b = seededRandom("ember-42");
  const seqA = Array.from({ length: 50 }, a), seqB = Array.from({ length: 50 }, b);
  assert.deepEqual(seqA, seqB);
});

test("seededRandom gives different sequences for different seeds", () => {
  const a = seededRandom("ember-42"), b = seededRandom("frost-17");
  const seqA = Array.from({ length: 20 }, a), seqB = Array.from({ length: 20 }, b);
  assert.notDeepEqual(seqA, seqB);
});

test("seededRandom values are in [0, 1)", () => {
  for (const seed of ["", "a", "ember-42", "dungeon:small:8:x"]) {
    const r = seededRandom(seed);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1, `seed ${seed}: ${v}`);
    }
  }
});

test("randomSeed matches the word-and-number pattern", () => {
  for (let i = 0; i < 200; i++) {
    assert.match(randomSeed(), /^[a-z]+-\d{2}$/);
  }
});

test("randomSeed is deterministic with a seeded random", () => {
  assert.equal(randomSeed(seededRandom("abc")), randomSeed(seededRandom("abc")));
  const seeds = Array.from({ length: 5 }, () => randomSeed(seededRandom("abc")));
  assert.equal(new Set(seeds).size, 1);
});

for (const { id: kind } of generatorKinds) {
  for (const size of Object.keys(generatorSizes)) {
    const { cols, rows } = generatorSizes[size];
    const label = `${kind}/${size}`;

    test(`${label}: result parses with mapDrawingSchema and has the expected size`, () => {
      const map = generateMap(options(kind, size));
      assert.doesNotThrow(() => mapDrawingSchema.parse(map.drawing));
      assert.equal(map.width, cols * GRID);
      assert.equal(map.height, rows * GRID);
      assert.ok(map.drawing.shapes.length > 0);
    });

    test(`${label}: same options give deep-equal output`, () => {
      const a = generateMap(options(kind, size));
      const b = generateMap(options(kind, size));
      assert.deepEqual(a, b);
    });

    test(`${label}: a different seed gives different shapes`, () => {
      const a = generateMap(options(kind, size));
      const b = generateMap(options(kind, size, { seed: "frost-17" }));
      assert.notDeepEqual(a.drawing.shapes.map(pointsOf), b.drawing.shapes.map(pointsOf));
    });

    test(`${label}: every point lies within the map (up to one grid square outside)`, () => {
      const map = generateMap(options(kind, size));
      const margin = GRID;
      for (const shape of map.drawing.shapes) {
        for (const p of shape.points) {
          assert.ok(p.x >= -margin && p.x <= map.width + margin, `${shape.type} ${shape.id} x=${p.x} outside 0..${map.width}`);
          assert.ok(p.y >= -margin && p.y <= map.height + margin, `${shape.type} ${shape.id} y=${p.y} outside 0..${map.height}`);
        }
      }
    });

    test(`${label}: labels are numbered 1..n with n at most the requested rooms`, () => {
      const map = generateMap(options(kind, size, { rooms: 6 }));
      const labels = map.drawing.shapes.filter(s => s.type === "label" && s.fill);
      const names = labels.map(s => Number(s.name)).sort((a, b) => a - b);
      assert.ok(labels.length >= 1, "at least one room label");
      assert.ok(labels.length <= 6, `at most the requested count, got ${labels.length}`);
      assert.deepEqual(names, labels.map((_, i) => i + 1));
    });
  }
}

test("dungeon has exactly one merged floor shape", () => {
  for (const size of Object.keys(generatorSizes)) {
    const map = generateMap(options("dungeon", size));
    assert.equal(map.drawing.shapes.filter(s => s.type === "merged").length, 1, size);
  }
});

test("dungeon has at least one door, each two points one grid square apart", () => {
  for (const size of Object.keys(generatorSizes)) {
    const map = generateMap(options("dungeon", size));
    const doors = map.drawing.shapes.filter(s => s.type === "door");
    assert.ok(doors.length >= 1, `${size}: at least one door`);
    for (const d of doors) {
      assert.equal(d.points.length, 2, `${d.id} has 2 points`);
      assert.equal(dist(d.points[0], d.points[1]), GRID, `${d.id} length`);
    }
  }
});

test("dungeon labels equal the rooms made: one label per room, numbered 1..n", () => {
  const map = generateMap(options("dungeon", "large", { rooms: 12 }));
  const labels = map.drawing.shapes.filter(s => s.type === "label");
  assert.ok(labels.length >= 2 && labels.length <= 12, `got ${labels.length}`);
});

test("style comes from generatorStyle: dungeon with stone and outdoor with outdoor", () => {
  const dungeon = generateMap(options("dungeon", "small", { style: "stone" }));
  assert.equal(dungeon.drawing.style.preset, "stone");
  assert.equal(dungeon.drawing.background, generatorStyle("stone", GRID).background);

  const village = generateMap(options("village", "small", { style: "outdoor" }));
  assert.equal(village.drawing.style.preset, "outdoor");
  assert.equal(village.drawing.background, generatorStyle("outdoor", GRID).background);
});

test("generatorStyle sets the grid size and falls back to the outdoor look for unknown ids", () => {
  assert.equal(generatorStyle("stone", 55).style.gridSize, 55);
  assert.equal(generatorStyle("no-such-style", GRID).style.preset, "outdoor");
});

test("connect links every point to point 0 with at least n-1 links", () => {
  const random = seededRandom("connect-test");
  for (let n = 2; n <= 12; n++) {
    const points = Array.from({ length: n }, () => ({ x: Math.floor(random() * 40), y: Math.floor(random() * 30) }));
    for (const loops of [0, 0.5, 1]) {
      const links = connect(points, random, loops);
      assert.ok(links.length >= n - 1, `n=${n} loops=${loops}: ${links.length} links`);

      const adj = Array.from({ length: n }, () => []);
      for (const [a, b] of links) { adj[a].push(b); adj[b].push(a); }
      const seen = new Set([0]), queue = [0];
      while (queue.length) for (const next of adj[queue.shift()]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
      assert.equal(seen.size, n, `n=${n} loops=${loops}: all points reachable from 0`);
    }
  }
});

test("connect returns no links for fewer than two points", () => {
  assert.deepEqual(connect([], seededRandom("x"), 1), []);
  assert.deepEqual(connect([{ x: 0, y: 0 }], seededRandom("x"), 1), []);
});

test("labelBox centres a box on the label point, at least as wide as it is tall", () => {
  const b = labelBox({ points: [{ x: 100, y: 200 }], name: "12", thickness: 22 });
  assert.ok(b.w >= b.h);
  assert.ok(Math.abs(b.x + b.w / 2 - 100) < 1e-9);
  assert.ok(Math.abs(b.y + b.h / 2 - 200) < 1e-9);
  assert.equal(b.h, 22 * 1.8);
});

const labelShape = (extra = {}) => ({
  id: "l1", name: "7", folderId: null, smooth: false, hidden: false, locked: false, type: "label",
  roomParts: [], points: [{ x: 300, y: 400 }, { x: 300, y: 400 }], fill: "#ffffff", stroke: "#2b2b2b",
  thickness: 22, closed: false, stamp: null, rotation: 0, flip: false, ...extra,
});

test("label with fill gives a badge path op plus a text op", () => {
  const d = generatorStyle("stone", GRID);
  const ops = shapeOps(labelShape(), { background: d.background, style: d.style });
  assert.equal(ops.length, 2);
  assert.ok(ops[0].d.startsWith("M "), "badge path");
  assert.equal(ops[0].fill, "#ffffff");
  assert.equal(ops[1].text.value, "7");
  assert.equal(ops[1].text.size, 22);
  assert.equal(ops[1].text.x, 300);
  assert.equal(ops[1].text.y, 400);
});

test("label without fill gives only a text op", () => {
  const d = generatorStyle("stone", GRID);
  const ops = shapeOps(labelShape({ fill: null }), { background: d.background, style: d.style });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].text.value, "7");
  assert.equal(ops[0].text.size, 22);
});
