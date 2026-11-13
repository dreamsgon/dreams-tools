/* Posts an Encyclopedia roll to the Discord channel of the Maptable campaign the GM chose. Server only. */
import type { S3Bucket } from "../storage.ts";
import { loadWorkspace } from "../workspace-storage.ts";
import { campaignSettingsKey, validWebhook } from "../campaign-settings.ts";
import { EncyclopediaStore } from "./store.ts";
import { discordRollMessage, discordRollSchema, discordTarget } from "./discord-roll.ts";

export async function sendDiscordRoll(bucket: S3Bucket, owner: string, input: unknown) {
  const content = discordRollMessage(input);
  const prefix = `users/${encodeURIComponent(owner)}/`;
  const { data } = await new EncyclopediaStore(bucket).read(owner);
  const target = discordTarget(data, discordRollSchema.parse(input).campaignId);
  const maptable = await loadWorkspace(bucket, prefix);
  if (!maptable?.workspace.collections.some(c => c.id === target.maptableCampaignId && c.kind === "campaign")) throw Error("The Maptable campaign for Discord rolls no longer exists. Choose another in AI & campaign repositories.");
  const stored = await bucket.get(campaignSettingsKey(prefix, target.maptableCampaignId));
  const settings = stored ? await stored.json<{ webhook?: string; webhooks?: Record<string, string> }>() : {};
  const webhook = settings.webhooks?.[target.route] || settings.webhook;
  if (!validWebhook(webhook)) throw Error("That Maptable campaign has no Discord webhook yet. Add one in Maptable's campaign Connections.");
  let response: Response;
  try { response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }), redirect: "manual", signal: AbortSignal.timeout(15000) }); }
  catch { throw Error("Discord could not confirm delivery. Check the channel before sending again."); }
  if (response.status === 429) throw Error("Discord is rate limiting posts. Wait a moment before sending again.");
  if (!response.ok) throw Error("Discord rejected the roll. Check the campaign webhook in Maptable.");
}
