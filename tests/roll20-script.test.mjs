import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// The Roll20 Mod script is one plain file; load it as Roll20 would, then drive its commands with a stand-in Roll20.
const source=readFileSync(new URL('../integrations/roll20/rpg-tools-roll20.js',import.meta.url),'utf8');
const example=JSON.parse(readFileSync(new URL('./fixtures/rpgtools-sheet-example.json',import.meta.url),'utf8'));
// Results cross from the script's own context, so they are copied into this one before comparing.
const plain=v=>v===undefined?v:JSON.parse(JSON.stringify(v));
const pure=(()=>{const m={exports:{}};vm.runInNewContext(source,{module:m});return Object.fromEntries(Object.entries(m.exports).map(([k,f])=>[k,typeof f==='function'?(...a)=>plain(f(...a)):f]));})();
const I=await import('../lib/encyclopedia/sheet-import.ts');

function roll20(){
 const objs=[],handlers={},chat=[];let n=0;
 const make=(type,data)=>{const o={id:`${type}${++n}`,_type:type,data:{...data},async:{},
  get(k,cb){if(cb){setTimeout(()=>cb(this.async[k]??null));return;}return k==='_id'?this.id:this.data[k];},
  set(k,v){const d=typeof k==='object'?k:{[k]:v};for(const [kk,vv] of Object.entries(d))(['bio','gmnotes','notes'].includes(kk)?this.async:this.data)[kk]=vv;},
  remove(){objs.splice(objs.indexOf(this),1);}};objs.push(o);return o;};
 const match=(o,q)=>Object.entries(q).every(([k,v])=>k==='_type'?o._type===v:k==='_characterid'?o.data.characterid===v:o.data[k]===v);
 const ctx={module:{exports:{}},log(){},playerIsGM:id=>id==='gm',
  on(e,f){handlers[e]=f;},sendChat(_who,text){chat.push(text);},
  findObjs:q=>objs.filter(o=>match(o,q)),getObj:(type,id)=>objs.find(o=>o._type===type&&o.id===id),
  createObj:(type,data)=>make(type,data),setDefaultTokenForCharacter(c,t){t.data.defaultFor=c.id;}};
 vm.runInNewContext(source,ctx);
 const run=async(content,selected=[],playerid='gm')=>{handlers['chat:message']({type:'api',content,playerid,who:'Dana (GM)',selected});await new Promise(r=>setTimeout(r,20));};
 return {objs,chat,make,run,find:q=>objs.filter(o=>match(o,q))};
}

test('dice go both ways between RPG Tools and Roll20',()=>{
 assert.equal(pure.toRoll20Formula('5d10 >= 8'),'5d10>8');assert.equal(pure.toRoll20Formula('4d6kh3!'),'4d6kh3!');
 assert.equal(pure.fromRoll20Formula('1d20 + @{dex_mod}[DEX] &{tracker}',n=>({dex_mod:'-1'})[n]),'1d20-1');
 assert.equal(pure.fromRoll20Formula('5d10>8'),'5d10>=8');assert.equal(pure.fromRoll20Formula('2d20k1+3'),'2d20kh1+3');
 assert.equal(pure.fromRoll20Formula('1d20+?{Bonus|0}'),null,'a query is left for the GM');
 assert.equal(pure.fromRoll20Formula('1d20+@{missing}'),null);
});

