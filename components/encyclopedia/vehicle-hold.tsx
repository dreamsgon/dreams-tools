"use client";
/*
 * A vehicle's Hold and Systems tabs (lib/encyclopedia/vehicles.ts). The Hold lists cargo with amounts against the
 * vehicle's capacity, in the type's unit (tonnes, casks, trunks…). Systems lists what the vehicle has (guns, engines,
 * sails, wards…), each Working, Damaged or Offline, with an optional roll that anyone reading it can click.
 * Each line has an eye; players see the tab when the GM shares it, without the lines whose eye is closed.
 */
import {useState} from 'react';
import {Eye,EyeOff,Plus,Trash2} from 'lucide-react';
import {cargoOps,cargoUsed,holdTitle,maxCargo,maxSystems,systemOps,systemStateNames,systemStates,systemsTitle,validRoll,type PlayerVehicle,type SystemState,type Vehicle,type VehicleType} from '@/lib/encyclopedia/vehicles';
import {RollChip} from './rolls';
import {confirmDialog} from '../confirm-dialog';
import './vehicle-hold.css';

function EyeToggle({gm,what,onChange}:{gm:boolean;what:string;onChange:(gm:boolean)=>void}){
 return <button type="button" className={`icon-button vehicle-eye${gm?' off':''}`} aria-pressed={!gm} aria-label={gm?`Show ${what} to players`:`Hide ${what} from players`} title={gm?'Players can’t see this':'Players can see this'} onClick={()=>onChange(!gm)}>{gm?<EyeOff size={14}/>:<Eye size={14}/>}</button>;
}

/** A text box that saves when it loses focus or on Enter, so typing doesn't save every letter. */
function Cell({value,label,className,placeholder,max=80,number,onSave}:{value:string;label:string;className?:string;placeholder?:string;max?:number;number?:boolean;onSave:(v:string)=>void}){
 return <input key={value} className={`hold-cell ${className??''}`} aria-label={label} defaultValue={value} maxLength={max} placeholder={placeholder} inputMode={number?'decimal':undefined}
  onBlur={e=>{const v=e.target.value.trim();if(v!==value)onSave(v);}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>;
}

const amount=(v:string)=>{const n=Number(v.replace(',','.'));return Number.isFinite(n)&&n>=0?Math.min(10_000_000,Math.round(n*100)/100):null;};
const fmt=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:2});

/** How full the hold is: a bar against the capacity, or just the total when there is none. */
function HoldMeter({used,capacity,unit}:{used:number;capacity?:number;unit:string}){
 const over=capacity!==undefined&&used>capacity,share=capacity?Math.min(1,used/capacity):0;
 return <div className={`hold-meter${over?' over':''}`}>
  <div className="hold-meter-top"><span>Carrying</span><span className="hold-meter-num"><strong>{fmt(used)}</strong>{capacity!==undefined&&<small> / {fmt(capacity)}</small>} {unit}</span></div>
  {capacity!==undefined&&<div className="hold-bar" role="img" aria-label={`${fmt(used)} of ${fmt(capacity)} ${unit}${over?', over capacity':''}`}><i style={{width:`${Math.round(share*100)}%`}}/></div>}
  {over&&<small className="hold-over">Over capacity by {fmt(used-capacity!)} {unit}</small>}
 </div>;
}

