"use client";
/*
 * Family trees: a family drawn from its family ties (parents, partners, siblings, wards), eldest at the top. Pick a
 * family (a noble house, clan or family organization, or a group of relatives no organization covers) or start from
 * any person. Click someone to see their family on the side and, as the GM, add a parent, partner, child or sibling:
 * a page that exists, or a new character by name. On a phone the tree is an outline, eldest first.
 */
import {useMemo,useState,type ReactNode} from 'react';
import {ArrowUpRight,Dices,Eye,EyeOff,GitFork,Plus,Search,X} from 'lucide-react';
import './ties.css';
import './relationships.css';
import './family-tree.css';
import {newId,playerCampaign,type Campaign,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {tieTypesOf} from '@/lib/encyclopedia/ties';
import {playersWebTies,webPages,webTies} from '@/lib/encyclopedia/tie-web';
import {canHoldTie} from '@/lib/encyclopedia/tie-edit';
import {BOX_H,BOX_W,addKin,familyChoices,familyGraph,familyLinks,familyOrgsOf,familyRoles,familyTree,kinType,linked,relativesOf,type FamilyChoice,type FamilyGraph,type FamilyTree,type KinRole,type TreeLine} from '@/lib/encyclopedia/family-tree';
import {useNarrow} from './connection-list';
import {Face,TargetPicker,kindName} from './quest-goals';
import {useTies} from './page-connections';
import {ZoomButtons,usePanZoom} from './pan-zoom';
import {GenerateFamily} from './relationship-generators';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
const cut=(t:string,n:number)=>t.length>n?t.slice(0,n-1).trimEnd()+'…':t;
const statusWords:Record<string,string>={missing:'Missing',inactive:'Inactive'};

/** What a person's box says besides their name. */
export type BoxInfo={badge?:string;sub?:string;dead:boolean;secret:boolean;fresh?:boolean};

function boxInfo(tree:FamilyTree,g:FamilyGraph,byId:Map<string,Entry>,roles:Map<string,string>,orgsOf:Map<string,Entry[]>,orgId:string|undefined,players:boolean,seeds:string[]):Map<string,BoxInfo>{
 const out=new Map<string,BoxInfo>();
 for(const id of tree.at.keys()){
  const e=byId.get(id),c=e?.character;
  // Someone tied into the tree only by GM-only ties is a secret the players don't know.
  const mine=g.links.filter(l=>(l.fromId===id&&tree.at.has(l.toId))||(l.toId===id&&tree.at.has(l.fromId)));
  const secret=!players&&!seeds.includes(id)&&mine.length>0&&mine.every(l=>l.gm);
  const ward=linked(g.guardians,id).size>0&&![...linked(g.parents,id)].some(p=>tree.at.has(p));
  const other=(orgsOf.get(id)??[]).find(o=>o.id!==orgId);
  const badge=roles.get(id)??(secret?'GM only':ward?'Ward':undefined);
  out.set(id,{badge,sub:tree.inLaws.has(id)&&other?`of ${other.title}`:c&&statusWords[c.status]?statusWords[c.status]:undefined,dead:c?.status==='deceased',secret});
 }
 return out;
}

function Line({line,players}:{line:TreeLine;players:boolean}){
 const pts=line.points.map(p=>p.join(',')).join(' '),gm=!players&&line.gm;
 if(line.kind==='partner')return <g className={`ft-line partner${gm?' gm':''}`}><polyline className="ft-outer" points={pts}/><polyline className="ft-inner" points={pts}/></g>;
 return <polyline className={`ft-line ${line.kind}${gm?' gm':''}`} points={pts}/>;
}

/** Screen pixels per unit below which names are too small to read: a big family starts zoomed in, around its first person. */
const READABLE=0.9;
/** With `whole`, the whole tree is shown however small (a preview); otherwise a big family opens zoomed in. */
export function TreeCanvas({tree,info,titles,selected,players,focus,whole,onPick}:{tree:FamilyTree;info:Map<string,BoxInfo>;titles:Map<string,string>;selected:string|null;players:boolean;focus?:string;whole?:boolean;onPick:(id:string)=>void}){
 // A small family isn't blown up to fill the space: the drawing is at least as big as a few boxes across.
 const bounds=useMemo(()=>{const w=Math.max(tree.width+72,4*BOX_W),h=Math.max(tree.height+70,2.4*BOX_H+70);return {x:tree.width/2-w/2,y:-40,w,h};},[tree]);
 const {svg,viewBox,handlers,zoom,fit}=usePanZoom(bounds,'.ft-node',whole?{}:{minScale:READABLE,focus:focus?tree.at.get(focus):undefined});
 return <div className="rw-canvas ft-canvas">
  <svg ref={svg} viewBox={viewBox} role="group" aria-label={`Family tree of ${tree.at.size} people`} {...handlers} style={{height:`min(calc(640px / var(--ui-zoom, 1)), max(calc(340px / var(--ui-zoom, 1)), ${Math.round(bounds.h/bounds.w*100)}cqw, calc(${Math.round(bounds.h*READABLE)}px / var(--ui-zoom, 1))))`}}>
   {tree.lines.map(l=><Line key={l.key} line={l} players={players}/>)}
   {[...tree.at].map(([id,p])=>{const i=info.get(id),name=cut(titles.get(id)??'',i?.dead?17:19);
    const bw=i?.badge?Math.min(BOX_W-24,cut(i.badge,18).length*6.4+12):0,top=i?.badge?33:i?.sub?24:31;
    return <g key={id} className={`ft-node${tree.inLaws.has(id)?' inlaw':''}${selected===id?' on':''}${i?.secret?' secret':''}${i?.fresh?' fresh':''}`} transform={`translate(${p.x-BOX_W/2} ${p.y})`} role="button" tabIndex={0}
     aria-label={`${titles.get(id)}${i?.dead?', died':''}${i?.badge?`, ${i.badge}`:''}${i?.sub?`, ${i.sub}`:''}`} aria-pressed={selected===id}
     onClick={()=>onPick(id)} onKeyDown={ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();onPick(id);}}}>
     <title>{titles.get(id)}</title>
     <rect className="ft-box" width={BOX_W} height={BOX_H} rx={6}/>
     <rect className="ft-bar" width={4} height={BOX_H-8} y={4} rx={2}/>
     {i?.badge&&<g className="ft-badge"><rect x={BOX_W-bw-7} y={6} width={bw} height={15} rx={3}/><text x={BOX_W-7-bw/2} y={16.5} textAnchor="middle">{cut(i.badge,18)}</text></g>}
     <text className="ft-name" x={14} y={top}>{name}{i?.dead?' †':''}</text>
     {i?.sub&&<text className="ft-sub" x={14} y={top+14}>{cut(i.sub,24)}</text>}
    </g>;})}
  </svg>
  <ZoomButtons zoom={zoom} fit={fit}/>
 </div>;
}

