import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-items';
const {demoWorkspace,playerCampaign,workspaceSchema,defaultCharacter,importCopy}=await import('../lib/encyclopedia/world-model.ts');
const I=await import('../lib/encyclopedia/items.ts');
const S=await import('../lib/encyclopedia/stores.ts');
const A=await import('../lib/encyclopedia/store-actions.ts');
const R=await import('../lib/encyclopedia/player-sheet-request.ts');

const C='demo-campaign',AT='2026-11-14T10:00:00.000Z',NOW=Date.parse('2026-11-15T10:00:00.000Z');
let n=0;const newId=()=>`n${++n}`;
const gp=[{name:'Gold',abbr:'gp',rate:100},{name:'Silver',abbr:'sp',rate:10},{name:'Copper',abbr:'cp',rate:1}];
const settings={...I.defaultItemSettings(),coins:gp,carry:'lb'};
const page=(id,title,kind,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind,body:'',updatedAt:AT,...extra});
const char=(id,title,character,extra={})=>page(id,title,'character',{character:{...defaultCharacter(),...character},...extra});
const item=(id,name,qty,more={})=>({id,name,qty,...more});
const mine=new Set(['ilsa']),rights={edit:mine,subPages:new Set(),made:new Set()};
const ctx={newId,now:NOW,random:()=>0.99};
const player={gm:false,name:'Mara',mine},gm={gm:true,name:'GM'};
function world(campaignItems=settings){
 n=0;
 const w=demoWorkspace();
 return workspaceSchema.parse({...w,campaigns:w.campaigns.map(c=>c.id===C?{...c,items:campaignItems,statFields:[{id:'per',label:'Persuasion',section:'',type:'number',options:[],visibility:'players',archived:false,roll:'d20'}]}:c),entries:[...w.entries,
  char('ilsa','Ilsa Marrow',{role:'pc',statsByCampaign:{[C]:{per:4}},trackers:[{id:'slots',label:'Slots',shape:'pips',colour:'blue',max:3,value:2}],
   inventory:{coins:1250,items:[item('rope','Rope',1,{weight:10,price:100,category:'Gear'}),item('arrows','Arrows',20,{price:1,category:'Weapons'}),item('curse','Cursed coin',1,{gm:true}),item('key','Iron key',1,{gmNote:'Opens the strongbox'})]},
   spells:[{id:'s1',name:'Cure Wounds',rolls:[{name:'Healing',formula:'1d8+2'}],cost:{trackerId:'slots',n:1}},{id:'s2',name:'Secret word',gm:true}]},{overviewVisibility:'players'}),
  char('tam','Tam Rook',{role:'pc'},{overviewVisibility:'players'}),
  char('vey','Agent Vey',{role:'npc'}),
  page('smithy','Brakka’s Smithy','store',{overviewVisibility:'players',store:{...S.newStore('shop'),visibility:'players',coins:500,items:[item('sword','Longsword',2,{price:1500,category:'Weapons'}),item('bread','Bread',null,{price:2,category:'Gear'}),item('silver','Silvered dagger',1,{price:10000,gm:true,gmNote:'Stolen'})],shop:{...S.defaultShop(),sell:110,buy:50,categoryPct:{Weapons:100},characterPct:{tam:80},haggle:{roll:'Persuasion',target:15,pct:10}}}}),
  page('box','Bandit strongbox','store',{store:{...S.newStore('container'),visibility:'players',coins:300,items:[item('gem','Garnet',2,{price:5000})],lock:{state:'locked',key:'Iron key',roll:'Persuasion',target:30}}}),
  page('pile','Goblin loot','store',{store:{...S.newStore('loot'),visibility:'players',coins:301,items:[item('dagger','Rusty dagger',3)]}}),
 ]});
}
const entry=(w,id)=>w.entries.find(e=>e.id===id);
const inv=(w,id)=>entry(w,id).character.inventory;

