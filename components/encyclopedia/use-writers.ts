'use client';
/* Who can write a recap. Its own file so the campaign page can ask without loading the recap editor. */
import {useEffect,useState} from 'react';
import {fetchConnections} from '@/lib/ai/device-keys';

export type KeyWriter={id:string;name:string;model:string;transcripts:boolean};
/**
 * The campaign's AI connections that can write a recap: AI apps over MCP, and API-key connections that
 * RPG Tools runs itself (allowed to write session notes; `transcripts` when they may read GM-only things).
 */
export function useWriters(campaignId:string|null|undefined){
 const [w,setW]=useState<{apps:string[];keys:KeyWriter[]}|null>(null);
 useEffect(()=>{
  if(!campaignId)return;
  let live=true;
  type C={id:string;name:string;level:string;api?:{model:string};perms?:Record<string,string>};
  fetchConnections<C>(campaignId).then(all=>{
   if(!live)return;
   const list=all.filter(c=>c.level!=='read'&&c.perms?.notes!=='off');
   setW({apps:list.filter(c=>!c.api).map(c=>c.name),keys:list.filter(c=>c.api).map(c=>({id:c.id,name:c.name,model:c.api!.model,transcripts:c.perms?.seeSecrets!=='off'}))});
  }).catch(()=>{if(live)setW({apps:[],keys:[]});});
  return ()=>{live=false;};
 },[campaignId]);
 return w;
}
