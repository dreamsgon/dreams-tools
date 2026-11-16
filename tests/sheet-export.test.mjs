import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {demoWorkspace,workspaceSchema}=await import('../lib/encyclopedia/world-model.ts');
const I=await import('../lib/encyclopedia/sheet-import.ts');
const X=await import('../lib/encyclopedia/sheet-export.ts');
const {sheetRollGroups}=await import('../lib/encyclopedia/sheet-rolls.ts');

const C='demo-campaign',AT='2026-11-14T10:00:00.000Z';
let n=0;const ids=()=>`id${++n}`;
const example=()=>JSON.parse(readFileSync(new URL('./fixtures/rpgtools-sheet-example.json',import.meta.url),'utf8'));
const world=()=>{const w=demoWorkspace();return workspaceSchema.parse({...w,campaigns:w.campaigns.map(c=>c.id===C?{...c,statFields:[]}:c)});};
const read=text=>{const r=I.readImport(text);assert.ok(r.ok,r.error);return r.file;};
function imported(file=example()){
 const w=world(),worldId=w.campaigns.find(c=>c.id===C).worldId;
 const r=I.applyImport(w,read(JSON.stringify(file)),{kind:'new',worldId,campaignId:C},{}, {now:AT,newId:ids});
 return {w:workspaceSchema.parse(r.workspace),id:r.entryId,worldId};
}
const page=(w,id)=>w.entries.find(e=>e.id===id);
const valuesByLabel=(w,id)=>{const c=w.campaigns.find(c=>c.id===C),v=page(w,id).character.statsByCampaign[C];return Object.fromEntries(c.statFields.filter(f=>f.id in v).map(f=>[f.label,v[f.id]]));};
const shape=(w,id)=>{const e=page(w,id),ch=e.character;return{
 title:e.title,body:e.body,role:ch.role,tags:ch.tags,location:ch.location,faction:ch.faction,values:valuesByLabel(w,id),
 trackers:ch.trackers.map(({id:_i,...t})=>t),
 sheet:ch.sheet.items.map(({id:_i,...i})=>i),rolls:sheetRollGroups(ch.sheet).map(g=>[g.title,g.rows.map(r=>[r.name,r.buttons.map(b=>b.formula)])]),
 tabs:e.tabs.map(({id:_i,...t})=>({...t,body:t.body.replace(/^Things the AI couldn.*\n/,'')})),traits:e.profile.traits.map(t=>t.label),
};};

test('an exported character reads back with the sheet import and makes the same page',()=>{
 const a=imported(),{file,warnings}=X.exportSheet(a.w,a.id,{campaignId:C,now:AT});
 assert.deepEqual(warnings,[]);
 assert.equal(file.format,'rpgtools-sheet');assert.equal(file.version,1);assert.equal(file.system,'D&D 5e (2014)');
 const back=read(X.sheetFileText(file));
 assert.deepEqual(back.core,{hp:{value:38,max:44,label:'Hit points'},ac:{value:15,label:'Armor Class'},initiative:{formula:'1d20+3',label:'Initiative'},speed:'30 ft'});
 assert.deepEqual(back.rolls.find(r=>r.name==='Longbow'),{name:'Longbow',group:'attacks',attack:'1d20+8',damage:'1d8+3',notes:'piercing, 150/600 ft, Archery style'});
 assert.deepEqual(back.fields.find(f=>f.label==='Strength'),{section:'Abilities',label:'Strength',type:'number',value:1,options:[],roll:'d20',visibility:'players'});
 assert.deepEqual(back.unmapped,['Languages: Common, Elvish, Sylvan (no field for this yet)']);
 const inv=back.lists.find(l=>l.title==='Inventory').items;
 assert.deepEqual(inv,[{name:'Longbow',quantity:1,equipped:true},{name:'Arrows',quantity:34},{name:'Potion of healing',quantity:2,text:'Drink to regain [[2d4+2|Healing]] HP.'}]);
 assert.deepEqual(back.lists.find(l=>l.title==='Features').items[0].uses,{value:2,max:2,per:'long rest'});
 // Into an empty campaign again: the same page, field for field.
 const w2=world(),r=I.applyImport(w2,back,{kind:'new',worldId:a.worldId,campaignId:C},{}, {now:AT,newId:ids});
 const b=workspaceSchema.parse(r.workspace);
 const s1=shape(a.w,a.id),s2=shape(b,r.entryId);
 assert.deepEqual(s2,s1);
 assert.equal(page(b,r.entryId).character.sheet.linkedBy,'Import (RPG Tools)');
});