test('money reads and prints in the campaign’s coins, and a single coin works too',()=>{
 assert.equal(I.formatMoney(4856,gp),'48 gp 5 sp 6 cp');
 assert.equal(I.formatMoney(0,gp),'0 gp');
 assert.equal(I.parseMoney('5 gp 3 sp',gp),530);
 assert.equal(I.parseMoney('1.5 gp',gp),150);
 assert.equal(I.parseMoney('12',gp),1200,'a bare number is the largest coin');
 assert.equal(I.parseMoney('3 zorkmids',gp),null);
 assert.equal(I.parseMoney('300 cr',[{name:'Credits',abbr:'cr',rate:1}]),300);
 assert.equal(I.formatMoney(1240,[{name:'Credits',abbr:'cr',rate:1}]),'1,240 cr');
 assert.equal(I.itemSettingsSchema.safeParse({...settings,coins:[{name:'Gold',abbr:'gp',rate:10}]}).success,false,'one coin must be worth 1');
});

test('old saves still load: inventory, spells and item settings are all optional',()=>{
 const w=demoWorkspace();
 assert.ok(workspaceSchema.safeParse(w).success);
 assert.deepEqual(I.itemSettingsOf(w.campaigns[0]).coins,[{name:'Coins',abbr:'coins',rate:1}]);
 const pc=playerCampaign(w,w.campaigns[0].id);
 assert.equal(pc.entries.some(e=>'inventory' in e||'spells' in e||'store' in e),false,'nothing new is sent for pages without it');
});

test('a spell can only spend from its own character’s trackers, and a store only points at characters',()=>{
 const w=world();
 const bad=structuredClone(w);entry(bad,'ilsa').character.spells[0].cost.trackerId='nope';
 assert.equal(workspaceSchema.safeParse(bad).success,false);
 const bad2=structuredClone(w);entry(bad2,'smithy').store.ownerId='box';
 assert.equal(workspaceSchema.safeParse(bad2).success,false);
 const bad3=structuredClone(w);entry(bad3,'ilsa').store={...S.newStore('stash')};
 assert.equal(workspaceSchema.safeParse(bad3).success,false,'store data only on a store page');
});

test('players get their own inventory and spells without GM lines, notes or values when hidden',()=>{
 const w=world();
 const own=playerCampaign(w,C,mine).entries.find(e=>e.id==='ilsa');
 assert.deepEqual(own.inventory.items.map(i=>i.name),['Rope','Arrows','Iron key']);
 assert.ok(own.inventory.items.every(i=>!('gmNote' in i)&&!('gm' in i)));
 assert.deepEqual(own.spells.map(s=>s.name),['Cure Wounds']);
 assert.equal(own.inventory.coins,1250);
 const share=playerCampaign(w,C).entries.find(e=>e.id==='ilsa');
 assert.equal(share.inventory,undefined,'a share link does not get another character’s inventory');
 assert.equal(share.spells,undefined);
 const shared=structuredClone(w);entry(shared,'ilsa').character.inventory.visibility='players';
 assert.deepEqual(playerCampaign(shared,C).entries.find(e=>e.id==='ilsa').inventory.items.map(i=>i.name),['Rope','Arrows','Iron key']);
 const hidden=world({...settings,players:{...settings.players,values:false}});
 assert.ok(playerCampaign(hidden,C,mine).entries.find(e=>e.id==='ilsa').inventory.items.every(i=>!('price' in i)),'values kept from players');
 assert.equal(playerCampaign(w,C,mine).campaign.items.catalog,undefined,'the item list stays with the GM');
});

