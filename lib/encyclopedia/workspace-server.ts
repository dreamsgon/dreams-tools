import { getAppUser } from '@/lib/app-user';
import { getBucket } from '../storage';
import { EncyclopediaStore, encyclopediaPrefix } from './store';
import type { Workspace } from './world-model';
export const readWorkspace = (owner:string) => new EncyclopediaStore(getBucket()).read(owner);
export const saveWorkspace = (owner:string,data:Workspace,revision:number) => new EncyclopediaStore(getBucket()).saveTagged(owner,data,revision);
/** The workspace's etag without reading it, or null when there is none yet. */
export const workspaceTag = async (owner:string) => (await getBucket().head(encyclopediaPrefix(owner)+'workspace.json'))?.etag ?? null;
export function json(value:unknown,status=200) {return Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});}
export async function ownerFrom(_request:Request) {return (await getAppUser())?.userId??null;}
export function sameOrigin(request:Request) {return request.headers.get('Origin')===new URL(request.url).origin;}
