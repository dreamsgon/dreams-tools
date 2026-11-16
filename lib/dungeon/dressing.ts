import { stampById } from "../map-stamps.ts";
import type { Layout, LayoutRoom } from "./layout.ts";

/**
 * What goes in a generated map's rooms: each room gets a purpose from a theme (a crypt's tombs and
 * ossuaries, a manor's kitchen and bedrooms), the things that purpose holds, columns, clutter, lights
 * and secret doors. Everything is placed on whole squares, so it lines up with the grid.
 * Positions are in squares; lib/dungeon/drawing.ts turns them into stamp shapes.
 */
export type Family = "dungeon" | "building" | "village";
type Purpose = { name: string; centre?: string; wall: string[]; stamps: string[]; light: LightKind[]; rank?: number };
export type Theme = { id: string; name: string; family: Family; entrance?: Purpose; boss?: Purpose; rooms: Record<string, Purpose>; mix: Record<string, number> };
export type LightKind = "torch" | "brazier" | "candles" | "lantern" | "magic" | "crystal" | "fire" | "hearth" | "chandelier";

const P = (name: string, o: Partial<Purpose> = {}): Purpose => ({ name, wall: [], stamps: [], light: [], ...o });
export const dungeonThemes: Theme[] = [
  { id: "crypt", name: "Crypt", family: "dungeon", entrance: P("Entrance", { stamps: ["rubble"] }),
    boss: P("Founder's tomb", { centre: "sarcophagus", stamps: ["statue", "statue", "candelabra", "chest"], light: ["brazier", "brazier"] }),
    rooms: { tomb: P("Tomb", { stamps: ["coffin", "coffin", "bones", "candles"], light: ["candles"] }), ossuary: P("Ossuary", { stamps: ["bones", "bones", "bones", "rubble"], wall: ["spider-web"] }),
      shrine: P("Shrine", { centre: "altar", stamps: ["statue", "candles"], light: ["brazier"] }), guard: P("Guard post", { stamps: ["table", "chair", "chair", "barrel"], wall: ["weapon-rack"], light: ["torch"] }),
      vault: P("Sealed vault", { stamps: ["chest", "chest", "iron-cage"], wall: ["lever"] }) }, mix: { tomb: 3, ossuary: 2, shrine: 1, guard: 1, vault: 1 } },
  { id: "bandit", name: "Bandit hideout", family: "dungeon", entrance: P("Lookout", { stamps: ["crates", "barrel"], light: ["torch"] }),
    boss: P("Chief's den", { centre: "rug", stamps: ["double-bed", "chest", "table", "chair"], light: ["brazier"] }),
    rooms: { barracks: P("Barracks", { stamps: ["cot", "cot", "cot", "chest"] }), mess: P("Mess hall", { centre: "round-table", stamps: ["barrel", "cauldron", "stool"], light: ["fire"] }),
      store: P("Storeroom", { stamps: ["crates", "crate", "barrel", "sacks", "sacks"] }), prison: P("Cells", { stamps: ["iron-cage", "iron-cage", "bones"] }),
      armoury: P("Armoury", { stamps: ["armour-stand", "workbench"], wall: ["weapon-rack"], light: ["torch"] }) }, mix: { barracks: 2, mess: 1, store: 2, prison: 1, armoury: 1 } },
  { id: "temple", name: "Sunken temple", family: "dungeon", entrance: P("Narthex", { stamps: ["statue", "statue"] }),
    boss: P("Sanctum", { centre: "magic-circle", stamps: ["rune-pedestal", "rune-pedestal"], light: ["brazier", "brazier", "magic"] }),
    rooms: { chapel: P("Chapel", { centre: "altar", stamps: ["bench", "bench", "bench"], light: ["candles"] }), cells: P("Monks' cells", { stamps: ["cot", "cot", "desk"] }),
      library: P("Library", { stamps: ["desk", "chair"], wall: ["bookshelf", "bookshelf"], light: ["candles"] }), baths: P("Baths", { centre: "fountain", stamps: ["bathtub"] }),
      reliquary: P("Reliquary", { stamps: ["chest", "rune-pedestal", "statue"], light: ["magic"] }) }, mix: { chapel: 1, cells: 2, library: 1, baths: 1, reliquary: 1 } },
  { id: "mine", name: "Old mine", family: "dungeon", entrance: P("Mine mouth", { stamps: ["cart", "crates"], light: ["lantern"] }),
    boss: P("Collapsed shaft", { centre: "pit", stamps: ["rubble", "rubble", "glow-crystal"], light: ["crystal"] }),
    rooms: { face: P("Working face", { stamps: ["rubble", "cart", "crates"], light: ["lantern"] }), forge: P("Forge", { stamps: ["forge", "anvil", "barrel"], light: ["fire"] }),
      camp: P("Miners' camp", { centre: "campfire", stamps: ["cot", "sacks", "barrel"], light: ["fire"] }), store: P("Store", { stamps: ["crates", "sacks", "barrel", "barrel"] }),
      crystals: P("Crystal grotto", { stamps: ["glow-crystal", "glow-crystal", "mushrooms"], light: ["crystal", "crystal"] }) }, mix: { face: 2, forge: 1, camp: 1, store: 1, crystals: 1 } },
  { id: "manor", name: "Manor", family: "building", rooms: {
      hall: P("Great hall", { rank: 5, centre: "round-table", wall: ["fireplace"], stamps: ["bench", "rug"], light: ["chandelier", "hearth"] }),
      kitchen: P("Kitchen", { rank: 3, wall: ["fireplace"], stamps: ["table", "cauldron", "barrel", "sacks"], light: ["hearth"] }),
      bedroom: P("Bedroom", { rank: 2, stamps: ["double-bed", "chest"], wall: ["wardrobe"], light: ["candles"] }),
      study: P("Study", { rank: 2, stamps: ["desk", "chair"], wall: ["bookshelf"], light: ["candles"] }),
      chapel: P("Chapel", { rank: 3, centre: "altar", stamps: ["bench", "bench"], light: ["candles"] }),
      bath: P("Bath", { rank: 1, stamps: ["bathtub"] }), pantry: P("Pantry", { rank: 1, stamps: ["crates", "barrel", "sacks"] }) },
    mix: { hall: 1, kitchen: 1, bedroom: 3, study: 1, chapel: 0, bath: 1, pantry: 1 } },
  { id: "tavern", name: "Tavern", family: "building", rooms: {
      common: P("Common room", { rank: 5, stamps: ["round-table", "round-table", "bench", "barrel"], wall: ["fireplace"], light: ["hearth", "lantern"] }),
      kitchen: P("Kitchen", { rank: 3, wall: ["fireplace"], stamps: ["table", "cauldron", "sacks"], light: ["hearth"] }),
      guest: P("Guest room", { rank: 2, stamps: ["bed", "chest"], light: ["candles"] }), cellar: P("Cellar", { rank: 1, stamps: ["barrel", "barrel", "crates"] }),
      office: P("Keeper's office", { rank: 2, stamps: ["desk", "chair", "chest"], light: ["candles"] }) }, mix: { common: 1, kitchen: 1, guest: 4, cellar: 1, office: 1 } },
  { id: "shrine", name: "Temple", family: "building", rooms: {
      nave: P("Nave", { rank: 5, centre: "altar", stamps: ["bench", "bench", "bench", "bench"], light: ["brazier", "brazier"] }),
      vestry: P("Vestry", { rank: 2, stamps: ["chest"], wall: ["wardrobe"], light: ["candles"] }), cell: P("Cell", { rank: 1, stamps: ["cot", "stool"] }),
      library: P("Library", { rank: 2, wall: ["bookshelf", "potion-shelf"], stamps: ["desk"], light: ["candles"] }), store: P("Store", { rank: 1, stamps: ["crates", "sacks"] }) },
    mix: { nave: 1, vestry: 1, cell: 3, library: 1, store: 1 } },
  { id: "farming", name: "Farming village", family: "village", rooms: {
      farm: P("Farmhouse", { stamps: ["bed", "table"] }), barn: P("Barn", { stamps: ["hay-bale", "hay-bale", "cart"] }), smithy: P("Smithy", { stamps: ["forge", "anvil"], light: ["fire"] }),
      inn: P("Inn", { stamps: ["round-table", "barrel"], light: ["hearth"] }), shrine: P("Shrine", { centre: "altar", light: ["candles"] }), home: P("Cottage", { stamps: ["bed", "chest"] }) },
    mix: { farm: 3, barn: 2, smithy: 1, inn: 1, shrine: 1, home: 3 } },
  { id: "market", name: "Market town", family: "village", rooms: {
      inn: P("Inn", { stamps: ["round-table", "round-table", "barrel"], light: ["hearth"] }), smithy: P("Smithy", { stamps: ["forge", "anvil"], light: ["fire"] }),
      shop: P("Shop", { stamps: ["table", "crates"], wall: ["potion-shelf"] }), guard: P("Guard house", { stamps: ["cot", "cot"], wall: ["weapon-rack"], light: ["torch"] }),
      hall: P("Town hall", { stamps: ["table", "bench"], wall: ["notice-board"] }), home: P("House", { stamps: ["bed", "chest"] }) },
    mix: { inn: 1, smithy: 1, shop: 3, guard: 1, hall: 1, home: 4 } },
];
export const themeById = (id: string) => dungeonThemes.find(t => t.id === id) ?? dungeonThemes[0];
export const familyOf = (kind: Layout["kind"]): Family => kind === "building" ? "building" : kind === "village" ? "village" : "dungeon";
export const themesFor = (kind: Layout["kind"]) => dungeonThemes.filter(t => t.family === familyOf(kind));

