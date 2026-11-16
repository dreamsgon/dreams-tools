import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {demoWorkspace,workspaceSchema,playerCampaign}=await import('../lib/encyclopedia/world-model.ts');
const I=await import('../lib/encyclopedia/sheet-import.ts');
const {sheetRollGroups}=await import('../lib/encyclopedia/sheet-rolls.ts');
const {playerSheet,sheetLayout}=await import('../lib/encyclopedia/sheet-link.ts');

const C='demo-campaign',AT='2026-11-14T10:00:00.000Z';
let n=0;const ids=()=>`id${++n}`;
const example=()=>JSON.parse(readFileSync(new URL('./fixtures/rpgtools-sheet-example.json',import.meta.url),'utf8'));
function world(fields=[]){
 const w=demoWorkspace();
 return workspaceSchema.parse({...w,campaigns:w.campaigns.map(c=>c.id===C?{...c,statFields:fields}:c)});
}
const field=(id,label,section,type='number',extra={})=>({id,label,section,type,options:[],visibility:'players',archived:false,...extra});
const read=obj=>{const r=I.readImport(typeof obj==='string'?obj:JSON.stringify(obj));assert.ok(r.ok,r.error);return r.file;};

test('a reply with chatter and a code fence around the JSON is read',()=>{
 const r=I.readImport('Here is the sheet:\n\n```json\n'+JSON.stringify(example(),null,2)+'\n```\nLet me know if you need changes!');
 assert.ok(r.ok);assert.equal(r.file.name,'Maren Ashford');assert.equal(r.file.fields.length,11);
});

test('unreadable replies explain how to fix them',()=>{
 assert.match(I.readImport('').error,/Paste the reply/);
 assert.match(I.readImport('Sorry, I cannot read that PDF.').error,/no JSON/);
 assert.match(I.readImport('{"format":"rpgtools-sheet","version":1,"name":"Cut off"').error,/no JSON|complete JSON/);
 assert.match(I.readImport('{"name":"Other app"}').error,/isn’t an RPG Tools sheet/);
 assert.match(I.readImport('{"format":"rpgtools-sheet","version":2,"name":"X"}').error,/version 1/);
 assert.match(I.readImport('{"format":"rpgtools-sheet","version":1,"name":""}').error,/no name/);
});

test('AI quirks are tolerated: numbers as text, long text, unknown keys and bad enums',()=>{
 const f=read({format:'rpgtools-sheet',version:'1',name:'  Quirk '+'x'.repeat(300),extra:true,role:'villain',
  core:{hp:{value:'12',max:'20'},ac:{value:14.6}},fields:[{label:'Grit',type:'stat',value:'3'}],gauges:[{label:'Luck',value:'2',max:3,shape:'dots',colour:'pink'}]});
 assert.equal(f.name.length,160);assert.equal(f.role,'pc');assert.equal(f.core.hp.value,12);assert.equal(f.core.ac.value,15);
 assert.equal(f.fields[0].type,'text');assert.equal(f.gauges[0].shape,'bar');assert.equal(f.gauges[0].colour,'purple');
});

test('fields line up with the stat form by name, ignoring case and punctuation',()=>{
 const form=[field('str','Strength','Abilities','number',{roll:'d20'}),field('lvl','Level','Details'),field('old','Class','Details','text',{archived:true})];
 const plan=I.planFields(read(example()),form);
 const by=Object.fromEntries(plan.map(p=>[p.label,p]));
 assert.equal(by.Strength.action,'match');assert.equal(by.Strength.matchId,'str');
 assert.equal(by.Level.matchId,'lvl');
 assert.equal(by.Class.action,'new','an archived field is not matched');
 assert.equal(by['Passive Perception'].action,'new');
 assert.deepEqual(by.Dexterity.roll,{roll:'d20'});
});

test('the prompt names the system and the campaign form so the AI reuses its labels',()=>{
 const p=I.importPrompt({system:'Blades in the Dark',form:[field('a','Hunt','Actions','number',{roll:'custom',rollFormula:'{value}d6kh1'}),field('b','Vice','Details','select',{options:['Gambling','Pleasure']}),field('c','Gone','X','text',{archived:true})]});
 assert.match(p,/Game system: Blades in the Dark/);
 assert.match(p,/- Actions: Hunt \(number, rolls \{value\}d6kh1\)/);
 assert.match(p,/- Details: Vice \(choice: Gambling \/ Pleasure\)/);
 assert.doesNotMatch(p,/Gone/);
 assert.match(I.importPrompt({}),/no fields yet/);
});

test('field rolls map onto the stat form, and only dice the roller understands are kept',()=>{
 assert.deepEqual(I.fieldRollOf({type:'number',roll:'d20'}),{roll:'d20'});
 assert.deepEqual(I.fieldRollOf({type:'text',roll:'self'}),{roll:'formula'});
 assert.deepEqual(I.fieldRollOf({type:'number',roll:'1d100 <= {value}'}),{roll:'custom',rollFormula:'1d100<={value}'});
 assert.equal(I.fieldRollOf({type:'number',roll:'1d20+@str'}),null);
 assert.equal(I.fieldRollOf({type:'checkbox',roll:'d20'}),null);
 assert.equal(I.cleanFormula('2d6 + 3'),'2d6+3');
 assert.equal(I.cleanFormula('1d20+DEX'),null);
 assert.equal(I.cleanFormula('15'),null);
});

