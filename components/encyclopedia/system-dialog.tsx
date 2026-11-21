"use client";
/*
 * Survey settings, the brief for a star system: its star and companions, a premise, how many worlds and what kinds,
 * the era, realistic or pulp science, which organizations have a foothold, the backdrop and a seed, with a live
 * preview. Running the survey keeps locked worlds, worlds with their own pages, and locked hooks. A system named Sol
 * can use real data instead. From a setting (AI) asks the GM's own AI to build the system from a setting they name.
 */
import {useState} from 'react';
import {ClipboardCopy,Dices,Plus,Sparkles,Trash2} from 'lucide-react';
import type {Entry} from '@/lib/encyclopedia/world-model';
import {galaxyRandom} from '@/lib/encyclopedia/galaxies';
import {backdropNames,backdrops,randomStar,starClasses,starInfo,type Backdrop,type StarClass} from '@/lib/encyclopedia/sectors';
import {amounts,eras,formatAU,solSystem,starPhysics,survey,word,zoneOf,zones,type StarSystem,type SurveyOptions} from '@/lib/encyclopedia/star-systems';
import {parsePastedDraft,readSystemDraft,systemDraftPrompt,type SystemDraftRequest} from '@/lib/encyclopedia/system-draft';
import {Actions,Check,Choice,Field,GenDialog,Generator,Hint,Picture,Range,Section,Seed,Summary} from '../generator/generator';
import {useKeys} from './world-ai-check';
import {SystemOrbit} from './system-art';
import {keyFields} from '@/lib/ai/device-keys';

