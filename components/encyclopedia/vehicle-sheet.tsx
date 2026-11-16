"use client";
/*
 * A vehicle's Overview tab: owner and commander on the left, the picture (or its type's silhouette) and where it is in
 * the middle, and its condition gauges, stats and Right now on the right. Every value has its own eye for players.
 * The read-only version for the player site is VehicleReadOnly.
 */
import {useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowUpRight,Compass,Crown,Dices,Settings2,Eye,EyeOff,ImagePlus,MapPin,Minus,Plus,Shield,Trash2} from 'lucide-react';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {changeType,gaugeRows,gaugeStep,newVehicle,nowRows,setGauge,setGm,setValue,specRows,vehicleTypeOf,vehicleTypesOf,type GaugeColour,type PlayerVehicle,type Vehicle} from '@/lib/encyclopedia/vehicles';
import {newPicture} from '@/lib/encyclopedia/picture';
import {uploadMapImage} from './map-transfer';
import {usePictureSrc} from './character-picture';
import {PageSlot} from './quest-facts';
import {TargetPicker} from './quest-goals';
import {VehicleArtIcon} from './vehicle-art';
import {VehicleTypesDialog} from './vehicle-types';
import {VehicleGenerator} from './vehicle-generator';
import {SeatCards,SeatCardsReadOnly,SeatPins,VehicleCrew,pinsOf} from './vehicle-crew';
import {confirmDialog} from '../confirm-dialog';
import './quest-facts.css';
import './vehicle-sheet.css';

const isWho=(e:Entry)=>e.kind==='character'||e.kind==='faction';
const isPlace=(e:Entry)=>e.kind==='place'||e.kind==='map';

/** An eye that shows or hides one value from players. */
function EyeToggle({gm,what,onChange}:{gm:boolean;what:string;onChange:(gm:boolean)=>void}){
 return <button type="button" className={`icon-button vehicle-eye${gm?' off':''}`} aria-pressed={!gm} aria-label={gm?`Show ${what} to players`:`Hide ${what} from players`} title={gm?'Players can’t see this':'Players can see this'} onClick={()=>onChange(!gm)}>{gm?<EyeOff size={14}/>:<Eye size={14}/>}</button>;
}

/** One gauge: a bar or a row of pips, with − and + for the GM. */
export function GaugeView({label,shape,colour,value,max,unit,gm,children}:{label:string;shape:'bar'|'pips';colour:GaugeColour;value:number;max:number;unit?:string;gm?:boolean;children?:ReactNode}){
 const low=value/max<=1/3;
 return <div className={`vehicle-gauge${gm?' is-hidden':''}`}>
  <div className="vehicle-gauge-top"><span className="vehicle-gauge-name">{label}{low&&<span className="vehicle-low">Low</span>}</span><span className="vehicle-gauge-num"><strong>{value}</strong><small> / {max}{unit?` ${unit}`:''}</small></span>{children}</div>
  {shape==='pips'?<div className="vehicle-pips" role="img" aria-label={`${label}: ${value} of ${max}`}>{Array.from({length:max},(_,i)=><i key={i} className={i<value?`on g-${colour}`:''}/>)}</div>
   :<div className="vehicle-bar" role="img" aria-label={`${label}: ${value} of ${max}`}><i className={low?'g-low':`g-${colour}`} style={{width:`${Math.round(value/max*100)}%`}}/></div>}
 </div>;
}

