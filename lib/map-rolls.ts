import {parseDice} from './rolls.ts';
/** Where a Maptable roll came from. `tokenId` is the token whose picture goes on its Discord card. */
export type MapRollContext = {sceneId:string;campaignId:string|null;label:string;tokenId?:string};
export type MapRollRequest = {formula:string;context:MapRollContext};
export function inlineRollParts(text:string):{text:string;formula?:string}[]{
 const parts:{text:string;formula?:string}[]=[];let end=0;
 for(const match of text.slice(0,20000).matchAll(/\[\[([^\]\n]{1,200})\]\]/g)){
  parts.push({text:text.slice(end,match.index)});let valid=false;try{parseDice(match[1]);valid=true;}catch{}
  parts.push({text:match[0],...(valid?{formula:match[1]}:{})});end=match.index!+match[0].length;
 }parts.push({text:text.slice(end,20000)});return parts;
}
export function requestMapRoll(request:MapRollRequest){parseDice(request.formula);window.dispatchEvent(new CustomEvent('maptable-tray-roll',{detail:request}));}
