"use client";
import {useEffect,useRef,useState} from 'react';
import {Check,Copy,X} from 'lucide-react';
import './ai-connection.css';
import {confirmDialog} from '../confirm-dialog';

type Level='read'|'assist'|'run';
type Connection={id:string;name:string;level:Level;createdAt:string;lastUsedAt?:string};
const levels:{id:Level;name:string;about:string;ready:boolean}[]=[
 {id:'read',name:'Read',about:'Reads the campaign, pages, quests and maps. Changes nothing.',ready:true},
 {id:'assist',name:'Assist',about:'Also writes pages, quest logs and session notes, and rolls dice. Every change can be undone.',ready:true},
 {id:'run',name:'Run the game',about:'Also runs the table: tokens, fog, initiative, HP and conditions.',ready:false},
];
const levelName=(l:Level)=>levels.find(x=>x.id===l)?.name??l;
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
 const [list,setList]=useState<Connection[]|null>(null),[level,setLevel]=useState<Level>('read'),[name,setName]=useState('');
 const [now]=useState(()=>Date.now()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[made,setMade]=useState<{name:string;level:Level;url:string}|null>(null),[editing,setEditing]=useState<string|null>(null);
 useEffect(()=>{const d=ref.current;if(d&&!d.open)d.showModal();},[]);
 useEffect(()=>{let live=true;fetch(`/api/encyclopedia/ai-connections?campaignId=${encodeURIComponent(campaignId)}`).then(r=>r.json()).then(d=>{if(!live)return;if(d.connections)setList(d.connections);else setError(d.error??'Could not load the connections.');}).catch(()=>live&&setError('Could not load the connections.'));return()=>{live=false;};},[campaignId]);
 async function make(){
  setBusy(true);setError('');
  try{const d=await post({campaignId,action:'create',name:name.trim()||'My AI',level});setList(l=>[...(l??[]),d.connection]);setMade({name:d.connection.name,level:d.connection.level,url:`${location.origin}/api/mcp/${d.key}`});setName('');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function change(c:Connection,to:Level){
  setEditing(null);if(to===c.level)return;setError('');
  try{const d=await post({campaignId,action:'update',id:c.id,level:to});setList(l=>l?.map(x=>x.id===c.id?d.connection:x)??null);}catch(e){setError((e as Error).message);}
 }
 async function revoke(c:Connection){
  if(!await confirmDialog({title:`Revoke ${c.name}?`,message:'That AI app loses access to this campaign right away. You can make a new connection later.',confirm:'Revoke',danger:true}))return;
  setError('');
  try{await post({campaignId,action:'revoke',id:c.id});setList(l=>l?.filter(x=>x.id!==c.id)??null);}catch(e){setError((e as Error).message);}
 }
 return <dialog ref={ref} className="ai-dialog" aria-labelledby="ai-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}>
  {made?<Ready made={made} campaignName={campaignName} onDone={()=>setMade(null)} onClose={onClose}/>:<>
   <div className="ai-head"><h2 id="ai-title">Connect an AI</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
   <p className="ai-lead">For {campaignName} and its Maptable maps. Works with any app that supports MCP: Claude, ChatGPT, Cursor, VS Code, LM Studio and others. The AI sees this campaign and nothing else.</p>
   <h3 className="ai-label" id="ai-level">What can it do?</h3>
   <div className="ai-levels" role="radiogroup" aria-labelledby="ai-level">
    {levels.map(l=><label key={l.id} className={`ai-level ${level===l.id?'on':''} ${l.ready?'':'later'}`}>
     <input type="radio" name="ai-level" value={l.id} checked={level===l.id} disabled={!l.ready} onChange={()=>setLevel(l.id)}/>
     <strong>{l.name}{!l.ready&&<small>Coming soon</small>}</strong><span>{l.about}</span>
    </label>)}
   </div>
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
     {editing===c.id?<select aria-label={`Level for ${c.name}`} autoFocus value={c.level} onChange={e=>void change(c,e.target.value as Level)} onBlur={()=>setEditing(null)}>{levels.map(l=><option key={l.id} value={l.id} disabled={!l.ready}>{l.name}</option>)}</select>
      :<span className="ai-badge">{levelName(c.level)}</span>}
     <button type="button" className="button small" onClick={()=>setEditing(editing===c.id?null:c.id)}>Change</button>
     <button type="button" className="button small ai-revoke" onClick={()=>void revoke(c)}>Revoke</button>
    </li>)}</ul>}
  </>}
 </dialog>;
}

