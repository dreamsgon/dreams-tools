import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {EncyclopediaStore} from '@/lib/encyclopedia/store';
import {getBucket} from '@/lib/storage';
import {publicActivity,readActivity,undoChanges,updateActivity} from '@/lib/mcp/activity';
import {listConnections} from '@/lib/mcp/connections';
export const dynamic='force-dynamic';
const campaignId=z.string().min(1).max(100);
const ACTIVE_MS=15*60_000;
// The signed-in GM's AI activity log for one campaign, and which AI app is connected right now.
export async function GET(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 const id=campaignId.safeParse(new URL(request.url).searchParams.get('campaignId'));if(!id.success)return json({error:'Choose a campaign.'},400);
 try{
  const bucket=getBucket(),[log,connections]=await Promise.all([readActivity(bucket,owner,id.data),listConnections(bucket,owner,id.data)]);
  const now=Date.now(),active=connections.filter(c=>c.lastUsedAt&&now-Date.parse(c.lastUsedAt)<ACTIVE_MS).sort((a,b)=>b.lastUsedAt!.localeCompare(a.lastUsedAt!));
  return json({...publicActivity(log),connected:active.map(c=>c.name),hasConnections:connections.length>0});
 }catch{return json({error:'Could not load the AI activity.'},400);}
}
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const raw=await request.text();if(raw.length>2000)return json({error:'Request too large'},413);
  const args=z.object({campaignId,action:z.enum(['undo','pause','resume']),id:z.string().max(100).optional()}).parse(JSON.parse(raw));
  const bucket=getBucket();
  if(args.action!=='undo'){
   const log=await updateActivity(bucket,owner,args.campaignId,l=>({...l,paused:args.action==='pause'}));
   return json(publicActivity(log));
  }
  const entry=(await readActivity(bucket,owner,args.campaignId)).entries.find(e=>e.id===args.id);
  if(!entry?.changes?.length)throw Error('There is nothing to undo for that line.');
  if(entry.undone)throw Error('That change was already undone.');
  const store=new EncyclopediaStore(bucket);
  for(let attempt=0;attempt<4;attempt++){
   const {data,revision}=await store.read(owner),{next,kept}=undoChanges(data,entry.changes);
   if(kept.length===entry.changes.length)throw Error(`Not undone: ${kept.join(', ')} changed again since. Undo it by hand.`);
   if(await store.save(owner,next,revision)===null)continue;
   const log=await updateActivity(bucket,owner,args.campaignId,l=>({...l,entries:l.entries.map(e=>e.id===entry.id?{...e,undone:new Date().toISOString()}:e)}));
   return json({...publicActivity(log),kept});
  }
  throw Error('The campaign kept changing. Try again.');
 }catch(e){return json({error:e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Could not do that.'},400);}
}
