import { defaultCharacter, type Entry, type Workspace } from "./world-model.ts";
import { tieFits, type TieType, type TreeRole } from "./ties.ts";
import type { WebTie } from "./tie-web.ts";
import { orgPeople } from "./tie-connections.ts";
import { canHoldTie, putTie } from "./tie-edit.ts";

/*
 * Family trees, worked out from ties whose kind counts as family (Parent of, Married to, Sibling of, Guardian of, and any
 * kind the GM sets to draw on a tree). A family is everyone who shares an ancestor with the people it starts from, plus
 * those they married and the other parents of their children. In-laws are drawn without their own parents, so a
 * marriage between two houses doesn't pull one house into the other's tree. Generations, couples and where every box
 * and line goes are worked out here, so the same family always lands the same way.
 */

/** A family tie between two characters. Parent and ward ties go from the parent or guardian. */
export type FamilyLink = { key: string; role: TreeRole; fromId: string; toId: string; gm: boolean; name: string; reverse: string; note?: string; index: number };

/** The family ties among characters, from a campaign's ties (or the players' version of them). */
export function familyLinks(ties: WebTie[], isPerson: (id: string) => boolean): FamilyLink[] {
  const out: FamilyLink[] = [];
  for (const t of ties) {
    if (!t.tree || t.source === "worked" || t.fromId === t.toId || !isPerson(t.fromId) || !isPerson(t.toId)) continue;
    out.push({ key: t.key, role: t.tree, fromId: t.fromId, toId: t.toId, gm: t.gm, name: t.name, reverse: t.reverse, ...(t.note ? { note: t.note } : {}), index: out.length });
  }
  return out;
}

type Links = Map<string, Set<string>>;
export type FamilyGraph = { links: FamilyLink[]; parents: Links; children: Links; partners: Links; siblings: Links; guardians: Links; wards: Links };
const EMPTY: ReadonlySet<string> = new Set();
const put = (m: Links, a: string, b: string) => { let s = m.get(a); if (!s) m.set(a, s = new Set()); s.add(b); };
export const linked = (m: Links, id: string): ReadonlySet<string> => m.get(id) ?? EMPTY;

export function familyGraph(links: FamilyLink[]): FamilyGraph {
  const g: FamilyGraph = { links, parents: new Map(), children: new Map(), partners: new Map(), siblings: new Map(), guardians: new Map(), wards: new Map() };
  for (const l of links) {
    if (l.role === "parent") { put(g.children, l.fromId, l.toId); put(g.parents, l.toId, l.fromId); }
    else if (l.role === "ward") { put(g.wards, l.fromId, l.toId); put(g.guardians, l.toId, l.fromId); }
    else { const m = l.role === "partner" ? g.partners : g.siblings; put(m, l.fromId, l.toId); put(m, l.toId, l.fromId); }
  }
  return g;
}

/** At most this many people in one tree. */
export const MAX_FAMILY = 200;

function closure(start: Iterable<string>, next: (id: string) => Iterable<string>, limit: number): Set<string> {
  const seen = new Set<string>(), queue = [...start];
  while (queue.length && seen.size < limit) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const n of next(id)) if (!seen.has(n)) queue.push(n);
  }
  return seen;
}

/**
 * Who is in the family that starts from `seeds`: their ancestors (and guardians and siblings), everyone descended from
 * those (blood), and the people the blood family married or had children with (in-laws, not followed further). For a
 * `house` (the people of a family organization), a member's parent who isn't a member is followed up only when neither
 * parent is one.
 */
