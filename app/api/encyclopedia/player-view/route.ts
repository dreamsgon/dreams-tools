import {json} from '@/lib/encyclopedia/workspace-server';
import {readPlayerLink} from '@/lib/encyclopedia/player-links-server';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{const raw=await request.text();if(raw.length>1000)return json({error:'Invalid link'},400);const body=JSON.parse(raw);if(typeof body?.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return json({error:'Invalid player link'},404);const data=await readPlayerLink(body.token);return data?json(data):json({error:'This player link is unavailable or has been revoked.'},404);}catch{return json({error:'Player view is unavailable.'},500);}
}
