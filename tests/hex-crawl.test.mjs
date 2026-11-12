import test from "node:test";
import assert from "node:assert/strict";
import { mapSchema, newMap, playerMap } from "../lib/encyclopedia/map-model.ts";
import { areaMapFor, advanceCalendar, cellDistance, cellLabel, cellLine, cellNeighbours, cellSteps, crawlPlan, encounterChecks, hexNote, moveParty, partyRegion, placeParty, roadCells, setHexNote } from "../lib/encyclopedia/hex-crawl.ts";
import { makeCalendar } from "../lib/encyclopedia/calendar-templates.ts";
import { newWeatherRegion, weatherOn } from "../lib/encyclopedia/weather-model.ts";
import { demoWorkspace, emptyWorkspace, importCopy } from "../lib/encyclopedia/world-model.ts";

// A 20 × 14 hex crawl where every hex is grassland and 6 miles across.
const crawl = (patch = {}) => {
  const m = { ...newMap("hex", "blank", "x", 20, 14), scale: { width: 123, unit: "mi" }, ...patch };
  return { ...m, tiles: m.tiles.map(() => 1) };
};
const at = (m, col, row) => (row - 1) * m.columns + col - 1;

test("cells are labelled by column and row", () => {
  const m = crawl();
  assert.equal(cellLabel(m, at(m, 13, 7)), "13.07");
  assert.equal(cellLabel(m, 0), "01.01");
});

test("each hex is the map width over the columns", () => {
  assert.equal(cellDistance(crawl()), 6);
  assert.equal(cellDistance({ ...crawl(), scale: undefined }), null);
  assert.equal(cellDistance({ ...crawl(), grid: "square" }), 123 / 20);
});

test("hex lines are unbroken and have one cell per step", () => {
  const m = crawl();
  for (const [a, b] of [[at(m, 2, 2), at(m, 9, 6)], [at(m, 10, 10), at(m, 3, 1)], [at(m, 1, 1), at(m, 20, 1)], [at(m, 5, 2), at(m, 5, 12)]]) {
    const line = cellLine(m, a, b);
    assert.equal(line.length, cellSteps(m, a, b));
    assert.equal(line.at(-1), b);
    let prev = a;
    for (const c of line) { assert.ok(cellNeighbours(m, prev).includes(c), `${cellLabel(m, prev)} touches ${cellLabel(m, c)}`); prev = c; }
  }
});

test("hexes have six neighbours, squares eight, fewer at the edge", () => {
  const m = crawl();
  assert.equal(cellNeighbours(m, at(m, 5, 5)).length, 6);
  assert.equal(cellNeighbours(m, 0).length, 2);
  assert.equal(cellNeighbours({ ...m, grid: "square" }, at(m, 5, 5)).length, 8);
  assert.equal(cellSteps({ ...m, grid: "square" }, at(m, 1, 1), at(m, 4, 3)), 3);
});

test("a walk over open ground takes the pace's time, and forests slow it", () => {
  const m = { ...crawl(), party: { cell: at(crawl(), 2, 5), trail: [], hours: 0, visibility: "gm" } };
  const open = crawlPlan(m, at(m, 6, 5), "normal");
  assert.equal(open.cells.length, 4);
  assert.equal(open.distance, 24);
  assert.equal(open.hours, 8);
  assert.equal(open.days, 0, "a full day of travel still ends on the same day");
  assert.equal(open.extraHours, 0);
  const slow = crawlPlan(m, at(m, 6, 5), "slow");
  assert.ok(slow.hours > open.hours);
  const woods = { ...m, tiles: m.tiles.map((t, i) => (i === at(m, 4, 5) ? 2 : t)) };
  const plan = crawlPlan(woods, at(m, 6, 5), "normal");
  assert.equal(plan.extraHours, 1);
  assert.equal(plan.slowest, "Forest");
  assert.equal(plan.days, 1);
  assert.equal(plan.hoursAfter, 1);
  assert.equal(crawlPlan(m, m.party.cell, "normal"), null, "no walk to where you already are");
  assert.equal(crawlPlan({ ...m, party: undefined }, at(m, 6, 5), "normal"), null);
});

test("sea blocks the way, but a road through it does not", () => {
  const m = { ...crawl(), party: { cell: at(crawl(), 2, 5), trail: [], hours: 0, visibility: "gm" } };
  const sea = { ...m, tiles: m.tiles.map((t, i) => (i === at(m, 4, 5) ? 0 : t)) };
  assert.equal(crawlPlan(sea, at(m, 6, 5), "normal").blocked, at(m, 4, 5));
  const shape = i => ({ x: ((i % 20) + 0.5 + (Math.floor(i / 20) % 2) * 0.5) / 20.5, y: (1 + Math.floor(i / 20) * 1.5) / (1.5 * 13 + 2) });
  const road = { ...sea, paths: [{ id: "r", kind: "road", name: "", points: [shape(at(m, 3, 5)), shape(at(m, 5, 5))], visibility: "gm" }] };
  assert.ok(roadCells(road).has(at(m, 4, 5)));
  assert.equal(crawlPlan(road, at(m, 6, 5), "normal").blocked, null);
});

