'use client';
/*
 * The top of a character page: the portrait (or a small Add picture tile) beside the name, one line of details
 * (status, location, organization) that opens Character details, and the tags. The picture's full controls (frame the
 * token, replace, a separate token image, Add to Maptable) open in a dialog from the portrait.
 */
import {useState} from 'react';
import {ImagePlus,Pencil,UserRound} from 'lucide-react';
import type {CharacterData,Entry} from '@/lib/encyclopedia/world-model';
import {TagRow} from '@/components/tags';
import type {Tag} from '@/lib/tags';
import {PicturePanel,usePictureSrc} from './character-picture';
import {ToolDialog} from './tool-dialog';

const statusNames:Record<CharacterData['status'],string>={active:'Active',inactive:'Inactive',missing:'Missing',deceased:'Deceased'};

type Props={entry:Entry;character:CharacterData;update:(p:Partial<Entry>)=>void;onRename:()=>void;onDetails:()=>void;onTag?:(tag:Tag)=>void;maptableHref:string|null};
export function CharacterHead({entry,character,update,onRename,onDetails,onTag,maptableHref}:Props){
 const [open,setOpen]=useState(false),{src}=usePictureSrc(entry.picture?.imageId);
 const facts=[character.location,character.faction].filter(Boolean);
 return <div className="char-head">
  <button type="button" className={`char-portrait${entry.picture?'':' is-empty'}`} onClick={()=>setOpen(true)} aria-label={entry.picture?'Picture and token':'Add a picture'} title={entry.picture?'Picture and token':'Add a picture. It becomes the token in Maptable.'}>
   {/* eslint-disable-next-line @next/next/no-img-element -- a private object URL; next/image cannot optimise it */}
   {entry.picture?(src?<img src={src} alt=""/>:<UserRound size={28}/>):<><ImagePlus size={20}/><span>Picture</span></>}
  </button>
  <div className="char-head-main">
   <div className="article-title"><h1>{entry.title}</h1><button aria-label="Rename entry" onClick={onRename}><Pencil size={17}/></button></div>
   <div className="char-head-line">
    <button type="button" className="char-head-details" onClick={onDetails} title="Character details: kind, status, location, organization, group and tags">
     <span className={`char-status is-${character.status}`}>{statusNames[character.status]}</span>
     {facts.map(f=><span key={f}>{f}</span>)}
     <Pencil size={12} className="char-head-edit" aria-hidden="true"/><span className="sr-only">Character details</span>
    </button>
    <TagRow className="char-head-tags" targets={[`entry:${entry.id}`]} onTagClick={onTag}/>
   </div>
  </div>
  {open&&<ToolDialog title={entry.picture?'Picture and token':'Add a picture'} wide onClose={()=>setOpen(false)}>
   <PicturePanel entry={entry} update={update} maptableHref={maptableHref}/>
  </ToolDialog>}
 </div>;
}
