import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {EncyclopediaStore} from '@/lib/encyclopedia/store';
import {getBucket} from '@/lib/storage';
import {createBridgeKey,listBridgeKeys,publicKey,revokeBridgeKey,updateBridgeKey} from '@/lib/bridge/keys';
export const dynamic='force-dynamic';
const campaignId=z.string().min(1).max(100);
// The signed-in GM's bridge keys for one campaign. A key is only returned once, when made.
export async function GET(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 const id=campaignId.safeParse(new URL(request.url).searchParams.get('campaignId'));if(!id.success)return json({error:'Choose a campaign.'},400);
 try{return json({keys:(await listBridgeKeys(getBucket(),owner,id.data)).map(publicKey)});}
 catch{return json({error:'Could not load the bridge keys.'},400);}
}
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const raw=await request.text();if(raw.length>4000)return json({error:'Request too large'},413);
  const args=z.object({campaignId,action:z.enum(['create','update','revoke']),id:z.string().max(100).optional(),name:z.string().max(200).optional(),client:z.string().max(20).optional(),sync:z.record(z.string().max(20),z.string().max(10)).optional()}).parse(JSON.parse(raw));
  const bucket=getBucket();
  if(args.action==='create'){
   const {data}=await new EncyclopediaStore(bucket).read(owner);
   if(!data.campaigns.some(c=>c.id===args.campaignId))throw Error('Save this campaign first.');
   return json(await createBridgeKey(bucket,owner,args.campaignId,{name:args.name,client:args.client,sync:args.sync}));
  }
  if(args.action==='update')return json({bridge:await updateBridgeKey(bucket,owner,args.campaignId,args.id,{name:args.name,sync:args.sync})});
  return json({revoked:await revokeBridgeKey(bucket,owner,args.campaignId,args.id)});
 }catch(e){return json({error:e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Could not update the bridge key.'},400);}
}
