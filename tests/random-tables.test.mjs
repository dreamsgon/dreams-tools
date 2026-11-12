import test from 'node:test';
import assert from 'node:assert/strict';
import {librarySchema,rollTable,resolveText,parseTableText,parseCsvTable,tableToCsv,askOracle,oracleAnswer,DEFAULT_ODDS,rangeGaps,formulaRange,diceFormula,exportTables,importTables,bringToCampaign,inCampaign,emptyLibrary} from '../lib/encyclopedia/tables.ts';
import {starterTables} from '../lib/encyclopedia/starter-tables.ts';

let n=0;const makeId=()=>`id${++n}`;const now='2026-11-12T00:00:00.000Z';
const seq=(...values)=>{let i=0;return()=>values[i++%values.length];};
const lib=()=>librarySchema.parse({schemaVersion:1,tables:[
 {id:'enc',name:'Road encounters',category:'encounter',kind:'table',campaignIds:['c1'],mode:'ranges',formula:'2d6',updatedAt:now,rows:[
  {id:'a',text:'[[1d4]] wolves',min:2,max:6},{id:'b',text:'A traveller: [[table:Names]]',min:7,max:12}]},
 {id:'names',name:'Names',category:'names',kind:'table',campaignIds:null,mode:'weighted',updatedAt:now,rows:[{id:'x',text:'Hesk'},{id:'y',text:'Ilse',weight:0}]},
 {id:'verbs',name:'Verbs',category:'meaning',kind:'table',campaignIds:null,mode:'weighted',updatedAt:now,rows:[{id:'v',text:'Abandon'}]},
 {id:'nouns',name:'Nouns',category:'meaning',kind:'table',campaignIds:null,mode:'weighted',updatedAt:now,rows:[{id:'w',text:'a promise'}]},
 {id:'pair',name:'Action and subject',category:'meaning',kind:'pair',pair:['verbs','nouns'],campaignIds:null,updatedAt:now},
 {id:'loop',name:'Loop',category:'other',kind:'table',campaignIds:null,mode:'weighted',updatedAt:now,rows:[{id:'l',text:'again [[table:Loop]]'}]},
]});