test('inventory actions: add, edit, coins, cast; players can’t reach GM lines or set GM things',()=>{
 const w=world(),c=entry(w,'ilsa').character,parts={inventory:c.inventory,spells:c.spells,trackers:c.trackers};
 const who={gm:false,settings,newId};
 let r=I.applyInventoryAction(parts,{action:'add',item:{name:'Torch',qty:3,gm:true,gmNote:'x'}},who);
 const torch=r.parts.inventory.items.at(-1);
 assert.equal(torch.gm,undefined);assert.equal(torch.gmNote,undefined);
 assert.throws(()=>I.applyInventoryAction(parts,{action:'remove',itemId:'curse'},who),/gone/);
 r=I.applyInventoryAction(parts,{action:'edit',itemId:'key',item:{note:'Heavy',gmNote:'changed'}},who);
 assert.equal(r.parts.inventory.items.find(i=>i.id==='key').gmNote,'Opens the strongbox','a player edit keeps the GM note as it was');
 assert.throws(()=>I.applyInventoryAction(parts,{action:'coins',delta:-5000},who),/more than there is/);
 r=I.applyInventoryAction(parts,{action:'cast',spellId:'s1'},who);
 assert.equal(r.parts.trackers[0].value,1);assert.match(r.said,/Slots 1 of 3 left/);
 r=I.applyInventoryAction(r.parts,{action:'cast',spellId:'s1'},who).parts;
 assert.throws(()=>I.applyInventoryAction(r,{action:'cast',spellId:'s1'},who),/Not enough Slots/);
 assert.throws(()=>I.applyInventoryAction(parts,{action:'capacity',value:100},who),/Only the GM/);
 const locked={gm:false,settings:{...settings,players:{...settings.players,items:false,coins:false}},newId};
 assert.throws(()=>I.applyInventoryAction(parts,{action:'add',item:{name:'Torch'}},locked),/GM keeps this list/);
 assert.throws(()=>I.applyInventoryAction(parts,{action:'coins',delta:5},locked),/keeps track of your money/);
 assert.ok(I.applyInventoryAction(parts,{action:'cast',spellId:'s1'},locked),'casting still works when the lists are the GM’s');
});

test('a roll by name: the sheet, then a stat that rolls, then plain dice',()=>{
 const form=[{id:'per',label:'Persuasion',type:'number',roll:'d20'}];
 assert.equal(I.characterRoll({statsByCampaign:{c:{per:-1}}},form,'c','persuasion'),'1d20-1');
 assert.equal(I.characterRoll({sheet:{items:[{name:'Persuasion',kind:'roll',formula:'1d20 + 7'}]},statsByCampaign:{}},form,'c','Persuasion'),'1d20+7');
 assert.equal(I.characterRoll(undefined,[],'c','2d6+1'),'2d6+1');
 assert.equal(I.characterRoll(undefined,[],'c','Charm'),null);
});

test('buying and selling: prices worked out here, character rates and haggles, stock and purse move',()=>{
 let w=world();
 assert.equal(S.buyPrice(entry(w,'smithy').store,{price:1500,category:'Weapons'},'ilsa',NOW),1650);
 assert.equal(S.buyPrice(entry(w,'smithy').store,{price:1500,category:'Weapons'},'tam',NOW),1320,'Tam’s 80%');
 assert.throws(()=>A.storeAction(w,C,player,{action:'buy',storeId:'smithy',as:'ilsa',itemId:'silver',qty:1},ctx),/gone/,'GM-only stock can’t be bought');
 assert.throws(()=>A.storeAction(w,C,player,{action:'buy',storeId:'smithy',as:'tam',itemId:'sword',qty:1},ctx),/your own character/);
 assert.throws(()=>A.storeAction(w,C,player,{action:'buy',storeId:'smithy',as:'ilsa',itemId:'sword',qty:3},ctx),/only 2/);
 assert.throws(()=>A.storeAction(w,C,player,{action:'buy',storeId:'smithy',as:'ilsa',itemId:'sword',qty:1},ctx),/costs 16 gp 5 sp\. Ilsa Marrow has 12 gp 5 sp/);
 entry(w,'ilsa').character.inventory.coins=5000;
 let r=A.storeAction(w,C,player,{action:'buy',storeId:'smithy',as:'ilsa',itemId:'sword',qty:1},ctx);w=r.data;
 assert.equal(inv(w,'ilsa').coins,3350);assert.equal(entry(w,'smithy').store.coins,2150);
 assert.equal(entry(w,'smithy').store.items.find(i=>i.id==='sword').qty,1);
 assert.ok(inv(w,'ilsa').items.some(i=>i.name==='Longsword'&&i.qty===1&&i.price===1500));
 r=A.storeAction(w,C,player,{action:'buy',storeId:'smithy',as:'ilsa',itemId:'bread',qty:5},ctx);w=r.data;
 assert.equal(entry(w,'smithy').store.items.find(i=>i.id==='bread').qty,null,'bread never runs out');
 r=A.storeAction(w,C,player,{action:'sell',storeId:'smithy',as:'ilsa',itemId:'rope',qty:1},ctx);w=r.data;
 assert.match(r.said,/Sold Rope for 5 sp/);
 assert.ok(entry(w,'smithy').store.items.some(i=>i.name==='Rope'&&i.qty===1));
 assert.deepEqual(entry(w,'smithy').store.log.map(l=>l.charId),['ilsa','ilsa','ilsa']);
 // Haggle: one roll a visit, made here. 0.99 rolls a 20.
 r=A.storeAction(w,C,player,{action:'haggle',storeId:'smithy',as:'ilsa',itemId:'x'},ctx);w=r.data;
 assert.equal(r.roll.ok,true);assert.equal(r.roll.formula,'1d20+4');
 assert.equal(S.buyPrice(entry(w,'smithy').store,{price:1500,category:'Weapons'},'ilsa',NOW),1485,'10% off');
 assert.throws(()=>A.storeAction(w,C,player,{action:'haggle',storeId:'smithy',as:'ilsa'},ctx),/not long ago/);
 assert.equal(S.buyPrice(entry(w,'smithy').store,{price:1500,category:'Weapons'},'ilsa',NOW+3*3600_000),1650,'a haggle wears off');
 // A closed shop sells nothing.
 entry(w,'smithy').store.shop.open=false;
 assert.throws(()=>A.storeAction(w,C,player,{action:'buy',storeId:'smithy',as:'ilsa',itemId:'bread',qty:1},ctx),/closed/);
});

