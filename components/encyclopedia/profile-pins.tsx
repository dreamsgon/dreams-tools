'use client';
/*
 * Quick find on a character's Profile tab: stats, items, spells and statblock lines the GM pins from the other tabs, so the
 * profile reads as a summary you can roll from. Pin to profile opens one list of everything, each with a switch. The
 * values always come from their own tabs (lib/encyclopedia/profile-pins.ts); players get a pin only when they already get
 * what it points at.
 */
import {useState,type ReactNode} from 'react';
import {ArrowDown,ArrowUp,Award,GripVertical,BookOpen,Dices,EyeOff,Pin,Search,Shield,Sparkles,Swords,X} from 'lucide-react';
import {defaultCharacter,newId,type Campaign,type Entry,type StatField} from '@/lib/encyclopedia/world-model';
import {cellSizeNames,cellSizes,maxPins,type CellSize,type Profile,type ProfilePin} from '@/lib/encyclopedia/character-profile';
import {isPinned,lineRef,movePin,pinKindNames,pinnedLine,sizePin,statblockLines,togglePin,type PinKind,type PlayerPin} from '@/lib/encyclopedia/profile-pins';
import type {Feature,PlayerFeature} from '@/lib/encyclopedia/features';
import {modKey,sheetOf,statModifier,statRollDice,statRolls,derivedValue} from '@/lib/encyclopedia/stat-rolls';
import {shownStats,statOff} from '@/lib/encyclopedia/stat-arrange';
import {statblockSegments} from '@/lib/encyclopedia/statblock';
import {formatMoney,itemSettingsOf,type ItemRoll,type ItemSettings} from '@/lib/encyclopedia/items';
import {RollChip} from './rolls';
import {useDragOrder} from './drag-order';
import {moveTo} from '@/lib/encyclopedia/drag-order';
import {ToolDialog} from './tool-dialog';
import './profile-pins.css';

/** What the cards need from the campaign's item settings (players get these too). */
export type PinSettings=Pick<ItemSettings,'show'|'spells'>;
const signed=(n:number)=>n<0?`−${-n}`:`+${n}`;
const shown=(v:unknown)=>v===null||v===undefined||v===''?'—':typeof v==='boolean'?(v?'Yes':'No'):String(v);
const kindIcons:Record<PinKind,typeof Pin>={stat:Dices,item:Shield,spell:Sparkles,statblock:Swords,feature:Award};

/** What one pin card shows, the same for the GM and players. */
type Card={id:string;size?:CellSize;kind:PinKind;source:string;title:string;big?:string;score?:string;value?:string;sub?:string;rolls:{name:string;dice:string}[];statblock?:string;gmOnly?:string;missing?:boolean;tab?:string};

function PinCard({card,who,tools,onOpen,drag}:{card:Card;who:string;tools?:ReactNode;onOpen?:(tab:string)=>void;drag?:object}){
 const Icon=kindIcons[card.kind];
 return <div role="listitem" className={`pin-card pin-${card.kind}${card.big!==undefined?' is-box':''}${card.missing?' is-missing':''}${card.size?` size-${card.size}`:''}`} {...drag}>
  <div className="pin-head"><span className="pin-source"><Icon size={11} aria-hidden="true"/>{card.source}</span>{card.gmOnly&&<span className="pin-gm" title={card.gmOnly}><EyeOff size={11} aria-label={card.gmOnly}/></span>}{tools}</div>
  {card.statblock!==undefined?<p className="pin-statblock">{statblockSegments(card.statblock).map((s,j)=>s.formula?<RollChip key={j} title={who} formula={s.formula} label={s.text.trim()} context={s.context}/>:<span key={j}>{s.text}</span>)}</p>:<>
   {onOpen&&card.tab?<button type="button" className="pin-title" title={`Open the ${card.source} tab`} onClick={()=>onOpen(card.tab!)}>{card.title}</button>:<strong className="pin-title">{card.title}</strong>}
   {card.big!==undefined&&<span className="pin-big">{card.big}</span>}
   {card.score!==undefined&&<span className="pin-score">{card.score}</span>}
   {card.value!==undefined&&<span className="pin-value">{card.value}</span>}
   {card.sub&&<small className="pin-sub">{card.sub}</small>}
   {card.rolls.length>0&&<span className="pin-rolls">{card.rolls.map(r=><RollChip key={r.name} title={`${who} · ${card.title}`} formula={r.dice} label={r.name}/>)}</span>}
  </>}
 </div>;
}

