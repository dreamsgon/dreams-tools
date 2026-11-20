'use client';
/*
 * A wiki page's text, drawn from the blocks lib/encyclopedia/markup.ts reads. The GM's page (article-body.tsx) and
 * the player view (player-prose.tsx) both use it, each with its own way to draw links, embeds and page lists.
 * HTML is built from the forum's filtered tree (lib/forum/html.ts), never set as HTML.
 */
import {createContext,useContext,type CSSProperties,type ReactNode} from 'react';
import {Lock,Megaphone,ScrollText,Info,TriangleAlert,Code} from 'lucide-react';
import {footnoteNumbers,infoRows,inlineParts,pageListOptions,styleOf,wikiBlocks,type Block,type PageListOptions} from '@/lib/encyclopedia/markup';
import {htmlNodes,type HtmlNode} from '@/lib/forum/html';
import {usePictureSrc} from './character-picture';

export type WikiEnv={
 /** The GM's own page: secrets, asides and GM-only rows show, marked. Players never get them (the server takes them out). */
 gm:boolean;
 /** The page's title, for an info box with no title of its own. */
 title:string;
 /** Draws a [[link]], roll or table chip. */
 link:(inner:string,key:number)=>ReactNode;
 /** Draws ![[Page]], ![[Page#Section]] or ![[Page|full]]; depth counts embeds inside embeds. */
 embed?:(target:string,options:string[],depth:number)=>ReactNode;
 randomTable?:(inner:string,key:number)=>ReactNode;
 maptable?:(sceneId:string,label:string,key:number)=>ReactNode;
 pageList?:(o:PageListOptions,key:number)=>ReactNode;
 onTask?:(line:number,done:boolean)=>void;
 /** The player link a player's page is read through, for fetching its pictures. The GM's own page leaves it out. */
 pictureToken?:string;
};
const Notes=createContext<Map<string,number>>(new Map());

export function WikiInline({text,env}:{text:string;env:WikiEnv}):ReactNode{
 const notes=useContext(Notes);
 return inlineParts(text).map((p,i)=>{
  switch(p.type){
   case 'text':return p.text;
   case 'code':return <code key={i}>{p.text}</code>;
   case 'aside':return env.gm?<span key={i} className="gm-aside" title="Only you see this. Players never get it."><Lock size={11} aria-hidden="true"/> <WikiInline text={p.text} env={env}/></span>:null;
   case 'styled':return <span key={i} className="wiki-styled" style={styleOf(p.attrs) as CSSProperties}><WikiInline text={p.text} env={env}/></span>;
   case 'link':return env.link(p.inner,i);
   case 'note':return <span key={i} className="note-tip" tabIndex={0}>{p.word}<span role="tooltip" className="note-tip-body">{p.note}</span></span>;
   case 'web':return <a key={i} className="web-link" href={p.href} target="_blank" rel="noopener noreferrer nofollow">{p.label}</a>;
   case 'bold':return <strong key={i}><WikiInline text={p.text} env={env}/></strong>;
   case 'italic':return <em key={i}><WikiInline text={p.text} env={env}/></em>;
   case 'strike':return <s key={i}><WikiInline text={p.text} env={env}/></s>;
   case 'mark':return <mark key={i}><WikiInline text={p.text} env={env}/></mark>;
   case 'footnote':{const n=notes.get(p.key);return n?<sup key={i} className="wiki-fn"><a href={`#fn-${n}`}>{n}</a></sup>:null;}
  }
 });
}

