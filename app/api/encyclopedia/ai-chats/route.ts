import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {EncyclopediaStore} from '@/lib/encyclopedia/store';
import type {Entry} from '@/lib/encyclopedia/world-model';
import {sendEncyclopediaPost} from '@/lib/encyclopedia/discord-send';
import {getBucket} from '@/lib/storage';
import {campaignFor} from '@/lib/mcp/campaign-for';
import {chatRecap,chatSessionBody,deleteChat,listChats,readChat,renameChat} from '@/lib/ai/chats';
export const dynamic='force-dynamic';
const id=z.string().min(1).max(100);
// The AI panel's saved chats for one campaign: list them, open one (full=1 includes a long chat's earlier turns), rename, delete, or export one as a session page or a Discord recap.
export async function GET(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 const params=new URL(request.url).searchParams;
 try{
  const bucket=getBucket(),campaign=await campaignFor(bucket,owner,{campaignId:params.get('campaignId'),maptableCampaignId:params.get('maptableCampaignId')});
  if(!campaign)return json({chats:[]});
  const chatId=params.get('chatId');
  if(chatId){
   const [chat,{data}]=await Promise.all([readChat(bucket,owner,campaign,chatId,{full:params.get('full')==='1'}),new EncyclopediaStore(bucket).read(owner)]);
   return json({chat,campaign:data.campaigns.find(c=>c.id===campaign)?.name});
  }
  return json({chats:await listChats(bucket,owner,campaign)});
 }catch(e){return json({error:e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Could not load your chats.'},400);}
}
const pick=z.object({answers:z.boolean(),questions:z.boolean(),steps:z.boolean()});
const action=z.discriminatedUnion('action',[
 z.object({action:z.literal('rename'),title:z.string().max(200)}),
 z.object({action:z.literal('delete')}),
 z.object({action:z.literal('session'),title:z.string().max(120).optional()}),
 z.object({action:z.literal('discord'),pick:pick.optional(),text:z.string().max(4000).optional(),title:z.string().max(120).optional()}),
]);
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const raw=JSON.parse(await request.text());
  const where=z.object({campaignId:id.optional(),maptableCampaignId:id.optional(),chatId:id}).parse(raw),input=action.parse(raw);
  const bucket=getBucket(),campaign=await campaignFor(bucket,owner,where);
  if(!campaign)throw Error('This map has no Encyclopedia campaign paired with it.');
  if(input.action==='rename'){await renameChat(bucket,owner,campaign,where.chatId,input.title);return json({ok:true,chats:await listChats(bucket,owner,campaign)});}
  if(input.action==='delete'){await deleteChat(bucket,owner,campaign,where.chatId);return json({ok:true,chats:await listChats(bucket,owner,campaign)});}
  const chat=await readChat(bucket,owner,campaign,where.chatId,{full:true});
  if(input.action==='discord'){
   const text=(input.text??chatRecap(chat,input.pick??{answers:true,questions:false,steps:false})).trim();
   if(!text)throw Error('There is nothing to post. Choose what to include.');
   const sent=await sendEncyclopediaPost(bucket,owner,campaign,{kind:'recap',text,title:input.title?.trim()||chat.title});
   return json({ok:true,skipped:sent.skipped});
  }
  // Save as a session page in the campaign's session notes folder, GM only.
  const store=new EncyclopediaStore(bucket);
  for(let attempt=0;attempt<4;attempt++){
   const {data,revision}=await store.read(owner),c=data.campaigns.find(x=>x.id===campaign);
   if(!c)throw Error('That campaign is gone.');
   const folder=data.entries.find(e=>e.kind==='folder'&&e.campaignId===c.id&&/session/i.test(e.title));
   const page:Entry={id:crypto.randomUUID(),worldId:c.worldId,campaignId:c.id,parentId:folder?.id??null,title:input.title?.trim()||chat.title,kind:'session',body:chatSessionBody(chat,c.name),updatedAt:new Date().toISOString()};
   const saved=await store.saveTagged(owner,{...data,entries:[...data.entries,page]},revision);
   if(saved)return json({ok:true,page:{id:page.id,title:page.title,folder:folder?.title??null}});
  }
  throw Error('Your Encyclopedia is busy. Try again.');
 }catch(e){return json({error:e instanceof Error&&!(e instanceof z.ZodError)?e.message:'Could not change that chat.'},400);}
}
