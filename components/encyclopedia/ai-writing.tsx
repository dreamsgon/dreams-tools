'use client';
/*
 * How the AI writes, for one campaign: a style for session recaps, The story so far and generator writing, with
 * built-in styles, the GM's own saved ones, and a sample written before a style is used; Write like me and See the full
 * wording on any style; and the AI panel chat's own instructions. StylePicker is the Style menu shown wherever the AI
 * writes (the recap dialog, Write it again, The story so far, and generators as they arrive).
 */
import {useState} from 'react';
import {Check,Lock,Plus,Sparkles,Trash2,Undo2} from 'lucide-react';
import {newId,type Campaign,type Workspace} from '@/lib/encyclopedia/world-model';
import {allStyles,chatLengths,deleteStyle,isBuiltIn,kindNames,lengthNames,lockedLines,saveChat,saveStyle,settingLines,styleFor,styleSummary,styleTones,chooseStyle,writingKinds,type AiWriting,type ChatSettings,type WritingKind,type WritingStyle} from '@/lib/encyclopedia/ai-styles';
import {ToolDialog} from './tool-dialog';
import {useWriters} from './recap-panel';
import {confirmDialog} from '../confirm-dialog';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;

/** The Style menu: the campaign's styles, with a line saying what the chosen one does. '' is the campaign's own choice. */
export function StylePicker({writing,kind,value,onChange,onEdit,label='Style'}:{writing:AiWriting|undefined;kind:WritingKind;value:string;onChange:(id:string)=>void;onEdit?:()=>void;label?:string}){
 const chosen=styleFor(writing,kind,value||undefined),usual=styleFor(writing,kind);
 return <div className="style-pick">
  <div className="style-pick-head"><span>{label}</span>{onEdit&&<button type="button" className="inline-link" onClick={onEdit}>Edit styles…</button>}</div>
  <select aria-label={label} value={chosen.id} onChange={e=>onChange(e.target.value===usual.id&&!value?'':e.target.value)}>
   {allStyles(writing).map(s=><option key={s.id} value={s.id}>{s.name}{isBuiltIn(s.id)?'':' (yours)'}{s.id===usual.id?' · this campaign’s style':''}</option>)}
  </select>
  <small>{styleSummary(chosen,kind)}</small>
 </div>;
}

const same=(a:WritingStyle,b:WritingStyle)=>JSON.stringify({...a,id:'',name:''})===JSON.stringify({...b,id:'',name:''});
const Seg=<T extends string,>({value,options,onChange,label}:{value:T;options:[T,string][];onChange:(v:T)=>void;label:string})=>
 <div className="segmented wide" role="group" aria-label={label}>{options.map(([v,l])=><button type="button" key={v} className={value===v?'on':''} aria-pressed={value===v} onClick={()=>onChange(v)}>{l}</button>)}</div>;

