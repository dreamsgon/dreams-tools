import { getBucket } from "./storage";
export type AgentGrant={prefix:string;campaignId:string;mode:"read"|"edit"};
export async function agentKeyHash(key:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,"0")).join("");}
export async function agentContext(request:Request){
  const key=request.headers.get("authorization")?.match(/^Bearer (mt_[a-f0-9]{64})$/)?.[1];
  if(!key)throw new Error("Unauthorized");
  const bucket=getBucket();
  const hash=await agentKeyHash(key);
  const stored=await bucket.get(`agent-keys/${hash}.json`);
  if(!stored)throw new Error("Unauthorized");
  const grant=await stored.json<AgentGrant>();
  const settings=await bucket.get(`${grant.prefix}agent-access/${encodeURIComponent(grant.campaignId)}.json`);
  const current=settings?await settings.json<{hash:string;mode:string}>():null;
  if(current?.hash!==hash||current.mode!==grant.mode)throw new Error("Unauthorized");
  return {bucket:bucket,...grant};
}
