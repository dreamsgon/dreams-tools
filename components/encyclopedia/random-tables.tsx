'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Dices,Plus,Upload,Download,Search,ArrowLeft,Trash2,Copy,Pencil,Check,RotateCcw,X,ListOrdered,Lock,LockOpen,UserPlus,ArrowUp} from 'lucide-react';
import {ToolDialog} from './tool-dialog';
import {newId} from '@/lib/encyclopedia/world-model';
import {TABLE_CATEGORIES,DEFAULT_ODDS,librarySchema,inCampaign,rollTable,askOracle,rangeGaps,rangeLabel,parseTableText,findTable,parseCsvTable,tableToCsv,exportTables,importTables,bringToCampaign,rollGenerator,rollLine,generatorPage,LIBRARY_LIMIT,
 type GeneratorLine,type RandomTable,type TableLibrary,type TableCategory,type TableRoll,type TableRow} from '@/lib/encyclopedia/tables';
import {addMissingStarters} from '@/lib/encyclopedia/starter-tables';
import {confirmDialog} from '../confirm-dialog';

export type TableCampaign={id:string;name:string;world:string};
type LogItem=TableRoll&{at:number;n:number;question?:string;twist?:string};
const categoryLabel=(c:TableCategory)=>TABLE_CATEGORIES.find(x=>x[0]===c)?.[1]??c;
const now=()=>new Date().toISOString();
function download(name:string,text:string,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const fileName=(s:string)=>s.replace(/[^\w -]+/g,'').trim().replace(/\s+/g,'-').toLowerCase()||'tables';
const rollLabel=(t:RandomTable)=>t.kind==='generator'?`${t.parts?.length??0} lines`:t.kind==='pair'?'2 tables':t.kind==='oracle'?'d100':t.mode==='ranges'?t.formula??'':'list';
let sequence=0;

/** The Random tables page: one library for the account, shown for the open campaign. */
export type SaveCharacter=(page:{title:string;body:string})=>void;
export function RandomTablesSection({campaignId,campaigns,home=0,onSaveCharacter}:{campaignId:string|null;campaigns:TableCampaign[];home?:number;onSaveCharacter?:SaveCharacter}){
 const [lib,setLib]=useState<TableLibrary|null>(null),[error,setError]=useState(''),[status,setStatus]=useState('');
 const [open,setOpen]=useState<string|null>(null),[editing,setEditing]=useState(false),[query,setQuery]=useState(''),[category,setCategory]=useState<TableCategory|''>(''),[scope,setScope]=useState<'here'|'all'>(campaignId?'here':'all');
 const [log,setLog]=useState<LogItem[]>([]),[importing,setImporting]=useState(false),[creating,setCreating]=useState(false);
 const current=useRef<TableLibrary|null>(null),revision=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),busy=useRef(false),dirty=useRef(false),blocked=useRef(false),saveRef=useRef<(()=>Promise<void>)|null>(null);
 const campaign=campaigns.find(c=>c.id===campaignId)??null;
 const [seenHome,setSeenHome]=useState(home);
 if(home!==seenHome){setSeenHome(home);setOpen(null);setEditing(false);}
 useEffect(()=>{let live=true;(async()=>{try{const res=await fetch('/api/encyclopedia/tables');const body=await res.json() as {data:unknown;revision:number;error?:string};if(!res.ok)throw new Error(body.error??'Could not load your tables.');if(!live)return;const data=librarySchema.parse(body.data);current.current=data;revision.current=body.revision;setLib(data);}catch(e){if(live)setError(e instanceof Error?e.message:'Could not load your tables.');}})();return()=>{live=false;};},[]);
 useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(dirty.current)e.preventDefault();};window.addEventListener('beforeunload',leave);return()=>{window.removeEventListener('beforeunload',leave);if(timer.current){clearTimeout(timer.current);void saveRef.current?.();}};},[]);
 async function save(){if(busy.current||!dirty.current||!current.current)return;busy.current=true;dirty.current=false;setStatus('Saving…');const sent=current.current;
  try{const res=await fetch('/api/encyclopedia/tables',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:sent,revision:revision.current})});const v=await res.json() as {revision:number;error?:string};if(!res.ok)throw new Error(v.error??'Could not save your tables.');revision.current=v.revision;setStatus(dirty.current?'Saving…':'Saved');}
  catch(e){dirty.current=true;blocked.current=true;setStatus('Not saved');setError(e instanceof Error?e.message:'Could not save your tables.');}
  finally{busy.current=false;if(dirty.current&&!blocked.current)timer.current=setTimeout(save,800);}}
 useEffect(()=>{saveRef.current=save;});
 function change(next:TableLibrary){const ok=librarySchema.safeParse(next);if(!ok.success){setError(ok.error.issues[0]?.message??'That change isn’t valid.');return false;}
  if(new TextEncoder().encode(JSON.stringify(next)).length>LIBRARY_LIMIT){setError('Your tables would go over the 1 MB limit. Export some and delete them to make room.');return false;}
  setError('');blocked.current=false;current.current=next;setLib(next);dirty.current=true;setStatus('Unsaved changes');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(save,600);return true;}
 const updateTable=(id:string,patch:Partial<RandomTable>)=>{const l=current.current;if(l)change({...l,tables:l.tables.map(t=>t.id===id?{...t,...patch,updatedAt:now()}:t)});};
 const record=(r:TableRoll,extra:Partial<LogItem>={})=>setLog(old=>[{...r,...extra,at:Date.now(),n:++sequence},...old].slice(0,40));
 const roll=(id:string)=>{if(!lib)return;try{record(rollTable(lib,id));}catch(e){setError(e instanceof Error?e.message:'Could not roll.');}};
 const defaultScope=campaignId?[campaignId]:null;

 if(!lib)return <section className="page-content tables-page"><span className="eyebrow">RANDOM TABLES</span><h1>Random tables</h1>{error?<p className="form-error" role="alert">{error}</p>:<p className="subtitle">Loading your tables…</p>}</section>;
 const table=open?lib.tables.find(t=>t.id===open):undefined;
 const shown=lib.tables.filter(t=>(scope==='all'||inCampaign(t,campaignId))&&(!category||t.category===category)&&(t.name+' '+(t.description??'')+' '+categoryLabel(t.category)).toLowerCase().includes(query.toLowerCase()));
 const logAside=<RollLog log={log} onClear={()=>setLog([])}/>;
 const banner=error&&<div className="tables-error" role="alert">{error}<button className="text-button" onClick={()=>setError('')}>Dismiss</button></div>;

 if(table)return <div className="tables-layout"><section className="page-content tables-page">{banner}
  <TableView key={table.id} table={table} lib={lib} campaigns={campaigns} campaignId={campaignId} editing={editing} setEditing={setEditing} onBack={()=>{setOpen(null);setEditing(false);}}
   update={patch=>updateTable(table.id,patch)} change={change} record={record} onOpen={id=>{setOpen(id);setEditing(false);}} onSaveCharacter={onSaveCharacter}
   onDelete={async()=>{const users=lib.tables.filter(t=>t.id!==table.id&&(t.pair?.includes(table.id)||t.twistTableId===table.id||[...(t.parts??[]),...(t.extras??[])].some(p=>p.tableId===table.id)));if(users.length){setError(`“${users[0].name}” uses this table. Change or delete it first.`);return;}if(!await confirmDialog({title:`Delete “${table.name}”?`,message:'Export it first if you might want it back.',confirm:'Delete table',danger:true}))return;change({...lib,tables:lib.tables.filter(t=>t.id!==table.id)});setOpen(null);}}
   onDuplicate={()=>{const copy={...structuredClone(table),id:newId(),name:uniqueName(lib,table.name+' copy'),updatedAt:now(),rows:table.rows?.map(r=>({...r,id:newId()})),parts:table.parts?.map(p=>({...p,id:newId()})),extras:table.extras?.map(p=>({...p,id:newId()}))};if(change({...lib,tables:[...lib.tables,copy]})){setOpen(copy.id);setEditing(true);}}}/>
  <p className="tables-status">{status}</p></section>{logAside}</div>;

 const groups=TABLE_CATEGORIES.map(([c,label])=>({c,label,tables:shown.filter(t=>t.category===c).sort((a,b)=>a.name.localeCompare(b.name))})).filter(g=>g.tables.length);
 return <div className="tables-layout"><section className="page-content tables-page">{banner}
  <div className="dashboard-intro"><div><span className="eyebrow">ROLL FOR WHAT HAPPENS NEXT</span><h1>Random tables</h1><p className="subtitle">Your table library. Use any table in any of your campaigns.</p></div>
   <div className="button-row"><button className="button" onClick={()=>setImporting(true)}><Upload size={15}/> Import</button><button className="button" disabled={!shown.length} onClick={()=>download(`${fileName(campaign?.name??'random-tables')}.tables.json`,JSON.stringify(exportTables(lib,shown.map(t=>t.id)),null,2))}><Download size={15}/> Export{query||category||scope==='here'?' shown':''}</button><button className="button primary" onClick={()=>setCreating(true)}><Plus size={15}/> New table</button></div></div>
  <div className="tables-toolbar"><label className="search-box"><Search size={15}/><input aria-label="Find a table" placeholder="Find a table…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="tables-chips" role="group" aria-label="Kind of table"><button className={!category?'on':''} aria-pressed={!category} onClick={()=>setCategory('')}>All</button>{TABLE_CATEGORIES.filter(([c])=>lib.tables.some(t=>t.category===c)).map(([c,label])=><button key={c} className={category===c?'on':''} aria-pressed={category===c} onClick={()=>setCategory(category===c?'':c)}>{label}</button>)}</div></div>
  {campaign&&<div className="segmented tables-scope" role="group" aria-label="Which tables"><button className={scope==='here'?'on':''} aria-pressed={scope==='here'} onClick={()=>setScope('here')}>Used in {campaign.name}</button><button className={scope==='all'?'on':''} aria-pressed={scope==='all'} onClick={()=>setScope('all')}>All my tables</button></div>}
  {!lib.tables.length?<div className="tables-empty"><ListOrdered size={40} strokeWidth={1.2}/><h2>No tables yet</h2><p>Start with a few starter tables (an oracle, meaning words, an NPC generator, complications, weather and names), paste a table from a book you own, or import a file.</p><div className="button-row"><button className="button primary" onClick={()=>change(addMissingStarters(lib,newId).library)}><Plus size={15}/> Add starter tables</button><button className="button" onClick={()=>setImporting(true)}><Upload size={15}/> Paste or import</button></div></div>
   :!groups.length?<p className="subtitle">{scope==='here'&&campaign?`No tables are used in ${campaign.name} yet. Switch to All my tables, or import from another campaign.`:'No tables match.'}</p>
   :groups.map(g=><div key={g.c} className="tables-group"><h2>{g.label} <span>{g.tables.length}</span></h2><div className="tables-grid">{g.tables.map(t=><div key={t.id} className="table-card">
    <button className="table-card-open" onClick={()=>{setOpen(t.id);setEditing(false);}}><span className="table-card-head"><strong>{t.name}</strong><span className="die-tag">{rollLabel(t)}</span></span><span className="table-card-desc">{t.description||sample(t,lib)}</span></button>
    <div className="table-card-foot"><span>{t.kind==='table'?`${t.rows?.length??0} rows`:t.kind==='pair'?'word pair':t.kind==='generator'?'generator':'oracle'}</span><span>{t.campaignIds===null?'All campaigns':t.campaignIds.length===1&&t.campaignIds[0]===campaignId?'This campaign':`${t.campaignIds.length} campaign${t.campaignIds.length===1?'':'s'}`}</span><span className="spacer"/>{t.kind==='oracle'||t.kind==='generator'?<button className="text-button" onClick={()=>{setOpen(t.id);setEditing(false);}}>{t.kind==='oracle'?'Ask':'Open'}</button>:<button className="text-button" onClick={()=>roll(t.id)}><Dices size={13}/> Roll</button>}</div></div>)}</div></div>)}
  {lib.tables.length>0&&addMissingStarters(lib,()=>'').added>0&&<p className="aside-hint tables-starters">Missing the starter tables, such as the NPC generator? <button className="text-button" onClick={()=>{const r=addMissingStarters(lib,newId);if(change(r.library))setStatus(`Added ${r.added} starter table${r.added===1?'':'s'}`);}}>Add them</button></p>}
  <p className="tables-status">{status}</p>
  {creating&&<NewTableDialog lib={lib} onClose={()=>setCreating(false)} onCreate={t=>{const full={...t,campaignIds:defaultScope,updatedAt:now()} as RandomTable;if(change({...lib,tables:[...lib.tables,full]})){setCreating(false);setOpen(full.id);setEditing(true);}}}/>}
  {importing&&<ImportDialog lib={lib} campaigns={campaigns} campaignId={campaignId} onClose={()=>setImporting(false)} onDone={(next,message)=>{if(change(next)){setImporting(false);setStatus(message);}}} setError={setError}/>}
 </section>{logAside}</div>;
}

