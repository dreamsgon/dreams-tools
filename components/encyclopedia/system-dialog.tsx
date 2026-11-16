"use client";
/*
 * Survey settings, the brief for a star system: its star and companions, a premise, how many worlds and what kinds,
 * the era, realistic or pulp science, which organizations have a foothold, the backdrop and a seed, with a live
 * preview. Running the survey keeps locked worlds, worlds with their own pages, and locked hooks. A system named Sol
 * can use real data instead.
 */
import {useState} from 'react';
import {Dices,Plus,Trash2} from 'lucide-react';
import type {Entry} from '@/lib/encyclopedia/world-model';
import {galaxyRandom} from '@/lib/encyclopedia/galaxies';
import {backdropNames,backdrops,randomStar,starClasses,starInfo,type Backdrop,type StarClass} from '@/lib/encyclopedia/sectors';
import {amounts,eras,formatAU,solSystem,starPhysics,survey,word,zoneOf,zones,type StarSystem,type SurveyOptions} from '@/lib/encyclopedia/star-systems';
import {ToolDialog} from './tool-dialog';
import {SystemOrbit} from './system-art';

const amountNames={auto:'Auto',none:'None',some:'Some',many:'Many'};
function Seg<T extends string>({label,values,value,set,names}:{label:string;values:readonly T[];value:T;set:(v:T)=>void;names:(v:T)=>string}){
 return <div className="world-field">{label}<div className="world-seg" role="group" aria-label={label}>{values.map(v=><button key={v} type="button" aria-pressed={value===v} onClick={()=>set(v)}>{names(v)}</button>)}</div></div>;
}

