'use client';
import {useState,type MouseEvent} from 'react';
import dynamic from 'next/dynamic';
import {ExternalLink,Link as LinkIcon,MoreHorizontal,RefreshCw} from 'lucide-react';
import {defaultCharacter,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {playerSheet,refreshSheet,sheetOpenUrl,TEMPLATE_TAB,type Sheet} from '@/lib/encyclopedia/sheet-link';
import {GOOGLE_NOT_SET_UP,googleConfigured} from '@/lib/encyclopedia/google-client';
import {useIdlePreload} from '@/lib/idle-preload';
import {confirmDialog} from '../confirm-dialog';
import {memberRef} from './member-view';
import {readLinked,reopenLinked,type SheetRead} from './sheet-read';
import {SheetView} from './sheet-view';
import {SheetHp,SheetWriteBack} from './sheet-hp';
import {SheetRolls,SheetRollLog} from './sheet-rolls';
import {sheetRollGroups} from '@/lib/encyclopedia/sheet-rolls';
import {rollInline} from './rolls';
import './character-sheet.css';

const loadDialog=()=>import('./sheet-dialog');
const SheetDialog=dynamic(loadDialog);
const preload=[loadDialog];

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;

/** The page with its sheet set (or removed). Starts from the latest saved copy, so a slow read never overwrites newer edits. */
const withSheet=(id:string,f:(old:Sheet|undefined)=>Sheet|undefined)=>(w:Workspace):Workspace=>({...w,entries:w.entries.map(e=>{
 if(e.id!==id)return e;
 const character=e.character??defaultCharacter(),next=f(character.sheet),{sheet:_old,...rest}=character;
 void _old;
 return {...e,character:next?{...rest,sheet:next}:rest,editedBy:undefined,updatedAt:new Date().toISOString()};
})});

/** The Character sheet section of a character page: the linked sheet's cached values, Refresh, and the way to link or change it. */
export function CharacterSheetSection({entry,change}:{entry:Entry;change:Change}){
 useIdlePreload(preload);
 const sheet=entry.character?.sheet,coGm=!!memberRef(),visible=entry.character?.statsVisibility==='players';
 const [dialog,setDialog]=useState<{read?:SheetRead}|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[holding,setHolding]=useState(false);
 const fail=(e:unknown)=>setNotice(e instanceof Error?e.message:'Something went wrong. Try again.');

 async function refresh(){
  if(!sheet||busy||holding)return;
  setBusy(true);setNotice('');
  try{
   const tabs=await readLinked(sheet),now=new Date().toISOString(),{missing}=refreshSheet(sheet,tabs,now); // Throws, with a message for the GM, when the RPG Tools tab is gone.
   const ok=change(withSheet(entry.id,old=>{if(!old)return old;try{return refreshSheet(old,tabs,now).sheet;}catch{return old;}}));
   if(ok!==false)setNotice(missing.length?`Read the sheet, but couldn’t find ${missing.slice(0,3).join(', ')}${missing.length>3?` and ${missing.length-3} more`:''}. Change cells to fix that.`:'Read the sheet just now.');
  }catch(e){fail(e);}finally{setBusy(false);}
 }
 async function changeCells(){
  if(!sheet||busy)return;
  setBusy(true);setNotice('');
  try{setDialog({read:await reopenLinked(sheet)});}catch(e){fail(e);}finally{setBusy(false);}
 }
 async function unlink(){
  if(!await confirmDialog({title:`Unlink ${entry.title}’s sheet?`,message:'The stats and rolls copied from it are removed from this page. The Google Sheet itself is not touched.',confirm:'Unlink',danger:true}))return;
  change(withSheet(entry.id,()=>undefined));setNotice('');
 }
 const closeMenu=(e:MouseEvent<HTMLButtonElement>)=>e.currentTarget.closest('details')?.removeAttribute('open');

 const dialogEl=dialog&&<SheetDialog characterName={entry.title} current={sheet} read={dialog.read} onClose={()=>setDialog(null)} onSave={next=>{if(change(withSheet(entry.id,()=>next))!==false){setDialog(null);setNotice(`Linked ${next.title}.`);}}}/>;

 if(!sheet)return coGm?null:<>
  <div className="sheet-empty-card"><div><strong>Character sheet</strong><small>Link a Google Sheet to keep its stats and rolls on this page.</small></div>
   <button type="button" className="button" onClick={()=>setDialog({})}><LinkIcon size={14}/> Link a character sheet</button></div>
  {dialogEl}
 </>;

 const shown=playerSheet(sheet),rolls=sheetRollGroups(shown),open=sheetOpenUrl(sheet),theirs=!!sheet.linkedById&&sheet.source==='google',needsGoogle=theirs||(sheet.source==='google'&&!googleConfigured());
 const why=theirs?`${sheet.linkedBy??'The player'} linked this from their own Google account, so only they can refresh it.`:needsGoogle?GOOGLE_NOT_SET_UP:undefined;
 const reads=sheet.mode==='template'?`Reads the ${TEMPLATE_TAB} tab`:`Reads ${sheet.items.length} picked ${sheet.items.length===1?'cell':'cells'}`;
 return <>
  <SheetView sheet={shown} note={rolls.length?'Values are copied here when the sheet is read. Rolls show in the roll card, where they can go to Discord.':undefined}
   rolling={rolls.length?<><SheetRolls groups={rolls} twice onRoll={(name,formula,mode)=>rollInline(`${entry.title} · ${name}`,formula,{mode,log:true})}/>
    <div className="sheet-log"><span className="eyebrow">ROLL LOG</span><SheetRollLog character={entry.title}/></div></>:undefined}
   hpTools={coGm?undefined:<>
    <SheetWriteBack sheet={sheet} linker={theirs?sheet.linkedBy??'The player':undefined} onChange={next=>{change(withSheet(entry.id,old=>old?{...old,writeBack:next.writeBack}:old));}}/>
    {sheet.writeBack===true&&sheet.source==='google'&&!theirs&&<SheetHp sheet={sheet} onHold={setHolding} store={f=>change(withSheet(entry.id,old=>old?f(old):old))}/>}
   </>}
   subtitle={`Linked by ${sheet.linkedBy??'the GM'} · ${reads}`}
   actions={<>
    {open&&<a className="button small" href={open} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> {sheet.source==='google'?'Open in Google Sheets':'Open published sheet'}</a>}
    {!coGm&&<button type="button" className="button small" disabled={busy||holding||needsGoogle} title={holding?'HP is still being written to the sheet.':why} onClick={()=>void refresh()}><RefreshCw size={13}/> {busy?'Reading…':'Refresh'}</button>}
    {!coGm&&<details className="sheet-menu"><summary className="button small icon-button" aria-label="More for this sheet"><MoreHorizontal size={15}/></summary>
     <div className="sheet-menu-list"><button type="button" disabled={needsGoogle} title={why} onClick={e=>{closeMenu(e);void changeCells();}}>Change cells</button><button type="button" className="danger" onClick={e=>{closeMenu(e);void unlink();}}>Unlink</button></div></details>}
   </>}>
   <p className="sheet-visibility">{visible?'Players see the copied values, read only, because this character’s Stats tab is player visible.':sheet.linkedById?`Only you and ${sheet.linkedBy??'the player'} see this. Set the Stats tab to Player visible to show the copied values to every player.`:'Only you see this. Set the Stats tab to Player visible to show the copied values to players.'}</p>
   {notice&&<p role="status" className="sheet-notice">{notice}</p>}
  </SheetView>
  {dialogEl}
 </>;
}
