import test from 'node:test';
import assert from 'node:assert/strict';
import {requireCampaign} from '../lib/campaign-settings.ts';
import {sendDiscordTest,postForCampaign,editDiscord,discordStatus} from '../lib/discord/campaign.ts';
import {shareMap} from '../lib/discord/map-posts.ts';
import {parseWebhook,savedWebhook} from '../lib/discord/webhook.ts';
import {channelsOf,pickChannel,upgraded,publicSettings,editSettings} from '../lib/discord/settings.ts';
import {sendToDiscord,checkWebhook,postName} from '../lib/discord/send.ts';
import {rollPost,naturalD20,initiativePost,textPost,colors} from '../lib/discord/cards.ts';

/** A bucket holding JSON (or text) records by key. */
function bucket(records={}){
 return {records,
  get:async key=>key in records?{json:async()=>typeof records[key]==='string'?JSON.parse(records[key]):records[key]}:null,
  put:async(key,value)=>{records[key]=value;},delete:async key=>{delete records[key];}};
}
const hook=id=>`https://discord.com/api/webhooks/10000${id}/secret${id}`;

test('webhook links from any Discord app are read as one plain URL, and nothing else is',()=>{
 assert.deepEqual(parseWebhook('https://discord.com/api/webhooks/12345/abc-DEF_1'),{url:'https://discord.com/api/webhooks/12345/abc-DEF_1'});
 for(const host of ['discordapp.com','ptb.discord.com','canary.discord.com','PTB.discordapp.com'])
  assert.equal(parseWebhook(`https://${host}/api/v10/webhooks/12345/tok`).url,'https://discord.com/api/webhooks/12345/tok');
 assert.deepEqual(parseWebhook(' https://discord.com/api/webhooks/12345/tok/?thread_id=987654&wait=true '),{url:'https://discord.com/api/webhooks/12345/tok',threadId:'987654'});
 for(const bad of ['http://discord.com/api/webhooks/12345/tok','https://discord.com.evil.test/api/webhooks/12345/tok','https://evil.test/api/webhooks/12345/tok',
  'https://user@discord.com/api/webhooks/12345/tok','https://discord.com:444/api/webhooks/12345/tok','https://discord.com/api/webhooks/12345/tok?thread_id=abc',
  'https://discord.com/api/webhooks/12345/tok?username=x','https://discord.com/api/webhooks/12345/tok#x','https://discord.com/api/webhooks/12345/tok/slack','not a link',42,null])
  assert.equal(parseWebhook(bad),null,String(bad));
 assert.ok(savedWebhook('https://discord.com/api/webhooks/1/a'));assert.ok(!savedWebhook('https://discordapp.com/api/webhooks/1/a'));
});

test('old saves read as named channels and keep sending maps where they did',()=>{
 const old={webhook:hook(1),webhooks:{combat:hook(2),world:'https://evil.test/x'}};
 const {channels,main}=channelsOf(old);
 assert.deepEqual(channels.map(c=>[c.id,c.name]),[['default','Main channel'],['combat','Combat maps']]);assert.equal(main,'default');
 assert.equal(pickChannel(old,'combatMaps','combat').url,hook(2));
 assert.equal(pickChannel(old,'worldMaps','world').url,hook(1),'an unsaved route falls back to the main channel');
 assert.equal(pickChannel(old,'rolls').url,hook(1));
 assert.equal(pickChannel({},'rolls'),null);
 assert.deepEqual(upgraded(old).routes,{combatMaps:'combat'});
 const view=publicSettings(old);
 assert.doesNotMatch(JSON.stringify(view),/secret|https:/,'the browser never sees webhook URLs');
 assert.equal(view.routes.combatMaps,'combat');assert.equal(view.routes.narration,'default');
});

