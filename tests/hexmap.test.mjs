import test from "node:test";
import assert from "node:assert/strict";
import { defaultHexOptions, generateHexMap, normalizeHexOptions, climateBiome, hexLands, randomHexSeed, readMix, writeMix, mixLayouts } from "../lib/hexmap/generate.ts";
import { applyHexPreset, hexPresets, matchingHexPreset } from "../lib/hexmap/presets.ts";
import { hashText } from "../lib/hexmap/noise.ts";
import { hexCells, hexGridFor, hexMapSize, hexNeighbours, fittingHexSize } from "../lib/hexmap/layout.ts";
import { readHex, isWaterTerrain, biomeIds, biomes } from "../lib/hexmap/biomes.ts";
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
  const o = normalizeHexOptions({ cols: 500, rows: -3, biome: "lava", mode: "mixed", coast: "nnxse", water: "lots", seed: 4 });
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

const plainMix = (mix, extra = {}) => small({ mode: "mix", mix, smart: false, blend: "sharp", wonders: 0, ...extra });
const landHexes = layer => hexesOf(layer).filter(c => c && !isWaterTerrain(c.terrain));
const shareOf = (layer, biome) => { const l = landHexes(layer); return l.filter(c => c.biome === biome).length / l.length; };

test("maps saved before mixing existed make exactly the same map again", () => {
  // Options saved by the first version have no mixing settings; these hashes are that version's maps.
  const saved = [[{}, 3249630446], [{ land: "island", seed: "moss-27", variety: 1 }, 2434875883], [{ mode: "single", biome: "desert", land: "archipelago", orient: "pointy", outline: "hex" }, 4086263831]];
  for (const [extra, hash] of saved) {
    const before = small(extra);
    for (const key of ["mix", "mixLayout", "biomeSize", "blend", "smart", "wonders"]) delete before[key];
    const { layer } = generateHexMap(normalizeHexOptions(before));
    assert.equal(hashText(layer.cells + JSON.stringify(layer.rivers)), hash, JSON.stringify(extra));
  }
  const filled = normalizeHexOptions({});
  assert.equal(filled.blend, "sharp"); assert.equal(filled.smart, false); assert.equal(filled.wonders, 0);
  assert.equal(defaultHexOptions.blend, "soft"); assert.equal(defaultHexOptions.smart, true);
});

test("a custom mix uses only its biomes, at about the shares asked for, in every arrangement", () => {
  for (const { id } of mixLayouts) {
    const { layer } = generateHexMap(plainMix("temperate:3,desert:2,glacier:1", { mixLayout: id }));
    assert.deepEqual(new Set(hexesOf(layer).map(c => c.biome)), new Set(["temperate", "desert", "glacier"]), id);
    for (const [biome, want] of [["temperate", 0.5], ["desert", 1 / 3], ["glacier", 1 / 6]]) {
      const got = shareOf(layer, biome);
      assert.ok(Math.abs(got - want) < 0.1, `${id}: ${biome} covers ${Math.round(got * 100)}% of the land, not about ${Math.round(want * 100)}%`);
    }
  }
});

test("mix arrangements put the first biome north, west, in the middle or low down", () => {
  const avg = (layer, biome, of) => { const cells = hexCells({ ...layer, outline: "rect" }).filter(h => readHex(layer.cells, h.i)?.biome === biome && !isWaterTerrain(readHex(layer.cells, h.i).terrain)); return cells.reduce((a, h) => a + of(h), 0) / cells.length; };
  const ns = generateHexMap(plainMix("boreal:1,savanna:1", { mixLayout: "ns" })).layer;
  assert.ok(avg(ns, "boreal", h => h.r) < avg(ns, "savanna", h => h.r));
  const we = generateHexMap(plainMix("boreal:1,savanna:1", { mixLayout: "we" })).layer;
  assert.ok(avg(we, "boreal", h => h.c) < avg(we, "savanna", h => h.c));
  const rings = generateHexMap(plainMix("boreal:1,savanna:1", { mixLayout: "rings", land: "lakes" })).layer;
  const fromMiddle = h => Math.hypot(h.c - rings.cols / 2, h.r - rings.rows / 2);
  assert.ok(avg(rings, "boreal", fromMiddle) < avg(rings, "savanna", fromMiddle));
  const height = hexesOf(generateHexMap(plainMix("jungle:1,volcanic:1", { mixLayout: "height", mountains: 0.8 })).layer);
  assert.ok(height.filter(c => c.terrain === "peak").every(c => c.biome === "volcanic"), "the peaks get the last biome");
});

