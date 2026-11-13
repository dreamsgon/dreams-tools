import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {EncyclopediaStore} from '@/lib/encyclopedia/store';
import {getBucket} from '@/lib/storage';
import {createConnection,listConnections,publicConnection,revokeConnection,updateConnection} from '@/lib/mcp/connections';
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
  const raw=await request.text();if(raw.length>2000)return json({error:'Request too large'},413);
  const args=z.object({campaignId,action:z.enum(['create','update','revoke']),id:z.string().max(100).optional(),name:z.string().max(200).optional(),level:z.string().max(20).optional()}).parse(JSON.parse(raw));
  const bucket=getBucket();
  if(args.action==='create'){
   const {data}=await new EncyclopediaStore(bucket).read(owner);
   if(!data.campaigns.some(c=>c.id===args.campaignId))throw Error('Save this campaign first.');
   return json(await createConnection(bucket,owner,args.campaignId,args.name,args.level));
  }
  if(args.action==='update')return json({connection:await updateConnection(bucket,owner,args.campaignId,args.id,{level:args.level,name:args.name})});
  return json({revoked:await revokeConnection(bucket,owner,args.campaignId,args.id)});
 }catch(e){return json({error:e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Could not update the AI connection.'},400);}
}
