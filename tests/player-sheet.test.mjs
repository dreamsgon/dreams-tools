import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AI_KEY_SECRET='test-secret-for-sheets';
const M=await import('../lib/members.ts');
const {demoWorkspace,playerCampaign,campaignExport,defaultCharacter,workspaceSchema}=await import('../lib/encyclopedia/world-model.ts');
const S=await import('../lib/encyclopedia/player-sheet.ts');
const {sheetSchema,playerSheet,withoutLinkDetails}=await import('../lib/encyclopedia/sheet-link.ts');
const {sheetRollGroups}=await import('../lib/encyclopedia/sheet-rolls.ts');
const {applyCoGmEdit}=await import('../lib/encyclopedia/co-gm-edit.ts');
const {narrow}=await import('../lib/mcp/players-only.ts');
const {presets}=await import('../lib/mcp/permissions.ts');
const R=await import('../lib/encyclopedia/player-sheet-request.ts');
const {rollWithMode}=await import('../lib/encyclopedia/roll-mode.ts');

const C='demo-campaign',T='2026-11-14T10:00:00.000Z',NOW=new Date('2026-11-14T12:00:00Z'),OWNER='gm-1';
const SHEET_ID='1AbCdEfGhIjKlMnOpQrStUvWx',PUB_ID='2PACX-1vTestTestTestTestTestTest',PUB_URL=`https://docs.google.com/spreadsheets/d/e/${PUB_ID}/pubhtml`;
const MARA=S.linkerKey(OWNER,C,'mara'),WREN=S.linkerKey(OWNER,C,'wren');
const items=()=>[
 {id:'hp',name:'HP',cell:'Sheet1!B2',kind:'hp',value:'24'},{id:'max',name:'Max HP',cell:'Sheet1!B3',kind:'maxHp',value:'31'},
 {id:'per',name:'Perception',cell:'Sheet1!B4',kind:'roll',value:'+4',formula:'1d20+4'},
 {id:'atk',name:'Longbow attack',cell:'Sheet1!B5',kind:'roll',value:'+7',formula:'1d20+7'},{id:'dmg',name:'Longbow damage',cell:'Sheet1!B6',kind:'roll',formula:'1d8+4'},
];
const gSheet=(extra={})=>({source:'google',spreadsheetId:SHEET_ID,title:'Ayla - Salt Road',tab:'Sheet1',mode:'cells',writeBack:false,items:items(),...extra});
const pSheet=(extra={})=>({source:'published',publishedUrl:PUB_URL,title:'Ayla - Salt Road',mode:'cells',writeBack:false,items:items(),...extra});
const page=(id,title,character,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind:'character',body:`${title} of the Salt Road.`,overviewVisibility:'gm',updatedAt:T,character:{...defaultCharacter(),...character},...extra});
// Ayla is Mara's character. Borin is Wren's, shared with the table. Cael's page is nobody's.
function world(){
 const w=demoWorkspace();
 return workspaceSchema.parse({...w,entries:[...w.entries,page('ayla','Ayla',{}),page('borin','Borin',{statsVisibility:'players',sheet:{...gSheet(),linkedBy:'GM'}},{overviewVisibility:'players'}),page('cael','Cael',{statsVisibility:'players'},{overviewVisibility:'players'}),
  {id:'note',worldId:'demo-world',campaignId:C,parentId:null,title:'Greyfen docks',kind:'note',body:'Gulls.',overviewVisibility:'players',updatedAt:T}]});
}
function list(){
 let l=M.emptyMemberList(C,'Dreams');
 l={...l,members:[{userId:'mara',name:'Mara',groups:['players'],joinedAt:''},{userId:'wren',name:'Wren',groups:['players'],joinedAt:''},{userId:'tobin',name:'Tobin',groups:['players'],joinedAt:''}]};
 l=M.setPageAccess(l,'ayla',{people:{mara:{edit:true,subPages:true}},groups:{}});
 l=M.setPageAccess(l,'borin',{people:{wren:{edit:true,subPages:false}},groups:{}});
 return M.setPageAccess(l,'note',{people:{mara:{edit:true,subPages:false}},groups:{}});
}
const rights=u=>M.pageRights(list(),u);
const ent=(w,id)=>w.entries.find(e=>e.id===id);
const refuses=(fn,re)=>assert.throws(fn,e=>e instanceof S.PlayerSheetError&&re.test(e.message));
const TABS=[{name:'Sheet1',rows:[[],['HP','11'],['Max HP','31'],['Perception','+9']]}];
const link=(w,sheet=gSheet(),extra={})=>S.linkSheet(w,C,rights('mara'),MARA,{name:'Mara'},{entryId:'ayla',sheet,tabs:TABS,...extra},NOW);
/** Everything in the workspace except one page's sheet and timestamp. */
const rest=(w,id)=>JSON.stringify({...w,entries:w.entries.map(e=>e.id===id?{...e,character:{...e.character,sheet:0},updatedAt:0}:e)});

