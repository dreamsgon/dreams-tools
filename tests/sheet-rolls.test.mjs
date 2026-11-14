import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseDice,rollDice,describeParts,partText,withKeepMode,isSingleD20,rollTwice,termRange,termLabel,MAX_EXPLOSIONS} from '../lib/rolls.ts';
import {sheetRollGroups,itemFormula,diceHelpText} from '../lib/encyclopedia/sheet-rolls.ts';
import {sheetSchema,templateItems,templateRows,playerSheet,withoutLinkDetails} from '../lib/encyclopedia/sheet-link.ts';
import {formulaRange,tableDice,librarySchema as tableLibrarySchema} from '../lib/encyclopedia/tables.ts';

/** A random source that answers with the given die faces in turn (each die has `sides` sides). */
const faces=(sides,...values)=>{let i=0;return()=>{const v=values[i++];if(v===undefined)throw Error('ran out of dice');return (v-0.5)/sides;};};
/** The same numbers every run. */
const seeded=seed=>()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};

test('plain formulas read and roll exactly as before', () => {
 assert.deepEqual(parseDice('1d20+9'),[{sign:1,count:1,sides:20,constant:0},{sign:1,count:0,sides:0,constant:9}]);
 assert.deepEqual(parseDice(' 2D6 - 1 + d4 '),[{sign:1,count:2,sides:6,constant:0},{sign:-1,count:0,sides:0,constant:1},{sign:1,count:1,sides:4,constant:0}]);
 const r=rollDice('2d6+4',faces(6,5,4));
 assert.equal(r.total,13);assert.equal(describeParts(r.parts),'(5, 4) + 4');
 assert.equal(describeParts(rollDice('1d20+5',faces(20,14)).parts),'14 + 5');
 assert.equal(describeParts(rollDice('1d8-1d4',seeded(3)).parts).split(' ')[1],'−');
 assert.equal(rollDice('1d20+5',faces(20,20)).natural,20);assert.equal(rollDice('2d6',faces(6,1,1)).natural,null);assert.equal(rollDice('1d12',faces(12,12)).natural,null);
 assert.deepEqual(formulaRange('2d6+1'),[3,13]);
 for(const bad of ['','1d20*2','2d','d','0d6','101d6','1d1','1d1001','process.exit()','1d6++2','1d6+','--5','1d20 +  [x]'])assert.throws(()=>parseDice(bad),bad);
 assert.throws(()=>parseDice(Array(21).fill('1d4').join('+')));
 assert.doesNotThrow(()=>parseDice(Array(20).fill('1d4').join('+')));
 assert.throws(()=>parseDice('1d6+100001'));
});

test('keep highest or lowest dice', () => {
 const hi=rollDice('4d6kh3',faces(6,2,6,4,5));
 assert.deepEqual(hi.parts[0].dice,[6,4,5]);assert.deepEqual(hi.parts[0].dropped,[2]);assert.equal(hi.total,15);
 assert.equal(describeParts(hi.parts),'(6, 4, 5) (dropped 2)');
 const lo=rollDice('2d20kl1+3',faces(20,13,5));
 assert.equal(lo.total,8);assert.equal(describeParts(lo.parts),'5 (dropped 13) + 3');
 assert.equal(rollDice('2d20kh',faces(20,3,17)).total,17,'kh with no number keeps one');
 assert.equal(rollDice('3d8kl',faces(8,3,2,7)).total,2);
 assert.equal(rollDice('2D20KH1',faces(20,3,17)).total,17,'upper case');
 assert.equal(rollDice('2d6kh1-1d4',seeded(5)).parts.length,2);
 assert.equal(rollDice('4d6kh4',faces(6,1,1,1,1)).total,4);
 assert.deepEqual(termRange(parseDice('4d6kh3')[0]),[3,18]);
});

test('exploding dice roll again on their highest number and always stop', () => {
 const r=rollDice('2d6!',faces(6,6,6,2,4));
 assert.deepEqual(r.parts[0].dice,[6,6,2,4]);assert.deepEqual(r.parts[0].bang,[true,true,false,false]);assert.equal(r.total,18);
 assert.equal(describeParts(r.parts),'(6!, 6!, 2, 4)');
 assert.equal(describeParts(rollDice('1d6!+2',faces(6,6,3)).parts),'(6!, 3) + 2');
 assert.equal(describeParts(rollDice('1d6!',faces(6,3)).parts),'3');
 const endless=rollDice('1d6!',()=>0.999999);
 assert.equal(endless.parts[0].dice.length,1+MAX_EXPLOSIONS);
 const many=rollDice('100d2!',()=>0.999999);assert.equal(many.parts[0].dice.length,100+MAX_EXPLOSIONS);
 assert.ok(rollDice('3d6!',seeded(7)).total>=3);
});

