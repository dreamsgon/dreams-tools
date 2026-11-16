'use client';
/*
 * A character's Stats tab as a sheet you roll from, laid out like the Spells tab: the campaign's stat form in its groups
 * (sections), each stat a row with its value (− / + on numbers) and its named rolls, like a spell's Attack and Damage.
 * Add a stat and Change open one dialog, like Add a spell. Stats belong to the campaign's form, so every character in
 * the campaign has the same rows; the values are this character's. Rolling never changes the encyclopedia.
 */
import {useContext,useMemo,useState} from 'react';
import {ChevronDown,ChevronRight,Dices,EyeOff,ListOrdered,Minus,Pencil,Plus,Search,Trash2,X} from 'lucide-react';
import {defaultCharacter,newId,statFieldSchema,type Campaign,type CharacterData,type Entry,type StatField,type Workspace} from '@/lib/encyclopedia/world-model';
import {MAX_STAT_ROLLS,placeStat,statRollDice,statRollHint,statRollPreview,statRolls,type StatRoll} from '@/lib/encyclopedia/stat-rolls';
import {isSingleD20,type RollMode} from '@/lib/rolls';
import {RollHandler,rollInline} from './rolls';
import {ToolDialog} from './tool-dialog';
import {confirmDialog} from '../confirm-dialog';
import './inventory.css';
import './stat-sheet.css';

type Value=string|number|boolean|null;
const typeNames:Record<StatField['type'],string>={number:'A number, with − and +',text:'A word or short text',textarea:'Long text',checkbox:'A checkbox (trained, ready…)',select:'A choice from a list',none:'No value, just rolls'};
const modeNames:Record<RollMode,string>={normal:'Normal',high:'Advantage',low:'Disadvantage'};

/** The stat's sections in form order, each with its stats. */
function groupsOf(fields:StatField[]){
 const out:{name:string;fields:StatField[]}[]=[];
 for(const f of fields){const g=out.find(x=>x.name===f.section);if(g)g.fields.push(f);else out.push({name:f.section,fields:[f]});}
 return out;
}

