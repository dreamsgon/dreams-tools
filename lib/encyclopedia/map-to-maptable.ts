import { newScene, sceneSchema, type Asset, type Grid, type PointOfInterest, type Scene } from '../model.ts';
import { cellDistance } from './hex-crawl.ts';
import { cellShape, mapSize, type MapData } from './map-model.ts';

/** How wide the picture of an Encyclopedia map is on the table, in pixels. */
export const TABLE_WIDTH = 2400;
export const placeMarkerPrefix = 'place-';

export type TableOptions = { markers: boolean; fog: boolean; grid: boolean };

/** The size of the map picture, and how many table pixels make one map unit. */
export function tableImageSize(m: MapData) {
  const s = mapSize(m), scale = Math.min(TABLE_WIDTH / s.width, 8000 / s.height);
  return { width: Math.round(s.width * scale), height: Math.round(s.height * scale), scale };
}

/** What players at the table may see on the map picture: shared lines and names, and nothing under the fog markers. */
export function tablePicture(m: MapData): MapData {
  return { ...m, pins: [], routes: [], fog: undefined, coordinates: false, grid: 'none', party: undefined, hexes: undefined,
    paths: m.paths?.filter(p => p.visibility === 'players'), labels: m.labels?.filter(l => l.visibility === 'players') };
}

/**
 * A short fingerprint of everything that goes onto the table (picture, places, fog, grid), leaving out the link itself,
 * the player preview image and notes that stay in the Encyclopedia. It changes when the table scene would change.
 */
export function tableBasis(m: MapData): string {
  const fog = m.fog ? { enabled: m.fog.enabled, revealed: [...m.fog.revealed].sort((a, b) => a - b) } : undefined;
  const text = JSON.stringify({ ...m, fog, maptableSceneId: undefined, maptableBasis: undefined, hexes: undefined, party: undefined, encounterTableId: undefined, routes: undefined });
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822507); }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + text.length.toString(36);
}

/** Whether a map already on the table has changed since it was last put there. Maps linked before fingerprints were kept count as current. */
export function tableBehind(m: MapData): boolean {
  return !!m.maptableSceneId && !!m.maptableBasis && m.maptableBasis !== tableBasis(m);
}

/**
 * The Maptable campaign a map goes into: the one paired with the open Encyclopedia campaign, else the one paired with
 * the map's own campaign, else one with the same name, else the first. Without this a map always went into the first
 * Maptable campaign, which is rarely the one being played.
 */
export function tableCampaignFor(
  campaigns: { id: string; name: string }[],
  open: { name: string; maptableCampaignId?: string } | null | undefined,
  own: { name: string; maptableCampaignId?: string } | null | undefined,
): string | null {
  const ids = new Set(campaigns.map(c => c.id)), same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const c of [open, own]) if (c?.maptableCampaignId && ids.has(c.maptableCampaignId)) return c.maptableCampaignId;
  for (const c of [open, own]) { const named = c && campaigns.find(m => same(m.name, c.name)); if (named) return named.id; }
  return campaigns[0]?.id ?? null;
}

/** A Maptable grid laid exactly over the map's hexes or squares, measured in the map's miles or kilometres. */
export function tableGrid(m: MapData, base: Grid): Grid {
  const { scale } = tableImageSize(m), each = cellDistance(m);
  const units = each ? Math.min(10000, Math.max(0.01, Math.round(each * 100) / 100)) : base.units;
  const unit = m.scale?.unit ?? base.unit;
  if (m.grid === 'hex') {
    const first = cellShape(m, 0), r = first.h / 2, size = r * scale;
    // Maptable puts hex (0, 0) at offset + size on both axes; our first hex centre is at first.x, first.y.
    return { ...base, type: 'hex-pointy', size, offsetX: first.x * scale - size, offsetY: first.y * scale - size, units, unit, labels: false, snap: true };
  }
  if (m.grid === 'square') return { ...base, type: 'square', size: (mapSize(m).width / m.columns) * scale, offsetX: 0, offsetY: 0, units, unit, labels: false, snap: true };
  return { ...base, type: 'none', units, unit };
}

/** Places on the map become markers on the table. A place with an area map that is on the table opens that scene. */
export function placeMarkers(m: MapData, areaScenes: Record<string, string>): PointOfInterest[] {
  const { width, height } = tableImageSize(m);
  return m.pins.slice(0, 500).map(p => ({
    id: `${placeMarkerPrefix}${p.id}`.slice(0, 120), folderId: null, name: p.title.slice(0, 120) || 'Place',
    x: p.x * width, y: p.y * height, color: p.visibility === 'players' ? '#344f43' : '#8a5a2b', hidden: p.visibility !== 'players',
    targetSceneId: p.areaMapId ? areaScenes[p.areaMapId] ?? null : null, activation: 'double' as const,
    ...(p.notes ? { notes: p.notes.slice(0, 2000) } : {}),
  }));
}

/** The explored cells as fog reveals, over a table covered in fog. */
export function tableFog(m: MapData): Scene['fog'] {
  const { scale } = tableImageSize(m);
  if (!m.fog?.enabled) return { enabled: false, base: true, strokes: [] };
  const strokes = m.fog.revealed.slice(0, 2000).map(i => ({
    mode: 'reveal' as const, shape: 'polygon' as const, size: 5,
    points: cellShape(m, i).points.split(' ').map(pair => { const [x, y] = pair.split(',').map(Number); return { x: x * scale, y: y * scale }; }),
  }));
  return { enabled: true, base: true, strokes };
}

/**
 * The scene for a map: new, or an update of the one made before. An update swaps the picture and the place markers
 * and keeps the table's tokens, effects, drawings and other markers.
 */
export function sceneForMap(m: MapData, title: string, asset: Asset, options: TableOptions, areaScenes: Record<string, string>, existing?: Scene, containerId: string | null = null): Scene {
  const { width, height } = tableImageSize(m);
  const scene: Scene = existing ? structuredClone(existing) : { ...newScene(title.slice(0, 120) || 'Map'), containerId };
  scene.mapType = m.category === 'world' ? 'world' : 'area';
  scene.width = width; scene.height = height; scene.mapId = asset.id; scene.crop = null; scene.drawing = null;
  if (options.grid) scene.grid = tableGrid(m, scene.grid);
  else if (!existing) scene.grid = { ...scene.grid, type: 'none' };
  const kept = (scene.pointsOfInterest ?? []).filter(p => !p.id.startsWith(placeMarkerPrefix));
  scene.pointsOfInterest = [...kept, ...(options.markers ? placeMarkers(m, areaScenes) : [])].slice(0, 500);
  if (options.fog) scene.fog = tableFog(m);
  return sceneSchema.parse(scene);
}
