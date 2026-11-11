import {loadWorkspace} from "@/lib/workspace-storage";
import {agentContext} from "@/lib/agent-auth";
import {campaignAssets} from "@/lib/agent-maps";
import {failure,privateHeaders} from "@/lib/server";
import {s3Request,s3SignedGet} from "@/lib/s3";
export async function GET(request:Request){try{
 const {bucket,prefix,campaignId}=await agentContext(request),stored=await loadWorkspace(bucket,prefix);
 if(!stored)throw new Error("Campaign is unavailable.");
 const id=new URL(request.url).searchParams.get("id"),asset=campaignAssets(stored.workspace,campaignId).find(a=>a.id===id);
 if(!asset)throw new Error("Image is outside this campaign.");
 const url=new URL(asset.src,"https://maptable.local");let signedUrl:string;let type:string;
 if(asset.src.startsWith("/api/assets?")){
  const imageId=url.searchParams.get("id");if(!imageId||! /^[a-f0-9-]{36}$/.test(imageId))throw new Error("Invalid image ID.");
  const image=await bucket.head(prefix+"images/"+imageId);if(!image)return new Response("Not found",{status:404});signedUrl=await bucket.signedGet(prefix+"images/"+imageId);type=image.httpMetadata?.contentType??"image/png";
 }else if(asset.src.startsWith("/api/s3?")){
  const image=await s3Request(url.searchParams.get("key")??"",prefix,{method:"HEAD"});if(!image.ok)throw new Error("Image unavailable.");signedUrl=await s3SignedGet(url.searchParams.get("key")??"",prefix);type=image.headers.get("content-type")??"";
 }else{return Response.json({url:asset.src,instructions:"Public external image. Fetch without the Maptable Authorization header."},{headers:privateHeaders});}
 if(!/^image\/(png|jpeg|webp)$/.test(type.split(";")[0]))throw new Error("Unsupported image type.");
 return Response.json({url:signedUrl,instructions:"Temporary image URL. Fetch without the Maptable Authorization header."},{headers:privateHeaders});
}catch(e){return failure(e);}}

