import {parseDice,withKeepMode,type RollMode} from './rolls.ts';
import {addBonus,askRoll,noteLabel} from './roll-dialog.ts';
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
/**
 * Rolls through the Maptable dice tray, after the roll dialog (bonus, Advantage on a single d20, a note for the label).
 * `mode` is the Advantage chosen on the page. Throws straight away when the formula isn't dice.
 */
export function requestMapRoll(request:MapRollRequest&{mode?:RollMode}){
 parseDice(request.formula);
 void askRoll({title:request.context.label,formula:request.formula,mode:request.mode}).then(c=>{
  if(!c)return;
  const detail:MapRollRequest={formula:withKeepMode(addBonus(request.formula,c.bonus),c.mode),context:{...request.context,label:noteLabel(request.context.label,c.note)}};
  window.dispatchEvent(new CustomEvent('maptable-tray-roll',{detail}));
 });
}
