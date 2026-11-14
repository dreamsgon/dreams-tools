import { getBucket } from '../storage';
import { getAppUser } from '../app-user';
import { MemberStore } from '../members-server';
import { EncyclopediaStore } from './store';
import { playerCampaign } from './world-model';
import { myPages } from './player-edit';
import { linkerKey, sheetStates } from './player-sheet';
import { sendEncyclopediaPost } from './discord-send';
import type { Deps as SheetDeps } from './player-sheet-request';
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
  const linker = linkerKey(r.owner,r.campaignId,r.userId);
  return { ...playerCampaign(data,r.campaignId,r.rights.edit,linker), you:{ name:r.name, pages:myPages(data,r.campaignId,r.rights), sheets:sheetStates(data,r.campaignId,r.rights,linker) } };
}

/** What the player sheet and player roll routes need: the signed-in member (rights read again), the stored workspace and the Discord post. */
export const playerSheetDeps = (sameOrigin:(r:Request)=>boolean): SheetDeps => ({
  sameOrigin,
  member: async ref => { const { rights, signedOut } = await memberRights(ref); return signedOut ? 'signedOut' : rights },
  store: { read: owner => new EncyclopediaStore(getBucket()).read(owner), save: (owner,data,revision,who) => new EncyclopediaStore(getBucket()).saveTagged(owner,data,revision,who) },
  post: (m,post) => sendEncyclopediaPost(getBucket(),m.owner,m.campaignId,post),
});
