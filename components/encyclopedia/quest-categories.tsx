"use client";
import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {Check,ChevronDown,GripVertical,Pencil,Plus,Trash2,X} from 'lucide-react';
import './quest-categories.css';
import {newId,type Campaign,type Workspace} from '@/lib/encyclopedia/world-model';
import {categoryColors,categoryOf,maxQuestCategories,questCategories,questsIn,removeQuestCategory,setQuestCategories,type CategoryColor,type QuestCategory} from '@/lib/encyclopedia/quests';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
const colorNames:Record<CategoryColor,string>={accent:'Accent',grey:'Grey',purple:'Purple',teal:'Teal',orange:'Orange',gold:'Gold',rose:'Rose'};

/** A quest's category as a small coloured label. */
export function CategoryChip({category,suffix=''}:{category:QuestCategory;suffix?:string}){
 return <span className={`quest-type cat-${category.color}`}>{category.name}{suffix}</span>;
}

/**
 * The quest category menu on a quest: the campaign's categories as chips, and "Edit categories…".
 * A plain button and menu, so the chips can show their colours.
 */
export function CategoryPicker({categories,value,onChange,onEdit}:{categories:QuestCategory[];value:string;onChange:(id:string)=>void;onEdit?:()=>void}){
 const [open,setOpen]=useState(false),box=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
 const current=categoryOf(categories,value);
 useEffect(()=>{
  if(!open)return;
  const away=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};
  document.addEventListener('pointerdown',away);
  requestAnimationFrame(()=>(box.current?.querySelector('[aria-checked="true"]') as HTMLElement|null ?? box.current?.querySelector('[role^="menuitem"]') as HTMLElement|null)?.focus());
  return ()=>document.removeEventListener('pointerdown',away);
 },[open]);
 function keys(e:KeyboardEvent<HTMLDivElement>){
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);button.current?.focus();return;}
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp'&&e.key!=='Home'&&e.key!=='End')return;
  e.preventDefault();
  const items=[...(box.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]')??[])],at=items.indexOf(document.activeElement as HTMLElement);
  const next=e.key==='Home'?0:e.key==='End'?items.length-1:(at+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
  items[next]?.focus();
 }
 const pick=(id:string)=>{setOpen(false);button.current?.focus();if(id!==value)onChange(id);};
 return <div className="quest-cat-picker" ref={box} onKeyDown={keys}>
  <button ref={button} type="button" className={`quest-type cat-${current.color} quest-cat-button`} aria-haspopup="menu" aria-expanded={open} aria-label={`Quest category: ${current.name}`} onClick={()=>setOpen(!open)}>{current.name} quest <ChevronDown size={13}/></button>
  {open&&<div className="quest-cat-menu" role="menu" aria-label="Quest category">
   {categories.map(c=><button key={c.id} type="button" role="menuitemradio" aria-checked={c.id===value} tabIndex={-1} onClick={()=>pick(c.id)}><CategoryChip category={c}/>{c.id===value&&<Check size={14}/>}</button>)}
   {onEdit&&<button type="button" role="menuitem" tabIndex={-1} className="quest-cat-edit" onClick={()=>{setOpen(false);onEdit();}}><Pencil size={13}/> Edit categories…</button>}
  </div>}
 </div>;
}

