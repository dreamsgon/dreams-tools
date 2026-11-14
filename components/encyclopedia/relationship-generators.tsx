"use client";
/*
 * The built-in generators. Generate a family: options on the left, the family drawn on the right (new people dashed),
 * reroll until it fits, then add every character and tie at once. Generate ties: pick pages and how many ties of each
 * group, then keep, change or drop each suggestion, reroll the rest, and add them. Nothing is saved until Add.
 */
import {useMemo,useState,type ReactNode} from 'react';
import {Check,Dices,EyeOff,Plus,Users,X} from 'lucide-react';
import './ties.css';
import './relationships.css';
import './family-tree.css';
import {newId,type Entry,type Workspace} from '@/lib/encyclopedia/world-model';
import {tieGroupInfo,tieGroups,tieTypeById,tieTypesOf,type TieGroup} from '@/lib/encyclopedia/ties';
import {tieChoices} from '@/lib/encyclopedia/tie-edit';
import {orgPeople} from '@/lib/encyclopedia/tie-connections';
import {webPages,webTies} from '@/lib/encyclopedia/tie-web';
import {familyGraph,familyTree} from '@/lib/encyclopedia/family-tree';
import {addFamily,addSuggestions,defaultFamilyOptions,defaultTieAmounts,generateFamily,generatedLinks,nameStyleNames,nameStyles,suggestTies,tieAmountNames,tieAmounts,type FamilyOptions,type NameStyle,type Suggestion,type TieAmount} from '@/lib/encyclopedia/relationship-generators';
import {ToolDialog} from './tool-dialog';
import {Outline,TreeCanvas,type BoxInfo} from './family-tree';
import {tieTone,useNarrow} from './connection-list';

type Change=(s:Workspace|((latest:Workspace)=>Workspace))=>boolean|void;
const newSeed=()=>Math.random().toString(36).slice(2,10);
/** Up to `n` of these, at random. */
const someOf=(ids:string[],n:number)=>{const pool=[...ids],out:string[]=[];while(out.length<n&&pool.length)out.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);return out;};

/** A row of choices, one picked. */
function Pick<T extends string|number|boolean>({label,value,options,onChange}:{label:string;value:T;options:[T,string][];onChange:(v:T)=>void}){
 return <div className="gen-field"><span className="gen-label">{label}</span>
  <div className="segmented" role="radiogroup" aria-label={label}>{options.map(([v,name])=><button type="button" key={String(v)} role="radio" aria-checked={value===v} className={value===v?'on':''} onClick={()=>onChange(v)}>{name}</button>)}</div>
 </div>;
}

function Footer({hint,children}:{hint:string;children:ReactNode}){
 return <div className="gen-foot"><p className="muted">{hint}</p><div className="button-row">{children}</div></div>;
}