test("moving the party walks it, grows its trail and explores what it passes", () => {
  const base = crawl({ fog: { enabled: true, revealed: [] } });
  const m = { ...base, party: placeParty(base, at(base, 2, 5)), hexes: [{ cell: at(base, 4, 5), title: "Standing stones", notes: "", visibility: "gm" }] };
  const plan = crawlPlan(m, at(m, 6, 5), "normal");
  const moved = { ...m, ...moveParty(m, plan, "15 Ches") };
  assert.equal(moved.party.cell, at(m, 6, 5));
  assert.deepEqual(moved.party.trail, [at(m, 2, 5), at(m, 3, 5), at(m, 4, 5), at(m, 5, 5)]);
  assert.equal(moved.party.hours, 8);
  for (const c of [...plan.cells, ...cellNeighbours(m, at(m, 6, 5))]) assert.ok(moved.fog.revealed.includes(c));
  assert.ok(!moved.fog.revealed.includes(at(m, 15, 12)));
  assert.equal(moved.hexes[0].exploredOn, "15 Ches");
  assert.ok(mapSchema.safeParse(moved).success);
});

test("the party has to stand on the grid", () => {
  const m = crawl();
  assert.ok(mapSchema.safeParse({ ...m, party: placeParty(m, 5) }).success);
  assert.equal(mapSchema.safeParse({ ...m, party: placeParty(m, 999) }).success, false);
  assert.equal(mapSchema.safeParse({ ...m, grid: "none", party: placeParty(m, 5) }).success, false);
});

test("hex notes are saved per cell, and empty ones are dropped", () => {
  const m = crawl();
  const note = { ...hexNote(m, 30), title: "Mistwood edge", notes: "Owlbear tracks" };
  const hexes = setHexNote(m, note);
  assert.deepEqual(hexes, [note]);
  assert.deepEqual(hexNote({ ...m, hexes }, 30), note);
  assert.deepEqual(setHexNote({ ...m, hexes }, { ...note, title: "", notes: " " }), []);
  assert.equal(mapSchema.safeParse({ ...m, hexes: [note, note] }).success, false, "one note per cell");
});

test("players see shared notes in explored hexes only, never encounter tables", () => {
  const m = crawl({ visibility: "players", fog: { enabled: true, revealed: [1, 2] }, encounterTableId: "wolves" });
  m.hexes = [{ cell: 1, title: "Seen", notes: "", tableId: "t1", visibility: "players" }, { cell: 2, title: "Secret", notes: "", visibility: "gm" }, { cell: 9, title: "Far", notes: "", visibility: "players" }];
  m.party = { cell: 2, trail: [1, 5], hours: 0, visibility: "players" };
  const seen = playerMap(m);
  assert.deepEqual(seen.hexes.map(h => h.title), ["Seen"]);
  assert.equal(seen.hexes[0].tableId, undefined);
  assert.equal(seen.encounterTableId, undefined);
  assert.deepEqual(seen.party.trail, [1], "the trail through unexplored hexes stays hidden");
  assert.equal(playerMap({ ...m, party: { ...m.party, visibility: "gm" } }).party, undefined);
});

test("encounter checks roll once per cell entered", () => {
  const rolls = [0.05, 0.5, 0.9, 0.1];
  let i = 0;
  assert.deepEqual(encounterChecks([10, 11, 12, 13], 6, () => rolls[i++]), [10, 13]);
  assert.deepEqual(encounterChecks([10, 11], 0, () => 0), []);
});

test("travel days advance the calendar and fill in missing weather for the nearest region", () => {
  const c = makeCalendar("gregorian");
  c.current = { year: 2024, periodId: c.periods[1].id, day: 27 };
  const near = newWeatherRegion(c), far = newWeatherRegion(c);
  c.weather = { regions: [near, far], days: [] };
  const m = crawl();
  m.pins = [
    { id: "a", title: "Near", x: 0.1, y: 0.3, notes: "", entryId: null, visibility: "gm", weatherLinks: [{ campaignId: "camp", calendarId: c.id, regionId: near.id }] },
    { id: "b", title: "Far", x: 0.9, y: 0.9, notes: "", entryId: null, visibility: "gm", weatherLinks: [{ campaignId: "camp", calendarId: c.id, regionId: far.id }] },
  ];
  const region = partyRegion(m, at(m, 2, 5), "camp", c);
  assert.equal(region.id, near.id);
  assert.equal(partyRegion(m, at(m, 2, 5), "other", c), undefined);
  const next = advanceCalendar(c, 2, region);
  assert.equal(next.current.day, 29, "a leap year February");
  assert.equal(next.weather.days.length, 2);
  assert.ok(weatherOn(next, near.id, next.current));
  assert.deepEqual(advanceCalendar(c, 0, region), c);
});

test("a new area map is a hex crawl of 6-mile hexes", () => {
  const m = areaMapFor("Saltmere");
  assert.ok(mapSchema.safeParse(m).success);
  assert.equal(m.category, "hex");
  assert.equal(m.grid, "hex");
  assert.equal(cellDistance(m), 6);
  assert.equal(cellDistance(areaMapFor("Saltmere", "km")), 10);
});

test("imported copies keep a place's link to its area map", () => {
  const data = demoWorkspace();
  const base = data.entries.find(e => e.kind === "place");
  const map = { ...base, id: "world-map", kind: "map", title: "World", mapData: { ...newMap("world", "island", "w"), pins: [{ id: "p", title: "P", x: 0.5, y: 0.5, notes: "", entryId: null, visibility: "gm", areaMapId: "area-map" }] } };
  const area = { ...base, id: "area-map", kind: "map", title: "Around", mapData: areaMapFor("Around") };
  data.entries.push(map, area);
  const copy = importCopy(emptyWorkspace(), data);
  const newArea = copy.entries.find(e => e.title === "Around");
  const pin = copy.entries.find(e => e.mapData?.pins.some(p => p.id === "p")).mapData.pins[0];
  assert.equal(pin.areaMapId, newArea.id);
  assert.notEqual(newArea.id, "area-map");
});
