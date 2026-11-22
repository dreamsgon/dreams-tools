import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {chatConnections,cleanApi,createApiConnection,listConnections,publicConnection,setChatDefault}=await import('../lib/mcp/connections.ts');
const {runChat,ProviderError}=await import('../lib/ai/chat.ts');
const {chatTurn,cleanHistory}=await import('../lib/ai/run.ts');
const {cleanAttachments,FILES_PER_MESSAGE,SEND_BUDGET,attachedLine}=await import('../lib/ai/attachments.ts');
const {chatMarkdown,readChat}=await import('../lib/ai/chats.ts');

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
function fakeFetch(replies){
 const sent=[];
 const f=async(url,init={})=>{
  const req=url instanceof Request?url:new Request(url,init);
  sent.push({url:req.url,body:req.method==='POST'?JSON.parse(await req.text()):null});
  const next=replies.shift();if(!next)throw Error('No more replies');
  const [status,body]=Array.isArray(next)?next:[200,next];
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','request-id':'req_1'}});
 };
 f.sent=sent;return f;
}
const oaSay=text=>({choices:[{message:{content:text},finish_reason:'stop'}],usage:{total_tokens:50}});
const claudeSay=text=>({id:'msg_1',type:'message',role:'assistant',model:'claude-opus-5-5',content:[{type:'text',text}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:10,output_tokens:5}});
const OWNER='gm-1',CAMPAIGN='demo-campaign',KEY='sk-test-1234567890abcd';
const PNG={kind:'image',name:'map.png',mimeType:'image/png',data:'iVBORw0KGgo='};
const PDF={kind:'pdf',name:'rules.pdf',mimeType:'application/pdf',data:'JVBERi0xLjQ='};
const TXT={kind:'text',name:'notes.md',mimeType:'text/plain',text:'# Bram\nA dwarf.'};

async function setup(provider){
 const b=bucket();
 await new EncyclopediaStore(b).save(OWNER,demoWorkspace(),0);
 const connection=await createApiConnection(b,OWNER,CAMPAIGN,undefined,'helper',cleanApi({provider,model:provider==='anthropic'?'claude-opus-5-5':'gpt-test',apiKey:KEY}));
 return {b,connection};
}

