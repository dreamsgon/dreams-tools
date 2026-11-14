'use client';
import {useRef,useState,type DragEvent} from 'react';
import {ArrowDown,ArrowLeftRight,ArrowUp,Check,Eye,EyeOff,GripVertical,LayoutGrid,Pencil,Plus,Trash2,X} from 'lucide-react';
import {compareEntries,defaultCharacter,newId,playerCampaign,type Campaign,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {addOrgType,applyOrgLayout,blockHasContent,blockKindInfo,blockKinds,boardSegments,defaultOrg,layoutOf,maxBarFields,maxBlocks,maxMembers,maxPeople,maxSpots,moveBlockBy,newBlock,orgMembersOf,orgOf,placeBlock,singleBlockKinds,standingNames,standings,switchColumn,type BlockKind,type BlockOf,type Org,type OrgBlock,type Standing} from '@/lib/encyclopedia/org-profile';
import {confirmDialog} from '../confirm-dialog';
import {memberRef} from './member-view';
import {ToolDialog} from './tool-dialog';
import {BottomBar,GmChip,OrgBanner,OrgReadOnly,PageLink,PersonLine,Stack} from './org-parts';
import {OrgPanel} from './org-panel';
import {PagePicker} from './org-picker';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
type Props={entry:Entry;data:Workspace;campaign?:Campaign;change:Change;onOpen:(id:string)=>void;onRename:()=>void;/** Pages that mention this one (the article's MENTIONED IN). */linked:Entry[]};

/** What every kind of block needs from the page. */
type Ctx={
 entry:Entry;data:Workspace;open:(id:string)=>void;
 patch:<K extends BlockKind>(id:string,kind:K,f:(b:BlockOf<K>)=>BlockOf<K>)=>void;
 title:(id:string)=>string;
 picker:string|null;setPicker:(key:string|null)=>void;editing:string|null;setEditing:(id:string|null)=>void;
 /** Makes a new NPC page and then lets `add` put it on the profile in the same save. */
 createNpc:(name:string,add:(o:Org,id:string)=>Org)=>void;
 linked:Entry[];askSubgroup:()=>void;
};

const stand=(value:string):Standing|undefined=>(standings as readonly string[]).includes(value)?value as Standing:undefined;
const StandingSelect=({value,onChange,label='Standing'}:{value?:Standing;onChange:(s:Standing|undefined)=>void;label?:string})=><select className="org-select" aria-label={label} value={value??''} onChange={e=>onChange(stand(e.target.value))}><option value="">No standing</option>{standings.map(s=><option key={s} value={s}>{standingNames[s]}</option>)}</select>;

/** Edit, GM only and remove for one item. */
function ItemTools({gm,editing,what,onEdit,onGm,onRemove}:{gm?:boolean;editing?:boolean;what:string;onEdit?:()=>void;onGm:()=>void;onRemove:()=>void}){
 return <span className="org-item-tools">
  {onEdit&&<button type="button" className="icon-button" aria-label={`${editing?'Finish editing':'Edit'} ${what}`} aria-pressed={editing} onClick={onEdit}>{editing?<Check size={13}/>:<Pencil size={13}/>}</button>}
  <button type="button" className="icon-button" aria-label={gm?`Show ${what} to players`:`Make ${what} GM only`} aria-pressed={!!gm} title={gm?'GM only: click to share with players':'Click to make this GM only'} onClick={onGm}>{gm?<EyeOff size={13}/>:<Eye size={13}/>}</button>
  <button type="button" className="icon-button" aria-label={`Remove ${what}`} onClick={onRemove}><Trash2 size={13}/></button>
 </span>;
}

/* ---- Block bodies ---- */

function SpotsBody({b,ctx}:{b:BlockOf<'spots'>;ctx:Ctx}){
 const [adding,setAdding]=useState(''),[open,setOpen]=useState(false);
 const set=(f:(s:BlockOf<'spots'>['spots'])=>BlockOf<'spots'>['spots'])=>ctx.patch(b.id,'spots',x=>({...x,spots:f(x.spots)}));
 const addSpot=()=>{if(b.spots.length>=maxSpots)return;const id=newId();set(s=>[...s,{id,title:adding.trim().slice(0,80),people:[]}]);setAdding('');setOpen(false);};
 return <>
  {b.spots.map(s=>{const key=`${b.id}:${s.id}`;return <div className={`org-spot org-item${s.gm?' is-gm':''}`} key={s.id}>
   <div className="org-spot-head">{ctx.editing===s.id?<input className="org-input" aria-label="Spot title" autoFocus maxLength={80} value={s.title} onChange={e=>set(l=>l.map(x=>x.id===s.id?{...x,title:e.target.value}:x))}/>:<h4>{s.title||'Untitled spot'}</h4>}{s.gm&&<GmChip/>}
    <ItemTools gm={s.gm} editing={ctx.editing===s.id} what={`the spot ${s.title||''}`} onEdit={()=>ctx.setEditing(ctx.editing===s.id?null:s.id)} onGm={()=>set(l=>l.map(x=>x.id===s.id?{...x,gm:x.gm?undefined:true}:x))} onRemove={()=>set(l=>l.filter(x=>x.id!==s.id))}/></div>
   {s.people.map(p=><div className={`org-item${p.gm?' is-gm':''}`} key={p.id}>{ctx.editing===p.id
    ?<div className="org-edit-row"><strong>{ctx.title(p.entryId)||'Missing page'}</strong><input className="org-input" aria-label="Note" placeholder="A note about them" maxLength={200} autoFocus value={p.note??''} onChange={e=>set(l=>l.map(x=>x.id===s.id?{...x,people:x.people.map(y=>y.id===p.id?{...y,note:e.target.value||undefined}:y)}:x))}/><StandingSelect value={p.standing} onChange={standing=>set(l=>l.map(x=>x.id===s.id?{...x,people:x.people.map(y=>y.id===p.id?{...y,standing}:y)}:x))}/>
      <ItemTools gm={p.gm} editing what={`${ctx.title(p.entryId)}`} onEdit={()=>ctx.setEditing(null)} onGm={()=>set(l=>l.map(x=>x.id===s.id?{...x,people:x.people.map(y=>y.id===p.id?{...y,gm:y.gm?undefined:true}:y)}:x))} onRemove={()=>set(l=>l.map(x=>x.id===s.id?{...x,people:x.people.filter(y=>y.id!==p.id)}:x))}/></div>
    :<PersonLine id={p.entryId} title={ctx.title(p.entryId)} note={p.note} standing={p.standing} gm={p.gm} open={ctx.open}><ItemTools gm={p.gm} what={ctx.title(p.entryId)} onEdit={()=>ctx.setEditing(p.id)} onGm={()=>set(l=>l.map(x=>x.id===s.id?{...x,people:x.people.map(y=>y.id===p.id?{...y,gm:y.gm?undefined:true}:y)}:x))} onRemove={()=>set(l=>l.map(x=>x.id===s.id?{...x,people:x.people.filter(y=>y.id!==p.id)}:x))}/></PersonLine>}</div>)}
   <div className="org-add-wrap"><button type="button" className="text-button" disabled={s.people.length>=maxPeople} onClick={()=>ctx.setPicker(ctx.picker===key?null:key)}><Plus size={13}/> Add person</button>
    {ctx.picker===key&&<PagePicker characters label={`Add a person to ${s.title||'this spot'}`} data={ctx.data} org={ctx.entry} exclude={s.people.map(p=>p.entryId)} onClose={()=>ctx.setPicker(null)}
     onChoose={(entryId,standing)=>{const id=newId();set(l=>l.map(x=>x.id===s.id?{...x,people:[...x.people,{id,entryId,standing}]}:x));ctx.setPicker(null);ctx.setEditing(id);}}
     onCreate={(name,standing)=>{const id=newId();ctx.createNpc(name,(o,npc)=>({...o,blocks:o.blocks.map(x=>x.id===b.id&&x.kind==='spots'?{...x,spots:x.spots.map(y=>y.id===s.id?{...y,people:[...y.people,{id,entryId:npc,standing}]}:y)}:x)}));ctx.setPicker(null);ctx.setEditing(id);}}/>}</div>
  </div>;})}
  {!b.spots.length&&<p className="org-empty">No spots yet. Add one for each role you want to keep track of.</p>}
  {open?<form className="org-inline-form" onSubmit={e=>{e.preventDefault();addSpot();}}><input className="org-input" aria-label="Spot title" autoFocus maxLength={80} placeholder="For example Warden-Captains" value={adding} onChange={e=>setAdding(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}/><button className="button small primary" type="submit">Add</button><button className="button small" type="button" onClick={()=>setOpen(false)}>Cancel</button></form>
   :<button type="button" className="text-button org-add" disabled={b.spots.length>=maxSpots} onClick={()=>setOpen(true)}><Plus size={13}/> Add a spot{b.spots.length>=maxSpots?` (up to ${maxSpots})`:''}</button>}
 </>;
}

function MembersBody({b,ctx}:{b:BlockOf<'members'>;ctx:Ctx}){
 const set=(f:(m:BlockOf<'members'>['members'])=>BlockOf<'members'>['members'])=>ctx.patch(b.id,'members',x=>({...x,members:f(x.members)}));
 const key=b.id;
 return <>
  {b.members.map(m=><div className={`org-item${m.gm?' is-gm':''}`} key={m.id}>{ctx.editing===m.id
   ?<div className="org-edit-row"><strong>{ctx.title(m.entryId)||'Missing page'}</strong><input className="org-input" aria-label="Role" placeholder="Role, for example Ferry-warden" maxLength={80} autoFocus value={m.role??''} onChange={e=>set(l=>l.map(x=>x.id===m.id?{...x,role:e.target.value||undefined}:x))}/><StandingSelect value={m.standing} onChange={standing=>set(l=>l.map(x=>x.id===m.id?{...x,standing}:x))}/>
     <ItemTools gm={m.gm} editing what={ctx.title(m.entryId)} onEdit={()=>ctx.setEditing(null)} onGm={()=>set(l=>l.map(x=>x.id===m.id?{...x,gm:x.gm?undefined:true}:x))} onRemove={()=>set(l=>l.filter(x=>x.id!==m.id))}/></div>
   :<PersonLine id={m.entryId} title={ctx.title(m.entryId)} role={m.role} standing={m.standing} gm={m.gm} open={ctx.open}><ItemTools gm={m.gm} what={ctx.title(m.entryId)} onEdit={()=>ctx.setEditing(m.id)} onGm={()=>set(l=>l.map(x=>x.id===m.id?{...x,gm:x.gm?undefined:true}:x))} onRemove={()=>set(l=>l.filter(x=>x.id!==m.id))}/></PersonLine>}</div>)}
  {!b.members.length&&<p className="org-empty">No members yet.</p>}
  <div className="org-add-wrap"><button type="button" className="text-button org-add" disabled={b.members.length>=maxMembers} onClick={()=>ctx.setPicker(ctx.picker===key?null:key)}><Plus size={13}/> Add</button>
   {ctx.picker===key&&<PagePicker characters label="Add a member" data={ctx.data} org={ctx.entry} exclude={b.members.map(m=>m.entryId)} onClose={()=>ctx.setPicker(null)}
    onChoose={(entryId,standing)=>{const id=newId();set(l=>[...l,{id,entryId,standing}]);ctx.setPicker(null);ctx.setEditing(id);}}
    onCreate={(name,standing)=>{const id=newId();ctx.createNpc(name,(o,npc)=>({...o,blocks:o.blocks.map(x=>x.id===b.id&&x.kind==='members'?{...x,members:[...x.members,{id,entryId:npc,standing}]}:x)}));ctx.setPicker(null);ctx.setEditing(id);}}/>}</div>
 </>;
}

function FactsBody({b,ctx}:{b:BlockOf<'facts'>;ctx:Ctx}){
 const set=(f:(m:BlockOf<'facts'>['facts'])=>BlockOf<'facts'>['facts'])=>ctx.patch(b.id,'facts',x=>({...x,facts:f(x.facts)}));
 const add=()=>{const id=newId();set(l=>[...l,{id,label:'',value:''}]);ctx.setEditing(id);};
 return <>
  {b.facts.length>0&&<dl className="org-facts">{b.facts.map(f=>{const key=`${b.id}:${f.id}`;return ctx.editing===f.id
   ?<div key={f.id} className="org-fact-edit org-item"><input className="org-input" aria-label="Label" placeholder="Label" maxLength={60} autoFocus value={f.label} onChange={e=>set(l=>l.map(x=>x.id===f.id?{...x,label:e.target.value}:x))}/><input className="org-input" aria-label="Value" placeholder="Value" maxLength={200} value={f.value} onChange={e=>set(l=>l.map(x=>x.id===f.id?{...x,value:e.target.value}:x))}/>
     <div className="org-add-wrap"><button type="button" className="text-button" onClick={()=>ctx.setPicker(ctx.picker===key?null:key)}>{f.entryId?`Linked to ${ctx.title(f.entryId)||'a missing page'}`:'Link a page'}</button>{f.entryId&&<button type="button" className="text-button" onClick={()=>set(l=>l.map(x=>x.id===f.id?{...x,entryId:undefined}:x))}>Unlink</button>}
      {ctx.picker===key&&<PagePicker characters={false} label="Link a page" data={ctx.data} org={ctx.entry} onClose={()=>ctx.setPicker(null)} onChoose={entryId=>{set(l=>l.map(x=>x.id===f.id?{...x,entryId}:x));ctx.setPicker(null);}}/>}</div>
     <ItemTools gm={f.gm} editing what={f.label||'this fact'} onEdit={()=>ctx.setEditing(null)} onGm={()=>set(l=>l.map(x=>x.id===f.id?{...x,gm:x.gm?undefined:true}:x))} onRemove={()=>set(l=>l.filter(x=>x.id!==f.id))}/></div>
   :<div key={f.id} className={`org-item${f.gm?' is-gm':''}`}><dt>{f.label||'Untitled'}{f.gm&&<GmChip/>}</dt><dd>{f.entryId?<PageLink id={f.entryId} open={ctx.open}>{f.value||ctx.title(f.entryId)||'Missing page'}</PageLink>:f.value||<span className="org-blank">Not set</span>}<ItemTools gm={f.gm} what={f.label||'this fact'} onEdit={()=>ctx.setEditing(f.id)} onGm={()=>set(l=>l.map(x=>x.id===f.id?{...x,gm:x.gm?undefined:true}:x))} onRemove={()=>set(l=>l.filter(x=>x.id!==f.id))}/></dd></div>;})}</dl>}
  {!b.facts.length&&<p className="org-empty">No facts yet.</p>}
  <button type="button" className="text-button org-add" disabled={b.facts.length>=30} onClick={add}><Plus size={13}/> Add</button>
 </>;
}

function BeliefsBody({b,ctx}:{b:BlockOf<'beliefs'>;ctx:Ctx}){
 const set=(f:(m:BlockOf<'beliefs'>['beliefs'])=>BlockOf<'beliefs'>['beliefs'])=>ctx.patch(b.id,'beliefs',x=>({...x,beliefs:f(x.beliefs)}));
 const add=()=>{const id=newId();set(l=>[...l,{id,topic:'',stance:'',detail:''}]);ctx.setEditing(id);};
 return <>
  {b.beliefs.map(x=>ctx.editing===x.id
   ?<div className="org-belief org-item" key={x.id}><input className="org-input" aria-label="Topic" placeholder="Topic, for example Authority" maxLength={60} autoFocus value={x.topic} onChange={e=>set(l=>l.map(y=>y.id===x.id?{...y,topic:e.target.value}:y))}/><input className="org-input" aria-label="Stance" placeholder="Stance, for example Earned by service" maxLength={100} value={x.stance} onChange={e=>set(l=>l.map(y=>y.id===x.id?{...y,stance:e.target.value}:y))}/><textarea className="org-input" aria-label="Detail" placeholder="A sentence of detail" maxLength={400} rows={2} value={x.detail} onChange={e=>set(l=>l.map(y=>y.id===x.id?{...y,detail:e.target.value}:y))}/>
     <ItemTools gm={x.gm} editing what={x.topic||'this belief'} onEdit={()=>ctx.setEditing(null)} onGm={()=>set(l=>l.map(y=>y.id===x.id?{...y,gm:y.gm?undefined:true}:y))} onRemove={()=>set(l=>l.filter(y=>y.id!==x.id))}/></div>
   :<div className={`org-belief org-item${x.gm?' is-gm':''}`} key={x.id}><span className="org-belief-topic">{x.topic||'Untitled'}{x.gm&&<GmChip/>}</span><strong>{x.stance||<span className="org-blank">No stance yet</span>}</strong>{x.detail&&<p>{x.detail}</p>}<ItemTools gm={x.gm} what={x.topic||'this belief'} onEdit={()=>ctx.setEditing(x.id)} onGm={()=>set(l=>l.map(y=>y.id===x.id?{...y,gm:y.gm?undefined:true}:y))} onRemove={()=>set(l=>l.filter(y=>y.id!==x.id))}/></div>)}
  {!b.beliefs.length&&<p className="org-empty">No beliefs yet.</p>}
  <button type="button" className="text-button org-add" disabled={b.beliefs.length>=20} onClick={add}><Plus size={13}/> Add</button>
 </>;
}

function HoldingsBody({b,ctx}:{b:BlockOf<'holdings'>;ctx:Ctx}){
 const set=(f:(m:BlockOf<'holdings'>['holdings'])=>BlockOf<'holdings'>['holdings'])=>ctx.patch(b.id,'holdings',x=>({...x,holdings:f(x.holdings)}));
 const key=b.id,kind=(id:string)=>ctx.data.entries.find(e=>e.id===id)?.kind;
 return <>
  {b.holdings.map(h=><div className={`org-holding org-item${h.gm?' is-gm':''}`} key={h.id}><PageLink id={h.entryId} open={ctx.open}>{ctx.title(h.entryId)||'Missing page'}</PageLink><small>{kind(h.entryId)==='faction'?'organization':kind(h.entryId)}</small>{h.gm&&<GmChip/>}<ItemTools gm={h.gm} what={ctx.title(h.entryId)||'this holding'} onGm={()=>set(l=>l.map(x=>x.id===h.id?{...x,gm:x.gm?undefined:true}:x))} onRemove={()=>set(l=>l.filter(x=>x.id!==h.id))}/></div>)}
  {!b.holdings.length&&<p className="org-empty">No pages yet. Pick the places, ships and notes they own.</p>}
  <div className="org-add-wrap"><button type="button" className="text-button org-add" disabled={b.holdings.length>=40} onClick={()=>ctx.setPicker(ctx.picker===key?null:key)}><Plus size={13}/> Add</button>
   {ctx.picker===key&&<PagePicker characters={false} label="Add a page they own" data={ctx.data} org={ctx.entry} exclude={b.holdings.map(h=>h.entryId)} onClose={()=>ctx.setPicker(null)} onChoose={entryId=>{set(l=>[...l,{id:newId(),entryId}]);ctx.setPicker(null);}}/>}</div>
 </>;
}

function TextBody({b,ctx}:{b:BlockOf<'text'>;ctx:Ctx}){
 const editing=ctx.editing===b.id;
 return editing
  ?<><textarea className="org-input" aria-label={b.title||'Text'} rows={4} maxLength={4000} autoFocus value={b.text} placeholder="Write a paragraph…" onChange={e=>ctx.patch(b.id,'text',x=>({...x,text:e.target.value}))}/><button type="button" className="text-button org-add" onClick={()=>ctx.setEditing(null)}><Check size={13}/> Done</button></>
  :<>{b.text.trim()?<p className="org-text">{b.text}</p>:<p className="org-empty">Nothing written yet.</p>}<button type="button" className="text-button org-add" onClick={()=>ctx.setEditing(b.id)}><Pencil size={13}/> Edit</button></>;
}

function SubgroupsBody({ctx}:{ctx:Ctx}){
 const kids=ctx.data.entries.filter(e=>e.parentId===ctx.entry.id&&e.kind==='faction').sort(compareEntries);
 return <>
  {kids.length>0&&<div className="org-subgroups">{kids.map(k=><button type="button" key={k.id} className="org-subgroup" onClick={()=>ctx.open(k.id)}><strong>{k.title}</strong><Stack people={orgMembersOf(k.org).map(id=>({id,title:ctx.title(id)})).filter(p=>p.title)}/></button>)}</div>}
  {!kids.length&&<p className="org-empty">No subgroups yet. A subgroup is an organization page inside this one.</p>}
  <button type="button" className="text-button org-add" onClick={ctx.askSubgroup}><Plus size={13}/> Subgroup</button>
 </>;
}

function LinkedBody({ctx}:{ctx:Ctx}){
 return <>{ctx.linked.map(e=><div className="org-holding" key={e.id}><PageLink id={e.id} open={ctx.open}>{e.title}</PageLink><small>{e.kind==='faction'?'organization':e.kind}</small></div>)}{!ctx.linked.length&&<p className="org-empty">No pages mention this organization yet. Link it with [[ in any page’s text.</p>}</>;
}

/* ---- One block, with its Arrange controls ---- */

type Arrange={
 on:boolean;dragId:string|null;overId:string|null;renaming:string|null;
 setRenaming:(id:string|null)=>void;setDrag:(id:string|null)=>void;setOver:(id:string|null)=>void;
 edit:(id:string,f:(b:OrgBlock)=>OrgBlock)=>void;remove:(b:OrgBlock)=>void;move:(id:string,dir:-1|1)=>void;canMove:(id:string,dir:-1|1)=>boolean;
 side:(id:string)=>void;drop:(beforeId:string|null,column?:'left'|'right')=>void;
};

function Block({b,ctx,arrange}:{b:OrgBlock;ctx:Ctx;arrange:Arrange}){
 const on=arrange.on,info=blockKindInfo[b.kind],dragging=arrange.dragId===b.id,over=arrange.overId===b.id&&arrange.dragId!==b.id;
 const name=b.title||info.name;
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
  <div className="org-block-body" inert={on||undefined}>
   {b.kind==='spots'&&<SpotsBody b={b} ctx={ctx}/>}{b.kind==='members'&&<MembersBody b={b} ctx={ctx}/>}{b.kind==='facts'&&<FactsBody b={b} ctx={ctx}/>}
   {b.kind==='beliefs'&&<BeliefsBody b={b} ctx={ctx}/>}{b.kind==='holdings'&&<HoldingsBody b={b} ctx={ctx}/>}{b.kind==='text'&&<TextBody b={b} ctx={ctx}/>}
   {b.kind==='subgroups'&&<SubgroupsBody ctx={ctx}/>}{b.kind==='linked'&&<LinkedBody ctx={ctx}/>}
  </div>
 </section>;
}

/* ---- The bottom bar, editable ---- */

function BarEditor({org,setOrg,onDone}:{org:Org;setOrg:(f:(o:Org)=>Org)=>void;onDone:()=>void}){
 const setField=(id:string,patch:Partial<Org['bar']['fields'][number]>)=>setOrg(o=>({...o,bar:{...o.bar,fields:o.bar.fields.map(f=>f.id===id?{...f,...patch}:f)}}));
 return <section className="org-bar is-editing" aria-label="Change this bar">
  <div className="org-bar-title"><label className="org-bar-name">Bar name<input className="org-input" aria-label="Bar name" maxLength={40} value={org.bar.title} onChange={e=>setOrg(o=>({...o,bar:{...o.bar,title:e.target.value}}))}/></label>
   <span className="org-bar-buttons"><button type="button" className="button small" aria-pressed={!!org.bar.hidden} onClick={()=>setOrg(o=>({...o,bar:{...o.bar,hidden:o.bar.hidden?undefined:true}}))}>{org.bar.hidden?'Show the bar':'Hide the bar'}</button><button type="button" className="button small primary" onClick={onDone}><Check size={13}/> Done</button></span></div>
  <div className="org-bar-edit">{org.bar.fields.map(f=><div key={f.id} className={`org-bar-edit-row${f.gm?' is-gm':''}`}>
   <input className="org-input" aria-label="Field label" placeholder="Label" maxLength={40} value={f.label} onChange={e=>setField(f.id,{label:e.target.value})}/>
   <input className="org-input" aria-label={`${f.label||'Field'} value`} placeholder="A short note" maxLength={300} value={f.value} onChange={e=>setField(f.id,{value:e.target.value})}/>
   <button type="button" className="org-toggle" aria-pressed={!!f.gm} aria-label={f.gm?`${f.label||'This field'} is GM only. Show it to players`:`Make ${f.label||'this field'} GM only`} onClick={()=>setField(f.id,{gm:f.gm?undefined:true})}>{f.gm?<><EyeOff size={12}/> GM only</>:<><Eye size={12}/> Players</>}</button>
   <button type="button" className="icon-button" aria-label={`Remove ${f.label||'this field'}`} onClick={()=>setOrg(o=>({...o,bar:{...o.bar,fields:o.bar.fields.filter(x=>x.id!==f.id)}}))}><Trash2 size={13}/></button></div>)}
   <button type="button" className="text-button org-add" disabled={org.bar.fields.length>=maxBarFields} onClick={()=>setOrg(o=>({...o,bar:{...o.bar,fields:[...o.bar.fields,{id:newId(),label:'',value:''}]}}))}><Plus size={13}/> Add a field{org.bar.fields.length>=maxBarFields?` (up to ${maxBarFields})`:''}</button></div>
 </section>;
}

/** The GM's Profile tab of an organization page. */
export function OrgProfile({entry,data,campaign,change,onOpen,onRename,linked}:Props){
 const world=data.worlds.find(w=>w.id===entry.worldId),org=orgOf(entry,world),coGm=!!memberRef();
 const [arranging,setArranging]=useState(false),[scope,setScope]=useState<'one'|'world'>('one'),[panel,setPanel]=useState(false),[showPlayer,setShowPlayer]=useState(false);
 const [picker,setPicker]=useState<string|null>(null),[editing,setEditing]=useState<string|null>(null),[dragId,setDrag]=useState<string|null>(null),[overId,setOver]=useState<string|null>(null),[renaming,setRenaming]=useState<string|null>(null);
 const [addMenu,setAddMenu]=useState(false),[barEdit,setBarEdit]=useState(false),[naming,setNaming]=useState(false),[notice,setNotice]=useState('');
 const menu=useRef<HTMLDivElement>(null);
 const titleOf=(id:string)=>data.entries.find(e=>e.id===id)?.title??'';

 // Every edit goes through here: it starts from the latest saved copy and makes the profile the page's own if it was still the default.
 const setOrg=(f:(o:Org)=>Org,extra:Entry[]=[])=>change(w=>({...w,entries:[...w.entries.map(e=>e.id===entry.id?{...e,org:f(e.org??defaultOrg(w.worlds.find(x=>x.id===e.worldId))),editedBy:undefined,updatedAt:new Date().toISOString()}:e),...extra]}));
 const patch:Ctx['patch']=(id,kind,f)=>setOrg(o=>({...o,blocks:o.blocks.map(b=>b.id===id&&b.kind===kind?f(b as never) as OrgBlock:b)}));
 const createNpc:Ctx['createNpc']=(name,add)=>{const id=newId(),now=new Date().toISOString();setOrg(o=>add(o,id),[{id,worldId:entry.worldId,campaignId:entry.campaignId,parentId:null,title:name.slice(0,160),kind:'character',character:defaultCharacter(),body:'',updatedAt:now}]);};
 const ctx:Ctx={entry,data,open:onOpen,patch,title:titleOf,picker,setPicker,editing,setEditing,createNpc,linked,askSubgroup:()=>setNaming(true)};

 const edit=(id:string,f:(b:OrgBlock)=>OrgBlock)=>setOrg(o=>({...o,blocks:o.blocks.map(b=>b.id===id?f(b):b)}));
 const canMove=(id:string,dir:-1|1)=>{const next=moveBlockBy(org.blocks,id,dir);return next.some((b,i)=>b.id!==org.blocks[i].id);};
 const arrange:Arrange={on:arranging,dragId,overId,renaming,setRenaming,setDrag,setOver,edit,canMove,
  move:(id,dir)=>setOrg(o=>({...o,blocks:moveBlockBy(o.blocks,id,dir)})),side:id=>setOrg(o=>({...o,blocks:switchColumn(o.blocks,id)})),
  drop:(beforeId,column)=>{const id=dragId;setDrag(null);setOver(null);if(id)setOrg(o=>({...o,blocks:placeBlock(o.blocks,id,beforeId,column)}));},
  remove:async b=>{if(blockHasContent(b)&&!await confirmDialog({title:`Remove “${b.title||blockKindInfo[b.kind].name}”?`,message:'Everything in it is removed too.',confirm:'Remove block',danger:true}))return;setOrg(o=>({...o,blocks:o.blocks.filter(x=>x.id!==b.id)}));}};

 const addBlock=(kind:BlockKind)=>{setOrg(o=>{const left=o.blocks.filter(b=>b.column==='left'&&!b.full).length,right=o.blocks.filter(b=>b.column==='right'&&!b.full).length,b=newBlock(kind);return {...o,blocks:[...o.blocks,{...b,column:left>right?'right':'left'} as OrgBlock]};});setAddMenu(false);};
 const addSubgroup=(name:string)=>{const id=newId(),now=new Date().toISOString();change(w=>({...w,entries:[...w.entries,{id,worldId:entry.worldId,campaignId:entry.campaignId,parentId:entry.id,title:name.trim().slice(0,160),kind:'faction' as const,body:'',org:defaultOrg(w.worlds.find(x=>x.id===entry.worldId)),updatedAt:now}]}));setNaming(false);};
 async function done(){
  if(scope==='world'){
   const count=data.entries.filter(e=>e.worldId===entry.worldId&&e.kind==='faction'&&e.org&&e.id!==entry.id).length;
   if(!await confirmDialog({title:'Use this layout for every organization in this world?',message:`New organizations will start with it, and ${count} other ${count===1?'organization':'organizations'} will be rearranged to match. Each keeps its own people, facts and text.`,confirm:'Use this layout'}))return;
   if(change(w=>applyOrgLayout(w,entry.worldId,layoutOf(w.entries.find(e=>e.id===entry.id)?.org??org)))===false)return;
   setNotice(`This layout is now the default for ${world?.name??'this world'}.`);
  }
  setArranging(false);setAddMenu(false);setRenaming(null);setDrag(null);setOver(null);
 }

 const segments=boardSegments(org.blocks),over=(zone:string)=>overId===zone;
 const colDrop=(key:string,before:string|null,column:'left'|'right')=><div className={`org-col-drop${over(key)?' is-over':''}`} onDragOver={(e:DragEvent)=>{if(!dragId)return;e.preventDefault();e.stopPropagation();if(overId!==key)setOver(key);}} onDrop={(e:DragEvent)=>{if(!dragId)return;e.preventDefault();e.stopPropagation();arrange.drop(before,column);}}>Drop here</div>;
 const preview=()=>{
  const camp=campaign??data.campaigns.find(c=>c.worldId===entry.worldId);if(!camp)return null;
  try{const shared=playerCampaign({...data,entries:data.entries.map(e=>e.id===entry.id?{...e,org:{...org,visibility:'players' as const}}:e)},camp.id);return {org:shared.entries.find(e=>e.id===entry.id)?.org??null,campaign:camp.name};}catch{return null;}
 };
 const shown=showPlayer?preview():null;

 const actions=<>
  <button type="button" className="button small" aria-pressed={arranging} onClick={()=>{if(arranging)void done();else{setArranging(true);setPanel(false);setBarEdit(false);}}}><LayoutGrid size={14}/> Arrange</button>
  <button type="button" className="button small" aria-pressed={panel} onClick={()=>{setPanel(!panel);if(!panel)setArranging(false);}}><Pencil size={14}/> Edit profile</button>
  <button type="button" className="button small" onClick={()=>setShowPlayer(true)}><Eye size={14}/> Player view</button></>;

 return <div className={`org-profile${arranging?' is-arranging':''}`}>
  <OrgBanner emblem={org.emblem} banner={org.banner} type={org.type} motto={org.motto} title={entry.title} campaignName={entry.campaignId?campaign?.name:'Shared world lore'} actions={actions}
   rename={<button type="button" className="org-rename" aria-label="Rename entry" onClick={onRename}><Pencil size={16}/></button>}/>
  {org.visibility==='gm'&&<p className="org-hint">Players can’t see this tab yet. Use Tab visibility above to share it.</p>}
  {notice&&<p role="status" className="info-note">{notice}</p>}
  {arranging&&<div className="org-arrange-bar" role="region" aria-label="Arrange the profile"><p><strong>Arranging the profile.</strong> Drag blocks between the columns. ½ makes one full width.</p>
   <fieldset className="org-scope"><legend className="sr-only">Who this layout is for</legend>
    {!coGm&&<label><input type="radio" name="org-scope" checked={scope==='world'} onChange={()=>setScope('world')}/> All organizations in this world</label>}
    <label><input type="radio" name="org-scope" checked={scope==='one'||coGm} onChange={()=>setScope('one')}/> Just this one</label></fieldset>
   <button type="button" className="button small primary" onClick={()=>void done()}><Check size={14}/> Done</button></div>}
  <div className="org-board" onDragOver={e=>{if(dragId)e.preventDefault();}}>
   {segments.map((seg,i)=>'full' in seg
    ?<div className="org-row is-full" key={seg.full.id}><Block b={seg.full} ctx={ctx} arrange={arrange}/></div>
    :<div className="org-row" key={`s${i}`}>{(['left','right'] as const).map(col=><div className="org-col" key={col}>{seg[col].map(b=><Block key={b.id} b={b} ctx={ctx} arrange={arrange}/>)}{arranging&&colDrop(`${i}:${col}`,seg.endsBefore,col)}</div>)}</div>)}
   {!org.blocks.length&&<p className="org-empty org-board-empty">No blocks yet. Choose Arrange, then Add a block.</p>}
   {arranging&&dragId&&<div className={`org-col-drop org-end-drop${over('end')?' is-over':''}`} onDragOver={(e:DragEvent)=>{e.preventDefault();if(overId!=='end')setOver('end');}} onDrop={(e:DragEvent)=>{e.preventDefault();arrange.drop(null,'left');}}>Drop here to move it to the end</div>}
  </div>
  {arranging&&<div className="org-add-block" ref={menu} onKeyDown={e=>{if(e.key==='Escape'&&addMenu){e.stopPropagation();setAddMenu(false);}}}><button type="button" className="org-add-block-button" aria-expanded={addMenu} aria-haspopup="menu" disabled={org.blocks.length>=maxBlocks} onClick={()=>setAddMenu(!addMenu)}><Plus size={15}/> Add a block{org.blocks.length>=maxBlocks?` (up to ${maxBlocks})`:''}</button>
   {addMenu&&<div className="org-add-menu" role="menu" aria-label="Add a block" onKeyDown={e=>{if(e.key==='Escape')setAddMenu(false);}}>{blockKinds.map(k=>{const taken=singleBlockKinds.includes(k)&&org.blocks.some(b=>b.kind===k);return <button type="button" role="menuitem" key={k} disabled={taken} onClick={()=>addBlock(k)}><strong>{blockKindInfo[k].name}</strong><small>{taken?'Already on this page.':blockKindInfo[k].blurb}</small></button>;})}</div>}</div>}
  {barEdit
   ?<BarEditor org={org} setOrg={setOrg} onDone={()=>setBarEdit(false)}/>
   :org.bar.hidden?<p className="org-hint">The bottom bar is hidden. <button type="button" className="text-button" onClick={()=>setOrg(o=>({...o,bar:{...o.bar,hidden:undefined}}))}>Show it</button></p>
   :<BottomBar title={org.bar.title} fields={org.bar.fields.map(f=>({...f,value:f.value||'—'}))}><button type="button" className="text-button" onClick={()=>{setBarEdit(true);setArranging(false);}}><Pencil size={12}/> Change this bar</button></BottomBar>}
  {panel&&<OrgPanel org={org} title={entry.title} world={world} canEditWorld={!coGm} update={setOrg} addType={t=>{if(!coGm)change(w=>addOrgType(w,entry.worldId,t));}} onClose={()=>setPanel(false)}/>}
  {showPlayer&&<ToolDialog title="Player view" wide onClose={()=>setShowPlayer(false)}>
   <p className="modal-intro">This is how players see the profile{org.visibility==='gm'?' once you share the tab':''}. People and pages players can’t read, and anything marked GM only, are left out.</p>
   {shown?.org?<div className="org-player-preview"><OrgReadOnly org={shown.org} title={entry.title} campaignName={shown.campaign}/></div>:<p className="org-empty">There’s no campaign in this world to show the player view for yet.</p>}
  </ToolDialog>}
  {naming&&<SubgroupName onClose={()=>setNaming(false)} onSave={addSubgroup}/>}
 </div>;
}

function SubgroupName({onSave,onClose}:{onSave:(name:string)=>void;onClose:()=>void}){
 const [name,setName]=useState('');
 return <ToolDialog title="Add a subgroup" onClose={onClose}><form className="details-form" onSubmit={e=>{e.preventDefault();if(name.trim())onSave(name);}}><label>Name<input autoFocus required maxLength={160} value={name} placeholder="For example The Lantern Wardens" onChange={e=>setName(e.target.value)}/></label><p className="modal-intro">It becomes a new organization page inside this one.</p><button className="button primary" type="submit">Add subgroup</button></form></ToolDialog>;
}

