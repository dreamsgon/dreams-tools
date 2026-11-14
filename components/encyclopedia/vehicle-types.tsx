"use client";
/*
 * The vehicle types editor: a world's own kinds of ship, airship, carriage, car… Each type sets its silhouette, what
 * its commander and Crew tab are called, its stats, gauges, Right now fields, stations and unnamed counts. The world
 * starts with the five ready-made types; the first save keeps a copy of them that is the world's own from then on.
 * Changes are a draft until Save, which tidies every vehicle of the world (vehicles.ts saveVehicleTypes).
 */
import {useState,type ReactNode} from 'react';
import {ArrowDown,ArrowUp,Copy,Eye,EyeOff,Pin,PinOff,Plus,Trash2} from 'lucide-react';
import type {Workspace} from '@/lib/encyclopedia/world-model';
import {blankVehicleType,copyVehicleType,gaugeColours,maxGauges,maxHands,maxNow,maxPips,maxSpecs,maxStations,maxVehicleTypes,saveVehicleTypes,typeFieldId,typeUse,vehicleArts,vehicleTypesOf,vehicleTypesSchema,type VehicleType} from '@/lib/encyclopedia/vehicles';
import {ToolDialog} from './tool-dialog';
import {VehicleArtIcon} from './vehicle-art';
import {confirmDialog} from '../confirm-dialog';
import './vehicle-types.css';

const artNames:Record<string,string>={starship:'Starship',sail:'Sailing ship',airship:'Airship',carriage:'Carriage',car:'Car',mech:'Walker'};
const colourNames:Record<string,string>={hull:'Green',shield:'Blue',fuel:'Amber',other:'Purple'};
type Part='specs'|'gauges'|'now'|'stations'|'hands';

/** One list of fields: a row per field, move up or down, remove, and add. */
function Rows<T extends {id:string;label:string}>({title,hint,items,max,add,set,children}:{title:string;hint?:string;items:T[];max:number;add:()=>void;set:(items:T[])=>void;children:(item:T,patch:(p:Partial<T>)=>void)=>ReactNode}){
 const move=(i:number,d:number)=>{const next=[...items];[next[i],next[i+d]]=[next[i+d]!,next[i]!];set(next);};
 return <section className="vt-section"><div className="vt-section-head"><h3>{title}</h3>{hint&&<small className="muted">{hint}</small>}</div>
  {items.map((it,i)=><div className="vt-row" key={it.id}>
   <input className="vt-label" aria-label={`${title}: name`} value={it.label} maxLength={40} onChange={e=>set(items.map(x=>x.id===it.id?{...x,label:e.target.value}:x))}/>
   {children(it,p=>set(items.map(x=>x.id===it.id?{...x,...p}:x)))}
   <span className="vt-row-tools">
    <button type="button" className="icon-button" aria-label={`Move ${it.label} up`} disabled={i===0} onClick={()=>move(i,-1)}><ArrowUp size={13}/></button>
    <button type="button" className="icon-button" aria-label={`Move ${it.label} down`} disabled={i===items.length-1} onClick={()=>move(i,1)}><ArrowDown size={13}/></button>
    <button type="button" className="icon-button" aria-label={`Remove ${it.label}`} onClick={()=>set(items.filter(x=>x.id!==it.id))}><Trash2 size={13}/></button>
   </span>
  </div>)}
  <button type="button" className="text-button vt-add" disabled={items.length>=max} onClick={add}><Plus size={14}/> Add</button>
 </section>;
}

const eye=(gm:boolean|undefined,what:string,set:(gm:boolean|undefined)=>void)=><button type="button" className={`icon-button vt-eye${gm?' off':''}`} aria-pressed={!gm} aria-label={gm?`New vehicles show ${what} to players`:`New vehicles hide ${what}`} title={gm?'Starts hidden from players':'Starts shown to players'} onClick={()=>set(gm?undefined:true)}>{gm?<EyeOff size={14}/>:<Eye size={14}/>}</button>;