test('the players’ copy leaves out GM-only fields, trackers, tabs, traits, text and the Not imported tab',()=>{
 const a=imported(),e=page(a.w,a.id),c=a.w.campaigns.find(c=>c.id===C);
 const secretField=c.statFields.find(f=>f.label==='Passive Perception');
 const w=workspaceSchema.parse({...a.w,
  campaigns:a.w.campaigns.map(x=>x.id===C?{...x,statFields:x.statFields.map(f=>f.id===secretField.id?{...f,visibility:'gm'}:f)}:x),
  entries:a.w.entries.map(x=>x.id===a.id?{...x,overviewVisibility:'gm',
   character:{...x.character,trackers:x.character.trackers.map((t,i)=>i===0?{...t,gm:true}:t)},
   profile:{...x.profile,visibility:'players',traits:x.profile.traits.map((t,i)=>i===1?{...t,gm:true}:t)},
   tabs:[...x.tabs,{id:'secret-tab',title:'Secret plans',body:'- Betray the Wardens',visibility:'gm'}]}:x)});
 const gm=X.exportSheet(w,a.id,{campaignId:C,now:AT}).file,pl=X.exportSheet(w,a.id,{campaignId:C,audience:'players',now:AT}).file;
 assert.ok(gm.fields.some(f=>f.label==='Passive Perception'));assert.ok(!pl.fields.some(f=>f.label==='Passive Perception'));
 assert.equal(gm.gauges.length,3);assert.deepEqual(pl.gauges.map(g=>g.label),['Spell slots, 2nd','Hit dice (d10)']);
 assert.ok(gm.lists.some(l=>l.title==='Secret plans'));assert.ok(!pl.lists.some(l=>l.title==='Secret plans'));
 assert.deepEqual(pl.traits,['Stubborn','Quiet']);
 assert.ok(gm.notes);assert.equal(pl.notes,undefined);
 assert.equal(pl.unmapped.length,0);assert.ok(!pl.lists.some(l=>l.title===I.NOT_IMPORTED_TAB));
 assert.ok(pl.core.hp&&pl.rolls.length>0,'stats are player visible for a PC, so the sheet goes');
 assert.ok(!JSON.stringify(pl).includes('Betray'));
 void e;
});

test('a GM-only Stats tab keeps stats, trackers and the sheet out of the players’ copy',()=>{
 const a=imported();
 const w=workspaceSchema.parse({...a.w,entries:a.w.entries.map(x=>x.id===a.id?{...x,character:{...x.character,statsVisibility:'gm'}}:x)});
 const {file,warnings}=X.exportSheet(w,a.id,{campaignId:C,audience:'players',now:AT});
 assert.deepEqual([file.fields.length,file.gauges.length,file.rolls.length,file.core],[0,0,0,undefined]);
 assert.match(warnings[0],/Stats tab is GM only/);
 assert.ok(file.lists.length>0,'player-visible tabs still go');
});

