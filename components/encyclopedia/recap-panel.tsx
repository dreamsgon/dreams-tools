"use client";
/*
 * A session recap on its page: the chips under the title, the Timeline, Quotes and Transcript tabs, and the
 * "Check before publishing" list in the side panel. The recap text itself is the page's Overview, and its
 * GM notes use the page's own editor (see article-editor.tsx).
 */
import {useEffect,useState} from 'react';
import {Check,Eye,EyeOff,Plus,Trash2,ArrowUp,ArrowDown,Send,FileText,Sparkles,Clock} from 'lucide-react';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {emptyRecap,type Beat,type Quote,type Recap,type RecapItem} from '@/lib/encyclopedia/recap-schema';
import {applyItem,openItems,publishRecap,quoteInTranscript,skipItem,wordCount,TRANSCRIPT_LIMIT} from '@/lib/encyclopedia/recaps';
import {newId} from '@/lib/encyclopedia/world-model';
import {confirmDialog} from '../confirm-dialog';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
const words=(n:number)=>`${n.toLocaleString('en')} word${n===1?'':'s'}`;

// ---- The transcript, loaded when a tab needs it and kept for the visit -----------------------

const cache=new Map<string,string>();
function useTranscript(entryId:string){
 const [text,setText]=useState<string|null>(()=>cache.get(entryId)??null),[error,setError]=useState('');
 useEffect(()=>{
  if(cache.has(entryId))return;
  let live=true;
  fetch(`/api/encyclopedia/recaps?entryId=${encodeURIComponent(entryId)}`).then(r=>r.json().then(b=>({ok:r.ok,b}))).then(({ok,b})=>{
   if(!live)return;
   if(!ok){setError(b.error??'Could not load the transcript.');return;}
   cache.set(entryId,b.text);setText(b.text);
  }).catch(()=>{if(live)setError('Could not load the transcript.');});
  return ()=>{live=false;};
 },[entryId]);
 return {text:text??cache.get(entryId)??null,error,set:(t:string)=>{cache.set(entryId,t);setText(t);}};
}

// ---- Under the title ---------------------------------------------------------------------------

export function RecapChips({recap}:{recap:Recap}){
 const played=recap.playedOn?new Date(`${recap.playedOn}T12:00:00`).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}):'';
 return <div className="recap-chips">
  {recap.status==='draft'?<><span className="recap-chip draft">Draft{recap.by?` from ${recap.by}`:''}</span><span className="recap-chip">Players can’t see it yet</span></>:<span className="recap-chip shared"><Eye size={12}/> Published to players</span>}
  {recap.source&&<span className="recap-chip">{recap.source}</span>}
  {recap.transcriptWords?<span className="recap-chip">Transcript · {words(recap.transcriptWords)}</span>:null}
  {played&&<span className="recap-chip">Played {played}</span>}
 </div>;
}

// ---- Timeline ----------------------------------------------------------------------------------