const apps=['Claude','ChatGPT','Cursor / VS Code','Other apps'] as const;
function Ready({made,campaignName,onDone,onClose}:{made:{name:string;level:Level;url:string};campaignName:string;onDone:()=>void;onClose:()=>void}){
 const [app,setApp]=useState<typeof apps[number]>('Claude'),[copied,setCopied]=useState('');
 const key=made.url.split('/').pop()!,origin=made.url.slice(0,made.url.indexOf('/api/'));
 const copy=(what:string,text:string)=>void navigator.clipboard.writeText(text).then(()=>{setCopied(what);setTimeout(()=>setCopied(c=>c===what?'':c),2000);}).catch(()=>setCopied('failed'));
 const field=(what:string,text:string,label:string)=><div className="ai-url"><code aria-label={label}>{text}</code><button type="button" className="button" onClick={()=>copy(what,text)}>{copied===what?<><Check size={14}/> Copied</>:<><Copy size={14}/> Copy</>}</button></div>;
 const cursor=JSON.stringify({mcpServers:{'rpg-tools':{url:made.url}}},null,2),vscode=JSON.stringify({servers:{'rpg-tools':{type:'http',url:made.url}}},null,2);
 return <>
  <div className="ai-head"><h2 id="ai-title">{made.name} is ready</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
  <p className="ai-lead">{levelName(made.level)} · {campaignName}. Add it to your AI app with the steps below.</p>
  <div className="ai-tabs" role="tablist">{apps.map(a=><button key={a} type="button" role="tab" aria-selected={app===a} onClick={()=>setApp(a)}>{a}</button>)}</div>
  <div className="ai-steps" role="tabpanel">
   {app==='Claude'&&<ol><li>In Claude, open <b>Settings → Connectors</b> and choose <b>Add custom connector</b>.</li><li>Name it “RPG Tools: {campaignName}” and paste this connector URL:</li>{field("url",made.url,"Connector URL")}<li>In a chat, turn the connector on and ask: “Give me an overview of this campaign.”</li></ol>}
   {app==='ChatGPT'&&<ol><li>In ChatGPT, turn on <b>Developer mode</b> under <b>Settings → Apps &amp; Connectors → Advanced</b>.</li><li>Create a connector, paste this as its MCP server URL, and choose no authentication (the key is in the URL):</li>{field("url",made.url,"Connector URL")}<li>In a chat, pick the connector and ask: “Give me an overview of this campaign.”</li></ol>}
   {app==='Cursor / VS Code'&&<ol><li>Cursor: add this to <code>~/.cursor/mcp.json</code>.</li>{field("cursor",cursor,"Cursor settings")}<li>VS Code: add this to <code>.vscode/mcp.json</code>, then start the server from that file.</li>{field("vscode",vscode,"VS Code settings")}</ol>}
   {app==='Other apps'&&<ol><li>Apps that take a server URL: use the connector URL.</li>{field("url",made.url,"Connector URL")}<li>Apps that take a URL and a separate key: use <code>{origin}/api/mcp</code> with the header <code>Authorization: Bearer {key.slice(0,8)}…</code> (the key is the end of the connector URL).</li><li>Apps that only run local servers: run <code>node scripts/rpg-tools-mcp.mjs</code> from the RPG Tools folder with <code>RPG_TOOLS_URL={origin}</code> and <code>RPG_TOOLS_KEY</code> set to the key.</li></ol>}
  </div>
  <div className="ai-warn"><b>Copy it now.</b> The URL holds the key, so it won’t be shown again. Anyone with it can {made.level==='read'?'read':'act on'} this campaign until you revoke it.</div>
  {copied==='failed'&&<p className="ai-error" role="alert">Copying didn’t work here. Select the text and copy it yourself.</p>}
  <div className="ai-actions"><button type="button" className="button" onClick={onDone}>Back to connections</button><button type="button" className="button primary" onClick={onClose}>Done</button></div>
 </>;
}
