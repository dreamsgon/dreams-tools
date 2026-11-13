/* Maptable's Discord posts: rolls, initiative (posted once, then kept up to date) and shared maps. Server only. */
import type { S3Bucket } from "../storage.ts";
import type { Workspace } from "../model.ts";
import { mapDiscordMessage } from "../map-discord-message.ts";
import { sceneCampaign } from "../campaign-settings.ts";
import { mapPost } from "./cards.ts";
import { readDiscord, postForCampaign } from "./campaign.ts";
import { mapKind, pickChannel, type MapRoute } from "./settings.ts";
import { tokenAvatar } from "./avatar.ts";
import type { DiscordFile } from "./send.ts";

type Bucket = Pick<S3Bucket, "get" | "put" | "delete">;
type Ctx = { bucket: Bucket; prefix: string; workspace: Workspace; fetcher?: typeof fetch };

async function fingerprint(text: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map(v => v.toString(16).padStart(2, "0")).join("");
}
const campaignName = (w: Workspace, id: string) => w.collections.find(c => c.id === id)?.name;

/** A roll or initiative from Maptable. Initiative "update" edits the message this user last posted there. */
export async function sendMapMessage(ctx: Ctx, input: unknown): Promise<{ skipped: boolean }> {
  const { bucket, prefix, workspace } = ctx;
  const message = mapDiscordMessage(workspace, input);
  const kind = message.kind === "initiative" ? "initiative" : "rolls";
  const settings = await readDiscord(bucket, prefix, message.campaignId);
  const channel = pickChannel(settings, kind, message.route);
  if (channel === "off") return { skipped: true };
  if (!channel) throw new Error("Add a Discord webhook for this campaign in Connections first.");
  // The message to keep up to date is remembered per user, campaign, scene and channel, never by URL.
  const key = `${prefix}discord-initiative/${encodeURIComponent(message.campaignId)}/${encodeURIComponent(message.sceneId)}/${message.route}-${await fingerprint(channel.url + (channel.threadId ?? ""))}.json`;
  const updating = message.kind === "initiative" && message.action === "update";
  let edit: string | undefined;
  if (updating) {
    const record = await bucket.get(key);
    const data = record ? await record.json<{ messageId?: string }>().catch(() => null) : null;
    edit = data?.messageId;
    if (!edit || !/^\d+$/.test(edit)) throw new Error("Post initiative once to this Discord destination before enabling updates.");
  }
  const scene = workspace.scenes.find(s => s.id === message.sceneId)!;
  const token = message.avatarTokenId ? scene.tokens.find(t => t.id === message.avatarTokenId) : undefined;
  const avatar: DiscordFile | null = token ? await tokenAvatar(bucket as S3Bucket, prefix, workspace, token) : null;
  const post = { ...message.post, ...(avatar ? { files: [avatar] } : {}) };
  if (!avatar) for (const e of post.embeds ?? []) if (e.author?.icon_url) delete e.author.icon_url;
  const sent = await postForCampaign(bucket, prefix, message.campaignId, kind, post, { legacyRoute: message.route, campaignName: campaignName(workspace, message.campaignId), edit, settings, fetcher: ctx.fetcher });
  if (message.kind === "initiative" && !updating && !sent.skipped) {
    if (!sent.id) throw new Error("Discord did not confirm the message ID. Check the channel before posting again.");
    try { await bucket.put(key, JSON.stringify({ messageId: sent.id })); }
    catch { throw new Error("Initiative posted, but its update reference could not be saved. Check the channel before posting again."); }
  }
  return { skipped: sent.skipped };
}

const extension = (type: string) => type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg";

/** A map picture shared from Maptable, to the channel for its map type (or the one chosen in Share). */
export async function shareMap(ctx: Ctx, input: { sceneId: unknown; campaignId: unknown; route?: unknown; caption?: unknown; file: { type: string; bytes: Uint8Array } }) {
  const { workspace } = ctx;
  const campaignId = sceneCampaign(workspace, input.sceneId);
  if (input.campaignId !== campaignId) throw new Error("This scene's campaign changed. Wait for it to save, then reopen Share before posting.");
  const scene = workspace.scenes.find(s => s.id === input.sceneId)!;
  const route = String(input.route || (scene.mapType === "world" ? "world" : scene.mapType === "area" ? "exploration" : "combat")) as MapRoute;
  if (!["combat", "exploration", "world"].includes(route)) throw new Error("Choose a valid map destination.");
  if (!["image/webp", "image/png", "image/jpeg"].includes(input.file.type) || input.file.bytes.byteLength > 9 * 1024 * 1024)
    throw new Error("Export must be a WebP, PNG or JPG under 9 MB. Try a smaller export.");
  const name = "map." + extension(input.file.type);
  const post = { ...mapPost(scene.name, String(input.caption ?? "").slice(0, 1900), name), files: [{ name, type: input.file.type, bytes: input.file.bytes }] };
  const sent = await postForCampaign(ctx.bucket, ctx.prefix, campaignId, mapKind(route), post, { legacyRoute: route, campaignName: campaignName(workspace, campaignId), fetcher: ctx.fetcher });
  if (sent.skipped) throw new Error(`${route === "world" ? "World" : route === "exploration" ? "Exploration" : "Combat"} maps are set to “Don’t post” in Connections › Discord.`);
  return sent;
}