test('a member linking their own character changes only that page\'s sheet, and the linker is recorded',()=>{
 const w=world(),next=link(w);
 const sheet=ent(next,'ayla').character.sheet;
 assert.equal(sheet.linkedBy,'Mara');assert.equal(sheet.linkedById,MARA);assert.equal(sheet.readAt,NOW.toISOString());assert.equal(sheet.items.length,5);
 assert.equal(rest(next,'ayla'),rest(w,'ayla'),'nothing else in the workspace changed');
 // The client cannot name who linked it, or claim to be the GM.
 const forged=link(w,gSheet({linkedBy:'GM',linkedById:WREN}));
 assert.equal(ent(forged,'ayla').character.sheet.linkedById,MARA);assert.equal(ent(forged,'ayla').character.sheet.linkedBy,'Mara');
 // A published link works too, and replacing it again is fine.
 const again=link(next,pSheet());assert.equal(ent(again,'ayla').character.sheet.source,'published');
});

test('linking is refused without edit rights on that page, for other pages, other campaigns, GM sheets and bad input',()=>{
 const w=world();
 refuses(()=>S.linkSheet(w,C,rights('tobin'),S.linkerKey(OWNER,C,'tobin'),{name:'Tobin'},{entryId:'ayla',sheet:gSheet()},NOW),/can’t change this character/);
 refuses(()=>S.linkSheet(w,C,rights('mara'),MARA,{name:'Mara'},{entryId:'cael',sheet:gSheet()},NOW),/can’t change this character/);
 refuses(()=>S.linkSheet(w,C,rights('mara'),MARA,{name:'Mara'},{entryId:'borin',sheet:gSheet()},NOW),/can’t change this character/);
 refuses(()=>S.linkSheet(w,C,rights('mara'),MARA,{name:'Mara'},{entryId:'note',sheet:gSheet()},NOW),/Only a character page/);
 // Another campaign: the page id is in Mara's rights but the workspace page belongs to a different campaign.
 const other={...w,entries:w.entries.map(e=>e.id==='ayla'?{...e,campaignId:'demo-campaign-two'}:e)};
 refuses(()=>link(other),/gone/);
 refuses(()=>S.linkSheet(w,'no-such-campaign',rights('mara'),MARA,{name:'Mara'},{entryId:'ayla',sheet:gSheet()},NOW),/gone/);
 // Revoked: the GM took the page away.
 const revoked=M.pageRights(M.setPageAccess(list(),'ayla',{people:{},groups:{}}),'mara');
 refuses(()=>S.linkSheet(w,C,revoked,MARA,{name:'Mara'},{entryId:'ayla',sheet:gSheet()},NOW),/can’t change this character/);
 // A GM's sheet is the GM's; another member's sheet is theirs.
 const gmLinked={...w,entries:w.entries.map(e=>e.id==='ayla'?{...e,character:{...e.character,sheet:sheetSchema.parse({...gSheet(),linkedBy:'GM'})}}:e)};
 refuses(()=>link(gmLinked),/Your GM linked/);
 refuses(()=>S.unlinkSheet(gmLinked,C,rights('mara'),MARA,'ayla',NOW),/Your GM linked/);
 refuses(()=>S.refreshOwnSheet(gmLinked,C,rights('mara'),MARA,'ayla',[],NOW),/Your GM linked/);
 const theirs=S.linkSheet(w,C,rights('mara'),WREN,{name:'Wren'},{entryId:'ayla',sheet:gSheet()},NOW);
 refuses(()=>link(theirs),/Your GM linked/);
 // Input that breaks the saved shape: a link that isn't a published Google link, an id that isn't a sheet id, nothing picked.
 refuses(()=>link(w,pSheet({publishedUrl:'https://evil.example/spreadsheets/d/e/abc/pub'})),/Publish to the web/);
 refuses(()=>link(w,{...gSheet(),spreadsheetId:'../x'}),/./);
 refuses(()=>link(w,gSheet({items:[]})),/Pick at least one/);
 refuses(()=>link(w,{...gSheet(),items:[{...items()[0],cell:'A1:B2'}]}),/./);
});

