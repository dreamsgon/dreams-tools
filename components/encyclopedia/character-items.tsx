"use client";
/*
 * The GM's Inventory and Spells tabs on a character page. Changes run through the same rules the server uses for a
 * player (lib/encyclopedia/items.ts applyInventoryAction), here with the GM's reach, and save with the page.
 */
import {applyInventoryAction,emptyInventory,itemSettingsOf,type InventoryAction,type Item} from '@/lib/encyclopedia/items';
import {give,giveTargets} from '@/lib/encyclopedia/store-actions';
import {defaultCharacter,newId,type Campaign,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {InventoryPanel} from './inventory';
import {SpellsPanel} from './spells';

type Props={entry:Entry;data:Workspace;campaign?:Campaign;update:(p:Partial<Entry>)=>void;change:(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;setNotice:(s:string)=>void};
const GM={gm:true as const,name:'GM'};
const message=(e:unknown)=>e instanceof Error?e.message:'That didn’t work.';

function useCharacterAct({entry,campaign,update,setNotice}:Props){
 const character=entry.character??defaultCharacter(),settings=itemSettingsOf(campaign);
 return (a:InventoryAction,quiet=true)=>{
  try{
   const r=applyInventoryAction({inventory:character.inventory,spells:character.spells,trackers:character.trackers},a,{gm:true,settings,newId});
   const next={...character};
   if(r.parts.inventory)next.inventory=r.parts.inventory;
   if(r.parts.spells)next.spells=r.parts.spells;
   if(r.parts.trackers)next.trackers=r.parts.trackers;
   update({character:next});
   if(!quiet||a.action==='cast')setNotice(r.said);
   return true;
  }catch(e){setNotice(message(e));return false;}
 };
}

export function CharacterInventoryTab(props:Props){
 const {entry,data,campaign,change,setNotice}=props,act=useCharacterAct(props),settings=itemSettingsOf(campaign),inv=entry.character?.inventory??emptyInventory();
 const giveTo=campaign?{targets:giveTargets(data,campaign.id,GM,entry.id),onGive:(itemId:string|null,to:string,qty:number,coins:number)=>{
  let said='';
  try{const ok=change(w=>{const r=give(w,campaign.id,GM,{from:entry.id,to,itemId,qty,coins},{newId});said=r.said;return r.data;});if(ok===false)return false;setNotice(said);return true;}catch(e){setNotice(message(e));return false;}
 }}:undefined;
 const catalog=campaign?{items:settings.catalog??[],save:(i:Item)=>{
  const {id:_i,qty:_q,equipped:_e,...rest}=i;void _i;void _q;void _e;
  const list=settings.catalog??[];
  if(list.some(x=>x.name.toLowerCase()===i.name.toLowerCase())){setNotice(`${i.name} is already on the item list.`);return;}
  if(list.length>=200){setNotice('The item list is full (200).');return;}
  change(w=>({...w,campaigns:w.campaigns.map(c=>c.id===campaign.id?{...c,items:{...itemSettingsOf(c),catalog:[...list,{...rest,id:newId(),qty:1}]}}:c)}));
  setNotice(`Saved ${i.name} to the item list.`);
 }}:undefined;
 return <InventoryPanel name={entry.title} items={inv.items} coins={inv.coins} capacity={inv.capacity} settings={settings} gm canEdit act={act} give={giveTo} catalog={catalog}/>;
}

export function CharacterSpellsTab(props:Props){
 const {entry,campaign}=props,act=useCharacterAct(props),character=entry.character??defaultCharacter();
 return <SpellsPanel name={entry.title} spells={character.spells??[]} trackers={character.trackers??[]} settings={itemSettingsOf(campaign)} gm canEdit act={act}/>;
}
