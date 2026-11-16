import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

// The RPG Tools Dice Link extension (integrations/roll20/dice-link) and the app's side of it (lib/roll-link.ts).
const dir=new URL('../integrations/roll20/dice-link/',import.meta.url);
const src=name=>readFileSync(new URL(name,dir),'utf8');
const plain=v=>v===undefined||v===null?v:JSON.parse(JSON.stringify(v));
const L=(()=>{const m={exports:{}};vm.runInNewContext(src('core.js'),{module:m});return Object.fromEntries(Object.entries(m.exports).map(([k,f])=>[k,typeof f==='function'?(...a)=>plain(f(...a)):f]));})();

// A stand-in browser: window events, localStorage, and the extension API with tabs.
const store=new Map();
globalThis.window=new EventTarget();
window.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const Log=await import('../lib/local-roll-log.ts');
const Link=await import('../lib/roll-link.ts');
const {diceLinkZip,diceLinkManifest,siteMatch,DICE_LINK_FILES}=await import('../lib/bridge/dice-link.ts');

function extensionApi(tabs){
 const listeners=[],sent=[];
 return {sent,listeners,api:{
  runtime:{getManifest:()=>JSON.parse(diceLinkManifest(src('manifest.json'),'https://rpg.example')),onMessage:{addListener:f=>listeners.push(f)},sendMessage:async m=>{sent.push(m);}},
  tabs:{query:async q=>tabs.filter(t=>q.url==='https://app.roll20.net/editor*'?t.url.startsWith('https://app.roll20.net/editor'):t.url.startsWith('https://rpg.example/')),sendMessage:async(id,m)=>{sent.push({to:id,...m});}},
 }};
}

test('RPG Tools rolls as Roll20 chat: the RPG Tools result by default, or Roll20 dice',()=>{
 const roll={label:'Maren · Longbow attack',total:21,breakdown:'1d20 (13) + 8',formula:'1d20+8',outcome:'Hit'};
 assert.equal(L.chatFor(roll,'result'),'&{template:default} {{name=Maren · Longbow attack}} {{Result=21}} {{Dice=1d20 (13) + 8}} {{Outcome=Hit}} {{via=RPG Tools}}');
 assert.equal(L.chatFor({...roll,formula:'5d10 >= 8',outcome:undefined},'reroll'),'&{template:default} {{name=Maren · Longbow attack}} {{Roll=[[5d10>8]]}} {{via=RPG Tools}}');
 assert.equal(L.chatFor({label:'No formula',total:3},'reroll'),'&{template:default} {{name=No formula}} {{Result=3}} {{via=RPG Tools}}','without a formula it shows the result');
 assert.equal(L.chatFor({label:'{{name=x}} [[1d100]]',total:1,breakdown:'a\nb'},'result'),'&{template:default} {{name=name=x 1d100}} {{Result=1}} {{Dice=a b}} {{via=RPG Tools}}','text can’t break the template or roll');
});

test('Roll20 chat rolls for RPG Tools: inline rolls, /r rolls, and never its own or whispered ones',()=>{
 assert.deepEqual(L.parseInlineTitle('Rolling 1d20+5[DEX] = (<span class="basicdiceroll">12</span>)+5'),{formula:'1d20+5[DEX]',detail:'(12)+5'});
 const attack={who:'Thorn:',name:'Shortbow',text:'ShortbowAttack17Damage6',rolls:[{label:'Attack',title:'Rolling 1d20+5 = (12)+5',total:'17'},{label:'Damage',title:'Rolling 1d6+3 = (3)+3',total:'6'}]};
 assert.deepEqual(L.rollFromChat(attack),{title:'Shortbow',total:17,formula:'1d20+5',detail:'Attack 17 (1d20+5) · Damage 6 (1d6+3)',who:'Thorn'});
 assert.deepEqual(L.rollFromChat({who:'Dana',text:'rolling 4d6k3',rolls:[{formula:'4d6k3',total:' 14 '}]}),{title:'Roll',total:14,formula:'4d6kh3',who:'Dana'});
 assert.equal(L.rollFromChat({...attack,whisper:true}),null);
 assert.equal(L.rollFromChat({...attack,text:'Longbow attackResult21viaRPG Tools'}),null,'a roll this extension typed doesn’t come back');
 assert.equal(L.rollFromChat({who:'Dana',text:'hello',rolls:[]}),null);
 assert.equal(L.fromRoll20Formula('1d20+@{dex}'),'','an attribute isn’t plain dice');
});

