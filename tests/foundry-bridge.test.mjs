import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
const F=await import('../integrations/foundry/rpg-tools-bridge/scripts/core.mjs');
const {bridgeRoll}=await import('../lib/bridge/api.ts');
const {zipFiles,crc32}=await import('../lib/bridge/zip.ts');
const {manifestFor,FOUNDRY_FILES}=await import('../lib/bridge/foundry-module.ts');
const {parseDice}=await import('../lib/rolls.ts');

const example=()=>JSON.parse(readFileSync(new URL('./fixtures/rpgtools-sheet-example.json',import.meta.url),'utf8'));
const character=(extra={})=>({id:'c1',name:'Maren Ashford',role:'pc',updatedAt:'2026-11-14T10:00:00.000Z',sheet:example(),...extra});

test('dice go both ways between RPG Tools and Foundry',()=>{
 for(const [ours,theirs] of [['1d20+5','1d20+5'],['4d6kh3','4d6kh3'],['2d20kl1','2d20kl1'],['1d6!','1d6x'],['5d10>=8','5d10cs>=8'],['2d20<=14','2d20cs<=14'],['4dF','4dF'],['2d6+1d4-1','2d6+1d4-1']]){
  assert.equal(F.toFoundryFormula(ours),theirs,ours);
  assert.equal(F.fromFoundryFormula(theirs),ours.toLowerCase(),theirs);
 }
 assert.equal(F.fromFoundryFormula('1d20 + 5[Proficiency] + 2'),'1d20+5+2','flavor tags and spaces are dropped');
 assert.equal(F.fromFoundryFormula('2d20k1'),'2d20kh1');
 assert.equal(F.fromFoundryFormula('1d20r1'),null,'rerolls RPG Tools can’t show');
 assert.equal(F.fromFoundryFormula('1d20+@abilities.str.mod'),null);
 assert.equal(F.fromFoundryFormula('5'),null,'no dice, no roll');
 for(const f of ['1d20+5+2','1d6!','5d10>=8','2d20kh1','4df'])assert.doesNotThrow(()=>parseDice(f),f);
});

test('a character becomes D&D 5e actor data with HP, AC, biography and the sheet in flags',()=>{
 const d=F.actorData(character(),'dnd5e');
 assert.equal(d.name,'Maren Ashford');
 assert.equal(d['system.attributes.hp.value'],38);assert.equal(d['system.attributes.hp.max'],44);
 assert.equal(d['system.attributes.ac.flat'],15);assert.equal(d['system.attributes.ac.calc'],'flat');
 assert.match(d['system.details.biography.value'],/^<p>Grew up in a toll-keeper/);
 assert.deepEqual(Object.keys(d['flags.rpg-tools-bridge']),['id','updatedAt','role','sheet']);
 const pf=F.actorData(character(),'pf2e');
 assert.equal(pf['system.attributes.hp.value'],38);assert.ok(!('system.attributes.hp.max' in pf),'Pathfinder works out its own maximum');
 const other=F.actorData(character(),'blades');
 assert.deepEqual(Object.keys(other),['name','flags.rpg-tools-bridge'],'other systems get the actor and its rolls only');
 assert.equal(F.actorType('pc',['base','character','npc','vehicle']),'character');
 assert.equal(F.actorType('creature',['character','npc']),'npc');
 assert.equal(F.actorType('npc',['character']),'character');
 assert.equal(F.actorType('pc',['pc','threat']),'pc');
});

test('HP changes are read from an actor update, and only when HP changed',()=>{
 const actor={system:{attributes:{hp:{value:20,max:44}}}};
 assert.deepEqual(F.hpChange({system:{attributes:{hp:{value:12}}}},actor,'dnd5e'),{value:12,max:44});
 assert.deepEqual(F.hpChange({system:{attributes:{hp:{max:50}}}},actor,'dnd5e'),{value:20,max:50});
 assert.equal(F.hpChange({name:'Renamed'},actor,'dnd5e'),null);
 assert.deepEqual(F.hpChange({system:{attributes:{hp:{value:7}}}},actor,'pf2e'),{value:7});
 assert.equal(F.hpChange({system:{attributes:{hp:{value:7}}}},actor,'blades'),null);
});

test('the rolls window lists the sheet’s rolls as Foundry formulas, attacks with both buttons',()=>{
 const groups=F.sheetRolls(example());
 assert.deepEqual(groups.map(g=>g.title),['Skills','Saves','Attacks','Spells']);
 assert.deepEqual(groups[0].rows[0],{name:'Initiative',buttons:[{label:'Initiative',formula:'1d20+3'}]});
 const bow=groups.find(g=>g.title==='Attacks').rows.find(r=>r.name==='Longbow');
 assert.deepEqual(bow.buttons,[{label:'Attack',formula:'1d20+8'},{label:'Damage',formula:'1d8+3'}]);
 assert.deepEqual(F.sheetRolls({}),[]);
});

test('chat rolls become RPG Tools rolls; whispered, blind and unreadable ones stay in Foundry',()=>{
 const msg=(x={})=>({flavor:'<span>Longbow</span> attack',speaker:{alias:'Maren Ashford'},whisper:[],blind:false,rolls:[{formula:'1d20 + 8',total:23,dice:[{results:[{result:15,active:true}]}]}],...x});
 const r=F.rollFromMessage(msg());
 assert.deepEqual(r,{title:'Maren Ashford · Longbow attack',formula:'1d20+8',total:23,detail:'Rolled 15 in Foundry',who:'Maren Ashford'});
 assert.doesNotThrow(()=>bridgeRoll(r),'the server takes what the module sends');
 assert.equal(F.rollFromMessage(msg({whisper:['gm']})),null);
 assert.equal(F.rollFromMessage(msg({blind:true})),null);
 assert.equal(F.rollFromMessage(msg({rolls:[]})),null);
 assert.equal(F.rollFromMessage(msg({rolls:[{formula:'1d20r1',total:4}]})),null);
 assert.deepEqual(F.rollFromMessage(msg({speaker:{},flavor:''})).title,'Roll');
 const kept=F.rollFromMessage(msg({rolls:[{formula:'2d20kh1',total:17,dice:[{results:[{result:17,active:true},{result:3,active:false}]}]}]}));
 assert.equal(kept.detail,'Rolled 17 in Foundry','dropped dice aren’t listed');
});