test('a sale can wait for the GM’s OK, and the GM says yes or no',()=>{
 let w=world();entry(w,'smithy').store.shop.approve=true;entry(w,'ilsa').character.inventory.coins=5000;w=workspaceSchema.parse(w);
 let r=A.storeAction(w,C,player,{action:'buy',storeId:'smithy',as:'ilsa',itemId:'sword',qty:1},ctx);w=r.data;
 assert.match(r.said,/waiting/);assert.equal(inv(w,'ilsa').coins,5000);
 const p=entry(w,'smithy').store.pending[0];
 const pc=playerCampaign(w,C,mine).entries.find(e=>e.id==='smithy').store;
 assert.equal(pc.pending.length,1);
 assert.equal(playerCampaign(w,C,new Set(['tam'])).entries.find(e=>e.id==='smithy').store.pending.length,0,'other players don’t see it');
 r=A.decidePending(w,C,'smithy',p.id,true,ctx);w=r.data;
 assert.equal(inv(w,'ilsa').coins,3350);assert.equal(entry(w,'smithy').store.pending.length,0);
 r=A.storeAction(w,C,player,{action:'sell',storeId:'smithy',as:'ilsa',itemId:'rope',qty:1},ctx);w=r.data;
 r=A.decidePending(w,C,'smithy',entry(w,'smithy').store.pending[0].id,false,ctx);w=r.data;
 assert.ok(inv(w,'ilsa').items.some(i=>i.id==='rope'));assert.equal(entry(w,'smithy').store.pending.length,0);
});

test('players see shops without GM stock, notes, purse or others’ rates, and a locked box shows nothing inside',()=>{
 const w=world(),pc=playerCampaign(w,C,mine).entries;
 const shop=pc.find(e=>e.id==='smithy').store;
 assert.deepEqual(shop.items.map(i=>i.name),['Longsword','Bread']);
 assert.equal(shop.items[0].price,1650,'list price after the shop’s rate');
 assert.equal(shop.coins,null);assert.deepEqual(shop.rate,{});
 assert.equal(JSON.stringify(shop).includes('Stolen'),false);
 assert.equal(JSON.stringify(shop).includes('tam'),false,'another character’s rate is left out');
 assert.equal(shop.shop.haggle.target,undefined,'the haggle target is the GM’s');
 const box=pc.find(e=>e.id==='box').store;
 assert.equal(box.shut,true);assert.deepEqual(box.items,[]);assert.equal(box.coins,null);
 assert.deepEqual(box.lock,{state:'locked',key:true,roll:'Persuasion'},'the key’s name and the target stay with the GM');
 const hidden=structuredClone(w);entry(hidden,'box').store.visibility='gm';
 assert.equal(playerCampaign(hidden,C,mine).entries.some(e=>e.id==='box'),false);
 const only=structuredClone(w);entry(only,'box').store.who=['tam'];
 assert.equal(playerCampaign(only,C,mine).entries.some(e=>e.id==='box'),false,'for other characters only');
});

