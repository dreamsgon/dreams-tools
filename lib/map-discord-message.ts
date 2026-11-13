import {z} from 'zod';
import {sceneCampaign} from './campaign-settings.ts';
import type {Workspace} from './model';
import {resolveTokenForCampaign,tokenZeroHpPolicy} from './token-defaults.ts';
import {initiativeSummary,initiativeView} from './initiative-summary.ts';
import {parseDice} from './rolls.ts';
import {initiativePost,rollPost} from './discord/cards.ts';
import {rollerName} from './discord/avatar.ts';
import type {Post} from './discord/send.ts';
const base={sceneId:z.string().min(1).max(120),campaignId:z.string().min(1).max(120)};
export const mapMessageSchema=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('initiative'),action:z.enum(['post','update']).optional()}),
 z.object({...base,kind:z.literal('roll'),label:z.string().max(120),formula:z.string().max(200),total:z.number().finite(),detail:z.string().max(1200),tokenId:z.string().max(120).optional()}),
]);
/**
 * A Maptable roll or initiative post, rebuilt from the saved scene. `content` is the plain-text version
 * (shown as a preview in the app); `post` is the card sent to Discord. `avatarTokenId` is the token
 * whose picture goes on a roll card.
 */
export function mapDiscordMessage(workspace:Workspace,input:unknown){
 const data=mapMessageSchema.parse(input),campaignId=sceneCampaign(workspace,data.sceneId);
 if(campaignId!==data.campaignId)throw Error("This scene's campaign changed. Save and reopen before posting.");
 const scene=workspace.scenes.find(s=>s.id===data.sceneId)!;
 const route=scene.mapType==='world'?'world':scene.mapType==='area'?'exploration':'combat' as 'world'|'exploration'|'combat';
 let content:string,post:Post,avatarTokenId:string|undefined;
 if(data.kind==='initiative'){
  const tokens=scene.tokens.map(t=>({...resolveTokenForCampaign(workspace,campaignId,t),zeroHpStatus:tokenZeroHpPolicy(workspace,campaignId,t)}));
  content=initiativeSummary(scene.name,tokens,workspace.conditions,scene);
  post=initiativePost(scene.name,initiativeView(tokens,workspace.conditions,scene));
 }else{
  parseDice(data.formula);content=`${scene.name} — ${data.label}\n${data.formula} = ${data.total}\n${data.detail}`;
  // Who rolled: the token the roll came from, or a visible token named at the start of the label ("Bog Hag · Claws").
  const name=rollerName(data.label).toLocaleLowerCase();
  const token=scene.tokens.find(t=>t.id===data.tokenId)??scene.tokens.find(t=>!t.hidden&&t.name.toLocaleLowerCase()===name);
  const who=token&&!(token.hidden||token.nameVisibility==='hide')?token.name:undefined;
  avatarTokenId=who?token!.id:undefined;
  const title=who&&data.label.toLocaleLowerCase().startsWith(who.toLocaleLowerCase())?data.label.slice(who.length).replace(/^\s*[·—–:-]\s*/,'')||'Roll':data.label||'Roll';
  post=rollPost({title,formula:data.formula,total:data.total,detail:data.detail,who,avatar:!!token?.assetId&&!!who,enemy:token?.disposition==='enemy',footer:scene.name});
 }
 if(content.length>1900)throw Error('Message is too long for Discord. Reduce the number of initiative entries.');
 return {campaignId,route,content,post,avatarTokenId,sceneId:data.sceneId,kind:data.kind,action:data.kind==='initiative'?(data.action??'post'):'post'};
}
