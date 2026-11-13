import {context,failure,privateHeaders} from '@/lib/server';
import {loadWorkspace} from '@/lib/workspace-storage';
import {sendMapMessage} from '@/lib/discord/map-posts';
// A roll or initiative from Maptable, rebuilt from the saved scene and sent to the campaign's channel for it.
export async function POST(request:Request){try{
 const {bucket,prefix}=await context(request);
 const text=await request.text();if(text.length>6000)throw Error('Message request is too large.');
 const saved=await loadWorkspace(bucket,prefix);if(!saved)throw Error('Save this scene in a campaign before posting.');
 const {skipped}=await sendMapMessage({bucket,prefix,workspace:saved.workspace},JSON.parse(text));
 return Response.json({ok:true,skipped},{headers:privateHeaders});
 }catch(e){return failure(e);}}
