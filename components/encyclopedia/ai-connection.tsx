"use client";
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,BookOpen,Check,Copy,Crown,Dices,Eye,Hand,KeyRound,Link2,Lock,Map as MapIcon,X} from 'lucide-react';
import './ai-connection.css';
import {confirmDialog} from '../confirm-dialog';
import {actionGroups,modeNames,presets,type Choice,type Mode,type Perms} from '@/lib/mcp/permissions';
import {providers,providerOf,type ProviderId} from '@/lib/ai/providers';

type Level='read'|'assist'|'run';
type Api={provider:ProviderId;baseUrl?:string;model:string;last4:string;limit:number|null;used:number};
type Connection={id:string;name:string;level:Level;perms:Perms;mode:Mode|'custom';createdAt:string;lastUsedAt?:string;api?:Api};
const tokens=(n:number)=>n>=1e6?`${+(n/1e6).toFixed(n%1e6?1:0)}M`:n>=1e3?`${Math.round(n/1e3)}k`:String(n);
const usage=(a:Api)=>a.limit?`${tokens(a.used)} of ${tokens(a.limit)} tokens this month`:`${tokens(a.used)} tokens this month`;
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
 const [list,setList]=useState<Connection[]|null>(null),[level,setLevel]=useState<Mode>('helper'),[name,setName]=useState(''),[way,setWay]=useState<'app'|'key'>('app');
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
  if(!await confirmDialog(c.api?{title:`Remove ${c.name}?`,message:'Its saved API key is deleted from RPG Tools. Nothing changes in your account with the provider.',confirm:'Remove',danger:true}:{title:`Revoke ${c.name}?`,message:'That AI app loses access to this campaign right away. You can make a new connection later.',confirm:'Revoke',danger:true}))return;
  setError('');
  try{await post({campaignId,action:'revoke',id:c.id});setList(l=>l?.filter(x=>x.id!==c.id)??null);}catch(e){setError((e as Error).message);}
 }
 return <dialog ref={ref} className="ai-dialog" aria-labelledby="ai-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}>
  {made?<Ready made={made} campaignName={campaignName} onDone={()=>setMade(null)} onClose={onClose}/>:open?<MayDo c={open} campaignId={campaignId} campaignName={campaignName} now={now} error={error} onChange={how=>void change(open,how)} onSaved={c=>setList(l=>l?.map(x=>x.id===c.id?c:x)??null)} onBack={()=>setEditing(null)} onClose={onClose}/>:<>
   <div className="ai-head"><h2 id="ai-title">Connect an AI</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
   <p className="ai-lead">For {campaignName} and its Maptable maps. Two ways in, with the same modes, approvals and AI panel. The AI sees this campaign and nothing else.</p>
   <div className="ai-ways" role="radiogroup" aria-label="How to connect">
    <label className={`ai-level ${way==='app'?'on':''}`}><input type="radio" name="ai-way" checked={way==='app'} onChange={()=>setWay('app')}/><strong><Link2 size={16}/>From an AI app</strong><span>Add RPG Tools to Claude, ChatGPT, Cursor or any app that supports MCP, with a link. You talk to it there.</span></label>
    <label className={`ai-level ${way==='key'?'on':''}`}><input type="radio" name="ai-way" checked={way==='key'} onChange={()=>setWay('key')}/><strong><KeyRound size={16}/>With an API key</strong><span>Any AI with an API key works inside RPG Tools: ask it in the AI panel at the table. Billed to that account.</span></label>
   </div>
   {way==='key'?<ApiForm campaignId={campaignId} full={list===null||list.length>=10} onMade={c=>{setList(l=>[...(l??[]),c]);setWay('app');}}/>:<>
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
   </>}
   <p className="ai-note">GM secrets, hidden tokens and fog are marked so the AI keeps them from players. Page text is passed to the AI as data, so a line in a page can&apos;t give it orders.</p>
   {error&&<p className="ai-error" role="alert">{error}</p>}
   <h3 className="ai-label">Connected</h3>
   {list===null?<p className="ai-empty">{error?'':'Loading…'}</p>:!list.length?<p className="ai-empty">No AI apps yet.</p>:
    <ul className="ai-list">{list.map(c=><li key={c.id}>
     <span className={`ai-dot ${c.lastUsedAt&&now-Date.parse(c.lastUsedAt)<36e5?'live':''}`} aria-hidden/>
     <span className="ai-who"><strong>{c.name}</strong>{c.api?<><span className="ai-badge ai-key-badge">{providerOf(c.api.provider).name} key</span><small>{c.api.model} · key ending …{c.api.last4} · {usage(c.api)}</small></>:<> · {ago(c.lastUsedAt,now)}</>}</span>
     <span className="ai-badge">{modeNames[c.mode]}</span>
     <button type="button" className="button small" onClick={()=>{setError('');setEditing(c.id);}}>Edit</button>
     <button type="button" className="button small ai-revoke" onClick={()=>void revoke(c)}>{c.api?'Remove':'Revoke'}</button>
    </li>)}</ul>}
  </>}
 </dialog>;
}

