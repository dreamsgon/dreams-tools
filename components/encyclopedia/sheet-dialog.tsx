'use client';
import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {AlertTriangle,Check,Download,Link as LinkIcon,X} from 'lucide-react';
import {
  GRID_ROWS,MAX_SHEET_ITEMS,TEMPLATE_FILE,TEMPLATE_TAB,cellRef,cellText,colLetters,findTemplateTab,guessPick,kindNames,looksD20,newItemId,
  refreshSheet,sheetKinds,sheetSchema,specialKinds,templateCsv,templateItems,type Sheet,type SheetItem,type SheetKind,
} from '@/lib/encyclopedia/sheet-link';
import {GOOGLE_NOT_SET_UP,googleConfigured,preloadGoogle} from '@/lib/encyclopedia/google-client';
import {useIdlePreload} from '@/lib/idle-preload';
import {ToolDialog} from './tool-dialog';
import {pickAndReadGoogle,readPublished,type SheetRead} from './sheet-read';
import './character-sheet.css';

// Load Google's scripts while the dialog sits idle, so a click can open the sign-in pop-up straight away.
const preload=[preloadGoogle];

type Props={
  characterName:string;
  /** The sheet already linked, when changing which cells are read. */
  current?:Sheet;
  /** The linked sheet already read again, so the dialog opens on the cell picker. */
  read?:SheetRead;
  /** May be async: a failure it throws is shown in the dialog, which stays open. */
  onSave:(sheet:Sheet)=>void|Promise<void>;
  onClose:()=>void;
  /** A signed-in player linking their own character's sheet: published links are read through the player route, and the wording is theirs. */
  player?:{name:string;read:(link:string)=>Promise<SheetRead>};
};

/** Runs a save, showing what went wrong instead of closing. */
async function attempt(save:()=>void|Promise<void>,fail:(message:string)=>void){
  try{await save();}catch(e){fail(e instanceof Error?e.message:'That cannot be saved. Try again.');}
}

