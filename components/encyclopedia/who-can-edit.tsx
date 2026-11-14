'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Users,Lock,X} from 'lucide-react';
import type {Entry} from '@/lib/encyclopedia/world-model';
import type {MembersView} from '../campaign-members';
import {memberRef} from './member-view';

/**
 * Who can edit a page, set on the page (the GM only): people and groups from the campaign's members. Groups that
 * may edit every page (the grid's "Edit Encyclopedia pages") show as already able to. Saved as each switch changes.
 */
type Access={people:Record<string,{edit:boolean;subPages:boolean}>;groups:Record<string,boolean>};
const none:Access={people:{},groups:{}};
const avatarColors=['#5a3f8f','#2f5a8a','#3f6a4f','#8a5a2a','#8a2f4f','#2f6a6a'];
function Face({name,seed}:{name:string;seed:string}){return <span className="who-face" style={{background:avatarColors[[...seed].reduce((a,c)=>a+c.charCodeAt(0),0)%avatarColors.length]}} aria-hidden="true">{[...name.trim()][0]?.toUpperCase()??'?'}</span>;}
function Switch({on,label,disabled,set}:{on:boolean;label:string;disabled?:boolean;set:(v:boolean)=>void}){return <label className="who-switch"><input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={e=>set(e.target.checked)}/><span aria-hidden="true"/>{label}</label>;}

