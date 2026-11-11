import {NextRequest,NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {supabaseUrl,supabaseKey,rememberCookie,sessionCookieOptions} from "@/lib/supabase-config";
export async function GET(request:NextRequest){
  const recovery=request.nextUrl.searchParams.get("recovery")==="1";
  const response=NextResponse.redirect(new URL(recovery?"/account?mode=password":"/maptable",request.url));
  response.headers.set("Cache-Control","private, no-store");response.headers.set("Referrer-Policy","no-referrer");
  const client=createServerClient(supabaseUrl,supabaseKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll(values){values.forEach(({name,value,options})=>response.cookies.set(name,value,sessionCookieOptions(options,request.cookies.get(rememberCookie)?.value==="1",request.nextUrl.protocol==="https:")));}}});
  const code=request.nextUrl.searchParams.get("code");
  if(code){const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return response;}
  return NextResponse.redirect(new URL("/account?error=link",request.url));
}