test('channels are added, renamed, routed, turned off and removed',()=>{
 let n=0;const opts={newId:()=>`c${++n}`};
 let s=editSettings({},{action:'addChannel',url:'https://ptb.discordapp.com/api/webhooks/11111/aaa?thread_id=55555',name:''},{...opts,hookName:'Captain Hook'});
 assert.deepEqual(s.channels[0],{id:'c1',name:'Captain Hook',url:'https://discord.com/api/webhooks/11111/aaa',threadId:'55555',hookName:'Captain Hook'});assert.equal(s.main,'c1');
 assert.throws(()=>editSettings(s,{action:'addChannel',url:'https://discord.com/api/webhooks/11111/aaa?thread_id=55555'},opts),/already added/);
 assert.throws(()=>editSettings(s,{action:'addChannel',url:'https://example.test/hook'},opts),/isn't a Discord webhook/);
 s=editSettings(s,{action:'addChannel',url:hook(222),name:'  Dice\nroom  '},opts);assert.equal(s.channels[1].name,'Dice room');assert.equal(s.main,'c1');
 s=editSettings(s,{action:'setRoute',kind:'rolls',to:'c2'},opts);
 s=editSettings(s,{action:'setRoute',kind:'recaps',to:'off'},opts);
 assert.equal(pickChannel(s,'rolls').id,'c2');assert.equal(pickChannel(s,'recaps'),'off');assert.equal(pickChannel(s,'narration').id,'c1');
 assert.throws(()=>editSettings(s,{action:'setRoute',kind:'gossip',to:'c1'},opts),/kind of post/);
 assert.throws(()=>editSettings(s,{action:'setRoute',kind:'rolls',to:'gone'},opts),/no longer here/);
 s=editSettings(s,{action:'renameChannel',id:'c1',name:'Table talk'},opts);assert.equal(s.channels[0].name,'Table talk');
 assert.throws(()=>editSettings(s,{action:'renameChannel',id:'c1',name:'  '},opts),/name/);
 s=editSettings(s,{action:'setMain',id:'c2'},opts);
 s=editSettings(s,{action:'removeChannel',id:'c2'},opts);
 assert.equal(s.main,'c1');assert.equal(s.routes.rolls,undefined,'kinds sent to a removed channel go back to the main one');assert.equal(pickChannel(s,'rolls').id,'c1');
 s=editSettings(s,{action:'postAs',name:'The Salt Road'},opts);assert.equal(s.postAs,'The Salt Road');
 s=editSettings(s,{action:'postAs',name:''},opts);assert.equal(s.postAs,undefined);
 for(let i=0;i<11;i++)s=editSettings(s,{action:'addChannel',url:hook(1000+i)},opts);
 assert.throws(()=>editSettings(s,{action:'addChannel',url:hook(9999)},opts),/up to 12/);
});

test('roll cards show the total large, colour crits and enemies, and keep dice text literal',()=>{
 const card=rollPost({title:'Claws against Bram',formula:'1d20+6',total:26,detail:'[20] +6',who:'Bog Hag',avatar:true,enemy:true}).embeds[0];
 assert.equal(card.color,colors.crit);assert.match(card.title,/Natural 20!/);assert.match(card.description,/^## 26\n`1d20\+6`/);
 assert.deepEqual(card.author,{name:'Bog Hag',icon_url:'attachment://avatar.png'});
 assert.equal(rollPost({title:'Bite',formula:'1d20',total:1,detail:'[1]'}).embeds[0].color,colors.fumble);
 assert.equal(rollPost({title:'Bite',formula:'1d20+2',total:12,detail:'[10] +2',enemy:true}).embeds[0].color,colors.enemy);
 assert.equal(rollPost({title:'Bite',formula:'2d6',total:7,detail:'[3, 4]',who:'Wren'}).embeds[0].author.icon_url,undefined,'no picture, no icon');
 assert.equal(naturalD20('2d20kh1','[20, 3]'),null);assert.equal(naturalD20('d20+1','[7] +1'),7);
 assert.match(rollPost({title:'x',formula:'1d4',total:2,detail:'**bold** `tick` ||spoiler||'}).embeds[0].description,/\\\*\\\*bold\\\*\\\* \\`tick\\` \\\|\\\|spoiler/);
 assert.match(rollPost({title:'a\n\nb',formula:'1d4',total:2,detail:''}).embeds[0].title,/^a b$/);
 const init=initiativePost('Greyfen marsh',{round:2,current:'Bram',next:'Bog Hag',rows:[{initiative:'18',name:'Bram',active:true,skipped:false,stats:['Healthy'],detail:''},{initiative:'12',name:'Bog *Hag*',active:false,skipped:true,stats:[],detail:''}]}).embeds[0];
 assert.equal(init.title,'Greyfen marsh · Round 2');assert.match(init.description,/Bram’s turn · next: Bog Hag/);assert.match(init.description,/▶ \*\*Bram\*\*/);assert.match(init.description,/Bog \\\*Hag\\\* \(skipped\)/);
 assert.equal(textPost('recap','  The reeds part.  ','Session 4').embeds[0].color,colors.recap);
});

test('posting sends JSON or files with mentions off and redirects refused, and explains Discord errors',async()=>{
 const calls=[];let reply=()=>Response.json({id:'777'});
 const fetcher=async(url,options)=>{calls.push({url,options});return reply();};
 const h={url:hook(5),threadId:'424242'};
 assert.deepEqual(await sendToDiscord(h,{content:'@everyone hi',username:'Wren'},{fetcher}),{id:'777'});
 assert.equal(calls[0].url,hook(5)+'?wait=true&thread_id=424242');assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.method,'POST');
 assert.deepEqual(JSON.parse(calls[0].options.body).allowed_mentions,{parse:[]});
 await sendToDiscord(h,{embeds:[{title:'x',author:{name:'Bram',icon_url:'attachment://avatar.png'}}],files:[{name:'avatar.png',type:'image/png',bytes:new Uint8Array([1,2,3])}]},{fetcher,edit:'777'});
 const form=calls[1].options.body;assert.equal(calls[1].options.method,'PATCH');assert.equal(calls[1].url,hook(5)+'/messages/777?thread_id=424242');
 const payload=JSON.parse(form.get('payload_json'));assert.deepEqual(payload.attachments,[{id:0,filename:'avatar.png'}]);assert.deepEqual(payload.allowed_mentions,{parse:[]});
 assert.equal(form.get('files[0]').name,'avatar.png');assert.equal(form.get('files[0]').type,'image/png');
 const cases=[[()=>new Response(null,{status:302}),/rejected/],[()=>new Response(null,{status:429}),/rate limiting/],[()=>new Response(null,{status:404}),/deleted/],[()=>new Response(null,{status:413}),/too large/],
  [()=>Response.json({code:220001},{status:400}),/forum channel/],[()=>Response.json({code:10003},{status:404}),/deleted/],[()=>Response.json({code:10003},{status:400}),/no longer exists/],[()=>Response.json({code:50083},{status:400}),/archived/],
  [()=>{throw Error('network https://discord.com/api/webhooks/5/secret5');},/could not confirm/]];
 for(const [r,message] of cases){reply=r;await assert.rejects(sendToDiscord(h,{content:'x'},{fetcher}),e=>{assert.match(e.message,message);assert.doesNotMatch(e.message,/secret|https:/);return true;});}
 reply=()=>new Response(null,{status:404});await assert.rejects(sendToDiscord(h,{content:'x'},{fetcher,edit:'1'}),/message to update is gone/);
 reply=()=>Response.json({name:'Captain Hook'});assert.deepEqual(await checkWebhook(h,fetcher),{state:'ok',name:'Captain Hook'});assert.equal(calls.at(-1).options.method,'GET');assert.equal(calls.at(-1).options.redirect,'manual');
 reply=()=>new Response(null,{status:404});assert.deepEqual(await checkWebhook(h,fetcher),{state:'deleted'});
 reply=()=>new Response(null,{status:500});assert.deepEqual(await checkWebhook(h,fetcher),{state:'unknown'});
 assert.equal(postName('Discord Clyde Bot'),'Bot');assert.equal(postName('@everyone'),undefined);assert.equal(postName('  '),undefined);
});

test('the webhook test only uses this campaign’s saved channels and names the campaign',async()=>{
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return Response.json({id:'1'});};
 const workspace={scenes:[],collections:[{id:'a',name:'Campaign A @everyone',kind:'campaign',parentId:null},{id:'b',name:'Campaign B',kind:'campaign',parentId:null}]};
 assert.throws(()=>requireCampaign(workspace,'foreign'));
 const b=bucket({'users/me/campaign-settings/a.json':{webhook:hook(123),webhooks:{combat:hook(789)}}});
 await sendDiscordTest(b,'users/me/','a','Campaign A @everyone',null,fetcher);
 assert.equal(calls[0].url,hook(123)+'?wait=true');assert.equal(calls[0].options.redirect,'manual');
 const payload=JSON.parse(calls[0].options.body);assert.match(payload.embeds[0].description,/Campaign A @everyone/);assert.deepEqual(payload.allowed_mentions,{parse:[]});
 assert.equal(payload.username,'Campaign A everyone','posts go out under the campaign name, with no mention');
 await sendDiscordTest(b,'users/me/','a','Campaign A','combat',fetcher);
 assert.equal(calls[1].url,hook(789)+'?wait=true');assert.match(JSON.parse(calls[1].options.body).embeds[0].description,/Combat maps/);
 await assert.rejects(sendDiscordTest(b,'users/me/','b','Campaign B',null,fetcher),/Save a webhook/);
 assert.equal(calls.length,2);
});

