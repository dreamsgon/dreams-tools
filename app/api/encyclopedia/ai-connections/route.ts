import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {EncyclopediaStore} from '@/lib/encyclopedia/store';
import {getBucket} from '@/lib/storage';
import {cleanApi,createApiConnection,createConnection,listConnections,publicConnection,revokeConnection,updateApi,updateConnection} from '@/lib/mcp/connections';
import {listModels,ProviderError} from '@/lib/ai/chat';
import {cleanApiKey,unlock} from '@/lib/ai/secret';
import {cleanBaseUrl,isProvider} from '@/lib/ai/providers';
export const dynamic='force-dynamic';
const campaignId=z.string().min(1).max(100);
// The signed-in GM's AI connections for one campaign. Keys are only returned once, when made.
export async function GET(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 const id=campaignId.safeParse(new URL(request.url).searchParams.get('campaignId'));if(!id.success)return json({error:'Choose a campaign.'},400);
 try{return json({connections:(await listConnections(getBucket(),owner,id.data)).map(publicConnection)});}
 catch{return json({error:'Could not load the AI connections.'},400);}
}
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const raw=await request.text();if(raw.length>4000)return json({error:'Request too large'},413);
  const args=z.object({campaignId,action:z.enum(['create','update','revoke','models','createApi','updateApi']),id:z.string().max(100).optional(),name:z.string().max(200).optional(),level:z.string().max(20).optional(),
   provider:z.string().max(20).optional(),baseUrl:z.string().max(400).optional(),apiKey:z.string().max(500).optional(),model:z.string().max(200).optional(),limit:z.union([z.number(),z.string().max(20),z.null()]).optional()}).parse(JSON.parse(raw));
  const bucket=getBucket();
  if(args.action==='create'){
   const {data}=await new EncyclopediaStore(bucket).read(owner);
   if(!data.campaigns.some(c=>c.id===args.campaignId))throw Error('Save this campaign first.');
   return json(await createConnection(bucket,owner,args.campaignId,args.name,args.level));
  }
  // Your own API key: list the models it can use (this also checks the key), then save the connection.
  if(args.action==='models'){
   const saved=args.id&&args.apiKey===undefined?(await listConnections(bucket,owner,args.campaignId)).find(c=>c.id===args.id)?.api:undefined;
   const provider=saved?.provider??args.provider;if(!isProvider(provider))throw Error('Choose a provider.');
   const key=saved?unlock(saved.key):cleanApiKey(args.apiKey);
   const baseUrl=provider==='other'?(saved?.baseUrl&&args.baseUrl===undefined?saved.baseUrl:cleanBaseUrl(args.baseUrl)):undefined;
   return json({models:await listModels({provider,baseUrl,key})});
  }
  if(args.action==='createApi'){
   const {data}=await new EncyclopediaStore(bucket).read(owner);
   if(!data.campaigns.some(c=>c.id===args.campaignId))throw Error('Save this campaign first.');
   return json({connection:await createApiConnection(bucket,owner,args.campaignId,args.name,args.level,cleanApi({provider:args.provider,baseUrl:args.baseUrl,model:args.model,limit:args.limit,apiKey:args.apiKey}))});
  }
  if(args.action==='updateApi')return json({connection:await updateApi(bucket,owner,args.campaignId,args.id,{model:args.model,limit:args.limit,apiKey:args.apiKey,baseUrl:args.baseUrl})});
  if(args.action==='update')return json({connection:await updateConnection(bucket,owner,args.campaignId,args.id,{level:args.level,name:args.name})});
  return json({revoked:await revokeConnection(bucket,owner,args.campaignId,args.id)});
 }catch(e){return json({error:e instanceof ProviderError||e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Could not update the AI connection.'},400);}
}
