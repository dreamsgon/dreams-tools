/** Browser side of the player sheet and player roll routes (lib/encyclopedia/player-sheet-request.ts). */
import type {RollMode} from '@/lib/rolls';
import type {Sheet,SheetTab} from '@/lib/encyclopedia/sheet-link';
import {recordLocalRoll} from '@/lib/local-roll-log';
import {showServerRoll} from './rolls';
import type {SheetRead} from './sheet-read';
import {throwOwnDice,type ThrowDie} from '@/lib/dice-throw';

/** From the roll dialog: a bonus such as +1d4 added on the server, and a note for the roll's label. */
export type RollExtra={bonus?:string;note?:string};
const extraOf=(x:RollExtra)=>({...(x.bonus?{bonus:x.bonus}:{}),...(x.note?{note:x.note}:{})});

async function post<T>(url:string,body:unknown):Promise<T>{
 let res:Response;
 try{res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
 catch{throw new Error('Couldn’t reach RPG Tools. Check your connection and try again.');}
 const value=await res.json().catch(()=>null) as (T&{error?:string})|null;
 if(!res.ok||!value)throw new Error(value?.error??'Something went wrong. Try again.');
 return value;
}
const sheetCall=<T=object>(body:Record<string,unknown>)=>post<T>('/api/encyclopedia/player-sheet',body);

/** Reads a published link on our server for a signed-in member. */
export async function readPublishedAsMember(ref:string,link:string):Promise<SheetRead>{
 const body=await sheetCall<{title?:string;url?:string;tabs?:SheetTab[]}>({action:'read',ref,link});
 if(!body.tabs)throw new Error('Could not read that sheet.');
 return {source:'published',publishedUrl:body.url,title:(body.title??'Published sheet').slice(0,200),tabs:body.tabs,named:[]};
}
export const linkMySheet=(ref:string,entryId:string,sheet:Sheet)=>sheetCall({action:'link',ref,entryId,sheet});
/** Without `tabs` the server reads the published link again; with them (read from Google in this browser) it uses those. */
export const refreshMySheet=(ref:string,entryId:string,tabs?:SheetTab[])=>sheetCall<{missing?:string[]}>({action:'refresh',ref,entryId,...(tabs?{tabs}:{})});
export const unlinkMySheet=(ref:string,entryId:string)=>sheetCall({action:'unlink',ref,entryId});

const notes={sent:'Sent to the roll log and the campaign’s Discord channel',skipped:'Rolled here. Dice rolls are set to “Don’t post” in Discord.',none:'Sent to the roll log. This campaign has no Discord channel.',failed:'Rolled, but Discord did not accept it.'};
/** Rolls on the server from the formula stored on the sheet, then shows the result card. The browser sends no total. */
export async function rollFromSheet(ref:string,entryId:string,itemId:string,mode:RollMode,extra:RollExtra={}){
 const r=await post<{title:string;formula:string;total:number;detail:string;breakdown:string;discord:keyof typeof notes;dice?:ThrowDie[]}>('/api/encyclopedia/player-roll',{ref,entryId,itemId,mode,...extraOf(extra)});
 const logged=recordLocalRoll({label:r.title,total:r.total,breakdown:r.breakdown,formula:r.formula,...(r.discord==='sent'?{outcome:'Posted to Discord'}:{})});
 await throwOwnDice(r.dice);
 showServerRoll({mode,title:r.title,formula:r.formula,total:r.total,detail:r.detail,note:notes[r.discord]??notes.none,logId:logged?.id,again:()=>{void rollFromSheet(ref,entryId,itemId,mode,extra).catch(()=>{});}});
}

/** Rolls one of a stat's rolls on the server from the campaign's sheet. Spending (like 1 Stress) happens there too. */
export async function rollStatFromSheet(ref:string,entryId:string,statId:string,rollName:string,mode:RollMode,extra:RollExtra={}){
 const r=await post<{title:string;formula:string;total:number;detail:string;breakdown:string;discord:keyof typeof notes;outcome?:{ok:boolean;text:string};spent?:{label:string;n:number};dice?:ThrowDie[]}>('/api/encyclopedia/player-roll',{ref,entryId,statId,rollName,mode,...extraOf(extra)});
 const logged=recordLocalRoll({label:r.title,total:r.total,breakdown:r.breakdown,formula:r.formula,...(r.discord==='sent'?{outcome:'Posted to Discord'}:{})});
 await throwOwnDice(r.dice);
 const base=notes[r.discord]??notes.none,note=r.spent?`${base}${base.endsWith('.')?'':'.'} Spent ${r.spent.n} ${r.spent.label}.`:base;
 showServerRoll({mode,title:r.title,formula:r.formula,total:r.total,detail:r.detail,note,logId:logged?.id,...(r.outcome?{outcome:r.outcome}:{}),again:()=>{void rollStatFromSheet(ref,entryId,statId,rollName,mode,extra).catch(()=>{});}});
 return r;
}
