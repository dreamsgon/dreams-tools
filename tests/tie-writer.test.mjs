import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {cleanApi,createApiConnection,listConnections,permsOf,updateConnection}=await import('../lib/mcp/connections.ts');
const {forConnection,readNotes,tiePrompt,tieWriteSchema,writeTieNotes}=await import('../lib/ai/tie-writer.ts');

const C='demo-campaign',OWNER='gm-1',NOW=new Date('2026-11-13T10:00:00Z');
function world(){
 const w=demoWorkspace(),at=NOW.toISOString(),c=w.campaigns.find(x=>x.id===C);
 w.entries.push(
  {id:'ostra',worldId:c.worldId,campaignId:C,parentId:null,title:'Ostra Hale',kind:'character',body:'Keeps the toll lantern on the [[Greyfen]] landing.',overviewVisibility:'players',updatedAt:at},
  {id:'halden',worldId:c.worldId,campaignId:C,parentId:null,title:'Brother Halden',kind:'character',body:'Knows where the bell is.',overviewVisibility:'gm',updatedAt:at},
  {id:'toll',worldId:c.worldId,campaignId:C,parentId:null,title:'The Toll Wardens',kind:'faction',body:'',overviewVisibility:'players',updatedAt:at},
 );
 return w;
}
function bucket(){
 const data=new Map();let n=0;
 return {data,
  async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text),text:async()=>v.text,arrayBuffer:async()=>new TextEncoder().encode(v.text).buffer}:null;},
  async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){const v=data.get(k);if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;data.set(k,{text,etag:String(++n)});return {etag:String(n)};},
  async delete(k){data.delete(k);},
  async list(){return {objects:[],truncated:false};},
 };
}
function fakeFetch(replies){
 const sent=[];
 const f=async(url,init={})=>{
  const req=url instanceof Request?url:new Request(url,init);
  sent.push(JSON.parse(await req.text()));
  const [status,body]=Array.isArray(replies[0])?replies.shift():[200,replies.shift()];
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 };
 f.sent=sent;return f;
}
const oaCall=args=>({choices:[{message:{content:null,tool_calls:[{id:'call_1',type:'function',function:{name:'send_notes',arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}],usage:{total_tokens:700}});
const userText=body=>body.messages.find(m=>m.role==='user').content;

const request={brief:'Old debts.',ties:[
 {key:'s1',from:{id:'ostra',name:'Ostra'},to:{id:'toll',name:'Wardens'},tie:'Member',gm:false},
 {key:'s2',from:{id:'ostra',name:'Ostra'},to:{id:'halden',name:'Halden'},tie:'Rival',gm:true},
]};

async function setup(how='helper'){
 const b=bucket();
 await new EncyclopediaStore(b).save(OWNER,world(),0);
 const connection=await createApiConnection(b,OWNER,C,'Sonnet',how,cleanApi({provider:'openai',model:'gpt-test',apiKey:'sk-test-1234567890abcd',limit:'100,000'}));
 return {b,connection};
}

test('the prompt names each page with a line about it, the brief, and each tie by its key',()=>{
 const w=world(),pages=w.entries;
 const text=tiePrompt({name:'Greyfen',description:'A marsh campaign.'},pages,tieWriteSchema.parse(request));
 assert.match(text,/^Campaign: Greyfen\. A marsh campaign\./);
 assert.match(text,/What the GM wants: Old debts\./);
 assert.match(text,/- Ostra Hale \(character\): Keeps the toll lantern on the Greyfen landing\./,'links read as plain names');
 assert.match(text,/- The Toll Wardens \(organization\)$/m);
 assert.match(text,/- s1: Ostra Hale — Member — The Toll Wardens$/m,'the page title wins over the name sent');
 assert.match(text,/- s2: Ostra Hale — Rival — Brother Halden \(GM only, a secret\)/);
 assert.equal(text.match(/Ostra Hale \(character\)/g).length,1,'each page is described once');
 const fam=tiePrompt({name:'Greyfen'},[],{family:'Vell',ties:[],people:[{key:'p1',name:'Ada Vell',note:'child of Oren Vell'}]});
 assert.match(fam,/This is the Vell family/);
 assert.match(fam,/- p1: Ada Vell \(child of Oren Vell\)/);
 assert.doesNotMatch(fam,/Write a note for each tie/);
});

test('only notes for keys that were asked for come back, as plain text cut to size',()=>{
 const r=tieWriteSchema.parse({...request,people:[{key:'p1',name:'Ada'}]});
 const out=readNotes({notes:[{key:'s1',note:'**Sworn** to [[The Toll Wardens|the Wardens]] since the flood.'},{key:'zz',note:'Not asked.'},{key:'s2',note:'  '}],bios:[{key:'p1',text:'x'.repeat(400)},{key:'s1',text:'Wrong list.'}]},r);
 assert.deepEqual(Object.keys(out.notes),['s1']);
 assert.equal(out.notes.s1,'Sworn to the Wardens since the flood.');
 assert.deepEqual(Object.keys(out.bios),['p1']);
 assert.equal(out.bios.p1.length,300);
 assert.deepEqual(readNotes(undefined,r),{notes:{},bios:{}});
});

test('a connection only reads ties between pages it can see, and no secrets when kept to what players see',()=>{
 const r=tieWriteSchema.parse({...request,people:[{key:'p1',name:'Ada',note:'secretly a ward'}]});
 const all=forConnection(r,new Set(['ostra','toll','halden']),true);
 assert.equal(all.skipped,0);assert.equal(all.request.people[0].note,'secretly a ward');
 const players=forConnection(r,new Set(['ostra','toll']),false);
 assert.deepEqual(players.request.ties.map(t=>t.key),['s1']);
 assert.equal(players.skipped,1);
 assert.deepEqual(players.request.people,[{key:'p1',name:'Ada'}],'a new person’s twist is a secret too');
 const unseen=forConnection(r,new Set(['ostra']),true);
 assert.deepEqual(unseen.request.ties.map(t=>t.key),[],'a page it can’t see leaves its tie out');
});

test('writing the notes calls the GM’s own key, returns them, and counts the tokens',async()=>{
 const {b,connection}=await setup();
 const f=fakeFetch([oaCall({notes:[{key:'s1',note:'Ostra has kept the Wardens’ books for ten years.'},{key:'s2',note:'Halden owes Ostra a life.'}]})]);
 const out=await writeTieNotes(b,OWNER,C,{connectionId:connection.id,apiKey:'sk-test-1234567890abcd'},tieWriteSchema.parse(request),f);
 assert.deepEqual(out.notes,{s1:'Ostra has kept the Wardens’ books for ten years.',s2:'Halden owes Ostra a life.'});
 assert.equal(out.by,'Sonnet');assert.equal(out.tokens,700);assert.equal(out.skipped,0);
 assert.equal(f.sent[0].model,'gpt-test');
 assert.match(userText(f.sent[0]),/Brother Halden \(character\): Knows where the bell is\./);
 assert.equal(f.sent[0].tools[0].function.name,'send_notes');
 const [c]=await listConnections(b,OWNER,C);
 assert.equal(c.api.used,700);
 const page=(await new EncyclopediaStore(b).read(OWNER)).data.entries.find(e=>e.id==='ostra');
 assert.equal(page.ties,undefined,'nothing is saved');
});

test('a players-only connection leaves GM-only pages and ties out of what it reads',async()=>{
 const {b,connection}=await setup();
 await updateConnection(b,OWNER,C,connection.id,{perms:{...permsOf(connection),seeSecrets:'off'}});
 const f=fakeFetch([oaCall({notes:[{key:'s1',note:'Sworn in last spring.'}]})]);
 const out=await writeTieNotes(b,OWNER,C,{connectionId:connection.id,apiKey:'sk-test-1234567890abcd'},tieWriteSchema.parse(request),f);
 assert.equal(out.skipped,1);
 assert.deepEqual(Object.keys(out.notes),['s1']);
 assert.doesNotMatch(userText(f.sent[0]),/Halden|bell/);
 await assert.rejects(writeTieNotes(b,OWNER,C,{connectionId:connection.id,apiKey:'sk-test-1234567890abcd'},tieWriteSchema.parse({ties:[request.ties[1]]}),fakeFetch([])),/only sees what players see/);
});

test('no notes back, a provider error, or a used-up limit each say so, and spent tokens still count',async()=>{
 const {b,connection}=await setup();
 await assert.rejects(writeTieNotes(b,OWNER,C,{connectionId:connection.id,apiKey:'sk-test-1234567890abcd'},tieWriteSchema.parse(request),fakeFetch([oaCall({notes:[]})])),/didn't send any notes/);
 assert.equal((await listConnections(b,OWNER,C))[0].api.used,700);
 await assert.rejects(writeTieNotes(b,OWNER,C,{connectionId:connection.id,apiKey:'sk-test-1234567890abcd'},tieWriteSchema.parse(request),fakeFetch([[401,{error:{message:'Bad key'}}]])));
 await assert.rejects(writeTieNotes(b,OWNER,C,{connectionId:'nope',apiKey:'sk-test-1234567890abcd'},tieWriteSchema.parse(request),fakeFetch([])),/was removed/);
 await assert.rejects(writeTieNotes(b,OWNER,C,{connectionId:connection.id,apiKey:'sk-test-1234567890abcd'},{ties:[]},fakeFetch([])),/nothing to write/);
 // Use up the month.
 let found=0;
 for(const [k,v] of b.data)if(k.includes('connections')){const j=JSON.parse(v.text);for(const c of Array.isArray(j)?j:j.connections)if(c.api){c.api.used=c.api.limit;found++;}b.data.set(k,{...v,text:JSON.stringify(j)});}
 assert.equal(found,1);
 await assert.rejects(writeTieNotes(b,OWNER,C,{connectionId:connection.id,apiKey:'sk-test-1234567890abcd'},tieWriteSchema.parse(request),fakeFetch([])),/used this month/);
});

test('the request is bounded: 40 ties, short briefs and names',()=>{
 const tie=request.ties[0];
 assert.throws(()=>tieWriteSchema.parse({ties:Array.from({length:41},(_,i)=>({...tie,key:`k${i}`}))}));
 assert.throws(()=>tieWriteSchema.parse({brief:'x'.repeat(501),ties:[]}));
 assert.throws(()=>tieWriteSchema.parse({ties:[{...tie,from:{name:''}}]}));
});
