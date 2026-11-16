import test from "node:test";
import assert from "node:assert/strict";
import { makeLayout, defaultLayoutOptions, defaultRoomCount } from "../lib/dungeon/layout.ts";
import { seededRandom } from "../lib/map-generator.ts";

const sizes = [[24, 18], [32, 24], [44, 32]];
const seeds = ["ember-1", "frost-2", "moss-3", "iron-4", "ash-5"];
const opts = (layout, [cols, rows], extra = {}) => ({ ...defaultLayoutOptions, rooms: defaultRoomCount(layout), layout, cols, rows, ...extra });
const gen = (layout, size, seed, extra) => makeLayout(opts(layout, size, extra), seededRandom(`${layout}|${size}|${seed}|${JSON.stringify(extra || {})}`));
const each = (layouts, fn, extra) => { for (const layout of layouts) for (const size of sizes) for (const seed of seeds) fn(gen(layout, size, seed, extra), layout, size, seed, `${layout} ${size.join("x")} ${seed}`); };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const all = ["branching", "halls", "caves", "building", "village"];
const EPS = 1e-9;
const inBox = (b, l) => b.x >= -EPS && b.y >= -EPS && b.x + b.w <= l.cols + EPS && b.y + b.h <= l.rows + EPS;
const inPt = (p, l) => p.x >= -EPS && p.y >= -EPS && p.x <= l.cols + EPS && p.y <= l.rows + EPS;

test("the same seed gives the same layout, and a different one differs", () => {
  for (const layout of all) for (const size of sizes) {
    const a = gen(layout, size, "ember-1"), b = gen(layout, size, "ember-1");
    assert.deepEqual(a, b, `${layout} ${size}`);
  }
  const x = JSON.stringify(gen("branching", sizes[1], "ember-1")), y = JSON.stringify(gen("branching", sizes[1], "frost-2"));
  assert.notEqual(x, y);
});

test("Math.random is never used", () => {
  const real = Math.random;
  Math.random = () => { throw new Error("Math.random called"); };
  try { for (const layout of all) gen(layout, sizes[1], "ember-1", { entry: "any" }); } finally { Math.random = real; }
});

test("everything stays inside the map", () => {
  each(all, (l, layout, size, seed, what) => {
    assert.equal(l.cols, size[0]); assert.equal(l.rows, size[1]);
    l.rooms.forEach((r) => assert.ok(inBox(r, l), `${what} room ${JSON.stringify(r)}`));
    l.floors.forEach((f) => assert.ok(f.t === "rect" ? inBox(f, l) : inBox({ x: f.cx - f.rx, y: f.cy - f.ry, w: 2 * f.rx, h: 2 * f.ry }, l), `${what} floor ${JSON.stringify(f)}`));
    l.doors.forEach((d) => assert.ok(inPt(d, l), `${what} door ${JSON.stringify(d)}`));
    l.windows.forEach((w) => assert.ok(inPt(w, l), `${what} window`));
    l.fields.forEach((f) => assert.ok(inBox(f, l), `${what} field`));
    if (l.palisade) assert.ok(inBox(l.palisade, l), `${what} palisade`);
    if (l.entrance) assert.ok(inPt(l.entrance, l), `${what} entrance`);
    l.water.forEach((p) => assert.ok(p.x >= 0 && p.y >= 0 && p.x < l.cols && p.y < l.rows));
    if (l.rock) { assert.equal(l.rock.length, l.rows); l.rock.forEach((row) => assert.equal(row.length, l.cols)); }
  }, { entry: "any" });
});

test("rooms and houses do not overlap", () => {
  each(["branching", "halls", "village"], (l, layout, size, seed, what) => {
    for (let i = 0; i < l.rooms.length; i++) for (let j = i + 1; j < l.rooms.length; j++) assert.ok(!overlap(l.rooms[i], l.rooms[j]), `${what} rooms ${i} and ${j}`);
  });
  each(["branching", "halls"], (l, layout, size, seed, what) => {
    for (let i = 0; i < l.rooms.length; i++) for (let j = i + 1; j < l.rooms.length; j++) assert.ok(!overlap(l.rooms[i], l.rooms[j]), `${what} lr rooms ${i} and ${j}`);
  }, { symmetry: "lr", curved: 0.5 });
});

