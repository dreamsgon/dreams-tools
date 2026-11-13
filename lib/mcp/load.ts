/* Turns a key into the campaign it reaches. Used by the /api/mcp routes. */
import type { S3Bucket } from "../storage.ts";
import { EncyclopediaStore, hashToken } from "../encyclopedia/store.ts";
import { campaignExport } from "../encyclopedia/world-model.ts";
import { loadWorkspace } from "../workspace-storage.ts";
import { campaignScenes } from "../agent-maps.ts";
import { grantFor, listConnections, type KeyGrant } from "./connections.ts";
import { logActivity, readActivity } from "./activity.ts";
import { narrow } from "./players-only.ts";
import { fromLevel } from "./permissions.ts";
import { makeCommit } from "./commit.ts";
import { sendEncyclopediaPost } from "../encyclopedia/discord-send.ts";
import type { McpContext } from "./tools.ts";
import { scenePicture } from "./scene-picture.ts";

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
  const prefix = `users/${encodeURIComponent(grant.owner)}/`;
  const picture: McpContext["picture"] = maps ? (s, mode) => scenePicture(bucket, prefix, maps!.workspace, s, mode) : undefined;
  const perms = grant.perms ?? fromLevel(grant.level);
  const base = { maps, level: grant.level, perms, picture };
  if (grant.level === "read") return narrow({ ...base, book, campaign: book.campaigns[0] });
  const [activity, connections] = await Promise.all([readActivity(bucket, grant.owner, campaign.id), listConnections(bucket, grant.owner, campaign.id)]);
  const connection = connections.find(c => c.id === grant.connectionId)?.name ?? "An AI";
  const commit = makeCommit(bucket, { owner: grant.owner, campaignId: campaign.id, connectionId: grant.connectionId, connection }, base,
    post => sendEncyclopediaPost(bucket, grant.owner, campaign.id, post).then(() => undefined));
  // A change set to "Ask me" waits in the GM's AI panel as a suggestion.
  const suggest: McpContext["suggest"] = async s => {
    const id = crypto.randomUUID();
    await logActivity(bucket, grant.owner, campaign.id, { id, at: new Date().toISOString(), connection, connectionId: grant.connectionId, tool: s.tool, summary: s.summary, ...(s.detail ? { detail: s.detail } : {}), waiting: { args: s.args, ...(s.preview ? { preview: s.preview } : {}) } });
    return id;
  };
  const suggestions = activity.entries.filter(e => e.waiting && e.connectionId === grant.connectionId)
    .map(e => ({ id: e.id, at: e.at, summary: e.summary, state: e.decided ?? "waiting" as const, ...(e.result ? { result: e.result } : {}) }));
  return narrow({ ...base, book, campaign: book.campaigns[0], paused: activity.paused, commit, suggest, suggestions });
}
