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
