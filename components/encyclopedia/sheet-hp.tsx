'use client';
import {useEffect,useRef,useState} from 'react';
import {Check,Minus,Plus} from 'lucide-react';
import {googleConfigured,currentGoogleToken,googleToken,readHpCell,writeHpCell,GOOGLE_NOT_SET_UP} from '@/lib/encyclopedia/google-client';
import {type Sheet} from '@/lib/encyclopedia/sheet-link';
import {HP_MAX,HP_MIN,checkHpCell,coalesce,hpTarget,hpValue,storedHp,withHp,withWriteBack,PUBLISHED_CANT_WRITE} from '@/lib/encyclopedia/sheet-write';
import './character-sheet.css';

type Store=(f:(s:Sheet)=>Sheet)=>boolean|void;
type Job={n:number;sheet:Sheet;known:string|undefined;store:Store};
type Status={tone:'ok'|'warn'|'error'|'info';text:string};
const rangeText=`a whole number from ${HP_MIN} to ${HP_MAX}`;

/**
 * The write-back switch for a sheet. Only the person who linked a sheet can turn it on, and only a Google sign-in link can
 * be written to, so the other cases say why instead.
 */
export function SheetWriteBack({sheet,linker,onChange}:{sheet:Sheet;/** The player's name when a member linked this sheet (their Google account is the one that can write). */linker?:string;onChange:(next:Sheet)=>void}){
 const target=hpTarget(sheet,false),on=sheet.writeBack===true;
 const blocked=sheet.source!=='google'?PUBLISHED_CANT_WRITE:linker?`${linker} linked this sheet from their own Google account, so only they can turn this on.`:!googleConfigured()?GOOGLE_NOT_SET_UP:!target.ok?target.reason:'';
 return <div className="sheet-writeback">
  <label className="sheet-switch"><input type="checkbox" role="switch" checked={on&&!blocked} disabled={!!blocked} onChange={e=>onChange(withWriteBack(sheet,e.target.checked))}/>
   <span><strong>Write HP back to the sheet</strong><small>When HP changes here, update the cell in the sheet.</small></span></label>
  {blocked?<p className="sheet-hint">{blocked}</p>:on&&target.ok?<p className="sheet-hint">Only the HP cell ({target.range.replace(/^'(.*)'!/,'$1 ')}) is written, as a plain number. Max HP and every other cell are never touched. You may be asked to sign in with Google while the page is open.</p>:null}
 </div>;
}

/**
 * Change HP on the page and write it to the sheet. Changes land in the stored copy at once; the write waits a moment for
 * more changes, checks the cell hasn't been edited in the sheet since it was read, then writes the latest number. Never
 * opens a Google pop-up by itself: with no sign-in it asks, and the person presses the button.
 */