const itemRolls=(rolls:ItemRoll[]|undefined)=>(rolls??[]).map(r=>({name:r.name,dice:r.formula}));
const itemSub=(i:{qty:number;uses?:{value:number;max:number};equipped?:boolean;category?:string},settings?:PinSettings)=>[i.category,i.equipped&&(settings?.show.equipped??true)?'Equipped':'',i.uses&&(settings?.show.uses??true)?`${i.uses.value}/${i.uses.max} uses`:''].filter(Boolean).join(' · ');
const featureSub=(f:Pick<Feature,'group'|'note'|'uses'>)=>[f.group,f.note,f.uses?`${f.uses.value}/${f.uses.max} uses${f.uses.reset?` (${f.uses.reset})`:''}`:''].filter(Boolean).join(' · ');
const featureCard=(f:PlayerFeature)=>({title:f.name,tab:'features',rolls:itemRolls(f.rolls),sub:featureSub(f)||(f.text?f.text.slice(0,120):undefined)});
const spellSub=(s:{group?:string;details?:Record<string,string>;ready?:boolean},settings?:PinSettings)=>[s.group,s.ready&&settings?.spells.ready?settings.spells.ready:'',...Object.entries(s.details??{}).filter(([,v])=>v).slice(0,3).map(([k,v])=>`${k} ${v}`)].filter(Boolean).join(' · ');

/** The GM's cards: every pin with its value read from its tab, and why players won't see it when they won't. */
function gmCards(entry:Entry,profile:Profile,campaign?:Campaign):Card[]{
 const c=entry.character??defaultCharacter(),all=campaign?.statFields??[],values=c.statsByCampaign[campaign?.id??'']??{},sheet=sheetOf(all,values),settings=itemSettingsOf(campaign);
 const spellsTab=settings.spells.tab;
 return (profile.pins??[]).map(p=>{
  const base={id:p.id,size:p.size,kind:p.kind,source:p.kind==='spell'?spellsTab:pinKindNames[p.kind],rolls:[] as Card['rolls']};
  if(p.kind==='stat'){
   const f=all.find(x=>x.id===p.ref&&!x.archived);
   if(!f)return {...base,title:'A stat that left the sheet',missing:true};
   const v=values[f.id]??null,box=f.look==='score'&&f.type==='number',mod=box?statModifier({derived:f.derived,value:v,mod:values[modKey(f.id)]},sheet):null,worked=!box&&f.derived?derivedValue({derived:f.derived,value:v},sheet):null;
   const rolls=statRolls(f).flatMap(r=>{const dice=statRollDice(r.formula,v,sheet);return dice?[{name:r.name,dice}]:[];});
   const gmOnly=c.statsVisibility!=='players'?'Players don’t see this: the Stats & Skills tab is GM only.':f.visibility==='gm'?'Players don’t see this: the stat is GM only.':statOff(c.statLayout,f.id)?'Off on this character’s sheet, so players don’t see it.':undefined;
   return {...base,title:f.label,tab:'stats',rolls,gmOnly,...(box?{big:mod===null?'—':signed(mod),score:shown(v)}:f.type==='none'?{}:{value:`${f.type==='textarea'?String(v??'').slice(0,140)||'—':shown(v)}${worked!==null?` (${signed(worked)})`:''}`}),...(f.note?{sub:f.note}:{})};
  }
  if(p.kind==='item'){
   const i=c.inventory?.items.find(x=>x.id===p.ref);
   if(!i)return {...base,title:'An item no longer carried',missing:true};
   const gmOnly=c.inventory?.visibility!=='players'?'Other players don’t see this: the Inventory tab is GM only.':i.gm?'Players don’t see this: the item is GM only.':undefined;
   return {...base,title:i.qty>1?`${i.name} ×${i.qty}`:i.name,tab:'inventory',rolls:itemRolls(i.rolls),gmOnly,sub:itemSub(i,settings)||undefined};
  }
  if(p.kind==='spell'){
   const s=c.spells?.find(x=>x.id===p.ref);
   if(!s||!settings.spells.on)return {...base,title:`A ${settings.spells.one} no longer here`,missing:true};
   const gmOnly=c.spellsVisibility!=='players'?`Other players don’t see this: the ${spellsTab} tab is GM only.`:s.gm?`Players don’t see this: the ${settings.spells.one} is GM only.`:undefined;
   return {...base,title:s.name,tab:'spells',rolls:itemRolls(s.rolls),gmOnly,sub:spellSub(s,settings)||undefined};
  }
  if(p.kind==='feature'){
   const f=c.features?.find(x=>x.id===p.ref);
   if(!f)return {...base,title:'A feature no longer here',missing:true};
   const gmOnly=c.featuresVisibility!=='players'?'Other players don’t see this: the Features tab is GM only.':f.gm?'Players don’t see this: the feature is GM only.':undefined;
   return {...base,...featureCard(f),gmOnly};
  }
  const line=pinnedLine(c.statblock,p.ref);
  return line?{...base,title:line,statblock:line,gmOnly:'Only you see the statblock.'}:{...base,title:'A statblock line that was edited away',missing:true};
 });
}

