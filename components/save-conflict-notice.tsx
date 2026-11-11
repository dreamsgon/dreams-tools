"use client";
import {useState} from 'react';
import './save-conflict-notice.css';
export type SaveConflictNoticeProps={status:{phase:string;message:string};onDownload:()=>void;onReload:()=>void;onRetry?:()=>void;disabled?:boolean;detail?:string};
export default function SaveConflictNotice({status,onDownload,onReload,onRetry,disabled=false,detail}:SaveConflictNoticeProps){
 const [confirming,setConfirming]=useState(false);
 if(status.phase!=='error'&&status.phase!=='conflict')return null;
 return <div className="save-conflict-notice" role="alert"><p>{status.message}</p><div><button type="button" onClick={onDownload}>Download local changes</button>{status.phase==='conflict'?<button type="button" disabled={disabled} onClick={()=>setConfirming(true)}>Discard local changes & load cloud</button>:onRetry&&<button type="button" disabled={disabled} onClick={onRetry}>Retry save</button>}</div>{confirming&&status.phase==='conflict'&&<div className="save-conflict-confirm"><p>Discard unsaved changes on this device? Download your local changes first if you want to keep them.</p><button type="button" onClick={()=>setConfirming(false)}>Keep local changes</button><button type="button" disabled={disabled} onClick={()=>{setConfirming(false);onReload();}}>Confirm discard and load cloud</button></div>}{detail&&<small>{detail}</small>}</div>;
}
