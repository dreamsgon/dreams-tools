import { getBucket } from '../storage';
import { MemberStore } from '../members-server';
import { EncyclopediaStore } from './store';
import { campaignExport, workspaceSchema, type Workspace } from './world-model';
import { applyCoGmEdit, newImageIds } from './co-gm-edit';
import { isCoGmUpload } from './map-images-server';

/**
 * A co-GM's copy of one campaign: the campaign, its world and the pages it can see, GM notes included, and
 * nothing from the owner's other campaigns. Checked against the member list on every request. Co-GMs whose groups
 * say Yes to "Edit Encyclopedia pages" can save it back (lib/encyclopedia/co-gm-edit.ts says what they may change).
 */
export const memberRefPattern = /^[a-f0-9]{64}$/;
export const coGmGrant = (userId:string,ref:string) => memberRefPattern.test(ref) ? new MemberStore(getBucket()).openAs(userId,ref,'seeGm') : Promise.resolve(null);
export async function coGmWorkspace(grant:{owner:string;campaignId:string}) {
  const read = await new EncyclopediaStore(getBucket()).read(grant.owner);
  if (!read.data.campaigns.some(c=>c.id===grant.campaignId)) return null;
  return { data:campaignExport(read.data,grant.campaignId), revision:read.revision, etag:read.etag };
}
/** Saves a co-GM's copy into the owner's workspace. Null when it changed since they last read it. */
export async function coGmSave(grant:{owner:string;campaignId:string;name:string}, data:Workspace, revision:number) {
  const store = new EncyclopediaStore(getBucket());
  const read = await store.read(grant.owner);
  if (read.revision !== revision) return null;
  // Pictures new to the copy must be ones a co-GM uploaded for this campaign.
  const incoming = workspaceSchema.safeParse(data);
  const fresh = incoming.success ? newImageIds(campaignExport(read.data, grant.campaignId), incoming.data) : [];
  const allowed = new Set<string>();
  for (const id of fresh) if (await isCoGmUpload(grant.owner, grant.campaignId, id)) allowed.add(id);
  return store.saveTagged(grant.owner, applyCoGmEdit(read.data, grant.campaignId, data, allowed), revision, { name: grant.name, as: 'co-gm' });
}
export const coGmReadOnly = 'The GM has set your group to read this campaign, not edit it.';
export const coGmGone = 'You can no longer open this campaign. You may have left it, or the GM changed what your group can see.';
