'use client';
import type {CSSProperties,ReactNode} from 'react';
import {Anchor,Crown,Swords,Sparkles,Moon,Scale,Castle,Flower,Skull,Sailboat,Key,Eye,Hammer,Flame,Flag,type LucideIcon} from 'lucide-react';
import {defaultMapColour,standingNames,type EmblemSymbol,type OrgEmblem,type PlayerOrg,type PlayerOrgBlock,type Standing} from '@/lib/encyclopedia/org-profile';
import {usePictureSrc} from './character-picture';
import './org-profile.css';

/** The symbols an emblem can hold (lib/encyclopedia/org-profile.ts emblemSymbols). */
export const symbolIcons: Record<EmblemSymbol,LucideIcon>={anchor:Anchor,crown:Crown,swords:Swords,sparkles:Sparkles,moon:Moon,scale:Scale,castle:Castle,flower:Flower,skull:Skull,sailboat:Sailboat,key:Key,eye:Eye,hammer:Hammer,flame:Flame};
export const symbolNames:Record<EmblemSymbol,string>={anchor:'Anchor',crown:'Crown',swords:'Crossed swords',sparkles:'Sparkles',moon:'Moon',scale:'Scales',castle:'Castle',flower:'Flower',skull:'Skull',sailboat:'Sailboat',key:'Key',eye:'Eye',hammer:'Hammer',flame:'Flame'};

/** The shape with the symbol or picture inside it, tinted with the symbol colour. */
export function Emblem({emblem,size=72,token,initial}:{emblem:OrgEmblem;size?:number;token?:string;initial?:string}){
 const {src}=usePictureSrc(emblem.imageId,token),colour=emblem.colour??'var(--accent)',Icon=emblem.symbol?symbolIcons[emblem.symbol]:null;
 const inner=src?<span className="org-emblem-picture" style={{backgroundImage:`url("${src}")`}}/>:Icon?<Icon size={Math.round(size*.46)} strokeWidth={1.75}/>:<span className="org-emblem-initial">{(initial??'').trim().charAt(0).toUpperCase()||<Flag size={Math.round(size*.4)}/>}</span>;
 if(emblem.shape==='none')return <span className="org-emblem shape-none" aria-hidden="true" style={{'--emblem':colour,width:size,height:size} as CSSProperties}>{inner}</span>;
 return <span className={`org-emblem shape-${emblem.shape}`} aria-hidden="true" style={{'--emblem':colour,width:size,height:emblem.shape==='round'?size:Math.round(size*1.12)} as CSSProperties}><span className="org-emblem-face">{inner}</span></span>;
}

/** The banner: the uploaded picture, or a soft wash of the map colour. */
export function OrgBanner({emblem,banner,type,motto,title,campaignName,token,actions,rename}:{emblem:OrgEmblem;banner?:{imageId:string};type?:string;motto?:string;title:string;campaignName?:string;token?:string;actions?:ReactNode;rename?:ReactNode}){
 const {src}=usePictureSrc(banner?.imageId,token),map=emblem.mapColour??defaultMapColour;
 const eyebrow=[type,campaignName].filter(Boolean).join(' · ');
 return <header className={`org-banner${src?' has-image':''}`} style={{'--map':map,...(src?{backgroundImage:`url("${src}")`}:{})} as CSSProperties}>
  <div className="org-banner-body"><Emblem emblem={emblem} size={84} token={token} initial={title}/>
   <div className="org-banner-text">{eyebrow&&<span className="org-eyebrow">{eyebrow}</span>}<h1 className="org-title">{title}{rename}</h1>{motto&&<p className="org-motto">{motto}</p>}</div>
   {actions&&<div className="org-banner-actions">{actions}</div>}</div>
 </header>;
}

export const StandingPill=({standing}:{standing?:Standing})=>standing?<span className={`org-pill st-${standing}`}>{standingNames[standing]}</span>:null;
export const GmChip=()=><span className="org-gm-chip">GM only</span>;
const initials=(title:string)=>title.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w.charAt(0).toUpperCase()).join('')||'?';
export const Avatar=({title,size=30}:{title:string;size?:number})=><span className="org-avatar" aria-hidden="true" style={{width:size,height:size,fontSize:Math.round(size*.38)}}>{initials(title)}</span>;
/** A small overlapping stack of members' initials, with how many more there are. */
export function Stack({people,max=4}:{people:{id:string;title:string}[];max?:number}){
 if(!people.length)return <span className="org-stack-empty">No members yet</span>;
 const shown=people.slice(0,max);
 return <span className="org-stack" aria-label={`${people.length} ${people.length===1?'member':'members'}`}>{shown.map(p=><Avatar key={p.id} title={p.title} size={26}/>)}{people.length>max&&<span className="org-avatar org-stack-more" aria-hidden="true">+{people.length-max}</span>}</span>;
}

export const PageLink=({id,children,open}:{id:string;children:ReactNode;open?:(id:string)=>void})=>open?<button type="button" className="wiki-link" onClick={()=>open(id)}>{children}</button>:<span>{children}</span>;

