"use client";
/*
 * Adding or changing one tie between two pages: its kind (named from this page, both ways when it reads differently),
 * a note, when it began and ended, how each side feels, and whether players see it. A GM-only tie can carry a cover
 * story: another kind of tie players see instead. A tie from a character's People list changes only its kind, note and
 * GM-only switch, and stays in that list.
 */
import {useState} from 'react';
import {Eye,EyeOff,ListTree,Trash2} from 'lucide-react';
import {newId,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {standingNames,standings,type Standing} from '@/lib/encyclopedia/org-profile';
import {tieGroupInfo,tieGroups,tieLabel,tieTypeById,type Tie,type TieType} from '@/lib/encyclopedia/ties';
import {putTie,removeTie,setProfileTie,tieChoices,type TieChoice} from '@/lib/encyclopedia/tie-edit';
import type {PageTie} from '@/lib/encyclopedia/tie-connections';
import {ToolDialog} from './tool-dialog';
import {confirmDialog} from '../confirm-dialog';
import {tieTone} from './connection-list';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;

function KindSelect({label,choices,value,onChange,none}:{label:string;choices:TieChoice[];value:string;onChange:(v:string)=>void;none?:string}){
 return <label>{label}<select value={value} onChange={e=>onChange(e.target.value)}>
  {none!==undefined&&<option value="">{none}</option>}
  {tieGroups.map(g=>{const list=choices.filter(c=>c.group===g);return list.length?<optgroup key={g} label={tieGroupInfo[g].name}>{list.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>:null;})}
 </select></label>;
}

function Feeling({label,value,onChange}:{label:string;value:Standing|'';onChange:(v:Standing|'')=>void}){
 return <label>{label}<select value={value} onChange={e=>onChange(e.target.value as Standing|'')}><option value="">Not set</option>{standings.map(s=><option key={s} value={s}>{standingNames[s]}</option>)}</select></label>;
}

export function TieDialog({entry,other,data,types,editing,change,onClose,onKinds}:{entry:Entry;other:Entry;data:Workspace;types:TieType[];editing?:PageTie;change:Change;onClose:()=>void;onKinds:()=>void}){
 const profile=editing?.source==='profile',owner=profile?data.entries.find(e=>e.id===editing!.ownerId):undefined;
 const mine=!editing||editing.fromId===entry.id;
 // A People list tie always starts at its character; it is offered only the kinds that fit from there.
 const choices:TieChoice[]=profile&&owner
  ?tieChoices(types,owner,owner.id===entry.id?other:entry).filter(c=>!c.reversed).map(c=>owner.id===entry.id?c:{...c,value:`${c.typeId}:rev`,reversed:true,label:tieLabel(tieTypeById(types,c.typeId),false)})
  :tieChoices(types,entry,other);
 const startValue=(typeId:string,reversed:boolean)=>{
  const exact=choices.find(c=>c.typeId===typeId&&c.reversed===reversed)??choices.find(c=>c.typeId===typeId);
  return exact?.value??'';
 };
 const firstValue=editing?startValue(editing.tie.typeId,!mine):(choices.find(c=>c.typeId==='knows')??choices.find(c=>c.typeId==='linked')??choices[0])?.value??'';
 // A kind that no longer fits these pages (its pages were changed in Kinds of tie) is still offered while editing.
 const kept=editing&&!firstValue?[{value:`${editing.tie.typeId}${mine?'':':rev'}`,typeId:editing.tie.typeId,reversed:!mine,label:`${editing.label} (no longer fits)`,group:editing.type.group}]:[];
 const all=[...kept,...choices];
 const tie=editing?.tie;
 const [value,setValue]=useState(firstValue||kept[0]?.value||'');
 const [note,setNote]=useState(tie?.note??''),[since,setSince]=useState(tie?.since??''),[until,setUntil]=useState(tie?.until??'');
 const [feelThis,setFeelThis]=useState<Standing|''>((mine?tie?.feelFrom:tie?.feelTo)??''),[feelOther,setFeelOther]=useState<Standing|''>((mine?tie?.feelTo:tie?.feelFrom)??'');
 const [gm,setGm]=useState(tie?tie.gm===true:true);
 const coverStart=tie?.cover?startValue(tie.cover.typeId,!!tie.cover.reversed!==!mine):'';
 const [cover,setCover]=useState(coverStart),[coverNote,setCoverNote]=useState(tie?.cover?.note??''),[error,setError]=useState('');
 const picked=all.find(c=>c.value===value),coverPicked=choices.find(c=>c.value===cover);
 const blockGm=profile&&owner?.profile?.blocks.some(b=>b.kind==='ties'&&b.gm&&b.ties.some(x=>x.id===editing!.tie.id));
 const now=()=>new Date().toISOString();

 const save=()=>{
  if(!picked){setError('Pick a kind of tie.');return;}
  setError('');
  if(profile&&editing){
   if(change(w=>setProfileTie(w,editing.ownerId,editing.tie.id,{typeId:picked.typeId,note:note.trim(),gm},now()))!==false)onClose();
   return;
  }
  const back=picked.reversed,ownerId=back?other.id:entry.id,toId=back?entry.id:other.id;
  const from=back?feelOther:feelThis,to=back?feelThis:feelOther;
  const next:Tie={id:tie?.id??newId(),toId,typeId:picked.typeId,
   ...(note.trim()?{note:note.trim()}:{}),...(since.trim()?{since:since.trim()}:{}),...(until.trim()?{until:until.trim()}:{}),
   ...(from?{feelFrom:from}:{}),...(to?{feelTo:to}:{}),
   ...(gm?{gm:true}:{}),
   ...(gm&&coverPicked?{cover:{typeId:coverPicked.typeId,...(coverPicked.reversed!==back?{reversed:true}:{}),...(coverNote.trim()?{note:coverNote.trim()}:{})}}:{})};
  let full=false;
  const ok=change(w=>{const out=putTie(w,ownerId,next,now(),editing?{source:editing.source,ownerId:editing.ownerId,id:editing.tie.id}:undefined);if(!out){full=true;return w;}return out;});
  if(full)setError(`${(back?other:entry).title} already has as many ties as a page can hold.`);
  else if(ok!==false)onClose();
 };
 const remove=async()=>{
  if(!editing)return;
  if(!await confirmDialog({title:`Remove “${editing.label}” ${other.title}?`,message:profile?`It comes off ${owner?.title??'the character'}’s People list too.`:'It goes from both pages.',confirm:'Remove tie',danger:true}))return;
  if(change(w=>removeTie(w,{source:editing.source,ownerId:editing.ownerId,id:editing.tie.id},now()))!==false)onClose();
 };

 return <ToolDialog title={editing?'Change tie':'Add a tie'} onClose={onClose}>
  <p className="tie-sentence"><strong>{entry.title}</strong><span className={`qc-reason ${picked?tieTone(picked.group):''}`}>{picked?.label??'…'}</span><strong>{other.title}</strong></p>
  {!all.length?<div className="tie-none"><p className="modal-intro">No kind of tie fits these two pages yet.</p><button type="button" className="button small" onClick={onKinds}><ListTree size={14}/> Kinds of tie</button></div>
  :<form className="details-form tie-form" onSubmit={e=>{e.preventDefault();save();}}>
   <div className="tie-kind-row"><KindSelect label="Kind of tie" choices={all} value={value} onChange={setValue}/><button type="button" className="text-button" onClick={onKinds}><ListTree size={13}/> Kinds of tie</button></div>
   {profile&&<p className="modal-intro tie-hint">This tie is on {owner?.id===entry.id?'this':`${owner?.title??'a'}’s`} Profile, in the People list. Change who it points at there.</p>}
   <label>Note<textarea rows={3} maxLength={300} value={note} placeholder="What lies between them" onChange={e=>setNote(e.target.value)}/></label>
   {!profile&&<>
    <div className="tie-pair"><label>Since<input maxLength={40} value={since} placeholder="A year or a date" onChange={e=>setSince(e.target.value)}/></label><label>Until<input maxLength={40} value={until} placeholder="Still so" onChange={e=>setUntil(e.target.value)}/></label></div>
    <div className="tie-pair"><Feeling label={`How ${entry.title} feels`} value={feelThis} onChange={setFeelThis}/><Feeling label={`How ${other.title} feels`} value={feelOther} onChange={setFeelOther}/></div>
   </>}
   <fieldset className="tie-share"><legend>Who sees it</legend>
    <div className="segmented" role="radiogroup" aria-label="Who sees it">
     <button type="button" role="radio" aria-checked={!gm} className={!gm?'on':''} onClick={()=>setGm(false)}><Eye size={13}/> Players too</button>
     <button type="button" role="radio" aria-checked={gm} className={gm?'on':''} onClick={()=>setGm(true)}><EyeOff size={13}/> GM only</button>
    </div>
    {profile&&blockGm&&!gm&&<p className="tie-hint">The People list it is in is GM only, so players still won’t see it.</p>}
    {!gm&&<p className="tie-hint">Players see it on both pages once they can read both.</p>}
   </fieldset>
   {gm&&!profile&&<fieldset className="tie-cover"><legend>Cover story</legend>
    <p className="tie-hint">What players believe instead. Leave it empty and players see nothing.</p>
    <KindSelect label="Players think it is" choices={choices} value={cover} onChange={setCover} none="Nothing"/>
    {cover&&<label>What players are told<textarea rows={2} maxLength={300} value={coverNote} onChange={e=>setCoverNote(e.target.value)}/></label>}
   </fieldset>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="tie-buttons">
    {editing&&<button type="button" className="button small tie-remove" onClick={remove}><Trash2 size={14}/> Remove tie</button>}
    <button type="button" className="button small" onClick={onClose}>Cancel</button>
    <button type="submit" className="button small primary">{editing?'Save tie':'Add tie'}</button>
   </div>
  </form>}
 </ToolDialog>;
}
