import {NextResponse,type NextRequest} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {supabaseUrl,supabaseKey,rememberCookie,sessionCookieOptions} from "./lib/supabase-config";
export async function proxy(request:NextRequest) {
  let response=NextResponse.next({request});
  response.headers.set("Cache-Control","private, no-store");
  if(!request.cookies.getAll().some(c=>c.name.startsWith("sb-")))return response;
  const client=createServerClient(supabaseUrl,supabaseKey,{cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll(values,cacheHeaders){
      values.forEach(({name,value})=>request.cookies.set(name,value));
      response=NextResponse.next({request});
      values.forEach(({name,value,options})=>response.cookies.set(name,value,sessionCookieOptions(options,request.cookies.get(rememberCookie)?.value==="1",request.nextUrl.protocol==="https:")));
      Object.entries(cacheHeaders).forEach(([name,value])=>response.headers.set(name,value));
      response.headers.set("Cache-Control","private, no-store");
    }
  }});
  try {await client.auth.getUser();}catch {/* Protected routes independently verify identity. */}
  return response;
}
export const config={matcher:["/","/maptable/:path*","/encyclopedia/:path*","/account/:path*","/auth/:path*","/api/:path*"]};

