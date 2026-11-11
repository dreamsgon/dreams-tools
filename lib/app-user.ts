import {cookies} from "next/headers";
import {createServerClient} from "@supabase/ssr";
import {supabaseUrl,supabaseKey} from "./supabase-config";
export async function getAppUser() {
  const jar=await cookies();
  if(jar.getAll().some(c=>c.name.startsWith("sb-"))) {
    const client=createServerClient(supabaseUrl,supabaseKey,{cookies:{getAll:()=>jar.getAll(),setAll:()=>{}}});
    const {data,error}=await client.auth.getUser();
    if(!error && data.user?.email_confirmed_at) {
      const user=data.user;
      return {userId:`supabase:${user.id}`,email:user.email??"",displayName:String(user.user_metadata.username??user.email??"Player").slice(0,80),provider:"email" as const};
    }
  }
  return null;
}