export function TimelineTab({recap,editing,onChange}:{recap:Recap;editing:boolean;onChange:(timeline:Beat[])=>void}){
 const beats=recap.timeline,set=(i:number,p:Partial<Beat>)=>onChange(beats.map((b,j)=>j===i?{...b,...p}:b));
 const move=(i:number,d:number)=>{const n=[...beats],t=i+d;if(t<0||t>=n.length)return;[n[i],n[t]]=[n[t],n[i]];onChange(n);};
 if(!editing)return beats.length?<ol className="recap-timeline">{beats.map(b=><li key={b.id} className={b.big?'big':''}><span className="beat-dot" aria-hidden="true"/><div><strong>{b.title}</strong>{b.big&&<span className="beat-tag">Big beat</span>}{b.steps.length>0&&<ul>{b.steps.map((s,i)=><li key={i}>{s}</li>)}</ul>}</div></li>)}</ol>:<p className="muted">No timeline yet. Choose Write to add the beats of the session.</p>;
 return <div className="timeline-editor">
  {beats.map((b,i)=><div key={b.id} className="beat-edit">
   <div className="beat-row"><input aria-label={`Beat ${i+1}`} value={b.title} maxLength={200} onChange={e=>set(i,{title:e.target.value})}/><label className="beat-big"><input type="checkbox" checked={b.big} onChange={e=>set(i,{big:e.target.checked})}/> Big beat</label>
    <button className="icon-button" aria-label="Move beat up" disabled={i===0} onClick={()=>move(i,-1)}><ArrowUp size={14}/></button><button className="icon-button" aria-label="Move beat down" disabled={i===beats.length-1} onClick={()=>move(i,1)}><ArrowDown size={14}/></button><button className="icon-button" aria-label="Delete beat" onClick={()=>onChange(beats.filter((_,j)=>j!==i))}><Trash2 size={14}/></button></div>
   <textarea aria-label={`Steps of beat ${i+1}`} rows={Math.max(2,b.steps.length+1)} value={b.steps.join('\n')} placeholder="One step a line" onChange={e=>set(i,{steps:e.target.value.split('\n').slice(0,12).map(s=>s.slice(0,300))})} onBlur={()=>set(i,{steps:b.steps.map(s=>s.trim()).filter(Boolean)})}/>
  </div>)}
  <button className="text-button" disabled={beats.length>=60} onClick={()=>onChange([...beats,{id:newId(),title:'New beat',big:false,steps:[]}])}><Plus size={13}/> Add a beat</button>
 </div>;
}

// ---- Quotes ------------------------------------------------------------------------------------

export function QuotesTab({entryId,recap,editing,onChange}:{entryId:string;recap:Recap;editing:boolean;onChange:(quotes:Quote[])=>void}){
 const {text}=useTranscript(entryId),quotes=recap.quotes,set=(i:number,p:Partial<Quote>)=>onChange(quotes.map((q,j)=>j===i?{...q,...p}:q));
 const check=(q:Quote)=>text?quoteInTranscript(q.text,text):q.checked;
 if(!editing)return <div className="recap-quotes">{quotes.map(q=>{const ok=check(q);return <figure key={q.id}><blockquote>“{q.text.replace(/^["“]|["”]$/g,'')}”</blockquote><figcaption>{q.who||'Someone at the table'}{ok===true&&<span className="quote-check" title="Found word for word in the transcript"><Check size={12}/> In the transcript</span>}{ok===false&&<span className="quote-check off" title="Not found word for word in the transcript">Not found in the transcript</span>}</figcaption></figure>;})}
  {!quotes.length&&<p className="muted">No quotes yet.</p>}{text!==null&&text!==''&&quotes.length>0&&<p className="aside-hint">Each quote is checked against the Transcript tab, word for word.</p>}</div>;
 return <div className="quotes-editor">
  {quotes.map((q,i)=><div key={q.id} className="quote-edit"><textarea aria-label={`Quote ${i+1}`} rows={2} maxLength={500} value={q.text} onChange={e=>set(i,{text:e.target.value})}/><div className="beat-row"><input aria-label={`Who said quote ${i+1}`} placeholder="Who said it" maxLength={120} value={q.who} onChange={e=>set(i,{who:e.target.value})}/><button className="icon-button" aria-label="Delete quote" onClick={()=>onChange(quotes.filter((_,j)=>j!==i))}><Trash2 size={14}/></button></div></div>)}
  <button className="text-button" disabled={quotes.length>=20} onClick={()=>onChange([...quotes,{id:newId(),text:'…',who:''}])}><Plus size={13}/> Add a quote</button>
 </div>;
}

// ---- Transcript --------------------------------------------------------------------------------

