import { getAppUser } from '@/lib/app-user';
import { getBucket } from '../storage';
import { EncyclopediaStore } from './store';
import type { Workspace } from './world-model';
export const readWorkspace = (owner:string) => new EncyclopediaStore(getBucket()).read(owner);
export const saveWorkspace = (owner:string,data:Workspace,revision:number) => new EncyclopediaStore(getBucket()).save(owner,data,revision);
export function json(value:unknown,status=200) {return Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});}
export async function ownerFrom(_request:Request) {return (await getAppUser())?.userId??null;}
export function sameOrigin(request:Request) {return request.headers.get('Origin')===new URL(request.url).origin;}