/** The stamp each kind of light uses. A hearth is a fireplace; fire is a campfire, or lights a forge already there. */
const lightStamp: Record<LightKind, string> = { torch: "wall-torch", brazier: "brazier", candles: "candles", lantern: "lantern", magic: "magic-orb", crystal: "glow-crystal", fire: "campfire", hearth: "fireplace", chandelier: "chandelier" };
const lightGroup: Record<LightKind, "torches" | "braziers" | "candles" | "magic" | null> = { torch: "torches", brazier: "braziers", fire: null, hearth: null, candles: "candles", chandelier: "candles", lantern: null, magic: "magic", crystal: "magic" };

export type DressOptions = {
  theme: string; mix: Record<string, number> | null; populate: boolean; clutter: number;
  columns: boolean; columnDensity: number;
  lights: boolean; lightDensity: number; torches: boolean; braziers: boolean; candles: boolean; magic: boolean; darkRooms: number;
  secret: number;
};
export const defaultDressOptions: DressOptions = {
  theme: "crypt", mix: null, populate: true, clutter: .4, columns: true, columnDensity: .5,
  lights: true, lightDensity: .5, torches: true, braziers: true, candles: true, magic: true, darkRooms: .2, secret: .1,
};
/** The theme each layout starts with. */
export const layoutTheme: Record<string, string> = { branching: "crypt", halls: "temple", caves: "mine", building: "manor", village: "farming" };

