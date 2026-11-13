import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace,campaignExport,workspaceSchema,playerCampaign} from '../lib/encyclopedia/world-model.ts';
import {chatGroupsToText,discordJsonToText,guessCast,honourSkips,keepNotes,requestNotes,speakersIn,startRecap,waitingForAi} from '../lib/encyclopedia/recap-request.ts';
import {draftRecap,sessionFolder} from '../lib/encyclopedia/recaps.ts';
import {EncyclopediaStore} from '../lib/encyclopedia/store.ts';
import {callTool} from '../lib/mcp/tools.ts';
import {getPrompt} from '../lib/mcp/prompts.ts';
import {fromLevel} from '../lib/mcp/permissions.ts';

const C='demo-campaign',NOW=new Date('2026-11-13T10:00:00Z');
const request={length:'short',depth:'main',steer:'Warm and a little ominous.',skip:['quotes'],cast:[{speaker:'GM',as:'gm'},{speaker:'Mara (Bram)',as:'bram',name:'Bram'},{speaker:'Wren',as:''}],at:NOW.toISOString()};
function world(){
 const w=demoWorkspace(),c=w.campaigns.find(x=>x.id===C);
 w.entries.push({id:'bram',worldId:c.worldId,campaignId:C,parentId:null,title:'Bram',kind:'character',body:'',character:{role:'pc',group:'',tags:[],location:'',faction:'',status:'active',statsVisibility:'gm',statsByCampaign:{}},updatedAt:NOW.toISOString()});
 return w;
}

test('Discord exports become "Name: text" lines',()=>{
 const json=JSON.stringify({guild:{name:'x'},messages:[{author:{name:'mara_r',nickname:'Mara'},content:'I open\nthe door.'},{author:{name:'gm'},content:''},{author:{name:'gm'},content:'It creaks.'}]});
 assert.equal(discordJsonToText(json),'Mara: I open the door.\ngm: It creaks.');
 assert.equal(discordJsonToText('{"not":"discord"}'),null);
 assert.equal(discordJsonToText('plain text'),null);
 assert.equal(chatGroupsToText([{author:'Tobin',lines:['Hello  there',' ','Again']}]),'Tobin: Hello there\nTobin: Again');
});

test('speakers are found by how often they talk, and guessed from character pages',()=>{
 const text='GM: The ferry bumps the landing.\nMara (Bram): I keep my hand on my sword.\nGM: Ostra waits.\nMara (Bram): Who keeps the toll?\nWren: Lol.\nWren: Me too.\nNote: once only\nhttps://example.com: link';
 const names=speakersIn(text);
 assert.deepEqual(names,['GM','Mara (Bram)','Wren']);
 assert.deepEqual(guessCast(names,[{id:'bram',title:'Bram'}]),[{speaker:'GM',as:'gm'},{speaker:'Mara (Bram)',as:'bram',name:'Bram'},{speaker:'Wren',as:''}]);
 assert.deepEqual(guessCast(['Bram','DM Sam'],[{id:'bram',title:'Bram Ashford'}]),[{speaker:'Bram',as:'bram',name:'Bram Ashford'},{speaker:'DM Sam',as:'gm'}]);
});

test('starting a recap makes a hidden draft page, or readies a session page and keeps its notes',()=>{
 const w=world(),c=w.campaigns.find(x=>x.id===C),folder=sessionFolder(w,C).id;
 let r=startRecap(w,{campaignId:C,title:'Session 13',playedOn:'2026-11-12',source:'A pasted transcript',request,folderId:folder,transcriptWords:18412},NOW);
 let page=r.next.entries.find(e=>e.id===r.id);
 assert.equal(page.kind,'session');assert.equal(page.parentId,folder);assert.equal(page.recap.status,'draft');assert.equal(page.recap.transcriptWords,18412);
 assert.deepEqual(page.recap.request,request);assert.ok(waitingForAi(page.recap));
 assert.ok(workspaceSchema.safeParse(r.next).success);
 assert.equal(playerCampaign(r.next,C).entries.some(e=>e.id===r.id),false);
 // An existing session page that players can see: hidden while it's a draft, its notes kept in a GM tab.
 const old=w.entries.find(e=>e.title==='A light in the fog');
 const shared={...w,entries:w.entries.map(e=>e.id===old.id?{...e,overviewVisibility:'players'}:e)};
 r=startRecap(shared,{campaignId:C,title:'A light in the fog',source:'Notion page: https://notion.so/x',request:{...request,link:'https://www.notion.so/x'},pageId:old.id},NOW);
 page=r.next.entries.find(e=>e.id===old.id);
 assert.equal(page.body,'');assert.equal(page.overviewVisibility,undefined);
 assert.equal(page.tabs.at(-1).title,'Notes before the recap');assert.equal(page.tabs.at(-1).body,old.body);assert.equal(page.tabs.at(-1).visibility,'gm');
 assert.ok(workspaceSchema.safeParse(r.next).success);
 assert.throws(()=>startRecap(w,{campaignId:C,title:'x',source:'y',request,pageId:'nope'}),/gone/);
 assert.deepEqual(keepNotes({...old,body:'  '}),{tabs:old.tabs});
 // The AI's save fills it and keeps what was asked; skipped parts are dropped whatever the AI sent.
 const filled=draftRecap(r.next,c,{title:'A light in the fog',recap:'They crossed.',timeline:[{title:'Crossing'}],quotes:[{text:'Pay the toll.',who:'GM'}]},{by:'Claude Code',now:NOW,existing:page});
 assert.equal(filled.recap.quotes.length,0);assert.deepEqual(filled.recap.request,page.recap.request);assert.equal(waitingForAi(filled.recap),false);
 assert.equal(filled.tabs.filter(t=>t.title==='Notes before the recap').length,1,'notes are kept once');
});

