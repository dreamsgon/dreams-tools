import { getBucket } from '../storage';
import { getAppUser } from '../app-user';
import { MemberStore } from '../members-server';
import { EncyclopediaStore } from './store';
import { playerCampaign } from './world-model';
import { myPages } from './player-edit';
export { hashToken } from './store';
export const createPlayerLink = (owner:string,campaign:string) => new EncyclopediaStore(getBucket()).createLink(owner,campaign);
export const revokePlayerLink = (owner:string,campaign:string) => new EncyclopediaStore(getBucket()).revokeLink(owner,campaign);

/** A player link's secret, or `m-<ref>` for a campaign the signed-in person is a member of. */
export const playerTokenPattern = /^(?:m-)?[a-f0-9]{64}$/;
type Grant = { owner:string; campaignId:string };

/** Who owns the campaign a player page was opened for, checked again on every request. */
export async function playerGrant(token:string):Promise<{ grant:Grant|null; signedOut?:true }> {
  if (!token.startsWith('m-')) return { grant:await new EncyclopediaStore(getBucket()).grant(token) };
  const user = await getAppUser();
  if (!user) return { grant:null, signedOut:true };
  return { grant:await new MemberStore(getBucket()).openAs(user.userId,token.slice(2)) };
}
export const readPlayerView = (grant:Grant) => new EncyclopediaStore(getBucket()).playerOf(grant);

/** A signed-in member's player pages: what players see, plus the pages their Who can edit lets them change. */
export async function memberRights(ref:string) {
  const user = await getAppUser();
  if (!user) return { rights:null, signedOut:true as const };
  return { rights:await new MemberStore(getBucket()).rightsAs(user.userId,ref) };
}
export type MemberRights = NonNullable<Awaited<ReturnType<MemberStore['rightsAs']>>>;
export async function readMemberView(r:MemberRights) {
  const { data } = await new EncyclopediaStore(getBucket()).read(r.owner);
  if (!data.campaigns.some(c=>c.id===r.campaignId)) return null;
  return { ...playerCampaign(data,r.campaignId,r.rights.edit), you:{ name:r.name, pages:myPages(data,r.campaignId,r.rights) } };
}
