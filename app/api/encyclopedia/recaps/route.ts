import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {EncyclopediaStore} from '@/lib/encyclopedia/store';
import {sendEncyclopediaPost} from '@/lib/encyclopedia/discord-send';
import {discordText,TRANSCRIPT_LIMIT,wordCount} from '@/lib/encyclopedia/recaps';
import {getBucket} from '@/lib/storage';
import {checkRecap,writeRecap,writeRecapAgain,writeSample,writeStory} from '@/lib/ai/recap-writer';
import {readLink} from '@/lib/encyclopedia/link-source';
export const dynamic='force-dynamic';
// Writing a recap with the GM's own API key reads the whole transcript and waits on the AI twice.
export const maxDuration=300;
const id=z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
const message=(e:unknown,fallback:string)=>e instanceof Error&&!(e instanceof z.ZodError)?e.message:fallback;
// A session recap's transcript (kept outside the workspace), reading one from a public link, writing or checking it with the GM's API key, and its Discord post. The GM only.
export async function GET(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 try{
  const entryId=id.parse(new URL(request.url).searchParams.get('entryId'));
  const text=await new EncyclopediaStore(getBucket()).readTranscript(owner,entryId);
  return json({text:text??'',words:text?wordCount(text):0});
 }catch(e){return json({error:message(e,'Could not load the transcript.')},400);}
}
const action=z.discriminatedUnion('action',[
 z.object({action:z.literal('transcript'),entryId:id,text:z.string().max(TRANSCRIPT_LIMIT)}),
 z.object({action:z.literal('discord'),entryId:id}),
 z.object({action:z.literal('link'),link:z.string().max(1000)}),
 z.object({action:z.literal('write'),entryId:id,campaignId:id,connectionId:id}),
 z.object({action:z.literal('again'),entryId:id,campaignId:id,connectionId:id,note:z.string().max(500),styleId:id.optional()}),
 z.object({action:z.literal('sample'),campaignId:id,connectionId:id,kind:z.enum(['recap','story']),style:z.unknown(),entryId:id.optional()}),
 z.object({action:z.literal('check'),entryId:id,campaignId:id,connectionId:id}),
 z.object({action:z.literal('story'),campaignId:id,connectionId:id,note:z.string().max(500).optional(),keep:z.boolean().optional(),before:z.string().max(6000).optional(),styleId:id.optional(),length:z.enum(['short','standard','detailed']).optional()}),
]);
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const input=action.parse(JSON.parse(await request.text())),bucket=getBucket(),store=new EncyclopediaStore(bucket);
  if(input.action==='transcript'){
   await store.saveTranscript(owner,input.entryId,input.text);
   return json({ok:true,words:wordCount(input.text)});
  }
  // A public Google Doc, Drive file, GitHub file or Notion page, read for the New session recap dialog.
  if(input.action==='link')return json(await readLink(input.link));
  if(input.action==='write')return json(await writeRecap(bucket,owner,input.campaignId,input.connectionId,input.entryId));
  if(input.action==='again')return json(await writeRecapAgain(bucket,owner,input.campaignId,input.connectionId,input.entryId,input.note,fetch,input.styleId));
  if(input.action==='sample')return json(await writeSample(bucket,owner,input.campaignId,input.connectionId,{kind:input.kind,style:input.style,entryId:input.entryId}));
  if(input.action==='check')return json(await checkRecap(bucket,owner,input.campaignId,input.connectionId,input.entryId));
  if(input.action==='story')return json(await writeStory(bucket,owner,input.campaignId,input.connectionId,fetch,{note:input.note,keep:input.keep,before:input.before,styleId:input.styleId,length:input.length}));
  const {data}=await store.read(owner),page=data.entries.find(e=>e.id===input.entryId);
  if(!page?.recap||!page.campaignId)throw Error('That page has no recap.');
  if(page.recap.status!=='published')throw Error('Publish the recap to players before posting it.');
  const text=discordText(page.body);
  if(!text)throw Error('The recap is empty.');
  const sent=await sendEncyclopediaPost(bucket,owner,page.campaignId,{kind:'recap',text,title:page.title});
  return json({ok:true,skipped:sent.skipped});
 }catch(e){return json({error:message(e,'Could not do that.')},400);}
}