const google=(<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z"/></svg>);

function downloadTemplate(){
  const url=URL.createObjectURL(new Blob([templateCsv()],{type:'text/csv'})),a=document.createElement('a');
  a.href=url;a.download=TEMPLATE_FILE;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/** Link a character sheet: sign in with Google and pick it, or paste a published link; then use the RPG Tools tab or pick cells. */
export default function SheetDialog({characterName,current,read:initial,onSave,onClose,player}:Props){
  const [read,setRead]=useState<SheetRead|null>(initial??null),[step,setStep]=useState<'link'|'found'|'pick'>(initial?'pick':'link');
  const [link,setLink]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const configured=googleConfigured(),wrap=useRef<HTMLDivElement>(null);
  useIdlePreload(preload);
  // Move focus into the new step (the first control marked data-first, or the picker's current cell).
  useEffect(()=>{wrap.current?.querySelector<HTMLElement>('[data-first]')?.focus();},[step]);
  // Google's picker is a frame added to the page, which a modal <dialog> would leave inert under its top layer.
  // So the dialog steps out of modal mode while the picker is open and comes back after, keeping its state.
  const modal=(open:boolean)=>{const d=wrap.current?.closest('dialog');if(!d)return;if(open&&d.open)d.close();else if(!open&&!d.open)d.showModal();};

  async function run(task:()=>Promise<SheetRead|null>){
    setBusy(true);setError('');
    try{
      const got=await task();
      if(got){setRead(got);setStep(findTemplateTab(got.tabs)?'found':'pick');}
    }catch(e){setError(e instanceof Error?e.message:'Something went wrong. Try again.');}
    finally{setBusy(false);}
  }

  // Changing cells on the same sheet keeps whoever linked it; a different sheet becomes the linker's own.
  const keeps=(r:SheetRead)=>!!current&&current.source===r.source&&(r.source==='google'?current.spreadsheetId===r.spreadsheetId:current.publishedUrl===r.publishedUrl);
  const base=(r:SheetRead,mode:Sheet['mode'],items:SheetItem[],title:string):Sheet=>({
    source:r.source,...(r.spreadsheetId?{spreadsheetId:r.spreadsheetId}:{}),...(r.publishedUrl?{publishedUrl:r.publishedUrl}:{}),
    title:(title.trim()||r.title).slice(0,200),tab:mode==='template'?TEMPLATE_TAB:current?.tab??r.tabs[0]?.name,...(keeps(r)?{linkedBy:current!.linkedBy??player?.name??'the GM',...(current!.linkedById?{linkedById:current!.linkedById}:{})}:{linkedBy:player?.name??'the GM'}),
    readAt:new Date().toISOString(),mode,items,writeBack:!player&&r.source==='google'&&keeps(r)&&current?.writeBack===true,
  });
  const chooseTemplate=(r:SheetRead)=>{
    const tab=findTemplateTab(r.tabs);if(!tab)return;
    const sheet=base(r,'template',templateItems(tab,current?.mode==='template'?current.items:[]),r.title),checked=sheetSchema.safeParse(sheet);
    if(!checked.success){setError(checked.error.issues[0]?.message??'That sheet cannot be saved.');return;}
    void attempt(()=>onSave(checked.data),setError);
  };

  return <ToolDialog title={step==='pick'?'Pick cells':'Link a character sheet'} wide={step==='pick'} onClose={onClose}>
    <div className="sheet-dialog" ref={wrap}>
      {step!=='pick'&&<p className="modal-intro">For {characterName}. {player?'Stats and rolls come from your own Google Sheet. Only you and your GM can change what is linked.':'Stats and rolls come from one Google Sheet.'}</p>}
      {step==='link'&&<>
        <div className="sheet-way is-main">
          <h3>1. Sign in with Google and pick the sheet <span className="sheet-pill">Recommended</span></h3>
          <p>Google opens its own file picker. You choose one sheet, and RPG Tools can open only that sheet. Nothing else in your Drive.</p>
          <div className="sheet-link-row"><button type="button" className="button" data-first={configured?'':undefined} disabled={!configured||busy} onClick={()=>void run(()=>pickAndReadGoogle(modal))}>{google} Sign in with Google and pick a sheet</button></div>
          {!configured&&<p className="sheet-error" role="note">{GOOGLE_NOT_SET_UP}</p>}
          {configured&&<p><Check size={12} aria-hidden="true"/> Stays private. Refresh reads it again whenever you choose.</p>}
        </div>
        <form className="sheet-way" onSubmit={e=>{e.preventDefault();if(link.trim())void run(()=>(player?.read??readPublished)(link));}}>
          <h3>2. Paste a published link</h3>
          <p>No sign-in. Works for a sheet published to the web as CSV.</p>
          <div className="sheet-link-row">
            <input className="sheet-input" data-first={configured?undefined:''} type="url" aria-label="Published link" placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv" value={link} onChange={e=>setLink(e.target.value)}/>
            <button className="button" type="submit" disabled={busy||!link.trim()}><LinkIcon size={14}/> Read link</button>
          </div>
          <div className="sheet-warn" role="note"><AlertTriangle size={14} aria-hidden="true"/><span><strong>Publishing makes the sheet readable by anyone who has the link.</strong> Only publish a sheet you are happy to share. You can stop publishing in Google Sheets at any time.</span></div>
        </form>
        {error&&<p className="sheet-error" role="alert">{error}</p>}
        {busy&&<p className="modal-intro" role="status">Reading the sheet…</p>}
        <div className="sheet-template">
          <div><strong>Need a sheet?</strong>Download our template, then import it into a new Google Sheet tab named {TEMPLATE_TAB} (File, Import).</div>
          <button type="button" className="button" onClick={downloadTemplate}><Download size={14}/> Download template</button>
        </div>
        <div className="sheet-sees">
          <div><h4>RPG Tools can see</h4><ul><li>The one sheet you pick</li><li>The cells you choose for stats and rolls</li><li>The sheet’s name</li></ul></div>
          <div><h4>RPG Tools cannot see</h4><ul><li>Your other Google files</li><li>Your email or contacts</li><li>Anything it has not been given</li></ul></div>
        </div>
        <div className="sheet-foot-row"><button type="button" className="button" onClick={onClose}>Cancel</button></div>
      </>}
      {step==='found'&&read&&<>
        <div className="sheet-way is-main">
          <h3>{read.title}</h3>
          <p>This sheet has a tab named {TEMPLATE_TAB}. RPG Tools can read every row of it: a row with a Roll becomes a roll, and HP, Max HP, AC and Initiative fill their own slots.</p>
          <div className="sheet-link-row"><button type="button" className="button primary" data-first onClick={()=>chooseTemplate(read)}>Use the {TEMPLATE_TAB} tab</button><button type="button" className="button" onClick={()=>setStep('pick')}>Pick cells instead</button></div>
          {error&&<p className="sheet-error" role="alert">{error}</p>}
        </div>
        <div className="sheet-foot-row"><button type="button" className="button" onClick={()=>{setStep('link');setRead(null);}}>Back</button><button type="button" className="button" onClick={onClose}>Cancel</button></div>
      </>}
      {step==='pick'&&read&&<CellPicker read={read} current={current} base={base} player={!!player} onSave={onSave} onClose={onClose} onBack={initial?undefined:()=>{setStep('link');setRead(null);}}/>}
    </div>
  </ToolDialog>;
}

type Slot={tab:string;col:number;row:number};
const same=(a:Slot|null,b:Slot|null)=>!!a&&!!b&&a.tab===b.tab&&a.col===b.col&&a.row===b.row;

/** The picker: click a label cell, then its value cell, choose what it is, and build the list of items to read. */
function CellPicker({read,current,base,onSave,onClose,onBack,player}:{read:SheetRead;current?:Sheet;player?:boolean;base:(r:SheetRead,mode:Sheet['mode'],items:SheetItem[],title:string)=>Sheet;onSave:(s:Sheet)=>void|Promise<void>;onClose:()=>void;onBack?:()=>void}){
  const [tabName,setTab]=useState(read.tabs[0]?.name??''),[label,setLabel]=useState<Slot|null>(null),[value,setValue]=useState<Slot|null>(null);
  const [items,setItems]=useState<SheetItem[]>(current?.mode==='cells'?current.items:[]);
  const [name,setName]=useState(''),[kind,setKind]=useState<SheetKind>('stat'),[formula,setFormula]=useState(''),[title,setTitle]=useState(current?.title??read.title),[error,setError]=useState('');
  const d20=useMemo(()=>looksD20(read.tabs),[read.tabs]);
  const tab=read.tabs.find(t=>t.name===tabName)??read.tabs[0];
  const rows=tab?.rows??[];
  // Show the used part of the tab, with a little room.
  const lastRow=Math.min(GRID_ROWS,Math.max(12,rows.reduce((n,r,i)=>r.some(c=>c.trim())?i+1:n,0)+2));
  const lastCol=Math.min(26,Math.max(6,rows.reduce((n,r)=>Math.max(n,r.reduce((m,c,i)=>c.trim()?i+1:m,0)),0)+1));
  // One tab stop for the whole grid: the current cell. Arrow keys move it.
  const [cur,setCur]=useState({row:1,col:1}),gridRef=useRef<HTMLTableElement>(null);
  const curRow=Math.min(cur.row,lastRow),curCol=Math.min(cur.col,lastCol);
  function moveKey(e:KeyboardEvent<HTMLTableElement>){
    const d:Record<string,[number,number]>={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]},step=d[e.key];
    if(!step)return;
    e.preventDefault();
    const row=Math.max(1,Math.min(lastRow,curRow+step[0])),col=Math.max(1,Math.min(lastCol,curCol+step[1]));
    setCur({row,col});
    requestAnimationFrame(()=>gridRef.current?.querySelector<HTMLElement>(`[data-r="${row}"][data-c="${col}"]`)?.focus());
  }
  const textAt=(s:Slot|null)=>s?cellText(read.tabs,cellRef(s.col,s.row,s.tab))??'':'';
  const pickedAt=new Set(items.flatMap(i=>{const m=/^(?:'((?:[^']|'')+)'|([^'!]+))!([A-Z]+)(\d+)$/.exec(i.cell);return m?[`${(m[1]??m[2]).replace(/''/g,"'")}|${m[3]}${m[4]}`]:[];}));

  function click(col:number,row:number){
    const slot={tab:tab.name,col,row};
    if(!label||value){setLabel(slot);setValue(null);setName('');setError('');return;}
    setValue(slot);
    const guess=guessPick(textAt(label),textAt(slot),d20);
    setName(guess.name||cellRef(col,row));setKind(guess.kind);setFormula(guess.formula);
  }
  function add(item:Omit<SheetItem,'id'>){
    if(items.length>=MAX_SHEET_ITEMS){setError(`A sheet holds up to ${MAX_SHEET_ITEMS} items.`);return;}
    setItems(l=>[...l,{id:newItemId(),...item}]);setLabel(null);setValue(null);setName('');setError('');
  }
  function addPicked(){
    if(!value||!name.trim())return;
    const text=textAt(value);
    add({name:name.trim().slice(0,80),cell:cellRef(value.col,value.row,value.tab),kind,...(text?{value:text.slice(0,200)}:{}),...((kind==='roll'||kind==='init')&&formula.trim()?{formula:formula.trim().slice(0,200)}:{})});
  }
  function addNamed(n:{label:string;cell:string}){
    const text=cellText(read.tabs,n.cell)??'',g=guessPick(n.label,text,d20);
    add({name:n.label.slice(0,80),cell:n.cell,kind:g.kind,...(text?{value:text.slice(0,200)}:{}),...(g.formula&&(g.kind==='roll'||g.kind==='init')?{formula:g.formula}:{})});
  }
  const patch=(id:string,f:Partial<SheetItem>)=>setItems(l=>l.map(i=>i.id===id?{...i,...f}:i));
  function save(){
    if(items.some(i=>!i.name.trim())){setError('Give every picked item a name.');return;}
    const draft=base(read,'cells',items.map(i=>({...i,name:i.name.trim()})),title),fresh=refreshSheet(draft,read.tabs,draft.readAt!).sheet,checked=sheetSchema.safeParse(fresh);
    if(!checked.success){setError(checked.error.issues[0]?.message??'That cannot be saved.');return;}
    void attempt(()=>onSave(checked.data),setError);
  }

  const hasTemplate=!!findTemplateTab(read.tabs);
  return <>
    <div className="sheet-pick">
      <div className="sheet-grid-pane">
        <div className="sheet-status" aria-live="polite">
          {label?<>Selected: <b>{textAt(label)||cellRef(label.col,label.row)}</b>{value?<> then <b>{textAt(value)||cellRef(value.col,value.row)}</b></>:<> now click its value</>}</>:<>Click a label cell, then its value cell.</>}
        </div>
        <div className="sheet-scroll"><table className="sheet-grid" ref={gridRef} aria-label={`Cells of ${tab?.name??'the sheet'}. Arrow keys move, Enter picks.`} onKeyDown={moveKey}><thead><tr><th scope="col"><span className="sheet-sr">Row</span></th>{Array.from({length:lastCol},(_,c)=><th key={c} scope="col">{colLetters(c+1)}</th>)}</tr></thead>
          <tbody>{Array.from({length:lastRow},(_,r)=><tr key={r}><th className="row" scope="row">{r+1}</th>{Array.from({length:lastCol},(_,c)=>{
            const slot={tab:tab?.name??'',col:c+1,row:r+1},text=rows[r]?.[c]??'',isLabel=same(slot,label),isValue=same(slot,value),isPicked=pickedAt.has(`${slot.tab}|${colLetters(c+1)}${r+1}`),here=r+1===curRow&&c+1===curCol;
            const cls=['sheet-cell',isLabel?'is-label':'',isValue?'is-value':'',isPicked?'picked':''].filter(Boolean).join(' ');
            const state=isLabel?', chosen as the label':isValue?', chosen as the value':isPicked?', already picked':'';
            return <td key={c}><button type="button" className={cls} tabIndex={here?0:-1} data-first={here?'':undefined} data-r={r+1} data-c={c+1} aria-pressed={isLabel||isValue} aria-label={`${colLetters(c+1)}${r+1}${text?`, ${text}`:', empty'}${state}`} onFocus={()=>setCur({row:r+1,col:c+1})} onClick={()=>click(c+1,r+1)}>{text}</button></td>;})}</tr>)}</tbody></table></div>
        <div className="sheet-tabs" role="group" aria-label="Tabs">{read.tabs.map(t=><button type="button" key={t.name} aria-pressed={t.name===tab?.name} onClick={()=>{setTab(t.name);setLabel(null);setValue(null);}}>{t.name}</button>)}</div>
      </div>
      <div className="sheet-side">
        {read.named.length>0&&<div><h3>Named ranges found</h3><div className="sheet-chips">{read.named.map(n=><button type="button" key={n.cell+n.label} disabled={items.some(i=>i.cell===n.cell)} onClick={()=>addNamed(n)}>{n.label}<b>Add</b></button>)}</div></div>}
        {label&&value&&<div className="sheet-choice">
          <div className="sheet-choice-top"><input className="sheet-input" aria-label="Name" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/><code>{cellRef(value.col,value.row,value.tab)}</code></div>
          <small className="muted">Value: {textAt(value)||'empty'}</small>
          <div className="sheet-kinds" role="group" aria-label="What it is">{sheetKinds.map(k=><button type="button" key={k} aria-pressed={kind===k} onClick={()=>{setKind(k);if(k==='roll'&&!formula)setFormula(guessPick(textAt(label),textAt(value),d20).formula);}}>{kindNames[k]}</button>)}</div>
          {(kind==='roll'||kind==='init')&&<input className="sheet-input" aria-label="Roll formula" placeholder="Roll, for example 1d20+5 (optional)" maxLength={200} value={formula} onChange={e=>setFormula(e.target.value)}/>}
          <div className="sheet-link-row"><button type="button" className="button primary" disabled={!name.trim()} onClick={addPicked}>Add {name.trim()||'cell'}</button><button type="button" className="button" onClick={()=>{setLabel(null);setValue(null);}}>Skip</button></div>
        </div>}
        <div>
          <h3>Picked · {items.length} {items.length===1?'item':'items'}</h3>
          {items.length>0?<div className="sheet-picked-wrap"><table className="sheet-picked"><thead><tr><th>Name</th><th>Cell</th><th>Kind</th><th>Roll</th><th/></tr></thead><tbody>{items.map(i=><tr key={i.id}>
            <td><input aria-label={`Name of ${i.name}`} maxLength={80} value={i.name} onChange={e=>patch(i.id,{name:e.target.value})}/>
              {(specialKinds as readonly string[]).includes(i.kind)&&<input aria-label={`What you call ${i.name}`} placeholder={`Call it… (${kindNames[i.kind]})`} maxLength={40} value={i.label??''} onChange={e=>patch(i.id,{label:e.target.value||undefined})}/>}</td>
            <td><code>{i.cell}</code></td>
            <td><select aria-label={`Kind of ${i.name}`} value={i.kind} onChange={e=>patch(i.id,{kind:e.target.value as SheetKind})}>{sheetKinds.map(k=><option key={k} value={k}>{kindNames[k]}</option>)}</select></td>
            <td>{i.kind==='roll'||i.kind==='init'?<input aria-label={`Roll formula of ${i.name}`} maxLength={200} placeholder="1d20+5" value={i.formula??''} onChange={e=>patch(i.id,{formula:e.target.value||undefined})}/>:<code>{i.value??''}</code>}</td>
            <td><button type="button" className="icon-button" aria-label={`Remove ${i.name}`} onClick={()=>setItems(l=>l.filter(x=>x.id!==i.id))}><X size={13}/></button></td></tr>)}</tbody></table></div>
          :<p className="sheet-empty">Nothing picked yet.</p>}
        </div>
      </div>
    </div>
    {error&&<p className="sheet-error" role="alert">{error}</p>}
    <div className="sheet-foot-row">
      <label className="sheet-title-field"><span>Sheet name</span><input className="sheet-input" aria-label="Sheet name" maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      {hasTemplate&&<small className="muted">This sheet has an {TEMPLATE_TAB} tab you can use instead.</small>}
      {onBack&&<button type="button" className="button" onClick={onBack}>Back</button>}
      <button type="button" className="button" onClick={onClose}>Cancel</button>
      <button type="button" className="button primary" disabled={!items.length||!title.trim()} onClick={save}>Save {items.length} {items.length===1?'item':'items'}</button>
    </div>
    <p className="sheet-foot">{player?'Values are copied to your character page each time you refresh. Your GM can see them too.':'Values are copied to the character page each time the sheet is read.'}</p>
  </>;
}