export function SystemDialog({name:startName,system,orgs,onApply,onClose}:{name:string;system:StarSystem;orgs:Entry[];onApply:(s:StarSystem,name:string)=>void;onClose:()=>void}){
 const [name,setName]=useState(startName),[star,setStar]=useState<StarClass>(system.star),[companions,setCompanions]=useState(system.companions);
 const [premise,setPremise]=useState(system.premise),[o,setO]=useState<SurveyOptions>(system.options),[backdrop,setBackdrop]=useState<Backdrop>(system.backdrop),[seed,setSeed]=useState(system.seed);
 const [real,setReal]=useState(!!system.real);
 const opt=<K extends keyof SurveyOptions>(k:K,v:SurveyOptions[K])=>setO(x=>({...x,[k]:v}));
 const holderNames=o.holders.map(h=>orgs.find(x=>x.id===h)?.title).filter((x):x is string=>!!x);
 const made:StarSystem=real?{...solSystem(),premise:premise.trim(),...(system.sector?{sector:system.sector}:{})}
  :survey({name:name.trim()||'System',star,companions,premise:premise.trim(),options:o,backdrop,seed:seed.trim()||'system',holderNames},system);
 const z=zones(made),moons=made.bodies.reduce((n,b)=>n+b.moons.length,0),green=made.bodies.filter(b=>zoneOf(b.au,z)==='Green').length,kept=system.bodies.filter(b=>b.locked||b.pageId).length;
 const reroll=()=>setSeed(Math.floor(galaxyRandom(`${Date.now()}:${Math.random()}`)()*1e9).toString(36));
 const solAllowed=real||name.trim().toLowerCase()==='sol';
 return <ToolDialog title="Survey settings" wide onClose={onClose}>
  <div className="world-generate">
   <div className="world-generate-options">
    <label className="world-field">Name<input type="text" value={name} maxLength={160} onChange={e=>setName(e.target.value)}/></label>
    {solAllowed&&<label className="world-check"><input type="checkbox" checked={real} onChange={e=>{setReal(e.target.checked);if(e.target.checked)setBackdrop('deep');}}/><span>Real data<small>The Sun, its eight planets and their main moons, with rounded real figures.</small></span></label>}
    {!real&&<>
     <div className="world-field">Star<div className="world-seg" role="group" aria-label="Star">{starClasses.map(c=><button key={c} type="button" aria-pressed={star===c} title={`Class ${c}, ${starInfo[c].colour.toLowerCase()}`} onClick={()=>setStar(c)}>{c}</button>)}<button type="button" aria-label="Random star, weighted like a real galaxy" onClick={()=>setStar(randomStar(galaxyRandom(`${Date.now()}`)))}><Dices size={14}/></button></div>
      <small className="sector-size-note">Class {star}, {starInfo[star].colour.toLowerCase()}. {starPhysics[star].note} Green zone {formatAU(0.95*Math.sqrt(starPhysics[star].L))} to {formatAU(1.37*Math.sqrt(starPhysics[star].L))} AU.</small></div>
     {companions.map((c,i)=><div key={i} className="system-companion"><label className="world-field">Companion {i+1}<select value={c.star} onChange={e=>setCompanions(cs=>cs.map((x,k)=>k===i?{...x,star:e.target.value as StarClass}:x))}>{starClasses.map(s=><option key={s} value={s}>Class {s}, {starInfo[s].colour.toLowerCase()}</option>)}</select></label>
      <div className="world-seg" role="group" aria-label={`Companion ${i+1} distance`}><button type="button" aria-pressed={c.separation==='close'} onClick={()=>setCompanions(cs=>cs.map((x,k)=>k===i?{...x,separation:'close'}:x))}>Close pair</button><button type="button" aria-pressed={c.separation==='wide'} onClick={()=>setCompanions(cs=>cs.map((x,k)=>k===i?{...x,separation:'wide'}:x))}>Far out</button></div>
      <button type="button" className="icon-button" aria-label={`Remove companion ${i+1}`} onClick={()=>setCompanions(cs=>cs.filter((_,k)=>k!==i))}><Trash2 size={15}/></button></div>)}
     {companions.length<2&&<button type="button" className="button small system-add" onClick={()=>setCompanions(cs=>[...cs,{star:'M',separation:'wide'}])}><Plus size={14}/> Add a companion star</button>}
     <label className="world-field">Premise<input type="text" value={premise} maxLength={300} placeholder="What this system is for, in a line" onChange={e=>setPremise(e.target.value)}/></label>
     <label className="world-field">Worlds <output>{o.count}</output><input type="range" min={1} max={12} value={o.count} onChange={e=>opt('count',+e.target.value)}/></label>
     <Seg label="Green-zone worlds" values={amounts} value={o.habitable} set={v=>opt('habitable',v)} names={v=>amountNames[v]}/>
     <Seg label="Giants" values={amounts} value={o.giants} set={v=>opt('giants',v)} names={v=>amountNames[v]}/>
     <Seg label="Belts" values={amounts} value={o.belts} set={v=>opt('belts',v)} names={v=>amountNames[v]}/>
     <Seg label="Moons" values={['none','few','normal','many'] as const} value={o.moons} set={v=>opt('moons',v)} names={v=>({none:'None',few:'Few',normal:'Normal',many:'Many'})[v]}/>
     <label className="world-check"><input type="checkbox" checked={o.rings} onChange={e=>opt('rings',e.target.checked)}/><span>Rings on some giants</span></label>
     <Seg label="Era" values={eras} value={o.era} set={v=>opt('era',v)} names={word}/>
     <Seg label="Science" values={['realistic','pulp'] as const} value={o.science} set={v=>opt('science',v)} names={v=>v==='pulp'?'Pulp':'Realistic'}/>
     <small className="sector-size-note">{o.science==='pulp'?'Pulp bends the rules for adventure: breathable air, jungles and life where real physics would say no.':'Temperatures, water, air and life follow each world\'s distance from the star.'}</small>
     <label className="world-field">Points of interest <output>{o.poi}</output><input type="range" min={0} max={5} value={o.poi} onChange={e=>opt('poi',+e.target.value)}/></label>
     <Seg label="Naming" values={['roman','letters'] as const} value={o.naming} set={v=>opt('naming',v)} names={v=>v==='roman'?`${name.trim()||'Name'}-II`:`${name.trim()||'Name'} b`}/>
     {orgs.length>0&&<div className="world-field">Footholds<div className="system-orgs">{orgs.map(org=><label key={org.id} className="world-check"><input type="checkbox" checked={o.holders.includes(org.id)} disabled={!o.holders.includes(org.id)&&o.holders.length>=4} onChange={e=>opt('holders',e.target.checked?[...o.holders,org.id]:o.holders.filter(h=>h!==org.id))}/><span>{org.title}</span></label>)}</div></div>}
    </>}
    <div className="world-field">Backdrop<div className="world-seg sector-backdrops" role="group" aria-label="Backdrop">{backdrops.map(b=><button key={b} type="button" aria-pressed={backdrop===b} onClick={()=>setBackdrop(b)}>{backdropNames[b]}</button>)}</div></div>
    {!real&&<div className="world-field">Seed<div className="world-seed"><input aria-label="Seed" value={seed} maxLength={80} onChange={e=>setSeed(e.target.value)}/><button type="button" className="button" onClick={reroll}><Dices size={15}/> Reroll</button></div></div>}
   </div>
   <div className="world-generate-preview">
    <SystemOrbit className="system-preview" system={{...made,backdrop}} seed={seed} playing={false} showZones selected={null} label="Preview of the system"/>
    <p className="aside-hint">{made.bodies.length} worlds and {moons} {moons===1?'moon':'moons'}, {green} in the green zone{made.belts.length?`, ${made.belts.length} ${made.belts.length===1?'belt':'belts'}`:''}.{!real&&kept?` ${kept===1?'The world you locked or charted stays':`The ${kept} worlds you locked or charted stay`}.`:''}</p>
   </div>
  </div>
  <div className="button-row galaxy-dialog-actions">
   <button type="button" className="button" onClick={onClose}>Cancel</button>
   <button type="button" className="button primary" disabled={!name.trim()||(!real&&!seed.trim())} onClick={()=>onApply({...made,backdrop},name.trim())}>Run the survey</button>
  </div>
 </ToolDialog>;
}
