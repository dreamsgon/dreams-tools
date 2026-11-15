import test from "node:test";
import assert from "node:assert/strict";
import { defaultHexOptions, generateHexMap, normalizeHexOptions, climateBiome, hexLands, randomHexSeed } from "../lib/hexmap/generate.ts";
import { hexCells, hexGridFor, hexMapSize, hexNeighbours, fittingHexSize } from "../lib/hexmap/layout.ts";
import { readHex, isWaterTerrain, biomeIds } from "../lib/hexmap/biomes.ts";
import { hexLayerOps } from "../lib/hexmap/art.ts";
import { groundOps } from "../lib/map-style.ts";
import { resizeMap } from "../lib/map-creator.ts";
import { setUpDrawnMapScene } from "../lib/map-export.ts";
import { hexCenter, mapDrawingSchema, newScene } from "../lib/model.ts";

const small = (extra = {}) => ({ ...defaultHexOptions, cols: 24, rows: 18, ...extra });
const hexesOf = layer => Array.from({ length: layer.cols * layer.rows }, (_, i) => readHex(layer.cells, i));
const drawingOf = layer => ({ background: "#cfc8b4", style: null, shapes: [], folders: [], layerOrder: [], hexes: layer });

test("the same options always make the same hex map, and another seed makes another", () => {
  const a = generateHexMap(small()), b = generateHexMap(small());
  assert.deepEqual(a, b);
  const c = generateHexMap(small({ seed: "moss-27" }));
  assert.notEqual(a.layer.cells, c.layer.cells);
});

test("every hex is stored as two letters and the map is saved as a valid drawing", () => {
  for (const land of hexLands.map(l => l.id)) for (const outline of ["rect", "hex", "circle"]) for (const orient of ["flat", "pointy"]) {
    const { layer } = generateHexMap(small({ land, outline, orient }));
    assert.equal(layer.cells.length, layer.cols * layer.rows * 2);
    const parsed = mapDrawingSchema.parse(drawingOf(layer));
    assert.equal(parsed.hexes.cells, layer.cells, `${land} ${outline} ${orient}`);
  }
});

test("older drawings without a hex map still load, and broken hex maps are refused", () => {
  assert.equal(mapDrawingSchema.parse({ background: "#ffffff", shapes: [] }).hexes, undefined);
  const { layer } = generateHexMap(small());
  assert.throws(() => mapDrawingSchema.parse(drawingOf({ ...layer, cells: layer.cells.slice(2) })));
  assert.throws(() => mapDrawingSchema.parse(drawingOf({ ...layer, rivers: [[0, layer.cols * layer.rows]] })));
  assert.throws(() => mapDrawingSchema.parse(drawingOf({ ...layer, cells: "zz" + layer.cells.slice(2) })));
});

test("the outline leaves hexes outside a hexagon or circle empty", () => {
  for (const outline of ["hex", "circle"]) {
    const { layer } = generateHexMap(small({ outline }));
    const cells = hexesOf(layer), outside = cells.filter(c => !c).length;
    assert.ok(outside > 20, `${outline} leaves the corners out`);
    assert.equal(readHex(layer.cells, 0), null, "the top-left corner is outside");
  }
  assert.ok(hexesOf(generateHexMap(small()).layer).every(Boolean), "a rectangle uses every hex");
});

test("more water gives more water, and an island is ringed by sea", () => {
  const share = water => { const cells = hexesOf(generateHexMap(small({ land: "island", water })).layer); return cells.filter(c => isWaterTerrain(c.terrain)).length / cells.length; };
  assert.ok(share(0.9) > share(0.1) + 0.1);
  const { layer } = generateHexMap(small({ land: "island" }));
  const cells = hexCells({ ...layer, outline: "rect" });
  const edges = cells.filter(h => h.c === 0 || h.r === 0 || h.c === layer.cols - 1 || h.r === layer.rows - 1);
  const wet = edges.filter(h => isWaterTerrain(readHex(layer.cells, h.i).terrain)).length;
  assert.ok(wet / edges.length > 0.9, "the map's edge is mostly sea");
});

test("inland kinds of land have lakes but no sea", () => {
  for (const land of ["lakes", "basin", "range"]) {
    const terrains = new Set(hexesOf(generateHexMap(small({ land })).layer).map(c => c.terrain));
    assert.ok(!terrains.has("deep") && !terrains.has("shallow"), land);
  }
});

test("mountains follow the Mountains setting", () => {
  const count = mountains => hexesOf(generateHexMap(small({ mountains })).layer).filter(c => c.terrain === "mountain" || c.terrain === "peak").length;
  assert.equal(count(0), 0);
  assert.ok(count(1) > count(0.3));
});

test("rivers run between neighbouring hexes from high ground down to water", () => {
  const options = small({ rivers: 6 });
  const { layer } = generateHexMap(options);
  assert.ok(layer.rivers.length > 0 && layer.rivers.length <= 6);
  const shape = { cols: layer.cols, rows: layer.rows, orient: layer.orient, outline: layer.outline, size: 10 };
  const nb = hexNeighbours(shape, hexCells(shape));
  const onRiver = new Set(layer.rivers.slice(0, -1).flat());
  layer.rivers.forEach((river, n) => {
    for (let k = 1; k < river.length; k++) assert.ok(nb[river[k - 1]].includes(river[k]), "each step goes to a neighbour");
    assert.ok(["hills", "mountain", "peak"].includes(readHex(layer.cells, river[0]).terrain), "a river starts on high ground");
    const end = readHex(layer.cells, river.at(-1));
    assert.ok(isWaterTerrain(end.terrain) || layer.rivers.some((other, m) => m !== n && other.includes(river.at(-1))) || onRiver.has(river.at(-1)), "a river ends in water or another river");
  });
  assert.equal(generateHexMap(small({ rivers: 0 })).layer.rivers.length, 0);
});