test('a new character gets fields, trackers, a rollable sheet, tabs, traits and a GM note',()=>{
 n=0;
 const s=world([field('str','Strength','Abilities','number',{roll:'d20'})]);
 const r=I.applyImport(s,read(example()),{kind:'new',worldId:'demo-world',campaignId:C},{},{now:AT,newId:ids});
 const ws=workspaceSchema.parse(r.workspace),e=ws.entries.find(x=>x.id===r.entryId),c=ws.campaigns.find(x=>x.id===C);
 assert.equal(e.title,'Maren Ashford');assert.equal(e.kind,'character');assert.equal(e.campaignId,C);
 assert.equal(e.character.role,'pc');assert.equal(e.character.statsVisibility,'players');
 assert.equal(r.matched,1);assert.equal(r.added,10);
 assert.equal(c.statFields.length,11);assert.equal(c.statFields[0].id,'str','the existing field is reused');
 const vals=e.character.statsByCampaign[C];
 assert.equal(vals.str,1);
 const dark=c.statFields.find(f=>f.label==='Darkvision');assert.equal(dark.type,'text');assert.equal(vals[dark.id],'60 ft');
 assert.deepEqual(e.character.trackers.map(t=>[t.label,t.shape,t.value,t.max,t.colour]),[['Spell slots, 1st','pips',3,4,'blue'],['Spell slots, 2nd','pips',2,2,'blue'],['Hit dice (d10)','pips',4,5,'amber']]);
 const sheet=e.character.sheet;assert.equal(sheet.source,'import');assert.equal(sheet.title,'D&D 5e (2014) sheet');
 const lay=sheetLayout(sheet.items);assert.deepEqual(lay.tiles.map(t=>[t.kind,t.value,t.max??null]),[['hp','38','44'],['ac','15',null],['init','+3',null]]);
 const groups=Object.fromEntries(sheetRollGroups(playerSheet(sheet)).map(g=>[g.title,g.rows.map(r=>r.name+':'+r.buttons.map(b=>b.label+'='+b.formula).join('|'))]));
 assert.ok(groups.Attacks.includes('Longbow:Attack=1d20+8|Damage=1d8+3'));
 assert.ok(groups.Saves.some(x=>x.startsWith('Dexterity save:')));
 assert.ok(groups.Skills.some(x=>x.startsWith('Stealth:')));
 assert.deepEqual(e.tabs.map(t=>[t.title,t.visibility]),[['Features','players'],['Not imported','gm']]);
 assert.match(e.tabs[0].body,/\*\*Favored foe\*\* \(2\/2 per long rest\): .*\[\[1d4\|Favored foe\]\]/);
 assert.match(e.tabs[1].body,/Languages/);
 // The Inventory list fills the Inventory tab.
 assert.equal(e.character.inventory.visibility,'players');
 assert.deepEqual(e.character.inventory.items.map(i=>[i.name,i.qty,!!i.equipped]),[['Longbow',1,true],['Arrows',34,false],['Potion of healing',2,false]]);
 assert.equal(e.character.inventory.items[2].note,'Drink to regain [[2d4+2|Healing]] HP.');
 assert.deepEqual(e.profile.traits.map(t=>t.label),['Stubborn','Loyal','Quiet']);
 assert.match(e.body,/Level 5 half-elf ranger/);
 assert.deepEqual(r.warnings,[]);
});

test('an update changes only what the file has, keeps other tabs and trackers, and skips fields on request',()=>{
 n=0;
 const s=world();
 const first=I.applyImport(s,read(example()),{kind:'new',worldId:'demo-world',campaignId:C},{},{now:AT,newId:ids});
 let w=first.workspace;const id=first.entryId;
 w={...w,entries:w.entries.map(e=>e.id===id?{...e,tabs:[...e.tabs,{id:'mine',title:'Backstory',body:'Mine',visibility:'gm'}],character:{...e.character,trackers:[...e.character.trackers,{id:'own',label:'Inspiration',shape:'pips',colour:'green',max:1,value:1}]}}:e)};
 const next=example();next.core.hp.value=20;next.gauges[0].value=0;next.fields=next.fields.filter(f=>f.label!=='Darkvision');next.fields.find(f=>f.label==='Level').value=6;next.lists=[next.lists[1]];next.unmapped=[];
 const r=I.applyImport(w,read(next),{kind:'update',entryId:id,campaignId:C},{Strength:'skip'},{now:AT,newId:ids});
 const ws=workspaceSchema.parse(r.workspace),e=ws.entries.find(x=>x.id===id),c=ws.campaigns.find(x=>x.id===C),vals=e.character.statsByCampaign[C];
 assert.equal(ws.entries.filter(x=>x.title==='Maren Ashford').length,1,'no second page');
 const lvl=c.statFields.find(f=>f.label==='Level'),str=c.statFields.find(f=>f.label==='Strength'),dv=c.statFields.find(f=>f.label==='Darkvision');
 assert.equal(c.statFields.length,11,'no duplicate fields');
 assert.equal(vals[lvl.id],6);assert.equal(vals[str.id],1,'a skipped field keeps its value');assert.equal(vals[dv.id],'60 ft','a field the file leaves out keeps its value');
 assert.equal(sheetLayout(e.character.sheet.items).tiles[0].value,'20');
 const t=e.character.trackers;assert.equal(t.length,4);assert.equal(t[0].value,0);assert.equal(t[0].id,first.workspace.entries.find(x=>x.id===id).character.trackers[0].id,'trackers keep their ids');
 assert.ok(t.some(x=>x.label==='Inspiration'));
 assert.deepEqual(e.tabs.map(x=>x.title),['Features','Not imported','Backstory'],'tabs the file leaves out stay');
 assert.equal(e.character.inventory.items.length,3,'the inventory the file leaves out stays');
});

