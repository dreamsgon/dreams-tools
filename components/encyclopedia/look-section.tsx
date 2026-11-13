"use client";
import {useRef,useState,type CSSProperties} from 'react';
import {ImagePlus,Trash2,Goal,Library,Users,Map as MapIcon,House,Plus} from 'lucide-react';
import {ACCENTS} from '@/lib/appearance';
import {lookAttributes,lookFontUrl,lookFontLabel,lookFonts,surfaces,surfaceNames,type Look} from '@/lib/encyclopedia/look';
import {fontOption,fontStylesheetUrl} from '@/lib/appearance';
import type {Campaign} from '@/lib/encyclopedia/world-model';
import {uploadMapImage} from './map-transfer';
import {usePictureSrc} from './character-picture';
import './look.css';

/** The campaign banner: the whole width, cropped to a strip, keeping the chosen height in view. */
export function LookBanner({look,playerToken,className='',children}:{look?:Look;playerToken?:string;className?:string;children?:React.ReactNode}){
 const {src}=usePictureSrc(look?.banner?.imageId,playerToken);
 if(!look?.banner)return null;
 return <div className={`look-banner ${className}`} style={{backgroundImage:src?`url("${src}")`:undefined,backgroundPosition:`center ${Math.round(look.banner.y*100)}%`}}>{children}</div>;
}

/** Loads the campaign's heading font, when it has one. */
export function LookFont({look}:{look?:Look}){const url=lookFontUrl(look);return url?<link rel="stylesheet" href={url}/>:null;}

const swatch:Record<string,string>=Object.fromEntries(ACCENTS.map(a=>[a.id,a.dark]));

/** Campaign settings › Look: accent, heading font, page surface, banner and whether players get it. */
export function LookSection({campaign,setLook}:{campaign:Campaign;setLook:(look:Look|undefined)=>void}){
 const look=campaign.look??{},file=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(patch:Partial<Look>)=>{const next={...look,...patch};for(const k of Object.keys(next) as (keyof Look)[])if(next[k]===undefined)delete next[k];setLook(Object.keys(next).length?next:undefined);};
 async function upload(f:File){setBusy(true);setError('');try{const image=await uploadMapImage(f);set({banner:{imageId:image.imageId,width:image.imageWidth,height:image.imageHeight,y:.5}});}catch(e){setError(e instanceof Error?e.message:'Could not upload the picture.');}finally{setBusy(false);}}
 const attrs=lookAttributes(look);
 return <section className="page-content look-page">
  {lookFonts.map(id=>{const url=fontStylesheetUrl(fontOption('title',id));return url?<link key={id} rel="stylesheet" href={url}/>:null;})}
  <div className="look-controls">
   <span className="eyebrow">Campaign settings</span>
   <h1>Look</h1>
   <p className="muted">How {campaign.name} looks for you and your players. Light or dark still follows each person’s own setting.</p>
   <div className="look-group"><h2>Banner</h2>
    {look.banner?<><div className="look-banner-edit" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();set({banner:{...look.banner!,y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))}});}}><LookBanner look={look}/><span className="look-banner-dot" style={{top:`${look.banner.y*100}%`}}/></div>
     <p className="muted small">Click the picture to choose what stays in view when it is cropped.</p>
     <div className="button-row"><button className="button small" disabled={busy} onClick={()=>file.current?.click()}><ImagePlus size={14}/> Replace</button><button className="button small" onClick={()=>set({banner:undefined})}><Trash2 size={14}/> Remove</button></div></>
    :<button className="look-banner-empty" disabled={busy} onClick={()=>file.current?.click()}><ImagePlus size={20}/><span><strong>{busy?'Uploading…':'Add a banner'}</strong><small>A wide picture works best. PNG, JPEG or WebP up to 8 MB.</small></span></button>}
    <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(f);}}/>
    {error&&<p className="form-error" role="alert">{error}</p>}
   </div>
   <div className="look-group"><h2>Accent</h2>
    <div className="look-swatches" role="radiogroup" aria-label="Accent">
     <button role="radio" aria-checked={!look.accent} className={!look.accent?'on':''} onClick={()=>set({accent:undefined})}><span className="look-swatch own" aria-hidden="true"/><small>Yours</small></button>
     {ACCENTS.map(a=><button key={a.id} role="radio" aria-checked={look.accent===a.id} className={look.accent===a.id?'on':''} onClick={()=>set({accent:a.id})}><span className="look-swatch" style={{background:swatch[a.id]}} aria-hidden="true"/><small>{a.label}</small></button>)}
    </div>
    <p className="muted small">Used for links, buttons and highlights. “Yours” keeps each person’s own accent.</p>
   </div>
   <div className="look-group"><h2>Heading font</h2>
    <div className="look-fonts" role="radiogroup" aria-label="Heading font">
     <button role="radio" aria-checked={!look.headingFont} className={!look.headingFont?'on':''} onClick={()=>set({headingFont:undefined})}>Yours</button>
     {lookFonts.map(id=><button key={id} role="radio" aria-checked={look.headingFont===id} className={look.headingFont===id?'on':''} style={{fontFamily:fontOption('title',id).stack}} onClick={()=>set({headingFont:id})}>{lookFontLabel(id)}</button>)}
    </div>
   </div>
   <div className="look-group"><h2>Page surface</h2>
    <div className="look-surfaces" role="radiogroup" aria-label="Page surface">{surfaces.map(s=><button key={s} role="radio" aria-checked={(look.surface??'plain')===s} className={(look.surface??'plain')===s?'on':''} onClick={()=>set({surface:s==='plain'?undefined:s})}><span className={`look-surface-chip ${s}`} data-look-surface={s==='plain'?undefined:s} aria-hidden="true"/><small>{surfaceNames[s]}</small></button>)}</div>
   </div>
   <div className="look-group"><h2>Use this look on</h2>
    <label className="look-toggle"><input type="checkbox" checked disabled/> Encyclopedia pages in this campaign</label>
    <label className="look-toggle"><input type="checkbox" checked={look.players!==false} onChange={e=>set({players:e.target.checked?undefined:false})}/> Player site and shared links</label>
   </div>
  </div>
  <div className="look-preview-wrap">
   <span className="eyebrow">Preview</span>
   <div className="look-preview" {...attrs} style={attrs.style as CSSProperties}>
    <LookBanner look={look} className="look-preview-banner"><span>{campaign.name}</span></LookBanner>
    {!look.banner&&<div className="look-preview-plain"><span>{campaign.name}</span></div>}
    <div className="look-preview-body">
     <nav>{[[House,'Campaign home'],[Goal,'Quests'],[Library,'Codex'],[Users,'Characters'],[MapIcon,'Maps']].map(([Icon,label],i)=>{const I=Icon as typeof House;return <span key={label as string} className={i===1?'on':''}><I size={14}/> {label as string}</span>;})}</nav>
     <div><h3>The Ashen Vow</h3><div className="look-preview-chips"><span className="quest-type main">Main quest</span><span className="quest-type">Active</span></div>
      <p>The party owes <a>the Order of the Lamp</a> a favour, and the order has come to collect. A letter sealed in black wax waits at <a>Millhaven</a>.</p>
      <div className="button-row"><span className="button primary small"><Plus size={13}/> Add to the log</span><span className="button small">Show on map</span></div></div>
    </div>
   </div>
   <p className="muted small">Your pages in this campaign and the player site pick up the same banner, accent and fonts. Your own accent comes back when you leave the campaign.</p>
  </div>
 </section>;
}
