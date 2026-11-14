import test from 'node:test';
import assert from 'node:assert/strict';
const {sheetSchema,refreshSheet}=await import('../lib/encyclopedia/sheet-link.ts');
const W=await import('../lib/encyclopedia/sheet-write.ts');

const ID='1AbCdEfGhIjKlMnOpQrStUvWx',PUB='https://docs.google.com/spreadsheets/d/e/2PACX-1vTestTestTestTestTestTest/pubhtml';
const items=(hp='Sheet1!B2')=>[{id:'hp',name:'HP',cell:hp,kind:'hp',value:'24'},{id:'max',name:'Max HP',cell:'Sheet1!B3',kind:'maxHp',value:'31'},{id:'per',name:'Perception',cell:'Sheet1!B4',kind:'roll',value:'+4',formula:'1d20+4'}];
const google=(extra={})=>({source:'google',spreadsheetId:ID,title:'Ayla - Salt Road',tab:'Sheet1',mode:'cells',writeBack:true,items:items(),...extra});
const parse=x=>sheetSchema.parse(x);

test('the schema takes writeBack true, false or absent, and old data stays valid',()=>{
 for(const writeBack of [true,false,undefined])assert.equal(sheetSchema.safeParse(google({writeBack})).success,true);
 const { writeBack:_w, ...old }=google();void _w;
 assert.equal(parse(old).writeBack,undefined,'absent means off');
 assert.equal(sheetSchema.safeParse(google({writeBack:'yes'})).success,false);
 assert.equal(sheetSchema.safeParse({source:'published',publishedUrl:PUB,title:'T',mode:'cells',items:[],writeBack:true}).success,false,'a published link can never be written');
 assert.equal(sheetSchema.safeParse({source:'published',publishedUrl:PUB,title:'T',mode:'cells',items:[],writeBack:false}).success,true);
});

test('hpValue takes only whole numbers in range',()=>{
 for(const [v,want] of [[24,24],['24',24],[' -3 ',-3],[0,0],[W.HP_MIN,W.HP_MIN],[W.HP_MAX,W.HP_MAX]])assert.equal(W.hpValue(v),want,String(v));
 for(const v of [1.5,'1.5','abc','',NaN,Infinity,null,undefined,W.HP_MAX+1,W.HP_MIN-1,'1e3','=1+1',true,[5]])assert.equal(W.hpValue(v),null,String(v));
});

test('the write request is one values.update on the HP cell, RAW, with the tab and address encoded',()=>{
 const r=W.buildHpWrite(parse(google()),19);
 assert.equal(r.method,'PUT');
 assert.equal(r.url,`https://sheets.googleapis.com/v4/spreadsheets/${ID}/values/${encodeURIComponent("'Sheet1'!B2")}?valueInputOption=RAW`);
 assert.deepEqual(JSON.parse(r.body),{range:"'Sheet1'!B2",majorDimension:'ROWS',values:[[19]]});
 assert.ok(typeof JSON.parse(r.body).values[0][0]==='number');
 // A tab with spaces, an apostrophe and a different column.
 const odd=W.buildHpWrite(parse(google({tab:'Main',items:items("'Ayla''s sheet'!AA12")})),-4);
 assert.ok(odd.url.includes(encodeURIComponent("'Ayla''s sheet'!AA12")),odd.url);
 assert.ok(odd.url.startsWith(`https://sheets.googleapis.com/v4/spreadsheets/${ID}/values/`));
 assert.deepEqual(JSON.parse(odd.body).values,[[-4]]);
 assert.equal(JSON.parse(odd.body).range,"'Ayla''s sheet'!AA12");
 // The sheet's own tab is used when the cell names none; the read asks for formulas so none is overwritten.
 const bare=parse(google({items:items('B2')}));
 assert.ok(W.buildHpWrite(bare,5).url.includes(encodeURIComponent("'Sheet1'!B2")));
 const read=W.buildHpRead(bare);assert.equal(read.method,'GET');assert.ok(read.url.includes('valueRenderOption=FORMULA'));
});

