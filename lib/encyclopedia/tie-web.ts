import type { Entry, Workspace } from "./world-model.ts";
import { tieLabel, tieTypeById, tieTypesOf, type TieGroup, type TieType } from "./ties.ts";
import { worldTies, type TieSource } from "./tie-connections.ts";
import { vehicleRolesOf, vehicleTypeOf } from "./vehicles.ts";

/*
 * The relationship web of a whole campaign (or a world's shared lore): every page with a tie, and one line per pair of
 * pages holding all the ties between them. Organization members and vehicle crew can be drawn too, as worked-out lines.
 * A players' version keeps only what players see: shared ties, and cover stories in place of GM-only ones, between pages
 * they can read. The layout is worked out here as well, so the same web always lands the same way.
 */

/** Kinds of page the web can show or hide, as one filter each. */
export const webPageKinds = ["character", "faction", "place", "lore", "vehicle", "quest", "other"] as const;
export type WebPageKind = typeof webPageKinds[number];
export const webPageKindNames: Record<WebPageKind, string> = { character: "Characters", faction: "Organizations", place: "Places", lore: "Lore", vehicle: "Vehicles", quest: "Quests", other: "Other pages" };
export const webKindOf = (kind: string): WebPageKind => kind === "map" ? "place" : (webPageKinds as readonly string[]).includes(kind) ? kind as WebPageKind : "other";

export type WebTie = {
  key: string; source: TieSource | "worked";
  /** Where it is stored, for editing (typed ties and People ties only). */
  ownerId?: string; id?: string;
  fromId: string; toId: string;
  /** Its name read from where it starts (Parent of), and from where it goes (Child of). */
  name: string; reverse: string;
  group: TieGroup | "worked"; gm: boolean; note?: string;
  /** On a GM-only tie: what players believe instead, named the same way. */
  cover?: { name: string; reverse: string; group: TieGroup; note?: string; reversed: boolean };
};
export type WebNode = { id: string; title: string; kind: WebPageKind; degree: number };
/** A line between two pages (`a` sorts before `b`) and every tie between them. */
export type WebEdge = { key: string; a: string; b: string; ties: WebTie[] };
export type Web = { nodes: WebNode[]; edges: WebEdge[] };

/** Pages the web can show: a campaign's pages and its world's shared lore, or only the lore when there is no campaign. */
export function webPages(s: Workspace, worldId: string, campaignId: string | null): Entry[] {
  return s.entries.filter(e => e.worldId === worldId && e.kind !== "folder" && e.kind !== "tasks" && (e.campaignId === null || e.campaignId === campaignId));
}

/** Every tie among a campaign's pages (and, with `worked`, organization members and vehicle crew and places). */
export function webTies(s: Workspace, worldId: string, campaignId: string | null, opts: { worked?: boolean; types?: TieType[] } = {}): WebTie[] {
  const types = opts.types ?? tieTypesOf(s.worlds.find(w => w.id === worldId));
  const pages = webPages(s, worldId, campaignId), scope = new Set(pages.map(e => e.id));
  const out: WebTie[] = [];
  for (const x of worldTies(s, worldId, types)) {
    if (!scope.has(x.fromId) || !scope.has(x.toId) || x.fromId === x.toId) continue;
    const c = x.tie.cover, ct = c ? tieTypeById(types, c.typeId) : undefined;
    out.push({ key: x.key, source: x.source, ownerId: x.ownerId, id: x.tie.id, fromId: x.fromId, toId: x.toId, name: tieLabel(x.type, true), reverse: tieLabel(x.type, false), group: x.type.group, gm: !!x.tie.gm,
      ...(x.tie.note ? { note: x.tie.note } : {}),
      ...(c && ct ? { cover: { name: tieLabel(ct, true), reverse: tieLabel(ct, false), group: ct.group, reversed: !!c.reversed, ...(c.note ? { note: c.note } : {}) } } : {}) });
  }
  if (opts.worked) {
    const world = s.worlds.find(w => w.id === worldId);
    const add = (fromId: string, toId: string, name: string, reverse: string, note?: string) => {
      if (!scope.has(fromId) || !scope.has(toId) || fromId === toId) return;
      const key = `worked:${fromId}:${toId}:${name}`;
      if (!out.some(t => t.key === key)) out.push({ key, source: "worked", fromId, toId, name, reverse, group: "worked", gm: false, ...(note ? { note } : {}) });
    };
    for (const org of pages) if (org.kind === "faction") for (const b of org.org?.blocks ?? []) {
      if (b.kind === "spots") for (const sp of b.spots) for (const p of sp.people) add(p.entryId, org.id, "Member of", "Has member", sp.title || undefined);
      if (b.kind === "members") for (const m of b.members) add(m.entryId, org.id, "Member of", "Has member", m.role || undefined);
    }
    for (const veh of pages) if (veh.kind === "vehicle" && veh.vehicle) {
      const v = veh.vehicle, vt = vehicleTypeOf(v, world);
      for (const id of scope) { const roles = vehicleRolesOf(v, vt, id); if (roles.length) add(id, veh.id, roles.join(" · "), "Crewed by"); }
      if (v.locationId) add(veh.id, v.locationId, "Is at", "Vehicle here");
    }
  }
  return out;
}

