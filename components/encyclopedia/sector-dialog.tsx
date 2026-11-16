"use client";
/*
 * The sector generator: a name, size, how many systems and how many of them are rumours, the backdrop, the colour on
 * the galaxy map, lanes and a seed, with a live preview. On a Milky Way page it can start from the Local Bubble
 * (real stars around the Sun). Generating again keeps the systems the GM has changed.
 */
import {useMemo,useState} from 'react';
import {Dices} from 'lucide-react';
import {galaxyRandom} from '@/lib/encyclopedia/galaxies';
import {MAX_COLS,MAX_ROWS,backdropNames,backdrops,generateSector,localBubble,maxSystems,sectorColour,sectorName,sectorSizes,type Backdrop,type Sector,type SectorSizeId} from '@/lib/encyclopedia/sectors';
import {ToolDialog} from './tool-dialog';
import {SectorMap} from './sector-map';

type SizeChoice=SectorSizeId|'custom';
const sizeOf=(cols:number,rows:number):SizeChoice=>(Object.keys(sectorSizes) as SectorSizeId[]).find(k=>sectorSizes[k].cols===cols&&sectorSizes[k].rows===rows)??'custom';
const clamp=(v:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,Math.round(v)||lo));

export function SectorDialog({title,name:startName,sector,realAllowed,at,onApply,onClose}:{
 title:string;name:string;
 /** The sector being changed; absent for a new one. */
 sector?:Sector;
 /** The galaxy is the Milky Way, so the Local Bubble is offered. */
 realAllowed:boolean;
 at:{x:number;y:number};
 onApply:(sector:Sector,name:string)=>void;onClose:()=>void;
}){
 const start=sector,[name,setName]=useState(startName);
 const [cols,setCols]=useState(start?.cols??sectorSizes.medium.cols),[rows,setRows]=useState(start?.rows??sectorSizes.medium.rows);
 const [count,setCount]=useState(start?Math.max(1,start.systems.length):12),[rumours,setRumours]=useState(start?Math.round(start.systems.filter(s=>s.status==='rumour').length/Math.max(1,start.systems.length)*100):30);
 const [backdrop,setBackdrop]=useState<Backdrop>(start?.backdrop??'nebula'),[color,setColor]=useState(start?.color??sectorColour(galaxyRandom(`colour|${startName}`)));
 const [lanes,setLanes]=useState(start?start.lanes.length>0:true),[seed,setSeed]=useState(start?.seed??(startName||'sector')),[real,setReal]=useState(!!start?.real),[seedTouched,setSeedTouched]=useState(false);
 const size=sizeOf(cols,rows),max=maxSystems(cols,rows),kept=(start?.systems??[]).filter(s=>s.edited);
 const made=useMemo(()=>real?localBubble({x:start?.x??at.x,y:start?.y??at.y,color}):generateSector({cols,rows,count:Math.min(count,max),seed,lanes,rumours,x:start?.x??at.x,y:start?.y??at.y,color,backdrop},kept),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- kept only changes when the dialog opens
  [real,cols,rows,count,max,seed,lanes,rumours,color,backdrop,at.x,at.y]);
 const pickSize=(k:SizeChoice)=>{if(k!=='custom'){setCols(sectorSizes[k].cols);setRows(sectorSizes[k].rows);setCount(c=>Math.min(c,maxSystems(sectorSizes[k].cols,sectorSizes[k].rows)));}else{setCols(c=>c+1);}};
 const reroll=()=>{const r=galaxyRandom(`${Date.now()}:${Math.random()}`),n=sectorName(r);if(!start)setName(n);setSeed(n);setSeedTouched(false);};
 const keepLook=()=>start&&onApply({...start,color,backdrop},name.trim());
 return <ToolDialog title={title} wide onClose={onClose}>
  <div className="world-generate">
   <div className="world-generate-options">
    <label className="world-field">Name<input type="text" value={name} maxLength={160} onChange={e=>{setName(e.target.value);if(!start&&!seedTouched)setSeed(e.target.value||'sector');}}/></label>
    {realAllowed&&<label className="world-check"><input type="checkbox" checked={real} onChange={e=>{setReal(e.target.checked);if(e.target.checked)setBackdrop('deep');}}/><span>The Local Bubble<small>The Sun and real stars within about 25 ly, placed by distance and rough direction.</small></span></label>}
    {!real&&<>
     <div className="world-field">Size<div className="world-seg" role="group" aria-label="Size">{(Object.keys(sectorSizes) as SectorSizeId[]).map(k=><button key={k} type="button" aria-pressed={size===k} onClick={()=>pickSize(k)}>{sectorSizes[k].name}</button>)}<button type="button" aria-pressed={size==='custom'} onClick={()=>pickSize('custom')}>Custom</button></div>
      <small className="sector-size-note">{cols} × {rows} hexes, {cols*5} × {rows*5} ly</small></div>
     {size==='custom'&&<div className="sector-custom"><label className="world-field">Columns<input type="number" min={4} max={MAX_COLS} value={cols} onChange={e=>setCols(clamp(+e.target.value,4,MAX_COLS))}/></label><label className="world-field">Rows<input type="number" min={3} max={MAX_ROWS} value={rows} onChange={e=>setRows(clamp(+e.target.value,3,MAX_ROWS))}/></label></div>}
     <label className="world-field">Systems <output>{Math.min(count,max)}</output><input type="range" min={1} max={max} value={Math.min(count,max)} onChange={e=>setCount(+e.target.value)}/></label>
     <label className="world-field">Rumours <output>{rumours}%</output><input type="range" min={0} max={100} step={5} value={rumours} onChange={e=>setRumours(+e.target.value)}/></label>
     <label className="world-check"><input type="checkbox" checked={lanes} onChange={e=>setLanes(e.target.checked)}/><span>Join charted systems with lanes<small>Each charted system to its nearest charted neighbour.</small></span></label>
    </>}
    <div className="world-field">Backdrop<div className="world-seg sector-backdrops" role="group" aria-label="Backdrop">{backdrops.map(b=><button key={b} type="button" aria-pressed={backdrop===b} onClick={()=>setBackdrop(b)}>{backdropNames[b]}</button>)}</div></div>
    <label className="world-field sector-colour">Colour on the galaxy map<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>
    {!real&&<div className="world-field">Seed<div className="world-seed"><input aria-label="Seed" value={seed} maxLength={80} onChange={e=>{setSeed(e.target.value);setSeedTouched(true);}}/><button type="button" className="button" onClick={reroll}><Dices size={15}/> Reroll</button></div></div>}
    {kept.length>0&&!real&&<p className="aside-hint">{kept.length===1?'The system you changed stays':`The ${kept.length} systems you changed stay`} where {kept.length===1?'it is':'they are'}.</p>}
   </div>
   <div className="world-generate-preview">
    <SectorMap className="sector-preview" sector={{...made,backdrop}} label="Preview of the sector"/>
    <p className="aside-hint">{made.systems.length} systems, {made.systems.filter(s=>s.status==='rumour').length} of them rumours. One hex is 5 light years.</p>
   </div>
  </div>
  <div className="button-row galaxy-dialog-actions">
   <button type="button" className="button" onClick={onClose}>Cancel</button>
   {start&&<button type="button" className="button" disabled={!name.trim()} onClick={keepLook}>Save name and look only</button>}
   <button type="button" className="button primary" disabled={!name.trim()||(!real&&!seed.trim())} onClick={()=>onApply({...made,backdrop},name.trim())}>{start?'Generate again':'Make this sector'}</button>
  </div>
 </ToolDialog>;
}
