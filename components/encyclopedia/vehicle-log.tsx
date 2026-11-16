"use client";
/*
 * A vehicle's Log tab (lib/encyclopedia/vehicles.ts): what happened to it, newest first. Each entry has a kind
 * (Voyage, Battle, Repairs, Trade or a Note), an optional in-game date and an eye; players read the shown entries
 * when the GM shares the tab.
 */
import {useState} from 'react';
import {Anchor,Check,Coins,Eye,EyeOff,NotebookPen,Pencil,Plus,Swords,Trash2,Wrench,X} from 'lucide-react';
import {addLog,logKindNames,logKinds,logOps,type LogKind,type PlayerVehicle,type Vehicle} from '@/lib/encyclopedia/vehicles';
import {confirmDialog} from '../confirm-dialog';
import './vehicle-log.css';

const icons:Record<LogKind,typeof Anchor>={note:NotebookPen,voyage:Anchor,battle:Swords,repair:Wrench,trade:Coins};
const when=(at:string)=>{const d=new Date(at);return Number.isNaN(d.getTime())?'':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});};

function KindChip({kind}:{kind:LogKind}){const Icon=icons[kind];return <span className={`vlog-kind k-${kind}`}><Icon size={12} aria-hidden="true"/>{logKindNames[kind]}</span>;}

/** Kind, in-game date and text, for a new entry or a change. */
function LogForm({start,onSave,onCancel}:{start?:{kind:LogKind;day?:string;text:string};onSave:(x:{kind:LogKind;day:string;text:string})=>void;onCancel?:()=>void}){
 const [kind,setKind]=useState<LogKind>(start?.kind??'voyage'),[day,setDay]=useState(start?.day??''),[text,setText]=useState(start?.text??'');
 return <form className="vlog-form" onSubmit={e=>{e.preventDefault();if(!text.trim())return;onSave({kind,day,text});if(!start){setText('');}}}>
  <div className="vlog-form-row">
   <div className="vlog-kinds" role="radiogroup" aria-label="Kind">{logKinds.map(k=>{const Icon=icons[k];return <button type="button" key={k} role="radio" aria-checked={kind===k} className={`vlog-kind k-${k}${kind===k?' on':''}`} onClick={()=>setKind(k)}><Icon size={12} aria-hidden="true"/>{logKindNames[k]}</button>;})}</div>
   <input className="vlog-day" aria-label="In-game date" placeholder="In-game date (optional)" maxLength={40} value={day} onChange={e=>setDay(e.target.value)}/>
  </div>
  <textarea aria-label="What happened" placeholder="What happened: where you sailed, what hit you, what you bought…" maxLength={2000} rows={start?3:2} value={text} onChange={e=>setText(e.target.value)}/>
  <div className="vlog-form-actions">
   {onCancel&&<button type="button" className="button" onClick={onCancel}><X size={14}/> Cancel</button>}
   <button type="submit" className="button primary" disabled={!text.trim()}>{start?<><Check size={14}/> Save</>:<><Plus size={14}/> Add to log</>}</button>
  </div>
 </form>;
}

/** The GM's Log tab. */
export function VehicleLog({vehicle,save}:{vehicle:Vehicle;save:(v:Vehicle)=>void}){
 const [editing,setEditing]=useState<string|null>(null);
 const log=vehicle.log??[];
 return <div className="vehicle-log">
  <LogForm onSave={x=>save(addLog(vehicle,x))}/>
  <ol className="vlog-list">
   {log.map(l=>editing===l.id?<li key={l.id} className="vlog-entry editing"><LogForm start={l} onCancel={()=>setEditing(null)} onSave={x=>{save(logOps.edit(vehicle,l.id,{kind:x.kind,day:x.day.trim()||undefined,text:x.text.trim().slice(0,2000)}));setEditing(null);}}/></li>
    :<li key={l.id} className={`vlog-entry${l.gm?' is-hidden':''}`}>
     <div className="vlog-meta"><KindChip kind={l.kind}/>{l.day&&<strong className="vlog-date">{l.day}</strong>}<span className="muted">{when(l.at)}</span>
      <span className="vlog-tools">
       <button type="button" className={`icon-button vehicle-eye${l.gm?' off':''}`} aria-pressed={!l.gm} aria-label={l.gm?'Show this entry to players':'Hide this entry from players'} title={l.gm?'Players can’t see this':'Players can see this'} onClick={()=>save(logOps.edit(vehicle,l.id,{gm:!l.gm}))}>{l.gm?<EyeOff size={14}/>:<Eye size={14}/>}</button>
       <button type="button" className="icon-button" aria-label="Change this entry" onClick={()=>setEditing(l.id)}><Pencil size={13}/></button>
       <button type="button" className="icon-button" aria-label="Remove this entry" onClick={async()=>{if(await confirmDialog({title:'Remove this log entry?',message:'The entry goes from the log.',confirm:'Remove entry',danger:true}))save(logOps.remove(vehicle,l.id));}}><Trash2 size={13}/></button>
      </span></div>
     <p className="vlog-text">{l.text}</p>
    </li>)}
  </ol>
  {!log.length&&<p className="muted vlog-empty">Nothing logged yet. Note voyages, battles, repairs and trades as they happen.</p>}
 </div>;
}

/** The Log tab on the player pages. */
export function LogReadOnly({log}:{log:NonNullable<PlayerVehicle['logTab']>}){
 return <div className="vehicle-log">
  <ol className="vlog-list">{log.entries.map(l=><li key={l.id} className="vlog-entry">
   <div className="vlog-meta"><KindChip kind={l.kind}/>{l.day&&<strong className="vlog-date">{l.day}</strong>}<span className="muted">{when(l.at)}</span></div>
   <p className="vlog-text">{l.text}</p>
  </li>)}</ol>
  {!log.entries.length&&<p className="muted vlog-empty">Nothing in the log yet.</p>}
 </div>;
}
