import test from 'node:test';
import assert from 'node:assert/strict';
const {previewRepo,buildCampaign,addImported,planRead,readMarkdown,rewriteLinks,sessionName,looksLikeRoster,IMPORT_LIMITS}=await import('../lib/encyclopedia/rp-import.ts');
const {rpExportFiles}=await import('../lib/encyclopedia/rp-export.ts');
const {workspaceSchema,defaultCharacter,emptyWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {classifyZip}=await import('../lib/encyclopedia/rp-sheet.ts');
const {readRepoFiles,readRepoRestore}=await import('../lib/github-push.ts');
const {fakeGithub}=await import('./helpers/fake-github.mjs');
const {zipFiles}=await import('../lib/bridge/zip.ts');
const {readZip}=await import('../lib/zip-read.ts');

const NOW='2026-11-16T10:00:00.000Z';
let counter=0;const mint=()=>`id${++counter}`;
const f=(path,text)=>({path,text});
/** A realistic repository: the numbered layout, written by hand with an AI GM's help. */
function repo(extra=[]){
 return [
  f('README.md','# The Salt Road\n\nA campaign on The Lantern Coast.\n'),
  f('AGENTS.md','# Instructions\n\nRead 1-Now first.\n'),
  f('.gitignore','*.tmp\n'),
  f('1-Now/README.md','# 1-Now\n'),
  f('1-Now/Current-State.md','---\nupdated: 2026-11-10\n---\n# Current State\n\nThe party is at Greyfen docks. Mara is waiting.\n\n## Next session starting point\n\nThe tide turns at dusk.\n'),
  f('1-Now/Quests-and-Threads.md','# Quests and Threads\n\n## Active\n\n### Find Mara\n\nShe was last seen at Greyfen docks.\n\n- [ ] Ask at the docks\n\n### The Salt Road toll\n\nBorin owes a debt.\n\n## Done\n\n### Cael joins the party\n\nDone in session one.\n'),
  f('1-Now/Ayla-Sheet-Tracker.md','# Ayla - Sheet Tracker\n\nHP 12.\n'),
  f('2-Story/README.md','# 2-Story\n'),
  f('2-Story/Timeline.md','# Timeline\n\n- 2025-02-28 Arrival\n'),
  f('2-Story/Sessions/2025-02-28-Arrival-at-Greyfen-docks.md','# Session 1: Arrival at Greyfen docks\n\nThe party met [Mara](../../3-People/NPCs/Mara.md) and saw ![a map](map.png).\n'),
  f('2-Story/Sessions/2025-03-14-The-Salt-Road.md','The road was long.\nSee [Ayla](../../3-People/Ayla.md#notes) and [the web](https://example.com/x.md).\n'),
  f('3-People/README.md','# 3-People\n'),
  f('3-People/Ayla.md','---\nrpg-tools-id: abc\nkind: character\nupdated: 2026-11-10T10:00:00.000Z\n---\n# Ayla\n\nA scout from [Greyfen docks](../4-World/Places/Greyfen-docks.md).\n'),
  f('3-People/Borin.md','# Borin\n\nA dockhand.\n'),
  f('3-People/Companions/Cael.md','# Cael\n\nA companion.\n'),
  f('3-People/NPCs/Mara.md','# Mara\n\nThe keeper of maps.\n'),
  f('3-People/NPCs/Bram.md','# Bram\n\nA bear.\n'),
  f('3-People/NPCs/Index.md','# NPC index\n\n- [Mara](Mara.md)\n- [Bram](Bram.md)\n'),
  f('4-World/README.md','# 4-World\n'),
  f('4-World/Lore/The-Salt-Road.md','# The Salt Road\n\nAn old trade route.\n'),
  f('4-World/Places/Greyfen-docks.md','# Greyfen docks\n\nBusy docks. Meet [Mara](../../3-People/NPCs/Mara.md).\n'),
  f('4-World/Locations-and-Lore.md','# Locations and Lore\n\n- [Greyfen docks](Places/Greyfen-docks.md)\n'),
  f('4-World/Factions.md','# Factions\n\nWho pulls the strings.\n\n## The Lantern Coast watch\n\nKeepers of the light.\n\n### Goals\n\nKeep the coast safe.\n\n## Salt Road drivers\n\nCarry the cargo.\n\n## Greyfen docks guild\n\nControls the piers.\n'),
  f('4-World/Maps/Coast.md','# Coast\n\nA description of the coast.\n'),
  f('4-World/Maps/coast.png','PNG'),
  f('5-Rules-and-Setup/Player-Wishes.md','# Player Wishes\n\nNone yet.\n'),
  f('5-Rules-and-Setup/House-Rules.md','# House rules\n\nNo flanking.\n'),
  f('6-GM-Only/README.md','# 6-GM-Only\n'),
  f('6-GM-Only/Director-Notes.md','# Director Notes (GM only)\n\nSlow the pace.\n'),
  f('6-GM-Only/3-People/NPCs/Mara.md','# Mara (GM only)\n\nShe sold the map.\n'),
  f('7-Library/Rulebook.pdf',undefined),
  f('7-Library/notes.md','# Library notes\n\nStays here.\n'),
  f('8-Archive/old-state.md','# Old state\n'),
  f('NOTES.md','# Loose notes\n\nSomething else.\n'),
  f('cover.png',undefined),
  ...extra];
}
const ok=r=>{assert.equal(r.ok,true,r.error);return r;};
const titles=(r,g)=>r.pages.filter(p=>p.group===g).map(p=>p.title);
const pageBy=(r,t)=>r.pages.find(p=>p.title===t);

test('a realistic repository maps to the expected pages',()=>{
 const r=ok(previewRepo(repo(),{name:'salt-road-main'}));
 assert.equal(r.campaignName,'The Salt Road');
 assert.equal(r.repoName,'salt-road-main');
 assert.deepEqual(titles(r,'pc'),['Ayla','Borin']);
 assert.deepEqual(titles(r,'npc'),['Cael','Mara','Bram']);
 assert.equal(pageBy(r,'Cael').role,'companion');
 assert.equal(pageBy(r,'Mara').role,'npc');
 assert.deepEqual(titles(r,'place'),['The Salt Road','Greyfen docks','Locations and Lore']);
 assert.equal(r.pages.find(p=>p.group==='place'&&p.title==='The Salt Road').kind,'lore');assert.equal(pageBy(r,'Greyfen docks').kind,'place');
 assert.deepEqual(titles(r,'org'),['The Lantern Coast watch','Salt Road drivers','Greyfen docks guild']);
 assert.deepEqual(titles(r,'session'),['Session 1: Arrival at Greyfen docks','The Salt Road']);
 assert.deepEqual(r.pages.filter(p=>p.group==='quest').map(p=>[p.title,p.state]),[['Find Mara','active'],['The Salt Road toll','active'],['Cael joins the party','done']]);
 assert.deepEqual(titles(r,'gm'),['Director Notes','Mara']);
 assert.ok(r.front&&!r.front.long);assert.match(r.front.body,/^The party is at Greyfen docks/);assert.ok(!/^# Current/.test(r.front.body));
 const row=to=>r.rows.find(x=>x.to===to);
 assert.equal(row('Player characters').count,2);assert.equal(row('NPCs').count,3);assert.match(row('NPCs').note,/1 is a companion/);
 assert.equal(row('Places & lore').count,3);assert.equal(row('Organizations').count,3);assert.equal(row('Session pages').count,2);assert.equal(row('Quests').count,3);assert.equal(row('GM-only pages').count,2);
 assert.equal(row('Front page: Where we are').count,1);
 assert.equal(r.files,repo().length);
});

test('front matter and the leading title are taken off, nothing else',()=>{
 assert.deepEqual(readMarkdown('---\nrpg-tools-id: x\n---\n# Ayla\n\nLine one.\r\nLine two  \n\n\n'),{title:'Ayla',body:'Line one.\r\nLine two',gmOnly:false});
 assert.deepEqual(readMarkdown('\uFEFF---\r\ntitle: "Borin"\r\n---\r\nText\r\n'),{title:'Borin',body:'Text',gmOnly:false});
 assert.deepEqual(readMarkdown('No heading\n\n# Not first\n'),{title:null,body:'No heading\n\n# Not first',gmOnly:false});
 assert.deepEqual(readMarkdown('## Second level\n'),{title:null,body:'## Second level',gmOnly:false});
 assert.deepEqual(readMarkdown('#hashtag\n'),{title:null,body:'#hashtag',gmOnly:false});
 // a rule in the middle of a page is not front matter
 assert.equal(readMarkdown('# T\n\nAbove\n\n---\nBelow\n').body,'Above\n\n---\nBelow');
 const r=ok(previewRepo([f('1-Now/x.md','x'),f('3-People/Ayla.md','---\nk: v\n---\n# Ayla\n\n> A quote\n\n```\n# not a heading\n```\n\n**Bold** text\r\n')]));
 assert.equal(pageBy(r,'Ayla').body,'> A quote\n\n```\n# not a heading\n```\n\n**Bold** text');
 // no heading: the title comes from the file name
 const n=ok(previewRepo([f('3-People/NPCs/Greyfen-docks_keeper.md','Just text'),f('1-Now/x.md','x')]));
 assert.equal(n.pages[0].title,'Greyfen docks keeper');
});

test('Factions.md is split by ## headings when it holds several, else it is one page',()=>{
 const r=ok(previewRepo(repo()));
 const w=pageBy(r,'The Lantern Coast watch');
 assert.equal(w.body,'Keepers of the light.\n\n### Goals\n\nKeep the coast safe.');
 assert.equal(w.kind,'faction');
 // the text above the first ## is kept as a note, not lost
 assert.ok(r.pages.some(p=>p.group==='notes'&&p.title==='Factions'&&p.body==='Who pulls the strings.'));
 const one=ok(previewRepo([f('1-Now/x.md','x'),f('4-World/Factions.md','# Factions\n\n## Salt Road drivers\n\nCarry the cargo.\n')]));
 assert.deepEqual(one.pages.filter(p=>p.group==='org').map(p=>[p.title,p.kind]),[['Factions','faction']]);
 assert.match(one.pages.find(p=>p.group==='org').body,/^## Salt Road drivers/);
 const fenced=ok(previewRepo([f('1-Now/x.md','x'),f('4-World/Factions.md','## A\n\n```\n## not one\n```\n\n## B\n\ntext\n')]));
 assert.deepEqual(titles(fenced,'org'),['A','B']);
 // a Factions.md that only lists links is an index, kept as a note
 const idx=ok(previewRepo([f('1-Now/x.md','x'),f('4-World/Factions.md','# Factions\n\n## Factions\n\n- [Salt Road drivers](Factions/Salt-Road-drivers.md) - carry cargo\n')]));
 assert.equal(titles(idx,'org').length,0);assert.equal(idx.pages.find(p=>p.title==='Factions').group,'notes');
 // each file in 4-World/Factions/ is one organization
 const dir=ok(previewRepo([f('1-Now/x.md','x'),f('4-World/Factions/Salt-Road-drivers.md','# Salt Road drivers\n\nCargo.\n')]));
 assert.deepEqual(titles(dir,'org'),['Salt Road drivers']);
});

test('quests split by headings, or stay one page',()=>{
 const flat=ok(previewRepo([f('1-Now/Quests-and-Threads.md','# Quests\n\nOpen threads.\n\n## Find Mara\n\nText.\n\n## Cael\'s debt\n\nMore.\n')]));
 assert.deepEqual(flat.pages.filter(p=>p.group==='quest').map(p=>p.title),['Find Mara',"Cael's debt"]);
 assert.ok(flat.pages.some(p=>p.group==='notes'&&p.body==='Open threads.'));
 const none=ok(previewRepo([f('1-Now/Quests-and-Threads.md','# Quests and Threads\n\n- Find Mara\n- Ask Borin\n'),f('3-People/Ayla.md','x')]));
 assert.deepEqual(none.pages.filter(p=>p.group==='quest').map(p=>[p.title,p.body]),[['Quests and Threads','- Find Mara\n- Ask Borin']]);
 const states=ok(previewRepo([f('1-Now/Quests-and-Threads.md','## Active\n\n- Find Mara\n\n## Done\n\n- Ask Borin\n\n## Rumours\n\n- A bell\n'),f('3-People/Ayla.md','x')]));
 assert.equal(states.pages.filter(p=>p.group==='quest').length,1);
 const empty=ok(previewRepo([f('1-Now/Quests-and-Threads.md','# Quests and Threads\n\nNone yet.\n'),f('3-People/Ayla.md','x')]));
 assert.equal(empty.pages.filter(p=>p.group==='quest').length,0);assert.deepEqual(empty.notImported,[{label:'Empty files',count:1}]);
 const rumour=ok(previewRepo([f('1-Now/Quests-and-Threads.md','## Rumours\n\n### A bell\n\nHeard.\n\n## Failed\n\n### A toll\n\nLost.\n')]));
 assert.deepEqual(rumour.pages.map(p=>p.state),['rumour','failed']);
});

test('sessions take their date from the file name, and the page title from the heading or the name',()=>{
 assert.deepEqual(sessionName('2-Story/Sessions/2025-03-14-The-Salt-Road.md'),{date:'2025-03-14',title:'The Salt Road'});
 assert.deepEqual(sessionName('2025-03-14.md'),{date:'2025-03-14',title:'2025-03-14'});
 assert.deepEqual(sessionName('2025-13-40-Bad.md'),{title:'2025 13 40 Bad'});
 assert.deepEqual(sessionName('Session-4-Mara.md'),{title:'Session 4 Mara'});
 const r=ok(previewRepo(repo()));
 const s=r.pages.filter(p=>p.group==='session');
 assert.deepEqual(s.map(p=>p.date),['2025-02-28','2025-03-14']);
 const built=buildCampaign(r,{now:NOW,newId:mint}).workspace;
 const e=built.entries.find(x=>x.title==='The Salt Road'&&x.kind==='session');
 assert.equal(e.recap.playedOn,'2025-03-14');assert.equal(e.updatedAt,'2025-03-14T12:00:00.000Z');
 assert.equal(built.entries.find(x=>x.id===e.parentId).title,'Sessions');
});

test('6-GM-Only pages are GM-only, the public folders are shared with players',()=>{
 const r=ok(previewRepo(repo()));
 const gm=r.pages.filter(p=>p.group==='gm');
 assert.deepEqual(gm.map(p=>[p.title,p.visibility,p.kind]),[['Director Notes','gm','note'],['Mara','gm','note']]);
 const built=buildCampaign(r,{now:NOW,newId:mint}).workspace;
 const mara=built.entries.filter(e=>e.title==='Mara');
 assert.equal(mara.length,2);
 assert.deepEqual(mara.map(e=>[e.kind,e.overviewVisibility]).sort(),[['character','players'],['note','gm']]);
 const gmFolder=built.entries.find(e=>e.kind==='folder'&&e.title==='GM only');
 assert.equal(gmFolder.overviewVisibility,'gm');assert.ok(mara.some(e=>e.parentId===gmFolder.id));
 assert.equal(built.entries.find(e=>e.title==='Ayla').overviewVisibility,'players');
 assert.equal(built.entries.find(e=>e.title==='Ayla').character.role,'pc');
 assert.equal(built.entries.find(e=>e.title==='Cael').character.role,'companion');
 // a repository with no 6-GM-Only gets none
 assert.equal(ok(previewRepo(repo().filter(x=>!x.path.startsWith('6-GM-Only/')))).pages.filter(p=>p.group==='gm').length,0);
});

test('files that match no folder go into Imported notes; the library, archive and setup files are not copied',()=>{
 const r=ok(previewRepo(repo()));
 const notes=r.pages.filter(p=>p.group==='notes').map(p=>p.title);
 for(const t of ['Ayla - Sheet Tracker','Timeline','Coast','Player Wishes','House rules','Loose notes'])assert.ok(notes.includes(t),t);
 assert.ok(notes.includes('NPC index'));// a roster
 assert.equal(r.unmatched,6);// the roster is not counted as unmatched: it did match a folder
 assert.equal(r.stays,2);
 assert.ok(!r.pages.some(p=>/Library notes|Old state|Instructions/.test(p.title)));
 assert.deepEqual(r.notImported,[{label:'8-Archive/',count:1},{label:'README.md files',count:6},{label:'AGENTS.md, .gitignore',count:2},{label:'Empty files',count:0}].filter(x=>x.count));
 assert.equal(r.skipped,2);// the cover picture and the map picture
 assert.ok(r.notices.some(n=>/roster/.test(n)));
 const built=buildCampaign(r,{now:NOW,newId:mint}).workspace;
 const folder=built.entries.find(e=>e.kind==='folder'&&e.title==='Imported notes');
 assert.equal(folder.overviewVisibility,'gm');
 assert.ok(built.entries.filter(e=>e.parentId===folder.id).every(e=>e.kind==='note'&&e.overviewVisibility==='gm'));
 assert.equal(built.entries.filter(e=>e.parentId===folder.id).length,r.pages.filter(p=>p.group==='notes').length);
 // the library's Markdown is never read, even when its text is there
 assert.ok(!built.entries.some(e=>e.title==='Library notes'));
});

test('a GitHub ZIP with one top folder is handled, and so is a picked folder',async()=>{
 const enc=new TextEncoder();
 const zip=zipFiles(repo().map(x=>({name:`salt-road-main/${x.path}`,data:enc.encode(x.text??'bin')})));
 const entries=await readZip(zip);
 assert.ok(entries.some(e=>e.name==='1-Now/Current-State.md'));
 assert.equal(classifyZip(entries.map(e=>e.name)),'numbered');
 const r=ok(previewRepo(entries.map(e=>({path:e.name,text:/\.md$/.test(e.name)?new TextDecoder().decode(e.data):undefined})),{name:'salt-road-main'}));
 assert.equal(titles(r,'pc').length,2);
 // the wrapper folder is also taken off here (a folder pick, or a tree read)
 const wrapped=ok(previewRepo(repo().map(x=>({...x,path:`salt-road-main/${x.path}`})),{name:'salt-road-main'}));
 assert.deepEqual(wrapped.pages.map(p=>p.title),r.pages.map(p=>p.title));
 assert.equal(wrapped.files,repo().length);
 assert.equal(wrapped.campaignName,'The Salt Road');
 // without a README the name comes from the folder, without -main
 const named=ok(previewRepo(repo().slice(1).map(x=>({...x,path:`salt-road-main/${x.path}`}))));
 assert.equal(named.campaignName,'salt road');
 // macOS leftovers are ignored
 const mac=ok(previewRepo([...wrapped.pages.length?repo().map(x=>({...x,path:`salt-road-main/${x.path}`})):[],f('__MACOSX/salt-road-main/._x.md','x'),f('salt-road-main/.DS_Store','x')]));
 assert.equal(mac.files,repo().length);
});

test('paths that leave the repository are rejected',()=>{
 for(const bad of ['../x.md','1-Now/../../x.md','/etc/passwd','1-Now//x.md','C:\\x.md','1-Now\\x.md','./x.md','1-Now/x\0.md']){
  const r=previewRepo([f('3-People/Ayla.md','x'),f(bad,'x')]);
  assert.equal(r.ok,false,bad);assert.match(r.error,/unsafe path/);
  assert.equal(planRead([{path:bad}]).ok,false,bad);
 }
});

test('not an RP repository, and an empty one',()=>{
 const r=previewRepo([f('README.md','# Hi'),f('src/a.js','x')]);
 assert.equal(r.ok,false);assert.match(r.error,/not an RP repository/);
 const e=previewRepo([f('1-Now/README.md','# 1-Now'),f('7-Library/a.pdf')]);
 assert.equal(e.ok,false);assert.match(e.error,/nothing to import/);
 assert.equal(previewRepo([]).ok,false);
});

test('limits: file count, total size, one file',()=>{
 const many=Array.from({length:IMPORT_LIMITS.pages+1},(_,i)=>f(`3-People/NPCs/n${i}.md`,'x'));
 const a=previewRepo(many);assert.equal(a.ok,false);assert.match(a.error,/limit is 600/);
 assert.equal(planRead(many.map(x=>({path:x.path,size:1}))).ok,false);
 const lib=Array.from({length:IMPORT_LIMITS.files+1},(_,i)=>f(`7-Library/b${i}.pdf`));
 assert.equal(previewRepo([f('3-People/Ayla.md','x'),...lib]).ok,false);
 // library and archive files do not count towards the page limit
 const lots=[f('3-People/Ayla.md','x'),...Array.from({length:700},(_,i)=>f(`7-Library/n${i}.md`,'x')),...Array.from({length:700},(_,i)=>f(`8-Archive/n${i}.md`,'x'))];
 const b=ok(previewRepo(lots));assert.equal(b.stays,700);
 assert.deepEqual(planRead(lots.map(x=>({path:x.path,size:1}))),{ok:true,wanted:['3-People/Ayla.md']});
 const big='x'.repeat(IMPORT_LIMITS.file+1);
 const c=ok(previewRepo([f('3-People/Ayla.md','x'),f('3-People/Borin.md',big)]));
 assert.deepEqual(c.tooBig,['3-People/Borin.md']);assert.equal(c.pages.length,1);assert.ok(c.notices.some(n=>/too big/.test(n)));
 assert.equal(ok(previewRepo([f('3-People/Ayla.md','y'.repeat(IMPORT_LIMITS.file))])).tooBig.length,0);
 // total text
 const chunk='z'.repeat(IMPORT_LIMITS.file),total=Array.from({length:Math.ceil(IMPORT_LIMITS.chars/IMPORT_LIMITS.file)+1},(_,i)=>f(`3-People/NPCs/n${i}.md`,chunk));
 const t=previewRepo(total);assert.equal(t.ok,false);assert.match(t.error,/too much/);
 // planRead skips what is too big to download and what is never read
 const plan=planRead([{path:'README.md',size:10},{path:'3-People/Ayla.md',size:100},{path:'3-People/Big.md',size:IMPORT_LIMITS.file*4+1},{path:'7-Library/x.md',size:5},{path:'8-Archive/x.md',size:5},{path:'3-People/README.md',size:5},{path:'AGENTS.md',size:5},{path:'a.png',size:5}]);
 assert.deepEqual(plan,{ok:true,wanted:['README.md','3-People/Ayla.md']});
 // with a wrapper folder the wanted paths keep it
 assert.deepEqual(planRead([{path:'top/README.md',size:1},{path:'top/3-People/Ayla.md',size:1},{path:'top/7-Library/a.md',size:1}]),{ok:true,wanted:['top/README.md','top/3-People/Ayla.md']});
});

test('relative links between imported files become page links; other links stay',()=>{
 const r=ok(previewRepo(repo()));
 const built=buildCampaign(r,{now:NOW,newId:mint}).workspace;
 const id=t=>built.entries.find(e=>e.title===t&&e.kind!=='folder').id;
 assert.equal(built.entries.find(e=>e.title==='Greyfen docks'&&e.kind==='place').body,`Busy docks. Meet [[${built.entries.find(e=>e.title==='Mara'&&e.kind==='character').id}|Mara]].`);
 assert.equal(built.entries.find(e=>e.title==='Ayla').body,`A scout from [[${built.entries.find(e=>e.title==='Greyfen docks').id}|Greyfen docks]].`);
 const s=built.entries.find(e=>e.title==='The Salt Road'&&e.kind==='session');
 assert.match(s.body,new RegExp(`See \\[\\[${built.entries.find(e=>e.title==='Ayla').id}\\|Ayla\\]\\] and \\[the web\\]\\(https://example.com/x.md\\)`));
 const first=built.entries.find(e=>e.kind==='session'&&/Arrival/.test(e.title));
 assert.match(first.body,/!\[a map\]\(map\.png\)/);// a picture is not a link
 assert.ok(id('Mara'));
 const ids=new Map([['a/b.md','ID1'],['c.md','ID2']]);
 assert.equal(rewriteLinks('[x](../c.md) [y](%zz.md) `[z](../c.md)` and [w](nope.md) and [v](../c.md#top)','a/q.md',ids),'[[ID2|x]] [y](%zz.md) `[z](../c.md)` and [w](nope.md) and [[ID2|v]]');
 assert.equal(rewriteLinks('```\n[x](../c.md)\n```\n[x](../c.md)','a/q.md',ids),'```\n[x](../c.md)\n```\n[[ID2|x]]');
 assert.equal(rewriteLinks('[x](../../c.md) [y](/c.md) [a|b](../c.md) [m](mailto:a@b.c)','a/q.md',ids),'[x](../../c.md) [y](/c.md) [a|b](../c.md) [m](mailto:a@b.c)');
 assert.equal(rewriteLinks('[B](b.md)','a/q.md',new Map([['A/B.MD','ID9'],['a/b.md','ID8']])),'[[ID8|B]]');
 // a link to a page that was split or not imported is left as written
 assert.match(built.entries.find(e=>e.title==='Locations and Lore').body,/\[\[[^\]]+\|Greyfen docks\]\]/);
});

test('the front page gets Where we are, from Current-State.md; a long one becomes a note with a link',()=>{
 const built=buildCampaign(ok(previewRepo(repo())),{now:NOW,newId:mint});
 const c=built.workspace.campaigns[0];
 assert.equal(c.frontPage.widgets[0].title,'Where we are');assert.equal(c.frontPage.widgets[0].type,'text');
 assert.match(c.frontPage.widgets[0].body,/\nNext session starting point\n/);// the # of a heading is dropped: the widget is plain text
 assert.ok(!c.frontPage.widgets[0].body.includes('#'));
 assert.ok(c.frontPage.widgets.some(w=>w.type==='party'));assert.ok(!c.frontPage.widgets.some(w=>w.id==='welcome'));
 const long='L'.repeat(4001);
 const r=ok(previewRepo([f('3-People/Ayla.md','x'),f('1-Now/Current-State.md',`# Current State\n\n${long}`)]));
 assert.equal(r.front.long,true);assert.ok(r.notices.some(n=>/longer than the front page/.test(n)));
 const b=buildCampaign(r,{now:NOW,newId:mint}).workspace,w=b.campaigns[0].frontPage.widgets[0];
 assert.equal(w.type,'links');const note=b.entries.find(e=>e.id===w.links[0].entryId);
 assert.equal(note.body,long);assert.equal(note.kind,'note');
 // none: no Where we are
 const n=buildCampaign(ok(previewRepo([f('3-People/Ayla.md','x')])),{now:NOW,newId:mint}).workspace;
 assert.ok(!n.campaigns[0].frontPage.widgets.some(w=>w.title==='Where we are'));
});

test('a new campaign is added next to the existing ones and never changes them',()=>{
 const existing=workspaceSchema.parse({schemaVersion:1,worlds:[{id:'w',name:'The Lantern Coast',description:'',archived:false}],campaigns:[{id:'c1',worldId:'w',name:'The Salt Road',description:'',github:{repository:'',branch:'main'}}],
  entries:[{id:'e1',worldId:'w',campaignId:'c1',parentId:null,title:'Ayla',kind:'character',body:'mine',character:defaultCharacter(),updatedAt:NOW}]});
 const before=JSON.stringify(existing);
 const built=buildCampaign(ok(previewRepo(repo())),{name:'Imported Salt Road'});
 const next=addImported(existing,built);
 assert.equal(JSON.stringify(existing),before);
 assert.equal(next.campaigns.length,2);assert.equal(next.worlds.length,2);
 assert.deepEqual(next.campaigns[0],existing.campaigns[0]);assert.deepEqual(next.entries[0],existing.entries[0]);
 assert.equal(next.campaigns[1].name,'Imported Salt Road');
 assert.ok(next.entries.slice(1).every(e=>e.campaignId===built.campaignId&&e.worldId===next.campaigns[1].worldId));
 assert.ok(next.entries.slice(1).every(e=>e.id!=='e1'));
 // real random ids are unique, and a second import is a second campaign
 const again=addImported(next,buildCampaign(ok(previewRepo(repo()))));
 assert.equal(again.campaigns.length,3);
 assert.equal(addImported(emptyWorkspace(),built).campaigns.length,1);
 assert.equal(buildCampaign(ok(previewRepo(repo())),{name:'  '}).name,'The Salt Road');
 assert.equal(buildCampaign(ok(previewRepo(repo())),{name:'x'.repeat(300)}).name.length,160);
});

test('detecting rosters',()=>{
 assert.equal(looksLikeRoster('Index',''),true);assert.equal(looksLikeRoster('Mara','A keeper.'),false);
 const links=Array.from({length:6},(_,i)=>`- [N${i}](n${i}.md)`).join('\n');
 assert.equal(looksLikeRoster('Everyone',links),true);
 assert.equal(looksLikeRoster('Everyone',links+'\n'+Array.from({length:12},(_,i)=>`- trait ${i}`).join('\n')),false);
});

test('round trip: an export without its restore copy imports with the same pages',()=>{
 const e=(id,title,kind,more={})=>({id,worldId:'w',campaignId:'c1',parentId:null,title,kind,body:'',overviewVisibility:'players',updatedAt:NOW,...more});
 const ch=role=>({...defaultCharacter(),role});
 const ws=workspaceSchema.parse({schemaVersion:1,worlds:[{id:'w',name:'The Lantern Coast',description:'',archived:false}],
  campaigns:[{id:'c1',worldId:'w',name:'The Salt Road',description:'Hello',github:{repository:'',branch:'main'}}],
  entries:[
   e('ayla','Ayla','character',{body:'A scout.\n\nShe knows the road.',character:ch('pc')}),
   e('borin','Borin','character',{body:'A dockhand.',character:ch('pc')}),
   e('mara','Mara','character',{body:'The keeper of maps.',character:ch('npc')}),
   e('cael','Cael','character',{body:'A companion.',character:ch('companion')}),
   e('bram','Bram','character',{body:'A bear.',character:ch('creature')}),
   e('greyfen','Greyfen docks','place',{body:'Busy docks.\n\n- piers\n- boats'}),
   e('salt','The Salt Road lore','lore',{body:'An old route.'}),
   e('guild','Dock guild','faction',{body:'Keepers of the light.'}),
   e('s1','Arrival','session',{body:'The party met someone.',recap:{status:'published',playedOn:'2026-11-01',timeline:[],quotes:[],gmNotes:'',review:[]}}),
   e('s2','The Salt Road','session',{body:'Fog rolled in.',recap:{status:'published',playedOn:'2026-11-08',timeline:[],quotes:[],gmNotes:'',review:[]}}),
   e('gmpage','Borin secrets','character',{body:'Owes a debt.',overviewVisibility:'gm',character:ch('npc')}),
  ]});
 const files=rpExportFiles(ws,'c1',{includeGm:true,exportedAt:NOW}).filter(x=>x.path!=='.rpg-tools/campaign.json');
 assert.ok(!files.some(x=>x.path==='.rpg-tools/campaign.json'));
 const r=ok(previewRepo(files.map(x=>({path:x.path,text:x.text}))));
 const built=buildCampaign(r,{now:NOW,newId:mint}).workspace;
 assert.equal(built.campaigns[0].name,'The Salt Road');
 const pub=ws.entries.filter(x=>x.overviewVisibility==='players');
 for(const x of pub){
  const got=built.entries.find(y=>y.title===x.title&&y.overviewVisibility==='players');
  assert.ok(got,x.title);
  assert.equal(got.kind,x.kind,x.title);
  assert.equal(got.body,x.body,x.title);
  if(x.kind==='character')assert.equal(got.character.role,x.character.role==='creature'?'npc':x.character.role,x.title);
  if(x.kind==='session')assert.equal(got.recap.playedOn,x.recap.playedOn,x.title);
 }
 // the GM-only page comes back as a GM-only page with the same words
 const gm=built.entries.find(y=>y.title==='Borin secrets');
 assert.ok(gm);assert.equal(gm.overviewVisibility,'gm');assert.match(gm.body,/Owes a debt\./);
 // nothing is copied twice and nothing from the library or archive shows up
 const names=built.entries.filter(y=>y.kind!=='folder').map(y=>y.title);
 assert.equal(names.filter(n=>n==='Ayla').length,1);
 assert.equal(r.stays,1);// only the library's own README
});

test('the whole result is a valid workspace, even from messy files',()=>{
 const mess=[f('3-People/Ayla.md','# '+'T'.repeat(400)+'\n\nbody'),f('3-People/Borin.md',''),f('3-People/NPCs/x.md','\uFEFF---\nbad\n'),f('2-Story/Sessions/2025-01-01.md','text'),f('2-Story/Sessions/2025-01-01.md.markdown','twice'),f('Weird Name (1).md','a'),f('1-Now/Current-State.md','None yet.')];
 const r=ok(previewRepo(mess));
 const w=buildCampaign(r,{now:NOW}).workspace;
 assert.ok(w.entries.every(x=>x.title.length<=160));
 assert.equal(workspaceSchema.safeParse(w).success,true);
});

const TOKEN='github_pat_TESTSECRET1234567890abcdef',REPO='ayla/salt-road';
test('GitHub: only the needed Markdown files are read, the key goes only to api.github.com',async()=>{
 const g=fakeGithub({token:TOKEN,repo:REPO});
 g.seed(Object.fromEntries(repo().map(x=>[x.path,x.text??'binary'])));
 assert.deepEqual((({ok,kind})=>[ok,kind])(await readRepoRestore(TOKEN,REPO,'main',g.fetch)),[false,'numbered']);
 g.log.length=0;
 const steps=[];
 const r=await readRepoFiles(TOKEN,REPO,'main',g.fetch,t=>steps.push(t));
 assert.equal(r.ok,true);
 const want=planRead(repo().map(x=>({path:x.path,size:(x.text??'binary').length}))).wanted;
 assert.equal(g.blobGets(),want.length);
 assert.ok(!want.some(p=>/^(7-Library|8-Archive)\//.test(p)));
 assert.ok(r.files.every(x=>x.text===undefined||want.includes(x.path)));
 assert.equal(r.files.length,repo().length);
 assert.ok(steps.length>0);
 assert.ok(g.log.every(x=>x.url.startsWith('https://api.github.com/')));
 assert.ok(g.log.every(x=>x.auth===`Bearer ${TOKEN}`));
 assert.ok(!JSON.stringify(r).includes(TOKEN));
 const p=ok(previewRepo(r.files,{name:'salt-road'}));
 assert.equal(p.pages.length,previewRepo(repo()).pages.length);
 assert.equal(p.campaignName,'The Salt Road');
 assert.deepEqual(buildCampaign(p,{newId:mint}).workspace.entries.map(e=>e.title).sort(),buildCampaign(ok(previewRepo(repo())),{newId:mint}).workspace.entries.map(e=>e.title).sort());
 // an empty repository, an over-limit one and a missing branch
 const empty=fakeGithub({token:TOKEN,repo:REPO,empty:true});
 assert.equal((await readRepoFiles(TOKEN,REPO,'main',empty.fetch)).ok,false);
 const big=fakeGithub({token:TOKEN,repo:REPO});
 big.seed(Object.fromEntries(Array.from({length:IMPORT_LIMITS.pages+1},(_,i)=>[`3-People/NPCs/n${i}.md`,'x'])));
 big.log.length=0;
 const over=await readRepoFiles(TOKEN,REPO,'main',big.fetch);
 assert.equal(over.ok,false);assert.equal(big.blobGets(),0);
 await assert.rejects(readRepoFiles(TOKEN,REPO,'nope',g.fetch),/does not exist/);
});

test('classifyZip sees any numbered folder as an RP repository',()=>{
 assert.equal(classifyZip(['2-Story/Sessions/a.md']),'numbered');
 assert.equal(classifyZip(['8-Archive/a.md']),'numbered');
 assert.equal(classifyZip(['notes/1-Now.md']),'unknown');
});

test('review fixes: closing hashes, CRLF front matter, fences, GM-marked files, UTF-8, long pages',async()=>{
 const {decodeText,readSources}=await import('../lib/encyclopedia/rp-import.ts');
 // "C#" keeps its #; CRLF front matter titles are read
 assert.equal(readMarkdown('# Learning C#\n\nx').title,'Learning C#');
 assert.equal(readMarkdown('# Title ##\n\nx').title,'Title');
 assert.equal(readMarkdown('---\r\ntitle: Mara\r\n---\r\nBody\r\n').title,'Mara');
 // a "---" rule with prose between is text, not front matter
 const rule='---\nIntro words\n---\nAfter\n';
 assert.equal(readMarkdown(rule).body,rule.trimEnd());
 assert.equal(readMarkdown('---\n---\nText').body,'Text');
 // a long run of blanks is fast
 const t0=Date.now();readMarkdown('# A\n\n'+' '.repeat(90000)+'x'+' '.repeat(90000));assert.ok(Date.now()-t0<1000);
 // headings inside a longer fence do not split Factions
 const fac=ok(previewRepo([f('4-World/Factions.md','# Factions\n\n## One\n\n````\n```\n## Not a heading\n```\n## Still code\n````\n\n## Two\n\nx\n'),f('3-People/A.md','# A\n')]));
 assert.deepEqual(titles(fac,'org'),['One','Two']);
 // a file that says it is a GM part stays GM-only, even in a public folder
 const gm=ok(previewRepo([f('3-People/NPCs/Villain.md','---\npart: gm-only\n---\n# Villain\n\nSecret.\n'),f('4-World/Places/Vault.md','# Vault (GM only)\n\nx\n'),f('1-Now/Current-State.md','---\nvisibility: gm\n---\n# State\n\nHidden.\n'),f('3-People/A.md','# A\n')]));
 for(const t of ['Villain','Vault (GM only)','State'])assert.equal(pageBy(gm,t).visibility,'gm',t);
 assert.equal(gm.front,null);
 assert.equal(pageBy(gm,'A').visibility,'players');
 // a README with CRLF still names the campaign
 assert.equal(ok(previewRepo([f('README.md','# Salt\r\n'),f('3-People/A.md','# A\n')])).campaignName,'Salt');
 // links that grow past 100,000 characters do not break the save
 const link="[x](B.md) ";
 const long='# A\n\n'+link.repeat(9000)+'z'.repeat(100000-5-link.length*9000);
 const lp=ok(previewRepo([f('3-People/A.md',long),f('3-People/B.md','# B\n\nb\n')]));
 const built=buildCampaign(lp,{newId:mint});
 assert.ok(built.workspace.entries.every(e=>e.body.length<=100000));
 // non-UTF-8 text is refused, not mangled
 assert.throws(()=>decodeText(new Uint8Array([0x63,0x61,0x66,0xe9]),'3-People/A.md'),/not UTF-8/);
 const bad=await readSources([{name:'3-People/A.md',size:4,bytes:async()=>new Uint8Array([0x63,0xe9])}]);
 assert.equal(bad.ok,false);
});
