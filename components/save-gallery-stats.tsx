"use client";
import {useState} from 'react';
import type {Token,Workspace} from '@/lib/model';
import {saveTokenStatsToGallery} from '@/lib/gallery-token-stats';

export default function SaveGalleryStats({token,workspace,campaignId,commit,save}:{token:Token;workspace:Workspace;campaignId:string|null;commit:(fn:(w:Workspace)=>void)=>void;save:()=>Promise<unknown>}) {
 const [choice,setChoice]=useState<string|null>(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const targets=workspace.tokenLibrary.filter(t=>!workspace.libraryCampaigns[t.id]||workspace.libraryCampaigns[t.id]===campaignId);
 const targetId=choice??(targets.some(t=>t.id===token.sourceLibraryId)?token.sourceLibraryId:'')??'';
 async function persist(){setBusy(true);setStatus('');try{commit(w=>{const placed=w.scenes.flatMap(s=>s.tokens).find(t=>t.id===token.id);saveTokenStatsToGallery(w,token,targetId);if(placed)placed.sourceLibraryId=targetId;});if(await save()===false)throw Error('Stats updated locally. Cloud save failed; use Save to retry.');setStatus('Stats saved to the gallery token.');}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 return <section><h3>Save stats to gallery</h3><label>Gallery token<select value={targetId} onChange={e=>{setChoice(e.target.value);setStatus('');}}><option value="">Choose a saved token</option>{targets.map(t=><option key={t.id} value={t.id}>{t.name} · {t.rosterRole??'library'}</option>)}</select></label><button disabled={!targetId||busy} onClick={()=>void persist()}>{busy?'Saving…':'Save stats to gallery token'}</button><small>Updates HP, initiative, combat stats, notes and Discord stat settings. The saved portrait and folder stay in place.</small><p role="status">{status}</p></section>;
}