/** A stamp to place: its centre in squares, its turn, and whether its light is out. */
export type Placement = { stamp: string; x: number; y: number; rotation: number; unlit?: boolean; light?: LightKind };
/** One line of the room key. */
export type KeyEntry = { number: number; name: string; things: string[]; lit: boolean | null; secret: boolean };
export type Dressing = { placements: Placement[]; key: KeyEntry[]; secretDoors: number[] };

type Random = () => number;
type Cell = [number, number];

/** Dress a layout. `random` places things; `lightRandom` picks lights, so changing the lights leaves the furniture alone. */
export function dressLayout(layout: Layout, o: DressOptions, random: Random, lightRandom: Random, keep: { x: number; y: number }[] = []): Dressing {
  const int = (a: number, b: number) => a + Math.floor(random() * (b - a + 1));
  const pick = <T,>(l: readonly T[]) => l[Math.floor(random() * l.length)];
  const theme = themeById(o.theme).family === familyOf(layout.kind) ? themeById(o.theme) : themesFor(layout.kind)[0];
  const village = layout.kind === "village", building = layout.kind === "building", cave = layout.kind === "cave";
  const placements: Placement[] = [];
  const used = new Set<string>(), key = (x: number, y: number) => `${x},${y}`;
  const take = (x: number, y: number, w: number, h: number) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) used.add(key(xx, yy)); };
  const open = solidTest(layout);
  const free = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (used.has(key(xx, yy)) || !open(xx, yy)) return false;
    return true;
  };
  // Doorways, room numbers and the way in stay clear.
  for (const d of layout.doors) {
    const fx = Math.floor(d.x), fy = Math.floor(d.y), half = Math.ceil((d.len ?? 1) / 2);
    for (let k = -half; k < half + 1; k++) for (const s of [-2, -1, 0, 1]) used.add(d.o === "v" ? key(fx + s, Math.floor(d.y - .5) + k) : key(Math.floor(d.x - .5) + k, fy + s));
  }
  for (const p of keep) used.add(key(Math.floor(p.x), Math.floor(p.y)));
  layout.rooms.forEach(r => { const c = centre(r); for (const dx of [-.4, .4]) for (const dy of [-.4, .4]) used.add(key(Math.floor(c.x + dx), Math.floor(c.y + dy))); });

  const size = (id: string) => { const s = stampById(id); return s ? { w: s.w, h: s.h } : null; };
  const put = (id: string, x: number, y: number, rotation = 0, mark = true): Placement | null => {
    const s = size(id); if (!s) return null;
    const w = rotation % 180 ? s.h : s.w, h = rotation % 180 ? s.w : s.h;
    if (mark) take(x, y, w, h);
    const p: Placement = { stamp: id, x: x + w / 2, y: y + h / 2, rotation };
    placements.push(p);
    return p;
  };
  const inRoom = (r: LayoutRoom, id: string, inset = 1): Placement | null => {
    const s = size(id); if (!s) return null;
    const rotation = s.w !== s.h && random() < .5 ? 90 : 0, w = rotation ? s.h : s.w, h = rotation ? s.w : s.h;
    const cells = roomCells(r, inset), set = new Set(cells.map(c => key(c[0], c[1])));
    for (let k = 0; k < 30 && cells.length; k++) {
      const [x, y] = pick(cells);
      if (!set.has(key(x + w - 1, y + h - 1))) continue;
      if (free(x, y, w, h)) return put(id, x, y, rotation);
    }
    return null;
  };
  // Wall things are drawn with their back to the top of the stamp, so a turn of 0 stands against the north wall.
  const onWall = (r: LayoutRoom, id: string): Placement | null => {
    const s = size(id); if (!s) return null;
    if (r.round || r.cave) return inRoom(r, id);
    for (let k = 0; k < 30; k++) {
      const side = pick(["N", "S", "E", "W"] as const);
      let x: number, y: number, rotation: number;
      if (side === "N") { rotation = 0; x = int(r.x, r.x + r.w - s.w); y = r.y; }
      else if (side === "S") { rotation = 180; x = int(r.x, r.x + r.w - s.w); y = r.y + r.h - s.h; }
      else if (side === "W") { rotation = 270; x = r.x; y = int(r.y, r.y + r.h - s.w); }
      else { rotation = 90; x = r.x + r.w - s.h; y = int(r.y, r.y + r.h - s.w); }
      const w = rotation % 180 ? s.h : s.w, h = rotation % 180 ? s.w : s.h;
      if (x < r.x || y < r.y || x + w > r.x + r.w || y + h > r.y + r.h) continue;
      if (free(x, y, w, h)) return put(id, x, y, rotation);
    }
    return null;
  };
  const inCentre = (r: LayoutRoom, id: string): Placement | null => {
    const s = size(id); if (!s) return null;
    const c = centre(r), rotation = s.w !== s.h && r.h > r.w ? 90 : 0, w = rotation ? s.h : s.w, h = rotation ? s.w : s.h;
    // Beside the room's number, which sits in the middle.
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 0]]) {
      const x = Math.round(c.x - w / 2) + dx * Math.ceil((w + 1) / 2), y = Math.round(c.y - h / 2) + dy * Math.ceil((h + 1) / 2);
      if (free(x, y, w, h)) return put(id, x, y, rotation);
    }
    return inRoom(r, id);
  };

  // Purposes: the entrance first, the last room (or the great hall) is the boss's, the rest from the mix.
  const rooms = layout.rooms;
  const mix = Object.fromEntries(Object.keys(theme.rooms).map(k => [k, Math.max(0, Math.round(o.mix?.[k] ?? theme.mix[k] ?? 0))]));
  const bag = Object.entries(mix).flatMap(([k, n]) => Array<string>(n).fill(k));
  const purposes: Purpose[] = [];
  let bossIndex = -1;
  if (theme.family === "dungeon") {
    bossIndex = rooms.findIndex(r => r.great);
    if (bossIndex < 0 && rooms.length > 2) bossIndex = rooms.length - 1;
    shuffle(bag, random);
    const entranceRoom = layout.entrance && layout.entrance.room >= 0 ? layout.entrance.room : 0;
    rooms.forEach((_, i) => purposes[i] = i === bossIndex && theme.boss ? theme.boss : i === entranceRoom && theme.entrance ? theme.entrance : bag.length ? theme.rooms[bag.shift()!] : P("Empty room"));
  } else if (building) {
    // The biggest rooms get the most important purposes.
    shuffle(bag, random);
    bag.sort((a, b) => (theme.rooms[b].rank ?? 0) - (theme.rooms[a].rank ?? 0));
    rooms.map((r, i) => ({ i, area: r.w * r.h })).sort((a, b) => b.area - a.area).forEach(({ i }) => purposes[i] = bag.length ? theme.rooms[bag.shift()!] : P("Room"));
  } else {
    shuffle(bag, random);
    rooms.forEach((_, i) => purposes[i] = bag.length ? theme.rooms[bag.shift()!] : Object.values(theme.rooms).at(-1)!);
  }

  const roomOf = new Map<Placement, number>();
  const mark = (i: number, from: number) => placements.slice(from).forEach(p => roomOf.set(p, i));

  // Columns along the long walls of big rooms, or in a ring in round ones.
  if (o.columns && !village && !cave) rooms.forEach((r, i) => {
    if (r.cave || Math.min(r.w, r.h) < 5 || random() > .25 + o.columnDensity * .75) return;
    const from = placements.length;
    if (r.round) {
      const n = 6 + Math.round(o.columnDensity * 4);
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = Math.floor(r.x + r.w / 2 + Math.cos(a) * (r.w / 2 - 1.4)), y = Math.floor(r.y + r.h / 2 + Math.sin(a) * (r.h / 2 - 1.4)); if (free(x, y, 1, 1)) put("pillar", x, y); }
    } else {
      const gap = o.columnDensity > .66 ? 2 : 3;
      for (let x = r.x + 1; x < r.x + r.w - 1; x += gap) for (const y of [r.y + 1, r.y + r.h - 2]) if (free(x, y, 1, 1)) put("pillar", x, y);
    }
    mark(i, from);
  });

  // Furnishing: what each purpose holds, then a little clutter.
  if (o.populate) rooms.forEach((r, i) => {
    const p = purposes[i], from = placements.length;
    if (village) { if (p.centre && r.w >= 3 && r.h >= 3) inCentre(r, p.centre); }
    else {
      if (p.centre) inCentre(r, p.centre);
      p.wall.forEach(id => onWall(r, id));
      p.stamps.forEach(id => { if (random() < .9) inRoom(r, id, (size(id)?.w ?? 1) > 1 ? 1 : 0); });
      const extra = Math.round(o.clutter * r.w * r.h / 14);
      const misc = cave ? ["rubble", "mushrooms", "bones", "rock"] : building ? ["crate", "barrel", "stool", "sacks"] : ["rubble", "bones", "barrel", "crate", "spider-web"];
      for (let k = 0; k < extra; k++) inRoom(r, pick(misc), 0);
    }
    mark(i, from);
  });

  // Secret doors: some of the inside doors look like wall.
  const secretDoors: number[] = [];
  if (o.secret > 0 && !village && !cave) layout.doors.forEach((d, i) => { if (!d.big && !d.outer && random() < o.secret) secretDoors.push(i); });

  // Lights: what each purpose asks for, torches along the walls, and some rooms left dark.
  const lit: (boolean | null)[] = rooms.map(() => null);
  const allowed = (k: LightKind) => { const g = lightGroup[k]; return !g || o[g]; };
  if (o.lights) rooms.forEach((r, i) => {
    const entrance = layout.entrance && i === layout.entrance.room;
    if (!entrance && i !== bossIndex && lightRandom() < o.darkRooms) { lit[i] = false; return; }
    lit[i] = true;
    const kinds = [...purposes[i].light];
    const around = r.cave ? Math.PI * (r.rad ?? 3) * 2 : 2 * (r.w + r.h);
    if (!village && !cave) for (let k = Math.round(o.lightDensity * around / 10); k > 0; k--) kinds.push("torch");
    if (cave && lightRandom() < o.lightDensity) kinds.push(lightRandom() < .6 ? "crystal" : "lantern");
    if (!kinds.length && lightRandom() < o.lightDensity * .6) kinds.push(village ? "candles" : "torch");
    const from = placements.length;
    for (const kind of kinds) {
      if (!allowed(kind)) continue;
      const here = (ids: string[]) => placements.find(p => ids.includes(p.stamp) && roomOf.get(p) === i);
      if (kind === "hearth" || kind === "fire") {
        const found = here(kind === "hearth" ? ["fireplace", "campfire"] : ["campfire", "forge"]);
        if (found) { if (found.stamp === "forge") found.light = "fire"; continue; }
      }
      if (kind === "chandelier") { if (!r.cave && !r.round && r.w >= 4 && r.h >= 4) { const c = centre(r); put("chandelier", Math.round(c.x - 1), Math.round(c.y - 1), 0, false); } continue; }
      const id = lightStamp[kind];
      if (kind === "torch" || kind === "hearth") onWall(r, id); else inRoom(r, id, 0);
    }
    mark(i, from);
  });
  // Halls between rooms get torches too.
  if (o.lights && o.torches && layout.kind === "dungeon") {
    for (const f of layout.floors) {
      if (f.t !== "rect" || Math.min(f.w, f.h) < 2 || rooms.some(r => overlap(r, f))) continue;
      const tall = f.h > f.w, n = Math.max(1, Math.round((tall ? f.h : f.w) * o.lightDensity / 7));
      for (let k = 0; k < n; k++) {
        const t = (k + .5) / n, x = tall ? (k % 2 ? f.x + f.w - 1 : f.x) : Math.floor(f.x + f.w * t), y = tall ? Math.floor(f.y + f.h * t) : (k % 2 ? f.y + f.h - 1 : f.y);
        if (free(x, y, 1, 1)) put("wall-torch", x, y, tall ? (x === f.x ? 270 : 90) : (y === f.y ? 0 : 180));
      }
    }
  }
  if (village && o.populate) villageDressing(layout, o, theme.id, { random, int, pick, free, put });
  // A room left dark keeps its lamps, unlit; with lights off every lamp is out.
  for (const p of placements) {
    const r = roomOf.get(p);
    if (!o.lights || (r !== undefined && lit[r] === false)) if (stampById(p.stamp)?.light || p.light) p.unlit = true;
  }

  const roomKey: KeyEntry[] = rooms.map((r, i) => {
    const counts = new Map<string, number>();
    for (const p of placements) if (roomOf.get(p) === i && p.stamp !== "pillar") { const n = stampById(p.stamp)?.name ?? p.stamp; counts.set(n, (counts.get(n) ?? 0) + 1); }
    const things = [...counts].map(([n, c]) => c > 1 ? `${c} × ${n.toLowerCase()}` : n.toLowerCase());
    const secret = secretDoors.some(d => touches(r, layout.doors[d]));
    return { number: i + 1, name: purposes[i].name, things, lit: lit[i], secret };
  });
  return { placements, key: roomKey, secretDoors };
}

