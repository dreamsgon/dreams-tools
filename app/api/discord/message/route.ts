import {context,failure,privateHeaders} from '@/lib/server';
import {loadWorkspace} from '@/lib/workspace-storage';
import {campaignSettingsKey,validWebhook} from '@/lib/campaign-settings';
import {mapDiscordMessage} from '@/lib/map-discord-message';
export async function POST(request:Request){try{
 const {bucket,prefix}=await context(request);
 const text=await request.text();if(text.length>6000)throw Error('Message request is too large.');
 const saved=await loadWorkspace(bucket,prefix);if(!saved)throw Error('Save this scene in a campaign before posting.');
 const message=mapDiscordMessage(saved.workspace,JSON.parse(text));
 const stored=await bucket.get(campaignSettingsKey(prefix,message.campaignId));
 const settings=stored?await stored.json<{webhook?:string;webhooks?:Record<string,string>}>():{};
 const webhook=settings.webhooks?.[message.route]||settings.webhook;
 if(!validWebhook(webhook))throw Error('Add a Discord webhook for this campaign in Connections first.');
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(webhook)))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const key=`${prefix}discord-initiative/${encodeURIComponent(message.campaignId)}/${encodeURIComponent(message.sceneId)}/${message.route}-${fingerprint}.json`;
 const updating=message.kind==='initiative'&&message.action==='update';
 let messageId:string|undefined;
 if(updating){const record=await bucket.get(key);const data=record?await record.json<{messageId?:string}>():null;messageId=data?.messageId;if(!messageId||!/^\d+$/.test(messageId))throw Error('Post initiative once to this Discord destination before enabling updates.');}
 let response:Response;try{response=await fetch(updating?`${webhook}/messages/${messageId}`:webhook+'?wait=true',{method:updating?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:message.content,allowed_mentions:{parse:[]}}),redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw Error('Discord could not confirm delivery. Check the channel before trying again.');}
 if(response.status===429)throw Error('Discord is rate limiting posts. Wait before trying again.');
 if(!response.ok)throw Error(updating?'Discord could not update the initiative message. Post initiative again explicitly to start a new message.':'Discord rejected the post. Check the campaign webhook.');
 if(message.kind==='initiative'&&!updating){let data:{id?:string};try{data=await response.json();}catch{throw Error('Discord accepted the post but did not confirm its message ID. Check the channel before posting again.');}if(!data.id||!/^\d+$/.test(data.id))throw Error('Discord did not confirm the message ID. Check the channel before posting again.');try{await bucket.put(key,JSON.stringify({messageId:data.id}));}catch{throw Error('Initiative posted, but its update reference could not be saved. Check the channel before posting again.');}}
 return Response.json({ok:true},{headers:privateHeaders});
 }catch(e){return failure(e);}}

