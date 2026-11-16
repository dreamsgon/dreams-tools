"use client";
/*
 * A charted world's World tab, on its place page: the sky from its surface, its survey fields (edited here or on the
 * system's Survey chart, which stays the source; this page keeps a copy), its moons or the planet it orbits, and links
 * back to the chart. If the world is no longer on the chart, the page keeps its last survey, read only.
 */
import {Flag,Map as MapIcon,Orbit} from 'lucide-react';
import {newId,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {hasSurface,mirrorPlanets,planetOf,type PlanetProfile} from '@/lib/encyclopedia/planets';
import {newMap} from '@/lib/encyclopedia/map-model';
import {openMapEditorNext} from './map-editor';
import {editWorld,findWorld,formatAU,parentOf,starSizeFrom,word,worldKindNames,worldSummary,yearLength,type Moon,type SystemBody,type World} from '@/lib/encyclopedia/star-systems';
import {Horizon,WorldDot} from './system-art';
import {WorldFields} from './world-fields';
import './galaxy.css';

type Props={entry:Entry;data:Workspace;change:(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;onOpen:(id:string)=>void};
const lastSurvey:[keyof PlanetProfile,string][]=[['kind','Kind'],['type','Type'],['size','Size'],['gravity','Gravity'],['temp','Temperature'],['air','Air'],['water','Water'],['resources','Resources'],['hazard','Hazard'],['life','Life'],['settled','Settled'],['day','Day']];

export function PlanetSheet({entry,data,change,onOpen}:Props){
 const planet=entry.planet!,systemPage=data.entries.find(e=>e.id===planet.systemPageId&&e.kind==='system'),system=systemPage?.starSystem;
 const found=system?findWorld(system,planet.bodyId):undefined,w=found&&found.pageId===entry.id?found:undefined;
 const orgs=data.entries.filter(e=>e.kind==='faction'&&e.worldId===entry.worldId&&(e.campaignId===null||e.campaignId===entry.campaignId)).sort((a,b)=>a.title.localeCompare(b.title));
 const map=planet.worldMapId?data.entries.find(e=>e.id===planet.worldMapId&&e.kind==='map'):undefined;
 // Develop as world map: a new map page under this one, opened straight into Generate with a whole planet set from the survey.
 const develop=()=>{const id=newId(),now=new Date().toISOString(),title=`${entry.title} world map`.slice(0,160);
  const page:Entry={id,worldId:entry.worldId,campaignId:entry.campaignId,parentId:entry.id,title,kind:'map',body:'',tabs:[],overviewVisibility:'gm',mapData:{...newMap('world','blank',title,24,18),compass:true,scaleBar:true},updatedAt:now};
  if(change(d=>({...d,entries:[...d.entries.map(e=>e.id===entry.id&&e.planet?{...e,planet:{...e.planet,worldMapId:id},updatedAt:now}:e),page]}))!==false){openMapEditorNext(id,'generate');onOpen(id);}};
 const worldMap=map?<button type="button" className="button" onClick={()=>{openMapEditorNext(map.id);onOpen(map.id);}}><MapIcon size={15}/> Open its world map</button>
  :hasSurface(planet.profile)?<><button type="button" className="button primary" onClick={develop}><MapIcon size={15}/> Develop as world map</button><p className="aside-hint">A whole-planet map whose climate, seas, life and towns start from this survey. You can change them before you use it.</p></>
  :<p className="aside-hint">{worldKindNames[planet.profile.kind]}s have no surface to map. Chart one of its moons to map that instead.</p>;
 if(!system||!systemPage||!w){const f=planet.profile;return <div className="planet-sheet">
  <div className="planet-main"><p className="aside-hint">{systemPage?`${f.name} is no longer on the survey chart of ${systemPage.title}.`:'Its star system page is gone.'} This is its last survey.</p>
   <div className="galaxy-facts">{lastSurvey.map(([k,label])=><div key={k} className="galaxy-fact"><span>{label}</span><b>{k==='kind'?worldKindNames[f.kind]:k==='gravity'?`${f.gravity} g`:k==='temp'?`${f.temp} °C`:typeof f[k]==='string'?word(f[k] as string):String(f[k])}</b></div>)}</div>
   <div className="button-row">{systemPage&&<button type="button" className="button" onClick={()=>onOpen(systemPage.id)}><Orbit size={15}/> Open {systemPage.title}</button>}{worldMap}</div></div></div>;}
 const parent=parentOf(system,w.id),kids:World[]=parent?[parent,...parent.moons.filter(m=>m.id!==w.id)]:((w as SystemBody).moons??[]);
 const saveSystem=(next:typeof system)=>change(d=>({...d,entries:mirrorPlanets(d.entries.map(e=>e.id===systemPage.id?{...e,starSystem:next,updatedAt:new Date().toISOString()}:e),systemPage.id)}));
 const set=(patch:Partial<Moon>)=>saveSystem(editWorld(system,w.id,patch));
 const pageFor=(x:World)=>x.pageId?data.entries.find(e=>e.id===x.pageId&&e.planet?.bodyId===x.id):undefined;
 const chart=(x:World)=>{const id=newId(),now=new Date().toISOString(),next=editWorld(system,x.id,{pageId:id});
  const page:Entry={id,worldId:systemPage.worldId,campaignId:systemPage.campaignId,parentId:systemPage.id,title:x.name,kind:'place',body:x.note.trim()||worldSummary(system,x,systemPage.title),planet:planetOf(systemPage.id,next,findWorld(next,x.id)!),updatedAt:now};
  if(change(d=>({...d,entries:[...d.entries.map(e=>e.id===systemPage.id?{...e,starSystem:next,updatedAt:now}:e),page]}))!==false)onOpen(id);};
 const k=starSizeFrom(w.au,system.star);
 return <div className="planet-sheet">
  <div className="planet-hero"><Horizon className="system-horizon-canvas" system={system} world={w} label={`The sky from ${w.name}`}/>
   <div className="planet-hero-over"><WorldDot world={w} size={64}/><span><strong>{w.name}</strong><small>{w.type} {worldKindNames[w.kind].toLowerCase()} · {planet.profile.zone} zone of {systemPage.title}{parent?` · moon of ${parent.name}`:''}</small></span></div>
   <span className="planet-hero-cap">The star looks {k<0.1?k.toFixed(2):k<10?k.toFixed(1):Math.round(k)}× the Sun from Earth · {formatAU(w.au)} AU · a year is {yearLength(w.au,system.star)}</span></div>
  <div className="planet-cols">
   <div className="planet-main"><WorldFields world={w} system={system} orgs={orgs} set={set}/>
    <p className="aside-hint">These are the same fields as on the survey chart of {systemPage.title}: a change here shows there too. The Overview tab is this world’s story.</p></div>
   <aside className="system-side">
    <span className="eyebrow">{parent?`ALSO AROUND ${parent.name.toUpperCase()}`:'MOONS'}</span>
    {kids.length?<div className="planet-kids">{kids.map(x=>{const p=pageFor(x);return <div key={x.id} className="planet-kid"><WorldDot world={x} size={22}/><span><b>{x.name}</b><small>{x.type} {worldKindNames[x.kind].toLowerCase()} · {x.temp} °C</small></span>
     {p?<button type="button" className="text-button" onClick={()=>onOpen(p.id)}>Open</button>:<button type="button" className="text-button" onClick={()=>chart(x)}><Flag size={13}/> Chart</button>}</div>;})}</div>:<p className="aside-hint">No moons.</p>}
    <button type="button" className="button" onClick={()=>onOpen(systemPage.id)}><Orbit size={15}/> Survey chart of {systemPage.title}</button>
    <span className="eyebrow">WORLD MAP</span>
    {worldMap}
   </aside>
  </div>
 </div>;
}