const camel=(k:string)=>k.replace(/-([a-z])/g,(_m,c:string)=>c.toUpperCase());
/** HTML from the forum's filter: allowed tags, attributes and styles only. Pictures by address are never kept. */
export function WikiHtml({nodes}:{nodes:readonly HtmlNode[]}):ReactNode{
 return <>{nodes.map((n,i)=>{
  if(typeof n==='string')return n;
  const style=Object.fromEntries(Object.entries(n.style).map(([k,v])=>[camel(k),v])) as CSSProperties;
  if(n.tag==='img')return null;
  if(n.tag==='br'||n.tag==='hr'){const T=n.tag;return <T key={i} style={style}/>;}
  const props:Record<string,unknown>={key:i,style,...(n.attrs.title?{title:n.attrs.title}:{})};
  if(n.tag==='a')return n.attrs.href?<a {...props} key={i} href={n.attrs.href} className="web-link" target="_blank" rel="nofollow noopener noreferrer ugc"><WikiHtml nodes={n.children}/></a>:<span {...props} key={i}><WikiHtml nodes={n.children}/></span>;
  if(n.tag==='td'||n.tag==='th'){props.colSpan=n.attrs.colspan?Number(n.attrs.colspan):undefined;props.rowSpan=n.attrs.rowspan?Number(n.attrs.rowspan):undefined;}
  if(n.tag==='ol'&&n.attrs.start)props.start=Number(n.attrs.start);
  if(n.tag==='details'&&'open' in n.attrs)props.open=true;
  const T=(n.tag==='center'?'div':n.tag==='font'?'span':n.tag) as 'div';
  return <T {...props} key={i}><WikiHtml nodes={n.children}/></T>;
 })}</>;
}
/** Whether the filter left something out of this HTML (a script, a handler, a frame…), so the GM can be told. */
export const htmlLeftOut=(source:string)=>/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|video|audio|link|meta|base)\b|\son[a-z]+\s*=|javascript:|<\s*img\b/i.test(source);

const BLOCK_ICON:Record<string,ReactNode>={'read-aloud':<Megaphone size={13} aria-hidden="true"/>,handout:<ScrollText size={13} aria-hidden="true"/>};
const CALLOUTS=new Set(['note','tip','info','important','warning','caution','danger','example','quote']);