test('the app announces each roll, and logs a Roll20 roll once without sending it back',()=>{
 const announced=[];window.addEventListener('rpgtools:roll',e=>announced.push(JSON.parse(e.detail)));
 Log.recordLocalRoll({label:'Perception',total:15,breakdown:'1d20 (10) + 5',formula:'1d20+5'});
 assert.deepEqual(announced.pop(),{label:'Perception',total:15,breakdown:'1d20 (10) + 5',formula:'1d20+5'});
 assert.equal(Link.readExternalRoll('{"total":"x"}'),null);assert.equal(Link.readExternalRoll('not json'),null);
 assert.deepEqual(Link.readExternalRoll({title:'  Shortbow ',total:17,who:'Thorn',formula:'1d20+5',extra:'ignored'}),{title:'Shortbow',total:17,formula:'1d20+5',who:'Thorn'});
 const stop=Link.listenForLinkedRolls();
 window.dispatchEvent(new CustomEvent('rpgtools:external-roll',{detail:JSON.stringify({title:'Shortbow',total:17,formula:'1d20+5',detail:'Attack 17 · Damage 6',who:'Thorn'})}));
 stop();
 window.dispatchEvent(new CustomEvent('rpgtools:external-roll',{detail:JSON.stringify({title:'After stop',total:1})}));
 const log=Log.readLocalRollLog();
 assert.deepEqual([log[0].label,log[0].total,log[0].breakdown,log[0].outcome],['Thorn · Shortbow',17,'1d20+5 · Attack 17 · Damage 6','From Roll20']);
 assert.equal(log.length,2);
 assert.equal(announced.pop().source,'roll20','marked, so the extension doesn’t send it back to Roll20');
});

test('the extension passes rolls between tabs: to every Roll20 game, and to one RPG Tools tab',async()=>{
 const tabs=[{id:1,url:'https://app.roll20.net/editor/'},{id:2,url:'https://rpg.example/encyclopedia',active:false,lastAccessed:5},{id:3,url:'https://rpg.example/maptable',active:true},{id:4,url:'https://example.com/'}];
 const {api,listeners,sent}=extensionApi(tabs);
 vm.runInNewContext(src('background.js'),{chrome:api,Promise});
 const fire=m=>{let answer;const async=listeners[0](m,{},a=>{answer=a;});return {async,answer:()=>answer};};
 fire({type:'rpgtools-roll',roll:{label:'Perception',total:15}});await new Promise(r=>setTimeout(r,5));
 assert.deepEqual(plain(sent.splice(0)),[{to:1,type:'to-roll20',roll:{label:'Perception',total:15}}]);
 fire({type:'from-roll20',roll:{title:'Shortbow',total:17}});await new Promise(r=>setTimeout(r,5));
 assert.deepEqual(plain(sent.splice(0)),[{to:3,type:'to-rpgtools',roll:{title:'Shortbow',total:17}}],'the active RPG Tools tab only, so it is logged once');
 const s=fire({type:'status'});assert.equal(s.async,true);await new Promise(r=>setTimeout(r,5));
 assert.deepEqual(plain(s.answer()),{roll20:1,rpgTools:2,site:'https://rpg.example'});

 // On the RPG Tools page: rolls go out, Roll20 rolls come in, and a roll from Roll20 is never sent back.
 const page=extensionApi(tabs),win=new EventTarget(),doc={documentElement:{dataset:{}}};
 vm.runInNewContext(src('rpgtools.js'),{chrome:page.api,window:win,document:doc,CustomEvent,JSON,Promise});
 assert.equal(doc.documentElement.dataset.rpgtoolsDiceLink,'0.1.0');
 win.dispatchEvent(new CustomEvent('rpgtools:roll',{detail:JSON.stringify({label:'Stealth',total:9})}));
 win.dispatchEvent(new CustomEvent('rpgtools:roll',{detail:JSON.stringify({label:'Thorn · Shortbow',total:17,source:'roll20'})}));
 assert.deepEqual(plain(page.sent),[{type:'rpgtools-roll',roll:{label:'Stealth',total:9}}]);
 let got=null;win.addEventListener('rpgtools:external-roll',e=>{got=JSON.parse(e.detail);});
 page.listeners[0]({type:'to-rpgtools',roll:{title:'Shortbow',total:17}});
 assert.deepEqual(got,{title:'Shortbow',total:17});
});

test('the extension download is made for this site and opens as one folder',async()=>{
 assert.equal(siteMatch('http://localhost:3000'),'http://localhost/*','browsers match any port');
 const m=JSON.parse(diceLinkManifest(src('manifest.json'),'https://rpg.example'));
 assert.deepEqual(m.content_scripts.map(c=>c.matches[0]),['https://app.roll20.net/editor*','https://rpg.example/*']);
 assert.deepEqual(m.host_permissions,['https://app.roll20.net/*','https://rpg.example/*']);
 assert.equal(m.manifest_version,3);assert.deepEqual(m.permissions,['storage'],'no tabs, history or cookies');
 for(const c of m.content_scripts)for(const f of c.js)assert.ok(DICE_LINK_FILES.includes(f),f);
 const zip=await diceLinkZip('https://rpg.example'),file=path.join(mkdtempSync(path.join(tmpdir(),'dice-link-')),'x.zip');writeFileSync(file,zip);
 let listing;try{listing=execFileSync('unzip',['-l',file],{encoding:'utf8'});}catch{listing=null;}
 if(listing){for(const f of DICE_LINK_FILES)assert.match(listing,new RegExp(`rpg-tools-dice-link/${f.replace('.','\\.')}`));assert.match(execFileSync('unzip',['-p',file,'rpg-tools-dice-link/manifest.json'],{encoding:'utf8'}),/https:\/\/rpg\.example\/\*/);}
});
