import type {Scene, Token} from './model.ts';

export type InitiativeEntry = {id:string;label:string;tokens:Token[];initiative:number|null};
export const getInitiativeRound = (scene:Scene) => scene.initiativeState?.round ?? 1;
const finiteInitiative = (token:Token) => typeof token.initiative === 'number' && Number.isFinite(token.initiative);
export function getInitiativeEntries(scene:Scene):InitiativeEntry[] {
 const entries=new Map<string,InitiativeEntry>();
 for(const token of scene.tokens){
  const group=token.initiativeGroup?.trim(),id=group?`group:${group}`:token.id;
  let entry=entries.get(id);
  if(!entry){entry={id,label:group||token.name,tokens:[],initiative:null};entries.set(id,entry);}
  entry.tokens.push(token);
  if(finiteInitiative(token))entry.initiative=Math.max(entry.initiative??-Infinity,token.initiative!);
 }
 const order=new Map((scene.initiativeState?.order??[]).map((id,index)=>[id,index]));
 return [...entries.values()].sort((a,b)=>{
  const ai=order.get(a.id),bi=order.get(b.id);
  if(ai!==undefined||bi!==undefined)return (ai??Infinity)-(bi??Infinity);
  return (b.initiative??-Infinity)-(a.initiative??-Infinity)||a.label.localeCompare(b.label);
 });
}
export const isInitiativeEntryActive = (entry:InitiativeEntry) => entry.initiative!==null&&entry.tokens.some(t=>!t.skipInitiative);
export function getCurrentInitiativeEntry(scene:Scene):InitiativeEntry|null {
 return getInitiativeEntries(scene).find(e=>e.id===scene.initiativeState?.currentId&&isInitiativeEntryActive(e))??null;
}
export function advanceInitiative(scene:Scene,direction:1|-1) {
 const entries=getInitiativeEntries(scene).filter(isInitiativeEntryActive),round=getInitiativeRound(scene);
 const state=scene.initiativeState??={round,currentId:null,order:[]};
 if(!entries.length){state.currentId=null;return;}
 const index=entries.findIndex(e=>e.id===state.currentId);
 if(index<0){state.currentId=entries[direction===1?0:entries.length-1].id;return;}
 const next=index+direction;
 if(next>=entries.length)state.round++;
 if(next<0){if(state.round===1)return;state.round--;}
 state.currentId=entries[(next+entries.length)%entries.length].id;
}
export function reorderInitiative(scene:Scene,fromId:string,toId:string) {
 const ids=getInitiativeEntries(scene).map(e=>e.id),from=ids.indexOf(fromId),to=ids.indexOf(toId);
 if(from<0||to<0||from===to)return;
 ids.splice(from,1);ids.splice(to,0,fromId);
 const state=scene.initiativeState??={round:1,currentId:null,order:[]};state.order=ids;
}
/** Only observed additions receive a timestamp; legacy conditions keep unknown ages. */
export function syncConditionRounds(scene:Scene,previousScene:Scene|undefined) {
 const round=getInitiativeRound(scene);
 for(const token of scene.tokens){
  const before=previousScene?.tokens.find(t=>t.id===token.id),starts:Record<string,number>={};
  for(const id of token.conditions){
   const existing=token.conditionRounds?.[id];
   if(existing!==undefined)starts[id]=existing;
   else if(previousScene&&!before?.conditions.includes(id))starts[id]=round;
  }
  if(Object.keys(starts).length)token.conditionRounds=starts;else delete token.conditionRounds;
 }
}
export function conditionAge(token:Token,conditionId:string,round:number):number|null {
 const start=token.conditionRounds?.[conditionId];
 return token.conditions.includes(conditionId)&&start!==undefined?Math.max(0,round-start):null;
}
