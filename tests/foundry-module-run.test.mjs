import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// A small stand-in for Foundry, enough to run the module's hooks: settings, actors, folders, notifications and chat.
const example=JSON.parse(readFileSync(new URL('./fixtures/rpgtools-sheet-example.json',import.meta.url),'utf8'));
const hooks=new Map(),on=(n,f)=>{if(!hooks.has(n))hooks.set(n,[]);hooks.get(n).push(f);},call=async(n,...a)=>{for(const f of hooks.get(n)??[])await f(...a);};
const notes=[],settings=new Map(),options=new Map(),actors=[],folders=[],journals=[],requests=[];
const expand=o=>{const out={};for(const [k,v] of Object.entries(o)){const p=k.split('.');let t=out;p.slice(0,-1).forEach(x=>{t=t[x]??={};});t[p.at(-1)]=v&&typeof v==='object'&&!Array.isArray(v)?expand(v):v;}return out;};
const merge=(a,b)=>{for(const [k,v] of Object.entries(b)){if(v&&typeof v==='object'&&!Array.isArray(v)&&a[k]&&typeof a[k]==='object')merge(a[k],v);else a[k]=v;}return a;};
class FakeActor{
 constructor(data){this.id=`a${actors.length+1}`;this.uuid=`Actor.${this.id}`;Object.assign(this,structuredClone(data));}
 getFlag(m,k){return this.flags?.[m]?.[k];}
 async update(d,opts={}){const changes=expand(d);merge(this,structuredClone(changes));await call('updateActor',this,changes,opts,'gm');return this;}
}
let pageCount=0;
class FakePage{constructor(d){this.id=`p${++pageCount}`;Object.assign(this,structuredClone(d));} getFlag(m,k){return this.flags?.[m]?.[k];}}
class FakeJournal{
 constructor(d){this.id=`j${journals.length+1}`;this.uuid=`JournalEntry.${this.id}`;this.pages=[];Object.assign(this,structuredClone(d));}
 getFlag(m,k){return this.flags?.[m]?.[k];}
 async update(d){merge(this,structuredClone(d));return this;}
 async createEmbeddedDocuments(_t,list){for(const p of list)this.pages.push(new FakePage(p));}
 async updateEmbeddedDocuments(_t,list){for(const {_id,...rest} of list)merge(this.pages.find(p=>p.id===_id),structuredClone(rest));}
 async deleteEmbeddedDocuments(_t,ids){this.pages=this.pages.filter(p=>!ids.includes(p.id));}
}
globalThis.JournalEntry={async create(d){const j=new FakeJournal(d);journals.push(j);return j;},async deleteDocuments(ids){for(const id of ids)journals.splice(journals.findIndex(j=>j.id===id),1);}};
globalThis.Hooks={once:on,on};
globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.foundry={utils:{expandObject:expand}};
globalThis.document={addEventListener(){}};globalThis.HTMLElement=class{};
globalThis.setInterval=()=>0;globalThis.clearInterval=()=>{};
globalThis.Actor={TYPES:['base','character','npc'],async create(data){const a=new FakeActor(data);actors.push(a);return a;}};
globalThis.Folder={async create(data){const f={id:`f${folders.length+1}`,...data,getFlag(m,k){return this.flags?.[m]?.[k];}};folders.push(f);return f;}};
globalThis.game={
 settings:{register(m,k,o){settings.set(k,o.default);options.set(k,o);},get(m,k){return settings.get(k);}},
 i18n:{localize:k=>k},user:{isGM:true,id:'gm'},users:{activeGM:{isSelf:true}},system:{id:'dnd5e'},
 actors:{filter:f=>actors.filter(f),find:f=>actors.find(f),get:id=>actors.find(a=>a.id===id)},folders:{find:f=>folders.find(f)},
 journal:{filter:f=>journals.filter(f),find:f=>journals.find(f)},
};
const KEY='rpgb_'+'b'.repeat(64);
let stamp='2026-11-14T10:00:00.000Z',hp=38,info={campaign:{name:'The Salt Road'}},server={};
const sheet=()=>({...example,core:{...example.core,hp:{...example.core.hp,value:hp}}});
globalThis.fetch=async(url,init={})=>{
 requests.push({url,method:init.method??'GET',body:init.body,auth:init.headers?.Authorization});
 const [path,query]=url.replace('https://rpg.example/api/bridge','').split('?');
 const ok=body=>({ok:true,status:200,json:async()=>body});
 if(init.headers?.Authorization!==`Bearer ${KEY}`)return {ok:false,status:401,json:async()=>({error:'This bridge key was revoked or is wrong.'})};
 if(path==='')return ok(info);
 if(server[path.slice(1)])return ok(server[path.slice(1)](new URLSearchParams(query??'').get('since')));
 if(path==='/characters')return ok({characters:[{id:'c1',name:'Maren Ashford',role:'pc',updatedAt:stamp},{id:'c2',name:'Goblin',role:'creature',updatedAt:stamp}]});
 if(path==='/characters/c1')return ok({character:{id:'c1',name:'Maren Ashford',role:'pc',updatedAt:stamp,sheet:sheet()}});
 if(path==='/characters/c1/hp'){hp=JSON.parse(init.body).value;stamp='2026-11-14T11:00:00.000Z';return ok({hp:{value:hp,max:44}});}
 if(path==='/rolls')return ok({posted:true});
 return {ok:false,status:404,json:async()=>({error:'Not found'})};
};
await import('../integrations/foundry/rpg-tools-bridge/scripts/main.mjs');

