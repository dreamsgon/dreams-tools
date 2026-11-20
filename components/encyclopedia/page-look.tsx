'use client';
/*
 * Text settings for a page (size, font, line spacing, paragraphs, headings, drop cap), for this page, this page
 * and every page inside it, or every page in the Wiki (the world's default). lib/encyclopedia/page-text.ts
 * works out which settings a page is read with; encyclopedia.css draws them on `.prose.t-…`.
 */
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {CaseSensitive,ChevronDown} from 'lucide-react';
import {TEXT_KEYS,TEXT_OPTIONS,proseLook,resolveText,type PageText,type TextKey,type TextSettings} from '@/lib/encyclopedia/page-text';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {memberRef} from './member-view';

const worldText=(data:Workspace,entry:Entry)=>data.worlds.find(w=>w.id===entry.worldId)?.text;
/** The class and style for a page's `.prose`, from its own settings, a branch above it, or the Wiki's default. */
export function pageProseLook(entry:Entry,data:Workspace):{className:string;style:CSSProperties}{
 const byId=new Map(data.entries.map(e=>[e.id,e]));
 const {text}=resolveText(entry,id=>byId.get(id),worldText(data,entry));
 const look=proseLook(text);
 return {className:look.className,style:look.style as CSSProperties};
}

const FONT_PREVIEW:Record<string,string>={serif:'var(--font-reading)',sans:'var(--font-sans)',hand:'var(--wiki-font-hand)',mono:'var(--wiki-font-mono)',display:'var(--font-display)'};
type Scope='page'|'branch'|'wiki';

export function PageLook({entry,data,update,change}:{entry:Entry;data:Workspace;update:(p:Partial<Entry>)=>void;change:(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void}){
 const [open,setOpen]=useState(false),[wikiMode,setWikiMode]=useState(false);
 const box=useRef<HTMLDivElement>(null),co=!!memberRef();
 useEffect(()=>{if(!open)return;const out=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);(box.current?.querySelector('button') as HTMLButtonElement|null)?.focus();}};document.addEventListener('mousedown',out);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',out);document.removeEventListener('keydown',key);};},[open]);
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