function uniqueName(lib:TableLibrary,name:string){let out=name.slice(0,160);for(let n=2;lib.tables.some(t=>t.name.toLowerCase()===out.toLowerCase());n++)out=`${name.slice(0,150)} (${n})`;return out;}
function sample(t:RandomTable,lib:TableLibrary){if(t.kind==='generator')return (t.parts??[]).map(p=>p.label).join(' · ');if(t.kind==='pair')return t.pair?.map(id=>lib.tables.find(x=>x.id===id)?.name).filter(Boolean).join(' + ')??'';if(t.kind==='oracle')return 'Ask a yes or no question.';return (t.rows??[]).slice(0,3).map(r=>r.text.replace(/\[\[(?:table:)?([^\]|]+)[^\]]*\]\]/g,'$1')).join(' · ');}

function RollLog({log,onClear}:{log:LogItem[];onClear:()=>void}){
 const [copied,setCopied]=useState(0);
 return <aside className="tables-log" aria-label="Roll log"><div className="tables-log-head"><span className="eyebrow">ROLL LOG</span>{log.length>0&&<button className="text-button" onClick={onClear}>Clear</button>}</div>
  {!log.length?<p className="aside-hint">Rolls from this page show here, newest first. They aren’t saved.</p>:log.map(r=><div key={r.n} className="tables-log-item"><div className="tables-log-meta"><span>{r.title}{r.roll?` · ${r.roll}`:''}</span><time>{new Date(r.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time></div>
   {r.question&&<div className="tables-log-question">“{r.question}”</div>}<div className="tables-log-text">{r.text}</div>{r.twist&&<div className="tables-log-twist"><span>Twist</span> {r.twist}</div>}
   {r.steps.length>0&&<div className="tables-log-steps">{r.steps.map((s,i)=><span key={i}>{s.table}{s.roll?` (${s.roll})`:''}: {s.text}</span>)}</div>}
   <button className="text-button" onClick={()=>{void navigator.clipboard?.writeText([r.question&&`“${r.question}”`,r.text,r.twist&&`Twist: ${r.twist}`].filter(Boolean).join(' ')).then(()=>setCopied(r.n)).catch(()=>{});}}>{copied===r.n?<><Check size={12}/> Copied</>:<><Copy size={12}/> Copy</>}</button></div>)}
 </aside>;
}

function TableView({table,lib,campaigns,campaignId,editing,setEditing,onBack,update,change,record,onOpen,onDelete,onDuplicate,onSaveCharacter}:{table:RandomTable;lib:TableLibrary;campaigns:TableCampaign[];campaignId:string|null;editing:boolean;setEditing:(v:boolean)=>void;onBack:()=>void;update:(p:Partial<RandomTable>)=>void;change:(l:TableLibrary)=>boolean;record:(r:TableRoll,extra?:Partial<LogItem>)=>void;onOpen:(id:string)=>void;onDelete:()=>void;onDuplicate:()=>void;onSaveCharacter?:SaveCharacter}){
 const [last,setLast]=useState<LogItem|null>(null);
 const doRoll=()=>{try{const r=rollTable(lib,table.id);setLast({...r,at:Date.now(),n:0});record(r);}catch{/* shown by the library */}};
 const others=lib.tables.filter(t=>t.id!==table.id&&t.kind!=='oracle');
 return <>
  <div className="article-path"><button onClick={onBack}><ArrowLeft size={13}/> Random tables</button><span>/ {categoryLabel(table.category)}</span></div>
  <div className="tables-title"><div>{editing?<input className="tables-name-input" aria-label="Table name" maxLength={160} defaultValue={table.name} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==table.name)update({name:uniqueName({...lib,tables:lib.tables.filter(t=>t.id!==table.id)},v)});}}/>:<h1>{table.name}</h1>}
   {editing?<textarea className="tables-desc-input" aria-label="Description" rows={2} maxLength={2000} placeholder="What is this table for? (optional)" defaultValue={table.description??''} onBlur={e=>{if(e.target.value!==(table.description??''))update({description:e.target.value||undefined});}}/>:table.description&&<p className="subtitle">{table.description}</p>}</div>
   <div className="button-row">{editing?<button className="button primary" onClick={()=>setEditing(false)}><Check size={15}/> Done</button>:<button className="button" onClick={()=>setEditing(true)}><Pencil size={14}/> Edit</button>}{table.kind!=='oracle'&&table.kind!=='generator'&&!editing&&<button className="button primary" onClick={doRoll}><Dices size={15}/> Roll</button>}</div></div>
  {table.kind==='generator'?<Generator table={table} lib={lib} editing={editing} update={update} record={record} onOpen={onOpen} onSaveCharacter={onSaveCharacter}/>
   :table.kind==='oracle'?<Oracle table={table} lib={lib} campaignId={campaignId} editing={editing} update={update} change={change} record={record}/>
   :table.kind==='pair'?<div className="tables-pair">{[0,1].map(i=>{const part=lib.tables.find(t=>t.id===table.pair?.[i]);return <div key={i} className="tables-pair-part"><span className="field-caption">{i?'Second word':'First word'}</span>{editing?<select aria-label={i?'Second table':'First table'} value={table.pair?.[i]??''} onChange={e=>{const p=[...(table.pair??['',''])] as [string,string];p[i]=e.target.value;update({pair:p});}}>{others.filter(t=>t.kind==='table').map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>:part?<button className="text-button" onClick={()=>onOpen(part.id)}>{part.name} ({part.rows?.length??0})</button>:<span>Missing</span>}</div>;})}{editing&&<label className="field-label tables-joiner">Between the words<select value={table.joiner??' · '} onChange={e=>update({joiner:e.target.value===' · '?undefined:e.target.value})}><option value=" · ">A dot (Abandon · a promise)</option><option value=" ">A space (to protect a secret)</option><option value=", ">A comma (cold, quiet)</option></select></label>}</div>
   :<RowsEditor table={table} lib={lib} editing={editing} update={update} onOpen={onOpen}/>}
  {last&&!editing&&table.kind!=='oracle'&&table.kind!=='generator'&&<div className="tables-result" role="status"><span>{last.roll}</span><p>{last.text}</p>{last.steps.length>0&&<small>{last.steps.map(s=>`${s.table}: ${s.text}`).join(' · ')}</small>}<button className="text-button" onClick={doRoll}><RotateCcw size={13}/> Roll again</button></div>}
  <div className="tables-settings">
   {editing&&<label className="field-label">Kind<select value={table.category} onChange={e=>update({category:e.target.value as TableCategory})}>{TABLE_CATEGORIES.map(([c,l])=><option key={c} value={c}>{l}</option>)}</select></label>}
   <Availability table={table} campaigns={campaigns} campaignId={campaignId} update={update}/>
   <div className="button-row tables-actions"><button className="button small" onClick={onDuplicate}><Copy size={14}/> Duplicate</button><button className="button small" onClick={()=>download(`${fileName(table.name)}.tables.json`,JSON.stringify(exportTables(lib,[table.id]),null,2))}><Download size={14}/> Export</button>{table.kind==='table'&&<button className="button small" onClick={()=>download(`${fileName(table.name)}.csv`,tableToCsv(table),'text/csv')}><Download size={14}/> Spreadsheet (.csv)</button>}<button className="button small danger-text" onClick={onDelete}><Trash2 size={14}/> Delete</button></div>
  </div></>;
}