test("it roughly hits the requested room count", () => {
  for (const [layout, n] of [["branching", 6], ["branching", 12], ["halls", 6], ["halls", 12], ["caves", 4], ["building", 5], ["building", 9], ["village", 8]]) {
    for (const size of sizes) for (const seed of seeds) {
      const l = gen(layout, size, seed, layout === "village" ? { houses: n } : { rooms: n });
      assert.ok(l.rooms.length >= 2, `${layout} ${n} ${size} ${seed}: ${l.rooms.length}`);
      assert.ok(l.rooms.length <= n + 1, `${layout} ${n} ${size} ${seed}: ${l.rooms.length} is too many`);
      // the big map has room for the whole request, except where chambers must keep their distance
      if (size[0] === 44 && layout !== "caves") assert.ok(l.rooms.length >= Math.ceil(n / 2), `${layout} ${n} ${size} ${seed}: only ${l.rooms.length}`);
    }
  }
  const l = gen("branching", sizes[2], "ember-1", { rooms: 99 });
  assert.ok(l.rooms.length <= 25, "rooms are clamped to 24");
  assert.ok(gen("building", sizes[1], "ember-1", { rooms: 0 }).rooms.length >= 2);
});

test("the entrance is on the requested side", () => {
  const onSide = (e, l) => ({ N: e.y === 0, S: e.y === l.rows, W: e.x === 0, E: e.x === l.cols })[e.dir];
  for (const dir of ["N", "S", "E", "W"]) {
    each(["branching", "halls"], (l, layout, size, seed, what) => {
      assert.equal(l.entrance.dir, dir, what);
      assert.ok(onSide(l.entrance, l), `${what} ${JSON.stringify(l.entrance)}`);
      if (layout === "halls") assert.equal(l.entrance.room, -1);
      else { assert.equal(l.entrance.room, 0); assert.ok(l.rooms[0].main); }
    }, { entry: dir });
    each(["caves", "building"], (l, layout, size, seed, what) => {
      assert.equal(l.entrance.dir, dir, what);
      assert.ok(l.entrance.room >= 0 && l.entrance.room < l.rooms.length, what);
      if (layout === "caves") {
        const near = { N: l.entrance.y < 1, S: l.entrance.y > l.rows - 1, W: l.entrance.x < 1, E: l.entrance.x > l.cols - 1 }[dir];
        assert.ok(near, `${what} ${JSON.stringify(l.entrance)}`);
      } else assert.ok(onBuildingSide(l, dir), what);
    }, { entry: dir });
  }
  // "any" picks one for you and reports it
  each(["branching", "halls", "caves", "building"], (l, layout, size, seed, what) => assert.ok(["N", "S", "E", "W"].includes(l.entrance.dir), what), { entry: "any" });
  each(["village"], (l) => assert.equal(l.entrance, null));
});

// the entrance room is on the outer edge of the building on that side, and its door is on the outline
function onBuildingSide(l, dir) {
  const room = l.rooms[l.entrance.room], d = l.doors.find((x) => x.outer);
  const edge = { N: Math.min(...l.rooms.map((r) => r.y)), S: Math.max(...l.rooms.map((r) => r.y + r.h)), W: Math.min(...l.rooms.map((r) => r.x)), E: Math.max(...l.rooms.map((r) => r.x + r.w)) }[dir];
  const roomEdge = { N: room.y, S: room.y + room.h, W: room.x, E: room.x + room.w }[dir];
  return roomEdge === edge && d.x === l.entrance.x && d.y === l.entrance.y;
}

test("rooms are numbered from the entrance outward", () => {
  each(["branching", "caves", "building"], (l, layout, size, seed, what) => assert.equal(l.entrance.room, 0, what));
  each(["village"], (l, layout, size, seed, what) => {
    const d = (r) => Math.hypot(r.x + r.w / 2 - l.square.cx, r.y + r.h / 2 - l.square.cy);
    for (let i = 1; i < l.rooms.length; i++) assert.ok(d(l.rooms[i - 1]) <= d(l.rooms[i]) + EPS, what);
  });
});