test('only the HP cell is addressed: never max HP, other cells or a range',()=>{
 for(const sheet of [parse(google()),parse(google({items:[...items().reverse()]}))]){
  const t=W.hpTarget(sheet);assert.equal(t.ok,true);assert.equal(t.item.kind,'hp');assert.equal(t.a1,'B2');
  const body=JSON.parse(W.buildHpWrite(sheet,7).body);
  assert.equal(body.values.length,1);assert.equal(body.values[0].length,1);assert.ok(!/B3|B4|:/.test(body.range.replace(/^'[^']*'!/,'')));
 }
});

test('the request is refused for bad numbers, published links, a missing HP item, a missing tab and write-back off',()=>{
 const sheet=parse(google());
 for(const v of [1.5,'x',NaN,100000,-10000,null])assert.throws(()=>W.buildHpWrite(sheet,v),/whole number/,String(v));
 const pub={source:'published',publishedUrl:PUB,title:'T',mode:'cells',items:items()};
 assert.throws(()=>W.buildHpWrite(pub,5),/Published links can't be written to/);
 assert.equal(W.hpTarget({...pub,writeBack:true},false).ok,false);
 assert.throws(()=>W.buildHpWrite(parse(google({items:items().filter(i=>i.kind!=='hp')})),5),/no HP cell/);
 assert.throws(()=>W.buildHpWrite(parse(google({writeBack:false})),5),/off/);
 assert.throws(()=>W.buildHpWrite(parse(google({writeBack:undefined})),5),/off/);
 assert.equal(W.hpTarget(parse(google({writeBack:false})),false).ok,true,'the settings screen can still ask');
 assert.throws(()=>W.buildHpWrite(parse(google({tab:undefined,items:items('B2')})),5),/which tab/);
 assert.throws(()=>W.buildHpWrite({...google(),spreadsheetId:undefined},5));
 assert.throws(()=>W.buildHpRead(pub),/Published/);
});

test('a cell that changed in the sheet is a conflict, a formula is never overwritten',()=>{
 assert.deepEqual(W.checkHpCell('24','24',19),{kind:'ok'});
 assert.deepEqual(W.checkHpCell('24.0','24',19),{kind:'ok'},'same number');
 assert.deepEqual(W.checkHpCell('1,024','1024',19),{kind:'ok'});
 assert.deepEqual(W.checkHpCell('30','24',19),{kind:'changed',theirs:'30'});
 assert.deepEqual(W.checkHpCell('','24',19),{kind:'changed',theirs:''});
 assert.deepEqual(W.checkHpCell('19','24',19),{kind:'ok'},'already shows what we are writing');
 assert.deepEqual(W.checkHpCell('','',19),{kind:'ok'});
 assert.deepEqual(W.checkHpCell('=C2-D2','24',19),{kind:'formula',theirs:'=C2-D2'});
 assert.equal(W.cellFromAnswer({values:[[24]]}),'24');assert.equal(W.cellFromAnswer({}),'');assert.equal(W.cellFromAnswer(null),'');
});

test('the stored copy gets the new HP and read time, and nothing else',()=>{
 const sheet=parse(google({readAt:'2026-11-14T10:00:00.000Z'})),at='2026-11-14T10:05:00.000Z';
 const next=W.withHp(sheet,19,at);
 assert.equal(next.readAt,at);assert.equal(next.items[0].value,'19');
 assert.deepEqual(next.items.slice(1),sheet.items.slice(1));assert.equal(next.writeBack,true);
 assert.equal(W.withHp(sheet,1.5,at),sheet,'a bad number changes nothing');
 assert.equal(W.storedHp(next),19);assert.equal(W.storedHp({items:[{kind:'hp',value:'—'}]}),null);
 // A later read still replaces it with the sheet's value.
 const back=refreshSheet(next,[{name:'Sheet1',rows:[[],['x','25']]}],at).sheet;assert.equal(back.items[0].value,'25');assert.equal(back.writeBack,true);
});

test('write-back can only be switched on for a Google sheet with an HP cell',()=>{
 assert.equal(W.withWriteBack(parse(google({writeBack:false})),true).writeBack,true);
 assert.equal(W.withWriteBack(parse(google()),false).writeBack,false);
 const pub=parse({source:'published',publishedUrl:PUB,title:'T',mode:'cells',items:items()});
 assert.notEqual(W.withWriteBack(pub,true).writeBack,true);
 assert.notEqual(W.withWriteBack(parse(google({writeBack:false,items:[]})),true).writeBack,true);
});

test('rapid changes become one write of the latest value, flush runs it now, cancel drops it',()=>{
 let now=0,seq=0;const timers=new Map();
 const fake={set:(f,ms)=>{const id=++seq;timers.set(id,{f,at:now+ms});return id;},clear:id=>{timers.delete(id);}};
 const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.f();}};
 const runs=[],q=W.coalesce(v=>runs.push(v),1500,fake);
 q.push(24);advance(1000);q.push(23);advance(1000);q.push(22);
 assert.deepEqual(runs,[],'each change restarts the wait');assert.equal(q.pending(),true);
 advance(1499);assert.deepEqual(runs,[]);advance(1);assert.deepEqual(runs,[22]);assert.equal(q.pending(),false);
 q.push(10);q.flush();assert.deepEqual(runs,[22,10]);advance(5000);assert.deepEqual(runs,[22,10],'flush leaves no second run');
 q.flush();assert.deepEqual(runs,[22,10],'nothing pending, nothing run');
 q.push(5);q.cancel();advance(5000);assert.deepEqual(runs,[22,10]);assert.equal(q.pending(),false);
 assert.equal(W.HP_DEBOUNCE_MS,1500);
});
