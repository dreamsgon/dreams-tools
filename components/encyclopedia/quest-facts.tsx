"use client";
/*
 * The side of a quest's Overview: who gave it, the reward (with its own eye for players) and where it happens,
 * plus the GM prep tab. Pages are picked from a search (a sheet on a phone) or dragged from the sidebar.
 */
import {useMemo,useState} from 'react';
import {Eye,EyeOff,Gift,Lock,MapPin,Pencil,Plus,X} from 'lucide-react';
import './quest-facts.css';
import type {Entry,Workspace} from '@/lib/encyclopedia/world-model';
import type {Quest} from '@/lib/encyclopedia/quests';
import {ArticleBody} from './article-body';
import {Face,TargetPicker,kindName} from './quest-goals';
import {PageDrop} from './page-drag';

const isPlace=(e:Entry)=>e.kind==='place'||e.kind==='map';
const isWho=(e:Entry)=>e.kind==='character'||e.kind==='faction';
/** What a page is, in a few words, under its name. */
function subtitle(e:Entry){
 if(e.kind==='character')return e.character?.group||e.character?.faction||e.character?.location||kindName(e);
 return kindName(e);
}

function PageCard({page,onOpen,onChange,label}:{page:Entry;onOpen:()=>void;onChange:()=>void;label:string}){
 return <div className="quest-fact-card">
  <button type="button" className="quest-fact-page" onClick={onOpen}>{isWho(page)?<Face entry={page} size={40}/>:<span className="quest-fact-icon"><MapPin size={16}/></span>}<span><strong>{page.title}</strong><small>{subtitle(page)}</small></span></button>
  <button type="button" className="icon-button" aria-label={`Change ${label}`} onClick={onChange}><Pencil size={14}/></button>
 </div>;
}

/** One slot that holds a page: the page, or an empty "+" slot. Takes a page dragged from the sidebar. */
function PageSlot({title,label,empty,pageId,pages,first,onSet,onOpen}:{title:string;label:string;empty:string;pageId?:string|null;pages:Entry[];first:(e:Entry)=>boolean;onSet:(id:string|null)=>void;onOpen:(id:string)=>void}){
 const [picking,setPicking]=useState(false),[refused,setRefused]=useState('');
 const page=pageId?pages.find(e=>e.id===pageId):undefined;
 const sorted=useMemo(()=>[...pages.filter(first),...pages.filter(e=>!first(e))],[pages,first]);
 const check=(id:string)=>pages.some(e=>e.id===id)?null:'That page isn’t in this campaign.';
 return <section className="quest-fact-slot" aria-label={title}>
  <div className="quest-fact-head"><span className="eyebrow">{title}</span></div>
  <PageDrop className="quest-fact-drop goal-anchor" label={`Drop to set ${label}`} check={check} onPage={id=>{setRefused('');onSet(id);}} onRefuse={setRefused}>
   {page?<PageCard page={page} label={label} onOpen={()=>onOpen(page.id)} onChange={()=>setPicking(true)}/>
    :<button type="button" className="quest-fact-empty" onClick={()=>setPicking(true)}><Plus size={14}/> {empty}</button>}
   {picking&&<TargetPicker label={empty} pages={sorted} current="" onClose={()=>setPicking(false)} onPage={id=>{onSet(id);setPicking(false);}} onClear={pageId?()=>{onSet(null);setPicking(false);}:undefined}/>}
  </PageDrop>
  {refused&&<p className="quest-fact-refused" role="status">{refused}</p>}
 </section>;
}

