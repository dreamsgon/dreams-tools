import test from "node:test";
import assert from "node:assert/strict";
import { cellFinder, cellShape, decodePaint, encodePaint, mapPaint, mapSchema, newMap, paintFromTiles, paintScale, paintSchema, playerMap, tilesFromPaint } from "../lib/encyclopedia/map-model.ts";
import { paintStroke, scaleBarLength, smoothLoop, straighten, terrainGlyphs, terrainLayers, traceMask } from "../lib/encyclopedia/terrain-art.ts";

const fill = (columns, rows, t) => ({ columns, rows, cells: encodePaint(new Uint8Array(columns * rows).fill(t)) });

test("paint runs round trip", () => {
  const cells = Uint8Array.from([0, 0, 0, 1, 1, 7, 2, 2, 2, 2, ...new Array(50).fill(3)]);
  const text = encodePaint(cells);
  assert.equal(text, "03.12.71.24.31e");
  assert.deepEqual([...decodePaint(6, 10, text)], [...cells]);
});

test("decoding rejects paint that doesn't cover the map exactly", () => {
  assert.equal(decodePaint(2, 2, "13"), null);
  assert.equal(decodePaint(2, 2, "15"), null);
  assert.equal(decodePaint(2, 2, "84"), null);
  assert.equal(decodePaint(2, 2, "1-4"), null);
  assert.ok(decodePaint(2, 2, "14"));
});

test("the paint schema checks size and coverage", () => {
  assert.ok(paintSchema.safeParse(fill(12, 12, 1)).success);
  assert.equal(paintSchema.safeParse({ columns: 12, rows: 12, cells: "1z" }).success, false);
  assert.equal(paintSchema.safeParse(fill(241, 12, 1)).success, false);
  assert.equal(paintSchema.safeParse({ ...fill(12, 12, 1), cells: "1 4" }).success, false);
});

test("maps accept paint, a compass and a scale bar; image maps can't be painted", () => {
  const m = newMap("world", "island", "Lantern", 24, 18);
  assert.ok(mapSchema.safeParse({ ...m, paint: paintFromTiles(m), compass: true, scaleBar: true }).success);
  assert.ok(mapSchema.safeParse(m).success, "older maps without paint still load");
  const image = { ...m, source: "image", imageId: "6f1c2c1a-8a4b-4c3e-9a51-2f6a0f1b9d10", tiles: [] };
  assert.ok(mapSchema.safeParse(image).success);
  assert.equal(mapSchema.safeParse({ ...image, paint: fill(24, 18, 1) }).success, false);
});

test("paint scale fits the largest maps inside the paint limit", () => {
  assert.equal(paintScale(24, 18), 6);
  assert.equal(paintScale(40, 30), 6);
  assert.equal(paintScale(6, 6), 6);
});

test("paint made from cells follows the cells but with soft edges, and is repeatable", () => {
  const m = newMap("world", "coast", "Wobble", 24, 18);
  const a = paintFromTiles(m), b = paintFromTiles(m);
  assert.deepEqual(a, b);
  assert.equal(a.columns, 144); assert.equal(a.rows, 108);
  const back = tilesFromPaint(m, a);
  const same = back.filter((v, i) => v === m.tiles[i]).length;
  assert.ok(same / m.tiles.length > 0.95, `${same} of ${m.tiles.length} cells kept their terrain`);
  const cells = decodePaint(a.columns, a.rows, a.cells);
  let edges = 0;
  for (let y = 0; y < a.rows; y++) for (let x = 1; x < a.columns; x++) if (cells[y * a.columns + x] !== cells[y * a.columns + x - 1] && x % 6 !== 0) edges++;
  assert.ok(edges > 0, "edges don't all fall on cell borders");
});

test("a map's own paint wins over its cells; image maps have none", () => {
  const m = newMap("world", "island", "x", 12, 12);
  const own = fill(72, 72, 5);
  assert.equal(mapPaint({ ...m, paint: own }), own);
  assert.equal(mapPaint({ ...m, source: "image" }), null);
});

test("cells take the terrain that covers most of them", () => {
  const m = newMap("world", "blank", "x", 12, 12);
  const k = paintScale(12, 12), cols = 12 * k;
  const cells = new Uint8Array(cols * cols).fill(1);
  for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) if (x + y < k + 2) cells[y * cols + x] = 2;
  const tiles = tilesFromPaint(m, { columns: cols, rows: cols, cells: encodePaint(cells) });
  assert.equal(tiles[0], 2);
  assert.equal(tiles[1], 1);
});

test("the fast hex lookup agrees with hex centres", () => {
  const m = newMap("hex", "island", "x", 20, 14);
  const find = cellFinder(m), size = { w: Math.sqrt(3) * 20.5 * 24, h: (1.5 * 13 + 2) * 24 };
  for (let i = 0; i < m.columns * m.rows; i++) {
    const c = cellShape(m, i);
    assert.equal(find(c.x / size.w, c.y / size.h), i);
  }
});