function Availability({table,campaigns,campaignId,update}:{table:RandomTable;campaigns:TableCampaign[];campaignId:string|null;update:(p:Partial<RandomTable>)=>void}){
 const all=table.campaignIds===null,set=new Set(table.campaignIds??[]);
 const toggle=(id:string,on:boolean)=>{const next=campaigns.map(c=>c.id).filter(c=>c===id?on:set.has(c));update({campaignIds:next});};
 return <fieldset className="tables-available"><legend>Available in</legend>
  <label><input type="checkbox" checked={all} onChange={e=>update({campaignIds:e.target.checked?null:campaignId?[campaignId]:[]})}/> All my campaigns, now and future</label>
  {!all&&campaigns.map(c=><label key={c.id}><input type="checkbox" checked={set.has(c.id)} onChange={e=>toggle(c.id,e.target.checked)}/> {c.name} <span>{c.world}</span></label>)}
  <p className="aside-hint">It’s one table: editing it changes it everywhere it’s used. Duplicate it for a separate copy.</p></fieldset>;
}

function RowsEditor({table,lib,editing,update,onOpen}:{table:RandomTable;lib:TableLibrary;editing:boolean;update:(p:Partial<RandomTable>)=>void;onOpen:(id:string)=>void}){
 const rows=table.rows??[],ranges=table.mode==='ranges',[pasting,setPasting]=useState(false),[formula,setFormula]=useState(table.formula??'d6');
 const gaps=useMemo(()=>rangeGaps(table),[table]);
 const setRows=(next:TableRow[])=>update({rows:next});
 const setRow=(id:string,patch:Partial<TableRow>)=>setRows(rows.map(r=>r.id===id?{...r,...patch}:r));
 const num=(v:string)=>v.trim()===''?undefined:Math.max(-1000,Math.min(100000,Math.round(Number(v))||0));
 const short=(list:number[])=>list.length>8?`${list.slice(0,8).join(', ')}…`:list.join(', ');
 return <div className="tables-rows">
  {editing&&<div className="tables-mode"><span>Roll</span><div className="segmented" role="group" aria-label="How rows are picked"><button className={ranges?'on':''} aria-pressed={ranges} onClick={()=>update({mode:'ranges',formula:table.formula??`d${Math.max(2,rows.length)}`,rows:rows.map((r,i)=>({...r,min:r.min??i+1,max:undefined}))})}>Dice and ranges</button><button className={!ranges?'on':''} aria-pressed={!ranges} onClick={()=>update({mode:'weighted'})}>Pick one (weights)</button></div>
   {ranges&&<label className="tables-formula">Formula<input value={formula} maxLength={60} aria-label="Roll formula" onChange={e=>setFormula(e.target.value)} onBlur={()=>{if(formula.trim()&&formula!==table.formula)update({formula:formula.trim()});}} placeholder="d20, 2d6, d100"/></label>}
   <button className="button small" onClick={()=>setPasting(true)}><ListOrdered size={14}/> Paste a list</button></div>}
  {ranges&&(gaps.missing.length>0||gaps.overlap.length>0)&&<p className="tables-gaps" role="status">{gaps.missing.length>0&&<>No row for {short(gaps.missing)}. </>}{gaps.overlap.length>0&&<>More than one row for {short(gaps.overlap)}.</>}</p>}
  <div className={`tables-row-list ${ranges?'ranges':'weighted'}`}>
   <div className="tables-row tables-row-head"><span>{ranges?'Roll':''}</span><span>Result</span>{editing&&<span>{ranges?'':'Weight'}</span>}</div>
   {rows.map((r,i)=>editing?<div key={r.id} className="tables-row">
     {ranges?<span className="tables-range"><input aria-label={`Row ${i+1} from`} inputMode="numeric" defaultValue={r.min??''} onBlur={e=>setRow(r.id,{min:num(e.target.value)})}/>–<input aria-label={`Row ${i+1} to`} inputMode="numeric" defaultValue={r.max??''} placeholder={String(r.min??'')} onBlur={e=>setRow(r.id,{max:num(e.target.value)})}/></span>:<span/>}
     <textarea aria-label={`Row ${i+1} result`} rows={1} maxLength={2000} defaultValue={r.text} onBlur={e=>{if(e.target.value!==r.text)setRow(r.id,{text:e.target.value});}}/>
     <span className="tables-row-tools">{!ranges&&<input aria-label={`Row ${i+1} weight`} inputMode="numeric" defaultValue={r.weight??1} onBlur={e=>setRow(r.id,{weight:Math.max(0,Math.min(1000,num(e.target.value)??1))})}/>}<button className="icon-only" aria-label={`Delete row ${i+1}`} onClick={()=>setRows(rows.filter(x=>x.id!==r.id))}><X size={14}/></button></span></div>
    :<div key={r.id} className="tables-row"><span className="tables-range-label">{ranges?rangeLabel(r):(r.weight??1)!==1?`${r.weight}×`:''}</span><span><ResultText text={r.text} lib={lib} onOpen={onOpen}/></span></div>)}
   {editing&&<button className="text-button tables-add-row" onClick={()=>{const top=Math.max(0,...rows.map(r=>r.max??r.min??0));setRows([...rows,{id:newId(),text:'',...(ranges?{min:top+1}:{})}]);}}><Plus size={13}/> Add a row</button>}
  </div>
  {editing&&<p className="aside-hint">Results can roll dice with <code>[[1d4]]</code> and roll other tables with <code>[[table:Name]]</code>.</p>}
  {pasting&&<PasteDialog title="Paste rows" onClose={()=>setPasting(false)} onUse={(parsed,replace)=>{update({mode:parsed.mode,formula:parsed.formula??table.formula,rows:replace?parsed.rows:[...rows,...parsed.rows]});if(parsed.formula)setFormula(parsed.formula);setPasting(false);}} allowAppend/>}
 </div>;
}

