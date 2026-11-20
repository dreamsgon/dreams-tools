import test from "node:test";
import assert from "node:assert/strict";
import { campaignTableScene, rememberedCampaignScene, maptableSearch, readMaptablePlace } from "../lib/maptable-place.ts";
import { hubLinks } from "../lib/campaign-hub-links.ts";
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

test("a campaign's scene list has its own address; a bare ?campaign= is that campaign's table", () => {
  assert.equal(maptableSearch("?campaign=camp", { campaignId: "camp", sceneId: null, view: "scenes" }), "?campaign=camp&view=scenes");
  assert.equal(maptableSearch("?campaign=camp&view=scenes", { campaignId: "camp", sceneId: "s1" }), "?campaign=camp&scene=s1", "an open scene drops view");
  assert.equal(maptableSearch("?view=scenes", { campaignId: null, sceneId: null, view: "scenes" }), "?view=unfiled", "no campaign: the picker for maps not in a campaign");
  assert.deepEqual(readMaptablePlace("?view=unfiled", data), { campaignId: null, sceneId: null, view: "scenes" });
  assert.deepEqual(readMaptablePlace("?campaign=gone&view=unfiled", data), { campaignId: null, sceneId: null }, "a missing campaign is not the unfiled picker");
  assert.deepEqual(readMaptablePlace("?view=scenes", data), { campaignId: null, sceneId: null });
  assert.deepEqual(readMaptablePlace("?campaign=camp&view=scenes", data), { campaignId: "camp", sceneId: null, view: "scenes" });
  assert.deepEqual(readMaptablePlace("?campaign=camp", data), { campaignId: "camp", sceneId: null });
  assert.deepEqual(readMaptablePlace("?campaign=camp&scene=s1&view=scenes", data), { campaignId: "camp", sceneId: "s1" });
});

test("Open in Maptable lands on that campaign's own scene, never another campaign's", () => {
  const w = {
    collections: [{ id: "A", kind: "campaign", parentId: null }, { id: "B", kind: "campaign", parentId: null }, { id: "B-act", kind: "folder", parentId: "B" }, { id: "C", kind: "campaign", parentId: null }],
    scenes: [{ id: "a1", containerId: "A" }, { id: "b-loose", containerId: "B" }, { id: "b-act", containerId: "B-act" }],
  };
  assert.equal(campaignTableScene(w, "B", "a1"), "b-act", "the open scene is in another campaign: B's first scene (folders first)");
  assert.equal(campaignTableScene(w, "B", "b-loose"), "b-loose", "the scene already open in B stays open");
  assert.equal(campaignTableScene(w, "B", null), "b-act");
  assert.equal(rememberedCampaignScene(w, "B", "b-loose"), "b-loose", "the scene last open in B");
  assert.equal(rememberedCampaignScene(w, "B", "a1"), null, "a scene of another campaign is not B's");
  assert.equal(rememberedCampaignScene(w, "B", null), null, "nothing remembered: the scene list opens, not the first scene");
  assert.equal(campaignTableScene(w, "C", "a1"), null, "no scenes: the caller opens C's own scene page");
});

test("every campaign dashboard link names its campaign", () => {
  const both = hubLinks({ key: "e:book 1", maptable: { id: "map/1" }, encyclopedia: { id: "book 1" } });
  assert.equal(both.maptable, "/maptable?campaign=map%2F1");
  assert.equal(both.scenes, "/maptable?campaign=map%2F1&view=scenes");
  assert.equal(both.scene("s 1"), "/maptable?campaign=map%2F1&scene=s%201");
  assert.equal(both.notes(), "/encyclopedia?campaign=book%201");
  assert.equal(both.notes("quests"), "/encyclopedia?campaign=book%201&view=quests");
  assert.equal(both.entry("p1"), "/encyclopedia?entry=p1&campaign=book%201");
  const mapsOnly = hubLinks({ key: "m:map1", maptable: { id: "map1" }, encyclopedia: null });
  assert.equal(mapsOnly.notes(), null);
  assert.equal(mapsOnly.startNotes, "/campaigns?notes=m%3Amap1");
  const notesOnly = hubLinks({ key: "e:b", maptable: null, encyclopedia: { id: "b" } });
  assert.equal(notesOnly.maptable, null);
  assert.equal(notesOnly.scene("s1"), "/maptable?scene=s1");
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
