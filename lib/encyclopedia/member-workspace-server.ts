import { getBucket } from '../storage';
import { MemberStore } from '../members-server';
import { EncyclopediaStore } from './store';
import { campaignExport } from './world-model';

/**
 * A co-GM's copy of one campaign: the campaign, its world and the pages it can see, GM notes included, and
 * nothing from the owner's other campaigns. Checked against the member list on every request. Read only for now.
 */
export const memberRefPattern = /^[a-f0-9]{64}$/;
export const coGmGrant = (userId:string,ref:string) => memberRefPattern.test(ref) ? new MemberStore(getBucket()).openAs(userId,ref,'seeGm') : Promise.resolve(null);
export async function coGmWorkspace(grant:{owner:string;campaignId:string}) {
  const read = await new EncyclopediaStore(getBucket()).read(grant.owner);
  if (!read.data.campaigns.some(c=>c.id===grant.campaignId)) return null;
  return { data:campaignExport(read.data,grant.campaignId), revision:read.revision, etag:read.etag };
}
export const coGmReadOnly = 'Co-GMs can read this campaign for now. Editing it comes in a later update.';
export const coGmGone = 'You can no longer open this campaign. You may have left it, or the GM changed what your group can see.';
