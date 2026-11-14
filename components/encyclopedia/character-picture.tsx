'use client';
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {ImagePlus,Crop,Trash2,ArrowUpRight,Check} from 'lucide-react';
import type {Entry,Picture} from '@/lib/encyclopedia/world-model';
import {newPicture,fitCircle,circleStyle,ringColors,tokenSizes} from '@/lib/encyclopedia/picture';
import {uploadMapImage} from './map-transfer';
import {ToolDialog} from './tool-dialog';
import {confirmDialog} from '../confirm-dialog';
import {imageSrc} from './member-view';
import {CustomColourSwatch} from '../custom-colour-swatch';

/** Loads a picture from the Encyclopedia's image store (or a player link) as an object URL. */
export function usePictureSrc(imageId:string|undefined,playerToken?:string){
 const [src,setSrc]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{if(!imageId)return;const controller=new AbortController();let url='';
  const request=playerToken?fetch('/api/encyclopedia/player-map-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:playerToken,imageId}),signal:controller.signal}):fetch(imageSrc(imageId),{signal:controller.signal});
  request.then(async r=>{if(!r.ok)throw new Error();const blob=await r.blob();if(controller.signal.aborted)return;url=URL.createObjectURL(blob);setSrc(url);setFailed(false);}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
  return()=>{controller.abort();if(url)URL.revokeObjectURL(url);setSrc('');};
 },[imageId,playerToken]);
 return {src,failed};
}

/** The token the picture makes: its circle, inside the ring. */
export function PictureToken({picture,src,size,ring}:{picture:Picture;src:string;size:number;ring?:string}){
 return <span className="picture-token" aria-hidden="true" style={{width:size,height:size,boxShadow:`0 0 0 3px ${picture.ring??ring??'var(--accent)'}`,backgroundImage:src?`url("${src}")`:undefined,...circleStyle(picture,size)}}/>;
}

const squaresLabel=(n:number)=>tokenSizes.find(s=>s.squares===n)?.label??`${n}×${n}`;

/** A character's picture on its page: the whole picture, its token, and the controls to change either. */
export function PicturePanel({entry,update,maptableHref}:{entry:Entry;update:(p:Partial<Entry>)=>void;maptableHref:string|null}){
 const picture=entry.picture,{src,failed}=usePictureSrc(picture?.imageId);
 const [framing,setFraming]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const file=useRef<HTMLInputElement>(null);
 async function upload(f:File){setBusy(true);setError('');try{const image=await uploadMapImage(f);update({picture:{...newPicture(image.imageId,image.imageWidth,image.imageHeight),ring:picture?.ring,squares:picture?.squares}});setFraming(true);}catch(e){setError(e instanceof Error?e.message:'Upload failed');}finally{setBusy(false);}}
 const input=<input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(f);}}/>;
 if(!picture)return <div className="picture-panel picture-empty">{input}<button className="picture-add" disabled={busy} onClick={()=>file.current?.click()}><ImagePlus size={20}/><span><strong>{busy?'Uploading…':'Add a picture'}</strong><small>PNG, JPEG or WebP up to 8 MB. It becomes this character’s token in Maptable.</small></span></button>{error&&<p role="alert" className="form-error">{error}</p>}</div>;
 return <div className="picture-panel">{input}
  <button className="picture-full" onClick={()=>setFraming(true)} aria-label="Frame the token on this picture">{/* eslint-disable-next-line @next/next/no-img-element -- a private object URL; next/image cannot optimise it */}
  {src?<img src={src} alt=""/>:<span>{failed?'Picture unavailable':'Loading…'}</span>}</button>
  <div className="picture-side">
   <div className="picture-token-row"><PictureToken picture={picture} src={src} size={64}/><span><strong>Token</strong><small>{squaresLabel(picture.squares??1)}</small></span></div>
   <div className="picture-actions">
    <button className="button small" onClick={()=>setFraming(true)}><Crop size={14}/> Frame token</button>
    <button className="button small" disabled={busy} onClick={()=>file.current?.click()}><ImagePlus size={14}/> {busy?'Uploading…':'Replace'}</button>
    <button className="icon-button" aria-label="Remove picture" onClick={async()=>{if(await confirmDialog({title:'Remove this picture?',message:'Tokens already in Maptable keep theirs.',confirm:'Remove picture',danger:true}))update({picture:undefined});}}><Trash2 size={14}/></button>
   </div>
   {maptableHref?<a className="button small primary" href={maptableHref} target="_blank" rel="noopener">Add to Maptable <ArrowUpRight size={14}/></a>:<p className="aside-hint">Link this campaign to a Maptable campaign to add it as a token from here, or use Maptable’s token gallery.</p>}
   <p className="aside-hint">Players see the picture when they can see the Overview.</p>
   {error&&<p role="alert" className="form-error">{error}</p>}
  </div>
  {framing&&<FrameDialog picture={picture} src={src} onClose={()=>setFraming(false)} onSave={p=>{update({picture:p});setFraming(false);}}/>}
 </div>;
}