/** The players' cards, from the player copies only. */
function playerCards(pins:PlayerPin[],settings?:PinSettings):Card[]{
 return pins.map(p=>{
  const head={id:p.id,size:p.size};
  if(p.kind==='feature')return {...head,kind:'feature',source:'Features',...featureCard(p.feature),tab:undefined};
  if(p.kind==='stat'){const s=p.stat,box=s.look==='score';return {...head,kind:'stat',source:pinKindNames.stat,title:s.label,rolls:s.rolls.flatMap(r=>r.dice?[{name:r.name,dice:r.dice}]:[]),...(box?{big:s.worked===undefined?'—':signed(s.worked),score:shown(s.value)}:s.type==='none'?{}:{value:`${s.type==='textarea'?String(s.value??'').slice(0,140)||'—':shown(s.value)}${s.worked!==undefined?` (${signed(s.worked)})`:''}`}),...(s.note?{sub:s.note}:{})};}
  if(p.kind==='item'){const i=p.item;return {...head,kind:'item',source:'Inventory',title:i.qty>1?`${i.name} ×${i.qty}`:i.name,rolls:itemRolls(i.rolls),sub:itemSub(i,settings)||undefined};}
  const s=p.spell;return {...head,kind:'spell',source:settings?.spells.tab??'Spells',title:s.name,rolls:itemRolls(s.rolls),sub:spellSub(s,settings)||undefined};
 });
}

