"use client";
/*
 * A forum topic as the source of a session recap: the GM picks one of the campaign forum's latest topics, and its
 * posts become a transcript, one "Player (Character): …" line per post ("GM: …" for narration), with the dice
 * results written in. The rest of the recap dialog treats it like a pasted RP thread.
 */
import {useEffect,useMemo,useState} from 'react';
import {Search,Check} from 'lucide-react';
import {forumCall,when,wholeTopic,type Frame,type TopicPage} from '../forum/forum-api';
import type {TopicRow} from '@/lib/forum/view';
import {withRollResults} from '@/lib/forum/rolls';

type Active={frame:Frame;page:{kind:'active';topics:TopicRow[]}};

/** The topic's posts as transcript lines. */
export function topicTranscript(page:TopicPage){
 return page.posts.map(p=>{
  const card=p.as?page.cards[p.as]:null,who=card?`${p.name} (${card.name})`:page.topic.kind==='ic'?'GM':p.name;
  return `${who}: ${withRollResults(p.body,p.rolls).replace(/\s*\n+\s*/g,' ').trim()}`;
 }).join('\n');
}

export function ForumSource({campaignId,picked,onPick}:{campaignId:string;picked:string;onPick:(t:{id:string;title:string;text:string})=>void}){
 const key=`c-${campaignId}`;
 const [list,setList]=useState<Active|null>(null),[find,setFind]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState('');
 useEffect(()=>{
  let live=true;
  forumCall<Active>({action:'view',campaign:key,page:{kind:'active'}}).then(v=>{if(live)setList(v);},e=>{if(live)setError(e instanceof Error?e.message:'Couldn’t open the forum.');});
  return()=>{live=false;};
 },[key]);
 const boards=useMemo(()=>new Map((list?.frame.boards??[]).map(b=>[b.id,b])),[list]);
 const shown=(list?.page.topics??[]).filter(t=>!find.trim()||t.title.toLowerCase().includes(find.trim().toLowerCase()));
 const pick=async(t:TopicRow)=>{
  setBusy(t.id);setError('');
  // A long topic comes in pages: the recap reads every one.
  try{const v=await forumCall<{page:TopicPage}>({action:'view',campaign:key,page:{kind:'topic',id:t.id,page:1,per:200}});onPick({id:t.id,title:t.title,text:topicTranscript(await wholeTopic(key,v.page))});}
  catch(e){setError(e instanceof Error?e.message:'Couldn’t read that topic.');}
  finally{setBusy('');}
 };
 return <div className="field-title forum-source"><span className="field-row"><span>The topic</span>{list&&<small>The latest {list.page.topics.length} topics</small>}</span>
  <label className="forum-source-find"><Search size={13}/><input value={find} placeholder="Find a topic" aria-label="Find a topic" onChange={e=>setFind(e.target.value)}/></label>
  {!list&&!error?<p className="aside-hint">Opening the forum…</p>
   :list&&!list.page.topics.length?<p className="aside-hint">This campaign’s forum has no topics yet.</p>
   :<div className="forum-source-list" role="radiogroup" aria-label="Forum topics">{shown.slice(0,50).map(t=>{const b=boards.get(t.boardId);return <button key={t.id} role="radio" aria-checked={picked===t.id} className={`forum-source-row ${picked===t.id?'on':''}`} disabled={!!busy} onClick={()=>void pick(t)}>
    <span><strong>{picked===t.id&&<Check size={13}/>} {t.title}</strong><small>{b?`${b.name} · `:''}{t.replies+1} {t.replies?'posts':'post'} · last {when(t.last.at)}{busy===t.id?' · reading…':''}</small></span>
   </button>;})}{list&&!shown.length&&<p className="aside-hint">No topic matches “{find}”.</p>}</div>}
  {error&&<p className="form-error">{error}</p>}
 </div>;
}