type VillageHelpers = { random: Random; int: (a: number, b: number) => number; pick: <T>(l: readonly T[]) => T; free: (x: number, y: number, w: number, h: number) => boolean; put: (id: string, x: number, y: number, rotation?: number, mark?: boolean) => Placement | null };
function villageDressing(layout: Layout, o: DressOptions, theme: string, { random, int, pick, free, put }: VillageHelpers) {
  const sq = layout.square;
  if (sq) {
    const wx = Math.floor(sq.cx - .5), wy = Math.floor(sq.cy - .5);
    if (free(wx, wy, 1, 1)) put("well", wx, wy);
    if (theme === "market") for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + .4, x = Math.floor(sq.cx + Math.cos(a) * 2.2 - 1), y = Math.floor(sq.cy + Math.sin(a) * 1.7 - .5); if (free(x, y, 2, 1)) put("market-stall", x, y, k < 2 ? 0 : 180); }
    else { const x = Math.floor(sq.cx + 1.2), y = Math.floor(sq.cy - 1.6); if (free(x, y, 2, 1)) put("water-trough", x, y); }
  }
  // Lanterns by front doors.
  if (o.lights && o.lightDensity > .2) for (const d of layout.doors) {
    if (random() > o.lightDensity) continue;
    const x = Math.floor(d.o === "h" ? d.x + .5 : d.x), y = Math.floor(d.o === "v" ? d.y + .5 : d.y);
    for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if (free(x + dx, y + dy, 1, 1)) { put("lantern", x + dx, y + dy); break; }
  }
  // Yard things beside houses.
  for (const h of layout.rooms) if (random() < .5) { const x = h.x + h.w, y = h.y + int(0, h.h - 1); const id = pick(["barrel", "crates", "hay-bale"]); if (free(x, y, 1, 1)) put(id, x, y); }
}