/** Quick find on the GM's Profile tab. */
export function QuickFind({entry,campaign,profile,setProfile,arranging,onTab}:{entry:Entry;campaign?:Campaign;profile:Profile;setProfile:(f:(p:Profile)=>Profile)=>void;arranging:boolean;onTab?:(tab:string)=>void}){
 const [picking,setPicking]=useState(false);
 const cards=gmCards(entry,profile,campaign),pins=profile.pins??[];
 const setPins=(f:(l:ProfilePin[])=>ProfilePin[])=>setProfile(p=>{const next=f(p.pins??[]);const {pins:_old,...rest}=p;void _old;return next.length?{...rest,pins:next}:rest;});
 const dnd=useDragOrder((id,target,after)=>setPins(l=>moveTo(l,id,target,after)));
 return <section className="pin-section" aria-label="Quick find">
  <div className="pin-section-head"><span className="eyebrow">QUICK FIND</span>
   <button type="button" className="button small" onClick={()=>setPicking(true)}><Pin size={13}/> {cards.length?'Change pins':'Pin to profile'}</button></div>
  {cards.length?<div className="pin-grid" role="list">{cards.map((card,i)=><PinCard key={card.id} card={card} who={entry.title} onOpen={onTab} drag={dnd.item(card.id,{on:arranging})} tools={<span className="pin-tools">{arranging&&<span className="drag-grip" title="Drag to move" aria-hidden="true"><GripVertical size={13}/></span>}
   {arranging&&<><button type="button" className="icon-button" aria-label={`Move ${card.title} earlier`} disabled={i===0} onClick={()=>setPins(l=>movePin(l,card.id,-1))}><ArrowUp size={12}/></button><button type="button" className="icon-button" aria-label={`Move ${card.title} later`} disabled={i===cards.length-1} onClick={()=>setPins(l=>movePin(l,card.id,1))}><ArrowDown size={12}/></button><SizePick size={card.size} name={card.title} onSize={sz=>setPins(l=>sizePin(l,card.id,sz))}/></>}
   <button type="button" className="icon-button pin-remove" aria-label={`Unpin ${card.title}`} title="Unpin" onClick={()=>setPins(l=>l.filter(x=>x.id!==card.id))}><X size={12}/></button></span>}/>)}</div>
  :<p className="pin-empty">Pin stats, skills, items, spells, features and statblock lines here to find them at a glance and roll them from the profile.</p>}
  {picking&&<PinPicker entry={entry} campaign={campaign} pins={pins} onToggle={(kind,ref)=>setPins(l=>togglePin(l,kind,ref,maxPins,newId))} onClose={()=>setPicking(false)}/>}
 </section>;
}

type Choice={kind:PinKind;ref:string;title:string;sub?:string;gm?:boolean};

/** S, M or L: how wide a pin or fact is, shown while arranging. */
export function SizePick({size,name,onSize}:{size?:CellSize;name:string;onSize:(s:CellSize)=>void}){
 return <span className="size-pick" role="radiogroup" aria-label={`${name} width`}>{cellSizes.map(sz=><button key={sz} type="button" role="radio" aria-checked={(size??'s')===sz} title={cellSizeNames[sz]} onClick={()=>onSize(sz)}>{sz.toUpperCase()}</button>)}</span>;
}