/** The fields of one type. */
function TypeForm({t,set}:{t:VehicleType;set:(t:VehicleType)=>void}){
 const ids=(p:Part)=>t[p].map(x=>x.id);
 const patch=(p:Partial<VehicleType>)=>set({...t,...p});
 return <div className="vt-form">
  <div className="vt-basics">
   <label className="field-label">Name<input value={t.name} maxLength={40} onChange={e=>patch({name:e.target.value})}/></label>
   <label className="field-label">One of them is a<input value={t.one} maxLength={30} placeholder="Ship, Coach, Mech…" onChange={e=>patch({one:e.target.value})}/></label>
   <label className="field-label">Commander<input value={t.commander} maxLength={30} placeholder="Captain, Driver…" onChange={e=>patch({commander:e.target.value})}/></label>
   <label className="field-label">Crew tab<input value={t.crew} maxLength={30} placeholder="Crew, Retinue, Passengers…" onChange={e=>patch({crew:e.target.value})}/></label>
  </div>
  <div className="vt-arts" role="radiogroup" aria-label="Outline">{vehicleArts.map(a=><button type="button" role="radio" aria-checked={t.art===a} key={a} className={`vt-art${t.art===a?' on':''}`} onClick={()=>patch({art:a})} title={artNames[a]}><VehicleArtIcon art={a} size={44}/><span>{artNames[a]}</span></button>)}</div>
  <Rows title="Gauges" hint={`Bars or pips (up to ${maxPips}); new vehicles start full`} items={t.gauges} max={maxGauges} set={gauges=>patch({gauges})}
   add={()=>patch({gauges:[...t.gauges,{id:typeFieldId('gauge',ids('gauges')),label:'New gauge',shape:'bar',colour:'other',max:10}]})}>
   {(g,p)=><>
    <select aria-label={`${g.label}: shown as`} value={g.shape} onChange={e=>{const shape=e.target.value as 'bar'|'pips';p({shape,max:shape==='pips'?Math.min(g.max,maxPips):g.max});}}><option value="bar">Bar</option><option value="pips">Pips</option></select>
    <input className="vt-num" aria-label={`${g.label}: maximum`} type="number" inputMode="numeric" min={1} max={g.shape==='pips'?maxPips:100000} value={g.max} onChange={e=>p({max:Math.max(1,Math.min(g.shape==='pips'?maxPips:100000,Math.round(Number(e.target.value)||1)))})}/>
    <input className="vt-unit" aria-label={`${g.label}: unit`} placeholder="unit" maxLength={16} value={g.unit??''} onChange={e=>p({unit:e.target.value||undefined})}/>
    <select aria-label={`${g.label}: colour`} value={g.colour} onChange={e=>p({colour:e.target.value as VehicleType['gauges'][number]['colour']})}>{gaugeColours.map(c=><option key={c} value={c}>{colourNames[c]}</option>)}</select>
    {eye(g.gm,g.label,gm=>p({gm}))}
   </>}
  </Rows>
  <Rows title="At a glance" hint="Stats such as Model, Class or Masts" items={t.specs} max={maxSpecs} set={specs=>patch({specs})}
   add={()=>patch({specs:[...t.specs,{id:typeFieldId('stat',ids('specs')),label:'New stat',kind:'text'}]})}>
   {(f,p)=><><select aria-label={`${f.label}: kind`} value={f.kind} onChange={e=>p({kind:e.target.value as 'text'|'number'})}><option value="text">Words</option><option value="number">Number</option></select>{eye(f.gm,f.label,gm=>p({gm}))}</>}
  </Rows>
  <Rows title="Right now" hint="What it is doing at the moment" items={t.now} max={maxNow} set={now=>patch({now})}
   add={()=>patch({now:[...t.now,{id:typeFieldId('now',ids('now')),label:'New field'}]})}>
   {(f,p)=>eye(f.gm,f.label,gm=>p({gm}))}
  </Rows>
  <Rows title="Stations" hint="Pinned ones show on the picture; each vehicle can change its own" items={t.stations} max={maxStations} set={stations=>patch({stations})}
   add={()=>patch({stations:[...t.stations,{id:typeFieldId('station',ids('stations')),label:'New station',pic:false}]})}>
   {(s,p)=><button type="button" className={`icon-button vt-pin${s.pic?' on':''}`} aria-pressed={s.pic} aria-label={s.pic?`${s.label}: on the picture`:`${s.label}: Crew tab only`} title={s.pic?'On the picture':'Crew tab only'} onClick={()=>p({pic:!s.pic})}>{s.pic?<Pin size={14}/>:<PinOff size={14}/>}</button>}
  </Rows>
  <Rows title="Unnamed counts" hint="Such as Marines or Outriders" items={t.hands} max={maxHands} set={hands=>patch({hands})}
   add={()=>patch({hands:[...t.hands,{id:typeFieldId('hands',ids('hands')),label:'New count'}]})}>
   {()=>null}
  </Rows>
 </div>;
}

