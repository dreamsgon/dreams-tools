import test from "node:test";
import assert from "node:assert/strict";
import { mapSchema, newMap, playerMap } from "../lib/encyclopedia/map-model.ts";
import { iconKind, iconMarkup, iconName, iconsMatchModel, mapIcons, settlementGroups, stampGroups } from "../lib/encyclopedia/map-icons.ts";
import { legendItems } from "../lib/encyclopedia/map-looks.ts";
import { defaultPlanetOptions, generatePlanet } from "../lib/encyclopedia/planet-generator.ts";
import { EncyclopediaStore } from "../lib/encyclopedia/store.ts";
import { demoWorkspace } from "../lib/encyclopedia/world-model.ts";

const pin = (patch = {}) => ({ id: `p${Math.random().toString(36).slice(2, 8)}`, title: "Place", x: 0.5, y: 0.5, notes: "", entryId: null, visibility: "gm", ...patch });
const upload = (patch = {}) => ({ id: "u-abcd1234", name: "Dwarf hold", imageId: crypto.randomUUID(), ...patch });
const valid = m => mapSchema.safeParse(m).success;

test("every built-in icon has a drawing, and the server's list of ids matches", () => {
  assert.ok(iconsMatchModel());
  assert.equal(mapIcons.length, 38);
  assert.equal(new Set(mapIcons.map(i => i.id)).size, mapIcons.length);
  for (const g of [...settlementGroups, ...stampGroups]) assert.ok(mapIcons.some(i => i.group === g), g);
});

test("icon drawings are plain shapes, with the filled body painted in the paper colour", () => {
  for (const i of mapIcons) {
    assert.match(i.svg, /^(<(path|circle|ellipse)( F)?( [a-z]+="[-0-9a-zA-Z. ]+")+\/>)+$/, i.id);
    const markup = iconMarkup(i.id, "#fffdf6");
    assert.ok(!markup.includes(" F "), i.id);
    assert.ok(markup.includes('fill="#fffdf6"'), i.id);
  }
  assert.equal(iconMarkup("nope", "#fff"), "");
});

test("icons stand for a kind of place, so legends, routes and Maptable markers keep working", () => {
  assert.equal(iconKind("capital"), "city"); assert.equal(iconKind("port"), "town"); assert.equal(iconKind("hamlet"), "village");
  assert.equal(iconKind("fort"), "castle"); assert.equal(iconKind("ruins"), "ruin"); assert.equal(iconKind("cave"), "dungeon");
  assert.equal(iconKind("volcano"), "landmark"); assert.equal(iconKind("spaceport"), "city");
  assert.equal(iconName("volcano"), "Volcano");
  assert.equal(iconName("u-abcd1234", { icons: [upload()] }), "Dwarf hold");
});

test("a place can use a built-in icon or one uploaded to the map, and nothing else", () => {
  const map = { ...newMap("world", "island", "x", 12, 12), pins: [pin({ icon: "volcano", kind: "landmark" })] };
  assert.ok(valid(map));
  assert.ok(!valid({ ...map, pins: [pin({ icon: "dragon" })] }), "unknown built-in icon");
  assert.ok(!valid({ ...map, pins: [pin({ icon: "u-abcd1234" })] }), "uploaded icon the map doesn't have");
  assert.ok(valid({ ...map, icons: [upload()], pins: [pin({ icon: "u-abcd1234" })] }));
  assert.ok(!valid({ ...map, icons: [upload(), upload({ name: "Again" })] }), "duplicate icon ids");
  assert.ok(!valid({ ...map, icons: [upload({ imageId: "not-a-uuid" })] }));
  assert.ok(!valid({ ...map, icons: [upload({ id: "u-<script>" })] }));
  assert.ok(!valid({ ...map, icons: Array.from({ length: 41 }, (_, i) => upload({ id: `u-icon${String(i).padStart(3, "0")}` })) }));
});

test("players get only the uploaded icons used by places they can see", () => {
  const shown = upload(), hidden = upload({ id: "u-hidden01" });
  const map = { ...newMap("world", "island", "x", 12, 12), visibility: "players", icons: [shown, hidden],
    pins: [pin({ icon: shown.id, visibility: "players" }), pin({ icon: hidden.id, visibility: "gm" })] };
  assert.deepEqual(playerMap(map).icons, [shown]);
});

test("a player link can load an icon on a map it can see, and no other", async () => {
  const data = new Map(); let n = 0;
  const bucket = { async get(k) { const v = data.get(k); return v ? { etag: v.etag, json: async () => JSON.parse(v.text) } : null; }, async put(k, text) { const etag = String(++n); data.set(k, { text, etag }); return { etag }; }, async delete(k) { data.delete(k); } };
  const store = new EncyclopediaStore(bucket), w = demoWorkspace(), shown = upload(), hidden = upload({ id: "u-hidden01" });
  const map = { ...newMap("world", "island", "x", 12, 12), visibility: "players", icons: [shown, hidden], pins: [pin({ icon: shown.id, visibility: "players" }), pin({ icon: hidden.id })] };
  w.entries.push({ ...w.entries.find(e => e.id === "demo-mara"), id: "icon-map", kind: "map", mapData: map });
  await store.save("alice", w, 0);
  const token = await store.createLink("alice", "demo-campaign");
  assert.equal(await store.playerImageOwner(token, shown.imageId), "alice");
  assert.equal(await store.playerImageOwner(token, hidden.imageId), null);
});

test("the legend lists places by icon, and the rest by their kind of place", () => {
  const map = { ...newMap("world", "island", "x", 12, 12), icons: [upload()], pins: [pin({ icon: "volcano", kind: "landmark" }), pin({ icon: "u-abcd1234", kind: "landmark" }), pin({ kind: "town" }), pin({ kind: "landmark" })] };
  const items = legendItems(map, null).filter(i => i.kind === "icon" || i.kind === "place").map(i => `${i.kind}:${i.name}`);
  assert.deepEqual(items, ["icon:Volcano", "icon:Dwarf hold", "place:Town", "place:Landmark"]);
});

test("a generated planet draws its capital, towns and landmarks with icons", () => {
  const map = { ...newMap("world", "island", "old", 24, 18), pins: [] };
  const pins = generatePlanet(defaultPlanetOptions("salt-731"), map).pins;
  assert.equal(pins.filter(p => p.icon === "capital").length, 1);
  assert.ok(pins.filter(p => p.kind === "landmark").every(p => ["volcano", "ruins", "tree", "crater", "stones"].includes(p.icon)));
  assert.ok(pins.every(p => p.icon));
  const colony = generatePlanet({ ...defaultPlanetOptions("salt-731"), life: "none", water: 40 }, map).pins.filter(p => p.kind !== "landmark");
  assert.ok(colony.length > 0);
  assert.equal(colony[0].icon, "spaceport");
  assert.ok(colony.every(p => ["spaceport", "dome", "rig", "station"].includes(p.icon)));
  assert.ok(valid({ ...map, ...generatePlanet(defaultPlanetOptions("salt-731"), map) }));
});