test('a webhook failure is never reported as success and never shows its URL',async()=>{
 for(const status of [301,302,307,308,429,404]){
  const b=bucket({'u/campaign-settings/a.json':{webhook:hook(123)}});
  await assert.rejects(sendDiscordTest(b,'u/','a','A',null,async()=>new Response('',{status})),e=>{assert.doesNotMatch(e.message,/secret|https:/);assert.match(e.message,status===429?/rate limiting/:status===404?/deleted/:/rejected/);return true;});
 }
});

test('each kind follows its channel choice, posts under Post as, and is skipped when off',async()=>{
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({id:'9'});};
 const settings={channels:[{id:'m',name:'Main',url:hook(1)},{id:'d',name:'Dice',url:hook(2),threadId:'31337'}],main:'m',routes:{aiRolls:'d',recaps:'off'},postAs:'The Lantern Coast'};
 const b=bucket({'u/campaign-settings/a.json':settings});
 assert.equal((await postForCampaign(b,'u/','a','aiRolls',{content:'x'},{fetcher})).channel.id,'d');assert.equal(calls[0].url,hook(2)+'?wait=true&thread_id=31337');assert.equal(calls[0].body.username,'The Lantern Coast');
 await postForCampaign(b,'u/','a','narration',{content:'x',username:'Wren'},{fetcher});assert.equal(calls[1].url,hook(1)+'?wait=true');assert.equal(calls[1].body.username,'Wren');
 assert.deepEqual(await postForCampaign(b,'u/','a','recaps',{content:'x'},{fetcher}),{skipped:true});assert.equal(calls.length,2);
 await assert.rejects(postForCampaign(bucket(),'u/','a','rolls',{content:'x'},{fetcher}),/Add a Discord webhook/);
});

