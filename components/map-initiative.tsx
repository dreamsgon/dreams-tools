"use client";
import {useRef,useState} from 'react';
import type {Scene,Workspace} from '@/lib/model';
import {api} from '@/lib/api';
import {mapDiscordMessage} from '@/lib/map-discord-message';
import {advanceInitiative,conditionAge,getCurrentInitiativeEntry,getInitiativeEntries,getInitiativeRound,reorderInitiative} from '@/lib/initiative-tracker';
import './map-initiative.css';
import TokenFace from './token-face';
import {sceneInitials} from '@/lib/token-initials';
export function InitiativeField({value,label,onCommit}:{value:number|null|undefined;label:string;onCommit:(value:number|null)=>void}){
 const [draft,setDraft]=useState<string|null>(null);
 return <input style={{width:82,minWidth:0,flexShrink:0}} title={label} placeholder="—" aria-label={label} inputMode="decimal" value={draft??value??''} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={()=>{if(draft===null)return;const n=draft.trim()===''?null:Number(draft);if(n===null||(Number.isFinite(n)&&Math.abs(n)<=1000000))onCommit(n);setDraft(null);}}/>;
}
function InitiativeGroupField({value,label,onCommit}:{value:string|undefined;label:string;onCommit:(value:string)=>void}){
 const [draft,setDraft]=useState<string|null>(null);
 return <input aria-label={label} maxLength={120} value={draft??value??''} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.preventDefault();setDraft(null);}}} onBlur={()=>{if(draft!==null)onCommit(draft);setDraft(null);}}/>;
}
export default function MapInitiative({workspace,scene,campaignId,update,save}:{workspace?:Workspace;scene:Scene;campaignId:string|null;update:(change:(scene:Scene)=>void)=>void;save?:()=>void|Promise<unknown>}){
 const [status,setStatus]=useState(''),[posting,setPosting]=useState(false),[dragging,setDragging]=useState<string|null>(null);
 const sending=useRef(false);
 const drag=useRef<{id:string;pointerId:number}|null>(null);
 const initials=sceneInitials(scene.tokens.filter(t=>!t.pieceOf));
 const face=(token:Scene['tokens'][number],size:number)=>workspace?<TokenFace token={token} workspace={workspace} campaignId={campaignId} initials={initials.get(token.id)??''} size={size}/>:null;
 const entries=getInitiativeEntries(scene),current=getCurrentInitiativeEntry(scene),round=getInitiativeRound(scene);
 const eligible=entries.some(entry=>entry.initiative!==null&&entry.tokens.some(token=>!token.skipInitiative));
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

 function move(id:string,target:string){if(id!==target)update(s=>reorderInitiative(s,id,target));}
 return <section className="map-initiative" aria-label="Initiative tracker">
  <div className="initiative-turn-bar"><strong>Round {round}</strong><span aria-live="polite">Current: {current?`${current.label} (${current.initiative??'—'})`:'No active turn'}</span><div className="initiative-actions"><button type="button" disabled={!eligible||posting} onClick={()=>void send('update',-1)}>Previous</button><button type="button" disabled={!eligible||posting} onClick={()=>void send('update',1)}>Next</button></div></div>
  <details><summary>Order and settings</summary><p>Drag a handle to reorder turns, or use the arrow buttons. Matching group names share a turn. Skipped tokens remain listed.</p><button type="button" onClick={()=>update(s=>{if(s.initiativeState)s.initiativeState.order=[];})}>Sort by initiative</button>
   <ol className="initiative-rows">{entries.map((entry,index)=><li key={entry.id} data-initiative-row={entry.id} className={`initiative-row${current?.id===entry.id?' is-current':''}${dragging===entry.id?' is-dragging':''}`}>
    <div className="initiative-row-heading"><button type="button" className="initiative-drag-handle" aria-label={`Drag ${entry.label} to reorder`} onPointerDown={e=>{if(e.button!==0)return;drag.current={id:entry.id,pointerId:e.pointerId};setDragging(entry.id);e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current?.pointerId!==e.pointerId)return;const row=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-initiative-row]');const target=row?.dataset.initiativeRow;if(target&&target!==drag.current.id)move(drag.current.id,target);}} onPointerUp={()=>{drag.current=null;setDragging(null);}} onPointerCancel={()=>{drag.current=null;setDragging(null);}} onLostPointerCapture={()=>{drag.current=null;setDragging(null);}} onKeyDown={e=>{if(e.key==='Escape'){drag.current=null;setDragging(null);}}}>⠿</button>{entry.tokens[0]&&face(entry.tokens[0],22)}<strong>{entry.label}</strong><span>{entry.initiative??'—'}</span><button type="button" aria-label={`Move ${entry.label} up`} disabled={index===0} onClick={()=>move(entry.id,entries[index-1].id)}>↑</button><button type="button" aria-label={`Move ${entry.label} down`} disabled={index===entries.length-1} onClick={()=>move(entry.id,entries[index+1].id)}>↓</button></div>
    {entry.tokens.map(token=><div className="initiative-member" key={token.id}><div className="initiative-member-fields"><span>{face(token,18)} {token.name}{token.hidden?' (hidden)':''}</span><InitiativeField label={`${token.name} initiative`} value={token.initiative} onCommit={value=>update(s=>{const t=s.tokens.find(x=>x.id===token.id);if(t)t.initiative=value;})}/><label>Group<InitiativeGroupField label={`${token.name} initiative group`} value={token.initiativeGroup} onCommit={value=>update(s=>{const t=s.tokens.find(x=>x.id===token.id);if(t)t.initiativeGroup=value;})}/></label><label className="initiative-skip"><input type="checkbox" checked={token.skipInitiative??false} onChange={e=>update(s=>{const t=s.tokens.find(x=>x.id===token.id);if(t)t.skipInitiative=e.target.checked;})}/>Skip turn</label></div>{token.conditions.length>0&&<ul className="initiative-conditions">{token.conditions.map(id=>{const age=conditionAge(token,id,round);return <li key={id}>{workspace?.conditions.find(c=>c.id===id)?.name??id}: {age===null?'age unknown':`${age} completed ${age===1?'round':'rounds'}`}</li>;})}</ul>}</div>)}
   </li>)}</ol>{entries.length===0&&<p>Add tokens to track initiative.</p>}
  </details><details><summary>Post to Discord</summary>{!campaignId&&<p>Move this scene into a campaign to post its initiative to Discord.</p>}
  <button type="button" disabled={!campaignId||posting} onClick={()=>void send('post')}>{posting?'Posting…':'Post initiative to Discord'}</button>
  <label className="initiative-live"><input type="checkbox" checked={scene.initiativeLiveDiscord??false} disabled={!campaignId||posting} onChange={e=>update(s=>{s.initiativeLiveDiscord=e.target.checked;})}/>Update the same message on Previous / Next</label><p>Post once, then turn on updates. Changing the campaign or Discord destination needs a new post.</p>
  <strong className="initiative-preview-label">Preview</strong><pre className="initiative-preview">{preview}</pre></details>{status&&<p role="status">{status}</p>}
 </section>;
}
