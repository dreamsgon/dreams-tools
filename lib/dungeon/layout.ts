import type { Point } from "../model.ts";

/**
 * Map layout generators (branching dungeon, halls, caves, building, village), ported from the
 * generator mockup. Everything is in grid squares. All randomness comes from the `random`
 * argument, so one seed always gives one layout.
 */

export type LayoutId = "branching" | "halls" | "caves" | "building" | "village";
export type Side = "N" | "S" | "E" | "W";
export type LayoutOptions = {
  layout: LayoutId; cols: number; rows: number;
  rooms: number;      // rooms (branching/halls 3-24), chambers (caves 2-14), rooms in the building (building 2-16)
  houses: number;     // village 3-24
  roomSize: number;   // 0..1 (dungeon room size; building size for building)
  branching: number;  // 0..1
  loops: number;      // 0..1 (loops / cross halls / extra doors)
  corridor: 1 | 2;
  symmetry: "off" | "lr" | "tb";
  curved: number;     // 0..1
  entry: Side | "any";
  openness: number; rough: number; pools: number; // caves, 0..1
  bshape: "rect" | "L"; windows: boolean;          // building
  roads: "one" | "cross" | "ring"; palisade: boolean; fields: boolean; // village
};
export const defaultLayoutOptions: Omit<LayoutOptions, "layout" | "cols" | "rows"> = {
  rooms: 9, houses: 10, roomSize: 0.5, branching: 0.4, loops: 0.3, corridor: 1, symmetry: "off", curved: 0.2, entry: "S",
  openness: 0.5, rough: 0.5, pools: 0.3, bshape: "rect", windows: true, roads: "cross", palisade: true, fields: true,
};
/** The room count a layout starts with: the mockup's 9, except 6 for a building. */
export function defaultRoomCount(layout: LayoutId): number {
  return layout === "building" ? 6 : layout === "village" ? defaultLayoutOptions.houses : defaultLayoutOptions.rooms;
}
export type Box = { x: number; y: number; w: number; h: number };
export type LayoutRoom = Box & { round?: boolean; main?: boolean; great?: boolean; cave?: boolean; cx?: number; cy?: number; rad?: number; pool?: boolean };
export type LayoutDoor = { x: number; y: number; o: "h" | "v"; len: number; outer?: boolean; big?: boolean };
export type FloorPiece = ({ t: "rect" } & Box) | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number };
export type Layout = {
  kind: "dungeon" | "cave" | "building" | "village";
  cols: number; rows: number;
  rooms: LayoutRoom[];          // in the order they should be numbered
  floors: FloorPiece[];         // dungeon: one piece per room and per corridor (round rooms are ellipses); building: its outline parts; else []
  rock: number[][] | null;      // caves: rows x cols grid, 1 = rock, 0 = floor; else null
  water: Point[];               // caves: pool cells (top-left corner of each cell)
  doors: LayoutDoor[];
  windows: { x: number; y: number; o: "h" | "v" }[];
  roads: { pts: Point[]; w: number; ring?: boolean }[];
  square: { cx: number; cy: number; rx: number; ry: number } | null;
  fields: (Box & { rot: boolean })[];
  palisade: Box | null;
  entrance: { x: number; y: number; dir: Side; room: number } | null;
};

type Random = () => number;
const SIDES: Side[] = ["N", "S", "E", "W"];
const ov = (a: Box, b: Box, g = 0) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const unit = (v: unknown, fallback: number) => clamp(num(v, fallback), 0, 1);

/** Clamp every option to its documented range, so odd input cannot loop or overflow. */
function normalise(o: LayoutOptions): LayoutOptions {
  const d = defaultLayoutOptions;
  const layout: LayoutId = (["branching", "halls", "caves", "building", "village"] as const).includes(o.layout) ? o.layout : "branching";
  const roomRange: Record<LayoutId, [number, number]> = { branching: [3, 24], halls: [3, 24], caves: [2, 14], building: [2, 16], village: [3, 24] };
  const [lo, hi] = roomRange[layout];
  return {
    layout,
    cols: clamp(Math.round(num(o.cols, 32)), 16, 200), rows: clamp(Math.round(num(o.rows, 24)), 16, 200),
    rooms: clamp(Math.round(num(o.rooms, defaultRoomCount(layout))), lo, hi),
    houses: clamp(Math.round(num(o.houses, d.houses)), 3, 24),
    roomSize: unit(o.roomSize, d.roomSize), branching: unit(o.branching, d.branching), loops: unit(o.loops, d.loops),
    corridor: o.corridor === 2 ? 2 : 1,
    symmetry: o.symmetry === "lr" || o.symmetry === "tb" ? o.symmetry : "off",
    curved: unit(o.curved, d.curved),
    entry: o.entry === "N" || o.entry === "S" || o.entry === "E" || o.entry === "W" ? o.entry : "any",
    openness: unit(o.openness, d.openness), rough: unit(o.rough, d.rough), pools: unit(o.pools, d.pools),
    bshape: o.bshape === "L" ? "L" : "rect", windows: !!o.windows,
    roads: o.roads === "one" || o.roads === "ring" ? o.roads : "cross", palisade: !!o.palisade, fields: !!o.fields,
  };
}

export function makeLayout(o: LayoutOptions, random: () => number): Layout {
  const opt = normalise(o);
  if (opt.layout === "branching" || opt.layout === "halls") return genDungeon(opt, random, opt.layout === "halls");
  if (opt.layout === "caves") return genCave(opt, random);
  if (opt.layout === "building") return genBuilding(opt, random);
  return genVillage(opt, random);
}

