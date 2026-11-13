/*
 * Encyclopedia posts to Discord: your rolls, and the AI's rolls, narration and recaps. They go through the
 * channels of the Maptable campaign the GM chose (or the paired one), picked by kind in Maptable › Connections.
 * Server only.
 */
import type { S3Bucket } from "../storage.ts";
import { loadWorkspace } from "../workspace-storage.ts";
import { EncyclopediaStore } from "./store.ts";
import { discordRollSchema, discordTarget } from "./discord-roll.ts";
import { parseDice } from "../rolls.ts";
import type { Workspace } from "./world-model.ts";
import { oraclePost, rollPost, rollerName, tablePost, textPost } from "../discord/cards.ts";
import { discordTableSchema, type TableResult } from "./discord-table.ts";
import { postForCampaign } from "../discord/campaign.ts";
import { pictureAvatar, tokenAvatar } from "../discord/avatar.ts";
import type { DiscordFile, Post } from "../discord/send.ts";
import { campaignScenes } from "../agent-maps.ts";

export type EncyclopediaPost =
  | { kind: "roll"; ai?: boolean; title: string; formula: string; total: number; detail: string; who?: string; natural?: number | null }
  | { kind: "narration" | "recap"; text: string; title?: string }
  | { kind: "table"; result: TableResult };

/** The picture for whoever rolled: a page in this campaign (or its world) with that title, or a token of that name on its maps. */
async function avatarFor(bucket: S3Bucket, owner: string, data: Workspace, campaignId: string, who: string, maps: Awaited<ReturnType<typeof loadWorkspace>>, maptableCampaignId: string) {
  const name = who.toLocaleLowerCase(), campaign = data.campaigns.find(c => c.id === campaignId);
  const page = data.entries.find(e => e.picture && e.title.toLocaleLowerCase() === name && (e.campaignId === campaignId || (!e.campaignId && e.worldId === campaign?.worldId)));
  if (page?.picture) return pictureAvatar(bucket, owner, page.picture);
  if (!maps) return null;
  try {
    for (const s of campaignScenes(maps.workspace, maptableCampaignId)) {
      const token = s.tokens.find(t => !t.hidden && t.assetId && t.name.toLocaleLowerCase() === name);
      if (token) return tokenAvatar(bucket, `users/${encodeURIComponent(owner)}/`, maps.workspace, token);
    }
  } catch { /* The Maptable campaign was removed. */ }
  return null;
}

export async function sendEncyclopediaPost(bucket: S3Bucket, owner: string, campaignId: string, post: EncyclopediaPost): Promise<{ skipped: boolean }> {
  const prefix = `users/${encodeURIComponent(owner)}/`;
  const { data } = await new EncyclopediaStore(bucket).read(owner);
  const target = discordTarget(data, campaignId);
  const maptable = await loadWorkspace(bucket, prefix);
  const mapCampaign = maptable?.workspace.collections.find(c => c.id === target.maptableCampaignId && c.kind === "campaign");
  if (!mapCampaign) throw Error("The Maptable campaign for Discord no longer exists. Choose another in AI & campaign repositories.");
  let card: Post, files: DiscordFile[] = [];
  if (post.kind === "roll") {
    parseDice(post.formula);
    const who = post.who?.trim() || rollerName(post.title) || undefined;
    const avatar = who ? await avatarFor(bucket, owner, data, campaignId, who, maptable, target.maptableCampaignId) : null;
    if (avatar) files = [avatar];
    const title = who && post.title.toLocaleLowerCase().startsWith(who.toLocaleLowerCase()) ? post.title.slice(who.length).replace(/^\s*[·—–:-]\s*/, "") || "Roll" : post.title;
    card = rollPost({ title, formula: post.formula, total: post.total, detail: post.detail, who, avatar: !!avatar, natural: post.natural, footer: post.ai ? "Rolled by the AI" : undefined });
  } else if (post.kind === "table") card = tableResultPost(post.result);
  else card = textPost(post.kind, post.text, post.title);
  const sent = await postForCampaign(bucket, prefix, target.maptableCampaignId, post.kind === "roll" ? (post.ai ? "aiRolls" : "rolls") : post.kind === "table" ? "rolls" : post.kind === "recap" ? "recaps" : "narration",
    { ...card, ...(files.length ? { files } : {}) }, { legacyRoute: target.route, campaignName: mapCampaign.name });
  return { skipped: sent.skipped };
}

/** A roll from the Encyclopedia's roll card, posted when the GM presses Send to Discord (or has Always on). */
export async function sendDiscordRoll(bucket: S3Bucket, owner: string, input: unknown) {
  const roll = discordRollSchema.parse(input);
  return sendEncyclopediaPost(bucket, owner, roll.campaignId, { kind: "roll", title: roll.title, formula: roll.formula, total: roll.total, detail: roll.detail });
}

const tableResultPost = (r: TableResult) => r.oracle ? oraclePost({ ...r.oracle, footer: r.footer }) : tablePost(r);

/**
 * A table or oracle result, posted to the rolls channel. From the Encyclopedia it goes through the campaign's
 * chosen Maptable campaign; from the Maptable dice tray, straight to the open scene's campaign.
 */
export async function sendTableResult(bucket: S3Bucket, owner: string, input: unknown): Promise<{ skipped: boolean }> {
  const v = discordTableSchema.parse(input);
  if (v.campaignId) return sendEncyclopediaPost(bucket, owner, v.campaignId, { kind: "table", result: v.result });
  const prefix = `users/${encodeURIComponent(owner)}/`, maptable = await loadWorkspace(bucket, prefix);
  const campaign = maptable?.workspace.collections.find(c => c.id === v.maptableCampaignId && c.kind === "campaign");
  if (!campaign) throw Error("This scene isn't in a campaign, so it has no Discord channel.");
  const sent = await postForCampaign(bucket, prefix, campaign.id, "rolls", tableResultPost(v.result), { campaignName: campaign.name });
  return { skipped: sent.skipped };
}