/** Generate a family around a character (or a new one), see it drawn, reroll, and add it. */
export function GenerateFamily({data,worldId,campaignId,startId,change,onClose,onDone}:{data:Workspace;worldId:string;campaignId:string|null;startId?:string|null;change:Change;onClose:()=>void;onDone:(id:string)=>void}){
 const world=data.worlds.find(w=>w.id===worldId),types=useMemo(()=>tieTypesOf(world),[world]);
 const people=useMemo(()=>webPages(data,worldId,campaignId).filter(e=>e.kind==='character').sort((a,b)=>a.title.localeCompare(b.title)),[data,worldId,campaignId]);
 const inFamily=useMemo(()=>{const g=familyGraph(webTies(data,worldId,campaignId,{types}).flatMap(t=>t.tree?[{key:t.key,role:t.tree,fromId:t.fromId,toId:t.toId,gm:t.gm,name:t.name,reverse:t.reverse,index:0}]:[]));return new Set([...g.parents.keys(),...g.children.keys(),...g.partners.keys(),...g.siblings.keys()]);},[data,worldId,campaignId,types]);
 const [start,setStart]=useState(startId&&people.some(p=>p.id===startId)?startId:'');
 const [o,setO]=useState<FamilyOptions>(()=>defaultFamilyOptions(newSeed())),[notice,setNotice]=useState('');
 const set=(patch:Partial<FamilyOptions>)=>setO(x=>({...x,...patch}));
 const startEntry=people.find(p=>p.id===start);
 const family=useMemo(()=>generateFamily(o,startEntry?{id:startEntry.id,title:startEntry.title}:undefined),[o,startEntry]);
 const graph=useMemo(()=>familyGraph(generatedLinks(family,types)),[family,types]);
 const tree=useMemo(()=>familyTree(graph,['p0']),[graph]);
 // The outline on a phone shows each person by name, as a page would be.
 const faces=useMemo(()=>new Map(family.people.map(p=>[p.key,{id:p.key,title:p.name} as unknown as Entry])),[family]);
 const narrow=useNarrow();
 const titles=useMemo(()=>new Map(family.people.map(p=>[p.key,p.name])),[family]);
 const info=useMemo(()=>{const m=new Map<string,BoxInfo>();for(const p of family.people){const mine=family.ties.filter(t=>t.from===p.key||t.to===p.key);m.set(p.key,{dead:!!p.dead,fresh:!p.existingId,secret:mine.length>0&&mine.every(t=>t.gm),badge:p.existingId?'Already here':mine.length>0&&mine.every(t=>t.gm)?'GM only':undefined,sub:p.note});}return m;},[family]);
 const others=family.ties.filter(t=>!tieTypeById(types,t.typeId).tree);
 const newPeople=family.people.filter(p=>!p.existingId).length;
 const add=()=>{
  let error='',firstId='';
  const ok=change(latest=>{const r=addFamily(latest,family,{worldId,campaignId:startEntry?startEntry.campaignId:campaignId},types,new Date().toISOString(),newId);if('error' in r){error=r.error;return latest;}firstId=r.ids.get('p0')!;return r.s;});
  if(error){setNotice(error);return;}
  if(ok===false){setNotice('That couldn’t be saved.');return;}
  onDone(firstId);
 };
 const titleOf=(k:string)=>titles.get(k)??'';
 return <ToolDialog title="Generate a family" onClose={onClose} wide>
  <div className="gen-body">
   <div className="gen-options">
    <label className="gen-field"><span className="gen-label">Start from</span>
     <select value={start} onChange={e=>setStart(e.target.value)}>
      <option value="">A new family</option>
      {people.map(p=><option key={p.id} value={p.id}>{p.title}{inFamily.has(p.id)?'':' (no family yet)'}</option>)}
     </select></label>
    <Pick label="Generations above" value={o.above} options={[[0,'None'],[1,'Parents'],[2,'Grandparents']]} onChange={above=>set({above})}/>
    <Pick label="Below" value={o.below} options={[[false,'None'],[true,'Partner and children']]} onChange={below=>set({below})}/>
    <Pick label="Children per couple" value={o.children} options={[['few','Few'],['some','Some'],['many','Many']]} onChange={children=>set({children})}/>
    <Pick label="Twists" value={o.twists} options={[['quiet','Quiet'],['some','Some'],['scandalous','Scandalous']]} onChange={twists=>set({twists})}/>
    <label className="gen-field"><span className="gen-label">Names</span>
     <select value={o.names} onChange={e=>set({names:e.target.value as NameStyle})}>{nameStyles.map(n=><option key={n} value={n}>{nameStyleNames[n]}</option>)}</select></label>
    <label className="gen-field"><span className="gen-label">Marrying in</span>
     <select value={o.takeName?'take':'keep'} onChange={e=>set({takeName:e.target.value==='take'})}><option value="keep">Partners keep their own family name</option><option value="take">Partners take the family name</option></select></label>
    <label className="gen-check"><input type="checkbox" checked={o.house} onChange={e=>set({house:e.target.checked})}/><span><strong>Also make a page for the family</strong><small>An organization of type Family, with everyone born to it as members, so it gets a Family tree tab.</small></span></label>
   </div>
   <div className="gen-preview">
    <span className="eyebrow">Preview</span>
    <p className="muted gen-hint">The {family.surname} family{startEntry?`, around ${startEntry.title}`:''}. Everyone not marked Already here is a new character. Reroll until it fits.</p>
    {narrow?<Outline tree={tree} g={graph} info={info} byId={faces} selected={null} onPick={()=>{}}/>:<TreeCanvas tree={tree} info={info} titles={titles} selected={null} players={false} whole onPick={()=>{}}/>}
    {others.length>0&&<><span className="eyebrow gen-sub">Other ties</span><ul className="gen-twists">{others.map(t=>{const type=tieTypeById(types,t.typeId);return <li key={t.key}><strong>{titleOf(t.from)}</strong> <span className={`qc-reason ${tieTone(type.group)}`}>{t.gm&&<EyeOff size={11} aria-label="GM only"/>}{type.name}</span> <strong>{titleOf(t.to)}</strong>{t.note&&<small>{t.note}</small>}</li>;})}</ul></>}
    {family.ties.some(t=>t.gm&&t.cover)&&<p className="muted gen-hint">A GM-only tie with a cover story shows players the cover instead, such as a secret child raised as a ward.</p>}
   </div>
  </div>
  {notice&&<p className="quest-fact-refused" role="status">{notice}</p>}
  <Footer hint="Nothing is saved until you add it. New characters start GM only.">
   <button type="button" className="button" onClick={()=>set({seed:newSeed()})}><Dices size={15}/> Reroll</button>
   <button type="button" className="button" onClick={onClose}>Cancel</button>
   <button type="button" className="button primary" onClick={add}><Plus size={15}/> Add {newPeople} character{newPeople===1?'':'s'}{family.house?' and a family page':''} and {family.ties.length} tie{family.ties.length===1?'':'s'}</button>
  </Footer>
 </ToolDialog>;
}

