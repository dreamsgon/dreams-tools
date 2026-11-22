import {NextRequest,NextResponse} from "next/server";
import {getAppUser} from "@/lib/app-user";
import {createServerClient} from "@supabase/ssr";
import {z} from "zod";
import {supabaseUrl,supabaseKey,rememberCookie,sessionCookieOptions} from "@/lib/supabase-config";
const input=z.object({
  action:z.enum(["signup","login","reset","password","logout","logout-all","profile","change-password","email","resend-email","uploads"]),
  email:z.string().email().max(254).optional(),password:z.string().min(12).max(128).optional(),
  currentPassword:z.string().min(1).max(128).optional(),
  username:z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/).optional(),
  // Letters, numbers, spaces and punctuation from any language; no control characters.
  displayName:z.string().max(80).transform(s=>s.normalize("NFC").replace(/\s+/g," ").trim()).pipe(z.string().min(1).max(40).regex(/^[^\p{C}]+$/u)).optional(),
  remember:z.boolean().optional(),
  webpUploads:z.boolean().optional(),
}).strict();
type Input=z.infer<typeof input>;
const fail=(message:string)=>Object.assign(Error(message),{shown:true});
export async function POST(request:NextRequest){
  if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Invalid request origin."},{status:403});
  const response=NextResponse.json({ok:true});response.headers.set("Cache-Control","private, no-store");
  let data:Input|undefined,action:unknown;
  try {
    const raw=await request.text();if(raw.length>4096)throw Error("Request too large.");
    const body=JSON.parse(raw) as {action?:unknown}|null;action=body?.action;
    data=input.parse(body);
    const remember=data.remember??request.cookies.get(rememberCookie)?.value==="1";
    const client=createServerClient(supabaseUrl,supabaseKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll(values){values.forEach(({name,value,options})=>response.cookies.set(name,value,sessionCookieOptions(options,remember,request.nextUrl.protocol==="https:")));}}});
    /** The signed-in, verified user, for changes to one's own account. */
    const signedIn=async()=>{const verified=await client.auth.getUser();if(verified.error||!verified.data.user?.email_confirmed_at||!verified.data.user.email)throw fail("Sign in again to change your account.");return verified.data.user;};
    /** Checks the current password on a throwaway client, so the browser's session is untouched, then ends that check's session. */
    const confirmPassword=async(email:string)=>{
      if(!data?.currentPassword)throw fail("Enter your current password.");
      const check=createServerClient(supabaseUrl,supabaseKey,{cookies:{getAll:()=>[],setAll:()=>{}}});
      const {error}=await check.auth.signInWithPassword({email,password:data.currentPassword});
      if(error)throw fail("Your current password is not correct.");
      await check.auth.signOut({scope:"local"}).catch(()=>{});
    };
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
    }else if(data.action==="profile"){
      if(!data.displayName)throw fail("Enter a display name of 1 to 40 characters.");
      await signedIn();
      ({error}=await client.auth.updateUser({data:{display_name:data.displayName}}));
    }else if(data.action==="uploads"){
      if(typeof data.webpUploads!=="boolean")throw fail("Choose whether pictures become WebP.");
      await signedIn();
      ({error}=await client.auth.updateUser({data:{webp_uploads:data.webpUploads}}));
    }else if(data.action==="change-password"){
      if(!data.password)throw fail("Choose a new password of 12 to 128 characters.");
      const user=await signedIn();await confirmPassword(user.email!);
      if(data.password===data.currentPassword)throw fail("Choose a password different from your current one.");
      ({error}=await client.auth.updateUser({password:data.password}));
    }else if(data.action==="email"){
      if(!data.email)throw fail("Enter your new email address.");
      const user=await signedIn();
      if(data.email.toLowerCase()===user.email!.toLowerCase())throw fail("That is already your sign-in email.");
      await confirmPassword(user.email!);
      // Supabase sends the confirmation link; the address changes only once it is opened.
      ({error}=await client.auth.updateUser({email:data.email},{emailRedirectTo:request.nextUrl.origin+"/auth/finish?changed=email"}));
    }else if(data.action==="resend-email"){
      const user=await signedIn();if(!user.new_email)throw fail("There is no email change waiting for confirmation.");
      ({error}=await client.auth.resend({type:"email_change",email:user.new_email,options:{emailRedirectTo:request.nextUrl.origin+"/auth/finish?changed=email"}}));
    }else {({error}=await client.auth.signOut({scope:data.action==="logout-all"?"global":"local"}));}
    if(error){
      // Do not expose whether an email already exists.
      const message=data.action==="login"?"Could not sign in. Check your email, password and verification email.":data.action==="change-password"?"The new password was not accepted. Try a longer or less common one.":"The request could not be completed. Please try again later. Email delivery may not be configured yet.";
      return NextResponse.json({error:message},{status:400,headers:{"Cache-Control":"private, no-store"}});
    }
    if(["login","signup"].includes(data.action))response.cookies.set(rememberCookie,remember?"1":"0",{httpOnly:true,secure:request.nextUrl.protocol==="https:",sameSite:"lax",path:"/",...(remember?{maxAge:60*60*24*365}:{})});
    if(data.action==="logout"||data.action==="logout-all")response.cookies.set(rememberCookie,"",{maxAge:0,path:"/"});
    return response;
  }catch(e){
    const message=(e as {shown?:boolean}).shown?(e as Error).message:action==="profile"?"Display names need 1 to 40 characters, without control characters.":"Check the form fields. Passwords need 12–128 characters; usernames need 3–32 letters, numbers, underscores or hyphens.";
    return NextResponse.json({error:message},{status:400,headers:{"Cache-Control":"private, no-store"}});
  }
}
/** The signed-in person's name, masked-ready email, picture version and upload format choice, for the account menu on pages rendered in the browser. */
export async function GET(){
  const user=await getAppUser();
  const headers={"Cache-Control":"private, no-store"};
  if(!user)return NextResponse.json({signedIn:false},{headers});
  return NextResponse.json({signedIn:true,name:user.displayName,email:user.email,avatar:user.avatar,webpUploads:user.webpUploads},{headers});
}