test("players never receive painted terrain under the fog", () => {
  const m = newMap("world", "blank", "x", 12, 12);
  const paint = fill(72, 72, 2);
  const shared = { ...m, visibility: "players", paint, fog: { enabled: true, revealed: [0] } };
  const seen = playerMap(shared);
  const cells = decodePaint(72, 72, seen.paint.cells);
  const visible = cells.reduce((n, v) => n + (v ? 1 : 0), 0);
  assert.equal(visible, 36, "only the one revealed cell keeps its forest");
  for (let y = 0; y < 72; y++) for (let x = 0; x < 72; x++) if (x >= 6 || y >= 6) assert.equal(cells[y * 72 + x], 0);
  const all = playerMap({ ...shared, fog: { enabled: true, revealed: Array.from({ length: 144 }, (_, i) => i) } });
  assert.equal(all.paint, paint);
  assert.equal(playerMap({ ...shared, fog: undefined }).paint, paint);
});

test("outlines close around squares, separate areas and holes", () => {
  assert.equal(traceMask(Uint8Array.from([1]), 1, 1).length, 1);
  assert.equal(traceMask(Uint8Array.from([1, 0, 1]), 3, 1).length, 2);
  const ring = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1]);
  assert.equal(traceMask(ring, 3, 3).length, 2, "an outside edge and a hole");
  assert.equal(traceMask(new Uint8Array(9), 3, 3).length, 0);
  for (const loop of traceMask(Uint8Array.from([1, 1, 0, 1]), 2, 2)) for (const [x, y] of loop) {
    assert.ok(x >= 0 && x <= 2 && y >= 0 && y <= 2);
  }
});

test("straight runs are dropped and corners rounded", () => {
  const square = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
  assert.equal(straighten(square).length, 4);
  const round = smoothLoop(square, 2);
  assert.equal(round.length, 16);
  for (const [x, y] of round) assert.ok(x >= 0 && x <= 2 && y >= 0 && y <= 2);
  assert.ok(!round.some(([x, y]) => (x === 0 || x === 2) && (y === 0 || y === 2)), "no sharp corners left");
});

test("terrain layers come bottom first and skip terrains the map doesn't use", () => {
  const cells = new Uint8Array(30 * 20);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 25; x++) cells[y * 30 + x] = x < 15 ? 2 : 4;
  const layers = terrainLayers({ columns: 30, rows: 20, cells: encodePaint(cells) }, 600, 400);
  assert.deepEqual(layers.map(l => l.id), ["shallows", "land", "forest", "hills", "mountains"]);
  for (const l of layers) assert.match(l.d, /^M[\d. L]+Z/);
  assert.deepEqual(terrainLayers(fill(20, 20, 0), 400, 400), []);
});

test("symbols sit inside their terrain", () => {
  const cells = new Uint8Array(40 * 40);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) cells[y * 40 + x] = 4;
  const glyphs = terrainGlyphs({ columns: 40, rows: 40, cells: encodePaint(cells) }, 400, 400);
  assert.ok(glyphs.length > 5);
  for (const g of glyphs) {
    assert.equal(g.kind, "mountain");
    assert.ok(g.x > 90 && g.x < 310 && g.y > 90 && g.y < 310);
  }
  assert.deepEqual(terrainGlyphs(fill(20, 20, 1), 200, 200), []);
});

test("scale bars use tidy lengths", () => {
  assert.equal(scaleBarLength(300), 50);
  assert.equal(scaleBarLength(1000), 200);
  assert.equal(scaleBarLength(7), 1);
  assert.equal(scaleBarLength(2500), 500);
});

test("brush strokes paint a round, continuous line", () => {
  const cells = new Uint8Array(40 * 40).fill(1);
  assert.ok(paintStroke(cells, 40, 40, { x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, 2, 2, false));
  for (let x = 10; x <= 30; x++) assert.equal(cells[20 * 40 + x], 2, `square ${x} is painted`);
  assert.equal(cells[10 * 40 + 20], 1);
  assert.equal(paintStroke(cells, 40, 40, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 2, 2, false), false, "nothing changes the second time");
});

test("painting on land only leaves the sea alone", () => {
  const cells = new Uint8Array(20 * 20);
  for (let i = 0; i < 200; i++) cells[i] = 1;
  paintStroke(cells, 20, 20, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 4, 2, true);
  assert.equal(cells[9 * 20 + 10], 2);
  assert.equal(cells[11 * 20 + 10], 0);
  paintStroke(cells, 20, 20, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 4, 0, true);
  assert.equal(cells[9 * 20 + 10], 0, "painting sea still works with land only on");
});