/** A generator: one labelled line per table. Lock the lines you like, reroll the rest, then save it as a character page. */
function Generator({table,lib,editing,update,record,onOpen,onSaveCharacter}:{table:RandomTable;lib:TableLibrary;editing:boolean;update:(p:Partial<RandomTable>)=>void;record:(r:TableRoll,extra?:Partial<LogItem>)=>void;onOpen:(id:string)=>void;onSaveCharacter?:SaveCharacter}){
 const fresh=(keep:GeneratorLine[]=[])=>{try{return rollGenerator(lib,table.id,keep);}catch{return [];}};
 const [lines,setLines]=useState<GeneratorLine[]>(()=>fresh()),[locked,setLocked]=useState<Set<string>>(new Set()),[who,setWho]=useState(''),[extras,setExtras]=useState<Record<string,GeneratorLine>>({}),[copied,setCopied]=useState(false);
 const parts=table.parts??[];
 // Lines follow the parts: new parts get rolled, removed parts drop out.
 const shown=parts.map(p=>{const l=lines.find(x=>x.partId===p.id);return l&&l.tableId===p.tableId?{...l,label:p.label}:null;});
 if(!editing&&shown.some(l=>!l)){const next=shown.map((l,i)=>l??rollLine(lib,parts[i]));setLines(next as GeneratorLine[]);}
 const current=shown.filter(Boolean) as GeneratorLine[];
 const summary=(ls:GeneratorLine[])=>ls.map(l=>`${l.label}: ${l.text}`).join('; ');
 const rollAll=()=>{const next=fresh(current.filter(l=>locked.has(l.partId)));setLines(next);setExtras({});record({tableId:table.id,title:table.name,roll:'',text:summary(next),steps:[]});};
 const reroll=(partId:string)=>{const p=parts.find(x=>x.id===partId);if(p)setLines(current.map(l=>l.partId===partId?rollLine(lib,p):l));};
 const rollExtra=(p:{id:string;label:string;tableId:string})=>{const l=rollLine(lib,p);setExtras(old=>({...old,[p.id]:l}));record({tableId:p.tableId,title:`${table.name} · ${p.label}`,roll:l.roll,text:l.text,steps:l.steps});};
 const toggle=(id:string)=>setLocked(old=>{const n=new Set(old);if(n.has(id))n.delete(id);else n.add(id);return n;});
 const all=[...current,...(table.extras??[]).map(p=>extras[p.id]).filter(Boolean)];
 if(editing)return <div className="gen-edit">
  <PartsEditor title="Lines" hint="Each line is rolled on one of your tables. A line called Name becomes the title of the character page." parts={parts} lib={lib} self={table.id} min={1} onChange={next=>update({parts:next})} onOpen={onOpen}/>
  <PartsEditor title="Roll when needed" hint="Optional. These aren’t rolled with the rest; use them during play, like a reaction or a topic of conversation." parts={table.extras??[]} lib={lib} self={table.id} min={0} onChange={next=>update({extras:next})} onOpen={onOpen}/>
 </div>;
 return <div className="gen">
  <label className="field-caption" htmlFor="gen-who">Who are they? <span>(optional)</span></label>
  <input id="gen-who" className="oracle-question" maxLength={160} placeholder="The innkeeper at the Stonehill Inn" value={who} onChange={e=>setWho(e.target.value)}/>
  <div className="gen-lines">{current.map(l=>{const on=locked.has(l.partId);return <div key={l.partId} className={`gen-line ${on?'locked':''}`}>
   <span className="gen-label">{l.label}</span><span className="gen-text">{l.text}{l.roll&&<small>{l.roll}</small>}</span>
   <span className="gen-tools"><button className="icon-button" aria-pressed={on} aria-label={on?`Unlock ${l.label}`:`Keep ${l.label}`} title={on?'Kept when you roll again. Click to unlock.':'Keep this line when you roll again'} onClick={()=>toggle(l.partId)}>{on?<Lock size={14}/>:<LockOpen size={14}/>}</button><button className="icon-button" aria-label={`Reroll ${l.label}`} title="Reroll this line" disabled={on} onClick={()=>reroll(l.partId)}><RotateCcw size={14}/></button></span></div>;})}</div>
  {!current.length&&<p className="form-error">This generator has no lines yet. Choose Edit to add some.</p>}
  <div className="button-row gen-actions"><button className="button primary" onClick={rollAll}><Dices size={15}/> {locked.size?'Roll the unlocked lines':'Roll again'}</button>
   {onSaveCharacter&&<button className="button" disabled={!current.length} onClick={()=>onSaveCharacter(generatorPage(all,who))}><UserPlus size={15}/> Save as a character page</button>}
   <button className="button" disabled={!current.length} onClick={()=>{const page=generatorPage(all,who);void navigator.clipboard?.writeText(`${page.title}\n\n${page.body.replace(/\*\*/g,'')}`).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500);}).catch(()=>{});}}>{copied?<><Check size={15}/> Copied</>:<><Copy size={15}/> Copy</>}</button></div>
  {(table.extras??[]).length>0&&<div className="gen-extras"><span className="field-caption">Roll when needed</span>{(table.extras??[]).map(p=><div key={p.id} className="gen-extra"><button className="button small" onClick={()=>rollExtra(p)}><Dices size={13}/> {p.label}</button>{extras[p.id]&&<span className="gen-text">{extras[p.id].text}{extras[p.id].roll&&<small>{extras[p.id].roll}</small>}</span>}</div>)}</div>}
 </div>;
}