test("smooth harsh borders keeps ice and desert apart", () => {
  const touching = layer => {
    const shape = { cols: layer.cols, rows: layer.rows, orient: layer.orient, outline: layer.outline, size: 10 }, nb = hexNeighbours(shape, hexCells(shape));
    let n = 0; nb.forEach((list, i) => { const a = readHex(layer.cells, i); if (a?.biome === "glacier") n += list.filter(j => readHex(layer.cells, j)?.biome === "desert").length; }); return n;
  };
  const harsh = plainMix("glacier:1,desert:1", { mixLayout: "we" });
  assert.ok(touching(generateHexMap(harsh).layer) > 0);
  const smooth = generateHexMap({ ...harsh, smart: true }).layer;
  assert.equal(touching(smooth), 0);
  assert.ok(hexesOf(smooth).some(c => c.biome === "temperate"), "a middle biome goes between them");
  assert.ok(hexesOf(generateHexMap({ ...harsh, smart: true, mix: "glacier:1,swamp:1,desert:1" }).layer).every(c => c.biome !== "temperate"), "a middle biome from the mix comes first");
});

test("blended borders mix the edges, and bigger biomes have fewer edges", () => {
  const borders = layer => {
    const shape = { cols: layer.cols, rows: layer.rows, orient: layer.orient, outline: layer.outline, size: 10 }, nb = hexNeighbours(shape, hexCells(shape));
    let n = 0; nb.forEach((list, i) => { n += list.filter(j => readHex(layer.cells, j).biome !== readHex(layer.cells, i).biome).length; }); return n;
  };
  const base = plainMix("temperate:1,boreal:1,savanna:1", { cols: 40, rows: 30 });
  const sharp = borders(generateHexMap(base).layer), soft = borders(generateHexMap({ ...base, blend: "soft" }).layer), wide = borders(generateHexMap({ ...base, blend: "wide" }).layer);
  assert.ok(soft > sharp && wide > soft, `${sharp} < ${soft} < ${wide}`);
  const climate = size => borders(generateHexMap(small({ cols: 40, rows: 30, biomeSize: size, blend: "sharp", smart: false, wonders: 0 })).layer);
  assert.ok(climate(0) > climate(3), "small biomes have more borders than huge ones");
});

test("rare wonders drop a few small strange patches, never on one-biome maps", () => {
  const special = layer => landHexes(layer).filter(c => biomes[c.biome].special).length;
  const options = small({ wonders: 0, smart: false, blend: "sharp" });
  assert.equal(special(generateHexMap(options).layer), 0);
  const many = special(generateHexMap({ ...options, wonders: 3 }).layer);
  assert.ok(many > 6 && many < landHexes(generateHexMap(options).layer).length * 0.3, `${many} wonder hexes`);
  assert.ok(hexesOf(generateHexMap(small({ mode: "single", biome: "boreal", wonders: 3 })).layer).every(c => c.biome === "boreal"));
});

test("a custom mix is saved as short text and read back safely", () => {
  assert.deepEqual(readMix("desert:9,lava:2,swamp:x,desert:1,fey:0"), [{ id: "desert", w: 6 }, { id: "swamp", w: 1 }, { id: "fey", w: 1 }]);
  assert.equal(writeMix(readMix("jungle:4, savanna:1")), "jungle:4");
  assert.equal(normalizeHexOptions({ mix: "nothing" }).mix, defaultHexOptions.mix);
  assert.equal(normalizeHexOptions({ mode: "mix", mixLayout: "spiral" }).mixLayout, "patches");
  assert.ok(hexesOf(generateHexMap(small({ mode: "mix", mix: "" })).layer).length > 0, "an empty mix still makes a map");
});

test("presets fill in the settings but keep the seed and size, until something changes", () => {
  const mine = small({ seed: "reed-11", cols: 30, rows: 20, orient: "pointy", miles: 12 });
  for (const preset of hexPresets) {
    const o = applyHexPreset(mine, preset);
    assert.equal(o.seed, "reed-11"); assert.equal(o.cols, 30); assert.equal(o.orient, "pointy"); assert.equal(o.miles, 12);
    assert.equal(matchingHexPreset(o)?.id, preset.id);
    const { layer } = generateHexMap(o);
    assert.equal(mapDrawingSchema.parse(drawingOf(layer)).hexes.cells, layer.cells, preset.name);
    assert.equal(matchingHexPreset({ ...o, rivers: o.rivers === 0 ? 1 : 0 }), undefined);
  }
  assert.equal(new Set(hexPresets.map(p => p.id)).size, hexPresets.length);
  assert.equal(matchingHexPreset(defaultHexOptions), undefined);
});
