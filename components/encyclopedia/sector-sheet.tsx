"use client";
/*
 * A sector page's Hex map tab: the hex map on the left and, on the right, the sector's facts and systems, or the
 * tapped hex: its system's name, star, whether it is charted or only a rumour, a note, and how far it is from another
 * system (light years and years at light speed, and whether lanes join them). Empty hexes can take a new system or a
 * rumour. Sector settings opens the sector generator.
 */
import {useState} from 'react';
import {ArrowLeft,Orbit,Plus,Rocket,Route,Settings2,Trash2,Waypoints} from 'lucide-react';
import {newId,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {newStarSystem,solSystem,travelBetweenStars} from '@/lib/encyclopedia/star-systems';
import {distanceBetween,hexDistance,hexLabel,laneHexes,laneSteps,lightTime,newSector,newSystem,starClasses,starInfo,toggleLane,withoutSystem,type Hex,type Sector,type SectorSystem,type StarClass} from '@/lib/encyclopedia/sectors';
import {SectorMap} from './sector-map';
import {SectorDialog} from './sector-dialog';
import {FtlDialog,galaxyOf} from './ftl-dialog';
import {confirmDialog} from '../confirm-dialog';
import './galaxy.css';
import {HookButton} from '../hook-button';
import {rumourHook} from '@/lib/hooks';

const starLine=(s:StarClass)=>`Class ${s}, ${starInfo[s].colour.toLowerCase()}`;

export function SectorSheet({entry,data,update,change,onOpen}:{entry:Entry;data:Workspace;update:(p:Partial<Entry>)=>void;change:(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;onOpen:(id:string)=>void}){
 const sector=entry.sector??newSector(entry.title),parent=data.entries.find(e=>e.id===entry.parentId);
 const [hex,setHex]=useState<Hex|null>(null),[joining,setJoining]=useState<string|null>(null),[lanes,setLanes]=useState(true),[settings,setSettings]=useState(false),[fromId,setFromId]=useState(''),[ftl,setFtl]=useState(false);
 const galaxyPage=galaxyOf(entry,data),drives=galaxyPage?.galaxy?.drives??[];
 const save=(next:Sector)=>update({sector:next});
 const here=hex?sector.systems.find(s=>s.c===hex.c&&s.r===hex.r):undefined;
 const edit=(id:string,patch:Partial<SectorSystem>)=>save({...sector,systems:sector.systems.map(s=>s.id===id?{...s,...patch,edited:true}:s)});
 const tap=(h:Hex)=>{
  const target=sector.systems.find(s=>s.c===h.c&&s.r===h.r);
  if(joining){if(target&&target.id!==joining)save(toggleLane(sector,joining,target.id));setJoining(null);if(target)setHex(h);return;}
  setHex(hex&&hex.c===h.c&&hex.r===h.r?null:h);
 };
 /** Makes the system's own page (inside this sector), with a survey seeded by its name, and opens it. Sol in the Local Bubble gets real data. */
 const surveyIt=(sys:SectorSystem)=>{const id=newId(),now=new Date().toISOString(),base=sector.real&&sys.ly===0?solSystem():newStarSystem(sys.name,sys.star);
  const page:Entry={id,worldId:entry.worldId,campaignId:entry.campaignId,parentId:entry.id,title:sys.name,kind:'system',body:sys.note?`${sys.note}\n`:'',starSystem:{...base,backdrop:sector.backdrop,sector:{pageId:entry.id,systemId:sys.id}},updatedAt:now};
  if(change(w=>({...w,entries:[...w.entries.map(e=>e.id===entry.id&&e.sector?{...e,sector:{...e.sector,systems:e.sector.systems.map(x=>x.id===sys.id?{...x,pageId:id,status:'charted' as const,edited:true}:x)},updatedAt:now}:e),page]}))!==false)onOpen(id);};
 const pageOf=(sys:SectorSystem)=>sys.pageId?data.entries.find(e=>e.id===sys.pageId&&e.kind==='system'):undefined;
 const others=sector.systems.filter(s=>s.id!==here?.id).sort((a,b)=>a.name.localeCompare(b.name));
 const from=others.find(s=>s.id===fromId)??(here?others.slice().sort((a,b)=>hexDistance(a,here)-hexDistance(b,here)).find(s=>s.status==='charted')??others[0]:undefined);
 const sorted=sector.systems.slice().sort((a,b)=>a.r-b.r||a.c-b.c);
 return <div className="sector-sheet">
  <div className="sector-view">
   <SectorMap className="sector-canvas" sector={sector} selected={hex} from={joining} lanes={lanes} onHex={tap} label={`Hex map of ${entry.title}: ${sector.cols} by ${sector.rows} hexes, ${sector.systems.length} systems`}/>
   <div className="sector-layers"><button type="button" aria-pressed={lanes} onClick={()=>setLanes(v=>!v)}><Waypoints size={14}/> Lanes</button></div>
   <span className="sector-hint">{joining?'Tap another system to join it by a lane, or to remove a lane that is there.':'Tap a hex. Dashed rings are rumours.'}</span>
   <span className="sector-scale">1 hex = 5 ly</span>
  </div>
  <div className="sector-side">
   {!hex?<>
    <div className="sector-head"><span className="sector-swatch" style={{background:sector.color}}/><strong>{entry.title}</strong>{sector.real&&<span className="galaxy-chip is-real">Real stars</span>}</div>
    {parent&&<p className="aside-hint">Galaxy: {parent.title}</p>}
    <div className="galaxy-facts"><div className="galaxy-fact"><span>Size</span><b>{sector.cols} × {sector.rows} hexes</b></div><div className="galaxy-fact"><span>One hex</span><b>5 light years</b></div><div className="galaxy-fact"><span>Systems</span><b>{sector.systems.length}{sector.systems.some(s=>s.status==='rumour')?`, ${sector.systems.filter(s=>s.status==='rumour').length} rumoured`:''}</b></div><div className="galaxy-fact"><span>Lanes</span><b>{sector.lanes.length}</b></div></div>
    <button type="button" className="button" onClick={()=>setSettings(true)}><Settings2 size={15}/> Sector settings</button>
    <div className="sector-list" role="list" aria-label="Systems">{sorted.map(s=><button key={s.id} type="button" role="listitem" onClick={()=>setHex({c:s.c,r:s.r})}>
     {s.status==='rumour'?<span className="sector-rumour-dot"/>:<span className="sector-star-dot" style={{background:starInfo[s.star].glow}}/>}
     <span className="sector-list-name"><strong>{s.name}</strong><small>{s.status==='rumour'?'Rumoured':s.ly!==undefined?`${starLine(s.star)} · ${s.ly?`${s.ly} ly from the Sun`:'our Sun'}`:starLine(s.star)}</small></span><span className="sector-hex">{hexLabel(s)}</span></button>)}
     {!sorted.length&&<p className="aside-hint">No systems yet. Tap a hex to add one, or generate the sector.</p>}</div>
   </>:<>
    <button type="button" className="text-button sector-back" onClick={()=>{setHex(null);setJoining(null);}}><ArrowLeft size={14}/> {entry.title}</button>
    <span className="eyebrow">Hex {hexLabel(hex)}</span>
    {here?<>
     <input key={`n${here.id}${here.name}`} className="sector-name" aria-label="System name" defaultValue={here.name} maxLength={80} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==here.name)edit(here.id,{name:v});else e.target.value=here.name;}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>
     <div className="world-seg" role="group" aria-label="Status"><button type="button" aria-pressed={here.status==='charted'} onClick={()=>edit(here.id,{status:'charted'})}>Charted</button><button type="button" aria-pressed={here.status==='rumour'} onClick={()=>edit(here.id,{status:'rumour'})}>Rumour</button></div>
     <label className="world-field">Star<select value={here.star} onChange={e=>edit(here.id,{star:e.target.value as StarClass})}>{starClasses.map(c=><option key={c} value={c}>{starLine(c)}: {starInfo[c].note}</option>)}</select></label>
     <label className="world-field">{here.status==='rumour'?'The rumour':'Notes'}<textarea key={`t${here.id}${here.note}`} className="sector-note" defaultValue={here.note} maxLength={400} rows={3} placeholder={here.status==='rumour'?'What people say about it.':'What is known about it.'} onBlur={e=>{const v=e.target.value.trim();if(v!==here.note)edit(here.id,{note:v});}}/></label>
     <HookButton className="text-button" roll={rumourHook} notes={here.note} max={400} onAdd={note=>edit(here.id,{note})}/>
     {from&&<div className="sector-travel">
      <label className="world-field">From<select value={from.id} onChange={e=>setFromId(e.target.value)}>{others.map(s=><option key={s.id} value={s.id}>{s.name} ({hexLabel(s)})</option>)}</select></label>
      {(()=>{const ly=distanceBetween(from,here),steps=laneSteps(sector,from.id,here.id),hexes=hexDistance(from,here);return <div className="galaxy-facts">
       <div className="galaxy-fact"><span>Distance</span><b>{ly} ly{ly!==hexes*5?'':` (${hexes} ${hexes===1?'hex':'hexes'})`}</b></div>
       <div className="galaxy-fact"><span>Light speed</span><b>{lightTime(ly)}</b></div>
       <div className="galaxy-fact"><span>Lanes</span><b>{steps===null?'Not joined':steps===1?'Joined directly':`Joined in ${steps} jumps`}</b></div>
       {travelBetweenStars(ly,drives,steps===null?null:{hexes:laneHexes(sector,from.id,here.id)??hexes}).slice(1).map(r=><div key={r.name} className="galaxy-fact"><span>{r.name}</span><b>{r.time}</b></div>)}</div>;})()}
      <button type="button" className="text-button" onClick={()=>setFtl(true)}><Rocket size={14}/> {drives.length?'FTL drives':'Add FTL drives'}</button>
     </div>}
     {(()=>{const page=pageOf(here);return page?<button type="button" className="button primary" onClick={()=>onOpen(page.id)}><Orbit size={15}/> Open survey chart</button>
      :<button type="button" className="button primary" onClick={()=>surveyIt(here)}><Orbit size={15}/> {sector.real&&here.ly===0?'Open the real Sol system':here.status==='rumour'?'Survey it now':'Survey this system'}</button>;})()}
     <div className="button-row">
      <button type="button" className={`button small${joining===here.id?' primary':''}`} onClick={()=>setJoining(joining===here.id?null:here.id)}><Route size={14}/> {joining===here.id?'Stop joining':'Join by a lane'}</button>
      <button type="button" className="button small" onClick={async()=>{if(await confirmDialog({title:`Remove ${here.name}?`,message:'It and its lanes leave the map.',confirm:'Remove'})){save(withoutSystem(sector,here.id));setJoining(null);}}}><Trash2 size={14}/> Remove</button>
     </div>
    </>:<>
     <strong className="sector-empty">Empty space</strong>
     <p className="aside-hint">Nothing charted here yet.</p>
     <div className="button-row">
      <button type="button" className="button small primary" onClick={()=>save({...sector,systems:[...sector.systems,newSystem(sector,hex,'charted')]})}><Plus size={14}/> Add a system</button>
      <button type="button" className="button small" onClick={()=>save({...sector,systems:[...sector.systems,newSystem(sector,hex,'rumour')]})}><Plus size={14}/> Add a rumour</button>
     </div>
    </>}
   </>}
  </div>
  {ftl&&<FtlDialog galaxy={galaxyPage} change={change} onClose={()=>setFtl(false)}/>}
  {settings&&<SectorDialog title="Sector settings" name={entry.title} sector={sector} realAllowed={parent?.galaxy?.preset==='milky'} at={sector} onClose={()=>setSettings(false)} onApply={(next,name)=>{update({sector:next,...(name&&name!==entry.title?{title:name}:{})});setSettings(false);setHex(null);}}/>}
 </div>;
}