test("symmetry lr mirrors every room", () => {
  for (const layout of ["branching", "halls"]) {
    each([layout], (l, _l, size, seed, what) => {
      assert.ok(l.rooms.length >= 3, what);
      for (const r of l.rooms) {
        const twin = l.rooms.find((q) => q.x === l.cols - r.x - r.w && q.y === r.y && q.w === r.w && q.h === r.h && !!q.round === !!r.round);
        assert.ok(twin, `${what} room ${JSON.stringify(r)} has no twin`);
      }
      assert.ok(l.doors.every((d) => l.doors.some((e) => Math.abs(e.x - (l.cols - d.x)) < 1e-9 && e.y === d.y && e.o === d.o)), `${what} doors`);
    }, { symmetry: "lr", entry: "any", curved: 0.4, rooms: 10 });
  }
  // tb mirrors top to bottom
  each(["branching"], (l, _l, size, seed, what) => {
    for (const r of l.rooms) assert.ok(l.rooms.some((q) => q.y === l.rows - r.y - r.h && q.x === r.x && q.w === r.w && q.h === r.h), `${what} tb`);
  }, { symmetry: "tb", entry: "any", rooms: 10 });
});

test("dungeon floors cover each room and corridor", () => {
  each(["branching", "halls"], (l, layout, size, seed, what) => {
    assert.ok(l.floors.length > l.rooms.length, what);
    l.rooms.forEach((r, i) => {
      const f = l.floors[i];
      if (r.round) assert.deepEqual(f, { t: "ellipse", cx: r.x + r.w / 2, cy: r.y + r.h / 2, rx: r.w / 2, ry: r.h / 2 });
      else assert.deepEqual(f, { t: "rect", x: r.x, y: r.y, w: r.w, h: r.h });
    });
    assert.equal(l.rock, null);
  }, { curved: 0.8 });
  assert.ok(gen("branching", sizes[2], "ember-1", { curved: 1 }).rooms.some((r) => r.round));
});

// ---- caves
function floorRegions(rock) {
  const H = rock.length, W = rock[0].length, seen = rock.map((r) => r.map(() => false)); let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!rock[y][x] && !seen[y][x]) {
    n++; const q = [[x, y]]; seen[y][x] = true;
    while (q.length) { const [cx, cy] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && !rock[ny][nx] && !seen[ny][nx]) { seen[ny][nx] = true; q.push([nx, ny]); } } }
  }
  return n;
}
test("caves: the floor is one connected region and the tunnel reaches the edge", () => {
  for (const extra of [{ entry: "S" }, { entry: "N" }, { entry: "E" }, { entry: "W" }, { entry: "any", symmetry: "lr" }, { entry: "any", openness: 0, rough: 1 }, { entry: "any", openness: 1, rough: 0 }]) {
    each(["caves"], (l, layout, size, seed, what) => {
      assert.equal(l.kind, "cave");
      assert.equal(floorRegions(l.rock), 1, `${what} ${JSON.stringify(extra)}`);
      const { rock, entrance: e } = l;
      const edgeHasFloor = { N: () => rock[0].some((v) => !v), S: () => rock[l.rows - 1].some((v) => !v), W: () => rock.some((r) => !r[0]), E: () => rock.some((r) => !r[l.cols - 1]) }[e.dir]();
      assert.ok(edgeHasFloor, `${what} ${JSON.stringify(extra)} no opening on the ${e.dir} edge`);
      const cx = Math.min(l.cols - 1, Math.floor(e.x)), cy = Math.min(l.rows - 1, Math.floor(e.y));
      assert.equal(rock[cy][cx], 0, `${what} the entrance cell is floor`);
      l.rooms.forEach((r) => assert.equal(rock[Math.floor(r.cy)][Math.floor(r.cx)], 0, `${what} chamber on floor`));
      l.water.forEach((p) => assert.equal(rock[p.y][p.x], 0));
      assert.ok(l.rooms.length >= 2, `${what} chambers: ${l.rooms.length}`);
    }, extra);
  }
});