/** A labelled value the GM types into, saved when the box loses focus. */
function ValueBox({label,value,kind,gm,onSave,onGm}:{label:string;value:string;kind:'text'|'number';gm:boolean;onSave:(v:string)=>void;onGm:(gm:boolean)=>void}){
 return <div className={`vehicle-spec${gm?' is-hidden':''}`}>
  <div className="vehicle-spec-label"><span>{label}</span><EyeToggle gm={gm} what={label} onChange={onGm}/></div>
  <input key={value} className="vehicle-spec-input" aria-label={label} defaultValue={value} maxLength={200} inputMode={kind==='number'?'decimal':undefined} placeholder="—" onBlur={e=>{const v=e.target.value.trim();if(v!==value)onSave(v);}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>
 </div>;
}

/** The middle: the vehicle's picture, or its type's silhouette with a button to add one. */
function VehiclePicture({entry,art,update,pins}:{entry:Entry;art:Parameters<typeof VehicleArtIcon>[0]['art'];update:(p:Partial<Entry>)=>void;pins?:ReactNode}){
 const picture=entry.picture,{src,failed}=usePictureSrc(picture?.imageId),file=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function upload(f:File){setBusy(true);setError('');try{const image=await uploadMapImage(f);update({picture:newPicture(image.imageId,image.imageWidth,image.imageHeight)});}catch(e){setError(e instanceof Error?e.message:'Upload failed');}finally{setBusy(false);}}
 return <div className="vehicle-picture">
  <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(f);}}/>
  {/* eslint-disable-next-line @next/next/no-img-element -- a private object URL; next/image cannot optimise it */}
  {picture?(src?<img src={src} alt=""/>:<span className="vehicle-picture-wait">{failed?'Picture unavailable':'Loading…'}</span>):<VehicleArtIcon art={art} size={260} className="vehicle-art"/>}
  {pins}
  <div className="vehicle-picture-tools">
   <button type="button" className="icon-button" disabled={busy} aria-label={picture?'Replace the picture':'Add a picture'} title={picture?'Replace the picture':'Add a picture or deck plan'} onClick={()=>file.current?.click()}><ImagePlus size={15}/></button>
   {picture&&<button type="button" className="icon-button" aria-label="Remove the picture" onClick={async()=>{if(await confirmDialog({title:'Remove this picture?',message:'The type’s outline shows instead.',confirm:'Remove picture',danger:true}))update({picture:undefined});}}><Trash2 size={15}/></button>}
  </div>
  {busy&&<span className="vehicle-picture-note">Uploading…</span>}
  {error&&<p role="alert" className="form-error vehicle-picture-note">{error}</p>}
 </div>;
}

/** Where the vehicle is: a place or map page, or just words. */
function LocationSlot({vehicle,pages,set,onOpen}:{vehicle:Vehicle;pages:Entry[];set:(patch:Partial<Vehicle>)=>void;onOpen:(id:string)=>void}){
 const [picking,setPicking]=useState(false),page=vehicle.locationId?pages.find(e=>e.id===vehicle.locationId):undefined,gm=!!vehicle.locationGm;
 const sorted=useMemo(()=>[...pages.filter(isPlace),...pages.filter(e=>!isPlace(e))],[pages]);
 const clear={locationId:undefined,locationText:undefined};
 return <section className={`vehicle-location${gm?' is-hidden':''}`} aria-label="Current location">
  <span className="vehicle-location-icon" aria-hidden="true"><MapPin size={16}/></span>
  <div className="vehicle-location-body"><span className="eyebrow">Current location</span>
   {page?<button type="button" className="wiki-link vehicle-location-name" onClick={()=>onOpen(page.id)}>{page.title}</button>
    :vehicle.locationText?<span className="vehicle-location-name">{vehicle.locationText}</span>
    :<span className="vehicle-location-name muted">Not set</span>}
  </div>
  <button type="button" className="text-button" onClick={()=>setPicking(true)}>{page||vehicle.locationText?'Change':'Set'}</button>
  <EyeToggle gm={gm} what="the location" onChange={v=>set({locationGm:v||undefined})}/>
  {picking&&<TargetPicker label="Where is it?" pages={sorted} current={vehicle.locationText??''} onClose={()=>setPicking(false)} onPage={id=>{set({...clear,locationId:id});setPicking(false);}} onName={name=>{set({...clear,locationText:name.slice(0,160)});setPicking(false);}} onClear={page||vehicle.locationText?()=>{set(clear);setPicking(false);}:undefined}/>}
 </section>;
}