test('roll-under success counting (<=)', () => {
 const r=rollDice('2d20<=14',faces(20,14,15));
 assert.equal(r.total,1);assert.equal(r.parts[0].successes,1);assert.equal(describeParts(r.parts),'(14, 15) 1 success');
 assert.equal(describeParts(rollDice('3d20<=10',faces(20,3,10,11)).parts),'(3, 10, 11) 2 successes');
 assert.equal(rollDice('4d6<=6',faces(6,6,6,6,6)).total,4);assert.equal(rollDice('4d6<=1',faces(6,6,5,1,2)).total,1);
 assert.equal(termLabel(parseDice('2d20<=14')[0]),'2d20<=14');assert.equal(termLabel(parseDice('5d10>=8')[0]),'5d10>=8');
 for(const bad of ['2d20<=14+2','1d6+2d20<=14','2d20<=21','2d20<=0','2d20<=','2d20<14','2d20<=14!','2d20kh1<=14','2d20<=14<=3','2d20<=14>=3','-2d20<=14','4dF<=2']) assert.throws(()=>parseDice(bad),bad);
 assert.deepEqual(termRange(parseDice('2d20<=14')[0]),[0,2]);
 const random=seeded(11),a=rollDice('10d20<=10',random);assert.equal(a.total,a.parts[0].dice.filter(v=>v<=10).length);
 assert.equal(rollDice('2d20<=14',seeded(3)).natural,null,'a success pool has no natural result');
 const t0=Date.now();for(const evil of ['1d6<='+'9'.repeat(100000),'1d6<='.repeat(30000),'2d20'+'<='.repeat(50000)])assert.throws(()=>parseDice(evil));
 assert.ok(Date.now()-t0<1000,'long input is cut off quickly');
});

test('success counting', () => {
 const r=rollDice('5d10>=8',faces(10,10,8,3,9,1));
 assert.equal(r.total,3);assert.equal(r.parts[0].successes,3);assert.equal(describeParts(r.parts),'(10, 8, 3, 9, 1) 3 successes');
 assert.equal(describeParts(rollDice('2d10>=10',faces(10,10,2)).parts),'(10, 2) 1 success');
 assert.equal(rollDice('3d6>=7'.replace('7','6'),faces(6,6,6,5)).total,2);
 assert.equal(rollDice('-0d6'.length?'4d6>=1':'',faces(6,1,2,3,4)).total,4);
 for(const bad of ['5d10>=8+2','1d6+5d10>=8','5d10>=11','5d10>=0','5d10>=','5d10>8','5d10>=8!','5d10kh2>=8']) assert.throws(()=>parseDice(bad),bad);
 assert.deepEqual(termRange(parseDice('5d10>=8')[0]),[0,5]);
});

test('plus/minus dice (dF) are -1, 0 or +1 each', () => {
 const r=rollDice('4dF',faces(6,1,2,3,5));
 assert.deepEqual(r.parts[0].dice,[-1,-1,0,1]);assert.equal(r.total,-1);assert.equal(describeParts(r.parts),'(−, −, 0, +)');
 assert.equal(rollDice('4df+2',faces(6,6,6,6,6)).total,6);
 assert.equal(describeParts(rollDice('1dF',faces(6,4)).parts),'(0)');
 for(let i=0;i<50;i++){const t=rollDice('4dF',seeded(i)).total;assert.ok(t>=-4&&t<=4);}
 for(const bad of ['4dF!','4dFkh2','dFx','4dF>=1'])assert.throws(()=>parseDice(bad),bad);
 assert.deepEqual(termRange(parseDice('4dF')[0]),[-4,4]);
 assert.equal(rollDice('4dF',faces(6,1,1,1,1)).natural,null);
});

test('limits and bad keep, explode and success input are refused', () => {
 for(const bad of ['4d6kh0','4d6kh5','4d6kl9','4d6kh1kl1','2d6!!','4d6!kh2','101d6kh1','1d1001!','1d6kx','kh1','2d6>=3>=4'])assert.throws(()=>parseDice(bad),bad);
 for(const good of ['4d6kh3','4d6kl3+2','2d20kh1','2d20kl1+5','2d6!','1d10!+3','5d10>=8','4dF','10d6!','100d6kh1'])assert.doesNotThrow(()=>parseDice(good),good);
});

test('long and hostile input is rejected quickly', () => {
 const evil=['d'.repeat(5000),'1d6'+'k'.repeat(5000),'1d6'+'kh1'.repeat(3000),'1d6'+'!'.repeat(100000),'1d20'+'+1'.repeat(100000),'1'.repeat(100000)+'d6','1d'+'9'.repeat(100000),'1d6>='+'9'.repeat(100000),'1d6+'.repeat(60000),('1d6k'+'1').repeat(40000)];
 const start=performance.now();
 for(const e of evil)assert.throws(()=>parseDice(e));
 assert.equal(parseDice('\t'.repeat(100000)+'1d6').length,1,'spaces are ignored, as before');
 assert.ok(performance.now()-start<250,`took ${performance.now()-start}ms`);
});