/** The dialog: types on the left, the chosen one on the right, Save writes them all to the world. */
export function VehicleTypesDialog({data,worldId,start,change,onClose}:{data:Workspace;worldId:string;start?:string;change:(f:(latest:Workspace)=>Workspace)=>boolean|void;onClose:()=>void}){
 const world=data.worlds.find(w=>w.id===worldId),[types,setTypes]=useState<VehicleType[]>(()=>structuredClone(vehicleTypesOf(world)));
 const [pick,setPick]=useState(start&&types.some(t=>t.id===start)?start:types[0]!.id),[error,setError]=useState('');
 const use=typeUse(data.entries,worldId,vehicleTypesOf(world)),t=types.find(x=>x.id===pick)??types[0]!;
 const setType=(n:VehicleType)=>setTypes(l=>l.map(x=>x.id===n.id?n:x));
 const add=(n:VehicleType)=>{setTypes(l=>[...l,n]);setPick(n.id);};
 async function remove(){
  const n=use[t.id]??0;
  if(types.length<=1)return;
  if(!await confirmDialog({title:`Delete ${t.name}?`,message:n?`${n} vehicle${n===1?' uses':'s use'} it. They become ${types.find(x=>x.id!==t.id)!.name.toLowerCase()}s and keep the values whose names match.`:'No vehicle uses it.',confirm:'Delete type',danger:true}))return;
  const rest=types.filter(x=>x.id!==t.id);setTypes(rest);setPick(rest[0]!.id);
 }
 function save(){
  const clean=types.map(x=>({...x,name:x.name.trim(),one:x.one.trim(),commander:x.commander.trim(),crew:x.crew.trim(),specs:x.specs.map(f=>({...f,label:f.label.trim()})),gauges:x.gauges.map(({unit,...f})=>({...f,label:f.label.trim(),...(unit?.trim()?{unit:unit.trim()}:{})})),now:x.now.map(f=>({...f,label:f.label.trim()})),stations:x.stations.map(f=>({...f,label:f.label.trim()})),hands:x.hands.map(f=>({...f,label:f.label.trim()}))}));
  const blank=clean.find(x=>!x.name||!x.one||!x.commander||!x.crew||[...x.specs,...x.gauges,...x.now,...x.stations,...x.hands].some(f=>!f.label));
  if(blank){setPick(blank.id);setError(`Every name in ${blank.name||'this type'} needs filling in.`);return;}
  const parsed=vehicleTypesSchema.safeParse(clean);
  if(!parsed.success){setError(parsed.error.issues[0]?.message??'These types can’t be saved.');return;}
  if(change(latest=>{const r=saveVehicleTypes(latest.worlds,latest.entries,worldId,parsed.data);return {...latest,worlds:r.worlds,entries:r.entries};})!==false)onClose();
  else setError('Could not save. Try again.');
 }
 return <ToolDialog title="Vehicle types" wide onClose={onClose}>
  <div className="vt-layout">
   <nav className="vt-list" aria-label="Types">
    {types.map(x=><button type="button" key={x.id} className={`vt-item${x.id===t.id?' on':''}`} aria-current={x.id===t.id} onClick={()=>setPick(x.id)}><VehicleArtIcon art={x.art} size={30}/><span><strong>{x.name||'Unnamed'}</strong><small>{use[x.id]?`${use[x.id]} in use`:'Not used yet'}</small></span></button>)}
    <div className="vt-list-tools">
     <button type="button" className="text-button" disabled={types.length>=maxVehicleTypes} onClick={()=>add(blankVehicleType(types.map(x=>x.id)))}><Plus size={14}/> New type</button>
     <button type="button" className="text-button" disabled={types.length>=maxVehicleTypes} onClick={()=>add(copyVehicleType(t,types.map(x=>x.id)))}><Copy size={14}/> Copy {t.name||'this'}</button>
     <button type="button" className="text-button danger-text" disabled={types.length<=1} onClick={()=>void remove()}><Trash2 size={14}/> Delete {t.name||'this'}</button>
    </div>
   </nav>
   <TypeForm key={t.id} t={t} set={setType}/>
  </div>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="builder-footer"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={save}>Save types</button></div>
 </ToolDialog>;
}
