import {z} from 'zod';
import {json,ownerFrom,sameOrigin} from '@/lib/encyclopedia/workspace-server';
import {readPublishedSheet,SheetReadError} from '@/lib/encyclopedia/sheet-published';
export const dynamic='force-dynamic';
const action=z.object({action:z.literal('read'),link:z.string().max(1000)});
// Reads a Google Sheet that was published to the web, for the character sheet link. The signed-in GM only; nothing is stored here.
export async function POST(request:Request){
 const owner=await ownerFrom(request);if(!owner)return json({error:'Sign in required'},401);
 if(!sameOrigin(request))return json({error:'Same-origin request required'},403);
 try{
  const text=await request.text();
  if(text.length>2000)return json({error:'That link is too long.'},400);
  const input=action.parse(JSON.parse(text));
  return json(await readPublishedSheet(input.link));
 }catch(e){return json({error:e instanceof SheetReadError?e.message:'Could not read that sheet.'},400);}
}