test('advantage and disadvantage turn a single d20 into a keep-one roll', () => {
 assert.equal(withKeepMode('1d20+5','high'),'2d20kh1+5');assert.equal(withKeepMode('1d20+5','low'),'2d20kl1+5');
 assert.equal(withKeepMode('d20-1','high'),'2d20kh1-1');assert.equal(withKeepMode('1D20','low'),'2d20kl1');assert.equal(withKeepMode('1d20 + 5','high'),'2d20kh1+5');
 assert.equal(withKeepMode('1d20+5','normal'),'1d20+5');
 for(const other of ['1d8+4','2d20+1','1d20kh1','1d200','4dF','1d20!'])assert.equal(withKeepMode(other,'high'),other,other);
 assert.ok(isSingleD20('1d20+7'));assert.ok(!isSingleD20('1d8+4'));assert.ok(!isSingleD20('1d200'));
 const adv=rollDice(withKeepMode('1d20+5','high'),faces(20,4,16));assert.equal(adv.total,21);assert.equal(adv.natural,16);
 const dis=rollDice(withKeepMode('1d20+5','low'),faces(20,20,4));assert.equal(dis.total,9);assert.equal(dis.natural,4,'a nat 20 dropped by disadvantage is not a natural 20');
 assert.equal(rollDice('2d20kh1',faces(20,20,3)).natural,20);
});

test('on other formulas, roll twice keeps the higher or lower total and shows both', () => {
 const hi=rollTwice('1d8+4','high',faces(8,2,7));
 assert.equal(hi.kept.total,11);assert.equal(hi.dropped.total,6);
 const lo=rollTwice('1d8+4','low',faces(8,2,7));
 assert.equal(lo.kept.total,6);assert.equal(lo.dropped.total,11);
 assert.equal(rollTwice('1d8','high',faces(8,5,5)).kept.total,5,'a tie keeps the first');
});

test('part descriptions', () => {
 assert.equal(partText(rollDice('4d6kh3',faces(6,2,6,4,5)).parts[0],'['),'[6, 4, 5] (dropped 2)');
 assert.equal(partText(rollDice('1d6',faces(6,4)).parts[0],'['),'[4]');
 assert.equal(describeParts(rollDice('1d6-2',faces(6,4)).parts),'4 − 2');
 assert.match(diceHelpText,/4d6kh3/);assert.match(diceHelpText,/2d6!/);assert.match(diceHelpText,/5d10>=8/);assert.match(diceHelpText,/4dF/);assert.match(diceHelpText,/2d20<=14 count dice at or under/);
});

const SHEET_ID='1AbCdEfGhIjKlMnOpQrStUvWx';
function fixture(extra=[]){
 const rows=[...templateRows(),...extra];
 return sheetSchema.parse({source:'google',spreadsheetId:SHEET_ID,title:'Ayla, Marsh Ranger',linkedBy:'gm@example.com',mode:'template',tab:'RPG Tools',readAt:'2026-01-02T03:04:05.000Z',items:templateItems({name:'RPG Tools',rows})});
}

test('the roll list is built from a sheet: skills, saves, attacks, other', () => {
 const sheet=fixture([['Dexterity save','+4','1d20+4'],['Sneak attack damage','','3d6'],['Lore','+2',''],['Broken','','1d20*3'],['Heal','','2d4+2']]);
 const groups=sheetRollGroups(playerSheet(sheet));
 const names=g=>g.rows.map(r=>r.name);
 assert.deepEqual(groups.map(g=>g.title),['Skills','Saves','Attacks','Other']);
 const by=t=>groups.find(g=>g.title===t);
 assert.deepEqual(names(by('Skills')),['Initiative','Stealth','Perception'],'a +bonus value alone is not a roll unless its kind is roll');
 assert.deepEqual(names(by('Saves')),['Dexterity save']);
 const bow=by('Attacks').rows.find(r=>r.name==='Longbow');
 assert.deepEqual(bow.buttons,[{label:'Attack',itemId:'r11',formula:'1d20+7',rollName:'Longbow attack'},{label:'Damage',itemId:'r12',formula:'1d8+4',rollName:'Longbow damage'}]);
 assert.deepEqual(by('Attacks').rows.find(r=>r.name==='Sneak attack').buttons.map(b=>b.label),['Damage']);
 assert.deepEqual(names(by('Other')),['Heal']);
 assert.ok(!JSON.stringify(groups).includes('Broken'),'a formula that is not dice is left out');
 assert.ok(!JSON.stringify(groups).includes('Hit points')&&!groups.some(g=>g.rows.some(r=>r.name==='Strength')),'stats are not rolls');
});

