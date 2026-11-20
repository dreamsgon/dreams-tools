'use client';
import {useEffect,useState,useCallback,useRef} from 'react';
import Link from 'next/link';
import {ThemeToggle} from './theme';
import {PlayerView} from './player-view';
import CampaignBar from '@/components/campaign-bar';
import {useDiceTarget} from '../use-dice-target';
import {playerDiceTarget,NO_CAMPAIGN} from '@/lib/dice-target';
import {parsePlayerHash} from '@/lib/encyclopedia/player-place';
import type {PlayerCampaign} from '@/lib/encyclopedia/world-model';
import type {LiveTheme} from '@/lib/campaign-theme/model';
import type {MyPages} from '@/lib/encyclopedia/player-edit';
import type {SheetState} from '@/lib/encyclopedia/player-sheet';
// A signed-in member also gets `you`: the pages they may edit (lib/encyclopedia/player-edit.ts).
type Shown=PlayerCampaign&{you?:{name:string;pages:MyPages;sheets?:Record<string,SheetState>};skin?:LiveTheme|null};
export default function PlayerClient(){
 const [data,setData]=useState<Shown|null>(null),[error,setError]=useState(''),[token,setToken]=useState(''),[updating,setUpdating]=useState(false),[refreshed,setRefreshed]=useState(''),[signIn,setSignIn]=useState(false);
 const request=useRef<AbortController|null>(null);
 useDiceTarget(data&&token?playerDiceTarget(token,data.campaign,!!data.you):NO_CAMPAIGN);
 const refresh=useCallback(async(token:string)=>{
  if(request.current)return;const controller=new AbortController();request.current=controller;setUpdating(true);
  try{const r=await fetch('/api/encyclopedia/player-view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),signal:controller.signal});const value=await r.json() as Shown&{error?:string};if(!r.ok){setSignIn(r.status===401);throw new Error(value.error??'Could not refresh the campaign.');}setSignIn(false);if(controller.signal.aborted)return;setData(value);setError('');setRefreshed(new Date().toLocaleTimeString());}
  catch(e){if(!controller.signal.aborted){setData(null);setError(e instanceof Error?e.message:'Could not refresh the campaign.');}}
  finally{if(request.current===controller){request.current=null;setUpdating(false);}}
 },[]);
 useEffect(()=>{const token=parsePlayerHash(location.hash).token;setToken(token);if(!/^(?:m-)?[a-f0-9]{64}$/.test(token)){setError('This player link is invalid. Ask your GM for a current link.');return;}
  // Background tabs stop polling and catch up as soon as they are shown again.
  void refresh(token);const timer=setInterval(()=>{if(!document.hidden)void refresh(token);},5000),focus=()=>{if(!document.hidden)void refresh(token);};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  return()=>{clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);request.current?.abort();request.current=null;};
 },[refresh]);
 // A signed-in member (#m-<ref>) gets the campaign bar with the places they can open; an anonymous share link (a bare 64-hex token) gets none.
 const asMember=token.startsWith('m-')&&!signIn,status=token&&!signIn?(updating?'Updating…':error?'Updates paused until the connection recovers':`Updates every 5 seconds · Last checked ${refreshed}`):'';
 return <>{asMember?<CampaignBar className="player-bar" tool="encyclopedia" campaign={{memberRef:token.slice(2)}} name={data?.campaign.name} bell={false} actions={<><span className="player-status" role="status">{status}</span><button className="button small player-refresh-now" disabled={updating} onClick={()=>void refresh(token)}>Refresh<span className="player-refresh-long"> now</span></button><ThemeToggle/></>}/>
  :<div className="player-refresh"><ThemeToggle/>{token&&!signIn&&<><span>{status}</span><button className="button" disabled={updating} onClick={()=>void refresh(token)}>Refresh now</button></>}</div>}{data?<PlayerView data={data} skin={data.skin??null} playerToken={token} you={data.you} onChanged={()=>void refresh(token)}/>:<div className="welcome"><h1>{signIn?'Sign in first':error?(token.startsWith('m-')?'Campaign unavailable':'Link unavailable'):'Opening the campaign…'}</h1><p>{error||'Loading the pages your GM shares.'}</p>{signIn&&<p><Link className="button" href="/account?mode=login&next=%2Fcampaigns">Sign in</Link></p>}{token.startsWith('m-')&&error&&!signIn&&<p><Link href="/campaigns">Back to Campaigns</Link></p>}</div>}</>;
}