/** The dialog where a GM adds, renames, recolours, reorders and removes a campaign's quest categories. */
export function QuestCategoriesDialog({data,worldId,campaign,change,onClose}:{data:Workspace;worldId:string;campaign:Campaign;change:Change;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),list=useRef<HTMLOListElement>(null);
 const categories=questCategories(campaign),quests=questsIn(data,worldId,campaign.id);
 const count=(id:string)=>quests.filter(q=>q.quest.type===id).length;
 const [names,setNames]=useState<Record<string,string>>({}),[active,setActive]=useState<string|null>(null),[adding,setAdding]=useState('');
 const [removing,setRemoving]=useState<{id:string;to:string}|null>(null),[dragging,setDragging]=useState<string|null>(null);
 useEffect(()=>{const d=ref.current;if(d&&!d.open)d.showModal();},[]);
 const save=(next:QuestCategory[])=>change(w=>setQuestCategories(w,campaign.id,next));
 const patch=(id:string,p:Partial<QuestCategory>)=>save(categories.map(c=>c.id===id?{...c,...p}:c));
 function move(id:string,to:number){
  const from=categories.findIndex(c=>c.id===id);if(from<0||to<0||to>=categories.length||from===to)return;
  const next=[...categories],[c]=next.splice(from,1);next.splice(to,0,c);save(next);
 }
 function add(){
  const name=adding.trim().slice(0,40);if(!name||categories.length>=maxQuestCategories)return;
  const same=categories.find(c=>c.name.toLowerCase()===name.toLowerCase());
  if(same){setActive(same.id);setAdding('');return;}
  const used=new Set(categories.map(c=>c.color)),color=categoryColors.find(c=>!used.has(c))??'grey',id=newId();
  save([...categories,{id,name,color}]);setActive(id);setAdding('');
 }
 function remove(id:string){
  const n=count(id),rest=categories.filter(c=>c.id!==id);
  if(!rest.length)return;
  if(!n){save(rest);if(active===id)setActive(null);return;}
  setRemoving({id,to:rest[0].id});
 }
 function confirmRemove(){
  if(!removing)return;
  change(w=>removeQuestCategory(w,worldId,campaign.id,removing.id,removing.to));
  if(active===removing.id)setActive(null);setRemoving(null);
 }
 const handleKeys=(e:KeyboardEvent<HTMLButtonElement>,id:string,i:number)=>{
  if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
  e.preventDefault();move(id,i+(e.key==='ArrowUp'?-1:1));
  requestAnimationFrame(()=>list.current?.querySelector<HTMLElement>(`[data-cat="${id}"] .quest-cat-handle`)?.focus());
 };
 const activeCat=categories.find(c=>c.id===active);
 return <dialog ref={ref} className="quest-cat-dialog" aria-labelledby="quest-cat-title"
  onCancel={e=>{e.preventDefault();onClose();}}
  onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();e.stopPropagation();if(removing)setRemoving(null);else onClose();}}}
  onClick={e=>{if(e.target===ref.current)onClose();}}>
  <div className="quest-cat-head"><h2 id="quest-cat-title">Quest categories</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
  <p className="quest-cat-lead">For {campaign.name}. Drag to reorder: the board filters and the journal follow this order. Players see the category name on quests you share.</p>
  <ol className="quest-cat-list" ref={list}>
   {categories.map((c,i)=>{const n=count(c.id),gone=removing?.id===c.id;return <li key={c.id} data-cat={c.id} className={`${dragging===c.id?'dragging':''} ${active===c.id?'on':''}`}
    onDragOver={e=>{if(!dragging||dragging===c.id)return;e.preventDefault();move(dragging,i);}}>
    <button type="button" className="quest-cat-handle" draggable aria-label={`Move ${c.name}. Use the up and down arrow keys.`} title="Drag to reorder"
     onDragStart={e=>{e.dataTransfer.setData('text/plain',c.id);e.dataTransfer.effectAllowed='move';const row=e.currentTarget.closest('li');if(row)e.dataTransfer.setDragImage(row,16,20);setDragging(c.id);}}
     onDragEnd={()=>setDragging(null)} onKeyDown={e=>handleKeys(e,c.id,i)}><GripVertical size={15}/></button>
    <button type="button" className={`quest-cat-dot cat-${c.color}`} aria-label={`Colour for ${c.name}: ${colorNames[c.color]}`} aria-expanded={active===c.id} onClick={()=>setActive(active===c.id?null:c.id)}/>
    {gone?<div className="quest-cat-remove">
     <span>Move its {n} {n===1?'quest':'quests'} to</span>
     <select aria-label={`Move the quests in ${c.name} to`} value={removing.to} onChange={e=>setRemoving({id:c.id,to:e.target.value})}>{categories.filter(x=>x.id!==c.id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
     <button type="button" className="quest-cat-danger" onClick={confirmRemove}>Delete {c.name}</button>
     <button type="button" className="text-button" onClick={()=>setRemoving(null)}>Cancel</button>
    </div>:<>
     <input aria-label={`Name of ${c.name}`} value={names[c.id]??c.name} maxLength={40} onFocus={()=>setActive(c.id)}
      onChange={e=>{const v=e.target.value;setNames(o=>({...o,[c.id]:v}));if(v.trim())patch(c.id,{name:v.trim()});}}
      onBlur={()=>setNames(o=>{const n={...o};delete n[c.id];return n;})}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>
     <small className="quest-cat-count">{n} {n===1?'quest':'quests'}</small>
     <button type="button" className="icon-button" aria-label={`Delete ${c.name}`} title={categories.length===1?'A campaign keeps at least one category':`Delete ${c.name}`} disabled={categories.length===1} onClick={()=>remove(c.id)}><Trash2 size={15}/></button>
    </>}
   </li>;})}
  </ol>
  {activeCat&&<div className="quest-cat-swatches" role="radiogroup" aria-label={`Colour for ${activeCat.name}`}>
   {categoryColors.map(color=><button key={color} type="button" role="radio" aria-checked={activeCat.color===color} aria-label={colorNames[color]} title={colorNames[color]} className={`quest-cat-dot cat-${color}`} onClick={()=>patch(activeCat.id,{color})}/>)}
   <small>Colour for “{activeCat.name}”</small>
  </div>}
  <form className="quest-cat-add" onSubmit={e=>{e.preventDefault();add();}}>
   <input aria-label="New category" placeholder={categories.length>=maxQuestCategories?`A campaign can have ${maxQuestCategories} categories`:'New category, like “Downtime” or “Guild contract”'} value={adding} maxLength={40} disabled={categories.length>=maxQuestCategories} onChange={e=>setAdding(e.target.value)}/>
   <button type="submit" className="button" disabled={!adding.trim()}><Plus size={15}/> Add</button>
  </form>
  <p className="quest-cat-note">Deleting a category asks where its quests should go. A campaign starts with Main, Side and Personal; you can rename or remove those too.</p>
  <div className="quest-cat-actions"><button type="button" className="button primary" onClick={onClose}>Done</button></div>
 </dialog>;
}
