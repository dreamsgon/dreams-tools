'use client';
/*
 * The Features tab on a character page: class features, feats, species traits and the like, in collapsible groups. Read
 * mode is the clean sheet: names, notes, uses to spend, rolls and text. Edit mode adds a checkbox on every feature (to
 * delete many at once), Change, moving and hiding. The pure rules live in lib/encyclopedia/features.ts.
 */
import {useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,Award,Check,EyeOff,Minus,Pencil,Plus,RotateCcw,Search,Trash2} from 'lucide-react';
import {MAX_FEATURES,featureGroups,featureGroupsOf,moveFeature,resetUses,setUses,type Feature,type PlayerFeature} from '@/lib/encyclopedia/features';
import type {ItemRoll} from '@/lib/encyclopedia/items';
import {newId} from '@/lib/encyclopedia/world-model';
import {confirmDialog} from '@/components/confirm-dialog';
import {GroupHead,useCollapsed} from './group-collapse';
import {NoteText,RollsEditor} from './inventory';
import {RollChip} from './rolls';
import {ToolDialog} from './tool-dialog';
import './inventory.css';
import './features.css';

type Input=Omit<Feature,'id'>;

function FeatureForm({start,groups,gm,onSave,onClose}:{start?:Feature;groups:string[];gm:boolean;onSave:(f:Input)=>void;onClose:()=>void}){
 const [f,setF]=useState<Input>(()=>start?{...start}:{name:'',group:groups[0]??'Class'});
 const set=(p:Partial<Input>)=>setF(x=>({...x,...p}));
 const [max,setMax]=useState(start?.uses?String(start.uses.max):'');
 const names=[...new Set([...groups,...featureGroups])];
 return <ToolDialog title={start?`Change ${start.name}`:'Add a feature'} onClose={onClose} wide>
  <form className="spell-form" onSubmit={e=>{e.preventDefault();if(!f.name.trim())return;
   const n=Math.round(Number(max));const uses=max.trim()&&n>=1?{value:Math.min(f.uses?.value??n,Math.min(1000,n)),max:Math.min(1000,n),...(f.uses?.reset?.trim()?{reset:f.uses.reset.trim()}:{})}:undefined;
   const {uses:_u,...rest}=f;void _u;
   onSave({...rest,name:f.name.trim(),group:f.group?.trim()||undefined,note:f.note?.trim()||undefined,text:f.text?.trim()||undefined,...(uses?{uses}:{}),...(f.rolls?.length?{rolls:f.rolls}:{rolls:undefined}),gm:f.gm||undefined});onClose();}}>
   <div className="spell-form-grid">
    <label className="field-label">Name<input className="inv-input" autoFocus required maxLength={80} placeholder="Second Wind" value={f.name} onChange={e=>set({name:e.target.value})}/></label>
    <label className="field-label">Group<input className="inv-input" list="feature-groups" maxLength={40} placeholder="Class, Species, Feat…" value={f.group??''} onChange={e=>set({group:e.target.value||undefined})}/><datalist id="feature-groups">{names.map(g=><option key={g} value={g}/>)}</datalist></label>
    <label className="field-label">Short note<input className="inv-input" maxLength={120} placeholder="Level 2 · Bonus action" value={f.note??''} onChange={e=>set({note:e.target.value})}/></label>
    <label className="field-label">Uses<small> Leave empty if it has no limit</small><input className="inv-input" type="number" min={1} max={1000} placeholder="—" value={max} onChange={e=>setMax(e.target.value)}/></label>
    {max.trim()&&<label className="field-label">They come back on<input className="inv-input" list="feature-resets" maxLength={30} placeholder="Short rest" value={f.uses?.reset??''} onChange={e=>set({uses:{value:f.uses?.value??(Number(max)||1),max:f.uses?.max??(Number(max)||1),reset:e.target.value}})}/><datalist id="feature-resets">{['Short rest','Long rest','Dawn','Session'].map(r=><option key={r} value={r}/>)}</datalist></label>}
   </div>
   <label className="field-label">What it does<small> Write [[1d10+3|Healing]] to put a roll in the text.</small><textarea className="inv-input" rows={5} maxLength={4000} value={f.text??''} onChange={e=>set({text:e.target.value})}/></label>
   <div className="field-label">Rolls<RollsEditor rolls={f.rolls??[]} onSave={(rolls:ItemRoll[])=>set({rolls})}/></div>
   {gm&&<label className="check-line"><input type="checkbox" checked={!!f.gm} onChange={e=>set({gm:e.target.checked})}/> Hide from players</label>}
   <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={!f.name.trim()}>{start?'Save':'Add feature'}</button></div>
  </form>
 </ToolDialog>;
}

