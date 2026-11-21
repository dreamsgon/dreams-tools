"use client";
/*
 * A character's Inventory tab (lib/encyclopedia/items.ts): money in the campaign's coins, what they carry against how
 * much they can, and items grouped by category with quantity, weight, value, uses, rolls and notes. The GM sees an
 * eye and a GM note on each line; the same view runs on the player pages for the character's own player, where every
 * change goes to the server (POST /api/encyclopedia/player-tracker?items) and the campaign's settings say what they may change.
 */
import {useMemo,useState,type ReactNode} from 'react';
import {ChevronDown,ChevronRight,Eye,EyeOff,Gift,ListPlus,Minus,Plus,Search,Shield,ShieldCheck,Trash2,Save} from 'lucide-react';
import {carried,formatMoney,moneyParts,parseMoney,validRoll,worth,MAX_ROLLS,type InventoryAction,type Item,type ItemRoll,type PlayerItemSettings} from '@/lib/encyclopedia/items';
import {RollChip} from './rolls';
import {ToolDialog} from './tool-dialog';
import {confirmDialog} from '../confirm-dialog';
import {GroupHead,useCollapsed} from './group-collapse';
import './inventory.css';

export type Act=(a:InventoryAction)=>Promise<boolean>|boolean;
const fmt=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:2});
const unitOf=(s:PlayerItemSettings)=>s.carry==='none'?'':s.carry;
const num=(v:string)=>{const n=Number(v.replace(',','.'));return v.trim()!==''&&Number.isFinite(n)&&n>=0?n:null;};