export function familyMembers(g: FamilyGraph, seeds: string[], limit = MAX_FAMILY, house = false): { blood: Set<string>; inLaws: Set<string>; cut: boolean } {
  // A house follows its own line: where one parent is in the house, the other parent's family stays out of its tree.
  const own = new Set(seeds);
  const parentsOf = (id: string) => { const ps = [...linked(g.parents, id)]; return house && ps.some(p => own.has(p)) ? ps.filter(p => own.has(p)) : ps; };
  const up = closure(seeds, id => [...parentsOf(id), ...linked(g.guardians, id), ...linked(g.siblings, id)], limit);
  const blood = closure(up, id => [...linked(g.children, id), ...linked(g.wards, id), ...linked(g.siblings, id)], limit);
  const inLaws = new Set<string>();
  for (const id of blood) {
    for (const p of linked(g.partners, id)) if (!blood.has(p)) inLaws.add(p);
    for (const c of linked(g.children, id)) for (const p of linked(g.parents, c)) if (!blood.has(p)) inLaws.add(p);
  }
  const all = blood.size + inLaws.size;
  if (all > limit) { const keep = [...inLaws].slice(0, Math.max(0, limit - blood.size)); return { blood, inLaws: new Set(keep), cut: true }; }
  return { blood, inLaws, cut: blood.size >= limit };
}

/** Pairs of people who had a child together, whether or not a tie says they are partners. */
function coParents(g: FamilyGraph, members: ReadonlySet<string>): [string, string][] {
  const out: [string, string][] = [], seen = new Set<string>();
  for (const [child, ps] of g.parents) {
    if (!members.has(child)) continue;
    const list = [...ps].filter(p => members.has(p)).sort();
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const k = `${list[i]}|${list[j]}`;
      if (!seen.has(k)) { seen.add(k); out.push([list[i], list[j]]); }
    }
  }
  return out;
}

/**
 * Each person's generation, 0 for the eldest: a child is at least one below each parent (and a ward below a guardian),
 * partners, co-parents and siblings share one. Ties that can't all hold (a loop) settle as best they can.
 */
export function generations(g: FamilyGraph, members: ReadonlySet<string>, order: string[]): Map<string, number> {
  const gen = new Map<string, number>(), co = coParents(g, members);
  const coOf = new Map<string, string[]>();
  for (const [a, b] of co) { (coOf.get(a) ?? coOf.set(a, []).get(a)!).push(b); (coOf.get(b) ?? coOf.set(b, []).get(b)!).push(a); }
  const steps = (id: string): [string, number][] => [
    ...[...linked(g.parents, id), ...linked(g.guardians, id)].map(x => [x, -1] as [string, number]),
    ...[...linked(g.children, id), ...linked(g.wards, id)].map(x => [x, 1] as [string, number]),
    ...[...linked(g.partners, id), ...linked(g.siblings, id), ...(coOf.get(id) ?? [])].map(x => [x, 0] as [string, number]),
  ];
  for (const start of [...order, ...members]) {
    if (!members.has(start) || gen.has(start)) continue;
    gen.set(start, 0);
    const queue = [start];
    while (queue.length) {
      const id = queue.shift()!, at = gen.get(id)!;
      for (const [x, d] of steps(id)) if (members.has(x) && !gen.has(x)) { gen.set(x, at + d); queue.push(x); }
    }
  }
  // Settle: children below parents, pairs level. Bounded, so a loop in the ties can't hang it.
  const below = [...g.links.filter(l => l.role === "parent" || l.role === "ward").map(l => [l.fromId, l.toId] as const)].filter(([a, b]) => members.has(a) && members.has(b));
  const level = [...g.links.filter(l => l.role === "partner" || l.role === "sibling").map(l => [l.fromId, l.toId] as const), ...co].filter(([a, b]) => members.has(a) && members.has(b));
  for (let pass = 0, changed = true; changed && pass < members.size * 2 + 10; pass++) {
    changed = false;
    for (const [p, c] of below) if (gen.get(c)! < gen.get(p)! + 1) { gen.set(c, gen.get(p)! + 1); changed = true; }
    for (const [a, b] of level) { const m = Math.max(gen.get(a)!, gen.get(b)!); if (gen.get(a) !== m || gen.get(b) !== m) { gen.set(a, m); gen.set(b, m); changed = true; } }
  }
  const low = Math.min(...gen.values());
  for (const [id, v] of gen) gen.set(id, v - low);
  return gen;
}

