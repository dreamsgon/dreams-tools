"use client";
/*
 * Items and spells setup for a campaign (lib/encyclopedia/items.ts): the coins and what each is worth, how a load is
 * counted, item categories, which columns show, what the game calls its spells, and what players may change or set up.
 * Nothing here is tied to one game: start from a ready-made setup or type your own words.
 */
import {useState} from 'react';
import {Plus,Trash2,X} from 'lucide-react';
import {carryUnitNames,carryUnits,coinPresets,defaultItemSettings,formatMoney,itemSettingsOf,itemSettingsSchema,type Coin,type ItemSettings} from '@/lib/encyclopedia/items';
import type {Campaign} from '@/lib/encyclopedia/world-model';
import {ToolDialog} from './tool-dialog';
import './inventory.css';

const starts:{name:string;apply:(s:ItemSettings)=>ItemSettings}[]=[
 {name:'Fantasy',apply:s=>({...s,coins:coinPresets[1].coins,carry:'lb',spells:{...s.spells,on:true,tab:'Spells',one:'spell',verb:'Cast',ready:'Prepared'}})},
 {name:'Science fiction',apply:s=>({...s,coins:coinPresets[2].coins,carry:'kg',spells:{...s.spells,on:true,tab:'Powers',one:'power',verb:'Use',ready:''}})},
 {name:'Modern day',apply:s=>({...s,coins:coinPresets[3].coins,carry:'none',spells:{...s.spells,on:false}})},
 {name:'Slots and one coin',apply:s=>({...s,coins:coinPresets[0].coins,carry:'slots',spells:{...s.spells,on:true,tab:'Spells',one:'spell',verb:'Cast',ready:''}})},
];
const list=(v:string,max:number,len:number)=>[...new Set(v.split(',').map(x=>x.trim().slice(0,len)).filter(Boolean))].slice(0,max);

function Words({value,label,placeholder,max,len,onChange}:{value:string[];label:string;placeholder:string;max:number;len:number;onChange:(v:string[])=>void}){
 const [text,setText]=useState('');
 const add=()=>{const next=list([...value,...list(text,max,len)].join(','),max,len);onChange(next);setText('');};
 return <div className="field-label">{label}
  <div className="inv-chips">{value.map(v=><button type="button" key={v} className="on" aria-label={`Remove ${v}`} onClick={()=>onChange(value.filter(x=>x!==v))}>{v} <X size={11}/></button>)}</div>
  {value.length<max&&<div className="inv-add"><input className="inv-input inv-add-name" placeholder={placeholder} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}/><button type="button" className="button small" disabled={!text.trim()} onClick={add}><Plus size={13}/> Add</button></div>}
 </div>;
}

