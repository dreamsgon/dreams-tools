import { cellFinder, cellShape, fogBrush, mapSize, newMap, pointCell, terrains, type HexNote, type MapData, type MapParty } from './map-model.ts';
import type { Workspace } from './world-model.ts';
import { advanceDate, calendarSchema, type Calendar } from './calendar-model.ts';
import { generateWeather, weatherOn } from './weather-model.ts';

/** Travel pace in miles over an eight-hour day of travel. */
export const paces = {
  slow: { name: 'Slow', milesPerDay: 18 },
  normal: { name: 'Normal', milesPerDay: 24 },
  fast: { name: 'Fast', milesPerDay: 30 },
} as const;
export type Pace = keyof typeof paces;
export const HOURS_PER_DAY = 8;
/** How much longer each terrain takes to cross than open ground. Sea can't be walked. */
export const terrainCost = [Infinity, 1, 1.5, 1.5, 2, 1, 2, 1.5];

/** The label printed on a cell, like 13.07 for column 13, row 7. */
export function cellLabel(m: MapData, i: number) {
  return `${String(i % m.columns + 1).padStart(2, '0')}.${String(Math.floor(i / m.columns) + 1).padStart(2, '0')}`;
}
export const cellWord = (m: MapData) => m.grid === 'hex' ? 'Hex' : 'Square';

/** Distance across one cell, in the map's unit, or null when the map has no width set. */
export function cellDistance(m: MapData) {
  if (!m.scale || m.grid === 'none') return null;
  return m.scale.width / (m.grid === 'hex' ? m.columns + 0.5 : m.columns);
}

// Hex maps use pointy-top hexes with odd rows pushed right. Cube coordinates make lines and rings simple.
const toCube = (m: MapData, i: number) => { const col = i % m.columns, row = Math.floor(i / m.columns); const x = col - (row - (row & 1)) / 2; return { x, z: row, y: -x - row }; };
const fromCube = (m: MapData, x: number, z: number) => { const col = x + (z - (z & 1)) / 2; return col < 0 || col >= m.columns || z < 0 || z >= m.rows ? -1 : z * m.columns + col; };
function roundCube(x: number, y: number, z: number) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}

/** Steps between two cells: hexes for a hex grid, squares (diagonals count as one) otherwise. */
export function cellSteps(m: MapData, a: number, b: number) {
  if (m.grid === 'hex') { const p = toCube(m, a), q = toCube(m, b); return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z)); }
  return Math.max(Math.abs(a % m.columns - b % m.columns), Math.abs(Math.floor(a / m.columns) - Math.floor(b / m.columns)));
}

/** The cells a straight walk from a to b passes through, not counting a. */
export function cellLine(m: MapData, a: number, b: number): number[] {
  const n = cellSteps(m, a, b), out: number[] = [];
  if (m.grid === 'hex') {
    const p = toCube(m, a), q = toCube(m, b);
    for (let i = 1; i <= n; i++) {
      const t = i / n, c = roundCube(p.x + (q.x - p.x) * t + 1e-6, p.y + (q.y - p.y) * t + 1e-6, p.z + (q.z - p.z) * t - 2e-6);
      out.push(fromCube(m, c.x, c.z));
    }
  } else {
    const ac = a % m.columns, ar = Math.floor(a / m.columns), bc = b % m.columns, br = Math.floor(b / m.columns);
    for (let i = 1; i <= n; i++) out.push(Math.round(ar + (br - ar) * i / n) * m.columns + Math.round(ac + (bc - ac) * i / n));
  }
  return out.filter(c => c >= 0);
}

/** The cells touching a cell. */
export function cellNeighbours(m: MapData, i: number) {
  if (m.grid === 'hex') {
    const c = toCube(m, i);
    return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dx, dz]) => fromCube(m, c.x + dx, c.z + dz)).filter(n => n >= 0);
  }
  const col = i % m.columns, row = Math.floor(i / m.columns), out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = col + dx, y = row + dy;
    if ((dx || dy) && x >= 0 && y >= 0 && x < m.columns && y < m.rows) out.push(y * m.columns + x);
  }
  return out;
}

/** Cells a road runs through. Roads ignore the terrain under them. */
export function roadCells(m: MapData) {
  const find = cellFinder(m), out = new Set<number>();
  for (const p of m.paths ?? []) if (p.kind === 'road') for (let i = 1; i < p.points.length; i++) {
    const a = p.points[i - 1], b = p.points[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * Math.max(m.columns, m.rows) * 3));
    for (let k = 0; k <= n; k++) { const c = find(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n); if (c >= 0) out.add(c); }
  }
  return out;
}

export type CrawlPlan = {
  cells: number[]; distance: number; unit: 'mi' | 'km'; hours: number; extraHours: number; slowest: string | null;
  days: number; hoursAfter: number; blocked: number | null;
};

/** Plan a walk from where the party stands to a cell: how far, how long, and how many days pass. */
export function crawlPlan(m: MapData, to: number, pace: Pace): CrawlPlan | null {
  const each = cellDistance(m), from = m.party?.cell;
  if (each === null || from === undefined || from === to) return null;
  const unit = m.scale!.unit, cells = cellLine(m, from, to), roads = roadCells(m);
  const perHour = (unit === 'km' ? paces[pace].milesPerDay * 1.609344 : paces[pace].milesPerDay) / HOURS_PER_DAY;
  let hours = 0, extraHours = 0, slowest: string | null = null, worst = 1, blocked: number | null = null;
  for (const c of cells) {
    const terrain = m.tiles[c], cost = roads.has(c) || terrain === undefined ? 1 : terrainCost[terrain] ?? 1;
    if (cost === Infinity) { blocked ??= c; continue; }
    hours += each * cost / perHour; extraHours += each * (cost - 1) / perHour;
    if (cost > worst) { worst = cost; slowest = terrains[terrain].name; }
  }
  const spent = m.party!.hours + hours;
  // A day ends when its travel hours are used up; finishing exactly at the end of a day doesn't start the next.
  const days = Math.max(0, Math.ceil(spent / HOURS_PER_DAY - 1e-9) - 1);
  return { cells, distance: each * cells.length, unit, hours, extraHours, slowest, days, hoursAfter: spent - days * HOURS_PER_DAY, blocked };
}