/** A row of boxes drawn side by side: one person, or a couple (or someone and each of their partners). */
export type FamilyUnit = { id: string; people: string[]; gen: number };
export type TreeLineKind = "partner" | "coparent" | "child" | "ward" | "sibling";
/** A line on the tree, as points to join. `ids` are the people it joins. */
export type TreeLine = { key: string; kind: TreeLineKind; points: [number, number][]; gm: boolean; ids: string[] };
export type FamilyTree = {
  blood: Set<string>; inLaws: Set<string>; gens: Map<string, number>; cut: boolean;
  units: FamilyUnit[]; unitOf: Map<string, string>;
  /** Units with no parents in the tree, left to right, and each unit's children's units. */
  roots: string[]; kids: Map<string, string[]>;
  /** Where each box goes: its middle across, and its top. */
  at: Map<string, { x: number; y: number }>;
  lines: TreeLine[]; width: number; height: number;
};

export const BOX_W = 156, BOX_H = 52, GAP = 22, SUB_GAP = 30, ROOT_GAP = 64, ROW = 128;

/** The family tree that starts from these people, laid out. */
export function familyTree(g: FamilyGraph, seeds: string[], limit = MAX_FAMILY, house = false): FamilyTree {
  const { blood, inLaws, cut } = familyMembers(g, seeds, limit, house);
  const members = new Set([...blood, ...inLaws]);
  const order = [...seeds, ...blood, ...inLaws];
  const gens = generations(g, members, order);
  const rank = new Map<string, number>();
  order.forEach(id => { if (!rank.has(id)) rank.set(id, rank.size); });

  // Units: people joined by a partner tie or a child in common, in the same generation.
  const join = new Map<string, Set<string>>();
  const pair = (a: string, b: string) => { if (members.has(a) && members.has(b) && gens.get(a) === gens.get(b)) { put(join, a, b); put(join, b, a); } };
  for (const l of g.links) if (l.role === "partner") pair(l.fromId, l.toId);
  for (const [a, b] of coParents(g, members)) pair(a, b);
  const units: FamilyUnit[] = [], unitOf = new Map<string, string>();
  const byRank = (a: string, b: string) => Number(inLaws.has(a)) - Number(inLaws.has(b)) || rank.get(a)! - rank.get(b)!;
  for (const id of [...members].sort(byRank)) {
    if (unitOf.has(id)) continue;
    const group = [...closure([id], x => linked(join, x), members.size)];
    // Walk from an end (blood first), so a person with two partners sits between them.
    const ends = group.filter(x => linked(join, x).size <= 1).sort(byRank);
    const people: string[] = [], seen = new Set<string>();
    // Partners before people who only had a child together, so a married couple stays side by side.
    const married = (x: string, n: string) => Number(!linked(g.partners, x).has(n));
    const walk = (x: string) => { if (seen.has(x)) return; seen.add(x); people.push(x); for (const n of [...linked(join, x)].sort((a, b) => married(x, a) - married(x, b) || byRank(a, b))) walk(n); };
    walk(ends[0] ?? group.sort(byRank)[0]);
    const u: FamilyUnit = { id: `u${units.length}`, people, gen: gens.get(id)! };
    units.push(u); people.forEach(p => unitOf.set(p, u.id));
  }
  const unitById = new Map(units.map(u => [u.id, u]));

  // Each unit hangs under the unit of its parents (or guardians, or a sibling's parents), always a generation up.
  const firstLink = (child: string, parentUnit: string) => Math.min(...g.links.filter(l => (l.role === "parent" || l.role === "ward") && l.toId === child && unitOf.get(l.fromId) === parentUnit).map(l => l.index), Infinity);
  const parentUnit = new Map<string, { unit: string; child: string }>();
  const upFrom = (p: string, gen: number) => [...linked(g.parents, p), ...linked(g.guardians, p)].map(x => unitOf.get(x)).find(x => x && unitById.get(x)!.gen < gen);
  for (const u of units) {
    const people = [...u.people].sort(byRank);
    let found: { unit: string; child: string } | undefined;
    for (const p of people) { const pu = upFrom(p, u.gen); if (pu) { found = { unit: pu, child: p }; break; } }
    if (!found) for (const p of people) for (const s of linked(g.siblings, p)) { const pu = members.has(s) ? upFrom(s, u.gen) : undefined; if (pu) { found = { unit: pu, child: p }; break; } }
    if (found) parentUnit.set(u.id, found);
  }
  const kids = new Map<string, string[]>();
  for (const u of units) { const pu = parentUnit.get(u.id); if (pu) (kids.get(pu.unit) ?? kids.set(pu.unit, []).get(pu.unit)!).push(u.id); }
  for (const [pu, list] of kids) {
    const people = unitById.get(pu)!.people;
    const key = (id: string) => { const c = parentUnit.get(id)!.child, ps = [...linked(g.parents, c), ...linked(g.guardians, c)].map(x => people.indexOf(x)).filter(i => i >= 0); return [ps.length ? Math.min(...ps) + Math.max(...ps) : 99, firstLink(c, pu)]; };
    list.sort((a, b) => { const [x1, y1] = key(a), [x2, y2] = key(b); return x1 - x2 || y1 - y2 || rank.get(unitById.get(a)!.people[0])! - rank.get(unitById.get(b)!.people[0])!; });
  }
  const roots = units.filter(u => !parentUnit.has(u.id)).sort((a, b) => a.gen - b.gen || rank.get(a.people[0])! - rank.get(b.people[0])!).map(u => u.id);

  // Lay out: each unit is as wide as itself or its children's units side by side, whichever is wider, and sits over the middle.
  const unitW = (u: FamilyUnit) => u.people.length * BOX_W + (u.people.length - 1) * GAP;
  const widthOf = new Map<string, number>();
  const measure = (id: string): number => {
    const list = kids.get(id) ?? [], kw = list.reduce((s, k) => s + measure(k), 0) + Math.max(0, list.length - 1) * SUB_GAP;
    const w = Math.max(unitW(unitById.get(id)!), kw); widthOf.set(id, w); return w;
  };
  const at = new Map<string, { x: number; y: number }>();
  const place = (id: string, left: number) => {
    const u = unitById.get(id)!, w = widthOf.get(id)!, list = kids.get(id) ?? [];
    const kw = list.reduce((s, k) => s + widthOf.get(k)!, 0) + Math.max(0, list.length - 1) * SUB_GAP;
    let x = left + (w - kw) / 2;
    for (const k of list) { place(k, x); x += widthOf.get(k)! + SUB_GAP; }
    const ux = left + (w - unitW(u)) / 2;
    u.people.forEach((p, i) => at.set(p, { x: ux + BOX_W / 2 + i * (BOX_W + GAP), y: u.gen * ROW }));
  };
  let left = 0;
  for (const r of roots) { measure(r); place(r, left); left += widthOf.get(r)! + ROOT_GAP; }
  const width = Math.max(BOX_W, left - ROOT_GAP), height = units.length ? Math.max(...units.map(u => u.gen)) * ROW + BOX_H : 0;

  // Lines.
  const lines: TreeLine[] = [], midY = BOX_H / 2;
  const adjacent = (a: string, b: string) => { const p = at.get(a)!, q = at.get(b)!; return p.y === q.y && Math.abs(p.x - q.x) <= BOX_W + GAP + 0.5; };
  const done = new Set<string>();
  for (const l of g.links) {
    if (l.role !== "partner" || !at.has(l.fromId) || !at.has(l.toId)) continue;
    const [a, b] = at.get(l.fromId)!.x <= at.get(l.toId)!.x ? [l.fromId, l.toId] : [l.toId, l.fromId], p = at.get(a)!, q = at.get(b)!;
    done.add([a, b].sort().join("|"));
    const pts: [number, number][] = adjacent(a, b) ? [[p.x + BOX_W / 2, p.y + midY], [q.x - BOX_W / 2, q.y + midY]]
      : p.y === q.y ? [[p.x, p.y + BOX_H], [p.x, p.y + BOX_H + 12], [q.x, q.y + BOX_H + 12], [q.x, q.y + BOX_H]] : [[p.x, p.y + midY], [q.x, q.y + midY]];
    lines.push({ key: l.key, kind: "partner", points: pts, gm: l.gm, ids: [a, b] });
  }
  for (const [a0, b0] of coParents(g, members)) {
    if (done.has([a0, b0].sort().join("|")) || !at.has(a0) || !at.has(b0) || !adjacent(a0, b0)) continue;
    const [a, b] = at.get(a0)!.x <= at.get(b0)!.x ? [a0, b0] : [b0, a0], p = at.get(a)!, q = at.get(b)!;
    lines.push({ key: `co:${a}:${b}`, kind: "coparent", points: [[p.x + BOX_W / 2, p.y + midY], [q.x - BOX_W / 2, q.y + midY]], gm: false, ids: [a, b] });
  }
  // A child's line drops from between its parents (or from under one parent) to a bar over the children.
  for (const kind of ["child", "ward"] as const) {
    const ups = kind === "child" ? g.parents : g.guardians, groups = new Map<string, string[]>();
    for (const c of members) {
      if (!at.has(c)) continue;
      const ps = [...linked(ups, c)].filter(p => at.has(p) && gens.get(p)! < gens.get(c)!).sort();
      if (ps.length) (groups.get(ps.join("|")) ?? groups.set(ps.join("|"), []).get(ps.join("|"))!).push(c);
    }
    let n = 0;
    for (const [k, children] of groups) {
      const ps = k.split("|"), pts = ps.map(p => at.get(p)!);
      const together = ps.length === 2 && adjacent(ps[0], ps[1]);
      const sx = pts.reduce((s, p) => s + p.x, 0) / pts.length, sy = together ? pts[0].y + midY : Math.max(...pts.map(p => p.y)) + BOX_H;
      for (const c of children) {
        const cp = at.get(c)!, bus = cp.y - 24 - (n % 3) * 6;
        const gm = g.links.filter(l => l.role === (kind === "child" ? "parent" : "ward") && l.toId === c && ps.includes(l.fromId)).every(l => l.gm);
        lines.push({ key: `${kind}:${k}:${c}`, kind, gm, ids: [...ps, c], points: bus > sy ? [[sx, sy], [sx, bus], [cp.x, bus], [cp.x, cp.y]] : [[sx, sy], [cp.x, cp.y]] });
      }
      n++;
    }
  }
  // Siblings with no parent in the tree that says so: a bracket over the two.
  for (const l of g.links) {
    if (l.role !== "sibling" || !at.has(l.fromId) || !at.has(l.toId)) continue;
    const shared = [...linked(g.parents, l.fromId)].some(p => at.has(p) && linked(g.parents, l.toId).has(p));
    if (shared) continue;
    const p = at.get(l.fromId)!, q = at.get(l.toId)!;
    lines.push({ key: l.key, kind: "sibling", gm: l.gm, ids: [l.fromId, l.toId], points: p.y === q.y ? [[p.x, p.y], [p.x, p.y - 14], [q.x, q.y - 14], [q.x, q.y]] : [[p.x, p.y + midY], [q.x, q.y + midY]] });
  }
  return { blood, inLaws, gens, cut, units, unitOf, roots, kids, at, lines, width, height };
}

