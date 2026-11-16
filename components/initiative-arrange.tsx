"use client";
import {useEffect,useRef,useState} from 'react';
import type {Scene,Workspace} from '@/lib/model';
import {conditionAge,getCurrentInitiativeEntry,getInitiativeEntries,getInitiativeRound,reorderInitiative,renameInitiativeGroup,setTokenInitiativeGroup} from '@/lib/initiative-tracker';
import {InitiativeField} from './map-initiative';
import './map-initiative.css';
import TokenFace from './token-face';
import {sceneInitials} from '@/lib/token-initials';
type DragState={kind:'entry'|'token';id:string;pointerId:number;overGroup:string|null};
const groupName=(id:string)=>id.startsWith('group:')?id.slice(6):null;
export function InitiativeArrangeList({workspace,scene,campaignId,update,onSelect,filter=''}:{workspace?:Workspace;scene:Scene;campaignId:string|null;update:(change:(scene:Scene)=>void)=>void;onSelect?:(tokenId:string)=>void;filter?:string}){
 const [pending,setPending]=useState<string[]>([]),[dragging,setDragging]=useState<string|null>(null),[overGroup,setOverGroup]=useState<string|null>(null),[fresh,setFresh]=useState<string|null>(null);
 const drag=useRef<DragState|null>(null),detach=useRef<(()=>void)|null>(null);
 const live=useRef<{over:(e:PointerEvent)=>void;drop:(e:PointerEvent)=>void;end:()=>void}>({over:()=>{},drop:()=>{},end:()=>{}});
 useEffect(()=>()=>detach.current?.(),[]);
 const initials=sceneInitials(scene.tokens.filter(t=>!t.pieceOf));
 const face=(token:Scene['tokens'][number],size:number)=>workspace?<TokenFace token={token} workspace={workspace} campaignId={campaignId} initials={initials.get(token.id)??''} size={size}/>:null;
 const entries=getInitiativeEntries(scene),current=getCurrentInitiativeEntry(scene),round=getInitiativeRound(scene);
 const realGroups=entries.map(e=>groupName(e.id)).filter((g):g is string=>g!==null);
 const pendingOnly=pending.filter(g=>!realGroups.includes(g));
 const groupOptions=[...realGroups,...pendingOnly];
 const needle=filter.trim().toLowerCase();
 const shown=needle?entries.filter(e=>e.label.toLowerCase().includes(needle)||e.tokens.some(t=>t.name.toLowerCase().includes(needle))):entries;
 const patch=(id:string,fn:(t:Scene['tokens'][number])=>void)=>update(s=>{const t=s.tokens.find(x=>x.id===id);if(t)fn(t);});
 function newGroup(){let n=1;const taken=new Set(groupOptions);while(taken.has(`Group ${n}`))n++;setPending(p=>[...p,`Group ${n}`]);setFresh(`Group ${n}`);}
 function join(tokenId:string,group:string){setPending(p=>p.filter(g=>g!==group));update(s=>setTokenInitiativeGroup(s,tokenId,group||undefined));}
 function renameGroup(old:string,next:string){
  const name=next.trim();if(!name||name===old)return;
  if(pending.includes(old)){setPending(p=>p.includes(name)?p.filter(g=>g!==old):p.map(g=>g===old?name:g));}
  if(realGroups.includes(old))update(s=>renameInitiativeGroup(s,old,name));
 }
 function move(id:string,target:string){if(id!==target)update(s=>reorderInitiative(s,id,target));}
 function end(){drag.current=null;detach.current?.();detach.current=null;setDragging(null);setOverGroup(null);}
 // Window listeners, not pointer capture: reordering moves the row, which would drop the capture and end the drag.
 function start(e:React.PointerEvent<HTMLButtonElement>,kind:'entry'|'token',id:string){
  if(e.button!==0)return;e.preventDefault();detach.current?.();
  drag.current={kind,id,pointerId:e.pointerId,overGroup:null};setDragging(id);
  const move=(ev:PointerEvent)=>live.current.over(ev),up=(ev:PointerEvent)=>live.current.drop(ev),cancel=(ev:PointerEvent)=>{if(ev.pointerId===drag.current?.pointerId)live.current.end();};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);
  detach.current=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);};
 }
 function over(e:PointerEvent){
  const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;
  const el=document.elementFromPoint(e.clientX,e.clientY);
  const zone=d.kind==='token'?el?.closest<HTMLElement>('[data-group-row]')?.dataset.groupRow??null:null;
  if(zone!==d.overGroup){d.overGroup=zone;setOverGroup(zone);}
  if(zone!==null)return;
  const target=el?.closest<HTMLElement>('[data-initiative-row]')?.dataset.initiativeRow;
  const ungrouped=d.kind==='token'&&!scene.tokens.find(t=>t.id===d.id)?.initiativeGroup?.trim();
  if((d.kind==='entry'||ungrouped)&&target&&target!==d.id)move(d.id,target);
 }
 function drop(e:PointerEvent){
  const d=drag.current;if(!d||d.pointerId!==e.pointerId){end();return;}
  const el=document.elementFromPoint(e.clientX,e.clientY);
  const row=el?.closest<HTMLElement>('[data-initiative-row]')?.dataset.initiativeRow??null;
  const zone=d.kind==='token'?el?.closest<HTMLElement>('[data-group-row]')?.dataset.groupRow??null:null;
  if(d.kind==='token'){
   const token=scene.tokens.find(t=>t.id===d.id),own=token?.initiativeGroup?.trim()||'';
   if(zone!==null){if(zone!==own)join(d.id,zone);}
   else if(own&&!(row&&row===`group:${own}`)){
    update(s=>{setTokenInitiativeGroup(s,d.id,undefined);if(row&&row!==`group:${own}`)reorderInitiative(s,d.id,row);});
   }
  }
  end();
 }
 useEffect(()=>{live.current={over,drop,end};});
 const handleProps=(kind:'entry'|'token',id:string,label:string)=>({type:'button' as const,className:'initiative-drag-handle',title:label,'aria-label':label,onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>start(e,kind,id),onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='Escape')end();}});
 const conditions=(token:Scene['tokens'][number])=>token.conditions.length>0&&<ul className="initiative-conditions">{token.conditions.map(id=>{const age=conditionAge(token,id,round);return <li key={id}>{workspace?.conditions.find(c=>c.id===id)?.name??id}: {age===null?'age unknown':`${age} completed ${age===1?'round':'rounds'}`}</li>;})}</ul>;
 const nameOf=(token:Scene['tokens'][number])=>{const label=<>{token.name||'Unnamed token'}{token.hidden?' (hidden)':''}</>;return onSelect?<button type="button" className="initiative-token-name" onClick={()=>onSelect(token.id)}>{label}</button>:<span className="initiative-token-name">{label}</span>;};
 const skip=(token:Scene['tokens'][number])=><label className="initiative-skip"><input type="checkbox" checked={token.skipInitiative??false} onChange={e=>patch(token.id,t=>{t.skipInitiative=e.target.checked;})}/>Skip turn</label>;
 const arrows=(entry:{id:string;label:string},index:number)=><><button type="button" aria-label={`Move ${entry.label} up`} disabled={index<=0} onClick={()=>move(entry.id,entries[index-1].id)}>↑</button><button type="button" aria-label={`Move ${entry.label} down`} disabled={index<0||index===entries.length-1} onClick={()=>move(entry.id,entries[index+1].id)}>↓</button></>;
 const rowClass=(id:string)=>`initiative-row${current?.id===id?' is-current':''}${dragging===id?' is-dragging':''}`;
 const groupHeading=(name:string,entryId:string|null,index:number,value:number|null)=><div className="initiative-row-heading">{entryId&&<button {...handleProps('entry',entryId,`Drag group ${name} to reorder`)}>⠿</button>}<GroupNameField label={`Rename group ${name}`} value={name} focus={fresh===name} onCommit={v=>{setFresh(null);renameGroup(name,v);}}/>{entryId&&<span className="initiative-value">{value??'—'}</span>}{entryId&&arrows({id:entryId,label:`group ${name}`},index)}</div>;
 return <div className="initiative-arrange" aria-label="Arrange initiative order">
  <div className="initiative-arrange-tools"><button type="button" onClick={()=>update(s=>{if(s.initiativeState)s.initiativeState.order=[];})}>Sort by initiative</button><button type="button" className="initiative-new-group" onClick={newGroup}>New group</button></div>
  <p className="muted initiative-arrange-hint">Drag a handle or use the arrows to reorder turns. Drop a character anywhere on a group to share its turn.</p>
  <ol className="initiative-rows">
   {shown.map(entry=>{const index=entries.indexOf(entry),gn=groupName(entry.id);
    if(gn===null){const token=entry.tokens[0];return <li key={entry.id} data-initiative-row={entry.id} className={rowClass(entry.id)}>
     <div className="initiative-row-heading"><button {...handleProps('token',token.id,`Drag ${token.name} to reorder or into a group`)}>⠿</button>{face(token,26)}{nameOf(token)}{arrows({id:entry.id,label:token.name},index)}</div>
     <div className="initiative-member-fields"><label className="initiative-init">Init<InitiativeField label={`${token.name} initiative`} value={token.initiative} onCommit={value=>patch(token.id,t=>{t.initiative=value;})}/></label><select aria-label={`${token.name} group`} value="" onChange={e=>{if(e.target.value)join(token.id,e.target.value);}}><option value="">No group</option>{groupOptions.map(g=><option key={g} value={g}>{g}</option>)}</select>{skip(token)}</div>{conditions(token)}
    </li>;}
    return <li key={entry.id} data-initiative-row={entry.id} data-group-row={gn} className={`${rowClass(entry.id)} initiative-group`}>
     {groupHeading(gn,entry.id,index,entry.initiative)}
     <div className={`initiative-group-drop${overGroup===gn?' is-over':''}`} data-group-drop={gn} aria-label={`Group ${gn} members`}>
      {entry.tokens.map(token=><div className="initiative-member" key={token.id}><div className="initiative-member-fields"><button {...handleProps('token',token.id,`Drag ${token.name} out of or between groups`)}>⠿</button>{face(token,24)}{nameOf(token)}<button type="button" className="initiative-leave" aria-label={`Remove ${token.name} from group ${gn}`} title="Remove from group" onClick={()=>update(s=>setTokenInitiativeGroup(s,token.id,undefined))}>×</button><div className="initiative-member-extra"><label className="initiative-init">Init<InitiativeField label={`${token.name} initiative`} value={token.initiative} onCommit={value=>patch(token.id,t=>{t.initiative=value;})}/></label>{skip(token)}</div></div>{conditions(token)}</div>)}
     </div>
    </li>;})}
   {pendingOnly.map(g=><li key={`pending:${g}`} data-group-row={g} className="initiative-row initiative-group is-pending">
    {groupHeading(g,null,-1,null)}
    <div className={`initiative-group-drop${overGroup===g?' is-over':''}`} data-group-drop={g} aria-label={`Group ${g} members`}><p className="initiative-drop-hint">Drag characters here</p><button type="button" aria-label={`Remove empty group ${g}`} onClick={()=>setPending(p=>p.filter(x=>x!==g))}>Remove group</button></div>
   </li>)}
  </ol>
  {entries.length===0&&pendingOnly.length===0&&<p className="empty-small">Add tokens to track initiative.</p>}
 </div>;
}
function GroupNameField({value,label,focus,onCommit}:{value:string;label:string;focus?:boolean;onCommit:(value:string)=>void}){
 const [draft,setDraft]=useState<string|null>(null);
 return <input className="initiative-group-name" aria-label={label} title="Group name" placeholder="Group name" autoFocus={focus} onFocus={e=>{if(focus)e.currentTarget.select();}} maxLength={120} value={draft??value} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.preventDefault();setDraft(null);}}} onBlur={()=>{if(draft!==null)onCommit(draft);setDraft(null);}}/>;
}
