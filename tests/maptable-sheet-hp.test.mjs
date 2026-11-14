import test from 'node:test';
import assert from 'node:assert/strict';
const {hpChanges,writableSheet,chooseWrites}=await import('../lib/maptable-sheet-hp.ts');
const W=await import('../lib/encyclopedia/sheet-write.ts');
const H=await import('../lib/encyclopedia/sheet-hp-request.ts');
const {demoWorkspace,workspaceSchema,defaultCharacter}=await import('../lib/encyclopedia/world-model.ts');

const ID='1AbCdEfGhIjKlMnOpQrStUvWx',PUB='https://docs.google.com/spreadsheets/d/e/2PACX-1vTestTestTestTestTestTest/pubhtml';
const items=[{id:'hp',name:'HP',cell:'Sheet1!B2',kind:'hp',value:'24'},{id:'max',name:'Max HP',cell:'Sheet1!B3',kind:'maxHp',value:'31'}];
const google=(x={})=>({source:'google',spreadsheetId:ID,title:'Ayla - Salt Road',tab:'Sheet1',mode:'cells',writeBack:true,items,...x});
const scenes=(...tokens)=>({scenes:[{id:'s1',tokens}]});
const tok=(id,hp,entryId)=>({id,hp,...(entryId?{encyclopediaEntryId:entryId}:{})});

test('HP changes are found for tokens linked to a character, in any scene state change',()=>{
 const before=scenes(tok('a',10,'ayla'),tok('b',8,'borin'),tok('c',5),tok('d',7,'cael'));
 const after=scenes(tok('a',7,'ayla'),tok('b',8,'borin'),tok('c',1),tok('d',9,'cael'),tok('e',3,'bram'));
 assert.deepEqual(hpChanges(before,after),[{entryId:'ayla',tokenId:'a',hp:7},{entryId:'cael',tokenId:'d',hp:9}],'unlinked tokens, unchanged tokens and new tokens are ignored');
 assert.deepEqual(hpChanges(after,before).map(c=>c.hp),[10,7],'undo is a change too');
 assert.deepEqual(hpChanges(before,before),[]);
 assert.deepEqual(hpChanges(null,after),[]);assert.deepEqual(hpChanges(before,undefined),[]);
 // Two tokens of one character: one entry, the last changed token wins. The same token id in another scene is a different token.
 const two={scenes:[{id:'s1',tokens:[tok('a',10,'ayla')]},{id:'s2',tokens:[tok('a',10,'ayla'),tok('x',4,'ayla')]}]};
 const moved={scenes:[{id:'s1',tokens:[tok('a',9,'ayla')]},{id:'s2',tokens:[tok('a',10,'ayla'),tok('x',2,'ayla')]}]};
 assert.deepEqual(hpChanges(two,moved),[{entryId:'ayla',tokenId:'x',hp:2}]);
 assert.deepEqual(hpChanges({scenes:[{id:'s1',tokens:[tok('a',10,'ayla')]}]},{scenes:[{id:'s9',tokens:[tok('a',3,'ayla')]}]}),[],'a token in a scene that was not there is new');
});

const book=()=>({entries:[
 {id:'ayla',kind:'character',title:'Ayla',character:{sheet:google()}},
 {id:'borin',kind:'character',title:'Borin',character:{sheet:google({writeBack:false})}},
 {id:'cael',kind:'character',title:'Cael',character:{sheet:{source:'published',publishedUrl:PUB,title:'T',mode:'cells',items}}},
 {id:'bram',kind:'character',title:'Bram',character:{sheet:google({linkedById:'a'.repeat(32),linkedBy:'Mara'})}},
 {id:'mara',kind:'character',title:'Mara',character:{sheet:google({items:items.slice(1)})}},
 {id:'town',kind:'note',title:'Greyfen docks',character:{sheet:google()}},
]});

test('only GM-linked Google sheets with write-back on and an HP cell are written',()=>{
 assert.equal(writableSheet(book(),'ayla').spreadsheetId,ID);
 for(const id of ['borin','cael','bram','mara','town','nobody'])assert.equal(writableSheet(book(),id),null,id);
 assert.equal(writableSheet(null,'ayla'),null);assert.equal(writableSheet({entries:[{id:'ayla',kind:'character',character:{sheet:{source:'google'}}}]},'ayla'),null,'a broken sheet is skipped');
 const changes=['ayla','borin','cael','bram','mara'].map((entryId,i)=>({entryId,tokenId:'t'+i,hp:3+i}));
 const picked=chooseWrites(changes,book());
 assert.deepEqual(picked.map(p=>[p.entryId,p.name,p.hp]),[['ayla','Ayla',3]]);
 assert.deepEqual(chooseWrites([{entryId:'ayla',tokenId:'t',hp:200000},{entryId:'ayla',tokenId:'t',hp:1.5}],book()),[],'out of range or fractional HP is never written');
});

test('changes coalesce per character: each waits on its own clock and writes only its latest value',()=>{
 let now=0,seq=0;const timers=new Map();
 const fake={set:(f,ms)=>{const id=++seq;timers.set(id,{f,at:now+ms});return id;},clear:id=>{timers.delete(id);}};
 const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.f();}};
 const runs=[],q=W.coalesceByKey((k,v)=>runs.push([k,v]),1500,fake);
 q.push('ayla',9);advance(1000);q.push('borin',20);advance(400);q.push('ayla',8);advance(1000);
 assert.deepEqual(runs,[],'Ayla\'s second change restarted her wait');
 advance(100);assert.deepEqual(runs,[['borin',20]],'Borin\'s wait ended on its own clock');
 advance(1300);assert.deepEqual(runs,[['borin',20],['ayla',8]]);
 q.push('ayla',1);q.push('borin',2);q.flush('ayla');assert.deepEqual(runs.at(-1),['ayla',1]);assert.equal(q.pending('borin'),true);
 q.cancel();advance(5000);assert.equal(runs.length,3);assert.equal(q.pending(),false);
});

