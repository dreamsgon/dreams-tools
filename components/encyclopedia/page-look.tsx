'use client';
/*
 * Text settings for a page (size, font, line spacing, paragraphs, headings, drop cap), for this page, this page
 * and every page inside it, or every page in the Wiki (the world's default). lib/encyclopedia/page-text.ts
 * works out which settings a page is read with; encyclopedia.css draws them on `.prose.t-…`.
 */
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {CaseSensitive,ChevronDown,ImagePlus,LayoutPanelTop,Trash2} from 'lucide-react';
import {PAGE_ICONS,TEXT_KEYS,TEXT_OPTIONS,cleanPageLook,proseLook,resolveText,type PageLook as Look,type PageText,type TextKey,type TextSettings} from '@/lib/encyclopedia/page-text';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {memberRef} from './member-view';
import {uploadMapImage} from './map-transfer';
import {LookBanner} from './look-section';
import {PAGE_ICON_GLYPHS} from './page-icons';

const worldText=(data:Workspace,entry:Entry)=>data.worlds.find(w=>w.id===entry.worldId)?.text;
/** The class and style for a page's `.prose`, from its own settings, a branch above it, or the Wiki's default. */
export function pageProseLook(entry:Entry,data:Workspace):{className:string;style:CSSProperties}{
 const byId=new Map(data.entries.map(e=>[e.id,e]));
 const {text}=resolveText(entry,id=>byId.get(id),worldText(data,entry));
 const look=proseLook(text);
 return {className:[look.className,entry.pageLook?.box==='left'&&'box-left'].filter(Boolean).join(' '),style:look.style as CSSProperties};
}

/** Closes a toolbar popover on a click outside it or Escape. */
function usePopover(open:boolean,setOpen:(v:boolean)=>void){
 const box=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const out=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);(box.current?.querySelector('button') as HTMLButtonElement|null)?.focus();}};document.addEventListener('mousedown',out);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',out);document.removeEventListener('keydown',key);};},[open,setOpen]);
 return box;
}

const FONT_PREVIEW:Record<string,string>={serif:'var(--font-reading)',sans:'var(--font-sans)',hand:'var(--wiki-font-hand)',mono:'var(--wiki-font-mono)',display:'var(--font-display)'};
type Scope='page'|'branch'|'wiki';

export function PageLook({entry,data,update,change}:{entry:Entry;data:Workspace;update:(p:Partial<Entry>)=>void;change:(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void}){
 const [open,setOpen]=useState(false),[wikiMode,setWikiMode]=useState(false);
 const box=usePopover(open,setOpen),co=!!memberRef();
 useEffect(()=>{setWikiMode(false);},[entry.id]);
 const byId=new Map(data.entries.map(e=>[e.id,e])),wiki=worldText(data,entry)??{};
 const {text,from,fromId}=resolveText(entry,id=>byId.get(id),wiki);
 const own=entry.text,hasOwn=!!own&&TEXT_KEYS.some(k=>own[k]!==undefined);
 const scope:Scope=wikiMode?'wiki':own?.branch?'branch':'page';
 const shown=wikiMode?{...resolveText({id:'',parentId:null},()=>undefined,wiki).text}:text;
 const setWiki=(next:TextSettings)=>change(s=>({...s,worlds:s.worlds.map(w=>w.id===entry.worldId?{...w,text:next}:w)}));
 function pick(k:TextKey,v:string){
  if(wikiMode){setWiki({...wiki,[k]:v});return;}
  update({text:{...own,[k]:v} as PageText});
 }
 function setScope(next:Scope){
  if(next==='wiki'){
   // These settings become the Wiki's default; the page goes back to following it.
   const moved=Object.fromEntries(TEXT_KEYS.filter(k=>own?.[k]!==undefined).map(k=>[k,own![k]]));
   if(Object.keys(moved).length){setWiki({...wiki,...moved});update({text:undefined});}
   setWikiMode(true);return;
  }
  setWikiMode(false);
  update({text:{...own,branch:next==='branch'||undefined} as PageText});
 }
 const source=wikiMode?'the Wiki’s default':from==='page'?(own?.branch?'this page, and the pages inside it':'this page'):from==='branch'?`${byId.get(fromId??'')?.title??'a page above'}, for the pages inside it`:'the Wiki’s default';
 return <div className="write-menu page-look" ref={box}>
  <button type="button" className="button small" aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(!open)}><CaseSensitive size={15} aria-hidden="true"/>Text<ChevronDown size={12} aria-hidden="true"/></button>
  {open&&<div className="write-pop wide look-pop" role="dialog" aria-label="Text on this page">
   <p className="write-pop-hint">How the text on {wikiMode?'every page in the Wiki':'this page'} is set. Each reader’s text size in Appearance still scales it.</p>
   {TEXT_KEYS.map(k=><div key={k}><span className="write-pop-label">{TEXT_OPTIONS[k].name}</span><div className="write-pop-row look-row" role="group" aria-label={TEXT_OPTIONS[k].name}>{TEXT_OPTIONS[k].values.map(([v,label])=><button key={v} type="button" aria-pressed={shown[k]===v} className={shown[k]===v?'on':''} style={k==='font'?{fontFamily:FONT_PREVIEW[v]}:undefined} onClick={()=>pick(k,v)}>{label}</button>)}</div></div>)}
   <label className="write-pop-label look-scope">Use these settings for<select value={scope} onChange={e=>setScope(e.target.value as Scope)}><option value="page">This page only</option><option value="branch">This page and every page inside it</option>{!co&&<option value="wiki">Every page in the Wiki</option>}</select></label>
   <p className="write-pop-hint look-from">Now from {source}.{hasOwn&&!wikiMode&&<> <button type="button" className="text-button" onClick={()=>update({text:undefined})}>Go back to the default</button></>}</p>
  </div>}
 </div>;
}

