import {loadWorkspace} from "@/lib/workspace-storage";
import {context,failure,privateHeaders} from "@/lib/server";
import {requireCampaign} from "@/lib/campaign-settings";
import {agentKeyHash} from "@/lib/agent-auth";
export async function GET(request:Request){try{
 const {bucket,prefix}=await context();const campaignId=new URL(request.url).searchParams.get("campaignId");
 const workspace=await loadWorkspace(bucket,prefix);if(!workspace)throw new Error("Save the campaign first.");
 const id=requireCampaign(workspace.workspace,campaignId);
 const record=await bucket.get(`${prefix}agent-access/${encodeURIComponent(id)}.json`);
 const access=record?await record.json<{mode:string}>():null;
 return Response.json({mode:access?.mode??"off"},{headers:privateHeaders});
}catch(e){return failure(e);}}
export async function PUT(request:Request){try{
 const {bucket,prefix}=await context(request);const {campaignId,mode}=await request.json() as {campaignId:unknown;mode:unknown};
 if(!["off","read","edit"].includes(String(mode)))throw new Error("Choose a valid access mode.");
 const workspace=await loadWorkspace(bucket,prefix);if(!workspace)throw new Error("Save the campaign first.");
 const id=requireCampaign(workspace.workspace,campaignId),path=`${prefix}agent-access/${encodeURIComponent(id)}.json`;
 const previous=await bucket.get(path),old=previous?await previous.json<{hash:string}>():null;
 if(mode==="off"){await bucket.delete(path);if(old)await bucket.delete(`agent-keys/${old.hash}.json`);return Response.json({mode},{headers:privateHeaders});}
 const key="mt_"+Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");const hash=await agentKeyHash(key);
 await bucket.put(`agent-keys/${hash}.json`,JSON.stringify({prefix,campaignId:id,mode}));
 await bucket.put(path,JSON.stringify({hash,mode}));if(old)await bucket.delete(`agent-keys/${old.hash}.json`);
 return Response.json({mode,key},{headers:privateHeaders});
}catch(e){return failure(e);}}

