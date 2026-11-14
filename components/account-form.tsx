"use client";
import {useEffect,useState} from "react";
import SiteHeader from "./site-header";
/** Where to go after signing in, such as back to an invite link. Only paths on this site. */
const nextPath=()=>{const n=new URLSearchParams(location.search).get("next");return n&&/^\/(?!\/)[A-Za-z0-9\/_-]*$/.test(n)?n:null;};
export default function AccountForm({user}:{user:{name:string;provider:string}|null}){
 const [mode,setMode]=useState("login"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[username,setUsername]=useState(""),[remember,setRemember]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{
  function restoreMode(){const p=new URLSearchParams(location.search);const next=p.get("mode");setMode(next&&["login","signup","reset","password"].includes(next)?next:"login");}
  restoreMode();
  if(new URLSearchParams(location.search).has("error"))setMessage("This link expired or was opened in a different browser. Request a new link and open it in the browser where you requested it.");
  window.addEventListener("popstate",restoreMode);return()=>window.removeEventListener("popstate",restoreMode);
 },[]);
 function chooseMode(next:string){setMode(next);setMessage("");setPassword("");const url=new URL(location.href);url.searchParams.set("mode",next);url.searchParams.delete("error");history.pushState(null,"",url);}
 async function submit(action=mode){setBusy(true);setMessage("");try{const r=await fetch("/api/account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...(["login","signup","reset"].includes(action)?{email}:{}),...(["login","signup","password"].includes(action)?{password}:{}),...(action==="signup"?{username}:{}),...(["login","signup"].includes(action)?{remember}:{})})});const data=await r.json() as {error?:string};if(!r.ok)throw Error(data.error);setPassword("");if(action==="logout"){location.assign("/account");return;}if(action==="login"){location.assign(nextPath()??"/maptable");return;}setMessage(action==="signup"?"If signup is available for this email, check your inbox to confirm it. Open the link in this browser, then sign in.":action==="reset"?"If an account exists for this email, a reset link will be sent. Open it in this browser.":"Password updated. You can open Maptable.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const signedInSummary=user&&mode!=="password";
 const fields=<form onSubmit={e=>{e.preventDefault();void submit();}} className="account-fields">{mode!=="password"&&<label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>}{mode==="signup"&&<label>Username<input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_-]+" autoComplete="nickname" value={username} onChange={e=>setUsername(e.target.value)}/><small>Your profile name. Sign in using your email address.</small></label>}{mode!=="reset"&&<label>{mode==="password"?"New password":"Password"}<input required type="password" minLength={12} maxLength={128} autoComplete={mode==="login"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)}/></label>}{["login","signup"].includes(mode)&&<label className="account-remember"><input type="checkbox" style={{width:"auto"}} checked={remember} onChange={e=>setRemember(e.target.checked)}/>Keep me signed in on this device</label>}<button disabled={busy} className="rpg-open account-submit" type="submit">{busy?"Please wait…":mode==="signup"?"Create account":mode==="reset"?"Send reset email":mode==="password"?"Save new password":"Sign in"}</button></form>;
 return <main className="rpg-hub"><SiteHeader account signedIn={!!user} /><section className="rpg-account account-card"><p className="rpg-eyebrow">YOUR RPG TOOLS ACCOUNT</p>
  {signedInSummary?<>
   <h1>Signed in as {user.name}</h1>
   <p>Your maps and encyclopedia are saved to this account.</p>
   <nav className="account-tools" aria-label="Open a tool">
    <a href="/maptable"><strong>Open Maptable</strong><span>Battle maps, tokens and fog</span></a>
    <a href="/encyclopedia"><strong>Open Encyclopedia</strong><span>Worlds, lore and characters</span></a>
   </nav>
   <div className="account-actions"><button disabled={busy} onClick={()=>chooseMode("password")}>Change password</button><button disabled={busy} onClick={()=>void submit("logout")}>Sign out</button></div>
   {message&&<p className="account-status" role="status">{message}</p>}
  </>:<>
   <h1>{mode==="signup"?"Create your account":mode==="reset"?"Reset your password":mode==="password"?"Choose a new password":"Welcome back"}</h1>
   {user?<p>Signed in as {user.name}. <button className="account-back" disabled={busy} onClick={()=>chooseMode("login")}>Back to account</button></p>:<div className="account-tabs" role="group" aria-label="Account options">{["login","signup","reset"].map(m=><button key={m} disabled={busy} aria-pressed={mode===m} onClick={()=>chooseMode(m)}>{m==="login"?"Sign in":m==="signup"?"Register":"Forgot password"}</button>)}</div>}
   {fields}{message&&<p className="account-status" role="status">{message}</p>}
   {!user&&<p className="account-note">With Keep me signed in off, cookies last for the browser session. Some browsers restore sessions when reopening. Use Sign out on shared devices.</p>}
  </>}
 </section></main>;
}
