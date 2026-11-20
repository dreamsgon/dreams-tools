import test from 'node:test';
import assert from 'node:assert/strict';
const M=await import('../lib/members.ts');
const {demoWorkspace,playerCampaign}=await import('../lib/encyclopedia/world-model.ts');
const P=await import('../lib/encyclopedia/player-edit.ts');
const {markEditor}=await import('../lib/encyclopedia/store.ts');

const C='demo-campaign',T='2026-11-14T10:00:00.000Z',NOW=new Date('2026-11-14T12:00:00Z'),MARA={name:'Mara',as:'player'};
// Bram is Mara's character: one shared tab, one with a GM secret, one GM-only.
function owner(){
 const w=demoWorkspace();
 const bram={id:'bram',worldId:'demo-world',campaignId:C,parentId:null,title:'Bram',kind:'note',body:'A ferry guard from the Greyfen landing.',overviewVisibility:'players',updatedAt:T,
  tabs:[{id:'gear',title:'Gear',body:'A spear and a lantern.',visibility:'players'},{id:'past',title:'Past',body:'Grew up on the Salt Road.\n::: secret\nHis brother runs with the smugglers.\n:::',visibility:'players'},{id:'gm',title:'GM notes',body:'Owes Ivo.',visibility:'gm'}]};
 return {...w,entries:[...w.entries,bram]};
}
function list(){
 let l=M.emptyMemberList(C,'Dreams');
 l={...l,members:[{userId:'mara',name:'Mara',groups:['players'],joinedAt:''},{userId:'wren',name:'Wren',groups:['players','guests'],joinedAt:''},{userId:'tobin',name:'Tobin',groups:['players'],joinedAt:''}]};
 return M.setPageAccess(l,'bram',{people:{mara:{edit:true,subPages:true},wren:{edit:true,subPages:true}},groups:{}});
}

