'use client';
import {useEffect,useRef,useState} from 'react';
import {ImagePlus,Trash2,X} from 'lucide-react';
import type {World} from '@/lib/encyclopedia/world-model';
import {emblemShapes,emblemSymbols,mapSwatches,orgTypeGroups,orgTypeList,shapeNames,symbolSwatches,defaultMapColour,type Org,type OrgEmblem} from '@/lib/encyclopedia/org-profile';
import {CustomColourSwatch} from '../custom-colour-swatch';
import {uploadMapImage} from './map-transfer';
import {Emblem,symbolIcons,symbolNames} from './org-parts';
import {usePictureSrc} from './character-picture';

const OTHER='__other';
function Swatches({label,value,presets,onChange}:{label:string;value?:string;presets:readonly string[];onChange:(c:string)=>void}){
 return <div className="org-swatches" role="group" aria-label={label}>{presets.map(c=><button type="button" key={c} className="org-swatch" aria-label={`${label} ${c}`} aria-pressed={value?.toLowerCase()===c} style={{background:c}} onClick={()=>onChange(c)}/>)}<CustomColourSwatch value={value} presets={presets} label="Pick any colour" onChange={onChange}/></div>;
}

/** The Edit profile side panel: type, motto, emblem, shape, colours and banner. Every change is saved as you go. */
export function OrgPanel({org,title,world,canEditWorld,update,addType,onClose}:{org:Org;title:string;world?:World;canEditWorld:boolean;update:(f:(o:Org)=>Org)=>void;addType:(type:string)=>void;onClose:()=>void}){
 const mine=world?.orgTypes??[],known=[...orgTypeList,...mine],custom=!!org.type&&!known.includes(org.type);
 const [other,setOther]=useState(false),[busy,setBusy]=useState<''|'emblem'|'banner'>(''),[error,setError]=useState('');
 const root=useRef<HTMLElement>(null);
 useEffect(()=>{root.current?.focus();},[]);
 const emblemFile=useRef<HTMLInputElement>(null),bannerFile=useRef<HTMLInputElement>(null);
 const setEmblem=(patch:Partial<OrgEmblem>)=>update(o=>({...o,emblem:{...o.emblem,...patch}}));
 const bannerPicture=usePictureSrc(org.banner?.imageId);
 async function upload(file:File,what:'emblem'|'banner'){
  setBusy(what);setError('');
  try{const image=await uploadMapImage(file);if(what==='emblem')update(o=>({...o,emblem:{...o.emblem,imageId:image.imageId,symbol:undefined}}));else update(o=>({...o,banner:{imageId:image.imageId}}));}
  catch(e){setError(e instanceof Error?e.message:'Upload failed');}finally{setBusy('');}
 }
 const pick=(what:'emblem'|'banner')=><input ref={what==='emblem'?emblemFile:bannerFile} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(f,what);}}/>;
 const typeValue=other||custom?OTHER:org.type??'';
 return <aside className="org-panel" role="dialog" aria-label="Edit profile" ref={root} tabIndex={-1} onKeyDown={e=>{if(e.key==='Escape')onClose();}}>
  <header className="org-panel-head"><div><span className="org-eyebrow">EDIT PROFILE</span><h2>{title}</h2></div><button type="button" className="icon-button" aria-label="Close the panel" onClick={onClose}><X size={16}/></button></header>
  <p className="org-panel-saved">Saved as you go.</p>
  <div className="org-panel-body">
   <label className="org-field">Type
    <select aria-label="Type" value={typeValue} onChange={e=>{const v=e.target.value;if(v===OTHER){setOther(true);return;}setOther(false);update(o=>({...o,type:v||undefined}));}}>
     <option value="">No type</option>
     {orgTypeGroups.map(g=><optgroup key={g.group} label={g.group}>{g.types.map(t=><option key={t} value={t}>{t}</option>)}</optgroup>)}
     {mine.length>0&&<optgroup label="Your types">{mine.map(t=><option key={t} value={t}>{t}</option>)}</optgroup>}
     <option value={OTHER}>Type your own…</option>
    </select>
   </label>
   {(other||custom)&&<label className="org-field">Your own type<input aria-label="Your own type" maxLength={60} autoFocus={other&&!custom} value={org.type??''} placeholder="For example Ferry cooperative" onChange={e=>update(o=>({...o,type:e.target.value||undefined}))} onBlur={e=>{if(canEditWorld)addType(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'&&canEditWorld)addType(e.currentTarget.value);}}/><small>{canEditWorld?'Kept for this world’s other organizations.':'Only the GM can keep a type for the world’s other organizations.'}</small></label>}
   <label className="org-field">Motto<input aria-label="Motto" maxLength={200} value={org.motto??''} placeholder="A line they live by" onChange={e=>update(o=>({...o,motto:e.target.value||undefined}))}/></label>

   <fieldset className="org-field org-fieldset"><legend>Emblem</legend>
    <div className="org-gallery" role="group" aria-label="Emblem symbol">{emblemSymbols.map(s=>{const Icon=symbolIcons[s];return <button type="button" key={s} className="org-gallery-item" aria-label={symbolNames[s]} title={symbolNames[s]} aria-pressed={org.emblem.symbol===s&&!org.emblem.imageId} onClick={()=>setEmblem({symbol:s,imageId:undefined})}><Icon size={18}/></button>;})}</div>
    <div className="org-upload-row">{pick('emblem')}<button type="button" className="button small" disabled={busy==='emblem'} onClick={()=>emblemFile.current?.click()}><ImagePlus size={14}/> {busy==='emblem'?'Uploading…':org.emblem.imageId?'Replace picture':'Upload'}</button>
     {org.emblem.imageId&&<button type="button" className="button small" onClick={()=>setEmblem({imageId:undefined})}><Trash2 size={14}/> Remove picture</button>}</div>
   </fieldset>
   <fieldset className="org-field org-fieldset"><legend>Shape</legend>
    <div className="org-shapes" role="group" aria-label="Emblem shape">{emblemShapes.map(s=><button type="button" key={s} className="org-shape" aria-pressed={org.emblem.shape===s} onClick={()=>setEmblem({shape:s})}><Emblem emblem={{...org.emblem,shape:s,symbol:org.emblem.symbol??(org.emblem.imageId?undefined:'anchor'),imageId:undefined}} size={30}/><span>{shapeNames[s]}</span></button>)}</div>
   </fieldset>
   <fieldset className="org-field org-fieldset"><legend>Symbol colour</legend><Swatches label="Symbol colour" value={org.emblem.colour} presets={symbolSwatches} onChange={c=>setEmblem({colour:c as `#${string}`})}/></fieldset>
   <fieldset className="org-field org-fieldset"><legend>Map colour</legend><Swatches label="Map colour" value={org.emblem.mapColour??defaultMapColour} presets={mapSwatches} onChange={c=>setEmblem({mapColour:c as `#${string}`})}/><small>Tints the banner when there is no picture.</small></fieldset>
   <fieldset className="org-field org-fieldset"><legend>Banner</legend>
    {org.banner&&bannerPicture.src&&<span className="org-banner-thumb" aria-hidden="true" style={{backgroundImage:`url("${bannerPicture.src}")`}}/>}
    <div className="org-upload-row">{pick('banner')}<button type="button" className="button small" disabled={busy==='banner'} onClick={()=>bannerFile.current?.click()}><ImagePlus size={14}/> {busy==='banner'?'Uploading…':org.banner?'Replace banner':'Upload'}</button>
     <button type="button" className="button small" aria-pressed={!org.banner} disabled={!org.banner} onClick={()=>update(o=>({...o,banner:undefined}))}>Use the map colour</button></div>
   </fieldset>
   {error&&<p role="alert" className="form-error">{error}</p>}
  </div>
 </aside>;
}
