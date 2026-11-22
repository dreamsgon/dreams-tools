import { getAppUser } from '@/lib/app-user';
import { getBucket } from '../storage';
import { EncyclopediaStore, encyclopediaPrefix } from './store';
import type { Workspace } from './world-model';
import type { WikiPatch } from './wiki-parts';
export const readWorkspace = (owner:string) => new EncyclopediaStore(getBucket()).read(owner);
export const saveWorkspace = (owner:string,data:Workspace,revision:number) => new EncyclopediaStore(getBucket()).saveTagged(owner,data,revision);
/** Saves only the campaigns and worlds that changed (lib/encyclopedia/wiki-parts.ts). */
export const saveWorkspacePatch = (owner:string,patch:WikiPatch,revision:number) => new EncyclopediaStore(getBucket()).savePatch(owner,patch,revision);
export const setWikiPartLimit = (owner:string,limit:number) => new EncyclopediaStore(getBucket()).setPartLimit(owner,limit);
export const setWikiTotalLimit = (owner:string,total:number) => new EncyclopediaStore(getBucket()).setTotalLimit(owner,total);
/** Moves a campaign's pages out of the Wiki into their own archive file, or brings them back. */
export const archiveCampaign = (owner:string,campaignId:string,archive:boolean) => archive ? new EncyclopediaStore(getBucket()).archiveCampaign(owner,campaignId) : new EncyclopediaStore(getBucket()).unarchiveCampaign(owner,campaignId);
/** Where a big save is staged and a big load is handed over (lib/transfers.ts), the same place /api/transfers uses for this account. */
export const transferPrefix = (owner:string) => `users/${encodeURIComponent(owner)}/`;
/** The workspace's etag without reading it, or null when there is none yet. */
export const workspaceTag = async (owner:string) => (await getBucket().head(encyclopediaPrefix(owner)+'workspace.json'))?.etag ?? null;
export function json(value:unknown,status=200) {return Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});}
export async function ownerFrom(_request:Request) {return (await getAppUser())?.userId??null;}
export function sameOrigin(request:Request) {return request.headers.get('Origin')===new URL(request.url).origin;}
