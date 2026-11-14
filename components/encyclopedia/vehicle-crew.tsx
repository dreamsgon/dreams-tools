"use client";
/*
 * A vehicle's people: its seats (stations) and the Crew tab. Seats come from the vehicle's type and each vehicle can
 * rename, add, remove and pin its own. A pinned seat shows on the Overview, on the picture; the rest live in the Crew
 * tab, with the manifest of everyone else aboard and the unnamed counts (Marines 8). Every seat and person has an eye.
 * The read-only versions for the player site are SeatCardsReadOnly and VehicleCrewReadOnly.
 */
import {useMemo,useState} from 'react';
import {Eye,EyeOff,Minus,Pin,PinOff,Plus,Trash2,Users} from 'lucide-react';
import type {Entry} from '@/lib/encyclopedia/world-model';
import {addCrew,addStation,editCrew,editStation,handRows,removeCrew,removeStation,seat,setHands,stationList,type PlayerVehicle,type Station,type Vehicle,type VehicleType,type Who} from '@/lib/encyclopedia/vehicles';
import {Face,TargetPicker} from './quest-goals';
import {confirmDialog} from '../confirm-dialog';
import './vehicle-crew.css';

const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]!.toUpperCase()).join('')||'?';

function Eyes({gm,what,onChange}:{gm:boolean;what:string;onChange:(gm:boolean)=>void}){
 return <button type="button" className={`icon-button vehicle-eye${gm?' off':''}`} aria-pressed={!gm} aria-label={gm?`Show ${what} to players`:`Hide ${what} from players`} title={gm?'Players can’t see this':'Players can see this'} onClick={()=>onChange(!gm)}>{gm?<EyeOff size={14}/>:<Eye size={14}/>}</button>;
}

/** A person: a character page (with its picture) or just a name. */
function Person({who,pages,onOpen,small}:{who:Who;pages:Entry[];onOpen:(id:string)=>void;small?:boolean}){
 const page=who.characterId?pages.find(e=>e.id===who.characterId):undefined;
 if(page)return <button type="button" className="crew-person" onClick={()=>onOpen(page.id)}><Face entry={page} size={small?22:26}/><span>{page.title}</span></button>;
 const name=who.name??(who.characterId?'Missing page':'');
 return <span className="crew-person"><span className="crew-initials" style={small?{width:22,height:22}:undefined} aria-hidden="true">{initials(name)}</span><span>{name}</span></span>;
}

/** Picks who sits in a seat: a character page, or a typed name. */
function SeatButton({station,characters,set}:{station:Station;characters:Entry[];set:(who:Who)=>void}){
 const [open,setOpen]=useState(false),filled=!!(station.characterId||station.name);
 return <span className="goal-anchor crew-seat-pick">
  <button type="button" className="text-button" onClick={()=>setOpen(true)} aria-label={filled?`Change who is at ${station.label}`:`Seat someone at ${station.label}`}>{filled?'Change':'Seat someone'}</button>
  {open&&<TargetPicker label={`Who is at ${station.label}?`} pages={characters} current="" onClose={()=>setOpen(false)} onPage={id=>{set({characterId:id});setOpen(false);}} onName={name=>{set({name});setOpen(false);}} onClear={filled?()=>{set({});setOpen(false);}:undefined}/>}
 </span>;
}

/** Where pins go on the picture, in percent, for the first six pinned seats (more show only in the cards). */
const spots:[number,number][]=[[22,30],[78,30],[22,72],[78,72],[50,14],[50,88]];
export function SeatPins({stations,names}:{stations:{label:string;filled:boolean;name:string;gm?:boolean}[];names?:boolean}){
 return <div className="crew-pins" aria-hidden="true">{stations.slice(0,spots.length).map((s,i)=><span key={i} className={`crew-pin${s.filled?'':' empty'}${s.gm?' is-hidden':''}`} style={{left:`${spots[i]![0]}%`,top:`${spots[i]![1]}%`}}>{s.filled&&<span className="crew-initials">{initials(s.name)}</span>}{s.label}{names!==false&&!s.filled?': open':''}</span>)}</div>;
}
export const pinsOf=(v:Vehicle,t:VehicleType,pages:Entry[])=>stationList(v,t).filter(s=>s.pic).map(s=>({label:s.label,filled:!!(s.characterId||s.name),name:s.characterId?pages.find(e=>e.id===s.characterId)?.title??'?':s.name??'',gm:s.gm}));

