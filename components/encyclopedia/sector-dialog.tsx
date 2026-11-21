"use client";
/*
 * The sector generator: a name, size, how many systems and how many of them are rumours, the backdrop, the colour on
 * the galaxy map, lanes and a seed, with a live preview. On a Milky Way page it can start from the Local Bubble
 * (real stars around the Sun). Generating again keeps the systems the GM has changed.
 */
import {useMemo,useState} from 'react';
import {galaxyRandom} from '@/lib/encyclopedia/galaxies';
import {MAX_COLS,MAX_ROWS,backdropNames,backdrops,generateSector,localBubble,maxSystems,sectorColour,sectorName,sectorSizes,type Backdrop,type Sector,type SectorSizeId} from '@/lib/encyclopedia/sectors';
import {Actions,Check,Choice,Field,GenDialog,Generator,Hint,Picture,Range,Section,Seed,Summary} from '../generator/generator';
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
 // A new sector starts with a made-up name, so it can be made straight away; the name also seeds it.
 const start=sector,[firstName]=useState(()=>startName||sectorName(galaxyRandom(`${Date.now()}:${Math.random()}`))),[name,setName]=useState(firstName);
 const [cols,setCols]=useState(start?.cols??sectorSizes.medium.cols),[rows,setRows]=useState(start?.rows??sectorSizes.medium.rows);
 const [count,setCount]=useState(start?Math.max(1,start.systems.length):12),[rumours,setRumours]=useState(start?Math.round(start.systems.filter(s=>s.status==='rumour').length/Math.max(1,start.systems.length)*100):30);
 const [backdrop,setBackdrop]=useState<Backdrop>(start?.backdrop??'nebula'),[color,setColor]=useState(start?.color??sectorColour(galaxyRandom(`colour|${firstName}`)));
 const [lanes,setLanes]=useState(start?start.lanes.length>0:true),[seed,setSeed]=useState(start?.seed??firstName),[real,setReal]=useState(!!start?.real),[seedTouched,setSeedTouched]=useState(false);
 const size=sizeOf(cols,rows),max=maxSystems(cols,rows),kept=(start?.systems??[]).filter(s=>s.edited||s.pageId);
 const made=useMemo(()=>real?localBubble({x:start?.x??at.x,y:start?.y??at.y,color}):generateSector({cols,rows,count:Math.min(count,max),seed,lanes,rumours,x:start?.x??at.x,y:start?.y??at.y,color,backdrop},kept),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- kept only changes when the dialog opens
  [real,cols,rows,count,max,seed,lanes,rumours,color,backdrop,at.x,at.y]);
 const pickSize=(k:SizeChoice)=>{if(k!=='custom'){setCols(sectorSizes[k].cols);setRows(sectorSizes[k].rows);setCount(c=>Math.min(c,maxSystems(sectorSizes[k].cols,sectorSizes[k].rows)));}else{setCols(c=>c+1);}};
 const reroll=()=>{const r=galaxyRandom(`${Date.now()}:${Math.random()}`),n=sectorName(r);if(!start)setName(n);setSeed(n);setSeedTouched(false);};
 const keepLook=()=>start&&onApply({...start,color,backdrop},name.trim());
 const rumoured=made.systems.filter(s=>s.status==='rumour').length,summary=`${made.systems.length} systems, ${rumoured} of them rumours. One hex is 5 light years.`;
 return <GenDialog title={title} onClose={onClose}>
  <Generator
   settings={<>
    <Section title="Sector" summary={real?'The Local Bubble':`${cols} × ${rows} hexes`} open>
     <Field label="Name"><input type="text" value={name} maxLength={160} onChange={e=>{setName(e.target.value);if(!start&&!seedTouched)setSeed(e.target.value||'sector');}}/></Field>
     {realAllowed&&<Check label="The Local Bubble" hint="The Sun and real stars within about 25 ly, placed by distance and rough direction." checked={real} onChange={v=>{setReal(v);if(v)setBackdrop('deep');}}/>}
     {!real&&<Choice label="Size" value={size} options={[...(Object.keys(sectorSizes) as SectorSizeId[]).map(k=>[k,sectorSizes[k].name] as const),['custom','Custom'] as const]} onChange={pickSize} hint={`${cols} × ${rows} hexes, ${cols*5} × ${rows*5} ly`}/>}
     {!real&&size==='custom'&&<div className="gen-pair"><Field label="Columns"><input type="number" min={4} max={MAX_COLS} value={cols} onChange={e=>setCols(clamp(+e.target.value,4,MAX_COLS))}/></Field><Field label="Rows"><input type="number" min={3} max={MAX_ROWS} value={rows} onChange={e=>setRows(clamp(+e.target.value,3,MAX_ROWS))}/></Field></div>}
    </Section>
    {!real&&<Section title="Systems" summary={`${Math.min(count,max)}, ${rumours}% rumours`} open>
     <Range label="Systems" value={Math.min(count,max)} min={1} max={max} shown={String(Math.min(count,max))} onChange={setCount}/>
     <Range label="Rumours" value={rumours} min={0} max={100} step={5} shown={`${rumours}%`} onChange={setRumours} hint="Systems only spoken of, not yet charted."/>
     <Check label="Join charted systems with lanes" hint="Each charted system to its nearest charted neighbour." checked={lanes} onChange={setLanes}/>
     {kept.length>0&&<Hint>{kept.length===1?'The system you changed stays':`The ${kept.length} systems you changed stay`} where {kept.length===1?'it is':'they are'}.</Hint>}
    </Section>}
    <Section title="Look" summary={backdropNames[backdrop]} open>
     <Choice label="Backdrop" value={backdrop} options={backdrops.map(b=>[b,backdropNames[b]] as const)} onChange={setBackdrop}/>
     <Field label="Colour on the galaxy map"><input type="color" value={color} onChange={e=>setColor(e.target.value)}/></Field>
    </Section>
   </>}
   seed={!real&&<Seed value={seed} maxLength={80} onChange={v=>{setSeed(v);setSeedTouched(true);}} rerolls={[{label:'Reroll',onClick:reroll,title:start?'A new seed':'A new name and seed'}]}/>}
   picture={<Picture><SectorMap className="sector-preview" sector={{...made,backdrop}} label={`Preview of the sector: ${summary}`}/></Picture>}
   summary={<Summary text={summary}/>}
   actions={<Actions why={!name.trim()&&'Give the sector a name first.'} start={start&&<button type="button" className="gen-btn" disabled={!name.trim()} onClick={keepLook}>Save name and look only</button>}>
    <button type="button" className="gen-btn" onClick={onClose}>Cancel</button>
    <button type="button" className="gen-btn primary" disabled={!name.trim()||(!real&&!seed.trim())} onClick={()=>onApply({...made,backdrop},name.trim())}>{start?'Generate again':'Make this sector'}</button>
   </Actions>}
  />
 </GenDialog>;
}
