import test from 'node:test';
import assert from 'node:assert/strict';
const {tableTarget,playerInline,plainExcerpt}=await import('../lib/encyclopedia/inline.ts');
const {campaignTables,rollTable,rollLabel,librarySchema}=await import('../lib/encyclopedia/tables.ts');
const {tableResultSchema,discordTableSchema}=await import('../lib/encyclopedia/discord-table.ts');
const {tablePost,oraclePost}=await import('../lib/discord/cards.ts');
const {playerText}=await import('../lib/encyclopedia/world-model.ts');

const now='2026-11-13T12:00:00.000Z';
const lib=librarySchema.parse({schemaVersion:1,tension:{'salt':6},tables:[
 {id:'marsh',name:'Marsh encounters',category:'encounter',kind:'table',campaignIds:['salt'],mode:'ranges',formula:'d8',rows:[{id:'r1',text:'Leeches.',min:1,max:3},{id:'r2',text:'A will-o’-wisp bobs ahead.',min:4,max:8}],updatedAt:now},
 {id:'weather',name:'Weather, temperate',category:'weather',kind:'table',campaignIds:null,mode:'weighted',rows:[{id:'w1',text:'Fog'}],updatedAt:now},
 {id:'names',name:'Quick names',category:'names',kind:'table',campaignIds:null,mode:'weighted',rows:[{id:'n1',text:'Tamsin'}],starred:true,updatedAt:now},
 {id:'yes',name:'Yes or no',category:'oracle',kind:'oracle',campaignIds:null,odds:[{label:'Unlikely',yes:30},{label:'Likely',yes:70}],updatedAt:now},
 {id:'other',name:'Elsewhere',category:'other',kind:'table',campaignIds:['other-campaign'],mode:'weighted',rows:[{id:'o1',text:'x'}],updatedAt:now},
]});

test('[[table:Name]] is read as a table, and players only ever see its name',()=>{
 assert.deepEqual(tableTarget('table:Marsh encounters'),{name:'Marsh encounters',label:null});
 assert.deepEqual(tableTarget('table: Marsh encounters |what lurks'),{name:'Marsh encounters',label:'what lurks'});
 assert.equal(tableTarget('Marsh encounters'),null);
 assert.equal(tableTarget('table:'),null);
 assert.equal(playerInline('Each hour, roll [[table:Marsh encounters]] and [[table:Weather, temperate|the weather]].'),'Each hour, roll Marsh encounters and the weather.');
 assert.equal(playerText('[[table:Marsh encounters]]\n\nLeeches lurk.'),'Marsh encounters\n\nLeeches lurk.');
 assert.equal(plainExcerpt('Roll [[table:Marsh encounters]] each hour.'),'Roll Marsh encounters each hour.');
});

test('a roll says which row came up, and a campaign lists its tables starred first with oracles apart',()=>{
 const r=rollTable(lib,'marsh',()=>0.5);
 assert.equal(r.rowId,'r2');assert.match(r.roll,/^d8 = 5$/);assert.equal(r.text,'A will-o’-wisp bobs ahead.');
 const here=campaignTables(lib,'salt');
 assert.deepEqual(here.tables.map(t=>t.id),['names','marsh','weather']);
 assert.deepEqual(here.oracles.map(t=>t.id),['yes']);
 assert.deepEqual(campaignTables(lib,null).tables.map(t=>t.id),['names','weather']);
 assert.equal(rollLabel(lib.tables[0]),'d8');assert.equal(rollLabel(lib.tables[1]),'list');
});

test('table and oracle results become Discord cards',()=>{
 const result=tableResultSchema.parse({title:'Marsh encounters',text:'A will-o’-wisp bobs ahead.',roll:'d8 = 4',steps:[{table:'Weather',text:'Fog'}],footer:'The Salt Road · Greyfen marsh'});
 const card=tablePost(result).embeds[0];
 assert.equal(card.title,'🎲 Marsh encounters');
 assert.match(card.description,/^A will-o’-wisp bobs ahead\.\n\n`d8 = 4`\n› Weather: Fog$/);
 assert.equal(card.footer.text,'The Salt Road · Greyfen marsh');
 const oracle=oraclePost({question:'Is the ferryman still waiting?',answer:'Yes',odds:'Likely',chance:70,d100:66,twist:'Reveal · a secret',tension:6,footer:'The Salt Road'}).embeds[0];
 assert.equal(oracle.title,'🔮 Is the ferryman still waiting?');
 assert.match(oracle.description,/^## Yes\nLikely \(70%\), d100 = 66\n\n\*\*Twist:\*\* Reveal · a secret$/);
 assert.equal(oracle.footer.text,'Tension 6 · The Salt Road');
 assert.throws(()=>discordTableSchema.parse({result}),/Choose a campaign/);
 assert.throws(()=>discordTableSchema.parse({campaignId:'a',maptableCampaignId:'b',result}),/Choose a campaign/);
 assert.ok(discordTableSchema.parse({maptableCampaignId:'b',result}));
});