test('what the GM asked for reads as a few short lines',()=>{
 assert.deepEqual(requestNotes(request),[
  'Recap length: about 150 to 300 words.',
  'Pull out only the main people, places, quests and finds.',
  'Leave out quotes: send them empty.',
  'Who is who: GM is the GM; Mara (Bram) is the player of Bram; Wren is a player. Name characters, not players, in the recap.',
  'The GM asks: Warm and a little ominous.',
 ]);
 assert.deepEqual(requestNotes({length:'standard',depth:'balanced',at:''}),['Recap length: about 250 to 600 words.','Pull out the people, places, quests and finds that matter.']);
 const all=honourSkips({recap:'r',timeline:[1],quotes:[1],found:[1],codex:[1],quests:[1],gmNotes:'g'},{...request,skip:['recap','timeline','found','quests','gmNotes']});
 assert.deepEqual(all,{recap:'',timeline:[],quotes:[1],found:[],codex:[],quests:[],gmNotes:''});
});

function bucket(){
 const data=new Map();let n=0;
 return {data,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text),arrayBuffer:async()=>new TextEncoder().encode(v.text).buffer}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){const v=data.get(k);if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;data.set(k,{text,etag:String(++n)});return {etag:String(n)};},
  async delete(k){data.delete(k);},
 };
}

test('the AI gets what the GM asked for, with the transcript and in the prompt',async()=>{
 const b=bucket(),store=new EncyclopediaStore(b),{next,id}=startRecap(world(),{campaignId:C,title:'Session 13',source:'A pasted transcript',request},NOW);
 await store.save('gm',next,0);
 await store.saveTranscript('gm','not-saved-yet','GM: hi');
 assert.equal(await store.readTranscript('gm','not-saved-yet'),'GM: hi','a page made a moment ago can take its transcript before it saves');
 await store.saveTranscript('gm',id,'GM: The ferry bumps the landing.\nMara (Bram): I keep my hand on my sword.');
 const book=campaignExport((await store.read('gm')).data,C);
 const c={maps:null,level:'assist',perms:fromLevel('assist'),book,campaign:book.campaigns[0],transcript:x=>store.readTranscript('gm',x)};
 const r=await callTool(c,'read_transcript',{page:'Session 13'});
 const part=JSON.parse(r.content[0].text.slice(r.content[0].text.indexOf('{')));
 assert.deepEqual(part.gmAsked,requestNotes(request));
 const text=getPrompt(c,'recap_from_source',{page:'Session 13'}).messages[0].content.text;
 assert.match(text,/the length below/);assert.match(text,/What I asked for in RPG Tools:\n- Recap length: about 150 to 300 words\./);assert.match(text,/read_transcript \(page "Session 13"\)/);
 const linked=startRecap(next,{campaignId:C,title:'Session 14',source:'Notion page',request:{...request,link:'https://www.notion.so/Session-14'}},NOW);
 const book2=campaignExport(linked.next,C),c2={...c,book:book2,campaign:book2.campaigns[0]};
 const t2=getPrompt(c2,'recap_from_source',{page:'Session 14'}).messages[0].content.text;
 assert.match(t2,/this source: https:\/\/www\.notion\.so\/Session-14/);assert.match(t2,/your own tools/);
});