/** The Overview's seat cards: the pinned seats, and a button to the Crew tab for the rest. */
export function SeatCards({vehicle,type,pages,characters,save,onOpen,onCrew}:{vehicle:Vehicle;type:VehicleType;pages:Entry[];characters:Entry[];save:(v:Vehicle)=>void;onOpen:(id:string)=>void;onCrew:()=>void}){
 const all=stationList(vehicle,type),shown=all.filter(s=>s.pic),more=all.length-shown.length;
 return <section className="o-st crew-cards-wrap" aria-label="Stations">
  <div className="crew-head"><span className="eyebrow">Stations</span><button type="button" className="text-button" onClick={onCrew}>{more?`${more} more in ${type.crew}`:`Edit in ${type.crew}`}</button></div>
  {shown.length?<div className="crew-cards">{shown.map(s=><div key={s.id} className={`crew-card${s.gm?' is-hidden':''}`}>
   <div className="crew-card-top"><span className="eyebrow">{s.label}</span><Eyes gm={!!s.gm} what={s.label} onChange={gm=>save(editStation(vehicle,type,s.id,{gm}))}/></div>
   {s.characterId||s.name?<Person who={s} pages={pages} onOpen={onOpen} small/>:<span className="muted crew-open">Open</span>}
   <SeatButton station={s} characters={characters} set={who=>save(seat(vehicle,type,s.id,who))}/>
  </div>)}</div>:<p className="muted crew-none">No seats on the picture. Pin one in the {type.crew} tab.</p>}
 </section>;
}

