/* Turns a key into the campaign it reaches. Used by the /api/mcp routes. */
import type { S3Bucket } from "../storage.ts";
import { EncyclopediaStore, hashToken } from "../encyclopedia/store.ts";
import { campaignExport } from "../encyclopedia/world-model.ts";
import { loadWorkspace } from "../workspace-storage.ts";
import { campaignScenes } from "../agent-maps.ts";
import { grantFor, listConnections, type KeyGrant } from "./connections.ts";
import { readActivity } from "./activity.ts";
import { makeCommit } from "./commit.ts";
import { sendDiscordRoll } from "../encyclopedia/discord-send.ts";
import type { McpContext } from "./tools.ts";

/**
 * Accepts a new rpg_ key, and the older single-purpose keys so existing setups keep working:
 * an enc_ Encyclopedia key or an mt_ Maptable key gets Read access through this endpoint.
 */
export async function resolveKey(bucket: S3Bucket, key: string): Promise<KeyGrant | null> {
  if (key.startsWith("rpg_")) return grantFor(bucket, key);
  const enc = /^enc_([a-f0-9]{64})$/.exec(key)?.[1];
  if (enc) {
    const g = await new EncyclopediaStore(bucket).grant(enc, "agent");
    return g ? { owner: g.owner, campaignId: g.campaignId, connectionId: null, level: "read", legacy: "encyclopedia" } : null;
  }
  if (/^mt_[a-f0-9]{64}$/.test(key)) {
    const hash = await hashToken(key), object = await bucket.get(`agent-keys/${hash}.json`);
    if (!object) return null;
    const g = await object.json<{ prefix: string; campaignId: string; mode: string }>();
    const settings = await bucket.get(`${g.prefix}agent-access/${encodeURIComponent(g.campaignId)}.json`);
    const current = settings ? await settings.json<{ hash: string; mode: string }>() : null;
    if (current?.hash !== hash) return null;
    const owner = decodeURIComponent(/^users\/([^/]+)\/$/.exec(g.prefix)?.[1] ?? "");
    if (!owner) return null;
    const { data } = await new EncyclopediaStore(bucket).read(owner);
    const book = data.campaigns.find(c => c.maptableCampaignId === g.campaignId);
    return book ? { owner, campaignId: book.id, connectionId: null, level: "read", legacy: "maptable" } : null;
  }
  return null;
}

export class GoneError extends Error {}

export async function loadContext(bucket: S3Bucket, grant: KeyGrant): Promise<McpContext> {
  const { data } = await new EncyclopediaStore(bucket).read(grant.owner);
  const campaign = data.campaigns.find(c => c.id === grant.campaignId);
  if (!campaign) throw new GoneError("This campaign no longer exists.");
  const book = campaignExport(data, campaign.id);
  let maps: McpContext["maps"] = null;
  if (campaign.maptableCampaignId) {
    const stored = await loadWorkspace(bucket, `users/${encodeURIComponent(grant.owner)}/`);
    if (stored) {
      try { maps = { workspace: stored.workspace, campaignId: campaign.maptableCampaignId, scenes: campaignScenes(stored.workspace, campaign.maptableCampaignId) }; }
      catch { maps = null; } // The paired Maptable campaign was removed.
    }
  }
  const base = { maps, level: grant.level };
  if (grant.level === "read") return { ...base, book, campaign: book.campaigns[0] };
  const [activity, connections] = await Promise.all([readActivity(bucket, grant.owner, campaign.id), listConnections(bucket, grant.owner, campaign.id)]);
  const connection = connections.find(c => c.id === grant.connectionId)?.name ?? "An AI";
  const commit = makeCommit(bucket, { owner: grant.owner, campaignId: campaign.id, connectionId: grant.connectionId, connection }, base,
    roll => sendDiscordRoll(bucket, grant.owner, { campaignId: campaign.id, ...roll }));
  return { ...base, book, campaign: book.campaigns[0], paused: activity.paused, commit };
}