test('adding a channel looks the webhook up, refuses deleted ones and never returns URLs',async()=>{
 const b=bucket();let state=404;
 const fetcher=async()=>state===200?Response.json({name:'Salt Road hook'}):new Response(null,{status:state});
 await assert.rejects(editDiscord(b,'u/','a',{action:'addChannel',url:hook(5)},{fetcher,newId:()=>'x'}),/doesn't exist/);
 assert.equal(b.records['u/campaign-settings/a.json'],undefined);
 state=200;const view=await editDiscord(b,'u/','a',{action:'addChannel',url:hook(5)},{fetcher,newId:()=>'x'});
 assert.deepEqual(view.channels,[{id:'x',name:'Salt Road hook',hookName:'Salt Road hook',thread:false}]);assert.doesNotMatch(JSON.stringify(view),/secret/);
 assert.match(b.records['u/campaign-settings/a.json'],/secret5/,'the URL is kept server side');
 state=404;const status=await discordStatus(b,'u/','a',{check:true,fetcher});assert.deepEqual(status.status,{x:'deleted'});
 assert.deepEqual((await discordStatus(b,'u/','a')).status,{},'no lookups unless asked');
});

const mapWorkspace={scenes:[{id:'scene',name:'Greyfen marsh',containerId:'a',mapType:'combat',tokens:[]}],collections:[{id:'a',name:'Salt Road',kind:'campaign',parentId:null}]};
const file=(type,text='test')=>({type,bytes:new TextEncoder().encode(text)});

test('map sharing refuses redirects, rejects a changed campaign and never leaks the webhook',async()=>{
 for(const status of [200,204,302,307,429]){
  let calls=0;
  const fetcher=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.equal(options.body.get('files[0]').type,'image/png');return new Response(status===200?JSON.stringify({id:'1'}):null,{status});};
  const ctx={bucket:bucket({'u/campaign-settings/a.json':{webhook:hook(123)}}),prefix:'u/',workspace:mapWorkspace,fetcher};
  const run=shareMap(ctx,{sceneId:'scene',campaignId:'a',file:file('image/png')});
  if(status<300)await run;else await assert.rejects(run,e=>{assert.doesNotMatch(e.message,/secret|https:/);return true;});
  assert.equal(calls,1);
  await assert.rejects(shareMap(ctx,{sceneId:'scene',campaignId:'other',file:file('image/png')}),/campaign changed/);assert.equal(calls,1);
 }
});

