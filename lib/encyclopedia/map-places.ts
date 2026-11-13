/*
 * Map notes on Encyclopedia maps: what a place, a river or a name on the map shows when the GM clicks it.
 * The card reads its linked page: the opening lines, the info box from its template, GM secrets, and the
 * pages inside it. The list beside the map counts how many pages each place brings with it.
 */
import { plainExcerpt } from "./inline.ts";
import { SECRET_CLOSE, SECRET_OPEN, stripSecrets, visibleEntries, type Entry, type Workspace } from "./world-model.ts";
import { infoRows, templateOf, type InfoRow } from "./templates.ts";
import { placeKinds, type MapData } from "./map-model.ts";
import { kindLabel } from "../map-notes.ts";

export type MapThing = { type: "pin" | "path" | "label"; id: string; title: string; kind: string; entryId: string | null; visibility: "gm" | "players"; x: number; areaMapId?: string | null; notes?: string };
export type PlaceCard = {
  page: { id: string; title: string; kind: string; players: boolean } | null;
  lead: string; info: InfoRow[]; secrets: string[];
  inside: { id: string; title: string; kind: string; excerpt: string; players: boolean }[]; insideCount: number;
};

const pathKinds = { river: "River", road: "Road", border: "Border" } as const;

/** Everything on a map that can open a page: places (pins), then named rivers, roads and borders, then names. */
export function mapThings(map: MapData): MapThing[] {
  return [
    ...map.pins.map(p => ({ type: "pin" as const, id: p.id, title: p.title, kind: placeKinds.find(k => k.id === p.kind)?.name ?? "Place", entryId: p.entryId, visibility: p.visibility, x: p.x, areaMapId: p.areaMapId ?? null, notes: p.notes })),
    ...(map.paths ?? []).filter(p => p.name.trim()).map(p => ({ type: "path" as const, id: p.id, title: p.name, kind: pathKinds[p.kind], entryId: p.entryId ?? null, visibility: p.visibility, x: p.points.reduce((a, q) => a + q.x, 0) / p.points.length })),
    ...(map.labels ?? []).map(l => ({ type: "label" as const, id: l.id, title: l.text, kind: "Name", entryId: l.entryId ?? null, visibility: l.visibility, x: l.x })),
  ];
}

/** The page's opening words: its first paragraph of text, without headings, lists or secrets. */
export function leadText(body: string, max = 260) {
  const paragraphs = stripSecrets(body).split(/\r?\n\s*\r?\n/).map(p => p.split(/\r?\n/).filter(l => !/^\s*(#|[-*] |\d+\. |>|:::|\|)/.test(l)).join(" ").trim()).filter(Boolean);
  return paragraphs.length ? plainExcerpt(paragraphs[0]!, max) : "";
}

/** The text of each `::: secret` block, as short plain lines. */
export function secretBlocks(body: string, max = 3) {
  const out: string[] = []; let open: string[] | null = null;
  for (const line of body.split("\n")) {
    const bare = line.replace(/\r$/, "");
    if (!open && SECRET_OPEN.test(bare)) { open = []; continue; }
    if (open) { if (SECRET_CLOSE.test(bare)) { const t = plainExcerpt(open.join("\n"), 240); if (t) out.push(t); open = null; } else open.push(bare); }
  }
  if (open) { const t = plainExcerpt(open.join("\n"), 240); if (t) out.push(t); }
  return out.slice(0, max);
}

const readable = (s: Workspace, map: Entry) => new Map(visibleEntries(s, map.worldId, map.campaignId).map(e => [e.id, e]));

/** What the card shows for a thing on the map, read from its linked page as the GM sees it. */
export function placeCard(s: Workspace, mapEntry: Entry, entryId: string | null, inside = 6): PlaceCard {
  const pages = readable(s, mapEntry), e = entryId ? pages.get(entryId) : undefined;
  if (!e) return { page: null, lead: "", info: [], secrets: [], inside: [], insideCount: 0 };
  const template = templateOf(s, e), children = [...pages.values()].filter(c => c.parentId === e.id && c.kind !== "folder" && c.kind !== "tasks").sort((a, b) => a.title.localeCompare(b.title));
  return {
    page: { id: e.id, title: e.title, kind: kindLabel(e), players: e.overviewVisibility === "players" },
    lead: leadText(e.body), info: template ? infoRows(s, template, e) : [], secrets: secretBlocks(e.body),
    inside: children.slice(0, inside).map(c => ({ id: c.id, title: c.title, kind: kindLabel(c), excerpt: leadText(c.body, 140), players: c.overviewVisibility === "players" })),
    insideCount: children.length,
  };
}

/** How many pages a thing on the map brings: its page and the pages inside it. 0 when nothing is linked. */
export function linkedCount(s: Workspace, mapEntry: Entry, entryId: string | null) {
  if (!entryId) return 0;
  const pages = readable(s, mapEntry);
  if (!pages.has(entryId)) return 0;
  return 1 + [...pages.values()].filter(c => c.parentId === entryId && c.kind !== "folder" && c.kind !== "tasks").length;
}

/** Links (or unlinks) a page to a place, a river or a name on the map. */
export function linkThing(map: MapData, thing: Pick<MapThing, "type" | "id">, entryId: string | null): MapData {
  if (thing.type === "pin") return { ...map, pins: map.pins.map(p => p.id === thing.id ? { ...p, entryId } : p) };
  if (thing.type === "path") return { ...map, paths: map.paths?.map(p => p.id === thing.id ? { ...p, entryId } : p) };
  return { ...map, labels: map.labels?.map(l => l.id === thing.id ? { ...l, entryId } : l) };
}
