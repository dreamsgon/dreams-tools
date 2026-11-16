"use client";
/*
 * A world's survey fields, edited in place: shared by a star system's Survey chart (the open world sheet) and a charted
 * world's own page. Zone and year are worked out from its orbit; every other field changes the world on the chart,
 * and fields the GM changed are marked as edited.
 */
import type {Entry} from '@/lib/encyclopedia/world-model';
import {airs,formatAU,hazards,lifeLevels,parentOf,pointsOfInterest,resourceLevels,settlements,sizes,temperatureWord,waters,word,worldKindNames,worldKinds,worldTypes,yearLength,zoneOf,zones,type Moon,type StarSystem,type World,type WorldKind} from '@/lib/encyclopedia/star-systems';

export function WorldFields({world:w,system,orgs,set}:{world:World;system:StarSystem;orgs:Entry[];set:(patch:Partial<Moon>)=>void}){
 const z=zones(system),parent=parentOf(system,w.id),edited=new Set(w.edited??[]);
 const field=(k:string,label:string,control:React.ReactNode,extra?:React.ReactNode)=><label className={`system-field${edited.has(k)?' is-edited':''}`}><span>{label}{edited.has(k)&&<i title="Changed by you">edited</i>}</span>{control}{extra}</label>;
 const choose=<T extends string>(k:keyof Moon,values:readonly T[],value:T,names:(v:T)=>string=word)=><select value={value} onChange={e=>set({[k]:e.target.value} as Partial<Moon>)}>{values.map(v=><option key={v} value={v}>{names(v)}</option>)}</select>;
 return <>
  <div className="system-fields">
   {parent&&<div className="system-field"><span>Orbits</span><b>{parent.name}</b></div>}
   <div className="system-field"><span>Zone</span><b>{zoneOf(w.au,z)} <small>{formatAU(w.au)} AU</small></b></div>
   <div className="system-field"><span>Year</span><b>{yearLength(w.au,system.star)}</b></div>
   {field('day','Day',<input key={`d${w.day}`} defaultValue={w.day} maxLength={60} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==w.day)set({day:v});}}/>)}
   {field('kind','Kind',choose<WorldKind>('kind',worldKinds,w.kind,v=>worldKindNames[v]))}
   {field('type','Type',choose('type',[...new Set([w.type,...worldTypes[w.kind]])],w.type,v=>v))}
   {field('size','Size',choose('size',sizes,w.size))}
   {field('gravity','Gravity',<input key={`g${w.gravity}`} type="number" min={0} max={50} step={0.01} defaultValue={w.gravity} onBlur={e=>{const v=Math.min(50,Math.max(0,+e.target.value));if(Number.isFinite(v)&&v!==w.gravity)set({gravity:v});}}/>,<small>g</small>)}
   {field('temp','Temperature',<input key={`t${w.temp}`} type="number" min={-273} max={10000} step={1} defaultValue={w.temp} onBlur={e=>{const v=Math.round(Math.min(10000,Math.max(-273,+e.target.value)));if(Number.isFinite(v)&&v!==w.temp)set({temp:v});}}/>,<small>°C, {temperatureWord(w.temp).toLowerCase()}</small>)}
   {field('air','Air',choose('air',airs,w.air))}
   {field('water','Water',choose('water',waters,w.water))}
   {field('resources','Resources',choose('resources',resourceLevels,w.resources))}
   {field('hazard','Hazard',choose('hazard',[...new Set([w.hazard,...hazards])],w.hazard,v=>v))}
   {field('life','Life',choose('life',lifeLevels,w.life))}
   {field('settled','Settled',choose('settled',settlements,w.settled))}
   {field('holderId','Held by',<select value={w.holderId??''} onChange={e=>set({holderId:e.target.value||undefined})}><option value="">Nobody</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}</select>)}
  </div>
  <div className="system-poi" role="group" aria-label="Points of interest"><span>Points of interest</span>{[...new Set([...pointsOfInterest,...w.poi])].map(p=><button key={p} type="button" aria-pressed={w.poi.includes(p)} onClick={()=>set({poi:w.poi.includes(p)?w.poi.filter(x=>x!==p):[...w.poi,p].slice(0,6)})}>{p}</button>)}</div>
 </>;
}
