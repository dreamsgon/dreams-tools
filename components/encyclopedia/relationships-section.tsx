"use client";
/*
 * Relationships: the web of every tie in a campaign (or a world's shared lore). Filter it by group of tie and kind of
 * page, draw organization members and vehicle crew too, focus on one page and the pages around it, and switch to what
 * players see. Clicking a line lists the ties on it and opens them for editing; clicking a page focuses it. Drag to move
 * around, scroll or use the buttons to zoom. The side panel also works as a plain list for keyboards and screen readers.
 */
import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {ArrowUpRight,Eye,EyeOff,ListTree,Maximize2,Minus,Network,Plus,Search,X} from 'lucide-react';
import './quest-connections.css';
import './ties.css';
import './relationships.css';
import {playerCampaign,type Campaign,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {tieGroupInfo,tieGroups,tieTypesOf} from '@/lib/encyclopedia/ties';
import {buildWeb,filterWeb,focusWeb,layoutWeb,playersWebTies,radialLayout,webPageKindNames,webPageKinds,webTieLabel,webTies,type Point,type Web,type WebEdge,type WebPageKind,type WebTie} from '@/lib/encyclopedia/tie-web';
import {groupOf} from '@/lib/encyclopedia/quest-connections';
import {ConnectionGroups,tieTone,type ConnectionRow} from './connection-list';
import {Face,TargetPicker,kindName} from './quest-goals';
import {useTies} from './page-connections';
import {TieKinds} from './tie-types';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
const MAX_NODES=150;
/** How wide the drawing is in its own units: grows with the pages so a page and its name stay readable. */
const sizeFor=(n:number)=>Math.max(420,Math.round(Math.sqrt(n)*170));
const cut=(t:string,n:number)=>t.length>n?t.slice(0,n-1).trimEnd()+'…':t;
const initials=(t:string)=>t.split(/\s+/).filter(w=>/^\p{L}/u.test(w)).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
const toneOf=(t:WebTie)=>t.group==='worked'?'worked':tieTone(t.group);

/** The most connected pages, when there are too many to draw. */
function capWeb(web:Web):Web{
 if(web.nodes.length<=MAX_NODES)return web;
 const keep=new Set(web.nodes.slice(0,MAX_NODES).map(n=>n.id));
 return {nodes:web.nodes.filter(n=>keep.has(n.id)),edges:web.edges.filter(e=>keep.has(e.a)&&keep.has(e.b))};
}

type View={x:number;y:number;k:number};
function Canvas({web,at,focus,selected,players,onPage,onEdge}:{web:Web;at:Map<string,Point>;focus:string|null;selected:string|null;players:boolean;onPage:(id:string)=>void;onEdge:(key:string)=>void}){
 const svg=useRef<SVGSVGElement>(null),drag=useRef<{x:number;y:number;view:View;moved:boolean}|null>(null);
 const [moved,setMoved]=useState<{view:View;for:unknown}>({view:{x:0,y:0,k:1},for:null}),[hover,setHover]=useState<string|null>(null);
 // Fit the drawing whenever what is drawn changes.
 const bounds=useMemo(()=>{const ps=[...at.values()];if(!ps.length)return {x:-100,y:-100,w:200,h:200};const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),px=110,py=60;const x0=Math.min(...xs)-px,y0=Math.min(...ys)-py;return {x:x0,y:y0,w:Math.max(...xs)+px-x0,h:Math.max(...ys)+py+20-y0};},[at]);
 // Moving and zooming belong to one drawing: when what is drawn changes, it is fitted again.
 const view=moved.for===bounds?moved.view:{x:0,y:0,k:1};
 const setView=(next:View|((v:View)=>View))=>setMoved(m=>{const cur=m.for===bounds?m.view:{x:0,y:0,k:1};return {view:typeof next==='function'?next(cur):next,for:bounds};});
 const near=useMemo(()=>{if(!hover)return null;const s=new Set([hover]);for(const e of web.edges)if(e.a===hover||e.b===hover){s.add(e.a);s.add(e.b);}return s;},[hover,web.edges]);
 const unit=()=>{const el=svg.current;return el&&el.clientWidth?bounds.w/view.k/el.clientWidth:1;};
 const zoom=(f:number)=>setView(v=>({...v,k:Math.min(6,Math.max(0.3,v.k*f))}));
 // The wheel listener is added once (it must not be passive), so it calls the latest zoom through a ref.
 const zoomRef=useRef(zoom);
 useEffect(()=>{zoomRef.current=zoom;});
 useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();zoomRef.current(e.deltaY<0?1.15:1/1.15);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 const down=(e:ReactPointerEvent)=>{if((e.target as Element).closest('.rw-node,.rw-edge'))return;drag.current={x:e.clientX,y:e.clientY,view,moved:false};(e.currentTarget as Element).setPointerCapture(e.pointerId);};
 const move=(e:ReactPointerEvent)=>{const d=drag.current;if(!d)return;const u=unit(),dx=(e.clientX-d.x)*u,dy=(e.clientY-d.y)*u;if(Math.abs(dx)+Math.abs(dy)>2)d.moved=true;setView({...d.view,x:d.view.x-dx,y:d.view.y-dy});};
 const up=()=>{drag.current=null;};
 const w=bounds.w/view.k,h=bounds.h/view.k,cx=bounds.x+bounds.w/2+view.x,cy=bounds.y+bounds.h/2+view.y;
 const kindOf=new Map(web.nodes.map(n=>[n.id,n.kind]));
 const labels=web.nodes.length<=40||view.k>1.6;
 return <div className="rw-canvas">
  <svg ref={svg} viewBox={`${cx-w/2} ${cy-h/2} ${w} ${h}`} role="img" aria-label={`Relationship web: ${web.nodes.length} pages and ${web.edges.length} lines`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className={hover?'hovering':''}>
   {web.edges.map(e=>{const a=at.get(e.a),b=at.get(e.b);if(!a||!b)return null;const t=e.ties[0],gm=!players&&e.ties.every(x=>x.gm),worked=e.ties.every(x=>x.source==='worked');
    const lit=!near||(near.has(e.a)&&near.has(e.b)&&(e.a===hover||e.b===hover)),from=focus&&(e.a===focus||e.b===focus)?focus:e.a,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    const said=e.ties.map(x=>`${titleOf(web,x.fromId)} ${x.name} ${titleOf(web,x.toId)}${!players&&x.gm?' (GM only)':''}`).join('; ');
    return <g key={e.key} className={`rw-edge ${toneOf(t)}${gm?' gm':''}${worked?' worked':''}${selected===e.key?' on':''}${lit?'':' dim'}`} onClick={()=>onEdge(e.key)}>
     <title>{said}</title>
     <line className="rw-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>
     <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={Math.min(1.6+e.ties.length*0.8,5)}/>
     {(focus&&(e.a===focus||e.b===focus)||selected===e.key)&&<text x={mx} y={my-6} textAnchor="middle">{cut(webTieLabel(e.ties[0],from)+(e.ties.length>1?` +${e.ties.length-1}`:''),24)}</text>}
    </g>;})}
   {web.nodes.map(n=>{const p=at.get(n.id);if(!p)return null;const r=n.id===focus?26:Math.min(14+n.degree*1.5,22),lit=!near||near.has(n.id);
    return <g key={n.id} className={`rw-node ${kindOf.get(n.id)}${n.id===focus?' focus':''}${lit?'':' dim'}`} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button" aria-label={`${n.title}, ${n.degree} line${n.degree===1?'':'s'}`}
     onClick={()=>onPage(n.id)} onKeyDown={ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();onPage(n.id);}}} onPointerEnter={()=>setHover(n.id)} onPointerLeave={()=>setHover(null)} onFocus={()=>setHover(n.id)} onBlur={()=>setHover(null)}>
     <circle r={r}/>
     <text className="rw-initials" y={4} textAnchor="middle">{initials(n.title)}</text>
     {(labels||n.id===focus||lit&&near)&&<text className="rw-name" y={r+15} textAnchor="middle">{cut(n.title,22)}</text>}
    </g>;})}
  </svg>
  <div className="rw-zoom">
   <button type="button" className="icon-button" aria-label="Zoom in" onClick={()=>zoom(1.3)}><Plus size={15}/></button>
   <button type="button" className="icon-button" aria-label="Zoom out" onClick={()=>zoom(1/1.3)}><Minus size={15}/></button>
   <button type="button" className="icon-button" aria-label="Fit to the screen" onClick={()=>setView({x:0,y:0,k:1})}><Maximize2 size={15}/></button>
  </div>
 </div>;
}
const titleOf=(web:Web,id:string)=>web.nodes.find(n=>n.id===id)?.title??'';