/** The tree as nested lists, eldest first: each couple, then their children. For phones, and to read without the drawing. */
export function Outline({tree,g,info,byId,selected,onPick}:{tree:FamilyTree;g:FamilyGraph;info:Map<string,BoxInfo>;byId:Map<string,Entry>;selected:string|null;onPick:(id:string)=>void}){
 const units=new Map(tree.units.map(u=>[u.id,u]));
 const person=(id:string)=>{const e=byId.get(id),i=info.get(id);return <button type="button" className={`ft-person${selected===id?' on':''}${i?.secret?' secret':''}`} aria-pressed={selected===id} onClick={()=>onPick(id)}>
  <Face entry={e} size={34}/><span className="rw-text"><strong>{e?.title}{i?.dead?' †':''}</strong>{(i?.badge||i?.sub)&&<small>{[i?.badge,i?.sub].filter(Boolean).join(' · ')}</small>}</span></button>;};
 const unit=(uid:string):ReactNode=>{const u=units.get(uid)!,kids=tree.kids.get(uid)??[];
  return <li key={uid} className="ft-unit">
   <div className="ft-couple">{u.people.map((p,i)=><div key={p}>{i>0&&<span className="ft-joined">{linked(g.partners,p).has(u.people[i-1])?'= married to':'and'}</span>}{person(p)}</div>)}</div>
   {kids.length>0&&<div className="ft-kids"><span className="eyebrow">{u.people.length>1?'Their children':'Children'}</span><ul>{kids.map(unit)}</ul></div>}
  </li>;};
 const gens=[...new Set(tree.roots.map(r=>units.get(r)!.gen))].sort((a,b)=>a-b);
 return <div className="ft-outline">{gens.map(n=><section key={n}>
  <span className="eyebrow">{n===0?'Eldest generation':`${n+1}${n===1?'nd':n===2?'rd':'th'} generation`}</span>
  <ul>{tree.roots.filter(r=>units.get(r)!.gen===n).map(unit)}</ul>
 </section>)}</div>;
}