/** A box that saves when it loses focus or on Enter, so typing doesn't save every letter. */
export function Field({value,label,className,placeholder,max=80,number,area,onSave}:{value:string;label:string;className?:string;placeholder?:string;max?:number;number?:boolean;area?:boolean;onSave:(v:string)=>void}){
 const done=(v:string)=>{const t=v.trim();if(t!==value)onSave(t);};
 return area?<textarea key={value} className={`inv-input ${className??''}`} aria-label={label} defaultValue={value} maxLength={max} placeholder={placeholder} rows={3} onBlur={e=>done(e.target.value)}/>
  :<input key={value} className={`inv-input ${className??''}`} aria-label={label} defaultValue={value} maxLength={max} placeholder={placeholder} inputMode={number?'decimal':undefined} onBlur={e=>done(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>;
}

/** Text with [[2d6+1|Label]] rolls in it, the rolls as chips. */
export function NoteText({text,title}:{text:string;title:string}){
 const out:ReactNode[]=[];let at=0;
 for(const m of text.matchAll(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g)){
  const f=m[1].trim();if(!validRoll(f))continue;
  out.push(text.slice(at,m.index));out.push(<RollChip key={m.index} title={title} formula={f.replace(/\s+/g,'')} label={(m[2]??'').trim()||null}/>);at=m.index!+m[0].length;
 }
 out.push(text.slice(at));
 return <p className="inv-note-text">{out}</p>;
}

/** The rolls on an item or spell: a name and dice each, checked as they are typed. */
export function RollsEditor({rolls,onSave}:{rolls:ItemRoll[];onSave:(r:ItemRoll[])=>void}){
 const [name,setName]=useState(''),[formula,setFormula]=useState('');
 const ok=!!name.trim()&&validRoll(formula);
 return <div className="inv-rolls-edit">
  {rolls.map((r,i)=><div className="inv-roll-line" key={i}>
   <Field value={r.name} label="Roll name" max={40} onSave={v=>v&&onSave(rolls.map((x,j)=>j===i?{...x,name:v}:x))}/>
   <Field value={r.formula} label={`Dice for ${r.name}`} className="inv-dice" max={100} onSave={v=>validRoll(v)&&onSave(rolls.map((x,j)=>j===i?{...x,formula:v.replace(/\s+/g,'')}:x))}/>
   <button type="button" className="icon-button" aria-label={`Remove the roll ${r.name}`} onClick={()=>onSave(rolls.filter((_,j)=>j!==i))}><Trash2 size={13}/></button>
  </div>)}
  {rolls.length<MAX_ROLLS&&<form className="inv-roll-line" onSubmit={e=>{e.preventDefault();if(!ok)return;onSave([...rolls,{name:name.trim(),formula:formula.replace(/\s+/g,'')}]);setName('');setFormula('');}}>
   <input className="inv-input" aria-label="New roll name" placeholder="Roll: Attack, Damage…" maxLength={40} value={name} onChange={e=>setName(e.target.value)}/>
   <input className={`inv-input inv-dice${formula&&!validRoll(formula)?' bad':''}`} aria-label="New roll dice" placeholder="1d20+5" maxLength={100} value={formula} onChange={e=>setFormula(e.target.value)}/>
   <button type="submit" className="icon-button" aria-label="Add the roll" disabled={!ok}><Plus size={14}/></button>
  </form>}
 </div>;
}

/** Pips for a few uses, a number for many; clicking a pip sets how many are left. */
function Uses({uses,name,onSet}:{uses:{value:number;max:number};name:string;onSet?:(v:number)=>void}){
 if(uses.max>10)return <span className="inv-uses-num" title="Uses left">{uses.value}/{uses.max}</span>;
 return <span className="inv-uses" role="group" aria-label={`${name}: ${uses.value} of ${uses.max} uses left`}>{Array.from({length:uses.max},(_,i)=>onSet?<button type="button" key={i} className={i<uses.value?'on':''} aria-label={`${i+1} left`} onClick={()=>onSet(i+1===uses.value?i:i+1)}/>:<i key={i} className={i<uses.value?'on':''}/>)}</span>;
}

function Money({coins,settings,canEdit,act}:{coins:number;settings:PlayerItemSettings;canEdit:boolean;act:Act}){
 const [amount,setAmount]=useState(''),[bad,setBad]=useState(false);
 const go=async(sign:1|-1)=>{const n=parseMoney(amount,settings.coins);if(n===null||n<=0){setBad(true);return;}setBad(false);if(await act({action:'coins',delta:sign*n}))setAmount('');};
 const parts=moneyParts(coins,settings.coins);
 return <section className="inv-box">
  <span className="eyebrow">Money</span>
  <div className="inv-coins">{parts.map((c,i)=><span key={c.abbr} className={`inv-coin c${i}`}><i aria-hidden="true"/><strong>{c.n.toLocaleString()}</strong> <small>{c.abbr}</small></span>)}</div>
  {canEdit&&<form className="inv-money-form" onSubmit={e=>{e.preventDefault();void go(1);}}>
   <input className={`inv-input${bad?' bad':''}`} aria-label="Amount" aria-invalid={bad} placeholder={`Amount: 5 ${settings.coins[0]?.abbr??''}`} value={amount} onChange={e=>{setAmount(e.target.value);setBad(false);}}/>
   <button type="submit" className="button small"><Plus size={14}/> Add</button>
   <button type="button" className="button small" onClick={()=>void go(-1)}><Minus size={14}/> Spend</button>
  </form>}
  {bad&&<p className="form-error">Write an amount such as {settings.coins.map((c,i)=>`${i+2} ${c.abbr}`).join(' ')}.</p>}
 </section>;
}

function Carrying({used,capacity,unit,gm,act,name}:{used:number;capacity?:number;unit:string;gm:boolean;act:Act;name:string}){
 const over=capacity!==undefined&&used>capacity,share=capacity?Math.min(1,used/capacity):0;
 return <section className={`inv-box inv-carry${over?' over':''}`}>
  <span className="eyebrow">Carrying</span>
  <div className="inv-carry-top"><span>{capacity===undefined?'No limit set':over?'Over the limit':'Within the limit'}</span><span className="inv-carry-num"><strong>{fmt(used)}</strong>{capacity!==undefined&&<small> / {fmt(capacity)}</small>} {unit}</span></div>
  {capacity!==undefined&&<div className="inv-bar" role="img" aria-label={`${fmt(used)} of ${fmt(capacity)} ${unit}`}><i style={{width:`${Math.round(share*100)}%`}}/></div>}
  {gm&&<label className="inv-capacity">{name} can carry <Field value={capacity===undefined?'':String(capacity)} label="Can carry" number max={10} placeholder="No limit" onSave={v=>{const n=v?num(v):null;if(v&&n===null)return;void act({action:'capacity',value:n});}}/> {unit}</label>}
 </section>;
}

type Target={id:string;title:string};
/** Moves an item (or some of a stack) or coins to another character. */
function GiveDialog({item,coins,settings,targets,onGive,onClose}:{item?:Item;coins:number;settings:PlayerItemSettings;targets:Target[];onGive:(to:string,qty:number,coins:number)=>Promise<boolean>|boolean;onClose:()=>void}){
 const [to,setTo]=useState(targets[0]?.id??''),[qty,setQty]=useState(String(item?.qty??1)),[money,setMoney]=useState('');
 const q=Number(qty),m=money?parseMoney(money,settings.coins):0,okQty=!item||(Number.isInteger(q)&&q>=1&&q<=item.qty),okMoney=m!==null&&m<=coins&&(item||m>0);
 return <ToolDialog title={item?`Give ${item.name}`:'Give money'} onClose={onClose}>
  <form className="inv-give" onSubmit={async e=>{e.preventDefault();if(to&&okQty&&okMoney&&await onGive(to,item?q:0,m??0))onClose();}}>
   <label className="field-label">To<select value={to} onChange={e=>setTo(e.target.value)}>{targets.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
   {item&&item.qty>1&&<label className="field-label">How many<input type="number" min={1} max={item.qty} value={qty} onChange={e=>setQty(e.target.value)}/></label>}
   {!item&&<label className="field-label">How much<input placeholder={formatMoney(Math.min(coins,10*(settings.coins.at(0)?.rate??1)),settings.coins)} value={money} onChange={e=>setMoney(e.target.value)}/></label>}
   {!targets.length&&<p className="muted">There is no one here to give it to.</p>}
   <div className="button-row"><button type="button" className="button" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={!to||!okQty||!okMoney}><Gift size={14}/> Give</button></div>
  </form>
 </ToolDialog>;
}

/** The campaign's item list, to add from. */
function CatalogDialog({items,settings,onPick,onClose}:{items:Item[];settings:PlayerItemSettings;onPick:(i:Item)=>void;onClose:()=>void}){
 const [q,setQ]=useState('');
 const shown=items.filter(i=>i.name.toLowerCase().includes(q.trim().toLowerCase()));
 return <ToolDialog title="Add from the item list" onClose={onClose}>
  <input className="inv-input inv-search-input" autoFocus placeholder="Find an item" value={q} onChange={e=>setQ(e.target.value)}/>
  <div className="inv-catalog">{shown.map(i=><button type="button" key={i.id} onClick={()=>onPick(i)}><strong>{i.name}</strong><small>{[i.category,i.price!==undefined?formatMoney(i.price,settings.coins):'',i.weight?`${fmt(i.weight)} ${unitOf(settings)}`:''].filter(Boolean).join(' · ')}</small><Plus size={14}/></button>)}
   {!items.length&&<p className="muted">The item list is empty. Open an item on any character and choose Save to the item list.</p>}
   {items.length>0&&!shown.length&&<p className="muted">Nothing by that name.</p>}</div>
 </ToolDialog>;
}

export type InventoryProps={
 name:string;items:Item[];coins:number;capacity?:number;settings:PlayerItemSettings;
 /** The GM: eyes, GM notes, capacity. */
 gm:boolean;
 /** May change anything at all here (the GM, or the character's own player). */
 canEdit:boolean;act:Act;
 give?:{targets:Target[];onGive:(itemId:string|null,to:string,qty:number,coins:number)=>Promise<boolean>|boolean};
 catalog?:{items:Item[];save:(i:Item)=>void};
 extra?:ReactNode;
};
export function InventoryPanel({name,items,coins,capacity,settings,gm,canEdit,act,give,catalog,extra}:InventoryProps){
 const p=settings.players,canItems=canEdit&&(gm||p.items),canCoins=canEdit&&(gm||p.coins),values=gm||p.values,show=settings.show,unit=unitOf(settings);
 const [q,setQ]=useState(''),[cat,setCat]=useState<string|null>(null),[open,setOpen]=useState<string|null>(null),collapse=useCollapsed('inventory');
 const [newName,setNewName]=useState(''),[newQty,setNewQty]=useState('1'),[newCat,setNewCat]=useState(settings.categories[0]??''),[giving,setGiving]=useState<Item|'coins'|null>(null),[picking,setPicking]=useState(false);
 const groups=useMemo(()=>{
  const want=q.trim().toLowerCase(),shown=items.filter(i=>(!cat||(i.category??'')===cat)&&(!want||i.name.toLowerCase().includes(want)||(i.note??'').toLowerCase().includes(want)));
  const names=[...settings.categories,...new Set(shown.map(i=>i.category??'').filter(c=>c&&!settings.categories.includes(c)))];
  return [...names.map(c=>({name:c,items:shown.filter(i=>i.category===c)})),{name:'',items:shown.filter(i=>!i.category||!names.includes(i.category))}].filter(g=>g.items.length);
 },[items,q,cat,settings.categories]);
 const edit=(i:Item,item:Partial<Omit<Item,'id'|'uses'>>&{uses?:{value:number;max:number}|null})=>act({action:'edit',itemId:i.id,item});
 const add=async()=>{const n=newName.trim(),qty=Number(newQty);if(!n||!Number.isInteger(qty)||qty<0)return;if(await act({action:'add',item:{name:n,qty,...(newCat?{category:newCat}:{})}})){setNewName('');setNewQty('1');}};
 const total=carried(items),value=worth(items);
 const usedCats=[...new Set(items.map(i=>i.category).filter((c):c is string=>!!c))];
 return <div className="inventory">
  <div className={`inv-top${settings.carry==='none'?' one':''}`}>
   <Money coins={coins} settings={settings} canEdit={canCoins} act={act}/>
   {settings.carry!=='none'&&<Carrying used={total} capacity={capacity} unit={unit} gm={gm} act={act} name={name}/>}
  </div>
  {values&&show.value&&value>0&&<p className="aside-hint inv-worth">Everything carried is worth {formatMoney(value,settings.coins)}.{give&&canCoins&&coins>0&&<> <button type="button" className="text-button" onClick={()=>setGiving('coins')}><Gift size={13}/> Give money</button></>}</p>}
  {!(values&&show.value&&value>0)&&give&&canCoins&&coins>0&&<p className="aside-hint inv-worth"><button type="button" className="text-button" onClick={()=>setGiving('coins')}><Gift size={13}/> Give money</button></p>}
  {items.length>0&&<div className="inv-filters">
   <label className="inv-search"><Search size={14} aria-hidden="true"/><input aria-label="Find an item" placeholder="Find an item" value={q} onChange={e=>setQ(e.target.value)}/></label>
   {usedCats.length>1&&<div className="inv-chips" role="group" aria-label="Category">{[null,...settings.categories.filter(c=>usedCats.includes(c)),...usedCats.filter(c=>!settings.categories.includes(c))].map(c=><button type="button" key={c??'all'} className={cat===c?'on':''} aria-pressed={cat===c} onClick={()=>setCat(c)}>{c??'All'}</button>)}</div>}
  </div>}
  {groups.map(g=><section key={g.name||'other'} className="inv-group">
   <GroupHead title={g.name||(groups.length>1?'Other':'Items')} count={`${g.items.length} line${g.items.length===1?'':'s'}`} closed={collapse.isClosed(g.name)} onToggle={()=>collapse.toggle(g.name)} extra={show.weight&&unit&&<small>{fmt(carried(g.items))} {unit}</small>}/>
   {!collapse.isClosed(g.name)&&<div className="inv-rows" role="list">{g.items.map(i=>{const isOpen=open===i.id,title=`${name} · ${i.name}`;return <div role="listitem" key={i.id} className={`inv-row${i.gm?' is-hidden':''}${isOpen?' open':''}`}>
    <div className="inv-line">
     {show.equipped&&<button type="button" className={`icon-button inv-equip${i.equipped?' on':''}`} disabled={!canItems} aria-pressed={!!i.equipped} aria-label={i.equipped?`${i.name}: in use. Put away`:`${i.name}: put to use`} title={i.equipped?'Worn or in hand':'Carried'} onClick={()=>void edit(i,{equipped:!i.equipped})}>{i.equipped?<ShieldCheck size={15}/>:<Shield size={15}/>}</button>}
     <span className="inv-qty">{canItems&&<button type="button" aria-label={`One less ${i.name}`} disabled={i.qty<=0} onClick={()=>void edit(i,{qty:i.qty-1})}><Minus size={12}/></button>}<strong>{i.qty}</strong>{canItems&&<button type="button" aria-label={`One more ${i.name}`} onClick={()=>void edit(i,{qty:i.qty+1})}><Plus size={12}/></button>}</span>
     <button type="button" className="inv-name" aria-expanded={isOpen} onClick={()=>setOpen(isOpen?null:i.id)}>{isOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<span>{i.name}</span></button>
     {gm&&i.gmNote&&<span className="inv-flag">GM note</span>}{i.gm&&<span className="inv-flag"><EyeOff size={11}/> GM only</span>}
     {show.uses&&i.uses&&<Uses uses={i.uses} name={i.name} onSet={canItems?v=>void edit(i,{uses:{...i.uses!,value:v}}):undefined}/>}
     <span className="inv-roll-chips">{(i.rolls??[]).map(r=><RollChip key={r.name} title={title} formula={r.formula} label={r.name}/>)}</span>
     <span className="inv-figures">
     {show.weight&&unit&&<span className="inv-weight">{i.weight?`${fmt(i.weight*i.qty)} ${unit}`:''}</span>}
     {values&&show.value&&<span className="inv-price">{i.price!==undefined?<>{formatMoney(i.price,settings.coins)}{i.qty>1&&<small> each</small>}</>:''}</span>}
     </span>
     {gm&&<button type="button" className={`icon-button inv-eye${i.gm?' off':''}`} aria-pressed={!i.gm} aria-label={i.gm?`Show ${i.name} to players`:`Hide ${i.name} from players`} title={i.gm?'Players can’t see this':'Players can see this'} onClick={()=>void edit(i,{gm:!i.gm})}>{i.gm?<EyeOff size={14}/>:<Eye size={14}/>}</button>}
    </div>
    {isOpen&&(canItems?<div className="inv-detail">
     <div className="inv-detail-text">
      <label className="field-label">Note<small> Write [[2d6|Label]] to put a roll in it.</small><Field area value={i.note??''} label={`Note on ${i.name}`} max={2000} onSave={v=>void edit(i,{note:v||undefined})}/></label>
      {i.note&&/\[\[/.test(i.note)&&<NoteText text={i.note} title={title}/>}
      {gm&&<label className="field-label">GM note<small> Players never get this.</small><Field area className="inv-gm-note" value={i.gmNote??''} label={`GM note on ${i.name}`} max={2000} onSave={v=>void edit(i,{gmNote:v||undefined})}/></label>}
     </div>
     <div className="inv-detail-fields">
      <label className="field-label">Name<Field value={i.name} label="Name" onSave={v=>v&&void edit(i,{name:v})}/></label>
      <label className="field-label">Category<select value={i.category??''} onChange={e=>void edit(i,{category:e.target.value||undefined})}><option value="">None</option>{[...new Set([...settings.categories,...(i.category?[i.category]:[])])].map(c=><option key={c}>{c}</option>)}</select></label>
      {show.weight&&unit&&<label className="field-label">Each weighs<span className="inv-with-unit"><Field number value={i.weight===undefined?'':String(i.weight)} label="Weight of one" max={10} onSave={v=>{const n=v?num(v):null;if(!v||n!==null)void edit(i,{weight:n??undefined});}}/>{unit}</span></label>}
      {values&&show.value&&<label className="field-label">Each is worth<Field value={i.price===undefined?'':formatMoney(i.price,settings.coins)} label="Worth of one" max={40} onSave={v=>{const n=v?parseMoney(v,settings.coins):null;if(!v||n!==null)void edit(i,{price:n??undefined});}}/></label>}
      {show.uses&&<label className="field-label">Uses<span className="inv-with-unit"><Field number value={i.uses?String(i.uses.max):''} label="Most uses" placeholder="None" max={4} onSave={v=>{const n=v?Math.round(num(v)??-1):null;if(n===null)void edit(i,{uses:null});else if(n>=1&&n<=1000)void edit(i,{uses:{max:n,value:Math.min(i.uses?.value??n,n)}});}}/>at most</span></label>}
      <div className="field-label inv-rolls-label">Rolls<RollsEditor rolls={i.rolls??[]} onSave={rolls=>void edit(i,{rolls})}/></div>
     </div>
     <div className="inv-detail-tools">
      {give&&give.targets.length>0&&<button type="button" className="button small" onClick={()=>setGiving(i)}><Gift size={14}/> Give to…</button>}
      {catalog&&<button type="button" className="button small" onClick={()=>catalog.save(i)}><Save size={14}/> Save to the item list</button>}
      <button type="button" className="button small danger inv-remove" onClick={async()=>{if(await confirmDialog({title:`Remove ${i.name}?`,message:i.qty>1?`All ${i.qty} go.`:'It goes from this list.',confirm:'Remove',danger:true}))void act({action:'remove',itemId:i.id});}}><Trash2 size={14}/> Remove</button>
     </div>
    </div>:<div className="inv-detail read">
     {i.note?<NoteText text={i.note} title={title}/>:<p className="muted">No note.</p>}
     {give&&canEdit&&give.targets.length>0&&<div className="inv-detail-tools"><button type="button" className="button small" onClick={()=>setGiving(i)}><Gift size={14}/> Give to…</button></div>}
    </div>)}
   </div>;})}</div>}
  </section>)}
  {!items.length&&<p className="muted inv-empty">{canItems?'Nothing carried yet. Add the first item below.':'Nothing carried.'}</p>}
  {items.length>0&&!groups.length&&<p className="muted inv-empty">Nothing matches.</p>}
  {canItems&&<form className="inv-add" onSubmit={e=>{e.preventDefault();void add();}}>
   <input className="inv-input inv-add-qty" aria-label="How many" inputMode="numeric" value={newQty} onChange={e=>setNewQty(e.target.value)}/>
   <input className="inv-input inv-add-name" aria-label="New item" placeholder="Add an item: lantern, rope, healing draught…" maxLength={80} value={newName} onChange={e=>setNewName(e.target.value)}/>
   {settings.categories.length>0&&<select className="inv-input" aria-label="Category of the new item" value={newCat} onChange={e=>setNewCat(e.target.value)}><option value="">No category</option>{settings.categories.map(c=><option key={c}>{c}</option>)}</select>}
   <button type="submit" className="button" disabled={!newName.trim()||!/^\d+$/.test(newQty.trim())}><Plus size={14}/> Add</button>
   {catalog&&<button type="button" className="text-button" onClick={()=>setPicking(true)}><ListPlus size={14}/> From the item list</button>}
  </form>}
  {canEdit&&!gm&&!p.items&&<p className="aside-hint">Your GM keeps this list. Ask them to add or change items.</p>}
  {extra}
  {giving&&give&&<GiveDialog item={giving==='coins'?undefined:giving} coins={coins} settings={settings} targets={give.targets} onClose={()=>setGiving(null)} onGive={(to,qty,c)=>give.onGive(giving==='coins'?null:giving.id,to,qty,c)}/>}
  {picking&&catalog&&<CatalogDialog items={catalog.items} settings={settings} onClose={()=>setPicking(false)} onPick={i=>{const {id:_id,qty:_q,...rest}=i;void _id;void _q;void act({action:'add',item:{...rest,qty:1,uses:rest.uses??undefined}});setPicking(false);}}/>}
 </div>;
}