export function TranscriptTab({entry,editing,update}:{entry:Entry;editing:boolean;update:(p:Partial<Entry>)=>void}){
 const {text,error,set}=useTranscript(entry.id),[draft,setDraft]=useState<string|null>(null),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 const save=async(value:string)=>{
  setBusy(true);setNote('');
  const r=await fetch('/api/encyclopedia/recaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'transcript',entryId:entry.id,text:value})}).then(r=>r.json().then(b=>({ok:r.ok,b}))).catch(()=>({ok:false,b:{error:'Could not save the transcript.'}}));
  setBusy(false);
  if(!r.ok){setNote(r.b.error??'Could not save the transcript. Is the page saved yet?');return;}
  set(value);setDraft(null);
  if(entry.recap)update({recap:{...entry.recap,transcriptWords:r.b.words||undefined}});
  setNote(value.trim()?`Saved ${words(r.b.words)}.`:'Removed the transcript.');
 };
 if(error)return <p className="form-error">{error}</p>;
 if(text===null)return <p className="muted">Loading…</p>;
 const value=draft??text;
 return <div className="transcript-tab">
  <p className="aside-hint"><FileText size={13}/> Kept apart from your pages, so it never counts toward the 2 MB limit. Only you and AI apps you connect with “See GM-only things” can read it. They read it in parts of about 5,000 tokens, with timestamps and filler taken out.</p>
  {editing?<>
   <textarea className="editor transcript-editor" aria-label="Transcript" value={value} maxLength={TRANSCRIPT_LIMIT} placeholder={'Paste the session transcript here, such as\nMara: I’m not hiding. I’m being very still in a threatening way.\nGM: Ostra Hale lifts the toll lantern.'} onChange={e=>setDraft(e.target.value)}/>
   <div className="button-row transcript-actions"><button className="button primary small" disabled={busy||draft===null} onClick={()=>save(value)}>{busy?'Saving…':'Save transcript'}</button>{draft!==null&&<button className="button small" onClick={()=>setDraft(null)}>Cancel</button>}<span className="word-count">{words(wordCount(value))}</span></div>
  </>:text?<pre className="transcript-read">{text}</pre>:<p className="muted">No transcript yet. Choose Write to paste one, then ask your AI app to recap the session.</p>}
  {!editing&&text&&<div className="button-row transcript-actions"><button className="button small" onClick={async()=>{if(await confirmDialog({title:'Remove the transcript?',message:'The recap stays. Your AI app can’t read the transcript again.',confirm:'Remove',danger:true}))save('');}}><Trash2 size={13}/> Remove</button></div>}
  {note&&<p role="status" className="info-note">{note}</p>}
 </div>;
}

// ---- Check before publishing -------------------------------------------------------------------

const groupOf=(r:RecapItem)=>r.kind==='questLog'||r.kind==='newQuest'?'Quests':r.kind==='codex'?'Codex':'People, places and things';
const tagOf:Record<RecapItem['kind'],string>={newPage:'New',update:'Update',questLog:'Journal',newQuest:'New',codex:'Found'};
const doLabel:Record<RecapItem['kind'],string>={newPage:'Make page',update:'Add',questLog:'Add',newQuest:'Make quest',codex:'Mark found'};
function describe(r:RecapItem){
 if(r.kind==='newPage')return `${r.pageKind?r.pageKind[0].toUpperCase()+r.pageKind.slice(1):'Note'} · ${r.text}${r.playersSee?' Players see it.':' GM-only page to start.'}`;
 if(r.kind==='update')return `Add: “${r.text}”`;
 if(r.kind==='questLog')return `${r.text?`${r.playersSee?'Shared':'GM-only'} entry: “${r.text}”`:''}${r.tick?`${r.text?' ':''}Ticks the step ${r.tick}.`:''}`;
 if(r.kind==='newQuest')return `Rumour quest.${r.text?` ${r.text}`:''}${r.playersSee?' Players see it.':''}`;
 return `Marks it found in the codex${r.text?` (${r.text})`:''}.`;
}

export function RecapCheck({entry,data,change,onOpen,setNotice}:{entry:Entry;data:Workspace;change:Change;onOpen:(id:string)=>void;setNotice:(s:string)=>void}){
 const recap=entry.recap??emptyRecap(),open=openItems(recap),done=recap.review.filter(r=>r.state!=='open');
 const [editing,setEditing]=useState<string|null>(null),[text,setText]=useState(''),[same,setSame]=useState<string|null>(null),[posting,setPosting]=useState(false);
 const others=data.entries.filter(e=>e.id!==entry.id&&e.kind!=='folder'&&e.kind!=='session'&&e.worldId===entry.worldId&&(e.campaignId===entry.campaignId||e.campaignId===null)).sort((a,b)=>a.title.localeCompare(b.title));
 const editItem=(id:string,p:Partial<RecapItem>)=>change(w=>({...w,entries:w.entries.map(e=>e.id===entry.id&&e.recap?{...e,recap:{...e.recap,review:e.recap.review.map(r=>r.id===id?{...r,...p}:r)}}:e)}));
 const apply=(ids:string[])=>{
  const said:string[]=[];
  change(w=>{let next=w;for(const id of ids){try{const r=applyItem(next,entry.id,id);next=r.next;said.push(r.message);}catch(e){said.push(e instanceof Error?e.message:'Could not do that.');}}return next;});
  setNotice(said.length>2?`Done: ${said.length} changes. ${said.at(-1)}`:said.join(' '));
 };
 const publish=async(on:boolean)=>{
  if(on&&open.length&&!await confirmDialog({title:`Publish with ${open.length} left to check?`,message:'The recap goes to players now. What’s left stays in the list for later.',confirm:'Publish'}))return;
  if(change(w=>publishRecap(w,entry.id,on))!==false)setNotice(on?'Published. Players see the recap on the player link.':'Unpublished. Players can’t see it now.');
 };
 const post=async()=>{
  setPosting(true);
  const r=await fetch('/api/encyclopedia/recaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'discord',entryId:entry.id})}).then(r=>r.json().then(b=>({ok:r.ok,b}))).catch(()=>({ok:false,b:{error:'Could not post it.'}}));
  setPosting(false);
  setNotice(r.ok?(r.b.skipped?'Discord recaps are off for this campaign. Turn them on in Maptable › Connections.':'Posted the recap to Discord.'):(r.b.error==='Publish the recap to players before posting it.'?'Publish the recap and let it save first, then post it.':r.b.error));
 };
 const groups=['People, places and things','Quests','Codex'].map(g=>({g,items:open.filter(r=>groupOf(r)===g)})).filter(x=>x.items.length);
 return <div className="aside-section recap-check">
  <div className="aside-heading"><span className="eyebrow">CHECK BEFORE PUBLISHING</span><small className="muted">{open.length?`${open.length} left`:'All done'}</small></div>
  <p className="aside-hint">What the AI found in this session. Nothing changes in your pages until you press a button.</p>
  {groups.map(({g,items})=><div key={g} className="check-group"><span className="eyebrow">{g.toUpperCase()}</span>{items.map(r=><div key={r.id} className="check-item">
   <div className="check-title"><span className={`check-tag ${r.kind==='update'?'update':r.kind==='questLog'?'journal':''}`}>{tagOf[r.kind]}</span>{r.pageId?<button className="inline-link" onClick={()=>onOpen(r.pageId!)}>{r.name}</button>:<strong>{r.name}</strong>}</div>
   {editing===r.id?<><textarea className="check-text" aria-label={`Text for ${r.name}`} rows={4} maxLength={4000} value={text} onChange={e=>setText(e.target.value)}/><div className="check-actions"><button className="button primary small" onClick={()=>{editItem(r.id,{text:text.trim()});setEditing(null);}}>Save</button><button className="button small" onClick={()=>setEditing(null)}>Cancel</button></div></>
   :same===r.id?<><label className="field-label">Same as<select autoFocus aria-label={`${r.name} is the same as`} defaultValue="" onChange={e=>{const p=others.find(x=>x.id===e.target.value);if(p){editItem(r.id,{kind:'update',pageId:p.id,name:p.title,pageKind:undefined});setSame(null);}}}><option value="" disabled>Choose a page</option>{others.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><div className="check-actions"><button className="button small" onClick={()=>setSame(null)}>Cancel</button></div></>
   :<><p className="check-text">{describe(r)}</p><div className="check-actions"><button className="button primary small" onClick={()=>apply([r.id])}><Check size={13}/> {doLabel[r.kind]}</button>{r.kind==='newPage'&&others.length>0&&<button className="button small" onClick={()=>setSame(r.id)}>Same as…</button>}{r.kind!=='codex'&&<button className="button small" onClick={()=>{setEditing(r.id);setText(r.text);}}>Edit</button>}<button className="button small" onClick={()=>change(w=>skipItem(w,entry.id,r.id))}>Skip</button></div></>}
  </div>)}</div>)}
  {done.length>0&&<details className="check-done"><summary>{done.length} done or skipped</summary>{done.map(r=><p key={r.id} className="aside-hint">{r.state==='done'?<Check size={12}/>:'–'} {tagOf[r.kind]} · {r.pageId?<button className="inline-link" onClick={()=>onOpen(r.pageId!)}>{r.name}</button>:r.name}{r.state==='skipped'?' (skipped)':''}</p>)}</details>}
  <div className="check-footer">
   {open.length>1&&<div className="check-actions"><button className="button small" onClick={()=>apply(open.map(r=>r.id))}><Check size={13}/> Add all {open.length}</button><button className="button small" onClick={()=>change(w=>open.reduce((x,r)=>skipItem(x,entry.id,r.id),w))}>Skip the rest</button></div>}
   <div className="check-actions">{recap.status==='draft'?<button className="button primary" onClick={()=>publish(true)}><Eye size={14}/> Publish to players</button>:<button className="button" onClick={()=>publish(false)}><EyeOff size={14}/> Unpublish</button>}{recap.status==='published'&&<button className="button" disabled={posting} onClick={post}><Send size={14}/> {posting?'Posting…':'Post to Discord'}</button>}</div>
   <p className="aside-hint">{recap.status==='draft'?'Publishing shares the recap text with players. Timeline and quotes go too when you set their tabs to Player visible.':'Players see the recap. Unpublish to hide it again.'}</p>
  </div>
 </div>;
}

/** A session page with no recap yet: how to get one. */
export function RecapStart({entry,onStart}:{entry:Entry;onStart?:()=>void}){
 return <div className="aside-section recap-check"><span className="eyebrow">AI RECAP</span><p className="aside-hint">Have your AI app draft a recap of this session from a transcript, an RP thread, or notes in Notion, Google Drive or GitHub. You check it before players see anything.</p>{onStart&&<button className="button primary small recap-start" onClick={onStart}><Sparkles size={13}/> New session recap</button>}{entry.overviewVisibility==='players'&&<p className="aside-hint">Players can see this page now. It’s hidden from them while the recap is a draft.</p>}</div>;
}

/** A recap asked for in the New session recap dialog that the AI hasn't saved yet. */
export function RecapWaiting({recap,onShow}:{recap:Recap;onShow?:()=>void}){
 return <div className="aside-section recap-check"><div className="aside-heading"><span className="eyebrow">CHECK BEFORE PUBLISHING</span></div><div className="handoff-wait"><Clock size={15}/> Waiting for your AI’s draft.</div><p className="aside-hint">Asked {new Date(recap.request!.at).toLocaleString('en',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}. When your AI app saves it, it shows up here with what it found.</p>{onShow&&<button className="button small" onClick={onShow}>Show the prompt again</button>}</div>;
}
