import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace,workspaceSchema}=await import('../lib/encyclopedia/world-model.ts');
const {emptyRecap}=await import('../lib/encyclopedia/recap-schema.ts');
const {builtInStyles,DEFAULT_STYLE,allStyles,deleteStyle,saveStyle,styleFor,styleLines,styleSummary,chooseStyle}=await import('../lib/encyclopedia/ai-styles.ts');
const {defaultRequest,prosePrompt,storyPrompt,publishRecap}=await import('../lib/encyclopedia/recap-prompts.ts').then(async m=>({...m,publishRecap:(await import('../lib/encyclopedia/recaps.ts')).publishRecap}));
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {cleanApi,createApiConnection}=await import('../lib/mcp/connections.ts');
const {fromLevel}=await import('../lib/mcp/permissions.ts');
const {getPrompt}=await import('../lib/mcp/prompts.ts');
const {writeRecapAgain,writeSample,writeStory}=await import('../lib/ai/recap-writer.ts');

const C='demo-campaign',OWNER='gm-1',KEY='sk-test-1234567890abcd',NOW=new Date('2026-11-14T10:00:00Z');
const grim={id:'grim-1',name:'Grim ledger',length:'short',tone:['Grim'],voice:'character',who:'Ostra Hale',shape:'both',tense:'present',language:'German',instructions:'Never name the Bog Hag.'};
const withGrim=()=>chooseStyle(saveStyle(undefined,grim),'recap','grim-1');

test('styleFor picks the asked style, else the one the kind uses, else Warm storyteller',()=>{
 assert.equal(styleFor(undefined,'recap').id,DEFAULT_STYLE);
 const w=withGrim();
 assert.equal(styleFor(w,'recap').id,'grim-1');assert.equal(styleFor(w,'story').id,DEFAULT_STYLE);
 assert.equal(styleFor(w,'story','builtin-bullets').name,'Bullet points');
 assert.equal(styleFor(w,'recap','gone').id,'grim-1','an unknown style falls back to the one the kind uses');
 assert.equal(allStyles(w).length,builtInStyles.length+1);
});

test('styleLines say length, tense, tone, voice, shape, language and the GM’s instructions',()=>{
 const lines=styleLines(grim,'recap');
 assert.deepEqual(lines,[
  'Length: about 150 to 300 words.',
  'Present tense, grim, written as Ostra Hale’s own journal, in their words.',
  'Start with three to five short bullet points, then tell it in paragraphs.',
  'Write in German.',
  'The GM\'s own instructions: Never name the Bog Hag.',
 ]);
 const warm=styleLines(builtInStyles[0],'story');
 assert.equal(warm[0],'Length: about 150 to 300 words.');assert.match(warm[1],/^Past tense, warm, as a story of what the party did\.$/);
 assert.ok(!warm.some(l=>/Write in|instructions/.test(l)),'English and no instructions add nothing');
 assert.equal(styleSummary(grim,'recap'),'Short (150 to 300 words) · grim · in Ostra Hale’s words · bullets, then a story · present tense · in German · your instructions');
});

test('saveStyle keeps built-ins as they are, refuses duplicate names and caps at 30; deleteStyle resets what used it',()=>{
 assert.throws(()=>saveStyle(undefined,{...builtInStyles[0]}),/Built-in styles stay/);
 assert.throws(()=>saveStyle(undefined,{...grim,name:'warm storyteller'}),/already a style called/);
 const w=withGrim();
 assert.throws(()=>saveStyle(w,{...grim,id:'grim-2'}),/already a style called/);
 const changed=saveStyle(w,{...grim,length:'detailed'});
 assert.equal(changed.styles.length,1);assert.equal(changed.styles[0].length,'detailed');
 let many;for(let i=0;i<30;i++)many=saveStyle(many,{...grim,id:`s${i}`,name:`Style ${i}`});
 assert.throws(()=>saveStyle(many,{...grim,id:'s30',name:'One more'}),/30 styles/);
 assert.throws(()=>saveStyle(undefined,{...grim,instructions:'x'.repeat(1001)}));
 const gone=deleteStyle(chooseStyle(w,'story','grim-1'),'grim-1');
 assert.deepEqual(gone.styles,[]);assert.deepEqual(gone.use,{});assert.equal(styleFor(gone,'recap').id,DEFAULT_STYLE);
});

test('a campaign keeps its styles, and players never see them',()=>{
 const w=demoWorkspace();
 w.campaigns=w.campaigns.map(c=>c.id===C?{...c,aiWriting:withGrim()}:c);
 const parsed=workspaceSchema.parse(w);
 assert.equal(parsed.campaigns.find(c=>c.id===C).aiWriting.use.recap,'grim-1');
});

test('the recap and story prompts carry the style; the recap keeps the length the GM asked for',()=>{
 const head={campaign:'C',title:'Session 13',names:'',timeline:'- Arrived'};
 const recap=prosePrompt({...head,request:{...defaultRequest,length:'detailed'},style:grim});
 assert.match(recap,/Length: about 600 to 1,200 words\./);assert.match(recap,/Present tense, grim, written as Ostra Hale’s own journal/);
 assert.match(recap,/Write in German\./);assert.match(recap,/Never name the Bog Hag/);
 assert.doesNotMatch(recap,/Recap length/);
 const plain=prosePrompt({...head,request:defaultRequest});
 assert.match(plain,/Past tense, warm, as a story of what the party did\./);assert.match(plain,/Write it in paragraphs\./);
 const story=storyPrompt({campaign:'C',recaps:[],left:0,style:{...grim,shape:'bullets'}});
 assert.match(story,/Use short bullet points/);assert.doesNotMatch(story,/no lists/);
 assert.match(storyPrompt({campaign:'C',recaps:[],left:0}),/No headings and no links, no lists\./);
});