const empty = (kind: Layout["kind"], cols: number, rows: number): Layout => ({
  kind, cols, rows, rooms: [], floors: [], rock: null, water: [], doors: [], windows: [], roads: [], square: null, fields: [], palisade: null, entrance: null,
});

/** Put room `first` at the front (when it exists) and the rest by `key`, then return the new order of old indices. */
function orderFrom(count: number, first: number, key: (i: number) => number): number[] {
  const rest = Array.from({ length: count }, (_, i) => i).filter((i) => i !== first);
  rest.sort((a, b) => key(a) - key(b));
  return first >= 0 && first < count ? [first, ...rest] : rest;
}

/* ---------------- dungeon: branching and halls ---------------- */

type DRoom = Box & { round: boolean; main?: boolean; great?: boolean };
type Cor = Box & { d?: Side; ent?: boolean; hall?: boolean; o?: "h" | "v" };
type DState = { W: number; H: number; rooms: DRoom[]; cors: Cor[]; doors: LayoutDoor[]; entrance: { x: number; y: number; dir: Side; room: number } };

function transpose(m: DState): DState {
  const T = <B extends Box>(r: B): B => ({ ...r, x: r.y, y: r.x, w: r.h, h: r.w });
  const dmap: Record<Side, Side> = { N: "W", S: "E", E: "S", W: "N" };
  return {
    W: m.H, H: m.W, rooms: m.rooms.map(T),
    cors: m.cors.map((c) => ({ ...T(c), d: c.d ? dmap[c.d] : c.d })),
    doors: m.doors.map((d) => ({ ...d, x: d.y, y: d.x, o: d.o === "h" ? "v" : "h" })),
    entrance: { ...m.entrance, x: m.entrance.y, y: m.entrance.x, dir: dmap[m.entrance.dir] },
  };
}

