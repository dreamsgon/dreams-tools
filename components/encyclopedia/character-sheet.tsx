'use client';
import {useState,type MouseEvent} from 'react';
import dynamic from 'next/dynamic';
import {Download,ExternalLink,FileUp,Link as LinkIcon,MoreHorizontal,RefreshCw} from 'lucide-react';
import {defaultCharacter,type Campaign,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {playerSheet,refreshSheet,sheetOpenUrl,timeAgo,TEMPLATE_TAB,type Sheet} from '@/lib/encyclopedia/sheet-link';
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

const loadDialog=()=>import('./sheet-dialog'),loadImport=()=>import('./sheet-import-dialog'),loadExport=()=>import('./sheet-export-dialog');
const SheetDialog=dynamic(loadDialog);
const SheetImportDialog=dynamic(()=>loadImport().then(m=>m.SheetImportDialog));
const SheetExportDialog=dynamic(()=>loadExport().then(m=>m.SheetExportDialog));
const preload=[loadDialog,loadImport,loadExport];

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;

/** The page with its sheet set (or removed). Starts from the latest saved copy, so a slow read never overwrites newer edits. */
const withSheet=(id:string,f:(old:Sheet|undefined)=>Sheet|undefined)=>(w:Workspace):Workspace=>({...w,entries:w.entries.map(e=>{
 if(e.id!==id)return e;
 const character=e.character??defaultCharacter(),next=f(character.sheet),{sheet:_old,...rest}=character;
 void _old;
 return {...e,character:next?{...rest,sheet:next}:rest,editedBy:undefined,updatedAt:new Date().toISOString()};
})});

/** The Character sheet section of a character page: the linked sheet's cached values, Refresh, and the way to link or change it. */
export function CharacterSheetSection({entry,change,data,campaign}:{entry:Entry;change:Change;data?:Workspace;campaign?:Campaign}){
 useIdlePreload(preload);
 const sheet=entry.character?.sheet,coGm=!!memberRef(),visible=entry.character?.statsVisibility==='players';
 const [importing,setImporting]=useState(false),[exporting,setExporting]=useState(false),[dialog,setDialog]=useState<{read?:SheetRead}|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[holding,setHolding]=useState(false);
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
  const imported=sheet?.source==='import';
  if(!await confirmDialog(imported?{title:`Remove ${entry.title}’s imported sheet?`,message:'Its HP, AC, initiative and rolls are removed from this page. Stat form values, trackers and tabs from the import stay.',confirm:'Remove',danger:true}:{title:`Unlink ${entry.title}’s sheet?`,message:'The stats and rolls copied from it are removed from this page. The Google Sheet itself is not touched.',confirm:'Unlink',danger:true}))return;
  change(withSheet(entry.id,()=>undefined));setNotice('');
 }
 const closeMenu=(e:MouseEvent<HTMLButtonElement>)=>e.currentTarget.closest('details')?.removeAttribute('open');

 const canImport=!coGm&&!!data&&!!campaign;
 const importEl=importing&&data&&campaign&&<SheetImportDialog data={data} campaign={campaign} worldId={entry.worldId} update={entry} change={change} onClose={()=>setImporting(false)} onDone={(_id,msg)=>{setImporting(false);setNotice(msg);}}/>;
 const exportEl=exporting&&data&&campaign&&<SheetExportDialog data={data} campaign={campaign} entry={entry} onClose={()=>setExporting(false)}/>;
 const dialogEl=dialog&&<SheetDialog characterName={entry.title} current={sheet?.source==='import'?undefined:sheet} read={dialog.read} onClose={()=>setDialog(null)} onSave={next=>{if(change(withSheet(entry.id,()=>next))!==false){setDialog(null);setNotice(`Linked ${next.title}.`);}}}/>;

 if(!sheet)return coGm?null:<>
  <div className="sheet-empty-card"><div><strong>Character sheet</strong><small>Import a sheet from any game through ChatGPT or Claude, or link a Google Sheet to keep its stats and rolls on this page.</small></div>
   {canImport&&<button type="button" className="button" onClick={()=>setImporting(true)}><FileUp size={14}/> Import a sheet</button>}
   <button type="button" className="button" onClick={()=>setDialog({})}><LinkIcon size={14}/> Link a Google Sheet</button>
   {canImport&&<button type="button" className="button" onClick={()=>setExporting(true)}><Download size={14}/> Export</button>}</div>
  {notice&&<p role="status" className="sheet-notice">{notice}</p>}
  {dialogEl}{importEl}{exportEl}
 </>;

 const imported=sheet.source==='import';
 const shown=playerSheet(sheet),rolls=sheetRollGroups(shown),open=sheetOpenUrl(sheet),theirs=!!sheet.linkedById&&sheet.source==='google',needsGoogle=theirs||(sheet.source==='google'&&!googleConfigured());
 const why=theirs?`${sheet.linkedBy??'The player'} linked this from their own Google account, so only they can refresh it.`:needsGoogle?GOOGLE_NOT_SET_UP:undefined;
 const reads=imported?`Imported ${timeAgo(sheet.readAt)||''}`.trim():sheet.mode==='template'?`Reads the ${TEMPLATE_TAB} tab`:`Reads ${sheet.items.length} picked ${sheet.items.length===1?'cell':'cells'}`;
 return <>
  <SheetView sheet={shown} note={rolls.length?imported?'Values come from the import. Import again to update them. Rolls show in the roll card, where they can go to Discord.':'Values are copied here when the sheet is read. Rolls show in the roll card, where they can go to Discord.':undefined}
   rolling={rolls.length?<><SheetRolls groups={rolls} twice onRoll={(name,formula,mode)=>rollInline(`${entry.title} · ${name}`,formula,{mode,log:true})}/>
    <div className="sheet-log"><span className="eyebrow">ROLL LOG</span><SheetRollLog character={entry.title}/></div></>:undefined}
   hpTools={coGm||imported?undefined:<>
    <SheetWriteBack sheet={sheet} linker={theirs?sheet.linkedBy??'The player':undefined} onChange={next=>{change(withSheet(entry.id,old=>old?{...old,writeBack:next.writeBack}:old));}}/>
    {sheet.writeBack===true&&sheet.source==='google'&&!theirs&&<SheetHp sheet={sheet} onHold={setHolding} store={f=>change(withSheet(entry.id,old=>old?f(old):old))}/>}
   </>}
   subtitle={imported?`${sheet.linkedBy??'Import'} · ${reads}`:`Linked by ${sheet.linkedBy??'the GM'} · ${reads}`}
   actions={<>
    {open&&<a className="button small" href={open} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> {sheet.source==='google'?'Open in Google Sheets':'Open published sheet'}</a>}
    {imported&&canImport&&<button type="button" className="button small" onClick={()=>setImporting(true)}><FileUp size={13}/> Import again</button>}
    {!coGm&&!imported&&<button type="button" className="button small" disabled={busy||holding||needsGoogle} title={holding?'HP is still being written to the sheet.':why} onClick={()=>void refresh()}><RefreshCw size={13}/> {busy?'Reading…':'Refresh'}</button>}
    {!coGm&&<details className="sheet-menu"><summary className="button small icon-button" aria-label="More for this sheet"><MoreHorizontal size={15}/></summary>
     <div className="sheet-menu-list">{!imported&&<button type="button" disabled={needsGoogle} title={why} onClick={e=>{closeMenu(e);void changeCells();}}>Change cells</button>}{imported&&<button type="button" onClick={e=>{closeMenu(e);setDialog({});}}>Link a Google Sheet instead</button>}{canImport&&<button type="button" onClick={e=>{closeMenu(e);setExporting(true);}}>Export as .json</button>}<button type="button" className="danger" onClick={e=>{closeMenu(e);void unlink();}}>{imported?'Remove':'Unlink'}</button></div></details>}
   </>}>
   <p className="sheet-visibility">{visible?'Players see the copied values, read only, because this character’s Stats tab is player visible.':sheet.linkedById?`Only you and ${sheet.linkedBy??'the player'} see this. Set the Stats tab to Player visible to show the copied values to every player.`:'Only you see this. Set the Stats tab to Player visible to show the copied values to players.'}</p>
   {notice&&<p role="status" className="sheet-notice">{notice}</p>}
  </SheetView>
  {dialogEl}{importEl}{exportEl}
 </>;
}