// ---- buildings
function touching(l, d) {
  // the rooms on each side of a door on a shared wall
  const side = (inside) => l.rooms.map((r, i) => [r, i]).filter(([r]) => {
    if (d.o === "v") return d.y > r.y && d.y < r.y + r.h && (inside ? d.x === r.x + r.w : d.x === r.x);
    return d.x > r.x && d.x < r.x + r.w && (inside ? d.y === r.y + r.h : d.y === r.y);
  }).map(([, i]) => i);
  return [side(true), side(false)];
}
test("building: every room is reachable and inner doors sit on shared walls", () => {
  for (const extra of [{}, { bshape: "L" }, { bshape: "L", entry: "N", rooms: 12 }, { loops: 1, rooms: 14, entry: "E" }, { entry: "W", loops: 0 }]) {
    each(["building"], (l, layout, size, seed, what) => {
      const adj = l.rooms.map(() => []); let outer = 0;
      for (const d of l.doors) {
        if (d.outer) { outer++; continue; }
        const [a, b] = touching(l, d);
        assert.equal(a.length, 1, `${what} door ${JSON.stringify(d)} has no room before it`);
        assert.equal(b.length, 1, `${what} door ${JSON.stringify(d)} has no room after it`);
        adj[a[0]].push(b[0]); adj[b[0]].push(a[0]);
      }
      assert.equal(outer, 1, what);
      const seen = new Set([l.entrance.room]), q = [l.entrance.room];
      while (q.length) for (const n of adj[q.pop()]) if (!seen.has(n)) { seen.add(n); q.push(n); }
      assert.equal(seen.size, l.rooms.length, `${what} ${JSON.stringify(extra)}: ${seen.size}/${l.rooms.length} reachable`);
      for (let i = 0; i < l.rooms.length; i++) for (let j = i + 1; j < l.rooms.length; j++) assert.ok(!overlap(l.rooms[i], l.rooms[j]), `${what} overlap`);
      // the outer door is on the entrance room's wall
      const room = l.rooms[l.entrance.room], e = l.entrance;
      assert.ok(e.x >= room.x && e.x <= room.x + room.w && e.y >= room.y && e.y <= room.y + room.h, what);
      assert.equal(l.floors.length, extra.bshape === "L" ? 2 : 1);
      l.windows.forEach((w) => assert.ok(!l.doors.some((d) => Math.abs(d.x - w.x) < 1.6 && Math.abs(d.y - w.y) < 1.6), `${what} window on a door`));
    }, extra);
  }
  each(["building"], (l) => assert.equal(l.windows.length, 0), { windows: false });
});

// ---- villages
test("village: houses, roads, fields and palisade", () => {
  each(["village"], (l, layout, size, seed, what) => {
    assert.equal(l.doors.length, l.rooms.length);
    assert.ok(l.square);
    assert.equal(l.roads.length, 2);
    assert.ok(l.fields.length <= 4);
    assert.ok(l.palisade, what);
    for (const f of l.fields) for (const r of l.rooms) assert.ok(!overlap(f, r), `${what} field on a house`);
  });
  each(["village"], (l, layout, size, seed, what) => assert.ok(l.roads.length === 3 && l.roads[2].ring, what), { roads: "ring" });
  each(["village"], (l, layout, size, seed, what) => { assert.equal(l.roads.length, 1); assert.equal(l.fields.length, 0); assert.equal(l.palisade, null); }, { roads: "one", fields: false, palisade: false });
});

test("odd input is clamped instead of looping or throwing", () => {
  for (const layout of all) {
    const l = makeLayout({ ...opts(layout, [4, 4]), rooms: -5, houses: 1e9, roomSize: 9, loops: NaN, corridor: 7, symmetry: "x", entry: "up" }, seededRandom("odd"));
    assert.ok(l.cols >= 16 && l.rows >= 16);
  }
});