export type Relative = { id: string; label: string; key?: string; gm: boolean; worked?: boolean };
/** Everyone a person is tied to as family, named from that person, then siblings worked out from shared parents. */
export function relativesOf(g: FamilyGraph, id: string): Relative[] {
  const out: Relative[] = [];
  for (const l of g.links) {
    if (l.fromId === id) out.push({ id: l.toId, label: l.name, key: l.key, gm: l.gm });
    else if (l.toId === id) out.push({ id: l.fromId, label: l.reverse, key: l.key, gm: l.gm });
  }
  const told = new Set([...linked(g.siblings, id)]), mine = linked(g.parents, id);
  const kids = new Set<string>();
  for (const p of mine) for (const c of linked(g.children, p)) if (c !== id && !told.has(c)) kids.add(c);
  for (const k of kids) {
    const theirs = linked(g.parents, k), shared = [...mine].filter(p => theirs.has(p)).length;
    out.push({ id: k, label: shared === mine.size && shared === theirs.size ? "Sibling of" : "Half-sibling of", gm: false, worked: true });
  }
  const weight: Record<string, number> = {};
  for (const l of g.links) { if (l.fromId === id) weight[l.toId] = Math.min(weight[l.toId] ?? 9, l.role === "partner" ? 0 : l.role === "parent" ? 1 : l.role === "ward" ? 3 : 2); if (l.toId === id) weight[l.fromId] = Math.min(weight[l.fromId] ?? 9, l.role === "partner" ? 0 : l.role === "parent" ? 4 : l.role === "ward" ? 5 : 2); }
  return out.sort((a, b) => (weight[a.id] ?? 2) - (weight[b.id] ?? 2));
}

