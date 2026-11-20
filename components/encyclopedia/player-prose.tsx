'use client';
/* The player view's page text, read by the same reader as the GM's page (wiki-prose.tsx). The server already took out secrets, asides, GM-only rows, rolls and Maptable links. */
import {FileText} from 'lucide-react';
import {playerLink} from '@/lib/encyclopedia/player-prose';
import {plainExcerpt} from '@/lib/encyclopedia/inline';
import {headingId,leadText,linkParts,sectionText} from '@/lib/encyclopedia/markup';
import {WikiProse,scrollToHeading,type WikiEnv} from './wiki-prose';
import {PageList} from './article-body';

type Page={id:string;title:string;kind?:string;parentId?:string;tabs?:readonly {id:string;title:string;body:string}[]};
const overview=(p:Page)=>p.tabs?.find(t=>t.id==='overview')?.body??null;
export function PlayerProse({text,title='',entries,open,className=''}:{text:string;title?:string;entries:readonly Page[];open:(id:string)=>void;className?:string}){
 const go=(id:string,section:string|null)=>{open(id);if(section)scrollToHeading(headingId(section));};
 const env=(title:string):WikiEnv=>({
  gm:false,title,
  link:(inner,i)=>{const {page:target,section,label}=linkParts(inner);const found=target?playerLink(entries,target):null;const text=label??(section?(target?`${found?.title??target}, ${section}`:section):found?.title??target);
   if(!target&&section)return <button key={i} className="wiki-link" onClick={()=>scrollToHeading(headingId(section))}>{text}</button>;
   return found?<button key={i} className="wiki-link" onClick={()=>go(found.id,section)}>{text}</button>:<span key={i}>{text}</span>;},
  embed:(raw,options,depth)=>{
   const {page:target,section}=linkParts(raw);const found=target?playerLink(entries,target):null;const body=found&&overview(found);
   if(!found||body===null||body===undefined)return null;
   const full=options.some(o=>/^full$/i.test(o)),t=section?sectionText(body,section):full?body:leadText(body);
   if(!t)return null;
   return <section className="wiki-embed"><header><FileText size={14} aria-hidden="true"/><button className="wiki-link" onClick={()=>go(found.id,section)}>{found.title}</button>{section&&<span>{section}</span>}</header><div className="wiki-embed-body prose"><WikiProse text={t} env={env(found.title)} depth={depth+1}/></div></section>;
  },
  pageList:(o,i)=><PageList key={i} options={o} pages={entries.filter(e=>e.kind&&(!title||e.title!==title)).map(e=>({id:e.id,title:e.title,kind:e.kind!,parentId:e.parentId??null,excerpt:plainExcerpt(leadText(overview(e)??''),110)}))} parent={o.inside?playerLink(entries,o.inside)??null:undefined} onOpen={id=>open(id)}/>,
 });
 return <div className={`prose player-prose formatted ${className}`.trim()}><WikiProse text={text} env={env(title)}/></div>;
}
