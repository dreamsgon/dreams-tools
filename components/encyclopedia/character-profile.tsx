'use client';
import {useState} from 'react';
import {Check,Eye,LayoutGrid,Pencil,Plus,Trash2} from 'lucide-react';
import {defaultCharacter,newId,playerCampaign,type Campaign,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {emblemSymbols,moveBlockBy,placeBlock,switchColumn,type EmblemSymbol} from '@/lib/encyclopedia/org-profile';
import {applyCharacterLayout,defaultProfile,joinOrg,leaveOrg,maxTies,maxTraits,newProfileBlock,organizationsOf,profileBlockHasContent,profileBlockInfo,profileBlockKinds,profileLayoutOf,profileOf,setOrgPlace,singleProfileKinds,type Profile,type ProfileBlock,type ProfileBlockKind,type ProfileBlockOf} from '@/lib/encyclopedia/character-profile';
import {confirmDialog} from '../confirm-dialog';
import {memberRef} from './member-view';
import {ToolDialog} from './tool-dialog';
import {BottomBar,Emblem,PageLink,PersonLine,symbolIcons,symbolNames} from './org-parts';
import {OrgJoinPicker,PagePicker} from './org-picker';
import {AddBlockMenu,ArrangeBar,BarEditor,BeliefsList,Board,BlockFrame,ItemTools,StandingSelect,TextBlockBody,type Arrange} from './profile-board';
import {CharacterReadOnly,OrgLine,TraitChip} from './character-parts';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
type Props={entry:Entry;data:Workspace;campaign?:Campaign;change:Change;onOpen:(id:string)=>void;/** Pages that mention this one (the article's MENTIONED IN). */linked:Entry[]};

type Ctx={
 entry:Entry;data:Workspace;change:Change;open:(id:string)=>void;
 patch:<K extends ProfileBlockKind>(id:string,kind:K,f:(b:ProfileBlockOf<K>)=>ProfileBlockOf<K>)=>void;
 title:(id:string)=>string;
 picker:string|null;setPicker:(key:string|null)=>void;editing:string|null;setEditing:(id:string|null)=>void;
 /** Makes a new NPC page and then lets `add` put it on the profile in the same save. */
 createNpc:(name:string,add:(p:Profile,id:string)=>Profile)=>void;
 linked:Entry[];
};

/* ---- Traits ---- */

function TraitForm({initial,onSave,onCancel}:{initial?:{label:string;symbol?:EmblemSymbol;gm?:boolean};onSave:(t:{label:string;symbol?:EmblemSymbol;gm?:boolean})=>void;onCancel:()=>void}){
 const [label,setLabel]=useState(initial?.label??''),[symbol,setSymbol]=useState<EmblemSymbol|undefined>(initial?.symbol),[gm,setGm]=useState(!!initial?.gm);
 return <form className="char-trait-form" aria-label={initial?'Edit trait':'Add a trait'} onSubmit={e=>{e.preventDefault();if(label.trim())onSave({label:label.trim(),symbol,gm:gm||undefined});}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onCancel();}}}>
  <input className="org-input" aria-label="Trait" autoFocus required maxLength={30} placeholder="For example Shrewd" value={label} onChange={e=>setLabel(e.target.value)}/>
  <div className="org-gallery char-gallery" role="group" aria-label="Trait symbol">
   <button type="button" className="org-gallery-item char-no-symbol" aria-label="No symbol" title="No symbol" aria-pressed={!symbol} onClick={()=>setSymbol(undefined)}>None</button>
   {emblemSymbols.map(s=>{const Icon=symbolIcons[s];return <button type="button" key={s} className="org-gallery-item" aria-label={symbolNames[s]} title={symbolNames[s]} aria-pressed={symbol===s} onClick={()=>setSymbol(s)}><Icon size={16}/></button>;})}</div>
  <div className="char-trait-form-row"><button type="button" className="org-toggle" aria-pressed={gm} aria-label={gm?'This trait is GM only. Show it to players':'Make this trait GM only'} onClick={()=>setGm(!gm)}>{gm?'GM only':'Players'}</button>
   <button className="button small primary" type="submit">{initial?'Save':'Add'}</button><button className="button small" type="button" onClick={onCancel}>Cancel</button></div>
 </form>;
}