test('values that don’t fit and dice the roller can’t read are left out with a warning',()=>{
 n=0;
 const f=read({format:'rpgtools-sheet',version:1,name:'Odd',fields:[{label:'Might',type:'number',value:'lots'},{label:'Vice',type:'choice',options:['Gambling','Pleasure'],value:'pleasure'},{label:'Brave',type:'checkbox',value:'yes'}],
  core:{initiative:{formula:'1d20+DEX'}},rolls:[{name:'Bite',group:'attacks',attack:'1d20+5',damage:'2d6+STR'},{name:'Notice',formula:'2d6'}],gauges:[{label:'Ammo',value:250,max:300,shape:'pips'}]});
 const r=I.applyImport(world(),f,{kind:'new',worldId:'demo-world',campaignId:C},{},{now:AT,newId:ids});
 const ws=workspaceSchema.parse(r.workspace),e=ws.entries.find(x=>x.id===r.entryId),c=ws.campaigns.find(x=>x.id===C),vals=e.character.statsByCampaign[C];
 const lab=l=>c.statFields.find(x=>x.label===l).id;
 assert.equal(vals[lab('Might')],undefined);assert.equal(vals[lab('Vice')],'Pleasure');assert.equal(vals[lab('Brave')],true);
 assert.equal(r.warnings.length,3);assert.match(r.warnings.join('\n'),/Might/);assert.match(r.warnings.join('\n'),/Initiative/);assert.match(r.warnings.join('\n'),/2d6\+STR/);
 assert.deepEqual(e.character.trackers.map(t=>[t.shape,t.max,t.value]),[['bar',300,250]],'pips over 20 become a bar');
 assert.deepEqual(e.character.sheet.items.map(i=>i.name),['Bite attack','Notice']);
});

test('an NPC import is GM-only, and a linked Google Sheet is never replaced',()=>{
 n=0;
 const file=read({...example(),role:'npc'});
 const r=I.applyImport(world(),file,{kind:'new',worldId:'demo-world',campaignId:C},{},{now:AT,newId:ids});
 const e=r.workspace.entries.find(x=>x.id===r.entryId),c=r.workspace.campaigns.find(x=>x.id===C);
 assert.equal(e.character.statsVisibility,'gm');assert.ok(c.statFields.every(f=>f.visibility==='gm'));assert.ok(e.tabs.every(t=>t.visibility==='gm'));assert.ok(e.character.trackers.every(t=>t.gm));
 const linked={source:'published',publishedUrl:'https://docs.google.com/spreadsheets/d/e/2PACX-abcdefghijklmnop/pubhtml',title:'Real sheet',mode:'cells',items:[{id:'a',name:'HP',cell:'B2',kind:'hp',value:'9'}]};
 const w={...r.workspace,entries:r.workspace.entries.map(x=>x.id===e.id?{...x,character:{...x.character,sheet:linked}}:x)};
 const u=I.applyImport(workspaceSchema.parse(w),file,{kind:'update',entryId:e.id,campaignId:C},{},{now:AT,newId:ids});
 assert.equal(u.workspace.entries.find(x=>x.id===e.id).character.sheet.title,'Real sheet');assert.match(u.warnings.join(' '),/linked Google Sheet/);
});

test('an imported sheet has no cells, and a linked one still needs them; players get the usual allow-list',()=>{
 n=0;
 const r=I.applyImport(world(),read(example()),{kind:'new',worldId:'demo-world',campaignId:C},{},{now:AT,newId:ids});
 const ws=workspaceSchema.parse(r.workspace);
 const bad={...ws,entries:ws.entries.map(e=>e.id===r.entryId?{...e,character:{...e.character,sheet:{...e.character.sheet,source:'published',publishedUrl:'https://docs.google.com/spreadsheets/d/e/2PACX-abcdefghijklmnop/pubhtml'}}}:e)};
 assert.equal(workspaceSchema.safeParse(bad).success,false);
 const pc=playerCampaign(ws,C),page=pc.entries.find(e=>e.id===r.entryId);
 assert.ok(page.sheet.items.length>5);assert.ok(page.sheet.items.every(i=>!('cell' in i)));
});