test('refresh and unlink act on the member\'s own sheet only',()=>{
 const w=link(world());
 const tabs=[{name:'Sheet1',rows:[[],['HP','18'],['Max HP','31'],['Perception','+6']]}];
 const r=S.refreshOwnSheet(w,C,rights('mara'),MARA,'ayla',tabs,new Date('2026-11-14T13:00:00Z'));
 const sheet=ent(r.data,'ayla').character.sheet;
 assert.equal(sheet.items.find(i=>i.id==='per').value,'+6'.trim());assert.equal(sheet.linkedById,MARA);assert.equal(sheet.readAt,'2026-11-14T13:00:00.000Z');
 assert.equal(rest(r.data,'ayla'),rest(w,'ayla'));
 const gone=S.unlinkSheet(w,C,rights('mara'),MARA,'ayla',NOW);
 assert.equal(ent(gone,'ayla').character.sheet,undefined);assert.equal(rest(gone,'ayla'),rest(w,'ayla'));
 refuses(()=>S.unlinkSheet(w,C,rights('tobin'),S.linkerKey(OWNER,C,'tobin'),'ayla',NOW),/can’t change/);
 refuses(()=>S.unlinkSheet(world(),C,rights('mara'),MARA,'ayla',NOW),/no sheet/);
 // A published link's address is read on the server, only for its own member.
 const pub=link(world(),pSheet());
 assert.equal(S.publishedLinkOf(pub,C,rights('mara'),MARA,'ayla'),PUB_URL);
 assert.equal(S.publishedLinkOf(w,C,rights('mara'),MARA,'ayla'),null,'a Google sheet is read in the browser');
 refuses(()=>S.publishedLinkOf(pub,C,rights('mara'),WREN,'ayla'),/Your GM linked/);
 refuses(()=>S.publishedLinkOf(pub,C,rights('tobin'),S.linkerKey(OWNER,C,'tobin'),'ayla'),/can’t change/);
});

test('the linker sees their own sheet and its open link; no one else does; nothing else about it leaks',()=>{
 const w=link(world(),gSheet());
 const mine=playerCampaign(w,C,rights('mara').edit,MARA).entries.find(e=>e.id==='ayla');
 assert.equal(mine.sheet.title,'Ayla - Salt Road');assert.equal(mine.sheet.items.length,5,'their own sheet shows although the GM kept the stats tab private');
 const states=S.sheetStates(w,C,rights('mara'),MARA);
 assert.deepEqual(states.ayla,{canLink:true,mine:true,hasSheet:true,canRoll:true,open:`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`});
 assert.deepEqual(Object.keys(states).sort(),['ayla','note'].filter(id=>id==='ayla'),'only character pages they may edit');
 // Another member (even one with rights on the page) and anonymous viewers get no sheet and no link.
 const gm=playerCampaign(w,C).entries.find(e=>e.id==='ayla');
 assert.equal(gm,undefined,'a GM-only page does not reach a share link at all');
 const wren=playerCampaign(w,C,new Set(['ayla']),WREN).entries.find(e=>e.id==='ayla');
 assert.equal(wren.sheet,undefined);
 const wrenState=S.sheetStates(w,C,{edit:new Set(['ayla']),subPages:new Set(),made:new Set()},WREN).ayla;
 assert.deepEqual(wrenState,{canLink:false,mine:false,hasSheet:true,canRoll:false});
 // Public payloads never hold the id, link, who linked it or the linker key.
 for(const text of [JSON.stringify(playerCampaign(w,C)),JSON.stringify(playerCampaign(w,C,new Set(['ayla']),WREN)),JSON.stringify(playerCampaign(w,C,rights('mara').edit,MARA).entries.map(e=>e.sheet))]){
  for(const s of [SHEET_ID,'docs.google.com','Mara',MARA,'linkedBy','spreadsheetId','Sheet1!'])assert.ok(!text.includes(s),s);
 }
 // A sheet linked by a member and shared by the GM (stats visible) is the same allow-list for everyone.
 const shared={...w,entries:w.entries.map(e=>e.id==='ayla'?{...e,overviewVisibility:'players',character:{...e.character,statsVisibility:'players'}}:e)};
 const all=JSON.stringify(playerCampaign(shared,C));
 assert.ok(all.includes('Ayla - Salt Road'));for(const s of [SHEET_ID,'Mara',MARA,'linkedBy'])assert.ok(!all.includes(s),s);
 // The AI's players-only book and the playerSheet allowlist hold none of it either.
 const full=campaignExport(shared,C),limited=narrow({book:full,campaign:full.campaigns[0],maps:null,level:'read',perms:{...presets.gm,seeSecrets:'off'}});
 const ai=JSON.stringify(limited.book);
 assert.ok(ai.includes('Ayla - Salt Road'));for(const s of [SHEET_ID,MARA,'linkedBy','linkedById','"Mara"'])assert.ok(!ai.includes(s),s);
 const p=JSON.stringify([playerSheet(ent(w,'ayla').character.sheet),withoutLinkDetails(ent(w,'ayla').character.sheet)]);
 for(const s of [SHEET_ID,MARA,'linkedBy','Mara'])assert.ok(!p.includes(s),s);
 // A published sheet's open link is the linker's too.
 assert.equal(S.sheetStates(link(world(),pSheet()),C,rights('mara'),MARA).ayla.open,PUB_URL);
});

