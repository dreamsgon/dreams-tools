import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// A small stand-in for Foundry, enough to run the module's hooks: settings, actors, folders, notifications and chat.
const example=JSON.parse(readFileSync(new URL('./fixtures/rpgtools-sheet-example.json',import.meta.url),'utf8'));
const hooks=new Map(),on=(n,f)=>{if(!hooks.has(n))hooks.set(n,[]);hooks.get(n).push(f);},call=async(n,...a)=>{for(const f of hooks.get(n)??[])await f(...a);};
const notes=[],settings=new Map(),actors=[],folders=[],requests=[];
const expand=o=>{const out={};for(const [k,v] of Object.entries(o)){const p=k.split('.');let t=out;p.slice(0,-1).forEach(x=>{t=t[x]??={};});t[p.at(-1)]=v&&typeof v==='object'&&!Array.isArray(v)?expand(v):v;}return out;};
const merge=(a,b)=>{for(const [k,v] of Object.entries(b)){if(v&&typeof v==='object'&&!Array.isArray(v)&&a[k]&&typeof a[k]==='object')merge(a[k],v);else a[k]=v;}return a;};
class FakeActor{
 constructor(data){this.id=`a${actors.length+1}`;Object.assign(this,structuredClone(data));}
 getFlag(m,k){return this.flags?.[m]?.[k];}
 async update(d,opts={}){const changes=expand(d);merge(this,structuredClone(changes));await call('updateActor',this,changes,opts,'gm');return this;}
}
globalThis.Hooks={once:on,on};
globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.foundry={utils:{expandObject:expand}};
globalThis.document={addEventListener(){}};globalThis.HTMLElement=class{};
globalThis.setInterval=()=>0;globalThis.clearInterval=()=>{};
globalThis.Actor={TYPES:['base','character','npc'],async create(data){const a=new FakeActor(data);actors.push(a);return a;}};
globalThis.Folder={async create(data){const f={id:`f${folders.length+1}`,...data,getFlag(m,k){return this.flags?.[m]?.[k];}};folders.push(f);return f;}};
globalThis.game={
 settings:{register(m,k,o){settings.set(k,o.default);},get(m,k){return settings.get(k);}},
 i18n:{localize:k=>k},user:{isGM:true,id:'gm'},users:{activeGM:{isSelf:true}},system:{id:'dnd5e'},
 actors:{filter:f=>actors.filter(f),get:id=>actors.find(a=>a.id===id)},folders:{find:f=>folders.find(f)},
};
const KEY='rpgb_'+'b'.repeat(64);
let stamp='2026-11-14T10:00:00.000Z',hp=38;
const sheet=()=>({...example,core:{...example.core,hp:{...example.core.hp,value:hp}}});
globalThis.fetch=async(url,init={})=>{
 requests.push({url,method:init.method??'GET',body:init.body,auth:init.headers?.Authorization});
 const path=url.replace('https://rpg.example/api/bridge','');
 const ok=body=>({ok:true,status:200,json:async()=>body});
 if(init.headers?.Authorization!==`Bearer ${KEY}`)return {ok:false,status:401,json:async()=>({error:'This bridge key was revoked or is wrong.'})};
 if(path==='')return ok({campaign:{name:'The Salt Road'}});
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
