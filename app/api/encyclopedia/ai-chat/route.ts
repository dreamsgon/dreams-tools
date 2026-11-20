import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {getBucket} from '@/lib/storage';
import {campaignFor} from '@/lib/mcp/campaign-for';
import {listConnections,targetFor,updateApi} from '@/lib/mcp/connections';
import {chatTurn,cleanHistory} from '@/lib/ai/run';
import {listModels,ProviderError} from '@/lib/ai/chat';
import {chatModels} from '@/lib/ai/model-list';
import {providerOf} from '@/lib/ai/providers';
export const dynamic='force-dynamic';
// A turn can call several tools and wait on the AI provider a few times.
export const maxDuration=60;
const id=z.string().min(1).max(100);
// The AI panel's chat, for a connection made with the GM's own API key. The key comes from the GM's device with this
// request, is used for it only, and is never saved. Besides asking (the default), `models` lists the models the
// connection's key can chat with, and `defaultModel` makes one the connection's model for new chats.
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const raw=await request.text();if(raw.length>200_000)return json({error:'The conversation is too long. Start a new one.'},413);
  const input=z.object({action:z.enum(['ask','models','defaultModel']).optional(),campaignId:id.optional(),maptableCampaignId:id.optional(),connectionId:id,apiKey:z.string().max(500).optional(),messages:z.array(z.unknown()).max(200).optional(),scene:z.string().max(200).optional(),chatId:z.string().max(100).optional(),model:z.string().max(200).optional(),folder:z.string().max(100).optional()}).parse(JSON.parse(raw));
  const bucket=getBucket(),campaign=await campaignFor(bucket,owner,input);
  if(!campaign)throw Error('This map has no Wiki campaign paired with it.');
  if(input.action==='models'){
   const c=(await listConnections(bucket,owner,campaign)).find(x=>x.id===input.connectionId);
   if(!c?.api)throw Error('That AI connection was removed.');
   const {key,provider,baseUrl}=targetFor(c,input.apiKey);
   const {chat,other}=chatModels(await listModels({provider,baseUrl,key}),provider,providerOf(provider).suggested);
   return json({models:chat,other,current:c.api.model});
  }
  if(input.action==='defaultModel'){
   const updated=await updateApi(bucket,owner,campaign,input.connectionId,{model:input.model});
   return json({ok:true,model:updated.api?.model});
  }
  return json(await chatTurn(bucket,owner,campaign,{connectionId:input.connectionId,apiKey:input.apiKey??''},cleanHistory(input.messages),input.scene,fetch,input.chatId,{model:input.model,folder:input.folder}));
 }catch(e){return json({error:e instanceof ProviderError||e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Could not ask the AI.'},400);}
}