/** The bottom bar: "Right now" and its fields. */
export function BottomBar({title,fields,children}:{title:string;fields:{id:string;label:string;value:string;gm?:boolean}[];children?:ReactNode}){
 return <section className="org-bar" aria-label={title||'Right now'}><div className="org-bar-title"><span className="org-eyebrow">{title||'Right now'}</span>{children}</div>
  <div className="org-bar-fields">{fields.map(f=><div key={f.id} className="org-bar-field"><span className="org-bar-label">{f.label}{f.gm&&<GmChip/>}</span><span className="org-bar-value">{f.value}</span></div>)}</div></section>;
}

/** One person: picture initials, name, note and standing. */
export function PersonLine({title,note,role,standing,gm,open,id,lead,children}:{title:string;note?:string;role?:string;standing?:Standing;gm?:boolean;open?:(id:string)=>void;id:string;/** Replaces the initials, for example an organization's emblem. */lead?:ReactNode;children?:ReactNode}){
 return <div className="org-person">{lead??<Avatar title={title}/>}<span className="org-person-text"><strong><PageLink id={id} open={open}>{title||'Missing page'}</PageLink></strong>{(role||note)&&<small>{role||note}</small>}</span>{gm&&<GmChip/>}<StandingPill standing={standing}/>{children}</div>;
}

type Board=PlayerOrgBlock;
/** A block of a shared profile, read only. */
function ReadBlock({block,open}:{block:Board;open?:(id:string)=>void}){
 return <section className={`org-block${block.full?' is-full':''}`}><header className="org-block-head"><h3 className="org-block-title">{block.title}</h3></header><div className="org-block-body">
  {block.kind==='spots'&&(block.spots.length?block.spots.map(s=><div className="org-spot" key={s.id}><h4>{s.title}</h4>{s.people.length?s.people.map(p=><PersonLine key={p.id} id={p.entryId} title={p.title} note={p.note} standing={p.standing} open={open}/>):<p className="org-empty">Nobody here yet</p>}</div>):<p className="org-empty">Nothing here yet</p>)}
  {block.kind==='members'&&(block.members.length?block.members.map(m=><PersonLine key={m.id} id={m.entryId} title={m.title} role={m.role} standing={m.standing} open={open}/>):<p className="org-empty">No members yet</p>)}
  {block.kind==='facts'&&(block.facts.length?<dl className="org-facts">{block.facts.map(f=><div key={f.id}><dt>{f.label}</dt><dd>{f.entryId?<PageLink id={f.entryId} open={open}>{f.value||'Open page'}</PageLink>:f.value}</dd></div>)}</dl>:<p className="org-empty">Nothing here yet</p>)}
  {block.kind==='beliefs'&&(block.beliefs.length?block.beliefs.map(b=><div className="org-belief" key={b.id}><span className="org-belief-topic">{b.topic}</span><strong>{b.stance}</strong>{b.detail&&<p>{b.detail}</p>}</div>):<p className="org-empty">Nothing here yet</p>)}
  {block.kind==='holdings'&&(block.holdings.length?block.holdings.map(h=><div className="org-holding" key={h.id}><PageLink id={h.entryId} open={open}>{h.title||'Missing page'}</PageLink></div>):<p className="org-empty">Nothing here yet</p>)}
  {block.kind==='text'&&<p className="org-text">{block.text}</p>}
  {block.kind==='subgroups'&&(block.subgroups.length?<div className="org-subgroups">{block.subgroups.map(g=><button type="button" key={g.id} className="org-subgroup" onClick={()=>open?.(g.id)}><strong>{g.title}</strong><Stack people={g.members}/></button>)}</div>:<p className="org-empty">No subgroups yet</p>)}
  {block.kind==='linked'&&(block.linked.length?block.linked.map(l=><div className="org-holding" key={l.id}><PageLink id={l.id} open={open}>{l.title}</PageLink></div>):<p className="org-empty">No pages mention this yet</p>)}
 </div></section>;
}

/** The profile exactly as players get it: used on the player pages and for the GM's Player view button. */
export function OrgReadOnly({org,title,campaignName,token,open}:{org:PlayerOrg;title:string;campaignName?:string;token?:string;open?:(id:string)=>void}){
 const rows:ReactNode[]=[];let left:Board[]=[],right:Board[]=[];
 const flush=()=>{if(left.length||right.length)rows.push(<div className="org-row" key={`r${rows.length}`}><div className="org-col">{left.map(b=><ReadBlock key={b.id} block={b} open={open}/>)}</div><div className="org-col">{right.map(b=><ReadBlock key={b.id} block={b} open={open}/>)}</div></div>);left=[];right=[];};
 for(const b of org.blocks){if(b.full){flush();rows.push(<div className="org-row is-full" key={b.id}><ReadBlock block={b} open={open}/></div>);}else (b.column==='left'?left:right).push(b);}
 flush();
 return <div className="org-profile is-readonly"><OrgBanner emblem={org.emblem} banner={org.banner} type={org.type} motto={org.motto} title={title} campaignName={campaignName} token={token}/>
  <div className="org-board">{rows}</div>
  {org.bar&&org.bar.fields.length>0&&<BottomBar title={org.bar.title} fields={org.bar.fields}/>}</div>;
}
