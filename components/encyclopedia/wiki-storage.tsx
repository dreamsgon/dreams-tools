'use client';
import {useState} from 'react';
import {Archive,ArchiveRestore,HardDrive} from 'lucide-react';
import {confirmDialog} from '../confirm-dialog';
import {PAGE_LIMIT,PART_LIMITS,TOTAL_LIMITS,formatMb,partSizes} from '@/lib/encyclopedia/wiki-parts';
import type {Workspace} from '@/lib/encyclopedia/world-model';
import './wiki-storage.css';
/**
 * Wiki settings, Storage: how full each campaign (and each world's shared lore) is, and the limit for one of them,
 * which the owner can raise. Each campaign is stored on its own (lib/encyclopedia/wiki-parts.ts).
 */
export function WikiStorage({data,limit,total:totalLimit,onChanged,onTotal,saved,onArchived}:{data:Workspace;limit:number;total:number;onChanged:(limit:number)=>void;onTotal:(total:number)=>void;
  /** False while this tab has edits not saved yet: archiving waits for them, so they can't bring archived pages back. */
  saved:boolean;onArchived:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[all,setAll]=useState(false);
  const sizes=partSizes(data).filter(s=>s.kind!=='other'&&!(s.kind==='campaign'&&data.campaigns.find(c=>`c:${c.id}`===s.key)?.archived)),total=sizes.reduce((n,s)=>n+s.bytes,0),shown=all?sizes:sizes.slice(0,6);
  async function choose(next:number,which:'limit'|'total'='limit') {
    setBusy(true);setError('');
    try {
      const res=await fetch('/api/encyclopedia/storage',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({[which]:next})});
      const body=await res.json().catch(()=>({})) as {error?:string};
      if(!res.ok)throw new Error(body.error??'Could not change the limit.');
      if(which==='limit')onChanged(next);else onTotal(next);
    } catch(e) { setError(e instanceof Error?e.message:'Could not change the limit.'); } finally { setBusy(false); }
  }
  const archived=data.campaigns.filter(c=>c.archived);
  /** Archives a campaign's pages, or brings them back (store.ts archiveCampaign). */
  async function archive(campaignId:string,name:string,on:boolean) {
    const pages=data.entries.filter(e=>e.campaignId===campaignId).length;
    if(on&&!await confirmDialog({title:`Archive ${name}?`,message:`Its ${pages} page${pages===1?'':'s'} leave the Wiki and are kept in storage on their own, so they don’t count toward any limit. The campaign stays, with its players, links and maps. Bring it back here any time.`,confirm:'Archive'}))return;
    setBusy(true);setError('');
    try {
      const res=await fetch('/api/encyclopedia/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId,archive:on})});
      const body=await res.json().catch(()=>({})) as {error?:string};
      if(!res.ok)throw new Error(body.error??'Could not change the archive.');
      onArchived();
    } catch(e) { setError(e instanceof Error?e.message:'Could not change the archive.'); } finally { setBusy(false); }
  }
  return <div className="wiki-storage">
    <div className="settings-action"><div><strong><HardDrive size={14}/> Storage</strong><p>Each campaign, and each world’s shared lore, is saved on its own and can grow up to this limit, with up to {PAGE_LIMIT.toLocaleString('en-US')} pages.</p></div>
      <label className="wiki-storage-limit"><span>Limit per campaign</span><select value={limit} disabled={busy} onChange={e=>void choose(Number(e.target.value))}>{PART_LIMITS.map(n=><option key={n} value={n}>{formatMb(n)}</option>)}</select></label></div>
    <div className="settings-action"><div><strong>Whole Wiki</strong><p>Every campaign that isn’t archived, together: {formatMb(total)} of {formatMb(totalLimit)}. They all load at once, so a bigger Wiki opens a little slower.</p></div>
      <label className="wiki-storage-limit"><span>Limit for all campaigns</span><select value={totalLimit} disabled={busy} onChange={e=>void choose(Number(e.target.value),'total')}>{TOTAL_LIMITS.map(n=><option key={n} value={n}>{formatMb(n)}</option>)}</select></label></div>
    {error&&<p className="form-error">{error}</p>}
    <ul className="wiki-storage-list">{shown.map(s=>{const share=Math.min(1,s.bytes/limit);return <li key={s.key} className={share>0.9?'near':undefined}>
      <span className="wiki-storage-name">{s.name}</span><span className="wiki-storage-size">{formatMb(s.bytes)}{s.kind==='campaign'&&<button type="button" className="text-button" disabled={busy||!saved} title={saved?undefined:'Save your changes first'} onClick={()=>void archive(s.key.slice(2),s.name,true)}><Archive size={12}/> Archive</button>}</span>
      <span className="wiki-storage-bar" aria-hidden><span style={{width:`${Math.max(1,share*100)}%`}}/></span></li>;})}</ul>
    {sizes.length>6&&<button type="button" className="text-button" onClick={()=>setAll(v=>!v)}>{all?'Show fewer':`Show all ${sizes.length}`}</button>}
    {archived.length>0&&<><strong className="wiki-storage-heading">Archived campaigns</strong><ul className="wiki-storage-list">{archived.map(c=><li key={c.id}>
      <span className="wiki-storage-name">{c.name}</span><span className="wiki-storage-size">{c.archived!.pages} pages · {formatMb(c.archived!.bytes)}<button type="button" className="text-button" disabled={busy||!saved} title={saved?undefined:'Save your changes first'} onClick={()=>void archive(c.id,c.name,false)}><ArchiveRestore size={12}/> Bring back</button></span></li>)}</ul></>}
    {!saved&&<p className="muted">Save your changes to archive a campaign or bring one back.</p>}
    <p className="muted">A bigger limit lets a campaign hold more, but it loads and saves a little slower. Pictures, maps, transcripts and random tables are kept apart and don’t count. An archived campaign keeps its players, links and maps; only its pages leave the Wiki until you bring them back.</p>
  </div>;
}