const apps=['Claude','ChatGPT','Cursor / VS Code','Other apps'] as const;
const ago2=(c:Connection,now:number)=>ago(c.lastUsedAt,now).replace(/^used/,'connected');
/** "What it may do": a ready-made set, then Do it, Ask me or Off for each action. Changes apply right away. */
function MayDo({c,campaignId,campaignName,now,error,onChange,onSaved,onBack,onClose}:{c:Connection;campaignId:string;campaignName:string;now:number;error:string;onChange:(how:{level:Mode}|{perms:Perms})=>void;onSaved:(c:Connection)=>void;onBack:()=>void;onClose:()=>void}){
 const mode=(Object.keys(presets) as Mode[]).find(m=>Object.entries(presets[m]).every(([k,v])=>c.perms[k as keyof Perms]===v))??'custom';
 return <>
  <div className="ai-head"><button type="button" className="icon-button" aria-label="Back to connections" onClick={onBack}><ArrowLeft size={16}/></button><h2 id="ai-title" className="ai-head-title">What {c.name} may do</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16}/></button></div>
  <p className="ai-lead">{campaignName} · {ago2(c,now)}. Changes apply right away.</p>
  {c.api&&<ApiSettings c={c} api={c.api} campaignId={campaignId} onSaved={onSaved}/>}
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

