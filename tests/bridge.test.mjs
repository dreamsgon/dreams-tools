import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {demoWorkspace,workspaceSchema}=await import('../lib/encyclopedia/world-model.ts');
const K=await import('../lib/bridge/keys.ts');
const A=await import('../lib/bridge/api.ts');
const {checkScope}=await import('../lib/mcp/commit.ts');
const I=await import('../lib/encyclopedia/sheet-import.ts');

const C='demo-campaign',C2='demo-campaign-two',AT='2026-11-14T10:00:00.000Z',LATER='2026-11-14T11:00:00.000Z';
function bucket(){
 const data=new Map();let n=0;
 return {data,async get(k){const v=data.get(k);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;},async put(k,text){data.set(k,{text,etag:String(++n)});return {etag:String(n)};},async delete(k){data.delete(k);}};
}
const example=()=>JSON.parse(readFileSync(new URL('./fixtures/rpgtools-sheet-example.json',import.meta.url),'utf8'));
const sheet=obj=>{const r=I.readImport(JSON.stringify(obj));assert.ok(r.ok,r.error);return r.file;};
const field=(id,label,section='Abilities')=>({id,label,section,type:'number',options:[],visibility:'players',archived:false,roll:'d20'});
function world(){
 const w=demoWorkspace();
 return workspaceSchema.parse({...w,campaigns:w.campaigns.map(c=>c.id===C?{...c,statFields:[field('f-str','Strength'),field('f-dex','Dexterity')]}:c),
  entries:w.entries.map(e=>({...e,updatedAt:AT}))});
}
const grant=(sync=K.defaultSync)=>({owner:'u1',campaignId:C,keyId:'k1',name:'Foundry',client:'foundry',sync});

test('a bridge key reaches one campaign, is stored only as a hash, and stops at once when revoked',async()=>{
 const b=bucket();
 const {key,bridge}=await K.createBridgeKey(b,'u1',C,{name:'  My   Foundry ',client:'foundry',sync:{pages:'both',scenes:'sideways',bogus:'both'}});
 assert.match(key,/^rpgb_[a-f0-9]{64}$/);
 assert.equal(bridge.name,'My Foundry');assert.equal(bridge.sync.pages,'both');assert.equal(bridge.sync.scenes,'both','an unknown direction keeps the default');assert.ok(!('bogus' in bridge.sync));
 assert.ok(![...b.data.values()].some(v=>v.text.includes(key.slice(5))),'the key itself is never stored');
 const g=await K.bridgeGrant(b,key,new Date(AT));
 assert.deepEqual({owner:g.owner,campaignId:g.campaignId,client:g.client},{owner:'u1',campaignId:C,client:'foundry'});
 assert.equal((await K.listBridgeKeys(b,'u1',C))[0].lastUsedAt,AT);
 assert.equal(await K.bridgeGrant(b,'rpg_'+key.slice(5)),null,'an AI connection key is not a bridge key');
 assert.equal(await K.bridgeGrant(b,'rpgb_'+'0'.repeat(64)),null);
 await K.updateBridgeKey(b,'u1',C,bridge.id,{sync:{characters:'to'}});
 assert.equal((await K.bridgeGrant(b,key)).sync.characters,'to');
 assert.equal(await K.revokeBridgeKey(b,'u1',C,bridge.id),true);
 assert.equal(await K.bridgeGrant(b,key),null);
 assert.equal(await K.revokeBridgeKey(b,'u1',C,bridge.id),false);
});

test('a campaign holds five bridge keys; a key whose list entry was replaced stops working',async()=>{
 const b=bucket(),keys=[];
 for(let i=0;i<K.MAX_BRIDGE_KEYS;i++)keys.push((await K.createBridgeKey(b,'u1',C,{client:'unreal'})).key);
 await assert.rejects(K.createBridgeKey(b,'u1',C,{}),/5 bridge keys/);
 assert.equal((await K.listBridgeKeys(b,'u1',C))[0].name,'Unreal Engine VTT');
 assert.equal((await K.listBridgeKeys(b,'u1',C2)).length,0,'keys belong to their campaign');
 // The index still points at the key, but the campaign's list no longer has its hash.
 const list=JSON.parse(b.data.get('users/u1/encyclopedia/bridge-keys/demo-campaign.json').text);
 list.keys[0].hash='f'.repeat(64);await b.put('users/u1/encyclopedia/bridge-keys/demo-campaign.json',JSON.stringify(list));
 assert.equal(await K.bridgeGrant(b,keys[0]),null);
 assert.ok(await K.bridgeGrant(b,keys[1]));
});

test('each kind of sync is gated by its direction',()=>{
 assert.doesNotThrow(()=>A.need(grant(),'characters','to'));
 assert.doesNotThrow(()=>A.need(grant(),'characters','from'));
 assert.throws(()=>A.need(grant(),'pages','from'),e=>e.status===403&&/RPG Tools → your table only/.test(e.message),'lore is one way by default');
 assert.throws(()=>A.need(grant({...K.defaultSync,characters:'off'}),'characters','to'),/Off/);
 const info=A.bridgeInfo(world(),grant(),7);
 assert.equal(info.api,1);assert.equal(info.revision,7);assert.equal(info.campaign.name,'The Salt Road');
 assert.deepEqual(info.sync.characters,{direction:'both',ready:true});assert.deepEqual(info.sync.scenes,{direction:'both',ready:false});
});

