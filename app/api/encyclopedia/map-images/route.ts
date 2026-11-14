import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {readMapImage,saveMapImage,markCoGmUpload,isCoGmUpload,readImageUpload,imageResponse} from '@/lib/encyclopedia/map-images-server';
import {coGmGrant,coGmReadOnly,coGmGone,coGmWorkspace} from '@/lib/encyclopedia/member-workspace-server';
export const dynamic='force-dynamic';
export async function GET(request:Request){const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);try{const params=new URL(request.url).searchParams,id=params.get('id')??'',member=params.get('member');
 // A co-GM's view: only images the campaign's pages use.
 if(member!==null){const grant=await coGmGrant(owner,member),scoped=grant&&/^[0-9a-f-]{36}$/.test(id)?await coGmWorkspace(grant):null;const ok=!!scoped&&(JSON.stringify(scoped.data).includes(`"${id}"`)||await isCoGmUpload(grant!.owner,grant!.campaignId,id));const image=ok?await readMapImage(grant!.owner,id):null;return image?imageResponse(image):json({error:'Map image not found'},404);}
 const image=await readMapImage(owner,id);return image?imageResponse(image):json({error:'Map image not found'},404);}catch{return json({error:'Image storage unavailable'},503);}}
export async function POST(request:Request){const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);if(!sameOrigin(request))return json({error:'Same-origin request required'},403);try{const member=new URL(request.url).searchParams.get('member');
 // A co-GM who may edit: the transfer is in their own storage, the picture goes into the GM's.
 if(member!==null){const grant=await coGmGrant(owner,member);if(!grant)return json({error:coGmGone},404);if(!grant.edit)return json({error:coGmReadOnly},403);const saved=await saveMapImage(grant.owner,await readImageUpload(request,grant.owner,owner));await markCoGmUpload(grant.owner,grant.campaignId,saved.id);return json(saved);}
 return json(await saveMapImage(owner,await readImageUpload(request,owner)));}catch(e){return json({error:e instanceof Error?e.message:'Upload failed'},400);}}