test('map sharing accepts WebP, PNG and JPEG, names the file from its type, and follows the map type',async()=>{
 const calls=[];
 const settings={webhook:hook(1),webhooks:{world:hook(3)}};
 const ctx={bucket:bucket({'u/campaign-settings/a.json':settings}),prefix:'u/',workspace:structuredClone(mapWorkspace),fetcher:async(url,options)=>{calls.push({url,form:options.body});return Response.json({id:'1'});}};
 for(const [type,extension] of [['image/webp','webp'],['image/png','png'],['image/jpeg','jpg']]){
  await shareMap(ctx,{sceneId:'scene',campaignId:'a',file:file(type,'image bytes')});
  const sent=calls.at(-1).form.get('files[0]');
  assert.equal(sent.name,`map.${extension}`);assert.equal(sent.type,type);assert.equal(await sent.text(),'image bytes');
  assert.equal(JSON.parse(calls.at(-1).form.get('payload_json')).embeds[0].image.url,`attachment://map.${extension}`);
 }
 await assert.rejects(shareMap(ctx,{sceneId:'scene',campaignId:'a',file:file('image/gif')}),/WebP, PNG or JPG/);
 await assert.rejects(shareMap(ctx,{sceneId:'scene',campaignId:'a',route:'elsewhere',file:file('image/png')}),/valid map destination/);
 assert.equal(calls.length,3);assert.ok(calls.every(c=>c.url.startsWith(hook(1))));
 ctx.workspace.scenes[0].mapType='world';await shareMap(ctx,{sceneId:'scene',campaignId:'a',file:file('image/png')});
 assert.ok(calls.at(-1).url.startsWith(hook(3)),'old saves still send world maps to the world webhook');
 ctx.bucket.records['u/campaign-settings/a.json']={...settings,routes:{worldMaps:'off'}};
 await assert.rejects(shareMap(ctx,{sceneId:'scene',campaignId:'a',file:file('image/png')}),/Don’t post/);assert.equal(calls.length,4);
});
