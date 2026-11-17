'use client';
/*
 * A character's Stats tab as a sheet you roll from, laid out like the Spells tab: the campaign's stat form in its groups
 * (sections), each stat a row with its value (− / + on numbers) and its named rolls, like a spell's Attack and Damage.
 * Add a stat and Change open one dialog, like Add a spell. Stats belong to the campaign's form, so every character in
 * the campaign has the same rows; the values are this character's. Rolling never changes the encyclopedia.
 */
import {useContext,useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,Check,ChevronDown,ChevronRight,Dices,EyeOff,Info,LayoutGrid,LayoutTemplate,Minus,Pencil,Plus,Search,Settings2,Square,Trash2,X} from 'lucide-react';
import {defaultCharacter,newId,statFieldSchema,type Campaign,type CharacterData,type Entry,type StatField,type Workspace} from '@/lib/encyclopedia/world-model';
import {MAX_STAT_ROLLS,derivedValue,modKey,statModifier,placeStat,rollOutcome,sheetOf,statRollDice,statRollHint,statRollPreview,statRolls,renameStatRefs,targetNumber,type SheetStat,type StatRoll} from '@/lib/encyclopedia/stat-rolls';
import {STAT_LAYOUTS,addLayout,type StatLayout} from '@/lib/encyclopedia/stat-layouts';
import {arrangeStats,formFromArrangement,moveStat,moveStatGroup,shownStats,statGroups,statOff,tidy,toggleStat,type StatArrangement} from '@/lib/encyclopedia/stat-arrange';
import {combineScorePairs,scorePairs} from '@/lib/encyclopedia/stat-scores';
import {setTrackerValue} from '@/lib/encyclopedia/trackers';
import {isSingleD20,type RollMode} from '@/lib/rolls';
import {RollHandler,rollInline} from './rolls';
import {ToolDialog} from './tool-dialog';
import {confirmDialog} from '../confirm-dialog';
import './inventory.css';
import {GroupHead,useCollapsed} from './group-collapse';
import './stat-sheet.css';

type Value=string|number|boolean|null;
const typeNames:Record<StatField['type'],string>={number:'A number, with − and +',text:'A word or short text',textarea:'Long text',checkbox:'A checkbox (trained, ready…)',select:'A choice from a list',none:'No value, just rolls'};
const modeNames:Record<RollMode,string>={normal:'Normal',high:'Advantage',low:'Disadvantage'};
const signed=(n:number)=>n<0?`−${-n}`:`+${n}`;
const trackerOf=(c:CharacterData,label:string)=>(c.trackers??[]).find(t=>t.label.trim().toLowerCase()===label.trim().toLowerCase());

