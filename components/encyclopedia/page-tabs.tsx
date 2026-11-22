'use client';
/*
 * A page's tab row: the tabs that fit, the rest under More, and one Tabs menu for everything else (add a tab, show or
 * hide ready-made tabs, rename, move or delete the open tab). Under it, TabShare says in one line who sees the open tab.
 */
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import './page-tabs.css';
import {ArrowLeft,ArrowRight,Check,ChevronDown,EyeOff,Pencil,Plus,Settings2,Trash2,Users,Lock} from 'lucide-react';

export type PageTab={id:string;title:string;visibility:'gm'|'players'};
type Props={
 tabs:PageTab[];active:string;onPick:(id:string)=>void;
 /** Ready-made tabs this page can hide, shown or not. */
 hideable?:{id:string;title:string;hidden:boolean}[];onHide?:(id:string,hide:boolean)=>void;
 /** The open tab, when it is one of the page's own tabs. */
 own?:{title:string;first:boolean;last:boolean;onRename:()=>void;onMove:(dir:-1|1)=>void;onDelete:()=>void};
 onAdd:()=>void;canAdd:boolean;
};

/** Closes a popover on an outside click or Escape. */
function useOutside(open:boolean,close:()=>void){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;
  const down=(e:PointerEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))close();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
  document.addEventListener('pointerdown',down);document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('keydown',key);};
 },[open,close]);
 return ref;
}

// The crossed-out eye marks a tab players don't get; hovering the tab says so.
const HIDDEN='Hidden from players';
const tip=(t:PageTab)=>t.visibility==='gm'?HIDDEN:undefined;
const TabLabel=({t}:{t:PageTab})=><>{t.title}{t.visibility==='gm'&&<EyeOff size={12} className="tab-gm" aria-label={HIDDEN}/>}</>;

export function PageTabs({tabs,active,onPick,hideable=[],onHide,own,onAdd,canAdd}:Props){
 const row=useRef<HTMLDivElement>(null),measure=useRef<HTMLDivElement>(null);
 const [fit,setFit]=useState(tabs.length),[more,setMore]=useState(false),[menu,setMenu]=useState(false);
 const moreRef=useOutside(more,()=>setMore(false)),menuRef=useOutside(menu,()=>setMenu(false));
 const key=tabs.map(t=>t.id+t.title+t.visibility).join('|');
 // How many tabs fit beside the More and Tabs buttons. Measured from a hidden copy of the row, so it never flickers.
 useLayoutEffect(()=>{
  const el=row.current,m=measure.current;if(!el||!m)return;
  const count=()=>{
   const widths=[...m.querySelectorAll<HTMLElement>('[data-w]')].map(b=>b.getBoundingClientRect().width),tools=44,moreW=92,room=el.clientWidth-tools;
   const total=widths.reduce((a,b)=>a+b,0);if(total<=room){setFit(widths.length);return;}
   let used=moreW,n=0;for(const w of widths){if(used+w>room)break;used+=w;n++;}setFit(Math.max(1,n));
  };
  count();const ro=new ResizeObserver(count);ro.observe(el);return()=>ro.disconnect();
 },[key]);
 const at=tabs.findIndex(t=>t.id===active);
 // The open tab is always in the row: when it would be under More, it takes the last place that fits.
 const shown=fit>=tabs.length?tabs:at>=fit?[...tabs.slice(0,fit-1),tabs[at]]:tabs.slice(0,fit);
 const rest=tabs.filter(t=>!shown.includes(t));
 const hiddenCount=hideable.filter(h=>h.hidden).length;
 return <div className="page-tabs article-tabs" ref={row}>
  <div className="page-tabs-measure" ref={measure} aria-hidden="true">{tabs.map(t=><button key={t.id} type="button" tabIndex={-1} data-w className="page-tab"><TabLabel t={t}/></button>)}</div>
  <div className="page-tabs-list" role="tablist" aria-label="Article tabs">
   {shown.map(t=><button key={t.id} role="tab" className="page-tab" aria-selected={active===t.id} title={tip(t)} onClick={()=>onPick(t.id)}><TabLabel t={t}/></button>)}
   {rest.length>0&&<div className="page-tabs-pop" ref={moreRef}>
    <button type="button" className="page-tab page-tab-more" aria-haspopup="menu" aria-expanded={more} onClick={()=>setMore(!more)}>More <span className="page-tab-count">{rest.length}</span><ChevronDown size={13}/></button>
    {more&&<div className="page-tabs-menu" role="menu">{rest.map(t=><button key={t.id} role="menuitem" title={tip(t)} onClick={()=>{onPick(t.id);setMore(false);}}><span>{t.title}</span>{t.visibility==='gm'&&<EyeOff size={12} className="tab-gm" aria-label={HIDDEN}/>}</button>)}</div>}
   </div>}
  </div>
  <div className="page-tabs-pop page-tabs-tools" ref={menuRef}>
   <button type="button" className="icon-button page-tabs-gear" aria-label="Tabs: add, hide, rename or move" title="Tabs" aria-haspopup="menu" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Settings2 size={16}/>{hiddenCount>0&&<span className="page-tab-dot" aria-hidden="true"/>}</button>
   {menu&&<div className="page-tabs-menu page-tabs-settings" role="menu" aria-label="Tabs">
    <button role="menuitem" disabled={!canAdd} onClick={()=>{setMenu(false);onAdd();}}><Plus size={14}/> Add a tab</button>
    {own&&<><p className="page-tabs-menu-head">{own.title}</p>
     <button role="menuitem" onClick={()=>{setMenu(false);own.onRename();}}><Pencil size={14}/> Rename</button>
     <button role="menuitem" disabled={own.first} onClick={()=>own.onMove(-1)}><ArrowLeft size={14}/> Move left</button>
     <button role="menuitem" disabled={own.last} onClick={()=>own.onMove(1)}><ArrowRight size={14}/> Move right</button>
     <button role="menuitem" className="danger" onClick={()=>{setMenu(false);own.onDelete();}}><Trash2 size={14}/> Delete tab</button></>}
    {hideable.length>0&&onHide&&<><p className="page-tabs-menu-head">Show on this page</p>
     {hideable.map(h=><button key={h.id} role="menuitemcheckbox" aria-checked={!h.hidden} onClick={()=>onHide(h.id,!h.hidden)}><span className="page-tabs-check">{!h.hidden&&<Check size={13}/>}</span>{h.title}</button>)}
     <p className="page-tabs-menu-note">A hidden tab keeps what’s in it, and players don’t get it.</p></>}
   </div>}
  </div>
 </div>;
}

/** One line under the tabs: who sees this tab, as a two-way switch, and room for the tab's own buttons. */
export function TabShare({visibility,onChange,hint,children}:{visibility:'gm'|'players'|null;onChange?:(v:'gm'|'players')=>void;hint?:string;children?:ReactNode}){
 return <div className="tab-share">
  {visibility&&onChange?<div className="tab-share-switch" role="radiogroup" aria-label="Tab visibility">
   <button type="button" role="radio" aria-checked={visibility==='gm'} onClick={()=>onChange('gm')}><Lock size={12}/> GM only</button>
   <button type="button" role="radio" aria-checked={visibility==='players'} onClick={()=>onChange('players')}><Users size={12}/> Players</button>
  </div>:visibility==='gm'?<span className="tab-share-fixed"><Lock size={12}/> GM only</span>:null}
  {hint&&<span className="tab-share-hint">{hint}</span>}
  {children&&<span className="tab-share-actions">{children}</span>}
 </div>;
}