test('containers: locked until a key or a roll opens them; then take, put in and take all',()=>{
 let w=world();
 assert.throws(()=>A.storeAction(w,C,player,{action:'take',storeId:'box',as:'ilsa',itemId:'gem',qty:1},ctx),/locked/);
 assert.throws(()=>A.storeAction(w,C,player,{action:'open',storeId:'box',as:'ilsa'},ctx),/locked/);
 const failed=A.storeAction(w,C,player,{action:'pick',storeId:'box',as:'ilsa'},ctx);
 assert.equal(failed.roll.ok,false);assert.equal(entry(failed.data,'box').store.lock.state,'locked');
 let r=A.storeAction(w,C,player,{action:'key',storeId:'box',as:'ilsa'},ctx);w=r.data;
 assert.equal(entry(w,'box').store.lock.state,'open');
 r=A.storeAction(w,C,player,{action:'take',storeId:'box',as:'ilsa',itemId:'gem',qty:1},ctx);w=r.data;
 assert.equal(entry(w,'box').store.items[0].qty,1);
 r=A.storeAction(w,C,player,{action:'put',storeId:'box',as:'ilsa',itemId:'arrows',qty:5},ctx);w=r.data;
 assert.equal(inv(w,'ilsa').items.find(i=>i.id==='arrows').qty,15);
 assert.throws(()=>A.storeAction(w,C,player,{action:'put',storeId:'box',as:'ilsa',itemId:'curse',qty:1},ctx),/gone/,'GM-only lines can’t be moved by players');
 r=A.storeAction(w,C,player,{action:'take-all',storeId:'box',as:'ilsa'},ctx);w=r.data;
 assert.deepEqual(entry(w,'box').store.items,[]);assert.equal(entry(w,'box').store.coins,0);
 assert.equal(inv(w,'ilsa').coins,1550);
 assert.equal(inv(w,'ilsa').items.find(i=>i.name==='Garnet').qty,2,'the two garnets stack');
});

test('loot splits its coins between the party, the rest stays',()=>{
 let w=world();
 const r=A.storeAction(w,C,player,{action:'split',storeId:'pile',as:'ilsa'},ctx);w=r.data;
 assert.equal(inv(w,'ilsa').coins,1250+150);assert.equal(inv(w,'tam').coins,150);
 assert.equal(inv(w,'vey')?.coins??0,0,'NPCs are not in the party');
 assert.equal(entry(w,'pile').store.coins,1);
});

test('giving: to characters the player can read, never GM-only lines, and the campaign can say no',()=>{
 let w=world();
 assert.throws(()=>A.give(w,C,player,{from:'ilsa',to:'vey',itemId:'rope',qty:1,coins:0},ctx),/know/,'Vey’s page is not shared');
 let r=A.give(w,C,player,{from:'ilsa',to:'tam',itemId:'arrows',qty:5,coins:200},ctx);w=r.data;
 assert.equal(r.said,'Gave 5 × Arrows and 2 gp to Tam Rook.');
 assert.equal(inv(w,'tam').items[0].qty,5);assert.equal(inv(w,'ilsa').coins,1050);
 assert.throws(()=>A.give(w,C,player,{from:'ilsa',to:'tam',itemId:'curse',qty:1,coins:0},ctx),/gone/);
 assert.throws(()=>A.give(w,C,player,{from:'tam',to:'ilsa',itemId:null,qty:0,coins:1},ctx),/your own character/);
 const no=world({...settings,players:{...settings.players,give:false}});
 assert.throws(()=>A.give(no,C,player,{from:'ilsa',to:'tam',itemId:'rope',qty:1,coins:0},ctx),/GM hands things over/);
 assert.ok(A.give(no,C,gm,{from:'ilsa',to:'vey',itemId:'curse',qty:1,coins:0},ctx),'the GM moves anything');
});

