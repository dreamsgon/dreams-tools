'use client';
/*
 * How the AI writes, for one campaign: a style for session recaps, The story so far and generator writing, with
 * built-in styles, the GM's own saved ones, and a sample written before a style is used; Write like me and See the full
 * wording on any style; and the AI panel chat's own instructions. StylePicker is the Style menu shown wherever the AI
 * writes (the recap dialog, Write it again, The story so far, and generators as they arrive).
 */
import {useMemo,useState} from 'react';
import {Download,Lock,Plus,Sparkles,Trash2,Undo2} from 'lucide-react';
import {newId,type Campaign,type Workspace} from '@/lib/encyclopedia/world-model';
import {depthFor,depthNames,extractDepths,extractGroups,extractKinds,extractNames,isOn,turnKind,setWhere,whereOf,whereNames,wheres,findKinds,isAuto,setAuto,cleanFixes,inEncyclopedia,type ExtractSettings} from '@/lib/encyclopedia/recap-extract';
import {sessionFile} from '@/lib/encyclopedia/rp-export';
import {saveExtract,allStyles,chatLengths,deleteStyle,isBuiltIn,kindNames,lengthNames,lockedLines,saveChat,saveStyle,settingLines,styleFor,styleSummary,styleTones,chooseStyle,writingKinds,type AiWriting,type ChatSettings,type WritingKind,type WritingStyle} from '@/lib/encyclopedia/ai-styles';
import {ToolDialog} from './tool-dialog';
import {useWriters} from './use-writers';
import {confirmDialog} from '../confirm-dialog';
import {keyFields} from '@/lib/ai/device-keys';

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
export function AiWritingDialog({data,campaign,change,onClose,start='recap'}:{data:Workspace;campaign:Campaign;change:Change;onClose:()=>void;start?:WritingKind|'chat'|'extract'}){
 const writing=campaign.aiWriting;
 const [tab,setTab]=useState<WritingKind|'chat'|'extract'>(start),kind:WritingKind=tab==='chat'||tab==='extract'?'recap':tab;
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
 const lens=lengthNames[kind],pickKind=(k:WritingKind|'chat'|'extract')=>{setTab(k);if(k!=='chat'&&k!=='extract')pick(styleFor(writing,k));};
 const pulled=extractKinds.filter(k=>isOn(writing?.extract,k)).length;
 const kinds:[WritingKind|'chat'|'extract',string,string][]=[...writingKinds.map(k=>[k,kindNames[k],styleFor(writing,k).name] as [WritingKind,string,string]),['chat','AI chat',writing?.chat?.instructions?.trim()?'Your instructions':`${chatLengths[writing?.chat?.length??'short'][0]} replies`],['extract','What it pulls out',`${pulled} of ${extractKinds.length} kinds · ${depthNames[depthFor(writing?.extract)][0]}`]];
 const groups:[string,WritingStyle[]][]=[['Built in',allStyles(writing).filter(s=>isBuiltIn(s.id))],['Yours',allStyles(writing).filter(s=>!isBuiltIn(s.id))]];
 const more=[{story:'Story',bullets:'Bullets',both:'Story and bullets'}[draft.shape],draft.tense==='past'?'past tense':'present tense',draft.language?.trim()||'English',...(draft.instructions?.trim()?['your instructions']:[])].join(' · ');
 return <ToolDialog title="How the AI writes" onClose={onClose} wide className="writing-modal"><div className="writing-dialog">
  <p className="modal-intro">For {campaign.name}. Your AI app uses these too, and you can always write it yourself instead.</p>
  <div className="writing-layout">
  <nav className="writing-kinds" aria-label="What it writes">{kinds.map(([k,n,sub])=><button type="button" key={k} className={tab===k?'on':''} aria-current={tab===k?'true':undefined} onClick={()=>pickKind(k)}><strong>{n}</strong><small>{sub}</small></button>)}</nav>
  {tab==='extract'?<ExtractSettingsForm key={campaign.id} data={data} campaign={campaign} writing={writing} save={save}/>:tab==='chat'?<ChatSettingsForm key={campaign.id} writing={writing} save={save}/>:<div className="writing-body">
   <div className="writing-edit">
    <p className="aside-hint">{kind==='recap'?'Used by New session recap, Write it again, and your AI app’s recap prompts.':kind==='story'?'Used by The story so far on the front page, written here or by your AI app.':'Used by generators that write with AI, as they arrive.'}</p>
    <div className="writing-styles">{groups.map(([g,list])=>(list.length||g==='Yours')&&<div key={g} className="writing-style-group"><span className="writing-group">{g}</span><div className="writing-style-list">
     {list.map(s=><button type="button" key={s.id} className="writing-style" aria-pressed={sel===s.id} onClick={()=>pick(s)}><strong>{s.name}{inUse===s.id&&<span className="in-use">In use</span>}</strong><small>{lens[s.length][0]}{s.tone.length?` · ${s.tone.join(' and ').toLowerCase()}`:''}</small></button>)}
     {g==='Yours'&&<button type="button" className="writing-style new" onClick={()=>setNaming('My style')}><Plus size={14}/> New style</button>}
    </div></div>)}
     <small className="aside-hint">{inUse===sel?`${saved.name} is what this campaign uses for ${kindNames[kind].toLowerCase()}.`:<>This campaign uses {styleFor(writing,kind).name}. <button type="button" className="inline-link" onClick={()=>save(chooseStyle(writing,kind,sel))}>Use {saved.name} instead</button></>}</small>
    </div>
    {draft.wording!==undefined?<div className="writing-own"><p><b>You changed the wording below</b>, so the length, tone, who tells it, shape, tense, language and your instructions are part of your wording now. It is used wherever {saved.name} is used.</p><button type="button" className="inline-link" onClick={()=>set({wording:undefined})}>Go back to the settings</button></div>:<>
    <div className="field-title">Length<Seg label="Length" value={draft.length} options={(['short','standard','detailed'] as const).map(l=>[l,lens[l][0]] as [WritingStyle['length'],string])} onChange={length=>set({length})}/><small className="aside-hint">{lens[draft.length][1][0].toUpperCase()+lens[draft.length][1].slice(1)}.</small></div>
    <div className="field-title">Tone<div className="style-chips">{styleTones.map(t=><button type="button" key={t} className={`style-chip ${draft.tone.includes(t)?'on':''}`} aria-pressed={draft.tone.includes(t)} onClick={()=>set({tone:draft.tone.includes(t)?draft.tone.filter(x=>x!==t):[...draft.tone,t].slice(-2)})}>{t}</button>)}</div><small className="aside-hint">Pick up to two.</small></div>
    <div className="field-title">Who tells it<Seg label="Who tells it" value={draft.voice} options={[['party','The party'],['we','“We”'],['character','A character']]} onChange={voice=>set({voice})}/>
     {draft.voice==='character'&&<input className="recap-input" aria-label="Which character" maxLength={120} value={draft.who??''} placeholder="Bram Hale, or The Greyfen Herald" onChange={e=>set({who:e.target.value})}/>}</div>
    <details className="writing-more"><summary>More options <small>{more}</small></summary><div className="writing-more-in">
     <div className="writing-pair">
      <div className="field-title">Shape<Seg label="Shape" value={draft.shape} options={[['story','Story'],['bullets','Bullets'],['both','Both']]} onChange={shape=>set({shape})}/></div>
      <div className="field-title">Tense<Seg label="Tense" value={draft.tense} options={[['past','Past'],['present','Present']]} onChange={tense=>set({tense})}/></div>
     </div>
     <label className="field-title">Language<input className="recap-input" maxLength={40} value={draft.language??''} placeholder="English" onChange={e=>set({language:e.target.value})}/></label>
     <label className="field-title">Your instructions<textarea className="recap-input" rows={3} maxLength={1000} value={draft.instructions??''} placeholder="Call the party the Lanternbearers. Never mention dice or rules." onChange={e=>set({instructions:e.target.value})}/><small className="aside-hint">Added every time. The AI still keeps GM secrets out of what players read.</small></label>
    </div></details>
    </>}
    <details className="writing-more" open={!!draft.example}><summary>Write like me <small>optional</small></summary><div className="writing-more-in">
     <textarea className="recap-input reading" aria-label="An example of your writing" rows={4} maxLength={2000} value={draft.example??''} placeholder="Paste a recap or a few lines you wrote. The AI matches how it sounds, not what it says." onChange={e=>set({example:e.target.value||undefined})}/>
     <small className="aside-hint">Sent with every piece this style writes. Leave out secrets you wouldn’t want in a draft.</small>
    </div></details>
    <details className="writing-more" open={draft.wording!==undefined}><summary>See the full wording <small>what the AI is told</small></summary><div className="writing-more-in">
     <div className="writing-wording">
      {lockedLines[kind].before.map(l=><p key={l} className="locked"><Lock size={12} aria-label="Locked"/>{l}</p>)}
      <textarea className="recap-input" aria-label="Wording you can change" rows={6} maxLength={2000} value={draft.wording??settingLines(draft,kind).join('\n')} onChange={e=>set({wording:e.target.value})}/>
      {lockedLines[kind].after.map(l=><p key={l} className="locked"><Lock size={12} aria-label="Locked"/>{l}</p>)}
      <p className="locked"><Lock size={12} aria-label="Locked"/>Then RPG Tools adds {lockedLines[kind].adds}{draft.example?', and your example':''}.</p>
     </div>
     <small className="aside-hint">The locked lines keep GM secrets away from players and keep the answer in a shape RPG Tools can save.</small>
    </div></details>
    {error&&<p className="form-error">{error}</p>}
    {naming!==null?<div className="writing-save"><input className="recap-input" aria-label="Name for the new style" autoFocus maxLength={60} value={naming} onChange={e=>setNaming(e.target.value)}/><button type="button" className="button" onClick={()=>setNaming(null)}>Cancel</button><button type="button" className="button primary" disabled={!naming.trim()} onClick={saveNew}>Save style</button></div>
     :dirty?<div className="writing-save"><span>{own?`Changes to ${saved.name}`:'Built-in styles stay as they are.'}</span><button type="button" className="button" onClick={()=>setDraft(saved)}><Undo2 size={14}/> Undo</button>{own?<button type="button" className="button primary" onClick={saveOwn}>Save changes</button>:<button type="button" className="button primary" onClick={()=>setNaming(`${saved.name} (mine)`)}>Save as a new style</button>}</div>
     :own&&<div className="button-row"><button type="button" className="button small" onClick={()=>void remove()}><Trash2 size={13}/> Delete {saved.name}</button></div>}
   </div>
   <Sample data={data} campaign={campaign} kind={kind} style={draft}/>
  </div>}
  </div>
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
   {dirty&&<div className="writing-save"><span>Changes to the AI chat</span><button type="button" className="button" onClick={()=>setDraft(saved)}><Undo2 size={14}/> Undo</button><button type="button" className="button primary" onClick={keep}>Save changes</button></div>}
  </div>
  <aside className="writing-sample"><strong className="writing-sample-title">Try it</strong><p className="aside-hint">Ask something in the AI panel. Your instructions apply from the next message.</p></aside>
 </div>;
}

