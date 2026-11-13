/* Maptable asks by its own campaign id: this finds the Encyclopedia campaign paired with it. */
import type { S3Bucket } from "../storage.ts";
import { EncyclopediaStore } from "../encyclopedia/store.ts";

const ID = /^[^\s]{1,100}$/;
export async function campaignFor(bucket: S3Bucket, owner: string, params: { campaignId?: string | null; maptableCampaignId?: string | null }): Promise<string | null> {
  if (params.campaignId) { if (!ID.test(params.campaignId)) throw Error("Choose a campaign."); return params.campaignId; }
  if (!params.maptableCampaignId || !ID.test(params.maptableCampaignId)) throw Error("Choose a campaign.");
  const { data } = await new EncyclopediaStore(bucket).read(owner);
  return data.campaigns.find(c => c.maptableCampaignId === params.maptableCampaignId)?.id ?? null;
}