test('the bridge sees this campaign and shared lore, never another campaign',()=>{
 const w=world();
 assert.deepEqual(A.listCharacters(w,C).map(c=>[c.id,c.shared]),[['demo-mara',true]]);
 const {ids,pages}=A.listPages(w,C);
 assert.ok(ids.includes('demo-greyhaven')&&ids.includes('demo-places'));
 assert.ok(!ids.includes('demo-first')&&!ids.includes('demo-winter'),'sessions go with recaps, and other campaigns never');
 const grey=pages.find(p=>p.id==='demo-greyhaven');
 assert.equal(grey.kind,'place');assert.equal(grey.shared,true);assert.ok(['gm','players'].includes(grey.overview.visibility));
 assert.equal(A.listPages(w,C,LATER).pages.length,0,'nothing is newer');
 assert.equal(A.listPages(w,C,'2026-11-14T09:00:00Z').pages.length,pages.length);
 assert.throws(()=>A.listPages(w,C,'yesterday'),e=>e.status===400);
 assert.throws(()=>A.readCharacter(w,C,'demo-winter'),e=>e.status===404);
 assert.throws(()=>A.listCharacters(w,'gone'),e=>e.status===404);
});

test('a new character from a sheet: only fields on the stat form are kept, and the form is never changed',()=>{
 const w=world();let n=0;
 const r=A.writeCharacter(w,C,null,sheet(example()),{now:AT,newId:()=>`n${++n}`});
 assert.doesNotThrow(()=>checkScope(w,r.workspace,C),'the same fence as AI changes');
 assert.deepEqual(r.workspace.campaigns,w.campaigns);
 const e=r.workspace.entries.find(x=>x.id===r.id);
 assert.equal(e.campaignId,C);assert.equal(e.title,'Maren Ashford');
 assert.deepEqual(e.character.statsByCampaign[C],{'f-str':1,'f-dex':3});
 assert.match(r.warnings[0],/Not on this campaign’s stat form.*Class.*Darkvision/);
 assert.equal(e.character.sheet.items.find(i=>i.kind==='hp').value,'38');
 const out=A.readCharacter(workspaceSchema.parse(r.workspace),C,r.id);
 assert.equal(out.sheet.format,'rpgtools-sheet');assert.equal(out.sheet.core.hp.value,38);assert.equal(out.shared,false);
});

test('updates: own pages only, shared lore refused, and a stale read is a conflict with the current sheet',()=>{
 const w=world();let n=0;const ids=()=>`n${++n}`;
 const made=workspaceSchema.parse(A.writeCharacter(w,C,null,sheet(example()),{now:AT,newId:ids}).workspace),id=made.entries.find(e=>e.title==='Maren Ashford').id;
 const file=sheet({...example(),fields:[{label:'Strength',type:'number',value:3}],core:{hp:{value:10,max:44}}});
 const up=A.writeCharacter(made,C,id,file,{baseUpdatedAt:AT,now:LATER,newId:ids});
 const e=up.workspace.entries.find(x=>x.id===id);
 assert.equal(e.character.statsByCampaign[C]['f-str'],3);assert.equal(e.character.statsByCampaign[C]['f-dex'],3,'values the sheet leaves out stay');
 assert.equal(e.updatedAt,LATER);
 assert.throws(()=>A.writeCharacter(workspaceSchema.parse(up.workspace),C,id,file,{baseUpdatedAt:AT}),e=>e.status===409&&e.body.current.id===id&&e.body.current.sheet.core.hp.value===10);
 assert.throws(()=>A.writeCharacter(w,C,'demo-mara',file),e=>e.status===403&&/shared world lore/.test(e.message));
 assert.throws(()=>A.writeCharacter(w,C,'demo-winter',file),e=>e.status===404);
 assert.throws(()=>A.writeCharacter(made,C2,id,file),e=>e.status===404,'another campaign’s key can’t reach it');
});