test('a Google-linked sheet exports its cached values, rolls and stats, never its link or cells',()=>{
 const a=imported();
 const sheet={source:'published',publishedUrl:'https://docs.google.com/spreadsheets/d/e/2PACX-abcdefghijklmnop/pubhtml',title:'Maren',mode:'cells',readAt:AT,items:[
  {id:'h',name:'HP',cell:'B2',kind:'hp',value:'21'},{id:'m',name:'Max HP',cell:'B3',kind:'maxHp',value:'30'},{id:'a',name:'AC',cell:'B4',kind:'ac',value:'14',label:'Guard'},
  {id:'i',name:'Initiative',cell:'B5',kind:'init',value:'+2'},{id:'s',name:'Strength',cell:'B6',kind:'stat',value:'16'},{id:'b',name:'Background',cell:'B7',kind:'stat',value:'Sailor'},
  {id:'r',name:'Athletics',cell:'B8',kind:'roll',value:'+5'},{id:'d',name:'Axe damage',cell:'B9',kind:'roll',value:'1d12+3',formula:'1d12+3'}]};
 const w=workspaceSchema.parse({...a.w,entries:a.w.entries.map(x=>x.id===a.id?{...x,character:{...x.character,sheet}}:x)});
 const {file}=X.exportSheet(w,a.id,{campaignId:C,now:AT});
 assert.deepEqual(file.core,{hp:{value:21,max:30,label:'HP'},ac:{value:14,label:'Guard'},initiative:{formula:'1d20+2',label:'Initiative'}});
 assert.equal(file.system,undefined);
 assert.deepEqual(file.rolls,[{name:'Athletics',group:'skills',formula:'1d20+5'},{name:'Axe',group:'attacks',damage:'1d12+3'}]);
 assert.deepEqual(file.fields.filter(f=>f.section==='Maren').map(f=>[f.label,f.type,f.value]),[['Background','text','Sailor']],'Strength is already a stat form field, so the sheet copy is left out');
 assert.ok(!/docs\.google|B[0-9]/.test(JSON.stringify(file)));
 // The damage-only attack comes back as "Axe damage".
 const back=read(X.sheetFileText(file)),r=I.importedSheet(back,AT,[]);
 assert.ok(r.items.some(i=>i.name==='Axe damage'&&i.formula==='1d12+3'));
});

test('tab text becomes list items: import bullets, plain bullets, follow-on lines and prose',()=>{
 assert.deepEqual(X.tabItems('Gear','- **Rope** × 2 (1/3 per day) · equipped: Fifty feet.\n  Knotted.\n- Lantern: Hooded\n* Flint'),[
  {name:'Rope',quantity:2,uses:{value:1,max:3,per:'day'},equipped:true,text:'Fifty feet.\nKnotted.'},{name:'Lantern',text:'Hooded'},{name:'Flint'}]);
 assert.deepEqual(X.tabItems('Backstory','She left home at twelve.\n\nShe never went back.'),[{name:'Backstory',text:'She left home at twelve.\n\nShe never went back.'}]);
 assert.deepEqual(X.tabItems('Empty','  '),[]);
 const long='x'.repeat(200);
 assert.equal(X.tabItems('T',`- ${long}`)[0].text,long);
});

test('long tabs are cut with a warning, field rolls map back, and the file name is safe',()=>{
 const a=imported();
 const w=workspaceSchema.parse({...a.w,
  campaigns:a.w.campaigns.map(x=>x.id===C?{...x,statFields:[...x.statFields,
   {id:'f-hd',label:'Hit die',section:'Details',type:'text',options:[],visibility:'players',archived:false,roll:'formula'},
   {id:'f-luck',label:'Luck',section:'Details',type:'number',options:[],visibility:'players',archived:false,roll:'custom',rollFormula:'1d100<={value}'},
   {id:'f-old',label:'Old',section:'Details',type:'number',options:[],visibility:'players',archived:true}]}:x),
  entries:a.w.entries.map(x=>x.id===a.id?{...x,tabs:[...x.tabs,{id:'long',title:'Journal',body:'y'.repeat(2500),visibility:'players'}],
   character:{...x.character,statsByCampaign:{...x.character.statsByCampaign,[C]:{...x.character.statsByCampaign[C],'f-hd':'1d10','f-luck':45,'f-old':3}}}}:x)});
 const {file,warnings}=X.exportSheet(w,a.id,{campaignId:C,now:AT});
 assert.equal(file.lists.find(l=>l.title==='Journal').items[0].text.length,2000);
 assert.match(warnings.join(' '),/Journal.*2,000/);
 assert.equal(file.fields.find(f=>f.label==='Hit die').roll,'self');
 assert.equal(file.fields.find(f=>f.label==='Luck').roll,'1d100<={value}');
 assert.ok(!file.fields.some(f=>f.label==='Old'));
 assert.equal(X.sheetFileName('Maren Ashford'),'maren-ashford.rpgtools-sheet.json');
 assert.equal(X.sheetFileName('Ælfric / “the Bold”'),'lfric-the-bold.rpgtools-sheet.json');
 assert.equal(X.sheetFileName('???'),'character.rpgtools-sheet.json');
 assert.throws(()=>X.exportSheet(w,'nope',{campaignId:C}),/gone/);
});
