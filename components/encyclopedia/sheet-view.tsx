'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {FileSpreadsheet} from 'lucide-react';
import {rollGroups,sheetLayout,timeAgo,type PlayerSheet} from '@/lib/encyclopedia/sheet-link';
import './character-sheet.css';

/** Now, refreshed every half minute, so "Read 2 minutes ago" keeps up without a re-render of the whole page. */
function useNow(){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(t);},[]);
 return now;
}

/**
 * The character sheet as a page shows it: hit points and the other special slots first, then stats, then the rolls
 * with their formulas. Used by the GM's Profile tab and, read only, by the player site. Rolls are listed for players; the GM's page
 * passes `rolling` to make them rollable.
 */
export function SheetView({sheet,subtitle,actions,note,rolling,children}:{sheet:PlayerSheet;subtitle?:ReactNode;actions?:ReactNode;note?:ReactNode;/** The GM's rollable rolls and roll log. Players never get this: they see the plain list. */rolling?:ReactNode;children?:ReactNode}){
 const now=useNow(),{tiles,stats,rolls,initFormula}=sheetLayout(sheet.items),groups=rollGroups(rolls),ago=timeAgo(sheet.readAt,now);
 return <section className="sheet-card" aria-label="Character sheet">
  <div className="sheet-head"><span className="eyebrow">CHARACTER SHEET</span>{ago&&<small>Read {ago}</small>}</div>
  <div className="sheet-source"><FileSpreadsheet size={22} aria-hidden="true"/><div className="sheet-source-text"><strong>{sheet.title}</strong>{subtitle&&<small>{subtitle}</small>}</div>{actions&&<div className="sheet-actions">{actions}</div>}</div>
  {children}
  {tiles.length>0&&<div className="sheet-tiles">{tiles.map(t=><div className={`sheet-tile sheet-tile-${t.kind}`} key={t.kind}>
   <small>{t.label}</small>
   <strong>{t.value}{t.max&&<span className="sheet-max"> / {t.max}</span>}</strong>
   {t.ratio!==undefined&&<div className="sheet-bar" role="img" aria-label={`${Math.round(t.ratio*100)} percent`}><span style={{width:`${Math.round(t.ratio*100)}%`}}/></div>}
   {t.kind==='init'&&initFormula&&<code>{initFormula}</code>}
  </div>)}</div>}
  {stats.length>0&&<div className="sheet-stats">{stats.map(s=><div className="sheet-tile" key={s.id}><small>{s.name}</small><strong>{s.value||'—'}</strong></div>)}</div>}
  {rolling?<div className="sheet-rolls"><span className="eyebrow">ROLLS</span>{rolling}</div>:groups.length>0&&<div className="sheet-rolls"><span className="eyebrow">ROLLS</span>{groups.map(g=><div className="sheet-roll-group" key={g.title}>
   {(groups.length>1||g.title!=='Rolls')&&<h4>{g.title}</h4>}
   <ul>{g.rolls.map(r=><li key={r.id}><span>{r.name}</span>{r.formula?<code>{r.formula}</code>:<em>no formula</em>}</li>)}</ul>
  </div>)}</div>}
  {!tiles.length&&!stats.length&&!groups.length&&<p className="sheet-empty">Nothing is picked from this sheet yet.</p>}
  <p className="sheet-foot">{note??'Values are copied here when the sheet is read.'}</p>
 </section>;
}
