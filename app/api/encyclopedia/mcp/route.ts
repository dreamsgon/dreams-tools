import {getBucket} from '@/lib/storage';
import {storedJson} from '@/lib/transfers';
import {EncyclopediaStore,encyclopediaPrefix} from '@/lib/encyclopedia/store';
import {campaignExport} from '@/lib/encyclopedia/world-model';
import {callReadTool,mcpTools} from '@/lib/encyclopedia/mcp';
import {json} from '@/lib/encyclopedia/workspace-server';
export async function POST(request:Request){
 const token=request.headers.get('authorization')?.match(/^Bearer enc_([a-f0-9]{64})$/)?.[1];
 if(!token)return json({error:'An encyclopedia campaign key is required.'},401);
 try{
  const bucket=getBucket(),store=new EncyclopediaStore(bucket),grant=await store.grant(token,'agent');
  if(!grant)return json({error:'Campaign key is invalid or revoked.'},401);
  const raw=await request.text();if(raw.length>16000)return json({error:'Request too large'},413);
  const body=JSON.parse(raw),id=body.id??null;
  if(body.jsonrpc!=='2.0'||typeof body.method!=='string')return json({error:'Invalid JSON-RPC request'},400);
  const result=(value:unknown)=>storedJson(bucket,encyclopediaPrefix(grant.owner),{jsonrpc:'2.0',id,result:value});
  if(body.method==='initialize')return result({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'rpg-encyclopedia',version:'1.0.0'}});
  if(body.method==='notifications/initialized')return new Response(null,{status:204});
  if(body.method==='ping')return result({});
  if(body.method==='tools/list')return result({tools:mcpTools});
  if(body.method!=='tools/call')return json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
  const {data}=await store.read(grant.owner);
  // The key is read-only and cannot select a different campaign, even in list_worlds.
  const scoped=campaignExport(data,grant.campaignId);
  try{return result({content:[{type:'text',text:JSON.stringify(callReadTool(scoped,body.params?.name,body.params?.arguments??{}))}],isError:false});}
  catch(error){return result({content:[{type:'text',text:error instanceof Error?error.message:'Read failed'}],isError:true});}
 }catch{return json({error:'Encyclopedia request failed.'},400);}
}