export function StatSheet({entry,data,campaign,onChange,onFields,onArrange,change}:{entry:Entry;data:Workspace;campaign?:Campaign;onChange:(c:CharacterData)=>void;onFields:(f:StatField[])=>void;onArrange:()=>void;change?:(f:(w:Workspace)=>Workspace)=>boolean|void}){
 const [q,setQ]=useState(''),[open,setOpen]=useState<Set<string>>(new Set),[form,setForm]=useState<StatField|'new'|null>(null),[mode,setMode]=useState<RollMode>('normal'),[layouts,setLayouts]=useState(false),[notice,setNotice]=useState('');
 const [arranging,setArranging]=useState(false),[scope,setScope]=useState<'one'|'all'>('one');
 const collapse=useCollapsed(`stats:${campaign?.id??''}`);
 const handler=useContext(RollHandler);
 const c=entry.character??defaultCharacter(),all=campaign?.statFields??[],fields=all.filter(f=>!f.archived),values=c.statsByCampaign[campaign?.id??'']??{},layout=c.statLayout;
 const sheet=sheetOf(all,values);
 const listed=useMemo(()=>arranging?arrangeStats(fields,layout):shownStats(fields,layout),[fields,layout,arranging]);
 const groups=useMemo(()=>{const want=arranging?'':q.trim().toLowerCase();return statGroups(listed.filter(f=>!want||[f.label,f.section,f.note??''].some(x=>x.toLowerCase().includes(want))));},[listed,q,arranging]);
 if(!campaign)return <div className="info-note">Choose a campaign to use its sheet. Shared characters keep separate stat values in each campaign.</div>;
 const set=(id:string,value:Value)=>onChange({...c,statsByCampaign:{...c.statsByCampaign,[campaign.id]:{...values,[id]:value}}});
 const setLayout=(next:StatArrangement|undefined)=>{const {statLayout:_old,...rest}=c;void _old;const tidied=tidy(next,new Set(fields.map(f=>f.id)));onChange(tidied?{...rest,statLayout:tidied}:rest);};
 const anyRoll=fields.some(f=>statRolls(f).length>0),anyD20=fields.some(f=>statRolls(f).some(r=>isSingleD20(r.formula)));
 const offCount=fields.filter(f=>statOff(layout,f.id)).length,pairs=scorePairs(all);
 const roll=(f:StatField,r:StatRoll,dice:string)=>{
  const title=`${entry.title} · ${f.label}${statRolls(f).length>1||r.name!=='Roll'?` · ${r.name}`:''}`;
  const v=values[f.id]??null;
  setMode('normal');
  if(handler){handler(title,dice);return;}
  // A stat that spends (like 1 Stress) spends only when the roll goes ahead, not when the roll dialog is cancelled.
  void rollInline(title,dice,{mode:anyD20&&!isSingleD20(dice)?'normal':mode,outcome:r.success?t=>rollOutcome(t,r.success,v,sheet):undefined}).then(done=>{
   const t=f.spend?trackerOf(c,f.spend.tracker):undefined;
   if(done&&f.spend&&t)onChange({...c,trackers:setTrackerValue(c.trackers??[],t.id,t.value-f.spend.n)});
  });
 };
 function applyLayout(l:StatLayout){
  const r=addLayout(all,l,newId);
  if(r.added)onFields(r.fields);
  setNotice(r.added?`Added ${r.added} stat${r.added===1?'':'s'} from ${l.name}.${r.skipped.length?` Skipped ${r.skipped.join(', ')}, already on the sheet.`:''} Rename them and fill in values to suit your game.`:`Every stat in ${l.name} is already on the sheet.`);
 }
 async function done(){
  if(scope==='all'&&layout){
   if(!await confirmDialog({title:`Arrange ${campaign!.name}’s sheet like this for every character?`,message:`Every character in ${campaign!.name} gets this order.${offCount?` The ${offCount} stat${offCount===1?' that is':'s that are'} off leave${offCount===1?'s':''} every sheet; their values are kept, and Stat form can bring them back.`:''} Characters arranged on their own keep their own order.`,confirm:'Use for everyone'}))return;
   onFields(formFromArrangement(all,layout));
   const {statLayout:_old,...rest}=c;void _old;onChange(rest);
   setNotice(`Every character in ${campaign!.name} now has this sheet.`);
  }
  setArranging(false);setScope('one');
 }
 async function combine(){
  if(!change||!campaign)return;
  const names=pairs.map(p=>p.name);
  if(!await confirmDialog({title:'Make score boxes?',message:`${names.join(', ')} each become one box with the score and its modifier, for every character in ${campaign.name}. Modifiers are copied beside the scores, rolls move with them, and the separate modifier stats are archived (Stat form can bring them back).`,confirm:'Make score boxes'}))return;
  let made:string[]=[];
  if(change(w=>{const r=combineScorePairs(w,campaign.id);made=r.combined;return r.data;})!==false)setNotice(made.length?`Made ${made.length} score box${made.length===1?'':'es'}: ${made.join(', ')}.`:'Nothing to combine.');
 }
 const toggle=(id:string)=>setOpen(o=>{const s=new Set(o);if(s.has(id))s.delete(id);else s.add(id);return s;});
 const sections=[...new Set(fields.map(f=>f.section).filter(Boolean))];
 const hasValues=(id:string)=>data.entries.some(e=>{const v=e.character?.statsByCampaign[campaign.id]?.[id];return v!==undefined&&v!==null&&v!=='';});
 const setLook=(f:StatField,box:boolean)=>onFields(all.map(x=>{if(x.id!==f.id)return x;const {look:_l,...rest}=x;void _l;return box?{...rest,look:'score' as const}:rest;}));

 const chips=(f:StatField,compact=false)=>{
  const v=values[f.id]??null,tracker=f.spend?trackerOf(c,f.spend.tracker):undefined,short=!!f.spend&&!handler&&(!tracker||tracker.value<f.spend.n);
  return <>{statRolls(f).map(r=>{const dice=statRollDice(r.formula,v,sheet);if(!dice)return null;const need=targetNumber(r.success,v,sheet);return <button type="button" key={r.name} className="roll-chip stat-roll-chip" disabled={short} title={short?(tracker?`Needs ${f.spend!.n} ${tracker.label}; ${tracker.value} left`:`Add a tracker called ${f.spend!.tracker} to this character to roll this`):`Roll ${dice}${need?`, ${r.success!.op==='atLeast'?`needs ${need} or more`:`needs ${need} or under`}`:''}${f.spend?`, spends ${f.spend.n} ${f.spend.tracker}`:''}`} onClick={()=>roll(f,r,dice)}><Dices size={12} aria-hidden="true"/>{r.name}{!compact&&<span className="stat-dice">{dice}{need?` ${r.success!.op==='atLeast'?'≥':'≤'} ${need}`:''}</span>}</button>;})}
   {f.spend&&!compact&&<small className={`stat-spend${short?' short':''}`}>−{f.spend.n} {tracker?.label??f.spend.tracker}{tracker?` (${tracker.value} left)`:''}</small>}</>;
 };
 const details=(f:StatField)=>{const rolls=statRolls(f);return <div className="inv-detail read stat-detail">
  {f.description&&<p className="stat-description">{f.description}</p>}
  {rolls.length?<p className="stat-formulas">{rolls.map(r=><code key={r.name}>{r.name}: {r.formula}{r.success?` (${r.success.op==='atLeast'?'at least':'at most'} ${r.success.against})`:''}</code>)}{f.derived&&<code>{f.look==='score'?'Modifier when none is typed':'Beside the value'}: {f.derived}</code>}</p>:<p className="muted">No rolls. Add one with Change.</p>}
  <div className="inv-detail-tools"><button type="button" className="button small" onClick={()=>setForm(f)}><Pencil size={14}/> Change</button><button type="button" className="button small danger inv-remove" onClick={async()=>{if(await confirmDialog({title:`Remove ${f.label}?`,message:`It leaves the sheet of every character in ${campaign.name}. Their values are kept, and Stat form can bring it back.`,confirm:'Remove',danger:true}))onFields(all.map(x=>x.id===f.id?{...x,archived:true}:x));}}><Trash2 size={14}/> Remove</button></div>
 </div>;};

 const box=(f:StatField)=>{
  const v=values[f.id]??null,mod=values[modKey(f.id)],worked=statModifier({derived:f.derived,value:v,mod},sheet),auto=f.derived?derivedValue({derived:f.derived,value:v},sheet):null,isOpen=open.has(f.id);
  return <div role="listitem" key={f.id} className={`stat-box${f.visibility==='gm'?' is-hidden':''}${isOpen?' is-open':''}`}>
   <button type="button" className="stat-box-label" aria-expanded={isOpen} title={f.description??'Details, Change and Remove'} onClick={()=>toggle(f.id)}>{f.label}{f.visibility==='gm'&&<EyeOff size={11} aria-label="GM only"/>}</button>
   <ModInput label={`${f.label} modifier`} value={mod} placeholder={auto!==null?signed(auto):worked===null?'±0':signed(worked)} onSet={x=>set(modKey(f.id),x)}/>
   <span className="stat-box-score"><input type="number" className="stat-box-score-input" aria-label={`${f.label} score`} step="any" value={typeof v==='number'?v:''} placeholder="—" onChange={e=>set(f.id,e.target.value===''?null:Number(e.target.value))}/></span>
   {f.note&&<small className="stat-box-note">{f.note}</small>}
   <span className="stat-box-rolls">{chips(f,true)}</span>
  </div>;
 };
 const row=(f:StatField)=>{
  const isOpen=open.has(f.id),v=values[f.id]??null,rolls=statRolls(f),hint=rolls.map(r=>({r,dice:statRollDice(r.formula,v,sheet)})).find(x=>!x.dice);
  const worked=f.derived?derivedValue({derived:f.derived,value:v},sheet):null;
  return <div role="listitem" key={f.id} className={`inv-row stat-row${f.visibility==='gm'?' is-hidden':''}`}>
   <div className="inv-line stat-line">
    <span className="stat-main">
     <span className="store-name"><button type="button" className="inv-name" aria-expanded={isOpen} title={f.description} onClick={()=>toggle(f.id)}>{isOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<span>{f.label}</span>{f.description&&<Info size={12} className="stat-info" aria-label="Has a description"/>}</button>{f.visibility==='gm'&&<span className="inv-flag"><EyeOff size={11}/> GM only</span>}</span>
     {f.note&&<span className="stat-sub">{f.note}</span>}
    </span>
    {f.type!=='textarea'&&f.type!=='none'&&<span className="stat-value"><ValueInput f={f} v={v} onSet={x=>set(f.id,x)}/>{worked!==null&&<span className="stat-worked" title={`Worked out: ${f.derived}`}>{signed(worked)}</span>}</span>}
    <span className="stat-actions">{chips(f)}</span>
   </div>
   {f.type==='textarea'&&<div className="stat-long"><ValueInput f={f} v={v} onSet={x=>set(f.id,x)}/></div>}
   {hint&&<p className="stat-roll-hint">{rolls.length>1?`${hint.r.name}: `:''}{statRollHint(hint.r.formula,v,f.type,sheet)}</p>}
   {isOpen&&details(f)}
  </div>;
 };
 const arrangeRow=(f:StatField,g:{fields:StatField[]})=>{
  const off=statOff(layout,f.id),at=g.fields.indexOf(f),v=values[f.id];
  return <div role="listitem" key={f.id} className={`stat-arrange-row${off?' is-off':''}`}>
   <button type="button" className="stat-switch" role="switch" aria-checked={!off} aria-label={`Show ${f.label} on this sheet`} onClick={()=>setLayout(toggleStat(layout,f.id))}><span/></button>
   <span className="stat-arrange-name"><strong>{f.label}</strong><small>{off?'Off on this sheet':v===undefined||v===null||v===''?'No value':typeof v==='boolean'?(v?'Yes':'No'):String(v).slice(0,40)}</small></span>
   {f.type==='number'&&<button type="button" className="stat-look-toggle" aria-pressed={f.look==='score'} title={`Show as a score box with a modifier, for every character in ${campaign.name}`} onClick={()=>setLook(f,f.look!=='score')}><Square size={13}/> Score box</button>}
   <span className="stat-arrange-move"><button type="button" className="icon-button" aria-label={`Move ${f.label} up`} disabled={at===0} onClick={()=>setLayout({...layout,order:moveStat(listed,f.id,-1)})}><ArrowUp size={14}/></button><button type="button" className="icon-button" aria-label={`Move ${f.label} down`} disabled={at===g.fields.length-1} onClick={()=>setLayout({...layout,order:moveStat(listed,f.id,1)})}><ArrowDown size={14}/></button></span>
  </div>;
 };

 return <div className={`stat-sheet${arranging?' is-arranging':''}`}>
  <div className="section-heading stat-sheet-head"><div><h2>{campaign.name} sheet</h2><p className="aside-hint">{arranging?'Switch stats off, move them, and show numbers as score boxes.':`Every character in this campaign has these stats. Click a roll to roll it.${offCount?` ${offCount} ${offCount===1?'is':'are'} off on ${entry.title}’s sheet.`:''}`}</p></div>
   {fields.length>0&&!arranging&&<button type="button" className="button small" onClick={()=>{setArranging(true);setOpen(new Set);}}><LayoutGrid size={14}/> Arrange</button>}</div>
  {arranging&&<div className="org-arrange-bar stat-arrange-bar" role="region" aria-label="Arrange the sheet"><p><strong>Arranging {entry.title}’s sheet.</strong> Off stats are hidden here and from players.</p>
   <fieldset className="org-scope"><legend className="sr-only">Who this order is for</legend>
    <label><input type="radio" name="stat-scope" checked={scope==='one'} onChange={()=>setScope('one')}/> Just {entry.title}</label>
    <label><input type="radio" name="stat-scope" checked={scope==='all'} onChange={()=>setScope('all')}/> Every character in {campaign.name}</label></fieldset>
   {layout&&<button type="button" className="text-button" onClick={()=>setLayout(undefined)}>Reset to the campaign’s order</button>}
   <button type="button" className="button small primary" onClick={()=>void done()}><Check size={14}/> Done</button></div>}
  {!arranging&&pairs.length>0&&change&&<div className="stat-pairs-note"><Square size={16} aria-hidden="true"/><p>{pairs.length===1?`${pairs[0].name} has a score and a modifier as two stats.`:`${pairs.slice(0,3).map(p=>p.name).join(', ')}${pairs.length>3?` and ${pairs.length-3} more`:''} have scores and modifiers as separate stats.`} Show each as one score box, like a printed sheet?</p><button type="button" className="button small" onClick={()=>void combine()}>Make score boxes</button></div>}
  {fields.length>0&&!arranging&&<div className="stat-sheet-tools">
   {fields.length>6&&<label className="inv-search"><Search size={14} aria-hidden="true"/><input aria-label="Find a stat" placeholder="Find a stat" value={q} onChange={e=>setQ(e.target.value)}/></label>}
   {anyRoll&&!handler&&<div className="stat-sheet-mode" role="radiogroup" aria-label="Next roll">{(['normal','high','low'] as RollMode[]).map(m=><button key={m} type="button" role="radio" aria-checked={mode===m} className={mode===m?'on':''} onClick={()=>setMode(m)}>{anyD20||m==='normal'?modeNames[m]:m==='high'?'Keep higher':'Keep lower'}</button>)}</div>}
  </div>}
  {!fields.length&&<div className="character-empty"><h3>Build the sheet your campaign needs.</h3><p>Add stats in groups, like Attributes or Skills, and give each one the rolls your game uses. Nothing comes from a rulebook.</p><button className="button primary" onClick={()=>setForm('new')}><Plus size={15}/> Add a stat</button><LayoutPicker onPick={applyLayout}/></div>}
  {groups.map((g,gi)=>{
   const shut=!arranging&&!q.trim()&&(!!g.name||groups.length>1)&&collapse.isClosed(g.name),boxes=arranging?[]:g.fields.filter(f=>f.look==='score'&&f.type==='number'),rows=arranging?g.fields:g.fields.filter(f=>!boxes.includes(f)),openBox=boxes.filter(f=>open.has(f.id));
   return <section key={g.name||'other'} className="inv-group stat-group">
    {(g.name||groups.length>1||arranging)&&(arranging?<div className="inv-group-head"><h3>{g.name||'Other'}</h3><small>{g.fields.length}</small><span className="inv-rule"/>
     {groups.length>1&&<span className="stat-arrange-move"><button type="button" className="icon-button" aria-label={`Move ${g.name||'Other'} up`} disabled={gi===0} onClick={()=>setLayout({...layout,order:moveStatGroup(listed,g.name,-1)})}><ArrowUp size={14}/></button><button type="button" className="icon-button" aria-label={`Move ${g.name||'Other'} down`} disabled={gi===groups.length-1} onClick={()=>setLayout({...layout,order:moveStatGroup(listed,g.name,1)})}><ArrowDown size={14}/></button></span>}</div>
     :<GroupHead title={g.name||'Other'} count={g.fields.length} closed={shut} onToggle={()=>collapse.toggle(g.name)}/>)}
    {!shut&&<>{boxes.length>0&&<div className="stat-boxes" role="list" aria-label={`${g.name||'Stats'} scores`}>{boxes.map(box)}</div>}
    {openBox.map(f=><div key={f.id} className="stat-box-detail"><strong>{f.label}</strong>{details(f)}</div>)}
    {rows.length>0&&<div className={arranging?'stat-arrange-rows':'inv-rows'} role="list">{rows.map(f=>arranging?arrangeRow(f,g):row(f))}</div>}</>}
   </section>;})}
  {fields.length>0&&!groups.length&&<p className="muted inv-empty">{listed.length?'Nothing matches.':`Every stat is off on ${entry.title}’s sheet. Use Arrange to switch some on.`}</p>}
  {fields.length>0&&!arranging&&<div className="button-row stat-sheet-add"><button type="button" className="button" onClick={()=>setForm('new')}><Plus size={14}/> Add a stat</button><button type="button" className="button" onClick={()=>setLayouts(true)}><LayoutTemplate size={14}/> Add a layout</button><button type="button" className="button" onClick={onArrange}><Settings2 size={14}/> Stat form</button></div>}
  {notice&&<p role="status" className="aside-hint stat-layout-notice">{notice}</p>}
  {layouts&&<ToolDialog title="Add a layout" onClose={()=>setLayouts(false)} wide><p className="aside-hint">Adds a layout’s stats after yours, ready to rename. Stats with a name already on the sheet are skipped.</p><LayoutPicker onPick={l=>{applyLayout(l);setLayouts(false);}}/></ToolDialog>}
  {form&&<StatForm start={form==='new'?undefined:form} campaign={campaign} sections={sections} sheet={sheet} values={values} who={entry.title} trackers={(c.trackers??[]).map(t=>t.label)} others={fields.filter(x=>form==='new'||x.id!==form.id)} locked={form!=='new'&&hasValues(form.id)} onClose={()=>setForm(null)} onSave={f=>{onFields(form==='new'?placeStat(all,f):renameStatRefs(all.map(x=>x.id===f.id?f:x),form.label,f.label));setForm(null);}}/>}
 </div>;
}

/** A score box's modifier, typed with or without its sign. Empty means none typed (the worked-out one shows as a hint). */
function ModInput({label,value,placeholder,onSet}:{label:string;value:unknown;placeholder:string;onSet:(v:number|null)=>void}){
 const shown=typeof value==='number'?signed(value).replace('−','-'):'';
 const [draft,setDraft]=useState<string|null>(null);
 const commit=()=>{if(draft===null)return;const t=draft.trim().replace(/[−–]/g,'-');setDraft(null);if(!t){onSet(null);return;}const n=Number(t);if(Number.isFinite(n))onSet(Math.round(n));};
 return <input className="stat-box-mod" inputMode="numeric" aria-label={label} maxLength={6} placeholder={placeholder} value={draft??shown} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.currentTarget.blur();}if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const n=(typeof value==='number'?value:0)+(e.key==='ArrowUp'?1:-1);setDraft(null);onSet(n);}}}/>;
}