/** Uses as pips when there are few, or a counter. −/+ when the viewer may change them. */
function Uses({f,onSet}:{f:PlayerFeature;onSet?:(v:number)=>void}){
 const u=f.uses!;
 return <span className="feat-uses" aria-label={`${u.value} of ${u.max} uses left${u.reset?`, back on ${u.reset}`:''}`}>
  {onSet&&<button type="button" className="icon-button" aria-label={`Use ${f.name}`} disabled={u.value<=0} onClick={()=>onSet(u.value-1)}><Minus size={12}/></button>}
  {u.max<=8?<span className="feat-pips" aria-hidden="true">{Array.from({length:u.max},(_,i)=><span key={i} className={i<u.value?'on':''}/>)}</span>:<strong className="feat-count" aria-hidden="true">{u.value}<small>/{u.max}</small></strong>}
  {onSet&&<button type="button" className="icon-button" aria-label={`Get back a use of ${f.name}`} disabled={u.value>=u.max} onClick={()=>onSet(u.value+1)}><Plus size={12}/></button>}
  {u.reset&&<small className="feat-reset">{u.reset}</small>}
 </span>;
}

/**
 * The panel. `features` are the GM's or the player copy; `onChange` is given only to someone who may change them, and
 * `gm` shows the GM-only switch and flags.
 */