// ---- The route's logic ------------------------------------------------------------------------

const world=(sheet=google())=>{const w=demoWorkspace(),e=w.entries.find(x=>x.kind==='character'&&x.id==='demo-mara')??w.entries.find(x=>x.kind==='character');
 return {w:workspaceSchema.parse({...w,entries:w.entries.map(x=>x.id===e.id?{...x,character:{...(x.character??defaultCharacter()),sheet}}:x)}),id:e.id};};
const NOW=new Date('2026-11-14T12:00:00Z');

test('Maptable stores HP on one character\'s sheet copy only, while write-back is on',()=>{
 const {w,id}=world(),next=H.storeHp(w,id,19,NOW),sheet=next.entries.find(e=>e.id===id).character.sheet;
 const before=w.entries.find(e=>e.id===id),after=next.entries.find(e=>e.id===id);assert.equal(after.updatedAt,before.updatedAt,'an HP number is not a page edit');assert.equal(after.editedBy,before.editedBy);
 assert.equal(sheet.items[0].value,'19');assert.equal(sheet.readAt,NOW.toISOString());assert.equal(sheet.items[1].value,'31');assert.equal(sheet.writeBack,true);
 assert.deepEqual(next.entries.filter(e=>e.id!==id).map(e=>e.id),w.entries.filter(e=>e.id!==id).map(e=>e.id));
 assert.throws(()=>H.storeHp(w,id,1.5,NOW),/whole number/);assert.throws(()=>H.storeHp(w,id,100000,NOW),/whole number/);
 assert.throws(()=>H.storeHp(world(google({writeBack:false})).w,id,5,NOW),/off/);
 assert.throws(()=>H.storeHp(world(google({linkedById:'a'.repeat(32)})).w,id,5,NOW),/linked with Google/);
 assert.throws(()=>H.storeHp(world({source:'published',publishedUrl:PUB,title:'T',mode:'cells',items}).w,id,5,NOW),/linked with Google/);
 assert.throws(()=>H.storeHp(w,'nobody',5,NOW),/no linked sheet/);
});

test('the write-back switch is turned on only for a GM-linked Google sheet with an HP cell',()=>{
 const {w,id}=world(google({writeBack:false})),on=H.storeWriteBack(w,id,true);
 assert.equal(on.entries.find(e=>e.id===id).character.sheet.writeBack,true);
 assert.equal(H.storeWriteBack(on,id,false).entries.find(e=>e.id===id).character.sheet.writeBack,false);
 assert.throws(()=>H.storeWriteBack(world(google({writeBack:false,items:items.slice(1)})).w,id,true),/no HP cell/);
 assert.throws(()=>H.storeWriteBack(world(google({writeBack:false,linkedById:'a'.repeat(32)})).w,id,true),/linked with Google/);
});

test('the sheet-hp route checks sign-in, origin, size and input, retries a crossed save, and keeps other edits',async()=>{
 H.resetThrottle();
 const {w,id}=world();let stored={data:w,revision:1},saves=0;
 const deps=(over={})=>({owner:async()=> 'gm-1',sameOrigin:()=>true,now:NOW.getTime(),store:{read:async()=>({...stored}),save:async(_o,data,rev)=>{saves++;if(saves===1){stored={data:{...stored.data,entries:stored.data.entries.map(e=>e.id===id?{...e,body:'Edited elsewhere.'}:e)},revision:2};return null;}if(rev!==stored.revision)return null;stored={data,revision:rev+1};return {revision:rev+1};}},...over});
 const post=(body,d=deps(),headers={})=>H.handleSheetHp(new Request('https://x.test/api/encyclopedia/sheet-hp',{method:'POST',body:typeof body==='string'?body:JSON.stringify(body),headers}),d);
 const res=await post({action:'hp',entryId:id,value:12});
 assert.equal(res.status,200);assert.equal(saves,2,'the first save crossed another edit and was retried');
 const e=stored.data.entries.find(x=>x.id===id);assert.equal(e.body,'Edited elsewhere.','the other edit is kept');assert.equal(e.character.sheet.items[0].value,'12');
 assert.equal((await post({action:'hp',entryId:id,value:1.5})).status,400);
 assert.equal((await post({action:'hp',entryId:id,value:5,extra:1})).status,200);
 assert.equal((await post('not json')).status,400);
 assert.equal((await post({action:'token',entryId:id})).status,400);
 assert.equal((await post({action:'hp',entryId:id,value:5},deps({owner:async()=>null}))).status,401);
 assert.equal((await post({action:'hp',entryId:id,value:5},deps({sameOrigin:()=>false}))).status,403);
 assert.equal((await post({action:'hp',entryId:id,value:'5'.repeat(1200)})).status,413);
 assert.equal((await post({action:'hp',entryId:'nobody',value:5})).status,404);
 const on=await post({action:'writeBack',entryId:id,on:false});assert.equal(on.status,200);
 assert.equal((await post({action:'hp',entryId:id,value:5})).status,409,'write-back off refuses to store HP');
});
