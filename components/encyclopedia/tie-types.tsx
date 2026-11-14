"use client";
/*
 * Kinds of tie: the built-in kinds in their groups, which the GM can rename or narrow, and the GM's own kinds (Sails
 * from, Haunts, Sworn to…). A kind has a name each way, the kinds of page it joins, and how it draws on a family tree.
 * A renamed built-in kind can go back to how it ships; a kind the GM made can be deleted once no tie uses it.
 */
import {useMemo,useState} from 'react';
import {Pencil,Plus,RotateCcw,Trash2} from 'lucide-react';
import {newId,type World,type Workspace} from '@/lib/encyclopedia/world-model';
import {builtInTieTypes,isBuiltInTieType,maxTieTypes,tieGroupInfo,tieGroups,tiePageKindNames,tiePageKinds,tieTypesOf,treeRoleNames,treeRoles,type TieGroup,type TiePageKind,type TieType,type TreeRole} from '@/lib/encyclopedia/ties';
import {tieTypeUse} from '@/lib/encyclopedia/tie-connections';
import {dropTieType,saveTieType} from '@/lib/encyclopedia/tie-edit';
import {ToolDialog} from './tool-dialog';
import {confirmDialog} from '../confirm-dialog';
import {tieTone} from './connection-list';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
const kindsText=(list:readonly TiePageKind[])=>list.length===tiePageKinds.length?'any page':list.map(k=>tiePageKindNames[k].toLowerCase()).join(', ');

function KindPicks({legend,value,onChange}:{legend:string;value:TiePageKind[];onChange:(v:TiePageKind[])=>void}){
 return <fieldset className="tie-page-kinds"><legend>{legend}</legend>{tiePageKinds.map(k=><label key={k}><input type="checkbox" checked={value.includes(k)} onChange={e=>onChange(e.target.checked?tiePageKinds.filter(x=>x===k||value.includes(x)):value.filter(x=>x!==k))}/>{tiePageKindNames[k]}</label>)}</fieldset>;
}

function KindEditor({start,onSave,onCancel}:{start:TieType;onSave:(t:TieType)=>void;onCancel:()=>void}){
 const [name,setName]=useState(start.name),[both,setBoth]=useState(!!start.both),[reverse,setReverse]=useState(start.reverse??'');
 const [group,setGroup]=useState<TieGroup>(start.group),[from,setFrom]=useState<TiePageKind[]>(start.from),[to,setTo]=useState<TiePageKind[]>(start.to),[tree,setTree]=useState<TreeRole|''>(start.tree??'');
 const [error,setError]=useState('');
 const save=()=>{
  if(!name.trim())return setError('Give it a name.');
  if(!from.length||!to.length)return setError('Pick at least one kind of page at each end.');
  onSave({id:start.id,name:name.trim().slice(0,40),...(both||!reverse.trim()?{both:true}:{reverse:reverse.trim().slice(0,40)}),group,from,to,...(tree?{tree}:{}),...(start.custom?{custom:true}:{})});
 };
 return <form className="details-form tie-kind-editor" onSubmit={e=>{e.preventDefault();save();}}>
  <div className="tie-pair"><label>Name<input autoFocus required maxLength={40} value={name} placeholder="For example Sails from" onChange={e=>setName(e.target.value)}/></label>
   <label>From the other page<input maxLength={40} value={both?'':reverse} disabled={both} placeholder={both?'Reads the same both ways':'For example Port of'} onChange={e=>setReverse(e.target.value)}/></label></div>
  <label className="tie-check"><input type="checkbox" checked={both} onChange={e=>setBoth(e.target.checked)}/>Reads the same both ways (Rival of, Married to)</label>
  <div className="tie-pair"><label>Group<select value={group} onChange={e=>setGroup(e.target.value as TieGroup)}>{tieGroups.map(g=><option key={g} value={g}>{tieGroupInfo[g].name}</option>)}</select></label>
   <label>On a family tree<select value={tree} onChange={e=>setTree(e.target.value as TreeRole|'')}><option value="">Not drawn</option>{treeRoles.map(r=><option key={r} value={r}>{treeRoleNames[r]}</option>)}</select></label></div>
  <KindPicks legend="It starts from" value={from} onChange={setFrom}/>
  <KindPicks legend="It goes to" value={to} onChange={setTo}/>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="tie-buttons"><button type="button" className="button small" onClick={onCancel}>Cancel</button><button type="submit" className="button small primary">Save kind</button></div>
 </form>;
}