/** What it pulls out: which kinds the AI takes from a session, how much, and where each goes. Saved with the campaign's other AI settings. */
function ExtractSettingsForm({data,campaign,writing,save}:{data:Workspace;campaign:Campaign;writing:AiWriting|undefined;save:(next:AiWriting)=>void}){
 const saved:ExtractSettings=writing?.extract??{},[draft,setDraft]=useState<ExtractSettings>(saved),[error,setError]=useState('');
 const depth=depthFor(draft),fixes=draft.fixes??[],sameFixes=JSON.stringify(cleanFixes(draft.fixes))===JSON.stringify(cleanFixes(saved.fixes));
 const dirty=depth!==depthFor(saved)||!sameFixes||extractKinds.some(k=>isOn(draft,k)!==isOn(saved,k)||whereOf(draft,k)!==whereOf(saved,k)||isAuto(draft,k)!==isAuto(saved,k));
 const setFix=(i:number,p:Partial<{from:string;to:string}>)=>setDraft(d=>({...d,fixes:(d.fixes??[]).map((f,j)=>j===i?{...f,...p}:f)}));
 const turn=(k:typeof extractKinds[number],on:boolean)=>setDraft(d=>turnKind(d,k,on));
 const keep=()=>{try{setError('');save(saveExtract(writing,draft));}catch(e){setError(e instanceof Error?e.message:'Could not save that.');}};
 return <div className="writing-body">
  <div className="writing-edit">
   <p className="aside-hint">What the AI takes from a session when it writes a recap, or checks one you wrote, and where each kind goes. Here, in your AI app, and with Check it with AI.</p>
   <div className="field-title">How much to pull out<Seg label="How much to pull out" value={depth} options={extractDepths.map(d=>[d,depthNames[d][0]] as [typeof d,string])} onChange={d=>setDraft({...draft,depth:d})}/><small className="aside-hint">{depthNames[depth][1]} You can change it for one session in New session recap.</small></div>
   {extractGroups.map(([g,list])=><div key={g} className="extract-group"><span className="writing-group">{g}</span><div className="extract-rows">{list.map(k=><div key={k} className={`extract-row ${isOn(draft,k)?'':'off'}`}>
    <label className="extract-label"><span className="extract-switch"><input type="checkbox" checked={isOn(draft,k)} onChange={e=>turn(k,e.target.checked)}/><span aria-hidden="true"/></span>
    <span className="extract-name"><strong>{extractNames[k][0]}</strong><small>{extractNames[k][1]}</small></span></label>
    {isOn(draft,k)&&<div className="extract-controls"><select className="extract-where" aria-label={`Where ${extractNames[k][0]} go`} value={whereOf(draft,k)} onChange={e=>setDraft(d=>setWhere(d,k,e.target.value as typeof wheres[number]))}>{wheres.map(w=><option key={w} value={w}>{whereNames[w]}</option>)}</select>
     {findKinds.includes(k)&&inEncyclopedia(draft,k)&&<Seg label={`How ${extractNames[k][0]} are added`} value={isAuto(draft,k)?'auto':'check'} options={[['check','Check first'],['auto','Automatic']]} onChange={v=>setDraft(d=>setAuto(d,k,v==='auto'))}/>}</div>}
   </div>)}</div></div>)}
   <details className="writing-more" open={fixes.length>0}><summary>Spelling fixes <small>{fixes.length?`${cleanFixes(fixes).length} rule${cleanFixes(fixes).length===1?'':'s'}`:'optional'}</small></summary><div className="writing-more-in extract-fixes">
    <p className="aside-hint">Names the transcript or the AI gets wrong. They’re written your way in the recap and everything it finds, and the AI is told how to spell them.</p>
    {fixes.map((f,i)=><div key={i} className="extract-fix"><input aria-label={`Wrong spelling ${i+1}`} placeholder="Toben" maxLength={80} value={f.from} onChange={e=>setFix(i,{from:e.target.value})}/><span aria-hidden="true">→</span><input aria-label={`Right spelling ${i+1}`} placeholder="Tobin" maxLength={80} value={f.to} onChange={e=>setFix(i,{to:e.target.value})}/><button type="button" className="icon-button" aria-label={`Remove spelling fix ${i+1}`} onClick={()=>setDraft(d=>({...d,fixes:(d.fixes??[]).filter((_,j)=>j!==i)}))}><Trash2 size={14}/></button></div>)}
    {fixes.length<50&&<button type="button" className="button small" onClick={()=>setDraft(d=>({...d,fixes:[...(d.fixes??[]),{from:'',to:''}]}))}><Plus size={14}/> Add a spelling fix</button>}
   </div></details>
   {error&&<p className="form-error">{error}</p>}
   {dirty&&<div className="writing-save"><span>Changes to What it pulls out</span><button type="button" className="button" onClick={()=>setDraft(saved)}><Undo2 size={14}/> Undo</button><button type="button" className="button primary" onClick={keep}>Save changes</button></div>}
  </div>
  <SessionFileAside data={data} campaign={campaign} draft={draft}/>
 </div>;
}

