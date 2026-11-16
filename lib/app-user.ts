import {cookies} from "next/headers";
import {createServerClient} from "@supabase/ssr";
import {supabaseUrl,supabaseKey} from "./supabase-config";
/** The name others see: a chosen display name, else the registration username, else the email. */
export function profileName(meta:Record<string,unknown>|undefined,email:string|undefined){
  const pick=(v:unknown)=>typeof v==="string"&&v.trim()?v.trim():"";
  return (pick(meta?.display_name)||pick(meta?.username)||email||"Player").slice(0,80);
}
export async function getAppUser() {
  const jar=await cookies();
  if(jar.getAll().some(c=>c.name.startsWith("sb-"))) {
    const client=createServerClient(supabaseUrl,supabaseKey,{cookies:{getAll:()=>jar.getAll(),setAll:()=>{}}});
    const {data,error}=await client.auth.getUser();
    if(!error && data.user?.email_confirmed_at) {
      const user=data.user,meta=user.user_metadata??{};
      return {
        userId:`supabase:${user.id}`,email:user.email??"",displayName:profileName(meta,user.email),provider:"email" as const,
        username:typeof meta.username==="string"?meta.username:"",
        /** Avatar version (upload time), or "" when there is no picture. Busts the browser cache on change. */
        avatar:typeof meta.avatar==="string"&&/^\d{1,16}$/.test(meta.avatar)?meta.avatar:"",
        /** An email change waiting for its confirmation link. */
        pendingEmail:typeof user.new_email==="string"?user.new_email:"",
      };
    }
  }
  return null;
}