const modelList=(id:string,models:string[])=><datalist id={id}>{models.map(m=><option key={m} value={m}/>)}</datalist>;
/** A new connection with the GM's own API key: provider, key, model, monthly limit and mode. */
function ApiForm({campaignId,full,onMade}:{campaignId:string;full:boolean;onMade:(c:Connection)=>void}){
 const [provider,setProvider]=useState<ProviderId>('anthropic'),[key,setKey]=useState(''),[baseUrl,setBaseUrl]=useState(''),[model,setModel]=useState(''),[models,setModels]=useState<string[]|null>(null);
 const [limit,setLimit]=useState('2,000,000'),[mode,setMode]=useState<Mode>('helper'),[name,setName]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const p=providerOf(provider);
 const pick=(id:ProviderId)=>{setProvider(id);setModels(null);setModel('');setError('');};
 async function check(){
  const d=await post({campaignId,action:'models',provider,apiKey:key,...(provider==='other'?{baseUrl}:{})}) as {models:string[]};
  setModels(d.models);
  const chosen=model||(p.suggested&&d.models.includes(p.suggested)?p.suggested:d.models[0]??'');
  setModel(chosen);return chosen;
 }
 async function save(){
  setError('');
  try{
   setBusy('check');const chosen=models?model:await check();
   if(!chosen){setError('Choose a model.');return;}
   setBusy('save');
   const d=await post({campaignId,action:'createApi',provider,apiKey:key,model:chosen,limit:limit.trim()||null,level:mode,name:name.trim()||undefined,...(provider==='other'?{baseUrl}:{})});
   onMade(d.connection);
  }catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 return <form className="ai-api" onSubmit={e=>{e.preventDefault();void save();}}>
  <h3 className="ai-label" id="ai-provider">Provider</h3>
  <div className="ai-providers" role="radiogroup" aria-labelledby="ai-provider">{providers.map(x=><button key={x.id} type="button" role="radio" aria-checked={provider===x.id} className={provider===x.id?'on':''} title={x.sub} onClick={()=>pick(x.id)}>{x.name}{x.name!==x.sub&&<small>{x.sub}</small>}</button>)}</div>
  {provider==='other'&&<label className="ai-field"><span className="ai-label">Address of the API</span><input value={baseUrl} placeholder="https://example.com/v1" inputMode="url" onChange={e=>{setBaseUrl(e.target.value);setModels(null);}}/><small>Any service that speaks the OpenAI-style chat API, on a public https address.</small></label>}
  <label className="ai-field"><span className="ai-label">{p.name} API key</span><input type="password" value={key} autoComplete="off" spellCheck={false} placeholder="Paste the key" onChange={e=>{setKey(e.target.value);setModels(null);}}/><small>Make one at {p.keyFrom}. It&apos;s stored encrypted, used only by RPG Tools&apos; server, and never shown again.</small></label>
  <div className="ai-field-row">
   <label className="ai-field"><span className="ai-label">Model</span><div className="ai-inline"><input list="ai-models" value={model} placeholder={models?'Pick or type a model':'Check the key to list models'} onChange={e=>setModel(e.target.value)}/><button type="button" className="button" disabled={!key.trim()||!!busy} onClick={()=>{setError('');setBusy('check');check().catch(e=>setError((e as Error).message)).finally(()=>setBusy(''));}}>{busy==='check'?'Checking…':models?'Reload':'Check key'}</button></div>{models&&modelList('ai-models',models)}<small>{models?`${models.length} models from ${p.name}. Models that can't use tools can only answer questions.`:'Listed from the provider once the key checks out.'}</small></label>
   <label className="ai-field ai-limit"><span className="ai-label">Monthly limit</span><input value={limit} inputMode="numeric" placeholder="No limit" onChange={e=>setLimit(e.target.value)}/><small>Tokens. It stops and tells you when it&apos;s reached.</small></label>
  </div>
  <h3 className="ai-label" id="ai-api-mode">How should it help?</h3>
  <div className="ai-modes-small" role="radiogroup" aria-labelledby="ai-api-mode">{modes.map(l=><button key={l.id} type="button" role="radio" aria-checked={mode===l.id} className={mode===l.id?'on':''} title={l.about} onClick={()=>setMode(l.id)}>{l.icon}{modeNames[l.id]}</button>)}</div>
  <p className="ai-note">Fine-tune each action after saving, the same as an app connection.</p>
  <div className="ai-name"><label className="ai-label" htmlFor="ai-api-name">Name it</label><div><input id="ai-api-name" value={name} maxLength={60} placeholder={p.ai} onChange={e=>setName(e.target.value)}/><button type="submit" className="button primary" disabled={!key.trim()||!!busy||full}><Check size={14}/> {busy==='save'?'Saving…':busy==='check'?'Checking…':'Check the key and save'}</button></div></div>
  {error&&<p className="ai-error" role="alert">{error}</p>}
 </form>;
}

/** In "What it may do" for an API connection: change the model or the limit, or replace the key. */
function ApiSettings({c,api,campaignId,onSaved}:{c:Connection;api:Api;campaignId:string;onSaved:(c:Connection)=>void}){
 const [model,setModel]=useState(api.model),[limit,setLimit]=useState(api.limit?api.limit.toLocaleString('en-US'):''),[key,setKey]=useState(''),[models,setModels]=useState<string[]|null>(null),[busy,setBusy]=useState(''),[note,setNote]=useState('');
 const p=providerOf(api.provider),dirty=model!==api.model||(limit.trim()?Number(limit.replace(/[,\s_]/g,'')):null)!==api.limit||!!key.trim();
 async function run(what:string,f:()=>Promise<void>){setBusy(what);setNote('');try{await f();}catch(e){setNote((e as Error).message);}finally{setBusy('');}}
 return <section className="ai-api-settings" aria-label="Model and key">
  <h3 className="ai-label">{p.name} · key ending …{api.last4} · {usage(api)}</h3>
  <div className="ai-field-row">
   <label className="ai-field"><span className="ai-label">Model</span><div className="ai-inline"><input list="ai-models-edit" value={model} onChange={e=>setModel(e.target.value)}/><button type="button" className="button" disabled={!!busy} onClick={()=>void run('models',async()=>{const d=await post({campaignId,action:'models',id:c.id,...(key.trim()?{provider:api.provider,apiKey:key,...(api.baseUrl?{baseUrl:api.baseUrl}:{})}:{})});setModels(d.models);})}>{busy==='models'?'Loading…':'List models'}</button></div>{models&&modelList('ai-models-edit',models)}</label>
   <label className="ai-field ai-limit"><span className="ai-label">Monthly limit</span><input value={limit} inputMode="numeric" placeholder="No limit" onChange={e=>setLimit(e.target.value)}/></label>
  </div>
  <label className="ai-field"><span className="ai-label">Replace key</span><input type="password" value={key} autoComplete="off" spellCheck={false} placeholder="Paste a new key to replace the saved one" onChange={e=>setKey(e.target.value)}/></label>
  <div className="ai-inline ai-api-save"><button type="button" className="button primary" disabled={!dirty||!!busy} onClick={()=>void run('save',async()=>{
   if(key.trim())await post({campaignId,action:'models',provider:api.provider,apiKey:key,...(api.baseUrl?{baseUrl:api.baseUrl}:{})});
   const d=await post({campaignId,action:'updateApi',id:c.id,model,limit:limit.trim()||null,...(key.trim()?{apiKey:key}:{})});onSaved(d.connection);setKey('');setNote('Saved.');})}>{busy==='save'?'Saving…':'Save'}</button>{note&&<span role="status">{note}</span>}</div>
 </section>;
}