/**
 * The ties players see, as they see them: shared ties, and the cover story of a GM-only tie, only between pages they can
 * read. People ties count only when that character's Profile is shared. Worked-out lines are left as they are.
 */
export function playersWebTies(ties: WebTie[], readable: (id: string) => boolean, profileShared: (id: string) => boolean): WebTie[] {
  return ties.flatMap((t): WebTie[] => {
    if (!readable(t.fromId) || !readable(t.toId)) return [];
    if (t.source === "profile" && !profileShared(t.ownerId!)) return [];
    if (!t.gm) { const { cover: _c, ...rest } = t; void _c; return [rest]; }
    if (!t.cover) return [];
    const c = t.cover, [fromId, toId] = c.reversed ? [t.toId, t.fromId] : [t.fromId, t.toId];
    return [{ key: t.key, source: t.source, fromId, toId, name: c.name, reverse: c.reverse, group: c.group, gm: false, ...(c.note ? { note: c.note } : {}) }];
  });
}

/** Groups ties into lines between pairs of pages, and the pages they join, most connected first. */
export function buildWeb(s: Workspace, ties: WebTie[]): Web {
  const byPair = new Map<string, WebEdge>();
  for (const t of ties) {
    const [a, b] = t.fromId < t.toId ? [t.fromId, t.toId] : [t.toId, t.fromId], key = `${a}|${b}`;
    const edge = byPair.get(key) ?? { key, a, b, ties: [] };
    edge.ties.push(t); byPair.set(key, edge);
  }
  const degree = new Map<string, number>();
  for (const e of byPair.values()) { degree.set(e.a, (degree.get(e.a) ?? 0) + 1); degree.set(e.b, (degree.get(e.b) ?? 0) + 1); }
  const byId = new Map(s.entries.map(e => [e.id, e]));
  const nodes = [...degree].flatMap(([id, d]) => { const e = byId.get(id); return e ? [{ id, title: e.title, kind: webKindOf(e.kind), degree: d }] : []; })
    .sort((x, y) => y.degree - x.degree || x.title.localeCompare(y.title));
  return { nodes, edges: [...byPair.values()] };
}

/** Keeps the ties of these groups (worked-out lines count as "worked") between pages of these kinds. */
export function filterWeb(web: Web, groups: ReadonlySet<string>, kinds: ReadonlySet<WebPageKind>): Web {
  const kindOf = new Map(web.nodes.map(n => [n.id, n.kind]));
  const edges = web.edges.flatMap(e => {
    if (!kinds.has(kindOf.get(e.a)!) || !kinds.has(kindOf.get(e.b)!)) return [];
    const ties = e.ties.filter(t => groups.has(t.group));
    return ties.length ? [{ ...e, ties }] : [];
  });
  const degree = new Map<string, number>();
  for (const e of edges) { degree.set(e.a, (degree.get(e.a) ?? 0) + 1); degree.set(e.b, (degree.get(e.b) ?? 0) + 1); }
  return { nodes: web.nodes.filter(n => degree.has(n.id)).map(n => ({ ...n, degree: degree.get(n.id)! })), edges };
}

/** One page and the pages within `depth` lines of it, with every line between them. */
export function focusWeb(web: Web, id: string, depth = 1): Web {
  const keep = new Set([id]);
  for (let d = 0; d < depth; d++) {
    const next = new Set(keep);
    for (const e of web.edges) { if (keep.has(e.a)) next.add(e.b); if (keep.has(e.b)) next.add(e.a); }
    next.forEach(x => keep.add(x));
  }
  return { nodes: web.nodes.filter(n => keep.has(n.id)), edges: web.edges.filter(e => keep.has(e.a) && keep.has(e.b)) };
}

