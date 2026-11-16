"use client";
/*
 * Trackers on a character (lib/encyclopedia/trackers.ts): Shields, Stress, Ammo… as bars or pips with − and +.
 * CharacterTrackers is the GM's, on the Stats tab, with an eye on each. PlayerTrackers is on the player pages: anyone
 * who can read the character sees the shown ones, and a member who may edit the character changes them and adds their
 * own (POST /api/encyclopedia/player-tracker). Values move at once on screen and are saved a moment later.
 */
import {useEffect,useRef,useState} from 'react';
import {Eye,EyeOff,Minus,Pencil,Plus,Trash2} from 'lucide-react';
import {addTracker,clampMax,clampValue,editTracker,removeTracker,setTrackerValue,trackerColourNames,trackerColours,trackerPresets,trackerStep,maxTrackers,maxTrackerPips,type PlayerTracker,type Tracker,type TrackerColour,type TrackerInput} from '@/lib/encyclopedia/trackers';
import {confirmDialog} from '../confirm-dialog';
import './character-trackers.css';

type Shown=PlayerTracker&{gm?:boolean};

/** One tracker's bar or pips, with its tools beside the number. */
export function TrackerView({t,children}:{t:Shown;children?:React.ReactNode}){
 const low=t.value/t.max<=1/3;
 return <div className={`tracker${t.gm?' is-hidden':''}`}>
  <div className="tracker-top"><span className="tracker-name">{t.label}</span><span className="tracker-num"><strong>{t.value}</strong><small> / {t.max}</small></span>{children}</div>
  {t.shape==='pips'?<div className="tracker-pips" role="img" aria-label={`${t.label}: ${t.value} of ${t.max}`}>{Array.from({length:t.max},(_,i)=><i key={i} className={i<t.value?`on t-${t.colour}`:''}/>)}</div>
   :<div className="tracker-bar" role="img" aria-label={`${t.label}: ${t.value} of ${t.max}`}><i className={`t-${low?'red':t.colour}`} style={{width:`${Math.round(t.value/t.max*100)}%`}}/></div>}
 </div>;
}

/** Name, shape, colour and maximum for a new or changed tracker, with ready-made ones to start from. */
function TrackerForm({start,onSave,onCancel}:{start?:TrackerInput;onSave:(t:TrackerInput)=>void;onCancel:()=>void}){
 const [t,setT]=useState<TrackerInput>(start??{label:'',shape:'pips',colour:'blue',max:3});
 const set=(p:Partial<TrackerInput>)=>setT(x=>{const n={...x,...p};return {...n,max:clampMax(n.max,n.shape)};});
 return <form className="tracker-form" onSubmit={e=>{e.preventDefault();if(t.label.trim())onSave({...t,label:t.label.trim()});}}>
  {!start&&<div className="tracker-presets" aria-label="Start from">{trackerPresets.map(p=><button type="button" key={p.label} className="tracker-preset" onClick={()=>setT(p)}>{p.label}</button>)}</div>}
  <label className="field-label">Name<input autoFocus value={t.label} maxLength={40} placeholder="Shields, Stress, Ammo…" onChange={e=>set({label:e.target.value})}/></label>
  <div className="tracker-form-row">
   <label className="field-label">Shown as<select value={t.shape} onChange={e=>set({shape:e.target.value as 'bar'|'pips'})}><option value="pips">Pips (up to {maxTrackerPips})</option><option value="bar">Bar</option></select></label>
   <label className="field-label">Maximum<input type="number" inputMode="numeric" min={1} max={t.shape==='pips'?maxTrackerPips:1000} value={t.max} onChange={e=>set({max:Number(e.target.value)})}/></label>
   <label className="field-label">Colour<select value={t.colour} onChange={e=>set({colour:e.target.value as TrackerColour})}>{trackerColours.map(c=><option key={c} value={c}>{trackerColourNames[c]}</option>)}</select></label>
  </div>
  <div className="tracker-form-actions"><button type="button" className="button" onClick={onCancel}>Cancel</button><button type="submit" className="button primary" disabled={!t.label.trim()}>{start?'Save':'Add tracker'}</button></div>
 </form>;
}

