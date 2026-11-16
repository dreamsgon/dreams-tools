"use client";
/*
 * A galaxy page's Galaxy tab: the galaxy's art, whether it is real or invented, a short summary and its facts,
 * each typed in place. "Real galaxy or generate" picks one of the real galaxies or generates one from a shape,
 * arms, size and seed. Sectors, star systems and worlds hang off this page in later parts.
 */
import {useMemo,useState} from 'react';
import {Dices,Hexagon,Plus,Telescope,X} from 'lucide-react';
import {compareEntries,newId,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {factLabels,galaxyPresetIds,galaxyPresets,galaxyRandom,galaxyShapes,galaxySizes,generateGalaxy,hasArms,newGalaxy,presetGalaxy,randomGalaxySettings,shapeNames,sizeNames,type Galaxy,type GalaxyFacts,type GalaxyPresetId,type GalaxyShape,type GalaxySize} from '@/lib/encyclopedia/galaxies';
import {ToolDialog} from './tool-dialog';
import {GalaxyArt} from './galaxy-art';
import {SectorDialog} from './sector-dialog';
import './galaxy.css';

const factKeys=Object.keys(factLabels) as (keyof GalaxyFacts)[];

/** The Galaxy tab. */
export function GalaxySheet({entry,data,update,change,onOpen}:{entry:Entry;data:Workspace;update:(p:Partial<Entry>)=>void;change:(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;onOpen:(id:string)=>void}){
 const galaxy=entry.galaxy??newGalaxy(entry.title),[choosing,setChoosing]=useState(false),[placing,setPlacing]=useState(false),[at,setAt]=useState<{x:number;y:number}|null>(null);
 const sectors=data.entries.filter(e=>e.parentId===entry.id&&e.kind==='sector'&&e.sector).sort(compareEntries);
 const place=(e:React.MouseEvent<HTMLDivElement>)=>{if(!placing)return;const box=e.currentTarget.getBoundingClientRect();setAt({x:Math.min(1,Math.max(0,(e.clientX-box.left)/box.width)),y:Math.min(1,Math.max(0,(e.clientY-box.top)/box.height))});setPlacing(false);};
 const addSector=(sector:NonNullable<Entry['sector']>,title:string)=>{const id=newId(),page:Entry={id,worldId:entry.worldId,campaignId:entry.campaignId,parentId:entry.id,title:title.slice(0,160),kind:'sector',body:'',sector,updatedAt:new Date().toISOString()};
  if(change(w=>({...w,entries:[...w.entries,page]}))!==false){setAt(null);onOpen(id);}};
 const real=galaxy.preset?galaxyPresets[galaxy.preset]:undefined;
 const save=(patch:Partial<Galaxy>)=>update({galaxy:{...galaxy,...patch}});
 return <div className="galaxy-sheet">
  <div className={`galaxy-view${placing?' is-placing':''}`} onClick={place}>
   <GalaxyArt className="galaxy-canvas" spec={galaxy} label={`${shapeNames[galaxy.shape]} galaxy${galaxy.arms?` with ${galaxy.arms} arms`:''}`}/>
   {sectors.map(s=><button key={s.id} type="button" className="galaxy-sector" style={{left:`${s.sector!.x*100}%`,top:`${s.sector!.y*100}%`,['--sector' as string]:s.sector!.color}} disabled={placing} onClick={()=>onOpen(s.id)} title={`Open ${s.title}`}><i/><span>{s.title}</span></button>)}
   <div className="galaxy-layers"><button type="button" aria-pressed={placing} onClick={e=>{e.stopPropagation();setPlacing(v=>!v);}}>{placing?<><X size={14}/> Cancel</>:<><Plus size={14}/> New sector</>}</button></div>
   {placing&&<span className="galaxy-placing">Tap the galaxy where the sector is</span>}
   <span className="galaxy-scale">{real?'Schematic, not a star chart':`${shapeNames[galaxy.shape]}${hasArms(galaxy.shape)?`, ${galaxy.arms} arms`:''}`}</span>
  </div>
  <div className="galaxy-side">
   <div className="galaxy-chips"><span className={`galaxy-chip ${real?'is-real':''}`}>{real?`Real: ${real.name}`:'Invented'}</span><span className="galaxy-chip">{sizeNames[galaxy.size]}</span></div>
   <textarea key={`s${galaxy.summary}`} className="galaxy-summary" aria-label="Summary" placeholder="A line or two about this galaxy." maxLength={600} rows={3} defaultValue={galaxy.summary} onBlur={e=>{const v=e.target.value.trim();if(v!==galaxy.summary)save({summary:v});}}/>
   <div className="galaxy-facts">{factKeys.map(k=><label key={k} className="galaxy-fact"><span>{factLabels[k]}</span>
    <input key={`${k}${galaxy.facts[k]}`} defaultValue={galaxy.facts[k]} maxLength={120} placeholder="—" onBlur={e=>{const v=e.target.value.trim();if(v!==galaxy.facts[k])save({facts:{...galaxy.facts,[k]:v}});}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/></label>)}</div>
   <button type="button" className="button" onClick={()=>setChoosing(true)}><Telescope size={15}/> Real galaxy or generate</button>
   {real&&<p className="aside-hint">Facts are rounded published estimates. Change any of them for your setting.</p>}
   <div className="galaxy-sectors"><span className="eyebrow">SECTORS</span>
    {sectors.map(s=><button key={s.id} type="button" className="galaxy-sector-row" onClick={()=>onOpen(s.id)}><span className="sector-swatch" style={{background:s.sector!.color}}/><span><strong>{s.title}</strong><small>{s.sector!.cols} × {s.sector!.rows} hexes · {s.sector!.systems.length} systems</small></span></button>)}
    {!sectors.length&&<p className="aside-hint">Sectors are hex maps of parts of this galaxy, one hex to 5 light years. Use New sector on the picture to place one.</p>}
    <button type="button" className="button small" onClick={()=>setPlacing(true)}><Hexagon size={14}/> New sector</button>
   </div>
  </div>
  {at&&<SectorDialog title="New sector" name="" realAllowed={galaxy.preset==='milky'} at={at} onClose={()=>setAt(null)} onApply={addSector}/>}
  {choosing&&<GalaxyDialog entry={entry} galaxy={galaxy} onClose={()=>setChoosing(false)} onPick={(next,title)=>{update({galaxy:next,...(title?{title}:{})});setChoosing(false);}}/>}
 </div>;
}

type Settings={shape:GalaxyShape;arms:number;size:GalaxySize;seed:string};

/** Pick a real galaxy, or generate one. Nothing changes until "Use…". */
function GalaxyDialog({entry,galaxy,onClose,onPick}:{entry:Entry;galaxy:Galaxy;onClose:()=>void;onPick:(g:Galaxy,title?:string)=>void}){
 const [tab,setTab]=useState<'real'|'generate'>(galaxy.preset?'real':'generate');
 const [chosen,setChosen]=useState<GalaxyPresetId>(galaxy.preset??'milky'),[rename,setRename]=useState(true);
 const [o,setO]=useState<Settings>({shape:galaxy.shape,arms:galaxy.arms||3,size:galaxy.size,seed:galaxy.preset?entry.title:galaxy.seed});
 const [name,setName]=useState(entry.title);
 const made=useMemo(()=>generateGalaxy(o),[o]);
 const reroll=()=>{const r=randomGalaxySettings(galaxyRandom(`${Date.now()}:${Math.random()}`));setO({shape:r.shape,arms:r.arms||3,size:r.size,seed:r.seed});setName(r.name);};
 const preset=galaxyPresets[chosen];
 return <ToolDialog title="Real galaxy or generate" wide onClose={onClose}>
  <div className="world-seg galaxy-tabs" role="group" aria-label="Start from"><button type="button" aria-pressed={tab==='real'} onClick={()=>setTab('real')}>Real galaxies</button><button type="button" aria-pressed={tab==='generate'} onClick={()=>setTab('generate')}>Generate</button></div>
  {tab==='real'?<>
   <div className="galaxy-presets" role="radiogroup" aria-label="Real galaxies">{galaxyPresetIds.map(id=>{const p=galaxyPresets[id];return <button key={id} type="button" role="radio" aria-checked={chosen===id} className="galaxy-preset" onClick={()=>setChosen(id)}>
    <GalaxyArt className="galaxy-preset-art" spec={{seed:id,shape:p.shape,arms:p.arms}} label=""/>
    <span className="galaxy-preset-text"><strong>{p.name}</strong><small>{p.facts.type}</small><small>{p.facts.across} · {p.facts.stars} stars · {p.facts.distance==='Home'?'our galaxy':`${p.facts.distance} away`}</small></span></button>;})}</div>
   <p className="aside-hint">{preset.summary} Figures are rounded published estimates.</p>
   {entry.title!==preset.name&&<label className="world-check"><input type="checkbox" checked={rename} onChange={e=>setRename(e.target.checked)}/><span>Rename this page to {preset.name}</span></label>}
   <div className="button-row galaxy-dialog-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={()=>onPick(presetGalaxy(chosen),rename&&entry.title!==preset.name?preset.name:undefined)}>Use {preset.name}</button></div>
  </>:<>
   <div className="world-generate">
    <div className="world-generate-options">
     <label className="world-field">Name<input type="text" value={name} maxLength={160} onChange={e=>setName(e.target.value)}/></label>
     <div className="world-field">Shape<div className="world-seg" role="group" aria-label="Shape">{galaxyShapes.map(s=><button key={s} type="button" aria-pressed={o.shape===s} onClick={()=>setO(v=>({...v,shape:s}))}>{shapeNames[s].replace(' spiral','')}</button>)}</div></div>
     {hasArms(o.shape)&&<label className="world-field">Arms <output>{o.arms}</output><input type="range" min={2} max={6} value={o.arms} onChange={e=>setO(v=>({...v,arms:+e.target.value}))}/></label>}
     <div className="world-field">Size<div className="world-seg" role="group" aria-label="Size">{galaxySizes.map(s=><button key={s} type="button" aria-pressed={o.size===s} onClick={()=>setO(v=>({...v,size:s}))}>{sizeNames[s]}</button>)}</div></div>
     <div className="world-field">Seed<div className="world-seed"><input aria-label="Seed" value={o.seed} maxLength={80} onChange={e=>setO(v=>({...v,seed:e.target.value}))}/><button type="button" className="button" onClick={reroll}><Dices size={15}/> Reroll</button></div></div>
     <p className="aside-hint">Reroll picks a new name, shape and seed. The same settings always make the same galaxy.</p>
    </div>
    <div className="world-generate-preview">
     <GalaxyArt className="galaxy-preview" spec={made} label="Preview of the generated galaxy"/>
     <div className="galaxy-facts is-preview">{factKeys.filter(k=>k!=='distance').map(k=><div key={k} className="galaxy-fact"><span>{factLabels[k]}</span><b>{made.facts[k]}</b></div>)}</div>
    </div>
   </div>
   <div className="button-row galaxy-dialog-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" disabled={!o.seed.trim()||!name.trim()} onClick={()=>onPick({...made,summary:galaxy.preset?'':galaxy.summary},name.trim()!==entry.title?name.trim():undefined)}>Use this galaxy</button></div>
  </>}
 </ToolDialog>;
}