test("one biome means every hex has that biome; climate mixes several", () => {
  const one = hexesOf(generateHexMap(small({ mode: "single", biome: "volcanic" })).layer);
  assert.ok(one.every(c => c.biome === "volcanic"));
  const mixed = new Set(hexesOf(generateHexMap(small({ mode: "climate", variety: 1 })).layer).map(c => c.biome));
  assert.ok(mixed.size >= 4, `climate gave ${[...mixed].join(", ")}`);
  const cold = hexesOf(generateHexMap(small({ mode: "climate", temp: -1, variety: 0.3 })).layer).filter(c => !isWaterTerrain(c.terrain));
  assert.ok(cold.filter(c => ["glacier", "tundra", "boreal"].includes(c.biome)).length > cold.length * 0.8, "a freezing climate is mostly cold biomes");
});

test("the climate table never puts a special biome on the map by itself", () => {
  for (let t = 0; t <= 1; t += 0.05) for (let m = 0; m <= 1; m += 0.05) assert.ok(!["volcanic", "blighted", "fey"].includes(climateBiome(t, m)));
  assert.equal(climateBiome(0, 0), "glacier");
  assert.equal(climateBiome(1, 0), "desert");
  assert.equal(climateBiome(1, 1), "jungle");
});

test("options read back from a save are checked and filled in", () => {
  const o = normalizeHexOptions({ cols: 500, rows: -3, biome: "lava", mode: "mix", coast: "nnxse", water: "lots", seed: 4 });
  assert.equal(o.cols, 100); assert.equal(o.rows, 8);
  assert.equal(o.biome, defaultHexOptions.biome); assert.equal(o.mode, defaultHexOptions.mode);
  assert.equal(o.coast, "nse"); assert.equal(o.water, defaultHexOptions.water); assert.equal(o.seed, defaultHexOptions.seed);
  assert.deepEqual(normalizeHexOptions(generateHexMap(small()).layer.options), normalizeHexOptions(small()));
  assert.match(randomHexSeed(() => 0.5), /^[a-z]+-\d\d$/);
});

test("the largest maps still fit within Maptable's 8000 pixel limit", () => {
  for (const orient of ["flat", "pointy"]) {
    const size = fittingHexSize(100, 80, orient), { width, height } = hexMapSize({ cols: 100, rows: 80, orient, size });
    assert.ok(size >= 20 && width <= 8000 && height <= 8000, `${orient}: ${size}px hexes, ${width} × ${height}`);
  }
  assert.equal(fittingHexSize(35, 25, "flat"), 50);
});

test("Maptable's hex grid lands exactly on the map's hexes, wherever the map sits", () => {
  for (const orient of ["flat", "pointy"]) {
    const shape = { cols: 9, rows: 7, orient, outline: "rect", size: 50 }, at = { x: 140, y: -70 };
    const grid = { ...hexGridFor({ ...shape, ...at }), color: "#000000", opacity: 1, labels: false, units: 6, unit: "mi" };
    for (const h of hexCells(shape)) {
      const p = hexCenter(h.q, h.ar, grid);
      assert.ok(Math.abs(p.x - (h.x + at.x)) < 1e-6 && Math.abs(p.y - (h.y + at.y)) < 1e-6, `${orient} hex ${h.c},${h.r}`);
    }
  }
});

test("Use in Maptable sets a hex grid in miles for a hex map and squares for other drawings", () => {
  const { layer, width, height } = generateHexMap(small({ orient: "pointy", miles: 12 }));
  const scene = Object.assign(newScene("Hexes"), { width, height, drawing: drawingOf(layer) });
  setUpDrawnMapScene(scene, { fog: true, markers: false, grid: { size: 70, units: 5, unit: "ft" } });
  assert.equal(scene.grid.type, "hex-pointy"); assert.equal(scene.grid.size, layer.size);
  assert.equal(scene.grid.units, 12); assert.equal(scene.grid.unit, "mi"); assert.equal(scene.mapType, "area");
  assert.equal(scene.fog.enabled, true);
  const plain = Object.assign(newScene("Rooms"), { drawing: { background: "#ffffff", style: null, shapes: [], folders: [], layerOrder: [] } });
  setUpDrawnMapScene(plain, { fog: false, markers: false, grid: { size: 70, units: 5, unit: "ft" } });
  assert.equal(plain.grid.type, "square");
});

test("a hex map draws under the shapes as a few grouped paths and moves when the map grows", () => {
  const { layer, width, height } = generateHexMap(small());
  const ops = hexLayerOps(layer);
  assert.ok(ops.length > 10 && ops.length < 300, `${ops.length} paths`);
  assert.equal(hexLayerOps(layer), ops, "drawn once and reused");
  assert.equal(hexLayerOps({ ...layer }), ops, "a copy of the same map reuses the drawing too");
  assert.ok(ops.every(op => op.d && (op.fill || op.stroke)));
  const ground = groundOps(drawingOf(layer), width, height);
  assert.equal(ground.length, ops.length + 1, "background first, then the hexes");
  const grown = resizeMap({ width, height, drawing: drawingOf(layer) }, width + 140, height + 140, { x: 1, y: 1 }, 70);
  assert.equal(grown.drawing.hexes.x, 140); assert.equal(grown.drawing.hexes.y, 140);
});

test("every biome can be drawn as one biome", () => {
  for (const biome of biomeIds) {
    const { layer } = generateHexMap(small({ mode: "single", biome, cols: 12, rows: 10 }));
    assert.ok(hexLayerOps(layer).length > 3, biome);
  }
});
