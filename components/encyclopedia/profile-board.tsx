'use client';
/* The parts organization profiles and character profiles share: item tools, the block frame with its Arrange controls, the
   two-column board, the Arrange bar, the Add a block menu, the beliefs list, text blocks and the editable bottom bar. */
import {Fragment,useState,type DragEvent,type ReactNode} from 'react';
import {ArrowDown,ArrowLeftRight,ArrowUp,Check,Eye,EyeOff,GripVertical,Pencil,Plus,Trash2,X} from 'lucide-react';
import {newId} from '@/lib/encyclopedia/world-model';
import {boardSegments,maxBarFields,maxBlocks,standingNames,standings,type BoardBlock,type OrgBarField,type OrgBelief,type Standing} from '@/lib/encyclopedia/org-profile';
import {GmChip} from './org-parts';

export const stand=(value:string):Standing|undefined=>(standings as readonly string[]).includes(value)?value as Standing:undefined;
export const StandingSelect=({value,onChange,label='Standing'}:{value?:Standing;onChange:(s:Standing|undefined)=>void;label?:string})=><select className="org-select" aria-label={label} value={value??''} onChange={e=>onChange(stand(e.target.value))}><option value="">No standing</option>{standings.map(s=><option key={s} value={s}>{standingNames[s]}</option>)}</select>;

/** Edit, GM only and remove for one item. */
export function ItemTools({gm,editing,what,onEdit,onGm,onRemove}:{gm?:boolean;editing?:boolean;what:string;onEdit?:()=>void;onGm:()=>void;onRemove:()=>void}){
 return <span className="org-item-tools">
  {onEdit&&<button type="button" className="icon-button" aria-label={`${editing?'Finish editing':'Edit'} ${what}`} aria-pressed={editing} onClick={onEdit}>{editing?<Check size={13}/>:<Pencil size={13}/>}</button>}
  <button type="button" className="icon-button" aria-label={gm?`Show ${what} to players`:`Make ${what} GM only`} aria-pressed={!!gm} title={gm?'GM only: click to share with players':'Click to make this GM only'} onClick={onGm}>{gm?<EyeOff size={13}/>:<Eye size={13}/>}</button>
  <button type="button" className="icon-button" aria-label={`Remove ${what}`} onClick={onRemove}><Trash2 size={13}/></button>
 </span>;
}

/* ---- One block, with its Arrange controls ---- */

export type Arrange<B extends BoardBlock>={
 on:boolean;dragId:string|null;overId:string|null;renaming:string|null;
 setRenaming:(id:string|null)=>void;setDrag:(id:string|null)=>void;setOver:(id:string|null)=>void;
 edit:(id:string,f:(b:B)=>B)=>void;remove:(b:B)=>void;move:(id:string,dir:-1|1)=>void;canMove:(id:string,dir:-1|1)=>boolean;
 side:(id:string)=>void;drop:(beforeId:string|null,column?:'left'|'right')=>void;
};

