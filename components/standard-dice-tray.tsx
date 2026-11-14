"use client";
import {api} from '@/lib/api';
import type {MapRollRequest,MapRollContext} from '@/lib/map-rolls';


import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Volume2,VolumeX,X} from 'lucide-react';
import {clearLocalRollLog,readLocalRollLog,recordLocalRoll,subscribeLocalRollLog,type LocalRollEntry} from '@/lib/local-roll-log';
import {partText,physicalRoll,rollDice,takePhysicalDice} from '@/lib/rolls';
import {unlockDiceAudio} from '@/lib/dice-audio';
import type {PhysicalDie} from '@/lib/dice-physics';
import {TrayOracle,TrayTables,useTrayTables,type TrayScene} from './tray-tables';
import {addDie,cleanRollName,removeDie,rollNameMax} from '@/lib/dice-tray';
import {diceVia,sameDiceTarget,type DiceDiscord,type DiceVia} from '@/lib/dice-target';
import './standard-dice-tray.css';
const sides=[4,6,8,10,12,20,100];
/** `name` is what the roll is for ("Attack on goblin"); it replaces the default label on the Discord card. */
/** `via` is where an off-Maptable roll may be posted (the campaign it was made for, never the member's ref: that stays in the page); `proof` is the server's proof for a member's roll. */
type Proof={formula:string;total:number;detail:string;at:number;sig:string};
type Entry={id:string;formula:string;total:number;detail:string;context?:MapRollContext;auto?:boolean;name?:string;via?:DiceVia;proof?:Proof};
const historyKey='rpg-standard-dice-history-v1',autoKey='maptable-discord-always';
/** Posts a roll to the campaign's Discord channel for rolls. Returns what to tell the GM. */
async function postRoll(entry:Entry,discord?:DiceDiscord|null):Promise<{ok:boolean;message:string}>{
 if(!entry.context&&discord){
  if(!sameDiceTarget(entry.via,discord))return {ok:false,message:'This roll was made for another campaign. Roll again here to post it.'};
  try{
   if(discord.mode==='member'){const r=await api<{discord:string}>('/api/encyclopedia/player-dice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'send',ref:discord.ref,label:entry.name,proof:entry.proof})});if(r.discord==='skipped')throw new Error('Dice rolls are set to “Don’t post” in Connections › Discord.');}
   else{const via=entry.via!;const r=await api<{skipped?:boolean}>('/api/encyclopedia/discord-roll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(via.mode==='encyclopedia'?{campaignId:via.id}:{maptableCampaignId:via.id}),title:entry.name||'Dice tray',formula:entry.formula,total:entry.total,detail:entry.detail.slice(0,400)})});if(r?.skipped)throw new Error('Dice rolls are set to “Don’t post” in Connections › Discord.');}
   return {ok:true,message:'Roll posted to Discord.'};
  }catch(e){return {ok:false,message:(e as Error).message};}
 }
 try{await api<{skipped?:boolean}>('/api/discord/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'roll',...entry.context,label:entry.name||entry.context?.label,formula:entry.formula,total:entry.total,detail:entry.detail})}).then(r=>{if(r?.skipped)throw new Error('Dice rolls are set to “Don’t post” in Connections › Discord.');});return {ok:true,message:'Roll posted to Discord.'};}
 catch(e){return {ok:false,message:(e as Error).message};}
}
const rollLabel=(e:Entry)=>e.name?`${e.name} · ${e.formula}`:e.formula;
function DieIcon({sides}:{sides:number}){return <svg viewBox="0 0 40 40" aria-hidden="true"><path d={sides===4?'M20 4 37 34H3Z':sides===6?'M6 6H34V34H6Z':sides===8?'M20 3 36 20 20 37 4 20Z':'M20 3 35 12 35 29 20 37 5 29 5 12Z'}/><path className="die-lines" d={sides===4?'M20 4V25L3 34M20 25 37 34':sides===6?'M6 6 13 13H34M13 13V34':sides===8?'M4 20H36M20 3V37':'M5 12 20 9 35 12 29 28 20 37 11 28 5 12M20 9 11 28H29Z'}/></svg>}
export type DicePanel='dice'|'log'|null;
/** The board owns which panel is open; the tray only renders it. `style` positions the dock above the board tool bar. */
/** `scene` is the open scene, so plain tray rolls can be posted to its campaign's Discord too. */
/** Off Maptable, `discord` says where Send may post (decided by the page) and `localNote` says why not when it can't. */
export default function StandardDiceTray({panel,onPanelChange,style,scene,discord,localNote}:{panel:DicePanel;onPanelChange:(panel:DicePanel)=>void;style?:CSSProperties;scene?:TrayScene|null;discord?:DiceDiscord|null;localNote?:string}){
 const panelChange=useRef(onPanelChange);useEffect(()=>{panelChange.current=onPanelChange;},[onPanelChange]);
 const liveDiscord=useRef(discord);useEffect(()=>{liveDiscord.current=discord;},[discord]);
 const open=panel==='dice',logOpen=panel==='log';
 const setOpen=(next:boolean)=>panelChange.current(next?'dice':null),setLogOpen=(next:boolean)=>{if(!next)panelChange.current(null);};
 const [shareStatus,setShareStatus]=useState(''),[sharing,setSharing]=useState(false),[always,setAlways]=useState(false);
 const [rollLog,setRollLog]=useState<LocalRollEntry[]>([]),[rollName,setRollName]=useState('');
 /** A touch long-press on a die removes one, like right-click; `fired` swallows the click that follows it. */
 const press=useRef<{timer?:ReturnType<typeof setTimeout>;down:boolean;touch:boolean;fired:boolean}>({down:false,touch:false,fired:false});
 const endPress=()=>{clearTimeout(press.current.timer);press.current.down=false;};
 useEffect(()=>{const refresh=()=>setRollLog([...readLocalRollLog()]);refresh();return subscribeLocalRollLog(refresh);},[]);
 const [counts,setCounts]=useState<Record<number,number>>({}),[modifier,setModifier]=useState(0),[custom,setCustom]=useState<string|null>(null),[history,setHistory]=useState<Entry[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[muted,setMuted]=useState(false),[throwing,setThrowing]=useState<{dice:PhysicalDie[];entry:Entry}|null>(null);
 const canvas=useRef<HTMLCanvasElement>(null),alive=useRef(true),[tab,setTab]=useState<'dice'|'tables'|'oracle'>('dice');
 useEffect(()=>{alive.current=true;try{const h=JSON.parse(localStorage.getItem(historyKey)||'[]');if(Array.isArray(h))setHistory(h.filter(e=>typeof e?.id==='string'&&typeof e?.formula==='string'&&typeof e?.detail==='string'&&Number.isFinite(e?.total)).slice(0,30));setMuted(localStorage.getItem('rpg-tray-muted')==='true');setAlways(localStorage.getItem(autoKey)==='true');}catch{}return()=>{alive.current=false;};},[]);
 const formula=custom!==null?custom.trim():sides.filter(s=>counts[s]).map(s=>`${counts[s]}d${s}`).join('+')+(modifier?(modifier>0?'+':'')+modifier:'');
 useEffect(()=>{if(!throwing)return;let active=true,dispose:(()=>void)|undefined;let timer:ReturnType<typeof setTimeout>;const finish=()=>{if(!active)return;recordLocalRoll({label:rollLabel(throwing.entry),total:throwing.entry.total,breakdown:throwing.entry.detail});setHistory(old=>{const next=[throwing.entry,...old].slice(0,30);try{localStorage.setItem(historyKey,JSON.stringify(next));}catch{setError('Roll history could not be saved on this device.');}return next;});setThrowing(null);setBusy(false);
  // Only with Always on: every other roll waits for Post roll to Discord.
  if(throwing.entry.auto){setShareStatus('Posting to Discord…');void postRoll(throwing.entry,liveDiscord.current).then(r=>{if(!alive.current)return;setShareStatus(r.message);if(r.ok&&throwing.entry.name)setRollName(n=>cleanRollName(n)===throwing.entry.name?'':n);});}};const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='reduced';
 void import('@/lib/dice-three').then(({startThreeDice})=>{if(!active)return;if(canvas.current&&!reduced){const css=getComputedStyle(document.documentElement),accent=css.getPropertyValue('--accent').trim()||'#246c58',dark=document.documentElement.dataset.theme==='dark';dispose=startThreeDice(canvas.current,throwing.dice.slice(0,24),{enabled:true,color:accent,font:'serif',textColor:dark?'#0c1214':'#ffffff',borderColor:dark?'#ffffff':'#0c1214',muted},false);}timer=setTimeout(finish,reduced?0:Math.max(0,...throwing.dice.map(d=>d.motion?.duration||1900))+500);}).catch(()=>{timer=setTimeout(finish,0);});return()=>{active=false;clearTimeout(timer);dispose?.();};},[throwing]);
 useEffect(()=>{const handler=(event:Event)=>{const request=(event as CustomEvent<MapRollRequest>).detail;if(!request?.formula||!request.context)return;setOpen(true);setCustom(request.formula);void roll(request.formula,{...request.context});};window.addEventListener('maptable-tray-roll',handler);return()=>window.removeEventListener('maptable-tray-roll',handler);});
 async function share(entry:Entry){if(!entry.context?.campaignId&&!sameDiceTarget(entry.via,discord))return;const name=cleanRollName(rollName)||entry.name,posted={...entry,name};setSharing(true);setShareStatus('');const r=await postRoll(posted,discord);if(!alive.current)return;setShareStatus(r.message);setSharing(false);
  // The name typed after rolling belongs to this roll: keep it in the history and clear the box for the next one.
  if(r.ok&&name){setHistory(old=>{const next=old.map(e=>e.id===entry.id?posted:e);try{localStorage.setItem(historyKey,JSON.stringify(next));}catch{}return next;});setRollName('');}}
 async function roll(requestedFormula=formula,from?:MapRollContext){if(busy)return;const context=from??(scene?.campaignId?{...scene,label:'Dice tray'}:undefined),name=from?undefined:cleanRollName(rollName)||undefined,via=!from&&!context&&discord?diceVia(discord):undefined;setShareStatus('');setBusy(true);setError('');
  // A member's roll is made on the server (the total is never the browser's), so it is shown without the 3D throw.
  if(!from&&!context&&discord?.mode==='member'){try{const r=await api<{formula:string;total:number;detail:string;proof:Proof}>('/api/encyclopedia/player-dice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'roll',ref:discord.ref,formula:requestedFormula,label:name})});if(!alive.current)return;const entry:Entry={id:crypto.randomUUID(),formula:r.formula,total:r.total,detail:r.detail,name,via,proof:r.proof,auto:always};recordLocalRoll({label:rollLabel(entry),total:entry.total,breakdown:entry.detail});setHistory(old=>{const next=[entry,...old].slice(0,30);try{localStorage.setItem(historyKey,JSON.stringify(next));}catch{}return next;});setBusy(false);if(entry.auto){setShareStatus('Posting to Discord…');void postRoll(entry,discord).then(x=>{if(alive.current)setShareStatus(x.message);});}}catch(e){if(alive.current){setError((e as Error).message);setBusy(false);}}return;}
  try{void unlockDiceAudio();const r=await physicalRoll(()=>rollDice(requestedFormula));const dice=takePhysicalDice(r);if(!alive.current)return;setThrowing({dice,entry:{id:crypto.randomUUID(),formula:r.formula,total:r.total,context,via,name,auto:always&&(!!context?.campaignId||!!via),detail:r.parts.map(p=>p.count?`${p.sign<0?'−':''}${partText(p,'[')}`:`${p.subtotal>=0?'+':''}${p.subtotal}`).join(' ').slice(0,1200)}});}catch(e){setError((e as Error).message);setBusy(false);}}
 return <div className="standard-dice-dock" style={style}>{throwing&&<div className="standard-dice-animation" aria-hidden="true"><canvas ref={canvas}/></div>}
 
 <section id="local-roll-log" className="standard-dice-tray local-roll-log" hidden={!logOpen} aria-label="Local roll log"><header><div><strong>Roll log</strong><small>Last 100 rolls · stored on this device</small></div><button disabled={!rollLog.length} onClick={clearLocalRollLog}>Clear log</button><button aria-label="Close roll log" onClick={()=>setLogOpen(false)}><X size={18}/></button></header>{rollLog.length?<ol>{rollLog.map(entry=><li key={entry.id}><b>{entry.total}</b><div><strong>{entry.label}</strong><small>{entry.breakdown}</small>{entry.outcome&&<span className="roll-log-outcome">{entry.outcome}</span>}<time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleString()}</time></div></li>)}</ol>:<p>No rolls yet. Dice tray and character rolls appear here.</p>}</section>
 <section id="standard-dice-tray" className="standard-dice-tray" hidden={!open} aria-label="Standard dice tray">
 <header><div><strong>Dice tray</strong><small>Quick rolls · saved on this device</small></div><button title={muted?'Unmute dice':'Mute dice'} aria-label={muted?'Unmute dice':'Mute dice'} aria-pressed={muted} onClick={()=>setMuted(m=>{try{localStorage.setItem('rpg-tray-muted',String(!m));}catch{}return !m;})}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><button aria-label="Close dice tray" onClick={()=>setOpen(false)}><X size={18}/></button></header>
 {open&&<TrayTabs tab={tab} setTab={setTab}/>}
 {tab==='tables'?<TrayTables scene={scene}/>:tab==='oracle'?<TrayOracle scene={scene}/>:<>
 <div className="tray-dice">{sides.map(s=>{const remove=()=>{setCustom(null);setCounts(c=>removeDie(c,s));};return <button key={s} disabled={busy} title={`Add d${s}${counts[s]?` (${counts[s]} selected · right-click or long-press to remove one)`:''}`} aria-label={`Add d${s}`}
  onClick={()=>{if(press.current.fired){press.current.fired=false;return;}setCustom(null);setCounts(c=>addDie(c,s));}}
  onContextMenu={e=>{e.preventDefault();if(press.current.down&&press.current.touch)return;remove();}}
  onPointerDown={e=>{const p=press.current;clearTimeout(p.timer);p.down=true;p.fired=false;p.touch=e.pointerType==='touch';if(p.touch&&counts[s])p.timer=setTimeout(()=>{p.fired=true;remove();navigator.vibrate?.(15);},500);}}
  onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress}><DieIcon sides={s}/><span>d{s}</span>{!!counts[s]&&<b>{counts[s]}</b>}</button>;})}</div>
 <div className="tray-modifier"><button disabled={busy||custom!==null} aria-label="Decrease modifier" onClick={()=>setModifier(m=>Math.max(-10000,m-1))}>−</button><label>Modifier<input disabled={busy||custom!==null} aria-label="Dice modifier" type="number" min={-10000} max={10000} value={modifier} onChange={e=>setModifier(Math.max(-10000,Math.min(10000,Math.trunc(Number(e.target.value))||0)))}/></label><button disabled={busy||custom!==null} aria-label="Increase modifier" onClick={()=>setModifier(m=>Math.min(10000,m+1))}>+</button><button disabled={busy} onClick={()=>{setCounts({});setModifier(0);setCustom(null);setError('');}}>Reset</button></div>
 {custom!==null&&<small>Edit modifiers in your custom formula, or Reset to use the dice buttons.</small>}<form onSubmit={e=>{e.preventDefault();void roll();}}><label>Roll formula<input aria-label="Tray roll formula" disabled={busy} value={custom??formula} placeholder="Choose dice or type 2d6+4" maxLength={200} onChange={e=>setCustom(e.target.value)}/></label>{(scene?.campaignId||history[0]?.context?.campaignId)&&<label className="tray-roll-name">Roll name for Discord<input aria-label="Roll name for Discord" value={rollName} maxLength={rollNameMax} placeholder="Optional, e.g. Attack on goblin" onChange={e=>setRollName(e.target.value)}/></label>}<button className="tray-roll" disabled={busy||!formula}>{busy?'Rolling…':'Roll'}</button></form>
 {error&&<p role="alert">{error}</p>}<div className="tray-result" role="status" aria-live="polite">{busy?'Rolling dice…':history[0]?<><strong>{history[0].total}</strong><span>{rollLabel(history[0])}<small>{history[0].detail}</small></span></>:'Choose your dice to begin.'}</div>
 {(history[0]?.context||sameDiceTarget(history[0]?.via,discord))&&<div className="tray-discord"><small>{history[0].context?`${history[0].context.label} · this scene`:`${history[0].via!.label} · Discord`}</small><button disabled={busy||sharing||(!!history[0].context&&!history[0].context.campaignId)} onClick={()=>void share(history[0])}>{sharing?'Posting…':'Post roll to Discord'}</button><p role="status">{shareStatus}</p></div>}
 {localNote&&!discord&&<p className="tray-local-note">{localNote}</p>}
 {(scene?.campaignId||discord||history[0]?.context?.campaignId)&&<label className="tray-always" title="Post every roll from a campaign page or scene to its Discord channel for rolls, without pressing Post. This applies on every campaign page."><input type="checkbox" checked={always} onChange={e=>{setAlways(e.target.checked);try{localStorage.setItem(autoKey,String(e.target.checked));}catch{}}}/>Always post rolls to Discord (every campaign page)</label>}
 {history.length>0&&<details><summary>Recent rolls ({history.length})</summary><ol>{history.map(e=><li key={e.id}><b>{e.total}</b><span>{rollLabel(e)}<small>{e.detail}</small></span></li>)}</ol><button onClick={()=>{setHistory([]);try{localStorage.removeItem(historyKey);}catch{}}}>Clear tray history</button></details>}
 </>}
 </section></div>;
}
/** Dice, Tables and Oracle. Tables and Oracle show only for the GM, who can read the random tables library. */
function TrayTabs({tab,setTab}:{tab:'dice'|'tables'|'oracle';setTab:(t:'dice'|'tables'|'oracle')=>void}){
 const tables=useTrayTables();
 if(!tables)return null;
 return <div className="tray-tabs" role="tablist" aria-label="Dice tray">{(['dice','tables','oracle'] as const).map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t==='dice'?'Dice':t==='tables'?'Tables':'Oracle'}</button>)}</div>;
}
