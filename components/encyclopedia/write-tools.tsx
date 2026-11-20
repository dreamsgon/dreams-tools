'use client';
/*
 * Write's Insert and Style menus. Insert puts a block (info box, read-aloud, note, columns, an embedded page,
 * a page list, HTML…) on its own lines at the cursor; Style wraps the selected words in [words]{…} or the selected
 * lines in ::: style. Everything they write is plain text the reader understands (lib/encyclopedia/markup.ts).
 */
import {useEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {ChevronDown,Plus,Type,BookOpen,ImagePlus} from 'lucide-react';
import {PALETTE,pictureLine} from '@/lib/encyclopedia/markup';
import {uploadMapImage} from './map-transfer';

type Props={editor:RefObject<HTMLTextAreaElement|null>;body:string;setBody:(next:string)=>void;caretTo:(at:number,end?:number)=>void};
const INSERTS:[string,string][]=[
 ['Info box','::: infobox\nKind: \nHome: [[Page name]]\n(gm) Secret: \n:::'],
 ['Read-aloud box','::: read-aloud\nWhat the players hear.\n:::'],
 ['Note','::: note\nSomething worth remembering.\n:::'],
 ['Warning','::: warning\nSomething to be careful about.\n:::'],
 ['Handout','::: handout\nA letter, a notice or a map the players find.\n:::'],
 ['Columns','::: columns\nLeft side.\n+++\nRight side.\n:::'],
 ['A page shown here','![[Page name]]'],
 ['One section of a page','![[Page name#Heading]]'],
 ['List of pages','::: pages\nkind: place\nshow: cards\n:::'],
 ['Table','| Name | Notes |\n| --- | --- |\n|  |  |'],
 ['Numbered list','1. First\n2. Second'],
 ['Styled lines','::: style align=center size=big\nA line that stands out.\n:::'],
 ['HTML','::: html\n<div style="text-align:center">\n  <b>Your HTML here</b>\n</div>\n:::'],
 ['Rule','---'],
];
const WORDS:[string,string][]=[['size=small','Small'],['size=big','Big'],['size=huge','Huge'],['font=hand','Old hand'],['font=mono','Typewriter'],['font=display','Heading font'],['font=sans','Clean'],['caps','Small caps']];
const LINES:[string,string][]=[['align=center','Centre'],['align=right','Right'],['size=big','Bigger'],['size=small','Smaller']];

function Menu({label,icon,children,open,setOpen,wide}:{label:string;icon:ReactNode;children:ReactNode;open:boolean;setOpen:(v:boolean)=>void;wide?:boolean}){
 const box=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const out=(e:MouseEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);(box.current?.querySelector('button') as HTMLButtonElement|null)?.focus();}};document.addEventListener('mousedown',out);document.addEventListener('keydown',key);return ()=>{document.removeEventListener('mousedown',out);document.removeEventListener('keydown',key);};},[open,setOpen]);
 return <div className="write-menu" ref={box}><button type="button" className="button small" aria-expanded={open} aria-haspopup="true" onMouseDown={e=>e.preventDefault()} onClick={()=>setOpen(!open)}>{icon}{label}<ChevronDown size={12} aria-hidden="true"/></button>{open&&<div className={`write-pop ${wide?'wide':''}`} role="menu">{children}</div>}</div>;
}