function PartsEditor({title,hint,parts,lib,self,min,onChange,onOpen}:{title:string;hint:string;parts:NonNullable<RandomTable['parts']>;lib:TableLibrary;self:string;min:number;onChange:(p:NonNullable<RandomTable['parts']>)=>void;onOpen:(id:string)=>void}){
 const choices=lib.tables.filter(t=>t.id!==self&&t.kind!=='oracle'&&t.kind!=='generator').sort((a,b)=>a.name.localeCompare(b.name));
 const set=(i:number,patch:Partial<NonNullable<RandomTable['parts']>[number]>)=>onChange(parts.map((p,j)=>j===i?{...p,...patch}:p));
 const move=(i:number,d:number)=>{const n=[...parts];const [p]=n.splice(i,1);n.splice(i+d,0,p);onChange(n);};
 return <div className="gen-parts"><span className="field-caption">{title}</span><p className="aside-hint">{hint}</p>
  {parts.map((p,i)=><div key={p.id} className="gen-part"><input aria-label={`Line ${i+1} label`} maxLength={60} defaultValue={p.label} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==p.label)set(i,{label:v});else e.target.value=p.label;}}/>
   <select aria-label={`Line ${i+1} table`} value={p.tableId} onChange={e=>set(i,{tableId:e.target.value})}>{choices.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
   <span className="gen-tools"><button className="text-button" onClick={()=>onOpen(p.tableId)}>Open</button><button className="icon-button" aria-label={`Move line ${i+1} up`} disabled={!i} onClick={()=>move(i,-1)}><ArrowUp size={14}/></button><button className="icon-button" aria-label={`Remove line ${i+1}`} disabled={parts.length<=min} onClick={()=>onChange(parts.filter((_,j)=>j!==i))}><X size={14}/></button></span></div>)}
  {choices.length>0&&parts.length<(min?20:10)&&<button className="text-button" onClick={()=>onChange([...parts,{id:newId(),label:`Line ${parts.length+1}`,tableId:choices[0].id}])}><Plus size={13}/> Add a line</button>}
 </div>;
}