/** Drag the circle to choose what the token shows; pick its size in squares and its ring. */
function FrameDialog({picture,src,onSave,onClose}:{picture:Picture;src:string;onSave:(p:Picture)=>void;onClose:()=>void}){
 const [p,setP]=useState(picture),drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
 const scale=Math.min(440/p.width,340/p.height),w=p.width*scale,h=p.height*scale,d=p.size*Math.min(p.width,p.height)*scale;
 const down=(e:ReactPointerEvent)=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,px:p.x,py:p.y};};
 const move=(e:ReactPointerEvent)=>{const s=drag.current;if(!s)return;setP(old=>fitCircle(old,s.px+(e.clientX-s.x)/w,s.py+(e.clientY-s.y)/h,old.size));};
 const nudge=(dx:number,dy:number)=>setP(old=>fitCircle(old,old.x+dx,old.y+dy,old.size));
 return <ToolDialog title="Frame the token" wide onClose={onClose}>
  <p className="modal-intro">Drag the circle over the part of the picture the token should show. The whole picture stays on the page.</p>
  <div className="frame-layout">
   <div className="frame-stage" style={{width:w,height:h,backgroundImage:src?`url("${src}")`:undefined}}>
    <span role="slider" tabIndex={0} aria-label="Token circle" aria-valuenow={Math.round(p.x*100)} aria-valuetext={`${Math.round(p.x*100)}% across, ${Math.round(p.y*100)}% down`} className="frame-circle" style={{left:p.x*w-d/2,top:p.y*h-d/2,width:d,height:d}}
     onPointerDown={down} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
     onKeyDown={e=>{const step=e.shiftKey?.05:.01;if(e.key==='ArrowLeft')nudge(-step,0);else if(e.key==='ArrowRight')nudge(step,0);else if(e.key==='ArrowUp')nudge(0,-step);else if(e.key==='ArrowDown')nudge(0,step);else return;e.preventDefault();}}/>
   </div>
   <div className="frame-options">
    <PictureToken picture={p} src={src} size={112}/>
    <label className="field-label">Circle size<input type="range" min={20} max={100} value={Math.round(p.size*100)} onChange={e=>setP(old=>fitCircle(old,old.x,old.y,Number(e.target.value)/100))}/></label>
    <label className="field-label">Size on the map<select value={p.squares??1} onChange={e=>setP({...p,squares:Number(e.target.value)})}>{tokenSizes.map(s=><option key={s.squares} value={s.squares}>{s.label}</option>)}</select></label>
    <fieldset className="ring-choice"><legend>Ring</legend>
     <button type="button" aria-pressed={!p.ring} className="ring-auto" onClick={()=>setP({...p,ring:undefined})}>Role colour</button>
     {ringColors.map(c=><button type="button" key={c} aria-label={`Ring ${c}`} aria-pressed={p.ring===c} style={{background:c}} onClick={()=>setP({...p,ring:c})}/>)}
     <CustomColourSwatch value={p.ring} presets={ringColors} label="Pick any ring colour" onChange={ring=>setP({...p,ring})}/>
    </fieldset>
   </div>
  </div>
  <div className="button-row frame-buttons"><button className="button" onClick={onClose}>Cancel</button><button className="button primary" onClick={()=>onSave(p)}><Check size={15}/> Save token</button></div>
 </ToolDialog>;
}