/** The GM's Hold tab. */
export function VehicleHold({vehicle,type,save}:{vehicle:Vehicle;type:VehicleType;save:(v:Vehicle)=>void}){
 const [name,setName]=useState(''),[qty,setQty]=useState('1');
 const cargo=vehicle.cargo??[],unit=type.holdUnit??'',used=cargoUsed(vehicle);
 const add=()=>{const n=name.trim(),q=amount(qty);if(!n||q===null)return;save(cargoOps.add(vehicle,{name:n.slice(0,80),qty:q}));setName('');setQty('1');};
 return <div className="vehicle-hold">
  <div className="hold-summary">
   <label className="field-label hold-capacity"><span>Capacity{unit&&<small> ({unit})</small>}</span>
    <Cell value={vehicle.capacity===undefined?'':String(vehicle.capacity)} label="Capacity" number placeholder="No limit" max={12} onSave={v=>{const next={...vehicle};const n=v?amount(v):null;if(n===null)delete next.capacity;else next.capacity=n;save(next);}}/></label>
   <HoldMeter used={used} capacity={vehicle.capacity} unit={unit}/>
  </div>
  <div className="hold-rows" role="list" aria-label={holdTitle(type)}>
   {cargo.map(c=><div role="listitem" key={c.id} className={`hold-row${c.gm?' is-hidden':''}`}>
    <Cell value={String(c.qty)} label={`Amount of ${c.name}`} className="hold-qty" number max={12} onSave={v=>{const n=amount(v);if(n!==null)save(cargoOps.edit(vehicle,c.id,{qty:n}));}}/>
    <span className="hold-unit">{unit}</span>
    <Cell value={c.name} label="Cargo" className="hold-name" onSave={v=>{if(v)save(cargoOps.edit(vehicle,c.id,{name:v}));}}/>
    <Cell value={c.note??''} label={`Note on ${c.name}`} className="hold-note" placeholder="Note" max={160} onSave={v=>save(cargoOps.edit(vehicle,c.id,{note:v||undefined}))}/>
    <EyeToggle gm={!!c.gm} what={c.name} onChange={gm=>save(cargoOps.edit(vehicle,c.id,{gm}))}/>
    <button type="button" className="icon-button" aria-label={`Remove ${c.name}`} onClick={()=>save(cargoOps.remove(vehicle,c.id))}><Trash2 size={13}/></button>
   </div>)}
   {!cargo.length&&<p className="muted hold-empty">Nothing aboard yet.</p>}
  </div>
  <form className="hold-add" onSubmit={e=>{e.preventDefault();add();}}>
   <input aria-label="Amount" className="hold-cell hold-qty" inputMode="decimal" value={qty} onChange={e=>setQty(e.target.value)}/>
   <input aria-label="New cargo" className="hold-cell hold-name" placeholder="Add cargo: spice, rations, passengers’ trunks…" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/>
   <button type="submit" className="button" disabled={!name.trim()||amount(qty)===null||cargo.length>=maxCargo}><Plus size={14}/> Add</button>
  </form>
 </div>;
}

const stateClass=(s:SystemState)=>`sys-state s-${s}`;