function genDungeon(o: LayoutOptions, R: Random, halls: boolean): Layout {
  const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const pick = <T,>(l: readonly T[]): T => l[Math.floor(R() * l.length)];
  const sym = o.symmetry;
  let entry: Side = o.entry === "any" ? pick(SIDES) : o.entry;
  if (sym === "tb" && (entry === "N" || entry === "S")) entry = entry === "N" ? "W" : "E";
  if (sym === "lr" && (entry === "E" || entry === "W")) entry = entry === "E" ? "S" : "N";
  const tr = entry === "E" || entry === "W";
  let W = o.cols, H = o.rows;
  if (tr) { [W, H] = [H, W]; entry = entry === "W" ? "N" : "S"; }
  const mirror = sym !== "off", mid = W / 2, cw = o.corridor;
  const lo = 3 + Math.round(o.roomSize * 2), hi = 4 + Math.round(o.roomSize * 5);
  const rooms: DRoom[] = [], cors: Cor[] = [], doors: LayoutDoor[] = [], links: [number, number][] = [];
  const inb = (r: Box) => r.x >= 1 && r.y >= 1 && r.x + r.w <= W - 1 && r.y + r.h <= H - 1;
  const half = (r: Box) => !mirror || r.x + r.w <= mid - 1;
  const doorRate = 0.75;
  const target = mirror ? Math.ceil((o.rooms - 1) / 2) + 1 : o.rooms;
  let entrance!: DState["entrance"];

  const corDoor = (c: Cor, start: boolean): LayoutDoor => {
    if (c.d === "E") return { x: (start ? c.x : c.x + c.w - 1) + 0.5, y: c.y + c.h / 2, o: "v", len: c.h };
    if (c.d === "W") return { x: (start ? c.x + c.w - 1 : c.x) + 0.5, y: c.y + c.h / 2, o: "v", len: c.h };
    if (c.d === "S") return { x: c.x + c.w / 2, y: (start ? c.y : c.y + c.h - 1) + 0.5, o: "h", len: c.w };
    return { x: c.x + c.w / 2, y: (start ? c.y + c.h - 1 : c.y) + 0.5, o: "h", len: c.w };
  };

  if (!halls) {
    let w0 = ri(lo + 1, hi + 1);
    const h0 = ri(lo, hi);
    if (mirror && w0 % 2) w0++;
    const x0 = mirror ? mid - w0 / 2 : ri(2, W - w0 - 2), y0 = entry === "S" ? H - h0 - 3 : 3;
    rooms.push({ x: x0, y: y0, w: w0, h: h0, round: false, main: true });
    const ew = mirror ? 2 : cw, ex = mirror ? mid - 1 : x0 + Math.floor((w0 - ew) / 2);
    const ec: Cor = entry === "S" ? { x: ex, y: y0 + h0, w: ew, h: H - (y0 + h0), ent: true } : { x: ex, y: 0, w: ew, h: y0, ent: true };
    cors.push(ec);
    entrance = { x: ex + ew / 2, y: entry === "S" ? H : 0, dir: entry, room: 0 };
    doors.push({ x: ex + ew / 2, y: entry === "S" ? y0 + h0 + 0.5 : y0 - 0.5, o: "h", len: ew });
    let tip = 0, tries = 0;
    while (rooms.length < target && tries++ < 2500) {
      const branch = R() < o.branching, pi = branch ? Math.floor(R() * rooms.length) : tip, p = rooms[pi];
      const dirs = SIDES.filter((d) => !(pi === 0 && d === entry)), d = pick(dirs);
      const len = ri(2, 5), w = ri(lo, hi), h = ri(lo, hi), round = R() < o.curved && w >= 4 && h >= 4;
      let cor: Cor, room: DRoom;
      if (d === "E" || d === "W") {
        if (p.h < cw + 2 || h < cw + 2) continue;
        const cy = p.round ? p.y + Math.floor((p.h - cw) / 2) : ri(p.y + 1, p.y + p.h - 1 - cw);
        const cx = d === "E" ? p.x + p.w : p.x - len;
        cor = { x: cx, y: cy, w: len, h: cw, d };
        const ny = round ? cy - Math.floor((h - cw) / 2) : cy - ri(1, h - 1 - cw);
        room = { x: d === "E" ? cx + len : cx - w, y: ny, w, h, round };
      } else {
        if (p.w < cw + 2 || w < cw + 2) continue;
        const cx = p.round ? p.x + Math.floor((p.w - cw) / 2) : ri(p.x + 1, p.x + p.w - 1 - cw);
        const cy = d === "S" ? p.y + p.h : p.y - len;
        cor = { x: cx, y: cy, w: cw, h: len, d };
        const nx = round ? cx - Math.floor((w - cw) / 2) : cx - ri(1, w - 1 - cw);
        room = { x: nx, y: d === "S" ? cy + len : cy - h, w, h, round };
      }
      if (!inb(room) || !half(room) || !half(cor)) continue;
      if (rooms.some((q) => ov(q, room, 1)) || cors.some((q) => ov(q, room, 1) || ov(q, cor, 0)) || rooms.some((q, i) => i !== pi && ov(q, cor, 0))) continue;
      rooms.push(room); cors.push(cor); links.push([pi, rooms.length - 1]);
      room.main = !branch && pi === tip; if (room.main) tip = rooms.length - 1;
      if (R() < doorRate) doors.push(corDoor(cor, true));
      if (R() < doorRate * 0.4) doors.push(corDoor(cor, false));
    }
    // loops
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      if (R() > o.loops * 0.5) continue;
      const a = rooms[i], b = rooms[j];
      if (a.round || b.round || links.some(([p, q]) => (p === i && q === j) || (p === j && q === i))) continue;
      let cor: Cor | null = null;
      const [l, r] = a.x < b.x ? [a, b] : [b, a], gx = r.x - (l.x + l.w);
      const ylo = Math.max(a.y, b.y) + 1, yhi = Math.min(a.y + a.h, b.y + b.h) - 1 - cw;
      if (gx >= 1 && gx <= 7 && yhi >= ylo) cor = { x: l.x + l.w, y: ri(ylo, yhi), w: gx, h: cw, d: "E" };
      const [t, u] = a.y < b.y ? [a, b] : [b, a], gy = u.y - (t.y + t.h);
      const xlo = Math.max(a.x, b.x) + 1, xhi = Math.min(a.x + a.w, b.x + b.w) - 1 - cw;
      if (!cor && gy >= 1 && gy <= 7 && xhi >= xlo) cor = { x: ri(xlo, xhi), y: t.y + t.h, w: cw, h: gy, d: "S" };
      if (!cor || !half(cor)) continue;
      const c = cor;
      if (rooms.some((q, k) => k !== i && k !== j && ov(q, c, 0)) || cors.some((q) => ov(q, c, 0))) continue;
      cors.push(c); links.push([i, j]); if (R() < 0.5) doors.push(corDoor(c, true));
    }
  } else {
    // classic halls. On a small map the cross halls can leave no room for side rooms; then try again without them.
    for (let pass = 0; pass < 2; pass++) {
    rooms.length = 0; cors.length = 0; doors.length = 0;
    const hw = cw === 2 ? 4 : 2, mx = Math.round(mid - hw / 2);
    const gw = Math.min(W - 6, ri(8, 12)) & ~1, gh = ri(5, 7);
    const great: DRoom = { x: mid - gw / 2, y: entry === "S" ? 1 : H - 1 - gh, w: gw, h: gh, round: R() < o.curved * 1.5, great: true };
    const main: Box = entry === "S" ? { x: mx, y: great.y + gh + 1, w: hw, h: H - (great.y + gh + 1) } : { x: mx, y: 0, w: hw, h: great.y - 1 };
    const hallsL: Box[] = [main];
    const nCross = pass > 0 ? 0 : o.loops > 0.6 ? 2 : o.loops > 0.2 ? 1 : 0;
    for (let k = 0; k < nCross; k++) {
      const span = main.h, y = Math.round(main.y + span * (k + 1) / (nCross + 1) - hw / 2);
      hallsL.push({ x: 2, y, w: W - 4, h: hw });
    }
    rooms.push(great);
    const stub: Cor = entry === "S" ? { x: mx, y: great.y + gh, w: hw, h: 1 } : { x: mx, y: great.y - 1, w: hw, h: 1 };
    cors.push(stub); doors.push({ x: mid, y: stub.y + 0.5, o: "h", len: hw, big: true });
    entrance = { x: mid, y: entry === "S" ? H : 0, dir: entry, room: -1 };
    let tries = 0;
    while (rooms.length < target && tries++ < 3000) {
      const hh = pick(hallsL), vert = hh.h > hh.w;
      const w = ri(lo, hi), h = ri(lo, hi), round = R() < o.curved && w >= 4 && h >= 4;
      let room: DRoom, sc: Cor;
      if (vert) {
        const side = mirror ? "L" : pick(["L", "R"]);
        const y = ri(hh.y, hh.y + hh.h - h);
        room = { x: side === "L" ? hh.x - 1 - w : hh.x + hh.w + 1, y, w, h, round };
        const ylo = Math.max(y, hh.y), yhi = Math.min(y + h, hh.y + hh.h) - 1;
        const sy = round ? y + Math.floor(h / 2) : ri(ylo, yhi);
        if (sy < ylo || sy > yhi) continue;
        sc = { x: side === "L" ? hh.x - 1 : hh.x + hh.w, y: sy, w: 1, h: 1, o: "v" };
      } else {
        const side = pick(["T", "B"]);
        const x = ri(hh.x, hh.x + hh.w - w);
        room = { x, y: side === "T" ? hh.y - 1 - h : hh.y + hh.h + 1, w, h, round };
        const xlo = Math.max(x, hh.x), xhi = Math.min(x + w, hh.x + hh.w) - 1;
        const sx = round ? x + Math.floor(w / 2) : ri(xlo, xhi);
        if (sx < xlo || sx > xhi) continue;
        sc = { x: sx, y: side === "T" ? hh.y - 1 : hh.y + hh.h, w: 1, h: 1, o: "h" };
      }
      if (!inb(room) || !half(room) || !half(sc)) continue;
      if (rooms.some((q) => ov(q, room, 1)) || hallsL.some((q) => ov(q, room, 1)) || cors.some((q) => ov(q, room, 1))) continue;
      rooms.push(room); cors.push(sc);
      if (R() < 0.85) doors.push({ x: sc.x + 0.5, y: sc.y + 0.5, o: sc.o === "v" ? "v" : "h", len: 1 });
    }
    for (let i = 1; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      if (R() > o.loops * 0.6) continue;
      const a = rooms[i], b = rooms[j];
      if (a.round || b.round) continue;
      const [l, r] = a.x < b.x ? [a, b] : [b, a];
      if (r.x - (l.x + l.w) === 1) {
        const lo2 = Math.max(a.y, b.y), hi2 = Math.min(a.y + a.h, b.y + b.h) - 1;
        if (hi2 >= lo2) {
          const sy = ri(lo2, hi2), sc: Cor = { x: l.x + l.w, y: sy, w: 1, h: 1 };
          if (!half(sc)) continue;
          cors.push(sc); doors.push({ x: sc.x + 0.5, y: sy + 0.5, o: "v", len: 1 }); continue;
        }
      }
      const [t, u] = a.y < b.y ? [a, b] : [b, a];
      if (u.y - (t.y + t.h) === 1) {
        const lo2 = Math.max(a.x, b.x), hi2 = Math.min(a.x + a.w, b.x + b.w) - 1;
        if (hi2 >= lo2) {
          const sx = ri(lo2, hi2), sc: Cor = { x: sx, y: t.y + t.h, w: 1, h: 1 };
          if (!half(sc)) continue;
          cors.push(sc); doors.push({ x: sx + 0.5, y: sc.y + 0.5, o: "h", len: 1 });
        }
      }
    }
    hallsL.forEach((h) => cors.push({ ...h, hall: true }));
    if (rooms.length >= 2 || nCross === 0) break;
    }
  }
  if (mirror) {
    const n = rooms.length;
    for (let k = 1; k < n; k++) rooms.push({ ...rooms[k], x: W - rooms[k].x - rooms[k].w });
    const mi = (k: number) => (k === 0 ? 0 : n + k - 1);
    links.slice().forEach(([a, b]) => links.push([mi(a), mi(b)]));
    cors.slice().forEach((c) => {
      if (c.ent || (c.x + c.w > mid - 1 + 0.01 && c.x < mid + 1 - 0.01 && c.hall)) return;
      if (c.hall && c.x <= 2 && c.x + c.w >= W - 2) return;
      if (c.x === Math.round(mid - (cw === 2 ? 2 : 1)) && c.hall) return;
      cors.push({ ...c, x: W - c.x - c.w });
    });
    doors.slice().forEach((d) => { if (Math.abs(d.x - mid) < 0.01) return; doors.push({ ...d, x: W - d.x }); });
  }
  let m: DState = { W, H, rooms, cors, doors, entrance };
  if (tr) m = transpose(m);

  // numbering: the entrance room first, then by distance along the links (or from the entrance when it opens on a hall)
  const cOf = (r: Box) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const start = m.entrance.room >= 0 ? m.entrance.room : -1;
  let order: number[];
  if (links.length && start >= 0) {
    const adj: number[][] = m.rooms.map(() => []);
    links.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
    const d = m.rooms.map(() => 1e9); d[start] = 0;
    const q = [start];
    for (let i = 0; i < q.length; i++) for (const nb of adj[q[i]]) if (d[nb] > d[q[i]] + 1) { d[nb] = d[q[i]] + 1; q.push(nb); }
    order = m.rooms.map((_, i) => i).sort((a, b) => (d[a] - d[b]) || (cOf(m.rooms[a]).x - cOf(m.rooms[b]).x));
  } else {
    const e = m.entrance;
    order = m.rooms.map((_, i) => i).sort((a, b) => Math.hypot(cOf(m.rooms[a]).x - e.x, cOf(m.rooms[a]).y - e.y) - Math.hypot(cOf(m.rooms[b]).x - e.x, cOf(m.rooms[b]).y - e.y));
  }

  const out = empty("dungeon", o.cols, o.rows);
  out.rooms = order.map((i) => {
    const r = m.rooms[i], lr: LayoutRoom = { x: r.x, y: r.y, w: r.w, h: r.h, round: r.round };
    if (r.main) lr.main = true;
    if (r.great) lr.great = true;
    return lr;
  });
  out.doors = m.doors;
  out.entrance = { ...m.entrance, room: start >= 0 ? order.indexOf(start) : -1 };
  // floors: one per room, then one per corridor. Corridors run one square into each end, as in the mockup;
  // the part that would poke out past the map edge (at the entrance) is clipped.
  const clip = (b: Box): Box | null => {
    const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y), x1 = Math.min(o.cols, b.x + b.w), y1 = Math.min(o.rows, b.y + b.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  out.rooms.forEach((r) => out.floors.push(r.round ? { t: "ellipse", cx: r.x + r.w / 2, cy: r.y + r.h / 2, rx: r.w / 2, ry: r.h / 2 } : { t: "rect", x: r.x, y: r.y, w: r.w, h: r.h }));
  m.cors.forEach((c) => {
    const v = c.h > c.w || c.d === "N" || c.d === "S", e = c.hall ? 0 : 1;
    const b: Box = c.hall ? { x: c.x, y: c.y, w: c.w, h: c.h } : v ? { x: c.x, y: c.y - e, w: c.w, h: c.h + 2 * e } : { x: c.x - e, y: c.y, w: c.w + 2 * e, h: c.h };
    const k = clip(b);
    if (k) out.floors.push({ t: "rect", ...k });
  });
  return out;
}