export function WriteTools({editor,body,setBody,caretTo}:Props){
 const [menu,setMenu]=useState<'insert'|'style'|null>(null),[status,setStatus]=useState('');
 const file=useRef<HTMLInputElement>(null);
 const latest=useRef({body,setBody});latest.current={body,setBody};
 const insert=(text:string,select=true)=>{const {body,setBody}=latest.current;
  // On an empty line it goes there; otherwise on the lines after the one the cursor is in.
  const el=editor.current,at=el?el.selectionEnd:body.length,lineStart=body.lastIndexOf('\n',at-1)+1,found=body.indexOf('\n',at),lineEnd=found<0?body.length:found;
  const empty=!body.slice(lineStart,lineEnd).trim(),before=body.slice(0,empty?lineStart:lineEnd),after=body.slice(lineEnd);
  const lead=before&&!before.endsWith('\n')?'\n':'',tail=after.startsWith('\n')||!after?'':'\n';
  setBody(before+lead+text+tail+after);setMenu(null);
  const start=before.length+lead.length;caretTo(select?start:start+text.length,start+text.length);
 };
 // A picture from the Insert menu, or dropped or pasted into the text: uploaded to the GM's storage, then shown on its own line.
 const pictures=async(files:File[])=>{
  const images=files.filter(f=>f.type.startsWith('image/'));if(!images.length)return false;
  for(const f of images){setStatus(`Uploading ${f.name||'the picture'}…`);
   try{const up=await uploadMapImage(f);insert(pictureLine(up.imageId,'','right','medium'),false);setStatus('Added the picture. Add a caption after the | or write left, center, small or large.');}
   catch(e){setStatus(e instanceof Error?e.message:'Could not upload the picture.');return true;}}
  return true;
 };
 const picturesRef=useRef(pictures);picturesRef.current=pictures;
 useEffect(()=>{const el=editor.current;if(!el)return;
  const drop=(e:DragEvent)=>{const files=[...(e.dataTransfer?.files??[])];if(files.some(f=>f.type.startsWith('image/'))){e.preventDefault();void picturesRef.current(files);}};
  const paste=(e:ClipboardEvent)=>{const files=[...(e.clipboardData?.files??[])];if(files.some(f=>f.type.startsWith('image/'))){e.preventDefault();void picturesRef.current(files);}};
  el.addEventListener('drop',drop);el.addEventListener('paste',paste);return()=>{el.removeEventListener('drop',drop);el.removeEventListener('paste',paste);};
 },[editor]);
 const style=(attr:string,lines:boolean)=>{
  const el=editor.current;if(!el)return;let s=el.selectionStart,e=el.selectionEnd;
  if(lines){s=body.lastIndexOf('\n',s-1)+1;const le=body.indexOf('\n',Math.max(e-1,s));e=le<0?body.length:le;const inner=body.slice(s,e)||'Your lines';const text=`::: style ${attr}\n${inner}\n:::`;setBody(body.slice(0,s)+text+body.slice(e));caretTo(s,s+text.length);}
  else{const sel=body.slice(s,e)||'words',m=/^\[([\s\S]+)\]\{([^}]*)\}$/.exec(sel),text=m?`[${m[1]}]{${m[2]} ${attr}}`:`[${sel}]{${attr}}`;setBody(body.slice(0,s)+text+body.slice(e));caretTo(s,s+text.length);}
  setMenu(null);
 };
 return <>
  <Menu label="Insert" icon={<Plus size={14} aria-hidden="true"/>} open={menu==='insert'} setOpen={v=>setMenu(v?'insert':null)}>
   <button type="button" role="menuitem" onMouseDown={e=>e.preventDefault()} onClick={()=>{setMenu(null);file.current?.click();}}><span><ImagePlus size={13} aria-hidden="true"/> Picture…</span><small>upload</small></button>
   {INSERTS.map(([name,text])=><button key={name} type="button" role="menuitem" onMouseDown={e=>e.preventDefault()} onClick={()=>insert(text)}><span>{name}</span><small>{text.split('\n')[0]!.slice(0,18)}</small></button>)}
  </Menu>
  <Menu label="Style" icon={<Type size={14} aria-hidden="true"/>} open={menu==='style'} setOpen={v=>setMenu(v?'style':null)} wide>
   <p className="write-pop-hint">Select words or lines first.</p>
   <span className="write-pop-label">Words</span><div className="write-pop-row">{WORDS.map(([a,l])=><button key={a} type="button" role="menuitem" onMouseDown={e=>e.preventDefault()} onClick={()=>style(a,false)}>{l}</button>)}</div>
   <span className="write-pop-label">Colour</span><div className="write-pop-row">{PALETTE.map(c=><button key={c} type="button" role="menuitem" className="swatch" aria-label={c} title={c} style={{background:`var(--wiki-${c})`}} onMouseDown={e=>e.preventDefault()} onClick={()=>style(`color=${c}`,false)}/>)}</div>
   <span className="write-pop-label">Highlight</span><div className="write-pop-row">{PALETTE.slice(0,6).map(c=><button key={c} type="button" role="menuitem" className="swatch" aria-label={`${c} highlight`} title={`${c} highlight`} style={{background:`color-mix(in srgb, var(--wiki-${c}) 25%, transparent)`}} onMouseDown={e=>e.preventDefault()} onClick={()=>style(`bg=${c}`,false)}/>)}</div>
   <span className="write-pop-label">Lines</span><div className="write-pop-row">{LINES.map(([a,l])=><button key={a} type="button" role="menuitem" onMouseDown={e=>e.preventDefault()} onClick={()=>style(a,true)}>{l}</button>)}</div>
  </Menu>
 <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e=>{const files=[...(e.target.files??[])];e.target.value='';void pictures(files);}}/>
  {status&&<span className="write-status" role="status">{status}</span>}
  <a className="button small write-guide" href="/guide/writing-wiki-pages" target="_blank" rel="noopener"><BookOpen size={14} aria-hidden="true"/> What can I type?</a>
 </>;
}
