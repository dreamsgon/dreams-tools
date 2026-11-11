import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {readMapImage,saveMapImage,readImageUpload,imageResponse} from '@/lib/encyclopedia/map-images-server';
export const dynamic='force-dynamic';
export async function GET(request:Request){const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);try{const image=await readMapImage(owner,new URL(request.url).searchParams.get('id')??'');return image?imageResponse(image):json({error:'Map image not found'},404);}catch{return json({error:'Image storage unavailable'},503);}}
export async function POST(request:Request){const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);if(!sameOrigin(request))return json({error:'Same-origin request required'},403);try{return json(await saveMapImage(owner,await readImageUpload(request,owner)));}catch(e){return json({error:e instanceof Error?e.message:'Upload failed'},400);}}