export function TieKinds({world,data,change,onClose}:{world:World;data:Workspace;change:Change;onClose:()=>void}){
 const types=useMemo(()=>tieTypesOf(world),[world]),use=useMemo(()=>tieTypeUse(data,world.id),[data,world.id]);
 const [editing,setEditing]=useState<TieType|null>(null);
 const saved=new Set((world.tieTypes??[]).map(t=>t.id)),full=(world.tieTypes?.length??0)>=maxTieTypes;
 const save=(t:TieType)=>{if(change(w=>saveTieType(w,world.id,t))!==false)setEditing(null);};
 const drop=async(t:TieType)=>{
  const custom=!isBuiltInTieType(t.id);
  if(!await confirmDialog(custom?{title:`Delete “${t.name}”?`,confirm:'Delete kind',danger:true}:{title:`Put “${t.name}” back as it ships?`,message:`It becomes ${builtInTieTypes.find(b=>b.id===t.id)?.name} again, joining the pages it did at first.`,confirm:'Put it back'}))return;
  change(w=>dropTieType(w,world.id,t.id));
 };
 return <ToolDialog title="Kinds of tie" wide onClose={onClose}>
  <p className="modal-intro">The kinds of tie this world offers, named from each end. Rename a built-in kind to fit your setting, or make your own for anything that joins two pages.</p>
  {editing?<KindEditor key={editing.id} start={editing} onSave={save} onCancel={()=>setEditing(null)}/>
  :<>
   <div className="tie-kinds-top"><button type="button" className="button small primary" disabled={full} onClick={()=>setEditing({id:newId(),name:'',both:true,group:'other',from:[...tiePageKinds],to:[...tiePageKinds],custom:true})}><Plus size={14}/> New kind</button>{full&&<span className="muted">A world can keep {maxTieTypes} changed or new kinds.</span>}</div>
   <div className="tie-kinds">{tieGroups.map(g=>{const list=types.filter(t=>t.group===g);return list.length?<section key={g} className="tie-kind-group">
    <h3 className={tieTone(g)}><i aria-hidden="true"/>{tieGroupInfo[g].name} <small>{tieGroupInfo[g].about}</small></h3>
    <ul>{list.map(t=>{const n=use.get(t.id)??0,custom=!isBuiltInTieType(t.id),changed=!custom&&saved.has(t.id);
     return <li key={t.id} className="tie-kind">
      <span className="tie-kind-name"><strong>{t.name}</strong>{!t.both&&t.reverse&&<small>/ {t.reverse}</small>}{custom&&<em>Yours</em>}{changed&&<em>Changed</em>}</span>
      <span className="tie-kind-pages">{kindsText(t.from)} → {kindsText(t.to)}{t.tree?' · on family trees':''}</span>
      <span className="tie-kind-use">{n?`${n} tie${n===1?'':'s'}`:'Unused'}</span>
      <span className="tie-kind-tools">
       <button type="button" className="icon-button" aria-label={`Change ${t.name}`} title="Change" onClick={()=>setEditing(t)}><Pencil size={14}/></button>
       {changed&&<button type="button" className="icon-button" aria-label={`Put ${t.name} back as it ships`} title="Put back as it ships" onClick={()=>drop(t)}><RotateCcw size={14}/></button>}
       {custom&&<button type="button" className="icon-button" aria-label={`Delete ${t.name}`} title={n?`${n} tie${n===1?' uses':'s use'} it. Change or remove them first.`:'Delete'} disabled={n>0} onClick={()=>drop(t)}><Trash2 size={14}/></button>}
      </span>
     </li>;})}</ul>
   </section>:null;})}</div>
  </>}
 </ToolDialog>;
}
