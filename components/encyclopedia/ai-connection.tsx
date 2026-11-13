"use client";
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,BookOpen,Check,Copy,Crown,Dices,Eye,Hand,Lock,Map as MapIcon,X} from 'lucide-react';
import './ai-connection.css';
import {confirmDialog} from '../confirm-dialog';
import {actionGroups,modeNames,presets,type Choice,type Mode,type Perms} from '@/lib/mcp/permissions';

type Level='read'|'assist'|'run';
type Connection={id:string;name:string;level:Level;perms:Perms;mode:Mode|'custom';createdAt:string;lastUsedAt?:string};
const modes:{id:Mode;about:string;icon:React.ReactNode}[]=[
 {id:'helper',about:'You stay the GM. It preps pages and suggests rolls and moves for you to approve.',icon:<Hand size={16}/>},
 {id:'gm',about:'It acts as the GM: rolls, moves tokens and runs combat. Every change can be undone.',icon:<Crown size={16}/>},
 {id:'read',about:'Answers questions about your campaign. Changes nothing.',icon:<Eye size={16}/>},
];
const groupIcons:Record<string,React.ReactNode>={look:<Eye size={14}/>,dice:<Dices size={14}/>,encyclopedia:<BookOpen size={14}/>,table:<MapIcon size={14}/>};
const choices:{id:Choice;name:string}[]=[{id:'do',name:'Do it'},{id:'ask',name:'Ask me'},{id:'off',name:'Off'}];
function ago(iso:string|undefined,now:number){
 if(!iso)return 'not used yet';
 const s=(now-Date.parse(iso))/1000;
 if(s<90)return 'used just now';if(s<3600)return `used ${Math.round(s/60)} minutes ago`;if(s<86400)return `used ${Math.round(s/3600)} hours ago`;
 const d=Math.round(s/86400);return d===1?'used yesterday':`used ${d} days ago`;
}
async function post(body:object){
 const r=await fetch('/api/encyclopedia/ai-connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error??'Something went wrong. Try again.');return data;
}

/** "Connect an AI": named MCP connections for one campaign, each with a level, and the setup for each AI app. */
export function AiConnectionDialog({campaignId,campaignName,onClose}:{campaignId:string;campaignName:string;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 const [list,setList]=useState<Connection[]|null>(null),[level,setLevel]=useState<Mode>('helper'),[name,setName]=useState('');
 const [now]=useState(()=>Date.now()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[made,setMade]=useState<{name:string;mode:Mode|'custom';url:string}|null>(null),[editing,setEditing]=useState<string|null>(null);
 useEffect(()=>{const d=ref.current;if(d&&!d.open)d.showModal();},[]);
 useEffect(()=>{let live=true;fetch(`/api/encyclopedia/ai-connections?campaignId=${encodeURIComponent(campaignId)}`).then(r=>r.json()).then(d=>{if(!live)return;if(d.connections)setList(d.connections);else setError(d.error??'Could not load the connections.');}).catch(()=>live&&setError('Could not load the connections.'));return()=>{live=false;};},[campaignId]);
 async function make(){
  setBusy(true);setError('');
  try{const d=await post({campaignId,action:'create',name:name.trim()||'My AI',level});setList(l=>[...(l??[]),d.connection]);setMade({name:d.connection.name,mode:d.connection.mode,url:`${location.origin}/api/mcp/${d.key}`});setName('');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 /** Changes apply right away: a whole ready-made set, or one action. */
 async function change(c:Connection,how:{level:Mode}|{perms:Perms}){
  setError('');
  // Show it at once; the saved copy replaces it, or the error puts it back.
  if('perms' in how)setList(l=>l?.map(x=>x.id===c.id?{...x,perms:how.perms}:x)??null);
  try{const d=await post({campaignId,action:'update',id:c.id,...how});setList(l=>l?.map(x=>x.id===c.id?d.connection:x)??null);}
  catch(e){setError((e as Error).message);setList(l=>l?.map(x=>x.id===c.id?c:x)??null);}
 }
 const open=list?.find(c=>c.id===editing);
 async function revoke(c:Connection){
  if(!await confirmDialog({title:`Revoke ${c.name}?`,message:'That AI app loses access to this campaign right away. You can make a new connection later.',confirm:'Revoke',danger:true}))return;
  setError('');
  try{await post({campaignId,action:'revoke',id:c.id});setList(l=>l?.filter(x=>x.id!==c.id)??null);}catch(e){setError((e as Error).message);}
 }
 return <dialog ref={ref} className="ai-dialog" aria-labelledby="ai-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}>
  {made?<Ready made={made} campaignName={campaignName} onDone={()=>setMade(null)} onClose={onClose}/>:open?<MayDo c={open} campaignName={campaignName} now={now} error={error} onChange={how=>void change(open,how)} onBack={()=>setEditing(null)} onClose={onClose}/>:<>
   <div className="ai-head"><h2 id="ai-title">Connect an AI</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
   <p className="ai-lead">For {campaignName} and its Maptable maps. Works with any app that supports MCP: Claude, ChatGPT, Cursor, VS Code, LM Studio and others. The AI sees this campaign and nothing else.</p>
   <h3 className="ai-label" id="ai-level">How should it help?</h3>
   <div className="ai-levels" role="radiogroup" aria-labelledby="ai-level">
    {modes.map(l=><label key={l.id} className={`ai-level ${level===l.id?'on':''}`}>
     <input type="radio" name="ai-level" value={l.id} checked={level===l.id} onChange={()=>setLevel(l.id)}/>
     <strong>{l.icon}{modeNames[l.id]}</strong><span>{l.about}</span>
    </label>)}
   </div>
   <p className="ai-note">You can fine-tune each action after making it: Do it, Ask me or Off.</p>
   <form className="ai-name" onSubmit={e=>{e.preventDefault();void make();}}>
    <label className="ai-label" htmlFor="ai-name">Name it</label>
    <div><input id="ai-name" value={name} maxLength={60} placeholder="Claude on my laptop" onChange={e=>setName(e.target.value)}/><button type="submit" className="button primary" disabled={busy||list===null||list.length>=10}>{busy?'Making…':'Make connection'}</button></div>
   </form>
   <p className="ai-note">GM secrets, hidden tokens and fog are marked so the AI keeps them from players. Page text is passed to the AI as data, so a line in a page can&apos;t give it orders.</p>
   {error&&<p className="ai-error" role="alert">{error}</p>}
   <h3 className="ai-label">Connected</h3>
   {list===null?<p className="ai-empty">{error?'':'Loading…'}</p>:!list.length?<p className="ai-empty">No AI apps yet.</p>:
    <ul className="ai-list">{list.map(c=><li key={c.id}>
     <span className={`ai-dot ${c.lastUsedAt&&now-Date.parse(c.lastUsedAt)<36e5?'live':''}`} aria-hidden/>
     <span className="ai-who"><strong>{c.name}</strong> · {ago(c.lastUsedAt,now)}</span>
     <span className="ai-badge">{modeNames[c.mode]}</span>
     <button type="button" className="button small" onClick={()=>{setError('');setEditing(c.id);}}>Edit</button>
     <button type="button" className="button small ai-revoke" onClick={()=>void revoke(c)}>Revoke</button>
    </li>)}</ul>}
  </>}
 </dialog>;
}

const apps=['Claude','ChatGPT','Cursor / VS Code','Other apps'] as const;
const ago2=(c:Connection,now:number)=>ago(c.lastUsedAt,now).replace(/^used/,'connected');
/** "What it may do": a ready-made set, then Do it, Ask me or Off for each action. Changes apply right away. */
function MayDo({c,campaignName,now,error,onChange,onBack,onClose}:{c:Connection;campaignName:string;now:number;error:string;onChange:(how:{level:Mode}|{perms:Perms})=>void;onBack:()=>void;onClose:()=>void}){
 const mode=(Object.keys(presets) as Mode[]).find(m=>Object.entries(presets[m]).every(([k,v])=>c.perms[k as keyof Perms]===v))??'custom';
 return <>
  <div className="ai-head"><button type="button" className="icon-button" aria-label="Back to connections" onClick={onBack}><ArrowLeft size={16}/></button><h2 id="ai-title" className="ai-head-title">What {c.name} may do</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
  <p className="ai-lead">{campaignName} · {ago2(c,now)}. Changes apply right away.</p>
  <h3 className="ai-label" id="ai-mode">How should it help?</h3>
  <div className="ai-levels" role="radiogroup" aria-labelledby="ai-mode">
   {modes.map(l=><label key={l.id} className={`ai-level ${mode===l.id?'on':''}`}>
    <input type="radio" name="ai-mode" value={l.id} checked={mode===l.id} onChange={()=>onChange({level:l.id})}/>
    <strong>{l.icon}{modeNames[l.id]}</strong><span>{l.about}</span>
   </label>)}
  </div>
  <div className="ai-tune-head"><h3 className="ai-label">Fine-tune each action{mode==='custom'&&<span className="ai-badge">Custom</span>}</h3><p><b className="do">Do it</b> acts and logs it · <b className="ask">Ask me</b> waits for your OK · <b>Off</b> never</p></div>
  {actionGroups.map(g=><section key={g.id} className="ai-tune">
   <h4>{groupIcons[g.id]}{g.name}</h4>
   {g.id==='look'&&<div className="ai-tune-row"><span>Read pages, quests, the codex and maps</span><span className="ai-always"><Lock size={12}/> Always</span></div>}
   {g.actions.map(a=><div key={a.id} className="ai-tune-row">
    <span>{a.name}{a.hint&&<small>{a.hint}</small>}</span>
    <div className="ai-seg" role="radiogroup" aria-label={a.name}>{choices.map(ch=><button key={ch.id} type="button" role="radio" aria-checked={c.perms[a.id]===ch.id} className={`${ch.id}${c.perms[a.id]===ch.id?' on':''}`} disabled={ch.id==='ask'&&a.noAsk} title={ch.id==='ask'&&a.noAsk?'Looking is on or off':undefined} onClick={()=>c.perms[a.id]!==ch.id&&onChange({perms:{...c.perms,[a.id]:ch.id}})}>{ch.name}</button>)}</div>
   </div>)}
  </section>)}
  {error&&<p className="ai-error" role="alert">{error}</p>}
  <div className="ai-actions ai-tune-foot"><p>Actions set to Off are hidden from the AI, and refused if it tries.</p><button type="button" className="button" disabled={mode==='helper'} onClick={()=>onChange({level:'helper'})}>Reset to “{modeNames.helper}”</button><button type="button" className="button primary" onClick={onBack}>Done</button></div>
 </>;
}

function Ready({made,campaignName,onDone,onClose}:{made:{name:string;mode:Mode|'custom';url:string};campaignName:string;onDone:()=>void;onClose:()=>void}){
 const [app,setApp]=useState<typeof apps[number]>('Claude'),[copied,setCopied]=useState('');
 const key=made.url.split('/').pop()!,origin=made.url.slice(0,made.url.indexOf('/api/'));
 const copy=(what:string,text:string)=>void navigator.clipboard.writeText(text).then(()=>{setCopied(what);setTimeout(()=>setCopied(c=>c===what?'':c),2000);}).catch(()=>setCopied('failed'));
 const field=(what:string,text:string,label:string)=><div className="ai-url"><code aria-label={label}>{text}</code><button type="button" className="button" onClick={()=>copy(what,text)}>{copied===what?<><Check size={14}/> Copied</>:<><Copy size={14}/> Copy</>}</button></div>;
 const cursor=JSON.stringify({mcpServers:{'rpg-tools':{url:made.url}}},null,2),vscode=JSON.stringify({servers:{'rpg-tools':{type:'http',url:made.url}}},null,2);
 return <>
  <div className="ai-head"><h2 id="ai-title">{made.name} is ready</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
  <p className="ai-lead">{modeNames[made.mode]} · {campaignName}. Add it to your AI app with the steps below.</p>
  <div className="ai-tabs" role="tablist">{apps.map(a=><button key={a} type="button" role="tab" aria-selected={app===a} onClick={()=>setApp(a)}>{a}</button>)}</div>
  <div className="ai-steps" role="tabpanel">
   {app==='Claude'&&<ol><li>In Claude, open <b>Settings → Connectors</b> and choose <b>Add custom connector</b>.</li><li>Name it “RPG Tools: {campaignName}” and paste this connector URL:</li>{field("url",made.url,"Connector URL")}<li>In a chat, turn the connector on and ask: “Give me an overview of this campaign.”</li></ol>}
   {app==='ChatGPT'&&<ol><li>In ChatGPT, turn on <b>Developer mode</b> under <b>Settings → Apps &amp; Connectors → Advanced</b>.</li><li>Create a connector, paste this as its MCP server URL, and choose no authentication (the key is in the URL):</li>{field("url",made.url,"Connector URL")}<li>In a chat, pick the connector and ask: “Give me an overview of this campaign.”</li></ol>}
   {app==='Cursor / VS Code'&&<ol><li>Cursor: add this to <code>~/.cursor/mcp.json</code>.</li>{field("cursor",cursor,"Cursor settings")}<li>VS Code: add this to <code>.vscode/mcp.json</code>, then start the server from that file.</li>{field("vscode",vscode,"VS Code settings")}</ol>}
   {app==='Other apps'&&<ol><li>Apps that take a server URL: use the connector URL.</li>{field("url",made.url,"Connector URL")}<li>Apps that take a URL and a separate key: use <code>{origin}/api/mcp</code> with the header <code>Authorization: Bearer {key.slice(0,8)}…</code> (the key is the end of the connector URL).</li><li>Apps that only run local servers: run <code>node scripts/rpg-tools-mcp.mjs</code> from the RPG Tools folder with <code>RPG_TOOLS_URL={origin}</code> and <code>RPG_TOOLS_KEY</code> set to the key.</li></ol>}
  </div>
  <div className="ai-warn"><b>Copy it now.</b> The URL holds the key, so it won’t be shown again. Anyone with it can {made.mode==='read'?'read':'act on'} this campaign until you revoke it.</div>
  {copied==='failed'&&<p className="ai-error" role="alert">Copying didn’t work here. Select the text and copy it yourself.</p>}
  <div className="ai-actions"><button type="button" className="button" onClick={onDone}>Back to connections</button><button type="button" className="button primary" onClick={onClose}>Done</button></div>
 </>;
}
