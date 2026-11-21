"use client";
/*
 * A store page (lib/encyclopedia/stores.ts): the GM's stock and settings, and what a player sees and does there.
 * The GM changes the store directly (it saves with the page). A player's buy, sell, take, put in, open, haggle and
 * stall changes go to the server (POST /api/encyclopedia/player-tracker?items), which works out prices and makes the rolls.
 */
import {useState} from 'react';
import {Check,ChevronDown,ChevronRight,Coins,DoorOpen,Eye,EyeOff,Infinity as Unlimited,KeyRound,ListPlus,Lock,Plus,Scale,Sparkles,Trash2,Wrench,X} from 'lucide-react';
import {formatMoney,itemSettingsOf,parseMoney,type Item,type PlayerInventory,type PlayerItemSettings} from '@/lib/encyclopedia/items';
import {buyPrice,defaultShop,listPrice,shareOf,storeTypeHints,storeTypeNames,storeTypes,type PlayerStore,type Store,type StoreItem,type StoreType} from '@/lib/encyclopedia/stores';
import {approveStore,decidePending} from '@/lib/encyclopedia/store-actions';
import {newId,visibleEntries,type Campaign,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {Field,NoteText,RollsEditor} from './inventory';
import {showServerRoll} from './rolls';
import {ToolDialog} from './tool-dialog';
import {confirmDialog} from '../confirm-dialog';
import './inventory.css';

const when=(at:string)=>{const d=new Date(at);return Number.isNaN(d.getTime())?'':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});};
const pctOf=(v:string)=>{const n=Math.round(Number(v));return v.trim()!==''&&Number.isFinite(n)&&n>=0&&n<=1000?n:null;};
const intOf=(v:string,min=-1000,max=10000)=>{const n=Math.round(Number(v));return v.trim()!==''&&Number.isFinite(n)&&n>=min&&n<=max?n:null;};

function Log({log}:{log:{at:string;who:string;what:string}[]}){
 if(!log.length)return null;
 return <section><span className="eyebrow">Log</span><div className="store-log">{[...log].reverse().map((l,i)=><div key={i}><span><strong>{l.who}</strong> {l.what}</span><time>{when(l.at)}</time></div>)}</div></section>;
}

function Pills({type,shop,lock,owner,awaiting}:{type:StoreType;shop?:{open:boolean;hours?:string};lock?:{state:string};owner?:string;awaiting?:boolean}){
 return <div className="store-head">
  <span className="store-pill">{storeTypeNames[type]}</span>
  {shop&&<span className={`store-pill ${shop.open?'open':'closed'}`}>{shop.open?'Open':'Closed'}{shop.hours?` · ${shop.hours}`:''}</span>}
  {lock&&lock.state!=='open'&&<span className="store-pill closed">{lock.state==='locked'?<><Lock size={12}/> Locked</>:'Closed'}</span>}
  {owner&&<span className="store-pill">Run by {owner}</span>}
  {awaiting&&<span className="store-pill wait">Waiting for the GM’s OK</span>}
 </div>;
}

/** The campaign's item list, to stock from. */
function CatalogPick({items,coins,onPick,onClose}:{items:Item[];coins:PlayerItemSettings['coins'];onPick:(i:Item)=>void;onClose:()=>void}){
 const [q,setQ]=useState('');const shown=items.filter(i=>i.name.toLowerCase().includes(q.trim().toLowerCase()));
 return <ToolDialog title="Stock from the item list" onClose={onClose}>
  <input className="inv-input inv-search-input" autoFocus placeholder="Find an item" value={q} onChange={e=>setQ(e.target.value)}/>
  <div className="inv-catalog">{shown.map(i=><button type="button" key={i.id} onClick={()=>onPick(i)}><strong>{i.name}</strong><small>{[i.category,i.price!==undefined?formatMoney(i.price,coins):''].filter(Boolean).join(' · ')}</small><Plus size={14}/></button>)}
   {!items.length&&<p className="muted">The item list is empty. Open an item on a character’s Inventory and choose Save to the item list.</p>}</div>
 </ToolDialog>;
}