export function StatSheet({entry,data,campaign,onChange,onFields,onArrange}:{entry:Entry;data:Workspace;campaign?:Campaign;onChange:(c:CharacterData)=>void;onFields:(f:StatField[])=>void;onArrange:()=>void}){
 const [q,setQ]=useState(''),[open,setOpen]=useState<Set<string>>(new Set),[form,setForm]=useState<StatField|'new'|null>(null),[mode,setMode]=useState<RollMode>('normal');
 const handler=useContext(RollHandler);
 const c=entry.character??defaultCharacter(),all=campaign?.statFields??[],fields=all.filter(f=>!f.archived),values=c.statsByCampaign[campaign?.id??'']??{};
 const groups=useMemo(()=>{const want=q.trim().toLowerCase();return groupsOf(fields.filter(f=>!want||[f.label,f.section,f.note??''].some(x=>x.toLowerCase().includes(want))));},[fields,q]);
 if(!campaign)return <div className="info-note">Choose a campaign to use its sheet. Shared characters keep separate stat values in each campaign.</div>;
 const set=(id:string,value:Value)=>onChange({...c,statsByCampaign:{...c.statsByCampaign,[campaign.id]:{...values,[id]:value}}});
 const anyRoll=fields.some(f=>statRolls(f).length>0),anyD20=fields.some(f=>statRolls(f).some(r=>isSingleD20(r.formula)));
 const roll=(f:StatField,r:StatRoll,dice:string)=>{
  const title=`${entry.title} · ${f.label}${statRolls(f).length>1||r.name!=='Roll'?` · ${r.name}`:''}`;
  if(handler)handler(title,dice);else rollInline(title,dice,{mode:anyD20&&!isSingleD20(dice)?'normal':mode});
  setMode('normal');
 };
 const toggle=(id:string)=>setOpen(o=>{const s=new Set(o);if(s.has(id))s.delete(id);else s.add(id);return s;});
 const sections=[...new Set(fields.map(f=>f.section).filter(Boolean))];
 const hasValues=(id:string)=>data.entries.some(e=>{const v=e.character?.statsByCampaign[campaign.id]?.[id];return v!==undefined&&v!==null&&v!=='';});
 return <div className="stat-sheet">
  <div className="section-heading"><div><h2>{campaign.name} sheet</h2><p className="aside-hint">Every character in this campaign has these stats. Click a roll to roll it.</p></div></div>
  {fields.length>0&&<div className="stat-sheet-tools">
   {fields.length>6&&<label className="inv-search"><Search size={14} aria-hidden="true"/><input aria-label="Find a stat" placeholder="Find a stat" value={q} onChange={e=>setQ(e.target.value)}/></label>}
   {anyRoll&&!handler&&<div className="stat-sheet-mode" role="radiogroup" aria-label="Next roll">{(['normal','high','low'] as RollMode[]).map(m=><button key={m} type="button" role="radio" aria-checked={mode===m} className={mode===m?'on':''} onClick={()=>setMode(m)}>{anyD20||m==='normal'?modeNames[m]:m==='high'?'Keep higher':'Keep lower'}</button>)}</div>}
  </div>}
  {!fields.length&&<div className="character-empty"><h3>Build the sheet your campaign needs.</h3><p>Add stats in groups, like Attributes or Skills, and give each one the rolls your game uses. Nothing comes from a rulebook.</p><button className="button primary" onClick={()=>setForm('new')}><Plus size={15}/> Add a stat</button></div>}
  {groups.map(g=><section key={g.name||'other'} className="inv-group stat-group">
   {(g.name||groups.length>1)&&<div className="inv-group-head"><h3>{g.name||'Other'}</h3><small>{g.fields.length}</small><span className="inv-rule"/></div>}
   <div className="inv-rows" role="list">{g.fields.map(f=>{
    const isOpen=open.has(f.id),v=values[f.id]??null,rolls=statRolls(f),ready=rolls.map(r=>({r,dice:statRollDice(r.formula,v)})),hint=ready.find(x=>!x.dice);
    return <div role="listitem" key={f.id} className={`inv-row stat-row${f.visibility==='gm'?' is-hidden':''}`}>
     <div className="inv-line stat-line">
      <span className="stat-main">
       <span className="store-name"><button type="button" className="inv-name" aria-expanded={isOpen} onClick={()=>toggle(f.id)}>{isOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<span>{f.label}</span></button>{f.visibility==='gm'&&<span className="inv-flag"><EyeOff size={11}/> GM only</span>}</span>
       {f.note&&<span className="stat-sub">{f.note}</span>}
      </span>
      {f.type!=='textarea'&&f.type!=='none'&&<span className="stat-value"><ValueInput f={f} v={v} onSet={x=>set(f.id,x)}/></span>}
      <span className="stat-actions">
       {ready.map(({r,dice})=>dice&&<button type="button" key={r.name} className="roll-chip stat-roll-chip" title={`Roll ${dice}`} onClick={()=>roll(f,r,dice)}><Dices size={12} aria-hidden="true"/>{r.name}<span className="stat-dice">{dice}</span></button>)}
      </span>
     </div>
     {f.type==='textarea'&&<div className="stat-long"><ValueInput f={f} v={v} onSet={x=>set(f.id,x)}/></div>}
     {hint?.dice===null&&<p className="stat-roll-hint">{rolls.length>1?`${hint.r.name}: `:''}{statRollHint(hint.r.formula,v,f.type)}</p>}
     {isOpen&&<div className="inv-detail read stat-detail">
      {rolls.length?<p className="stat-formulas">{rolls.map(r=><code key={r.name}>{r.name}: {r.formula}</code>)}</p>:<p className="muted">No rolls. Add one with Change.</p>}
      <div className="inv-detail-tools"><button type="button" className="button small" onClick={()=>setForm(f)}><Pencil size={14}/> Change</button><button type="button" className="button small danger inv-remove" onClick={async()=>{if(await confirmDialog({title:`Remove ${f.label}?`,message:`It leaves the sheet of every character in ${campaign.name}. Their values are kept, and Arrange stats can bring it back.`,confirm:'Remove',danger:true}))onFields(all.map(x=>x.id===f.id?{...x,archived:true}:x));}}><Trash2 size={14}/> Remove</button></div>
     </div>}
    </div>;})}</div>
  </section>)}
  {fields.length>0&&!groups.length&&<p className="muted inv-empty">Nothing matches.</p>}
  {fields.length>0&&<div className="button-row stat-sheet-add"><button type="button" className="button" onClick={()=>setForm('new')}><Plus size={14}/> Add a stat</button><button type="button" className="button" onClick={onArrange}><ListOrdered size={14}/> Arrange stats</button></div>}
  {form&&<StatForm start={form==='new'?undefined:form} campaign={campaign} sections={sections} locked={form!=='new'&&hasValues(form.id)} onClose={()=>setForm(null)} onSave={f=>{onFields(form==='new'?placeStat(all,f):all.map(x=>x.id===f.id?f:x));setForm(null);}}/>}
 </div>;
}

/** The value control for one stat: − / + on numbers, a box, a checkbox or a list. */
function ValueInput({f,v,onSet}:{f:StatField;v:Value;onSet:(v:Value)=>void}){
 const label=`${f.label} value`;
 if(f.type==='checkbox')return <input type="checkbox" className="stat-check" aria-label={f.label} checked={v===true} onChange={e=>onSet(e.target.checked)}/>;
 if(f.type==='textarea')return <textarea className="inv-input" aria-label={label} rows={3} maxLength={10000} value={String(v??'')} onChange={e=>onSet(e.target.value)}/>;
 if(f.type==='select')return <select className="inv-input stat-select" aria-label={label} value={String(v??'')} onChange={e=>onSet(e.target.value)}><option value="">Not set</option>{v!=null&&v!==''&&!f.options.includes(String(v))&&<option value={String(v)}>{String(v)} (previous value)</option>}{f.options.map(o=><option key={o}>{o}</option>)}</select>;
 if(f.type==='number'){const n=typeof v==='number'?v:null;return <span className="stat-number">
  <button type="button" className="icon-button" aria-label={`Lower ${f.label}`} onClick={()=>onSet((n??0)-1)}><Minus size={13}/></button>
  <input type="number" className="inv-input" aria-label={label} step="any" value={n??''} onChange={e=>onSet(e.target.value===''?null:Number(e.target.value))}/>
  <button type="button" className="icon-button" aria-label={`Raise ${f.label}`} onClick={()=>onSet((n??0)+1)}><Plus size={13}/></button>
 </span>;}
 return <input className="inv-input stat-text" aria-label={label} maxLength={10000} value={typeof v==='boolean'?'':String(v??'')} onChange={e=>onSet(e.target.value)}/>;
}

/** Add a stat / Change a stat: name, group, value, a note, its rolls and who sees it. */
function StatForm({start,campaign,sections,locked,onSave,onClose}:{start?:StatField;campaign:Campaign;sections:string[];locked:boolean;onSave:(f:StatField)=>void;onClose:()=>void}){
 const [f,setF]=useState<StatField>(()=>start?{...start,rolls:statRolls(start)}:{id:newId(),label:'',section:sections[0]??'',type:'number',options:[],visibility:'players',archived:false,rolls:[{name:'Roll',formula:'1d20+{value}'}]});
 const [options,setOptions]=useState((start?.options??[]).join(', ')),[error,setError]=useState('');
 const set=(p:Partial<StatField>)=>setF(x=>({...x,...p}));
 const rolls=f.rolls??[],setRoll=(i:number,p:Partial<StatRoll>)=>set({rolls:rolls.map((r,j)=>j===i?{...r,...p}:r)});
 const submit=()=>{
  const kept=rolls.map(r=>({name:r.name.trim(),formula:r.formula.replace(/\s+/g,'')})).filter(r=>r.name||r.formula);
  if(kept.some(r=>!r.name))return setError('Give every roll a name, like Check or Damage.');
  if(kept.some(r=>statRollPreview(r.formula,f.type).bad))return setError('A roll needs dice the roller reads, like 1d20+3 or 1d20+{value}.');
  if(new Set(kept.map(r=>r.name.toLowerCase())).size!==kept.length)return setError('Give each roll its own name.');
  const {roll:_r,rollFormula:_rf,...rest}=f;void _r;void _rf;
  const next={...rest,label:f.label.trim(),section:f.section.trim(),note:f.note?.trim()||undefined,rolls:kept,options:f.type==='select'?options.split(',').map(o=>o.trim()).filter(Boolean):[]};
  const parsed=statFieldSchema.safeParse(next);
  if(!parsed.success)return setError(parsed.error.issues[0].message);
  onSave(parsed.data);
 };
 return <ToolDialog title={start?`Change ${start.label}`:'Add a stat'} onClose={onClose} wide>
  <form className="spell-form stat-form" onSubmit={e=>{e.preventDefault();submit();}}>
   <div className="spell-form-grid">
    <label className="field-label">Name<input className="inv-input" autoFocus required maxLength={160} placeholder="Strength, Piloting, Cool…" value={f.label} onChange={e=>set({label:e.target.value})}/></label>
    <label className="field-label">Group<input className="inv-input" list="stat-groups" maxLength={100} placeholder="Attributes, Skills… or none" value={f.section} onChange={e=>set({section:e.target.value})}/><datalist id="stat-groups">{sections.map(s=><option key={s} value={s}/>)}</datalist></label>
    <label className="field-label">Value{locked&&<small> Characters have values for this, so it keeps its kind. Add a new stat for a different kind.</small>}<select className="inv-input" disabled={locked} value={f.type} onChange={e=>set({type:e.target.value as StatField['type']})}>{(Object.keys(typeNames) as StatField['type'][]).map(t=><option key={t} value={t}>{typeNames[t]}</option>)}</select></label>
    <label className="field-label">Under the name<small> Optional short note</small><input className="inv-input" maxLength={120} placeholder="Agility · trained" value={f.note??''} onChange={e=>set({note:e.target.value})}/></label>
    {f.type==='select'&&<label className="field-label">Choices<small> Separate with commas</small><input className="inv-input" maxLength={2000} value={options} onChange={e=>setOptions(e.target.value)}/></label>}
   </div>
   <div className="field-label">Rolls<small> Write <code>{'{value}'}</code> for this stat’s value, like 1d20+{'{value}'}, or plain dice like 2d6+1.</small>
    <div className="stat-roll-rows">{rolls.map((r,i)=>{const p=statRollPreview(r.formula,f.type);return <div className="stat-roll-edit" key={i}>
     <input className="inv-input" aria-label={`Roll ${i+1} name`} placeholder="Check, Save, Damage…" maxLength={40} value={r.name} onChange={e=>setRoll(i,{name:e.target.value})}/>
     <input className={`inv-input stat-formula${p.bad?' bad':''}`} aria-label={`Roll ${i+1} dice`} placeholder="1d20+{value}" maxLength={200} value={r.formula} onChange={e=>setRoll(i,{formula:e.target.value})}/>
     <button type="button" className="icon-button" aria-label={`Remove roll ${r.name||i+1}`} onClick={()=>set({rolls:rolls.filter((_,j)=>j!==i)})}><X size={14}/></button>
     <small className={`stat-preview${p.bad?' bad':''}`} aria-live="polite">{p.text}</small>
    </div>;})}</div>
    {rolls.length<MAX_STAT_ROLLS&&<button type="button" className="button small stat-add-roll" onClick={()=>set({rolls:[...rolls,{name:rolls.length?'':'Roll',formula:''}]})}><Plus size={14}/> Add a roll</button>}
   </div>
   <p className="aside-hint">Every character in {campaign.name} gets this stat. Values stay separate for each character.</p>
   <label className="check-line"><input type="checkbox" checked={f.visibility==='gm'} onChange={e=>set({visibility:e.target.checked?'gm':'players'})}/> GM only, players never see it</label>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={!f.label.trim()}>{start?'Save':'Add stat'}</button></div>
  </form>
 </ToolDialog>;
}