/** The frame of one block: its heading, the Arrange tools, and the body (inert while arranging). */
export function BlockFrame<B extends BoardBlock>({b,name,arrange,children}:{b:B;name:string;arrange:Arrange<B>;children:ReactNode}){
 const on=arrange.on,dragging=arrange.dragId===b.id,over=arrange.overId===b.id&&arrange.dragId!==b.id;
 return <section className={`org-block${b.gm?' is-gm':''}${on?' is-arranging':''}${dragging?' dragging':''}${over?' drop-before':''}${b.full?' is-full':''}`} data-block={b.id} aria-label={name}
  draggable={on&&arrange.renaming!==b.id} onDragStart={(e:DragEvent)=>{if(!on)return;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',name);arrange.setDrag(b.id);}} onDragEnd={()=>{arrange.setDrag(null);arrange.setOver(null);}}
  onDragOver={(e:DragEvent)=>{if(!on||!arrange.dragId)return;e.preventDefault();e.stopPropagation();if(arrange.overId!==b.id)arrange.setOver(b.id);}}
  onDrop={(e:DragEvent)=>{if(!on||!arrange.dragId)return;e.preventDefault();e.stopPropagation();arrange.drop(b.id,b.full?undefined:b.column);}}>
  <header className="org-block-head">
   {on&&<span className="org-grip" aria-hidden="true" title="Drag to move"><GripVertical size={16}/></span>}
   {on&&arrange.renaming===b.id?<input className="org-input org-title-input" aria-label="Block name" autoFocus maxLength={80} value={b.title} onChange={e=>arrange.edit(b.id,x=>({...x,title:e.target.value}))} onBlur={()=>arrange.setRenaming(null)} onKeyDown={e=>{if(e.key==='Enter'||e.key==='Escape')arrange.setRenaming(null);}}/>:<h3 className="org-block-title">{name}</h3>}
   {b.gm&&<GmChip/>}
   {on&&<span className="org-arrange-tools" role="group" aria-label={`Arrange ${name}`}>
    <button type="button" className="icon-button" aria-label={`Rename ${name}`} title="Rename" onMouseDown={e=>e.preventDefault()} onClick={()=>arrange.setRenaming(arrange.renaming===b.id?null:b.id)}><Pencil size={13}/></button>
    <button type="button" className="org-toggle" aria-pressed={!!b.gm} aria-label={b.gm?`${name} is GM only. Show it to players`:`${name} is shown to players. Make it GM only`} onClick={()=>arrange.edit(b.id,x=>({...x,gm:x.gm?undefined:true}))}>{b.gm?<><EyeOff size={12}/> GM only</>:<><Eye size={12}/> Players</>}</button>
    <button type="button" className="org-toggle" aria-pressed={!!b.full} aria-label={b.full?`Make ${name} half width`:`Make ${name} full width`} title={b.full?'Half width':'Full width'} onClick={()=>arrange.edit(b.id,x=>({...x,full:x.full?undefined:true}))}>{b.full?'½':'Full'}</button>
    <button type="button" className="icon-button" aria-label={`Move ${name} up`} title="Move up" disabled={!arrange.canMove(b.id,-1)} onClick={()=>arrange.move(b.id,-1)}><ArrowUp size={13}/></button>
    <button type="button" className="icon-button" aria-label={`Move ${name} down`} title="Move down" disabled={!arrange.canMove(b.id,1)} onClick={()=>arrange.move(b.id,1)}><ArrowDown size={13}/></button>
    <button type="button" className="icon-button" aria-label={`Move ${name} to the other column`} title="Other column" disabled={!!b.full} onClick={()=>arrange.side(b.id)}><ArrowLeftRight size={13}/></button>
    <button type="button" className="icon-button" aria-label={`Remove ${name}`} title="Remove" onClick={()=>arrange.remove(b)}><X size={13}/></button>
   </span>}
  </header>
  <div className="org-block-body" inert={on||undefined}>{children}</div>
 </section>;
}

/* ---- The board, the Arrange bar and the Add a block menu ---- */

/** The blocks in rows: full-width blocks alone, the rest in two columns, with drop zones while arranging. */
export function Board<B extends BoardBlock>({blocks,arranging,dragId,overId,setOver,drop,render}:{blocks:readonly B[];arranging:boolean;dragId:string|null;overId:string|null;setOver:(id:string|null)=>void;drop:(beforeId:string|null,column?:'left'|'right')=>void;render:(b:B)=>ReactNode}){
 const segments=boardSegments(blocks),over=(zone:string)=>overId===zone;
 const colDrop=(key:string,before:string|null,column:'left'|'right')=><div className={`org-col-drop${over(key)?' is-over':''}`} onDragOver={(e:DragEvent)=>{if(!dragId)return;e.preventDefault();e.stopPropagation();if(overId!==key)setOver(key);}} onDrop={(e:DragEvent)=>{if(!dragId)return;e.preventDefault();e.stopPropagation();drop(before,column);}}>Drop here</div>;
 return <div className="org-board" onDragOver={e=>{if(dragId)e.preventDefault();}}>
  {segments.map((seg,i)=>'full' in seg
   ?<div className="org-row is-full" key={seg.full.id}>{render(seg.full)}</div>
   :<div className="org-row" key={`s${i}`}>{(['left','right'] as const).map(col=><div className="org-col" key={col}>{seg[col].map(b=><Fragment key={b.id}>{render(b)}</Fragment>)}{arranging&&colDrop(`${i}:${col}`,seg.endsBefore,col)}</div>)}</div>)}
  {!blocks.length&&<p className="org-empty org-board-empty">No blocks yet. Choose Arrange, then Add a block.</p>}
  {arranging&&dragId&&<div className={`org-col-drop org-end-drop${over('end')?' is-over':''}`} onDragOver={(e:DragEvent)=>{e.preventDefault();if(overId!=='end')setOver('end');}} onDrop={(e:DragEvent)=>{e.preventDefault();drop(null,'left');}}>Drop here to move it to the end</div>}
 </div>;
}

/** The bar shown while arranging: what it does, who the layout is for, and Done. */
export function ArrangeBar({what,scope,setScope,coGm,onDone}:{what:string;scope:'one'|'world';setScope:(s:'one'|'world')=>void;coGm:boolean;onDone:()=>void}){
 return <div className="org-arrange-bar" role="region" aria-label="Arrange the profile"><p><strong>Arranging the profile.</strong> Drag blocks between the columns. ½ makes one full width.</p>
  <fieldset className="org-scope"><legend className="sr-only">Who this layout is for</legend>
   {!coGm&&<label><input type="radio" name="org-scope" checked={scope==='world'} onChange={()=>setScope('world')}/> All {what} in this world</label>}
   <label><input type="radio" name="org-scope" checked={scope==='one'||coGm} onChange={()=>setScope('one')}/> Just this one</label></fieldset>
  <button type="button" className="button small primary" onClick={onDone}><Check size={14}/> Done</button></div>;
}

export function AddBlockMenu({kinds,count,onAdd}:{kinds:{kind:string;name:string;blurb:string;taken:boolean}[];count:number;onAdd:(kind:string)=>void}){
 const [open,setOpen]=useState(false);
 return <div className="org-add-block" onKeyDown={e=>{if(e.key==='Escape'&&open){e.stopPropagation();setOpen(false);}}}><button type="button" className="org-add-block-button" aria-expanded={open} aria-haspopup="menu" disabled={count>=maxBlocks} onClick={()=>setOpen(!open)}><Plus size={15}/> Add a block{count>=maxBlocks?` (up to ${maxBlocks})`:''}</button>
  {open&&<div className="org-add-menu" role="menu" aria-label="Add a block" onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>{kinds.map(k=><button type="button" role="menuitem" key={k.kind} disabled={k.taken} onClick={()=>{onAdd(k.kind);setOpen(false);}}><strong>{k.name}</strong><small>{k.taken?'Already on this page.':k.blurb}</small></button>)}</div>}</div>;
}

/* ---- Beliefs and text ---- */

/** A list of beliefs (topic, stance, detail), each GM only if you like. `ctx` is the page's editing state. */
export function BeliefsList({items,set,editing,setEditing}:{items:OrgBelief[];set:(f:(l:OrgBelief[])=>OrgBelief[])=>void;editing:string|null;setEditing:(id:string|null)=>void}){
 const add=()=>{const id=newId();set(l=>[...l,{id,topic:'',stance:'',detail:''}]);setEditing(id);};
 return <>
  {items.map(x=>editing===x.id
   ?<div className="org-belief org-item" key={x.id}><input className="org-input" aria-label="Topic" placeholder="Topic, for example Authority" maxLength={60} autoFocus value={x.topic} onChange={e=>set(l=>l.map(y=>y.id===x.id?{...y,topic:e.target.value}:y))}/><input className="org-input" aria-label="Stance" placeholder="Stance, for example Earned by service" maxLength={100} value={x.stance} onChange={e=>set(l=>l.map(y=>y.id===x.id?{...y,stance:e.target.value}:y))}/><textarea className="org-input" aria-label="Detail" placeholder="A sentence of detail" maxLength={400} rows={2} value={x.detail} onChange={e=>set(l=>l.map(y=>y.id===x.id?{...y,detail:e.target.value}:y))}/>
     <ItemTools gm={x.gm} editing what={x.topic||'this belief'} onEdit={()=>setEditing(null)} onGm={()=>set(l=>l.map(y=>y.id===x.id?{...y,gm:y.gm?undefined:true}:y))} onRemove={()=>set(l=>l.filter(y=>y.id!==x.id))}/></div>
   :<div className={`org-belief org-item${x.gm?' is-gm':''}`} key={x.id}><span className="org-belief-topic">{x.topic||'Untitled'}{x.gm&&<GmChip/>}</span><strong>{x.stance||<span className="org-blank">No stance yet</span>}</strong>{x.detail&&<p>{x.detail}</p>}<ItemTools gm={x.gm} what={x.topic||'this belief'} onEdit={()=>setEditing(x.id)} onGm={()=>set(l=>l.map(y=>y.id===x.id?{...y,gm:y.gm?undefined:true}:y))} onRemove={()=>set(l=>l.filter(y=>y.id!==x.id))}/></div>)}
  {!items.length&&<p className="org-empty">No beliefs yet.</p>}
  <button type="button" className="text-button org-add" disabled={items.length>=20} onClick={add}><Plus size={13}/> Add</button>
 </>;
}

/** A paragraph block: the text, or a box to write it in. */
export function TextBlockBody({title,text,editing,setEditing,onChange}:{title:string;text:string;editing:boolean;setEditing:(on:boolean)=>void;onChange:(text:string)=>void}){
 return editing
  ?<><textarea className="org-input" aria-label={title||'Text'} rows={4} maxLength={4000} autoFocus value={text} placeholder="Write a paragraph…" onChange={e=>onChange(e.target.value)}/><button type="button" className="text-button org-add" onClick={()=>setEditing(false)}><Check size={13}/> Done</button></>
  :<>{text.trim()?<p className="org-text">{text}</p>:<p className="org-empty">Nothing written yet.</p>}<button type="button" className="text-button org-add" onClick={()=>setEditing(true)}><Pencil size={13}/> Edit</button></>;
}

/* ---- The bottom bar, editable ---- */

type Bar={title:string;hidden?:boolean;fields:OrgBarField[]};
export function BarEditor({bar,setBar,onDone}:{bar:Bar;setBar:(f:(b:Bar)=>Bar)=>void;onDone:()=>void}){
 const setField=(id:string,patch:Partial<OrgBarField>)=>setBar(b=>({...b,fields:b.fields.map(f=>f.id===id?{...f,...patch}:f)}));
 return <section className="org-bar is-editing" aria-label="Change this bar">
  <div className="org-bar-title"><label className="org-bar-name">Bar name<input className="org-input" aria-label="Bar name" maxLength={40} value={bar.title} onChange={e=>setBar(b=>({...b,title:e.target.value}))}/></label>
   <span className="org-bar-buttons"><button type="button" className="button small" aria-pressed={!!bar.hidden} onClick={()=>setBar(b=>({...b,hidden:b.hidden?undefined:true}))}>{bar.hidden?'Show the bar':'Hide the bar'}</button><button type="button" className="button small primary" onClick={onDone}><Check size={13}/> Done</button></span></div>
  <div className="org-bar-edit">{bar.fields.map(f=><div key={f.id} className={`org-bar-edit-row${f.gm?' is-gm':''}`}>
   <input className="org-input" aria-label="Field label" placeholder="Label" maxLength={40} value={f.label} onChange={e=>setField(f.id,{label:e.target.value})}/>
   <input className="org-input" aria-label={`${f.label||'Field'} value`} placeholder="A short note" maxLength={300} value={f.value} onChange={e=>setField(f.id,{value:e.target.value})}/>
   <button type="button" className="org-toggle" aria-pressed={!!f.gm} aria-label={f.gm?`${f.label||'This field'} is GM only. Show it to players`:`Make ${f.label||'this field'} GM only`} onClick={()=>setField(f.id,{gm:f.gm?undefined:true})}>{f.gm?<><EyeOff size={12}/> GM only</>:<><Eye size={12}/> Players</>}</button>
   <button type="button" className="icon-button" aria-label={`Remove ${f.label||'this field'}`} onClick={()=>setBar(b=>({...b,fields:b.fields.filter(x=>x.id!==f.id)}))}><Trash2 size={13}/></button></div>)}
   <button type="button" className="text-button org-add" disabled={bar.fields.length>=maxBarFields} onClick={()=>setBar(b=>({...b,fields:[...b.fields,{id:newId(),label:'',value:''}]}))}><Plus size={13}/> Add a field{bar.fields.length>=maxBarFields?` (up to ${maxBarFields})`:''}</button></div>
 </section>;
}
