"use client";
/*
 * FTL drives for a galaxy: how ships cross between stars besides light speed. Each drive is faster than light at a
 * multiple of c, jumps of a set range with a recharge between them, or lanes only at a set time per hex, and may need
 * to clear the star first (past 1 AU or past the frost line). Drives live on the galaxy page, so every sector and
 * system in it uses the same ones. Opened from a star system's Survey chart or a sector's Hex map.
 */
import {useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {ftlModeNames,ftlModes,ftlStartNames,ftlStarts,newDrive,type Drive} from '@/lib/encyclopedia/galaxies';
import {travelBetweenStars} from '@/lib/encyclopedia/star-systems';
import {ToolDialog} from './tool-dialog';

/** The galaxy page a page sits in (its own page, a parent, or further up), if any. */
export function galaxyOf(entry:Entry,data:Workspace):Entry|undefined{
 let at:Entry|undefined=entry;for(let i=0;at&&i<8;i++){if(at.kind==='galaxy'&&at.galaxy)return at;const up:string|null=at.parentId;at=up?data.entries.find(e=>e.id===up):undefined;}
 return undefined;
}

const num=(v:string,lo:number,hi:number,fallback:number)=>{const n=+v;return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):fallback;};
export function FtlDialog({galaxy,change,onClose}:{galaxy?:Entry;change:(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;onClose:()=>void}){
 const [drives,setDrives]=useState<Drive[]>(galaxy?.galaxy?.drives??[]);
 const edit=(id:string,patch:Partial<Drive>)=>setDrives(ds=>ds.map(d=>d.id===id?{...d,...patch}:d));
 const add=()=>setDrives(ds=>{let n=ds.length+1;while(ds.some(d=>d.id===`drive${n}`))n++;return [...ds,newDrive(n)];});
 const done=()=>{if(galaxy)change(w=>({...w,entries:w.entries.map(e=>e.id===galaxy.id&&e.galaxy?{...e,galaxy:{...e.galaxy,drives:drives.map(d=>({...d,name:d.name.trim()||'Drive'}))},updatedAt:new Date().toISOString()}:e)}));onClose();};
 if(!galaxy)return <ToolDialog title="FTL drives" onClose={onClose}><p className="aside-hint">FTL drives belong to a galaxy, so everything in it travels the same way. Move this page into a galaxy page, or into a sector inside one, to set them.</p><div className="button-row galaxy-dialog-actions"><button type="button" className="button" onClick={onClose}>Close</button></div></ToolDialog>;
 return <ToolDialog title={`FTL drives in ${galaxy.title}`} wide onClose={onClose}>
  <p className="aside-hint">Light speed is always included. Add your setting&apos;s drives to see their travel times on hex maps and survey charts.</p>
  <div className="ftl-list">{drives.map(d=><fieldset key={d.id} className="ftl-drive">
   <div className="ftl-row"><label className="world-field ftl-name">Name<input value={d.name} maxLength={60} onChange={e=>edit(d.id,{name:e.target.value})}/></label>
    <button type="button" className="icon-button" aria-label={`Remove ${d.name||'drive'}`} onClick={()=>setDrives(ds=>ds.filter(x=>x.id!==d.id))}><Trash2 size={15}/></button></div>
   <div className="world-seg" role="group" aria-label="How it works">{ftlModes.map(m=><button key={m} type="button" aria-pressed={d.mode===m} onClick={()=>edit(d.id,{mode:m})}>{ftlModeNames[m].name}</button>)}</div>
   <small className="sector-size-note">{ftlModeNames[d.mode].hint}</small>
   <div className="ftl-numbers">
    {d.mode==='speed'&&<label className="world-field">Times light speed<input type="number" min={1} max={1e9} defaultValue={d.speed} onBlur={e=>edit(d.id,{speed:num(e.target.value,1,1e9,d.speed)})}/></label>}
    {d.mode==='jump'&&<><label className="world-field">Light years per jump<input type="number" min={0.1} max={100000} step={0.1} defaultValue={d.range} onBlur={e=>edit(d.id,{range:num(e.target.value,0.1,100000,d.range)})}/></label>
     <label className="world-field">Hours per jump<input type="number" min={0} max={100000} defaultValue={d.jumpHours} onBlur={e=>edit(d.id,{jumpHours:num(e.target.value,0,100000,d.jumpHours)})}/></label>
     <label className="world-field">Recharge (hours)<input type="number" min={0} max={100000} defaultValue={d.recharge} onBlur={e=>edit(d.id,{recharge:num(e.target.value,0,100000,d.recharge)})}/></label></>}
    {d.mode==='lanes'&&<label className="world-field">Days per hex<input type="number" min={0.01} max={10000} step={0.1} defaultValue={d.laneDays} onBlur={e=>edit(d.id,{laneDays:num(e.target.value,0.01,10000,d.laneDays)})}/></label>}
    <label className="world-field">Can start<select value={d.start} onChange={e=>edit(d.id,{start:e.target.value as Drive['start']})}>{ftlStarts.map(s=><option key={s} value={s}>{ftlStartNames[s]}</option>)}</select></label>
   </div>
   <small className="sector-size-note">To a star 10 ly away: {travelBetweenStars(10,[d],{hexes:2}).slice(1).map(r=>r.time).join('')}.</small>
  </fieldset>)}</div>
  {drives.length<6&&<button type="button" className="button small" onClick={add}><Plus size={14}/> Add a drive</button>}
  <div className="button-row galaxy-dialog-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={done}>Save drives</button></div>
 </ToolDialog>;
}
