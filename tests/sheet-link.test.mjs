import test from 'node:test';
import assert from 'node:assert/strict';
import {
 colNumber,colLetters,parseCell,cellRef,cellText,parseCsv,toCsv,rowsFromValues,publishedLink,sheetSchema,kindForName,isDice,guessFormula,guessPick,looksD20,
 findTemplateTab,templateItems,templateCsv,templateRows,refreshSheet,refreshRanges,sheetLayout,rollGroups,timeAgo,sheetOpenUrl,playerSheet,withoutLinkDetails,
 labelFromRangeName,namedRangeCell,clipRows,GRID_ROWS,
} from '../lib/encyclopedia/sheet-link.ts';
import {pagedTabs,readPublishedSheet,SheetReadError} from '../lib/encyclopedia/sheet-published.ts';
import {workspaceSchema,demoWorkspace,playerCampaign,campaignExport} from '../lib/encyclopedia/world-model.ts';
import {callTool} from '../lib/mcp/tools.ts';
import {narrow} from '../lib/mcp/players-only.ts';
import {applyCoGmEdit} from '../lib/encyclopedia/co-gm-edit.ts';
import {savePlayerEdit} from '../lib/encyclopedia/player-edit.ts';
import {callReadTool} from '../lib/encyclopedia/mcp.ts';
import {handleSheetRead,resetThrottle,throttled,MAX_BODY} from '../lib/encyclopedia/sheet-request.ts';
import {presets} from '../lib/mcp/permissions.ts';

const SHEET_ID='1AbCdEfGhIjKlMnOpQrStUvWx';
const PUB_ID='2PACX-1vTestTestTestTestTestTest';
const PUB_URL=`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pubhtml`;

test('A1 references parse and print, with or without a tab', () => {
 assert.equal(colNumber('A'),1);assert.equal(colNumber('Z'),26);assert.equal(colNumber('AA'),27);assert.equal(colLetters(27),'AA');assert.equal(colLetters(52),'AZ');
 for(const n of [1,26,27,52,53,702,703])assert.equal(colNumber(colLetters(n)),n);
 assert.deepEqual(parseCell('B4'),{col:2,row:4});
 assert.deepEqual(parseCell('$b$4'),{col:2,row:4});
 assert.deepEqual(parseCell('Sheet1!B4'),{tab:'Sheet1',col:2,row:4});
 assert.deepEqual(parseCell("'RPG Tools'!C12"),{tab:'RPG Tools',col:3,row:12});
 assert.deepEqual(parseCell("'Ayla''s sheet'!A1"),{tab:"Ayla's sheet",col:1,row:1});
 for(const bad of ['','B','4','B0','A1:B2','Sheet1!','!B4','1B','ABCD1','B4;'])assert.equal(parseCell(bad),null,bad);
 assert.equal(cellRef(2,4),'B4');assert.equal(cellRef(2,4,'Sheet1'),'Sheet1!B4');assert.equal(cellRef(3,12,'RPG Tools'),"'RPG Tools'!C12");assert.equal(cellRef(1,1,"Ayla's"),"'Ayla''s'!A1");
 assert.deepEqual(parseCell(cellRef(1,1,"Ayla's")),{tab:"Ayla's",col:1,row:1});
});

test('CSV handles quotes, commas, line breaks, CRLF and a BOM, and drops empty trailing rows', () => {
 assert.deepEqual(parseCsv('a,b,c\n1,2,3\n'),[['a','b','c'],['1','2','3']]);
 assert.deepEqual(parseCsv('﻿Name,Value\r\n"Hit, points",24\r\n'),[['Name','Value'],['Hit, points','24']]);
 assert.deepEqual(parseCsv('"say ""hi""","two\nlines",x'),[['say "hi"','two\nlines','x']]);
 assert.deepEqual(parseCsv('a,,c\n,,\n,,\n'),[['a','','c']]);
 assert.deepEqual(parseCsv(''),[]);
 assert.deepEqual(parseCsv('a,b'),[['a','b']]);
 assert.deepEqual(parseCsv('x,\n'),[['x','']]);
 const rows=[['Name','Value'],['a,b','say "hi"'],['x\ny','']];
 assert.deepEqual(parseCsv(toCsv(rows)),rows);
 assert.deepEqual(rowsFromValues([['Ayla',5,true,null],[]]),[['Ayla','5','true',''],[]]);
 assert.deepEqual(rowsFromValues(undefined),[]);
 assert.equal(clipRows(Array.from({length:300},()=>Array(60).fill('x'))).length,GRID_ROWS);
 assert.equal(clipRows([Array(60).fill('x')])[0].length,40);
});

