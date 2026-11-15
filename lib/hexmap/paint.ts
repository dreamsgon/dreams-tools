import { biomes, hexCode, isWaterTerrain, readHex, terrainNames, type BiomeId, type TerrainId } from "./biomes.ts";
import { generateHexMap, normalizeHexOptions, type HexKeep, type HexLayer, type HexLook, type HexMapOptions } from "./generate.ts";
import { hexCells, hexNeighbours, type HexCell } from "./layout.ts";
import { placeKindNames } from "./places.ts";

/**
 * Painting a hex map by hand in the Map Creator. A painted hex keeps the biome and terrain it was
 * given, and Regenerate keeps it while the rest of the map changes around it.
 */
export const paintTerrains = [
  ["flat", "Open land"], ["forest", "Forest"], ["hills", "Hills"], ["mountain", "Mountains"], ["peak", "High peaks"],
  ["marsh", "Marsh"], ["beach", "Beach"], ["water", "Water"],
] as const;
/** "water" becomes shallows beside the sea and a lake anywhere else. */
export type PaintTerrain = typeof paintTerrains[number][0];
export type HexPaint = { biome: BiomeId; terrain: PaintTerrain };

type Geometry = { cells: HexCell[]; nb: number[][] };
const geometryCache = new Map<string, Geometry>();
/** The hexes of a layer, at its drawn size and position. */
function geometry(layer: HexLayer): Geometry {
  const key = [layer.cols, layer.rows, layer.orient, layer.outline, layer.size].join("|");
  let g = geometryCache.get(key);
  if (!g) {
    const shape = { cols: layer.cols, rows: layer.rows, orient: layer.orient, outline: layer.outline, size: layer.size };
    const cells = hexCells(shape);
    g = { cells, nb: hexNeighbours(shape, cells) };
    geometryCache.set(key, g); if (geometryCache.size > 6) geometryCache.delete(geometryCache.keys().next().value!);
  }
  return g;
}

/** The hex under a point on the drawing, or null outside the map or its outline. */
export function hexAt(layer: HexLayer, p: { x: number; y: number }): number | null {
  const { cells } = geometry(layer), x = p.x - layer.x, y = p.y - layer.y;
  let best = -1, bd = Infinity;
  // Rough column and row first, then the nearest centre among the hexes around it.
  const flat = layer.orient === "flat", R = layer.size;
  const c0 = Math.round(flat ? (x - R) / (1.5 * R) : x / (Math.sqrt(3) * R) - 0.5), r0 = Math.round(flat ? y / (Math.sqrt(3) * R) - 0.5 : (y - R) / (1.5 * R));
  for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
    if (c < 0 || r < 0 || c >= layer.cols || r >= layer.rows) continue;
    const h = cells[r * layer.cols + c], d = (h.x - x) ** 2 + (h.y - y) ** 2;
    if (d < bd) { bd = d; best = h.i; }
  }
  // The saved cells say which hexes are inside the outline.
  return best >= 0 && bd <= R * R && readHex(layer.cells, best) ? best : null;
}

/** The centre of hex `i` on the drawing. */
export function hexCentre(layer: HexLayer, i: number) {
  const h = geometry(layer).cells[i];
  return { x: h.x + layer.x, y: h.y + layer.y };
}

const setCell = (cells: string, i: number, b: BiomeId, t: TerrainId) => cells.slice(0, i * 2) + hexCode(b, t) + cells.slice(i * 2 + 2);

