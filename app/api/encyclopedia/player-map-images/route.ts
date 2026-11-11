import {json} from '@/lib/encyclopedia/workspace-server';
import {readPlayerMapImage,imageResponse} from '@/lib/encyclopedia/map-images-server';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{const raw=await request.text();if(raw.length>1000)return json({error:'Invalid request'},400);const body=JSON.parse(raw);if(typeof body.token!=='string'||typeof body.imageId!=='string')return json({error:'Invalid map link'},404);const image=await readPlayerMapImage(body.token,body.imageId);return image?imageResponse(image):json({error:'Map unavailable or link revoked'},404);}catch{return json({error:'Map unavailable'},400);}}
