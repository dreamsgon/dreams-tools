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
  // Refresh the session cookies. getClaims() renews an expired access token and checks the JWT against the project's
  // cached signing keys, so a signed-in request no longer waits on two Supabase Auth round trips (it falls back to one
  // getUser() call for projects still on a shared JWT secret).
  // Identity is verified once, with Supabase Auth, by getAppUser() in each protected page and API route.
  try {await client.auth.getClaims();}catch {/* Protected routes independently verify identity. */}
  return response;
}
export const config={matcher:["/","/maptable/:path*","/encyclopedia/:path*","/account/:path*","/auth/:path*","/api/:path*"]};