test('a co-GM\'s restore keeps a sheet a member linked',()=>{
 const full=link(world());
 const mine=structuredClone(campaignExport(full,C));
 mine.entries=mine.entries.map(e=>e.id==='ayla'?{...e,body:'Ayla keeps her bow oiled.',updatedAt:T,character:{...e.character,sheet:undefined}}:e);
 const next=applyCoGmEdit(full,C,mine);
 const a=ent(next,'ayla');
 assert.equal(a.body,'Ayla keeps her bow oiled.');assert.equal(a.character.sheet.linkedById,MARA);assert.equal(a.character.sheet.spreadsheetId,SHEET_ID);
});

test('a member cannot turn write-back on, and a GM-set write-back survives a co-GM restore and stays out of every player copy',()=>{
 const w=world();
 // A forged writeBack:true from a member's browser is stored as off: only the linker's own settings screen (their browser) could ever write.
 const next=link(w,gSheet({writeBack:true}));
 assert.equal(ent(next,'ayla').character.sheet.writeBack,false);
 // Refreshing a member's sheet keeps it off.
 const fresh=S.refreshOwnSheet(next,C,rights('mara'),MARA,'ayla',TABS,NOW).data;
 assert.equal(ent(fresh,'ayla').character.sheet.writeBack,false);
 // A GM-linked sheet with write-back on: a co-GM restore keeps it, and no player or AI copy mentions it.
 const gm={...w,entries:w.entries.map(e=>e.id==='borin'?{...e,character:{...e.character,sheet:{...e.character.sheet,writeBack:true}}}:e)};
 const parsed=workspaceSchema.parse(gm);assert.equal(ent(parsed,'borin').character.sheet.writeBack,true);
 const mine=structuredClone(campaignExport(parsed,C));
 mine.entries=mine.entries.map(e=>e.id==='borin'?{...e,body:'Borin counts the gulls.',updatedAt:T,character:{...e.character,sheet:undefined}}:e);
 const restored=applyCoGmEdit(parsed,C,mine);
 assert.equal(ent(restored,'borin').body,'Borin counts the gulls.');assert.equal(ent(restored,'borin').character.sheet.writeBack,true);
 const players=JSON.stringify([playerCampaign(parsed,C),playerCampaign(parsed,C,new Set(['borin']),WREN)]);
 assert.ok(players.includes('Ayla - Salt Road'));assert.ok(!players.includes('writeBack'));
 const full=campaignExport(parsed,C),limited=narrow({book:full,campaign:full.campaigns[0],maps:null,level:'read',perms:{...presets.gm,seeSecrets:'off'}});
 assert.ok(!JSON.stringify(limited.book).includes('writeBack'));
 assert.ok(!JSON.stringify(playerSheet(ent(parsed,'borin').character.sheet)).includes('writeBack'));
 assert.ok(!JSON.stringify(withoutLinkDetails(ent(parsed,'borin').character.sheet)).includes('writeBack'));
 assert.ok(!JSON.stringify(S.sheetStates(parsed,C,rights('wren'),WREN)).includes('writeBack'));
});

