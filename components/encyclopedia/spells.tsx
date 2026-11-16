"use client";
/*
 * A character's Spells tab, named by the campaign (Spells, Psi powers, Prayers, Tricks…): entries grouped as the
 * campaign groups them, each with the details the campaign lists (Range, Duration…), tags, text with rolls in it,
 * rolls to click, and an optional cost that spends from one of the character's trackers when it is used. The word
 * for "prepared" is the campaign's too, or there is none. The GM's and the player's views are the same component;
 * the player's changes go to the server like the inventory's.
 */
import {useMemo,useState} from 'react';
import {ChevronDown,ChevronRight,Eye,EyeOff,Pencil,Plus,Search,Sparkles,Star,Trash2} from 'lucide-react';
import type {ItemRoll,PlayerItemSettings,Spell,SpellInput} from '@/lib/encyclopedia/items';
import type {PlayerTracker} from '@/lib/encyclopedia/trackers';
import {RollChip} from './rolls';
import {ToolDialog} from './tool-dialog';
import {confirmDialog} from '../confirm-dialog';
import {NoteText,RollsEditor,type Act} from './inventory';
import {TrackerView} from './character-trackers';
import './inventory.css';

type Shown=PlayerTracker&{gm?:boolean};

function SpellForm({start,settings,trackers,gm,onSave,onClose}:{start?:Spell;settings:PlayerItemSettings;trackers:Shown[];gm:boolean;onSave:(s:SpellInput)=>Promise<boolean>|boolean;onClose:()=>void}){
 const sp=settings.spells,[busy,setBusy]=useState(false);
 const [s,setS]=useState<SpellInput>(()=>start?{name:start.name,group:start.group,details:start.details,tags:start.tags,text:start.text,rolls:start.rolls,cost:start.cost??null,ready:start.ready,gm:start.gm}:{name:'',group:sp.groups[0]});
 const set=(p:Partial<SpellInput>)=>setS(x=>({...x,...p}));
 const [tags,setTags]=useState((start?.tags??[]).join(', '));
 const groups=[...new Set([...sp.groups,...(s.group?[s.group]:[])])];
 return <ToolDialog title={start?`Change ${start.name}`:`Add a ${sp.one}`} onClose={onClose} wide>
  <form className="spell-form" onSubmit={async e=>{e.preventDefault();if(!s.name.trim()||busy)return;setBusy(true);const t=tags.split(',').map(x=>x.trim()).filter(Boolean).slice(0,8).map(x=>x.slice(0,30));const ok=await onSave({...s,name:s.name.trim(),tags:t});setBusy(false);if(ok)onClose();}}>
   <div className="spell-form-grid">
    <label className="field-label">Name<input className="inv-input" autoFocus required maxLength={80} value={s.name} onChange={e=>set({name:e.target.value})}/></label>
    <label className="field-label">Group<input className="inv-input" list="spell-groups" maxLength={40} placeholder={sp.groups.length?sp.groups.join(', '):'Any heading, or none'} value={s.group??''} onChange={e=>set({group:e.target.value||undefined})}/><datalist id="spell-groups">{groups.map(g=><option key={g} value={g}/>)}</datalist></label>
    {sp.columns.map(c=><label key={c} className="field-label">{c}<input className="inv-input" maxLength={80} value={s.details?.[c]??''} onChange={e=>set({details:{...s.details,[c]:e.target.value}})}/></label>)}
    <label className="field-label">Tags<small> Separate with commas</small><input className="inv-input" maxLength={250} placeholder="Concentration, Ritual" value={tags} onChange={e=>setTags(e.target.value)}/></label>
   </div>
   <label className="field-label">What it does<small> Write [[2d8+2|Healing]] to put a roll in the text.</small><textarea className="inv-input" rows={5} maxLength={4000} value={s.text??''} onChange={e=>set({text:e.target.value})}/></label>
   <div className="field-label">Rolls<RollsEditor rolls={s.rolls??[]} onSave={(rolls:ItemRoll[])=>set({rolls})}/></div>
   <div className="field-label">Using it spends<small> From one of this character’s trackers, such as slots, power points or stress.</small>
    <div className="spell-cost">
     <select className="inv-input" value={s.cost?.trackerId??''} onChange={e=>set({cost:e.target.value?{trackerId:e.target.value,n:s.cost?.n??1}:null})}><option value="">Nothing</option>{trackers.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select>
     {s.cost&&<input className="inv-input" type="number" min={1} max={1000} aria-label="How many" value={s.cost.n} onChange={e=>set({cost:{...s.cost!,n:Math.max(1,Math.min(1000,Math.round(Number(e.target.value)||1)))}})}/>}
    </div>
    {!trackers.length&&<small>Add a tracker on the Stats tab first, then a {sp.one} can spend from it.</small>}
   </div>
   {sp.ready&&<label className="check-line"><input type="checkbox" checked={!!s.ready} onChange={e=>set({ready:e.target.checked})}/> {sp.ready}</label>}
   {gm&&<label className="check-line"><input type="checkbox" checked={!!s.gm} onChange={e=>set({gm:e.target.checked})}/> Hide from players</label>}
   <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={!s.name.trim()||busy}>{start?'Save':`Add ${sp.one}`}</button></div>
  </form>
 </ToolDialog>;
}

export function SpellsPanel({name,spells,trackers,settings,gm,canEdit,act}:{name:string;spells:Spell[];trackers:Shown[];settings:PlayerItemSettings;gm:boolean;canEdit:boolean;act:Act}){
 const sp=settings.spells,canChange=canEdit&&(gm||settings.players.items);
 const [q,setQ]=useState(''),[onlyReady,setOnlyReady]=useState(false),[open,setOpen]=useState<string|null>(null),[form,setForm]=useState<Spell|'new'|null>(null);
 const used=new Set(spells.flatMap(s=>s.cost?[s.cost.trackerId]:[])),costTrackers=trackers.filter(t=>used.has(t.id));
 const groups=useMemo(()=>{
  const want=q.trim().toLowerCase(),shown=spells.filter(s=>(!onlyReady||s.ready)&&(!want||[s.name,s.text??'',...(s.tags??[])].some(x=>x.toLowerCase().includes(want))));
  const names=[...sp.groups,...new Set(shown.map(s=>s.group??'').filter(g=>g&&!sp.groups.includes(g)))];
  return [...names.map(g=>({name:g,spells:shown.filter(s=>s.group===g)})),{name:'',spells:shown.filter(s=>!s.group||!names.includes(s.group))}].filter(g=>g.spells.length);
 },[spells,q,onlyReady,sp.groups]);
 const save=(s:SpellInput)=>form==='new'?act({action:'spell-add',spell:s}):form?act({action:'spell-edit',spellId:form.id,spell:s}):false;
 return <div className="spells">
  {costTrackers.length>0&&<div className="spell-trackers">{costTrackers.map(t=><TrackerView key={t.id} t={t}/>)}</div>}
  {spells.length>0&&<div className="inv-filters">
   <label className="inv-search"><Search size={14} aria-hidden="true"/><input aria-label={`Find a ${sp.one}`} placeholder={`Find a ${sp.one}`} value={q} onChange={e=>setQ(e.target.value)}/></label>
   {sp.ready&&<div className="segmented"><button type="button" className={!onlyReady?'on':''} onClick={()=>setOnlyReady(false)}>All</button><button type="button" className={onlyReady?'on':''} onClick={()=>setOnlyReady(true)}>{sp.ready}</button></div>}
  </div>}
  {groups.map(g=><section key={g.name||'other'} className="inv-group">
   {(g.name||groups.length>1)&&<div className="inv-group-head"><h3>{g.name||'Other'}</h3><small>{g.spells.length}</small><span className="inv-rule"/></div>}
   <div className="inv-rows" role="list">{g.spells.map(s=>{const isOpen=open===s.id,title=`${name} · ${s.name}`,cost=s.cost?trackers.find(t=>t.id===s.cost!.trackerId):undefined,details=sp.columns.map(c=>s.details?.[c]).filter(Boolean);
    return <div role="listitem" key={s.id} className={`inv-row spell-row${s.gm?' is-hidden':''}`}>
     <div className="inv-line">
      {sp.ready&&<button type="button" className={`icon-button spell-ready${s.ready?' on':''}`} disabled={!canChange} aria-pressed={!!s.ready} aria-label={`${s.name}: ${s.ready?`not ${sp.ready.toLowerCase()}`:sp.ready.toLowerCase()}`} title={s.ready?sp.ready:`Not ${sp.ready.toLowerCase()}`} onClick={()=>void act({action:'spell-edit',spellId:s.id,spell:{ready:!s.ready}})}><Star size={15} fill={s.ready?'currentColor':'none'}/></button>}
      <span className="spell-main">
       <span className="store-name"><button type="button" className="inv-name" aria-expanded={isOpen} onClick={()=>setOpen(isOpen?null:s.id)}>{isOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<span>{s.name}</span></button>{(s.tags??[]).map(t=><span key={t} className="spell-tag">{t}</span>)}{s.gm&&<span className="inv-flag"><EyeOff size={11}/> GM only</span>}</span>
       {details.length>0&&<span className="spell-sub">{details.join(' · ')}</span>}
      </span>
      <span className="spell-actions">
       {(s.rolls??[]).map(r=><RollChip key={r.name} title={title} formula={r.formula} label={r.name}/>)}
       {s.cost&&<button type="button" className="spell-cast" disabled={!canEdit||!cost||cost.value<s.cost.n} title={cost?`${cost.label}: ${cost.value} of ${cost.max} left`:'Its tracker is gone'} onClick={()=>void act({action:'cast',spellId:s.id})}><Sparkles size={13}/>{sp.verb}<small>−{s.cost.n} {cost?.label??'?'}</small></button>}
       {gm&&<button type="button" className={`icon-button inv-eye${s.gm?' off':''}`} aria-pressed={!s.gm} aria-label={s.gm?`Show ${s.name} to players`:`Hide ${s.name} from players`} onClick={()=>void act({action:'spell-edit',spellId:s.id,spell:{gm:!s.gm}})}>{s.gm?<EyeOff size={14}/>:<Eye size={14}/>}</button>}
      </span>
     </div>
     {isOpen&&<div className="inv-detail read">
      {s.text?<NoteText text={s.text} title={title}/>:<p className="muted">No text yet.</p>}
      {canChange&&<div className="inv-detail-tools"><button type="button" className="button small" onClick={()=>setForm(s)}><Pencil size={14}/> Change</button><button type="button" className="button small danger inv-remove" onClick={async()=>{if(await confirmDialog({title:`Remove ${s.name}?`,message:`The ${sp.one}, its text and its rolls go.`,confirm:'Remove',danger:true}))void act({action:'spell-remove',spellId:s.id});}}><Trash2 size={14}/> Remove</button></div>}
     </div>}
    </div>;})}</div>
  </section>)}
  {!spells.length&&<p className="muted inv-empty">No {sp.tab.toLowerCase()} yet.</p>}
  {spells.length>0&&!groups.length&&<p className="muted inv-empty">Nothing matches.</p>}
  {canChange&&<div className="button-row"><button type="button" className="button" onClick={()=>setForm('new')}><Plus size={14}/> Add a {sp.one}</button></div>}
  {canEdit&&!gm&&!settings.players.items&&<p className="aside-hint">Your GM keeps this list. Ask them to add or change {sp.tab.toLowerCase()}.</p>}
  {form&&<SpellForm start={form==='new'?undefined:form} settings={settings} trackers={trackers} gm={gm} onSave={save} onClose={()=>setForm(null)}/>}
 </div>;
}
