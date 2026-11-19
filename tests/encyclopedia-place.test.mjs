import test from "node:test";
import assert from "node:assert/strict";
import { placeFromQuery, placeQuery, themeCampaignId } from "../lib/encyclopedia/place.ts";

const data = {
  schemaVersion: 1,
  worlds: [{ id: "w1", name: "One" }, { id: "w2", name: "Two" }],
  campaigns: [{ id: "c1", worldId: "w2", name: "Camp" }],
  entries: [{ id: "e1", worldId: "w2", campaignId: "c1", title: "Page" }, { id: "e2", worldId: "w1", campaignId: null, title: "Lore page" }],
};
const read = (search) => placeFromQuery(new URLSearchParams(search), data);
const roundTrip = (place) => assert.deepEqual(read(placeQuery(place)), place);

test("every Encyclopedia place survives a trip through the address", () => {
  roundTrip({ worldId: "w1", campaignId: null, view: "dashboard", entryId: null });
  roundTrip({ worldId: "w1", campaignId: null, view: "overview", entryId: null });
  roundTrip({ worldId: "w2", campaignId: "c1", view: "dashboard", entryId: null });
  roundTrip({ worldId: "w2", campaignId: "c1", view: "overview", entryId: null });
  roundTrip({ worldId: "w2", campaignId: "c1", view: "calendar", entryId: null });
  roundTrip({ worldId: "w1", campaignId: null, view: "maps", entryId: null });
  roundTrip({ worldId: "w1", campaignId: null, view: "tables", entryId: null });
  roundTrip({ worldId: "w2", campaignId: "c1", view: "overview", entryId: "e1" });
  roundTrip({ worldId: "w1", campaignId: null, view: "overview", entryId: "e2" });
});

test("addresses stay short for common places", () => {
  assert.equal(placeQuery({ worldId: "w2", campaignId: "c1", view: "overview", entryId: "e1" }), "?entry=e1");
  assert.equal(placeQuery({ worldId: "w2", campaignId: "c1", view: "overview", entryId: null }), "?world=w2&campaign=c1");
  assert.equal(placeQuery({ worldId: "w1", campaignId: null, view: "dashboard", entryId: null }), "?world=w1");
});

test("links from Maptable and the Campaigns page still open the page or campaign", () => {
  assert.deepEqual(read("?entry=e1"), { worldId: "w2", campaignId: "c1", view: "overview", entryId: "e1" });
  assert.deepEqual(read("?campaign=c1"), { worldId: "w2", campaignId: "c1", view: "overview", entryId: null });
});

test("a world page opened from a campaign stays in that campaign", () => {
  const two = { ...data, campaigns: [...data.campaigns, { id: "c2", worldId: "w1", name: "Lore camp" }] };
  const from = (search) => placeFromQuery(new URLSearchParams(search), two);
  assert.deepEqual(from("?entry=e2&campaign=c2"), { worldId: "w1", campaignId: "c2", view: "overview", entryId: "e2" });
  assert.deepEqual(from("?entry=e2&campaign=c1"), { worldId: "w1", campaignId: null, view: "overview", entryId: "e2" }, "a campaign in another world is ignored");
  assert.deepEqual(from("?entry=e1&campaign=c2"), { worldId: "w2", campaignId: "c1", view: "overview", entryId: "e1" }, "a campaign page keeps its own campaign");
  const inside = { worldId: "w1", campaignId: "c2", view: "overview", entryId: "e2" };
  assert.equal(placeQuery(inside, null), "?entry=e2&campaign=c2");
  assert.deepEqual(from(placeQuery(inside, null)), inside);
  assert.equal(placeQuery({ worldId: "w2", campaignId: "c1", view: "overview", entryId: "e1" }, "c1"), "?entry=e1", "a campaign page needs no extra campaign");
});

test("deleted or unknown places fall back instead of opening nothing", () => {
  assert.equal(read(""), null);
  assert.equal(read("?world=gone"), null);
  assert.deepEqual(read("?entry=gone&world=w1"), { worldId: "w1", campaignId: null, view: "dashboard", entryId: null });
  assert.deepEqual(read("?world=w2&campaign=gone&view=maps"), { worldId: "w2", campaignId: null, view: "maps", entryId: null });
  assert.deepEqual(read("?world=w1&view=calendar"), { worldId: "w1", campaignId: null, view: "dashboard", entryId: null });
  assert.deepEqual(read("?world=w1&view=nonsense"), { worldId: "w1", campaignId: null, view: "dashboard", entryId: null });
});