test('the module runs in a stand-in Foundry: brings the party in, sends HP back, and posts public rolls',async()=>{
 await call('init');
 assert.deepEqual([...settings.keys()],['address','key','who','rolls']);
 settings.set('address','https://rpg.example');settings.set('key',KEY);
 await call('ready');await new Promise(r=>setTimeout(r,50));
 assert.deepEqual(notes.shift(),['info','RPG Tools: connected to The Salt Road.']);
 assert.equal(actors.length,1,'the party only: the goblin stays out');
 const maren=actors[0];
 assert.equal(maren.name,'Maren Ashford');assert.equal(maren.type,'character');assert.equal(maren.folder,folders[0].id);
 assert.equal(maren.system.attributes.hp.value,38);assert.equal(maren.system.attributes.ac.flat,15);
 assert.equal(maren.getFlag('rpg-tools-bridge','id'),'c1');
 assert.ok(requests.every(r=>r.auth===`Bearer ${KEY}`));

 // HP changed at the table goes back once, after the debounce, and the sync doesn't echo it.
 await maren.update({'system.attributes.hp.value':20});
 await new Promise(r=>setTimeout(r,1700));
 const sent=requests.filter(r=>r.url.endsWith('/hp'));
 assert.equal(sent.length,1);assert.deepEqual(JSON.parse(sent[0].body),{value:20,max:44});
 assert.equal(maren.getFlag('rpg-tools-bridge','updatedAt'),stamp,'the new stamp is kept, so the next sync has nothing to bring back');
 const before=requests.length;
 await call('renderActorDirectory',{},null);
 assert.equal(requests.length,before,'no directory, no button, no call');

 // A public roll goes to RPG Tools; a whisper doesn't.
 const roll={formula:'1d20 + 8',total:21,dice:[{results:[{result:13,active:true}]}]};
 await call('createChatMessage',{flavor:'Longbow attack',speaker:{alias:'Maren Ashford'},whisper:[],blind:false,rolls:[roll]});
 await call('createChatMessage',{flavor:'Secret',speaker:{alias:'GM'},whisper:['gm'],blind:false,rolls:[roll]});
 await new Promise(r=>setTimeout(r,20));
 const rolls=requests.filter(r=>r.url.endsWith('/rolls'));
 assert.equal(rolls.length,1);assert.deepEqual(JSON.parse(rolls[0].body),{title:'Maren Ashford · Longbow attack',formula:'1d20+8',total:21,detail:'Rolled 13 in Foundry',who:'Maren Ashford'});

 // The rolls button appears only on linked actors.
 const buttons=[];await call('getActorSheetHeaderButtons',{actor:maren},buttons);
 assert.equal(buttons[0].label,'RPGTB.SheetRolls');
 const none=[];await call('getActorSheetHeaderButtons',{actor:new FakeActor({name:'Other'})},none);assert.equal(none.length,0);
 assert.ok(!notes.some(n=>n[0]!=='info'),JSON.stringify(notes));
});

