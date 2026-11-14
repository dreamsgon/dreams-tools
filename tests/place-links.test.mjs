import test from "node:test";
import assert from "node:assert/strict";
import { maptableSearch, readMaptablePlace } from "../lib/maptable-place.ts";
import { parsePlayerHash, playerHash } from "../lib/encyclopedia/player-place.ts";

const data = { scenes: [{ id: "s1" }, { id: "s2" }], collections: [{ id: "camp", kind: "campaign" }, { id: "act", kind: "folder" }] };

test("Maptable keeps campaign and scene in the address and leaves other parameters alone", () => {
  assert.equal(maptableSearch("", { campaignId: "camp", sceneId: "s1" }), "?campaign=camp&scene=s1");
  assert.equal(maptableSearch("?scene=old&addCharacter=ayla", { campaignId: "camp", sceneId: "s2" }), "?campaign=camp&scene=s2&addCharacter=ayla");
  assert.equal(maptableSearch("?campaign=camp&scene=s1", { campaignId: null, sceneId: null }), "");
  assert.equal(maptableSearch("?campaign=camp&scene=s1", { campaignId: "camp", sceneId: null }), "?campaign=camp");
  assert.equal(maptableSearch("", { campaignId: null, sceneId: "s1" }), "?scene=s1");
});
test("Maptable reads a place back and drops what is missing", () => {
  assert.deepEqual(readMaptablePlace("?campaign=camp&scene=s2", data), { campaignId: "camp", sceneId: "s2" });
  assert.deepEqual(readMaptablePlace("?campaign=act&scene=gone", data), { campaignId: null, sceneId: null }, "a folder is not a campaign");
  assert.deepEqual(readMaptablePlace("", data), { campaignId: null, sceneId: null });
  const round = { campaignId: "camp", sceneId: "s1" };
  assert.deepEqual(readMaptablePlace(maptableSearch("", round), data), round);
});

const TOKEN = "m-" + "cd".repeat(32);
test("player hash keeps the token first, in the hash, and adds the open page after it", () => {
  assert.deepEqual(parsePlayerHash("#" + TOKEN), { token: TOKEN, entry: null, tab: null });
  assert.deepEqual(parsePlayerHash(`#${TOKEN}&entry=ayla&tab=gear`), { token: TOKEN, entry: "ayla", tab: "gear" });
  assert.equal(playerHash(TOKEN, { entry: "ayla", tab: "gear" }), `#${TOKEN}&entry=ayla&tab=gear`);
  assert.equal(playerHash(TOKEN, { entry: null, tab: "gear" }), "#" + TOKEN, "a tab needs a page");
  assert.equal(playerHash(TOKEN, {}), "#" + TOKEN);
  assert.deepEqual(parsePlayerHash(playerHash(TOKEN, { entry: "ayla", tab: "gear" })), { token: TOKEN, entry: "ayla", tab: "gear" });
});
test("player hash ignores odd ids and never puts the token in a query string", () => {
  assert.equal(parsePlayerHash(`#${TOKEN}&entry=${encodeURIComponent("a b<c")}`).entry, null);
  assert.equal(playerHash(TOKEN, { entry: "a b" }), "#" + TOKEN);
  assert.ok(!playerHash(TOKEN, { entry: "ayla" }).includes("?"));
  assert.equal(parsePlayerHash("").token, "");
});