test('players set up stalls and containers as the campaign allows, and run their own stall',()=>{
 let w=world();
 assert.throws(()=>A.createPlayerStore(world({...settings,players:{...settings.players,shops:'no'}}),C,player,{as:'ilsa',type:'shop',title:'Stall',shared:true},ctx),/GM sets up the shops/);
 let r=A.createPlayerStore(w,C,player,{as:'ilsa',type:'shop',title:'Maren’s stall',shared:true},ctx);w=r.data;
 const stall=entry(w,r.id);
 assert.equal(stall.store.awaiting,true,'shops wait for the GM by default');assert.equal(stall.parentId,'ilsa');
 assert.ok(playerCampaign(w,C,mine).entries.some(e=>e.id===r.id),'the owner sees it');
 assert.equal(playerCampaign(w,C,new Set(['tam'])).entries.some(e=>e.id===r.id),false,'others don’t until the GM says yes');
 const id=r.id;
 r=A.storeAction(w,C,player,{action:'stock',storeId:id,as:'ilsa',itemId:'arrows',qty:10,price:5},ctx);w=r.data;
 assert.equal(entry(w,id).store.items[0].price,5);assert.equal(inv(w,'ilsa').items.find(i=>i.id==='arrows').qty,10);
 entry(w,id).store=A.approveStore(entry(w,id).store);
 const tam={gm:false,name:'Sam',mine:new Set(['tam'])};entry(w,'tam').character.inventory={coins:100,items:[]};
 r=A.storeAction(w,C,tam,{action:'buy',storeId:id,as:'tam',itemId:entry(w,id).store.items[0].id,qty:4},ctx);w=r.data;
 assert.equal(inv(w,'tam').coins,80);
 assert.throws(()=>A.storeAction(w,C,tam,{action:'collect',storeId:id,as:'tam'},ctx),/whoever runs it/);
 r=A.storeAction(w,C,player,{action:'collect',storeId:id,as:'ilsa'},ctx);w=r.data;
 assert.equal(inv(w,'ilsa').coins,1270);
 const c=A.createPlayerStore(w,C,player,{as:'ilsa',type:'container',title:'My chest',shared:false},ctx);
 assert.equal(entry(c.data,c.id).store.awaiting,undefined);assert.equal(entry(c.data,c.id).store.visibility,'gm','kept to the owner');
});

test('copying a campaign keeps a store’s owner and its character rates pointing at the copies',()=>{
 const w=world();entry(w,'smithy').store.ownerId='vey';
 const copy=importCopy({schemaVersion:1,worlds:[],campaigns:[],entries:[]},w);
 const smithy=copy.entries.find(e=>e.title==='Brakka’s Smithy'),tam=copy.entries.find(e=>e.title==='Tam Rook'),vey=copy.entries.find(e=>e.title==='Agent Vey');
 assert.notEqual(tam.id,'tam');
 assert.deepEqual(Object.keys(smithy.store.shop.characterPct),[tam.id]);
 assert.equal(smithy.store.ownerId,vey.id);
 assert.equal(smithy.store.log,undefined,'the log and waiting sales are not copied');
});

