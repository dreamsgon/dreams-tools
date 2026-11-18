import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {getBucket} from '@/lib/storage';
import {tieWriteSchema,writeTieNotes} from '@/lib/ai/tie-writer';
import {checkWorld} from '@/lib/ai/world-checker';
import {worldCheckSchema} from '@/lib/encyclopedia/world-check';
import {checkSystem} from '@/lib/ai/system-checker';
import {systemCheckSchema} from '@/lib/encyclopedia/system-check';
import {draftSystem} from '@/lib/ai/system-drafter';
import {systemDraftSchema} from '@/lib/encyclopedia/system-draft';
export const dynamic='force-dynamic';
export const maxDuration=120;
const id=z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/),apiKey=z.string().max(500);
// Generator writing with one of the GM's API-key connections: notes for the relationship generators (`request`), or
// Check with your AI for a generated world map (`check`) or a star system's survey chart (`systemCheck`), or a star system
// built from a setting the GM names (`systemDraft`). Nothing is saved here, the key from the GM's device included. The GM only.
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const raw=await request.text();if(raw.length>60_000)return json({error:'Request too large'},413);
  const body=JSON.parse(raw) as {check?:unknown};
  if(body&&typeof body==='object'&&'systemDraft' in body){
   const input=z.object({campaignId:id,connectionId:id,apiKey,systemDraft:systemDraftSchema}).parse(body);
   return json(await draftSystem(getBucket(),owner,input.campaignId,{connectionId:input.connectionId,apiKey:input.apiKey},input.systemDraft));
  }
  if(body&&typeof body==='object'&&'systemCheck' in body){
   const input=z.object({campaignId:id,connectionId:id,apiKey,systemCheck:systemCheckSchema}).parse(body);
   return json(await checkSystem(getBucket(),owner,input.campaignId,{connectionId:input.connectionId,apiKey:input.apiKey},input.systemCheck));
  }
  if(body&&typeof body==='object'&&'check' in body){
   const input=z.object({campaignId:id,connectionId:id,apiKey,check:worldCheckSchema}).parse(body);
   return json(await checkWorld(getBucket(),owner,input.campaignId,{connectionId:input.connectionId,apiKey:input.apiKey},input.check));
  }
  const input=z.object({campaignId:id,connectionId:id,apiKey,request:tieWriteSchema}).parse(body);
  return json(await writeTieNotes(getBucket(),owner,input.campaignId,{connectionId:input.connectionId,apiKey:input.apiKey},input.request));
 }catch(e){return json({error:e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Could not ask the AI.'},400);}
}