/** Organization types that are families: a noble house, clan, dynasty and the like. */
export const isFamilyOrgType = (type?: string) => !!type && (/\b(clan|family|dynasty|bloodline|lineage|kindred)\b/i.test(type) || /^(noble |royal |great |high )?house$/i.test(type.trim()));

export type FamilyChoice = { key: string; label: string; seeds: string[]; orgId?: string; size: number };
/**
 * The families to pick from: each organization that is a family (starting from its people, biggest first), then each
 * group of characters joined by family ties that no such organization covers, named after its best-connected person.
 */
export function familyChoices(pages: Entry[], g: FamilyGraph, showMember: (org: Entry, member: { gm?: boolean }) => boolean = () => true): FamilyChoice[] {
  const byId = new Map(pages.map(e => [e.id, e])), out: FamilyChoice[] = [], covered = new Set<string>();
  const neighbours = (id: string) => [...linked(g.parents, id), ...linked(g.children, id), ...linked(g.partners, id), ...linked(g.siblings, id), ...linked(g.guardians, id), ...linked(g.wards, id)];
  const houses: FamilyChoice[] = [];
  for (const org of pages.filter(e => e.kind === "faction" && isFamilyOrgType(e.org?.type))) {
    const seeds = [...new Set(orgPeople(org).filter(p => byId.get(p.id)?.kind === "character" && showMember(org, p)).map(p => p.id))];
    const { blood, inLaws } = familyMembers(g, seeds, MAX_FAMILY, true);
    blood.forEach(x => covered.add(x));
    houses.push({ key: `org:${org.id}`, label: org.title, seeds, orgId: org.id, size: blood.size + inLaws.size });
  }
  // The biggest family first, so the tree that opens is the one with the most in it.
  out.push(...houses.sort((a, b) => b.size - a.size || a.label.localeCompare(b.label)));
  const people = new Set(g.links.flatMap(l => [l.fromId, l.toId]).filter(id => byId.has(id)));
  const groups: Set<string>[] = [], seen = new Set<string>();
  for (const id of people) { if (seen.has(id)) continue; const c = closure([id], neighbours, 10000); c.forEach(x => seen.add(x)); groups.push(c); }
  const degree = (id: string) => neighbours(id).length;
  for (const c of groups.sort((a, b) => b.size - a.size)) {
    if ([...c].some(x => covered.has(x))) continue;
    const top = [...c].filter(x => byId.has(x)).sort((a, b) => degree(b) - degree(a) || byId.get(a)!.title.localeCompare(byId.get(b)!.title))[0];
    if (!top) continue;
    const { blood, inLaws } = familyMembers(g, [top]);
    out.push({ key: `person:${top}`, label: `Family of ${byId.get(top)!.title}`, seeds: [top], size: blood.size + inLaws.size });
  }
  return out;
}

