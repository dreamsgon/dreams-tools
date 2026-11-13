/* Reading a Maptable campaign's Discord settings and posting through them. Server only. */
import type { S3Bucket } from "../storage.ts";
import { campaignSettingsKey } from "../campaign-settings.ts";
import { channelsOf, editSettings, pickChannel, publicSettings, type DiscordEdit, type DiscordSettings, type MapRoute, type PostKind, type Channel } from "./settings.ts";
import { checkWebhook, postName, sendToDiscord, type Post } from "./send.ts";
import { parseWebhook } from "./webhook.ts";
import { testPost } from "./cards.ts";

type Bucket = Pick<S3Bucket, "get" | "put">;

export async function readDiscord(bucket: Bucket, prefix: string, campaignId: string): Promise<DiscordSettings> {
  const stored = await bucket.get(campaignSettingsKey(prefix, campaignId));
  if (!stored) return {};
  const value = await stored.json<DiscordSettings>().catch(() => ({}));
  return value && typeof value === "object" ? value : {};
}

export async function writeDiscord(bucket: Bucket, prefix: string, campaignId: string, settings: DiscordSettings) {
  await bucket.put(campaignSettingsKey(prefix, campaignId), JSON.stringify(settings), { httpMetadata: { contentType: "application/json" } });
}

export type Sent = { skipped: true } | { skipped: false; id?: string; channel: Channel };

/**
 * Posts one kind of post for a campaign. Skipped when the GM turned that kind off; an error when no
 * channel is set up. The post goes out under the campaign's "Post as" name unless it names its own.
 */
export async function postForCampaign(bucket: Bucket, prefix: string, campaignId: string, kind: PostKind, post: Post,
  opts: { legacyRoute?: MapRoute; campaignName?: string; edit?: string; channelId?: string; fetcher?: typeof fetch; settings?: DiscordSettings } = {}): Promise<Sent> {
  const settings = opts.settings ?? await readDiscord(bucket, prefix, campaignId);
  // A test goes to the channel being tested; everything else follows the campaign's choices.
  const channel = opts.channelId ? channelsOf(settings).channels.find(c => c.id === opts.channelId) ?? null : pickChannel(settings, kind, opts.legacyRoute);
  if (channel === "off") return { skipped: true };
  if (!channel) throw new Error("Add a Discord webhook for this campaign in Maptable › Connections first.");
  const username = postName(post.username) ?? postName(settings.postAs) ?? postName(opts.campaignName);
  const sent = await sendToDiscord({ url: channel.url, threadId: channel.threadId }, { ...post, ...(username ? { username } : {}) }, { edit: opts.edit, fetcher: opts.fetcher });
  return { skipped: false, id: sent.id, channel };
}

/** The settings the Connections dialog shows; with `check`, each channel's webhook is looked up in Discord. */
export async function discordStatus(bucket: Bucket, prefix: string, campaignId: string, opts: { check?: boolean; fetcher?: typeof fetch } = {}) {
  const settings = await readDiscord(bucket, prefix, campaignId), view = publicSettings(settings);
  if (!opts.check) return { ...view, status: {} as Record<string, "ok" | "deleted" | "unknown"> };
  const { channels } = channelsOf(settings), status: Record<string, "ok" | "deleted" | "unknown"> = {};
  await Promise.all(channels.map(async c => {
    const r = await checkWebhook({ url: c.url, threadId: c.threadId }, opts.fetcher);
    status[c.id] = r.state;
    const shown = view.channels.find(x => x.id === c.id);
    if (r.state === "ok" && shown && r.name) shown.hookName = r.name;
  }));
  return { ...view, status };
}

/** One change from the Connections dialog. A new webhook is looked up in Discord first, so a typo or deleted one is caught. */
export async function editDiscord(bucket: Bucket, prefix: string, campaignId: string, edit: DiscordEdit, opts: { fetcher?: typeof fetch; newId?: () => string } = {}) {
  const settings = await readDiscord(bucket, prefix, campaignId);
  let hookName: string | undefined;
  if (edit.action === "addChannel") {
    const hook = parseWebhook(edit.url);
    if (hook) {
      const found = await checkWebhook(hook, opts.fetcher);
      if (found.state === "deleted") throw new Error("Discord says that webhook doesn't exist. Copy the URL again from Channel settings › Integrations › Webhooks.");
      if (found.state === "ok") hookName = found.name;
    }
  }
  const next = editSettings(settings, edit, { newId: opts.newId ?? (() => crypto.randomUUID().slice(0, 8)), hookName });
  await writeDiscord(bucket, prefix, campaignId, next);
  return publicSettings(next);
}

/** A test card to one channel (by id), or to the main channel. */
export async function sendDiscordTest(bucket: Bucket, prefix: string, campaignId: string, campaignName: string, channelId: unknown, fetcher?: typeof fetch) {
  const settings = await readDiscord(bucket, prefix, campaignId), { channels, main } = channelsOf(settings);
  const channel = channels.find(c => c.id === (typeof channelId === "string" && channelId !== "default" ? channelId : main)) ?? channels.find(c => c.id === main);
  if (!channel) throw new Error("Save a webhook for this campaign before testing it.");
  await postForCampaign(bucket, prefix, campaignId, "rolls", testPost(campaignName, channel.name), { channelId: channel.id, campaignName, settings, fetcher });
}
