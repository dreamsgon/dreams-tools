import {ownerFrom,sameOrigin,json} from '@/lib/encyclopedia/workspace-server';
import {EncyclopediaStore} from '@/lib/encyclopedia/store';
import {getBucket} from '@/lib/storage';
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const raw=await request.text();if(raw.length>2000)throw Error('Request too large');
  const {campaignId,action}=JSON.parse(raw);
  if(typeof campaignId!=='string'||campaignId.length>100||!['create','revoke'].includes(action))throw Error('Invalid campaign or action');
  const store=new EncyclopediaStore(getBucket());
  if(action==='revoke'){await store.revokeLink(owner,campaignId,'agent');return json({revoked:true});}
  return json({key:'enc_'+await store.createLink(owner,campaignId,'agent')});
 }catch{return json({error:'Could not update agent access. Save the campaign first and retry.'},400);}
}
