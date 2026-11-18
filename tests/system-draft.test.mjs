import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-ai-keys';
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
const {cleanApi,createApiConnection,listConnections}=await import('../lib/mcp/connections.ts');
const {survey,defaultOptions,editWorld,starSystemSchema,temperatureAt,zones}=await import('../lib/encyclopedia/star-systems.ts');
const {parsePastedDraft,readSystemDraft,systemDraftPrompt,systemDraftSchema,systemDraftTool}=await import('../lib/encyclopedia/system-draft.ts');
const {draftSystem}=await import('../lib/ai/system-drafter.ts');

// An invented setting: nothing here comes from a published one.
const answer={name:'Vesh',star:'K2V',companions:[{star:'m',close:true},{star:'Q'}],premise:'The last port before the Ashen Expanse.',
 worlds:[
  {name:'Cinder',kind:'magma',au:0.2},
  {name:'Vesh Prime',kind:'Ocean',au:0.7,temp:18,gravity:1.07,air:'Standard',water:'ocean',life:'sapient',settled:'homeworld',note:'Floating cities.',moons:[{name:'Lantern',kind:'rocky'},{name:'',kind:'rocky'}]},
  {name:'Old Grey',kind:'gas giant',au:5.1,rings:true},
  {name:'Nothing',kind:'plasma',au:9},
 ],belts:[{name:'The Shoals',au:2.4},{name:'Bad',au:-1}],lure:'Salvage rights.',danger:'Pirates.',secret:'The port is a trap.'};
const base=()=>({options:defaultOptions(),backdrop:'nebula',seed:'vesh'});

test('an answer becomes a survey chart, with sensible values where it says nothing',()=>{
 const {system:s,name}=readSystemDraft(answer,base(),'realistic');
 assert.equal(starSystemSchema.safeParse(s).success,true);
 assert.equal(name,'Vesh');assert.equal(s.star,'K');assert.deepEqual(s.companions,[{star:'M',separation:'close'}]);
 assert.deepEqual(s.bodies.map(b=>b.name),['Cinder','Vesh Prime','Old Grey'],'unknown kinds are dropped');
 const [cinder,prime,grey]=s.bodies;
 assert.equal(cinder.temp,temperatureAt(zones(s).L,0.2,cinder.air),'no temperature given: worked out from the orbit');
 assert.equal(prime.kind,'water');assert.equal(prime.air,'standard');assert.equal(prime.temp,18);assert.equal(prime.life,'sapient');
 assert.deepEqual(prime.moons.map(m=>m.name),['Lantern']);assert.equal(prime.moons[0].au,0.7);assert.equal(prime.moons[0].day,'Locked to Vesh Prime');
 assert.equal(grey.kind,'gas');assert.equal(grey.rings,true);assert.equal(grey.water,'none');
 assert.deepEqual(s.belts.map(b=>b.name),['The Shoals']);
 assert.deepEqual(s.hooks.map(h=>h.kind),['lure','danger','secret']);
 assert.equal(s.options.count,3);
 assert.deepEqual(readSystemDraft(answer,base(),'realistic').system,s,'the same answer gives the same chart');
 assert.throws(()=>readSystemDraft({star:'G',worlds:[]},base(),'realistic'),/no worlds/);
});

test('worlds the GM locked or charted stay, and replace a drafted world of the same name',()=>{
 const old=survey({name:'Vesh',star:'K',companions:[],premise:'',options:defaultOptions(),backdrop:'nebula',seed:'v'});
 const a=old.bodies[0],b=old.bodies[1];
 const kept=editWorld(editWorld(old,a.id,{locked:true,name:'Vesh Prime'}),b.id,{pageId:'page-b'});
 const {system:s}=readSystemDraft(answer,{...base(),bodies:kept.bodies,sector:{pageId:'sec',systemId:'0101'}},'pulp');
 assert.equal(s.bodies.filter(x=>x.name==='Vesh Prime').length,1);
 assert.equal(s.bodies.find(x=>x.name==='Vesh Prime').id,a.id,'the locked one wins');
 assert.ok(s.bodies.some(x=>x.pageId==='page-b'));
 assert.deepEqual(s.sector,{pageId:'sec',systemId:'0101'});assert.equal(s.options.science,'pulp');
 assert.equal(starSystemSchema.safeParse(s).success,true);
});