const kinWords:Record<KinRole,{button:string;picker:(name:string)=>string}>={
 parent:{button:'Add a parent',picker:n=>`A parent of ${n}`},
 partner:{button:'Add a partner',picker:n=>`Married to ${n}`},
 child:{button:'Add a child',picker:n=>`A child of ${n}`},
 sibling:{button:'Add a sibling',picker:n=>`A sibling of ${n}`},
};

/** The chosen person: their family, and (for the GM) buttons to add relatives and change the ties. */
function PersonPanel({entry,g,tree,data,campaignId,change,players,byId,families,onPick,onOpen,onFamily,onClose}:{entry:Entry;g:FamilyGraph;tree:FamilyTree;data:Workspace;campaignId:string|null;change:Change;players:boolean;byId:Map<string,Entry>;families:Entry[];onPick:(id:string)=>void;onOpen:(id:string)=>void;onFamily:(orgId:string)=>void;onClose:()=>void}){
 const t=useTies({entry,data,campaignId,change:players?undefined:change});
 const [adding,setAdding]=useState<{role:KinRole;with?:string}|null>(null),[notice,setNotice]=useState('');
 const relatives=relativesOf(g,entry.id).filter(r=>byId.has(r.id));
 const partners=[...linked(g.partners,entry.id)].filter(id=>byId.has(id));
 const people=useMemo(()=>webPages(data,entry.worldId,campaignId).filter(e=>e.kind==='character'&&e.id!==entry.id).sort((a,b)=>a.title.localeCompare(b.title)),[data,entry,campaignId]);
 const fits=(role:KinRole,other:Entry)=>role==='parent'?canHoldTie(other,entry):role==='child'?canHoldTie(entry,other):canHoldTie(entry,other)||canHoldTie(other,entry);
 const add=(role:KinRole,other:{id:string}|{name:string},co?:string)=>{
  setAdding(null);setNotice('');
  let error='';
  const ok=change(latest=>{const r=addKin(latest,t.types,entry.id,role,other,new Date().toISOString(),newId,co);if('error' in r){error=r.error;return latest;}return r.s;});
  if(error)setNotice(error);else if(ok===false)setNotice('That couldn’t be saved.');
 };
 const missing=(['parent','partner','sibling'] as const).filter(r=>!kinType(t.types,r));
 return <section className="rw-panel ft-panel" aria-label={entry.title}>
  <div className="rw-panel-head"><span className="eyebrow">In the family</span><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={14}/></button></div>
  <button type="button" className="rw-focus-page" onClick={()=>onOpen(entry.id)}><Face entry={entry} size={40}/><span className="rw-text"><strong>{entry.title}{entry.character?.status==='deceased'?' †':''}</strong><small>{kindName(entry)}{tree.inLaws.has(entry.id)?' · married in':''} · open page</small></span><ArrowUpRight size={14}/></button>
  {families.length>0&&<div className="ft-families">{families.map(o=><button type="button" key={o.id} className="button small" onClick={()=>onFamily(o.id)}><GitFork size={13}/> {o.title}</button>)}</div>}
  {relatives.length?<ul className="ft-relatives tie-family">{relatives.map((r,i)=>{const e=byId.get(r.id)!,chip=r.key?t.chips(r.id).find(c=>c.key===r.key):undefined;
   return <li key={`${r.id}:${r.key??i}`}>
    <button type="button" className="ft-rel-face" aria-label={`Show ${e.title}`} onClick={()=>onPick(r.id)}><Face entry={e} size={28}/></button>
    <span className="ft-rel-text">{chip?.onClick?<button type="button" className="ft-rel-label" title="Change this tie" onClick={chip.onClick}>{!players&&r.gm&&<EyeOff size={11} aria-label="GM only"/>}{r.label}</button>:<span className="ft-rel-label" title={r.worked?'Worked out from shared parents':undefined}>{!players&&r.gm&&<EyeOff size={11} aria-label="GM only"/>}{r.label}</span>}
     {' '}<button type="button" className="ft-rel-name" onClick={()=>onPick(r.id)}>{e.title}</button></span>
   </li>;})}</ul>:<p className="muted">No family ties yet.</p>}
  {!players&&<div className="ft-add goal-anchor">
   {(['parent','partner','child','sibling'] as const).map(r=><button type="button" key={r} className="button small" disabled={!kinType(t.types,r==='child'?'parent':r)} onClick={()=>setAdding({role:r})}><Plus size={13}/> {kinWords[r].button}</button>)}
   {partners.map(p=><button type="button" key={p} className="button small" onClick={()=>setAdding({role:'child',with:p})}><Plus size={13}/> A child with {byId.get(p)!.title}</button>)}
   {adding&&<TargetPicker label={adding.with?`A child of ${entry.title} and ${byId.get(adding.with)?.title}`:kinWords[adding.role].picker(entry.title)} pages={people.filter(e=>fits(adding.role,e)&&e.id!==adding.with)} current=""
    nameWords={{title:n=>`Add “${n}” as a new character`,hint:entry.campaignId?'A new page in this campaign':'A new page in the shared lore'}}
    onClose={()=>setAdding(null)} onPage={id=>add(adding.role,{id},adding.with)} onName={name=>add(adding.role,{name},adding.with)}/>}
  </div>}
  {!players&&missing.length>0&&<p className="muted ft-hint">Some kinds of family tie don’t draw on a tree any more. <button type="button" className="text-button" onClick={t.openKinds}>Kinds of tie</button></p>}
  {notice&&<p className="quest-fact-refused" role="status">{notice}</p>}
  {t.dialogs}
 </section>;
}