export function FeaturesPanel({name,features,gm,onChange}:{name:string;features:(Feature|PlayerFeature)[];gm:boolean;onChange?:(next:Feature[])=>void}){
 const [editing,setEditing]=useState(false),[picked,setPicked]=useState<Set<string>>(new Set),[form,setForm]=useState<Feature|'new'|null>(null),[q,setQ]=useState(''),[open,setOpen]=useState<Set<string>>(new Set);
 const collapse=useCollapsed('features');
 const list=features as Feature[],want=q.trim().toLowerCase();
 const shown=want?list.filter(f=>`${f.name} ${f.group??''} ${f.note??''} ${f.text??''}`.toLowerCase().includes(want)):list;
 const groups=featureGroupsOf(shown),allGroups=useMemo(()=>[...new Set(list.map(f=>f.group?.trim()).filter((g):g is string=>!!g))],[list]);
 const resets=[...new Set(list.flatMap(f=>f.uses?.reset&&f.uses.value<f.uses.max?[f.uses.reset.trim()]:[]))];
 const can=!!onChange,edit=can&&editing;
 const pick=(id:string,on:boolean)=>setPicked(p=>{const n=new Set(p);if(on)n.add(id);else n.delete(id);return n;});
 const save=(f:Input,id?:string)=>{if(!onChange)return;if(id)onChange(list.map(x=>x.id===id?{...f,id}:x));else if(list.length<MAX_FEATURES)onChange([...list,{...f,id:newId()}]);};
 const removePicked=async()=>{if(!onChange||!picked.size)return;const n=picked.size;
  if(!await confirmDialog({title:`Delete ${n} feature${n===1?'':'s'}?`,message:`They are removed from ${name}. Pins to them on the profile show as gone.`,confirm:'Delete',danger:true}))return;
  onChange(list.filter(f=>!picked.has(f.id)));setPicked(new Set);};
 const toggleOpen=(id:string)=>setOpen(o=>{const n=new Set(o);if(n.has(id))n.delete(id);else n.add(id);return n;});
 const visible=shown.map(f=>f.id),allPicked=visible.length>0&&visible.every(id=>picked.has(id));

 return <div className={`feat-panel${edit?' is-editing':''}`}>
  <div className="inv-filters feat-tools">
   {list.length>6&&<label className="inv-search"><Search size={14} aria-hidden="true"/><input aria-label="Find a feature" placeholder="Find a feature" value={q} onChange={e=>setQ(e.target.value)}/></label>}
   {can&&resets.map(r=><button key={r} type="button" className="button small" title={`Every feature that comes back on ${r} back to full`} onClick={()=>onChange!(resetUses(list,r))}><RotateCcw size={13}/> {r}</button>)}
   {can&&<span className="feat-tools-end">
    {edit&&<button type="button" className="button small primary" onClick={()=>setForm('new')} disabled={list.length>=MAX_FEATURES}><Plus size={13}/> Add feature</button>}
    <button type="button" className={`button small feat-edit-toggle${edit?' is-on':''}`} aria-pressed={edit} onClick={()=>{setEditing(e=>!e);setPicked(new Set);}}>{edit?<><Check size={13}/> Done</>:<><Pencil size={13}/> Edit</>}</button>
   </span>}
  </div>
  {edit&&list.length>0&&<div className="feat-bulk" role="toolbar" aria-label="Selected features">
   <label className="check-line"><input type="checkbox" checked={allPicked} onChange={e=>setPicked(e.target.checked?new Set([...picked,...visible]):new Set([...picked].filter(id=>!visible.includes(id))))}/> Select all{want?' found':''}</label>
   <span className="feat-bulk-count">{picked.size?`${picked.size} selected`:'Tick features to delete several at once'}</span>
   <button type="button" className="button small danger" disabled={!picked.size} onClick={removePicked}><Trash2 size={13}/> Delete selected</button>
  </div>}
  {!list.length&&<div className="feat-empty"><Award size={18} aria-hidden="true"/><p>{can?`Add ${name}’s class features, feats and traits here. Give them uses to tick off and rolls to make.`:'No features yet.'}</p>{can&&<button type="button" className="button small primary" onClick={()=>{setEditing(true);setForm('new');}}><Plus size={13}/> Add feature</button>}</div>}
  {list.length>0&&!shown.length&&<p className="pin-empty">Nothing matches.</p>}
  {groups.map(g=>{const title=g.name||(groups.length>1?'Other':'Features'),closed=collapse.isClosed(g.name);
   return <section key={g.name||'other'} className="inv-group feat-group">
    <GroupHead title={title} count={g.features.length} closed={closed} onToggle={()=>collapse.toggle(g.name)}/>
    {!closed&&<div className="feat-list" role="list">{g.features.map(f=>{const at=list.findIndex(x=>x.id===f.id),isOpen=open.has(f.id)||edit,long=(f.text?.length??0)>220;
     return <article role="listitem" key={f.id} className={`feat-card${f.gm?' is-gm':''}${picked.has(f.id)?' is-picked':''}`}>
      <div className="feat-head">
       {edit&&<input type="checkbox" className="feat-check" aria-label={`Select ${f.name}`} checked={picked.has(f.id)} onChange={e=>pick(f.id,e.target.checked)}/>}
       <span className="feat-title"><strong>{f.name}</strong>{f.note&&<small>{f.note}</small>}</span>
       {gm&&f.gm&&<span className="inv-flag" title="Players don’t see this"><EyeOff size={11}/> GM only</span>}
       {f.uses&&<Uses f={f} onSet={can?v=>onChange!(setUses(list,f.id,v)):undefined}/>}
       {edit&&<span className="feat-edit-tools">
        <button type="button" className="icon-button" aria-label={`Move ${f.name} up`} disabled={at<=0} onClick={()=>onChange!(moveFeature(list,f.id,-1))}><ArrowUp size={13}/></button>
        <button type="button" className="icon-button" aria-label={`Move ${f.name} down`} disabled={at>=list.length-1} onClick={()=>onChange!(moveFeature(list,f.id,1))}><ArrowDown size={13}/></button>
        <button type="button" className="icon-button" aria-label={`Change ${f.name}`} onClick={()=>setForm(f)}><Pencil size={13}/></button>
       </span>}
      </div>
      {f.rolls&&f.rolls.length>0&&<div className="feat-rolls">{f.rolls.map(r=><RollChip key={r.name} title={`${name} · ${f.name}`} formula={r.formula} label={r.name}/>)}</div>}
      {f.text&&<div className={`feat-text${long&&!isOpen?' is-clamped':''}`}><NoteText text={f.text} title={`${name} · ${f.name}`}/></div>}
      {f.text&&long&&!edit&&<button type="button" className="feat-more" aria-expanded={isOpen} onClick={()=>toggleOpen(f.id)}>{isOpen?'Less':'More'}</button>}
     </article>;})}</div>}
   </section>;})}
  {form&&<FeatureForm start={form==='new'?undefined:form} groups={allGroups} gm={gm} onClose={()=>setForm(null)} onSave={x=>save(x,form==='new'?undefined:form.id)}/>}
 </div>;
}
