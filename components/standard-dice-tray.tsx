"use client";
import {api} from '@/lib/api';
import type {MapRollRequest,MapRollContext} from '@/lib/map-rolls';


import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Volume2,VolumeX,X} from 'lucide-react';
import {clearLocalRollLog,readLocalRollLog,recordLocalRoll,subscribeLocalRollLog,type LocalRollEntry} from '@/lib/local-roll-log';
import {physicalRoll,rollDice,takePhysicalDice} from '@/lib/rolls';
import {unlockDiceAudio} from '@/lib/dice-audio';
import type {PhysicalDie} from '@/lib/dice-physics';
import './standard-dice-tray.css';
const sides=[4,6,8,10,12,20,100];
type Entry={id:string;formula:string;total:number;detail:string;context?:MapRollContext;auto?:boolean};
const historyKey='rpg-standard-dice-history-v1',autoKey='maptable-discord-always';
/** Posts a roll to the campaign's Discord channel for rolls. Returns what to tell the GM. */
async function postRoll(entry:Entry){
 try{await api<{skipped?:boolean}>('/api/discord/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'roll',...entry.context,formula:entry.formula,total:entry.total,detail:entry.detail})}).then(r=>{if(r?.skipped)throw new Error('Dice rolls are set to “Don’t post” in Connections › Discord.');});return 'Roll posted to Discord.';}
 catch(e){return (e as Error).message;}
}
function DieIcon({sides}:{sides:number}){return <svg viewBox="0 0 40 40" aria-hidden="true"><path d={sides===4?'M20 4 37 34H3Z':sides===6?'M6 6H34V34H6Z':sides===8?'M20 3 36 20 20 37 4 20Z':'M20 3 35 12 35 29 20 37 5 29 5 12Z'}/><path className="die-lines" d={sides===4?'M20 4V25L3 34M20 25 37 34':sides===6?'M6 6 13 13H34M13 13V34':sides===8?'M4 20H36M20 3V37':'M5 12 20 9 35 12 29 28 20 37 11 28 5 12M20 9 11 28H29Z'}/></svg>}
export type DicePanel='dice'|'log'|null;
/** The board owns which panel is open; the tray only renders it. `style` positions the dock above the board tool bar. */
/** `scene` is the open scene, so plain tray rolls can be posted to its campaign's Discord too. */
export default function StandardDiceTray({panel,onPanelChange,style,scene}:{panel:DicePanel;onPanelChange:(panel:DicePanel)=>void;style?:CSSProperties;scene?:{sceneId:string;campaignId:string|null}|null}){
 const panelChange=useRef(onPanelChange);useEffect(()=>{panelChange.current=onPanelChange;},[onPanelChange]);
 const open=panel==='dice',logOpen=panel==='log';
 const setOpen=(next:boolean)=>panelChange.current(next?'dice':null),setLogOpen=(next:boolean)=>{if(!next)panelChange.current(null);};
 const [shareStatus,setShareStatus]=useState(''),[sharing,setSharing]=useState(false),[always,setAlways]=useState(false);
 const [rollLog,setRollLog]=useState<LocalRollEntry[]>([]);
 useEffect(()=>{const refresh=()=>setRollLog([...readLocalRollLog()]);refresh();return subscribeLocalRollLog(refresh);},[]);
 const [counts,setCounts]=useState<Record<number,number>>({}),[modifier,setModifier]=useState(0),[custom,setCustom]=useState<string|null>(null),[history,setHistory]=useState<Entry[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[muted,setMuted]=useState(false),[throwing,setThrowing]=useState<{dice:PhysicalDie[];entry:Entry}|null>(null);
 const canvas=useRef<HTMLCanvasElement>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;try{const h=JSON.parse(localStorage.getItem(historyKey)||'[]');if(Array.isArray(h))setHistory(h.filter(e=>typeof e?.id==='string'&&typeof e?.formula==='string'&&typeof e?.detail==='string'&&Number.isFinite(e?.total)).slice(0,30));setMuted(localStorage.getItem('rpg-tray-muted')==='true');setAlways(localStorage.getItem(autoKey)==='true');}catch{}return()=>{alive.current=false;};},[]);
 const formula=custom!==null?custom.trim():sides.filter(s=>counts[s]).map(s=>`${counts[s]}d${s}`).join('+')+(modifier?(modifier>0?'+':'')+modifier:'');
 useEffect(()=>{if(!throwing)return;let active=true,dispose:(()=>void)|undefined;let timer:ReturnType<typeof setTimeout>;const finish=()=>{if(!active)return;recordLocalRoll({label:throwing.entry.formula,total:throwing.entry.total,breakdown:throwing.entry.detail});setHistory(old=>{const next=[throwing.entry,...old].slice(0,30);try{localStorage.setItem(historyKey,JSON.stringify(next));}catch{setError('Roll history could not be saved on this device.');}return next;});setThrowing(null);setBusy(false);
  // Only with Always on: every other roll waits for Post roll to Discord.
  if(throwing.entry.auto){setShareStatus('Posting to Discord…');void postRoll(throwing.entry).then(m=>{if(alive.current)setShareStatus(m);});}};const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='reduced';
 void import('@/lib/dice-three').then(({startThreeDice})=>{if(!active)return;if(canvas.current&&!reduced){const css=getComputedStyle(document.documentElement),accent=css.getPropertyValue('--accent').trim()||'#246c58',dark=document.documentElement.dataset.theme==='dark';dispose=startThreeDice(canvas.current,throwing.dice.slice(0,24),{enabled:true,color:accent,font:'serif',textColor:dark?'#0c1214':'#ffffff',borderColor:dark?'#ffffff':'#0c1214',muted},false);}timer=setTimeout(finish,reduced?0:Math.max(0,...throwing.dice.map(d=>d.motion?.duration||1900))+500);}).catch(()=>{timer=setTimeout(finish,0);});return()=>{active=false;clearTimeout(timer);dispose?.();};},[throwing]);
 useEffect(()=>{const handler=(event:Event)=>{const request=(event as CustomEvent<MapRollRequest>).detail;if(!request?.formula||!request.context)return;setOpen(true);setCustom(request.formula);void roll(request.formula,{...request.context});};window.addEventListener('maptable-tray-roll',handler);return()=>window.removeEventListener('maptable-tray-roll',handler);});
 async function share(entry:Entry){if(!entry.context?.campaignId)return;setSharing(true);setShareStatus('');setShareStatus(await postRoll(entry));setSharing(false);}
 async function roll(requestedFormula=formula,from?:MapRollContext){if(busy)return;const context=from??(scene?.campaignId?{...scene,label:'Dice tray'}:undefined);setShareStatus('');setBusy(true);setError('');try{void unlockDiceAudio();const r=await physicalRoll(()=>rollDice(requestedFormula));const dice=takePhysicalDice(r);if(!alive.current)return;setThrowing({dice,entry:{id:crypto.randomUUID(),formula:r.formula,total:r.total,context,auto:always&&!!context?.campaignId,detail:r.parts.map(p=>p.count?`${p.sign<0?'−':''}[${p.dice.join(', ')}]`:`${p.subtotal>=0?'+':''}${p.subtotal}`).join(' ')}});}catch(e){setError((e as Error).message);setBusy(false);}}
 return <div className="standard-dice-dock" style={style}>{throwing&&<div className="standard-dice-animation" aria-hidden="true"><canvas ref={canvas}/></div>}
 
 <section id="local-roll-log" className="standard-dice-tray local-roll-log" hidden={!logOpen} aria-label="Local roll log"><header><div><strong>Roll log</strong><small>Last 100 rolls · stored on this device</small></div><button disabled={!rollLog.length} onClick={clearLocalRollLog}>Clear log</button><button aria-label="Close roll log" onClick={()=>setLogOpen(false)}><X size={18}/></button></header>{rollLog.length?<ol>{rollLog.map(entry=><li key={entry.id}><b>{entry.total}</b><div><strong>{entry.label}</strong><small>{entry.breakdown}</small>{entry.outcome&&<span className="roll-log-outcome">{entry.outcome}</span>}<time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleString()}</time></div></li>)}</ol>:<p>No rolls yet. Dice tray and character rolls appear here.</p>}</section>
 <section id="standard-dice-tray" className="standard-dice-tray" hidden={!open} aria-label="Standard dice tray">
 <header><div><strong>Dice tray</strong><small>Quick rolls · saved on this device</small></div><button title={muted?'Unmute dice':'Mute dice'} aria-label={muted?'Unmute dice':'Mute dice'} aria-pressed={muted} onClick={()=>setMuted(m=>{try{localStorage.setItem('rpg-tray-muted',String(!m));}catch{}return !m;})}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><button aria-label="Close dice tray" onClick={()=>setOpen(false)}><X size={18}/></button></header>
 <div className="tray-dice">{sides.map(s=><button key={s} disabled={busy} title={`Add d${s}${counts[s]?` (${counts[s]} selected)`:''}`} aria-label={`Add d${s}`} onClick={()=>{setCustom(null);setCounts(c=>({...c,[s]:Math.min(20,(c[s]||0)+1)}));}}><DieIcon sides={s}/><span>d{s}</span>{!!counts[s]&&<b>{counts[s]}</b>}</button>)}</div>
 <div className="tray-modifier"><button disabled={busy||custom!==null} aria-label="Decrease modifier" onClick={()=>setModifier(m=>Math.max(-10000,m-1))}>−</button><label>Modifier<input disabled={busy||custom!==null} aria-label="Dice modifier" type="number" min={-10000} max={10000} value={modifier} onChange={e=>setModifier(Math.max(-10000,Math.min(10000,Math.trunc(Number(e.target.value))||0)))}/></label><button disabled={busy||custom!==null} aria-label="Increase modifier" onClick={()=>setModifier(m=>Math.min(10000,m+1))}>+</button><button disabled={busy} onClick={()=>{setCounts({});setModifier(0);setCustom(null);setError('');}}>Reset</button></div>
 {custom!==null&&<small>Edit modifiers in your custom formula, or Reset to use the dice buttons.</small>}<form onSubmit={e=>{e.preventDefault();void roll();}}><label>Roll formula<input aria-label="Tray roll formula" disabled={busy} value={custom??formula} placeholder="Choose dice or type 2d6+4" maxLength={200} onChange={e=>setCustom(e.target.value)}/></label><button className="tray-roll" disabled={busy||!formula}>{busy?'Rolling…':'Roll'}</button></form>
 {error&&<p role="alert">{error}</p>}<div className="tray-result" role="status" aria-live="polite">{busy?'Rolling dice…':history[0]?<><strong>{history[0].total}</strong><span>{history[0].formula}<small>{history[0].detail}</small></span></>:'Choose your dice to begin.'}</div>
 {history[0]?.context&&<div className="tray-discord"><small>{history[0].context.label} · this scene</small><button disabled={busy||sharing||!history[0].context.campaignId} onClick={()=>void share(history[0])}>{sharing?'Posting…':'Post roll to Discord'}</button><p role="status">{shareStatus}</p></div>}
 {(scene?.campaignId||history[0]?.context?.campaignId)&&<label className="tray-always" title="Post every roll from a campaign scene to its Discord channel for rolls, without pressing Post"><input type="checkbox" checked={always} onChange={e=>{setAlways(e.target.checked);try{localStorage.setItem(autoKey,String(e.target.checked));}catch{}}}/>Always post rolls to Discord</label>}
 {history.length>0&&<details><summary>Recent rolls ({history.length})</summary><ol>{history.map(e=><li key={e.id}><b>{e.total}</b><span>{e.formula}<small>{e.detail}</small></span></li>)}</ol><button onClick={()=>{setHistory([]);try{localStorage.removeItem(historyKey);}catch{}}}>Clear tray history</button></details>}
 </section></div>;
}