test("?maptable= opens the Encyclopedia campaign paired with that Maptable campaign", () => {
  const paired = { ...data, campaigns: [{ id: "c0", worldId: "w1", name: "Other" }, { id: "c1", worldId: "w2", name: "Camp", maptableCampaignId: "m 1/x" }] };
  const from = (search) => placeFromQuery(new URLSearchParams(search), paired);
  assert.deepEqual(from(`?maptable=${encodeURIComponent("m 1/x")}`), { worldId: "w2", campaignId: "c1", view: "overview", entryId: null });
  assert.deepEqual(from("?maptable=m%201%2Fx&campaign=c0"), { worldId: "w1", campaignId: "c0", view: "overview", entryId: null });
  assert.deepEqual(from("?entry=e2&maptable=m%201%2Fx"), { worldId: "w1", campaignId: null, view: "overview", entryId: "e2" });
});

test("an unmatched ?maptable= is the same as no parameter", () => {
  assert.equal(read("?maptable=nope"), null);
  assert.deepEqual(read("?maptable=nope&world=w1"), read("?world=w1"));
  assert.deepEqual(read("?maptable=nope&campaign=c1"), read("?campaign=c1"));
});

test("an open tab travels with its page and is ignored without one", async () => {
  const { isNewPlace, defaultTab } = await import("../lib/encyclopedia/place.ts");
  roundTrip({ worldId: "w2", campaignId: "c1", view: "overview", entryId: "e1", tab: "profile" });
  assert.equal(placeQuery({ worldId: "w2", campaignId: "c1", view: "overview", entryId: "e1", tab: "profile" }), "?entry=e1&tab=profile");
  assert.equal(placeQuery({ worldId: "w2", campaignId: "c1", view: "quests", entryId: null, tab: "profile" }), "?world=w2&campaign=c1&view=quests");
  assert.equal(read("?entry=e1&tab=gear").tab, "gear");
  assert.equal("tab" in read("?entry=e1"), false);
  assert.equal("tab" in read("?entry=e1&tab=" + encodeURIComponent("<script>")), false, "odd tab ids are dropped");
  assert.equal(read("?world=w2&tab=profile").entryId, null);
  assert.equal(defaultTab("character"), "overview");
  assert.equal(defaultTab("faction"), "profile");
  assert.equal(defaultTab("map"), "map");
  const a = { worldId: "w2", campaignId: "c1", view: "overview", entryId: "e1", tab: "profile" };
  assert.equal(isNewPlace(a, { ...a, tab: "gear" }), false, "a tab switch replaces");
  assert.equal(isNewPlace(a, { ...a, entryId: "e2" }), true, "another page pushes");
  assert.equal(isNewPlace(a, { ...a, entryId: null, view: "maps" }), true);
  assert.equal(isNewPlace(null, a), true);
});

test("the theme follows the campaign, and a world shared by several campaigns keeps the plain look", () => {
  const shared = { campaigns: [{ id: "a", worldId: "w1" }, { id: "b", worldId: "w1" }, { id: "solo", worldId: "w2" }] };
  // Inside a campaign, and on a world page opened from it, the campaign's theme.
  assert.equal(themeCampaignId(shared, { worldId: "w1", campaignId: "b", view: "overview" }), "b");
  // A world's own pages: its only campaign's theme, or none when several campaigns share the world.
  assert.equal(themeCampaignId(shared, { worldId: "w2", campaignId: null, view: "overview" }), "solo");
  assert.equal(themeCampaignId(shared, { worldId: "w2", campaignId: null, view: "characters" }), "solo");
  assert.equal(themeCampaignId(shared, { worldId: "w1", campaignId: null, view: "overview" }), null);
  // The Dashboard spans every world.
  assert.equal(themeCampaignId(shared, { worldId: "w2", campaignId: null, view: "dashboard" }), null);
  assert.equal(themeCampaignId(shared, { worldId: "", campaignId: null, view: "overview" }), null);
});
