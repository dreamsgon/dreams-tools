'use client';
import type {ReactNode} from 'react';
import type {PlayerProfile,PlayerProfileBlock} from '@/lib/encyclopedia/character-profile';
import type {EmblemSymbol,Standing} from '@/lib/encyclopedia/org-profile';
import {Avatar,BottomBar,GmChip,PageLink,PersonLine,StandingPill,symbolIcons} from './org-parts';
import './org-profile.css';

/** One trait: a short chip with an optional symbol. */
export function TraitChip({label,symbol,gm,children}:{label:string;symbol?:EmblemSymbol;gm?:boolean;children?:ReactNode}){
 const Icon=symbol?symbolIcons[symbol]:null;
 return <span className={`char-trait${gm?' is-gm':''}`}>{Icon&&<Icon size={13} aria-hidden="true"/>}<span className="char-trait-label">{label||'Untitled'}</span>{gm&&<GmChip/>}{children}</span>;
}

/** An organization a character is in: its emblem (or initials), name, type, their role and the standing. */
export function OrgLine({lead,id,title,type,role,standing,gm,open,children}:{lead:ReactNode;id:string;title:string;type?:string;role?:string;standing?:Standing;gm?:boolean;open?:(id:string)=>void;children?:ReactNode}){
 return <div className="org-person char-org">{lead}<span className="org-person-text"><strong><PageLink id={id} open={open}>{title||'Missing page'}</PageLink></strong>{(role||type)&&<small>{role&&<span className="char-org-role">{role}</span>}{role&&type&&' · '}{type}</small>}</span>{gm&&<GmChip/>}<StandingPill standing={standing}/>{children}</div>;
}

/** A block of a shared character profile, read only. */
function ReadBlock({block,open}:{block:PlayerProfileBlock;open?:(id:string)=>void}){
 return <section className={`org-block${block.full?' is-full':''}`}><header className="org-block-head"><h3 className="org-block-title">{block.title}</h3></header><div className="org-block-body">
  {block.kind==='beliefs'&&(block.beliefs.length?block.beliefs.map(b=><div className="org-belief" key={b.id}><span className="org-belief-topic">{b.topic}</span><strong>{b.stance}</strong>{b.detail&&<p>{b.detail}</p>}</div>):<p className="org-empty">Nothing here yet</p>)}
  {block.kind==='organizations'&&(block.organizations.length?block.organizations.map(o=><OrgLine key={o.id} lead={<Avatar title={o.title}/>} id={o.id} title={o.title} type={o.type} role={o.role} standing={o.standing} open={open}/>):<p className="org-empty">Nothing here yet</p>)}
  {block.kind==='ties'&&(block.ties.length?block.ties.map(t=><PersonLine key={t.id} id={t.entryId} title={t.title} note={t.note} open={open}/>):<p className="org-empty">Nothing here yet</p>)}
  {block.kind==='text'&&<p className="org-text">{block.text}</p>}
  {block.kind==='linked'&&(block.linked.length?block.linked.map(l=><div className="org-holding" key={l.id}><PageLink id={l.id} open={open}>{l.title}</PageLink></div>):<p className="org-empty">No pages mention this yet</p>)}
 </div></section>;
}

/** The character's profile exactly as players get it: used on the player pages and for the GM's Player view button. */
export function CharacterReadOnly({profile,open}:{profile:PlayerProfile;open?:(id:string)=>void}){
 const rows:ReactNode[]=[];let left:PlayerProfileBlock[]=[],right:PlayerProfileBlock[]=[];
 const flush=()=>{if(left.length||right.length)rows.push(<div className="org-row" key={`r${rows.length}`}><div className="org-col">{left.map(b=><ReadBlock key={b.id} block={b} open={open}/>)}</div><div className="org-col">{right.map(b=><ReadBlock key={b.id} block={b} open={open}/>)}</div></div>);left=[];right=[];};
 for(const b of profile.blocks){if(b.full){flush();rows.push(<div className="org-row is-full" key={b.id}><ReadBlock block={b} open={open}/></div>);}else (b.column==='left'?left:right).push(b);}
 flush();
 return <div className="org-profile char-profile is-readonly">
  {profile.traits.length>0&&<div className="char-traits" role="list" aria-label="Traits">{profile.traits.map(t=><span role="listitem" key={t.id}><TraitChip label={t.label} symbol={t.symbol}/></span>)}</div>}
  <div className="org-board">{rows}</div>
  {profile.bar&&profile.bar.fields.length>0&&<BottomBar title={profile.bar.title} fields={profile.bar.fields}/>}</div>;
}