/* ---------------- caves ---------------- */

function components(g: number[][], W: number, H: number): [number, number][][] {
  const seen = g.map((r) => r.map(() => 0));
  const regions: [number, number][][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!g[y][x] && !seen[y][x]) {
    const cells: [number, number][] = [], q: [number, number][] = [[x, y]];
    seen[y][x] = 1;
    while (q.length) {
      const [cx, cy] = q.pop()!;
      cells.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && !g[ny][nx] && !seen[ny][nx]) { seen[ny][nx] = 1; q.push([nx, ny]); }
      }
    }
    regions.push(cells);
  }
  return regions.sort((a, b) => b.length - a.length);
}

/** Fill every floor region but the largest with rock. Returns the size of the one that stays. */
function keepLargest(g: number[][], W: number, H: number): number {
  const regions = components(g, W, H);
  for (const r of regions.slice(1)) for (const [x, y] of r) g[y][x] = 1;
  return regions.length ? regions[0].length : 0;
}

function genCave(o: LayoutOptions, R: Random): Layout {
  const W = o.cols, H = o.rows;
  const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const mirror = o.symmetry !== "off";
  const mirrorGrid = (gr: number[][]) => { for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W / 2; xx++) gr[yy][W - 1 - xx] = gr[yy][xx]; };
  let g: number[][] = [], best: { g: number[][]; size: number } | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const fill = 0.5 - o.openness * 0.13;
    g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => ((x < 1 || y < 1 || x >= W - 1 || y >= H - 1) ? 1 : (R() < fill ? 1 : 0))));
    if (mirror) mirrorGrid(g);
    const iters = 2 + Math.round((1 - o.rough) * 3);
    for (let it = 0; it < iters; it++) {
      const n = g.map((r) => r.slice());
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        let c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) c += g[y + dy][x + dx];
        n[y][x] = c >= 5 ? 1 : c <= 3 ? 0 : g[y][x];
      }
      g = n;
    }
    if (mirror) mirrorGrid(g);
    const size = keepLargest(g, W, H);
    if (!size) continue;
    if (!best || size > best.size) best = { g: g.map((r) => r.slice()), size };
    if (size > W * H * 0.28) break;
  }
  if (best) g = best.g;
  else {
    // nothing grew: open a plain cavern in the middle
    g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (Math.abs(x + 0.5 - W / 2) < 5 && Math.abs(y + 0.5 - H / 2) < 4 ? 0 : 1)));
  }
  // entrance tunnel. A mirrored cave opens at the top or bottom, so the tunnel sits on the axis.
  let entry: Side = o.entry === "any" ? SIDES[Math.floor(R() * 4)] : o.entry;
  if (mirror && (entry === "E" || entry === "W")) entry = entry === "E" ? "S" : "N";
  const ex = mirror && (entry === "N" || entry === "S") ? W / 2 - 1 : ri(4, W - 5);
  const ey = mirror && (entry === "E" || entry === "W") ? H / 2 - 1 : ri(4, H - 5);
  let x = entry === "W" ? 0 : entry === "E" ? W - 1 : ex, y = entry === "N" ? 0 : entry === "S" ? H - 1 : ey;
  const sx = x, sy = y;
  const step = { N: [0, 1], S: [0, -1], E: [-1, 0], W: [1, 0] }[entry];
  // (the mockup also counted its own freshly carved squares as "floor reached", which cut tunnels
  // from the S and E sides off after three squares; only squares that were open before count here)
  const carved = new Set<number>();
  for (let k = 0; k < 40; k++) {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const cx = x + dx, cy = y + dy;
      if (cx >= 0 && cy >= 0 && cx < W && cy < H) {
        if (!g[cy][cx] && k > 1 && !carved.has(cy * W + cx)) k = 99;
        g[cy][cx] = 0; carved.add(cy * W + cx);
      }
    }
    if (k >= 99) break;
    x += step[0]; y += step[1];
    if (!mirror && R() < 0.3) { if (step[0]) y = Math.max(1, Math.min(H - 3, y + (R() < 0.5 ? -1 : 1))); else x = Math.max(1, Math.min(W - 3, x + (R() < 0.5 ? -1 : 1))); }
  }
  if (mirror) mirrorGrid(g);
  // the carved tunnel and the mirror must not leave a stray pocket behind
  keepLargest(g, W, H);

  // chambers: far from walls, spread out
  const dist: number[][] = g.map((r) => r.map((v) => (v ? 0 : 99))), q: [number, number][] = [];
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (g[yy][xx]) q.push([xx, yy]);
  for (let i = 0; i < q.length; i++) {
    const [cx, cy] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && dist[ny][nx] > dist[cy][cx] + 1) { dist[ny][nx] = dist[cy][cx] + 1; q.push([nx, ny]); }
    }
  }
  const cand: { x: number; y: number; d: number }[] = [];
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (!g[yy][xx] && dist[yy][xx] >= 2) cand.push({ x: xx, y: yy, d: dist[yy][xx] + R() * 0.5 });
  cand.sort((a, b) => b.d - a.d);
  const ch: { x: number; y: number; d: number }[] = [];
  for (const c of cand) { if (ch.length >= o.rooms) break; if (ch.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= 6)) ch.push(c); }
  // chamber boxes are kept inside the map (the entrance tunnel puts floor on the edge)
  const rooms: LayoutRoom[] = ch.map((c) => { const r = Math.max(1, Math.min(4, Math.floor(c.d), c.x + 1, W - c.x, c.y + 1, H - c.y)); return { x: c.x - r + 1, y: c.y - r + 1, w: 2 * r - 1, h: 2 * r - 1, cx: c.x + 0.5, cy: c.y + 0.5, rad: c.d, cave: true }; });
  // entrance room = nearest chamber to the entrance
  let er = -1, bd = 1e9;
  rooms.forEach((r, i) => { const d = Math.hypot(r.cx! - sx, r.cy! - sy); if (d < bd) { bd = d; er = i; } });
  // pools
  const water: Point[] = [];
  rooms.forEach((r, i) => {
    if (i === er || R() > o.pools) return;
    const cx = r.cx!, cy = r.cy!, pr = Math.max(1, r.rad! - 1.6);
    for (let yy = Math.floor(cy - pr - 1); yy <= cy + pr + 1; yy++) for (let xx = Math.floor(cx - pr - 1); xx <= cx + pr + 1; xx++) {
      if (yy < 0 || xx < 0 || yy >= H || xx >= W || g[yy][xx]) continue;
      const off = Math.hypot(xx + 0.5 - cx - pr * 0.35, yy + 0.5 - cy + pr * 0.2);
      if (off < pr * (0.8 + R() * 0.3)) water.push({ x: xx, y: yy });
    }
    r.pool = true;
  });
  const ent = { x: sx + 0.5 + (entry === "N" || entry === "S" ? 0.5 : 0), y: sy + 0.5 + (entry === "E" || entry === "W" ? 0.5 : 0) };
  const order = orderFrom(rooms.length, er, (i) => Math.hypot(rooms[i].cx! - ent.x, rooms[i].cy! - ent.y));
  const out = empty("cave", W, H);
  out.rooms = order.map((i) => rooms[i]);
  out.rock = g;
  out.water = water;
  out.entrance = { x: ent.x, y: ent.y, dir: entry, room: er >= 0 ? 0 : -1 };
  return out;
}

