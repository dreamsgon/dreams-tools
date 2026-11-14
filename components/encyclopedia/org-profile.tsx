'use client';
import {useState} from 'react';
import {Eye,LayoutGrid,Pencil,Plus} from 'lucide-react';
import {compareEntries,defaultCharacter,newId,playerCampaign,type Campaign,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {addOrgType,applyOrgLayout,blockHasContent,blockKindInfo,blockKinds,defaultOrg,layoutOf,maxMembers,maxPeople,maxSpots,moveBlockBy,newBlock,orgMembersOf,orgOf,placeBlock,singleBlockKinds,switchColumn,type BlockKind,type BlockOf,type Org,type OrgBlock} from '@/lib/encyclopedia/org-profile';
import {confirmDialog} from '../confirm-dialog';
import {memberRef} from './member-view';
import {ToolDialog} from './tool-dialog';
import {BottomBar,GmChip,OrgBanner,OrgReadOnly,PageLink,PersonLine,Stack} from './org-parts';
import {AddBlockMenu,ArrangeBar,BarEditor,BeliefsList,Board,BlockFrame,ItemTools,StandingSelect,TextBlockBody,type Arrange} from './profile-board';
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
 return <BeliefsList items={b.beliefs} editing={ctx.editing} setEditing={ctx.setEditing} set={f=>ctx.patch(b.id,'beliefs',x=>({...x,beliefs:f(x.beliefs)}))}/>;
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
 return <TextBlockBody title={b.title} text={b.text} editing={ctx.editing===b.id} setEditing={on=>ctx.setEditing(on?b.id:null)} onChange={text=>ctx.patch(b.id,'text',x=>({...x,text}))}/>;
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

function Block({b,ctx,arrange}:{b:OrgBlock;ctx:Ctx;arrange:Arrange<OrgBlock>}){
 return <BlockFrame b={b} name={b.title||blockKindInfo[b.kind].name} arrange={arrange}>
  {b.kind==='spots'&&<SpotsBody b={b} ctx={ctx}/>}{b.kind==='members'&&<MembersBody b={b} ctx={ctx}/>}{b.kind==='facts'&&<FactsBody b={b} ctx={ctx}/>}
  {b.kind==='beliefs'&&<BeliefsBody b={b} ctx={ctx}/>}{b.kind==='holdings'&&<HoldingsBody b={b} ctx={ctx}/>}{b.kind==='text'&&<TextBody b={b} ctx={ctx}/>}
  {b.kind==='subgroups'&&<SubgroupsBody ctx={ctx}/>}{b.kind==='linked'&&<LinkedBody ctx={ctx}/>}
 </BlockFrame>;
}

/** The GM's Profile tab of an organization page. */
export function OrgProfile({entry,data,campaign,change,onOpen,onRename,linked}:Props){
 const world=data.worlds.find(w=>w.id===entry.worldId),org=orgOf(entry,world),coGm=!!memberRef();
 const [arranging,setArranging]=useState(false),[scope,setScope]=useState<'one'|'world'>('one'),[panel,setPanel]=useState(false),[showPlayer,setShowPlayer]=useState(false);
 const [picker,setPicker]=useState<string|null>(null),[editing,setEditing]=useState<string|null>(null),[dragId,setDrag]=useState<string|null>(null),[overId,setOver]=useState<string|null>(null),[renaming,setRenaming]=useState<string|null>(null);
 const [barEdit,setBarEdit]=useState(false),[naming,setNaming]=useState(false),[notice,setNotice]=useState('');
 const titleOf=(id:string)=>data.entries.find(e=>e.id===id)?.title??'';

 // Every edit goes through here: it starts from the latest saved copy and makes the profile the page's own if it was still the default.
 const setOrg=(f:(o:Org)=>Org,extra:Entry[]=[])=>change(w=>({...w,entries:[...w.entries.map(e=>e.id===entry.id?{...e,org:f(e.org??defaultOrg(w.worlds.find(x=>x.id===e.worldId))),editedBy:undefined,updatedAt:new Date().toISOString()}:e),...extra]}));
 const patch:Ctx['patch']=(id,kind,f)=>setOrg(o=>({...o,blocks:o.blocks.map(b=>b.id===id&&b.kind===kind?f(b as never) as OrgBlock:b)}));
 const createNpc:Ctx['createNpc']=(name,add)=>{const id=newId(),now=new Date().toISOString();setOrg(o=>add(o,id),[{id,worldId:entry.worldId,campaignId:entry.campaignId,parentId:null,title:name.slice(0,160),kind:'character',character:defaultCharacter(),body:'',updatedAt:now}]);};
 const ctx:Ctx={entry,data,open:onOpen,patch,title:titleOf,picker,setPicker,editing,setEditing,createNpc,linked,askSubgroup:()=>setNaming(true)};

 const edit=(id:string,f:(b:OrgBlock)=>OrgBlock)=>setOrg(o=>({...o,blocks:o.blocks.map(b=>b.id===id?f(b):b)}));
 const canMove=(id:string,dir:-1|1)=>{const next=moveBlockBy(org.blocks,id,dir);return next.some((b,i)=>b.id!==org.blocks[i].id);};
 const arrange:Arrange<OrgBlock>={on:arranging,dragId,overId,renaming,setRenaming,setDrag,setOver,edit,canMove,
  move:(id,dir)=>setOrg(o=>({...o,blocks:moveBlockBy(o.blocks,id,dir)})),side:id=>setOrg(o=>({...o,blocks:switchColumn(o.blocks,id)})),
  drop:(beforeId,column)=>{const id=dragId;setDrag(null);setOver(null);if(id)setOrg(o=>({...o,blocks:placeBlock(o.blocks,id,beforeId,column)}));},
  remove:async b=>{if(blockHasContent(b)&&!await confirmDialog({title:`Remove “${b.title||blockKindInfo[b.kind].name}”?`,message:'Everything in it is removed too.',confirm:'Remove block',danger:true}))return;setOrg(o=>({...o,blocks:o.blocks.filter(x=>x.id!==b.id)}));}};

 const addBlock=(kind:BlockKind)=>{setOrg(o=>{const left=o.blocks.filter(b=>b.column==='left'&&!b.full).length,right=o.blocks.filter(b=>b.column==='right'&&!b.full).length,b=newBlock(kind);return {...o,blocks:[...o.blocks,{...b,column:left>right?'right':'left'} as OrgBlock]};});};
 const addSubgroup=(name:string)=>{const id=newId(),now=new Date().toISOString();change(w=>({...w,entries:[...w.entries,{id,worldId:entry.worldId,campaignId:entry.campaignId,parentId:entry.id,title:name.trim().slice(0,160),kind:'faction' as const,body:'',org:defaultOrg(w.worlds.find(x=>x.id===entry.worldId)),updatedAt:now}]}));setNaming(false);};
 async function done(){
  if(scope==='world'){
   const count=data.entries.filter(e=>e.worldId===entry.worldId&&e.kind==='faction'&&e.org&&e.id!==entry.id).length;
   if(!await confirmDialog({title:'Use this layout for every organization in this world?',message:`New organizations will start with it, and ${count} other ${count===1?'organization':'organizations'} will be rearranged to match. Each keeps its own people, facts and text.`,confirm:'Use this layout'}))return;
   if(change(w=>applyOrgLayout(w,entry.worldId,layoutOf(w.entries.find(e=>e.id===entry.id)?.org??org)))===false)return;
   setNotice(`This layout is now the default for ${world?.name??'this world'}.`);
  }
  setArranging(false);setRenaming(null);setDrag(null);setOver(null);
 }

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
  {arranging&&<ArrangeBar what="organizations" scope={scope} setScope={setScope} coGm={coGm} onDone={()=>void done()}/>}
  <Board blocks={org.blocks} arranging={arranging} dragId={dragId} overId={overId} setOver={setOver} drop={arrange.drop} render={b=><Block key={b.id} b={b} ctx={ctx} arrange={arrange}/>}/>
  {arranging&&<AddBlockMenu count={org.blocks.length} kinds={blockKinds.map(k=>({kind:k,name:blockKindInfo[k].name,blurb:blockKindInfo[k].blurb,taken:singleBlockKinds.includes(k)&&org.blocks.some(b=>b.kind===k)}))} onAdd={k=>addBlock(k as BlockKind)}/>}
  {barEdit
   ?<BarEditor bar={org.bar} setBar={f=>setOrg(o=>({...o,bar:f(o.bar)}))} onDone={()=>setBarEdit(false)}/>
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

