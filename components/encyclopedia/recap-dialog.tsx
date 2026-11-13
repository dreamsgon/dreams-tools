"use client";
/*
 * New session recap: pick where the session is (pasted text, a file, an RP thread, or a Notion, Google Drive or
 * GitHub link, which RPG Tools reads when it's public), say what to make, and hand it to the GM's AI app, or have RPG Tools write it with the GM's own API
 * key. The page and its transcript are saved here; the AI fills the page with save_recap, and the draft shows up
 * through the usual live sync.
 */
import {useMemo,useRef,useState} from 'react';
import {ClipboardList,Upload,MessagesSquare,BookText,HardDrive,GitBranch,MessageCircle,Check,Copy,Clock,ArrowRight,Sparkles,KeyRound} from 'lucide-react';
import type {Campaign,Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {recapParts,type RecapRequest} from '@/lib/encyclopedia/recap-schema';
import {chatGroupsToText,discordJsonToText,guessCast,speakersIn,startRecap,waitingForAi} from '@/lib/encyclopedia/recap-request';
import {compactTranscript,openItems,sessionFolder,TRANSCRIPT_LIMIT,wordCount} from '@/lib/encyclopedia/recaps';
import {IN_APP_LIMIT,recapTokens} from '@/lib/encyclopedia/recap-prompts';
import {useWriters,writeWithKey} from './recap-panel';
import {ToolDialog} from './tool-dialog';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
type Kind='paste'|'file'|'thread'|'notion'|'drive'|'github';
const sources:{kind:Kind|'forum';title:string;hint:string;icon:typeof Upload}[]=[
 {kind:'paste',title:'Paste a transcript',hint:'Text with a speaker name at the start of each line, such as “Mara: I open the door.”',icon:ClipboardList},
 {kind:'file',title:'Upload a file',hint:'.txt or .md, or a Discord chat export (.json or .html). For .docx or .pdf, copy the text and paste it.',icon:Upload},
 {kind:'thread',title:'An RP thread',hint:'A play-by-post thread you exported or copied, from Discord or another forum.',icon:MessagesSquare},
 {kind:'notion',title:'A Notion page',hint:'Paste its link. RPG Tools reads it when it’s published to the web; otherwise your AI app reads it.',icon:BookText},
 {kind:'drive',title:'A Google Drive file',hint:'A Google Doc or text file. RPG Tools reads it when it’s shared with anyone with the link.',icon:HardDrive},
 {kind:'github',title:'A GitHub repository',hint:'A file, such as sessions/session-13.md, or a gist. RPG Tools reads public ones; your AI app reads private ones.',icon:GitBranch},
 {kind:'forum',title:'A forum topic',hint:'A topic from this campaign’s forum.',icon:MessageCircle},
];
const hosts:Record<'notion'|'drive'|'github',RegExp>={notion:/(^|\.)notion\.(so|site)$/,drive:/^(docs|drive)\.google\.com$/,github:/^(github\.com|gist\.github\.com|raw\.githubusercontent\.com)$/};
const linkName={notion:'Notion page',drive:'Google Drive file',github:'GitHub file'};
const partLabels:Record<typeof recapParts[number],[string,string]>={recap:['Recap for players','what the players read'],timeline:['Timeline of the session','big beats and small ones'],quotes:['Memorable quotes','word for word, checked against the transcript'],found:['People, places and things','new pages and updates, for you to check'],quests:['Quest updates','journal entries and objectives'],gmNotes:['GM notes','what the players don’t know yet']};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const playTime=(words:number)=>{const m=Math.round(words/115);return m<60?`about ${Math.max(1,m)} min of play`:`about ${Math.floor(m/60)} h ${m%60?`${m%60} min `:''}of play`;};

/** The text of an uploaded file, with Discord exports turned into "Name: text" lines. */
async function readFile(file:File){
 if(file.size>10_000_000)throw Error('That file is over 10 MB. Split it, or paste the part you need.');
 const name=file.name.toLowerCase(),raw=await file.text();
 if(/\.(docx?|pdf|odt|rtf)$/.test(name))throw Error('RPG Tools can’t read that kind of file yet. Copy its text and paste it instead.');
 if(name.endsWith('.json'))return discordJsonToText(raw)??raw;
 if(/\.html?$/.test(name)){
  const doc=new DOMParser().parseFromString(raw,'text/html'),groups=[...doc.querySelectorAll('.chatlog__message-group')];
  if(groups.length)return chatGroupsToText(groups.map(g=>({author:g.querySelector('.chatlog__author,.chatlog__author-name')?.textContent??'',lines:[...g.querySelectorAll('.chatlog__content')].map(x=>x.textContent??'')})));
  doc.querySelectorAll('script,style').forEach(x=>x.remove());
  return (doc.body?.innerText||doc.body?.textContent||'').replace(/\n{3,}/g,'\n\n').trim();
 }
 return raw;
}

export function RecapDialog({data,campaign,change,onOpen,onClose,page}:{data:Workspace;campaign:Campaign;change:Change;onOpen:(id:string)=>void;onClose:()=>void;page?:Entry}){
 const resume=page?.recap?.request&&waitingForAi(page.recap)?page:undefined;
 const sessions=data.entries.filter(e=>e.kind==='session'&&e.campaignId===campaign.id);
 const [step,setStep]=useState<'source'|'options'|'handoff'>(resume?'handoff':'source');
 const [kind,setKind]=useState<Kind>('paste'),[text,setText]=useState(''),[file,setFile]=useState(''),[link,setLink]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [title,setTitle]=useState(page?.title??`Session ${sessions.length+1}`),[playedOn,setPlayedOn]=useState(page?.recap?.playedOn??today());
 const [length,setLength]=useState<RecapRequest['length']>('standard'),[depth,setDepth]=useState<RecapRequest['depth']>('balanced'),[steer,setSteer]=useState(''),[skip,setSkip]=useState<Set<typeof recapParts[number]>>(new Set());
 const [cast,setCast]=useState<NonNullable<RecapRequest['cast']>>([]),[made,setMade]=useState<{id:string;title:string;saved:boolean;link?:string}|null>(resume?{id:resume.id,title:resume.title,saved:true,link:resume.recap?.request?.link}:null);
 const writers=useWriters(campaign.id),apps=writers?.apps??null,keys=writers?.keys??[];
 const [writer,setWriter]=useState(''),[copied,setCopied]=useState(''),[writing,setWriting]=useState<'no'|'busy'|'done'|'failed'>('no'),[result,setResult]=useState<{by:string;tokens:number;toCheck?:number}|null>(null);
 const fileInput=useRef<HTMLInputElement>(null);
 const characters=useMemo(()=>data.entries.filter(e=>e.kind==='character'&&e.worldId===campaign.worldId&&(e.campaignId===campaign.id||e.campaignId===null)).sort((a,b)=>(a.character?.role==='pc'?0:1)-(b.character?.role==='pc'?0:1)||a.title.localeCompare(b.title)),[data.entries,campaign]);
 const [fetched,setFetched]=useState(''),[unread,setUnread]=useState(false);
 const isLink=kind==='notion'||kind==='drive'||kind==='github',words=wordCount(text);
 // A link RPG Tools couldn't read (or the GM chose not to): the AI app reads it with its own access.
 const appReads=isLink&&fetched!==link.trim();
 const compacted=useMemo(()=>step==='options'&&!appReads?compactTranscript(text).length:0,[step,appReads,text]);
 const keyBlock=appReads?'RPG Tools couldn’t read this link, so your AI app reads it with its own access.':compacted>IN_APP_LIMIT?'This transcript is too long to write here in one go. Your AI app reads it in parts.':'';
 const key=keyBlock?undefined:keys.find(k=>k.id===writer&&k.transcripts);
 const current=made?data.entries.find(e=>e.id===made.id):undefined,arrived=!!current?.recap&&!waitingForAi(current.recap);

 const toOptions=async()=>{
  setError('');setUnread(false);
  if(isLink){
   let host='';try{host=new URL(link.trim()).hostname;}catch{setError('Paste the whole link, starting with https://.');return;}
   if(!hosts[kind].test(host)){setError(`That doesn’t look like a ${linkName[kind]} link.`);return;}
   if(fetched!==link.trim()){
    setBusy(true);
    const r=await fetch('/api/encyclopedia/recaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'link',link:link.trim()})}).then(r=>r.json().then(b=>({ok:r.ok,b}))).catch(()=>({ok:false,b:{error:'Couldn’t reach RPG Tools. Check your connection and try again.'}}));
    setBusy(false);
    if(!r.ok){setError(r.b.error??'Couldn’t read that link.');setUnread(true);return;}
    setText(r.b.text);setFetched(link.trim());
    setCast(guessCast(speakersIn(r.b.text),characters));
    if(r.b.title&&!page)setTitle(t=>/^Session \d+$/.test(t)?r.b.title.slice(0,160):t);
   }
  }else{
   if(!text.trim()){setError(kind==='file'?'Choose a file first.':'Paste the transcript first.');return;}
   if(text.length>TRANSCRIPT_LIMIT){setError('That’s over 2,000,000 characters. Split the session into two recaps.');return;}
   setCast(guessCast(speakersIn(text),characters));
  }
  setStep('options');
 };
 const pick=async(f:File|undefined)=>{if(!f)return;setError('');setBusy(true);try{const t=await readFile(f);setText(t);setFile(f.name);if(!t.trim())setError('That file has no text in it.');}catch(e){setError(e instanceof Error?e.message:'Could not read that file.');}finally{setBusy(false);}};

 const handOver=async()=>{
  if(!title.trim()){setError('Give the session a title.');return;}
  setError('');setBusy(true);
  const request:RecapRequest={length,depth,...(steer.trim()?{steer:steer.trim()}:{}),...(skip.size?{skip:[...skip]}:{}),...(cast.length?{cast}:{}),...(appReads?{link:link.trim()}:{}),at:new Date().toISOString()};
  const source=isLink?`${linkName[kind]}: ${link.trim()}`:kind==='file'?`Uploaded file: ${file}`:kind==='thread'?'An RP thread':'A pasted transcript';
  let id='';
  const ok=change(w=>{try{const r=startRecap(w,{campaignId:campaign.id,title:title.trim().slice(0,160),playedOn:playedOn||undefined,source,request,pageId:page?.id,folderId:sessionFolder(w,campaign.id)?.id??null,transcriptWords:appReads?undefined:words},new Date());id=r.id;return r.next;}catch(e){setError(e instanceof Error?e.message:'Could not make the page.');return w;}});
  if(ok===false||!id){setBusy(false);return;}
  let saved=true;
  if(!appReads){
   const r=await fetch('/api/encyclopedia/recaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'transcript',entryId:id,text})}).then(r=>r.ok).catch(()=>false);
   saved=r;
  }
  setBusy(false);setMade({id,title:title.trim(),saved,...(appReads?{link:link.trim()}:{})});setStep('handoff');
  if(key&&saved)void write(id);
  else if(key){setWriting('failed');setError('The transcript didn’t save, so it can’t be written here. Paste it on the page’s Transcript tab, then try again.');}
 };
 const write=async(id:string)=>{
  if(!key)return;
  setWriting('busy');setError('');
  try{setResult(await writeWithKey({action:'write',entryId:id,campaignId:campaign.id,connectionId:key.id}));setWriting('done');}
  catch(e){setWriting('failed');setError(e instanceof Error?e.message:'Could not write the recap.');}
 };
 const copy=(what:string,t:string)=>void navigator.clipboard.writeText(t).then(()=>{setCopied(what);setTimeout(()=>setCopied(c=>c===what?'':c),2000);}).catch(()=>setError('Your browser didn’t allow copying. Select the text and copy it.'));

 if(step==='handoff'&&made&&key&&writing!=='no'){
  const done=writing==='done'||arrived;
  return <ToolDialog title={done?'The draft is here':'Writing the recap'} onClose={onClose} wide><div className="recap-dialog">
   <p className="modal-intro">{key.name} ({key.model}) reads the transcript once, then writes the recap from its timeline. Nothing reaches players until you publish it.</p>
   <div className="handoff-done"><Check size={16}/><p><strong>{made.saved?'Transcript added':'Page ready'}</strong> to <button className="inline-link" onClick={()=>{onOpen(made.id);onClose();}}>{made.title}</button>{made.saved?', as a GM-only Transcript tab.':'.'}</p></div>
   <div className={`handoff-wait ${done?'arrived':''}`}>{done?<><Sparkles size={15}/> The draft is here{result?.toCheck!==undefined?` with ${result.toCheck} thing${result.toCheck===1?'':'s'} to check`:''}.{result?` It used ${result.tokens.toLocaleString('en')} tokens.`:''}</>:writing==='busy'?<><Clock size={15}/> {key.name} is writing. This takes a minute or two. You can close this: the draft shows up on the page.</>:<><Clock size={15}/> It wasn’t written.</>}</div>
   {error&&<p className="form-error">{error}</p>}
   <div className="dialog-footer"><span/><div className="button-row">{writing==='failed'&&<><button className="button" onClick={()=>{setWriter('');setWriting('no');setError('');}}>Hand to my AI app instead</button><button className="button" onClick={()=>void write(made.id)}>Try again</button></>}<button className="button" onClick={onClose}>Close</button><button className="button primary" onClick={()=>{onOpen(made.id);onClose();}}>Open the page</button></div></div>
  </div></ToolDialog>;
 }
 if(step==='handoff'&&made){
  const ask=`Use the recap_from_source prompt in RPG Tools for "${campaign.name}" with page "${made.title}".\n${made.link?`Source: ${made.link} (read it with your own access).`:'Source: the transcript on that page.'}`;
  return <ToolDialog title="Hand it to your AI app" onClose={onClose} wide><div className="recap-dialog">
   <p className="modal-intro">{apps?.length?`${apps.join(', ')} ${apps.length===1?'is':'are'} connected to this campaign.`:apps?'No AI app is connected to this campaign yet. Set one up with Connect an AI in the sidebar, with Assist access or more.':' '}</p>
   <div className="handoff-done"><Check size={16}/><p><strong>{made.link?'Page ready':made.saved?'Transcript added':'Page ready'}</strong> {made.link?'for':'to'} the new page <button className="inline-link" onClick={()=>{onOpen(made.id);onClose();}}>{made.title}</button>{made.link?'. Your options are saved with it.':made.saved?', as a GM-only Transcript tab. Your options are saved with it.':'. The transcript didn’t save: paste it on the page’s Transcript tab before you hand it over.'}</p></div>
   <span className="field-title">Paste this into Claude Code, Codex or your AI app</span>
   <div className="prompt-box"><pre>{ask}</pre><button className="button small" onClick={()=>copy('ask',ask)}>{copied==='ask'?<Check size={13}/>:<Copy size={13}/>} {copied==='ask'?'Copied':'Copy'}</button></div>
   <p className="aside-hint">In apps with a slash menu it’s also there as <code>/recap_from_source</code>. Long transcripts are read in parts. The AI saves a draft with <code>save_recap</code>; it can’t publish to players.</p>
   <div className={`handoff-wait ${arrived?'arrived':''}`}>{arrived?<><Sparkles size={15}/> The draft is here{current?.recap?` with ${current.recap.timeline.length} beats and ${openItems(current.recap).length} things to check`:''}.</>:<><Clock size={15}/> Waiting for your AI’s draft. You can close this: the draft shows up on the page.</>}</div>
   {error&&<p className="form-error">{error}</p>}
   <div className="dialog-footer"><span/><div className="button-row"><button className="button" onClick={onClose}>Close</button><button className="button primary" onClick={()=>{onOpen(made.id);onClose();}}>Open the page</button></div></div>
  </div></ToolDialog>;
 }

 return <ToolDialog title="New session recap" onClose={onClose} wide><div className="recap-dialog">
  <p className="modal-intro">{step==='source'?'The AI reads what happened and drafts a recap for you to check. Nothing reaches players until you publish it.':appReads?`${linkName[kind as 'notion']} · ${link.trim()}`:`${isLink?`${linkName[kind as 'notion']} read by RPG Tools`:kind==='file'?file:kind==='thread'?'RP thread':'Pasted transcript'} · ${words.toLocaleString('en')} words`}</p>
  <div className="recap-steps" aria-label="Steps"><span className={step==='source'?'on':'done'}><b>1</b> Source</span><span className={step==='options'?'on':''}><b>2</b> Options</span><span><b>3</b> {key?'Write it':'Hand it over'}</span></div>
  {step==='source'?<>
   <div className="source-grid" role="radiogroup" aria-label="Where the session is">{sources.map(s=>{const Icon=s.icon,off=s.kind==='forum';return <button key={s.kind} role="radio" aria-checked={kind===s.kind} disabled={off} className={`source-card ${kind===s.kind?'on':''}`} onClick={()=>{if(off)return;setKind(s.kind as Kind);setError('');if(s.kind==='file')fileInput.current?.click();}}><span className="source-icon"><Icon size={16}/></span><span><strong>{s.title}{off&&<small className="soon">After the forum</small>}</strong><small>{s.hint}</small></span></button>;})}</div>
   <input ref={fileInput} type="file" hidden accept=".txt,.md,.markdown,.log,.csv,.json,.html,.htm,text/plain,text/markdown,application/json,text/html" onChange={e=>{void pick(e.target.files?.[0]);e.target.value='';}}/>
   {isLink?<label className="field-title">Link to the {linkName[kind as 'notion']}<input className="recap-input" type="url" autoFocus value={link} placeholder={kind==='notion'?'https://www.notion.so/…/Session-13-notes':kind==='drive'?'https://docs.google.com/document/d/…':'https://github.com/you/campaign/blob/main/sessions/session-13.md'} onChange={e=>{setLink(e.target.value);setUnread(false);}}/>{fetched&&fetched===link.trim()&&<small className="link-read"><Check size={12}/> Read: {words.toLocaleString('en')} words · {playTime(words)}</small>}</label>
   :<label className="field-title"><span className="field-row"><span>{kind==='file'?(file?`From ${file}`:'The file’s text shows here'):kind==='thread'?'The thread':'Transcript'}</span>{words>0&&<small>{words.toLocaleString('en')} words · {playTime(words)}</small>}</span>
    {kind==='file'&&!text?<button className="drop-zone" onClick={()=>fileInput.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void pick(e.dataTransfer.files[0]);}}>{busy?'Reading…':<><Upload size={16}/> Choose a file, or drop it here</>}</button>
    :<textarea className="recap-input transcript-paste" value={text} maxLength={TRANSCRIPT_LIMIT} placeholder={kind==='thread'?'Paste the thread. Each post’s author at the start of a line works best, such as “Mara: …”.':'GM: The ferry bumps against the Greyfen landing.\nMara (Bram): I keep my hand on my sword.'} onChange={e=>setText(e.target.value)}/>}</label>}
   {error&&<p className="form-error">{error}</p>}
   <div className="dialog-footer"><span className="aside-hint">{isLink?'Private links go to your AI app, which reads them with its own access.':'You provide the transcript. Audio isn’t transcribed here.'}</span><div className="button-row"><button className="button" onClick={onClose}>Cancel</button>{unread&&<button className="button" onClick={()=>{setError('');setUnread(false);setFetched('');setStep('options');}}>Let my AI app read it</button>}<button className="button primary" disabled={busy} onClick={()=>void toOptions()}>{busy&&isLink?'Reading…':isLink&&fetched!==link.trim()?'Read the link':'Next'} <ArrowRight size={14}/></button></div></div>
  </>:<>
   <div className="recap-options">
    <div>
     <label className="field-title">Title<input className="recap-input" maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label>
     <label className="field-title">Played on<input className="recap-input date" type="date" value={playedOn} onChange={e=>setPlayedOn(e.target.value)}/></label>
     {cast.length>0&&<div className="field-title">Who is who<div className="cast-rows">{cast.map((c,i)=><div key={c.speaker} className="cast-row"><code>{c.speaker}</code><ArrowRight size={13}/><select aria-label={`Who ${c.speaker} is`} value={c.as} onChange={e=>{const v=e.target.value,p=characters.find(x=>x.id===v);setCast(cast.map((x,j)=>j===i?{speaker:x.speaker,as:v,...(p?{name:p.title}:{})}:x));}}><option value="gm">The GM (you)</option><option value="">A player, no character</option>{characters.map(p=><option key={p.id} value={p.id}>{p.title}{p.character?.role==='pc'?' · player character':''}</option>)}</select></div>)}</div></div>}
     <div className="field-title">Recap length<div className="segmented wide">{(['short','standard','detailed'] as const).map(x=><button key={x} className={length===x?'on':''} onClick={()=>setLength(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div></div>
     <div className="field-title">How much to pull out<div className="segmented wide">{([['main','Main things'],['balanced','Balanced'],['everything','Everything']] as const).map(([x,l])=><button key={x} className={depth===x?'on':''} onClick={()=>setDepth(x)}>{l}</button>)}</div></div>
     <label className="field-title">Anything to steer it<textarea className="recap-input" rows={3} maxLength={500} value={steer} placeholder="Warm and a little ominous. Name each player character at least once." onChange={e=>setSteer(e.target.value)}/></label>
    </div>
    <div>
     <div className="field-title">What to make<div className="make-list">{recapParts.map(k=><label key={k}><input type="checkbox" checked={!skip.has(k)} onChange={e=>{const n=new Set(skip);if(e.target.checked)n.delete(k);else n.add(k);setSkip(n);}}/> <span>{partLabels[k][0]}</span><small>{partLabels[k][1]}</small></label>)}</div></div>
     <div className="field-title">Who writes it
      <label className={`writer-card ${!key?'on':''}`}><input type="radio" name="writer" checked={!key} onChange={()=>setWriter('')}/><span><strong>Your AI app {apps?.length?<small className="soon on">Connected: {apps[0]}</small>:null}</strong><small>Claude Code, Codex, Claude, ChatGPT or another app connected over MCP. It reads the source with its own access, so private Notion, Drive and GitHub work.</small></span></label>
      {keys.length?keys.map(k=>{const off=keyBlock||(!k.transcripts?`${k.name} can’t read GM-only things, and transcripts are GM-only. Turn that on under What it may do.`:'');return <label key={k.id} className={`writer-card ${key?.id===k.id?'on':''} ${off?'off':''}`}><input type="radio" name="writer" disabled={!!off} checked={key?.id===k.id} onChange={()=>setWriter(k.id)}/><span><strong><KeyRound size={13}/> {keys.length>1?k.name:'An API key, here'} {!off&&<small className="soon">About {recapTokens(compacted).toLocaleString('en')} tokens</small>}</strong><small>{off||`Runs in RPG Tools with ${k.name} (${k.model}). Works for pasted text, files and public links.`}</small></span></label>;})
      :<label className="writer-card off"><input type="radio" name="writer" disabled/><span><strong><KeyRound size={13}/> An API key, here</strong><small>Runs in RPG Tools with your own AI key. Add one with Connect an AI › Use an API key, with Help me run the game or Run the game.</small></span></label>}
     </div>
    </div>
   </div>
   {error&&<p className="form-error">{error}</p>}
   <div className="dialog-footer"><span className="aside-hint">{page?`Fills “${page.title}”.${page.body.trim()&&!page.recap?' Its current text moves to a GM-only tab.':''} Players can’t see it until you publish.`:'Makes a new GM-only session page.'}</span><div className="button-row"><button className="button" onClick={()=>setStep('source')}>Back</button><button className="button primary" disabled={busy} onClick={handOver}><Sparkles size={14}/> {busy?'Saving…':key?`Write it with ${key.name}`:'Hand to my AI app'}</button></div></div>
  </>}
 </div></ToolDialog>;
}