/* ---------------- building ---------------- */

type Edge = { i: number; j: number; o: "h" | "v"; at: number; lo: number; hi: number; used?: boolean };

function genBuilding(o: LayoutOptions, R: Random): Layout {
  const W = o.cols, H = o.rows;
  const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const sc = 0.6 + 0.4 * o.roomSize;
  const fw = Math.max(12, Math.round((W - 4) * sc)), fh = Math.max(9, Math.round((H - 4) * sc)), fx = Math.floor((W - fw) / 2), fy = Math.floor((H - fh) / 2);
  let parts: Box[] = [{ x: fx, y: fy, w: fw, h: fh }];
  if (o.bshape === "L") {
    const cw = Math.round(fw * 0.42), chh = Math.round(fh * 0.45), right = R() < 0.5, bottom = o.entry !== "S";
    const A: Box = bottom ? { x: fx, y: fy, w: fw, h: fh - chh } : { x: fx, y: fy + chh, w: fw, h: fh - chh };
    const B: Box = { x: right ? fx : fx + cw, y: bottom ? fy + fh - chh : fy, w: fw - cw, h: chh };
    parts = [A, B];
  }
  const N = Math.max(2, o.rooms);
  const total = parts.reduce((s, p) => s + p.w * p.h, 0);
  const leaves: Box[] = [];
  parts.forEach((p, pi) => {
    const want = pi === parts.length - 1 ? N - leaves.length : Math.max(1, Math.round(N * p.w * p.h / total));
    const L: Box[] = [{ ...p }];
    while (L.length < want) {
      L.sort((a, b) => b.w * b.h - a.w * a.h);
      const i = L.findIndex((l) => l.w >= 6 || l.h >= 6);
      if (i < 0) break;
      const l = L.splice(i, 1)[0], vert = l.w > l.h ? true : l.h > l.w ? false : R() < 0.5;
      if (vert) { const c = ri(3, l.w - 3); L.push({ x: l.x, y: l.y, w: c, h: l.h }, { x: l.x + c, y: l.y, w: l.w - c, h: l.h }); }
      else { const c = ri(3, l.h - 3); L.push({ x: l.x, y: l.y, w: l.w, h: c }, { x: l.x, y: l.y + c, w: l.w, h: l.h - c }); }
    }
    leaves.push(...L);
  });
  // adjacency
  const edges: Edge[] = [];
  for (let i = 0; i < leaves.length; i++) for (let j = 0; j < leaves.length; j++) if (i !== j) {
    const a = leaves[i], b = leaves[j];
    // (the mockup only listed a wall from the room on its left or top, so a tree grown from a room at the
    // right or bottom could not reach the rest; every shared wall is listed from both rooms here)
    if (a.x + a.w === b.x) { const lo = Math.max(a.y, b.y), hi = Math.min(a.y + a.h, b.y + b.h); if (hi - lo >= 2) edges.push({ i, j, o: "v", at: b.x, lo, hi }, { i: j, j: i, o: "v", at: b.x, lo, hi }); }
    if (a.y + a.h === b.y) { const lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w); if (hi - lo >= 2) edges.push({ i, j, o: "h", at: b.y, lo, hi }, { i: j, j: i, o: "h", at: b.y, lo, hi }); }
  }
  const entry: Side = o.entry === "any" ? SIDES[Math.floor(R() * 4)] : o.entry;
  const edgeOf = (l: Box) => ({ N: l.y, S: -(l.y + l.h), W: l.x, E: -(l.x + l.w) })[entry];
  const ext = Math.min(...leaves.map(edgeOf));
  // the entrance room is the largest leaf on the entrance side
  const onSide = leaves.map((_, i) => i).filter((i) => edgeOf(leaves[i]) === ext);
  onSide.sort((a, b) => leaves[b].w * leaves[b].h - leaves[a].w * leaves[a].h);
  const er = onSide[0];
  const doors: LayoutDoor[] = [], inTree = new Set([er]);
  const doorOn = (e: Edge): LayoutDoor => { const p = ri(e.lo, e.hi - 1) + 0.5; return e.o === "v" ? { x: e.at, y: p, o: "v", len: 1 } : { x: p, y: e.at, o: "h", len: 1 }; };
  let guard = 0;
  while (inTree.size < leaves.length && guard++ < 500) {
    const opts = edges.filter((e) => inTree.has(e.i) && !inTree.has(e.j));
    if (!opts.length) break;
    const e = opts[Math.floor(R() * opts.length)];
    inTree.add(e.j); doors.push(doorOn(e)); e.used = true;
  }
  edges.forEach((e) => { if (!e.used && e.i < e.j && R() < o.loops * 0.35 && !edges.some((f) => f.used && f.i === e.j && f.j === e.i)) doors.push(doorOn(e)); });
  const el = leaves[er];
  const ed: { x: number; y: number; o: "h" | "v" } =
    entry === "N" ? { x: ri(el.x + 1, el.x + el.w - 2) + 0.5, y: el.y, o: "h" }
    : entry === "S" ? { x: ri(el.x + 1, el.x + el.w - 2) + 0.5, y: el.y + el.h, o: "h" }
    : entry === "W" ? { x: el.x, y: ri(el.y + 1, el.y + el.h - 2) + 0.5, o: "v" }
    : { x: el.x + el.w, y: ri(el.y + 1, el.y + el.h - 2) + 0.5, o: "v" };
  doors.push({ ...ed, len: 1, outer: true, big: true });
  // windows on outer walls
  const inside = (px: number, py: number) => parts.some((p) => px > p.x && px < p.x + p.w && py > p.y && py < p.y + p.h);
  const windows: { x: number; y: number; o: "h" | "v" }[] = [];
  if (o.windows) leaves.forEach((l) => {
    for (let x = l.x + 1; x < l.x + l.w - 1; x += 3) {
      if (!inside(x + 0.5, l.y - 0.3)) windows.push({ x: x + 0.5, y: l.y, o: "h" });
      if (!inside(x + 0.5, l.y + l.h + 0.3)) windows.push({ x: x + 0.5, y: l.y + l.h, o: "h" });
    }
    for (let y = l.y + 1; y < l.y + l.h - 1; y += 3) {
      if (!inside(l.x - 0.3, y + 0.5)) windows.push({ x: l.x, y: y + 0.5, o: "v" });
      if (!inside(l.x + l.w + 0.3, y + 0.5)) windows.push({ x: l.x + l.w, y: y + 0.5, o: "v" });
    }
  });
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < 1.6 && Math.abs(a.y - b.y) < 1.6;
  // numbering: the entrance room, then the rest by distance from the entrance door
  const order = orderFrom(leaves.length, er, (i) => Math.hypot(leaves[i].x + leaves[i].w / 2 - ed.x, leaves[i].y + leaves[i].h / 2 - ed.y));
  const out = empty("building", W, H);
  out.rooms = order.map((i) => ({ ...leaves[i] }));
  out.floors = parts.map((p) => ({ t: "rect", ...p }));
  out.doors = doors;
  out.windows = windows.filter((w) => !doors.some((d) => near(d, w)));
  out.entrance = { x: ed.x, y: ed.y, dir: entry, room: 0 };
  return out;
}