/** Given by, Reward and Where. */
export function QuestFacts({entry,data,quest:q,set,onOpen}:{entry:Entry;data:Workspace;quest:Quest;set:(patch:Partial<Quest>)=>void;onOpen:(id:string)=>void}){
 const pages=useMemo(()=>data.entries.filter(e=>e.id!==entry.id&&e.kind!=='folder'&&e.worldId===entry.worldId&&(e.campaignId===null||e.campaignId===entry.campaignId)).sort((a,b)=>a.title.localeCompare(b.title)),[data.entries,entry.id,entry.worldId,entry.campaignId]);
 const [picking,setPicking]=useState(false),[refused,setRefused]=useState('');
 const rewardPages=(q.rewardIds??[]).map(id=>pages.find(e=>e.id===id)).filter((e):e is Entry=>!!e);
 const addReward=(id:string)=>{if((q.rewardIds??[]).includes(id)||(q.rewardIds??[]).length>=20)return;set({rewardIds:[...(q.rewardIds??[]),id]});};
 const hidden=!!q.rewardHidden;
 return <aside className="quest-facts-v2">
  <PageSlot title="Given by" label="who gave it" empty="Who gave it?" pageId={q.giverId} pages={pages} first={isWho} onSet={giverId=>set({giverId})} onOpen={onOpen}/>
  <section className={`quest-fact-slot quest-reward-slot${hidden?' is-hidden':''}`} aria-label="Reward">
   <div className="quest-fact-head"><span className="eyebrow"><Gift size={13}/> Reward</span>
    <button type="button" className={`icon-button goal-eye${hidden?' off':''}`} aria-pressed={!hidden} aria-label={hidden?'Show the reward to players':'Hide the reward from players'} title={hidden?'Players can’t see the reward':'Players can see the reward'} onClick={()=>set({rewardHidden:hidden?undefined:true})}>{hidden?<EyeOff size={15}/>:<Eye size={15}/>}</button></div>
   <PageDrop className="quest-reward-drop goal-anchor" label="Drop to add to the reward" check={id=>pages.some(e=>e.id===id)?null:'That page isn’t in this campaign.'} onPage={id=>{setRefused('');addReward(id);}} onRefuse={setRefused}>
    {rewardPages.length>0&&<ul className="quest-reward-pages">{rewardPages.map(e=><li key={e.id}><button type="button" className="quest-reward-page" onClick={()=>onOpen(e.id)}>{isWho(e)?<Face entry={e} size={22}/>:<span className="quest-reward-gem" aria-hidden="true"/>}{e.title}</button><button type="button" className="quest-reward-remove" aria-label={`Remove ${e.title} from the reward`} onClick={()=>set({rewardIds:(q.rewardIds??[]).filter(x=>x!==e.id)})}><X size={12}/></button></li>)}</ul>}
    <input className="quest-reward-text" aria-label="Reward" placeholder="120 gp, a favour…" defaultValue={q.reward??''} maxLength={300} onBlur={e=>{const reward=e.target.value.trim();if(reward!==(q.reward??''))set({reward:reward||undefined});}}/>
    <button type="button" className="quest-fact-empty small" disabled={(q.rewardIds??[]).length>=20} onClick={()=>setPicking(true)}><Plus size={13}/> Add an item or page</button>
    {picking&&<TargetPicker label="Add to the reward" pages={pages.filter(e=>!(q.rewardIds??[]).includes(e.id))} current="" onClose={()=>setPicking(false)} onPage={id=>{addReward(id);setPicking(false);}}/>}
   </PageDrop>
   {refused&&<p className="quest-fact-refused" role="status">{refused}</p>}
   {hidden&&<p className="quest-fact-note"><Lock size={11}/> Players see “Reward: not known yet”.</p>}
  </section>
  <PageSlot title="Where" label="where it happens" empty="Where does it happen?" pageId={q.placeId} pages={pages} first={isPlace} onSet={placeId=>set({placeId})} onOpen={onOpen}/>
 </aside>;
}

/** The GM tab: private preparation, written like a page. */
export function QuestPrep({entry,data,quest:q,set,onOpen}:{entry:Entry;data:Workspace;quest:Quest;set:(patch:Partial<Quest>)=>void;onOpen:(id:string)=>void}){
 const prep=q.prep??'',[editing,setEditing]=useState(!prep.trim()),[draft,setDraft]=useState(prep);
 const save=()=>{const text=draft.replace(/\s+$/,'');if(text!==prep)set({prep:text||undefined});setEditing(false);};
 return <div className="quest-prep">
  <p className="quest-prep-banner"><Lock size={14}/> Only you see this tab. It is never sent to players or to an AI that only sees what players see.</p>
  {editing?<>
   <textarea className="quest-prep-text" aria-label="GM preparation" rows={8} maxLength={20000} autoFocus={!!prep} placeholder={'What is really going on?\nWhat happens if they fail, or wait too long?\nNames, stat blocks, clues to drop.'} value={draft} onChange={e=>setDraft(e.target.value)}/>
   <div className="button-row"><button type="button" className="button small primary" onClick={save}>Save preparation</button>{prep.trim()&&<button type="button" className="button small" onClick={()=>{setDraft(prep);setEditing(false);}}>Cancel</button>}</div>
  </>:<>
   <div className="prose quest-prep-body"><ArticleBody entry={{...entry,body:prep}} data={data} onOpen={onOpen} onChange={body=>set({prep:body})}/></div>
   <button type="button" className="button small" onClick={()=>{setDraft(prep);setEditing(true);}}><Pencil size={14}/> Edit preparation</button>
  </>}
 </div>;
}