function WikiBlock({b,env,depth}:{b:Block;env:WikiEnv;depth:number}):ReactNode{
 const I=({t}:{t:string})=><WikiInline text={t} env={env}/>;
 switch(b.type){
  case 'heading':{const H=`h${b.level}` as 'h2'|'h3'|'h4'|'h5'|'h6';return <H id={depth?undefined:b.id}><I t={b.text}/></H>;}
  case 'paragraph':return <p><I t={b.text}/></p>;
  case 'gap':return <div className="paragraph-gap"/>;
  case 'rule':return <hr className="wiki-rule"/>;
  case 'bullet':return <div className="bullet-line" style={{marginLeft:b.indent*8}}>• <span><I t={b.text}/></span></div>;
  case 'number':return <div className="bullet-line number-line" style={{marginLeft:b.indent*8}}><span className="list-mark">{b.n}.</span><span><I t={b.text}/></span></div>;
  case 'task':return <label className="task-line" style={{marginLeft:b.indent*8}}><input type="checkbox" checked={b.done} disabled={!env.onTask} readOnly={!env.onTask} onChange={e=>env.onTask?.(b.line,e.target.checked)} aria-label={b.done?'Done':'Not done'}/><span className={b.done?'done':''}><I t={b.text}/></span></label>;
  case 'quote':return <blockquote><I t={b.text}/></blockquote>;
  case 'code':return <pre>{b.text||' '}</pre>;
  case 'table':return <div className="wiki-table"><table><thead><tr>{b.head.map((h,i)=><th key={i} style={b.align[i]?{textAlign:b.align[i]!}:undefined}><I t={h}/></th>)}</tr></thead><tbody>{b.rows.map((r,n)=><tr key={n}>{b.head.map((_,i)=><td key={i} style={b.align[i]?{textAlign:b.align[i]!}:undefined}><I t={r[i]??''}/></td>)}</tr>)}</tbody></table></div>;
  case 'picture':return <WikiPicture imageId={b.imageId} token={env.pictureToken} className={`wiki-picture ${b.side} ${b.size}`} alt={b.caption}>{b.caption&&<figcaption><I t={b.caption}/></figcaption>}</WikiPicture>;
  case 'embed':return depth>=2?<p><I t={`[[${b.target}]]`}/></p>:env.embed?.(b.target,b.options,depth)??null;
  case 'randomTable':return env.randomTable?.(b.inner,0)??<p><I t={`[[${b.inner}]]`}/></p>;
  case 'maptable':return env.maptable?.(b.sceneId,b.label,0)??null;
  case 'html':{const nodes=htmlNodes(b.source);return <><div className="wiki-html"><WikiHtml nodes={nodes}/></div>{env.gm&&htmlLeftOut(b.source)&&<p className="wiki-html-note"><Code size={12} aria-hidden="true"/> Some of this HTML was left out: scripts, event handlers, frames, forms and outside pictures never reach readers.</p>}</>;}
  case 'footnotes':return <div className="wiki-footnotes">{b.notes.map(n=><p key={n.key} id={`fn-${n.n}`}><sup>{n.n}</sup> <I t={n.text}/></p>)}</div>;
  case 'block':{
   const kids=<WikiBlocks blocks={b.children} env={env} depth={depth}/>;
   const name=b.name;
   if(name==='secret')return env.gm?<div className="secret-block"><div className="secret-label"><Lock size={12} aria-hidden="true"/> GM secret · hidden from players</div>{kids}</div>:null;
   if(name==='read-aloud'||name==='readaloud'||name==='boxed')return <div className="wiki-block read-aloud"><div className="wiki-block-label">{BLOCK_ICON['read-aloud']} {b.arg||'Read aloud'}</div>{kids}</div>;
   if(name==='handout')return <div className={`wiki-block handout ${/^notice\b/i.test(b.arg)?'notice':''}`}><div className="wiki-block-label">{BLOCK_ICON.handout} Handout</div>{kids}</div>;
   if(name==='infobox'){const rows=infoRows(b.lines).filter(r=>env.gm||!r.gm);return <aside className={`wiki-infobox ${/\bleft\s*$/i.test(b.arg)?'left':/\bright\s*$/i.test(b.arg)?'right':''}`} aria-label="Info box"><h4><I t={b.arg.replace(/\s*\|?\s*\b(left|right)\b\s*$/i,'')||env.title}/></h4><dl>{rows.map((r,i)=><div key={i} className={r.gm?'gm':''}><dt>{r.gm&&<Lock size={11} aria-hidden="true"/>}{r.label}</dt><dd><I t={r.value}/></dd></div>)}</dl></aside>;}
   if(name==='columns')return <div className="wiki-columns">{(b.columns??[]).map((c,i)=><div key={i}><WikiBlocks blocks={c} env={env} depth={depth}/></div>)}</div>;
   if(name==='pages')return env.pageList?.(pageListOptions(b.lines),0)??null;
   if(name==='style')return <div className="wiki-styled-block" style={styleOf(b.arg,true) as CSSProperties}>{kids}</div>;
   if(CALLOUTS.has(name)){const warn=/^(warning|caution|danger)$/.test(name);return <div className={`wiki-block callout ${warn?'warning':''}`}><div className="wiki-block-label">{warn?<TriangleAlert size={14} aria-hidden="true"/>:<Info size={14} aria-hidden="true"/>} {b.arg||(warn?'Careful':name==='tip'?'Tip':'Note')}</div>{kids}</div>;}
   return <div className="wiki-block">{kids}</div>;
  }
 }
}
/** A picture uploaded to a page (`![[picture:<id>|Caption|left|small]]`), with its caption. */
function WikiPicture({imageId,token,className,alt,children}:{imageId:string;token?:string;className:string;alt:string;children:ReactNode}){
 const {src,failed}=usePictureSrc(imageId,token);
 return <figure className={className}>{src?<img src={src} alt={alt}/>:<span className="wiki-picture-wait">{failed?'This picture couldn’t be loaded.':''}</span>}{children}</figure>;
}
export function WikiBlocks({blocks,env,depth=0}:{blocks:readonly Block[];env:WikiEnv;depth?:number}):ReactNode{
 return <>{blocks.map((b,i)=><WikiBlock key={i} b={b} env={env} depth={depth}/>)}</>;
}
/** A page's text. `depth` is above 0 inside an embed: no heading anchors, and embeds stop two levels down. */
export function WikiProse({text,env,depth=0}:{text:string;env:WikiEnv;depth?:number}){
 const blocks=wikiBlocks(text,0,0);
 const notes=footnoteNumbers(text);
 return <Notes.Provider value={notes}><WikiBlocks blocks={depth?blocks.filter(b=>b.type!=='footnotes'):blocks} env={env} depth={depth}/></Notes.Provider>;
}

/** Scrolls to a heading once it is on the page (after opening another page, it takes a moment to appear). */
export function scrollToHeading(id:string,tries=40){
 const el=typeof document!=='undefined'?document.getElementById(id):null;
 if(el){el.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
 if(tries>0)requestAnimationFrame(()=>scrollToHeading(id,tries-1));
}
