import { decodePaint, placeKinds, terrains, type MapData, type MapPaint } from './map-model.ts';
import { terrainLayerOf } from './terrain-art.ts';

/** Colours for one look of a world or area map. Painted is the original look. */
export type MapLook = {
  name: string; hint: string; paper: string; sea: string; layers: Record<string, string>; coast: string; coastWidth: number;
  ink: string; label: string; halo: string; river: string; road: string; border: string; waves: boolean; frame: boolean;
  glyph: { mountain: string; snow: string; mountainInk: string; tree: string; treeInk: string; hill: string; marsh: string };
};

export const mapLooks: Record<'painted' | 'atlas' | 'ink', MapLook> = {
  painted: {
    name: 'Painted', hint: 'Soft colour, for the table and screens', paper: '#e7e3d5', sea: terrains[0].color, layers: {}, coast: '#5c6f63', coastWidth: 1,
    ink: '#3b3a33', label: '#3b3a33', halo: '#fffdf6', river: '#5b8fa6', road: '#8a5a3b', border: '#8a3b4a', waves: false, frame: false,
    glyph: { mountain: '#b6a98f', snow: '#f3f4ef', mountainInk: '#4f483c', tree: '#557a4d', treeInk: '#3c5537', hill: '#5f5d3f', marsh: '#4a6a5c' },
  },
  atlas: {
    name: 'Old atlas', hint: 'Parchment and brown ink, for handouts', paper: '#e6dcc0', sea: '#e3d7b8',
    layers: { deep: '#dacda9', shallows: '#ece3c8', seaice: '#f2ebd6', land: '#f4ecd5', tundra: '#efe7cf', steppe: '#f2e7c6', savanna: '#f0e1b8', desert: '#f1e3bd', barren: '#ebe0c4', marsh: '#e7e0c2', forest: '#e4dbb5', boreal: '#dfd6ae', jungle: '#d9cfa3', hills: '#ede0bd', mountains: '#e6d8b5', volcanic: '#d8c8a4', snow: '#f8f3e4', ice: '#f8f3e4' },
    coast: '#5a3e22', coastWidth: 1.6, ink: '#5a3e22', label: '#4a3218', halo: '#f4ecd5', river: '#6b5a43', road: '#8a5a3b', border: '#7a3a2a', waves: true, frame: true,
    glyph: { mountain: '#ece0c0', snow: '#faf6ea', mountainInk: '#5a3e22', tree: '#d9cfa3', treeInk: '#5a3e22', hill: '#5a3e22', marsh: '#5a3e22' },
  },
  ink: {
    name: 'Ink', hint: 'Black and white, prints cleanly', paper: '#ffffff', sea: '#ffffff',
    layers: Object.fromEntries(['deep', 'shallows', 'seaice', 'land', 'tundra', 'steppe', 'savanna', 'desert', 'barren', 'marsh', 'forest', 'boreal', 'jungle', 'hills', 'mountains', 'volcanic', 'snow', 'ice'].map(id => [id, '#ffffff'])),
    coast: '#141414', coastWidth: 2, ink: '#141414', label: '#141414', halo: '#ffffff', river: '#141414', road: '#141414', border: '#141414', waves: true, frame: true,
    glyph: { mountain: '#ffffff', snow: '#ffffff', mountainInk: '#141414', tree: '#ffffff', treeInk: '#141414', hill: '#141414', marsh: '#141414' },
  },
};
export type MapLookId = keyof typeof mapLooks;

export const nameFonts = {
  serif: { name: 'Serif', family: "Georgia, 'Times New Roman', serif" },
  plain: { name: 'Plain', family: 'Inter, system-ui, sans-serif' },
  hand: { name: 'Hand', family: "'Segoe Print', 'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', cursive" },
} as const;
export const nameSizes = { small: 0.8, medium: 1, large: 1.25 } as const;

/** The look, font and name size a map is drawn with. Maps without a style keep the painted look. */
export function mapLookOf(m: Pick<MapData, 'mapStyle'>) {
  const s = m.mapStyle ?? {};
  return { look: mapLooks[s.look ?? 'painted'], font: nameFonts[s.font ?? 'serif'].family, size: nameSizes[s.nameSize ?? 'medium'] };
}

export type LegendItem = { kind: 'terrain' | 'place' | 'path'; id: string; name: string; color?: string };
/** A legend made from what the map uses: its terrains, kinds of place and kinds of line. */
export function legendItems(m: MapData, paint: MapPaint | null): LegendItem[] {
  const used = new Set<number>();
  const cells = paint ? decodePaint(paint.columns, paint.rows, paint.cells) : null;
  if (cells) for (const v of cells) used.add(v);
  else if (m.source === 'generated') for (const t of m.tiles) used.add(t);
  const look = mapLookOf(m).look;
  const items: LegendItem[] = [];
  for (let t = 1; t < terrains.length; t++) if (used.has(t)) items.push({ kind: 'terrain', id: String(t), name: terrains[t].name, color: look.layers[terrainLayerOf(t)] ?? terrains[t].color });
  for (const k of placeKinds) if (m.pins.some(p => p.kind === k.id)) items.push({ kind: 'place', id: k.id, name: k.name });
  for (const k of ['river', 'road', 'border'] as const) if (m.paths?.some(p => p.kind === k)) items.push({ kind: 'path', id: k, name: k[0].toUpperCase() + k.slice(1) });
  return items;
}
