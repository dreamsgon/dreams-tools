'use client';
/* Dragging a page from the sidebar onto a profile. The sidebar marks the row it drags (startPageDrag), and a profile's drop
   targets (PageDrop) read which page it is to light up only where it can land. The sidebar's own nesting keeps working: it
   still drags by its own state, and this only adds the page id to the drag. */
import {useState,useSyncExternalStore,type DragEvent,type ReactNode} from 'react';
import {PAGE_DRAG} from '@/lib/encyclopedia/profile-drop';

let current:string|null=null;
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(f=>f());
export const startPageDrag=(data:DataTransfer,id:string)=>{try{data.setData(PAGE_DRAG,id);}catch{}current=id;emit();};
export const endPageDrag=()=>{if(current===null)return;current=null;emit();};
/** The page being dragged from the sidebar, or null. */
export const useDraggedPage=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>{listeners.delete(f);};},()=>current,()=>null);

/**
 * A place on a profile that takes a dragged page. `check` says why a page can't land here (null when it can): only places
 * where it can are highlighted, and the one under the pointer is highlighted more. A drop it can't take is answered with
 * `onRefuse` and the reason, so nothing disappears silently.
 */
export function PageDrop({check,onPage,onRefuse,label,className='',children}:{check:(pageId:string)=>string|null;onPage:(pageId:string)=>void;onRefuse:(why:string)=>void;label:string;className?:string;children:ReactNode}){
 const page=useDraggedPage();
 const valid=!!page&&check(page)===null;
 const [over,setOver]=useState(false);
 const accepts=(e:DragEvent)=>!!page||e.dataTransfer.types.includes(PAGE_DRAG);
 return <div className={`${className} page-drop${valid?' can-drop':''}${valid&&over?' is-over':''}`} data-drop-label={label}
  onDragOver={e=>{if(!accepts(e))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';if(!over)setOver(true);}}
  onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOver(false);}}
  onDrop={e=>{if(!accepts(e))return;e.preventDefault();e.stopPropagation();setOver(false);const id=e.dataTransfer.getData(PAGE_DRAG)||page;endPageDrag();if(!id)return;const why=check(id);if(why)onRefuse(why);else onPage(id);}}>{children}</div>;
}