test('attachments are pictures, PDFs and text files, a few at a time and within the size budget',()=>{
 assert.deepEqual(cleanAttachments(undefined),[]);
 assert.deepEqual(cleanAttachments([PNG,PDF,TXT]).map(f=>f.kind),['image','pdf','text']);
 assert.throws(()=>cleanAttachments([{...PNG,mimeType:'image/svg+xml'}]),/isn't a picture/);
 assert.throws(()=>cleanAttachments([{...PNG,data:'not base64!'}]),/couldn't be read/);
 assert.throws(()=>cleanAttachments(Array(FILES_PER_MESSAGE+1).fill(PNG)),/up to 6/);
 assert.equal(cleanAttachments([{...PNG,name:'a\u0000b.png'}])[0].name,'ab.png');
 // A message can be only files; files ride on user turns only, and all of them together stay in the budget.
 assert.deepEqual(cleanHistory([{role:'user',text:'',files:[PNG]}]),[{role:'user',text:'',files:[PNG]}]);
 assert.equal(cleanHistory([{role:'assistant',text:'Hi',files:[PNG]},{role:'user',text:'x'}])[0].files,undefined);
 assert.throws(()=>cleanHistory([{role:'user',text:''}]),/some text/);
 const big={...PNG,data:'A'.repeat(SEND_BUDGET/2+4)};
 assert.throws(()=>cleanHistory([{role:'user',text:'a',files:[big]},{role:'assistant',text:'b'},{role:'user',text:'c',files:[big]}]),/too big/);
 assert.equal(attachedLine([{name:'map.png',kind:'image'},{name:'notes.md',kind:'text'}]),'[Attached: map.png, notes.md]');
});

test('Anthropic gets pictures, PDFs and text files as content blocks before the question',async()=>{
 const f=fakeFetch([claudeSay('A swamp map.')]);
 const r=await runChat({provider:'anthropic',key:KEY,model:'claude-opus-5-5'},'S',[{role:'user',text:'What is this?',files:[PNG,PDF,TXT]}],[],async()=>({text:'',isError:false}),f);
 assert.equal(r.reply,'A swamp map.');
 const content=f.sent[0].body.messages[0].content;
 assert.deepEqual(content.map(b=>b.type),['image','document','document','text']);
 assert.deepEqual(content[0].source,{type:'base64',media_type:'image/png',data:PNG.data});
 assert.equal(content[1].source.media_type,'application/pdf');assert.equal(content[1].title,'rules.pdf');
 assert.deepEqual(content[2].source,{type:'text',media_type:'text/plain',data:TXT.text});
 assert.equal(content[3].text,'What is this?');
});

test('OpenAI-style providers get pictures as data URLs, PDFs as files where they can take them, and text inline',async()=>{
 const f=fakeFetch([oaSay('Bram is a dwarf.')]);
 await runChat({provider:'openai',key:KEY,model:'gpt-test'},'S',[{role:'user',text:'Who?',files:[PNG,PDF,TXT]}],[],async()=>({text:'',isError:false}),f);
 const content=f.sent[0].body.messages[1].content;
 assert.deepEqual(content.map(p=>p.type),['text','image_url','file','text']);
 assert.equal(content[1].image_url.url,`data:image/png;base64,${PNG.data}`);
 assert.equal(content[2].file.filename,'rules.pdf');assert.match(content[2].file.file_data,/^data:application\/pdf;base64,/);
 assert.match(content[3].text,/^File: notes\.md\n\n# Bram/);
 // A message without files stays plain text.
 const plain=fakeFetch([oaSay('Hi.')]);
 await runChat({provider:'xai',key:KEY,model:'grok'},'S',[{role:'user',text:'Hi'}],[],async()=>({text:'',isError:false}),plain);
 assert.equal(plain.sent[0].body.messages[1].content,'Hi');
 // A provider that can't take PDFs says so before anything is sent.
 const none=fakeFetch([]);
 await assert.rejects(runChat({provider:'deepseek',key:KEY,model:'r1'},'S',[{role:'user',text:'Read this',files:[PDF]}],[],async()=>({text:'',isError:false}),none),e=>e instanceof ProviderError&&/can't read PDFs/.test(e.message));
 assert.equal(none.sent.length,0);
});

test('the AI panel saves the names of attached files, not the files, and a text-only model says why it failed',async()=>{
 const {b,connection}=await setup('openai');
 const use={connectionId:connection.id,apiKey:KEY};
 const r=await chatTurn(b,OWNER,CAMPAIGN,use,cleanHistory([{role:'user',text:'',files:[PNG]}]),undefined,fakeFetch([oaSay('A marsh.')]));
 assert.equal(r.chat.title,'map.png');
 const saved=await readChat(b,OWNER,CAMPAIGN,r.chat.id);
 assert.deepEqual(saved.turns[0].files,[{name:'map.png',kind:'image'}]);
 assert.ok(![...b.data.values()].some(v=>v.text.includes(PNG.data)),'the picture itself is not saved');
 assert.match(chatMarkdown(saved),/\*\*You:\*\* \[Attached: map\.png\]/);
 const refused=fakeFetch([[400,{error:{message:'Invalid content type. image_url is only supported by certain models.'}}]]);
 await assert.rejects(chatTurn(b,OWNER,CAMPAIGN,use,cleanHistory([{role:'user',text:'And this?',files:[PNG]}]),undefined,refused),e=>/may not read pictures or files/.test(e.message));
});

test('one AI can be the default for new chats, for the whole campaign',async()=>{
 const {b,connection:first}=await setup('openai');
 const second=await createApiConnection(b,OWNER,CAMPAIGN,'Claude','helper',cleanApi({provider:'anthropic',model:'claude-opus-5-5',apiKey:KEY}));
 assert.deepEqual(chatConnections(await listConnections(b,OWNER,CAMPAIGN)).map(c=>c.id),[first.id,second.id]);
 assert.equal(await setChatDefault(b,OWNER,CAMPAIGN,second.id),'Claude');
 let list=await listConnections(b,OWNER,CAMPAIGN);
 assert.deepEqual(chatConnections(list).map(c=>c.id),[second.id,first.id]);
 assert.equal(publicConnection(list.find(c=>c.id===second.id)).chatDefault,true);
 await setChatDefault(b,OWNER,CAMPAIGN,first.id);
 list=await listConnections(b,OWNER,CAMPAIGN);
 assert.deepEqual(list.filter(c=>c.chatDefault).map(c=>c.id),[first.id],'only one default');
 await assert.rejects(setChatDefault(b,OWNER,CAMPAIGN,'gone'),/removed/);
});