/** The layer with hex `i` painted, or null when it already looks like that (or is outside the map). */
export function paintHex(layer: HexLayer, i: number, paint: HexPaint): HexLayer | null {
  const now = readHex(layer.cells, i); if (!now) return null;
  const { nb } = geometry(layer);
  let terrain: TerrainId;
  if (paint.terrain === "water") {
    terrain = isWaterTerrain(now.terrain) ? now.terrain : nb[i].some(j => { const h = readHex(layer.cells, j); return h?.terrain === "deep" || h?.terrain === "shallow"; }) ? "shallow" : "lake";
  } else terrain = paint.terrain;
  if (now.biome === paint.biome && now.terrain === terrain && layer.painted.includes(i)) return null;
  // A place cannot stand in water; it goes when its hex is painted over with water.
  const places = isWaterTerrain(terrain) ? layer.places.filter(p => p.i !== i) : layer.places;
  return { ...layer, cells: setCell(layer.cells, i, paint.biome, terrain), painted: layer.painted.includes(i) ? layer.painted : [...layer.painted, i].sort((a, b) => a - b), places };
}

const generatedCache: { key: string; cells: string }[] = [];
/** The hexes as the generator made them, before any painting. */
function generatedCells(layer: HexLayer) {
  const key = JSON.stringify([layer.options, layer.size]);
  const hit = generatedCache.find(g => g.key === key); if (hit) return hit.cells;
  const { cells } = generateHexMap(normalizeHexOptions(layer.options), layer.size).layer;
  generatedCache.unshift({ key, cells }); generatedCache.length = Math.min(generatedCache.length, 3);
  return cells;
}

/** The layer with hex `i` back as the generator made it, or null when it was not painted. */
export function restoreHex(layer: HexLayer, i: number): HexLayer | null {
  if (!layer.painted.includes(i)) return null;
  const made = generatedCells(layer), was = made.length === layer.cells.length ? readHex(made, i) : null;
  return { ...layer, cells: was ? setCell(layer.cells, i, was.biome, was.terrain) : layer.cells, painted: layer.painted.filter(p => p !== i) };
}

/** The painted hexes, to keep through a Regenerate. */
export function keptHexes(layer: HexLayer): HexKeep {
  return layer.painted.flatMap(i => { const h = readHex(layer.cells, i); return h ? [{ c: i % layer.cols, r: Math.floor(i / layer.cols), ...h }] : []; });
}

/**
 * Makes the map again with new options. With `keep`, hexes painted by hand stay as they are.
 * The same columns, rows and hex shape keep the drawn size and place, so shapes drawn on top still line up.
 */
export function regenerateHexLayer(layer: HexLayer, options: HexMapOptions, look: HexLook, keep: boolean) {
  const o = normalizeHexOptions(options);
  const same = o.cols === layer.cols && o.rows === layer.rows && o.orient === layer.orient;
  const made = generateHexMap(o, same ? layer.size : undefined, keep ? keptHexes(layer) : []);
  return { layer: { ...made.layer, ...look, ...(same ? { x: layer.x, y: layer.y } : {}) }, width: made.width, height: made.height, landShare: made.landShare, same };
}

/** What a hex is, for the line under the pointer: "Hex 0412 · Boreal forest · river · painted". */
export function describeHex(layer: HexLayer, i: number) {
  const h = readHex(layer.cells, i); if (!h) return "";
  const c = i % layer.cols, r = Math.floor(i / layer.cols), pad = (n: number) => String(n + 1).padStart(2, "0");
  const what = isWaterTerrain(h.terrain) ? terrainNames[h.terrain] : `${biomes[h.biome].name} ${terrainNames[h.terrain].toLowerCase()}`;
  const place = layer.places.find(p => p.i === i);
  return [`Hex ${pad(c)}${pad(r)}`, what, layer.rivers.some(rv => rv.includes(i)) && "river", layer.roads.some(rd => rd.includes(i)) && "road",
    place && `${place.name} (${placeKindNames[place.kind].toLowerCase()})`, layer.painted.includes(i) && "painted"].filter(Boolean).join(" · ");
}

/** Outlines of the painted hexes, for the dashed marks the Paint tool shows. */
export function paintedOutlines(layer: HexLayer) {
  const { cells } = geometry(layer);
  return layer.painted.map(i => ({ i, x: cells[i].x + layer.x, y: cells[i].y + layer.y }));
}
