'use client';
import {useMemo,useState,type ChangeEvent} from 'react';
import {ArrowLeft,ArrowRight,Check,Copy,ExternalLink,Upload} from 'lucide-react';
import {applyImport,importPrompt,planFields,readImport,type FieldAction,type ImportFile} from '@/lib/encyclopedia/sheet-import';
import type {Campaign,Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {ToolDialog} from './tool-dialog';
import './sheet-import.css';

type Change=(s:Workspace)=>boolean|void;
const SYSTEMS=['D&D 5e (2014)','D&D 5e (2024)','Pathfinder 2e','Starfinder 2e','Call of Cthulhu 7e','Blades in the Dark','Mothership','Cyberpunk RED','Shadowdark','Daggerheart'];
const actionNames:Record<FieldAction,string>={match:'Matches',new:'New field',skip:'Skipped'};
const groupNames:Record<string,string>={skills:'skill',saves:'save',attacks:'attack',spells:'spell',other:'other'};

/**
 * Import a character sheet through an AI app: copy the prompt, paste the reply (or upload the .json), check what goes
 * where, then make the character or update one (sheet-import.ts does the work). Opened from the Characters page (new)
 * or from a character's sheet section (update).
 */
export function SheetImportDialog({data,campaign,worldId,update,onClose,onDone,change}:{data:Workspace;campaign:Campaign;worldId:string;update?:Entry;change:Change;onClose:()=>void;onDone:(entryId:string,message:string)=>void}){
 const [result,setResult]=useState<{id:string;msg:string;warnings:string[]}|null>(null),[step,setStep]=useState<1|2|3>(1),[system,setSystem]=useState(''),[useForm,setUseForm]=useState(true),[copied,setCopied]=useState(''),[reply,setReply]=useState(''),[error,setError]=useState(''),[file,setFile]=useState<ImportFile|null>(null),[choice,setChoice]=useState<Record<string,FieldAction>>({}),[shared,setShared]=useState(false);
 const form=useMemo(()=>(campaign.statFields??[]).filter(f=>!f.archived),[campaign.statFields]);
 const prompt=useMemo(()=>importPrompt({system,form:useForm?form:[],role:update?.character?.role}),[system,useForm,form,update]);
 const plan=useMemo(()=>file?planFields(file,campaign.statFields??[]):[],[file,campaign]);

 async function copy(){
  try{await navigator.clipboard.writeText(prompt);setCopied('Copied. Paste it into your AI app with the character’s sheet.');}
  catch{setCopied('Your browser didn’t allow copying. Select the prompt below and copy it.');}
 }
 function read(text=reply){
  const r=readImport(text);
  if(!r.ok){setError(r.error);setFile(null);return;}
  setError('');setFile(r.file);setChoice({});setStep(3);
 }
 function upload(e:ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0];e.target.value='';
  if(!f)return;
  if(f.size>2_000_000){setError('That file is over 2 MB, which is too big for a character sheet.');return;}
  void f.text().then(t=>{setReply(t);read(t);});
 }
 function run(){
  if(!file)return;
  try{
   const r=applyImport(data,file,update?{kind:'update',entryId:update.id,campaignId:campaign.id}:{kind:'new',worldId,campaignId:campaign.id,shared},choice);
   const parts=[r.added&&`${r.added} new ${r.added===1?'field':'fields'} on the stat form`,r.matched&&`${r.matched} matched`].filter(Boolean).join(', ');
   if(change(r.workspace)!==false)setResult({id:r.entryId,msg:`${update?'Updated':'Imported'} ${file.name}${parts?` (${parts})`:''}.`,warnings:r.warnings});
  }catch(e){setError(e instanceof Error?e.message:'That import didn’t work. Try again.');}
 }

 const steps=['Get the prompt','Paste the reply','Check it'];
 const counts=file?{gauges:file.gauges.length,rolls:file.rolls.reduce((m,r)=>({...m,[r.group??'other']:(m[r.group??'other']??0)+1}),{} as Record<string,number>),lists:file.lists.filter(l=>l.items.length)}:null;
 const core=file?.core;
 return <ToolDialog title={update?`Update ${update.title} from a sheet`:'Import a character sheet'} wide onClose={onClose}>
  {result?<div className="import-body">
   <div className="import-done" role="status"><Check size={18}/><div><strong>{result.msg}</strong><small>Everything stays editable on the page. Import again from its sheet section to update it.</small></div></div>
   {result.warnings.length>0&&<div className="import-warn"><strong>{result.warnings.length===1?'One thing was':`${result.warnings.length} things were`} left out</strong><ul>{result.warnings.map(w=><li key={w}>{w}</li>)}</ul></div>}
   <div className="import-footer"><button type="button" className="button primary" onClick={()=>onDone(result.id,result.msg)}>{update?'Done':`Open ${file?.name??'the page'}`} <ArrowRight size={14}/></button></div>
  </div>:<>
  <ol className="import-steps" aria-label="Steps">{steps.map((s,i)=><li key={s}><button type="button" aria-current={step===i+1?'step':undefined} className={step>i+1?'done':''} disabled={i+1===3&&!file} onClick={()=>setStep((i+1) as 1|2|3)}><b>{step>i+1?<Check size={12}/>:i+1}</b><span>{s}</span></button></li>)}</ol>

  {step===1&&<div className="import-body">
   <p className="modal-intro">Works for any game. Copy the prompt, paste it into ChatGPT, Claude or another AI app, and attach the character: a PDF, a photo or screenshot, or the sheet’s text.</p>
   <label className="import-label" htmlFor="import-system">Game system</label>
   <input id="import-system" className="import-input" list="import-systems" maxLength={100} placeholder="Leave empty to let the AI work it out" value={system} onChange={e=>setSystem(e.target.value)}/>
   <datalist id="import-systems">{SYSTEMS.map(s=><option key={s} value={s}/>)}</datalist>
   <label className="import-check"><input type="checkbox" checked={useForm} disabled={!form.length} onChange={e=>setUseForm(e.target.checked)}/><span>Include {campaign.name}’s stat form{form.length?` (${form.length} ${form.length===1?'field':'fields'})`:', which is empty'}<small>The AI reuses your field names, so they line up on their own.</small></span></label>
   <div className="button-row"><button type="button" className="button primary" onClick={()=>void copy()}><Copy size={14}/> Copy prompt</button><a className="button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> ChatGPT</a><a className="button" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Claude</a></div>
   {copied&&<p className="import-note" role="status">{copied}</p>}
   <details className="import-prompt"><summary>See the prompt</summary><textarea readOnly aria-label="The prompt" value={prompt} onFocus={e=>e.currentTarget.select()}/></details>
   <div className="import-footer"><button type="button" className="button primary" onClick={()=>setStep(2)}>I have the reply <ArrowRight size={14}/></button></div>
  </div>}

  {step===2&&<div className="import-body">
   <p className="modal-intro">Paste everything the AI wrote. Code fences and chat around the JSON are ignored.</p>
   <textarea className="import-paste" aria-label="The AI’s reply" spellCheck={false} placeholder='{ "format": "rpgtools-sheet", "version": 1, "name": "…" }' value={reply} onChange={e=>setReply(e.target.value)}/>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="import-footer"><button type="button" className="button" onClick={()=>setStep(1)}><ArrowLeft size={14}/> Back</button><label className="button"><Upload size={14}/> Upload .json<input type="file" accept=".json,application/json,text/plain" hidden onChange={upload}/></label><button type="button" className="button primary" onClick={()=>read()}>Read it <ArrowRight size={14}/></button></div>
  </div>}

  {step===3&&file&&<div className="import-body">
   <p className="modal-intro"><strong>{file.name}</strong>{file.system?` · ${file.system}`:''}{file.summary?` · ${file.summary}`:''}</p>
   {update?<p className="import-note">Updates {update.title}: only the values in this file change. Fields, trackers and tabs it doesn’t mention stay as they are, and the page’s history keeps the old version.</p>
    :<><p className="import-note">Makes a new {file.role==='pc'||!file.role?'player character, with stats players can see':'character, GM-only'} in {campaign.name}.</p>
     <label className="import-check"><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/><span>Put it in the shared world lore instead<small>Its stats still belong to {campaign.name}.</small></span></label></>}

   {core&&(core.hp||core.ac||core.initiative||core.speed)&&<section><h3 className="import-h">For tokens and rolls</h3><div className="import-tiles">
    {core.hp&&<div><small>{core.hp.label||'Hit points'}</small><b>{core.hp.value} / {core.hp.max}</b></div>}
    {core.ac&&<div><small>{core.ac.label||'Armor Class'}</small><b>{core.ac.value}</b></div>}
    {core.initiative&&<div><small>{core.initiative.label||'Initiative'}</small><b>{core.initiative.formula}</b></div>}
    {core.speed&&<div><small>Speed</small><b>{core.speed}</b></div>}
   </div></section>}

   {plan.length>0&&<section><h3 className="import-h">Fields <span>{plan.filter(p=>(choice[p.label]??p.action)==='match').length} match your form · {plan.filter(p=>(choice[p.label]??p.action)==='new').length} new</span></h3>
    <div className="sheet-picked-wrap"><table className="sheet-picked import-fields"><thead><tr><th>Field</th><th>Value</th><th>Do this</th></tr></thead><tbody>
     {plan.map(p=>{const a=choice[p.label]??p.action;return <tr key={p.label}><td>{p.label}{p.section&&<small> · {p.section}</small>}{p.roll&&<small className="import-roll"> · rolls {p.roll.roll==='d20'?'1d20 + it':p.roll.roll==='formula'?'itself':p.roll.rollFormula}</small>}</td><td><code>{p.value===null||p.value===undefined?'—':String(p.value)}</code></td>
      <td><select aria-label={`What to do with ${p.label}`} value={a} onChange={e=>setChoice(c=>({...c,[p.label]:e.target.value as FieldAction}))}>{p.matchId&&<option value="match">Use “{p.matchLabel}”</option>}<option value="new">{p.matchId?'Add as a new field':`Add to ${p.section||'the form'}`}</option><option value="skip">Don’t import</option></select><span className={`import-chip ${a}`}>{actionNames[a]}</span></td></tr>;})}
    </tbody></table></div>
    {plan.some(p=>(choice[p.label]??p.action)==='new')&&<p className="import-note">New fields join {campaign.name}’s stat form, so the next character from this game matches them.</p>}
   </section>}

   {counts&&<section className="import-sum"><h3 className="import-h">Also</h3><ul>
    {counts.gauges>0&&<li>{counts.gauges} {counts.gauges===1?'tracker':'trackers'}: {file.gauges.map(g=>`${g.label} ${g.value}/${g.max}`).join(', ')}</li>}
    {Object.keys(counts.rolls).length>0&&<li>Rolls: {Object.entries(counts.rolls).map(([g,n])=>`${n} ${groupNames[g]??g}${n===1?'':'s'}`).join(', ')}</li>}
    {counts.lists.length>0&&<li>{counts.lists.length===1?'A tab':'Tabs'}: {counts.lists.map(l=>`${l.title} (${l.items.length})`).join(', ')}</li>}
    {file.traits.length>0&&<li>Traits on the Profile tab: {file.traits.join(', ')}</li>}
   </ul></section>}

   {(file.unmapped.length>0||file.conditions.length>0)&&<div className="import-warn"><strong>The AI couldn’t place {file.unmapped.length+(file.conditions.length?1:0)===1?'one thing':`${file.unmapped.length+(file.conditions.length?1:0)} things`}</strong><ul>{file.unmapped.map(u=><li key={u}>{u}</li>)}{file.conditions.length>0&&<li>Conditions: {file.conditions.join(', ')}</li>}</ul><small>They go in a GM-only tab called Not imported, so nothing is lost.</small></div>}
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="import-footer"><button type="button" className="button" onClick={()=>setStep(2)}><ArrowLeft size={14}/> Back</button><button type="button" className="button primary" onClick={run}><Check size={14}/> {update?`Update ${update.title}`:`Import ${file.name}`}</button></div>
  </div>}
  </>}
 </ToolDialog>;
}
