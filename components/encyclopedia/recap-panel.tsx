"use client";
/*
 * A session recap on its page: the chips under the title, the Timeline, Quotes and Transcript tabs, and the
 * "Check before publishing" list in the side panel. The recap text itself is the page's Overview, and its
 * GM notes use the page's own editor (see article-editor.tsx).
 */
import {useEffect,useState} from 'react';
import {Check,Eye,EyeOff,Plus,Trash2,ArrowUp,ArrowDown,Send,FileText,Sparkles,Clock,RotateCcw,Copy,PenLine,X,Download,Undo2} from 'lucide-react';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {emptyRecap,type Beat,type Quote,type Recap,type RecapItem} from '@/lib/encyclopedia/recap-schema';
import {applyItem,openItems,publishRecap,quoteInTranscript,skipItem,undoItem,wordCount,TRANSCRIPT_LIMIT} from '@/lib/encyclopedia/recaps';
import {newId} from '@/lib/encyclopedia/world-model';
import {tieLabel,tieTypeById,tieTypesOf} from '@/lib/encyclopedia/ties';
import {confirmDialog} from '../confirm-dialog';
import {AiWritingDialog,StylePicker} from './ai-writing';
import {useWriters} from './use-writers';
import {keyFields} from '@/lib/ai/device-keys';

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

// ---- Who can write a recap ---------------------------------------------------------------------

export {useWriters,type KeyWriter} from './use-writers';

/** Asks RPG Tools to write with an API-key connection. Returns the server's answer, or throws its message. */
export async function writeWithKey({connectionId,...body}:{action:'write'|'again'|'check';entryId:string;campaignId:string;connectionId:string;note?:string;styleId?:string}){
 const r=await fetch('/api/encyclopedia/recaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,...keyFields(connectionId)})}).then(r=>r.json().then(b=>({ok:r.ok,b}))).catch(()=>({ok:false,b:{error:'Couldn’t reach RPG Tools. Check your connection and try again.'}}));
 if(!r.ok)throw Error(r.b.error??'Could not write the recap.');
 return r.b as {tokens:number;by:string;toCheck?:number;added?:number};
}

// ---- Under the title ---------------------------------------------------------------------------

export function RecapChips({recap}:{recap:Recap}){
 const played=recap.playedOn?new Date(`${recap.playedOn}T12:00:00`).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}):'';
 return <div className="recap-chips">
  {recap.status==='draft'?<><span className="recap-chip draft">Draft{recap.mine?' · written by you':recap.by?` from ${recap.by}`:''}</span><span className="recap-chip">Players can’t see it yet</span></>:<span className="recap-chip shared"><Eye size={12}/> Published to players</span>}
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

// ---- Key moments and Next time -----------------------------------------------------------------

/** Lines to a list: blank lines and spaces at the ends go. */
const toLines=(t:string,max:number)=>t.split('\n').map(x=>x.trim().slice(0,300)).filter(Boolean).slice(0,max);
/** "Name: text" lines to pairs; a line with no colon is all text. */
const toPairs=(t:string,max:number,left:number)=>toLines(t,max).map(l=>{const i=l.indexOf(':');return i>0&&i<=left?[l.slice(0,i).trim(),l.slice(i+1).trim()]:['',l];});
/** A textarea kept as typed until it loses focus, then saved as a list. */
function LinesField({label,hint,value,rows=3,onSave}:{label:string;hint:string;value:string;rows?:number;onSave:(text:string)=>void}){
 const [text,setText]=useState<string|null>(null);
 return <label className="recap-lines-field"><span>{label} <small className="muted">{hint}</small></span><textarea className="check-text" rows={rows} value={text??value} onChange={e=>setText(e.target.value)} onBlur={()=>{if(text!==null){onSave(text);setText(null);}}}/></label>;
}