/** The How the AI writes dialog. Saves into the campaign as the GM changes it, like other settings. */
export function AiWritingDialog({data,campaign,change,onClose,start='recap'}:{data:Workspace;campaign:Campaign;change:Change;onClose:()=>void;start?:WritingKind|'chat'}){
 const writing=campaign.aiWriting;
 const [tab,setTab]=useState<WritingKind|'chat'>(start),kind:WritingKind=tab==='chat'?'recap':tab;
 const [sel,setSel]=useState(()=>styleFor(writing,kind).id);
 const saved=allStyles(writing).find(s=>s.id===sel)??styleFor(writing,kind);
 const [draft,setDraft]=useState<WritingStyle>(saved),[naming,setNaming]=useState<string|null>(null),[error,setError]=useState('');
 const set=(p:Partial<WritingStyle>)=>setDraft(d=>({...d,...p}));
 const pick=(s:WritingStyle)=>{setSel(s.id);setDraft(s);setNaming(null);setError('');};
 const save=(next:AiWriting)=>change(ws=>({...ws,campaigns:ws.campaigns.map(c=>c.id===campaign.id?{...c,aiWriting:next}:c)}));
 const inUse=styleFor(writing,kind).id,dirty=!same(draft,saved),own=!isBuiltIn(sel);
 const attempt=(f:()=>void)=>{try{setError('');f();}catch(e){setError(e instanceof Error?e.message:'Could not save that style.');}};
 const saveNew=()=>attempt(()=>{const s={...draft,id:newId(),name:(naming??'').trim()};save(saveStyle(writing,s));pick(s);});
 const saveOwn=()=>attempt(()=>{save(saveStyle(writing,{...draft,id:sel,name:saved.name}));setDraft({...draft,id:sel,name:saved.name});});
 const remove=async()=>{if(!await confirmDialog({title:`Delete “${saved.name}”?`,message:'Writing that used it goes back to Warm storyteller.',confirm:'Delete',danger:true}))return;save(deleteStyle(writing,sel));pick(styleFor(deleteStyle(writing,sel),kind));};
 const lens=lengthNames[kind];
 return <ToolDialog title="How the AI writes" onClose={onClose} wide><div className="writing-dialog">
  <p className="modal-intro">Styles belong to {campaign.name}. Your AI app gets them too, through the recap and story prompts. You can always write it yourself instead.</p>
  <Seg label="What it writes" value={tab} options={[...writingKinds.map(k=>[k,kindNames[k]] as [WritingKind,string]),['chat','AI chat']]} onChange={k=>{setTab(k);if(k!=='chat')pick(styleFor(writing,k));}}/>
  {tab==='chat'?<ChatSettingsForm key={campaign.id} writing={writing} save={save}/>:<div className="writing-body">
   <div className="writing-edit">
    <p className="aside-hint">{kind==='recap'?'Used by New session recap, Write it again, and your AI app’s recap prompts.':kind==='story'?'Used by The story so far on the front page, written here or by your AI app.':'Used by generators that write with AI, as they arrive.'}</p>
    <div className="field-title">Style<div className="style-chips">{allStyles(writing).map(s=><button type="button" key={s.id} className={`style-chip ${sel===s.id?'on':''}`} aria-pressed={sel===s.id} onClick={()=>pick(s)}>{inUse===s.id&&<Check size={13} aria-label="In use"/>}{s.name}<small>{isBuiltIn(s.id)?'built-in':'yours'}</small></button>)}
     <button type="button" className="style-chip" onClick={()=>{setNaming('My style');}}><Plus size={13}/> New style</button></div>
     <small className="aside-hint">{inUse===sel?`${saved.name} is what this campaign uses for ${kindNames[kind].toLowerCase()}.`:<>This campaign uses {styleFor(writing,kind).name}. <button type="button" className="inline-link" onClick={()=>save(chooseStyle(writing,kind,sel))}>Use {saved.name} instead</button></>}</small>
    </div>
    {draft.wording!==undefined?<div className="writing-own"><p><b>You changed the wording below</b>, so the length, tone, who tells it, shape, tense, language and your instructions are part of your wording now. It is used wherever {saved.name} is used.</p><button type="button" className="inline-link" onClick={()=>set({wording:undefined})}>Go back to the settings</button></div>:<>
    <div className="field-title">Length<Seg label="Length" value={draft.length} options={(['short','standard','detailed'] as const).map(l=>[l,lens[l][0]] as [WritingStyle['length'],string])} onChange={length=>set({length})}/><small className="aside-hint">{lens[draft.length][1]}</small></div>
    <div className="field-title">Tone <small className="aside-hint">up to two</small><div className="style-chips">{styleTones.map(t=><button type="button" key={t} className={`style-chip ${draft.tone.includes(t)?'on':''}`} aria-pressed={draft.tone.includes(t)} onClick={()=>set({tone:draft.tone.includes(t)?draft.tone.filter(x=>x!==t):[...draft.tone,t].slice(-2)})}>{t}</button>)}</div></div>
    <div className="field-title">Who tells it<Seg label="Who tells it" value={draft.voice} options={[['party','The party'],['we','“We”'],['character','A character']]} onChange={voice=>set({voice})}/>
     {draft.voice==='character'&&<input className="recap-input" aria-label="Which character" maxLength={120} value={draft.who??''} placeholder="Bram Hale, or The Greyfen Herald" onChange={e=>set({who:e.target.value})}/>}</div>
    <div className="writing-pair">
     <div className="field-title">Shape<Seg label="Shape" value={draft.shape} options={[['story','Story'],['bullets','Bullets'],['both','Both']]} onChange={shape=>set({shape})}/></div>
     <div className="field-title">Tense<Seg label="Tense" value={draft.tense} options={[['past','Past'],['present','Present']]} onChange={tense=>set({tense})}/></div>
    </div>
    <label className="field-title">Language<input className="recap-input" maxLength={40} value={draft.language??''} placeholder="English" onChange={e=>set({language:e.target.value})}/></label>
    <label className="field-title">Your instructions<textarea className="recap-input" rows={3} maxLength={1000} value={draft.instructions??''} placeholder="Call the party the Lanternbearers. Never mention dice or rules." onChange={e=>set({instructions:e.target.value})}/><small className="aside-hint">Added every time. The AI still keeps GM secrets out of what players read.</small></label>
    </>}
    <details className="writing-more" open={!!draft.example}><summary>Write like me <small>optional</small></summary>
     <textarea className="recap-input reading" aria-label="An example of your writing" rows={4} maxLength={2000} value={draft.example??''} placeholder="Paste a recap or a few lines you wrote. The AI matches how it sounds, not what it says." onChange={e=>set({example:e.target.value||undefined})}/>
     <small className="aside-hint">Sent with every piece this style writes. Leave out secrets you wouldn’t want in a draft.</small>
    </details>
    <details className="writing-more" open={draft.wording!==undefined}><summary>See the full wording sent to the AI</summary>
     <div className="writing-wording">
      {lockedLines[kind].before.map(l=><p key={l} className="locked"><Lock size={12} aria-label="Locked"/>{l}</p>)}
      <textarea className="recap-input" aria-label="Wording you can change" rows={6} maxLength={2000} value={draft.wording??settingLines(draft,kind).join('\n')} onChange={e=>set({wording:e.target.value})}/>
      {lockedLines[kind].after.map(l=><p key={l} className="locked"><Lock size={12} aria-label="Locked"/>{l}</p>)}
      <p className="locked"><Lock size={12} aria-label="Locked"/>Then RPG Tools adds {lockedLines[kind].adds}{draft.example?', and your example':''}.</p>
     </div>
     <small className="aside-hint">The locked lines keep GM secrets away from players and keep the answer in a shape RPG Tools can save.</small>
    </details>
    {error&&<p className="form-error">{error}</p>}
    {naming!==null?<div className="writing-save"><input className="recap-input" aria-label="Name for the new style" autoFocus maxLength={60} value={naming} onChange={e=>setNaming(e.target.value)}/><button type="button" className="button primary small" disabled={!naming.trim()} onClick={saveNew}>Save style</button><button type="button" className="button small" onClick={()=>setNaming(null)}>Cancel</button></div>
     :dirty?<div className="writing-save"><span>{own?`Changes to ${saved.name}`:'Built-in styles stay as they are.'}</span><button type="button" className="button small" onClick={()=>setDraft(saved)}><Undo2 size={13}/> Undo</button>{own?<button type="button" className="button primary small" onClick={saveOwn}>Save changes</button>:<button type="button" className="button primary small" onClick={()=>setNaming(`${saved.name} (mine)`)}>Save as a new style</button>}</div>
     :own&&<div className="button-row"><button type="button" className="button small" onClick={()=>void remove()}><Trash2 size={13}/> Delete {saved.name}</button></div>}
   </div>
   <Sample data={data} campaign={campaign} kind={kind} style={draft}/>
  </div>}
 </div></ToolDialog>;
}