/** Suggest ties among picked pages, then keep, change or drop each one and add them. */
export function GenerateTies({data,worldId,campaignId,initial=[],change,onClose,onDone}:{data:Workspace;worldId:string;campaignId:string|null;initial?:string[];change:Change;onClose:()=>void;onDone:(added:number)=>void}){
 const world=data.worlds.find(w=>w.id===worldId),types=useMemo(()=>tieTypesOf(world),[world]);
 const pages=useMemo(()=>webPages(data,worldId,campaignId).filter(e=>e.kind!=='session').sort((a,b)=>a.title.localeCompare(b.title)),[data,worldId,campaignId]);
 const byId=useMemo(()=>new Map(pages.map(p=>[p.id,p])),[pages]);
 const existing=useMemo(()=>webTies(data,worldId,campaignId,{types}),[data,worldId,campaignId,types]);
 const tied=useMemo(()=>new Set(existing.map(t=>t.fromId<t.toId?`${t.fromId}|${t.toId}`:`${t.toId}|${t.fromId}`)),[existing]);
 // People already married aren't offered another marriage or a betrothal.
 const spoken=useMemo(()=>new Set(existing.filter(t=>t.tree==='partner').flatMap(t=>[t.fromId,t.toId])),[existing]);
 const [picked,setPicked]=useState<string[]>(()=>initial.filter(id=>byId.has(id)));
 const [amounts,setAmounts]=useState<Record<TieGroup,TieAmount>>(defaultTieAmounts);
 const make=(ids:string[],a:Record<TieGroup,TieAmount>,keep:Suggestion[]=[],seed?:string)=>suggestTies(ids.map(id=>byId.get(id)!).filter(Boolean),types,a,seed??newSeed(),{tied,spoken,keep:keep.filter(k=>ids.includes(k.fromId)&&ids.includes(k.toId))});
 const [list,setList]=useState<Suggestion[]>(()=>make(picked,amounts,[],'first'));
 const [notice,setNotice]=useState('');
 const kept=()=>list.filter(x=>x.keep);
 const setPages=(ids:string[])=>{setPicked(ids);setList(make(ids,amounts,kept()));};
 const setAmount=(g:TieGroup,v:TieAmount)=>{const next={...amounts,[g]:v};setAmounts(next);setList(make(picked,next,kept()));};
 const edit=(key:string,patch:Partial<Suggestion>)=>setList(l=>l.map(x=>x.key===key?{...x,...patch}:x));
 const orgs=picked.map(id=>byId.get(id)).filter((e):e is Entry=>!!e&&e.kind==='faction').map(o=>({org:o,people:[...new Set(orgPeople(o).map(p=>p.id))].filter(id=>byId.has(id)&&!picked.includes(id))})).filter(x=>x.people.length);
 const left=pages.filter(p=>!picked.includes(p.id));
 const random=()=>setPages([...picked,...someOf(left.map(p=>p.id),6)]);
 const add=()=>{let added=0;const ok=change(latest=>{const r=addSuggestions(latest,list,types,new Date().toISOString(),newId);added=r.added;return r.s;});if(ok===false){setNotice('That couldn’t be saved.');return;}onDone(added);};
 return <ToolDialog title="Generate ties" onClose={onClose} wide>
  <div className="gen-body">
   <div className="gen-options">
    <div className="gen-field"><span className="gen-label">Pages <small>{picked.length} picked</small></span>
     <ul className="gen-chips">{picked.map(id=>{const e=byId.get(id);return e?<li key={id}><span>{e.title}</span><button type="button" aria-label={`Leave out ${e.title}`} onClick={()=>setPages(picked.filter(x=>x!==id))}><X size={12}/></button></li>:null;})}</ul>
     <select value="" aria-label="Add a page" onChange={e=>{if(e.target.value)setPages([...picked,e.target.value]);}}><option value="">Add a page…</option>{left.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select>
     <div className="gen-row">
      {left.length>0&&<button type="button" className="button small" onClick={random}><Dices size={13}/> Add 6 at random</button>}
      {orgs.map(({org,people})=><button type="button" key={org.id} className="button small" onClick={()=>setPages([...picked,...people])}><Users size={13}/> {org.title} members</button>)}
     </div>
    </div>
    <div className="gen-field"><span className="gen-label">Kinds of tie</span>
     <div className="gen-amounts">{tieGroups.map(g=><div key={g} className={`gen-amount ${tieTone(g)}`}><span><i aria-hidden="true"/>{tieGroupInfo[g].name}</span>
      <div className="segmented" role="radiogroup" aria-label={tieGroupInfo[g].name}>{tieAmounts.map(a=><button type="button" key={a} role="radio" aria-checked={amounts[g]===a} className={amounts[g]===a?'on':''} onClick={()=>setAmount(g,a)}>{tieAmountNames[a]}</button>)}</div>
     </div>)}</div>
    </div>
   </div>
   <div className="gen-preview">
    <span className="eyebrow">Suggestions <small>{list.length}</small></span>
    <p className="muted gen-hint">Tick to keep a suggestion through rerolls, cross to leave it out. Pairs that are already tied are skipped.</p>
    {picked.length<2?<p className="qc-empty">Pick at least two pages.</p>:!list.length?<p className="qc-empty">No suggestions. Turn up a kind of tie, or add pages.</p>
    :<ul className="gen-suggestions">{list.map(x=>{const a=byId.get(x.fromId),b=byId.get(x.toId);if(!a||!b)return null;const choices=tieChoices(types,a,b),type=tieTypeById(types,x.typeId);
     return <li key={x.key} className={x.keep?'kept':''}>
      <div className="gen-line"><strong>{a.title}</strong>
       <select className={`gen-kind ${tieTone(type.group)}`} aria-label={`How ${a.title} is tied to ${b.title}`} value={x.typeId} onChange={e=>{const c=choices.find(c=>c.value===e.target.value);if(!c)return;edit(x.key,c.reversed?{typeId:c.typeId,fromId:x.toId,toId:x.fromId}:{typeId:c.typeId});}}>
        {tieGroups.map(g=>{const cs=choices.filter(c=>c.group===g);return cs.length?<optgroup key={g} label={tieGroupInfo[g].name}>{cs.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>:null;})}
       </select>
       <strong>{b.title}</strong>
       <button type="button" className={`gen-gm${x.gm?' on':''}`} aria-pressed={x.gm} title={x.gm?'GM only. Click to share it with players.':'Players can see it. Click to keep it GM only.'} onClick={()=>edit(x.key,{gm:!x.gm})}>{x.gm?<><EyeOff size={11}/> GM only</>:'Shared'}</button>
       <span className="gen-tools">
        <button type="button" className="icon-button" aria-pressed={!!x.keep} aria-label={x.keep?'Kept: click to let a reroll replace it':'Keep through rerolls'} title="Keep" onClick={()=>edit(x.key,{keep:!x.keep})}><Check size={14}/></button>
        <button type="button" className="icon-button" aria-label="Leave this out" title="Leave out" onClick={()=>setList(l=>l.filter(y=>y.key!==x.key))}><X size={14}/></button>
       </span>
      </div>
      <input className="gen-note" aria-label="Note" value={x.note} maxLength={300} onChange={e=>edit(x.key,{note:e.target.value})}/>
     </li>;})}</ul>}
   </div>
  </div>
  {notice&&<p className="quest-fact-refused" role="status">{notice}</p>}
  <Footer hint="Each tie lands on both pages’ Connections tab. Nothing is saved until you add it.">
   <button type="button" className="button" disabled={picked.length<2} onClick={()=>setList(make(picked,amounts,kept()))}><Dices size={15}/> Reroll the rest</button>
   <button type="button" className="button" onClick={onClose}>Cancel</button>
   <button type="button" className="button primary" disabled={!list.length} onClick={add}><Plus size={15}/> Add {list.length} tie{list.length===1?'':'s'}</button>
  </Footer>
 </ToolDialog>;
}