// ---- The routes' handlers ---------------------------------------------------------------------

const REF='a'.repeat(64);
function setup(opts={}){
 const state={data:link(world()),revision:1,saves:[],posts:[],reads:[]};
 const members={mara:{owner:OWNER,campaignId:C,userId:'mara',name:'Mara',rights:rights('mara')},tobin:{owner:OWNER,campaignId:C,userId:'tobin',name:'Tobin',rights:rights('tobin')}};
 let who=opts.who??'mara';
 const deps={
  member:async ref=>ref!==REF?null:who==='out'?'signedOut':members[who]??null,
  sameOrigin:r=>r.headers.get('Origin')==='https://rpg.example',
  store:{read:async()=>({data:state.data,revision:state.revision}),save:async(o,data,rev,by)=>{state.saves.push(by);if(rev!==state.revision)return null;state.data=data;state.revision++;return {};}},
  read:async link=>{state.reads.push(link);return {title:'Ayla - Salt Road',url:PUB_URL,tabs:[{name:'Sheet1',rows:[[],['HP','11'],['Max HP','31'],['Perception','+9']]}]};},
  post:async(m,post)=>{state.posts.push({m,post});return {skipped:opts.skipped??false};},
  random:()=>0.5,now:1000,
 };
 return {state,deps,as:u=>{who=u;}};
}
const req=(body,{origin='https://rpg.example',len}={})=>{const text=JSON.stringify(body);return new Request('https://rpg.example/api/x',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(len?{'Content-Length':String(len)}:{})},body:text});};
const sheetCall=(s,body,o)=>R.handlePlayerSheet(req({ref:REF,...body},o),s.deps);
const rollCall=(s,body,o)=>R.handlePlayerRoll(req({ref:REF,mode:'normal',...body},o),s.deps);

test('player sheet route: needs a signed-in member of the campaign, same origin and a small body',async()=>{
 R.resetThrottles();
 const s=setup();
 assert.equal((await sheetCall(s,{action:'unlink',entryId:'ayla'},{origin:'https://evil.example'})).status,403);
 assert.equal((await sheetCall(s,{action:'unlink',entryId:'ayla'},{len:2_000_000})).status,413);
 assert.equal((await R.handlePlayerSheet(req({ref:'b'.repeat(64),action:'unlink',entryId:'ayla'}),s.deps)).status,404,'an unknown ref (a share link is not a member)');
 assert.equal((await R.handlePlayerSheet(req({ref:'m-'+REF,action:'unlink',entryId:'ayla'}),s.deps)).status,400);
 s.as('out');assert.equal((await sheetCall(s,{action:'unlink',entryId:'ayla'})).status,401);
 s.as('tobin');const r=await sheetCall(s,{action:'unlink',entryId:'ayla'});
 assert.equal(r.status,403);assert.equal(r.headers.get('Cache-Control'),'private, no-store');
 assert.equal(s.state.saves.length,0,'nothing was saved');
 assert.ok(ent(s.state.data,'ayla').character.sheet,'and the sheet is still there');
});

test('player sheet route: link, refresh (published link read on the server), read and unlink, saved as the player',async()=>{
 R.resetThrottles();
 const s=setup();s.state.data=world();
 let r=await sheetCall(s,{action:'link',entryId:'ayla',sheet:pSheet()});
 assert.equal(r.status,200);assert.equal(ent(s.state.data,'ayla').character.sheet.linkedBy,'Mara');assert.deepEqual(s.state.saves[0],{name:'Mara',as:'player'});
 r=await sheetCall(s,{action:'refresh',entryId:'ayla'});
 assert.equal(r.status,200);assert.deepEqual(s.state.reads,[PUB_URL,PUB_URL],'link and refresh each read it');
 assert.equal(ent(s.state.data,'ayla').character.sheet.items.find(i=>i.id==='per').value,'+9');
 r=await sheetCall(s,{action:'read',link:PUB_URL});assert.equal(r.status,200);assert.equal((await r.json()).tabs.length,1);
 // A Google sheet refreshes with tabs from the member's browser; without them the server cannot read it.
 const g=setup();g.state.data=link(world(),gSheet());
 assert.equal((await sheetCall(g,{action:'refresh',entryId:'ayla'})).status,400);
 r=await sheetCall(g,{action:'refresh',entryId:'ayla',tabs:[{name:'Sheet1',rows:[[],['HP','5']]}]});assert.equal(r.status,200);
 assert.equal(ent(g.state.data,'ayla').character.sheet.items.find(i=>i.id==='hp').value,'5');assert.equal(ent(g.state.data,'ayla').character.sheet.items.find(i=>i.id==='max').value,undefined,'cells the tab no longer fills are cleared');
 assert.equal((await sheetCall(g,{action:'refresh',entryId:'ayla',tabs:[{name:'Sheet1',rows:Array(300).fill([])}]})).status,400,'a grid over the limit is refused');
 r=await sheetCall(g,{action:'unlink',entryId:'ayla'});assert.equal(r.status,200);assert.equal(ent(g.state.data,'ayla').character.sheet,undefined);
 // Reading a link is for a member who may change a character, and the read throttle holds.
 const t=setup({who:'tobin'});assert.equal((await sheetCall(t,{action:'read',link:PUB_URL})).status,403);
 R.resetThrottles();
 const q=setup();let last=0;for(let i=0;i<7;i++)last=(await sheetCall(q,{action:'read',link:PUB_URL})).status;
 assert.equal(last,429);
});

