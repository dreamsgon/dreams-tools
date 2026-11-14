import test from "node:test";
import assert from "node:assert/strict";
import { pageTitle, encyclopediaTitle, maptableTitle, playerTitle, campaignTitle } from "../lib/page-title.ts";

test("Encyclopedia titles name the page, view or world that is open", () => {
  assert.equal(encyclopediaTitle({ entry: "Ayla", campaign: "The Salt Road", world: "The Lantern Coast" }), "Ayla · The Salt Road | RPG Encyclopedia");
  assert.equal(encyclopediaTitle({ entry: "Ayla", world: "The Lantern Coast" }), "Ayla · The Lantern Coast | RPG Encyclopedia", "shared lore sits in the world");
  assert.equal(encyclopediaTitle({ view: "quests", campaign: "The Salt Road", world: "The Lantern Coast" }), "Quests · The Salt Road | RPG Encyclopedia");
  assert.equal(encyclopediaTitle({ view: "tables", world: "The Lantern Coast" }), "Random tables · The Lantern Coast | RPG Encyclopedia");
  assert.equal(encyclopediaTitle({ view: "dashboard", world: "The Lantern Coast" }), "The Lantern Coast | RPG Encyclopedia");
  assert.equal(encyclopediaTitle({ view: "overview", campaign: "The Salt Road", world: "The Lantern Coast" }), "The Salt Road | RPG Encyclopedia");
  assert.equal(encyclopediaTitle({}), "RPG Encyclopedia");
});
test("Maptable titles name the scene and its campaign", () => {
  assert.equal(maptableTitle({ scene: "Greyfen docks", campaign: "The Salt Road" }), "Greyfen docks · The Salt Road | Maptable");
  assert.equal(maptableTitle({ scene: "Greyfen docks" }), "Greyfen docks | Maptable");
  assert.equal(maptableTitle({ campaign: "The Salt Road" }), "The Salt Road | Maptable");
  assert.equal(maptableTitle({}), "Maptable");
});
test("player and campaign titles", () => {
  assert.equal(playerTitle({ entry: "Ayla", campaign: "The Salt Road" }), "Ayla · The Salt Road");
  assert.equal(playerTitle({ campaign: "The Salt Road" }), "The Salt Road");
  assert.equal(playerTitle({}), "Campaign player view");
  assert.equal(campaignTitle("The Salt Road"), "The Salt Road | RPG Tools");
  assert.equal(campaignTitle(null), "RPG Tools");
});
test("titles are one tidy line and not unbounded", () => {
  assert.equal(pageTitle(["  Greyfen \n docks ", ""], "Maptable"), "Greyfen docks | Maptable");
  const long = pageTitle(["x".repeat(500)], "App");
  assert.ok(long.length < 100 && long.includes("…"));
});