test('ranges roll the formula, nested dice and tables resolve',()=>{
  // 2d6: dice 1+1 = 2 → wolves; then 1d4 rolls 3 (random .5→ floor(.5*4)+1 = 3)
  let r=rollTable(lib(),'enc',seq(0,0,.5));
  assert.equal(r.text,'3 wolves');assert.equal(r.roll,'2d6 = 2');
  r=rollTable(lib(),'enc',seq(.99,.99,0));
  assert.equal(r.text,'A traveller: Hesk','weight 0 never comes up');
  assert.deepEqual(r.steps.map(s=>s.table),['Names']);
});
test('pairs join both tables, and self-referencing tables stop',()=>{
  assert.equal(rollTable(lib(),'pair').text,'Abandon · a promise');
  assert.match(rollTable(lib(),'loop').text,/^(again )+…$/);
  assert.equal(resolveText(lib(),'[[table:Missing]] and [[Bob]]'),'[[table:Missing]] and [[Bob]]');
});
test('formulas, ranges and gaps',()=>{
  assert.equal(diceFormula('d%'),'1d100');assert.equal(diceFormula('D20+2'),'1d20+2');
  assert.deepEqual(formulaRange('2d6'),[2,12]);assert.deepEqual(formulaRange('d20-1'),[0,19]);
  const t={...lib().tables[0],rows:[{id:'a',text:'x',min:2,max:5},{id:'b',text:'y',min:5,max:11}]};
  assert.deepEqual(rangeGaps(t),{missing:[12],overlap:[5]});
});
test('campaign scope',()=>{
  const [enc,names]=lib().tables;
  assert.ok(inCampaign(enc,'c1'));assert.ok(!inCampaign(enc,'c2'));assert.ok(!inCampaign(enc,null));assert.ok(inCampaign(names,'c2'));
});
test('oracle answers and twists',()=>{
  assert.equal(oracleAnswer(70,5),'Yes, and…');assert.equal(oracleAnswer(70,40),'Yes');assert.equal(oracleAnswer(70,68),'Yes, but…');
  assert.equal(oracleAnswer(70,73),'No, but…');assert.equal(oracleAnswer(70,85),'No');assert.equal(oracleAnswer(70,99),'No, and…');
  const oracle={id:'o',name:'Oracle',category:'oracle',kind:'oracle',odds:DEFAULT_ODDS,campaignIds:null,updatedAt:now};
  const a=askOracle(oracle,'Likely',5,()=>.33);assert.equal(a.d100,34);assert.equal(a.chance,70);assert.equal(a.twist,false);
  assert.equal(askOracle(oracle,'Likely',5,()=>.43).twist,true,'44 under tension 5');
  assert.equal(askOracle(oracle,'Likely',3,()=>.43).twist,false,'44 over tension 3');
});
test('pasted tables: ranges, 00 as 100, wrapped lines, columns, plain lists',()=>{
  let p=parseTableText('01-05 Cold rain\n06–50. Fog\n  that lifts by noon\n51 to 00: Clear',makeId);
  assert.equal(p.mode,'ranges');assert.equal(p.formula,'d100');
  assert.deepEqual(p.rows.map(r=>[r.min,r.max??r.min,r.text]),[[1,5,'Cold rain'],[6,50,'Fog that lifts by noon'],[51,100,'Clear']]);
  p=parseTableText('2 Bandits\n3-6 Wolves\n7-12 Nothing',makeId);assert.equal(p.formula,'2d6');
  p=parseTableText('1\tAbandon\t3\tConceal\n2\tBargain\t4\tDefy',makeId);
  assert.deepEqual(p.rows.map(r=>r.text),['Abandon','Bargain','Conceal','Defy']);assert.equal(p.formula,'d4');
  p=parseTableText('1  Abandon      3  Conceal\n2  Bargain      4  Defy',makeId);assert.deepEqual(p.rows.map(r=>r.min),[1,2,3,4]);
  p=parseTableText('- Hesk\n- Ilse\nBrann',makeId);assert.equal(p.mode,'weighted');assert.deepEqual(p.rows.map(r=>r.text),['Hesk','Ilse','Brann']);
});
test('CSV in and out',()=>{
  const t={...lib().tables[0]};
  const csv=tableToCsv(t);assert.match(csv,/^Roll,Result\n2-6,\[\[1d4\]\] wolves\n/);
  const back=parseCsvTable(csv,makeId);assert.equal(back.formula,'2d6');assert.deepEqual(back.rows.map(r=>r.min),[2,7]);
  const w=parseCsvTable('Result,Weight\n"Hesk, the ferryman",3\nIlse,1\n',makeId);assert.deepEqual(w.rows.map(r=>[r.text,r.weight]),[['Hesk, the ferryman',3],['Ilse',1]]);
  assert.deepEqual(parseCsvTable('Hesk\nIlse\n',makeId).rows.map(r=>r.text),['Hesk','Ilse']);
});
test('export and import keep pairs and avoid name clashes',()=>{
  const out=exportTables(lib(),['pair']);assert.deepEqual(out.tables.map(t=>t.id).sort(),['nouns','pair','verbs']);
  assert.ok(out.tables.every(t=>t.campaignIds===null));
  const {library,added}=importTables(lib(),JSON.parse(JSON.stringify(out)),['c9'],makeId,now);
  assert.equal(added,3);const pair=library.tables.find(t=>t.name==='Action and subject (2)');
  assert.ok(pair&&pair.pair.every(id=>library.tables.some(t=>t.id===id&&t.campaignIds[0]==='c9')));
  assert.throws(()=>importTables(lib(),{format:'other'},null,makeId));
});
test('bring tables from another campaign: shared or copied',()=>{
  let l=bringToCampaign(lib(),['enc'],'c2',false,makeId,now);assert.deepEqual(l.tables[0].campaignIds,['c1','c2']);
  l=bringToCampaign(lib(),['enc'],'c2',true,makeId,now);assert.equal(l.tables.length,7);assert.deepEqual(l.tables.at(-1).campaignIds,['c2']);assert.deepEqual(l.tables[0].campaignIds,['c1']);
});
test('schema rejects broken tables',()=>{
  const bad=(t)=>assert.throws(()=>librarySchema.parse({schemaVersion:1,tables:[{...lib().tables[0],...t}]}));
  bad({formula:'banana'});bad({rows:undefined});bad({kind:'pair',pair:['enc','nope']});
});
test('starter tables are valid, original, and roll',()=>{
  const l=librarySchema.parse({...emptyLibrary(),tables:starterTables(makeId,now)});
  assert.ok(l.tables.length>=8);
  for(const t of l.tables)if(t.kind!=='oracle')assert.ok(rollTable(l,t.id).text.length>0,t.name);
  for(const t of l.tables)if(t.mode==='ranges')assert.deepEqual(rangeGaps(t),{missing:[],overlap:[]},t.name);
});

test('tables are saved per account beside the workspace, with revisions',async()=>{
  const {EncyclopediaStore}=await import('../lib/encyclopedia/store.ts');
  const data=new Map();let sequence=0;
  const bucket={async get(key){const item=data.get(key);return item?{etag:item.etag,json:async()=>JSON.parse(item.text)}:null;},
   async put(key,text,options={}){const old=data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++sequence);data.set(key,{text,etag});return {etag};},async delete(key){data.delete(key);}};
  const store=new EncyclopediaStore(bucket);
  assert.deepEqual((await store.readTables('alice')).data,emptyLibrary());
  assert.equal(await store.saveTables('alice',lib(),0),1);
  assert.equal(await store.saveTables('alice',lib(),0),null,'stale revision');
  assert.ok(data.has('users/alice/encyclopedia/tables.json'));
  assert.equal((await store.readTables('bob')).revision,0);
  assert.equal((await store.readTables('alice')).data.tables.length,6);
});
