"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {avatarSrc} from "@/lib/avatar";
export type AccountUser={name:string;username:string;email:string;avatar:string;pendingEmail:string};
type Status={text:string;ok:boolean}|null;
/** Shows "dr•••••@gmail.com": enough to recognize, not enough to read over a shoulder or on a stream. */
export function maskEmail(email:string){const at=email.indexOf("@");if(at<1)return email;return email.slice(0,Math.min(2,at))+"•••••"+email.slice(at);}
const initial=(name:string)=>(Array.from(name.trim())[0]??"?").toUpperCase();
export function Avatar({name,avatar,size}:{name:string;avatar:string;size:"s"|"l"}){
 return <span className={`account-avatar account-avatar-${size}`} aria-hidden="true">{avatar?<img alt="" src={avatarSrc(avatar)}/>:initial(name)}</span>;
}
async function post(body:Record<string,unknown>){
 const r=await fetch("/api/account",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({})) as {error?:string};if(!r.ok)throw Error(data.error||"The request could not be completed.");
}
/** Center-crops to a square and shrinks to 256 px. WebP where the browser can encode it, else JPEG. */
async function shrink(file:File):Promise<Blob>{
 const bitmap=await createImageBitmap(file).catch(()=>{throw Error("That file could not be read as a picture.");});
 const side=Math.min(bitmap.width,bitmap.height),size=Math.min(256,side),canvas=document.createElement("canvas");canvas.width=canvas.height=size;
 canvas.getContext("2d")!.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,size,size);bitmap.close();
 const encode=(type:string,q:number)=>new Promise<Blob|null>(done=>canvas.toBlob(done,type,q));
 let blob=await encode("image/webp",.86);if(!blob||blob.type!=="image/webp")blob=await encode("image/jpeg",.88);
 if(!blob)throw Error("That picture could not be resized.");return blob;
}
function Note({status}:{status:Status}){return status?<p className={status.ok?"account-status":"account-status account-status-error"} role={status.ok?"status":"alert"}>{status.text}</p>:null;}
export default function AccountSettings({user}:{user:AccountUser}){
 const [name,setName]=useState(user.name),[savedName,setSavedName]=useState(user.name),[avatar,setAvatar]=useState(user.avatar);
 const [newEmail,setNewEmail]=useState(""),[emailPassword,setEmailPassword]=useState(""),[pending,setPending]=useState(user.pendingEmail);
 const [current,setCurrent]=useState(""),[next,setNext]=useState(""),[confirm,setConfirm]=useState("");
 const [busy,setBusy]=useState(""),[status,setStatus]=useState<Record<string,Status>>({});
 const file=useRef<HTMLInputElement>(null),router=useRouter();
 useEffect(()=>{
  const changed=new URLSearchParams(location.search).get("changed");
  if(changed==="email")setStatus(s=>({...s,email:{ok:true,text:"Your sign-in email is changed. Use the new address next time you sign in."}}));
  if(changed==="email-half")setStatus(s=>({...s,email:{ok:true,text:"Link accepted. Open the link sent to your other address too, in this browser, to finish the change."}}));
 },[]);
 async function run(key:string,work:()=>Promise<string>){
  setBusy(key);setStatus(s=>({...s,[key]:null}));
  try{const text=await work();setStatus(s=>({...s,[key]:{ok:true,text}}));}
  catch(e){setStatus(s=>({...s,[key]:{ok:false,text:(e as Error).message}}));}
  finally{setBusy("");}
 }
 const sendAvatar=(blob:Blob|null)=>run("profile",async()=>{
  const r=await fetch("/api/account/avatar",{method:blob?"PUT":"DELETE",...(blob?{headers:{"Content-Type":blob.type},body:blob}:{})});
  const data=await r.json().catch(()=>({})) as {error?:string;avatar?:string};if(!r.ok)throw Error(data.error||"The picture could not be saved.");
  setAvatar(data.avatar??"");router.refresh();return blob?"Picture saved.":"Picture removed.";
 });
 const shown=name.trim()||user.username||"Player";
 const disabled=!!busy;
 return <div className="account-settings">
  <p className="rpg-eyebrow">YOUR RPG TOOLS ACCOUNT</p>
  <h1>Account settings</h1>
  <p className="account-lead">Your profile is what players and other GMs see. Sign-in details stay private to you.</p>
  <div className="account-layout">
   <nav className="account-side" aria-label="Account sections">
    <a href="#profile">Profile</a><a href="#email">Email</a><a href="#password">Password</a><a href="#devices">Signed-in devices</a>
   </nav>
   <div className="account-sections">
    <section id="profile" className="account-section" aria-labelledby="profile-h">
     <h2 id="profile-h">Profile</h2>
     <p className="account-hint">Your display name shows on the home page, in campaign member lists and on your posts.</p>
     <div className="account-profile">
      <div className="account-avatar-box">
       <Avatar name={shown} avatar={avatar} size="l"/>
       <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void (async()=>{try{await sendAvatar(await shrink(f));}catch(err){setStatus(s=>({...s,profile:{ok:false,text:(err as Error).message}}));}})();}}/>
       <button type="button" disabled={disabled} onClick={()=>file.current?.click()}>{avatar?"Change picture":"Upload picture"}</button>
       {avatar&&<button type="button" className="account-ghost" disabled={disabled} onClick={()=>void sendAvatar(null)}>Remove</button>}
       <small>PNG, JPG or WebP. Cropped to a square and shrunk to 256 px.</small>
      </div>
      <form className="account-fields account-fields-tight" onSubmit={e=>{e.preventDefault();void run("profile",async()=>{await post({action:"profile",displayName:name});setSavedName(name.trim());router.refresh();return "Profile saved.";});}}>
       <label>Display name<input required maxLength={40} autoComplete="nickname" value={name} onChange={e=>setName(e.target.value)}/><small>Up to 40 characters. Spaces and accents are fine.</small></label>
       {user.username&&<label>Username<input readOnly value={user.username}/><small>Set when you registered. You sign in with your email, not this.</small></label>}
       <p className="account-preview"><Avatar name={shown} avatar={avatar} size="s"/><span>How others see you: <strong>{shown}</strong></span></p>
       <div className="account-row-end">
        {name!==savedName&&<button type="button" className="account-ghost" disabled={disabled} onClick={()=>setName(savedName)}>Cancel</button>}
        <button className="account-primary" disabled={disabled||!name.trim()||name.trim()===savedName}>{busy==="profile"?"Saving…":"Save profile"}</button>
       </div>
      </form>
     </div>
     <Note status={status.profile??null}/>
    </section>

    <section id="email" className="account-section" aria-labelledby="email-h">
     <h2 id="email-h">Email</h2>
     <p className="account-hint">Used to sign in and for password resets. Never shown to players.</p>
     <div className="account-current"><div><strong>{maskEmail(user.email)}</strong><span>Verified</span></div><span className="account-pill">Sign-in email</span></div>
     {pending?<>
      <p className="account-status account-status-wait">Waiting for you to confirm <strong>{pending}</strong>. Open the link we emailed, in this browser. Your email changes only after that, so keep signing in with your current address until then. To use a different address, send a new change below.</p>
      <div className="account-row-end"><button type="button" className="account-ghost" disabled={disabled} onClick={()=>setPending("")}>Use a different address</button><button type="button" disabled={disabled} onClick={()=>void run("email",async()=>{await post({action:"resend-email"});return "Link sent again.";})}>{busy==="email"?"Sending…":"Resend link"}</button></div>
     </>:<form className="account-fields account-fields-tight" onSubmit={e=>{e.preventDefault();void run("email",async()=>{await post({action:"email",email:newEmail.trim(),currentPassword:emailPassword});setEmailPassword("");setPending(newEmail.trim());setNewEmail("");return "Confirmation sent. Check your inbox.";});}}>
      <div className="account-two">
       <label>New email<input required type="email" maxLength={254} autoComplete="email" placeholder="you@example.com" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/></label>
       <label>Current password<input required type="password" autoComplete="current-password" value={emailPassword} onChange={e=>setEmailPassword(e.target.value)}/><small>To confirm it&apos;s you.</small></label>
      </div>
      <div className="account-row-end"><button className="account-primary" disabled={disabled}>{busy==="email"?"Sending…":"Send confirmation"}</button></div>
     </form>}
     <Note status={status.email??null}/>
    </section>

    <section id="password" className="account-section" aria-labelledby="password-h">
     <h2 id="password-h">Password</h2>
     <p className="account-hint">Changing it keeps you signed in here.</p>
     <form className="account-fields account-fields-tight" onSubmit={e=>{e.preventDefault();void run("password",async()=>{if(next!==confirm)throw Error("The new passwords do not match.");await post({action:"change-password",currentPassword:current,password:next});setCurrent("");setNext("");setConfirm("");return "Password changed.";});}}>
      <input type="text" hidden readOnly autoComplete="username" value={user.email}/>
      <label>Current password<input required type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></label>
      <div className="account-two">
       <label>New password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)}/><span className="account-meter" aria-hidden="true"><i style={{width:`${Math.min(100,next.length/20*100)}%`}} data-ok={next.length>=12||undefined}/></span><small>12 to 128 characters.</small></label>
       <label>Confirm new password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} aria-invalid={!!confirm&&confirm!==next}/>{confirm&&confirm!==next&&<small>Does not match yet.</small>}</label>
      </div>
      <div className="account-row-end account-row-split"><button type="button" className="account-link" disabled={disabled} onClick={()=>void run("password",async()=>{await post({action:"reset",email:user.email});return "Reset email sent. Open its link in this browser.";})}>Forgot it? Send a reset email</button><button className="account-primary" disabled={disabled}>{busy==="password"?"Saving…":"Change password"}</button></div>
     </form>
     <Note status={status.password??null}/>
    </section>

    <section id="devices" className="account-section" aria-labelledby="devices-h">
     <h2 id="devices-h">Signed-in devices</h2>
     <p className="account-hint">Use this if you signed in on a shared or lost device. Sign out everywhere ends every session, including this one.</p>
     <div className="account-row">
      <button type="button" disabled={disabled} onClick={()=>void run("devices",async()=>{await post({action:"logout"});location.assign("/account");return "";})}>Sign out</button>
      <button type="button" className="account-danger" disabled={disabled} onClick={()=>void run("devices",async()=>{await post({action:"logout-all"});location.assign("/account");return "";})}>Sign out everywhere</button>
     </div>
     <Note status={status.devices?.ok===false?status.devices:null}/>
    </section>
   </div>
  </div>
 </div>;
}