/** The starter layouts, one card each: what kind of roll, the groups it adds, and Use this. */
function LayoutPicker({onPick}:{onPick:(l:StatLayout)=>void}){
 return <div className="stat-layouts"><p className="stat-layouts-lead">Or start from a layout for the way your game rolls. Every name is a placeholder to rename.</p>
  <div className="stat-layout-list">{STAT_LAYOUTS.map(l=>{const groups=[...new Set(l.stats.map(s=>s.section))];return <div key={l.id} className="stat-layout">
   <div className="stat-layout-head"><strong>{l.name}</strong><code>{l.example}</code></div>
   <p>{l.about}</p>
   <ul>{groups.map(g=><li key={g}><span>{g}</span> {l.stats.filter(s=>s.section===g).map(s=>s.label).join(', ')}</li>)}</ul>
   <button type="button" className="button small" onClick={()=>onPick(l)}>Use this</button>
  </div>;})}</div></div>;
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
function StatForm({start,campaign,sections,sheet,values,who,trackers,others,locked,onSave,onClose}:{start?:StatField;campaign:Campaign;sections:string[];sheet:SheetStat[];values:Record<string,unknown>;who:string;trackers:string[];others:StatField[];locked:boolean;onSave:(f:StatField)=>void;onClose:()=>void}){
 const [f,setF]=useState<StatField>(()=>start?{...start,rolls:statRolls(start)}:{id:newId(),label:'',section:sections[0]??'',type:'number',options:[],visibility:'players',archived:false,rolls:[{name:'Roll',formula:'1d20+{value}'}]});
 const [options,setOptions]=useState((start?.options??[]).join(', ')),[error,setError]=useState(''),[focus,setFocus]=useState(0),[describe,setDescribe]=useState(!!start?.description),[refName,setRefName]=useState(start?.label??'');
 const set=(p:Partial<StatField>)=>setF(x=>({...x,...p}));
 // Renaming keeps this stat's own rolls pointing at it ({Might mod} becomes {Brawn mod}), skipping names other stats have.
 const rename=(label:string)=>{
  const now=label.trim(),clash=!now||others.some(o=>o.label.trim().toLowerCase()===now.toLowerCase());
  setF(x=>clash||!refName?{...x,label}:{...renameStatRefs([{...x,label:refName}],refName,now)[0],label});
  if(!clash)setRefName(now);
 };
 const rolls=f.rolls??[],setRoll=(i:number,p:Partial<StatRoll>)=>set({rolls:rolls.map((r,j)=>j===i?{...r,...p}:r)});
 const own=start?values[start.id]:undefined;
 // The sheet as it would be with this stat saved: its new name and worked-out value, so {Name mod} reads in previews.
 const preview=useMemo(()=>[...sheet.filter(x=>!start||x.label!==start.label),{label:f.label.trim()||'This stat',type:f.type,derived:f.derived,value:own}],[sheet,start,f.label,f.type,f.derived,own]);
 const worked=f.derived?.trim()?derivedValue({derived:f.derived,value:own??(f.type==='number'?12:own)},preview):null;
 const refs=[...(f.type!=='none'?['{value}']:[]),...others.filter(o=>o.type!=='none'&&o.type!=='textarea').flatMap(o=>[`{${o.label}}`,...(o.derived?[`{${o.label} mod}`]:[])])].slice(0,24);
 const submit=()=>{
  const kept=rolls.map(r=>({name:r.name.trim(),formula:r.formula.replace(/\{[^{}]*\}|\s+/g,m=>m.startsWith('{')?m:''),...(r.success?.against.trim()?{success:{op:r.success.op,against:r.success.against.trim()}}:{})})).filter(r=>r.name||r.formula);
  if(kept.some(r=>!r.name))return setError('Give every roll a name, like Check or Damage.');
  if(kept.some(r=>statRollPreview(r.formula,f.type,preview).bad))return setError('A roll needs dice the roller reads, and names of stats on this sheet, like 1d20+{value} or 1d20+{Agility}.');
  if(new Set(kept.map(r=>r.name.toLowerCase())).size!==kept.length)return setError('Give each roll its own name.');
  const filled=preview.map(x=>({...x,value:x.value===undefined||x.value===null||x.value===''?3:x.value}));
  if(kept.some(r=>r.success&&rollOutcome(0,r.success,own??3,filled)===null))return setError('A target needs a number or a stat, like 15 or {value}.');
  if(f.derived?.trim()&&derivedValue({derived:f.derived,value:12},filled)===null)return setError('The worked-out value needs a sum like floor(({value}-10)/2).');
  const {roll:_r,rollFormula:_rf,...rest}=f;void _r;void _rf;
  const next={...rest,label:f.label.trim(),section:f.section.trim(),note:f.note?.trim()||undefined,description:describe&&f.description?.trim()||undefined,derived:f.derived?.trim()||undefined,spend:f.spend?.tracker.trim()?{tracker:f.spend.tracker.trim(),n:f.spend.n}:undefined,rolls:kept,options:f.type==='select'?options.split(',').map(o=>o.trim()).filter(Boolean):[]};
  const parsed=statFieldSchema.safeParse(next);
  if(!parsed.success)return setError(parsed.error.issues[0].message);
  onSave(parsed.data);
 };
 return <ToolDialog title={start?`Change ${start.label}`:'Add a stat'} onClose={onClose} wide>
  <form className="spell-form stat-form" onSubmit={e=>{e.preventDefault();submit();}}>
   <div className="spell-form-grid">
    <label className="field-label">Name<input className="inv-input" autoFocus required maxLength={160} placeholder="Strength, Piloting, Cool…" value={f.label} onChange={e=>rename(e.target.value)}/></label>
    <label className="field-label">Group<input className="inv-input" list="stat-groups" maxLength={100} placeholder="Attributes, Skills… or none" value={f.section} onChange={e=>set({section:e.target.value})}/><datalist id="stat-groups">{sections.map(s=><option key={s} value={s}/>)}</datalist></label>
    <label className="field-label">Value{locked&&<small> Characters have values for this, so it keeps its kind. Add a new stat for a different kind.</small>}<select className="inv-input" disabled={locked} value={f.type} onChange={e=>set({type:e.target.value as StatField['type']})}>{(Object.keys(typeNames) as StatField['type'][]).map(t=><option key={t} value={t}>{typeNames[t]}</option>)}</select></label>
    <label className="field-label">Under the name<small> Optional short note</small><input className="inv-input" maxLength={120} placeholder="Agility · trained" value={f.note??''} onChange={e=>set({note:e.target.value})}/></label>
    <div className="stat-describe"><label className="check-line"><input type="checkbox" checked={describe} onChange={e=>setDescribe(e.target.checked)}/> Add a description</label>
     {describe&&<label className="field-label">Description<small> What it does, shown when someone points at it and in its details.</small><textarea className="inv-input" autoFocus={!start?.description} rows={3} maxLength={2000} placeholder="Once per scene, reroll one die…" value={f.description??''} onChange={e=>set({description:e.target.value})}/></label>}</div>
    {f.type==='select'&&<label className="field-label">Choices<small> Separate with commas</small><input className="inv-input" maxLength={2000} value={options} onChange={e=>setOptions(e.target.value)}/></label>}
    {f.type==='number'&&<label className="check-line stat-box-check"><input type="checkbox" checked={f.look==='score'} onChange={e=>{const {look:_l,...rest}=f;void _l;setF(e.target.checked?{...rest,look:'score'}:rest);}}/> Show as a score box, with a modifier typed beside it (like a D&amp;D ability)</label>}
    {f.type==='number'&&<label className="field-label">{f.look==='score'?'Modifier when none is typed':'Worked out from the value'}<small> Optional. Shown beside the value, and rolls can use it as {`{${f.label.trim()||'Name'} mod}`}.</small><input className="inv-input stat-formula" maxLength={200} placeholder="floor(({value}-10)/2)" value={f.derived??''} onChange={e=>set({derived:e.target.value})}/>{f.derived?.trim()&&<small className={`stat-preview${worked===null?' bad':''}`}>{worked===null?'Use a sum with {value}, like floor(({value}-10)/2) or {value}*5.':`${own===undefined||own===null||own===''?'With 12 here it shows':`For ${who} it shows`} ${signed(worked)}.`}</small>}</label>}
   </div>
   <div className="field-label">Rolls<small> Write <code>{'{value}'}</code> for this stat, another stat’s name like <code>{'{Agility}'}</code>, or sums like <code>{'{value+Training}'}</code>. Plain dice like 2d6+1 work too.</small>
    <div className="stat-roll-rows">{rolls.map((r,i)=>{const p=statRollPreview(r.formula,f.type,preview,own,who);return <div className="stat-roll-edit" key={i}>
     <input className="inv-input" aria-label={`Roll ${i+1} name`} placeholder="Check, Save, Damage…" maxLength={40} value={r.name} onFocus={()=>setFocus(i)} onChange={e=>setRoll(i,{name:e.target.value})}/>
     <input className={`inv-input stat-formula${p.bad?' bad':''}`} aria-label={`Roll ${i+1} dice`} placeholder="1d20+{value}" maxLength={200} value={r.formula} onFocus={()=>setFocus(i)} onChange={e=>setRoll(i,{formula:e.target.value})}/>
     <button type="button" className="icon-button" aria-label={`Remove roll ${r.name||i+1}`} onClick={()=>set({rolls:rolls.filter((_,j)=>j!==i)})}><X size={14}/></button>
     <small className={`stat-preview${p.bad?' bad':''}`} aria-live="polite">{p.text}</small>
     <span className="stat-target"><select className="inv-input" aria-label={`Roll ${i+1} succeeds when`} value={r.success?.op??''} onChange={e=>setRoll(i,{success:e.target.value?{op:e.target.value as 'atLeast'|'atMost',against:r.success?.against??(e.target.value==='atMost'?'{value}':'')}:undefined})}><option value="">No target</option><option value="atLeast">Needs at least</option><option value="atMost">Needs at most</option></select>
      {r.success&&<><input className="inv-input" aria-label={`Roll ${i+1} target`} maxLength={100} placeholder={r.success.op==='atLeast'?'15':'{value}'} value={r.success.against} onChange={e=>setRoll(i,{success:{...r.success!,against:e.target.value}})}/><small>A number or a stat, like 15 or {'{value}'}. The roll card says Success or Fail.</small></>}</span>
    </div>;})}</div>
    {rolls.length>0&&refs.length>1&&<div className="stat-refs"><small>Put in roll {Math.min(focus,rolls.length-1)+1}:</small>{refs.map(x=><button type="button" key={x} onClick={()=>{const i=Math.min(focus,rolls.length-1),cur=rolls[i].formula;setRoll(i,{formula:cur+(cur&&!/[+\-*/(]$/.test(cur)?'+':'')+x});}}>{x}</button>)}</div>}
    {rolls.length<MAX_STAT_ROLLS&&<button type="button" className="button small stat-add-roll" onClick={()=>{set({rolls:[...rolls,{name:rolls.length?'':'Roll',formula:''}]});setFocus(rolls.length);}}><Plus size={14}/> Add a roll</button>}
   </div>
   <div className="field-label">Using it spends<small> From a tracker on the character, by its name, like Stress or Ammo. Every character needs a tracker with that name to roll it.</small>
    <div className="spell-cost"><input className="inv-input" list="stat-trackers" maxLength={40} placeholder="Nothing" aria-label="Tracker it spends from" value={f.spend?.tracker??''} onChange={e=>set({spend:e.target.value?{tracker:e.target.value,n:f.spend?.n??1}:undefined})}/><datalist id="stat-trackers">{trackers.map(t=><option key={t} value={t}/>)}</datalist>
     {f.spend&&<input className="inv-input" type="number" min={1} max={1000} aria-label="How many" value={f.spend.n} onChange={e=>set({spend:{...f.spend!,n:Math.max(1,Math.min(1000,Math.round(Number(e.target.value)||1)))}})}/>}</div>
   </div>
   <p className="aside-hint">Every character in {campaign.name} gets this stat. Values stay separate for each character.</p>
   <label className="check-line"><input type="checkbox" checked={f.visibility==='gm'} onChange={e=>set({visibility:e.target.checked?'gm':'players'})}/> GM only, players never see it</label>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={!f.label.trim()}>{start?'Save':'Add stat'}</button></div>
  </form>
 </ToolDialog>;
}
