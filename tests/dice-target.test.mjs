import test from "node:test";
import assert from "node:assert/strict";
import { encyclopediaDiceTarget, hubDiceTarget, playerDiceTarget, NO_CAMPAIGN, LOCAL_ONLY, diceTargetStore } from "../lib/dice-target.ts";

test("an Encyclopedia campaign posts through its Discord choice or its paired Maptable campaign", () => {
  assert.deepEqual(encyclopediaDiceTarget({ id: "c1", name: "The Salt Road", maptableCampaignId: "m1" }, false).discord, { mode: "encyclopedia", campaignId: "c1", label: "The Salt Road" });
  assert.equal(encyclopediaDiceTarget({ id: "c1", name: "The Salt Road", discord: { maptableCampaignId: "m2" } }, false).discord?.mode, "encyclopedia");
});
test("no campaign, no channel and co-GMs never post, and say why", () => {
  for (const t of [encyclopediaDiceTarget(null, false), encyclopediaDiceTarget(undefined, false), encyclopediaDiceTarget({ id: "c1", name: "The Salt Road" }, false), encyclopediaDiceTarget({ id: "c1", name: "The Salt Road", maptableCampaignId: "m1" }, true)]) {
    assert.equal(t.discord, null); assert.ok(t.note.length > 10 && t.note.length < 140);
  }
  assert.match(encyclopediaDiceTarget({ id: "c1", name: "x", maptableCampaignId: "m1" }, true).note, /Only the GM/);
});
test("the Campaigns hub uses the notes' campaign, else the Maptable campaign, else nothing", () => {
  assert.equal(hubDiceTarget({ name: "The Salt Road", encyclopedia: { id: "e1" }, maptable: { id: "m1" } }).discord?.mode, "encyclopedia");
  assert.deepEqual(hubDiceTarget({ name: "Old map", encyclopedia: null, maptable: { id: "m1" } }).discord, { mode: "maptable", maptableCampaignId: "m1", label: "Old map" });
  assert.equal(hubDiceTarget({ name: "Empty", encyclopedia: null, maptable: null }).discord, null);
  assert.equal(hubDiceTarget(null), NO_CAMPAIGN);
});
test("only a signed-in member on an m-<ref> player link posts; a share link or a signed-out member stays local", () => {
  const ref = "ab".repeat(32);
  assert.deepEqual(playerDiceTarget("m-" + ref, "The Salt Road", true).discord, { mode: "member", ref, label: "The Salt Road" });
  assert.equal(playerDiceTarget("m-" + ref, "The Salt Road", false).discord, null);
  assert.equal(playerDiceTarget(ref, "The Salt Road", true).discord, null, "a share link has no member");
  assert.equal(playerDiceTarget("", "The Salt Road", true).discord, null);
});
test("pages that never set a target (home, campaigns list, account) are local only", () => {
  assert.equal(diceTargetStore.get(), NO_CAMPAIGN);
  assert.equal(NO_CAMPAIGN.discord, null); assert.equal(NO_CAMPAIGN.note, LOCAL_ONLY);
  const seen = []; const off = diceTargetStore.subscribe(() => seen.push(diceTargetStore.get().discord?.mode ?? null));
  const clear = diceTargetStore.set(encyclopediaDiceTarget({ id: "c1", name: "x", maptableCampaignId: "m" }, false));
  assert.equal(diceTargetStore.get().discord?.mode, "encyclopedia");
  clear(); assert.equal(diceTargetStore.get(), NO_CAMPAIGN, "leaving the page puts back local only");
  off(); assert.deepEqual(seen, ["encyclopedia", null]);
});

test("the GM roll route takes an Encyclopedia campaign or a Maptable campaign, never both or neither", async () => {
  const { discordRollSchema } = await import("../lib/encyclopedia/discord-roll.ts");
  const base = { title: "Dice tray", formula: "1d20", total: 11, detail: "11" };
  assert.ok(discordRollSchema.safeParse({ ...base, campaignId: "c1" }).success);
  assert.ok(discordRollSchema.safeParse({ ...base, maptableCampaignId: "m1" }).success);
  assert.ok(!discordRollSchema.safeParse({ ...base, campaignId: "c1", maptableCampaignId: "m1" }).success);
  assert.ok(!discordRollSchema.safeParse(base).success);
});