/** One sentence per tie on a line, read-only (the players' view and worked-out lines). */
function TieSentences({ties,web,players}:{ties:WebTie[];web:Web;players:boolean}){
 return <ul className="rw-sentences">{ties.map(t=><li key={t.key}>
  <p><strong>{titleOf(web,t.fromId)}</strong> <span className={`qc-reason ${toneOf(t)}`}>{!players&&t.gm&&<EyeOff size={11} aria-label="GM only"/>}{t.name}</span> <strong>{titleOf(web,t.toId)}</strong></p>
  {t.note&&<small>{t.note}</small>}
  {!players&&t.gm&&t.cover&&<small className="rw-cover">Players believe: {t.cover.reversed?`${titleOf(web,t.toId)} ${t.cover.name} ${titleOf(web,t.fromId)}`:`${titleOf(web,t.fromId)} ${t.cover.name} ${titleOf(web,t.toId)}`}{t.cover.note?`. ${t.cover.note}`:''}</small>}
 </li>)}</ul>;
}

/** A line's ties in the GM's view: each opens the tie editor, and another tie can be added between the same pages. */
function EdgePanel({edge,web,data,campaignId,change,onOpen,onClose}:{edge:WebEdge;web:Web;data:Workspace;campaignId:string|null;change:Change;onOpen:(id:string)=>void;onClose:()=>void}){
 const a=data.entries.find(e=>e.id===edge.a)!,b=data.entries.find(e=>e.id===edge.b);
 const t=useTies({entry:a,data,campaignId,change});
 if(!b)return null;
 const typed=t.ties.filter(x=>x.otherId===b.id),worked=edge.ties.filter(x=>x.source==='worked');
 return <section className="rw-panel" aria-label={`${a.title} and ${b.title}`}>
  <div className="rw-panel-head"><span className="eyebrow">Between</span><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={14}/></button></div>
  <div className="rw-pair">{[a,b].map(e=><button type="button" key={e.id} onClick={()=>onOpen(e.id)}><Face entry={e} size={30}/><span className="rw-text"><strong>{e.title}</strong><small>{kindName(e)}</small></span><ArrowUpRight size={13}/></button>)}</div>
  {typed.length>0&&<ul className="rw-sentences">{typed.map(x=><li key={x.key}>
   <p><strong>{a.title}</strong> <button type="button" className={`qc-reason ${tieTone(x.type.group)}`} title="Change this tie" onClick={t.chips(b.id).find(c=>c.key===x.key)?.onClick}>{x.tie.gm&&<EyeOff size={11} aria-label="GM only"/>}{x.label}</button> <strong>{b.title}</strong></p>
   {x.tie.note&&<small>{x.tie.note}</small>}
   {x.tie.since||x.tie.until?<small>{[x.tie.since&&`Since ${x.tie.since}`,x.tie.until&&`until ${x.tie.until}`].filter(Boolean).join(' ')}</small>:null}
  </li>)}</ul>}
  {worked.length>0&&<><span className="eyebrow rw-sub">Worked out</span><TieSentences ties={worked} web={web} players={false}/></>}
  <button type="button" className="button small" onClick={()=>t.add(b.id)}><Plus size={14}/> Add another tie</button>
  {t.dialogs}
 </section>;
}