export function MomentsTab({recap,editing,onChange}:{recap:Recap;editing:boolean;onChange:(p:Partial<Recap>)=>void}){
 const moments=recap.moments??[],spotlights=recap.spotlights??[],encounters=recap.encounters??[];
 if(editing)return <div className="recap-lines-editor">
  <LinesField label="Key moments" hint="one a line" value={moments.join('\n')} onSave={t=>onChange({moments:toLines(t,20)})}/>
  <LinesField label="Character spotlights" hint="one a line, as Name: what they did" value={spotlights.map(s=>`${s.who}: ${s.text}`).join('\n')} onSave={t=>onChange({spotlights:toPairs(t,12,120).filter(([who,text])=>who&&text).map(([who,text])=>({who,text}))})}/>
  <LinesField label="Encounters" hint="one a line, as Name: how it went" value={encounters.map(e=>e.outcome?`${e.name}: ${e.outcome}`:e.name).join('\n')} onSave={t=>onChange({encounters:toPairs(t,20,160).map(([a,b])=>a?{name:a,outcome:b}:{name:b,outcome:''})})}/>
 </div>;
 const parts=[moments.length>0,spotlights.length>0,encounters.length>0].filter(Boolean).length;
 if(!parts)return <p className="muted">No key moments yet. Choose Write to add some, or turn Key moments on in What it pulls out.</p>;
 return <div className="recap-moments">
  {moments.length>0&&<section>{parts>1&&<h3>Key moments</h3>}<ul>{moments.map((m,i)=><li key={i}>{m}</li>)}</ul></section>}
  {spotlights.length>0&&<section>{parts>1&&<h3>Character spotlights</h3>}<ul>{spotlights.map((s,i)=><li key={i}><strong>{s.who}:</strong> {s.text}</li>)}</ul></section>}
  {encounters.length>0&&<section>{parts>1&&<h3>Encounters</h3>}<ul>{encounters.map((e,i)=><li key={i}><strong>{e.name}</strong>{e.outcome&&`: ${e.outcome}`}</li>)}</ul></section>}
 </div>;
}