function Traits({profile,setProfile}:{profile:Profile;setProfile:(f:(p:Profile)=>Profile)=>void}){
 const [form,setForm]=useState<string|null>(null);
 const set=(f:(l:Profile['traits'])=>Profile['traits'])=>setProfile(p=>({...p,traits:f(p.traits)}));
 const editing=profile.traits.find(t=>t.id===form);
 return <div className="char-traits-wrap">
  <div className="char-traits" role="list" aria-label="Traits">
   {profile.traits.map(t=><span role="listitem" className="org-item" key={t.id}><TraitChip label={t.label} symbol={t.symbol} gm={t.gm}>
    <ItemTools gm={t.gm} what={t.label||'this trait'} onEdit={()=>setForm(form===t.id?null:t.id)} onGm={()=>set(l=>l.map(x=>x.id===t.id?{...x,gm:x.gm?undefined:true}:x))} onRemove={()=>{set(l=>l.filter(x=>x.id!==t.id));if(form===t.id)setForm(null);}}/></TraitChip></span>)}
   <button type="button" className="char-trait-add" disabled={profile.traits.length>=maxTraits} onClick={()=>setForm(form==='new'?null:'new')}><Plus size={13}/> Trait{profile.traits.length>=maxTraits?` (up to ${maxTraits})`:''}</button>
  </div>
  {form==='new'&&<TraitForm onCancel={()=>setForm(null)} onSave={t=>{set(l=>[...l,{id:newId(),...t}]);setForm(null);}}/>}
  {editing&&<TraitForm key={editing.id} initial={editing} onCancel={()=>setForm(null)} onSave={t=>{set(l=>l.map(x=>x.id===editing.id?{id:x.id,...t}:x));setForm(null);}}/>}
 </div>;
}

/* ---- Block bodies ---- */

function OrgsBody({ctx}:{ctx:Ctx}){
 const {entry,data}=ctx,list=organizationsOf(data.entries,entry.id);
 return <>
  {list.map(o=>{
   const id=`org:${o.org.id}`,member=o.placements.find(p=>p.via==='member'),editing=ctx.editing===id,name=o.org.title;
   return <div className={`org-item${o.gm?' is-gm':''}`} key={o.org.id}>
    <OrgLine lead={<Emblem emblem={o.org.org?.emblem??{shape:'shield'}} size={30} initial={name}/>} id={o.org.id} title={name} type={o.org.org?.type} role={o.role} standing={o.standing} gm={o.gm} open={ctx.open}>
     <span className="org-item-tools">
      <button type="button" className="icon-button" aria-label={`${editing?'Finish editing':'Edit'} their place in ${name}`} aria-pressed={editing} onClick={()=>ctx.setEditing(editing?null:id)}>{editing?<Check size={13}/>:<Pencil size={13}/>}</button>
      <button type="button" className="icon-button" aria-label={`Leave ${name}`} onClick={async()=>{if(await confirmDialog({title:`Take ${entry.title} out of ${name}?`,message:'They are removed from its spots and members. Nothing else about the organization changes.',confirm:'Leave',danger:true})){ctx.change(w=>leaveOrg(w,entry.id,o.org.id));if(editing)ctx.setEditing(null);}}}><Trash2 size={13}/></button>
     </span></OrgLine>
    {editing&&<div className="org-edit-row">
     <input className="org-input" aria-label="Role" placeholder="Role, for example Warden-Captain" maxLength={80} autoFocus disabled={!member} value={member?.role??o.role} onChange={e=>ctx.change(w=>setOrgPlace(w,entry.id,o.org.id,{role:e.target.value}))}/>
     <StandingSelect value={o.standing} onChange={standing=>ctx.change(w=>setOrgPlace(w,entry.id,o.org.id,{standing:standing??null}))}/>
     {!member&&<small className="org-hint">Their role here is the spot’s title. Change it on the organization’s page.</small>}
     {o.gm&&<small className="org-hint">Their place here is GM only, so players won’t see this organization. Change that on the organization’s page.</small>}
    </div>}
   </div>;})}
  {!list.length&&<p className="org-empty">Not in any organization yet. The ones that list them appear here.</p>}
  <div className="org-add-wrap"><button type="button" className="text-button org-add" onClick={()=>ctx.setPicker(ctx.picker==='join'?null:'join')}><Plus size={13}/> Join</button>
   {ctx.picker==='join'&&<OrgJoinPicker data={data} character={entry} exclude={list.map(o=>o.org.id)} onClose={()=>ctx.setPicker(null)} onJoin={(orgId,role,standing)=>{ctx.change(w=>joinOrg(w,entry.id,orgId,{role,standing}));ctx.setPicker(null);}}/>}</div>
 </>;
}