/** The AI chat tab: the GM's own instructions for the AI panel's chat, and how long replies are. */
function ChatSettingsForm({writing,save}:{writing:AiWriting|undefined;save:(next:AiWriting)=>void}){
 const saved:ChatSettings=writing?.chat??{},[draft,setDraft]=useState<ChatSettings>(saved),[error,setError]=useState('');
 const dirty=(draft.instructions??'').trim()!==(saved.instructions??'')||(draft.length??'short')!==(saved.length??'short');
 const keep=()=>{try{setError('');save(saveChat(writing,draft));}catch(e){setError(e instanceof Error?e.message:'Could not save that.');}};
 return <div className="writing-body">
  <div className="writing-edit">
   <p className="aside-hint">Used when you ask the AI something in the AI panel with an API key. Your AI app has its own settings for this.</p>
   <label className="field-title">Your instructions<textarea className="recap-input" rows={5} maxLength={2000} value={draft.instructions??''} placeholder="Answer as a co-GM. Use the D&D 5e (2024) rules. Put spoilers for pages players haven’t seen on a separate GM only line." onChange={e=>setDraft({...draft,instructions:e.target.value})}/><small className="aside-hint">Added to what the AI is told every time you ask it something in this campaign. Up to 2,000 characters.</small></label>
   <div className="field-title">Reply length<Seg label="Reply length" value={draft.length??'short'} options={(['short','standard','detailed'] as const).map(l=>[l,chatLengths[l][0]] as [WritingStyle['length'],string])} onChange={length=>setDraft({...draft,length})}/><small className="aside-hint">{chatLengths[draft.length??'short'][1]}</small></div>
   {error&&<p className="form-error">{error}</p>}
   {dirty&&<div className="writing-save"><span>Changes to the AI chat</span><button type="button" className="button small" onClick={()=>setDraft(saved)}><Undo2 size={13}/> Undo</button><button type="button" className="button primary small" onClick={keep}>Save changes</button></div>}
  </div>
  <aside className="writing-sample"><span className="eyebrow">TRY IT</span><p className="aside-hint">Ask something in the AI panel. Your instructions apply from the next message.</p></aside>
 </div>;
}