/** The list with − and +, edit and remove, an optional eye, and Add a tracker. */
function TrackerList({trackers,eyes,busy,onValue,onEdit,onRemove,onAdd,onGm,empty}:{trackers:Shown[];eyes?:boolean;busy?:boolean;onValue:(id:string,v:number)=>void;onEdit:(id:string,t:TrackerInput)=>void;onRemove:(id:string)=>void;onAdd:(t:TrackerInput)=>void;onGm?:(id:string,gm:boolean)=>void;empty:string}){
 const [form,setForm]=useState<string|null>(null);
 return <div className="tracker-list">
  {trackers.map(t=>form===t.id?<TrackerForm key={t.id} start={t} onCancel={()=>setForm(null)} onSave={v=>{onEdit(t.id,v);setForm(null);}}/>:<TrackerView key={t.id} t={t}>
   <button type="button" className="icon-button" aria-label={`Lower ${t.label}`} disabled={busy||t.value<=0} onClick={()=>onValue(t.id,t.value-trackerStep(t))}><Minus size={13}/></button>
   <button type="button" className="icon-button" aria-label={`Raise ${t.label}`} disabled={busy||t.value>=t.max} onClick={()=>onValue(t.id,t.value+trackerStep(t))}><Plus size={13}/></button>
   {eyes&&onGm&&<button type="button" className={`icon-button tracker-eye${t.gm?' off':''}`} aria-pressed={!t.gm} aria-label={t.gm?`Show ${t.label} to players`:`Hide ${t.label} from players`} title={t.gm?'Players can’t see this':'Players can see this'} onClick={()=>onGm(t.id,!t.gm)}>{t.gm?<EyeOff size={14}/>:<Eye size={14}/>}</button>}
   <button type="button" className="icon-button" aria-label={`Change ${t.label}`} disabled={busy} onClick={()=>setForm(t.id)}><Pencil size={13}/></button>
   <button type="button" className="icon-button" aria-label={`Remove ${t.label}`} disabled={busy} onClick={async()=>{if(await confirmDialog({title:`Remove ${t.label}?`,message:'The tracker and its value go.',confirm:'Remove tracker',danger:true}))onRemove(t.id);}}><Trash2 size={13}/></button>
  </TrackerView>)}
  {!trackers.length&&form!=='new'&&<p className="muted tracker-empty">{empty}</p>}
  {form==='new'?<TrackerForm onCancel={()=>setForm(null)} onSave={v=>{onAdd(v);setForm(null);}}/>
   :<button type="button" className="text-button tracker-add" disabled={busy||trackers.length>=maxTrackers} onClick={()=>setForm('new')}><Plus size={14}/> Add a tracker</button>}
 </div>;
}

/** The GM's trackers on a character's Stats tab. */
export function CharacterTrackers({trackers,onChange}:{trackers:Tracker[];onChange:(t:Tracker[])=>void}){
 const safe=(f:()=>Tracker[])=>{try{onChange(f());}catch{/* a tracker that is already gone */}};
 return <section className="character-trackers" aria-label="Trackers">
  <div className="section-heading"><div><h2>Trackers</h2><p className="aside-hint">Shields, stress, ammo… Players see the ones with an open eye when the stats are shared, and the character’s own player can change them.</p></div></div>
  <TrackerList trackers={trackers} eyes empty="No trackers yet."
   onValue={(id,v)=>safe(()=>setTrackerValue(trackers,id,v))} onEdit={(id,t)=>safe(()=>editTracker(trackers,id,t))} onRemove={id=>safe(()=>removeTracker(trackers,id))}
   onAdd={t=>safe(()=>addTracker(trackers,t))} onGm={(id,gm)=>safe(()=>editTracker(trackers,id,{gm}))}/>
 </section>;
}

/** Trackers on the player pages: read only, or changeable on a character this member may edit. */
export function PlayerTrackers({entryId,trackers,memberRef,canEdit,onChanged}:{entryId:string;trackers:PlayerTracker[];memberRef?:string;canEdit:boolean;onChanged:()=>void}){
 const [values,setValues]=useState<Record<string,number>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const timers=useRef<Record<string,ReturnType<typeof setTimeout>>>({});
 const pending=useRef(new Set<string>());
 // A fresh copy from the server replaces the values shown here, except ones still waiting to be saved.
 useEffect(()=>{setValues(x=>Object.fromEntries(Object.entries(x).filter(([id])=>pending.current.has(id))));},[trackers]);
 useEffect(()=>()=>{for(const t of Object.values(timers.current))clearTimeout(t);},[]);
 const shown=trackers.map(t=>t.id in values?{...t,value:values[t.id]!}:t);
 async function send(body:Record<string,unknown>){
  setError('');
  try{const res=await fetch('/api/encyclopedia/player-tracker',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:memberRef,entryId,...body})});
   if(!res.ok){const j=await res.json().catch(()=>({}));setError(j.error||'Could not save the tracker.');return false;}
   return true;}catch{setError('Could not reach the server. Try again.');return false;}
 }
 const act=async(body:Record<string,unknown>)=>{setBusy(true);const ok=await send(body);setBusy(false);if(ok)onChanged();};
 const value=(id:string,v:number)=>{const t=trackers.find(x=>x.id===id);if(!t)return;const n=clampValue(v,t.max);setValues(x=>({...x,[id]:n}));
  clearTimeout(timers.current[id]);pending.current.add(id);timers.current[id]=setTimeout(async()=>{const ok=await send({action:'set',trackerId:id,value:n});pending.current.delete(id);if(ok)onChanged();else setValues(x=>{const {[id]:_,...r}=x;void _;return r;});},500);};
 if(!canEdit||!memberRef)return trackers.length?<section className="player-trackers" aria-label="Trackers"><h2>Trackers</h2><div className="tracker-list">{trackers.map(t=><TrackerView key={t.id} t={t}/>)}</div></section>:null;
 return <section className="player-trackers" aria-label="Trackers"><h2>Trackers</h2>
  <TrackerList trackers={shown} busy={busy} empty="Track shields, stress, ammo or anything else here."
   onValue={value} onEdit={(id,t)=>void act({action:'edit',trackerId:id,tracker:t})} onRemove={id=>void act({action:'remove',trackerId:id})} onAdd={t=>void act({action:'add',tracker:t})}/>
  {error&&<p role="alert" className="form-error">{error}</p>}
 </section>;
}