export function ItemSettingsDialog({campaign,onSave,onClose}:{campaign:Campaign;onSave:(s:ItemSettings)=>void;onClose:()=>void}){
 const [s,setS]=useState<ItemSettings>(()=>itemSettingsOf(campaign)),[error,setError]=useState('');
 const set=(p:Partial<ItemSettings>)=>setS(x=>({...x,...p}));
 const setCoin=(i:number,p:Partial<Coin>)=>set({coins:s.coins.map((c,j)=>j===i?{...c,...p}:c)});
 const save=()=>{const r=itemSettingsSchema.safeParse(s);if(!r.success){setError(r.error.issues[0]?.message??'Check the settings.');return;}onSave(r.data);onClose();};
 const sp=s.spells,p=s.players;
 return <ToolDialog title={`Items and ${sp.tab.toLowerCase()}`} onClose={onClose} wide>
  <div className="item-settings inventory">
   <p className="modal-intro">For every character in {campaign.name}: money, what they carry, and {sp.tab.toLowerCase()}. Start from a ready-made setup, then change any word.</p>
   <div className="inv-chips" role="group" aria-label="Start from">{starts.map(x=><button type="button" key={x.name} onClick={()=>setS(x.apply)}>{x.name}</button>)}<button type="button" onClick={()=>setS({...defaultItemSettings(),catalog:s.catalog})}>Plain</button></div>
   <div className="store-settings">
    <section className="inv-box"><span className="eyebrow">MONEY</span>
     {s.coins.map((c,i)=><div className="spell-cost" key={i}>
      <input className="inv-input" aria-label="Coin name" maxLength={30} value={c.name} onChange={e=>setCoin(i,{name:e.target.value})}/>
      <input className="inv-input" style={{width:64}} aria-label="Short name" maxLength={10} value={c.abbr} onChange={e=>setCoin(i,{abbr:e.target.value})}/>
      <input className="inv-input" type="number" min={1} aria-label="Worth, in the smallest coin" title="Worth, in the smallest coin" value={c.rate} onChange={e=>setCoin(i,{rate:Math.max(1,Math.round(Number(e.target.value)||1))})}/>
      <button type="button" className="icon-button" aria-label={`Remove ${c.name}`} disabled={s.coins.length<2} onClick={()=>set({coins:s.coins.filter((_,j)=>j!==i)})}><Trash2 size={13}/></button>
     </div>)}
     {s.coins.length<6&&<button type="button" className="text-button" onClick={()=>set({coins:[...s.coins,{name:'Coin',abbr:`c${s.coins.length+1}`,rate:10}]})}><Plus size={13}/> A coin</button>}
     <small className="muted">The number is what one is worth in the smallest coin, which is worth 1. 1234 reads as {formatMoney(1234,s.coins)}.</small>
    </section>
    <section className="inv-box"><span className="eyebrow">CARRYING</span>
     <label className="field-label">Count a load in<select value={s.carry} onChange={e=>set({carry:e.target.value as ItemSettings['carry']})}>{carryUnits.map(u=><option key={u} value={u}>{carryUnitNames[u]}</option>)}</select></label>
     <span className="eyebrow">COLUMNS</span>
     {([['weight','Weight'],['value','Value'],['uses','Uses'],['equipped','Worn or in hand']] as const).map(([k,l])=><label key={k} className="check-line"><input type="checkbox" checked={s.show[k]} onChange={e=>set({show:{...s.show,[k]:e.target.checked}})}/> {l}</label>)}
    </section>
    <section className="inv-box"><Words label="Item categories" value={s.categories} max={20} len={40} placeholder="Weapons, Cyberware, Rations…" onChange={categories=>set({categories})}/></section>
    <section className="inv-box"><span className="eyebrow">SPELLS, POWERS…</span>
     <label className="check-line"><input type="checkbox" checked={sp.on} onChange={e=>set({spells:{...sp,on:e.target.checked}})}/> Characters have this tab</label>
     {sp.on&&<>
      <div className="store-two"><label className="field-label">Tab name<input className="inv-input" maxLength={30} value={sp.tab} onChange={e=>set({spells:{...sp,tab:e.target.value}})}/></label><label className="field-label">One of them<input className="inv-input" maxLength={30} value={sp.one} onChange={e=>set({spells:{...sp,one:e.target.value}})}/></label></div>
      <div className="store-two"><label className="field-label">Button that spends<input className="inv-input" maxLength={20} value={sp.verb} onChange={e=>set({spells:{...sp,verb:e.target.value}})}/></label><label className="field-label">Ready ones are<small> Empty: no such thing</small><input className="inv-input" maxLength={20} placeholder="Prepared" value={sp.ready} onChange={e=>set({spells:{...sp,ready:e.target.value}})}/></label></div>
      <Words label="Groups" value={sp.groups} max={20} len={40} placeholder="At will, Level 1, Rituals…" onChange={groups=>set({spells:{...sp,groups}})}/>
      <Words label="Details each one lists" value={sp.columns} max={6} len={30} placeholder="Range, Duration…" onChange={columns=>set({spells:{...sp,columns}})}/>
     </>}
    </section>
    <section className="inv-box"><span className="eyebrow">PLAYERS MAY</span>
     {([['items',`Change their own items and ${sp.tab.toLowerCase()}`],['coins','Change their own money'],['values','See what things are worth'],['give','Give things to other characters']] as const).map(([k,l])=><label key={k} className="check-line"><input type="checkbox" checked={p[k]} onChange={e=>set({players:{...p,[k]:e.target.checked}})}/> {l}</label>)}
     {([['containers','Set up containers and stashes'],['shops','Set up stalls to sell from']] as const).map(([k,l])=><label key={k} className="field-label">{l}<select value={p[k]} onChange={e=>set({players:{...p,[k]:e.target.value as 'yes'|'ask'|'no'}})}><option value="yes">Yes</option><option value="ask">After my OK</option><option value="no">No</option></select></label>)}
    </section>
    <section className="inv-box"><span className="eyebrow">ITEM LIST</span>
     {(s.catalog??[]).map(i=><div className="spell-cost" key={i.id}><span style={{flex:1}}>{i.name}{i.price!==undefined&&<small className="muted"> · {formatMoney(i.price,s.coins)}</small>}</span><button type="button" className="icon-button" aria-label={`Remove ${i.name} from the list`} onClick={()=>set({catalog:(s.catalog??[]).filter(x=>x.id!==i.id)})}><Trash2 size={13}/></button></div>)}
     <small className="muted">{(s.catalog??[]).length?'Add these to any character or shop.':'Empty. On a character’s Inventory, open an item and choose Save to the item list.'}</small>
    </section>
   </div>
   {error&&<p role="alert" className="form-error">{error}</p>}
   <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={save}>Save</button></div>
  </div>
 </ToolDialog>;
}
