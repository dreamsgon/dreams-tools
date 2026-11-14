"use client";
import {useState} from "react";
import {ClipboardPaste,Pencil} from "lucide-react";
import {statblockRolls,statblockSegments} from "@/lib/encyclopedia/statblock";
import {defaultCharacter,type CharacterData,type Entry} from "@/lib/encyclopedia/world-model";
import {RollChip} from "./rolls";

const SECTION=/^(actions|bonus actions|reactions|legendary actions|lair actions|traits|special abilities|spellcasting|offense|defense|statistics|abilities)\s*:?$/i;

/** The lines of a pasted statblock with its rolls as chips. Shared by the Encyclopedia and Maptable tokens. */
export function StatblockText({title,text,detect=true}:{title:string;text:string;detect?:boolean}){
 const lines=text.replace(/\r/g,"").split("\n");const first=lines.findIndex(l=>l.trim());
 return <div className="statblock">{lines.map((line,i)=>{
  if(!line.trim())return <div className="statblock-gap" key={i}/>;
  const parts=statblockSegments(line,detect).map((s,j)=>s.formula?<RollChip key={j} title={title} formula={s.formula} label={s.text.trim()} context={s.context}/>:<span key={j}>{s.text}</span>);
  if(i===first)return <h3 className="statblock-name" key={i}>{parts}</h3>;
  if(SECTION.test(line.trim()))return <h4 className="statblock-section" key={i}>{parts}</h4>;
  const lead=line.match(/^(\s*[A-Z][^.:\n]{1,40}[.:])\s/);
  return <p key={i}>{lead&&!statblockSegments(lead[1],detect).some(s=>s.formula)?<><b>{lead[1]}</b>{statblockSegments(line.slice(lead[1].length),detect).map((s,j)=>s.formula?<RollChip key={j} title={title} formula={s.formula} label={s.text.trim()} context={lead[1].replace(/[.:]$/,"").trim()}/>:<span key={j}>{s.text}</span>)}</>:parts}</p>;
 })}</div>;
}

export function StatblockView({entry,onChange}:{entry:Entry;onChange:(c:CharacterData)=>void}){
 const c=entry.character??defaultCharacter(),text=c.statblock??"",detect=c.statblockRolls!==false;
 const [draft,setDraft]=useState<string|null>(null),[auto,setAuto]=useState(detect);
 const editing=draft!==null,found=statblockRolls(draft??text,editing?auto:detect);
 if(editing)return <div className="statblock-editor">
  <h2>Paste a statblock</h2>
  <p className="aside-hint">Paste from any book, site or system. It stays exactly as you pasted it, and rolls are found and made clickable. Only you see it.</p>
  <textarea className="editor statblock-input" aria-label="Statblock" autoFocus maxLength={50000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder={"Mire hound\nLarge beast, unaligned\nArmor Class 13\nHit Points 37 (5d10 + 10)\n…"}/>
  <label className="check-row"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> Find rolls automatically (turn off if a statblock reads oddly; [[1d20+5]] always works)</label>
  <div className="statblock-found"><span className="eyebrow">Found {found.length} roll{found.length===1?"":"s"}</span><div>{found.slice(0,14).map((s,i)=><RollChip key={i} title={entry.title} formula={s.formula!} label={[s.context,s.text.trim()].filter(Boolean).join(" ")}/>)}{found.length>14&&<span className="aside-hint">+{found.length-14} more</span>}</div></div>
  <div className="button-row"><button className="button primary" onClick={()=>{onChange({...c,statblock:draft.trim()?draft:undefined,statblockRolls:auto?undefined:false});setDraft(null);}}>Save statblock</button><button className="button" onClick={()=>{setDraft(null);setAuto(detect);}}>Cancel</button></div>
 </div>;
 if(!text)return <div className="character-empty"><h3>Paste any statblock.</h3><p>From a book, a website or your own notes. Rolls like “+5 to hit”, “2d8 + 3” and “Stealth +6” become clickable.</p><button className="button primary" onClick={()=>setDraft("")}><ClipboardPaste size={15}/> Paste a statblock</button></div>;
 return <div className="statblock-view"><div className="statblock-bar"><span>Pasted statblock · {found.length} roll{found.length===1?"":"s"}{detect?" found for you":""} · only you see this</span><button className="text-button" onClick={()=>{setDraft(text);setAuto(detect);}}><Pencil size={13}/> Edit statblock</button></div><StatblockText title={entry.title} text={text} detect={detect}/></div>;
}