/** The page's own look: a banner across the top, its icon, which side info boxes sit on, the contents list and width. */
export function PageStyle({entry,update}:{entry:Entry;update:(p:Partial<Entry>)=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const box=usePopover(open,setOpen),file=useRef<HTMLInputElement>(null);
 const look=entry.pageLook??{};
 const set=(p:Partial<Look>)=>update({pageLook:cleanPageLook({...look,...p})});
 async function upload(f:File){setBusy(true);setError('');try{const image=await uploadMapImage(f);set({banner:{imageId:image.imageId,width:image.imageWidth,height:image.imageHeight,y:.5}});}catch(e){setError(e instanceof Error?e.message:'Could not upload the picture.');}finally{setBusy(false);}}
 const choice=<K extends 'box'|'toc'|'wide'>(label:string,key:K,options:[Look[K],string][])=><div><span className="write-pop-label">{label}</span><div className="write-pop-row look-row" role="group" aria-label={label}>{options.map(([v,name])=>{const on=(look[key]??options[0]![0])===v;return <button key={name} type="button" aria-pressed={on} className={on?'on':''} onClick={()=>set({[key]:v} as Partial<Look>)}>{name}</button>;})}</div></div>;
 return <div className="write-menu page-look" ref={box}>
  <button type="button" className="button small" aria-expanded={open} aria-haspopup="dialog" onClick={()=>setOpen(!open)}><LayoutPanelTop size={15} aria-hidden="true"/>Page<ChevronDown size={12} aria-hidden="true"/></button>
  {open&&<div className="write-pop wide look-pop page-style-pop" role="dialog" aria-label="How this page looks">
   <span className="write-pop-label">Banner</span>
   {look.banner?<><div className="look-banner-edit page-banner-edit" title="Click to choose what stays in view" onClick={e=>{const r=e.currentTarget.getBoundingClientRect();set({banner:{...look.banner!,y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))}});}}><LookBanner look={{banner:look.banner}}/><span className="look-banner-dot" style={{top:`${look.banner.y*100}%`}}/></div>
    <p className="write-pop-hint">Click the picture to choose what stays in view.</p>
    <div className="button-row"><button type="button" className="button small" disabled={busy} onClick={()=>file.current?.click()}><ImagePlus size={14} aria-hidden="true"/> {busy?'Uploading…':'Replace'}</button><button type="button" className="button small" onClick={()=>set({banner:undefined})}><Trash2 size={14} aria-hidden="true"/> Remove</button></div></>
   :<button type="button" className="look-banner-empty" disabled={busy} onClick={()=>file.current?.click()}><ImagePlus size={18} aria-hidden="true"/><span><strong>{busy?'Uploading…':'Add a banner'}</strong><small>A wide picture across the top of the page. PNG, JPEG or WebP up to 8 MB.</small></span></button>}
   <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(f);}}/>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <span className="write-pop-label">Icon</span>
   <div className="page-icon-grid" role="group" aria-label="Icon"><button type="button" aria-pressed={!look.icon} className={!look.icon?'on':''} onClick={()=>set({icon:undefined})} title="The usual icon for its kind">Usual</button>{PAGE_ICONS.map(id=>{const G=PAGE_ICON_GLYPHS[id];return <button key={id} type="button" aria-pressed={look.icon===id} aria-label={id} title={id} className={look.icon===id?'on':''} onClick={()=>set({icon:id})}><G size={15} aria-hidden="true"/></button>;})}</div>
   {choice('Info boxes sit on the',"box",[['right','Right'],['left','Left']])}
   {choice('On this page (its headings)',"toc",[[true,'Show'],[false,'Hide']])}
   {choice('Width','wide',[[false,'Book column'],[true,'Wide']])}
   <p className="write-pop-hint">Only this page, not the pages inside it. Players see its banner, icon and info box side too.</p>
  </div>}
 </div>;
}