/** Which squares are open ground for things to stand on. */
function solidTest(layout: Layout): (x: number, y: number) => boolean {
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < layout.cols && y < layout.rows;
  if (layout.kind === "cave" && layout.rock) { const rock = layout.rock, wet = new Set(layout.water.map(p => `${Math.floor(p.x)},${Math.floor(p.y)}`)); return (x, y) => inMap(x, y) && rock[y]?.[x] === 0 && !wet.has(`${x},${y}`); }
  if (layout.kind === "village") {
    const blocked = (x: number, y: number) => layout.fields.some(f => inBox(f, x, y));
    return (x, y) => inMap(x, y) && !blocked(x, y);
  }
  const grid = Array.from({ length: layout.rows }, () => new Uint8Array(layout.cols));
  const fill = (pred: (x: number, y: number) => boolean, b: { x: number; y: number; w: number; h: number }) => {
    for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(layout.rows, Math.ceil(b.y + b.h)); y++) for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(layout.cols, Math.ceil(b.x + b.w)); x++) if (pred(x + .5, y + .5)) grid[y][x] = 1;
  };
  for (const f of layout.floors) {
    if (f.t === "rect") fill(() => true, f);
    else fill((x, y) => ((x - f.cx) / f.rx) ** 2 + ((y - f.cy) / f.ry) ** 2 <= 1, { x: f.cx - f.rx, y: f.cy - f.ry, w: f.rx * 2, h: f.ry * 2 });
  }
  for (const r of layout.rooms) fill(() => true, r);
  return (x, y) => inMap(x, y) && grid[y][x] === 1;
}

