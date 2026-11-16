"use client";
/*
 * Inventory and spells on the player pages. Anyone the GM shares them with reads them; the character's own player
 * (Who can edit) changes them, and every change goes to POST /api/encyclopedia/player-tracker?items, which checks it again.
 */
import {useState} from 'react';
import {Store} from 'lucide-react';
import type {InventoryAction,PlayerInventory,PlayerItemSettings,PlayerSpell} from '@/lib/encyclopedia/items';
import type {PlayerTracker} from '@/lib/encyclopedia/trackers';
import {InventoryPanel} from './inventory';
import {SpellsPanel} from './spells';
import {NewPlayerStore} from './store-page';

function usePost(memberRef:string|undefined,onChanged:()=>void){
 const [error,setError]=useState(''),[said,setSaid]=useState('');
 const post=async(body:Record<string,unknown>,show=false)=>{
  if(!memberRef)return false;
  setError('');setSaid('');
  try{
   const res=await fetch('/api/encyclopedia/player-tracker?items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:memberRef,...body})});
   const j=await res.json().catch(()=>({}));
   if(!res.ok){setError(j.error||'That didn’t work. Try again.');return false;}
   if(show&&j.said)setSaid(j.said);
   onChanged();return true;
  }catch{setError('Could not reach the server. Try again.');return false;}
 };
 const notes=<>{said&&<p role="status" className="info-note">{said}</p>}{error&&<p role="alert" className="form-error">{error}</p>}</>;
 return {post,notes};
}

type Char={id:string;title:string};
export function PlayerInventoryTab({entry,inventory,settings,memberRef,canEdit,characters,mine,onChanged,onOpen}:{entry:Char;inventory:PlayerInventory;settings:PlayerItemSettings;memberRef?:string;canEdit:boolean;characters:Char[];mine:(Char&{inventory?:PlayerInventory})[];onChanged:()=>void;onOpen:(id:string)=>void}){
 const {post,notes}=usePost(memberRef,onChanged),[making,setMaking]=useState(false);
 const act=(a:InventoryAction)=>post({kind:'inventory',as:entry.id,change:a},a.action==='coins');
 const may=canEdit&&!!memberRef,canMake=may&&(settings.players.containers!=='no'||settings.players.shops!=='no');
 const give=may&&settings.players.give?{targets:characters.filter(c=>c.id!==entry.id),onGive:(itemId:string|null,to:string,qty:number,coins:number)=>post({kind:'give',give:{from:entry.id,to,itemId,qty,coins}},true)}:undefined;
 return <>
  <InventoryPanel name={entry.title} items={inventory.items} coins={inventory.coins} capacity={inventory.capacity} settings={settings} gm={false} canEdit={may} act={act} give={give}
   extra={canMake?<div className="button-row"><button type="button" className="button small" onClick={()=>setMaking(true)}><Store size={14}/> Set up a stall or container</button></div>:undefined}/>
  {notes}
  {making&&memberRef&&<NewPlayerStore memberRef={memberRef} mine={mine.filter(c=>c.id===entry.id)} settings={settings} onClose={()=>setMaking(false)} onDone={id=>{setMaking(false);onChanged();onOpen(id);}}/>}
 </>;
}

export function PlayerSpellsTab({entry,spells,trackers,settings,memberRef,canEdit,onChanged}:{entry:Char;spells:PlayerSpell[];trackers:PlayerTracker[];settings:PlayerItemSettings;memberRef?:string;canEdit:boolean;onChanged:()=>void}){
 const {post,notes}=usePost(memberRef,onChanged);
 return <><SpellsPanel name={entry.title} spells={spells} trackers={trackers} settings={settings} gm={false} canEdit={canEdit&&!!memberRef} act={a=>post({kind:'inventory',as:entry.id,change:a},a.action==='cast')}/>{notes}</>;
}