test('player roll route rolls on the server from the stored formula and ignores any total sent',async()=>{
 R.resetThrottles();
 const s=setup();
 const r=await rollCall(s,{entryId:'ayla',itemId:'per',total:999,formula:'1d1000',title:'Ayla · A lie',detail:'x'});
 assert.equal(r.status,200);
 const body=await r.json();
 assert.equal(body.total,rollWithMode('1d20+4','normal',()=>0.5).total);assert.equal(body.total,15);
 assert.equal(body.formula,'1d20+4');assert.equal(body.title,'Ayla · Perception');assert.equal(body.discord,'none','no Discord channel is set: still rolled');
 assert.equal(s.state.posts.length,0);
 // With a channel: posted as the character with the server's total.
 const w=s.state.data;s.state.data={...w,campaigns:w.campaigns.map(c=>c.id===C?{...c,discord:{maptableCampaignId:'map-1'}}:c)};
 const d=await (await rollCall(s,{entryId:'ayla',itemId:'per',mode:'low'})).json();
 assert.equal(d.discord,'sent');assert.match(d.detail,/Disadvantage: rolled 11 and 11/);
 const sent=s.state.posts[0];
 assert.equal(sent.m.campaignId,C);assert.deepEqual(sent.post,{kind:'roll',title:'Ayla · Perception',formula:'2d20kl1+4',total:d.total,detail:d.detail,who:'Ayla',avatarOf:'ayla'});
 assert.equal(JSON.stringify(d).includes(SHEET_ID),false);
 // Attack and damage are separate buttons with their own item.
 assert.equal((await (await rollCall(s,{entryId:'ayla',itemId:'dmg'})).json()).formula,'1d8+4');
 const s2=setup({skipped:true});s2.state.data=s.state.data;assert.equal((await (await rollCall(s2,{entryId:'ayla',itemId:'atk'})).json()).discord,'skipped');
});

test('player roll route refuses other pages, hidden items, non-rolls, strangers and rolls too fast',async()=>{
 R.resetThrottles();
 const s=setup();
 for(const body of [{entryId:'borin',itemId:'per'},{entryId:'cael',itemId:'per'},{entryId:'note',itemId:'per'},{entryId:'ayla',itemId:'hp'},{entryId:'ayla',itemId:'nope'}]){
  const r=await rollCall(s,body);assert.ok([403,404].includes(r.status),`${body.entryId}/${body.itemId} ${r.status}`);
 }
 // The GM unlinked then re-linked as theirs with stats private: the member's own sheet stays rollable; a GM sheet with private stats does not.
 const gm={...s.state.data,entries:s.state.data.entries.map(e=>e.id==='ayla'?{...e,character:{...e.character,sheet:sheetSchema.parse({...gSheet(),linkedBy:'GM'})}}:e)};
 s.state.data=gm;assert.equal((await rollCall(s,{entryId:'ayla',itemId:'per'})).status,404);
 s.state.data=link(world());
 assert.equal((await rollCall(s,{entryId:'ayla',itemId:'per'},{origin:'https://evil.example'})).status,403);
 assert.equal((await rollCall(s,{entryId:'ayla',itemId:'per'},{len:5000})).status,413);
 assert.equal((await R.handlePlayerRoll(req({ref:'c'.repeat(64),entryId:'ayla',itemId:'per',mode:'normal'}),s.deps)).status,404);
 s.as('tobin');assert.equal((await rollCall(s,{entryId:'ayla',itemId:'per'})).status,403);
 s.as('out');assert.equal((await rollCall(s,{entryId:'ayla',itemId:'per'})).status,401);
 // Revoked rights: the member's rights are read again on every request.
 R.resetThrottles();s.as('mara');
 assert.equal((await rollCall(s,{entryId:'ayla',itemId:'per'})).status,200);
 let last=0;for(let i=0;i<12;i++)last=(await rollCall(s,{entryId:'ayla',itemId:'per'})).status;
 assert.equal(last,429);
});