test('HP from the table: updates an imported sheet, makes one when there is none, and leaves a Google Sheet alone',()=>{
 const w=world();
 const made=workspaceSchema.parse(A.writeCharacter(w,C,null,sheet(example()),{now:AT}).workspace),id=made.entries.find(e=>e.title==='Maren Ashford').id;
 const r=A.setHp(made,C,id,{value:'12'},LATER);
 assert.deepEqual(r.hp,{value:12,max:44});
 const items=r.workspace.entries.find(e=>e.id===id).character.sheet.items;
 assert.equal(items.find(i=>i.kind==='hp').value,'12');assert.equal(items.filter(i=>i.kind==='hp').length,1);
 assert.doesNotThrow(()=>checkScope(made,r.workspace,C));
 // A character with no sheet gets a small imported one.
 const bare={...made,entries:[...made.entries,{id:'npc1',worldId:'demo-world',campaignId:C,parentId:null,title:'Guard',kind:'character',body:'',character:{role:'npc',group:'',tags:[],location:'',faction:'',status:'active',statsVisibility:'gm',statsByCampaign:{}},updatedAt:AT}]};
 const r2=A.setHp(workspaceSchema.parse(bare),C,'npc1',{value:7,max:9},LATER);
 const s2=workspaceSchema.parse(r2.workspace).entries.find(e=>e.id==='npc1').character.sheet;
 assert.equal(s2.source,'import');assert.deepEqual(s2.items.map(i=>[i.kind,i.value]),[['hp','7'],['maxHp','9']]);
 const google={...made,entries:made.entries.map(e=>e.id===id?{...e,character:{...e.character,sheet:{source:'published',publishedUrl:'https://docs.google.com/spreadsheets/d/e/2PACX-abcdefghijklmnop/pubhtml',title:'S',mode:'cells',items:[{id:'h',name:'HP',cell:'B2',kind:'hp',value:'5'}]}}}:e)};
 assert.throws(()=>A.setHp(workspaceSchema.parse(google),C,id,{value:3}),e=>e.status===409&&/Google Sheet/.test(e.message));
 assert.throws(()=>A.setHp(made,C,id,{value:'lots'}),e=>e.status===400);
 assert.throws(()=>A.setHp(made,C,'demo-mara',{value:3}),e=>e.status===403);
});

test('quests and recaps: their state, goals and log, and a draft recap never for players',()=>{
 const w=world(),first=w.entries.find(e=>e.id==='demo-first');
 const quest={id:'q-light',worldId:first.worldId,campaignId:C,parentId:null,kind:'quest',title:'The green light',body:'We saw it.',overviewVisibility:'players',updatedAt:AT,
  quest:{state:'active',type:'main',giverId:'demo-mara',reward:'A ship',rewardHidden:true,prep:'A lich.',
   objectives:[{id:'g1',text:'x',verb:'Find',targetId:'demo-mara',target:'Old name',done:true},{id:'g2',text:'Hide me',done:false,hidden:true,status:'failed'}],
   log:[{id:'l1',at:AT,text:'We climbed.',players:true},{id:'l2',at:AT,text:'Lies.',players:false,label:'Session 3'}]}};
 const other={...quest,id:'q-other',campaignId:C2};
 const recap={status:'draft',timeline:[{id:'b1',title:'Arrival',big:true,steps:['Docked']}],quotes:[{id:'q1',text:'Hello',who:'Mara'}],gmNotes:'Secret plan',shareTimeline:true,shareQuotes:false,review:[]};
 const data=workspaceSchema.parse({...w,entries:[...w.entries.map(e=>e.id==='demo-first'?{...e,overviewVisibility:'players',tabs:[{id:'t1',title:'Loot',visibility:'players',body:'Gold'}],recap}:e),quest,other]});

 const {ids,quests}=A.listQuests(data,C);
 assert.deepEqual(ids,['q-light'],'another campaign’s quest never comes');
 const q=quests[0].quest;
 assert.equal(quests[0].overview.visibility,'players');
 assert.deepEqual([q.state,q.stateName,q.category,q.giver,q.reward,q.rewardHidden,q.prep],['active','Active','Main',{id:'demo-mara',title:'Mara Venn'},'A ship',true,'A lich.']);
 assert.deepEqual(q.goals.map(g=>[g.text,g.status,g.hidden]),[['Find Mara Venn','done',false],['Hide me','failed',true]],'a goal reads with the page’s current name');
 assert.deepEqual(q.log.map(l=>[l.label,l.players]),[['',true],['Session 3',false]]);

 const draft=A.listRecaps(data,C).recaps.find(r=>r.id==='demo-first');
 assert.equal(draft.recap.status,'draft');
 assert.ok([draft.overview,...draft.tabs].every(p=>p.visibility==='gm'),'a draft is GM only, whatever its tabs say');
 assert.deepEqual(draft.tabs.map(t=>t.id),['t1','recap-timeline','recap-quotes','recap-gm-notes']);
 const live=A.listRecaps(workspaceSchema.parse({...data,entries:data.entries.map(e=>e.id==='demo-first'?{...e,recap:{...recap,status:'published'}}:e)}),C).recaps.find(r=>r.id==='demo-first');
 assert.deepEqual([live.overview,...live.tabs].map(p=>p.visibility),['players','players','players','gm','gm'],'shared timeline yes, unshared quotes and GM notes no');
 assert.match(live.tabs[1].text,/### Arrival\n- Docked/);
 assert.ok(!A.listRecaps(data,C).ids.includes('demo-winter'));
 assert.throws(()=>A.need(grant({...K.defaultSync,recaps:'off'}),'recaps','to'),e=>e.status===403);
 assert.equal(A.listQuests(data,C,LATER).quests.length,0);
});