const REF='a'.repeat(64);
function setup(){
 const state={data:world(),revision:1,saves:[]};
 const deps={
  member:async ref=>ref!==REF?null:{owner:'gm-1',campaignId:C,userId:'mara',name:'Mara',rights},
  sameOrigin:r=>r.headers.get('Origin')==='https://rpg.example',
  store:{read:async()=>({data:state.data,revision:state.revision}),save:async(o,data,rev,by)=>{state.saves.push(by);if(rev!==state.revision)return null;state.data=data;state.revision++;return {};}},
  now:NOW,random:()=>0.99,
 };
 return {state,deps};
}
const req=(body,{origin='https://rpg.example'}={})=>new Request('https://rpg.example/api/encyclopedia/player-tracker?items',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('player items route: same origin, a member, checked changes saved as the player',async()=>{
 R.resetThrottles();const s=setup();
 assert.equal((await R.handlePlayerItems(req({ref:REF,kind:'inventory',as:'ilsa',change:{action:'coins',delta:5}},{origin:'https://evil.example'}),s.deps)).status,403);
 assert.equal((await R.handlePlayerItems(req({ref:'b'.repeat(64),kind:'inventory',as:'ilsa',change:{action:'coins',delta:5}}),s.deps)).status,404);
 let res=await R.handlePlayerItems(req({ref:REF,kind:'inventory',as:'ilsa',change:{action:'coins',delta:50}}),s.deps);
 assert.equal(res.status,200);assert.equal(inv(s.state.data,'ilsa').coins,1300);
 assert.deepEqual(s.state.saves.at(-1),{name:'Mara',as:'player'});
 res=await R.handlePlayerItems(req({ref:REF,kind:'inventory',as:'tam',change:{action:'coins',delta:50}}),s.deps);
 assert.equal(res.status,403);
 res=await R.handlePlayerItems(req({ref:REF,kind:'store',change:{action:'pick',storeId:'box',as:'ilsa'}}),s.deps);
 const body=await res.json();assert.equal(res.status,200);assert.equal(body.roll.total,24);assert.equal(body.roll.ok,false);
 res=await R.handlePlayerItems(req({ref:REF,kind:'store',change:{action:'buy',storeId:'smithy',as:'ilsa',itemId:'sword',qty:1,price:1}}),s.deps);
 assert.equal(res.status,400,'a price from the browser is not read, and this costs more than she has');
 assert.match((await res.json()).error,/costs/);
 res=await R.handlePlayerItems(req({ref:REF,kind:'inventory',as:'ilsa',change:{action:'add',item:{name:'x'.repeat(5000)}}}),s.deps);
 assert.equal(res.status,400);
 // The trackers route answers both: ?items goes here.
 res=await R.handlePlayerCharacter(req({ref:REF,kind:'inventory',as:'ilsa',change:{action:'coins',delta:1}}),s.deps);
 assert.equal(res.status,200);assert.equal(inv(s.state.data,'ilsa').coins,1301);
});

test('a sheet import fills money, inventory values and spells with their rolls, and export gives them back',async()=>{
 const Imp=await import('../lib/encyclopedia/sheet-import.ts'),Exp=await import('../lib/encyclopedia/sheet-export.ts');
 const file=Imp.readImport(JSON.stringify({format:'rpgtools-sheet',version:1,name:'Wren',money:'12 gp 3 sp',
  rolls:[{name:'Fire Bolt',group:'spells',attack:'1d20+5',damage:'1d10',damageType:'Fire'}],
  lists:[{title:'Gear',items:[{name:'Lantern',quantity:1,weight:2,value:'5 gp'}]},{title:'Spells',items:[{name:'Fire Bolt',text:'A mote of fire.'}]}]}));
 assert.ok(file.ok);
 const r=Imp.applyImport(world(),file.file,{kind:'new',worldId:'demo-world',campaignId:C},{},{now:AT,newId});
 const e=workspaceSchema.parse(r.workspace).entries.find(x=>x.id===r.entryId);
 assert.equal(e.character.inventory.coins,1230);
 assert.deepEqual(e.character.inventory.items.map(i=>[i.name,i.weight,i.price]),[['Lantern',2,500]]);
 assert.deepEqual(e.character.spells.map(s=>[s.name,s.text,s.rolls]),[['Fire Bolt','A mote of fire.',[{name:'Attack',formula:'1d20+5'},{name:'Fire',formula:'1d10'}]]]);
 assert.deepEqual(r.warnings,[]);
 const out=Exp.exportSheet(r.workspace,r.entryId,{campaignId:C,now:AT}).file;
 assert.equal(out.money,'12 gp 3 sp');
 assert.deepEqual(out.lists.find(l=>l.title==='Inventory').items,[{name:'Lantern',quantity:1,weight:2,value:'5 gp'}]);
 assert.match(out.lists.find(l=>l.title==='Spells').items[0].text,/\[\[1d20\+5\|Attack\]\]/);
 const bad=Imp.applyImport(world(),{...file.file,money:'3 zorkmids'},{kind:'new',worldId:'demo-world',campaignId:C},{},{now:AT,newId});
 assert.match(bad.warnings.join(' '),/zorkmids/);
});