/** The GM's Crew tab: every seat (rename, pin, hide, remove, add), the manifest and the unnamed counts. */
export function VehicleCrew({vehicle,type,pages,save,onOpen}:{vehicle:Vehicle;type:VehicleType;pages:Entry[];save:(v:Vehicle)=>void;onOpen:(id:string)=>void}){
 const characters=useMemo(()=>pages.filter(e=>e.kind==='character'),[pages]);
 const seats=stationList(vehicle,type),crew=vehicle.crew??[],[adding,setAdding]=useState(false);
 return <div className="vehicle-crew">
  <section className="crew-section" aria-label="Stations">
   <div className="crew-head"><h3>Stations</h3><small className="muted"><Pin size={12}/> pinned seats show on the picture</small></div>
   <div className="crew-rows">{seats.map(s=><div key={s.id} className={`crew-row${s.gm?' is-hidden':''}`}>
    <input key={s.label} className="crew-seat-name" aria-label="Station name" defaultValue={s.label} maxLength={40} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==s.label)save(editStation(vehicle,type,s.id,{label:v}));else e.target.value=s.label;}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>
    <div className="crew-row-who">{s.characterId||s.name?<Person who={s} pages={pages} onOpen={onOpen} small/>:<span className="muted">Open</span>}</div>
    <SeatButton station={s} characters={characters} set={who=>save(seat(vehicle,type,s.id,who))}/>
    <button type="button" className={`icon-button crew-pin-toggle${s.pic?' on':''}`} aria-pressed={s.pic} aria-label={s.pic?`Keep ${s.label} in the ${type.crew} tab only`:`Show ${s.label} on the picture`} title={s.pic?'On the picture':`${type.crew} tab only`} onClick={()=>save(editStation(vehicle,type,s.id,{pic:!s.pic}))}>{s.pic?<Pin size={14}/>:<PinOff size={14}/>}</button>
    <Eyes gm={!!s.gm} what={s.label} onChange={gm=>save(editStation(vehicle,type,s.id,{gm}))}/>
    <button type="button" className="icon-button" aria-label={`Remove the ${s.label} station`} onClick={async()=>{if(!(s.characterId||s.name)||await confirmDialog({title:`Remove ${s.label}?`,message:'Whoever sits there leaves the seat. Their page stays.',confirm:'Remove station',danger:true}))save(removeStation(vehicle,type,s.id));}}><Trash2 size={14}/></button>
   </div>)}</div>
   <button type="button" className="text-button crew-add" disabled={seats.length>=24} onClick={()=>save(addStation(vehicle,type))}><Plus size={14}/> Add a station</button>
  </section>
  <div className="crew-split">
   <section className="crew-section" aria-label={`${type.crew} manifest`}>
    <div className="crew-head"><h3>{type.crew} manifest</h3><span className="goal-anchor"><button type="button" className="text-button" disabled={crew.length>=60} onClick={()=>setAdding(true)}><Plus size={14}/> Add someone</button>
     {adding&&<TargetPicker label={`Add to the ${type.crew.toLowerCase()}`} pages={characters.filter(c=>!crew.some(x=>x.characterId===c.id))} current="" onClose={()=>setAdding(false)} onPage={id=>{save(addCrew(vehicle,{characterId:id}));setAdding(false);}} onName={name=>{save(addCrew(vehicle,{name}));setAdding(false);}}/>}</span></div>
    {crew.length?<div className="crew-rows">{crew.map(c=><div key={c.id} className={`crew-row crew-member${c.gm?' is-hidden':''}`}>
     <div className="crew-row-who"><Person who={c} pages={pages} onOpen={onOpen}/></div>
     <input key={c.role??''} className="crew-role" aria-label="Role" placeholder="Role, such as Medic" defaultValue={c.role??''} maxLength={80} onBlur={e=>{const v=e.target.value.trim();if(v!==(c.role??''))save(editCrew(vehicle,c.id,{role:v}));}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>
     <Eyes gm={!!c.gm} what="this person" onChange={gm=>save(editCrew(vehicle,c.id,{gm}))}/>
     <button type="button" className="icon-button" aria-label="Remove from the manifest" onClick={()=>save(removeCrew(vehicle,c.id))}><Trash2 size={14}/></button>
    </div>)}</div>:<p className="muted crew-none">Nobody else aboard yet. Add a character page or type a name.</p>}
   </section>
   {type.hands.length>0&&<section className="crew-section" aria-label="Unnamed">
    <div className="crew-head"><h3><Users size={15}/> Unnamed</h3><small className="muted">Counts, not pages</small></div>
    <div className="crew-hands">{handRows(vehicle,type).map(h=><div key={h.id} className={`crew-hand${h.gm?' is-hidden':''}`}>
     <span className="crew-hand-name">{h.label}</span>
     <button type="button" className="icon-button" aria-label={`Fewer ${h.label}`} disabled={h.value<=0} onClick={()=>save(setHands(vehicle,type,h.id,{value:h.value-1}))}><Minus size={13}/></button>
     <input key={h.value} className="crew-hand-num" aria-label={`${h.label} count`} inputMode="numeric" defaultValue={h.value} onBlur={e=>{const n=parseInt(e.target.value,10);if(Number.isFinite(n)&&n!==h.value)save(setHands(vehicle,type,h.id,{value:n}));else e.target.value=String(h.value);}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>
     <button type="button" className="icon-button" aria-label={`More ${h.label}`} onClick={()=>save(setHands(vehicle,type,h.id,{value:h.value+1}))}><Plus size={13}/></button>
     <Eyes gm={h.gm} what={h.label} onChange={gm=>save(setHands(vehicle,type,h.id,{gm}))}/>
    </div>)}</div>
   </section>}
  </div>
 </div>;
}

type Shown={characterId?:string;name?:string;unknown?:true};
function ShownPerson({who,names,open,small}:{who:Shown;names:(id:string)=>string;open:(id:string)=>void;small?:boolean}){
 if(who.characterId)return <button type="button" className="crew-person" onClick={()=>open(who.characterId!)}><span className="crew-initials" style={small?{width:22,height:22}:undefined} aria-hidden="true">{initials(names(who.characterId))}</span><span>{names(who.characterId)}</span></button>;
 if(who.name)return <span className="crew-person"><span className="crew-initials" style={small?{width:22,height:22}:undefined} aria-hidden="true">{initials(who.name)}</span><span>{who.name}</span></span>;
 return <span className="muted crew-open">{who.unknown?'Someone':'Open'}</span>;
}

/** The player Overview's seat cards. */
export function SeatCardsReadOnly({vehicle,names,open}:{vehicle:PlayerVehicle;names:(id:string)=>string;open:(id:string)=>void}){
 const shown=vehicle.stations.filter(s=>s.pic);
 if(!shown.length)return null;
 return <section className="o-st crew-cards-wrap" aria-label="Stations"><div className="crew-head"><span className="eyebrow">Stations</span></div>
  <div className="crew-cards">{shown.map(s=><div key={s.id} className="crew-card"><span className="eyebrow">{s.label}</span><ShownPerson who={s} names={names} open={open} small/></div>)}</div>
 </section>;
}

/** The player Crew tab. */
export function VehicleCrewReadOnly({vehicle,names,open}:{vehicle:PlayerVehicle;names:(id:string)=>string;open:(id:string)=>void}){
 const tab=vehicle.crewTab;
 if(!tab)return null;
 return <div className="vehicle-crew">
  {vehicle.stations.length>0&&<section className="crew-section" aria-label="Stations"><div className="crew-head"><h3>Stations</h3></div>
   <div className="crew-rows">{vehicle.stations.map(s=><div key={s.id} className="crew-row crew-row-ro"><span className="eyebrow crew-seat-label">{s.label}</span><div className="crew-row-who"><ShownPerson who={s} names={names} open={open} small/></div></div>)}</div></section>}
  <div className="crew-split">
   {tab.crew.length>0&&<section className="crew-section" aria-label={`${tab.title} manifest`}><div className="crew-head"><h3>{tab.title} manifest</h3></div>
    <div className="crew-rows">{tab.crew.map(c=><div key={c.id} className="crew-row crew-row-ro"><div className="crew-row-who"><ShownPerson who={c} names={names} open={open}/></div>{c.role&&<span className="muted">{c.role}</span>}</div>)}</div></section>}
   {tab.hands.length>0&&<section className="crew-section" aria-label="Unnamed"><div className="crew-head"><h3><Users size={15}/> Unnamed</h3></div>
    <div className="crew-hands">{tab.hands.map(h=><div key={h.id} className="crew-hand"><span className="crew-hand-name">{h.label}</span><strong>{h.value}</strong></div>)}</div></section>}
  </div>
 </div>;
}