function centre(r: LayoutRoom) { return r.cave && r.cx !== undefined && r.cy !== undefined ? { x: r.cx, y: r.cy } : { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
function roomCells(r: LayoutRoom, inset: number): Cell[] {
  const out: Cell[] = [];
  if (r.cave && r.cx !== undefined && r.cy !== undefined) {
    const rr = Math.max(1, (r.rad ?? 3) - 1.2 - inset * .3);
    for (let y = Math.floor(r.cy - rr); y <= r.cy + rr; y++) for (let x = Math.floor(r.cx - rr); x <= r.cx + rr; x++) if (Math.hypot(x + .5 - r.cx, y + .5 - r.cy) <= rr) out.push([x, y]);
    return out;
  }
  if (r.round) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const nx = (x + .5 - cx) / (r.w / 2 - .6 - inset * .3), ny = (y + .5 - cy) / (r.h / 2 - .6 - inset * .3); if (nx * nx + ny * ny <= 1) out.push([x, y]); }
    return out;
  }
  for (let y = r.y + inset; y < r.y + r.h - inset; y++) for (let x = r.x + inset; x < r.x + r.w - inset; x++) out.push([x, y]);
  return out;
}
const inBox = (b: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const touches = (r: LayoutRoom, d: { x: number; y: number }) => d.x >= r.x - .6 && d.x <= r.x + r.w + .6 && d.y >= r.y - .6 && d.y <= r.y + r.h + .6;
function shuffle<T>(list: T[], random: Random) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } }
