'use client';
import {useState} from 'react';
import {HardDrive} from 'lucide-react';
import {PART_LIMITS,TOTAL_LIMIT,formatMb,partSizes} from '@/lib/encyclopedia/wiki-parts';
import type {Workspace} from '@/lib/encyclopedia/world-model';
import './wiki-storage.css';
/**
 * Wiki settings, Storage: how full each campaign (and each world's shared lore) is, and the limit for one of them,
 * which the owner can raise. Each campaign is stored on its own (lib/encyclopedia/wiki-parts.ts).
 */
export function WikiStorage({data,limit,onChanged}:{data:Workspace;limit:number;onChanged:(limit:number)=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[all,setAll]=useState(false);
  const sizes=partSizes(data).filter(s=>s.kind!=='other'),total=sizes.reduce((n,s)=>n+s.bytes,0),shown=all?sizes:sizes.slice(0,6);
  async function choose(next:number) {
    setBusy(true);setError('');
    try {
      const res=await fetch('/api/encyclopedia/storage',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit:next})});
      const body=await res.json().catch(()=>({})) as {error?:string};
      if(!res.ok)throw new Error(body.error??'Could not change the limit.');
      onChanged(next);
    } catch(e) { setError(e instanceof Error?e.message:'Could not change the limit.'); } finally { setBusy(false); }
  }
  return <div className="wiki-storage">
    <div className="settings-action"><div><strong><HardDrive size={14}/> Storage</strong><p>Each campaign, and each world’s shared lore, is saved on its own and can grow up to this limit. All of them together: {formatMb(total)} of {formatMb(TOTAL_LIMIT)}.</p></div>
      <label className="wiki-storage-limit"><span>Limit per campaign</span><select value={limit} disabled={busy} onChange={e=>void choose(Number(e.target.value))}>{PART_LIMITS.map(n=><option key={n} value={n}>{formatMb(n)}</option>)}</select></label></div>
    {error&&<p className="form-error">{error}</p>}
    <ul className="wiki-storage-list">{shown.map(s=>{const share=Math.min(1,s.bytes/limit);return <li key={s.key} className={share>0.9?'near':undefined}>
      <span className="wiki-storage-name">{s.name}</span><span className="wiki-storage-size">{formatMb(s.bytes)}</span>
      <span className="wiki-storage-bar" aria-hidden><span style={{width:`${Math.max(1,share*100)}%`}}/></span></li>;})}</ul>
    {sizes.length>6&&<button type="button" className="text-button" onClick={()=>setAll(v=>!v)}>{all?'Show fewer':`Show all ${sizes.length}`}</button>}
    <p className="muted">A bigger limit lets a campaign hold more, but it loads and saves a little slower. Pictures, maps, transcripts and random tables are kept apart and don’t count.</p>
  </div>;
}