test('published links: only the web-published address on docs.google.com, with the tab it names', () => {
 const ok=publishedLink(`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub?output=csv`);
 assert.deepEqual(ok,{ok:true,id:PUB_ID,url:PUB_URL});
 assert.deepEqual(publishedLink(`  https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub?gid=123&single=true&output=csv `),{ok:true,id:PUB_ID,gid:'123',url:`${PUB_URL}?gid=123&single=true`});
 assert.equal(publishedLink(`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pubhtml#gid=77`).gid,'77');
 assert.equal(publishedLink(`https://docs.google.com/spreadsheets/u/0/d/e/${PUB_ID}/pubhtml`).ok,true);
 assert.match(publishedLink(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`).error,/editing link/);
 assert.equal(publishedLink(`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub?gid=12ab`).gid,undefined,'a gid is digits only');
 for(const bad of ['','not a link',`http://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub`,`https://evil.example/spreadsheets/d/e/${PUB_ID}/pub`,`https://docs.google.com.evil.example/spreadsheets/d/e/${PUB_ID}/pub`,'https://docs.google.com/document/d/abc','https://drive.google.com/file/d/e/abcdefghijklmnop/pub'])
  assert.equal(publishedLink(bad).ok,false,bad);
});

test('the saved sheet needs its source, unique item ids and valid cells and lengths', () => {
 const item={id:'a',name:'Stealth',cell:'Sheet1!B11',kind:'roll',value:'+5',formula:'1d20+5'};
 const good={source:'google',spreadsheetId:SHEET_ID,title:'Ayla - Salt Road',mode:'cells',items:[item],writeBack:false};
 assert.equal(sheetSchema.safeParse(good).success,true);
 assert.equal(sheetSchema.safeParse({source:'published',publishedUrl:PUB_URL,title:'T',mode:'template',items:[]}).success,true);
 const bad=x=>sheetSchema.safeParse(x).success;
 assert.equal(bad({...good,spreadsheetId:undefined}),false,'google needs an id');
 assert.equal(bad({source:'published',title:'T',mode:'cells',items:[]}),false,'published needs a link');
 assert.equal(bad({source:'published',publishedUrl:'https://evil.example/x',title:'T',mode:'cells',items:[]}),false,'only a published Google link');
 assert.equal(bad({...good,items:[item,item]}),false,'ids are unique');
 assert.equal(bad({...good,items:[{...item,cell:'A1:B2'}]}),false);
 assert.equal(bad({...good,items:[{...item,kind:'skill'}]}),false);
 assert.equal(bad({...good,items:[{...item,name:'x'.repeat(81)}]}),false);
 assert.equal(bad({...good,items:[{...item,value:'x'.repeat(201)}]}),false);
 assert.equal(bad({...good,items:[{...item,formula:'x'.repeat(201)}]}),false);
 assert.equal(bad({...good,items:Array.from({length:201},(_,i)=>({...item,id:'i'+i}))}),false);
 assert.equal(bad({...good,items:Array.from({length:200},(_,i)=>({...item,id:'i'+i}))}),true);
 assert.equal(bad({...good,writeBack:true}),true,'opt-in write back is allowed on a Google sheet');
 assert.equal(bad({source:'published',publishedUrl:PUB_URL,title:'T',mode:'cells',items:[],writeBack:true}),false,'never on a published link');
 assert.equal(bad({...good,writeBack:'yes'}),false);
 assert.equal(bad({...good,readAt:'yesterday'}),false);
 assert.equal(bad({...good,readAt:'2026-11-14T10:00:00.000Z'}),true);
 assert.equal(bad({...good,source:'dropbox'}),false);
});

test('names map to the special slots, in any case and wording', () => {
 for(const n of ['HP','hp','Hit points','Hit Point','Current HP'])assert.equal(kindForName(n),'hp',n);
 for(const n of ['Max HP','max hp','Maximum hit points','HP Max','Hit point maximum'])assert.equal(kindForName(n),'maxHp',n);
 for(const n of ['AC','Armor class','Armour Class','Armour'])assert.equal(kindForName(n),'ac',n);
 for(const n of ['Initiative','init','Initiative bonus'])assert.equal(kindForName(n),'init',n);
 for(const n of ['Stealth','Strength','Hit dice','Speed',''])assert.equal(kindForName(n),null,n);
});

test('dice notation and formula guesses', () => {
 for(const d of ['1d20+5','d8','2d6','4d6kh3','5d10>=8','2d6!','4dF','2d20kl1','1d8+1d6+2','1D20 + 5','3d6 - 1'])assert.equal(isDice(d),true,d);
 for(const d of ['','+5','10','d','1d','sword','2d6 fire','1d20+','dd6'])assert.equal(isDice(d),false,d);
 assert.equal(guessFormula('1d20+5',false),'1d20+5','dice stay as they are on any system');
 assert.equal(guessFormula('4d6 kh3',false),'','spaces inside are not dice');
 assert.equal(guessFormula('+5',true),'1d20+5');
 assert.equal(guessFormula('- 2',true),'1d20-2');
 assert.equal(guessFormula('+5',false),'','a bonus on a sheet that does not look d20 is left alone');
 assert.equal(guessFormula('5',true),'','a plain number is a score, not a bonus');
 assert.equal(guessFormula('Wits',true),'');
 assert.deepEqual(guessPick('Stealth','+5',true),{name:'Stealth',kind:'roll',formula:'1d20+5'});
 assert.deepEqual(guessPick('Stealth','+5',false),{name:'Stealth',kind:'stat',formula:''});
 assert.deepEqual(guessPick('Sneak','4d6kh3',false),{name:'Sneak',kind:'roll',formula:'4d6kh3'});
 assert.deepEqual(guessPick('Hit points','24',true),{name:'Hit points',kind:'hp',formula:''});
 assert.deepEqual(guessPick('Initiative','+3',true),{name:'Initiative',kind:'init',formula:'1d20+3'});
 assert.equal(guessPick(' '+'x'.repeat(100),'1',false).name.length,80);
});

const ayla=()=>[
 {name:'Sheet1',rows:[['Ayla','Ranger, level 5'],[],['Strength','10'],['Dexterity','17'],['Constitution','14'],['Wisdom','14'],['Armor class','15'],[],['Stealth','+5'],['Perception','+4']]},
 {name:'RPG Tools',rows:[['name','VALUE','roll'],['HP','24',''],['Max hit points','31',''],['AC','15',''],['Initiative','+3','1d20+3'],['Strength','10',''],['','',''],['Stealth','+5','1d20+5'],['Longbow damage','','1d8+4'],['Speed','30 ft','']]},
];

test('a sheet looks d20 when four of the usual words are cells', () => {
 assert.equal(looksD20(ayla()),true);
 assert.equal(looksD20([{name:'S',rows:[['Stress','3'],['Grit','3'],['Strength','2']]}]),false);
 assert.equal(looksD20([]),false);
});

test('the RPG Tools tab needs its Name, Value, Roll header and then every row reads as a stat, a roll or a slot', () => {
 const tab=findTemplateTab(ayla());
 assert.equal(tab.name,'RPG Tools');
 assert.equal(findTemplateTab([{name:'rpg tools',rows:[['Name','Value','Roll']]}]).name,'rpg tools');
 assert.equal(findTemplateTab([{name:'RPG Tools',rows:[['Name','Value']]}]),undefined,'a Roll column is required');
 assert.equal(findTemplateTab([{name:'Stats',rows:[['Name','Value','Roll']]}]),undefined);
 const items=templateItems(tab);
 assert.deepEqual(items.map(i=>[i.name,i.kind,i.value??null,i.formula??null,i.cell]),[
  ['HP','hp','24',null,"'RPG Tools'!B2"],
  ['Max hit points','maxHp','31',null,"'RPG Tools'!B3"],
  ['AC','ac','15',null,"'RPG Tools'!B4"],
  ['Initiative','init','+3','1d20+3',"'RPG Tools'!B5"],
  ['Strength','stat','10',null,"'RPG Tools'!B6"],
  ['Stealth','roll','+5','1d20+5',"'RPG Tools'!B8"],
  ['Longbow damage','roll',null,'1d8+4',"'RPG Tools'!B9"],
  ['Speed','stat','30 ft',null,"'RPG Tools'!B10"],
 ]);
 assert.equal(new Set(items.map(i=>i.id)).size,items.length);
 assert.equal(items.every(i=>parseCell(i.cell)),true);
 // A renamed slot survives reading the tab again.
 const again=templateItems(tab,items.map(i=>i.name==='HP'?{...i,label:'Stress'}:i));
 assert.equal(again.find(i=>i.name==='HP').label,'Stress');
 // The cap holds.
 const big={name:'RPG Tools',rows:[['Name','Value','Roll'],...Array.from({length:500},(_,i)=>['n'+i,String(i),''])]};
 assert.equal(templateItems(big).length,200);
});

test('our template is the same layout the reader wants, from our own fixture names', () => {
 const csv=templateCsv(),rows=parseCsv(csv);
 assert.deepEqual(rows,templateRows());
 const tab=findTemplateTab([{name:'RPG Tools',rows}]);
 assert.ok(tab,'the template is detected as a template');
 const items=templateItems(tab);
 assert.equal(items.find(i=>i.kind==='hp').value,'24');
 assert.equal(items.find(i=>i.name==='Stealth').formula,'1d20+5');
 assert.doesNotMatch(csv,/\b(D&D|Pathfinder|Dungeons)\b/i);
 assert.match(csv,/\r\n$/);
});

const cellsSheet=(extra={})=>({source:'google',spreadsheetId:SHEET_ID,title:'Ayla - Salt Road',tab:'Sheet1',mode:'cells',writeBack:false,items:[
 {id:'a',name:'Strength',cell:'Sheet1!B3',kind:'stat'},
 {id:'b',name:'Stealth',cell:'B9',kind:'roll',formula:'1d20+5',value:'old'},
 {id:'c',name:'Gone',cell:'Sheet9!A1',kind:'stat',value:'kept'},
 {id:'d',name:'Blank',cell:'Sheet1!D1',kind:'stat',value:'was set'},
],...extra});

test('reading again fills the cached values, keeps what it cannot find, and clears a cell that went blank', () => {
 const {sheet,missing}=refreshSheet(cellsSheet(),ayla(),'2026-11-14T10:00:00.000Z');
 assert.deepEqual(sheet.items.map(i=>[i.id,i.value??null]),[['a','10'],['b','+5'],['c','kept'],['d',null]]);
 assert.deepEqual(missing,['Gone']);
 assert.equal(sheet.readAt,'2026-11-14T10:00:00.000Z');
 assert.equal(sheet.items[1].formula,'1d20+5','a roll keeps its formula');
 assert.equal(sheetSchema.safeParse(sheet).success,true);
 assert.equal(cellText(ayla(),'B3'),'10','a bare cell reads the first tab');
 assert.equal(cellText(ayla(),"'RPG Tools'!B5"),'+3');
 assert.equal(cellText(ayla(),'rpg tools!B5'),'+3','tab names match in any case');
 assert.equal(cellText(ayla(),'Nope!A1'),undefined);
});

test('template mode follows the tab: new rows appear, removed rows go, and a missing tab says so', () => {
 const tpl={source:'published',publishedUrl:PUB_URL,title:'T',tab:'RPG Tools',mode:'template',writeBack:false,items:[{id:'old',name:'Old row',cell:"'RPG Tools'!B99",kind:'stat'}]};
 const {sheet,missing}=refreshSheet(tpl,ayla(),'2026-11-14T10:00:00.000Z');
 assert.equal(sheet.items.length,8);assert.equal(sheet.items.some(i=>i.id==='old'),false);assert.deepEqual(missing,[]);
 assert.throws(()=>refreshSheet(tpl,[ayla()[0]],'2026-11-14T10:00:00.000Z'),/RPG Tools/);
});

test('the ranges asked of the Sheets API are the template tab, or each tab with a picked cell', () => {
 assert.deepEqual(refreshRanges({mode:'template',items:[]}),[{name:'RPG Tools',range:'A1:C201'}]);
 assert.deepEqual(refreshRanges(cellsSheet()).map(r=>r.name).sort(),['Sheet1','Sheet9']);
 assert.deepEqual(refreshRanges({mode:'cells',tab:'Combat',items:[]}),[{name:'Combat',range:'A1:Z201'}]);
 assert.deepEqual(refreshRanges({mode:'cells',items:[{cell:'B3'}]},'Main'),[{name:'Main',range:'A1:Z201'}]);
});

test('named ranges become one cell and a readable label', () => {
 const titleOf=id=>({0:'Sheet1',7:'Combat stats'})[id];
 assert.equal(namedRangeCell({sheetId:0,startRowIndex:2,endRowIndex:3,startColumnIndex:4,endColumnIndex:5},titleOf),'Sheet1!E3');
 assert.equal(namedRangeCell({sheetId:7,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:1},titleOf),"'Combat stats'!A1");
 assert.equal(namedRangeCell({sheetId:0,startRowIndex:0,endRowIndex:3,startColumnIndex:0,endColumnIndex:1},titleOf),null,'a column of cells is not one value');
 assert.equal(namedRangeCell({sheetId:9,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:1},titleOf),null,'an unknown tab');
 assert.equal(labelFromRangeName('ArmorClass'),'Armor Class');
 assert.equal(labelFromRangeName('Longbow_Attack'),'Longbow Attack');
 assert.equal(labelFromRangeName('max-hp'),'max hp');
});

test('the page layout puts hit points with their maximum and the renamed label first', () => {
 const items=[
  {id:'1',name:'Strength',kind:'stat',value:'10'},{id:'2',name:'Stress',kind:'hp',value:'3',label:'Stress'},{id:'3',name:'Max HP',kind:'maxHp',value:'9'},
  {id:'4',name:'AC',kind:'ac',label:'Armour',value:'2'},{id:'5',name:'Sneak',kind:'roll',formula:'4d6kh3'},{id:'6',name:'Initiative',kind:'init',value:'+3',formula:'1d20+3'},
 ];
 const l=sheetLayout(items);
 assert.deepEqual(l.tiles.map(t=>[t.kind,t.label,t.value,t.max??null]),[['hp','Stress','3','9'],['ac','Armour','2',null],['init','Initiative','+3',null]]);
 assert.equal(l.tiles[0].ratio,1/3);
 assert.deepEqual(l.stats.map(s=>s.name),['Strength']);assert.deepEqual(l.rolls.map(s=>s.name),['Sneak']);assert.equal(l.initFormula,'1d20+3');
 assert.equal(sheetLayout([{id:'1',name:'HP',kind:'hp',value:'30'},{id:'2',name:'Max',kind:'maxHp',value:'20'}]).tiles[0].ratio,1,'never over a full bar');
 assert.equal(sheetLayout([{id:'1',name:'HP',kind:'hp',value:'x'}]).tiles[0].ratio,undefined);
 assert.deepEqual(sheetLayout([{id:'1',name:'Max HP',kind:'maxHp',value:'31'}]).tiles.map(t=>t.kind),['maxHp']);
 assert.deepEqual(sheetLayout([]).tiles,[]);
});

test('rolls group into saves, attacks and the rest, leaving out empty groups', () => {
 const names=gs=>gs.map(g=>[g.title,g.rolls.map(r=>r.name)]);
 assert.deepEqual(names(rollGroups([{name:'Stealth'},{name:'Wisdom save'},{name:'Longbow attack'},{name:'Longbow damage'}])),[['Skills and other',['Stealth']],['Saves',['Wisdom save']],['Attacks and damage',['Longbow attack','Longbow damage']]]);
 assert.deepEqual(names(rollGroups([{name:'Sneak'},{name:'Fortune'}])),[['Rolls',['Sneak','Fortune']]]);
 assert.deepEqual(rollGroups([]),[]);
});

test('time ago reads naturally', () => {
 const now=Date.parse('2026-11-14T12:00:00.000Z'),at=s=>new Date(now-s*1000).toISOString();
 assert.equal(timeAgo(at(5),now),'just now');assert.equal(timeAgo(at(60),now),'a minute ago');assert.equal(timeAgo(at(120),now),'2 minutes ago');
 assert.equal(timeAgo(at(3600),now),'an hour ago');assert.equal(timeAgo(at(3*3600),now),'3 hours ago');assert.equal(timeAgo(at(2*86400),now),'2 days ago');
 assert.equal(timeAgo(undefined,now),'');assert.equal(timeAgo('nope',now),'');assert.equal(timeAgo(at(-500),now),'just now');
});

test('Open goes to the sheet itself, or the published page, and never anywhere else', () => {
 assert.equal(sheetOpenUrl({source:'google',spreadsheetId:SHEET_ID}),`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
 assert.equal(sheetOpenUrl({source:'published',publishedUrl:PUB_URL}),PUB_URL);
 assert.equal(sheetOpenUrl({source:'published',publishedUrl:'javascript:alert(1)'}),null);
 assert.equal(sheetOpenUrl({source:'google'}),null);
});

// ---- Player safety ---------------------------------------------------------------------------

const fullSheet=()=>sheetSchema.parse({source:'google',spreadsheetId:SHEET_ID,title:'Ayla - Salt Road',tab:'Sheet1',linkedBy:'Cael',readAt:'2026-11-14T10:00:00.000Z',mode:'cells',writeBack:true,items:[
 {id:'a',name:'HP',cell:'Sheet1!E3',kind:'hp',value:'24'},{id:'b',name:'Stealth',cell:'Sheet1!B11',kind:'roll',value:'+5',formula:'1d20+5',label:'Sneaking'},
]});
const SECRETS=[SHEET_ID,PUB_ID,'Cael','Sheet1!'];

test('the player copy is an allowlist: values and formulas, never the sheet id, link, who linked it or the cells', () => {
 const p=playerSheet({...fullSheet(),source:'published',publishedUrl:PUB_URL});
 assert.deepEqual(Object.keys(p).sort(),['items','readAt','title']);
 assert.deepEqual(p.items[1],{id:'b',name:'Stealth',kind:'roll',label:'Sneaking',value:'+5',formula:'1d20+5'});
 const text=JSON.stringify(p);
 for(const s of [...SECRETS,PUB_URL,'cell','linkedBy','spreadsheetId','publishedUrl','writeBack'])assert.ok(!text.includes(s),s);
 const gone=withoutLinkDetails(fullSheet()),t2=JSON.stringify(gone);
 for(const s of [SHEET_ID,'Cael','"tab"'])assert.ok(!t2.includes(s),s);
 assert.equal(gone.items.length,2);
});

const world=(character,overview='gm')=>{
 const w=structuredClone(demoWorkspace());
 const e=w.entries.find(x=>x.id==='demo-mara');
 e.overviewVisibility=overview;e.character={...(e.character??{role:'npc',group:'',tags:[],location:'',faction:'',status:'active',statsVisibility:'gm',statsByCampaign:{}}),...character};
 return workspaceSchema.parse(w);
};
const C='demo-campaign';
const forPlayers=(w)=>playerCampaign(w,C).entries.find(e=>e.id==='demo-mara');

test('players get cached values only when the character stats are player visible', () => {
 const shared=forPlayers(world({statsVisibility:'players',sheet:fullSheet()},'players'));
 assert.equal(shared.sheet.title,'Ayla - Salt Road');assert.equal(shared.sheet.items[0].value,'24');
 const hidden=forPlayers(world({statsVisibility:'gm',sheet:fullSheet()},'players'));
 assert.equal(hidden.sheet,undefined,'a GM-only Stats tab keeps the sheet GM only');
 assert.equal(JSON.stringify(hidden).includes('Ayla - Salt Road'),false);
 // A page shared only for its sheet still reaches players, and without any other private text.
 const only=forPlayers(world({statsVisibility:'players',sheet:fullSheet()},'gm'));
 assert.equal(only.sheet.items.length,2);assert.deepEqual(only.tabs,[]);
 // No sheet, no sheet.
 assert.equal(forPlayers(world({statsVisibility:'players'},'players')).sheet,undefined);
});

test('nothing that could open the sheet reaches the player payload, whatever the visibility', () => {
 for(const [stats,overview] of [['players','players'],['players','gm'],['gm','players']]){
  for(const sheet of [fullSheet(),{...fullSheet(),source:'published',writeBack:false,spreadsheetId:undefined,publishedUrl:PUB_URL}]){
   const text=JSON.stringify(playerCampaign(world({statsVisibility:stats,sheet},overview),C));
   for(const s of [SHEET_ID,PUB_ID,'docs.google.com','Cael','spreadsheetId','publishedUrl','linkedBy'])assert.ok(!text.includes(s),`${s} (${stats}/${overview})`);
  }
 }
});

test('a players-only AI connection gets the sheet only with player-visible stats, and never the link details', async () => {
 const read=async(w)=>{
  const full=campaignExport(w,C),limited=narrow({book:full,campaign:full.campaigns[0],maps:null,level:'read',perms:{...presets.gm,seeSecrets:'off'}});
  return {limited,text:JSON.stringify(limited.book)};
 };
 const shown=await read(world({statsVisibility:'players',sheet:fullSheet()},'players'));
 const mara=shown.limited.book.entries.find(e=>e.id==='demo-mara');
 assert.equal(mara.character.sheet.items[0].value,'24');
 for(const s of [SHEET_ID,'Cael','"tab"'])assert.ok(!shown.text.includes(s),s);
 const hidden=await read(world({statsVisibility:'gm',sheet:fullSheet()},'players'));
 assert.equal(hidden.limited.book.entries.find(e=>e.id==='demo-mara').character.sheet,undefined);
 assert.ok(!hidden.text.includes('Ayla - Salt Road'));
 // A GM-level connection reads the values (no cells or links) through read_page.
 const gm=campaignExport(world({statsVisibility:'gm',sheet:fullSheet()},'players'),C);
 const page=JSON.parse((await callTool({book:gm,campaign:gm.campaigns[0],maps:null,level:'read',perms:{...presets.gm}},'read_page',{page:'Mara Venn'})).content[0].text.replace(/^Campaign text.*\n/,''));
 assert.equal(page.character.sheet.items[0].name,'HP');
 assert.ok(!JSON.stringify(page).includes(SHEET_ID));
});

test('a character keeps its sheet through the workspace schema, and a bad one is refused', () => {
 const w=world({sheet:fullSheet()});
 assert.equal(w.entries.find(e=>e.id==='demo-mara').character.sheet.spreadsheetId,SHEET_ID);
 assert.throws(()=>world({sheet:{...fullSheet(),spreadsheetId:undefined}}));
});

// ---- Published reader ------------------------------------------------------------------------

function web(routes){
 const asked=[];
 const f=async(url,init={})=>{
  asked.push({url:String(url),redirect:init.redirect});
  const hit=routes.find(r=>String(url).includes(r.match));
  if(!hit)throw Error('unexpected '+url);
  const {status=200,type='text/csv',body='',location}=hit;
  return new Response(body,{status,headers:{'content-type':type,...(location?{location}:{})}});
 };
 f.asked=asked;return f;
}
const pubhtml=`<html><head><title>Ayla - Salt Road - Google Drive</title></head><body><ul id="sheet-menu"><li id="sheet-button-0" class="active"><a href="#gid=0">Sheet1</a></li><li id="sheet-button-555"><a href="#gid=555">RPG Tools</a></li></ul></body></html>`;

test('published pages list their title and tabs', () => {
 assert.deepEqual(pagedTabs(pubhtml),{title:'Ayla - Salt Road',tabs:[{name:'Sheet1',gid:'0'},{name:'RPG Tools',gid:'555'}]});
 assert.deepEqual(pagedTabs('<script>items.push({name: "Combat \\"notes\\"", pageUrl: "x", gid: "42"});</script>').tabs,[{name:'Combat "notes"',gid:'42'}]);
 assert.deepEqual(pagedTabs('<html>nothing</html>'),{title:undefined,tabs:[]});
});

test('a published link is read tab by tab over docs.google.com only', async () => {
 const f=web([{match:'/pubhtml',type:'text/html',body:pubhtml},{match:'gid=0',body:'Strength,10\nDexterity,17\n'},{match:'gid=555',body:'Name,Value,Roll\nHP,24,\nStealth,+5,1d20+5\n'}]);
 const r=await readPublishedSheet(`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub?output=csv`,f);
 assert.equal(r.title,'Ayla - Salt Road');assert.equal(r.url,PUB_URL);
 assert.deepEqual(r.tabs.map(t=>t.name),['Sheet1','RPG Tools']);
 assert.deepEqual(r.tabs[0].rows,[['Strength','10'],['Dexterity','17']]);
 assert.ok(findTemplateTab(r.tabs));
 assert.ok(f.asked.every(a=>a.url.startsWith('https://docs.google.com/')&&a.redirect==='manual'));
 // A link naming one tab reads only that tab.
 const one=web([{match:'/pubhtml',type:'text/html',body:pubhtml},{match:'gid=555',body:'Name,Value,Roll\nHP,24,\n'}]);
 const r2=await readPublishedSheet(`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pubhtml?gid=555&single=true`,one);
 assert.deepEqual(r2.tabs.map(t=>t.name),['RPG Tools']);
 // When the page cannot be listed, the one tab is still read.
 const bare=web([{match:'/pubhtml',status:500,type:'text/html',body:'x'},{match:'output=csv',body:'a,b\n'}]);
 const r3=await readPublishedSheet(`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub?output=csv`,bare);
 assert.equal(r3.title,'Published sheet');assert.deepEqual(r3.tabs[0].rows,[['a','b']]);
});

test('the reader refuses other hosts, private sheets, web pages and oversized replies with something to do', async () => {
 const fail=async(link,f,re)=>{await assert.rejects(()=>readPublishedSheet(link,f),e=>e instanceof SheetReadError&&re.test(e.message));};
 const link=`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub?output=csv`;
 await fail('https://evil.example/spreadsheets/d/e/'+PUB_ID+'/pub',web([]),/docs\.google\.com/);
 await fail(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,web([]),/editing link/);
 await fail(link,web([{match:'/pubhtml',status:302,location:'https://accounts.google.com/signin'},{match:'output=csv',status:302,location:'https://accounts.google.com/signin'}]),/isn't published/);
 await fail(link,web([{match:'/pubhtml',status:500,body:''},{match:'output=csv',status:302,location:'https://evil.example/x'}]),/somewhere RPG Tools doesn't read/);
 await fail(link,web([{match:'/pubhtml',type:'text/html',body:pubhtml},{match:'gid=0',status:404,body:'no'}]),/isn't published/);
 await fail(link,web([{match:'/pubhtml',status:500,body:''},{match:'output=csv',type:'text/html',body:'<html>'}]),/web page/);
 await fail(link,web([{match:'/pubhtml',status:500,body:''},{match:'output=csv',body:'x'.repeat(2_000_001)}]),/too big/);
 // A redirect that stays on docs.google.com is followed.
 const hop=web([{match:'/pubhtml',status:500,body:''},{match:'output=csv&single',status:307,location:'https://docs.google.com/spreadsheets/u/0/d/e/'+PUB_ID+'/pub?output=csv&hop=1'},{match:'hop=1',body:'a,b\n'}]);
 assert.deepEqual((await readPublishedSheet(link,hop)).tabs[0].rows,[['a','b']]);
 // Google serves a published CSV by redirecting to a sheets.googleusercontent.com host; that is followed too.
 const csv=web([{match:'/pubhtml',status:500,body:''},{match:'output=csv&single',status:302,location:'https://doc-04-9s-sheets.googleusercontent.com/pub/abc/def/1794648075000/123/*/e@'+PUB_ID+'?output=csv'},{match:'googleusercontent.com/pub/',body:'Ayla,,\nHP,,24\n'}]);
 assert.deepEqual((await readPublishedSheet(link,csv)).tabs[0].rows,[['Ayla','',''],['HP','','24']]);
 // Other googleusercontent.com hosts, look-alikes, plain http and odd ports are still refused.
 for(const location of['https://lh3.googleusercontent.com/x','https://doc-04-9s-sheets.googleusercontent.com.evil.example/x','https://evil-doc-04-9s-sheets.googleusercontent.com/x','http://doc-04-9s-sheets.googleusercontent.com/x','https://doc-04-9s-sheets.googleusercontent.com:8443/x'])
  await fail(link,web([{match:'/pubhtml',status:500,body:''},{match:'output=csv',status:302,location}]),/somewhere RPG Tools doesn't read/);
});

// ---- Review fixes ------------------------------------------------------------------------------

test('dice matching stays fast on hostile input and still refuses non-dice', () => {
 for(const bad of ['1d20'+'k'.repeat(30)+'x','1d20'+'kh'.repeat(2500)+'x','1d6'+'+1'.repeat(2500)+'x','d'.repeat(5000),'1d20'+'!'.repeat(5000)+'?','1d20'+'>='.repeat(2500)+'y']){
  const t=performance.now();
  assert.equal(isDice(bad),false);
  assert.ok(performance.now()-t<50,`took ${performance.now()-t} ms for ${bad.length} chars`);
 }
 const t=performance.now();guessFormula('1d20'+'k'.repeat(5000)+'x',true);guessPick('Sneak','4d6'+'k'.repeat(5000)+'x',true);
 assert.ok(performance.now()-t<50);
 for(const bad of ['1d20x','d20d','1d','2d6kk!!x','1d6+','1d6 +d','abc','1d20 5','1d6++1'])assert.equal(isDice(bad),false,bad);
 for(const good of ['2d6kh1kl1','4d6kh3+2','2d10!>=8','1d20 + 1d4 + 2'])assert.equal(isDice(good),true,good);
});

test('all routes read the same number of rows', () => {
 assert.equal(clipRows(Array.from({length:500},()=>['x'])).length,GRID_ROWS);
 assert.deepEqual(refreshRanges({mode:'template',items:[]}),[{name:'RPG Tools',range:`A1:C${GRID_ROWS}`}]);
});

const sheetWorld=()=>world({statsVisibility:'gm',sheet:fullSheet()},'players');
test('a co-GM save cannot link, change or remove the owner\'s sheet', () => {
 const full=sheetWorld(),mara=w=>w.entries.find(e=>e.id==='demo-mara');
 const edit=f=>{const c=campaignExport(full,C);const e=mara(c);f(e);return c;};
 const swapped=edit(e=>{e.character.sheet={...e.character.sheet,spreadsheetId:'ZZZZZZZZZZZZZZZZZZZZ',title:'Taken over'};e.character.role='pc';});
 const out=mara(applyCoGmEdit(full,C,swapped)).character;
 assert.deepEqual(out.sheet,fullSheet(),'the owner\'s sheet stays exactly as it was');
 assert.equal(out.role,'pc','the co-GM\'s other character edits still apply');
 assert.deepEqual(mara(applyCoGmEdit(full,C,edit(e=>{delete e.character.sheet;}))).character.sheet,fullSheet(),'removing it is undone');
 const plain=world({statsVisibility:'gm'},'players');
 assert.equal(mara(applyCoGmEdit(plain,C,edit.call(null,()=>{}) && (()=>{const c=campaignExport(plain,C);mara(c).character.sheet=fullSheet();return c;})())).character.sheet,undefined,'nor can a co-GM add one');
});

test('a player save never changes the sheet', () => {
 const w=sheetWorld(),rights={edit:new Set(['demo-mara']),subPages:new Set(),made:new Set()};
 const next=savePlayerEdit(w,C,rights,{entryId:'demo-mara',title:'Mara Venn, edited',tabs:[{id:'overview',body:'New text.'}]},{name:'Wren',as:'player'});
 const mara=next.entries.find(e=>e.id==='demo-mara');
 assert.equal(mara.body,'New text.');assert.deepEqual(mara.character.sheet,fullSheet());
});

test('the older campaign-key reader also hides the sheet id, link and linker', () => {
 const full=world({statsVisibility:'gm',sheet:{...fullSheet(),source:'published',writeBack:false,spreadsheetId:undefined,publishedUrl:PUB_URL}},'players');
 const scope=campaignExport(full,C);
 const all=JSON.stringify([callReadTool(scope,'read_campaign',{campaign_id:C}),callReadTool(scope,'read_article',{campaign_id:C,article_id:'demo-mara'})]);
 for(const x of [PUB_ID,'docs.google.com','Cael','spreadsheetId','publishedUrl','linkedBy','"cell"','"mode"','"source"'])assert.ok(!all.includes(x),x);
 assert.ok(all.includes('Ayla - Salt Road')&&all.includes('1d20+5'));
});

test('the players-only book holds the allow-list shape, nothing more', () => {
 const full=campaignExport(world({statsVisibility:'players',sheet:fullSheet()},'players'),C);
 const limited=narrow({book:full,campaign:full.campaigns[0],maps:null,level:'read',perms:{...presets.gm,seeSecrets:'off'}});
 const sheet=limited.book.entries.find(e=>e.id==='demo-mara').character.sheet;
 assert.deepEqual(Object.keys(sheet).sort(),['items','readAt','title']);
 assert.deepEqual(Object.keys(sheet.items[0]).sort(),['id','kind','name','value']);
});

test('the sheet route checks sign-in, origin, size and pace, then reads', async () => {
 const run=(r,d)=>{resetThrottle();return handleSheetRead(r,d);};
 const req=(body='{"action":"read","link":"x"}',headers={})=>new Request('https://app.test/api/encyclopedia/sheet',{method:'POST',body,headers:{Origin:'https://app.test','content-type':'application/json',...headers}});
 const deps=(over={})=>({owner:async()=>'u1',sameOrigin:r=>r.headers.get('Origin')==='https://app.test',read:async l=>({title:'T',url:l,tabs:[]}),...over});
 assert.equal((await run(req(),deps({owner:async()=>null}))).status,401);
 assert.equal((await run(req(undefined,{Origin:'https://evil.test'}),deps())).status,403);
 assert.equal((await run(req(undefined,{'content-length':String(MAX_BODY+1)}),deps())).status,413);
 assert.equal((await run(req('{"action":"read","link":"'+'x'.repeat(MAX_BODY)+'"}'),deps())).status,413);
 assert.equal((await run(req('{"action":"nope"}'),deps())).status,400);
 assert.equal((await run(req('not json'),deps())).status,400);
 const ok=await run(req(),deps());
 assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'private, no-store');assert.equal((await ok.json()).title,'T');
 const bad=await run(req(),deps({read:async()=>{throw new SheetReadError('That sheet isn\'t published.');}}));
 assert.equal(bad.status,400);assert.match((await bad.json()).error,/isn't published/);
 assert.equal((await run(req(),deps({read:async()=>{throw new Error('secret internals');}}))).status,400);
});

test('reads are throttled per owner over ten seconds', () => {
 resetThrottle();
 const t=1_000_000;
 for(let i=0;i<5;i++)assert.equal(throttled('a',t+i),false);
 assert.equal(throttled('a',t+6),true);
 assert.equal(throttled('b',t+6),false,'another owner is unaffected');
 assert.equal(throttled('a',t+10_001),false,'the window moves on');
});

test('the published reader has one deadline for the whole read, and refuses odd ports', async () => {
 const slow=async(url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted'))));
 const keep=setTimeout(()=>{},3000),t=performance.now(); // The deadline's own timer doesn't hold a process open, so this does.
 await assert.rejects(()=>readPublishedSheet(`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub?output=csv`,slow,60),e=>e instanceof SheetReadError&&/too long/.test(e.message));
 clearTimeout(keep);assert.ok(performance.now()-t<1000);
 const port=web([{match:'/pubhtml',status:500,body:''},{match:'output=csv',status:302,location:'https://docs.google.com:8443/x'}]);
 await assert.rejects(()=>readPublishedSheet(`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pub?output=csv`,port),/somewhere RPG Tools doesn't read/);
});

test('published tab names decode numeric and named entities', () => {
 const html='<title>Ayla&#39;s &amp; Borin&#x27;s sheet &#128512;</title><li id="sheet-button-1"><a href="#">Cael&#x27;s &lt;tab&gt;</a></li>';
 const r=pagedTabs(html);
 assert.equal(r.title,"Ayla's & Borin's sheet \u{1F600}");assert.equal(r.tabs[0].name,"Cael's <tab>");
 assert.equal(pagedTabs('<title>&#9999999;x</title>').title,'x');
});
