import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {z} from 'zod';
import {NextRequest,NextResponse} from 'next/server.js';
import {sessionCookieOptions,rememberCookie,supabaseUrl,supabaseKey} from '../lib/supabase-config.ts';
const compile=async path=>ts.transpileModule((await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('export ','');
test('remembered cookies persist; session cookies expire on browser close; deletion remains explicit',()=>{
 const opts={maxAge:123,expires:new Date(),sameSite:'none'};
 const persistent=sessionCookieOptions(opts,true,true);assert.equal(persistent.maxAge,123);assert.equal(persistent.httpOnly,true);assert.equal(persistent.secure,true);assert.equal(persistent.sameSite,'lax');
 const session=sessionCookieOptions(opts,false,true);assert.equal(session.maxAge,undefined);assert.equal(session.expires,undefined);
 assert.equal(sessionCookieOptions({maxAge:0},false,true).maxAge,0);
});
const userCode=await compile('../lib/app-user.ts');
const getUser=({result,chat=null,cookie=true})=>new Function('cookies','createServerClient','getChatGPTUser','supabaseUrl','supabaseKey',userCode+';return getAppUser;')(async()=>({getAll:()=>cookie?[{name:'sb-test',value:'untrusted'}]:[]}),()=>({auth:{getUser:async()=>result}}),async()=>chat,supabaseUrl,supabaseKey)();
test('WebP uploads are on unless the account turned them off',async()=>{
 const user=meta=>({data:{user:{id:'id1',email:'a@example.com',email_confirmed_at:'now',user_metadata:meta}},error:null});
 assert.equal((await getUser({result:user({})})).webpUploads,true);
 assert.equal((await getUser({result:user({webp_uploads:false})})).webpUploads,false);
 assert.equal((await getUser({result:user({webp_uploads:'false'})})).webpUploads,true);
});
test('identity comes from verified Supabase user and is namespaced, never from matching email',async()=>{
 const result={data:{user:{id:'id1',email:'same@example.com',email_confirmed_at:'now',user_metadata:{username:'Hero'}}},error:null};
 const user=await getUser({result,chat:{userId:'chat1',email:'same@example.com'}});assert.equal(user.userId,'supabase:id1');assert.equal(user.displayName,'Hero');
 assert.equal(await getUser({result:{data:{user:null},error:{message:'bad'}}}),null);
 assert.equal(await getUser({result:{data:{user:{...result.data.user,email_confirmed_at:null}},error:null}}),null);
 assert.equal(await getUser({result,cookie:false,chat:{userId:'forged-header-user'}}),null);
});
const routeCode=await compile('../app/api/account/route.ts');
function route(auth){return new Function('NextResponse','createServerClient','z','supabaseUrl','supabaseKey','rememberCookie','sessionCookieOptions',routeCode+';return POST;')(NextResponse,()=>({auth}),z,supabaseUrl,supabaseKey,rememberCookie,sessionCookieOptions);}
const req=(body,origin='https://rpg.test')=>new NextRequest('https://rpg.test/api/account',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('account writes reject cross-origin requests and invalid signup before provider calls',async()=>{
 const post=route({signUp:()=>{throw Error('must not call');}});
 assert.equal((await post(req({action:'signup'},'https://evil.test'))).status,403);
 assert.equal((await post(req({action:'signup',email:'a@example.com',username:'bad spaces',password:'short'}))).status,400);
});
test('signup sets fixed callback and username; reset does not disclose existence',async()=>{
 let input;const post=route({signUp:async args=>{input=args;return {error:null};},resetPasswordForEmail:async()=>({error:null})});
 const response=await post(req({action:'signup',email:'a@example.com',password:'long-test-password',username:'Hero',remember:true}));assert.equal(response.status,200);assert.equal(input.options.emailRedirectTo,'https://rpg.test/auth/finish');assert.equal(input.options.data.username,'Hero');assert.match(response.headers.get('set-cookie'),/rpg-remember=1/);
 assert.deepEqual(await (await post(req({action:'reset',email:'unknown@example.com'}))).json(),{ok:true});
});
test('password changes need verified Supabase identity',async()=>{
 const post=route({getUser:async()=>({error:{},data:{user:null}}),updateUser:()=>{throw Error('must not call');}});
 assert.equal((await post(req({action:'password',password:'long-test-password'}))).status,400);
});
test('the proxy refreshes session cookies without a second Supabase identity call',async()=>{
 const code=await compile('../proxy.ts');
 const run=async(cookies,auth)=>{let made=0;const proxy=new Function('NextResponse','createServerClient','supabaseUrl','supabaseKey','rememberCookie','sessionCookieOptions',code+';return proxy;')(NextResponse,(url,key,{cookies:jar})=>{made++;return {auth:auth(jar)};},supabaseUrl,supabaseKey,rememberCookie,sessionCookieOptions);
  const request=new NextRequest('https://tools.example/maptable',{headers:{cookie:cookies}});return {response:await proxy(request),made};};
 const signedOut=await run('',()=>({}));assert.equal(signedOut.made,0);assert.equal(signedOut.response.headers.get('cache-control'),'private, no-store');
 let sessions=0;
 const fresh=await run('sb-test-auth-token=old',jar=>({getUser:()=>{throw Error('identity is verified by getAppUser, not the proxy');},getClaims:async()=>{sessions++;jar.setAll([{name:'sb-test-auth-token',value:'renewed',options:{maxAge:60}}],{});return {data:null,error:null};}}));
 assert.equal(sessions,1);assert.equal(fresh.response.cookies.get('sb-test-auth-token')?.value,'renewed');assert.equal(fresh.response.headers.get('cache-control'),'private, no-store');
});
// Account settings: display name, avatar, email and password changes.
const verifiedUser={id:'id1',email:'old@example.com',email_confirmed_at:'now',user_metadata:{username:'Hero'}};
/** A route whose throwaway password-check client answers `checkResult`; the session client records updateUser calls. */
function settingsRoute({checkResult={error:null},user=verifiedUser,updates=[],checks=[]}={}){
 let made=0;
 return new Function('NextResponse','createServerClient','z','supabaseUrl','supabaseKey','rememberCookie','sessionCookieOptions',routeCode+';return POST;')(NextResponse,(url,key,{cookies})=>{
  made++;const throwaway=cookies.getAll().length===0&&made>1;
  return {auth:throwaway?{signInWithPassword:async args=>{checks.push(args);return checkResult;},signOut:async()=>({error:null})}:{getUser:async()=>({data:{user},error:null}),updateUser:async(...args)=>{updates.push(args);return {error:null};},resend:async args=>{updates.push(['resend',args]);return {error:null};},signOut:async args=>{updates.push(['signOut',args]);return {error:null};}}};
 },z,supabaseUrl,supabaseKey,rememberCookie,sessionCookieOptions);
}
const signedReq=body=>new NextRequest('https://rpg.test/api/account',{method:'POST',headers:{Origin:'https://rpg.test','Content-Type':'application/json',cookie:'sb-test-auth-token=x'},body:JSON.stringify(body)});
test('display names are trimmed, allow spaces and accents, and reject control characters',async()=>{
 const updates=[];const post=settingsRoute({updates});
 assert.equal((await post(signedReq({action:'profile',displayName:'  Lady   Éowyn  '}))).status,200);
 assert.deepEqual(updates[0][0],{data:{display_name:'Lady Éowyn'}});
 assert.equal((await post(signedReq({action:'profile',displayName:'bad\u0007name'}))).status,400);
 assert.equal((await post(signedReq({action:'profile',displayName:'x'.repeat(41)}))).status,400);
 assert.equal((await post(signedReq({action:'profile',displayName:'   '}))).status,400);
 assert.equal(updates.length,1);
});
test('the WebP upload choice is saved to the verified account only, and needs a true or false',async()=>{
 const updates=[];let post=settingsRoute({updates});
 assert.equal((await post(signedReq({action:'uploads',webpUploads:false}))).status,200);
 assert.deepEqual(updates[0][0],{data:{webp_uploads:false}});
 assert.equal((await post(signedReq({action:'uploads'}))).status,400);
 assert.equal((await post(signedReq({action:'uploads',webpUploads:'no'}))).status,400);
 assert.equal(updates.length,1);
 post=settingsRoute({updates,user:{...verifiedUser,email_confirmed_at:null}});
 assert.equal((await post(signedReq({action:'uploads',webpUploads:true}))).status,400);assert.equal(updates.length,1);
});
test('password changes check the current password first, on a separate client',async()=>{
 const updates=[],checks=[];
 let post=settingsRoute({updates,checks,checkResult:{error:{message:'Invalid login'}}});
 let r=await post(signedReq({action:'change-password',currentPassword:'wrong-password',password:'brand-new-password'}));
 assert.equal(r.status,400);assert.match((await r.json()).error,/current password/);assert.equal(updates.length,0);
 assert.deepEqual(checks[0],{email:'old@example.com',password:'wrong-password'});
 post=settingsRoute({updates,checks});
 assert.equal((await post(signedReq({action:'change-password',currentPassword:'old-password-123',password:'brand-new-password'}))).status,200);
 assert.deepEqual(updates[0][0],{password:'brand-new-password'});
 assert.equal((await post(signedReq({action:'change-password',password:'brand-new-password'}))).status,400);
});
test('email changes need the current password and go through the provider confirmation link',async()=>{
 const updates=[],checks=[];let post=settingsRoute({updates,checks,checkResult:{error:{message:'bad'}}});
 assert.equal((await post(signedReq({action:'email',email:'new@example.com',currentPassword:'nope'}))).status,400);assert.equal(updates.length,0);
 post=settingsRoute({updates,checks});
 assert.equal((await post(signedReq({action:'email',email:'OLD@example.com',currentPassword:'pw'}))).status,400);
 assert.equal((await post(signedReq({action:'email',email:'new@example.com',currentPassword:'pw'}))).status,200);
 assert.deepEqual(updates[0][0],{email:'new@example.com'});assert.equal(updates[0][1].emailRedirectTo,'https://rpg.test/auth/finish?changed=email');
});
test('account changes refuse unverified sessions; sign out everywhere is global',async()=>{
 const updates=[];let post=settingsRoute({updates,user:{...verifiedUser,email_confirmed_at:null}});
 assert.equal((await post(signedReq({action:'profile',displayName:'Hero'}))).status,400);assert.equal(updates.length,0);
 post=settingsRoute({updates});const r=await post(signedReq({action:'logout-all'}));
 assert.equal(r.status,200);assert.deepEqual(updates.at(-1),['signOut',{scope:'global'}]);
});
test('display name falls back to username, then email',async()=>{
 const base={data:{user:{...verifiedUser,user_metadata:{username:'Hero',display_name:'  Lady Éowyn ',avatar:'1700000000000'}}},error:null};
 let user=await getUser({result:base});assert.equal(user.displayName,'Lady Éowyn');assert.equal(user.avatar,'1700000000000');assert.equal(user.username,'Hero');
 user=await getUser({result:{data:{user:{...verifiedUser,user_metadata:{username:'Hero',avatar:'../evil'}}},error:null}});assert.equal(user.displayName,'Hero');assert.equal(user.avatar,'');
 user=await getUser({result:{data:{user:{...verifiedUser,user_metadata:{}}},error:null}});assert.equal(user.displayName,'old@example.com');
});
const {avatarType}=await import('../lib/avatar.ts');
test('avatars are recognized by their bytes, not their declared type',()=>{
 const enc=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
 assert.equal(avatarType(enc('RIFF\0\0\0\0WEBPVP8 ')),'image/webp');
 assert.equal(avatarType(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0])),'image/png');
 assert.equal(avatarType(Uint8Array.from([0xff,0xd8,0xff,0xe0])),'image/jpeg');
 assert.equal(avatarType(enc('<svg xmlns="http://www.w3.org/2000/svg"/>')),null);
 assert.equal(avatarType(enc('GIF89a')),null);
});
