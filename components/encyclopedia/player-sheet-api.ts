/** Browser side of the player sheet and player roll routes (lib/encyclopedia/player-sheet-request.ts). */
import type {RollMode} from '@/lib/rolls';
import type {Sheet,SheetTab} from '@/lib/encyclopedia/sheet-link';
import {recordLocalRoll} from '@/lib/local-roll-log';
import {showServerRoll} from './rolls';
import type {SheetRead} from './sheet-read';

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
export async function rollFromSheet(ref:string,entryId:string,itemId:string,mode:RollMode){
 const r=await post<{title:string;formula:string;total:number;detail:string;breakdown:string;discord:keyof typeof notes}>('/api/encyclopedia/player-roll',{ref,entryId,itemId,mode});
 const logged=recordLocalRoll({label:r.title,total:r.total,breakdown:r.breakdown,...(r.discord==='sent'?{outcome:'Posted to Discord'}:{})});
 showServerRoll({title:r.title,formula:r.formula,total:r.total,detail:r.detail,note:notes[r.discord]??notes.none,logId:logged?.id,again:()=>{void rollFromSheet(ref,entryId,itemId,mode).catch(()=>{});}});
}