const amountNames={auto:'Auto',none:'None',some:'Some',many:'Many'};
export type SystemAi={campaignId:string|null;campaign:{name:string;description?:string}};
export function SystemDialog({name:startName,system,orgs,ai,onApply,onClose}:{name:string;system:StarSystem;orgs:Entry[];ai?:SystemAi;onApply:(s:StarSystem,name:string)=>void;onClose:()=>void}){
 const [name,setName]=useState(startName),[star,setStar]=useState<StarClass>(system.star),[companions,setCompanions]=useState(system.companions);
 const [premise,setPremise]=useState(system.premise),[o,setO]=useState<SurveyOptions>(system.options),[backdrop,setBackdrop]=useState<Backdrop>(system.backdrop),[seed,setSeed]=useState(system.seed);
 const [real,setReal]=useState(!!system.real);
 const [mode,setMode]=useState<'generator'|'setting'>('generator'),[setting,setSetting]=useState(''),[which,setWhich]=useState(startName),[note,setNote]=useState('');
 const [drafted,setDrafted]=useState<{system:StarSystem;by:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(''),[pasted,setPasted]=useState('');
 const keys=useKeys(ai?.campaignId??null),key=keys?.[0];
 const fromSetting=mode==='setting'&&!real;
 const draftRequest:SystemDraftRequest={setting:setting.trim(),system:which.trim(),science:o.science,...(note.trim()?{note:note.trim()}:{})};
 const took=(input:Record<string,unknown>,by:string)=>{try{const d=readSystemDraft(input,{options:o,backdrop,seed:seed.trim()||'system',...(system.sector?{sector:system.sector}:{}),bodies:system.bodies},o.science);setDrafted({system:d.system,by});if(d.name&&name.trim()===startName.trim())setName(d.name);setError('');}catch(e){setError(e instanceof Error?e.message:'Could not read that answer.');}};
 const ask=async()=>{
  if(!key||!ai?.campaignId||!draftRequest.setting)return;
  setBusy(true);setError('');
  const r=await fetch('/api/encyclopedia/tie-writer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId:ai.campaignId,...keyFields(key.id),systemDraft:draftRequest})})
   .then(r=>r.json().then(b=>({ok:r.ok,b}))).catch(()=>({ok:false,b:{error:'Couldn’t reach RPG Tools. Check your connection and try again.'}}));
  setBusy(false);
  if(!r.ok){setError(r.b.error??'Could not ask the AI.');return;}
  took(r.b.draft,`${r.b.by} · ${r.b.model}`);
 };
 const copy=async()=>{try{await navigator.clipboard.writeText(systemDraftPrompt(draftRequest,ai?.campaign??{name:'My campaign'},true));setCopied('Prompt copied. Paste it into your AI app, then paste its answer below.');}catch{setCopied('Couldn’t copy here. Open Paste your AI app’s answer and try again.');}};
 const opt=<K extends keyof SurveyOptions>(k:K,v:SurveyOptions[K])=>setO(x=>({...x,[k]:v}));
 const holderNames=o.holders.map(h=>orgs.find(x=>x.id===h)?.title).filter((x):x is string=>!!x);
 const made:StarSystem=fromSetting?(drafted?.system??{...system,bodies:system.bodies.filter(b=>b.locked||b.pageId||b.moons.some(m=>m.pageId)),belts:[]}):real?{...solSystem(),premise:premise.trim(),...(system.sector?{sector:system.sector}:{})}
  :survey({name:name.trim()||'System',star,companions,premise:premise.trim(),options:o,backdrop,seed:seed.trim()||'system',holderNames},system);
 const z=zones(made),moons=made.bodies.reduce((n,b)=>n+b.moons.length,0),green=made.bodies.filter(b=>zoneOf(b.au,z)==='Green').length,kept=system.bodies.filter(b=>b.locked||b.pageId).length;
 const reroll=()=>setSeed(Math.floor(galaxyRandom(`${Date.now()}:${Math.random()}`)()*1e9).toString(36));
 const solAllowed=real||name.trim().toLowerCase()==='sol';
 const summary=fromSetting&&!drafted?'Ask your AI, or paste its answer, to see the system here.'
  :`${drafted&&fromSetting?`Built by ${drafted.by}. `:''}${made.bodies.length} worlds and ${moons} ${moons===1?'moon':'moons'}, ${green} in the green zone${made.belts.length?`, ${made.belts.length} ${made.belts.length===1?'belt':'belts'}`:''}.`;
 const keptNote=!real&&kept?` ${kept===1?'The world you locked or charted stays':`The ${kept} worlds you locked or charted stay`}.`:'';
 const science=<Choice label="Science" value={o.science} options={[['realistic','Realistic'],['pulp','Pulp']]} onChange={v=>opt('science',v)} hint={o.science==='pulp'?'Pulp bends the rules for adventure: breathable air and life where real physics would say no.':'Temperatures, water, air and life follow each world’s distance from the star.'}/>;
 const amountOptions=amounts.map(a=>[a,amountNames[a]] as const);
 return <GenDialog title="Survey settings" onClose={onClose}>
  <Generator
   settings={<>
    <Section title="System" summary={real?'Real data':fromSetting?'From a setting':name} open>
     <Field label="Name"><input type="text" value={name} maxLength={160} onChange={e=>setName(e.target.value)}/></Field>
     {!real&&<Choice label="Start from" value={mode} options={[['generator','The generator'],['setting','A setting (AI)']]} onChange={setMode}/>}
     {!fromSetting&&solAllowed&&<Check label="Real data" hint="The Sun, its eight planets and their main moons, with rounded real figures." checked={real} onChange={v=>{setReal(v);if(v)setBackdrop('deep');}}/>}
    </Section>
    {fromSetting&&<Section title="From a setting" summary={setting} open>
     <Field label="Setting"><input type="text" value={setting} maxLength={160} placeholder="A book, game, film or your own" onChange={e=>setSetting(e.target.value)}/></Field>
     <Field label="System in it"><input type="text" value={which} maxLength={160} placeholder="Leave empty and the AI picks one" onChange={e=>setWhich(e.target.value)}/></Field>
     <Field label="Keep in mind (optional)"><textarea rows={2} maxLength={500} value={note} placeholder="Before the war; the colony is new" onChange={e=>setNote(e.target.value)}/></Field>
     {science}
     <Hint>Your own AI builds it from what it knows of that setting, for your campaign only. RPG Tools ships no setting&apos;s content. {key?`It uses about 4,000 tokens from ${key.name}’s monthly limit.`:keys===null?'Looking for your AI connections…':ai?.campaignId?'Add an API key with Connect an AI to ask here, or copy the prompt into your AI app.':'Open a campaign to ask with an API key, or copy the prompt into your AI app.'}</Hint>
     <div className="gen-row">
      <button type="button" className="gen-btn small" disabled={!draftRequest.setting} onClick={()=>void copy()}><ClipboardCopy size={13}/> Copy prompt</button>
      {key&&<button type="button" className="gen-btn small primary" disabled={busy||!draftRequest.setting} onClick={()=>void ask()}><Sparkles size={13}/> {busy?`Asking ${key.name}…`:drafted?`Ask ${key.name} again`:`Ask ${key.name}`}</button>}
     </div>
     {copied&&<p className="gen-hint" role="status">{copied}</p>}
     <details className="world-ai-prompt"><summary>Paste your AI app&apos;s answer</summary><textarea rows={5} aria-label="Your AI app's answer" value={pasted} placeholder="Paste the JSON here" onChange={e=>setPasted(e.target.value)}/>
      <button type="button" className="gen-btn small" disabled={!pasted.trim()} onClick={()=>{try{took(parsePastedDraft(pasted),'your AI app');}catch(e){setError(e instanceof Error?e.message:'Could not read that answer.');}}}>Use this answer</button></details>
     {error&&<Hint alert>{error}</Hint>}
    </Section>}
    {!real&&!fromSetting&&<>
     <Section title="Stars" summary={`Class ${star}${companions.length?` + ${companions.length}`:''}`} open>
      <Choice label="Star" value={star} options={starClasses.map(c=>[c,c,`Class ${c}, ${starInfo[c].colour.toLowerCase()}`] as const)} onChange={setStar} hint={`Class ${star}, ${starInfo[star].colour.toLowerCase()}. ${starPhysics[star].note} Green zone ${formatAU(0.95*Math.sqrt(starPhysics[star].L))} to ${formatAU(1.37*Math.sqrt(starPhysics[star].L))} AU.`}/>
      <div className="gen-row"><button type="button" className="gen-btn small" onClick={()=>setStar(randomStar(galaxyRandom(`${Date.now()}`)))}><Dices size={14}/> Random star</button>
       {companions.length<2&&<button type="button" className="gen-btn small" onClick={()=>setCompanions(cs=>[...cs,{star:'M',separation:'wide'}])}><Plus size={14}/> Add a companion star</button>}</div>
      {companions.map((c,i)=><div key={i} className="gen-group">
       <Field label={`Companion ${i+1}`}><select value={c.star} onChange={e=>setCompanions(cs=>cs.map((x,k)=>k===i?{...x,star:e.target.value as StarClass}:x))}>{starClasses.map(s=><option key={s} value={s}>Class {s}, {starInfo[s].colour.toLowerCase()}</option>)}</select></Field>
       <Choice label={`Companion ${i+1} distance`} hideLabel value={c.separation} options={[['close','Close pair'],['wide','Far out']]} onChange={v=>setCompanions(cs=>cs.map((x,k)=>k===i?{...x,separation:v}:x))}/>
       <button type="button" className="gen-btn small" onClick={()=>setCompanions(cs=>cs.filter((_,k)=>k!==i))}><Trash2 size={14}/> Remove companion {i+1}</button>
      </div>)}
     </Section>
     <Section title="Worlds" summary={`${o.count} worlds`} open>
      <Field label="Premise"><input type="text" value={premise} maxLength={300} placeholder="What this system is for, in a line" onChange={e=>setPremise(e.target.value)}/></Field>
      <Range label="Worlds" value={o.count} min={1} max={12} shown={String(o.count)} onChange={v=>opt('count',v)}/>
      <Choice label="Green-zone worlds" value={o.habitable} options={amountOptions} onChange={v=>opt('habitable',v)}/>
      <Choice label="Giants" value={o.giants} options={amountOptions} onChange={v=>opt('giants',v)}/>
      <Choice label="Belts" value={o.belts} options={amountOptions} onChange={v=>opt('belts',v)}/>
      <Choice label="Moons" value={o.moons} options={[['none','None'],['few','Few'],['normal','Normal'],['many','Many']]} onChange={v=>opt('moons',v)}/>
      <Check label="Rings on some giants" checked={o.rings} onChange={v=>opt('rings',v)}/>
      <Range label="Points of interest" value={o.poi} min={0} max={5} shown={o.poi?String(o.poi):'None'} onChange={v=>opt('poi',v)}/>
     </Section>
     <Section title="Era and science" summary={`${word(o.era)}, ${o.science==='pulp'?'pulp':'realistic'}`}>
      <Choice label="Era" value={o.era} options={eras.map(e=>[e,word(e)] as const)} onChange={v=>opt('era',v)}/>
      {science}
      <Choice label="Naming" value={o.naming} options={[['roman',`${name.trim()||'Name'}-II`],['letters',`${name.trim()||'Name'} b`]]} onChange={v=>opt('naming',v)}/>
     </Section>
     {orgs.length>0&&<Section title="Footholds" summary={o.holders.length?`${o.holders.length} of ${orgs.length}`:'None'}>
      <Hint>Organizations with a presence here, up to four.</Hint>
      {orgs.map(org=><Check key={org.id} label={org.title} checked={o.holders.includes(org.id)} disabled={!o.holders.includes(org.id)&&o.holders.length>=4} onChange={v=>opt('holders',v?[...o.holders,org.id]:o.holders.filter(h=>h!==org.id))}/>)}
     </Section>}
    </>}
    <Section title="Look" summary={backdropNames[backdrop]}>
     <Choice label="Backdrop" value={backdrop} options={backdrops.map(b=>[b,backdropNames[b]] as const)} onChange={setBackdrop}/>
    </Section>
   </>}
   seed={!real&&!fromSetting&&<Seed value={seed} maxLength={80} onChange={setSeed} rerolls={[{label:'Reroll',onClick:reroll}]} hint="The same seed and settings always make the same system."/>}
   picture={<Picture><SystemOrbit className="system-preview" system={{...made,backdrop}} seed={seed} playing={false} showZones selected={null} label={`Preview of the system: ${summary}`}/></Picture>}
   summary={<Summary text={summary+keptNote}/>}
   actions={<Actions why={!name.trim()?'Give the system a name first.':fromSetting&&!drafted?'Ask your AI or paste its answer first.':null}>
    <button type="button" className="gen-btn" onClick={onClose}>Cancel</button>
    <button type="button" className="gen-btn primary" disabled={!name.trim()||(fromSetting?!drafted:!real&&!seed.trim())} onClick={()=>onApply({...made,backdrop},name.trim())}>{fromSetting?'Use this system':'Run the survey'}</button>
   </Actions>}
  />
 </GenDialog>;
}
