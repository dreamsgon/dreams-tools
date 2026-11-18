"use client";
/*
 * Account settings › AI on this device: your own AI (any provider with an API key), for the forum's Catch me up and
 * Check my post, and the AI keys this browser holds. Keys stay in this browser (lib/ai/device-keys.ts): RPG Tools never
 * saves them, and they go along only with the requests you make here.
 */
import {useEffect,useState} from "react";
import {providers,providerOf,type ProviderId} from "@/lib/ai/providers";
import {deviceKeyCount,forgetDeviceAi,forgetOwnAi,onDeviceAi,ownAi,saveOwnAi,type OwnAi} from "@/lib/ai/device-keys";

export function DeviceAi(){
 const [own,setOwn]=useState<OwnAi|null>(null),[keys,setKeys]=useState(0),[ready,setReady]=useState(false);
 const [provider,setProvider]=useState<ProviderId>("anthropic"),[baseUrl,setBaseUrl]=useState(""),[key,setKey]=useState(""),[model,setModel]=useState(""),[models,setModels]=useState<string[]|null>(null);
 const [busy,setBusy]=useState(""),[status,setStatus]=useState<{ok:boolean;text:string}|null>(null),[editing,setEditing]=useState(false);
 useEffect(()=>{const sync=()=>{setOwn(ownAi());setKeys(deviceKeyCount());setReady(true);};sync();return onDeviceAi(sync);},[]);
 const p=providerOf(provider);
 async function check(){
  const r=await fetch("/api/encyclopedia/ai-connections",{method:"POST",headers:{"Content-Type":"application/json"},
   // Checking the key lists its models. The key passes through for this one request and isn't saved.
   body:JSON.stringify({campaignId:"device",action:"models",provider,apiKey:key,...(provider==="other"?{baseUrl}:{})})});
  const d=await r.json().catch(()=>({})) as {models?:string[];error?:string};
  if(!r.ok)throw Error(d.error??"The key didn’t check out.");
  const list=d.models??[];setModels(list);
  const chosen=model||(p.suggested&&list.includes(p.suggested)?p.suggested:list[0]??"");setModel(chosen);return chosen;
 }
 async function run(what:string,work:()=>Promise<string>){
  setBusy(what);setStatus(null);
  try{setStatus({ok:true,text:await work()});}catch(e){setStatus({ok:false,text:(e as Error).message});}finally{setBusy("");}
 }
 const disabled=!!busy;
 return <section id="device-ai" className="account-section" aria-labelledby="device-ai-h">
  <h2 id="device-ai-h">AI on this device</h2>
  <p className="account-hint">Your own AI, for the forum’s Catch me up and Check my post. Its key is kept only in this browser: RPG Tools never saves it, and it goes along only with the AI requests you make here. On another device, add it again. Signing out here forgets it.</p>
  {!ready?null:own&&!editing?<>
   <div className="account-current"><div><strong>{providerOf(own.provider).name} · {own.model}</strong><span>Key ending …{own.apiKey.slice(-4)}, on this device</span></div><span className="account-pill">Your AI</span></div>
   <div className="account-row-end"><button type="button" className="account-ghost" disabled={disabled} onClick={()=>{forgetOwnAi();setStatus({ok:true,text:"Forgotten on this device."});}}>Forget it</button><button type="button" disabled={disabled} onClick={()=>{setProvider(own.provider);setBaseUrl(own.baseUrl??"");setModel(own.model);setModels(null);setKey("");setEditing(true);}}>Change</button></div>
  </>:<form className="account-fields account-fields-tight" onSubmit={e=>{e.preventDefault();void run("own",async()=>{
    const chosen=models?model:await check();if(!chosen)throw Error("Choose a model.");
    saveOwnAi({provider,...(provider==="other"?{baseUrl}:{}),model:chosen,apiKey:key});setKey("");setEditing(false);return "Saved on this device.";});}}>
   <label>Provider<select value={provider} onChange={e=>{setProvider(e.target.value as ProviderId);setModels(null);setModel("");}}>{providers.map(x=><option key={x.id} value={x.id}>{x.name}{x.name!==x.sub?` (${x.sub})`:""}</option>)}</select></label>
   {provider==="other"&&<label>Address of the API<input value={baseUrl} inputMode="url" placeholder="https://example.com/v1" onChange={e=>{setBaseUrl(e.target.value);setModels(null);}}/><small>Any service that speaks the OpenAI-style chat API, on a public https address.</small></label>}
   <label>{p.name} API key<input required type="password" autoComplete="off" spellCheck={false} value={key} placeholder="Paste the key" onChange={e=>{setKey(e.target.value);setModels(null);}}/><small>Make one at {p.keyFrom}. Billed to that account.</small></label>
   <label>Model<input list="device-ai-models" value={model} placeholder={models?"Pick or type a model":"Listed once the key checks out"} onChange={e=>setModel(e.target.value)}/>{models&&<datalist id="device-ai-models">{models.map(m=><option key={m} value={m}/>)}</datalist>}</label>
   <div className="account-row-end">
    {editing&&<button type="button" className="account-ghost" disabled={disabled} onClick={()=>setEditing(false)}>Cancel</button>}
    <button type="button" disabled={disabled||!key.trim()} onClick={()=>void run("check",async()=>{const chosen=await check();return chosen?`The key works. ${chosen} is picked; change it if you like, then save.`:"The key works, but it lists no models. Type one, then save.";})}>{busy==="check"?"Checking…":"Check key"}</button>
    <button className="account-primary" disabled={disabled||!key.trim()}>{busy==="own"?"Saving…":"Save on this device"}</button>
   </div>
  </form>}
  {ready&&(keys>0||own)&&<div className="account-row-end account-row-split"><small className="account-hint">{keys?`This browser also holds the key${keys===1?"":"s"} for ${keys} of your campaigns’ AI connection${keys===1?"":"s"}.`:""}</small><button type="button" className="account-danger" disabled={disabled} onClick={()=>{forgetDeviceAi();setStatus({ok:true,text:"Every AI key on this device is forgotten."});}}>Forget all AI keys here</button></div>}
  {status&&<p className={status.ok?"account-status":"account-status account-status-error"} role={status.ok?"status":"alert"}>{status.text}</p>}
 </section>;
}