test('handout notes come back as the JSON that was pasted',()=>{
 const json=pure.parseJson(pure.notesText('<p>Here you go:</p><p>{&quot;format&quot;: &quot;rpgtools-sheet&quot;,<br>&nbsp;&quot;name&quot;: &quot;A &amp; B&quot;}</p><p>```</p>'));
 assert.deepEqual(json,{format:'rpgtools-sheet',name:'A & B'});
 assert.throws(()=>pure.parseJson('no json here'),/no JSON/);
 assert.throws(()=>pure.parseJson('{"name": }'),/can't be read/);
});

test('common monster JSON becomes RPG Tools sheets that RPG Tools itself can read',()=>{
 const open5e={name:'Goblin',size:'Small',type:'humanoid',alignment:'neutral evil',armor_class:15,hit_points:7,speed:{walk:30},strength:8,dexterity:14,constitution:10,intelligence:10,wisdom:8,charisma:8,
  skills:{stealth:6},senses:'darkvision 60 ft., passive Perception 9',languages:'Common, Goblin',challenge_rating:'1/4',
  special_abilities:[{name:'Nimble Escape',desc:'The goblin can take the Disengage or Hide action as a bonus action.'}],
  actions:[{name:'Scimitar',desc:'Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 5 (1d6 + 2) slashing damage.',attack_bonus:4,damage_dice:'1d6',damage_bonus:2}]};
 const srd={name:'Orc',armor_class:[{type:'armor',value:13}],hit_points:15,strength:16,dexterity:12,
  proficiencies:[{value:5,proficiency:{name:'Skill: Intimidation'}},{value:3,proficiency:{name:'Saving Throw: STR'}}],
  actions:[{name:'Greataxe',desc:'Melee Weapon Attack: +5 to hit.',attack_bonus:5,damage:[{damage_dice:'1d12+3',damage_type:{name:'Slashing'}}]}]};
 const tools={monster:[{name:'Kobold',size:['S'],type:'humanoid',ac:[12],hp:{average:5,formula:'2d6-2'},str:7,dex:15,con:9,int:8,wis:7,cha:8,cr:'1/8',
  trait:[{name:'Pack Tactics',entries:['Advantage when an ally is within 5 feet.']}],
  action:[{name:'Dagger',entries:['{@atk mw} {@hit 4} to hit, reach 5 ft. {@h}4 ({@damage 1d4 + 2}) piercing damage.']}]}]};
 const {sheets,skipped}=pure.sheetsIn([open5e,srd,tools,{hello:'world'},example]);
 assert.equal(skipped,1);assert.deepEqual(sheets.map(s=>s.name),['Goblin','Orc','Kobold','Maren Ashford']);
 const [gob,orc,kob]=sheets;
 assert.deepEqual([gob.core.hp,gob.core.ac,gob.core.speed,gob.role,gob.summary,gob.tags],[{value:7,max:7},{value:15},'30 ft','creature','Small humanoid, neutral evil',['CR 1/4']]);
 assert.deepEqual(gob.rolls.find(r=>r.name==='Scimitar'),{name:'Scimitar',group:'attacks',notes:'Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 5 (1d6 + 2) slashing damage.',attack:'1d20+4',damage:'1d6+2'});
 assert.equal(gob.rolls.find(r=>r.name==='Dexterity check').formula,'1d20+2');assert.equal(gob.rolls.find(r=>r.name==='Stealth').formula,'1d20+6');
 assert.equal(gob.lists[0].title,'Traits');
 assert.deepEqual(orc.rolls.find(r=>r.name==='Greataxe'),{name:'Greataxe',group:'attacks',notes:'Melee Weapon Attack: +5 to hit.',attack:'1d20+5',damage:'1d12+3',damageType:'slashing'});
 assert.equal(orc.rolls.find(r=>r.name==='Strength save').formula,'1d20+3');assert.equal(orc.rolls.find(r=>r.name==='Intimidation').formula,'1d20+5');
 assert.deepEqual([kob.core.hp,kob.core.ac,kob.summary],[{value:5,max:5},{value:12},'Small humanoid']);
 assert.deepEqual(kob.rolls.find(r=>r.name==='Dagger'),{name:'Dagger',group:'attacks',notes:'Melee weapon attack: +4 to hit, reach 5 ft. Hit: 4 (1d4 + 2) piercing damage.',attack:'1d20+4',damage:'1d4+2'});
 for(const s of sheets){const r=I.readImport(JSON.stringify(s));assert.ok(r.ok,`${s.name}: ${r.error}`);}
});

test('an RPG Tools sheet goes into Roll20 and comes back out the same',()=>{
 const plan=pure.sheetToRoll20(example);
 const attr=n=>plan.attributes.find(a=>a.name===n);
 assert.deepEqual(attr('hp'),{name:'hp',current:38,max:44});assert.equal(attr('ac').current,15);assert.equal(attr('strength').current,1);
 assert.deepEqual(attr('spell_slots_1st'),{name:'spell_slots_1st',current:3,max:4});
 const bow=plan.abilities.find(a=>a.name==='Longbow');
 assert.equal(bow.action,'&{template:default} {{name=Maren Ashford: Longbow}} {{Attack=[[1d20+8]]}} {{Damage=[[1d8+3]] piercing}} {{Notes=150/600 ft, Archery style}}');
 assert.match(plan.abilities.find(a=>a.name==='Initiative').action,/\[\[1d20\+3 &\{tracker\}\]\]/);
 assert.match(plan.bio,/<h3>Features<\/h3><ul><li><b>Favored foe<\/b> \(2\/2 per long rest\): Marks a creature she hits; the first hit each turn deals an extra Favored foe \(1d4\)\.<\/li>/);
 assert.match(plan.gmnotes,/Languages: Common/);
 const back=pure.roll20ToSheet({name:plan.name,bio:plan.bio,attributes:plan.attributes,abilities:plan.abilities});
 assert.deepEqual(back.core,{hp:{value:38,max:44},ac:{value:15},speed:'30 ft',initiative:{formula:'1d20+3'}});
 assert.deepEqual(back.fields,example.fields);
 assert.deepEqual(back.gauges,example.gauges.map(g=>({label:g.label,value:g.value,max:g.max,shape:g.shape,colour:g.colour})));
 assert.deepEqual(back.rolls.map(r=>[r.name,r.group,r.formula??null,r.attack??null,r.damage??null]),example.rolls.map(r=>[r.name,r.group,r.formula??null,r.attack??null,r.damage??null]));
 assert.equal(back.role,'pc');assert.equal(back.system,'D&D 5e (2014)');
 const r=I.readImport(JSON.stringify(back));assert.ok(r.ok,r.error);
});

test('a character made by hand in Roll20 exports its attributes and readable rolls',()=>{
 const s=pure.roll20ToSheet({name:'Thorn',bio:'<p>A <b>scout</b>.</p>',attributes:[{name:'hp',current:'12',max:'20'},{name:'npc_ac',current:'14'},{name:'dex_mod',current:'3'},{name:'luck',current:'2',max:'3'},{name:'repeating_x_y',current:'1'}],
  abilities:[{name:'Sneak',action:'/r 1d20+@{dex_mod}'},{name:'Bow',action:'&{template:atk} {{rname=Bow}} {{mod=[[1d20+5]]}} {{dmg1=[[1d8+@{dex_mod}]]}}'},{name:'Weird',action:'[[1d20+?{Mod|0}]]'},{name:'Emote',action:'/em waves'}]});
 assert.deepEqual(s.core,{hp:{value:12,max:20},ac:{value:14}});
 assert.deepEqual(s.fields,[{section:'Roll20',label:'Dex Mod',type:'number',value:3}]);assert.deepEqual(s.gauges,[{label:'Luck',value:2,max:3}]);
 assert.deepEqual(s.rolls,[{name:'Bow',group:'attacks',attack:'1d20+5',damage:'1d8+3'}],'/r without [[ ]] is not a roll RPG Tools can find');
 assert.deepEqual(s.unmapped,['Roll20 roll RPG Tools can\'t read: Weird: 1d20+?{Mod|0}']);
 assert.equal(s.notes,'A scout.');
});

test('the Mod script in a stand-in Roll20: GM only, import from a handout, link a token, update in place, export',async()=>{
 const r=roll20();
 await r.run('!rpgtools import',[],'player');
 assert.match(r.chat.pop(),/Only the GM/);
 await r.run('!rpgtools import');
 assert.match(r.chat.pop(),/I made a handout named <i>RPG Tools import<\/i>/);
 const h=r.find({_type:'handout',name:'RPG Tools import'})[0];
 h.async.gmnotes='<p>'+JSON.stringify({monster:[{name:'Kobold',ac:[12],hp:{average:5},dex:15,action:[{name:'Dagger',entries:['{@hit 4} {@damage 1d4 + 2}']}]}]}).replace(/"/g,'&quot;')+'</p>';
 const token=r.make('graphic',{name:'token'});
 await r.run('!rpgtools import',[{_type:'graphic',_id:token.id}]);
 assert.match(r.chat.pop(),/Imported <b>Kobold<\/b> \(new\)\.<br>The selected token now represents Kobold\./);
 const kob=r.find({_type:'character',name:'Kobold'})[0];
 assert.equal(token.data.represents,kob.id);assert.equal(token.data.bar1_value,5);assert.equal(token.data.bar1_link,'','a monster’s HP is its own on each token');assert.equal(token.data.defaultFor,kob.id);
 const abilities=()=>r.find({_type:'ability',_characterid:kob.id}).map(a=>a.data.name).sort();
 assert.deepEqual(abilities(),['Dagger','Dexterity check','Initiative']);
 r.make('ability',{characterid:kob.id,name:'My macro',action:'/em hisses'});
 await r.run('!rpgtools import');
 assert.match(r.chat.pop(),/Kobold<\/b> \(updated\)/);
 assert.equal(r.find({_type:'character'}).length,1);assert.deepEqual(abilities(),['Dagger','Dexterity check','Initiative','My macro'],'its own abilities are replaced, the GM’s stay');

 await r.run('!rpgtools export');
 assert.match(r.chat.pop(),/Select the tokens/);
 await r.run('!rpgtools export',[{_type:'graphic',_id:token.id}]);
 assert.match(r.chat.pop(),/<b>Kobold<\/b> is in the handout <i>RPG Tools export: Kobold<\/i>/);
 const out=r.find({_type:'handout',name:'RPG Tools export: Kobold'})[0];
 const sheet=pure.parseJson(pure.notesText(out.async.notes));
 assert.equal(sheet.format,'rpgtools-sheet');assert.equal(sheet.name,'Kobold');assert.deepEqual(sheet.core.hp,{value:5,max:5});
 assert.deepEqual(sheet.rolls.find(x=>x.name==='Dagger'),{name:'Dagger',group:'attacks',attack:'1d20+4',damage:'1d4+2',notes:'+4 1d4 + 2'});
 assert.ok(I.readImport(pure.notesText(out.async.notes)).ok);
 await r.run('!rpgtools');assert.match(r.chat.pop(),/RPG Tools for Roll20/);
});