/** The focused page in the GM's view: its ties as on its Connections tab, with Add a tie. */
function FocusPanel({entry,data,campaignId,change,depth,setDepth,onOpen,onClose}:{entry:Entry;data:Workspace;campaignId:string|null;change:Change;depth:number;setDepth:(d:number)=>void;onOpen:(id:string)=>void;onClose:()=>void}){
 const t=useTies({entry,data,campaignId,change}),[picking,setPicking]=useState(false);
 const byId=new Map(data.entries.map(e=>[e.id,e]));
 const rows:ConnectionRow[]=[...new Set(t.ties.map(x=>x.otherId))].flatMap(id=>{const e=byId.get(id);return e?[{entry:e,group:groupOf(e),chips:t.chips(id),notes:t.notes(id)}]:[];}).sort((x,y)=>x.entry.title.localeCompare(y.entry.title));
 return <section className="rw-panel" aria-label={entry.title}>
  <div className="rw-panel-head"><span className="eyebrow">Focus</span><button type="button" className="icon-button" aria-label="Clear focus" onClick={onClose}><X size={14}/></button></div>
  <button type="button" className="rw-focus-page" onClick={()=>onOpen(entry.id)}><Face entry={entry} size={40}/><span className="rw-text"><strong>{entry.title}</strong><small>{kindName(entry)} · open page</small></span><ArrowUpRight size={14}/></button>
  <div className="segmented rw-depth" role="radiogroup" aria-label="How far out">
   <button type="button" role="radio" aria-checked={depth===1} className={depth===1?'on':''} onClick={()=>setDepth(1)}>Its ties</button>
   <button type="button" role="radio" aria-checked={depth===2} className={depth===2?'on':''} onClick={()=>setDepth(2)}>Two steps out</button>
  </div>
  <div className="goal-anchor rw-add"><button type="button" className="button small primary" disabled={!t.pages.length} onClick={()=>setPicking(true)}><Plus size={14}/> Add a tie</button>
   {picking&&<TargetPicker label={`Tie ${entry.title} to…`} pages={t.pages} current="" onClose={()=>setPicking(false)} onPage={id=>{setPicking(false);t.add(id);}}/>}</div>
  {rows.length?<ConnectionGroups rows={rows} onOpen={onOpen}/>:<p className="muted">No ties yet.</p>}
  {t.dialogs}
 </section>;
}