/** The pages a vehicle can point at: the same world, and this campaign or the whole world. */
function usePages(entry:Entry,data:Workspace){
 return useMemo(()=>data.entries.filter(e=>e.id!==entry.id&&e.kind!=='folder'&&e.worldId===entry.worldId&&(e.campaignId===null||e.campaignId===entry.campaignId)).sort((a,b)=>a.title.localeCompare(b.title)),[data.entries,entry.id,entry.worldId,entry.campaignId]);
}

/** The GM's Crew tab of a vehicle page. */
export function VehicleCrewTab({entry,data,update,onOpen}:{entry:Entry;data:Workspace;update:(p:Partial<Entry>)=>void;onOpen:(id:string)=>void}){
 const world=data.worlds.find(w=>w.id===entry.worldId),vehicle=entry.vehicle??newVehicle(vehicleTypesOf(world)[0]),pages=usePages(entry,data);
 return <VehicleCrew vehicle={vehicle} type={vehicleTypeOf(vehicle,world)} pages={pages} save={v=>update({vehicle:v})} onOpen={onOpen}/>;
}

/** The GM's Overview tab of a vehicle page. */
export function VehicleSheet({entry,data,update,change,onOpen,onCrew,maptableHref}:{entry:Entry;data:Workspace;update:(p:Partial<Entry>)=>void;change:(f:(latest:Workspace)=>Workspace)=>boolean|void;onOpen:(id:string)=>void;onCrew:()=>void;/** Opens Maptable and adds this vehicle as a large token; null when the campaign has no Maptable campaign. */maptableHref?:string|null}){
 const [editTypes,setEditTypes]=useState(false),[rollUp,setRollUp]=useState(false);
 const world=data.worlds.find(w=>w.id===entry.worldId),types=vehicleTypesOf(world);
 const vehicle=entry.vehicle??newVehicle(types[0]),type=vehicleTypeOf(vehicle,world);
 const save=(v:Vehicle)=>update({vehicle:v});
 const set=(patch:Partial<Vehicle>)=>{const next={...vehicle,...patch};for(const k of Object.keys(patch) as (keyof Vehicle)[])if(next[k]===undefined)delete next[k];save(next);};
 const pages=usePages(entry,data);
 const owners=useMemo(()=>pages.filter(isWho),[pages]),characters=useMemo(()=>pages.filter(e=>e.kind==='character'),[pages]);
 const switchType=async(id:string)=>{const to=types.find(t=>t.id===id);if(!to||to.id===type.id)return;
  if(!await confirmDialog({title:`Make this a ${to.name.toLowerCase()}?`,message:'Stats and gauges with the same names keep their values; the rest start empty.',confirm:`Change to ${to.name}`}))return;
  save(changeType(vehicle,type,to));};
 return <div className="vehicle-sheet">
  <div className="vehicle-head">
   <label className="vehicle-type"><VehicleArtIcon art={type.art} size={26}/><select aria-label="Vehicle type" value={type.id} onChange={e=>void switchType(e.target.value)}>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <button type="button" className="icon-button vehicle-types-button" aria-label="Edit vehicle types" title="Edit vehicle types: make your own kinds of vehicle" onClick={()=>setEditTypes(true)}><Settings2 size={15}/></button>
   <button type="button" className="icon-button vehicle-types-button" aria-label="Roll up a vehicle" title="Roll up a vehicle: a name, stats, cargo and systems" onClick={()=>setRollUp(true)}><Dices size={15}/></button>
   {maptableHref&&<a className="button small vehicle-maptable" href={maptableHref} target="_blank" rel="noopener" title="Open Maptable and put this vehicle on the scene as a large token">Add to Maptable <ArrowUpRight size={14}/></a>}
   <input key={vehicle.subtitle??''} className="vehicle-subtitle" aria-label="Model and class" placeholder={`Model and class, such as “${type.id==='starship'?'Liberator · System frigate':type.id==='sailing-ship'?'Brigantine · Merchant raider':type.id==='carriage'?'Lacquered coach · Four-in-hand':type.id==='car'?'Interceptor · Road raider':'Courier · Light hauler'}”`} defaultValue={vehicle.subtitle??''} maxLength={120} onBlur={e=>{const v=e.target.value.trim();if(v!==(vehicle.subtitle??''))set({subtitle:v||undefined});}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>
  </div>
  {rollUp&&<VehicleGenerator entry={entry} data={data} vehicle={vehicle} update={update} change={change} onOpen={onOpen} onClose={()=>setRollUp(false)}/>}
  {editTypes&&<VehicleTypesDialog data={data} worldId={entry.worldId} start={type.id} change={change} onClose={()=>setEditTypes(false)}/>}
  <div className="vehicle-grid">
   <div className="vehicle-col vehicle-left">
    <PageSlot className={`vehicle-slot o-own${vehicle.ownerGm?' is-hidden':''}`} icon={<Shield size={13}/>} title="Owner" label="the owner" empty="Who owns it?" pageId={vehicle.ownerId} pages={owners} first={e=>e.kind==='faction'} onSet={id=>set({ownerId:id??undefined})} onOpen={onOpen} tools={<EyeToggle gm={!!vehicle.ownerGm} what="the owner" onChange={v=>set({ownerGm:v||undefined})}/>}/>
    <PageSlot className={`vehicle-slot o-cmd${vehicle.commanderGm?' is-hidden':''}`} icon={<Crown size={13}/>} title={type.commander} label={`the ${type.commander.toLowerCase()}`} empty={`Who is the ${type.commander.toLowerCase()}?`} pageId={vehicle.commanderId} pages={characters} first={()=>true} onSet={id=>set({commanderId:id??undefined})} onOpen={onOpen} tools={<EyeToggle gm={!!vehicle.commanderGm} what={`the ${type.commander.toLowerCase()}`} onChange={v=>set({commanderGm:v||undefined})}/>}/>
   </div>
   <div className="vehicle-col vehicle-mid">
    <VehiclePicture entry={entry} art={type.art} update={update} pins={<SeatPins stations={pinsOf(vehicle,type,pages)}/>}/>
    <LocationSlot vehicle={vehicle} pages={pages} set={set} onOpen={onOpen}/>
    <SeatCards vehicle={vehicle} type={type} pages={pages} characters={characters} save={save} onOpen={onOpen} onCrew={onCrew}/>
   </div>
   <div className="vehicle-col vehicle-right">
    {type.gauges.length>0&&<section className="vehicle-card o-gauge" aria-label="Condition"><span className="eyebrow">Condition</span>
     {gaugeRows(vehicle,type).map(g=>{const step=gaugeStep(g);return <GaugeView key={g.id} {...g}>
      <button type="button" className="icon-button" aria-label={`Lower ${g.label}`} disabled={g.value<=0} onClick={()=>save(setGauge(vehicle,type,g.id,g.value-step))}><Minus size={13}/></button>
      <button type="button" className="icon-button" aria-label={`Raise ${g.label}`} disabled={g.value>=g.max} onClick={()=>save(setGauge(vehicle,type,g.id,g.value+step))}><Plus size={13}/></button>
      <EyeToggle gm={g.gm} what={g.label} onChange={v=>save(setGm(vehicle,type,'gauges',g.id,v))}/>
     </GaugeView>;})}
    </section>}
    {type.specs.length>0&&<section className="o-spec" aria-label="At a glance"><span className="eyebrow">At a glance</span><div className="vehicle-specs">
     {specRows(vehicle,type).map(r=><ValueBox key={r.id} label={r.label} value={r.value} kind={r.kind} gm={r.gm} onSave={v=>save(setValue(vehicle,type,'specs',r.id,v))} onGm={v=>save(setGm(vehicle,type,'specs',r.id,v))}/>)}
    </div></section>}
    {type.now.length>0&&<section className="vehicle-card o-now" aria-label="Right now"><span className="eyebrow vehicle-now-title"><Compass size={13}/> Right now</span><div className="vehicle-specs">
     {nowRows(vehicle,type).map(r=><ValueBox key={r.id} label={r.label} value={r.value} kind="text" gm={r.gm} onSave={v=>save(setValue(vehicle,type,'now',r.id,v))} onGm={v=>save(setGm(vehicle,type,'now',r.id,v))}/>)}
    </div></section>}
   </div>
  </div>
 </div>;
}

/** What players see on a shared vehicle's Overview tab. */
export function VehicleReadOnly({vehicle,picture,names,open,token}:{vehicle:PlayerVehicle;picture?:{imageId:string};names:(id:string)=>string;open:(id:string)=>void;token?:string}){
 const {src}=usePictureSrc(picture?.imageId,token);
 const who=(label:string,icon:ReactNode,cls:string,id?:string)=>id?<div className={`vehicle-ro-who ${cls}`}><span className="eyebrow">{icon}{label}</span><button type="button" className="wiki-link" onClick={()=>open(id)}>{names(id)}</button></div>:null;
 return <div className="vehicle-sheet vehicle-ro">
  <div className="vehicle-head"><span className="vehicle-type"><VehicleArtIcon art={vehicle.type.art} size={26}/>{vehicle.type.name}</span>{vehicle.subtitle&&<span className="vehicle-ro-subtitle">{vehicle.subtitle}</span>}</div>
  <div className="vehicle-grid">
   <div className="vehicle-col vehicle-left">{who('Owner',<Shield size={13}/>,'o-own',vehicle.ownerId)}{who(vehicle.type.commander,<Crown size={13}/>,'o-cmd',vehicle.commanderId)}</div>
   <div className="vehicle-col vehicle-mid">
    {/* eslint-disable-next-line @next/next/no-img-element -- a private object URL */}
    <div className="vehicle-picture">{picture&&src?<img src={src} alt=""/>:<VehicleArtIcon art={vehicle.type.art} size={260} className="vehicle-art"/>}<SeatPins names={false} stations={vehicle.stations.filter(s=>s.pic).map(s=>({label:s.label,filled:!!(s.characterId||s.name||s.unknown),name:s.characterId?names(s.characterId):s.name??'?'}))}/></div>
    {(vehicle.locationId||vehicle.locationText)&&<div className="vehicle-location"><span className="vehicle-location-icon" aria-hidden="true"><MapPin size={16}/></span><div className="vehicle-location-body"><span className="eyebrow">Current location</span>{vehicle.locationId?<button type="button" className="wiki-link vehicle-location-name" onClick={()=>open(vehicle.locationId!)}>{names(vehicle.locationId)}</button>:<span className="vehicle-location-name">{vehicle.locationText}</span>}</div></div>}
    <SeatCardsReadOnly vehicle={vehicle} names={names} open={open}/>
   </div>
   <div className="vehicle-col vehicle-right">
    {vehicle.gauges.length>0&&<section className="vehicle-card o-gauge" aria-label="Condition"><span className="eyebrow">Condition</span>{vehicle.gauges.map(g=><GaugeView key={g.id} {...g}/>)}</section>}
    {vehicle.specs.length>0&&<section className="o-spec" aria-label="At a glance"><span className="eyebrow">At a glance</span><dl className="vehicle-specs">{vehicle.specs.map(s=><div key={s.id} className="vehicle-spec"><dt className="vehicle-spec-label">{s.label}</dt><dd>{s.value}</dd></div>)}</dl></section>}
    {vehicle.now.length>0&&<section className="vehicle-card o-now" aria-label="Right now"><span className="eyebrow vehicle-now-title"><Compass size={13}/> Right now</span><dl className="vehicle-specs">{vehicle.now.map(s=><div key={s.id} className="vehicle-spec"><dt className="vehicle-spec-label">{s.label}</dt><dd>{s.value}</dd></div>)}</dl></section>}
   </div>
  </div>
 </div>;
}

