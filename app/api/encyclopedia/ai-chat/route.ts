import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {getBucket} from '@/lib/storage';
import {campaignFor} from '@/lib/mcp/campaign-for';
import {chatTurn,cleanHistory} from '@/lib/ai/run';
export const dynamic='force-dynamic';
// A turn can call several tools and wait on the AI provider a few times.
export const maxDuration=60;
const id=z.string().min(1).max(100);
// The AI panel's chat, for a connection made with the GM's own API key. The key never leaves the server.
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const raw=await request.text();if(raw.length>200_000)return json({error:'The conversation is too long. Start a new one.'},413);
  const input=z.object({campaignId:id.optional(),maptableCampaignId:id.optional(),connectionId:id,messages:z.array(z.unknown()).max(200),scene:z.string().max(200).optional(),chatId:z.string().max(100).optional()}).parse(JSON.parse(raw));
  const bucket=getBucket(),campaign=await campaignFor(bucket,owner,input);
  if(!campaign)throw Error('This map has no Encyclopedia campaign paired with it.');
  return json(await chatTurn(bucket,owner,campaign,input.connectionId,cleanHistory(input.messages),input.scene,fetch,input.chatId));
 }catch(e){return json({error:e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Could not ask the AI.'},400);}
}