/** Try it: a sample written with the style as it stands, before it's saved or used. Nothing is saved. */
function Sample({data,campaign,kind,style}:{data:Workspace;campaign:Campaign;kind:WritingKind;style:WritingStyle}){
 const writers=useWriters(campaign.id),keys=writers?.keys??[];
 const sessions=data.entries.filter(e=>e.kind==='session'&&e.campaignId===campaign.id&&e.recap&&(e.recap.timeline.length||e.body.trim())).sort((a,b)=>(b.recap!.playedOn??b.updatedAt).localeCompare(a.recap!.playedOn??a.updatedAt));
 const [key,setKey]=useState(''),[on,setOn]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState(''),[error,setError]=useState('');
 const chosen=keys.find(k=>k.id===key)??keys.find(k=>k.transcripts)??keys[0],page=sessions.find(s=>s.id===on)??sessions[0];
 if(kind==='gen')return <aside className="writing-sample"><span className="eyebrow">TRY IT</span><p className="aside-hint">Generators that write with AI use this style as they arrive. Try it on a recap or The story so far to see how it reads.</p></aside>;
 const run=async()=>{
  if(!chosen)return;
  setBusy(true);setError('');
  const r=await fetch('/api/encyclopedia/recaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sample',campaignId:campaign.id,connectionId:chosen.id,kind,style,...(kind==='recap'&&page?{entryId:page.id}:{})})}).then(r=>r.json().then(b=>({ok:r.ok,b}))).catch(()=>({ok:false,b:{error:'Couldn’t reach RPG Tools. Check your connection and try again.'}}));
  setBusy(false);
  if(!r.ok){setError(r.b.error??'Could not write a sample.');return;}
  setText(r.b.text);
 };
 return <aside className="writing-sample">
  <span className="eyebrow">TRY IT <small className="muted">before you use it</small></span>
  {kind==='recap'&&(sessions.length?<label className="field-label">On<select value={page?.id} onChange={e=>setOn(e.target.value)}>{sessions.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>:<p className="aside-hint">Samples are written from a session recap. Write or draft one first.</p>)}
  {keys.length>1&&<label className="field-label">Written by<select value={chosen?.id} onChange={e=>setKey(e.target.value)}>{keys.map(k=><option key={k.id} value={k.id}>{k.name} · {k.model}</option>)}</select></label>}
  {chosen?<button type="button" className="button small" disabled={busy||(kind==='recap'&&!page)} onClick={run}><Sparkles size={13}/> {busy?'Writing…':`Write a sample with ${chosen.name}`}</button>:<p className="aside-hint">Add an API key with Connect an AI to try a style here. Your AI app uses the style either way.</p>}
  <p className="aside-hint">A few thousand tokens of your key. Nothing is saved.</p>
  {error&&<p className="form-error">{error}</p>}
  {text&&<div className="writing-sample-text"><span className="recap-chip">Sample · {style.name}{kind==='recap'&&page?` · ${page.title}`:''}</span><div>{text.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g,'$1')}</div></div>}
 </aside>;
}