export function NextTab({recap,editing,onChange}:{recap:Recap;editing:boolean;onChange:(p:Partial<Recap>)=>void}){
 const next=recap.next??[],threads=recap.threads??[],status=recap.partyStatus??'';
 if(editing)return <div className="recap-lines-editor">
  <LinesField label="Party status" hint="where they stand at the end" rows={3} value={status} onSave={t=>onChange({partyStatus:t.trim().slice(0,2000)||undefined})}/>
  <LinesField label="Next steps" hint="one a line" value={next.join('\n')} onSave={t=>onChange({next:toLines(t,12)})}/>
  <LinesField label="Loose threads" hint="one a line" value={threads.join('\n')} onSave={t=>onChange({threads:toLines(t,20)})}/>
 </div>;
 if(!status.trim()&&!next.length&&!threads.length)return <p className="muted">Nothing for next time yet. Choose Write to add the party’s status, next steps and loose threads.</p>;
 return <div className="recap-moments">
  <p className="aside-hint"><EyeOff size={13}/> For your prep. Players never see this tab.</p>
  {status.trim()&&<section><h3>Party status</h3><p>{status}</p></section>}
  {next.length>0&&<section><h3>Next steps</h3><ul>{next.map((n,i)=><li key={i}>{n}</li>)}</ul></section>}
  {threads.length>0&&<section><h3>Loose threads</h3><ul>{threads.map((t,i)=><li key={i}>{t}</li>)}</ul></section>}
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

const groupOf=(r:RecapItem)=>r.kind==='questLog'||r.kind==='newQuest'?'Quests':r.kind==='codex'?'Codex':r.kind==='loot'?'Items and loot':r.kind==='tie'?'Relationships':r.kind==='date'?'Calendar':'People, places and things';
const groupOrder=['People, places and things','Quests','Items and loot','Relationships','Calendar','Codex'];
const tagOf:Record<RecapItem['kind'],string>={newPage:'New',update:'Update',questLog:'Journal',newQuest:'New',codex:'Found',loot:'Loot',tie:'Tie',date:'Date'};
const doLabel:Record<RecapItem['kind'],string>={newPage:'Make page',update:'Add',questLog:'Add',newQuest:'Make quest',codex:'Mark found',loot:'Add to inventory',tie:'Add tie',date:'Move calendar'};
/** A tie's kind, read from where it starts. */
const tieName=(data:Workspace,worldId:string,r:RecapItem)=>{const t=tieTypeById(tieTypesOf(data.worlds.find(w=>w.id===worldId)),r.typeId??'linked');return r.reversed?tieLabel(t,false):t.name;};
function describe(r:RecapItem,carrier?:string,tie?:string){
 if(r.kind==='loot')return `${r.qty?`${r.qty} of them. `:''}${r.text?`${r.text} `:''}${carrier?`Goes in ${carrier}’s inventory.`:'Who carries it?'}`;
 if(r.kind==='tie')return `${tie} ${r.to}.${r.text?` “${r.text}”`:''}${r.playersSee?' Players see it.':' GM only.'}`;
 if(r.kind==='date')return 'Moves the campaign calendar on to this day, and marks the session on it (GM only).';
 if(r.kind==='newPage')return `${r.pageKind?r.pageKind[0].toUpperCase()+r.pageKind.slice(1):'Note'} · ${r.text}${r.playersSee?' Players see it.':' GM-only page to start.'}`;
 if(r.kind==='update')return `Add: “${r.text}”`;
 if(r.kind==='questLog')return `${r.text?`${r.playersSee?'Shared':'GM-only'} entry: “${r.text}”`:''}${r.tick?`${r.text?' ':''}Ticks the step ${r.tick}.`:''}`;
 if(r.kind==='newQuest')return `Rumour quest.${r.text?` ${r.text}`:''}${r.playersSee?' Players see it.':''}`;
 return `Marks it found in the codex${r.text?` (${r.text})`:''}.`;
}

export function RecapCheck({entry,data,change,onOpen,setNotice}:{entry:Entry;data:Workspace;change:Change;onOpen:(id:string)=>void;setNotice:(s:string)=>void}){
 const recap=entry.recap??emptyRecap(),open=openItems(recap),done=recap.review.filter(r=>(r.state==='done'&&!r.auto)||r.state==='skipped'),filed=recap.review.filter(r=>r.state==='filed'),auto=recap.review.filter(r=>r.state==='done'&&r.auto);
 const [editing,setEditing]=useState<string|null>(null),[text,setText]=useState(''),[same,setSame]=useState<string|null>(null),[posting,setPosting]=useState(false);
 const others=data.entries.filter(e=>e.id!==entry.id&&e.kind!=='folder'&&e.kind!=='session'&&e.worldId===entry.worldId&&(e.campaignId===entry.campaignId||e.campaignId===null)).sort((a,b)=>a.title.localeCompare(b.title));
 const editItem=(id:string,p:Partial<RecapItem>)=>change(w=>({...w,entries:w.entries.map(e=>e.id===entry.id&&e.recap?{...e,recap:{...e.recap,review:e.recap.review.map(r=>r.id===id?{...r,...p}:r)}}:e)}));
 const apply=(ids:string[])=>{
  const said:string[]=[];
  change(w=>{let next=w;for(const id of ids){try{const r=applyItem(next,entry.id,id);next=r.next;said.push(r.message);}catch(e){said.push(e instanceof Error?e.message:'Could not do that.');}}return next;});
  setNotice(said.length>2?`Done: ${said.length} changes. ${said.at(-1)}`:said.join(' '));
 };
 const undo=async(ids:string[])=>{
  const made=recap.review.filter(r=>ids.includes(r.id)&&(r.kind==='newPage'||r.kind==='newQuest')&&r.pageId);
  if(made.length&&!await confirmDialog({title:made.length===1?`Delete “${made[0].name}”?`:`Delete ${made.length} pages?`,message:`Undo deletes ${made.length===1?'the page it made':'the pages it made'}, with any changes since. ${made.length===1?'It goes':'They go'} back in the check list.`,confirm:'Undo',danger:true}))return;
  const said:string[]=[];
  change(w=>{let next=w;for(const id of ids){try{const r=undoItem(next,entry.id,id);next=r.next;said.push(r.message);}catch(e){said.push(e instanceof Error?e.message:'Could not undo that.');}}return next;});
  setNotice(said.length>2?`Undone: ${said.length} changes. They’re back in the check list.`:said.join(' '));
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
 const carriers=others.filter(e=>e.kind==='character').sort((a,b)=>Number(!['pc','companion'].includes(a.character?.role??''))-Number(!['pc','companion'].includes(b.character?.role??''))||a.title.localeCompare(b.title));
 const groups=groupOrder.map(g=>({g,items:open.filter(r=>groupOf(r)===g)})).filter(x=>x.items.length);
 const filedList=filed.length>0&&<details className="check-done"><summary>{filed.length} in the session file only</summary><p className="aside-hint">You set these to Session file in What it pulls out. Check one here to add it to your pages instead.</p>{filed.map(r=><p key={r.id} className="aside-hint check-filed">{tagOf[r.kind]} · {r.pageId&&r.kind!=='loot'?<button className="inline-link" onClick={()=>onOpen(r.pageId!)}>{r.name}</button>:r.name}<button className="button small" onClick={()=>editItem(r.id,{state:'open'})}>Check it here</button></p>)}</details>;
 const share=<div className="check-actions">{recap.status==='draft'?<button className="button primary" onClick={()=>publish(true)}><Eye size={14}/> Publish to players</button>:<button className="button" onClick={()=>publish(false)}><EyeOff size={14}/> Unpublish</button>}{recap.status==='published'&&<button className="button" disabled={posting} onClick={post}><Send size={14}/> {posting?'Posting…':'Post to Discord'}</button>}</div>;
 // A recap the GM wrote, with nothing found to check: sharing it comes first, and the AI check is optional.
 if(recap.mine&&!recap.review.some(r=>r.state!=='filed'))return <div className="aside-section recap-check recap-ready">
  <strong className="recap-card-title">{recap.status==='draft'?'Ready to share?':'Shared with players'}</strong>
  <p className="aside-hint">{recap.status==='draft'?'Players see the recap text. Your GM notes and the transcript stay GM-only.':'Players see the recap. Unpublish to hide it again.'}</p>
  {share}
  {recap.status==='draft'&&<CheckWithAi entry={entry} data={data} setNotice={setNotice}/>}
  {filedList}
  <SessionFileButton entry={entry} data={data} setNotice={setNotice}/>
 </div>;
 return <div className="aside-section recap-check">
  <div className="aside-heading"><span className="eyebrow">Check before publishing</span><small className="muted">{open.length?`${open.length} left`:'All done'}</small></div>
  <p className="aside-hint">What the AI found in this session. Nothing changes in your pages until you press a button.</p>
  {auto.length>0&&<div className="check-group check-auto"><div className="check-auto-head"><span className="eyebrow">Added for you</span>{auto.length>1&&<button className="button small" onClick={()=>undo(auto.map(r=>r.id))}><Undo2 size={13}/> Undo all</button>}</div>
   <p className="aside-hint">You set these to Add automatically. New pages are GM only.</p>
   {auto.map(r=><div key={r.id} className="check-auto-row"><Check size={13} aria-hidden="true"/><span><span className="check-tag">{tagOf[r.kind]}</span> {r.pageId&&r.kind!=='loot'?<button className="inline-link" onClick={()=>onOpen(r.pageId!)}>{r.name}</button>:r.name}</span><button className="button small" aria-label={`Undo ${r.name}`} onClick={()=>undo([r.id])}><Undo2 size={13}/> Undo</button></div>)}
  </div>}
  {groups.map(({g,items})=><div key={g} className="check-group"><span className="eyebrow">{g}</span>{items.map(r=><div key={r.id} className="check-item">
   <div className="check-title"><span className={`check-tag ${r.kind==='update'?'update':r.kind==='questLog'?'journal':''}`}>{tagOf[r.kind]}</span>{r.pageId&&r.kind!=='loot'?<button className="inline-link" onClick={()=>onOpen(r.pageId!)}>{r.name}</button>:<strong>{r.name}</strong>}</div>
   {editing===r.id?<><textarea className="check-text" aria-label={`Text for ${r.name}`} rows={4} maxLength={4000} value={text} onChange={e=>setText(e.target.value)}/><div className="check-actions"><button className="button primary small" onClick={()=>{editItem(r.id,{text:text.trim()});setEditing(null);}}>Save</button><button className="button small" onClick={()=>setEditing(null)}>Cancel</button></div></>
   :same===r.id?<><label className="field-label">Same as<select autoFocus aria-label={`${r.name} is the same as`} defaultValue="" onChange={e=>{const p=others.find(x=>x.id===e.target.value);if(p){editItem(r.id,{kind:'update',pageId:p.id,name:p.title,pageKind:undefined});setSame(null);}}}><option value="" disabled>Choose a page</option>{others.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><div className="check-actions"><button className="button small" onClick={()=>setSame(null)}>Cancel</button></div></>
   :<><p className="check-text">{describe(r,r.kind==='loot'?others.find(e=>e.id===r.pageId)?.title:undefined,r.kind==='tie'?tieName(data,entry.worldId,r):undefined)}</p>
    {r.kind==='loot'&&<label className="field-label">Who carries it<select aria-label={`Who carries ${r.name}`} value={r.pageId??''} onChange={e=>e.target.value==='page'?editItem(r.id,{kind:'newPage',pageKind:'lore',pageId:undefined,qty:undefined}):editItem(r.id,{pageId:e.target.value||undefined})}><option value="">Choose a character</option>{carriers.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}<option value="page">No one: make an item page</option></select></label>}
    <div className="check-actions"><button className="button primary small" disabled={r.kind==='loot'&&!r.pageId} onClick={()=>apply([r.id])}><Check size={13}/> {doLabel[r.kind]}</button>{r.kind==='newPage'&&others.length>0&&<button className="button small" onClick={()=>setSame(r.id)}>Same as…</button>}{r.kind!=='codex'&&r.kind!=='date'&&<button className="button small" onClick={()=>{setEditing(r.id);setText(r.text);}}>Edit</button>}<button className="button small" onClick={()=>change(w=>skipItem(w,entry.id,r.id))}>Skip</button></div></>}
  </div>)}</div>)}
  {filedList}
  {done.length>0&&<details className="check-done"><summary>{done.length} done or skipped</summary>{done.map(r=><p key={r.id} className="aside-hint">{r.state==='done'?<Check size={12}/>:'–'} {tagOf[r.kind]} · {r.pageId?<button className="inline-link" onClick={()=>onOpen(r.pageId!)}>{r.name}</button>:r.name}{r.state==='skipped'?' (skipped)':<button className="inline-link check-undo" onClick={()=>undo([r.id])}>Undo</button>}</p>)}</details>}
  <div className="check-footer">
   {open.length>1&&<div className="check-actions"><button className="button small" onClick={()=>apply(open.map(r=>r.id))}><Check size={13}/> Add all {open.length}</button><button className="button small" onClick={()=>change(w=>open.reduce((x,r)=>skipItem(x,entry.id,r.id),w))}>Skip the rest</button></div>}
   {share}
   <SessionFileButton entry={entry} data={data} setNotice={setNotice}/>
   <p className="aside-hint">{recap.status==='draft'?'Publishing shares the recap text with players. Timeline, quotes and key moments go too when you set their tabs to Player visible.':'Players see the recap. Unpublish to hide it again.'}</p>
  </div>
 </div>;
}

/** Download session file: the session as an export writes it to 2-Story/Sessions/, with the GM parts after it. */
export function SessionFileButton({entry,data,setNotice}:{entry:Entry;data:Workspace;setNotice:(s:string)=>void}){
 const [busy,setBusy]=useState(false);
 const download=async()=>{
  if(!entry.campaignId)return;
  setBusy(true);
  try{
   const {sessionFile}=await import('@/lib/encyclopedia/rp-export');
   const file=sessionFile(data,entry.campaignId,entry.id,{includeGm:true,exportedAt:new Date().toISOString()});
   if(!file){setNotice('This session has nothing to put in a file yet.');return;}
   const url=URL.createObjectURL(new Blob([file.text],{type:'text/markdown'})),a=document.createElement('a');a.href=url;a.download=file.path;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setNotice(e instanceof Error?e.message:'Could not make the session file.');}
  finally{setBusy(false);}
 };
 if(!entry.campaignId)return null;
 return <button type="button" className="button small session-file-button" disabled={busy} onClick={download} title="A Markdown file of this session, as Export and GitHub write it to 2-Story/Sessions/, with your GM parts after it"><Download size={13}/> {busy?'Making it…':'Download session file'}</button>;
}

/** Write it again, under a draft recap: the recap players read, from the timeline as it is now, with a note from the GM. */
const QUICK=['Shorter','Longer','More dialogue','Less detail','Darker','Lighter'];
export function WriteAgain({entry,data,change,setNotice}:{entry:Entry;data:Workspace;change?:Change;setNotice:(s:string)=>void}){
 const writers=useWriters(entry.campaignId),[open,setOpen]=useState(false),[note,setNote]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const [quick,setQuick]=useState<string[]>([]),[style,setStyle]=useState(entry.recap?.request?.style??''),[styles,setStyles]=useState(false);
 const keys=writers?.keys??[],chosen=keys.find(k=>k.id===key)??keys.find(k=>k.name===entry.recap?.by)??keys[0];
 const campaign=data.campaigns.find(c=>c.id===entry.campaignId);
 const asked=[...quick.map(q=>`${q}.`),note.trim()].filter(Boolean).join(' ');
 const styleName=style?campaign?.aiWriting?.styles?.find(s=>s.id===style)?.name??style.replace(/^builtin-/,''):'';
 const ask=`In RPG Tools for "${campaign?.name??'my campaign'}", write the recap on the session page "${entry.title}" again from its timeline.${styleName?` Use the "${styleName}" style.`:''}${asked?` ${asked}`:''}\nRead the page with read_page, then save only the new recap with rewrite_recap.`;
 const run=async()=>{
  if(!chosen||!entry.campaignId)return;
  setBusy(true);setError('');
  try{const r=await writeWithKey({action:'again',entryId:entry.id,campaignId:entry.campaignId,connectionId:chosen.id,note:asked.slice(0,500),...(style?{styleId:style}:{})});setOpen(false);setNote('');setQuick([]);setNotice(`${r.by} wrote the recap again (${r.tokens.toLocaleString('en')} tokens). It shows up in a moment.`);}
  catch(e){setError(e instanceof Error?e.message:'Could not write it again.');}
  finally{setBusy(false);}
 };
 if(!open)return <div className="write-again closed"><button className="button small" onClick={()=>setOpen(true)}><RotateCcw size={13}/> Write it again…</button><span className="aside-hint">Quick changes, a note, or another style.</span></div>;
 const close=()=>{setOpen(false);setError('');};
 return <section className="write-again" aria-label="Write it again">
  <div className="write-again-head"><strong><RotateCcw size={14} aria-hidden="true"/> Write it again</strong><button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={close}><X size={15}/></button></div>
  <div className="style-chips" role="group" aria-label="Quick changes">{QUICK.map(q=><button type="button" key={q} className={`style-chip ${quick.includes(q)?'on':''}`} aria-pressed={quick.includes(q)} onClick={()=>setQuick(x=>x.includes(q)?x.filter(y=>y!==q):[...x,q])}>{q}</button>)}</div>
  <label className="write-field"><span>Anything else <span className="muted">(optional)</span></span><textarea className="check-text" autoFocus rows={2} maxLength={400} value={note} placeholder="More about Bram. Open on the second bell." onChange={e=>setNote(e.target.value)}/></label>
  {campaign&&<StylePicker writing={campaign.aiWriting} kind="recap" value={style} onChange={setStyle} onEdit={change?()=>setStyles(true):undefined}/>}
  {styles&&campaign&&change&&<AiWritingDialog data={data} campaign={campaign} change={change} onClose={()=>setStyles(false)}/>}
  {keys.length>1&&<label className="write-field">Written by<select value={chosen?.id} onChange={e=>setKey(e.target.value)}>{keys.map(k=><option key={k.id} value={k.id}>{k.name} · {k.model}</option>)}</select></label>}
  <p className="aside-hint">Written again from the timeline. The timeline, quotes and check list stay as they are.</p>
  {error&&<p className="form-error">{error}</p>}
  <div className="write-again-actions"><button className="button" disabled={busy} onClick={close}>Cancel</button><button className={`button ${chosen?'':'primary'}`} onClick={()=>void navigator.clipboard.writeText(ask).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(()=>setError('Your browser didn’t allow copying.'))}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Copied':'Copy for my AI app'}</button>{chosen&&<button className="button primary" disabled={busy} onClick={run}><Sparkles size={14}/> {busy?'Writing…':`Write it with ${chosen.name}`}</button>}</div>
 </section>;
}

/**
 * Check it with AI, under a recap the GM wrote: the AI lists what the recap mentions in the check list and
 * leaves the words alone. With an API key here, or by copying a prompt for the GM's AI app.
 */
function CheckWithAi({entry,data,setNotice}:{entry:Entry;data:Workspace;setNotice:(s:string)=>void}){
 const writers=useWriters(entry.campaignId),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const keys=writers?.keys??[],chosen=keys.find(k=>k.id===key)??keys.find(k=>k.transcripts)??keys[0];
 const campaign=data.campaigns.find(c=>c.id===entry.campaignId),empty=!entry.body.trim();
 // Folded on a phone, where Publish matters more; open on a wider screen.
 const [narrow]=useState(()=>typeof window!=='undefined'&&window.matchMedia?.('(max-width:720px)').matches);
 const ask=`In RPG Tools for "${campaign?.name??'my campaign'}", read the session page "${entry.title}" with read_page. I wrote its recap myself, so don't change it. List the new people, places and things, quest moves and codex finds it mentions with add_recap_finds.`;
 const run=async()=>{
  if(!chosen||!entry.campaignId)return;
  setBusy(true);setError('');
  try{const r=await writeWithKey({action:'check',entryId:entry.id,campaignId:entry.campaignId,connectionId:chosen.id});setNotice(r.added?`${r.by} found ${r.added} thing${r.added===1?'':'s'} to check (${r.tokens.toLocaleString('en')} tokens). They show up in a moment. Your recap didn’t change.`:`${r.by} found nothing new to add (${r.tokens.toLocaleString('en')} tokens).`);}
  catch(e){setError(e instanceof Error?e.message:'Could not check the recap.');}
  finally{setBusy(false);}
 };
 const blocked=chosen&&!chosen.transcripts?`${chosen.name} can’t read draft recaps, which are GM-only. Turn on “See GM-only things” for it under What it may do.`:'';
 return <details className="check-with-ai" open={!narrow}>
  <summary>Check it with AI <span className="muted">(optional)</span></summary>
  <p className="aside-hint">{chosen?.name??'The AI'} lists the new people, places, quest moves and codex finds it mentions, for you to add. Your words stay as they are.</p>
  {keys.length>1&&<label className="field-label">Checked by<select value={chosen?.id} onChange={e=>setKey(e.target.value)}>{keys.map(k=><option key={k.id} value={k.id}>{k.name} · {k.model}</option>)}</select></label>}
  {empty&&<p className="aside-hint">Write the recap first, then check it.</p>}
  {(blocked||error)&&<p className="form-error">{error||blocked}</p>}
  <div className="check-actions">{chosen&&<button className="button" disabled={busy||empty||!!blocked} onClick={run}><Sparkles size={14}/> {busy?'Reading…':`Check it with ${chosen.name}`}</button>}<button className="button" disabled={empty} onClick={()=>void navigator.clipboard.writeText(ask).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(()=>setError('Your browser didn’t allow copying.'))}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Copied':'Copy for my AI app'}</button></div>
 </details>;
}

/** A session page with no recap yet: write it yourself, or have the AI draft it. */
export function RecapStart({entry,onStart,onWrite}:{entry:Entry;onStart?:()=>void;onWrite?:()=>void}){
 return <div className="aside-section recap-check"><span className="eyebrow">Recap</span><p className="aside-hint">Write the recap yourself, or have the AI draft it from a transcript, an RP thread, or notes in Notion, Google Drive or GitHub. Either way, players see nothing until you publish it.</p>
  {(onWrite||onStart)&&<div className="recap-start-choices">
   {onWrite&&<button className="recap-choice" onClick={onWrite}><PenLine size={15} aria-hidden="true"/><span><strong>Write it myself</strong><small>A recap you write. Publish it, post it to Discord, and The story so far uses it like any other.</small></span></button>}
   {onStart&&<button className="recap-choice ai" onClick={onStart}><Sparkles size={15} aria-hidden="true"/><span><strong>Draft it with AI…</strong><small>From a transcript, a chat export, or a Notion, Drive or GitHub link.</small></span></button>}
  </div>}
  {entry.overviewVisibility==='players'&&<p className="aside-hint">Players can see this page now. It’s hidden from them while the recap is a draft.</p>}</div>;
}

/** A recap asked for in the New session recap dialog that the AI hasn't saved yet. */
export function RecapWaiting({recap,onShow}:{recap:Recap;onShow?:()=>void}){
 return <div className="aside-section recap-check"><div className="aside-heading"><span className="eyebrow">Check before publishing</span></div><div className="handoff-wait"><Clock size={15}/> Waiting for your AI’s draft.</div><p className="aside-hint">Asked {new Date(recap.request!.at).toLocaleString('en',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}. When your AI app saves it, it shows up here with what it found.</p>{onShow&&<button className="button small" onClick={onShow}>Show the prompt again</button>}</div>;
}
