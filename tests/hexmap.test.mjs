import test from "node:test";
import assert from "node:assert/strict";
import { defaultHexLook, defaultHexOptions, generateHexMap, normalizeHexOptions, climateBiome, hexLands, randomHexSeed, readMix, writeMix, mixLayouts } from "../lib/hexmap/generate.ts";
import { applyHexPreset, hexPresets, matchingHexPreset } from "../lib/hexmap/presets.ts";
import { hashText } from "../lib/hexmap/noise.ts";
import { hexCells, hexGridFor, hexMapSize, hexNeighbours, fittingHexSize } from "../lib/hexmap/layout.ts";
import { readHex, isWaterTerrain, biomeIds, biomes } from "../lib/hexmap/biomes.ts";
import { hexFill, hexLayerOps, hexLegendRows, hexSiteOps } from "../lib/hexmap/art.ts";
import { isSettlement } from "../lib/hexmap/places.ts";
import { hexSettingsCode, readHexSettingsCode } from "../lib/hexmap/code.ts";
import { hexDistance } from "../lib/hexmap/layout.ts";
import { groundOps } from "../lib/map-style.ts";
import { resizeMap, toolForKey, toolsFor } from "../lib/map-creator.ts";
import { describeHex, hexAt, hexCentre, paintHex, regenerateHexLayer, restoreHex } from "../lib/hexmap/paint.ts";
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
  assert.equal(scene.grid.labels, true, "Maptable names the cells");
  const numbered = Object.assign(newScene("Numbered"), { width, height, drawing: drawingOf({ ...layer, numbers: true }) });
  setUpDrawnMapScene(numbered, { fog: false, markers: false, grid: { size: 70, units: 5, unit: "ft" } });
  assert.equal(numbered.grid.labels, false, "a map with its own hex numbers hides Maptable's cell names");
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
  assert.ok(ops.every(op => op.text || (op.d && (op.fill || op.stroke))));
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

test("older hex maps keep the painted look, and a look is checked when read back", () => {
  const { layer } = generateHexMap(small());
  const { look, lines, numbers, legend, ...before } = layer;
  assert.deepEqual([look, lines, numbers, legend], ["painted", true, false, "none"]);
  const parsed = mapDrawingSchema.parse(drawingOf(before)).hexes;
  assert.deepEqual([parsed.look, parsed.lines, parsed.numbers, parsed.legend], ["painted", true, false, "none"]);
  assert.deepEqual(hexLayerOps(before), hexLayerOps(layer), "a map without a look draws as before");
  assert.throws(() => mapDrawingSchema.parse(drawingOf({ ...layer, look: "neon" })));
  assert.throws(() => mapDrawingSchema.parse(drawingOf({ ...layer, legend: "middle" })));
});

test("Flat colours draws no symbols, Ink draws on paper, and outlines can be hidden", () => {
  const { layer } = generateHexMap(small({ rivers: 4, settlements: 0, sites: 0 }));
  const painted = hexLayerOps(layer), flat = hexLayerOps({ ...layer, look: "flat" }), ink = hexLayerOps({ ...layer, look: "ink" });
  assert.ok(flat.length < painted.length, `${flat.length} flat paths, ${painted.length} painted`);
  assert.equal(flat.filter(op => !op.fill).length, 1 + layer.rivers.length, "only ground, outlines and rivers");
  const inkColours = new Set(ink.flatMap(op => [op.fill, op.stroke]).filter(Boolean));
  assert.ok(inkColours.has("#f8f5ee") && inkColours.has("#2f2b26"));
  assert.ok(![...inkColours].some(c => ["#4d84a5", "#4f8fb4", "#ff7a3d"].includes(c)), "no painted water, rivers or lava in ink");
  const outlines = ops => ops.filter(op => op.opacity !== undefined && op.opacity < 0.5).length;
  assert.equal(outlines(painted), 1);
  assert.equal(outlines(hexLayerOps({ ...layer, lines: false })), 0);
  assert.notEqual(hexLayerOps({ ...layer }), ink, "each look is drawn on its own");
});

