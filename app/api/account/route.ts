import {NextRequest,NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";
import {z} from "zod";
import {supabaseUrl,supabaseKey,rememberCookie,sessionCookieOptions} from "@/lib/supabase-config";
const input=z.object({action:z.enum(["signup","login","reset","password","logout"]),email:z.string().email().max(254).optional(),password:z.string().min(12).max(128).optional(),username:z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/).optional(),remember:z.boolean().optional()}).strict();
export async function POST(request:NextRequest){
  if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Invalid request origin."},{status:403});
  const response=NextResponse.json({ok:true});response.headers.set("Cache-Control","private, no-store");
  try {
    const raw=await request.text();if(raw.length>4096)throw Error("Request too large.");
    const data=input.parse(JSON.parse(raw));
    const remember=data.remember??request.cookies.get(rememberCookie)?.value==="1";
    const client=createServerClient(supabaseUrl,supabaseKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll(values){values.forEach(({name,value,options})=>response.cookies.set(name,value,sessionCookieOptions(options,remember,request.nextUrl.protocol==="https:")));}}});
    let error;
    if(data.action==="signup"){
      if(!data.email||!data.password||!data.username)throw Error("Enter email, username and a password of at least 12 characters.");
      ({error}=await client.auth.signUp({email:data.email,password:data.password,options:{data:{username:data.username},emailRedirectTo:request.nextUrl.origin+"/auth/finish"}}));
    }else if(data.action==="login"){
      if(!data.email||!data.password)throw Error("Enter your email and password.");
      ({error}=await client.auth.signInWithPassword({email:data.email,password:data.password}));
    }else if(data.action==="reset"){
      if(!data.email)throw Error("Enter your email address.");
      ({error}=await client.auth.resetPasswordForEmail(data.email,{redirectTo:request.nextUrl.origin+"/auth/finish?recovery=1"}));
    }else if(data.action==="password"){
      if(!data.password)throw Error("Enter a password of at least 12 characters.");
      const verified=await client.auth.getUser();if(verified.error||!verified.data.user)throw Error("Open a valid password reset link first.");
      ({error}=await client.auth.updateUser({password:data.password}));
    }else {({error}=await client.auth.signOut({scope:"local"}));}
    if(error){
      // Do not expose whether an email already exists.
      const message=data.action==="login"?"Could not sign in. Check your email, password and verification email.":"The request could not be completed. Please try again later. Email delivery may not be configured yet.";
      return NextResponse.json({error:message},{status:400,headers:{"Cache-Control":"private, no-store"}});
    }
    if(["login","signup"].includes(data.action))response.cookies.set(rememberCookie,remember?"1":"0",{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/",...(remember?{maxAge:60*60*24*365}:{})});
    if(data.action==="logout")response.cookies.set(rememberCookie,"",{maxAge:0,path:"/"});
    return response;
  }catch{return NextResponse.json({error:"Check the form fields. Passwords need 12–128 characters; usernames need 3–32 letters, numbers, underscores or hyphens."},{status:400,headers:{"Cache-Control":"private, no-store"}});}
}

