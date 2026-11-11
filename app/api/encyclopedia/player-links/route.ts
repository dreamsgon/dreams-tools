import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {createPlayerLink,revokePlayerLink} from '@/lib/encyclopedia/player-links-server';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{const raw=await request.text();if(raw.length>2000)return json({error:'Request too large'},413);const args=z.object({campaignId:z.string().min(1).max(100),action:z.enum(['create','revoke'])}).parse(JSON.parse(raw));
 if(args.action==='revoke'){await revokePlayerLink(owner,args.campaignId);return json({revoked:true});}
 return json({token:await createPlayerLink(owner,args.campaignId)});
 }catch{return json({error:'Could not update the player link. Save the campaign first, then try again.'},400);}
}
