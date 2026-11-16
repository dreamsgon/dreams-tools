"use client";
/*
 * Roll up a vehicle (lib/encyclopedia/vehicle-generator.ts): pick a type and a template, reroll until it fits, then
 * fill this page with it or add it as a new vehicle page. Filling replaces the rolled parts (model line, stats, gauges,
 * Right now, hold and systems) and keeps the people, owner, location and visibility. Nothing is saved until then.
 */
import {useState} from 'react';
import {Dices,Plus,Wand2} from 'lucide-react';
import {newId,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {cargoUsed,gaugeRows,holdTitle,nowRows,specRows,systemStateNames,systemsTitle,vehicleTypeOf,vehicleTypesOf,type Vehicle} from '@/lib/encyclopedia/vehicles';
import {applyGenerated,generateVehicle,vehicleTemplates} from '@/lib/encyclopedia/vehicle-generator';
import {ToolDialog} from './tool-dialog';
import {VehicleArtIcon} from './vehicle-art';
import {confirmDialog} from '../confirm-dialog';
import './vehicle-hold.css';
import './vehicle-generator.css';

const newSeed=()=>Math.random().toString(36).slice(2,10);

export function VehicleGenerator({entry,data,vehicle,update,change,onOpen,onClose}:{entry:Entry;data:Workspace;vehicle:Vehicle;update:(p:Partial<Entry>)=>void;change:(f:(latest:Workspace)=>Workspace)=>boolean|void;onOpen:(id:string)=>void;onClose:()=>void}){
 const world=data.worlds.find(w=>w.id===entry.worldId),types=vehicleTypesOf(world),current=vehicleTypeOf(vehicle,world);
 const [typeId,setTypeId]=useState(current.id),[template,setTemplate]=useState('any'),[seed,setSeed]=useState(newSeed),[name,setName]=useState<string|null>(null);
 const type=types.find(t=>t.id===typeId)??current,templates=vehicleTemplates(type);
 const rolled=generateVehicle(type,seed,template);
 const title=(name??rolled.title).trim().slice(0,160)||rolled.title;
 const reroll=()=>{setSeed(newSeed());setName(null);};
 const v=rolled.vehicle,specs=specRows(v,type).filter(r=>r.value),now=nowRows(v,type).filter(r=>r.value),gauges=gaugeRows(v,type);
 const blankTitle=/^(new |untitled)/i.test(entry.title)||!entry.title.trim();
 const [rename,setRename]=useState(blankTitle);
 async function fill(){
  if(!await confirmDialog({title:'Fill this page?',message:'The model line, stats, gauges, Right now, cargo and systems are replaced. Crew, owner, location and what players can see stay as they are.',confirm:'Fill this page'}))return;
  update({vehicle:applyGenerated(vehicle,current,type,v),...(rename?{title}:{})});onClose();
 }
 function addPage(){
  const id=newId(),now=new Date().toISOString();
  change(w=>({...w,entries:[...w.entries,{id,worldId:entry.worldId,campaignId:entry.campaignId,parentId:entry.parentId,title,kind:'vehicle',body:'',tabs:[],overviewVisibility:'gm',vehicle:v,updatedAt:now}]}));
  onClose();onOpen(id);
 }
 return <ToolDialog title="Roll up a vehicle" onClose={onClose} wide>
  <div className="vgen">
   <div className="vgen-options">
    <label className="field-label">Type<select value={type.id} onChange={e=>{setTypeId(e.target.value);setTemplate('any');setName(null);}}>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <div className="field-label"><span>Template</span>
     <div className="vgen-templates" role="radiogroup" aria-label="Template">{[{id:'any',name:'Any'},...templates].map(t=><button type="button" key={t.id} role="radio" aria-checked={template===t.id} className={template===t.id?'on':''} onClick={()=>{setTemplate(t.id);setName(null);}}>{t.name}</button>)}</div>
    </div>
    <button type="button" className="button vgen-reroll" onClick={reroll}><Dices size={15}/> Reroll</button>
    <p className="aside-hint">Names, stats, cargo and systems come from built-in lists for each outline. A type you made gets the values whose names match the ready-made ones.</p>
   </div>
   <div className="vgen-preview" aria-live="polite">
    <div className="vgen-head"><VehicleArtIcon art={type.art} size={40}/><div className="vgen-name">
     <input aria-label="Name" value={name??rolled.title} maxLength={160} onChange={e=>setName(e.target.value)}/>
     <span className="muted">{v.subtitle} · {templates.find(t=>t.id===rolled.templateId)?.name}</span></div></div>
    {!!specs.length&&<dl className="vgen-specs">{specs.map(s=><div key={s.id}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>}
    {!!gauges.length&&<div className="vgen-gauges">{gauges.map(g=><span key={g.id}>{g.label} <strong>{g.value}</strong>/{g.max}{g.unit?` ${g.unit}`:''}</span>)}</div>}
    {!!now.length&&<dl className="vgen-specs">{now.map(s=><div key={s.id}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>}
    <div className="vgen-lists">
     <section><h4>{holdTitle(type)} <small className="muted">{cargoUsed(v)} / {v.capacity} {type.holdUnit??''}</small></h4><ul>{(v.cargo??[]).map(c=><li key={c.id}><strong>{c.qty}</strong> {c.name}</li>)}</ul></section>
     <section><h4>{systemsTitle(type)}</h4><ul>{(v.systems??[]).map(x=><li key={x.id}>{x.name}{x.roll&&<code>{x.roll}</code>}{x.state!=='ok'&&<span className={`sys-state s-${x.state}`}>{systemStateNames[x.state]}</span>}{x.note&&<span className="muted"> · {x.note}</span>}</li>)}</ul></section>
    </div>
   </div>
  </div>
  <div className="vgen-actions">
   <label className="vgen-rename"><input type="checkbox" checked={rename} onChange={e=>setRename(e.target.checked)}/> Rename this page to “{title}”</label>
   <button type="button" className="button" onClick={()=>void fill()}><Wand2 size={15}/> Fill this page</button>
   <button type="button" className="button primary" onClick={addPage}><Plus size={15}/> Add as new page</button>
  </div>
 </ToolDialog>;
}
