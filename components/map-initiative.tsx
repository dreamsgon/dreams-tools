"use client";
import {useRef,useState} from 'react';
import type {Scene,Workspace} from '@/lib/model';
import {api} from '@/lib/api';
import {mapDiscordMessage} from '@/lib/map-discord-message';
import {advanceInitiative,getCurrentInitiativeEntry,getInitiativeEntries,getInitiativeRound} from '@/lib/initiative-tracker';
import './map-initiative.css';
export function InitiativeField({value,label,onCommit}:{value:number|null|undefined;label:string;onCommit:(value:number|null)=>void}){
 const [draft,setDraft]=useState<string|null>(null);
 return <input style={{width:82,minWidth:0,flexShrink:0}} title={label} placeholder="—" aria-label={label} inputMode="decimal" value={draft??value??''} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={()=>{if(draft===null)return;const n=draft.trim()===''?null:Number(draft);if(n===null||(Number.isFinite(n)&&Math.abs(n)<=1000000))onCommit(n);setDraft(null);}}/>;
}
export default function MapInitiative({workspace,scene,campaignId,update,save}:{workspace?:Workspace;scene:Scene;campaignId:string|null;update:(change:(scene:Scene)=>void)=>void;save?:()=>void|Promise<unknown>}){
 const [status,setStatus]=useState(''),[posting,setPosting]=useState(false);
 const sending=useRef(false);
 const current=getCurrentInitiativeEntry(scene),round=getInitiativeRound(scene);
 const eligible=getInitiativeEntries(scene).some(entry=>entry.initiative!==null&&entry.tokens.some(token=>!token.skipInitiative));
 let preview='Set initiative for at least one visible token.';
 if(workspace&&campaignId){try{preview=mapDiscordMessage(workspace,{kind:'initiative',sceneId:scene.id,campaignId}).content;}catch(error){preview=(error as Error).message;}}
 async function send(action:'post'|'update',direction?:-1|1){
  if(sending.current)return;sending.current=true;setPosting(true);setStatus('');
  try{
   if(direction)update(s=>advanceInitiative(s,direction));
   if(direction&&!scene.initiativeLiveDiscord)return;
   if(!save||await save()===false)throw Error('Save this scene successfully before posting initiative.');
   await api('/api/discord/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'initiative',action,sceneId:scene.id,campaignId})});
   setStatus(action==='update'?'Initiative message updated in Discord.':'Initiative posted to Discord.');
  }catch(e){setStatus((e as Error).message);}finally{sending.current=false;setPosting(false);}
 }

 return <section className="map-initiative" aria-label="Initiative tracker">
  <div className="initiative-turn-bar"><strong>Round {round}</strong><span aria-live="polite">Current: {current?`${current.label} (${current.initiative??'—'})`:'No active turn'}</span><div className="initiative-actions"><button type="button" disabled={!eligible||posting} onClick={()=>void send('update',-1)}>Previous</button><button type="button" disabled={!eligible||posting} onClick={()=>void send('update',1)}>Next</button></div></div>
  <details><summary>Post to Discord</summary>{!campaignId&&<p>Move this scene into a campaign to post its initiative to Discord.</p>}
  <button type="button" disabled={!campaignId||posting} onClick={()=>void send('post')}>{posting?'Posting…':'Post initiative to Discord'}</button>
  <label className="initiative-live"><input type="checkbox" checked={scene.initiativeLiveDiscord??false} disabled={!campaignId||posting} onChange={e=>update(s=>{s.initiativeLiveDiscord=e.target.checked;})}/>Update the same message on Previous / Next</label><p>Post once, then turn on updates. Changing the campaign or Discord destination needs a new post.</p>
  <strong className="initiative-preview-label">Preview</strong><pre className="initiative-preview">{preview}</pre></details>{status&&<p role="status">{status}</p>}
 </section>;
}