test('a roll with only a bonus rolls 1d20 plus it; other items roll nothing', () => {
 assert.equal(itemFormula({kind:'roll',value:'+5'}),'1d20+5');assert.equal(itemFormula({kind:'roll',value:'-2'}),'1d20-2');
 assert.equal(itemFormula({kind:'roll',value:'12'}),null);assert.equal(itemFormula({kind:'stat',value:'+5'}),null);
 assert.equal(itemFormula({kind:'roll',value:'+5',formula:'1d20 + 7'}),'1d20+7');assert.equal(itemFormula({kind:'roll',formula:'4d6kh3'}),'4d6kh3');
 assert.equal(itemFormula({kind:'roll',formula:'nope'}),null);
 assert.deepEqual(sheetRollGroups({items:[]}),[]);
 const g=sheetRollGroups({items:[{id:'a',name:'Bram Stealth',kind:'roll',value:'+6'}]});assert.equal(g[0].rows[0].buttons[0].formula,'1d20+6');
 const f=sheetRollGroups({items:[{id:'a',name:'Plus-minus',kind:'roll',formula:'4dF'},{id:'b',name:'Fury',kind:'roll',formula:'5d10>=8'}]});
 assert.deepEqual(f[0].title,'Other');assert.equal(f[0].rows.length,2);
});

test('rolling from a sheet never involves link details, and players get no rolling', async () => {
 const sheet=fixture();
 const groups=JSON.stringify(sheetRollGroups(playerSheet(sheet))),mcp=JSON.stringify(sheetRollGroups(withoutLinkDetails(sheet)));
 for(const secret of [SHEET_ID,'gm@example.com','linkedBy','spreadsheetId','publishedUrl','RPG Tools!','cell'])for(const text of [groups,mcp])assert.ok(!text.includes(secret),secret);
 assert.equal(groups,mcp);
 const shown=JSON.stringify(playerSheet(sheet));
 for(const secret of [SHEET_ID,'gm@example.com','"cell"','"tab"','"mode"'])assert.ok(!shown.includes(secret),secret);
 const player=await readFile(new URL('../components/encyclopedia/player-view.tsx',import.meta.url),'utf8');
 assert.ok(!/sheet-rolls|rollInline|SheetRolls/.test(player),'the player view has no rolling');
 const view=await readFile(new URL('../components/encyclopedia/sheet-view.tsx',import.meta.url),'utf8');
 assert.ok(/rolling\?:ReactNode/.test(view)&&!/rollInline/.test(view),'SheetView only shows rolls it is given');
 const mapApp=await readFile(new URL('../components/map-app.tsx',import.meta.url),'utf8');
 assert.ok(mapApp.includes('sheetCharacterOf={player?undefined'),'Maptable gives players no sheet menu');
});

test('random tables take plain dice, not exploding, success or plus/minus dice', () => {
 for(const bad of ['2d6!','5d10>=8','2d20<=14','4dF'])assert.throws(()=>tableDice(bad),bad);
 for(const good of ['d20','2d6+1','4d6kh3'])assert.doesNotThrow(()=>tableDice(good),good);
 assert.throws(()=>parseDice('-5d10>=8'),'a success count cannot be subtracted');
 const table={id:'t1',name:'Weather',kind:'table',category:'weather',campaignIds:[],updatedAt:'2026-01-01T00:00:00.000Z',mode:'ranges',formula:'2d6!',rows:[{id:'r1',text:'Rain',min:2,max:12}]};
 const parsed=tableLibrarySchema.safeParse({schemaVersion:1,tables:[table]});
 assert.equal(parsed.success,false);
 assert.match(JSON.stringify(parsed.error.issues),/isn’t dice/);
 assert.deepEqual(formulaRange('4d6kh3'),[3,18]);
});

test('the AI roll tool describes the new notation', async () => {
 for(const [dice,pattern] of [['4d6kh3',/4d6kh3: \(\d, \d, \d\) \(dropped \d\)/],['2d6!',/2d6!: /],['5d10>=8',/5d10>=8: \(.*\) \d+ success/],['4dF',/4dF: \([+−0, ]+\)/]]){
  const roll=rollDice(dice);
  const shown=roll.parts.filter(p=>p.count).map(p=>`${termLabel(p)}: ${p.keep||p.explode||p.target!==undefined||p.pm?partText(p):p.dice.join(', ')}`).join('; ');
  assert.match(shown,pattern);
 }
 const tools=await readFile(new URL('../lib/mcp/tools.ts',import.meta.url),'utf8');
 assert.ok(tools.includes('termLabel(p)')&&tools.includes('4d6kh3 or 2d20kl1'));
});