/** The roles people hold in a family organization (Heir, Abbess…), shown on their boxes. */
export function familyRoles(org: Entry | undefined, showMember: (member: { gm?: boolean }) => boolean = () => true): Map<string, string> {
  const out = new Map<string, string>();
  if (org) for (const p of orgPeople(org)) if (p.detail && showMember(p) && !out.has(p.id)) out.set(p.id, p.detail);
  return out;
}

/** The family organizations each person is in, for in-laws ("of House Quell"). */
export function familyOrgsOf(pages: Entry[]): Map<string, Entry[]> {
  const out = new Map<string, Entry[]>();
  for (const org of pages) if (org.kind === "faction" && isFamilyOrgType(org.org?.type)) for (const p of orgPeople(org)) {
    const list = out.get(p.id) ?? out.set(p.id, []).get(p.id)!;
    if (!list.includes(org)) list.push(org);
  }
  return out;
}

export type KinRole = "parent" | "child" | "partner" | "sibling";
const roleWords: Record<KinRole, string> = { parent: "as a parent", child: "as a parent", partner: "as partners", sibling: "as siblings" };
/** The kind of tie that adds a relative: the built-in one while it still draws on a tree, or else the first that does. */
export const kinType = (types: TieType[], role: TreeRole) => types.find(t => t.id === role && t.tree === role) ?? types.find(t => t.tree === role);