test("Old atlas draws brown ink on parchment in a frame, with biomes still told apart", () => {
  const { layer } = generateHexMap(small({ rivers: 4, settlements: 3, sites: 0 }));
  const atlas = hexLayerOps({ ...layer, look: "atlas", legend: "sw" });
  const colours = new Set(atlas.flatMap(op => [op.fill, op.stroke]).filter(Boolean));
  assert.ok(colours.has("#5a3e22"), "sepia ink");
  assert.ok(![...colours].some(c => ["#4d84a5", "#7db1c6", "#4f8fb4", "#ff7a3d"].includes(c)), "no painted water, rivers or lava");
  const frame = atlas.slice(-2);
  assert.ok(frame.every(op => op.stroke === "#5a3e22" && !op.fill), "two frame rules around the map");
  const grounds = new Set(["temperate", "desert", "boreal", "jungle"].map(b => hexFill(b, "flat", 1, "atlas")));
  assert.equal(grounds.size, 4, "each biome keeps its own parchment tint");
  for (const c of grounds) { const n = parseInt(c.slice(1), 16), l = (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; assert.ok(l > 0.6, `${c} stays light enough for ink`); }
  assert.ok(hexLegendRows(layer, "atlas").some(r => r.fill && !r.river), "the legend shows the tints");
  assert.equal(mapDrawingSchema.parse(drawingOf({ ...layer, look: "atlas" })).hexes.look, "atlas");
});

test("hex numbers give every hex inside the outline its column and row", () => {
  const { layer } = generateHexMap(small({ outline: "circle" }));
  const texts = hexLayerOps({ ...layer, numbers: true }).filter(op => /^\d{4}$/.test(op.text?.value ?? ""));
  assert.equal(texts.length, hexesOf(layer).filter(Boolean).length);
  const plain = generateHexMap(small()).layer, first = hexLayerOps({ ...plain, numbers: true }).find(op => op.text);
  assert.equal(first.text.value, "0101");
  assert.ok(hexLayerOps({ ...plain, numbers: true }).some(op => op.text?.value === `${plain.cols}${plain.rows}`));
});

test("the legend lists what is on the map and sits in the chosen corner, inside the map", () => {
  const { layer } = generateHexMap(small({ mode: "mix", mix: "desert:2,jungle:1", wonders: 0, smart: false, rivers: 3 }));
  const rows = hexLegendRows(layer, "painted").map(r => r.label);
  assert.ok(rows.includes("Desert") && rows.includes("Jungle") && rows.includes("River"), rows.join(", "));
  assert.ok(!rows.includes("Glacier"));
  assert.ok(!hexLegendRows(layer, "ink").some(r => r.label === "Desert"), "ink has no biome colours to show");
  const { width, height } = hexMapSize(layer);
  for (const corner of ["nw", "ne", "sw", "se"]) {
    const ops = hexLayerOps({ ...layer, x: 30, y: 40, legend: corner }), box = ops.find(op => op.fill && op.opacity === 0.95);
    const [x, y, w, h] = box.d.match(/^M([\d.-]+) ([\d.-]+)h([\d.]+)v([\d.]+)/).slice(1).map(Number);
    assert.ok(x >= 30 && y >= 40 && x + w <= 30 + width && y + h <= 40 + height, `${corner} box at ${x},${y}`);
    assert.ok(corner.endsWith("w") ? x - 30 < width * 0.05 : 30 + width - (x + w) < width * 0.05, `${corner} side`);
    assert.ok(corner.startsWith("n") ? y - 40 < height * 0.05 : 40 + height - (y + h) < height * 0.05, `${corner} top or bottom`);
    assert.ok(ops.some(op => op.text?.value === "One hex: 6 miles"));
  }
  const tiny = generateHexMap(small({ cols: 10, rows: 8, mode: "climate", variety: 1 })).layer, size = hexMapSize(tiny);
  const box = hexLayerOps({ ...tiny, legend: "se" }).find(op => op.fill && op.opacity === 0.95);
  const [, , w, h] = box.d.match(/^M([\d.-]+) ([\d.-]+)h([\d.]+)v([\d.]+)/).slice(1).map(Number);
  assert.ok(w <= size.width * 0.35 + 1 && h <= size.height * 0.6 + 1, "a small map gets a smaller legend");
});

const shapeOf = layer => { const shape = { cols: layer.cols, rows: layer.rows, orient: layer.orient, outline: layer.outline, size: 10 }; const cells = hexCells(shape); return { cells, nb: hexNeighbours(shape, cells) }; };

test("settlements go on open land, spread apart: a city, two towns, then villages", () => {
  const { layer } = generateHexMap(small({ settlements: 6, sites: 0 }));
  const { cells } = shapeOf(layer), towns = layer.places;
  assert.equal(towns.length, 6);
  assert.deepEqual(towns.map(p => p.kind), ["city", "town", "town", "village", "village", "village"]);
  for (const p of towns) {
    const hex = readHex(layer.cells, p.i);
    assert.ok(["flat", "beach", "forest", "hills"].includes(hex.terrain), `${p.name} on ${hex.terrain}`);
    assert.match(p.name, /^[A-Z][a-z]+$/);
  }
  for (const a of towns) for (const b of towns) if (a !== b) assert.ok(hexDistance(cells[a.i], cells[b.i]) >= 3);
  const plain = generateHexMap(small({ settlements: 3, sites: 2, names: false })).layer.places.map(p => p.name);
  assert.deepEqual(plain.slice(0, 3), ["City", "Town 1", "Town 2"]);
  assert.match(plain[3], /^(Ruin|Tower|Cave|Shrine|Lair) 1$/);
});

test("ruins and lairs go in the wilds, never on water or on top of another place", () => {
  const { layer } = generateHexMap(small({ settlements: 4, sites: 8 }));
  const { cells } = shapeOf(layer), sites = layer.places.filter(p => !isSettlement(p.kind));
  assert.ok(sites.length >= 5, `${sites.length} sites`);
  for (const p of sites) assert.ok(!isWaterTerrain(readHex(layer.cells, p.i).terrain));
  for (const a of layer.places) for (const b of layer.places) if (a !== b) assert.ok(hexDistance(cells[a.i], cells[b.i]) >= 3);
});

test("roads join the settlements over land, one neighbouring hex at a time", () => {
  const { layer } = generateHexMap(small({ settlements: 6, land: "lakes" }));
  const { nb } = shapeOf(layer), towns = new Set(layer.places.filter(p => isSettlement(p.kind)).map(p => p.i));
  // A settlement cut off by water or high peaks gets no road; the rest are all joined.
  assert.ok(layer.roads.length >= towns.size - 2 && layer.roads.length <= towns.size - 1, `${layer.roads.length} roads for ${towns.size} settlements`);
  for (const road of layer.roads) {
    assert.ok(towns.has(road[0]) && towns.has(road.at(-1)), "a road runs from one settlement to another");
    for (let k = 1; k < road.length; k++) assert.ok(nb[road[k - 1]].includes(road[k]));
    for (const i of road.slice(1, -1)) assert.ok(!isWaterTerrain(readHex(layer.cells, i).terrain) && readHex(layer.cells, i).terrain !== "peak");
  }
  assert.equal(generateHexMap(small({ settlements: 6, roads: false })).layer.roads.length, 0);
});

test("Reroll places moves the places but keeps the land, and older options make no places", () => {
  const a = generateHexMap(small()).layer, b = generateHexMap(small({ placesRoll: 1 })).layer;
  assert.equal(a.cells, b.cells); assert.deepEqual(a.rivers, b.rivers);
  assert.notDeepEqual(a.places, b.places);
  const older = small(); delete older.settlements; delete older.sites;
  assert.equal(generateHexMap(normalizeHexOptions(older)).layer.places.length, 0);
  assert.equal(normalizeHexOptions(older).settlements, 0);
});

test("places and roads are saved with the map and checked when read back", () => {
  const { layer } = generateHexMap(small({ settlements: 5, sites: 3 }));
  const parsed = mapDrawingSchema.parse(drawingOf(layer)).hexes;
  assert.deepEqual(parsed.places, layer.places); assert.deepEqual(parsed.roads, layer.roads);
  const older = { ...layer }; delete older.places; delete older.roads; delete older.labels;
  const old = mapDrawingSchema.parse(drawingOf(older)).hexes;
  assert.deepEqual(old.places, []); assert.deepEqual(old.roads, []); assert.equal(old.labels, true);
  assert.throws(() => mapDrawingSchema.parse(drawingOf({ ...layer, places: [{ i: layer.cols * layer.rows, kind: "town", name: "Far" }] })));
  assert.throws(() => mapDrawingSchema.parse(drawingOf({ ...layer, places: [{ i: 0, kind: "castle", name: "Keep" }] })));
  assert.throws(() => mapDrawingSchema.parse(drawingOf({ ...layer, roads: [[0, layer.cols * layer.rows]] })));
});

test("settlements and roads are drawn on the map; ruins and lairs only in the GM's view", () => {
  const { layer } = generateHexMap(small({ settlements: 4, sites: 4 }));
  const ops = hexLayerOps(layer), names = ops.filter(op => op.text).map(op => op.text.value);
  for (const p of layer.places) assert.equal(names.includes(p.name), isSettlement(p.kind), p.name);
  assert.equal(ops.filter(op => op.dash).length, layer.roads.length, "each road is a dashed line");
  const secret = hexSiteOps(layer).filter(op => op.text).map(op => op.text.value);
  assert.deepEqual(secret.sort(), layer.places.filter(p => !isSettlement(p.kind)).map(p => p.name).sort());
  assert.ok(!hexLayerOps({ ...layer, labels: false }).some(op => op.text), "names can be left off");
  assert.ok(hexLegendRows(layer, "painted").some(r => r.label === "Road"));
});

test("Use in Maptable can make every place a GM-only marker on its hex, replacing the last ones", () => {
  const { layer, width, height } = generateHexMap(small({ settlements: 3, sites: 2 }));
  const scene = Object.assign(newScene("Hexes"), { width, height, drawing: drawingOf({ ...layer, x: 20, y: 10 }) });
  setUpDrawnMapScene(scene, { fog: false, markers: true, grid: { size: 70, units: 5, unit: "ft" } });
  const markers = scene.pointsOfInterest;
  assert.equal(markers.length, layer.places.length);
  assert.ok(markers.every(m => m.hidden));
  const grid = scene.grid, cells = hexCells({ ...layer, outline: "rect" });
  layer.places.forEach((p, n) => {
    const c = hexCenter(cells[p.i].q, cells[p.i].ar, grid);
    assert.ok(Math.abs(markers[n].x - c.x) < 0.01 && Math.abs(markers[n].y - c.y) < 0.01, "on the hex's centre");
    assert.equal(markers[n].name, p.name);
  });
  setUpDrawnMapScene(scene, { fog: false, markers: true, grid: { size: 70, units: 5, unit: "ft" } });
  assert.equal(scene.pointsOfInterest.length, layer.places.length, "using it again replaces them");
});

test("a settings code gives back the same map and look, and anything else is refused", () => {
  const options = small({ mode: "mix", mix: "fey:2,jungle:1", seed: "ëmber-9", settlements: 9, placesRoll: 3 });
  const code = hexSettingsCode(options, { look: "ink", lines: true, numbers: true, legend: "sw", labels: false });
  assert.match(code, /^HEX1-[A-Za-z0-9_-]+$/);
  const read = readHexSettingsCode(code);
  assert.deepEqual(read.options, normalizeHexOptions(options));
  assert.deepEqual(read.look, { look: "ink", lines: true, numbers: true, legend: "sw", labels: false });
  assert.equal(generateHexMap(read.options).layer.cells, generateHexMap(options).layer.cells);
  assert.ok(hexSettingsCode(defaultHexOptions).length < 40, "defaults make a short code");
  for (const bad of ["", "HEX1-", "HEX1-!!!", "HEX2-eyJ9", "HEX1-" + btoa("[1,2]"), "hello"]) assert.equal(readHexSettingsCode(bad), null, bad);
  const odd = readHexSettingsCode("HEX1-" + btoa(JSON.stringify({ cols: 9000, "look.look": "neon", "look.numbers": "yes", wild: 1 })).replace(/=+$/, ""));
  assert.equal(odd.options.cols, 100); assert.equal(odd.look.look, "painted"); assert.equal(odd.look.numbers, false);
});

test("painting a hex sets its biome and terrain, marks it painted, and water picks shallows or lake", () => {
  const { layer } = generateHexMap(small({ seed: "paint-1", settlements: 3 }));
  const land = hexesOf(layer).findIndex(h => h && !isWaterTerrain(h.terrain) && !layer.places.some(p => p.i === hexesOf(layer).indexOf(h)));
  const painted = paintHex(layer, land, { biome: "volcanic", terrain: "mountain" });
  assert.deepEqual(readHex(painted.cells, land), { biome: "volcanic", terrain: "mountain" });
  assert.deepEqual(painted.painted, [land]);
  assert.equal(paintHex(painted, land, { biome: "volcanic", terrain: "mountain" }), null, "painting the same again changes nothing");
  // Water beside the sea becomes shallows; water inland becomes a lake.
  const hexes = hexesOf(layer), shape = { cols: layer.cols, rows: layer.rows, orient: layer.orient, outline: layer.outline, size: layer.size };
  const nb = hexNeighbours(shape, hexCells(shape));
  const coast = hexes.findIndex((h, i) => h && !isWaterTerrain(h.terrain) && nb[i].some(j => hexes[j]?.terrain === "deep" || hexes[j]?.terrain === "shallow"));
  const inland = hexes.findIndex((h, i) => h && !isWaterTerrain(h.terrain) && nb[i].length === 6 && nb[i].every(j => hexes[j] && !isWaterTerrain(hexes[j].terrain)));
  assert.equal(readHex(paintHex(layer, coast, { biome: "temperate", terrain: "water" }).cells, coast).terrain, "shallow");
  assert.equal(readHex(paintHex(layer, inland, { biome: "temperate", terrain: "water" }).cells, inland).terrain, "lake");
  // A place painted over with water goes.
  const town = layer.places[0];
  assert.ok(!paintHex(layer, town.i, { biome: "temperate", terrain: "water" }).places.some(p => p.i === town.i));
  assert.ok(paintHex(layer, town.i, { biome: "temperate", terrain: "hills" }).places.some(p => p.i === town.i));
  assert.ok(mapDrawingSchema.safeParse(drawingOf(painted)).success);
});

test("finding the hex under a point works for both orientations and every outline, at the map's offset", () => {
  for (const orient of ["flat", "pointy"]) for (const outline of ["rect", "hex", "circle"]) {
    const { layer } = generateHexMap(small({ orient, outline, seed: "find" }));
    const moved = { ...layer, x: 35, y: -20 }, cells = hexCells({ cols: layer.cols, rows: layer.rows, orient, outline, size: layer.size });
    for (const h of cells) {
      const inside = !!readHex(layer.cells, h.i);
      assert.equal(hexAt(moved, { x: h.x + 35, y: h.y - 20 }), inside ? h.i : null);
      if (inside) assert.equal(hexAt(moved, { x: h.x + 35 + layer.size * 0.6, y: h.y - 20 }), h.i, "a point well inside the hex");
      if (inside) assert.deepEqual(hexCentre(moved, h.i), { x: h.x + 35, y: h.y - 20 });
    }
    assert.equal(hexAt(moved, { x: -500, y: -500 }), null);
  }
});

test("restoring a painted hex puts back what the generator made", () => {
  const { layer } = generateHexMap(small({ seed: "restore" }));
  const i = hexesOf(layer).findIndex(h => h && h.terrain === "flat");
  const painted = paintHex(paintHex(layer, i, { biome: "fey", terrain: "forest" }), i + 1, { biome: "fey", terrain: "forest" }) ?? paintHex(layer, i, { biome: "fey", terrain: "forest" });
  const back = restoreHex(painted, i);
  assert.equal(back.cells.slice(i * 2, i * 2 + 2), layer.cells.slice(i * 2, i * 2 + 2));
  assert.ok(!back.painted.includes(i));
  assert.equal(restoreHex(back, i), null, "a hex that is not painted has nothing to restore");
  assert.match(describeHex(painted, i), /^Hex \d{4} · Fey wilds forest( · .+)? · painted$/);
});

test("Regenerate keeps painted hexes, routes rivers and places around them, and keeps the size when it can", () => {
  const { layer } = generateHexMap(small({ seed: "regen", rivers: 6, settlements: 6 }));
  let edited = layer;
  const land = hexesOf(layer).map((h, i) => h && !isWaterTerrain(h.terrain) ? i : -1).filter(i => i >= 0);
  const lakeAt = land[Math.floor(land.length / 2)], peakAt = land[Math.floor(land.length / 3)];
  edited = paintHex(edited, lakeAt, { biome: "temperate", terrain: "water" });
  edited = paintHex(edited, peakAt, { biome: "volcanic", terrain: "peak" });
  edited = { ...edited, x: 12, y: 8, look: "ink" };
  const options = normalizeHexOptions({ ...layer.options, seed: "regen-2" });
  const kept = regenerateHexLayer(edited, options, { ...defaultHexLook, look: "flat" }, true);
  assert.ok(kept.same);
  assert.equal(kept.layer.x, 12); assert.equal(kept.layer.size, layer.size);
  assert.equal(kept.layer.look, "flat");
  assert.deepEqual(readHex(kept.layer.cells, peakAt), { biome: "volcanic", terrain: "peak" });
  assert.ok(isWaterTerrain(readHex(kept.layer.cells, lakeAt).terrain));
  assert.deepEqual(kept.layer.painted, [lakeAt, peakAt].sort((a, b) => a - b));
  assert.ok(!kept.layer.places.some(p => p.i === lakeAt), "no place on painted water");
  assert.notEqual(kept.layer.cells, edited.cells, "the rest of the map changed");
  const dropped = regenerateHexLayer(edited, options, defaultHexLook, false);
  assert.deepEqual(dropped.layer.painted, []);
  assert.equal(dropped.layer.cells, generateHexMap(options, layer.size).layer.cells);
  // A new size keeps painted hexes by column and row and draws at a size that fits.
  const bigger = regenerateHexLayer(edited, { ...options, cols: 30 }, defaultHexLook, true);
  assert.ok(!bigger.same);
  const c = peakAt % layer.cols, r = Math.floor(peakAt / layer.cols);
  assert.deepEqual(readHex(bigger.layer.cells, r * 30 + c), { biome: "volcanic", terrain: "peak" });
  assert.equal(bigger.layer.x, 0);
  assert.ok(mapDrawingSchema.safeParse(drawingOf(bigger.layer)).success);
  // Without painted hexes the generator makes exactly what it made before.
  assert.equal(generateHexMap(options).layer.cells, generateHexMap(options, undefined, []).layer.cells);
});

test("Paint hexes is a tool only on hex maps", () => {
  assert.equal(toolForKey("b"), null);
  assert.equal(toolForKey("b", true), "hex");
  assert.ok(!toolsFor(false).some(t => t.id === "hex"));
  assert.ok(toolsFor(true).some(t => t.id === "hex"));
  const saved = mapDrawingSchema.parse(drawingOf({ ...generateHexMap(small()).layer, painted: undefined }));
  assert.deepEqual(saved.hexes.painted, [], "maps saved before painting read back with nothing painted");
  assert.ok(!mapDrawingSchema.safeParse(drawingOf({ ...generateHexMap(small()).layer, painted: [99999] })).success);
});
