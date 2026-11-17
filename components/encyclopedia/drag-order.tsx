'use client';
/*
 * Drag to reorder, for the facts and Quick find cards while arranging. The item under the pointer shows a line on the side
 * the dragged one will land (left or right half; top or bottom half when `vertical`). Arrows stay for the keyboard.
 */
import {useState,type DragEvent} from 'react';

export type DropSide={id:string;after:boolean};

/** `onMove(id, target, after)` is called on drop. `handle` items only start dragging from their grip (see armed). */
export function useDragOrder(onMove:(id:string,target:string,after:boolean)=>void,{vertical=false}:{vertical?:boolean}={}){
 const [drag,setDrag]=useState<string|null>(null),[over,setOver]=useState<DropSide|null>(null),[armed,setArmed]=useState<string|null>(null);
 const side=(e:DragEvent<HTMLElement>)=>{const r=e.currentTarget.getBoundingClientRect();return vertical?e.clientY>r.top+r.height/2:e.clientX>r.left+r.width/2;};
 const end=()=>{setDrag(null);setOver(null);setArmed(null);};
 /** Props for one item. With `handle`, it is draggable only after a pointer down on its grip. */
 const item=(id:string,{on=true,handle=false}:{on?:boolean;handle?:boolean}={})=>!on?{}:{
  draggable:handle?armed===id:true,
  onDragStart:(e:DragEvent<HTMLElement>)=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',id);setDrag(id);},
  onDragOver:(e:DragEvent<HTMLElement>)=>{if(!drag)return;e.preventDefault();e.dataTransfer.dropEffect='move';const after=side(e);if(over?.id!==id||over.after!==after)setOver({id,after});},
  onDrop:(e:DragEvent<HTMLElement>)=>{e.preventDefault();if(drag&&drag!==id)onMove(drag,id,side(e));end();},
  onDragEnd:end,
  'data-dragging':drag===id||undefined,
  'data-drop':over?.id===id&&drag!==id?(over.after?(vertical?'below':'right'):(vertical?'above':'left')):undefined,
 };
 /** Props for an item's grip: press to arm dragging for that item. */
 const grip=(id:string)=>({onPointerDown:()=>setArmed(id),onPointerUp:()=>{if(!drag)setArmed(null);}});
 return {item,grip,dragging:drag};
}