test('the server checks rolls from a table before they go to Discord',()=>{
 assert.deepEqual(bridgeRoll({title:'Mara · Stealth',formula:'1d20 + 6',total:14}),{kind:'roll',title:'Mara · Stealth',formula:'1d20+6',total:14,detail:''});
 assert.throws(()=>bridgeRoll({title:'x',formula:'1d20r1',total:3}),e=>e.status===400&&/isn’t dice/.test(e.message));
 assert.throws(()=>bridgeRoll({title:'',formula:'1d20',total:3}),e=>e.status===400);
 assert.throws(()=>bridgeRoll({title:'x',formula:'1d20',total:'lots'}),e=>e.status===400);
});

test('only new characters and ones changed in RPG Tools are fetched; the party by default',()=>{
 const list=[{id:'a',role:'pc',updatedAt:'1'},{id:'b',role:'pc',updatedAt:'2'},{id:'c',role:'npc',updatedAt:'1'},{id:'d',role:'companion',updatedAt:'1'}];
 const known=new Map([['a','1'],['b','1']]);
 assert.deepEqual(F.charactersToFetch(list,known),['b','d']);
 assert.deepEqual(F.charactersToFetch(list,known,'all'),['b','c','d']);
});

test('the client sends the key as a header and reports the server’s own words',async()=>{
 const calls=[];
 const fetch=async(url,init)=>{calls.push({url,init});return url.endsWith('/hp')?{ok:false,status:409,json:async()=>({error:'HP comes from a Google Sheet.'})}:{ok:true,status:200,json:async()=>({campaign:{name:'The Salt Road'}})};};
 const key='rpgb_'+'a'.repeat(64);
 const c=new F.BridgeClient('https://rpg.example/',key,fetch);
 assert.equal(c.base,'https://rpg.example/api/bridge','a bare site address gets the bridge path');
 assert.equal((await c.info()).campaign.name,'The Salt Road');
 assert.equal(calls[0].init.headers.Authorization,`Bearer ${key}`);
 await assert.rejects(c.hp('x',{value:3}),e=>e.status===409&&e.message==='HP comes from a Google Sheet.');
 assert.equal(calls[1].init.method,'POST');assert.equal(calls[1].init.body,'{"value":3}');
 assert.equal(new F.BridgeClient('https://rpg.example/api/bridge',key).base,'https://rpg.example/api/bridge');
 assert.equal(new F.BridgeClient('','x').ready,false);
 await assert.rejects(new F.BridgeClient('','x',fetch).info(),/settings first/);
});

test('page text becomes simple HTML with Foundry inline rolls, never raw HTML',()=>{
 assert.equal(F.markdownToHtml('Hit **hard**: [[5d10>=8|Pool]] and [[demo-mara|Mara]] <b>x</b>\n- one [[1d6!]]\n- *two*'),
  '<p>Hit <strong>hard</strong>: [[/r 5d10cs>=8]]{Pool} and Mara &lt;b&gt;x&lt;/b&gt;</p><ul><li>one [[/r 1d6x]]</li><li><em>two</em></li></ul>');
 assert.equal(F.markdownToHtml('## Notes\n\n[[x|<img src=x onerror=alert(1)>]]'),'<h3>Notes</h3><p>&lt;img src=x onerror=alert(1)&gt;</p>');
});

test('the module zip opens with module.json at the top and the manifest pointing at this site',()=>{
 const raw=readFileSync(new URL('../integrations/foundry/rpg-tools-bridge/module.json',import.meta.url),'utf8');
 const m=manifestFor(raw,'https://rpg.example');
 assert.equal(m.id,'rpg-tools-bridge');assert.equal(m.manifest,'https://rpg.example/api/bridge/foundry/module.json');assert.equal(m.download,'https://rpg.example/api/bridge/foundry/rpg-tools-bridge.zip');
 assert.deepEqual(m.esmodules,['scripts/main.mjs']);
 for(const f of FOUNDRY_FILES)assert.ok(readFileSync(new URL(`../integrations/foundry/rpg-tools-bridge/${f}`,import.meta.url)).length>0,f);
 assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
 const enc=new TextEncoder(),zip=zipFiles([{name:'module.json',data:enc.encode(JSON.stringify(m))},{name:'scripts/core.mjs',data:enc.encode('export {};\n')}]);
 const dir=mkdtempSync(path.join(tmpdir(),'rpgtb-')),file=path.join(dir,'m.zip');writeFileSync(file,zip);
 let listing;try{listing=execFileSync('unzip',['-l',file],{encoding:'utf8'});}catch{listing=null;}
 if(listing){assert.match(listing,/module\.json/);assert.match(listing,/scripts\/core\.mjs/);assert.equal(execFileSync('unzip',['-p',file,'module.json'],{encoding:'utf8'}),JSON.stringify(m));}
 else{assert.equal(new DataView(zip.buffer).getUint32(0,true),0x04034b50);}
});
