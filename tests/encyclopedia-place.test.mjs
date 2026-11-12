import test from "node:test";
import assert from "node:assert/strict";
import { placeFromQuery, placeQuery } from "../lib/encyclopedia/place.ts";

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

test("deleted or unknown places fall back instead of opening nothing", () => {
  assert.equal(read(""), null);
  assert.equal(read("?world=gone"), null);
  assert.deepEqual(read("?entry=gone&world=w1"), { worldId: "w1", campaignId: null, view: "dashboard", entryId: null });
  assert.deepEqual(read("?world=w2&campaign=gone&view=maps"), { worldId: "w2", campaignId: null, view: "maps", entryId: null });
  assert.deepEqual(read("?world=w1&view=calendar"), { worldId: "w1", campaignId: null, view: "dashboard", entryId: null });
  assert.deepEqual(read("?world=w1&view=nonsense"), { worldId: "w1", campaignId: null, view: "dashboard", entryId: null });
});