test('Who can edit decides who edits a page; Never in a group still wins',()=>{
 const l=list();
 const mara=M.pageRights(l,'mara'),wren=M.pageRights(l,'wren'),tobin=M.pageRights(l,'tobin');
 assert.deepEqual([...mara.edit],['bram']);assert.deepEqual([...mara.subPages],['bram']);
 assert.equal(wren.edit.size,0,'Guests are Never for editing pages');
 assert.equal(tobin.edit.size,0);
 const party=M.setPageAccess(l,'bram',{people:l.pages.bram.people,groups:{players:true}});
 assert.deepEqual([...M.pageRights(party,'tobin').edit],['bram'],'a whole group can be let in');
 assert.throws(()=>M.setPageAccess(l,'bram',{people:{stranger:{edit:true,subPages:false}},groups:{}}),/isn't in this campaign/);
 assert.equal(M.setPageAccess(l,'bram',{people:{},groups:{}}).pages.bram,undefined,'an empty setting is removed');
 assert.equal(M.removeMember(l,'mara').pages.bram.people.mara,undefined);
});

test('a player edits the shared text of their page; secrets and GM-only tabs stay as they are',()=>{
 const s=owner(),rights=M.pageRights(list(),'mara');
 const mine=P.myPages(s,C,rights).bram;
 assert.deepEqual(mine.tabs.map(t=>[t.id,!!t.locked]),[['overview',false],['gear',false],['past',true]],'GM-only tabs never reach the player; a tab with a secret is locked');
 assert.equal(mine.tabs.find(t=>t.id==='past').body,undefined,'a locked tab sends no text');
 const next=P.savePlayerEdit(s,C,rights,{entryId:'bram',tabs:[{id:'overview',body:'Keeps his hand on his sword.'},{id:'gear',body:'A spear, a lantern and a debt.'}]},MARA,NOW);
 const bram=next.entries.find(e=>e.id==='bram');
 assert.equal(bram.body,'Keeps his hand on his sword.');assert.equal(bram.tabs[0].body,'A spear, a lantern and a debt.');
 assert.match(bram.tabs[1].body,/smugglers/);assert.equal(bram.tabs[2].body,'Owes Ivo.');
 assert.deepEqual(bram.editedBy,MARA);
 assert.throws(()=>P.savePlayerEdit(s,C,rights,{entryId:'bram',tabs:[{id:'past',body:'Nothing to hide.'}]},MARA),/secrets/);
 assert.throws(()=>P.savePlayerEdit(s,C,rights,{entryId:'bram',tabs:[{id:'gm',body:'x'}]},MARA),/tab is gone/);
 assert.throws(()=>P.savePlayerEdit(s,C,rights,{entryId:'demo-mara',tabs:[{id:'overview',body:'x'}]},MARA),/can’t edit/);
});

test('sub-pages start for the player and the GMs, and only their maker shares them',()=>{
 const s=owner();let rights=M.pageRights(list(),'mara');
 assert.throws(()=>P.addPlayerSubPage(s,C,M.pageRights(list(),'tobin'),{parentId:'bram',title:'Journal',shared:false},'j1',MARA),/can’t add/);
 const made=M.addMadePage(list(),'mara','j1');rights=M.pageRights(made,'mara');
 let next=P.addPlayerSubPage(s,C,rights,{parentId:'bram',title:"Bram's journal",shared:false},'j1',MARA,NOW);
 const j=next.entries.find(e=>e.id==='j1');
 assert.equal(j.parentId,'bram');assert.equal(j.overviewVisibility,'gm');assert.equal(j.campaignId,C);
 assert.equal(playerCampaign(next,C).entries.some(e=>e.id==='j1'),false,'other players don\'t see it');
 assert.ok(playerCampaign(next,C,rights.edit).entries.some(e=>e.id==='j1'),'its maker does');
 assert.deepEqual(P.myPages(next,C,rights).bram.children,[{id:'j1',title:"Bram's journal",shared:false,made:true}]);
 next=P.sharePlayerPage(next,C,rights,'j1',true,MARA,NOW);
 assert.ok(playerCampaign(next,C).entries.some(e=>e.id==='j1'));
 assert.throws(()=>P.sharePlayerPage(next,C,rights,'bram',false,MARA),/Only the person who made/);
});

test('pages remember who last changed them, and lose the mark when the GM changes them',()=>{
 const s=owner(),later={...s,entries:s.entries.map(e=>e.id==='bram'?{...e,body:'New',updatedAt:NOW.toISOString()}:e)};
 const marked=markEditor(s,later,{name:'Alder',as:'co-gm'});
 assert.deepEqual(marked.entries.find(e=>e.id==='bram').editedBy,{name:'Alder',as:'co-gm'});
 assert.equal(marked.entries.find(e=>e.id==='demo-mara').editedBy,undefined,'unchanged pages are left alone');
 const gm=markEditor(marked,{...marked,entries:marked.entries.map(e=>e.id==='bram'?{...e,updatedAt:'2026-11-15T00:00:00.000Z'}:e)});
 assert.equal(gm.entries.find(e=>e.id==='bram').editedBy,undefined);
});

test('a page opened to a group: its players add pages there unless a group says Never',()=>{
 const sessions=M.setPageAccess(list(),'demo-sessions',{people:{},groups:{},add:{players:true}});
 assert.deepEqual(sessions.pages['demo-sessions'].add,{players:true});
 assert.ok(M.pageRights(sessions,'tobin').subPages.has('demo-sessions'),'Players say Yes to adding pages by default');
 assert.ok(!M.pageRights(sessions,'tobin').edit.has('demo-sessions'),'adding pages there is not editing it');
 assert.ok(M.pageRights(sessions,'wren').subPages.has('demo-sessions'),'Wren is also a Guest: a No in another group does not stop it');
 const off=M.setPermission(sessions,'players','addPages','no');
 assert.ok(!M.pageRights(off,'tobin').subPages.has('demo-sessions'));
 const never=M.setPermission(M.setPermission(sessions,'guests','addPages','never'),'players','addPages','yes');
 assert.ok(!M.pageRights(never,'wren').subPages.has('demo-sessions'));
 const cleared=M.setPageAccess(sessions,'demo-sessions',{people:{},groups:{},add:{players:false}});
 assert.equal(cleared.pages['demo-sessions'],undefined,'an empty setting is removed');
 const s=P.addPlayerSubPage(owner(),C,M.pageRights(sessions,'tobin'),{parentId:'demo-sessions',title:'Tobin’s notes',shared:false},'tobin-notes',{name:'Tobin',as:'player'},NOW);
 assert.equal(s.entries.find(e=>e.id==='tobin-notes').parentId,'demo-sessions');
});

test('member lists saved before the new permissions still read, with each built-in group\'s starting choice',()=>{
 const l=M.emptyMemberList(C,'Dreams');
 const old={...l,groups:[...l.groups.map(g=>{const {addPages:_a,wikiHtml:_w,...perms}=g.perms;return {...g,perms};}),{id:'mine',name:'Mine',color:'teal',perms:Object.fromEntries(Object.keys(l.groups[0].perms).filter(k=>k!=='addPages'&&k!=='wikiHtml').map(k=>[k,'yes']))}]};
 const read=M.memberListSchema.parse(old);
 const perm=(id,k)=>read.groups.find(g=>g.id===id).perms[k];
 assert.equal(perm('cogms','wikiHtml'),'yes');
 assert.equal(perm('players','addPages'),'yes');
 assert.equal(perm('players','wikiHtml'),'no');
 assert.equal(perm('guests','wikiHtml'),'never');
 assert.equal(perm('mine','wikiHtml'),'no','a group you made starts at No');
});

test('without "Use HTML in Wiki pages" a player keeps or removes HTML but cannot add it',()=>{
 const rights=M.pageRights(list(),'mara');
 assert.equal(rights.html,false,'Players start at No');
 const add=()=>P.savePlayerEdit(owner(),C,rights,{entryId:'bram',tabs:[{id:'overview',body:'Hi\n::: html\n<b>x</b>\n:::'}]},MARA,NOW);
 assert.throws(add,/HTML/);
 assert.throws(()=>P.savePlayerEdit(owner(),C,rights,{entryId:'bram',tabs:[{id:'gear',body:'[dohtml]<i>y</i>[/dohtml]\n::: note\n::: html\nz\n:::\n:::'}]},MARA,NOW),/HTML/,'nested and [dohtml] count too');
 const yes=M.pageRights(M.setPermission(list(),'players','wikiHtml','yes'),'mara');
 assert.equal(yes.html,true);
 const s=P.savePlayerEdit(owner(),C,yes,{entryId:'bram',tabs:[{id:'overview',body:'Hi\n::: html\n<b>x</b>\n:::'}]},MARA,NOW);
 const kept=P.savePlayerEdit(s,C,rights,{entryId:'bram',tabs:[{id:'overview',body:'Changed\n::: html\n<b>x</b>\n:::'}]},MARA,NOW);
 assert.match(kept.entries.find(e=>e.id==='bram').body,/^Changed/,'HTML already there can stay');
});

test('a player keeps or removes the pictures on a page they edit, but cannot show new ones',()=>{
 const pic='0b5f6a8e-3c1d-4f2a-9b7e-1a2b3c4d5e6f',other='1c6a7b9f-4d2e-4a3b-8c8f-2b3c4d5e6f70';
 const s=owner(),l=list(),rights=M.pageRights(l,'mara');
 assert.throws(()=>P.savePlayerEdit(s,C,rights,{entryId:'bram',tabs:[{id:'overview',body:`A guard.\n\n![[picture:${other}]]`}]},MARA),/Only your GM can add pictures/);
 const withPic={...s,entries:s.entries.map(e=>e.id==='bram'?{...e,body:`A guard.\n\n![[picture:${pic}|Bram]]`}:e)};
 const kept=P.savePlayerEdit(withPic,C,rights,{entryId:'bram',tabs:[{id:'overview',body:`A tired guard.\n\n![[picture:${pic}|Bram at the gate|left]]`}]},MARA,NOW);
 assert.match(kept.entries.find(e=>e.id==='bram').body,/Bram at the gate/);
 assert.ok(P.savePlayerEdit(withPic,C,rights,{entryId:'bram',tabs:[{id:'overview',body:'No picture now.'}]},MARA,NOW));
});