function TiesBody({b,ctx}:{b:ProfileBlockOf<'ties'>;ctx:Ctx}){
 const set=(f:(m:ProfileBlockOf<'ties'>['ties'])=>ProfileBlockOf<'ties'>['ties'])=>ctx.patch(b.id,'ties',x=>({...x,ties:f(x.ties)}));
 const key=b.id,target=(id:string)=>ctx.data.entries.find(e=>e.id===id);
 const lead=(id:string)=>{const t=target(id);return t?.kind==='faction'?<Emblem emblem={t.org?.emblem??{shape:'shield'}} size={30} initial={t.title}/>:undefined;};
 return <>
  {b.ties.map(t=>{const tools=<ItemTools gm={t.gm} editing={ctx.editing===t.id} what={ctx.title(t.entryId)||'this tie'} onEdit={()=>ctx.setEditing(ctx.editing===t.id?null:t.id)} onGm={()=>set(l=>l.map(x=>x.id===t.id?{...x,gm:x.gm?undefined:true}:x))} onRemove={()=>set(l=>l.filter(x=>x.id!==t.id))}/>;
   return <div className={`org-item${t.gm?' is-gm':''}`} key={t.id}>{ctx.editing===t.id
    ?<div className="org-edit-row"><strong>{ctx.title(t.entryId)||'Missing page'}</strong><input className="org-input" aria-label="Note" placeholder="Rival · owes her a debt she won’t forgive" maxLength={200} autoFocus value={t.note??''} onChange={e=>set(l=>l.map(x=>x.id===t.id?{...x,note:e.target.value||undefined}:x))}/>{tools}</div>
    :<PersonLine id={t.entryId} title={ctx.title(t.entryId)} note={t.note} gm={t.gm} lead={lead(t.entryId)} open={ctx.open}>{tools}</PersonLine>}</div>;})}
  {!b.ties.length&&<p className="org-empty">No ties yet. Add the people and organizations they care about, or can’t stand.</p>}
  <div className="org-add-wrap"><button type="button" className="text-button org-add" disabled={b.ties.length>=maxTies} onClick={()=>ctx.setPicker(ctx.picker===key?null:key)}><Plus size={13}/> Add a tie</button>
   {ctx.picker===key&&<PagePicker characters={false} ties label="Add a tie" data={ctx.data} org={ctx.entry} exclude={b.ties.map(t=>t.entryId)} onClose={()=>ctx.setPicker(null)}
    onChoose={entryId=>{const id=newId();set(l=>[...l,{id,entryId}]);ctx.setPicker(null);ctx.setEditing(id);}}
    onCreate={name=>{const id=newId();ctx.createNpc(name,(p,npc)=>({...p,blocks:p.blocks.map(x=>x.id===b.id&&x.kind==='ties'?{...x,ties:[...x.ties,{id,entryId:npc}]}:x)}));ctx.setPicker(null);ctx.setEditing(id);}}/>}</div>
 </>;
}

