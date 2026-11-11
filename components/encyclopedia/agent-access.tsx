'use client';
import {useState} from 'react';
export default function EncyclopediaAgentAccess({campaignId}:{campaignId:string|null}){
 const [key,setKey]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function act(action:'create'|'revoke'){
  setBusy(true);setMessage('');
  try{const response=await fetch('/api/encyclopedia/agent-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId,action})});const data=await response.json();if(!response.ok)throw Error(data.error);setKey(data.key??'');setMessage(action==='create'?'Key created. Previous agent keys for this campaign no longer work. Save this key now; it is shown only here.':'Agent access revoked.');}
  catch(error){setMessage(error instanceof Error?error.message:'Could not update access');}finally{setBusy(false);}
 }
 return <div className="aside-section"><strong>AI access through MCP</strong><p className="modal-intro">Read-only access to this saved campaign and its shared world lore, including GM notes. Player links are separate.</p>{campaignId?<><div className="button-row"><button className="button" disabled={busy} onClick={()=>void act('create')}>Create / replace agent key</button><button className="button" disabled={busy} onClick={()=>void act('revoke')}>Revoke agent key</button></div>{key&&<label>Copy your private key<input readOnly value={key} onFocus={e=>e.currentTarget.select()}/></label>}<p>Run <code>node scripts/encyclopedia-mcp.mjs</code> with <code>RPG_TOOLS_URL</code> set to this site's origin and <code>ENCYCLOPEDIA_AGENT_KEY</code> set to your key. See the encyclopedia guide for client configuration.</p></>:<p>Choose and save a campaign first.</p>}{message&&<p role="status">{message}</p>}</div>;
}
