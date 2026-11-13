import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {EncyclopediaStore} from '@/lib/encyclopedia/store';
import {getBucket} from '@/lib/storage';
import {publicActivity,readActivity,undoChanges,updateActivity} from '@/lib/mcp/activity';
import {listConnections} from '@/lib/mcp/connections';
import {undoTable} from '@/lib/mcp/table';
import {loadWorkspace,saveWorkspace} from '@/lib/workspace-storage';
import {decideSuggestion} from '@/lib/mcp/suggestions';
import {campaignFor} from '@/lib/mcp/campaign-for';
import {providerOf} from '@/lib/ai/providers';
export const dynamic='force-dynamic';
const campaignId=z.string().min(1).max(100);
const ACTIVE_MS=15*60_000;
// The signed-in GM's AI activity log for one campaign, and which AI app is connected right now.
export async function GET(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 const params=new URL(request.url).searchParams;if(!params.get('campaignId')&&!params.get('maptableCampaignId'))return json({error:'Choose a campaign.'},400);
 try{
  const bucket=getBucket(),id=await campaignFor(bucket,owner,{campaignId:params.get('campaignId'),maptableCampaignId:params.get('maptableCampaignId')});
  if(!id)return json({paused:false,entries:[],connected:[],hasConnections:false});
  const [log,connections]=await Promise.all([readActivity(bucket,owner,id),listConnections(bucket,owner,id)]);
  const now=Date.now(),active=connections.filter(c=>c.lastUsedAt&&now-Date.parse(c.lastUsedAt)<ACTIVE_MS).sort((a,b)=>b.lastUsedAt!.localeCompare(a.lastUsedAt!));
  // Connections made with an API key can be asked from the panel.
  const chat=connections.flatMap(c=>c.api?[{id:c.id,name:c.name,provider:providerOf(c.api.provider).name,model:c.api.model}]:[]);
  return json({...publicActivity(log),connected:active.map(c=>c.name),hasConnections:connections.length>0,chat});
 }catch{return json({error:'Could not load the AI activity.'},400);}
}
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const raw=await request.text();if(raw.length>12000)return json({error:'Request too large'},413);
  const input=z.object({campaignId:campaignId.optional(),maptableCampaignId:campaignId.optional(),action:z.enum(['undo','pause','resume','approve','skip','approveAll']),id:z.string().max(100).optional(),args:z.record(z.string().max(40),z.unknown()).optional()}).parse(JSON.parse(raw));
  const bucket=getBucket(),found=await campaignFor(bucket,owner,input);if(!found)throw Error('This map has no Encyclopedia campaign paired with it.');
  const args={...input,campaignId:found};
  // Suggestions from a helper AI: run it (as suggested or as the GM changed it), or drop it.
  if(args.action==='approve'||args.action==='skip'){
   const done=await decideSuggestion(bucket,owner,args.campaignId,args.id,args.action,args.args);
   return json({...publicActivity(await readActivity(bucket,owner,args.campaignId)),done});
  }
  if(args.action==='approveAll'){
   const waiting=(await readActivity(bucket,owner,args.campaignId)).entries.filter(e=>e.waiting&&!e.decided).reverse(),problems:string[]=[];
   for(const e of waiting)try{await decideSuggestion(bucket,owner,args.campaignId,e.id,'approve');}catch(x){problems.push(`${e.summary}: ${x instanceof Error?x.message:'failed'}`);}
   return json({...publicActivity(await readActivity(bucket,owner,args.campaignId)),...(problems.length?{problems}:{})});
  }
  if(args.action!=='undo'){
   const log=await updateActivity(bucket,owner,args.campaignId,l=>({...l,paused:args.action==='pause'}));
   return json(publicActivity(log));
  }
  const entry=(await readActivity(bucket,owner,args.campaignId)).entries.find(e=>e.id===args.id);
  if(!entry?.changes?.length&&!entry?.table?.length)throw Error('There is nothing to undo for that line.');
  if(entry.undone)throw Error('That change was already undone.');
  const kept:string[]=[];let done=false,any=false;
  if(entry.changes?.length){
   const store=new EncyclopediaStore(bucket);
   for(let attempt=0;attempt<4&&!done;attempt++){
    const {data,revision}=await store.read(owner),undo=undoChanges(data,entry.changes);
    if(undo.kept.length===entry.changes.length){kept.push(...undo.kept);done=true;break;}
    if(await store.save(owner,undo.next,revision)!==null){kept.push(...undo.kept);done=true;any=true;}
   }
   if(!done)throw Error('The campaign kept changing. Try again.');
  }
  if(entry.table?.length){
   const prefix=`users/${encodeURIComponent(owner)}/`;done=false;
   for(let attempt=0;attempt<4&&!done;attempt++){
    const stored=await loadWorkspace(bucket,prefix);if(!stored)throw Error('The map is gone.');
    const undo=undoTable(stored.workspace,entry.table);
    if(undo.kept.length===entry.table.length){kept.push(...undo.kept);done=true;break;}
    if(await saveWorkspace(bucket,prefix,undo.next,stored.revision)!==null){kept.push(...undo.kept);done=true;any=true;}
   }
   if(!done)throw Error('The table kept changing. Try again.');
  }
  if(!any)throw Error(`Not undone: ${kept.join(', ')} changed again since. Undo it by hand.`);
  const log=await updateActivity(bucket,owner,args.campaignId,l=>({...l,entries:l.entries.map(e=>e.id===entry.id?{...e,undone:new Date().toISOString()}:e)}));
  return json({...publicActivity(log),kept});
 }catch(e){return json({error:e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Could not do that.'},400);}
}
