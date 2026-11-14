'use client';
import {useMemo,useState} from 'react';
import {Copy,Download} from 'lucide-react';
import {exportSheet,sheetFileName,sheetFileText,type ExportAudience} from '@/lib/encyclopedia/sheet-export';
import type {Campaign,Entry,Workspace} from '@/lib/encyclopedia/world-model';
import {ToolDialog} from './tool-dialog';
import './sheet-import.css';

const plural=(n:number,one:string,many=`${one}s`)=>`${n} ${n===1?one:many}`;

/**
 * Export a character as an RPG Tools sheet (.json), the file the sheet import reads (sheet-export.ts does the work).
 * Everything, for the GM's own use, or only what players can see, to hand to a player.
 */
export function SheetExportDialog({data,campaign,entry,onClose}:{data:Workspace;campaign:Campaign;entry:Entry;onClose:()=>void}){
 const [audience,setAudience]=useState<ExportAudience>('gm'),[notice,setNotice]=useState('');
 const out=useMemo(()=>{try{return exportSheet(data,entry.id,{campaignId:campaign.id,audience});}catch(e){return e instanceof Error?e.message:'This character can’t be exported.';}},[data,entry.id,campaign.id,audience]);
 if(typeof out==='string')return <ToolDialog title={`Export ${entry.title}`} onClose={onClose}><p className="import-warn">{out}</p></ToolDialog>;
 const {file,warnings}=out,text=sheetFileText(file);
 const has=[
  file.core?.hp&&`${file.core.hp.label??'HP'} ${file.core.hp.value}/${file.core.hp.max}`,
  file.core?.ac&&`${file.core.ac.label??'AC'} ${file.core.ac.value}`,
  file.fields.length&&plural(file.fields.length,'field'),
  file.gauges.length&&plural(file.gauges.length,'tracker'),
  file.rolls.length&&plural(file.rolls.length,'roll'),
  file.lists.length&&plural(file.lists.length,'tab'),
  file.traits.length&&plural(file.traits.length,'trait'),
  file.notes&&'the page text',
 ].filter(Boolean) as string[];

 function download(){
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download=sheetFileName(entry.title);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  setNotice(`Downloaded ${a.download}.`);
 }
 async function copy(){
  try{await navigator.clipboard.writeText(text);setNotice('Copied. Paste it into Import sheet in any campaign.');}
  catch{setNotice('Your browser didn’t allow copying. Use Download instead.');}
 }

 return <ToolDialog title={`Export ${entry.title}`} onClose={onClose}>
  <div className="import-body">
   <p className="modal-intro">Saves {entry.title} as an RPG Tools sheet (.json) with {campaign.name}’s stats. Bring it into another campaign or account with Import sheet.</p>
   <section role="radiogroup" aria-label="What to include">
    <label className="import-check"><input type="radio" name="sheet-export-audience" checked={audience==='gm'} onChange={()=>setAudience('gm')}/><span>Everything<small>GM-only fields, trackers, tabs and notes included. For you or your own VTT.</small></span></label>
    <label className="import-check"><input type="radio" name="sheet-export-audience" checked={audience==='players'} onChange={()=>setAudience('players')}/><span>What players can see<small>Only what a player sees on this page. Safe to hand to the character’s player.</small></span></label>
   </section>
   <section className="import-sum"><span className="import-label">In the file</span>
    {has.length?<ul>{has.map(h=><li key={h}>{h}</li>)}</ul>:<p className="import-note">Only the name. {audience==='players'?'Players can’t see anything else on this page.':'This page has no stats, sheet or tabs yet.'}</p>}
   </section>
   {warnings.length>0&&<div className="import-warn"><strong>Left out</strong><ul>{warnings.map(w=><li key={w}>{w}</li>)}</ul></div>}
   {notice&&<p role="status" className="import-note">{notice}</p>}
   <div className="import-footer"><button type="button" className="button" onClick={()=>void copy()}><Copy size={14}/> Copy</button><button type="button" className="button primary" onClick={download}><Download size={14}/> Download .json</button></div>
  </div>
 </ToolDialog>;
}
