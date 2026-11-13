import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {cleanApi,createApiConnection}=await import('../lib/mcp/connections.ts');
const {chatTurn,cleanHistory}=await import('../lib/ai/run.ts');
const {CHAT_LIMIT,PART_SIZE,TURN_LIMIT,chatMarkdown,chatRecap,chatSessionBody,chatTitle,cleanTitle,deleteChat,listChats,readChat,renameChat,saveExchange}=await import('../lib/ai/chats.ts');
const {chatFileName,CONTEXT_TURNS}=await import('../lib/ai/chat-text.ts');

function bucket(){
 const data=new Map();let n=0;
 return {data,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},
  async put(k,text,o={}){
   const v=data.get(k);
   if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;
   if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;
   data.set(k,{text,etag:String(++n)});return {etag:String(n)};
  },
  async delete(k){data.delete(k);},
 };
}
const OWNER='gm-1',CAMPAIGN='demo-campaign';
const ids=()=>{let i=0;return()=>`chat-${String(++i).padStart(4,'0')}`;};
const base={connectionId:'conn-1',connectionName:'Grok',model:'grok-4'};

test('each exchange is saved to its chat, and a new chat is named after its first question',async()=>{
 const b=bucket(),newId=ids();
 const first=await saveExchange(b,OWNER,CAMPAIGN,{...base,scene:'Greyfen marsh',question:'The hag gets her turn.   What does she do?',answer:'She goes for Bram.',steps:[{tool:'move_token',title:'Move a token',ok:true,waiting:'s1',summary:'Bog Hag moved to D6'}],newId,now:new Date('2026-11-13T17:00:00Z')});
 assert.equal(first.title,'The hag gets her turn. What does she do?');
 assert.equal(first.count,2);
 const again=await saveExchange(b,OWNER,CAMPAIGN,{...base,id:first.id,question:'One line of read-aloud?',answer:'The water heaves.',steps:[],newId,now:new Date('2026-11-13T17:05:00Z')});
 assert.equal(again.id,first.id);assert.equal(again.count,4);assert.equal(again.scene,'Greyfen marsh');assert.equal(again.createdAt,'2026-11-13T17:00:00.000Z');
 const chat=await readChat(b,OWNER,CAMPAIGN,first.id);
 assert.deepEqual(chat.turns.map(t=>t.role),['user','assistant','user','assistant']);
 assert.equal(chat.turns[1].steps[0].summary,'Bog Hag moved to D6');
 assert.equal(chat.turns[3].steps,undefined);
 // An unknown or bad id starts a new chat instead of failing.
 const other=await saveExchange(b,OWNER,CAMPAIGN,{...base,id:'../../x',question:'Ferry toll?',answer:'Two coppers.',steps:[],newId,now:new Date('2026-11-13T18:00:00Z')});
 assert.notEqual(other.id,first.id);
 assert.deepEqual((await listChats(b,OWNER,CAMPAIGN)).map(c=>c.id),[other.id,first.id]);
 // Chats belong to their campaign.
 assert.deepEqual(await listChats(b,OWNER,'other-campaign'),[]);
});

