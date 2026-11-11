import {z} from 'zod';
import {sceneCampaign} from './campaign-settings.ts';
import type {Workspace} from './model';
import {resolveTokenForCampaign,tokenZeroHpPolicy} from './token-defaults.ts';
import {initiativeSummary} from './initiative-summary.ts';
import {parseDice} from './rolls.ts';
const base={sceneId:z.string().min(1).max(120),campaignId:z.string().min(1).max(120)};
export const mapMessageSchema=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('initiative'),action:z.enum(['post','update']).optional()}),
 z.object({...base,kind:z.literal('roll'),label:z.string().max(120),formula:z.string().max(200),total:z.number().finite(),detail:z.string().max(1200)}),
]);
export function mapDiscordMessage(workspace:Workspace,input:unknown){
 const data=mapMessageSchema.parse(input),campaignId=sceneCampaign(workspace,data.sceneId);
 if(campaignId!==data.campaignId)throw Error("This scene's campaign changed. Save and reopen before posting.");
 const scene=workspace.scenes.find(s=>s.id===data.sceneId)!;
 const route=scene.mapType==='world'?'world':scene.mapType==='area'?'exploration':'combat';
 let content:string;
 if(data.kind==='initiative'){
  const tokens=scene.tokens.map(t=>({...resolveTokenForCampaign(workspace,campaignId,t),zeroHpStatus:tokenZeroHpPolicy(workspace,campaignId,t)}));
  content=initiativeSummary(scene.name,tokens,workspace.conditions,scene);
 }else{parseDice(data.formula);content=`${scene.name} — ${data.label}\n${data.formula} = ${data.total}\n${data.detail}`;}
 if(content.length>1900)throw Error('Message is too long for Discord. Reduce the number of initiative entries.');
 return {campaignId,route,content,sceneId:data.sceneId,kind:data.kind,action:data.kind==='initiative'?(data.action??'post'):'post'};
}