test('the prompt names the setting and asks an AI app for JSON; a pasted answer is found in its words',()=>{
 const r=systemDraftSchema.parse({setting:'The Ashen Expanse',system:'Vesh',science:'realistic',note:'Before the war.'});
 const text=systemDraftPrompt(r,{name:'Greyfen'});
 assert.match(text,/Setting: The Ashen Expanse\nBuild this system: Vesh/);assert.match(text,/What the GM wants: Before the war\./);assert.doesNotMatch(text,/JSON/);
 assert.match(systemDraftPrompt({...r,system:''},{name:'G'},true),/Pick a fitting system[\s\S]*Answer with JSON only/);
 assert.deepEqual(parsePastedDraft('Here you go:\n```json\n{"star":"G","worlds":[]}\n```\nEnjoy!'),{star:'G',worlds:[]});
 assert.throws(()=>parsePastedDraft('No idea.'),/Paste the AI's answer/);
 assert.throws(()=>parsePastedDraft('{star: G}'),/isn't JSON/);
 assert.equal(systemDraftTool().name,'send_system');
});

test('drafting asks the GM’s own key, saves nothing and counts the tokens',async()=>{
 const data=new Map();let n=0;
 const b={async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text),text:async()=>v.text}:null;},async head(k){const v=data.get(k);return v?{etag:v.etag}:null;},
  async put(k,text,o={}){const v=data.get(k);if(o.onlyIf?.etagMatches&&v?.etag!==o.onlyIf.etagMatches)return null;if(o.onlyIf?.etagDoesNotMatch==='*'&&v)return null;data.set(k,{text,etag:String(++n)});return {etag:String(n)};},async delete(k){data.delete(k);},async list(){return {objects:[],truncated:false};}};
 await new EncyclopediaStore(b).save('gm-1',demoWorkspace(),0);
 const conn=await createApiConnection(b,'gm-1','demo-campaign','Helper','helper',cleanApi({provider:'openai',model:'gpt-test',apiKey:'sk-test-1234567890abcd',limit:'100,000'}));
 const sent=[],reply=args=>({choices:[{message:{content:null,tool_calls:[{id:'c',type:'function',function:{name:'send_system',arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}],usage:{total_tokens:3000}});
 const fake=replies=>async(url,init={})=>{const req=url instanceof Request?url:new Request(url,init);sent.push(JSON.parse(await req.text()));return new Response(JSON.stringify(replies.shift()),{status:200,headers:{'content-type':'application/json'}});};
 const before=JSON.stringify((await new EncyclopediaStore(b).read('gm-1')).data);
 const r={setting:'The Ashen Expanse',system:'Vesh',science:'realistic'};
 const out=await draftSystem(b,'gm-1','demo-campaign',{connectionId:conn.id,apiKey:'sk-test-1234567890abcd'},r,fake([reply(answer)]));
 assert.deepEqual(out.draft,answer);assert.equal(out.tokens,3000);assert.equal(out.by,'Helper');
 assert.match(sent[0].messages.find(m=>m.role==='user').content,/Setting: The Ashen Expanse/);
 assert.equal(sent[0].tools[0].function.name,'send_system');
 assert.equal(JSON.stringify((await new EncyclopediaStore(b).read('gm-1')).data),before);
 await assert.rejects(draftSystem(b,'gm-1','demo-campaign',{connectionId:conn.id,apiKey:'sk-test-1234567890abcd'},r,fake([reply({star:'G',premise:'',worlds:[]})])),/no worlds/);
 assert.equal((await listConnections(b,'gm-1','demo-campaign'))[0].api.used,6000);
});
