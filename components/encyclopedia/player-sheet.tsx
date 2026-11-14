'use client';
import {useState,type MouseEvent} from 'react';
import dynamic from 'next/dynamic';
import {ExternalLink,Link as LinkIcon,MoreHorizontal,RefreshCw} from 'lucide-react';
import type {PlayerSheet} from '@/lib/encyclopedia/sheet-link';
import type {SheetState} from '@/lib/encyclopedia/player-sheet';
import {sheetRollGroups} from '@/lib/encyclopedia/sheet-rolls';
import {GOOGLE_NOT_SET_UP,googleConfigured,googleToken} from '@/lib/encyclopedia/google-client';
import {useIdlePreload} from '@/lib/idle-preload';
import {confirmDialog} from '../confirm-dialog';
import {SheetView} from './sheet-view';
import {SheetRolls,SheetRollLog} from './sheet-rolls';
import {rollInline} from './rolls';
import {readGoogle} from './sheet-read';
import {linkMySheet,readPublishedAsMember,refreshMySheet,rollFromSheet,unlinkMySheet} from './player-sheet-api';
import './character-sheet.css';

const loadDialog=()=>import('./sheet-dialog');
const SheetDialog=dynamic(loadDialog);
const preload=[loadDialog];

/** A character sheet on the player pages. On the member's own character: link, refresh and roll with the server. Anywhere else: read only, rolls stay in this browser. */
export function PlayerSheetSection({title,entryId,sheet,state,memberRef,onChanged}:{title:string;entryId:string;sheet?:PlayerSheet;state?:SheetState;memberRef:string;onChanged:()=>void}){
 useIdlePreload(preload);
 const [dialog,setDialog]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const fail=(e:unknown)=>setNotice(e instanceof Error?e.message:'Something went wrong. Try again.');
 const canLink=!!state?.canLink&&!!memberRef,mine=!!state?.mine,serverRolls=!!state?.canRoll&&!!memberRef;

 async function refresh(){
  if(busy)return;
  setBusy(true);setNotice('');
  try{
   // A Google sheet is read here with the player's own sign-in; a published link is read by the server.
   const id=/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]{10,120})\/edit/.exec(state?.open??'')?.[1];
   const tabs=id?(await readGoogle(id,await googleToken())).tabs:undefined;
   const {missing}=await refreshMySheet(memberRef,entryId,tabs);
   setNotice(missing?.length?`Read your sheet, but couldn’t find ${missing.slice(0,3).join(', ')}${missing.length>3?` and ${missing.length-3} more`:''}.`:'Read your sheet just now.');
   onChanged();
  }catch(e){fail(e);}finally{setBusy(false);}
 }
 async function unlink(){
  if(!await confirmDialog({title:`Unlink ${title}’s sheet?`,message:'The stats and rolls copied from it are removed from this page. Your Google Sheet itself is not touched.',confirm:'Unlink',danger:true}))return;
  try{await unlinkMySheet(memberRef,entryId);setNotice('');onChanged();}catch(e){fail(e);}
 }
 const closeMenu=(e:MouseEvent<HTMLButtonElement>)=>e.currentTarget.closest('details')?.removeAttribute('open');
 const dialogEl=dialog&&<SheetDialog characterName={title} player={{name:'you',read:link=>readPublishedAsMember(memberRef,link)}} onClose={()=>setDialog(false)}
  onSave={async next=>{await linkMySheet(memberRef,entryId,next);setDialog(false);setNotice(`Linked ${next.title}.`);onChanged();}}/>;

 if(!sheet){
  if(!canLink)return null;
  return <><div className="sheet-empty-card"><div><strong>Character sheet</strong><small>Link your own Google Sheet to keep your stats here and roll from them. Only you and your GM can change it.</small></div>
   <button type="button" className="button" onClick={()=>setDialog(true)}><LinkIcon size={14}/> Link my sheet</button></div>{dialogEl}</>;
 }
 const rolls=sheetRollGroups(sheet),needsGoogle=!!state?.open&&!state.open.includes('/d/e/')&&!googleConfigured();
 const rolling=rolls.length?<>
  <SheetRolls groups={rolls} twice onRoll={(name,formula,mode,itemId)=>{
   setNotice('');
   if(serverRolls)void rollFromSheet(memberRef,entryId,itemId,mode).catch(fail);
   else rollInline(`${title} · ${name}`,formula,{mode,log:true});
  }}/>
  {!serverRolls&&<p className="sheet-local-hint">Rolls here stay on this device.</p>}
  <div className="sheet-log"><span className="eyebrow">ROLL LOG</span><SheetRollLog character={title}/></div></>:undefined;
 return <>
  <SheetView sheet={sheet} rolling={rolling}
   subtitle={mine?'Linked by you. Only you and your GM can change it.':canLink||serverRolls?'Shared by your GM. Read only.':'Shared by your GM. Read only. Rolls stay on this device.'}
   note={serverRolls&&rolls.length?`Your rolls appear in the roll log and in the campaign’s Discord channel as ${title}. Refresh reads your sheet again.`:rolls.length?'Values are copied from the sheet by your GM.':undefined}
   actions={canLink?<>
    {state?.open&&<a className="button small" href={state.open} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Open</a>}
    <button type="button" className="button small" disabled={busy||needsGoogle} title={needsGoogle?GOOGLE_NOT_SET_UP:undefined} onClick={()=>void refresh()}><RefreshCw size={13}/> {busy?'Reading…':'Refresh'}</button>
    <button type="button" className="button small" onClick={()=>setDialog(true)}><LinkIcon size={13}/> Link my sheet</button>
    <details className="sheet-menu"><summary className="button small icon-button" aria-label="More for this sheet"><MoreHorizontal size={15}/></summary>
     <div className="sheet-menu-list"><button type="button" className="danger" onClick={e=>{closeMenu(e);void unlink();}}>Unlink</button></div></details>
   </>:undefined}>
   {notice&&<p role="status" className="sheet-notice">{notice}</p>}
  </SheetView>
  {dialogEl}
 </>;
}
