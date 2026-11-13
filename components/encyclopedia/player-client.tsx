'use client';
import {useEffect,useState,useCallback,useRef} from 'react';
import {ThemeToggle} from './theme';
import {PlayerView} from './player-view';
import type {PlayerCampaign} from '@/lib/encyclopedia/world-model';
export default function PlayerClient(){
 const [data,setData]=useState<PlayerCampaign|null>(null),[error,setError]=useState(''),[token,setToken]=useState(''),[updating,setUpdating]=useState(false),[refreshed,setRefreshed]=useState('');
 const request=useRef<AbortController|null>(null);
 const refresh=useCallback(async(token:string)=>{
  if(request.current)return;const controller=new AbortController();request.current=controller;setUpdating(true);
  try{const r=await fetch('/api/encyclopedia/player-view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),signal:controller.signal});const value=await r.json() as PlayerCampaign&{error?:string};if(!r.ok)throw new Error(value.error??'Could not refresh the campaign.');if(controller.signal.aborted)return;setData(value);setError('');setRefreshed(new Date().toLocaleTimeString());}
  catch(e){if(!controller.signal.aborted){setData(null);setError(e instanceof Error?e.message:'Could not refresh the campaign.');}}
  finally{if(request.current===controller){request.current=null;setUpdating(false);}}
 },[]);
 useEffect(()=>{const token=location.hash.slice(1);setToken(token);if(!/^[a-f0-9]{64}$/.test(token)){setError('This player link is invalid. Ask your GM for a current link.');return;}
  // Background tabs stop polling and catch up as soon as they are shown again.
  void refresh(token);const timer=setInterval(()=>{if(!document.hidden)void refresh(token);},5000),focus=()=>{if(!document.hidden)void refresh(token);};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  return()=>{clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);request.current?.abort();request.current=null;};
 },[refresh]);
 return <><div className="player-refresh"><ThemeToggle/>{token&&<><span>{updating?'Updating…':error?'Updates paused until the connection recovers':`Updates every 5 seconds · Last checked ${refreshed}`}</span><button className="button" disabled={updating} onClick={()=>void refresh(token)}>Refresh now</button></>}</div>{data?<PlayerView data={data} playerToken={token}/>:<div className="welcome"><h1>{error?'Link unavailable':'Opening the campaign…'}</h1><p>{error||'Loading player-visible notes.'}</p></div>}</>;
}