/** Roll an encounter check for each cell entered: a 1 on a die with this many sides. */
export function encounterChecks(cells: number[], sides: number, random: () => number = Math.random) {
  return sides > 0 ? cells.filter(() => Math.floor(random() * sides) === 0) : [];
}

/** The map after the party walks the plan: they stand at the end, their trail grows, and what they pass is explored. */
export function moveParty(m: MapData, plan: CrawlPlan, exploredOn?: string): Partial<MapData> {
  const party = m.party!, end = plan.cells.at(-1)!;
  const trail = [...party.trail, party.cell, ...plan.cells.slice(0, -1)].slice(-500);
  const patch: Partial<MapData> = { party: { ...party, cell: end, trail, hours: Math.min(24, plan.hoursAfter) } };
  if (m.fog?.enabled) {
    const seen = new Set(m.fog.revealed);
    for (const c of [...plan.cells, ...cellNeighbours(m, end)]) seen.add(c);
    patch.fog = { ...m.fog, revealed: [...seen].sort((a, b) => a - b) };
  }
  if (exploredOn && m.hexes?.some(h => plan.cells.includes(h.cell) && !h.exploredOn)) {
    patch.hexes = m.hexes.map(h => plan.cells.includes(h.cell) && !h.exploredOn ? { ...h, exploredOn: exploredOn.slice(0, 80) } : h);
  }
  return patch;
}

/** Put the party on a cell without spending any time. */
export function placeParty(m: MapData, cell: number): MapParty {
  return { cell, trail: [], hours: 0, visibility: m.party?.visibility ?? 'gm' };
}

/** The weather region of the place nearest the party that has one for this calendar. */
export function partyRegion(m: MapData, cell: number, campaignId: string, c: Calendar) {
  const size = mapSize(m), at = cellShape(m, cell);
  let best: { d: number; regionId: string } | null = null;
  for (const pin of m.pins) {
    const link = pin.weatherLinks?.find(l => l.campaignId === campaignId && l.calendarId === c.id);
    if (!link || !c.weather?.regions.some(r => r.id === link.regionId && !r.archived)) continue;
    const d = Math.hypot(pin.x * size.width - at.x, pin.y * size.height - at.y);
    if (!best || d < best.d) best = { d, regionId: link.regionId };
  }
  return best ? c.weather!.regions.find(r => r.id === best!.regionId) : undefined;
}

/** Advance a calendar by the days a walk took, with forecasts for any days in the region that have none yet. */
export function advanceCalendar(c: Calendar, days: number, region?: NonNullable<Calendar['weather']>['regions'][number]): Calendar {
  const next = structuredClone(c);
  if (region && next.weather) for (let d = 1; d <= days; d++) {
    const date = advanceDate(next, c.current, d);
    if (!weatherOn(next, region.id, date) && next.weather.days.length < 1000) next.weather.days.push(generateWeather(next, region, date));
  }
  next.current = advanceDate(next, c.current, days);
  return calendarSchema.parse(next);
}

/** Notes for a cell, or blank ones when it has none yet. */
export function hexNote(m: MapData, cell: number): HexNote {
  return m.hexes?.find(h => h.cell === cell) ?? { cell, title: '', notes: '', visibility: 'gm' };
}
/** Save a cell's notes; empty notes are dropped so the map stays small. */
export function setHexNote(m: MapData, note: HexNote): HexNote[] {
  const rest = (m.hexes ?? []).filter(h => h.cell !== note.cell);
  const empty = !note.title.trim() && !note.notes.trim() && !note.tableId && !note.exploredOn;
  return empty ? rest : [...rest, note].sort((a, b) => a.cell - b.cell);
}

/** A new hex crawl around a place on a bigger map: 20 × 14 hexes, each 6 miles (or 10 km) across. */
export function areaMapFor(name: string, unit: 'mi' | 'km' = 'mi'): MapData {
  const m = newMap('hex', 'island', name.slice(0, 100) || 'Area map', 20, 14);
  return { ...m, scale: { width: (unit === 'km' ? 10 : 6) * 20.5, unit }, compass: true, scaleBar: true };
}

/** When the party is on an area map, the place it belongs to is revealed on every map that links it. */
export function revealInParents(w: Workspace, areaId: string): Workspace {
  let changed = false;
  const entries = w.entries.map(e => {
    const m = e.mapData;
    if (!m?.fog?.enabled) return e;
    const pins = m.pins.filter(p => p.areaMapId === areaId);
    if (!pins.length) return e;
    const seen = new Set(m.fog.revealed), before = seen.size;
    for (const p of pins) for (const i of fogBrush(m, pointCell(m, p.x, p.y), 1)) seen.add(i);
    if (seen.size === before) return e;
    changed = true;
    return { ...e, mapData: { ...m, fog: { ...m.fog, revealed: [...seen].sort((a, b) => a - b) } } };
  });
  return changed ? { ...w, entries } : w;
}