function world(aiWriting){
 const w=demoWorkspace(),at=NOW.toISOString(),c=w.campaigns.find(x=>x.id===C);
 if(aiWriting)Object.assign(c,{aiWriting});
 w.entries.push({id:'s13',worldId:c.worldId,campaignId:C,parentId:null,title:'Session 13',kind:'session',body:'We reached Greyfen.',overviewVisibility:'players',updatedAt:at,
  recap:{...emptyRecap(),request:{...defaultRequest,style:'builtin-plain'},timeline:[{id:'b1',title:'Arrival at Greyfen',big:true,steps:['Ostra waits']}]}});
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
 const f=async(url,init={})=>{const req=url instanceof Request?url:new Request(url,init);sent.push({body:req.method==='POST'?JSON.parse(await req.text()):null});const next=replies.shift();if(!next)throw Error('No more replies');return new Response(JSON.stringify(next),{status:200,headers:{'content-type':'application/json','request-id':'req_1'}});};
 f.sent=sent;return f;
}
const oaSay=text=>({choices:[{message:{content:text},finish_reason:'stop'}],usage:{total_tokens:300}});
async function setup(w){
 const b=bucket(),store=new EncyclopediaStore(b);
 await store.save(OWNER,w,0);
 const connection=await createApiConnection(b,OWNER,C,'Sonnet','helper',cleanApi({provider:'openai',model:'gpt-test',apiKey:KEY,limit:'2,000,000'}));
 return {b,store,connection};
}

test('Write it again uses the style the recap was asked with, or the one picked now with its length',async()=>{
 const s=await setup(world(withGrim()));
 const f=fakeFetch([oaSay('Short again.'),oaSay('In German.')]);
 await writeRecapAgain(s.b,OWNER,C,s.connection.id,'s13','',f);
 const first=f.sent[0].body.messages[1].content;
 assert.match(first,/Past tense, plain, as a story/);assert.match(first,/Length: about 250 to 600 words\./,'the length asked for stays');
 await writeRecapAgain(s.b,OWNER,C,s.connection.id,'s13','More dialogue.',f,'grim-1');
 const second=f.sent[1].body.messages[1].content;
 assert.match(second,/Write in German\./);assert.match(second,/Length: about 150 to 300 words\./);assert.match(second,/asks: More dialogue\./);
});

test('The story so far writes in the picked style and length; a sample saves nothing',async()=>{
 const w=publishRecap(world(withGrim()),'s13',true,NOW);
 const s=await setup(w);
 const f=fakeFetch([oaSay('Story.')]);
 await writeStory(s.b,OWNER,C,s.connection.id,f,{styleId:'builtin-bullets',length:'detailed'});
 const asked=f.sent[0].body.messages[1].content;
 assert.match(asked,/Use short bullet points/);assert.match(asked,/Length: about 300 to 500 words\./);
 const before=JSON.stringify((await s.store.read(OWNER)).data);
 const sf=fakeFetch([oaSay('Ich bin Ostra.'),oaSay('A sample story.')]);
 const r=await writeSample(s.b,OWNER,C,s.connection.id,{kind:'recap',style:grim,entryId:'s13'},sf);
 assert.equal(r.text,'Ich bin Ostra.');assert.equal(r.by,'Sonnet');
 assert.match(sf.sent[0].body.messages[1].content,/Write in German\./);assert.match(sf.sent[0].body.messages[1].content,/Arrival at Greyfen/);
 assert.equal((await writeSample(s.b,OWNER,C,s.connection.id,{kind:'story',style:builtInStyles[1]},sf)).text,'A sample story.');
 assert.equal(JSON.stringify((await s.store.read(OWNER)).data),before,'nothing is saved');
 await assert.rejects(writeSample(s.b,OWNER,C,s.connection.id,{kind:'recap',style:{...grim,length:'huge'},entryId:'s13'},sf));
 await assert.rejects(writeSample(s.b,OWNER,C,s.connection.id,{kind:'recap',style:grim,entryId:'nope'},sf),/Pick a session/);
});

test('MCP prompts for AI apps follow the campaign’s styles',()=>{
 const w=world(withGrim()),campaign=w.campaigns.find(c=>c.id===C);
 const ctx={book:w,campaign,maps:null,level:'assist',perms:fromLevel('assist'),connection:'Claude'};
 assert.match(getPrompt(ctx,'recap_session',{}).messages[0].content.text,/Write in German\./);
 assert.match(getPrompt(ctx,'recap_from_source',{page:'s13'}).messages[0].content.text,/How to write the recap \("Plain and brief"\): Length: about 250 to 600 words\./);
 assert.match(getPrompt(ctx,'story_so_far',{}).messages[0].content.text,/Past tense, warm/);
});