/**
 * Adds a parent, child, partner or sibling to a person: a page that exists, or a new character with this name (made
 * where the person is: their campaign or the shared lore). A child can be added with a second parent. Returns the new
 * workspace and the relative's id, or why it can't be done.
 */
export function addKin(s: Workspace, types: TieType[], personId: string, role: KinRole, other: { id: string } | { name: string }, now: string, newId: () => string, coParentId?: string): { s: Workspace; id: string } | { error: string } {
  const person = s.entries.find(e => e.id === personId);
  if (!person) return { error: "That page is gone." };
  const type = kinType(types, role === "child" ? "parent" : role);
  if (!type) return { error: `No kind of tie draws ${roleWords[role]} on a family tree. Set one in Kinds of tie.` };
  let next = s, otherId: string;
  if ("name" in other) {
    otherId = newId();
    next = { ...s, entries: [...s.entries, { id: otherId, worldId: person.worldId, campaignId: person.campaignId, parentId: null, title: other.name.trim().slice(0, 160), kind: "character", body: "", overviewVisibility: "gm", tabs: [], character: defaultCharacter(), updatedAt: now }] };
  } else otherId = other.id;
  const pairs: [string, string][] = role === "parent" ? [[otherId, personId]] : role === "child" ? [[personId, otherId], ...(coParentId ? [[coParentId, otherId] as [string, string]] : [])] : [[personId, otherId]];
  for (const [a, b] of pairs) {
    let owner = next.entries.find(e => e.id === a), to = next.entries.find(e => e.id === b);
    if (!owner || !to || owner.id === to.id) return { error: "Those pages can’t be tied." };
    if ((type.both || role === "partner" || role === "sibling") && !canHoldTie(owner, to)) [owner, to] = [to, owner];
    if (!canHoldTie(owner, to)) return { error: `${owner.title} is shared lore, so it can only hold ties to shared lore.` };
    if (!tieFits(type, owner.kind, to.kind)) return { error: `${type.name} can’t join those two pages.` };
    const o = owner, t = to;
    if ((o.ties ?? []).some(x => x.typeId === type.id && x.toId === t.id) || (type.both && (t.ties ?? []).some(x => x.typeId === type.id && x.toId === o.id))) continue;
    const put = putTie(next, o.id, { id: newId(), toId: t.id, typeId: type.id }, now);
    if (!put) return { error: `${o.title} already holds as many ties as a page can.` };
    next = put;
  }
  return { s: next, id: otherId };
}
