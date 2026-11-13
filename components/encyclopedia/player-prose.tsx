'use client';
/* The player view's page text, laid out like the GM's page (lib/encyclopedia/player-prose.ts). */
import type {ReactNode} from 'react';
import {playerLink,proseBlocks,proseParts} from '@/lib/encyclopedia/player-prose';

type Page={id:string;title:string};
export function PlayerProse({text,entries,open,className=''}:{text:string;entries:readonly Page[];open:(id:string)=>void;className?:string}){
 const inline=(t:string):ReactNode=>proseParts(t).map((p,i)=>{
  if(p.type==='bold')return <strong key={i}>{p.text}</strong>;
  if(p.type==='code')return <code key={i}>{p.text}</code>;
  if(p.type==='link'){const page=playerLink(entries,p.target);return page?<button key={i} className="wiki-link" onClick={()=>open(page.id)}>{p.label}</button>:<span key={i}>{p.label}</span>;}
  return p.text;
 });
 return <div className={`prose player-prose formatted ${className}`.trim()}>{proseBlocks(text).map((b,i)=>{
  switch(b.type){
   case 'heading':{const H=`h${b.level}` as 'h2'|'h3'|'h4'|'h5'|'h6';return <H key={i}>{inline(b.text)}</H>;}
   case 'bullet':return <div className="bullet-line" key={i} style={{marginLeft:b.indent*8}}>• <span>{inline(b.text)}</span></div>;
   case 'task':return <div className="task-line" key={i} style={{marginLeft:b.indent*8}}><input type="checkbox" checked={b.done} readOnly disabled aria-label={b.done?'Done':'Not done'}/><span className={b.done?'done':''}>{inline(b.text)}</span></div>;
   case 'quote':return <blockquote key={i}>{inline(b.text)}</blockquote>;
   case 'code':return <pre key={i}>{b.text||' '}</pre>;
   case 'paragraph':return <p key={i}>{inline(b.text)}</p>;
   default:return <div className="paragraph-gap" key={i}/>;
  }
 })}</div>;
}