export function RelationshipsSection({data,worldId,campaign,change,onOpen}:{data:Workspace;worldId:string;campaign?:Campaign;change:Change;onOpen:(id:string)=>void}){
 const world=data.worlds.find(w=>w.id===worldId),campaignId=campaign?.id??null;
 const types=useMemo(()=>tieTypesOf(world),[world]);
 const [worked,setWorked]=useState(false),[players,setPlayers]=useState(false);
 const [hiddenGroups,setHiddenGroups]=useState<Set<string>>(()=>new Set()),[hiddenKinds,setHiddenKinds]=useState<Set<WebPageKind>>(()=>new Set());
 const [focus,setFocus]=useState<string|null>(null),[depth,setDepth]=useState(1),[edgeKey,setEdgeKey]=useState<string|null>(null);
 const [picking,setPicking]=useState(false),[kinds,setKinds]=useState(false);
 const all=useMemo(()=>webTies(data,worldId,campaignId,{worked,types}),[data,worldId,campaignId,worked,types]);
 const readable=useMemo(()=>players&&campaign?new Set(playerCampaign(data,campaign.id).entries.map(e=>e.id)):null,[players,campaign,data]);
 const ties=useMemo(()=>readable?playersWebTies(all,id=>readable.has(id),id=>data.entries.find(e=>e.id===id)?.profile?.visibility==='players'):all,[all,readable,data.entries]);
 const web=useMemo(()=>buildWeb(data,ties),[data,ties]);
 const groupCounts=useMemo(()=>{const m=new Map<string,number>();for(const e of web.edges)for(const t of e.ties)m.set(t.group,(m.get(t.group)??0)+1);return m;},[web]);
 const kindCounts=useMemo(()=>{const m=new Map<string,number>();for(const n of web.nodes)m.set(n.kind,(m.get(n.kind)??0)+1);return m;},[web]);
 const filtered=useMemo(()=>filterWeb(web,new Set([...tieGroups,'worked'].filter(g=>!hiddenGroups.has(g))),new Set(webPageKinds.filter(k=>!hiddenKinds.has(k)))),[web,hiddenGroups,hiddenKinds]);
 const focused=focus&&filtered.nodes.some(n=>n.id===focus)?focus:null;
 const shown=useMemo(()=>focused?focusWeb(filtered,focused,depth):capWeb(filtered),[filtered,focused,depth]);
 const at=useMemo(()=>focused?radialLayout(shown,focused,sizeFor(shown.nodes.length)*1.3):layoutWeb(shown,sizeFor(shown.nodes.length)),[shown,focused]);
 const edge=edgeKey?shown.edges.find(e=>e.key===edgeKey):undefined;
 const focusEntry=focused?data.entries.find(e=>e.id===focused):undefined;
 const pages=useMemo(()=>{const ids=new Set(web.nodes.map(n=>n.id));return data.entries.filter(e=>ids.has(e.id)).sort((a,b)=>a.title.localeCompare(b.title));},[data.entries,web.nodes]);
 const toggle=<T,>(set:Set<T>,v:T)=>{const n=new Set(set);if(n.has(v))n.delete(v);else n.add(v);return n;};
 const pickPage=(id:string)=>{setEdgeKey(null);setFocus(f=>f===id&&!edgeKey?null:id);};
 const sharedCount=all.filter(t=>t.source!=='worked'&&(!t.gm||t.cover)).length,gmCount=all.filter(t=>t.source!=='worked'&&t.gm&&!t.cover).length;
 const tieCount=ties.filter(t=>t.source!=='worked').length,top=filtered.nodes.slice(0,12);

 return <section className="page-content relationships-page">
  <div className="dashboard-intro rw-intro">
   <div><span className="eyebrow">{campaign?campaign.name:`${world?.name??'World'} · shared lore`}</span><h1>Relationships</h1>
    <p className="subtitle">{web.nodes.length?`${web.nodes.length} page${web.nodes.length===1?'':'s'} and ${tieCount} tie${tieCount===1?'':'s'}${players?' players can see':`, ${sharedCount} players can see and ${gmCount} GM only`}.`:'Every tie in this campaign, drawn as one web.'}</p></div>
   <div className="button-row">
    {!players&&<button type="button" className="button small" onClick={()=>setKinds(true)}><ListTree size={14}/> Kinds of tie</button>}
    {campaign&&<div className="segmented" role="radiogroup" aria-label="Whose view">
     <button type="button" role="radio" aria-checked={!players} className={!players?'on':''} onClick={()=>setPlayers(false)}><EyeOff size={13}/> GM view</button>
     <button type="button" role="radio" aria-checked={players} className={players?'on':''} onClick={()=>{setPlayers(true);setEdgeKey(null);}}><Eye size={13}/> What players see</button>
    </div>}
   </div>
  </div>
  {players&&<p className="sharing-hint">This is the web as players would see it: shared ties, and cover stories in place of GM-only ties, between pages they can read. Players don’t have this page yet.</p>}
  {web.nodes.length>0&&<div className="rw-filters">
   <div className="tie-filter" role="group" aria-label="Kinds of tie shown">
    {tieGroups.filter(g=>groupCounts.has(g)).map(g=><button type="button" key={g} className={tieTone(g)} aria-pressed={!hiddenGroups.has(g)} onClick={()=>setHiddenGroups(toggle(hiddenGroups,g))} title={tieGroupInfo[g].about}><i aria-hidden="true"/>{tieGroupInfo[g].name} <small>{groupCounts.get(g)}</small></button>)}
    <button type="button" className="worked" aria-pressed={worked} onClick={()=>setWorked(!worked)} title="Organization members and vehicle crew"><i aria-hidden="true"/>Members and crew</button>
   </div>
   <div className="tie-filter" role="group" aria-label="Pages shown">
    {webPageKinds.filter(k=>kindCounts.has(k)).map(k=><button type="button" key={k} aria-pressed={!hiddenKinds.has(k)} onClick={()=>setHiddenKinds(toggle(hiddenKinds,k))}>{webPageKindNames[k]} <small>{kindCounts.get(k)}</small></button>)}
    <span className="goal-anchor"><button type="button" className="button small" onClick={()=>setPicking(true)}><Search size={14}/> Find a page</button>
     {picking&&<TargetPicker label="Focus on…" pages={pages} current="" onClose={()=>setPicking(false)} onPage={id=>{setPicking(false);setEdgeKey(null);setFocus(id);if(!filtered.nodes.some(n=>n.id===id)){setHiddenGroups(new Set());setHiddenKinds(new Set());}}}/>}</span>
   </div>
  </div>}
  {!web.nodes.length?<div className="qc-empty rw-empty"><Network size={26} aria-hidden="true"/><p>{players?'Players can’t see any ties yet. Share a tie, or give a GM-only one a cover story.':'No ties yet. Open a page and use its Connections tab to add one, or drag a page onto it from the sidebar.'}</p>{!players&&!worked&&<button type="button" className="button small" onClick={()=>setWorked(true)}>Show members and crew</button>}</div>
  :<div className="rw-body">
   <div className="rw-main">
    {shown.nodes.length?<Canvas web={shown} at={at} focus={focused} selected={edge?.key??null} players={players} onPage={pickPage} onEdge={k=>setEdgeKey(k===edgeKey?null:k)}/>:<div className="qc-empty"><p>Nothing matches these filters.</p></div>}
    {!focused&&filtered.nodes.length>MAX_NODES&&<p className="muted rw-note">The web shows the {MAX_NODES} most connected pages of {filtered.nodes.length}. Focus on a page to see the rest.</p>}
    <p className="muted rw-note">Click a page to focus on it and a line to see its ties. Drag to move around; scroll or use the buttons to zoom. Dashed lines are GM only.</p>
   </div>
   <aside className="rw-side">
    {edge?(players||edge.ties.every(t=>t.source==='worked')
      ?<section className="rw-panel"><div className="rw-panel-head"><span className="eyebrow">Between</span><button type="button" className="icon-button" aria-label="Close" onClick={()=>setEdgeKey(null)}><X size={14}/></button></div><TieSentences ties={edge.ties} web={shown} players={players}/></section>
      :<EdgePanel key={edge.key} edge={edge} web={shown} data={data} campaignId={campaignId} change={change} onOpen={onOpen} onClose={()=>setEdgeKey(null)}/>)
    :focusEntry?(players
      ?<section className="rw-panel"><div className="rw-panel-head"><span className="eyebrow">Focus</span><button type="button" className="icon-button" aria-label="Clear focus" onClick={()=>setFocus(null)}><X size={14}/></button></div>
        <button type="button" className="rw-focus-page" onClick={()=>onOpen(focusEntry.id)}><Face entry={focusEntry} size={40}/><span className="rw-text"><strong>{focusEntry.title}</strong><small>{kindName(focusEntry)} · open page</small></span><ArrowUpRight size={14}/></button>
        <TieSentences ties={shown.edges.filter(e=>e.a===focusEntry.id||e.b===focusEntry.id).flatMap(e=>e.ties)} web={shown} players/></section>
      :<FocusPanel key={focusEntry.id} entry={focusEntry} data={data} campaignId={campaignId} change={change} depth={depth} setDepth={setDepth} onOpen={onOpen} onClose={()=>setFocus(null)}/>)
    :<section className="rw-panel">
      <span className="eyebrow">Most connected</span>
      <ul className="rw-top">{top.map(n=><li key={n.id}><button type="button" onClick={()=>setFocus(n.id)}><span className={`rw-dot ${n.kind}`} aria-hidden="true"/><span>{n.title}</span><small>{n.degree}</small></button></li>)}</ul>
     </section>}
   </aside>
  </div>}
  {kinds&&world&&<TieKinds world={world} data={data} change={change} onClose={()=>setKinds(false)}/>}
 </section>;
}