test('chats can be renamed and deleted, and chats past the newest 200 are kept, not deleted',async()=>{
 const b=bucket(),newId=ids();
 const a=await saveExchange(b,OWNER,CAMPAIGN,{...base,question:'Who runs Greyfen?',answer:'The Bog Hag, mostly.',steps:[],newId,now:new Date('2026-10-01T00:00:00Z')});
 await renameChat(b,OWNER,CAMPAIGN,a.id,'  Greyfen   politics ');
 assert.equal((await listChats(b,OWNER,CAMPAIGN))[0].title,'Greyfen politics');
 assert.equal((await readChat(b,OWNER,CAMPAIGN,a.id)).title,'Greyfen politics');
 assert.throws(()=>cleanTitle('   '),/Give the chat a name/);
 await deleteChat(b,OWNER,CAMPAIGN,a.id);
 assert.deepEqual(await listChats(b,OWNER,CAMPAIGN),[]);
 await assert.rejects(readChat(b,OWNER,CAMPAIGN,a.id),/That chat is gone/);
 for(let i=0;i<CHAT_LIMIT+2;i++)await saveExchange(b,OWNER,CAMPAIGN,{...base,question:`Q${i}`,answer:'A',steps:[],newId,now:new Date(Date.UTC(2026,10,1,0,i))});
 const list=await listChats(b,OWNER,CAMPAIGN);
 assert.equal(list.length,CHAT_LIMIT+2);
 assert.deepEqual(list.map(c=>c.title).slice(0,1).concat(list.slice(-2).map(c=>c.title)),[`Q${CHAT_LIMIT+1}`,'Q1','Q0']);
 // The quick index stays small; the two oldest moved to the older list, and every chat file is still there.
 const indexKey=[...b.data.keys()].find(k=>k.endsWith('/index.json')),olderKey=[...b.data.keys()].find(k=>k.endsWith('/older.json'));
 assert.equal(JSON.parse(b.data.get(indexKey).text).chats.length,CHAT_LIMIT);
 assert.deepEqual(JSON.parse(b.data.get(olderKey).text).chats.map(c=>c.title),['Q1','Q0']);
 assert.equal([...b.data.keys()].filter(k=>k.includes('/ai-chats/')&&!/(index|older)\.json$/.test(k)).length,CHAT_LIMIT+2);
 // An older chat can be reopened, renamed, continued (it moves back to the index) and deleted.
 const q0=list.at(-1);
 assert.equal((await readChat(b,OWNER,CAMPAIGN,q0.id)).turns[0].text,'Q0');
 await renameChat(b,OWNER,CAMPAIGN,q0.id,'First question');
 assert.equal((await listChats(b,OWNER,CAMPAIGN)).at(-1).title,'First question');
 await saveExchange(b,OWNER,CAMPAIGN,{...base,id:q0.id,question:'Back again',answer:'Welcome back.',steps:[],newId,now:new Date('2026-12-01T00:00:00Z')});
 const back=await listChats(b,OWNER,CAMPAIGN);
 assert.equal(back.length,CHAT_LIMIT+2);
 assert.deepEqual([back[0].title,back[0].count],['First question',4]);
 assert.equal(new Set(back.map(c=>c.id)).size,back.length);
 await deleteChat(b,OWNER,CAMPAIGN,list.at(-2).id);
 assert.equal((await listChats(b,OWNER,CAMPAIGN)).length,CHAT_LIMIT+1);
});

test('a long chat keeps every turn: older turns move to part files and exports read them all',async()=>{
 const b=bucket(),newId=ids();let id;
 const exchanges=TURN_LIMIT/2+PART_SIZE/2+5;
 for(let i=0;i<exchanges;i++)id=(await saveExchange(b,OWNER,CAMPAIGN,{...base,id,question:`Q${i}`,answer:`A${i}`,steps:[],newId,now:new Date(Date.UTC(2026,10,1,0,i))})).id;
 const meta=(await listChats(b,OWNER,CAMPAIGN))[0];
 assert.equal(meta.count,exchanges*2);
 // The panel gets the latest turns only; the chat file never passes the limit.
 const recent=await readChat(b,OWNER,CAMPAIGN,id);
 assert.ok(recent.turns.length<=TURN_LIMIT);
 assert.equal(recent.earlier+recent.turns.length,exchanges*2);
 assert.equal(recent.turns.at(-1).text,`A${exchanges-1}`);
 // A full read has every turn in order, so Markdown, session pages and recaps include the start.
 const full=await readChat(b,OWNER,CAMPAIGN,id,{full:true});
 assert.equal(full.turns.length,exchanges*2);
 assert.deepEqual(full.turns.slice(0,2).map(t=>t.text),['Q0','A0']);
 assert.ok(full.turns.every((t,i)=>t.text===`${i%2?'A':'Q'}${Math.floor(i/2)}`));
 assert.match(chatMarkdown(full),/\*\*You:\*\* Q0\n/);
 // Deleting the chat removes its parts too.
 assert.ok([...b.data.keys()].some(k=>k.includes('.part-1.json')));
 await deleteChat(b,OWNER,CAMPAIGN,id);
 assert.deepEqual([...b.data.keys()].filter(k=>k.includes(id)),[]);
});