/** How a tie reads from one end of it. */
export const webTieLabel = (t: WebTie, from: string) => t.fromId === from ? t.name : t.reverse;

export type Point = { x: number; y: number };
/**
 * Places the pages: spread out by a force layout (pages push apart, lines pull together), the same every time for the
 * same web. Coordinates are around 0,0 and fit roughly in `size` across.
 */
export function layoutWeb(web: Web, size = 1000, steps = 260): Map<string, Point> {
  const n = web.nodes.length, at = new Map<string, Point>();
  if (!n) return at;
  if (n === 1) { at.set(web.nodes[0].id, { x: 0, y: 0 }); return at; }
  const index = new Map(web.nodes.map((v, i) => [v.id, i]));
  // Start on a spiral, most connected in the middle, so the result doesn't depend on chance.
  const xs = new Float64Array(n), ys = new Float64Array(n);
  web.nodes.forEach((_, i) => { const r = size * 0.42 * Math.sqrt((i + 0.5) / n), a = i * 2.399963; xs[i] = Math.cos(a) * r; ys[i] = Math.sin(a) * r; });
  const links = web.edges.map(e => [index.get(e.a)!, index.get(e.b)!] as const).filter(([a, b]) => a !== undefined && b !== undefined);
  const k = size * 0.75 / Math.sqrt(n), dx = new Float64Array(n), dy = new Float64Array(n);
  let heat = size / 8;
  for (let step = 0; step < steps; step++) {
    dx.fill(0); dy.fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let x = xs[i] - xs[j], y = ys[i] - ys[j]; let d2 = x * x + y * y;
      if (d2 < 0.01) { x = 0.1 * ((i % 3) - 1 || 1); y = 0.1; d2 = x * x + y * y; }
      const f = k * k / d2; dx[i] += x * f; dy[i] += y * f; dx[j] -= x * f; dy[j] -= y * f;
    }
    for (const [a, b] of links) {
      const x = xs[a] - xs[b], y = ys[a] - ys[b], d = Math.sqrt(x * x + y * y) || 0.01, f = d / k;
      dx[a] -= x * f; dy[a] -= y * f; dx[b] += x * f; dy[b] += y * f;
    }
    for (let i = 0; i < n; i++) {
      // A pull to the middle keeps separate groups of pages from drifting far apart.
      dx[i] -= xs[i] * 0.6; dy[i] -= ys[i] * 0.6;
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1, m = Math.min(d, heat);
      xs[i] += dx[i] / d * m; ys[i] += dy[i] / d * m;
    }
    heat = Math.max(1, heat * 0.975);
  }
  // Pages in separate clusters push each other far apart: draw the whole thing no wider or taller than `size`.
  let extent = 0;
  for (let i = 0; i < n; i++) extent = Math.max(extent, Math.abs(xs[i]), Math.abs(ys[i]));
  const fit = extent * 2 > size ? size / (extent * 2) : 1;
  web.nodes.forEach((v, i) => at.set(v.id, { x: Math.round(xs[i] * fit * 10) / 10, y: Math.round(ys[i] * fit * 10) / 10 }));
  return at;
}

/** The focused page in the middle, the pages tied to it on a ring, and those one step further on an outer ring. */
export function radialLayout(web: Web, id: string, size = 1000): Map<string, Point> {
  const at = new Map<string, Point>([[id, { x: 0, y: 0 }]]);
  const first = web.nodes.filter(n => n.id !== id && web.edges.some(e => (e.a === id && e.b === n.id) || (e.b === id && e.a === n.id)));
  const ring1 = new Set(first.map(n => n.id)), rest = web.nodes.filter(n => n.id !== id && !ring1.has(n.id));
  const place = (list: WebNode[], r: number, turn = 0) => list.forEach((n, i) => { const a = -Math.PI / 2 + turn + i * 2 * Math.PI / list.length; at.set(n.id, { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) }); });
  place(first, size * (rest.length ? 0.24 : 0.32));
  place(rest, size * 0.44, Math.PI / Math.max(rest.length, 1));
  return at;
}