/** A row's text with [[1d4]] shown as a dice chip and [[table:Name]] as a link to that table. */
function ResultText({text,lib,onOpen}:{text:string;lib:TableLibrary;onOpen:(id:string)=>void}){
 const parts=text.split(/(\[\[[^\]\n]+\]\])/g);
 return <>{parts.map((part,i)=>{const m=part.match(/^\[\[(table:)?([^\]|]+)(?:\|[^\]]*)?\]\]$/i);if(!m)return part;
  if(m[1]){const t=findTable(lib,m[2]);return t?<button key={i} className="table-ref" onClick={()=>onOpen(t.id)}><ListOrdered size={12}/>{t.name}</button>:<span key={i} className="table-ref missing" title="No table with this name">{m[2]}</span>;}
  return /d\s*\d/i.test(m[2])?<span key={i} className="table-dice"><Dices size={12}/>{m[2].trim()}</span>:part;})}</>;
}

function Oracle({table,lib,campaignId,editing,update,change,record}:{table:RandomTable;lib:TableLibrary;campaignId:string|null;editing:boolean;update:(p:Partial<RandomTable>)=>void;change:(l:TableLibrary)=>boolean;record:(r:TableRoll,extra?:Partial<LogItem>)=>void}){
 const odds=table.odds??DEFAULT_ODDS,key=campaignId??'',tension=lib.tension?.[key]??5;
 const [question,setQuestion]=useState(''),[pick,setPick]=useState(odds[Math.floor((odds.length-1)/2)].label),[answer,setAnswer]=useState<ReturnType<typeof askOracle>|null>(null),[twist,setTwist]=useState('');
 const setTension=(n:number)=>change({...lib,tension:{...lib.tension,[key]:Math.max(1,Math.min(9,n))}});
 const twistTable=lib.tables.find(t=>t.id===table.twistTableId);
 const ask=()=>{const a=askOracle(table,pick,tension,Math.random,question.trim());let tw='';if(a.twist&&twistTable)try{tw=rollTable(lib,twistTable.id).text;}catch{/* missing */}
  setAnswer(a);setTwist(tw);record({tableId:table.id,title:`${table.name} · ${a.odds}`,roll:`${a.roll} · tension ${tension}`,text:a.answer,steps:[]},{question:a.question||undefined,twist:a.twist?(tw||'Something changes'):undefined});};
 if(editing)return <div className="oracle-edit"><p className="aside-hint">The chance of yes for each choice, out of 100.</p>{odds.map((o,i)=><div key={i} className="oracle-odds-row"><input aria-label={`Odds ${i+1} name`} maxLength={60} defaultValue={o.label} onBlur={e=>{const v=e.target.value.trim();if(v)update({odds:odds.map((x,j)=>j===i?{...x,label:v}:x)});}}/><input aria-label={`Odds ${i+1} chance of yes`} inputMode="numeric" defaultValue={o.yes} onBlur={e=>update({odds:odds.map((x,j)=>j===i?{...x,yes:Math.max(0,Math.min(100,Math.round(Number(e.target.value))||0))}:x)})}/>%</div>)}
  <label className="field-label">On a twist, roll<select value={table.twistTableId??''} onChange={e=>update({twistTableId:e.target.value||undefined})}><option value="">Nothing</option>{lib.tables.filter(t=>t.id!==table.id&&t.kind!=='oracle').map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>;
 return <div className="oracle">
  <label className="field-caption" htmlFor="oracle-question">Your question</label><input id="oracle-question" className="oracle-question" maxLength={300} placeholder="Is the gate guarded?" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')ask();}}/>
  <span className="field-caption">How likely is it?</span><div className="oracle-odds" role="radiogroup" aria-label="How likely">{odds.map(o=><button key={o.label} role="radio" aria-checked={pick===o.label} className={pick===o.label?'on':''} onClick={()=>setPick(o.label)}>{o.label}</button>)}</div>
  <div className="oracle-tension"><span className="field-caption">Tension</span><div role="radiogroup" aria-label="Tension">{Array.from({length:9},(_,i)=>i+1).map(n=><button key={n} role="radio" aria-checked={tension===n} className={n<=tension?'on':''} onClick={()=>setTension(n)}>{n}</button>)}</div><span className="aside-hint">Higher tension, more twists.{campaignId?' Saved for this campaign.':''}</span></div>
  <div className="button-row"><button className="button primary" onClick={ask}><Dices size={15}/> Ask the oracle</button></div>
  {answer&&<div className="oracle-answer" role="status"><div><strong>{answer.answer}</strong><span>d100 rolled {answer.d100} · {answer.odds} means 1 to {answer.chance} is yes</span></div>
   {answer.twist&&<p className="oracle-twist"><span>Twist</span> Doubles at or under the tension: something changes.{twist&&<> {twistTable?.name}: <em>{twist}</em></>}</p>}
   <div className="button-row"><button className="text-button" onClick={()=>setTension(tension+1)}>Tension +1</button><button className="text-button" onClick={()=>setTension(tension-1)}>Tension −1</button></div></div>}
 </div>;
}

function NewTableDialog({lib,onClose,onCreate}:{lib:TableLibrary;onClose:()=>void;onCreate:(t:Omit<RandomTable,'campaignIds'|'updatedAt'>)=>void}){
 const [kind,setKind]=useState<RandomTable['kind']>('table'),[name,setName]=useState(''),[category,setCategory]=useState<TableCategory>('encounter');
 const lists=lib.tables.filter(t=>t.kind==='table'),[a,setA]=useState(lists[0]?.id??''),[b,setB]=useState(lists[1]?.id??lists[0]?.id??'');
 return <ToolDialog title="New table" onClose={onClose}><form className="details-form" onSubmit={e=>{e.preventDefault();if(!name.trim())return;const base={id:newId(),name:uniqueName(lib,name.trim()),category:kind==='oracle'?'oracle':kind==='pair'?'meaning':kind==='generator'?'npc':category};
  if(kind==='table')onCreate({...base,kind,mode:'ranges',formula:'d6',rows:Array.from({length:6},(_,i)=>({id:newId(),text:'',min:i+1}))});
  else if(kind==='pair'){if(!a||!b)return;onCreate({...base,kind,pair:[a,b]});}
  else if(kind==='generator'){if(!a)return;onCreate({...base,kind,parts:[{id:newId(),label:'Name',tableId:lib.tables.find(t=>t.kind==='table'&&t.category==='names')?.id??a}],extras:[]});}else onCreate({...base,kind,odds:DEFAULT_ODDS});}}>
  <div className="segmented" role="group" aria-label="Kind of table">{([['table','Table'],['pair','Word pair'],['generator','Generator'],['oracle','Yes or no oracle']] as const).map(([k,l])=><button type="button" key={k} className={kind===k?'on':''} aria-pressed={kind===k} onClick={()=>setKind(k)}>{l}</button>)}</div>
  <label>Name<input autoFocus required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder={kind==='pair'?'Mood and place':kind==='generator'?'Tavern regular':kind==='oracle'?'Will they agree?':'Ember Road encounters'}/></label>
  {kind==='table'&&<label>Kind<select value={category} onChange={e=>setCategory(e.target.value as TableCategory)}>{TABLE_CATEGORIES.map(([c,l])=><option key={c} value={c}>{l}</option>)}</select></label>}
  {kind==='generator'&&!lists.length&&<p className="form-error">Make a table first. Each line of a generator is rolled on one of your tables.</p>}
  {kind==='pair'&&(lists.length?<><label>First word from<select value={a} onChange={e=>setA(e.target.value)}>{lists.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Second word from<select value={b} onChange={e=>setB(e.target.value)}>{lists.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></>:<p className="form-error">Make two word tables first.</p>)}
  <p className="aside-hint">{kind==='table'?'Starts as a d6 table. You can paste a list next.':kind==='pair'?'Rolls both tables and joins the words.':kind==='generator'?'Rolls several tables at once, one per line, like a name, a mood and a want. Add the lines next.':'Comes with five odds from Nearly impossible to Nearly certain. You can change them.'}</p>
  <button className="button primary">Create</button></form></ToolDialog>;
}

type Parsed=ReturnType<typeof parseTableText>;
function PastePreview({parsed}:{parsed:Parsed}){return <div className="paste-preview"><p className="aside-hint">{parsed.rows.length} rows{parsed.mode==='ranges'?`, rolled with ${parsed.formula}`:', each equally likely'}.</p><div>{parsed.rows.slice(0,6).map(r=><div key={r.id}><span>{rangeLabel(r)}</span>{r.text}</div>)}{parsed.rows.length>6&&<div><span/>…</div>}</div></div>;}
function PasteDialog({title,onClose,onUse,allowAppend=false}:{title:string;onClose:()=>void;onUse:(p:Parsed,replace:boolean)=>void;allowAppend?:boolean}){
 const [text,setText]=useState('');const parsed=useMemo(()=>text.trim()?parseTableText(text,newId):null,[text]);
 return <ToolDialog title={title} onClose={onClose}><div className="details-form"><label>One row per line<textarea autoFocus rows={10} value={text} onChange={e=>setText(e.target.value)} placeholder={'01–05 Cold rain\n06–50 Fog until midday\n51–00 Clear\n\nor a plain list, one item per line'}/></label>
  {parsed&&<PastePreview parsed={parsed}/>}<div className="button-row">{allowAppend&&<button className="button" disabled={!parsed?.rows.length} onClick={()=>parsed&&onUse(parsed,false)}>Add to the end</button>}<button className="button primary" disabled={!parsed?.rows.length} onClick={()=>parsed&&onUse(parsed,true)}>{allowAppend?'Replace rows':'Use these rows'}</button></div></div></ToolDialog>;
}

function ImportDialog({lib,campaigns,campaignId,onClose,onDone,setError}:{lib:TableLibrary;campaigns:TableCampaign[];campaignId:string|null;onClose:()=>void;onDone:(l:TableLibrary,message:string)=>void;setError:(s:string)=>void}){
 const [tab,setTab]=useState<'paste'|'file'|'campaign'>('paste'),[name,setName]=useState(''),[category,setCategory]=useState<TableCategory>('other'),[text,setText]=useState(''),[problem,setProblem]=useState('');
 const [all,setAll]=useState(!campaignId),[from,setFrom]=useState(campaigns.find(c=>c.id!==campaignId)?.id??''),[picked,setPicked]=useState<Set<string>>(new Set),[copy,setCopy]=useState(false);
 const scope=all?null:campaignId?[campaignId]:null;
 const parsed=useMemo(()=>text.trim()?parseTableText(text,newId):null,[text]);
 const elsewhere=lib.tables.filter(t=>from&&t.campaignIds!==null&&t.campaignIds.includes(from));
 const make=(n:string,p:Parsed):RandomTable=>({id:newId(),name:uniqueName(lib,n),category,kind:'table',mode:p.mode,formula:p.formula,rows:p.rows,campaignIds:scope,updatedAt:now()});
 async function readFile(file:File){setProblem('');try{if(file.size>LIBRARY_LIMIT)throw new Error('Choose a file smaller than 1 MB.');const body=await file.text(),base=file.name.replace(/\.(tables\.)?(json|csv|txt)$/i,'');
  if(/\.json$/i.test(file.name)){const r=importTables(lib,JSON.parse(body),scope,newId);onDone(r.library,`Imported ${r.added} table${r.added===1?'':'s'}`);return;}
  const p=/\.csv$/i.test(file.name)?parseCsvTable(body,newId):parseTableText(body,newId);if(!p.rows.length)throw new Error('No rows found in that file.');onDone({...lib,tables:[...lib.tables,make(base||'Imported table',p)]},`Imported “${base}”`);}
  catch(e){setProblem(e instanceof Error&&!(e instanceof SyntaxError)?(e.message.startsWith('[')?'That isn’t an RPG Tools tables file.':e.message):'That file couldn’t be read. Use a .json export from RPG Tools, a .csv or a .txt list.');}}
 const scopeChoice=campaignId&&tab!=='campaign'&&<label className="tables-scope-choice"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/> Use in all my campaigns (otherwise only this one)</label>;
 return <ToolDialog title="Import tables" wide onClose={onClose}>
  <div className="tables-tabs" role="tablist">{([['paste','Paste'],['file','From a file'],...(campaignId?[['campaign','From another campaign']]:[])] as [typeof tab,string][]).map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
  {tab==='paste'&&<div className="details-form"><div className="tables-two"><label>Table name<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="Wilderness encounters"/></label><label>Kind<select value={category} onChange={e=>setCategory(e.target.value as TableCategory)}>{TABLE_CATEGORIES.map(([c,l])=><option key={c} value={c}>{l}</option>)}</select></label></div>
   <label>Paste the table<textarea rows={9} value={text} onChange={e=>setText(e.target.value)} placeholder={'Copy a table from a book or PDF you own:\n01–05 Result\n06–10 Another result\n\nNumbered columns and plain lists work too.'}/></label>
   {parsed&&<PastePreview parsed={parsed}/>}{scopeChoice}<div className="button-row"><button className="button primary" disabled={!parsed?.rows.length||!name.trim()} onClick={()=>parsed&&onDone({...lib,tables:[...lib.tables,make(name.trim(),parsed)]},`Added “${name.trim()}”`)}>Add table</button></div></div>}
  {tab==='file'&&<div className="details-form"><p className="modal-intro">An RPG Tools tables file (.json, keeps tables that roll other tables), a spreadsheet (.csv with a Result column and optional Roll and Weight columns) or a text list (.txt).</p>
   <label>Kind for .csv and .txt<select value={category} onChange={e=>setCategory(e.target.value as TableCategory)}>{TABLE_CATEGORIES.map(([c,l])=><option key={c} value={c}>{l}</option>)}</select></label>
   <label className="button file-button"><Upload size={15}/> Choose a file<input type="file" hidden accept=".json,.csv,.txt,application/json,text/csv,text/plain" onChange={e=>{const f=e.target.files?.[0];if(f)void readFile(f);e.target.value='';}}/></label>{scopeChoice}</div>}
  {tab==='campaign'&&campaignId&&<div className="details-form"><label>Campaign<select value={from} onChange={e=>{setFrom(e.target.value);setPicked(new Set);}}>{campaigns.filter(c=>c.id!==campaignId).map(c=><option key={c.id} value={c.id}>{c.name} · {c.world}</option>)}</select></label>
   {!elsewhere.length?<p className="aside-hint">That campaign has no tables of its own. Tables set to all campaigns are already here.</p>:<div className="tables-pick">{elsewhere.map(t=>{const here=inCampaign(t,campaignId);return <label key={t.id}><input type="checkbox" disabled={here&&!copy} checked={picked.has(t.id)} onChange={e=>setPicked(old=>{const n=new Set(old);if(e.target.checked)n.add(t.id);else n.delete(t.id);return n;})}/> {t.name} <span>{categoryLabel(t.category)}{here?' · already here':''}</span><span className="die-tag">{rollLabel(t)}</span></label>;})}</div>}
   <fieldset className="tables-how"><legend>How to bring them over</legend><label><input type="radio" checked={!copy} onChange={()=>setCopy(false)}/> <b>Use the same table.</b> Edits show up in both campaigns.</label><label><input type="radio" checked={copy} onChange={()=>setCopy(true)}/> <b>Make a copy.</b> This campaign gets its own version to change freely.</label></fieldset>
   <div className="button-row"><button className="button primary" disabled={!picked.size} onClick={()=>{try{onDone(bringToCampaign(lib,[...picked],campaignId,copy,newId),`Brought ${picked.size} table${picked.size===1?'':'s'} over`);}catch(e){setError(e instanceof Error?e.message:'Could not bring those tables over.');}}}>Bring {picked.size||''} table{picked.size===1?'':'s'} over</button></div></div>}
  {problem&&<p className="form-error" role="alert">{problem}</p>}
 </ToolDialog>;
}