export function SheetHp({sheet,store,onHold}:{sheet:Sheet;store:Store;/** True while a change hasn't reached the sheet yet (Refresh waits). */onHold:(hold:boolean)=>void}){
 const [status,setStatus]=useState<Status|null>(null),[conflict,setConflict]=useState<{job:Job;theirs:string}|null>(null),[needSignIn,setNeedSignIn]=useState(false),[draft,setDraft]=useState('');
 const waiting=useRef<Job|null>(null),known=useRef<string|undefined>(undefined),chain=useRef<Promise<void>>(Promise.resolve());

 const settle=(s:Status|null)=>{setStatus(s);};
 async function attempt(job:Job,force:boolean){
  const token=currentGoogleToken();
  if(!token){waiting.current=job;setNeedSignIn(true);settle({tone:'warn',text:'Sign in with Google to write HP back'});return;}
  try{
   if(!force){
    const check=checkHpCell(await readHpCell(job.sheet,token),job.known,job.n);
    if(check.kind==='formula'){waiting.current=null;known.current=undefined;onHold(false);settle({tone:'error',text:'Couldn’t write HP: the HP cell holds a formula, and RPG Tools won’t overwrite it.'});return;}
    if(check.kind==='changed'){waiting.current=job;setConflict({job,theirs:check.theirs});settle(null);return;}
   }
   await writeHpCell(job.sheet,job.n,token);
   waiting.current=null;known.current=String(job.n);setConflict(null);setNeedSignIn(false);onHold(false);
   job.store(s=>withHp(s,job.n,new Date().toISOString()));
   settle({tone:'ok',text:'HP written to the sheet just now'});
  }catch(e){
   waiting.current=job;
   const needs=e instanceof Error&&/sign in again/i.test(e.message);
   if(needs)setNeedSignIn(true);
   settle({tone:'error',text:`Couldn’t write HP: ${e instanceof Error?e.message:'something went wrong.'}`});
  }
 }
 const run=(job:Job,force=false)=>{chain.current=chain.current.then(()=>attempt(job,force));};
 const queue=useRef<ReturnType<typeof coalesce<Job>>|null>(null);
 // Leaving the page sends a change that is still waiting, only when a sign-in is already live.
 useEffect(()=>{const q=queue;return()=>{if(currentGoogleToken())q.current?.flush();else q.current?.cancel();};},[]);

 function change(raw:number){
  const n=hpValue(raw);
  if(n===null){settle({tone:'error',text:`HP must be ${rangeText}.`});return;}
  const q=queue.current??=coalesce<Job>(job=>run(job));
  if(!waiting.current&&!q.pending())known.current=sheet.items.find(i=>i.kind==='hp')?.value??'';
  const job:Job={n,sheet,known:known.current,store};
  store(s=>withHp(s,n,s.readAt??new Date().toISOString()));
  setConflict(null);setDraft('');onHold(true);settle({tone:'info',text:'Writing HP to the sheet in a moment…'});
  q.push(job);
 }
 const current=storedHp(sheet);
 const commit=()=>{const t=draft.trim();if(!t)return;const n=hpValue(t);if(n===null)settle({tone:'error',text:`HP must be ${rangeText}.`});else change(n);};
 async function signIn(){
  try{await googleToken();setNeedSignIn(false);const job=waiting.current;if(job)run(job);else settle(null);}
  catch(e){settle({tone:'error',text:`Couldn’t write HP: ${e instanceof Error?e.message:'sign-in failed.'}`});}
 }
 function useSheets(){
  if(!conflict)return;
  const n=hpValue(conflict.theirs);
  if(n!==null)conflict.job.store(s=>withHp(s,n,new Date().toISOString()));
  waiting.current=null;known.current=undefined;setConflict(null);onHold(false);settle({tone:'ok',text:'Using the sheet’s HP.'});
 }
 function writeOurs(){if(conflict){const job=conflict.job;setConflict(null);settle({tone:'info',text:'Writing HP to the sheet…'});run(job,true);}}

 return <div className="sheet-hp" role="group" aria-label="Change HP">
  <div className="sheet-hp-row">
   {[-5,-1].map(d=><button key={d} type="button" className="button small" aria-label={`${d<0?'Lose':'Gain'} ${Math.abs(d)} HP`} disabled={current===null} onClick={()=>current!==null&&change(current+d)}><Minus size={12} aria-hidden="true"/>{Math.abs(d)}</button>)}
   <input className="sheet-input" aria-label="Set HP to" placeholder="Set HP" inputMode="numeric" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>
   {[1,5].map(d=><button key={d} type="button" className="button small" aria-label={`Gain ${d} HP`} disabled={current===null} onClick={()=>current!==null&&change(current+d)}><Plus size={12} aria-hidden="true"/>{d}</button>)}
  </div>
  {current===null&&<p className="sheet-hint">The HP value isn’t a number yet. Set HP to a number to start.</p>}
  {conflict&&<div className="sheet-conflict" role="alert"><p>The sheet’s HP changed to {conflict.theirs||'empty'} since it was read.</p>
   <div className="sheet-hp-row"><button type="button" className="button small" onClick={useSheets}>Use the sheet’s value</button><button type="button" className="button small" onClick={writeOurs}>Write ours ({conflict.job.n})</button></div></div>}
  {needSignIn&&!conflict&&<button type="button" className="button small" onClick={()=>void signIn()}>Sign in with Google</button>}
  {status&&<p role="status" className={`sheet-hp-status is-${status.tone}`}>{status.tone==='ok'&&<Check size={12} aria-hidden="true"/>} {status.text}</p>}
 </div>;
}