/** The session file: what goes in it, where it goes, and the latest session's file as the settings would write it, to read or download. */
function SessionFileAside({data,campaign,draft}:{data:Workspace;campaign:Campaign;draft:ExtractSettings}){
 const latest=data.entries.filter(e=>e.kind==='session'&&e.campaignId===campaign.id&&e.recap).sort((a,b)=>(b.recap!.playedOn??b.updatedAt).localeCompare(a.recap!.playedOn??a.updatedAt))[0];
 const file=useMemo(()=>{
  if(!latest)return null;
  // As the draft settings would write it, before they're saved.
  const ws={...data,campaigns:data.campaigns.map(c=>c.id===campaign.id?{...c,aiWriting:{...(c.aiWriting??{}),extract:draft}}:c)};
  try{return sessionFile(ws,campaign.id,latest.id,{includeGm:true,exportedAt:new Date(0).toISOString()});}catch{return null;}
 },[data,campaign.id,latest,draft]);
 const download=()=>{if(!file)return;const url=URL.createObjectURL(new Blob([file.text],{type:'text/markdown'})),a=document.createElement('a');a.href=url;a.download=file.path;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <aside className="writing-sample session-file-aside">
  <strong className="writing-sample-title">Session file</strong>
  <p className="aside-hint">A Markdown file for each session, with everything set to Session file or Both. Export and your GitHub repository put it in <code>2-Story/Sessions/</code>, and GM-only parts in <code>6-GM-Only/</code>.</p>
  <p className="aside-hint">Encyclopedia means the session page and the check list. Kinds set to Session file only stay out of both, and players never see them.</p>
  <p className="aside-hint">Automatic adds a find as soon as the AI sends it, instead of waiting in the check list. New pages start GM only, and each one can be undone on the session page under Added for you.</p>
  {file&&latest?<><p className="aside-hint">Your latest session, {latest.title}, as these settings write it:</p><button type="button" className="button" onClick={download}><Download size={14}/> Download session file</button><pre className="session-file-preview" aria-label={`${file.path}, as it would be written`}>{file.text.replace(/^---[\s\S]*?\n---\n+/,'')}</pre></>:<p className="aside-hint">Your latest session’s file shows here once a session has a recap.</p>}
 </aside>;
}

/** Try it: a sample written with the style as it stands, before it's saved or used. Nothing is saved. */
function Sample({data,campaign,kind,style}:{data:Workspace;campaign:Campaign;kind:WritingKind;style:WritingStyle}){
 const writers=useWriters(campaign.id),keys=writers?.keys??[];
 const sessions=data.entries.filter(e=>e.kind==='session'&&e.campaignId===campaign.id&&e.recap&&(e.recap.timeline.length||e.body.trim())).sort((a,b)=>(b.recap!.playedOn??b.updatedAt).localeCompare(a.recap!.playedOn??a.updatedAt));
 const [key,setKey]=useState(''),[on,setOn]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState(''),[error,setError]=useState('');
 const chosen=keys.find(k=>k.id===key)??keys.find(k=>k.transcripts)??keys[0],page=sessions.find(s=>s.id===on)??sessions[0];
 if(kind==='gen')return <aside className="writing-sample"><strong className="writing-sample-title">Try it</strong><p className="aside-hint">Generators that write with AI use this style as they arrive. Try it on a recap or The story so far to see how it reads.</p></aside>;
 const run=async()=>{
  if(!chosen)return;
  setBusy(true);setError('');
  const r=await fetch('/api/encyclopedia/recaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sample',campaignId:campaign.id,...keyFields(chosen.id),kind,style,...(kind==='recap'&&page?{entryId:page.id}:{})})}).then(r=>r.json().then(b=>({ok:r.ok,b}))).catch(()=>({ok:false,b:{error:'Couldn’t reach RPG Tools. Check your connection and try again.'}}));
  setBusy(false);
  if(!r.ok){setError(r.b.error??'Could not write a sample.');return;}
  setText(r.b.text);
 };
 return <aside className="writing-sample">
  <strong className="writing-sample-title">Try it <small className="muted">before you use it</small></strong>
  {kind==='recap'&&(sessions.length?<label className="field-label">On<select value={page?.id} onChange={e=>setOn(e.target.value)}>{sessions.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>:<p className="aside-hint">Samples are written from a session recap. Write or draft one first.</p>)}
  {keys.length>1&&<label className="field-label">Written by<select value={chosen?.id} onChange={e=>setKey(e.target.value)}>{keys.map(k=><option key={k.id} value={k.id}>{k.name} · {k.model}</option>)}</select></label>}
  {chosen?<button type="button" className="button" disabled={busy||(kind==='recap'&&!page)} onClick={run}><Sparkles size={14}/> {busy?'Writing…':`Write a sample with ${chosen.name}`}</button>:<p className="aside-hint">Add an API key with Connect an AI to try a style here. Your AI app uses the style either way.</p>}
  <p className="aside-hint">A few thousand tokens of your key. Nothing is saved.</p>
  {error&&<p className="form-error">{error}</p>}
  {text&&<div className="writing-sample-text"><span className="recap-chip">Sample · {style.name}{kind==='recap'&&page?` · ${page.title}`:''}</span><div>{text.replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g,'$1')}</div></div>}
 </aside>;
}