function LinkedBody({ctx}:{ctx:Ctx}){
 return <>{ctx.linked.map(e=><div className="org-holding" key={e.id}><PageLink id={e.id} open={ctx.open}>{e.title}</PageLink><small>{e.kind==='faction'?'organization':e.kind}</small></div>)}{!ctx.linked.length&&<p className="org-empty">No pages mention this character yet. Link them with [[ in any page’s text.</p>}</>;
}

function Block({b,ctx,arrange}:{b:ProfileBlock;ctx:Ctx;arrange:Arrange<ProfileBlock>}){
 return <BlockFrame b={b} name={b.title||profileBlockInfo[b.kind].name} arrange={arrange}>
  {b.kind==='beliefs'&&<BeliefsList items={b.beliefs} editing={ctx.editing} setEditing={ctx.setEditing} set={f=>ctx.patch(b.id,'beliefs',x=>({...x,beliefs:f(x.beliefs)}))}/>}
  {b.kind==='organizations'&&<OrgsBody ctx={ctx}/>}
  {b.kind==='ties'&&<TiesBody b={b} ctx={ctx}/>}
  {b.kind==='text'&&<TextBlockBody title={b.title} text={b.text} editing={ctx.editing===b.id} setEditing={on=>ctx.setEditing(on?b.id:null)} onChange={text=>ctx.patch(b.id,'text',x=>({...x,text}))}/>}
  {b.kind==='linked'&&<LinkedBody ctx={ctx}/>}
 </BlockFrame>;
}

/** The GM's Profile tab of a character page. */
export function CharacterProfile({entry,data,campaign,change,onOpen,linked}:Props){
 const world=data.worlds.find(w=>w.id===entry.worldId),profile=profileOf(entry,world),coGm=!!memberRef();
 const [arranging,setArranging]=useState(false),[scope,setScope]=useState<'one'|'world'>('one'),[showPlayer,setShowPlayer]=useState(false);
 const [picker,setPicker]=useState<string|null>(null),[editing,setEditing]=useState<string|null>(null),[dragId,setDrag]=useState<string|null>(null),[overId,setOver]=useState<string|null>(null),[renaming,setRenaming]=useState<string|null>(null);
 const [barEdit,setBarEdit]=useState(false),[notice,setNotice]=useState('');
 const titleOf=(id:string)=>data.entries.find(e=>e.id===id)?.title??'';

 // Every edit goes through here: it starts from the latest saved copy and makes the profile the page's own if it was still the default.
 const setProfile=(f:(p:Profile)=>Profile,extra:Entry[]=[])=>change(w=>({...w,entries:[...w.entries.map(e=>e.id===entry.id?{...e,profile:f(e.profile??defaultProfile(w.worlds.find(x=>x.id===e.worldId))),editedBy:undefined,updatedAt:new Date().toISOString()}:e),...extra]}));
 const patch:Ctx['patch']=(id,kind,f)=>setProfile(p=>({...p,blocks:p.blocks.map(b=>b.id===id&&b.kind===kind?f(b as never) as ProfileBlock:b)}));
 const createNpc:Ctx['createNpc']=(name,add)=>{const id=newId(),now=new Date().toISOString();setProfile(p=>add(p,id),[{id,worldId:entry.worldId,campaignId:entry.campaignId,parentId:null,title:name.slice(0,160),kind:'character',character:defaultCharacter(),profile:defaultProfile(world),body:'',updatedAt:now}]);};
 const ctx:Ctx={entry,data,change,open:onOpen,patch,title:titleOf,picker,setPicker,editing,setEditing,createNpc,linked};

 const edit=(id:string,f:(b:ProfileBlock)=>ProfileBlock)=>setProfile(p=>({...p,blocks:p.blocks.map(b=>b.id===id?f(b):b)}));
 const canMove=(id:string,dir:-1|1)=>{const next=moveBlockBy(profile.blocks,id,dir);return next.some((b,i)=>b.id!==profile.blocks[i].id);};
 const arrange:Arrange<ProfileBlock>={on:arranging,dragId,overId,renaming,setRenaming,setDrag,setOver,edit,canMove,
  move:(id,dir)=>setProfile(p=>({...p,blocks:moveBlockBy(p.blocks,id,dir)})),side:id=>setProfile(p=>({...p,blocks:switchColumn(p.blocks,id)})),
  drop:(beforeId,column)=>{const id=dragId;setDrag(null);setOver(null);if(id)setProfile(p=>({...p,blocks:placeBlock(p.blocks,id,beforeId,column)}));},
  remove:async b=>{if(profileBlockHasContent(b)&&!await confirmDialog({title:`Remove “${b.title||profileBlockInfo[b.kind].name}”?`,message:'Everything in it is removed too.',confirm:'Remove block',danger:true}))return;setProfile(p=>({...p,blocks:p.blocks.filter(x=>x.id!==b.id)}));}};

 const addBlock=(kind:ProfileBlockKind)=>{setProfile(p=>{const left=p.blocks.filter(b=>b.column==='left'&&!b.full).length,right=p.blocks.filter(b=>b.column==='right'&&!b.full).length,b=newProfileBlock(kind);return {...p,blocks:[...p.blocks,{...b,column:left>right?'right':'left'} as ProfileBlock]};});};
 async function done(){
  if(scope==='world'){
   const count=data.entries.filter(e=>e.worldId===entry.worldId&&e.kind==='character'&&e.profile&&e.id!==entry.id).length;
   if(!await confirmDialog({title:'Use this layout for every character in this world?',message:`New characters will start with it, and ${count} other ${count===1?'character':'characters'} will be rearranged to match. Each keeps its own traits, beliefs, people and text.`,confirm:'Use this layout'}))return;
   if(change(w=>applyCharacterLayout(w,entry.worldId,profileLayoutOf(w.entries.find(e=>e.id===entry.id)?.profile??profile)))===false)return;
   setNotice(`This layout is now the default for ${world?.name??'this world'}.`);
  }
  setArranging(false);setRenaming(null);setDrag(null);setOver(null);
 }

 const preview=()=>{
  const camp=campaign??data.campaigns.find(c=>c.worldId===entry.worldId);if(!camp)return null;
  try{const shared=playerCampaign({...data,entries:data.entries.map(e=>e.id===entry.id?{...e,profile:{...profile,visibility:'players' as const}}:e)},camp.id);return {profile:shared.entries.find(e=>e.id===entry.id)?.profile??null};}catch{return null;}
 };
 const shown=showPlayer?preview():null;

 return <div className={`org-profile char-profile${arranging?' is-arranging':''}`}>
  <div className="char-tools">
   <button type="button" className="button small" aria-pressed={arranging} onClick={()=>{if(arranging)void done();else{setArranging(true);setBarEdit(false);}}}><LayoutGrid size={14}/> Arrange</button>
   <button type="button" className="button small" onClick={()=>setShowPlayer(true)}><Eye size={14}/> Player view</button>
  </div>
  {profile.visibility==='gm'&&<p className="org-hint">Players can’t see this tab yet. Use Tab visibility above to share it.</p>}
  {notice&&<p role="status" className="info-note">{notice}</p>}
  <Traits profile={profile} setProfile={setProfile}/>
  {arranging&&<ArrangeBar what="characters" scope={scope} setScope={setScope} coGm={coGm} onDone={()=>void done()}/>}
  <Board blocks={profile.blocks} arranging={arranging} dragId={dragId} overId={overId} setOver={setOver} drop={arrange.drop} render={b=><Block key={b.id} b={b} ctx={ctx} arrange={arrange}/>}/>
  {arranging&&<AddBlockMenu count={profile.blocks.length} kinds={profileBlockKinds.map(k=>({kind:k,name:profileBlockInfo[k].name,blurb:profileBlockInfo[k].blurb,taken:singleProfileKinds.includes(k)&&profile.blocks.some(b=>b.kind===k)}))} onAdd={k=>addBlock(k as ProfileBlockKind)}/>}
  {barEdit
   ?<BarEditor bar={profile.bar} setBar={f=>setProfile(p=>({...p,bar:f(p.bar)}))} onDone={()=>setBarEdit(false)}/>
   :profile.bar.hidden?<p className="org-hint">The bottom bar is hidden. <button type="button" className="text-button" onClick={()=>setProfile(p=>({...p,bar:{...p.bar,hidden:undefined}}))}>Show it</button></p>
   :<BottomBar title={profile.bar.title} fields={profile.bar.fields.map(f=>({...f,value:f.value||'—'}))}><button type="button" className="text-button" onClick={()=>{setBarEdit(true);setArranging(false);}}><Pencil size={12}/> Change this bar</button></BottomBar>}
  {showPlayer&&<ToolDialog title="Player view" wide onClose={()=>setShowPlayer(false)}>
   <p className="modal-intro">This is how players see the profile{profile.visibility==='gm'?' once you share the tab':''}. People and pages players can’t read, organizations whose own profile isn’t shared, and anything marked GM only, are left out.</p>
   {shown?.profile?<div className="org-player-preview"><CharacterReadOnly profile={shown.profile}/></div>:<p className="org-empty">There’s no campaign in this world to show the player view for yet.</p>}
  </ToolDialog>}
 </div>;
}
