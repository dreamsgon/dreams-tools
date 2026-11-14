'use client';
import {useEffect,useState} from 'react';
import {Check,Copy,MonitorPlay} from 'lucide-react';
import {confirmDialog} from '../confirm-dialog';
import {ToolDialog} from './tool-dialog';
import {bridgeClients,clientNames,syncInfo,syncKinds,type BridgeClient,type Direction,type Sync} from '@/lib/bridge/sync';
import './sheet-import.css';
import './bridge-access.css';

type Key={id:string;name:string;client:BridgeClient;createdAt:string;lastUsedAt?:string;sync:Sync};
const directionNames:Record<Direction,string>={both:'Both ways',to:'RPG Tools → table',from:'Table → RPG Tools',off:'Off'};
async function post(body:object){
 const r=await fetch('/api/encyclopedia/bridge-keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error??'Something went wrong. Try again.');return data;
}
function ago(iso?:string){
 if(!iso)return 'not used yet';
 const s=(Date.now()-Date.parse(iso))/1000;
 if(s<90)return 'used just now';if(s<3600)return `used ${Math.round(s/60)} minutes ago`;if(s<86400)return `used ${Math.round(s/3600)} hours ago`;
 const d=Math.round(s/86400);return d===1?'used yesterday':`used ${d} days ago`;
}

/** "Other tables" in the AI & GitHub dialog: bridge keys for Foundry VTT now, and the owner's own VTT later. */
export default function BridgeAccess({campaignId,campaignName}:{campaignId:string|null;campaignName:string|null}){
 const [open,setOpen]=useState(false);
 return <div className="aside-section"><strong>Other tables (VTT bridge)</strong>
  <p className="modal-intro">Keep this campaign in step with Foundry VTT, or later your own table. Each bridge key reaches this campaign only, and is separate from AI connections.</p>
  {campaignId?<button className="button" onClick={()=>setOpen(true)}><MonitorPlay size={16}/> Connect a table</button>:<p>Choose and save a campaign first.</p>}
  {open&&campaignId&&<BridgeDialog campaignId={campaignId} campaignName={campaignName??'this campaign'} onClose={()=>setOpen(false)}/>}
 </div>;
}

function BridgeDialog({campaignId,campaignName,onClose}:{campaignId:string;campaignName:string;onClose:()=>void}){
 const [list,setList]=useState<Key[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[client,setClient]=useState<BridgeClient>('foundry'),[name,setName]=useState('');
 const [made,setMade]=useState<{key:string;bridge:Key}|null>(null),[copied,setCopied]=useState(''),[editing,setEditing]=useState<string|null>(null);
 useEffect(()=>{let live=true;fetch(`/api/encyclopedia/bridge-keys?campaignId=${encodeURIComponent(campaignId)}`).then(r=>r.json().then(d=>{if(!r.ok)throw Error(d.error);if(live)setList(d.keys);})).catch(e=>{if(live){setError(e instanceof Error&&e.message?e.message:'Could not load the bridge keys.');setList([]);}});return()=>{live=false;};},[campaignId]);
 async function make(){
  setBusy(true);setError('');
  try{const d=await post({campaignId,action:'create',name,client});setMade(d);setList(l=>[...(l??[]),d.bridge]);setName('');}
  catch(e){setError(e instanceof Error?e.message:'Could not make the key.');}finally{setBusy(false);}
 }
 async function revoke(k:Key){
  if(!await confirmDialog({title:`Revoke ${k.name}?`,message:'The table using this key stops syncing at once. Nothing already synced is removed.',confirm:'Revoke',danger:true}))return;
  try{await post({campaignId,action:'revoke',id:k.id});setList(l=>(l??[]).filter(x=>x.id!==k.id));if(made?.bridge.id===k.id)setMade(null);}
  catch(e){setError(e instanceof Error?e.message:'Could not revoke the key.');}
 }
 async function direction(k:Key,kind:keyof Sync,d:Direction){
  const before=list;setList(l=>(l??[]).map(x=>x.id===k.id?{...x,sync:{...x.sync,[kind]:d}}:x));
  try{const r=await post({campaignId,action:'update',id:k.id,sync:{[kind]:d}});setList(l=>(l??[]).map(x=>x.id===k.id?r.bridge:x));}
  catch(e){setList(before);setError(e instanceof Error?e.message:'Could not change it.');}
 }
 async function copy(what:string,text:string){try{await navigator.clipboard.writeText(text);setCopied(what);}catch{setCopied('failed');}}
 const base=typeof location==='undefined'?'/api/bridge':`${location.origin}/api/bridge`;

 return <ToolDialog title="Connect a table" wide onClose={onClose}>
  <div className="bridge-body">
   <p className="modal-intro">For {campaignName}. The other table reads and writes this campaign through the bridge, as you set below. Characters travel as RPG Tools sheets, the same file as Import and Export.</p>
   {made&&<section className="bridge-made" aria-live="polite">
    <strong>{made.bridge.name} is ready</strong>
    <span className="import-label">Bridge key</span>
    <div className="bridge-copy"><code>{made.key}</code><button type="button" className="button small" onClick={()=>void copy('key',made.key)}>{copied==='key'?<><Check size={13}/> Copied</>:<><Copy size={13}/> Copy</>}</button></div>
    <span className="import-label">Address</span>
    <div className="bridge-copy"><code>{base}</code><button type="button" className="button small" onClick={()=>void copy('url',base)}>{copied==='url'?<><Check size={13}/> Copied</>:<><Copy size={13}/> Copy</>}</button></div>
    <p className="import-warn"><b>Copy the key now.</b> It won’t be shown again. Anyone with it can read this campaign, GM secrets included, and change what you allow below, until you revoke it.</p>
    {made.bridge.client==='foundry'&&<>
     <span className="import-label">In Foundry: Add-on Modules › Install Module, then paste this manifest URL</span>
     <div className="bridge-copy"><code>{`${base}/foundry/module.json`}</code><button type="button" className="button small" onClick={()=>void copy('manifest',`${base}/foundry/module.json`)}>{copied==='manifest'?<><Check size={13}/> Copied</>:<><Copy size={13}/> Copy</>}</button></div>
     <p className="import-note">Turn on RPG Tools Bridge in your world, then paste the address and key in its module settings. Only your GM browser keeps the key.</p>
    </>}
    {copied==='failed'&&<p className="ai-error" role="alert">Copying didn’t work here. Select the text and copy it yourself.</p>}
   </section>}
   <form className="bridge-new" onSubmit={e=>{e.preventDefault();void make();}}>
    <label><span className="import-label">Table</span><select value={client} onChange={e=>setClient(e.target.value as BridgeClient)}>{bridgeClients.map(c=><option key={c} value={c}>{clientNames[c]}</option>)}</select></label>
    <label><span className="import-label">Name</span><input value={name} maxLength={60} placeholder={clientNames[client]} onChange={e=>setName(e.target.value)}/></label>
    <button type="submit" className="button primary" disabled={busy||list===null||list.length>=5}>{busy?'Making…':'Make bridge key'}</button>
   </form>
   {error&&<p className="ai-error" role="alert">{error}</p>}
   <span className="import-label">Bridge keys</span>
   {list===null?<p className="import-note">Loading…</p>:!list.length?<p className="import-note">No tables connected yet.</p>:
    <ul className="bridge-list">{list.map(k=><li key={k.id}>
     <div className="bridge-row"><span><strong>{k.name}</strong><small>{clientNames[k.client]} · {ago(k.lastUsedAt)}</small></span>
      <button type="button" className="button small" aria-expanded={editing===k.id} onClick={()=>setEditing(editing===k.id?null:k.id)}>{editing===k.id?'Done':'What syncs'}</button>
      <button type="button" className="button small danger" onClick={()=>void revoke(k)}>Revoke</button></div>
     {editing===k.id&&<div className="bridge-sync">
      <p className="import-note">Each kind of thing has its own direction. Lore starts one way, from RPG Tools, so the table can’t overwrite your Encyclopedia by accident.</p>
      <table className="bridge-table"><thead><tr><th>In RPG Tools</th><th>At the table</th><th>Direction</th></tr></thead><tbody>
       {syncKinds.map(kind=><tr key={kind}><td><b>{syncInfo[kind].name}</b>{!syncInfo[kind].ready&&<span className="import-chip">Coming next</span>}</td><td>{syncInfo[kind].there}</td>
        <td><select aria-label={`${syncInfo[kind].name} direction`} value={k.sync[kind]} onChange={e=>void direction(k,kind,e.target.value as Direction)}>{(Object.keys(directionNames) as Direction[]).map(d=><option key={d} value={d}>{directionNames[d]}</option>)}</select></td></tr>)}
      </tbody></table>
     </div>}
    </li>)}</ul>}
  </div>
 </ToolDialog>;
}