/* ---------------- village ---------------- */

function genVillage(o: LayoutOptions, R: Random): Layout {
  const W = o.cols, H = o.rows;
  const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const roads: Layout["roads"] = [];
  const cx = W / 2 + (R() - 0.5) * 3, cy = H / 2 + (R() - 0.5) * 2;
  const wavy = (pts: Point[]) => pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : { x: p.x + (R() - 0.5) * 1.6, y: p.y + (R() - 0.5) * 1.6 }));
  const across = Array.from({ length: 6 }, (_, i) => ({ x: i / 5 * W + (i === 0 ? -1 : i === 5 ? 1 : 0), y: cy + (i - 2.5) * (R() - 0.5) * 0.8 }));
  roads.push({ pts: wavy(across), w: 1.8 });
  if (o.roads === "cross" || o.roads === "ring") roads.push({ pts: wavy(Array.from({ length: 5 }, (_, i) => ({ x: cx + (i - 2) * (R() - 0.5) * 0.8, y: i / 4 * H + (i === 0 ? -1 : i === 4 ? 1 : 0) }))), w: 1.5 });
  if (o.roads === "ring") {
    const rx = W * 0.32, ry = H * 0.32;
    roads.push({ pts: Array.from({ length: 17 }, (_, i) => ({ x: cx + Math.cos(i / 16 * Math.PI * 2) * rx, y: cy + Math.sin(i / 16 * Math.PI * 2) * ry })), w: 1.1, ring: true });
  }
  const segD = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  // distance to the nearest road edge (internal; not part of the output)
  const roadD = (p: Point) => Math.min(...roads.flatMap((r) => r.pts.slice(1).map((q, i) => segD(p, r.pts[i], q) - r.w / 2)));
  const square = { cx, cy, rx: 3.2, ry: 2.6 };
  type Side4 = { o: "h" | "v"; x: number; y: number; p: Point };
  const houses: (Box & { door: Side4 })[] = [], blocked: Box[] = [{ x: cx - 4, y: cy - 3.4, w: 8, h: 6.8 }];
  for (let i = 0; i < 1500 && houses.length < o.houses; i++) {
    const w = ri(3, 5), h = ri(3, 4), x = ri(1, W - w - 1), y = ri(1, H - h - 1), r: Box = { x, y, w, h };
    if (houses.some((q) => ov(q, r, 1)) || blocked.some((q) => ov(q, r))) continue;
    let minD = 1e9;
    for (let yy = y; yy <= y + h; yy += 0.5) for (let xx = x; xx <= x + w; xx += 0.5) minD = Math.min(minD, roadD({ x: xx, y: yy }));
    if (minD < 0.4 || minD > 3.5) continue;
    // door on the side nearest a road
    const sides: Side4[] = [
      { o: "h", x: x + Math.floor(w / 2) + 0.5, y, p: { x: x + w / 2, y: y - 1 } },
      { o: "h", x: x + Math.floor(w / 2) + 0.5, y: y + h, p: { x: x + w / 2, y: y + h + 1 } },
      { o: "v", x, y: y + Math.floor(h / 2) + 0.5, p: { x: x - 1, y: y + h / 2 } },
      { o: "v", x: x + w, y: y + Math.floor(h / 2) + 0.5, p: { x: x + w + 1, y: y + h / 2 } },
    ];
    sides.sort((a, b) => roadD(a.p) - roadD(b.p));
    houses.push({ ...r, door: sides[0] });
  }
  // houses nearest the square first
  houses.sort((a, b) => Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) - Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy));
  const doors: LayoutDoor[] = houses.map((h) => ({ x: h.door.x, y: h.door.y, o: h.door.o, len: 1 }));
  // fields and palisade
  const fields: (Box & { rot: boolean })[] = [];
  if (o.fields) for (let i = 0; i < 400 && fields.length < 4; i++) {
    const w = ri(4, 7), h = ri(3, 5), x = ri(0, W - w), y = ri(0, H - h), r: Box = { x, y, w, h };
    if (houses.some((q) => ov(q, r, 1)) || fields.some((q) => ov(q, r, 1)) || ov(r, { x: cx - 5, y: cy - 4, w: 10, h: 8 })) continue;
    let ok = true;
    for (let yy = y; yy <= y + h && ok; yy++) for (let xx = x; xx <= x + w; xx++) if (roadD({ x: xx, y: yy }) < 0.6) { ok = false; break; }
    if (ok) fields.push({ ...r, rot: R() < 0.5 });
  }
  let pal: Box | null = null;
  if (o.palisade && houses.length) {
    const xs = houses.flatMap((h) => [h.x, h.x + h.w]), ys = houses.flatMap((h) => [h.y, h.y + h.h]);
    const x0 = Math.max(0.6, Math.min(...xs) - 1.2), x1 = Math.min(W - 0.6, Math.max(...xs) + 1.2), y0 = Math.max(0.6, Math.min(...ys) - 1.2), y1 = Math.min(H - 0.6, Math.max(...ys) + 1.2);
    pal = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const out = empty("village", W, H);
  out.rooms = houses.map((h) => ({ x: h.x, y: h.y, w: h.w, h: h.h }));
  out.roads = roads;
  out.square = square;
  out.doors = doors;
  out.fields = fields;
  out.palisade = pal;
  return out;
}
