import { getBucket } from '../storage';
import { getAppUser } from '../app-user';
import { MemberStore } from '../members-server';
import { EncyclopediaStore } from './store';
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
