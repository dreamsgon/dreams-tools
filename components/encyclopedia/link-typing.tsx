"use client";
import {useState,type KeyboardEvent,type RefObject} from 'react';
import {FileText,Plus} from 'lucide-react';
import {linkSuggestions,linkText} from '@/lib/encyclopedia/page-tree';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';

type Open={start:number;end:number;query:string;x:number;y:number};
// [[ anywhere, or @ at the start of a word, followed by what you have typed so far.
const TRIGGER=/(\[\[|(?<![^\s(])@)([^[\]|\n@]{0,60})$/;
const COPY=['box-sizing','width','padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-right-width','border-bottom-width','border-left-width','font-family','font-size','font-weight','font-style','letter-spacing','line-height','text-transform','word-spacing','text-indent','tab-size'];

/** Where the caret is inside a textarea, measured with an invisible copy of its text. */
function caretPoint(el:HTMLTextAreaElement,pos:number){
 const copy=document.createElement('div'),style=getComputedStyle(el);
 for(const p of COPY)copy.style.setProperty(p,style.getPropertyValue(p));
 Object.assign(copy.style,{position:'absolute',visibility:'hidden',whiteSpace:'pre-wrap',overflowWrap:'break-word',top:'0',left:'0'});
 copy.textContent=el.value.slice(0,pos);const mark=document.createElement('span');mark.textContent='​';copy.appendChild(mark);document.body.appendChild(copy);
 const line=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.5,point={x:el.offsetLeft+mark.offsetLeft,y:el.offsetTop+mark.offsetTop-el.scrollTop+line};
 copy.remove();return point;
}

/**
 * Typing [[ or @ in the editor lists pages to link; Enter links the highlighted one.
 * The last choice creates a new page inside this one and links it.
 */
export function useLinkTyping({entry,data,el,insert,create}:{entry:Entry;data:Workspace;el:RefObject<HTMLTextAreaElement|null>;insert:(start:number,end:number,text:string)=>void;create:(title:string,start:number,end:number)=>void}){
 const [open,setOpen]=useState<Open|null>(null),[active,setActive]=useState(0);
 const query=open?.query.trim()??'';
 const found=open?linkSuggestions(data,entry,query):[];
 const canCreate=!!query&&!/^\d|^maptable:/i.test(query)&&!found.some(f=>f.entry.title.toLowerCase()===query.toLowerCase());
 const count=found.length+(canCreate?1:0);
 function check(){
  const t=el.current;if(!t||t.selectionStart!==t.selectionEnd){setOpen(null);return;}
  const caret=t.selectionStart,m=t.value.slice(0,caret).match(TRIGGER);
  // A roll such as [[1d20+5]] is not a link.
  if(!m||m[1]==='[['&&/^\s*\d/.test(m[2])){setOpen(null);return;}
  const start=m.index!,p=caretPoint(t,start),width=t.offsetLeft+t.clientWidth;
  if(open?.start!==start||open.query!==m[2])setActive(0);
  setOpen({start,end:caret,query:m[2],x:Math.max(t.offsetLeft,Math.min(p.x,width-340)),y:p.y});
 }
 function pick(i:number){
  if(!open)return;
  if(i<found.length)insert(open.start,open.end,linkText(found[i].entry));
  else if(canCreate)create(query,open.start,open.end);
  setOpen(null);
 }
 function onKeyDown(e:KeyboardEvent<HTMLTextAreaElement>){
  if(!open||!count)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setActive(a=>(a+(e.key==='ArrowDown'?1:count-1))%count);}
  else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();pick(Math.min(active,count-1));}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(null);}
 }
 const listId=`link-typing-${entry.id}`;
 const textareaProps={onKeyDown,onSelect:check,onBlur:()=>setOpen(null),'aria-autocomplete':'list' as const,'aria-expanded':!!open&&count>0,'aria-controls':open&&count?listId:undefined,'aria-activedescendant':open&&count?`${listId}-${Math.min(active,count-1)}`:undefined};
 const popup=open&&count>0?<div className="link-typing" id={listId} role="listbox" aria-label="Link to a page" style={{left:open.x,top:open.y}}>
  <div className="link-typing-head">Link to a page</div>
  {found.map((f,i)=><button type="button" tabIndex={-1} key={f.entry.id} id={`${listId}-${i}`} role="option" aria-selected={i===active} onMouseDown={e=>{e.preventDefault();pick(i);}} onMouseEnter={()=>setActive(i)}><FileText size={14} aria-hidden="true"/><span><strong>{f.entry.title}</strong><small>{[...f.path,f.entry.campaignId?null:'Shared lore'].filter(Boolean).join(' › ')||f.entry.kind}</small></span></button>)}
  {canCreate&&<button type="button" tabIndex={-1} id={`${listId}-${found.length}`} role="option" className="link-typing-create" aria-selected={active===found.length} onMouseDown={e=>{e.preventDefault();pick(found.length);}} onMouseEnter={()=>setActive(found.length)}><Plus size={14} aria-hidden="true"/><span>Create page “{query.slice(0,60)}” inside {entry.title}</span></button>}
  <div className="link-typing-foot">Type [[ or @ · Enter to link · Esc to close</div>
 </div>:null;
 return {textareaProps,popup,check};
}
