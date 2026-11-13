'use client';
import {useState} from 'react';
import {Sparkles} from 'lucide-react';
import {AiConnectionDialog} from './ai-connection';
/** AI access in the "AI & GitHub" dialog: opens Connect an AI, and can still revoke an older read-only Encyclopedia key. */
export default function EncyclopediaAgentAccess({campaignId,campaignName}:{campaignId:string|null;campaignName:string|null}){
 const [open,setOpen]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function revokeOld(){
  setBusy(true);setMessage('');
  try{const response=await fetch('/api/encyclopedia/agent-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId,action:'revoke'})});const data=await response.json();if(!response.ok)throw Error(data.error);setMessage('The older key no longer works.');}
  catch(error){setMessage(error instanceof Error?error.message:'Could not revoke the key');}finally{setBusy(false);}
 }
 return <div className="aside-section"><strong>AI connection (MCP)</strong>
  <p className="modal-intro">Let Claude, ChatGPT or any other app that supports MCP read this campaign and its Maptable maps. Each connection has its own key, and you can revoke it at any time.</p>
  {campaignId?<>
   <button className="button primary" onClick={()=>setOpen(true)}><Sparkles size={16}/> Connect an AI</button>
   <details className="connection-help"><summary>Older Encyclopedia key</summary><p>Keys made here before (starting with <code>enc_</code>) keep working until you revoke them.</p><button className="button" disabled={busy} onClick={()=>void revokeOld()}>Revoke the older key</button></details>
   {open&&<AiConnectionDialog campaignId={campaignId} campaignName={campaignName??'this campaign'} onClose={()=>setOpen(false)}/>}
  </>:<p>Choose and save a campaign first.</p>}
  {message&&<p role="status">{message}</p>}
 </div>;
}