test('a rolled sheet item is found by the same ids the buttons carry',()=>{
 const w=link(world()),shown=playerSheet(ent(w,'ayla').character.sheet);
 const ids=sheetRollGroups(shown).flatMap(g=>g.rows.flatMap(r=>r.buttons.map(b=>b.itemId))).sort();
 assert.deepEqual(ids,['atk','dmg','per']);
 for(const id of ids)assert.ok(S.rollOf(w,C,rights('mara'),MARA,'ayla',id).formula);
});

test('a published link is read again on the server, so forged item values never get stored; the link is stored cleaned',async()=>{
 R.resetThrottles();
 const s=setup();s.state.data=world();
 const forged=pSheet({publishedUrl:PUB_URL+'?gid=0&single=true#frag',items:items().map(i=>i.id==='per'?{...i,value:'+99',formula:'1d20+4'}:i.id==='hp'?{...i,value:'9999'}:i)});
 const r=await sheetCall(s,{action:'link',entryId:'ayla',sheet:forged});
 assert.equal(r.status,200);assert.equal(s.state.reads.length,1,'the server read the link');
 const sheet=ent(s.state.data,'ayla').character.sheet;
 assert.equal(sheet.items.find(i=>i.id==='per').value,'+9');assert.equal(sheet.items.find(i=>i.id==='hp').value,'11');
 assert.match(sheet.publishedUrl,/^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^?#]+\/pubhtml(\?gid=0&single=true)?$/);assert.ok(!sheet.publishedUrl.includes('#'));
 // The Google picker path accepts the member's own read values.
 const g=setup();g.state.data=world();
 await sheetCall(g,{action:'link',entryId:'ayla',sheet:gSheet({items:items().map(i=>i.id==='per'?{...i,value:'+3'}:i)})});
 assert.equal(g.state.reads.length,0);assert.equal(ent(g.state.data,'ayla').character.sheet.items.find(i=>i.id==='per').value,'+3');
});

test('player rolls take the rolling page\'s own picture, never one found by title',async()=>{
 const {ownPicture}=await import('../lib/encyclopedia/discord-roll.ts');
 const pic={imageId:'0b5f6a8e-3c1d-4f2a-9b7e-1a2b3c4d5e6f',width:10,height:10};
 const w=world();
 const data={...w,entries:[...w.entries.map(e=>e.id==='cael'?{...e,picture:pic}:e),page('ayla2','Cael',{})].filter(e=>e.id!=='ayla2')};
 assert.equal(ownPicture(data,C,'ayla'),null,'Ayla has none, even if she is renamed to match Cael');
 assert.deepEqual(ownPicture(data,C,'cael'),pic);
 assert.equal(ownPicture(data,'demo-campaign-two','cael'),null);
 const s=setup();const w2=s.state.data;s.state.data={...w2,campaigns:w2.campaigns.map(c=>c.id===C?{...c,discord:{maptableCampaignId:'m'}}:c)};
 await rollCall(s,{entryId:'ayla',itemId:'per'});
 assert.equal(s.state.posts[0].post.avatarOf,'ayla');
});

test('the linker key is an HMAC with the server secret',()=>{
 const a=S.linkerKey(OWNER,C,'mara',{AI_KEY_SECRET:'a'}),b=S.linkerKey(OWNER,C,'mara',{AI_KEY_SECRET:'b'});
 assert.match(a,/^[a-f0-9]{32}$/);assert.notEqual(a,b);assert.notEqual(a,S.linkerKey(OWNER,C,'wren',{AI_KEY_SECRET:'a'}));
 assert.throws(()=>S.linkerKey(OWNER,C,'mara',{}),/no secret/);
});
