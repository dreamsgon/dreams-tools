import {json} from '@/lib/encyclopedia/workspace-server';
import {readPlayerMapImage,imageResponse} from '@/lib/encyclopedia/map-images-server';
import {playerGrant,playerTokenPattern} from '@/lib/encyclopedia/player-links-server';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{const raw=await request.text();if(raw.length>1000)return json({error:'Invalid request'},400);const body=JSON.parse(raw);if(typeof body.token!=='string'||!playerTokenPattern.test(body.token)||typeof body.imageId!=='string')return json({error:'Invalid map link'},404);const {grant}=await playerGrant(body.token);const image=grant?await readPlayerMapImage(grant,body.imageId):null;return image?imageResponse(image):json({error:'Map unavailable or link revoked'},404);}catch{return json({error:'Map unavailable'},400);}}