/** A roll box that only saves dice the roller understands, and shows the roll button next to it. */
function RollCell({value,title,onSave}:{value:string;title:string;onSave:(v:string)=>void}){
 const [bad,setBad]=useState(false);
 return <span className="sys-roll">
  <input key={value} className={`hold-cell sys-roll-input${bad?' bad':''}`} aria-label={`Roll for ${title}`} aria-invalid={bad} title={bad?'Use dice like 2d6+1 or 1d20+5':'Dice to roll, like 2d6+1'} defaultValue={value} maxLength={100} placeholder="Roll: 2d6"
   onBlur={e=>{const v=e.target.value.trim();if(v&&!validRoll(v)){setBad(true);return;}setBad(false);if(v!==value)onSave(v);}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>
  {value&&!bad&&<RollChip title={title} formula={value} label={null}/>}
 </span>;
}

/** The GM's Systems tab. */
export function VehicleSystems({vehicle,type,save,vehicleName}:{vehicle:Vehicle;type:VehicleType;save:(v:Vehicle)=>void;vehicleName:string}){
 const [name,setName]=useState('');
 const systems=vehicle.systems??[];
 const add=()=>{const n=name.trim();if(!n)return;save(systemOps.add(vehicle,{name:n.slice(0,60),state:'ok'}));setName('');};
 return <div className="vehicle-systems">
  <div className="sys-rows" role="list" aria-label={systemsTitle(type)}>
   {systems.map(x=><div role="listitem" key={x.id} className={`sys-row${x.gm?' is-hidden':''}`}>
    <Cell value={x.name} label="System" className="sys-name" max={60} onSave={v=>{if(v)save(systemOps.edit(vehicle,x.id,{name:v}));}}/>
    <select className={stateClass(x.state)} aria-label={`State of ${x.name}`} value={x.state} onChange={e=>save(systemOps.edit(vehicle,x.id,{state:e.target.value as SystemState}))}>{systemStates.map(s=><option key={s} value={s}>{systemStateNames[s]}</option>)}</select>
    <RollCell value={x.roll??''} title={`${vehicleName} · ${x.name}`} onSave={v=>save(systemOps.edit(vehicle,x.id,{roll:v||undefined}))}/>
    <Cell value={x.note??''} label={`Note on ${x.name}`} className="sys-note" placeholder="Note: range, ammo, what's wrong…" max={160} onSave={v=>save(systemOps.edit(vehicle,x.id,{note:v||undefined}))}/>
    <span className="sys-tools">
     <EyeToggle gm={!!x.gm} what={x.name} onChange={gm=>save(systemOps.edit(vehicle,x.id,{gm}))}/>
     <button type="button" className="icon-button" aria-label={`Remove ${x.name}`} onClick={async()=>{if(await confirmDialog({title:`Remove ${x.name}?`,message:'The system, its roll and its note go.',confirm:'Remove system',danger:true}))save(systemOps.remove(vehicle,x.id));}}><Trash2 size={13}/></button>
    </span>
   </div>)}
   {!systems.length&&<p className="muted hold-empty">No systems yet. Add weapons, engines, sails, wards… with a roll for each.</p>}
  </div>
  <form className="hold-add" onSubmit={e=>{e.preventDefault();add();}}>
   <input aria-label="New system" className="hold-cell sys-name" placeholder="Add a system: laser battery, mainsail, lift crystal…" maxLength={60} value={name} onChange={e=>setName(e.target.value)}/>
   <button type="submit" className="button" disabled={!name.trim()||systems.length>=maxSystems}><Plus size={14}/> Add</button>
  </form>
 </div>;
}

/** The Hold tab on the player pages. */
export function HoldReadOnly({hold}:{hold:NonNullable<PlayerVehicle['holdTab']>}){
 return <div className="vehicle-hold">
  <div className="hold-summary"><HoldMeter used={hold.used} capacity={hold.capacity} unit={hold.unit}/></div>
  <div className="hold-rows" role="list">
   {hold.cargo.map(c=><div role="listitem" key={c.id} className="hold-row read">
    <span className="hold-qty-read">{fmt(c.qty)} <small>{hold.unit}</small></span><strong className="hold-name">{c.name}</strong>{c.note&&<span className="hold-note muted">{c.note}</span>}
   </div>)}
   {!hold.cargo.length&&<p className="muted hold-empty">Nothing aboard.</p>}
  </div>
 </div>;
}

/** The Systems tab on the player pages, with the rolls ready to click. */
export function SystemsReadOnly({systems,vehicleName}:{systems:NonNullable<PlayerVehicle['systemsTab']>;vehicleName:string}){
 return <div className="vehicle-systems">
  <div className="sys-rows" role="list">
   {systems.systems.map(x=><div role="listitem" key={x.id} className="sys-row read">
    <strong className="sys-name">{x.name}</strong><span className={stateClass(x.state)}>{systemStateNames[x.state]}</span>
    {x.roll&&<span className="sys-roll"><RollChip title={`${vehicleName} · ${x.name}`} formula={x.roll} label={x.roll}/></span>}
    {x.note&&<span className="sys-note muted">{x.note}</span>}
   </div>)}
   {!systems.systems.length&&<p className="muted hold-empty">Nothing listed.</p>}
  </div>
 </div>;
}