/** Pin to profile: everything from Stats & Skills, Inventory, Spells, Features and the Statblock, each with a switch. */
function PinPicker({entry,campaign,pins,onToggle,onClose}:{entry:Entry;campaign?:Campaign;pins:ProfilePin[];onToggle:(kind:PinKind,ref:string)=>void;onClose:()=>void}){
 const c=entry.character??defaultCharacter(),settings=itemSettingsOf(campaign),values=c.statsByCampaign[campaign?.id??'']??{};
 const fields:StatField[]=shownStats((campaign?.statFields??[]).filter(f=>!f.archived),c.statLayout);
 const groups:{kind:PinKind;name:string;choices:Choice[]}[]=[
  {kind:'stat',name:pinKindNames.stat,choices:fields.map(f=>({kind:'stat',ref:f.id,title:f.label,sub:[f.section,f.type==='none'?'':shown(values[f.id])].filter(Boolean).join(' · '),gm:f.visibility==='gm'}))},
  {kind:'item',name:'Inventory',choices:(c.inventory?.items??[]).map(i=>({kind:'item',ref:i.id,title:i.qty>1?`${i.name} ×${i.qty}`:i.name,sub:[i.category,i.price!==undefined&&settings.show.value?formatMoney(i.price,settings.coins):''].filter(Boolean).join(' · '),gm:i.gm}))},
  ...(settings.spells.on?[{kind:'spell' as const,name:settings.spells.tab,choices:(c.spells??[]).map(s=>({kind:'spell' as const,ref:s.id,title:s.name,sub:s.group,gm:s.gm}))}]:[]),
  {kind:'feature',name:'Features',choices:(c.features??[]).map(f=>({kind:'feature' as const,ref:f.id,title:f.name,sub:featureSub(f)||undefined,gm:f.gm}))},
  {kind:'statblock',name:'Statblock',choices:statblockLines(c.statblock).map(l=>({kind:'statblock',ref:lineRef(l),title:l.length>120?l.slice(0,119)+'…':l}))},
 ];
 const [tab,setTab]=useState<PinKind>(groups.find(g=>g.choices.length)?.kind??'stat'),[q,setQ]=useState('');
 const group=groups.find(g=>g.kind===tab)??groups[0],want=q.trim().toLowerCase();
 const list=group.choices.filter(x=>!want||`${x.title} ${x.sub??''}`.toLowerCase().includes(want)),full=pins.length>=maxPins;
 return <ToolDialog title="Pin to profile" wide onClose={onClose}>
  <p className="modal-intro">Switch on what {entry.title}’s profile should show. Values stay on their own tabs and update here. Players see a pin only when they can see it on its tab.</p>
  <div className="pin-picker-tabs" role="tablist" aria-label="Where from">{groups.map(g=>{const n=pins.filter(p=>p.kind===g.kind).length;return <button key={g.kind} type="button" role="tab" aria-selected={tab===g.kind} onClick={()=>{setTab(g.kind);setQ('');}}>{g.name}{n>0&&<small>{n}</small>}</button>;})}</div>
  {group.choices.length>8&&<label className="inv-search pin-picker-search"><Search size={14} aria-hidden="true"/><input aria-label="Find" placeholder={`Find in ${group.name}`} value={q} onChange={e=>setQ(e.target.value)}/></label>}
  <div className="pin-picker-list" role="list">{list.map(x=>{const on=isPinned(pins,x.kind,x.ref);return <label role="listitem" key={x.ref} className={`pin-choice${on?' is-on':''}`}>
   <input type="checkbox" className="sr-only" checked={on} disabled={!on&&full} onChange={()=>onToggle(x.kind,x.ref)}/>
   <span className="stat-switch" aria-hidden="true" data-on={on}><span/></span>
   <span className="pin-choice-text"><strong>{x.title}</strong>{x.sub&&<small>{x.sub}</small>}</span>
   {x.gm&&<span className="inv-flag"><EyeOff size={11}/> GM only</span>}
  </label>;})}
   {!group.choices.length&&<p className="pin-empty">{group.kind==='statblock'?<><BookOpen size={14} aria-hidden="true"/> Paste a statblock on the Statblock tab to pin its lines.</>:group.kind==='stat'?'This campaign’s sheet has no stats on for this character yet.':`Nothing on the ${group.name} tab yet.`}</p>}
   {group.choices.length>0&&!list.length&&<p className="pin-empty">Nothing matches.</p>}</div>
  <p className="aside-hint pin-picker-foot">{pins.length} of {maxPins} pinned.{full?' Unpin something to add more.':''} Use Arrange on the profile to change their order.</p>
  <div className="button-row"><button type="button" className="button primary" onClick={onClose}>Done</button></div>
 </ToolDialog>;
}

/** Quick find as players see it. */
export function QuickFindReadOnly({pins,who,settings}:{pins:PlayerPin[];who:string;settings?:PinSettings}){
 if(!pins.length)return null;
 return <section className="pin-section" aria-label="Quick find"><div className="pin-section-head"><span className="eyebrow">QUICK FIND</span></div>
  <div className="pin-grid" role="list">{playerCards(pins,settings).map(card=><PinCard key={card.id} card={card} who={who}/>)}</div></section>;
}
