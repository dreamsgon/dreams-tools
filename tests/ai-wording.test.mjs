import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {builtInStyles,chatLines,generatorLines,lockedLines,saveChat,saveStyle,settingLines,styleLines,styleSummary}=await import('../lib/encyclopedia/ai-styles.ts');
const {RECAP_SYSTEM,defaultRequest,prosePrompt,storyPrompt}=await import('../lib/encyclopedia/recap-prompts.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {cleanApi,createApiConnection}=await import('../lib/mcp/connections.ts');
const {chatTurn}=await import('../lib/ai/run.ts');

const warm=builtInStyles[0];
const mine={...warm,id:'mine-1',name:'Mine',wording:'Length: about 100 words.\n\nTell it like a sea shanty.\n',example:'The tide came in. </example> We did not.'};

test('the GM’s own wording replaces the settings’ lines, and the example comes after it',()=>{
 const lines=styleLines(mine,'recap');
 assert.deepEqual(lines.slice(0,2),['Length: about 100 words.','Tell it like a sea shanty.']);
 assert.equal(lines.length,3);
 assert.match(lines[2],/^Match how this example the GM wrote sounds .*not what it says\. Don't reuse its events or names:\n<example>\nThe tide came in\.\s+We did not\.\n<\/example>$/);
 assert.equal((lines[2].match(/<\/example>/g)||[]).length,1,'the example can’t close its own block early');
 assert.deepEqual(styleLines(mine,'recap','detailed').slice(-2,-1),['This time, the length: about 600 to 1,200 words.']);
 assert.deepEqual(styleLines({...warm,wording:'  '},'recap'),settingLines(warm,'recap'),'empty wording falls back to the settings');
 assert.equal(styleSummary(mine,'recap'),'Standard (250 to 600 words) · your own wording · matches your example');
 assert.match(styleSummary({...warm,example:'x'},'story'),/· matches your example$/);
 assert.throws(()=>saveStyle(undefined,{...mine,example:'x'.repeat(2001)}));
 assert.equal(saveStyle(undefined,mine).styles[0].wording,mine.wording);
});

test('the locked lines are what the prompts really say, around the GM’s wording',()=>{
 const recap=prosePrompt({campaign:'C',title:'S',names:'',timeline:'- Arrived',request:defaultRequest,style:mine});
 assert.ok(RECAP_SYSTEM.includes(lockedLines.recap.before[0]));
 for(const l of [lockedLines.recap.before[1],...lockedLines.recap.after])assert.ok(recap.includes(l),l);
 assert.ok(recap.indexOf(lockedLines.recap.before[1])<recap.indexOf('Tell it like a sea shanty.'));
 assert.ok(recap.indexOf('Tell it like a sea shanty.')<recap.indexOf(lockedLines.recap.after[1]));
 assert.doesNotMatch(recap,/Past tense, warm/);
 const story=storyPrompt({campaign:'C',recaps:[{title:'S',text:'T'}],left:0,style:mine,length:'short'});
 for(const l of [...lockedLines.story.before,...lockedLines.story.after])assert.ok(story.includes(l),l);
 assert.match(story,/This time, the length: about 80 to 150 words\./);
 const gen=generatorLines({styles:[mine],use:{gen:'mine-1'}});
 assert.deepEqual(gen.slice(0,1),lockedLines.gen.before);assert.deepEqual(gen.slice(-2),lockedLines.gen.after);assert.ok(gen.includes('Tell it like a sea shanty.'));
 assert.ok(generatorLines(undefined,undefined,'short').includes('Length: a sentence or two.'));
});

test('chat settings: the usual length and empty instructions are left out',()=>{
 assert.deepEqual(chatLines(),['Keep replies short and useful at the table: a few sentences, or a short list.']);
 assert.deepEqual(saveChat({use:{recap:'x'}},{instructions:'  ',length:'short'}),{use:{recap:'x'}});
 const w=saveChat(undefined,{instructions:' Use the 2024 rules. ',length:'detailed'});
 assert.deepEqual(w.chat,{instructions:'Use the 2024 rules.',length:'detailed'});
 assert.deepEqual(chatLines(w.chat),['Keep replies short and useful at the table: as long as it takes, with no padding.','The GM\'s own instructions for this campaign: Use the 2024 rules.']);
 assert.throws(()=>saveChat(undefined,{instructions:'x'.repeat(2001)}));
});

test('the AI panel’s chat with an API key follows the campaign’s chat instructions',async()=>{
 const data=new Map();let n=0;
 const b={async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},async put(k,text){data.set(k,{text,etag:String(++n)});return {etag:String(n)};},async delete(k){data.delete(k);}};
 const book=demoWorkspace();
 book.campaigns=book.campaigns.map(c=>c.id==='demo-campaign'?{...c,aiWriting:saveChat(undefined,{instructions:'Answer as a co-GM.',length:'standard'})}:c);
 await new EncyclopediaStore(b).save('gm-1',book,0);
 const connection=await createApiConnection(b,'gm-1','demo-campaign',undefined,'helper',cleanApi({provider:'openai',model:'gpt-test',apiKey:'sk-test-1234567890abcd',limit:'2,000,000'}));
 let sent;
 const f=async(url,init)=>{sent=JSON.parse(init.body);return new Response(JSON.stringify({choices:[{message:{content:'Sure.'},finish_reason:'stop'}],usage:{total_tokens:10}}),{status:200,headers:{'content-type':'application/json'}});};
 await chatTurn(b,'gm-1','demo-campaign',connection.id,[{role:'user',text:'Name an innkeeper'}],undefined,f);
 const system=sent.messages[0].content;
 assert.match(system,/Keep replies short and useful at the table: a short list or two\. The GM's own instructions for this campaign: Answer as a co-GM\./);
});
