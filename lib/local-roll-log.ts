export type LocalRollInput = {label:string;total:number;breakdown:string;outcome?:string};
export type LocalRollEntry = LocalRollInput & {id:string;timestamp:number};
const storageKey='maptable-local-roll-log-v1';
export const localRollLogEvent='maptable-local-roll-log-change';
let memory:LocalRollEntry[]=[];
let dirty=false;
export function readLocalRollLog():LocalRollEntry[]{
 if(typeof window==='undefined')return [];
 if(dirty)return memory;
 try{const raw=window.localStorage.getItem(storageKey);if(raw===null)return memory;const value:unknown=JSON.parse(raw);if(Array.isArray(value)){memory=value.filter((e):e is LocalRollEntry=>!!e&&typeof e==='object'&&typeof e.id==='string'&&typeof e.label==='string'&&Number.isFinite(e.total)&&typeof e.breakdown==='string'&&Number.isFinite(e.timestamp)&&Math.abs(e.timestamp)<=8640000000000000&&(e.outcome===undefined||typeof e.outcome==='string')).slice(0,100);}}catch{}
 return memory;
}
function save(entries:LocalRollEntry[]){memory=entries;dirty=true;try{window.localStorage.setItem(storageKey,JSON.stringify(entries));dirty=false;}catch{}window.dispatchEvent(new Event(localRollLogEvent));}
export function recordLocalRoll(input:LocalRollInput){
 if(typeof window==='undefined'||!Number.isFinite(input.total))return;
 const entry:LocalRollEntry={...input,id:globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random()}`,timestamp:Date.now()};
 save([entry,...readLocalRollLog()].slice(0,100));
 return entry;
}
export function clearLocalRollLog(){if(typeof window!=='undefined')save([]);}
export function subscribeLocalRollLog(listener:()=>void){
 const onStorage=(event:StorageEvent)=>{if(event.key===storageKey||event.key===null){if(!dirty)memory=[];listener();}};
 window.addEventListener(localRollLogEvent,listener);window.addEventListener('storage',onStorage);
 return()=>{window.removeEventListener(localRollLogEvent,listener);window.removeEventListener('storage',onStorage);};
}
