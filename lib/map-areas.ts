/*
 * Map notes, part 2: areas on Maptable area and combat maps. An area is a box or an outline on the map that
 * opens one section of an Encyclopedia page (a heading and the text under it), so the GM clicks room 6 and
 * reads "6. The Flooded Chapel". Players can open shared areas, and only read what they can already read.
 */
import { polygonContains } from "./fog.ts";
import { isRoom, roomPolygons } from "./map-creator.ts";
import { pairedCampaign } from "./map-notes.ts";
import { playerCampaign, type Workspace } from "./encyclopedia/world-model.ts";
import type { MapArea, MapDrawing } from "./model.ts";

type Point = { x: number; y: number };
export type PageSection = { title: string; number: string | null; level: number; text: string };
export const MAX_AREAS = 200;

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
/** The room number in a heading or a label: "6. The Flooded Chapel", "Area 6", "Room 12b: Well". */
export function sectionNumber(title: string): string | null {
  const t = title.trim();
  return (t.match(/^(?:(?:area|room|location)\s+)?(\d{1,3}[a-z]?)(?=$|[\s.):\-–—])/i)?.[1] ?? t.match(/\b(?:area|room)\s+(\d{1,3}[a-z]?)\b/i)?.[1] ?? null)?.toLowerCase() ?? null;
}

/** A page's sections: each heading with the text under it, up to the next heading at its level or above. */
export function pageSections(body: string): PageSection[] {
  const lines = body.split(/\r?\n/), heads: { at: number; level: number; title: string }[] = [];
  let fence = false;
  lines.forEach((line, at) => { if (/^\s*```/.test(line)) fence = !fence; const m = !fence && line.match(HEADING); if (m) heads.push({ at, level: m[1]!.length, title: m[2]!.trim() }); });
  return heads.map((h, i) => {
    const end = heads.slice(i + 1).find(n => n.level <= h.level)?.at ?? lines.length;
    return { title: h.title, number: sectionNumber(h.title), level: h.level, text: lines.slice(h.at + 1, end).join("\n").trim() };
  });
}
/** The text of a section (by its heading), or the whole page for an empty heading. Null when it's gone. */
export function sectionText(body: string, section: string): string | null {
  if (!section.trim()) return body.trim();
  const want = section.trim().toLowerCase();
  return pageSections(body).find(s => s.title.toLowerCase() === want)?.text ?? null;
}

/** An area's outline: two points are a box's corners, more are a polygon. */
export function areaPolygon(points: readonly Point[]): Point[] {
  if (points.length !== 2) return [...points];
  const [a, b] = points as [Point, Point];
  return [{ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }, { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) }];
}
export function areaBounds(points: readonly Point[]) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
const size = (poly: Point[]) => Math.abs(poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]!; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
/** The smallest area under a point, so a room inside a hall wins. */
export function areaAt<T extends Pick<MapArea, "points">>(areas: readonly T[], at: Point): T | null {
  return areas.map(a => ({ a, poly: areaPolygon(a.points) })).filter(x => polygonContains(x.poly, at)).sort((x, y) => size(x.poly) - size(y.poly))[0]?.a ?? null;
}

/** The outline of the smallest room drawn in the Map Creator under a point. */
export function roomAt(drawing: MapDrawing | null | undefined, at: Point): Point[] | null {
  if (!drawing) return null;
  const polys = drawing.shapes.filter(s => !s.hidden && isRoom(s)).flatMap(s => roomPolygons(s)).filter(p => p.length >= 3 && polygonContains(p, at));
  // Corridors one square wide run through rooms; when a wider room is under the point, it wins.
  const narrow = (p: Point[]) => { const b = areaBounds(p); return Math.min(b.width, b.height) <= (drawing.style?.gridSize ?? 70) * 1.05; };
  const wide = polys.filter(p => !narrow(p)), best = (wide.length ? wide : polys).sort((a, b) => size(a) - size(b))[0];
  return best ? best.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })).slice(0, 400) : null;
}
/** Rooms with a number written in them (a Map Creator label like "6" or "Area 6"), each with its outline. */
export function numberedRooms(drawing: MapDrawing | null | undefined): { number: string; points: Point[] }[] {
  if (!drawing) return [];
  const out = new Map<string, Point[]>();
  for (const s of drawing.shapes) {
    if (s.type !== "label" || s.hidden) continue;
    const n = sectionNumber(s.name), room = n && s.points[0] ? roomAt(drawing, s.points[0]) : null;
    if (n && room && !out.has(n)) out.set(n, room);
  }
  return [...out].map(([number, points]) => ({ number, points }));
}
/** Areas for every numbered room whose number matches a numbered section not linked on this map yet. */
export function linkAllRooms(drawing: MapDrawing | null | undefined, body: string, pageId: string, existing: readonly MapArea[], newId: () => string, playersSee = false): MapArea[] {
  const linked = new Set(existing.filter(a => a.pageId === pageId).map(a => a.section.toLowerCase()));
  const sections = pageSections(body).filter(s => s.number && !linked.has(s.title.toLowerCase()));
  return numberedRooms(drawing).flatMap(r => { const s = sections.find(x => x.number === r.number); return s ? [{ id: newId(), points: r.points, pageId, section: s.title, ...(playersSee ? { playersSee } : {}) }] : []; })
    .slice(0, Math.max(0, MAX_AREAS - existing.length));
}

/** The number shown on an area's badge: its section's number, or its place in the list. */
export const areaLabel = (a: Pick<MapArea, "section">, index: number) => sectionNumber(a.section) ?? String(index + 1);
/** Areas in reading order: by number, then by heading. */
export function orderedAreas<T extends Pick<MapArea, "section">>(areas: readonly T[]): T[] {
  const key = (a: T) => { const n = sectionNumber(a.section); return n ? [parseInt(n, 10), n] as const : [Infinity, ""] as const; };
  return [...areas].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1].localeCompare(key(b)[1]) || a.section.localeCompare(b.section));
}

/**
 * What a player reads in an area: nothing unless the GM shares it and the paired campaign already shows
 * players the page's overview; then that section of the player text (no secrets).
 */
export function playerAreaText(area: Pick<MapArea, "pageId" | "section" | "playersSee">, book: Workspace | null | undefined, maptableCampaignId: string | null) {
  if (!area.playersSee || !book) return null;
  const paired = pairedCampaign(book, maptableCampaignId);
  if (!paired) return null;
  try {
    const page = playerCampaign(book, paired.id).entries.find(e => e.id === area.pageId), body = page?.tabs.find(t => t.id === "overview")?.body;
    if (!page || body === undefined) return null;
    const text = sectionText(body, area.section);
    return text === null ? null : { pageTitle: page.title, title: area.section || page.title, text };
  } catch { return null; }
}
