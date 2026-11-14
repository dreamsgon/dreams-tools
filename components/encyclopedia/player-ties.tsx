'use client';
/* A page's Connections tab in the player view: the ties players may see, each opening the page at the other end. */
import type {PlayerTie} from '@/lib/encyclopedia/tie-connections';
import './ties.css';

export function PlayerTies({ties,entries,open}:{ties:PlayerTie[];entries:{id:string;title:string}[];open:(id:string)=>void}){
 const title=new Map(entries.map(e=>[e.id,e.title]));
 return <ul className="player-ties">{ties.filter(t=>title.has(t.id)).map((t,i)=><li key={`${t.id}:${i}`}>
  <button type="button" onClick={()=>open(t.id)}><small>{t.label}</small><strong>{title.get(t.id)}</strong></button>
  {t.note&&<p>{t.note.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g,(_,page:string,label?:string)=>(label||page).trim())}</p>}
 </li>)}</ul>;
}