test('a chat exports as Markdown, a Discord recap and a GM-secret session page',()=>{
 const chat={id:'chat-0001',title:'The hag’s turn',connectionId:'c',connectionName:'Grok',model:'grok-4',scene:'Greyfen marsh',count:4,createdAt:'2026-11-13T17:00:00Z',updatedAt:'2026-11-13T17:05:00Z',turns:[
  {role:'user',text:'The hag gets her turn. What does she do?',at:''},
  {role:'assistant',text:'She goes for Bram.',at:'',steps:[{tool:'move_token',title:'Move a token',ok:true,waiting:'s1',summary:'Bog Hag moved to D6'},{tool:'roll',title:'Roll dice',ok:true}]},
  {role:'user',text:'One line of read-aloud?',at:''},
  {role:'assistant',text:'“The water heaves.”',at:''},
 ]};
 const md=chatMarkdown(chat,{campaign:'The Salt Road'});
 assert.match(md,/^# The hag’s turn\n\n_The Salt Road · Greyfen marsh · Grok \(grok-4\) · Nov 13, 2026_/);
 assert.match(md,/\*\*You:\*\* The hag gets her turn/);
 assert.match(md,/\*\*Grok:\*\* She goes for Bram\.\n\n- Bog Hag moved to D6\n- Roll dice/);
 assert.equal(chatRecap(chat,{answers:true,questions:false,steps:false}),'She goes for Bram.\n\n“The water heaves.”');
 assert.match(chatRecap(chat,{answers:false,questions:true,steps:true}),/^> The hag gets her turn\. What does she do\?\n\n• Bog Hag moved to D6\n• Roll dice\n\n> One line/);
 assert.ok(chatRecap({...chat,turns:[{role:'assistant',text:'x'.repeat(5000),at:''}]},{answers:true,questions:false,steps:false}).length<=4000);
 const body=chatSessionBody(chat,'The Salt Road');
 assert.match(body,/^From a chat with Grok in the AI panel · Greyfen marsh · Nov 13, 2026\n\n::: secret\n\[\[ai-chat:chat-0001\|Open the chat\]\]\n/);
 assert.ok(body.trimEnd().endsWith(':::'));
 assert.equal(chatTitle(''),'New chat');
 assert.equal(chatTitle('a'.repeat(80)).length,60);
 assert.equal(chatFileName('The hag’s turn!'),'the-hag-s-turn.md');
});

test('the AI panel saves each turn of a chat with an API key connection',async()=>{
 const b=bucket(),book=demoWorkspace();
 await new EncyclopediaStore(b).save(OWNER,book,0);
 const connection=await createApiConnection(b,OWNER,CAMPAIGN,undefined,'helper',cleanApi({provider:'openai',model:'gpt-test',apiKey:'sk-test-1234567890abcd',limit:'2,000,000'}));
 const say=text=>async()=>new Response(JSON.stringify({choices:[{message:{content:text},finish_reason:'stop'}],usage:{total_tokens:10}}),{status:200,headers:{'content-type':'application/json'}});
 const r1=await chatTurn(b,OWNER,CAMPAIGN,connection.id,[{role:'user',text:'Name an innkeeper'}],'Greyfen marsh',say('Old Tamsin.'));
 assert.equal(r1.chat.title,'Name an innkeeper');assert.equal(r1.chat.count,2);assert.equal(r1.chat.connectionName,connection.name);
 const r2=await chatTurn(b,OWNER,CAMPAIGN,connection.id,[{role:'user',text:'Name an innkeeper'},{role:'assistant',text:'Old Tamsin.'},{role:'user',text:'And her inn?'}],'Greyfen marsh',say('The Drowned Lamp.'),r1.chat.id);
 assert.equal(r2.chat.id,r1.chat.id);assert.equal(r2.chat.count,4);
 const saved=await readChat(b,OWNER,CAMPAIGN,r1.chat.id);
 assert.deepEqual(saved.turns.map(t=>t.text),['Name an innkeeper','Old Tamsin.','And her inn?','The Drowned Lamp.']);
 // Only the latest messages go to the AI, whatever the browser sends.
 let sent;
 const watch=async(url,init)=>{sent=JSON.parse(init.body);return say('Noted.')();};
 const long=Array.from({length:59},(_,i)=>({role:i%2?'assistant':'user',text:`m${i}`}));
 await chatTurn(b,OWNER,CAMPAIGN,connection.id,cleanHistory(long),undefined,watch,r1.chat.id);
 const said=sent.messages.filter(m=>m.role!=='system').map(m=>m.content);
 assert.ok(said.length<=CONTEXT_TURNS);
 assert.equal(said.at(-1),'m58');
});