const T1='2026-11-14T10:00:00.000Z',T2='2026-11-14T12:00:00.000Z';
const ready=d=>({direction:d,ready:true});
const part=(visibility,text)=>({visibility,text});
const grey=(at,tabs)=>({id:'p-grey',kind:'place',title:'Greyhaven',parentId:null,updatedAt:at,overview:part('players','A city by the sea. Ask [[c1|Maren]].\n\n:::secret\nThe lighthouse keeper is a lich.\n:::'),tabs});
test('pages, quests and recaps come in as journals, shared with players only where RPG Tools shares them',async()=>{
 info={campaign:{name:'The Salt Road'},sync:{characters:ready('both'),pages:ready('to'),quests:ready('both'),recaps:ready('to')}};
 server.pages=()=>({ids:['p-grey','p-folder','p-old'],pages:[
  grey(T1,[{id:'t1',title:'Secrets',visibility:'gm',text:'Bribe the keeper.'},{id:'t2',title:'Empty',visibility:'players',text:''}]),
  {id:'p-folder',kind:'folder',title:'Places',parentId:null,updatedAt:T1,overview:part('gm',''),tabs:[]},
  {id:'p-old',kind:'lore',title:'Old lore',parentId:null,updatedAt:T1,overview:part('gm','Forgotten.'),tabs:[]}]});
 server.quests=()=>({ids:['q1'],quests:[{id:'q1',kind:'quest',title:'The green light',parentId:null,updatedAt:T1,overview:part('players','We saw a green light.'),tabs:[],
  quest:{state:'active',stateName:'Active',category:'Main',giver:{id:'c1',title:'Maren Ashford'},place:null,reward:'A ship',rewardHidden:true,prep:'It is the lich.',
   goals:[{id:'g1',text:'Reach the lighthouse',status:'done',hidden:false,note:''},{id:'g2',text:'Destroy the phylactery',status:'todo',hidden:true,note:''}],
   log:[{id:'l1',at:T1,label:'Session 3',text:'We climbed the cliffs.',players:true,author:null},{id:'l2',at:T1,label:'',text:'The keeper lied.',players:false,author:null}]}}]});
 server.recaps=()=>({ids:['s1'],recaps:[{id:'s1',kind:'session',title:'Session 3',parentId:null,updatedAt:T1,overview:part('gm','Draft recap.'),tabs:[],recap:{status:'draft',playedOn:null}}]});
 await options.get('key').onChange();await new Promise(r=>setTimeout(r,50));
 const named=n=>journals.find(j=>j.name===n),page=(j,n)=>j.pages.find(p=>p.name===n);

 const root=folders.find(f=>f.type==='JournalEntry'&&f.flags['rpg-tools-bridge'].root);
 assert.ok(root);assert.deepEqual(folders.filter(f=>f.folder===root.id).map(f=>f.name).sort(),['Lore','Places','Quests','Sessions']);
 assert.equal(journals.length,4,'an empty folder page makes no journal');
 const g=named('Greyhaven');
 assert.equal(g.ownership.default,2,'shared with players');assert.equal(g.folder,folders.find(f=>f.name==='Places').id);
 assert.deepEqual(g.pages.map(p=>[p.name,p.ownership.default]),[['Overview',-1],['Secrets',0]],'the empty tab is left out, the GM tab stays GM only');
 assert.match(page(g,'Overview').text.content,/@UUID\[Actor\.a1\]\{Maren\}/,'a page link points at the actor brought in');
 assert.match(page(g,'Overview').text.content,/<section class="secret"><p>The lighthouse keeper is a lich\.<\/p><\/section>/);
 const q=named('The green light');
 assert.deepEqual(q.pages.map(p=>[p.name,p.ownership.default]),[['Journal',-1],['Goals',-1],['Log',-1],['GM prep',0]]);
 assert.match(page(q,'Goals').text.content,/☑ Reach the lighthouse/);
 assert.match(page(q,'Goals').text.content,/<section class="secret"><ul><li>☐ Destroy the phylactery<\/li><\/ul><\/section>/,'a hidden goal is a secret');
 assert.match(page(q,'Goals').text.content,/<section class="secret"><p><strong>Reward:<\/strong> A ship<\/p><\/section>/);
 assert.match(page(q,'Log').text.content,/<h3>Session 3<\/h3><p>We climbed the cliffs\.<\/p><section class="secret">/);
 assert.equal(named('Session 3').ownership.default,0,'a draft recap stays with the GM');

 // The next sync asks only for what changed, drops what is gone, and updates pages in place.
 const overviewId=page(g,'Overview').id;
 server.pages=since=>{assert.equal(since,T1);return {ids:['p-grey','p-folder'],pages:[grey(T2,[])]};};
 server.quests=()=>({ids:['q1'],quests:[]});server.recaps=()=>({ids:['s1'],recaps:[]});
 await options.get('key').onChange();await new Promise(r=>setTimeout(r,50));
 assert.equal(named('Old lore'),undefined,'a page deleted in RPG Tools is removed');
 assert.deepEqual(g.pages.map(p=>p.name),['Overview']);assert.equal(g.pages[0].id,overviewId);
 assert.equal(g.getFlag('rpg-tools-bridge','updatedAt'),T2);
 assert.equal(journals.length,3);

 // A kind turned off for this key isn't asked for at all.
 info.sync.pages={direction:'off',ready:true};const before=requests.filter(r=>r.url.includes('/pages')).length;
 await options.get('key').onChange();await new Promise(r=>setTimeout(r,50));
 assert.equal(requests.filter(r=>r.url.includes('/pages')).length,before);
 assert.ok(!notes.some(n=>n[0]!=='info'),JSON.stringify(notes));
});
