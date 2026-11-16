"use client";
/*
 * A star system page's Survey chart tab: the animated orbit scene on top, then the chart (worlds grouped by zone, out
 * from the star, with the gap and travel time between neighbours, belts and moons) beside the system file (hooks and a
 * travel calculator). Tapping a world opens its sheet: the sky from its surface, every survey field (edited ones are
 * marked), lock, reroll and remove, and the GM's notes. Survey settings runs the survey again; locked worlds stay.
 */
import {Fragment,useMemo,useState} from 'react';
import {Dices,Flag,Lock,LockOpen,Pause,Play,Plus,RefreshCw,Rocket,Settings2,Trash2} from 'lucide-react';
import {newId,visibleEntries,type Campaign,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {systemCheckRequest,type SystemChange} from '@/lib/encyclopedia/system-check';
import {mirrorPlanets,planetOf} from '@/lib/encyclopedia/planets';
import {starInfo} from '@/lib/encyclopedia/sectors';
import {addWorldOutside,editWorld,findWorld,formatAU,hookKinds,isGiant,newStarSystem,parentOf,removeWorld,rerollHook,rerollWorld,starPhysics,starSizeFrom,travelInSystem,word,worldKindNames,worldLine,worldSummary,yearLength,zoneNotes,zoneOf,zones,type InSystemDrive,type Moon,type StarSystem,type SystemBody,type World,type ZoneName} from '@/lib/encyclopedia/star-systems';
import {Horizon,SystemOrbit,WorldDot,worldPx} from './system-art';
import {WorldFields} from './world-fields';
import {SystemDialog} from './system-dialog';
import {FtlDialog,galaxyOf} from './ftl-dialog';
import {SystemAiCheck} from './system-ai-check';
import {confirmDialog} from '../confirm-dialog';
import './galaxy.css';

type Props={entry:Entry;data:Workspace;campaign?:Campaign;update:(p:Partial<Entry>)=>void;change:(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;onOpen:(id:string)=>void};
const hookNames={lure:'Lure',danger:'Danger',secret:'Secret'};
const zoneClass=(z:ZoneName)=>`is-${z.toLowerCase()}`;
export const starLine=(s:StarSystem)=>`Class ${s.star}, ${starInfo[s.star].colour.toLowerCase()} · ${starPhysics[s.star].heat.toLowerCase()} · lives ${starPhysics[s.star].life.toLowerCase()}${s.companions.length?` · with ${s.companions.map(c=>`a Class ${c.star} companion${c.separation==='close'?' close in':' far out'}`).join(' and ')}`:''}`;

export function SystemSheet({entry,data,campaign,change,onOpen}:Props){
 const system=entry.starSystem??newStarSystem(entry.title),z=zones(system);
 const galaxyPage=galaxyOf(entry,data),drives=galaxyPage?.galaxy?.drives??[];
 const orgs=useMemo(()=>data.entries.filter(e=>e.kind==='faction'&&e.worldId===entry.worldId&&(e.campaignId===null||e.campaignId===entry.campaignId)).sort((a,b)=>a.title.localeCompare(b.title)),[data.entries,entry.worldId,entry.campaignId]);
 const nameOf=(id?:string)=>id?data.entries.find(e=>e.id===id)?.title:undefined;
 const firstPick=(system.bodies.find(b=>zoneOf(b.au,z)==='Green')??system.bodies[0])?.id??null;
 const [picked,setPicked]=useState<string|null>(firstPick),[playing,setPlaying]=useState(true),[showZones,setShowZones]=useState(true),[drive,setDrive]=useState<InSystemDrive>('light');
 const [settings,setSettings]=useState(false),[ftl,setFtl]=useState(false),[from,setFrom]=useState(''),[to,setTo]=useState('');
 /** Saves the chart, refreshing the pages of charted worlds with it. */
 const save=(next:StarSystem)=>change(w=>({...w,entries:mirrorPlanets(w.entries.map(e=>e.id===entry.id?{...e,starSystem:next,updatedAt:new Date().toISOString()}:e),entry.id)}));
 /** Gives a world its own place page inside this system page, with a copy of its fields, and opens it. */
 const chart=(w:World)=>{const id=newId(),now=new Date().toISOString(),next=editWorld(system,w.id,{pageId:id});
  const page:Entry={id,worldId:entry.worldId,campaignId:entry.campaignId,parentId:entry.id,title:w.name,kind:'place',body:w.note.trim()||worldSummary(system,w,entry.title),planet:planetOf(entry.id,next,findWorld(next,w.id)!),updatedAt:now};
  if(change(d=>({...d,entries:[...d.entries.map(e=>e.id===entry.id?{...e,starSystem:next,updatedAt:now}:e),page]}))!==false)onOpen(id);};
 const pageOf=(w:World)=>w.pageId?data.entries.find(e=>e.id===w.pageId&&e.planet?.bodyId===w.id):undefined;
 const sel=picked?findWorld(system,picked):undefined,openPlanet=sel?(parentOf(system,sel.id)?.id??sel.id):null;
 type Item={au:number;b?:SystemBody;belt?:StarSystem['belts'][number]};
 const items:Item[]=[...system.bodies.map(b=>({au:b.au,b})),...system.belts.map(belt=>({au:belt.au,belt}))].sort((a,b)=>a.au-b.au);
 const driveOptions:[InSystemDrive,string][]=[['light','Light speed'],['torch','Torch ship at 1 g'],['transfer','Transfer orbit'],...drives.map(d=>[`ftl:${d.id}`,d.name] as [InSystemDrive,string])];
 const driveName=driveOptions.find(d=>d[0]===drive)?.[1]??'Light speed';
 const W=system.bodies,a=W.find(w=>w.id===from)??W[0],b=W.find(w=>w.id===to)??W[W.length-1];
 const holderNames=system.options.holders.map(nameOf).filter((x):x is string=>!!x);
 /** Check with your AI: the pages it can read (the system, the sector and galaxy above it, and the holders first), and where a fix goes. */
 const ai=(()=>{
  const pages=visibleEntries(data,entry.worldId,entry.campaignId).filter(e=>e.id===entry.id||!['folder','session','tasks','map'].includes(e.kind));
  const suggested:string[]=entry.body.trim()?[entry.id]:[];
  for(let up=entry.parentId,n=0;up&&n<6&&suggested.length<4;n++){const e=data.entries.find(x=>x.id===up);if(!e)break;if(e.kind!=='folder'&&e.body.trim())suggested.push(e.id);up=e.parentId;}
  for(const h of system.options.holders)if(suggested.length<6&&!suggested.includes(h)&&pages.some(e=>e.id===h&&e.body.trim()))suggested.push(h);
  const c=campaign&&(entry.campaignId===null||entry.campaignId===campaign.id)?campaign:data.campaigns.find(x=>x.id===entry.campaignId),w=data.worlds.find(x=>x.id===entry.worldId);
  return {campaignId:c?.id??null,campaign:{name:c?.name??w?.name??'My campaign',description:c?.description||w?.description||undefined},pages,suggested};
 })();
 const applyFix=(c:SystemChange)=>save(editWorld(system,c.world,{[c.field]:c.value} as Partial<Moon>));
 /** Survey settings applied: the page's name, and its hex on the sector map, follow. */
 const apply=(next:StarSystem,name:string)=>{
  const link=next.sector;
  change(w=>({...w,entries:mirrorPlanets(w.entries.map(e=>e.id===entry.id?{...e,starSystem:next,title:name||e.title,updatedAt:new Date().toISOString()}:link&&e.id===link.pageId&&e.sector?{...e,sector:{...e.sector,systems:e.sector.systems.map(x=>x.id===link.systemId?{...x,star:next.star,name:(name||x.name).slice(0,80),status:'charted' as const,edited:true}:x)},updatedAt:new Date().toISOString()}:e),entry.id)}));
  setSettings(false);setPicked((next.bodies.find(x=>zoneOf(x.au,zones(next))==='Green')??next.bodies[0])?.id??null);
 };
 return <div className="system-sheet">
  <div className="system-view">
   <SystemOrbit className="system-canvas" system={system} seed={entry.id} playing={playing} showZones={showZones} selected={picked} onPick={id=>setPicked(id)} label={`Orbits of ${entry.title}: ${system.bodies.length} worlds around a Class ${system.star} star`}/>
   <div className="sector-layers">
    <button type="button" aria-pressed={playing} onClick={()=>setPlaying(v=>!v)}>{playing?<><Pause size={14}/> Pause</>:<><Play size={14}/> Play</>}</button>
    <button type="button" aria-pressed={showZones} onClick={()=>setShowZones(v=>!v)}>Zones</button>
   </div>
   {showZones&&<span className="system-key"><i className="is-green"/>Green zone<i className="is-frost"/>Frost line</span>}
  </div>
  <div className="system-head">
   <WorldDot star={system.star} size={46}/>
   <div className="system-title"><strong>{entry.title}</strong><small>{starLine(system)}</small></div>
   <div className="galaxy-chips">{system.real&&<span className="galaxy-chip is-real">Real data</span>}{system.options.science==='pulp'&&<span className="galaxy-chip">Pulp</span>}<span className="galaxy-chip">{word(system.options.era)}</span></div>
   <button type="button" className="button" onClick={()=>setSettings(true)}><Settings2 size={15}/> Survey settings</button>
  </div>
  {system.premise&&<p className="system-premise">{system.premise}</p>}
  <div className="system-cols">
   <div className="system-chart">
    {items.map((it,i)=>{
     const before=items[i-1],zone=zoneOf(it.au,z),head=!before||zoneOf(before.au,z)!==zone,fromAu=before&&!head?before.au:null,gap=fromAu===null?null:it.au-fromAu;
     return <Fragment key={it.b?.id??it.belt!.id}>
      {head&&<div className={`system-zone ${zoneClass(zone)}`}><b>{zone} zone</b><span>{zoneNotes[zone]}{zone==='Frost'?` · frost line ${formatAU(z.frost)} AU`:''}</span></div>}
      {gap!==null&&fromAu!==null&&<div className="system-gap"><span>+{formatAU(gap)} AU · {travelInSystem(fromAu,it.au,drive,system.star,drives).time}</span></div>}
      {it.belt?<div className="system-belt"><b>{it.belt.name}</b><span>{formatAU(it.belt.au)} AU</span></div>
       :<WorldCard world={it.b!} system={system} open={openPlanet===it.b!.id} picked={picked} holder={nameOf(it.b!.holderId)} onPick={id=>setPicked(picked===id?null:id)}>
        {openPlanet===it.b!.id&&sel&&<WorldSheet key={sel.id} world={sel} system={system} entry={entry} orgs={orgs} holderNames={holderNames} save={save} onOpen={onOpen} onGone={()=>setPicked(null)} page={pageOf(sel)} onChart={()=>chart(sel)}/>}
       </WorldCard>}
     </Fragment>;})}
    {!system.bodies.length&&<p className="aside-hint">No worlds yet. Run the survey, or add one.</p>}
    <button type="button" className="button small system-add" onClick={()=>{const next=addWorldOutside(system,entry.title);save(next);setPicked(next.bodies[next.bodies.length-1].id);}} disabled={system.bodies.length>=16}><Plus size={14}/> Add a world farther out</button>
   </div>
   <aside className="system-side">
    <span className="eyebrow">Hooks</span>
    {system.hooks.map(h=><div key={h.id} className={`system-hook is-${h.kind}`}>
     <div className="system-hook-top"><b>{hookNames[h.kind]}{h.kind==='secret'?' · GM only':''}</b>
      <button type="button" className="icon-button" aria-pressed={!!h.locked} title={h.locked?'Kept when the survey runs again':'Keep it when the survey runs again'} aria-label={h.locked?`Unlock the ${h.kind}`:`Lock the ${h.kind}`} onClick={()=>save({...system,hooks:system.hooks.map(x=>x.id===h.id?{...x,locked:!x.locked}:x)})}>{h.locked?<Lock size={14}/>:<LockOpen size={14}/>}</button>
      <button type="button" className="icon-button" title="A different one" aria-label={`Reroll the ${h.kind}`} onClick={()=>save(rerollHook(system,h.id,entry.title,holderNames[0]??'A rival house'))}><RefreshCw size={14}/></button></div>
     <textarea key={`${h.id}${h.text}`} aria-label={hookNames[h.kind]} defaultValue={h.text} maxLength={400} rows={3} onBlur={e=>{const v=e.target.value.trim();if(v!==h.text)save({...system,hooks:system.hooks.map(x=>x.id===h.id?{...x,text:v,locked:true}:x)});}}/>
    </div>)}
    {system.hooks.length<hookKinds.length&&<button type="button" className="button small" onClick={()=>{const kind=hookKinds.find(k=>!system.hooks.some(h=>h.kind===k))!;save(rerollHook({...system,hooks:[...system.hooks,{id:kind,kind,text:''}]},kind,entry.title,holderNames[0]??'A rival house'));}}><Plus size={14}/> Add a hook</button>}
    <span className="eyebrow">Travel</span>
    {W.length>1?<div className="system-travel">
     <div className="system-travel-pair"><label className="world-field">From<select value={a.id} onChange={e=>setFrom(e.target.value)}>{W.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <label className="world-field">To<select value={b.id} onChange={e=>setTo(e.target.value)}>{W.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label></div>
     <label className="world-field">Drive<select value={drive} onChange={e=>setDrive(e.target.value as InSystemDrive)}>{driveOptions.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
     {(()=>{const t=travelInSystem(a.au,b.au,drive,system.star,drives);return <div className="system-travel-result"><strong>{a.id===b.id?'Here':t.time}</strong><small>{formatAU(Math.abs(b.au-a.au))} AU, {t.how}.</small></div>;})()}
     <p className="aside-hint">Gaps on the chart use {driveName.toLowerCase()==='light speed'?'light speed':driveName}.</p>
    </div>:<p className="aside-hint">Two or more worlds give travel times.</p>}
    <button type="button" className="button small" onClick={()=>setFtl(true)}><Rocket size={14}/> FTL drives</button>
    <SystemAiCheck key={entry.id} campaignId={ai.campaignId} campaign={ai.campaign} pages={ai.pages} suggested={ai.suggested} request={systemCheckRequest(system,entry.title,nameOf)} worldName={id=>findWorld(system,id)?.name} onApply={applyFix}/>
   </aside>
  </div>
  {settings&&<SystemDialog name={entry.title} system={system} orgs={orgs} onClose={()=>setSettings(false)} onApply={apply}/>}
  {ftl&&<FtlDialog galaxy={galaxyPage} change={change} onClose={()=>setFtl(false)}/>}
 </div>;
}

function WorldCard({world:w,system,open,picked,holder,onPick,children}:{world:SystemBody;system:StarSystem;open:boolean;picked:string|null;holder?:string;onPick:(id:string)=>void;children:React.ReactNode}){
 const px=worldPx(w);
 return <div className={`system-world${open?' is-open':''}`}>
  <button type="button" className="system-world-row" aria-expanded={open} onClick={()=>onPick(w.id)}>
   <WorldDot world={w} size={px}/>
   <span className="system-world-name"><b>{w.name}{w.locked&&<Lock size={12} aria-label="Locked"/>}<span className="galaxy-chip">{w.type} {worldKindNames[w.kind].toLowerCase()}</span></b>
    <small>{worldLine(w,holder)}</small>
    <span className="system-stats"><span>{w.temp} °C</span><span>{w.gravity} g</span>{w.water!=='none'&&<span>{word(w.water)} water</span>}{w.rings&&<span>Rings</span>}{w.moons.length>0&&<span>{w.moons.length} {w.moons.length===1?'moon':'moons'}</span>}</span></span>
   <span className="system-au">{formatAU(w.au)} AU<br/>{yearLength(w.au,system.star)}</span>
  </button>
  {w.moons.length>0&&<div className="system-moons">{w.moons.map(m=><button key={m.id} type="button" className={picked===m.id?'is-picked':''} aria-pressed={picked===m.id} onClick={()=>onPick(m.id)}><WorldDot world={m} size={18}/><b>{m.name}</b><small>{m.type} {worldKindNames[m.kind].toLowerCase()} · {m.temp} °C</small></button>)}</div>}
  {children}
 </div>;
}

function WorldSheet({world:w,system,entry,orgs,holderNames,save,onOpen,onGone,page,onChart}:{world:World;system:StarSystem;entry:Entry;orgs:Entry[];holderNames:string[];save:(s:StarSystem)=>void;onOpen:(id:string)=>void;onGone:()=>void;page?:Entry;onChart:()=>void}){
 const giant=isGiant(w.kind);
 const set=(patch:Partial<Moon>)=>save(editWorld(system,w.id,patch));
 const k=starSizeFrom(w.au,system.star);
 return <div className="system-world-sheet">
  <div className="system-horizon"><Horizon className="system-horizon-canvas" system={system} world={w} label={`The sky from ${w.name}`}/>
   <div className="system-horizon-cap"><span>{giant?'No surface: the view from the cloud tops':`Standing on ${w.name}`}</span><span>The star looks {k<0.1?k.toFixed(2):k<10?k.toFixed(1):Math.round(k)}× the Sun from Earth</span></div></div>
  <div className="system-world-tools">
   <input key={`n${w.id}${w.name}`} className="system-world-title" aria-label="World name" defaultValue={w.name} maxLength={80} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==w.name)set({name:v});else e.target.value=w.name;}} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>
   <button type="button" className="icon-button" aria-pressed={!!w.locked} title={w.locked?'Kept when the survey runs again':'Keep this world when the survey runs again'} aria-label={w.locked?'Unlock this world':'Lock this world'} onClick={()=>set({locked:!w.locked})}>{w.locked?<Lock size={15}/>:<LockOpen size={15}/>}</button>
   <button type="button" className="icon-button" title="Roll only this world again" aria-label="Reroll this world" disabled={w.real} onClick={()=>save(rerollWorld(system,w.id))}><Dices size={15}/></button>
   <button type="button" className="icon-button" title="Remove" aria-label="Remove this world" onClick={async()=>{if(await confirmDialog({title:`Remove ${w.name}?`,message:`${'moons' in w&&w.moons.length?'Its moons go with it.':'It leaves the survey chart.'}${page?' Its page stays, with the survey as it was.':''}`,confirm:'Remove'})){save(removeWorld(system,w.id));onGone();}}}><Trash2 size={15}/></button>
  </div>
  <WorldFields world={w} system={system} orgs={orgs} set={set}/>
  <label className="world-field">Notes<textarea key={`j${w.id}${w.note}`} className="sector-note" defaultValue={w.note} maxLength={4000} rows={4} placeholder="What the party knows, what the GM knows, what is down there." onBlur={e=>{const v=e.target.value;if(v!==w.note)set({note:v});}}/></label>
  {!w.note&&<button type="button" className="button small" onClick={()=>set({note:worldSummary(system,w,entry.title)})}>Start from the survey</button>}
  {w.real&&<p className="aside-hint">Real data, rounded. Fields you change are marked as edited.</p>}
  <div className="button-row">{page?<button type="button" className="button primary" onClick={()=>onOpen(page.id)}><Flag size={15}/> Open its page</button>:<button type="button" className="button primary" onClick={onChart}><Flag size={15}/> Chart this world</button>}</div>
  <p className="aside-hint">{holderNames.length?`${holderNames.join(' and ')} ${holderNames.length===1?'has':'have'} a foothold in this system. `:''}{page?'This world has its own place page. Changes here show there too.':'Chart this world to give it its own place page, for its story, people and maps. Until then it lives on this chart.'}</p>
 </div>;
}