export function WhoCanEdit({entry,campaignId}:{entry:Entry;campaignId:string}){
 const [view,setView]=useState<MembersView|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[adding,setAdding]=useState('');
 const box=useRef<HTMLDivElement>(null),co=!!memberRef();
 useEffect(()=>{if(co)return;let live=true;fetch(`/api/members?campaignId=${encodeURIComponent(campaignId)}`,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(live&&v)setView(v as MembersView);}).catch(()=>{});return()=>{live=false;};},[campaignId,co]);
 useEffect(()=>{if(!open)return;const away=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);},key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('mousedown',away);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',away);document.removeEventListener('keydown',key);};},[open]);
 if(co||!view)return null;
 const access:Access=view.pages?.[entry.id]??none,people=Object.keys(access.people),groupsOn=Object.keys(access.groups).filter(g=>access.groups[g]);
 const everyPage=view.groups.filter(g=>g.perms.editPages==='yes'),never=(groups:string[],k:'editPages'|'addSubPages'|'editOwnCharacter')=>groups.some(id=>view.groups.find(g=>g.id===id)?.perms[k]==='never');
 const yes=(groups:string[],k:'addSubPages'|'editOwnCharacter')=>groups.some(id=>view.groups.find(g=>g.id===id)?.perms[k]==='yes');
 const count=people.length+groupsOn.length;
 async function save(next:Access){setBusy(true);setError('');try{const r=await fetch('/api/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pageAccess',campaignId,pageId:entry.id,...next})});const v=await r.json();if(!r.ok)throw new Error(v.error??'Could not save.');setView(v as MembersView);}catch(e){setError(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}}
 const person=(userId:string,patch:Partial<{edit:boolean;subPages:boolean}>)=>save({...access,people:{...access.people,[userId]:{...access.people[userId],...patch}}});
 const drop=(userId:string)=>save({...access,people:Object.fromEntries(Object.entries(access.people).filter(([u])=>u!==userId))});
 function add(){const [kind,id]=adding.split(':');setAdding('');if(kind==='g'){void save({...access,groups:{...access.groups,[id]:true}});return;}
  // Their groups' grid says whether a new person starts able to edit a character and add sub-pages.
  const m=view!.members.find(x=>x.userId===id);if(!m)return;void save({...access,people:{...access.people,[id]:{edit:entry.kind!=='character'||yes(m.groups,'editOwnCharacter'),subPages:yes(m.groups,'addSubPages')}}});}
 const groupName=(id:string)=>view.groups.find(g=>g.id===id)?.name??'';
 const otherGroups=view.groups.filter(g=>g.perms.editPages!=='yes'&&g.perms.editPages!=='never'&&!groupsOn.includes(g.id));
 const otherPeople=view.members.filter(m=>!people.includes(m.userId)&&!never(m.groups,'editPages'));
 const shared=entry.overviewVisibility==='players';
 return <div className="who-can-edit" ref={box}>
  <button className={`who-button${count?' on':''}`} aria-expanded={open} onClick={()=>setOpen(!open)}><Users size={13}/> Who can edit{count?` · ${count}`:''}</button>
  {open&&<div className="who-pop" role="dialog" aria-label={`Who can edit ${entry.title}`}>
   <div className="who-head"><strong>Who can edit {entry.title}</strong><small>{shared?'Players can see this page.':'Only you and co-GMs can see this page; anyone you add here can see it too.'} Editing is set here, page by page.</small></div>
   {!view.members.length?<p className="who-empty">No one has joined this campaign yet. Invite people from the campaign&apos;s <Link href={`/campaigns/${encodeURIComponent('e:'+campaignId)}?tab=members`}>Members tab</Link>.</p>:<>
   {everyPage.map(g=><div key={g.id} className="who-row"><span className={`who-chip c-${g.color}`}>{g.name}</span><span className="who-fixed"><Lock size={12}/> Can edit, from their group</span></div>)}
   {people.map(u=>{const m=view.members.find(x=>x.userId===u);if(!m)return null;const a=access.people[u],noSub=never(m.groups,'addSubPages');
    return <div key={u} className="who-row who-person"><Face name={m.name} seed={u}/><span className="who-name"><b>{m.name}</b><small>{entry.kind==='character'&&a.edit?`Plays ${entry.title}`:m.groups.map(groupName).filter(Boolean).join(', ')}</small></span>
     <span className="who-switches"><Switch on={a.edit} label="Can edit" disabled={busy} set={v=>void person(u,{edit:v})}/><Switch on={a.subPages&&!noSub} label="Can add sub-pages" disabled={busy||noSub} set={v=>void person(u,{subPages:v})}/></span>
     <button className="who-drop" aria-label={`Take ${m.name} off this page`} disabled={busy} onClick={()=>void drop(u)}><X size={13}/></button></div>;})}
   {groupsOn.map(g=><div key={g} className="who-row"><span className={`who-chip c-${view.groups.find(x=>x.id===g)?.color??'gray'}`}>{groupName(g)}</span><Switch on label="Can edit" disabled={busy} set={v=>void save({...access,groups:{...access.groups,[g]:v}})}/></div>)}
   {(otherPeople.length>0||otherGroups.length>0)&&<div className="who-add"><select aria-label="Add a person or group" value={adding} onChange={e=>setAdding(e.target.value)}><option value="">Add a person or group</option>{otherPeople.length>0&&<optgroup label="People">{otherPeople.map(m=><option key={m.userId} value={`p:${m.userId}`}>{m.name}</option>)}</optgroup>}{otherGroups.length>0&&<optgroup label="Groups">{otherGroups.map(g=><option key={g.id} value={`g:${g.id}`}>{g.name}</option>)}</optgroup>}</select><button className="button small" disabled={!adding||busy} onClick={add}>Add</button></div>}
   <p className="who-note">Sub-pages they add sit inside {entry.title} and start for them and the GMs only. They choose which of them players can see. You can always see and edit them. They edit from their player pages.</p></>}
   {error&&<p className="who-error" role="alert">{error}</p>}
  </div>}
 </div>;
}

/** "Last edited by Mara (player) · 2 hours ago", when a co-GM or player changed the page last. */
export function EditedBy({entry}:{entry:Entry}){
 const [now]=useState(()=>Date.now());
 if(!entry.editedBy)return null;
 const mins=Math.max(0,Math.round((now-Date.parse(entry.updatedAt))/60000));
 const ago=mins<1?'just now':mins<60?`${mins} min ago`:mins<1440?`${Math.round(mins/60)} h ago`:mins<2880?'yesterday':new Date(entry.updatedAt).toLocaleDateString(undefined,{day:'numeric',month:'short'});
 return <span className="edited-by">Last edited by {entry.editedBy.name} ({entry.editedBy.as==='co-gm'?'co-GM':'player'}) · {ago}</span>;
}