/**
 * Family trees for a campaign (or a world's shared lore). With `orgId` it shows only that organization's family, as on
 * a noble house's Family tree tab. `players` shows what players would see; left out, the view has its own switch.
 */
export function FamilyTrees({data,worldId,campaign,change,onOpen,orgId,players:shownToPlayers}:{data:Workspace;worldId:string;campaign?:Campaign;change:Change;onOpen:(id:string)=>void;orgId?:string;players?:boolean}){
 const world=data.worlds.find(w=>w.id===worldId),campaignId=campaign?.id??null;
 const types=useMemo(()=>tieTypesOf(world),[world]);
 const [ownPlayers,setOwnPlayers]=useState(false),players=shownToPlayers??ownPlayers;
 const [choiceKey,setChoiceKey]=useState<string|null>(null),[selected,setSelected]=useState<string|null>(null),[picking,setPicking]=useState(false),[generating,setGenerating]=useState(false);
 const narrow=useNarrow();
 const byId=useMemo(()=>new Map(data.entries.map(e=>[e.id,e])),[data.entries]);
 const readable=useMemo(()=>players&&campaign?new Set(playerCampaign(data,campaign.id).entries.map(e=>e.id)):null,[players,campaign,data]);
 const pages=useMemo(()=>webPages(data,worldId,campaignId).filter(e=>!readable||readable.has(e.id)),[data,worldId,campaignId,readable]);
 const g=useMemo(()=>{
  const all=webTies(data,worldId,campaignId,{types});
  const ties=readable?playersWebTies(all,id=>readable.has(id),id=>byId.get(id)?.profile?.visibility==='players'):all;
  return familyGraph(familyLinks(ties,id=>byId.get(id)?.kind==='character'&&(!readable||readable.has(id))));
 },[data,worldId,campaignId,types,readable,byId]);
 const choices=useMemo(()=>familyChoices(pages,g,(_o,m)=>!players||!m.gm),[pages,g,players]);
 const orgChoice=orgId?choices.find(c=>c.orgId===orgId)??{key:`org:${orgId}`,label:byId.get(orgId)?.title??'',seeds:[],orgId,size:0}:undefined;
 const person=choiceKey?.startsWith('person:')?choiceKey.slice(7):null;
 const choice:FamilyChoice|undefined=orgChoice&&!person?orgChoice:choices.find(c=>c.key===choiceKey)??(person&&byId.has(person)?{key:choiceKey!,label:`Family of ${byId.get(person)!.title}`,seeds:[person],size:0}:orgChoice??choices[0]);
 const seedsKey=choice?choice.seeds.join('|'):null;
 const house=!!choice?.orgId&&!person;
 const tree=useMemo(()=>seedsKey===null?null:familyTree(g,seedsKey?seedsKey.split('|'):[],undefined,house),[g,seedsKey,house]);
 const org=choice?.orgId?byId.get(choice.orgId):undefined;
 const roles=useMemo(()=>familyRoles(org,m=>!players||!m.gm),[org,players]);
 const orgsOf=useMemo(()=>familyOrgsOf(pages),[pages]);
 const titles=useMemo(()=>new Map(tree?[...tree.at.keys()].map(id=>[id,byId.get(id)?.title??'']):[]),[tree,byId]);
 const familyOrg=choice?.orgId;
 const info=useMemo(()=>tree&&seedsKey!==null?boxInfo(tree,g,byId,roles,orgsOf,familyOrg,players,seedsKey.split('|')):new Map<string,BoxInfo>(),[tree,g,byId,roles,orgsOf,familyOrg,players,seedsKey]);
 const chosen=selected&&tree?.at.has(selected)?selected:null;
 const chosenEntry=chosen?byId.get(chosen):undefined;
 const characters=useMemo(()=>pages.filter(e=>e.kind==='character').sort((a,b)=>a.title.localeCompare(b.title)),[pages]);
 const generations=tree?new Set(tree.units.map(u=>u.gen)).size:0;
 const pickFamily=(key:string)=>{setChoiceKey(key);setSelected(null);};
 const empty=!tree||tree.at.size===0;
 const otherFamilies=chosen?(orgsOf.get(chosen)??[]).filter(o=>o.id!==choice?.orgId):[];

 return <div className="ft-wrap">
  <div className="ft-bar-row">
   {!orgId&&<label className="ft-pick"><span>Family</span>
    <select value={choice?.key??''} onChange={e=>pickFamily(e.target.value)} disabled={!choices.length&&!person}>
     {!choices.length&&!person&&<option value="">No families yet</option>}
     {person&&!choices.some(c=>c.key===choiceKey)&&choice&&<option value={choice.key}>{choice.label}</option>}
     {choices.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
    </select></label>}
   <span className="goal-anchor"><button type="button" className="button small" disabled={!characters.length} onClick={()=>setPicking(true)}><Search size={14}/> {orgId?'Show someone':'Start from a person'}</button>
    {picking&&<TargetPicker label={orgId?'Show…':'Start the tree from…'} pages={characters} current="" onClose={()=>setPicking(false)} onPage={id=>{setPicking(false);if(orgId&&tree?.at.has(id)){setSelected(id);return;}setChoiceKey(`person:${id}`);setSelected(id);}}/>}</span>
   {shownToPlayers===undefined&&campaign&&<div className="segmented" role="radiogroup" aria-label="Whose view">
    <button type="button" role="radio" aria-checked={!players} className={!players?'on':''} onClick={()=>setOwnPlayers(false)}><EyeOff size={13}/> As GM</button>
    <button type="button" role="radio" aria-checked={players} className={players?'on':''} onClick={()=>setOwnPlayers(true)}><Eye size={13}/> As players see it</button>
   </div>}
   {!players&&<button type="button" className="button small" onClick={()=>setGenerating(true)}><Dices size={14}/> Generate a family</button>}
   {orgId&&person&&<button type="button" className="text-button" onClick={()=>pickFamily(`org:${orgId}`)}>Back to {byId.get(orgId)?.title}</button>}
  </div>
  {choice&&!empty&&<p className="muted ft-about">{choice.orgId?`From the people on ${choice.label}’s Profile. `:''}{tree!.at.size} {tree!.at.size===1?'person':'people'}, {generations} generation{generations===1?'':'s'}.{tree!.cut?' The family is very big, so the tree stops here. Start from a person to see the rest.':''}</p>}
  {empty?<div className="qc-empty rw-empty"><GitFork size={26} aria-hidden="true"/>
    <p>{orgId?(players?'Players can’t see anyone in this family yet.':'Add people to this organization’s Profile and their family draws itself. Then click anyone to add a parent, partner or child.')
     :players?'Players can’t see any family ties yet.':'No family ties yet. Give a character a Parent of, Married to or Sibling of tie, or start from a person and add their family.'}</p>
   </div>
  :<div className="rw-body ft-body">
   <div className="rw-main">
    {narrow?<Outline tree={tree!} g={g} info={info} byId={byId} selected={chosen} onPick={id=>{setSelected(id);requestAnimationFrame(()=>document.querySelector('.ft-panel')?.scrollIntoView({behavior:'smooth',block:'start'}));}}/>
     :<TreeCanvas tree={tree!} info={info} titles={titles} selected={chosen} players={players} focus={seedsKey?.split('|')[0]} onPick={id=>setSelected(s=>s===id?null:id)}/>}
    {!narrow&&<ul className="ft-legend" aria-label="Key">
     <li><i className="partner" aria-hidden="true"/>Married</li><li><i className="child" aria-hidden="true"/>Child</li><li><i className="ward" aria-hidden="true"/>Ward</li>
     {!players&&<li><i className="gm" aria-hidden="true"/>GM only</li>}<li><b aria-hidden="true">†</b> died</li>
    </ul>}
   </div>
   <aside className="rw-side">
    {chosenEntry?<PersonPanel key={chosenEntry.id} entry={chosenEntry} g={g} tree={tree!} data={data} campaignId={campaignId} change={change} players={players} byId={byId} families={otherFamilies} onPick={setSelected} onOpen={onOpen} onFamily={id=>{if(orgId&&id!==orgId){onOpen(id);return;}pickFamily(`org:${id}`);}} onClose={()=>setSelected(null)}/>
     :<section className="rw-panel"><span className="eyebrow">In the family</span><p className="muted">{players?'Click someone to see their family as players know it.':'Click someone to see their family, add a parent, partner, child or sibling, or change a tie.'}</p></section>}
   </aside>
  </div>}
  {generating&&<GenerateFamily data={data} worldId={worldId} campaignId={campaignId} startId={chosen??(orgId?undefined:person)} change={change} onClose={()=>setGenerating(false)} onDone={id=>{setGenerating(false);if(orgId&&tree?.at.has(id)){setSelected(id);return;}setChoiceKey(`person:${id}`);setSelected(id);}}/>}
 </div>;
}
