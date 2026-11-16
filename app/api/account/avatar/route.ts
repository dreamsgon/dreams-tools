import {NextRequest} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {context,failure,privateHeaders} from "@/lib/server";
import {supabaseUrl,supabaseKey} from "@/lib/supabase-config";
import {AVATAR_MAX_BYTES,avatarKey,avatarType} from "@/lib/avatar";
/** Your own profile picture, kept in your private storage. GET loads it, PUT replaces it, DELETE removes it. */
export async function GET(){
  try{
    const {bucket,prefix}=await context(),key=avatarKey(prefix);
    if(!await bucket.head(key))return new Response("Not found",{status:404,headers:privateHeaders});
    return new Response(null,{status:302,headers:{...privateHeaders,Location:await bucket.signedGet(key),"Referrer-Policy":"no-referrer"}});
  }catch(e){return failure(e);}
}
/** Records the picture's version on the account, so every page knows whether there is one without a storage read. */
async function setVersion(request:NextRequest,version:string|null){
  const client=createServerClient(supabaseUrl,supabaseKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll:()=>{}}});
  const {error}=await client.auth.updateUser({data:{avatar:version}});
  if(error)throw Error("The picture was saved, but your profile could not be updated. Try again.");
}
export async function PUT(request:NextRequest){
  try{
    const {bucket,prefix}=await context(request);
    const declared=Number(request.headers.get("content-length")||0);
    if(declared>AVATAR_MAX_BYTES)throw Error("Pictures must be under 200 KB after resizing.");
    const bytes=new Uint8Array(await request.arrayBuffer());
    if(!bytes.length||bytes.length>AVATAR_MAX_BYTES)throw Error("Pictures must be under 200 KB after resizing.");
    const type=avatarType(bytes);if(!type)throw Error("Use a PNG, JPG or WebP picture.");
    await bucket.put(avatarKey(prefix),bytes,{httpMetadata:{contentType:type}});
    const version=String(Date.now());await setVersion(request,version);
    return Response.json({ok:true,avatar:version},{headers:privateHeaders});
  }catch(e){return failure(e);}
}
export async function DELETE(request:NextRequest){
  try{
    const {bucket,prefix}=await context(request);
    await bucket.delete(avatarKey(prefix));await setVersion(request,null);
    return Response.json({ok:true,avatar:""},{headers:privateHeaders});
  }catch(e){return failure(e);}
}