type GMProps={entry:Entry;store:Store;data:Workspace;campaign?:Campaign;update:(p:Partial<Entry>)=>void;change:(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;onOpen:(id:string)=>void;setNotice:(s:string)=>void};

/** The GM's store tab: stock, money, what is waiting, the settings for its kind, and the log. */
export function StoreTab({entry,store,data,campaign,update,change,onOpen,setNotice}:GMProps){
 const settings=itemSettingsOf(campaign),coins=settings.coins,money=(n:number)=>formatMoney(n,coins);
 const people=visibleEntries(data,entry.worldId,campaign?.id??entry.campaignId).filter(e=>e.kind==='character').sort((a,b)=>a.title.localeCompare(b.title));
 const owner=store.ownerId?people.find(p=>p.id===store.ownerId):undefined;
 const save=(st:Store)=>update({store:st});
 const setItem=(id:string,p:Partial<StoreItem>)=>save({...store,items:store.items.map(i=>{if(i.id!==id)return i;const n={...i,...p} as Record<string,unknown>;for(const k of Object.keys(p))if(n[k]===undefined||n[k]==='')delete n[k];return n as StoreItem;})});
 const [name,setName]=useState(''),[value,setValue]=useState(''),[open,setOpen]=useState<string|null>(null),[picking,setPicking]=useState(false);
 const add=()=>{const n=name.trim();if(!n)return;const price=value.trim()?parseMoney(value,coins):undefined;if(price===null){setNotice(`Write a value such as 5 ${coins.at(-1)?.abbr}.`);return;}save({...store,items:[...store.items,{id:newId(),name:n.slice(0,80),qty:store.type==='shop'?1:1,...(price!==undefined?{price}:{}),...(settings.categories[0]&&store.type==='shop'?{category:settings.categories[0]}:{})}]});setName('');setValue('');};
 const decide=(pendingId:string,yes:boolean)=>{if(!campaign)return;let said='';try{change(w=>{const r=decidePending(w,campaign.id,entry.id,pendingId,yes,{newId});said=r.said;return r.data;});setNotice(said);}catch(e){setNotice(e instanceof Error?e.message:'That didn’t work.');}};
 const shop=store.shop,share=shareOf(store),isShop=store.type==='shop';
 const switchType=async(type:StoreType)=>{if(type===store.type)return;if(store.items.length&&!await confirmDialog({title:`Make it a ${storeTypeNames[type].toLowerCase()}?`,message:'Its stock and coins stay. Its settings change to suit the new kind.',confirm:'Change'}))return;const {shop:_s,share:_h,lock:_l,...rest}=store;void _s;void _h;void _l;save({...rest,type,...(type==='shop'?{shop:store.shop??defaultShop()}:{share:shareOf({...store,type,share:undefined})}),...(type==='container'?{lock:store.lock??{state:'closed' as const}}:{})});};
 const pctRows=(kind:'categoryPct'|'characterPct',choices:{id:string;label:string}[])=>{
  const map=shop?.[kind]??{},keys=Object.keys(map),free=choices.filter(c=>!(c.id in map));
  const set=(next:Record<string,number>)=>shop&&save({...store,shop:{...shop,[kind]:Object.keys(next).length?next:undefined}});
  return <>{keys.map(k=><div className="store-pct" key={k}><span>{choices.find(c=>c.id===k)?.label??k}</span><Field number value={String(map[k])} label={`Percent for ${k}`} max={4} onSave={v=>{const n=pctOf(v);if(n!==null)set({...map,[k]:n});}}/><span className="muted">%</span><button type="button" className="icon-button" aria-label="Remove" onClick={()=>{const {[k]:_x,...r}=map;void _x;set(r);}}><X size={13}/></button></div>)}
   {free.length>0&&<select className="inv-input" aria-label={kind==='categoryPct'?'Add a category rate':'Add a character rate'} value="" onChange={e=>e.target.value&&set({...map,[e.target.value]:100})}><option value="">{kind==='categoryPct'?'+ A category':'+ A character'}</option>{free.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>}</>;
 };
 return <div className="store-page">
  <Pills type={store.type} shop={shop} lock={store.lock} owner={owner?.title} awaiting={store.awaiting}/>
  {store.awaiting&&<div className="store-pending"><div><span>{owner?.title??'A player'} set this up and it waits for your OK. Until then only they see it.</span><button type="button" className="button small primary" onClick={()=>{save(approveStore(store));update({overviewVisibility:'players'});}}><Check size={14}/> Let players see it</button></div></div>}
  {(store.pending??[]).length>0&&<section className="store-pending" aria-label="Waiting for your OK">{store.pending!.map(p=>{const it=p.action==='buy'?store.items.find(i=>i.id===p.itemId):undefined;return <div key={p.id}><span><strong>{p.who}</strong> {p.action==='buy'?'wants to buy':'wants to sell'} {p.qty} × {it?.name??(people.find(c=>c.id===p.charId)?.character?.inventory?.items.find(i=>i.id===p.itemId)?.name??'an item')}{it&&shop?` for ${money(buyPrice(store,it,p.charId,Date.now())*p.qty)}`:''}</span><button type="button" className="button small primary" onClick={()=>decide(p.id,true)}><Check size={14}/> Yes</button><button type="button" className="button small" onClick={()=>decide(p.id,false)}><X size={14}/> No</button></div>;})}</section>}
  <div className="store-table" role="table" aria-label={isShop?'Stock':'Contents'}>
   <div className="store-cols" role="row"><span>Item</span><span>{isShop?'In stock':'How many'}</span><span>Value</span><span>{isShop?'Players pay':''}</span><span/></div>
   {store.items.map(i=>{const isOpen=open===i.id;return <div key={i.id} role="row">
    <div className={`store-line${i.gm?' is-hidden':''}`}>
     <span className="store-name"><button type="button" className="icon-button" aria-expanded={isOpen} aria-label={`Details of ${i.name}`} onClick={()=>setOpen(isOpen?null:i.id)}>{isOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button><Field value={i.name} label="Item" onSave={v=>v&&setItem(i.id,{name:v})}/>{i.category&&<small className="store-cat">{i.category}</small>}{i.service&&<span className="inv-flag blue">Service</span>}{i.gm&&<span className="inv-flag">{isShop?'Under the counter':'GM only'}</span>}</span>
     <span className="store-stock">{i.qty===null?<span className="muted">no limit</span>:<Field number value={String(i.qty)} label={`How many ${i.name}`} max={7} onSave={v=>{const n=intOf(v,0,1_000_000);if(n!==null)setItem(i.id,{qty:n});}}/>}<button type="button" className={`icon-button store-inf${i.qty===null?' on':''}`} aria-pressed={i.qty===null} title={i.qty===null?'Never runs out':'Counted'} aria-label={i.qty===null?`Count ${i.name}`:`${i.name} never runs out`} onClick={()=>setItem(i.id,{qty:i.qty===null?1:null})}><Unlimited size={14}/></button></span>
     <Field className="num" value={i.price===undefined?'':money(i.price)} label={`Value of ${i.name}`} max={40} placeholder="—" onSave={v=>{const n=v?parseMoney(v,coins):undefined;if(n!==null)setItem(i.id,{price:n});}}/>
     <span className="store-pays">{isShop&&i.price!==undefined?money(listPrice(store,i)):''}</span>
     <span className="store-tools">
      <button type="button" className={`icon-button inv-eye${i.gm?' off':''}`} aria-pressed={!i.gm} aria-label={i.gm?`Show ${i.name} to players`:`Hide ${i.name} from players`} onClick={()=>setItem(i.id,{gm:i.gm?undefined:true})}>{i.gm?<EyeOff size={14}/>:<Eye size={14}/>}</button>
      {isShop&&<button type="button" className={`icon-button${i.service?' on':''}`} aria-pressed={!!i.service} title="A service: bought, never carried away" aria-label={`${i.name} is a service`} onClick={()=>setItem(i.id,{service:i.service?undefined:true})}><Wrench size={14}/></button>}
      <button type="button" className="icon-button" aria-label={`Remove ${i.name}`} onClick={()=>save({...store,items:store.items.filter(x=>x.id!==i.id)})}><Trash2 size={13}/></button>
     </span>
    </div>
    {isOpen&&<div className="inv-detail">
     <div className="inv-detail-text">
      <label className="field-label">Note<small> Players see it. Write [[2d6|Label]] for a roll.</small><Field area value={i.note??''} label={`Note on ${i.name}`} max={2000} onSave={v=>setItem(i.id,{note:v||undefined})}/></label>
      {i.note&&/\[\[/.test(i.note)&&<NoteText text={i.note} title={`${entry.title} · ${i.name}`}/>}
      <label className="field-label">GM note<small> Players never get this, and it goes with the item.</small><Field area className="inv-gm-note" value={i.gmNote??''} label={`GM note on ${i.name}`} max={2000} onSave={v=>setItem(i.id,{gmNote:v||undefined})}/></label>
     </div>
     <div className="inv-detail-fields">
      <label className="field-label">Category<select value={i.category??''} onChange={e=>setItem(i.id,{category:e.target.value||undefined})}><option value="">None</option>{[...new Set([...settings.categories,...(i.category?[i.category]:[])])].map(c=><option key={c}>{c}</option>)}</select></label>
      {settings.carry!=='none'&&<label className="field-label">Each weighs<span className="inv-with-unit"><Field number value={i.weight===undefined?'':String(i.weight)} label="Weight of one" max={10} onSave={v=>{const n=v?Number(v.replace(',','.')):undefined;if(n===undefined||(Number.isFinite(n)&&n>=0))setItem(i.id,{weight:n});}}/>{settings.carry}</span></label>}
      <label className="field-label">Uses<span className="inv-with-unit"><Field number value={i.uses?String(i.uses.max):''} label="Most uses" placeholder="None" max={4} onSave={v=>{const n=v?intOf(v,1,1000):null;setItem(i.id,{uses:n?{max:n,value:n}:undefined});}}/>at most</span></label>
      <div className="field-label inv-rolls-label">Rolls<RollsEditor rolls={i.rolls??[]} onSave={rolls=>setItem(i.id,{rolls:rolls.length?rolls:undefined})}/></div>
     </div>
    </div>}
   </div>;})}
   {!store.items.length&&<p className="muted inv-empty">{isShop?'Nothing in stock yet.':'Empty.'}</p>}
  </div>
  <form className="inv-add" onSubmit={e=>{e.preventDefault();add();}}>
   <input className="inv-input inv-add-name" aria-label="New item" maxLength={80} placeholder={isShop?'Add to the stock: lantern, a night’s lodging…':'Put in: a garnet, a letter, rusty keys…'} value={name} onChange={e=>setName(e.target.value)}/>
   <input className="inv-input" style={{width:110}} aria-label="Value" placeholder="Value" value={value} onChange={e=>setValue(e.target.value)}/>
   <button type="submit" className="button" disabled={!name.trim()}><Plus size={14}/> Add</button>
   {(settings.catalog??[]).length>0&&<button type="button" className="text-button" onClick={()=>setPicking(true)}><ListPlus size={14}/> From the item list</button>}
  </form>
  <div className="store-two" style={{maxWidth:520}}>
   <label className="field-label">{isShop?'Coin the shop has':'Coins in it'}<Field value={money(store.coins)} label="Coins" max={40} onSave={v=>{const n=parseMoney(v||'0',coins);if(n!==null)save({...store,coins:n});}}/></label>
   {isShop&&shop&&<label className="check-line" style={{alignSelf:'end'}}><input type="checkbox" checked={!!shop.bottomless} onChange={e=>save({...store,shop:{...shop,bottomless:e.target.checked||undefined}})}/> Never runs out of coin</label>}
  </div>
  <h3 className="section-heading" style={{margin:'8px 0 0'}}>Settings for this {storeTypeNames[store.type].toLowerCase()}</h3>
  <div className="store-settings">
   <section className="inv-box"><span className="eyebrow">Kind</span><select className="inv-input" aria-label="Kind" value={store.type} onChange={e=>void switchType(e.target.value as StoreType)}>{storeTypes.map(t=><option key={t} value={t}>{storeTypeNames[t]}</option>)}</select><small className="muted">{storeTypeHints[store.type]}</small>
    <label className="field-label">Run by<select value={store.ownerId??''} onChange={e=>save({...store,ownerId:e.target.value||undefined})}><option value="">The GM</option>{people.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select><small>{store.ownerId?'Their player manages the stock and takes the coin.':'Only you change the stock.'}</small></label>
    {owner&&<button type="button" className="text-button" onClick={()=>onOpen(owner.id)}>Open {owner.title}</button>}
   </section>
   {isShop&&shop&&<>
    <section className="inv-box"><span className="eyebrow">Open or closed</span>
     <div className="segmented"><button type="button" className={shop.open?'on':''} onClick={()=>save({...store,shop:{...shop,open:true}})}>Open</button><button type="button" className={!shop.open?'on':''} onClick={()=>save({...store,shop:{...shop,open:false}})}>Closed</button></div>
     <label className="field-label">Opening hours<Field value={shop.hours??''} label="Opening hours" max={120} placeholder="Dawn to dusk. Closed on holy days." onSave={v=>save({...store,shop:{...shop,hours:v||undefined}})}/></label>
    </section>
    <section className="inv-box"><span className="eyebrow">Prices</span>
     <div className="store-two"><label className="field-label">Players pay<span className="inv-with-unit"><Field number value={String(shop.sell)} label="Players pay, percent" max={4} onSave={v=>{const n=pctOf(v);if(n!==null)save({...store,shop:{...shop,sell:n}});}}/>%</span></label>
      <label className="field-label">Shop pays<span className="inv-with-unit"><Field number value={String(shop.buy)} label="Shop pays, percent" max={4} onSave={v=>{const n=pctOf(v);if(n!==null)save({...store,shop:{...shop,buy:n}});}}/>%</span></label></div>
     <small className="muted">Both are a share of what each item is worth. A category or a character can have its own % on top, such as dearer weapons or a friend’s discount.</small>
     {pctRows('categoryPct',settings.categories.map(c=>({id:c,label:c})))}
     {pctRows('characterPct',people.map(p=>({id:p.id,label:p.title})))}
    </section>
    <section className="inv-box"><span className="eyebrow">Buying from players</span>
     <label className="check-line"><input type="checkbox" checked={shop.buys} onChange={e=>save({...store,shop:{...shop,buys:e.target.checked}})}/> Buys from players</label>
     {shop.buys&&settings.categories.length>0&&<><small className="muted">What it buys (none picked: anything)</small><div className="inv-chips">{settings.categories.map(c=>{const on=!!shop.buyCategories?.includes(c);return <button type="button" key={c} className={on?'on':''} aria-pressed={on} onClick={()=>{const l=on?(shop.buyCategories??[]).filter(x=>x!==c):[...(shop.buyCategories??[]),c];save({...store,shop:{...shop,buyCategories:l.length?l:undefined}});}}>{c}</button>;})}</div></>}
     <label className="check-line"><input type="checkbox" checked={!!shop.hideSoldOut} onChange={e=>save({...store,shop:{...shop,hideSoldOut:e.target.checked||undefined}})}/> Hide sold-out lines from players</label>
    </section>
    <section className="inv-box"><span className="eyebrow">Haggling</span>
     <label className="check-line"><input type="checkbox" checked={!!shop.haggle} onChange={e=>save({...store,shop:{...shop,haggle:e.target.checked?{roll:'1d20',target:15,pct:10}:undefined}})}/> Players can haggle once every few hours</label>
     {shop.haggle&&<><label className="field-label">Roll<small> A roll on their sheet or a stat by name (Persuasion), or dice.</small><Field value={shop.haggle.roll} label="Haggle roll" max={100} onSave={v=>v&&save({...store,shop:{...shop,haggle:{...shop.haggle!,roll:v}}})}/></label>
      <div className="store-two"><label className="field-label">Needs at least<Field number value={String(shop.haggle.target)} label="Needs at least" max={6} onSave={v=>{const n=intOf(v);if(n!==null)save({...store,shop:{...shop,haggle:{...shop.haggle!,target:n}}});}}/></label>
       <label className="field-label">Then<span className="inv-with-unit"><Field number value={String(shop.haggle.pct)} label="Percent off" max={2} onSave={v=>{const n=intOf(v,1,90);if(n!==null)save({...store,shop:{...shop,haggle:{...shop.haggle!,pct:n}}});}}/>% off</span></label></div></>}
    </section>
    <section className="inv-box"><span className="eyebrow">Sales</span>
     <div className="segmented"><button type="button" className={!shop.approve?'on':''} onClick={()=>save({...store,shop:{...shop,approve:undefined}})}>Go through at once</button><button type="button" className={shop.approve?'on':''} onClick={()=>save({...store,shop:{...shop,approve:true}})}>Wait for my OK</button></div>
    </section>
   </>}
   {store.type==='container'&&<section className="inv-box"><span className="eyebrow">Lock</span>
    <div className="segmented">{(['open','closed','locked'] as const).map(s=><button type="button" key={s} className={(store.lock?.state??'open')===s?'on':''} onClick={()=>save({...store,lock:{...(store.lock??{}),state:s}})}>{s==='open'?'Open':s==='closed'?'Closed':'Locked'}</button>)}</div>
    {store.lock?.state==='locked'&&<><label className="field-label">Opened by a key called<Field value={store.lock.key??''} label="Key" max={80} placeholder="Iron key" onSave={v=>save({...store,lock:{...store.lock!,key:v||undefined}})}/></label>
     <div className="store-two"><label className="field-label">Or a roll<Field value={store.lock.roll??''} label="Lock roll" max={100} placeholder="Thievery" onSave={v=>save({...store,lock:{...store.lock!,roll:v||undefined}})}/></label>
      <label className="field-label">Needs at least<Field number value={store.lock.target===undefined?'':String(store.lock.target)} label="Lock target" max={6} onSave={v=>{const n=v?intOf(v):undefined;if(n!==null)save({...store,lock:{...store.lock!,target:n}});}}/></label></div></>}
    <small className="muted">Closed: anyone can open it. Locked: a key the character carries, a roll, or you open it.</small>
   </section>}
   {!isShop&&<section className="inv-box"><span className="eyebrow">What players may do</span>
    {([['take','Take things out'],['put','Put things in'],['takeAll','Take everything at once'],['split','Split the coins between the party']] as const).map(([k,l])=><label key={k} className="check-line"><input type="checkbox" checked={share[k]} onChange={e=>save({...store,share:{...share,[k]:e.target.checked}})}/> {l}</label>)}
   </section>}
   <section className="inv-box"><span className="eyebrow">Who can use it</span>
    <div className="segmented"><button type="button" className={!store.who?'on':''} onClick={()=>save({...store,who:undefined})}>The whole party</button><button type="button" className={store.who?'on':''} onClick={()=>save({...store,who:store.who??[]})}>Picked characters</button></div>
    {store.who&&<div className="inv-chips">{people.filter(p=>p.character?.role==='pc'||store.who!.includes(p.id)).map(p=>{const on=store.who!.includes(p.id);return <button type="button" key={p.id} className={on?'on':''} aria-pressed={on} onClick={()=>save({...store,who:on?store.who!.filter(x=>x!==p.id):[...store.who!,p.id]})}>{p.title}</button>;})}</div>}
    <small className="muted">Players also need the Stock tab shared (the eye on the tab above).</small>
   </section>
  </div>
  <Log log={store.log??[]}/>
  {(store.log??[]).length>0&&<button type="button" className="text-button" style={{alignSelf:'flex-start'}} onClick={()=>save({...store,log:undefined})}>Clear the log</button>}
  {picking&&<CatalogPick items={settings.catalog??[]} coins={coins} onClose={()=>setPicking(false)} onPick={i=>{const {id:_i,qty:_q,equipped:_e,...rest}=i;void _i;void _q;void _e;save({...store,items:[...store.items,{...rest,id:newId(),qty:1}]});setPicking(false);}}/>}
 </div>;
}

// ---- Players -----------------------------------------------------------------------------------

type Mine={id:string;title:string;inventory?:PlayerInventory};
type PlayerProps={entryId:string;title:string;store:PlayerStore;settings:PlayerItemSettings;memberRef?:string;mine:Mine[];ownerName?:string;onChanged:()=>void};

/** A store on the player pages: buy, sell, take, put in, open it, haggle, and run it when it is the member's own. */
export function PlayerStoreView({entryId,title,store,settings,memberRef,mine,ownerName,onChanged}:PlayerProps){
 const coins=settings.coins,money=(n:number)=>formatMoney(n,coins);
 const usable=mine.filter(c=>store.owner?c.id===store.ownerId:!store.who||store.who.includes(c.id));
 const [as,setAs]=useState(usable[0]?.id??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[said,setSaid]=useState('');
 const [counts,setCounts]=useState<Record<string,string>>({}),[putId,setPutId]=useState(''),[putQty,setPutQty]=useState('1'),[putPrice,setPutPrice]=useState(''),[coinAmt,setCoinAmt]=useState('');
 const me=usable.find(c=>c.id===as)??usable[0],inv=me?.inventory,rate=me?store.rate[me.id]:undefined;
 const count=(id:string,max:number)=>{const n=Math.round(Number(counts[id]??'1'));return Number.isFinite(n)&&n>=1?Math.min(n,Math.max(1,max)):1;};
 async function send(change:Record<string,unknown>,again?:()=>void){
  if(!memberRef||!me)return;
  setBusy(true);setError('');setSaid('');
  try{
   const res=await fetch('/api/encyclopedia/player-tracker?items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:memberRef,kind:'store',change:{storeId:entryId,as:me.id,...change}})});
   const j=await res.json().catch(()=>({}));
   if(!res.ok){setError(j.error||'That didn’t work. Try again.');return;}
   setSaid(j.said??'');
   if(j.roll)showServerRoll({title:j.roll.title,formula:j.roll.formula,total:j.roll.total,detail:j.roll.detail,note:`${j.roll.ok?'Made it':'Not enough'}: needed ${j.roll.target}.`,again:again??(()=>{})});
   onChanged();
  }catch{setError('Could not reach the server. Try again.');}
  finally{setBusy(false);}
 }
 if(!memberRef)return <div className="store-page"><Pills type={store.type} shop={store.shop} lock={store.lock} owner={ownerName}/><p className="aside-hint">Sign in as a member of this campaign to use it.</p>{store.items.length>0&&<StockList store={store} money={money}/>}</div>;
 if(!me)return <div className="store-page"><Pills type={store.type} shop={store.shop} lock={store.lock} owner={ownerName}/><p className="aside-hint">You need a character here to use it. Ask your GM to let you edit your character’s page.</p></div>;
 const sellable=(inv?.items??[]).filter(i=>store.shop?.buys&&(!store.shop.buyCategories?.length||store.shop.buyCategories.some(c=>c.toLowerCase()===(i.category??'').toLowerCase())));
 const sellPrice=(i:{price?:number;category?:string})=>Math.max(0,Math.round((i.price??0)*(store.shop?.buy??50)/100*((i.category?store.shop?.categoryPct?.[i.category]:undefined)??100)/100*(rate?.sell??1)));
 const isShop=store.type==='shop',share=store.share;
 return <div className="store-page" aria-busy={busy}>
  <Pills type={store.type} shop={store.shop} lock={store.lock} owner={store.owner?'you':ownerName} awaiting={store.awaiting}/>
  {usable.length>1&&<label className="store-as">As<select value={me.id} onChange={e=>setAs(e.target.value)}>{usable.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
  {inv&&<p className="aside-hint">{me.title} has {money(inv.coins)}.</p>}
  {store.shut?<div className="store-shut">{store.lock?.state==='locked'?<Lock size={30}/>:<DoorOpen size={30}/>}<strong>{store.lock?.state==='locked'?'It’s locked.':'It’s closed.'}</strong>
   <div className="button-row">{store.lock?.state==='closed'&&<button type="button" className="button primary" disabled={busy} onClick={()=>void send({action:'open'})}><DoorOpen size={14}/> Open it</button>}
    {store.lock?.key&&<button type="button" className="button" disabled={busy} onClick={()=>void send({action:'key'})}><KeyRound size={14}/> Use a key</button>}
    {store.lock?.roll&&<button type="button" className="button" disabled={busy} onClick={()=>void send({action:'pick'})}><Sparkles size={14}/> Try {store.lock.roll}</button>}</div>
   {store.lock?.state==='locked'&&!store.lock.key&&!store.lock.roll&&<small className="muted">Only the GM can open this one.</small>}
  </div>:<>
   {isShop&&store.shop&&!store.owner&&<div className="button-row">{store.shop.haggle&&<button type="button" className="button small" disabled={busy||!!rate?.at} onClick={()=>void send({action:'haggle'})} title={rate?.at?'Already haggled here':undefined}><Scale size={14}/> Haggle ({store.shop.haggle.roll})</button>}{rate?.haggled!==undefined&&<span className="store-pill open">{rate.haggled?`${rate.haggled}% off for a while`:'No deal this time'}</span>}{store.shop.approve&&<span className="muted">Each sale waits for the GM’s OK.</span>}</div>}
   <div className="store-table">
    {store.items.map(i=>{const unit=isShop?Math.max(0,Math.round((i.price??0)*(rate?.buy??1))):0,max=i.qty??99;return <div key={i.id} className="store-player-line">
     <span className="store-pname"><strong>{i.name}{i.service&&<> <span className="inv-flag blue">Service</span></>}</strong>{i.note&&<NoteText text={i.note} title={`${title} · ${i.name}`}/>}<small>{i.qty===null?(isShop?'Plenty':''):i.qty===0?'Sold out':`${i.qty} ${isShop?'in stock':'here'}`}</small></span>
     {isShop&&<span className="inv-price">{money(unit)}</span>}
     {!store.owner&&<span className="store-buy">
      {max>1&&<input className="inv-input" type="number" min={1} max={max} aria-label={`How many ${i.name}`} value={counts[i.id]??'1'} onChange={e=>setCounts(c=>({...c,[i.id]:e.target.value}))}/>}
      {isShop?<button type="button" className="button small primary" disabled={busy||i.qty===0||!store.shop?.open} onClick={()=>void send({action:'buy',itemId:i.id,qty:count(i.id,max)})}>Buy{count(i.id,max)>1?` · ${money(unit*count(i.id,max))}`:''}</button>
       :share?.take&&<button type="button" className="button small" disabled={busy} onClick={()=>void send({action:'take',itemId:i.id,qty:count(i.id,max)})}>Take</button>}
     </span>}
     {store.owner&&<span className="store-buy">
      {isShop&&<input className="inv-input" style={{width:90}} aria-label={`Price of ${i.name}`} defaultValue={i.price!==undefined?money(i.price):''} key={i.price} onBlur={e=>{const n=parseMoney(e.target.value,coins);if(n!==null&&n!==i.price)void send({action:'price',itemId:i.id,price:n});}}/>}
      <button type="button" className="button small" disabled={busy||i.qty===0} onClick={()=>void send({action:'take',itemId:i.id,qty:i.qty??1})}>Take back</button>
     </span>}
    </div>;})}
    {!store.items.length&&<p className="muted inv-empty">{isShop?'Nothing for sale right now.':'Empty.'}</p>}
   </div>
   {!isShop&&!store.owner&&<div className="button-row">
    {share?.takeAll&&store.items.length+(store.coins??0)>0&&<button type="button" className="button" disabled={busy} onClick={()=>void send({action:'take-all'})}>Take everything</button>}
    {share?.split&&(store.coins??0)>0&&<button type="button" className="button" disabled={busy} onClick={()=>void send({action:'split'})}><Coins size={14}/> Split the coins</button>}
   </div>}
   {store.coins!==null&&(store.coins>0||store.owner||share?.put)&&<section className="inv-box"><span className="eyebrow">Coins {isShop?'TAKEN':'IN IT'}</span><strong>{money(store.coins)}</strong>
    <div className="inv-money-form">
     {isShop&&store.owner?<button type="button" className="button small" disabled={busy||!store.coins} onClick={()=>void send({action:'collect'})}><Coins size={14}/> Collect</button>:<>
      <input className="inv-input" aria-label="Amount" placeholder={`Amount: 5 ${coins[0]?.abbr??''}`} value={coinAmt} onChange={e=>setCoinAmt(e.target.value)}/>
      {(share?.take||store.owner)&&<button type="button" className="button small" disabled={busy} onClick={()=>{const n=parseMoney(coinAmt,coins);if(n)void send({action:'take-coins',amount:n});}}>Take</button>}
      {(share?.put||store.owner)&&<button type="button" className="button small" disabled={busy} onClick={()=>{const n=parseMoney(coinAmt,coins);if(n)void send({action:'put-coins',amount:n});}}>Put in</button>}</>}
    </div></section>}
   {((isShop&&!store.owner&&store.shop?.buys&&sellable.length>0)||(!isShop&&(share?.put||store.owner))||(isShop&&store.owner))&&inv&&<section className="inv-box store-sell"><span className="eyebrow">{isShop?(store.owner?'Put out for sale':'Sell'):'Put in'}</span>
    <div className="inv-add">
     <select className="inv-input" aria-label="Item" value={putId} onChange={e=>setPutId(e.target.value)}><option value="">Choose from {me.title}’s things</option>{(isShop&&!store.owner?sellable:inv.items).map(i=><option key={i.id} value={i.id}>{i.name} ({i.qty}){isShop&&!store.owner?` · ${money(sellPrice(i))} each`:''}</option>)}</select>
     <input className="inv-input inv-add-qty" type="number" min={1} aria-label="How many" value={putQty} onChange={e=>setPutQty(e.target.value)}/>
     {isShop&&store.owner&&<input className="inv-input" style={{width:110}} aria-label="Price" placeholder="Price" value={putPrice} onChange={e=>setPutPrice(e.target.value)}/>}
     <button type="button" className="button" disabled={busy||!putId} onClick={()=>{const q=Math.max(1,Math.round(Number(putQty)||1));if(isShop&&store.owner){const p=parseMoney(putPrice||'0',coins);if(p===null){setError('Write a price such as 5 '+(coins.at(-1)?.abbr??''));return;}void send({action:'stock',itemId:putId,qty:q,price:p});}else void send({action:isShop?'sell':'put',itemId:putId,qty:q});setPutId('');setPutQty('1');setPutPrice('');}}>{isShop?(store.owner?'Put out':'Sell'):'Put in'}</button>
    </div>
   </section>}
   {isShop&&store.owner&&store.shop&&<div className="button-row"><button type="button" className="button small" disabled={busy} onClick={()=>void send({action:'status',open:!store.shop!.open})}>{store.shop.open?'Close up':'Open for business'}</button></div>}
  </>}
  {store.pending.length>0&&<section className="store-pending" aria-label="Waiting for the GM">{store.pending.map(p=><div key={p.id}><span>{p.who}: {p.action==='buy'?'buy':'sell'} {p.qty} × {store.items.find(i=>i.id===p.itemId)?.name??inv?.items.find(i=>i.id===p.itemId)?.name??'an item'}, waiting for the GM.</span><button type="button" className="button small" disabled={busy} onClick={()=>void send({action:'cancel',pendingId:p.id})}><X size={14}/> Call it off</button></div>)}</section>}
  {said&&<p role="status" className="info-note">{said}</p>}
  {error&&<p role="alert" className="form-error">{error}</p>}
  <Log log={store.log}/>
 </div>;
}

function StockList({store,money}:{store:PlayerStore;money:(n:number)=>string}){
 return <div className="store-table">{store.items.map(i=><div key={i.id} className="store-player-line"><span className="store-pname"><strong>{i.name}</strong></span>{store.type==='shop'&&<span className="inv-price">{money(i.price??0)}</span>}</div>)}</div>;
}

/** A store a player sets up from their character. */
export function NewPlayerStore({memberRef,mine,settings,onDone,onClose}:{memberRef:string;mine:Mine[];settings:PlayerItemSettings;onDone:(id:string)=>void;onClose:()=>void}){
 const types=([['shop',settings.players.shops],['container',settings.players.containers],['stash',settings.players.containers]] as const).filter(([,m])=>m!=='no');
 const [as,setAs]=useState(mine[0]?.id??''),[type,setType]=useState<'shop'|'container'|'stash'>(types[0]?.[0]??'container'),[title,setTitle]=useState(''),[shared,setShared]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const ask=(type==='shop'?settings.players.shops:settings.players.containers)==='ask';
 return <ToolDialog title="Set up a stall or container" onClose={onClose}>
  <form className="inv-give" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');
   try{const res=await fetch('/api/encyclopedia/player-tracker?items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:memberRef,kind:'create',as,type,title,shared:type==='shop'||shared})});const j=await res.json().catch(()=>({}));if(!res.ok)setError(j.error||'That didn’t work.');else onDone(j.id);}catch{setError('Could not reach the server. Try again.');}finally{setBusy(false);}}}>
   {mine.length>1&&<label className="field-label">Whose<select value={as} onChange={e=>setAs(e.target.value)}>{mine.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
   <label className="field-label">Kind<select value={type} onChange={e=>setType(e.target.value as typeof type)}>{types.map(([t])=><option key={t} value={t}>{t==='shop'?'A stall to sell from':storeTypeNames[t]}</option>)}</select></label>
   <label className="field-label">Name<input autoFocus required maxLength={160} placeholder={type==='shop'?'Maren’s market stall':'Camp chest'} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   {type!=='shop'&&<label className="check-line"><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/> The other players can see and use it</label>}
   {ask&&<p className="aside-hint">Your GM says yes before the others see it.</p>}
   {error&&<p role="alert" className="form-error">{error}</p>}
   <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={busy||!title.trim()||!as}>Set it up</button></div>
  </form>
 </ToolDialog>;
}
