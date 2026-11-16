import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const {workspaceSchema,defaultCharacter,importCopy,emptyWorkspace}=await import('../lib/encyclopedia/world-model.ts');
const {makeCalendar}=await import('../lib/encyclopedia/calendar-templates.ts');
const {newMap}=await import('../lib/encyclopedia/map-model.ts');
const {rpExportFiles,fileStem,assertSafePath,sha256Hex,textHash,isRewrittenPath,keepIfExists}=await import('../lib/encyclopedia/rp-export.ts');
const {readZip}=await import('../lib/zip-read.ts');
const {rpExportZip,readRestoreCopy}=await import('../lib/encyclopedia/rp-zip.ts');
const {zipFiles,crc32}=await import('../lib/bridge/zip.ts');

const AT='2026-11-16T10:00:00.000Z',NOW='2026-11-10T10:00:00.000Z';
const GM_MARKERS=['GM-TAB-TEXT','SECRET-LINE','GM-ONLY-PAGE','PIN-GM','Hidden cove','OBJ-GM-ONLY','LOG-GM','PREP-GM','RECAP-GM','DRAFT-BODY','SESSION-SECRET','moths','heights','Doom','Smugglers','GM-CAL-NOTE','GM-LORE','GM-EVENT','HIDDEN-QUEST','HIDDEN-TABLE-ROW','ROLL-NOTE'];
// makeCalendar uses random ids, so build the calendars once.
const CAL=makeCalendar('harptos'),GMCAL=makeCalendar('eberron');
function fixture(extra=[]){
 const cal=structuredClone(CAL);cal.visibility='players';cal.notes='GM-CAL-NOTE';
 cal.events=[{id:'ev1',title:'Harvest fair',notes:'Open to all',date:cal.current,visibility:'players',annual:true},{id:'ev2',title:'GM-EVENT',notes:'secret',date:cal.current,visibility:'gm',annual:false}];
 const gmCal=structuredClone(GMCAL);gmCal.id='gmcal';gmCal.name='Hidden calendar';gmCal.visibility='gm';
 const e=(id,title,kind,campaignId,more={})=>({id,worldId:'w',campaignId,parentId:null,title,kind,body:'',updatedAt:NOW,...more});
 const map=newMap();map.visibility='players';
 map.pins=[{id:'p1',title:'Greyfen docks',x:.2,y:.3,notes:'Open pier',entryId:'greyfen',visibility:'players'},{id:'p2',title:'Hidden cove',x:.6,y:.5,notes:'PIN-GM',entryId:'borin',visibility:'gm'},{id:'p3',title:'Lantern Rock',x:.8,y:.5,notes:'',entryId:'borin',visibility:'players'}];
 map.routes=[{id:'r1',name:'Salt Road',unit:'mi',stops:['p1','p3'],distances:[20],speed:3,hoursPerDay:8,visibility:'players'},{id:'r2',name:'Smugglers path',unit:'mi',stops:['p1','p2'],distances:[5],speed:3,hoursPerDay:8,visibility:'gm'}];
 const ws={schemaVersion:1,worlds:[{id:'w',name:'The Lantern Coast',description:'',archived:false}],
  campaigns:[{id:'c1',worldId:'w',name:'The Salt Road',description:'A missing cartographer.',github:{repository:'',branch:'main'},calendars:[cal,gmCal],
    statFields:[{id:'hp',label:'Health',section:'',type:'number',options:[],visibility:'players',archived:false},{id:'sec',label:'Secret fear',section:'',type:'text',options:[],visibility:'gm',archived:false}]},
   {id:'c2',worldId:'w',name:'Another story',description:'OTHER-CAMPAIGN',github:{repository:'',branch:'main'}}],
  entries:[
   e('greyfen','Greyfen docks','place',null,{overviewVisibility:'players',body:'Busy docks. Meet [[mara|Mara]], roll [[1d20+5|Spot]] and see [[borin]] and [[nowhere|Lost page]]. {{pier|ROLL-NOTE}}\n\n::: secret\nSECRET-LINE\n:::\n\nAfter.',tabs:[{id:'t1',title:'History',body:'Old things',visibility:'players'},{id:'t2',title:'GM tab',body:'GM-TAB-TEXT',visibility:'gm'}]}),
   e('mara','Mara','character',null,{overviewVisibility:'players',body:'The keeper of maps. See [[greyfen|Greyfen docks]].',character:{...defaultCharacter(),role:'npc',statsVisibility:'players',statsByCampaign:{c1:{hp:7,sec:'moths'},c2:{hp:99}}}}),
   e('borin','Borin','character','c1',{body:'GM-ONLY-PAGE',character:{...defaultCharacter(),role:'npc'}}),
   e('ayla','Ayla','character','c1',{overviewVisibility:'players',body:'A scout from [[greyfen|Greyfen docks]].',character:{...defaultCharacter(),role:'pc',statsVisibility:'players',statsByCampaign:{c1:{hp:12,sec:'heights'}},trackers:[{id:'t',label:'Shields',shape:'pips',colour:'blue',max:3,value:2},{id:'g',label:'Doom',shape:'bar',colour:'red',max:10,value:1,gm:true}]}}),
   e('cael','Cael','character','c1',{overviewVisibility:'players',body:'A companion.',character:{...defaultCharacter(),role:'companion'}}),
   e('bram','Bram','character','c1',{overviewVisibility:'players',body:'A bear.',character:{...defaultCharacter(),role:'creature'}}),
   e('s1','First night','session','c1',{overviewVisibility:'players',body:'The party met [[mara|Mara]].\n\n::: secret\nSESSION-SECRET\n:::',recap:{status:'published',playedOn:'2026-11-01',timeline:[],quotes:[],gmNotes:'RECAP-GM',review:[]}}),
   e('s2','Second night','session','c1',{overviewVisibility:'players',body:'Fog rolled in over [[greyfen|Greyfen docks]].',updatedAt:'2026-11-08T10:00:00.000Z'}),
   e('s3','Draft night','session','c1',{overviewVisibility:'players',body:'DRAFT-BODY',recap:{status:'draft',timeline:[],quotes:[],gmNotes:'',review:[]}}),
   e('q1','Find the cartographer','quest','c1',{overviewVisibility:'players',body:'Journal text',quest:{state:'active',type:'main',giverId:'mara',placeId:'borin',objectives:[{id:'o1',text:'Ask at the docks',done:false},{id:'o2',text:'OBJ-GM-ONLY',done:false,hidden:true}],log:[{id:'l1',at:'2026-11-02',text:'Seen',players:true},{id:'l2',at:'2026-11-03',text:'LOG-GM',players:false}],prep:'PREP-GM'}}),
   e('q2','HIDDEN-QUEST','quest','c1',{body:'x',quest:{state:'active',type:'side',objectives:[],log:[]}}),
   e('f1','Dock guild','faction',null,{overviewVisibility:'players',body:'Keepers of the light.'}),
   e('m1','Coast chart','map','c1',{overviewVisibility:'players',body:'The coast.',mapData:map}),
   e('th1','Loose threads','tasks','c1',{overviewVisibility:'players',body:'- [ ] Find it'}),
   e('fold','A folder','folder',null),
   e('l1','Lore of salt','lore',null,{body:'GM-LORE'}),
   ...extra]};
 return workspaceSchema.parse(ws);
}
const lib={schemaVersion:1,tables:[{id:'tb1',name:'Marsh encounters',category:'encounter',kind:'table',campaignIds:null,mode:'ranges',formula:'d6',rows:[{id:'r1',text:'HIDDEN-TABLE-ROW',min:1,max:3},{id:'r2',text:'Mist',min:4,max:6}],updatedAt:NOW}]};
const run=(ws=fixture(),o={})=>rpExportFiles(ws,'c1',{includeGm:true,exportedAt:AT,...o});
const get=(files,p)=>files.find(f=>f.path===p)?.text;
const paths=files=>files.map(f=>f.path);

test('the same input gives byte-identical output, whatever the order of entries',()=>{
 const a=run(),b=run(),ws=fixture();ws.entries.reverse();const c=run(ws);
 assert.deepEqual(a,b);const rest=x=>x.filter(f=>f.path!=='.rpg-tools/campaign.json');assert.deepEqual(rest(a),rest(c));
 assert.deepEqual(paths(a),[...paths(a)].sort());
 const x=run(fixture(),{includeGm:false}),y=run(fixture(),{includeGm:false});assert.deepEqual(x,y);
});

test('the numbered layout, with a README in every numbered folder and one line per file',()=>{
 const f=run({...fixture()},{tables:lib}),p=paths(f);
 for(const want of ['README.md','AGENTS.md','.rpg-tools/campaign.json','.rpg-tools/files.json','1-Now/Current-State.md','1-Now/Ayla-Sheet-Tracker.md','1-Now/Quests-and-Threads.md','2-Story/Timeline.md','2-Story/Handoff-History.md','3-People/Ayla.md','3-People/NPCs/README.md','4-World/Locations-and-Lore.md','4-World/Factions.md','4-World/Maps/Coast-chart.md','5-Rules-and-Setup/Campaign-Configuration.md','5-Rules-and-Setup/Player-Wishes.md','5-Rules-and-Setup/Overrides-and-Rulings.md','5-Rules-and-Setup/Save-Procedure.md','6-GM-Only/Director-Notes.md','6-GM-Only/5-Rules-and-Setup/Random-Tables/Marsh-encounters.md','7-Library/README.md','8-Archive/README.md','8-Archive/Export-Log.md'])assert(p.includes(want),want);
 for(const dir of ['1-Now','2-Story','3-People','3-People/NPCs','4-World','5-Rules-and-Setup','6-GM-Only','7-Library','8-Archive']){
  const readme=get(f,`${dir}/README.md`);assert(readme,dir);assert(/Spoilers: /.test(readme),dir);
  for(const file of p.filter(x=>x.startsWith(dir+'/')&&x!==`${dir}/README.md`)){
   const sub=p.find(r=>r.endsWith('/README.md')&&r!==`${dir}/README.md`&&file.startsWith(r.slice(0,-'/README.md'.length)+'/')&&r.startsWith(dir+'/'));
   const target=(sub?sub.slice(0,-'README.md'.length):file).slice(dir.length+1);
   assert(readme.includes(`](${sub?target+'README.md':target})`),`${dir} README lists ${file}`);}
 }
 assert.match(get(f,'README.md'),/^# The Salt Road\n\nA missing cartographer\./);
 assert.match(get(f,'README.md'),/## Where we are[\s\S]*In-game date: Calendar of Harptos: 1 Hammer, 1492 DR[\s\S]*Latest session: \[Second night\]\(2-Story\/Sessions\/2026-11-08-Second-night\.md\)[\s\S]*Open quests:\n {2}- \[Find the cartographer\][\s\S]*## Folders/);
 assert.match(get(f,'README.md'),/\| \[6-GM-Only\]\(6-GM-Only\/README\.md\) .* \| Yes, all of it \|/);
 const agents=get(f,'AGENTS.md');
 for(const needle of ['ai-gm-revised','1-Now','Campaign-Configuration.md','Player-Wishes.md','Overrides-and-Rulings.md','rpg-tools-id','.rpg-tools/','Export-Log.md','2-Story/Sessions/','front matter'])assert(agents.includes(needle),needle);
 assert.match(get(f,'2-Story/Handoff-History.md'),/None yet\./);assert.match(get(f,'5-Rules-and-Setup/Player-Wishes.md'),/## Entry format[\s\S]*None yet\./);
 assert.match(get(f,'5-Rules-and-Setup/Overrides-and-Rulings.md'),/## Entry format[\s\S]*None yet\./);
 assert.match(get(f,'2-Story/Timeline.md'),/## Sessions, newest first\n\n- 2026-11-08 [\s\S]*- 2026-11-01 [\s\S]*## Calendar events\n\n- 1 Hammer, 1492 DR \(every year\) - Harvest fair/);
 assert.match(get(f,'1-Now/Current-State.md'),/## Date[\s\S]*1 Hammer, 1492 DR[\s\S]*## Most recent session[\s\S]*Fog rolled in over Greyfen docks\./);
 assert.match(get(f,'1-Now/Ayla-Sheet-Tracker.md'),/- Health: 12/);assert.match(get(f,'1-Now/Ayla-Sheet-Tracker.md'),/- Shields: 2\/3/);
 const quests=get(f,'1-Now/Quests-and-Threads.md');assert.match(quests,/## Active[\s\S]*### Find the cartographer[\s\S]*- \[ \] Ask at the docks/);assert.match(quests,/## Task lists[\s\S]*Loose threads/);
 assert.match(get(f,'4-World/Maps/Coast-chart.md'),/### Pins\n\n- Greyfen docks at 20%, 30%/);
 assert.equal(JSON.parse(get(f,'.rpg-tools/campaign.json')).campaigns[0].id,'c1');
});

test('characters go by role: PC at the top, companions and NPCs (creatures too) in their folders',()=>{
 const p=paths(run());
 assert(p.includes('3-People/Ayla.md'));assert(p.includes('3-People/Companions/Cael.md'));assert(p.includes('3-People/NPCs/Mara.md'));assert(p.includes('3-People/NPCs/Bram.md'));
 assert(!p.some(x=>x.startsWith('3-People/')&&/Cael|Bram|Mara/.test(x)&&!/Companions|NPCs/.test(x)));
 const idx=get(run(),'3-People/NPCs/README.md');assert(idx.includes('(Mara.md)')&&idx.includes('(Bram.md)')&&idx.includes('(creature)'));
 assert(get(run(),'3-People/Ayla.md').startsWith('---\nrpg-tools-id: ayla\nkind: character\nupdated: '+NOW+'\n---\n# Ayla\n'));
});

test('session files are dated, hyphenated and named from the title',()=>{
 const p=paths(run()).filter(x=>x.includes('Sessions/'));
 assert.deepEqual(p,['2-Story/Sessions/2026-11-01-First-night.md','2-Story/Sessions/2026-11-08-Second-night.md','6-GM-Only/2-Story/Sessions/2026-11-01-First-night.md','6-GM-Only/2-Story/Sessions/2026-11-10-Draft-night.md']);
 assert(!paths(run(fixture(),{includeGm:false})).some(x=>x.includes('Draft-night')));
});

test('[[id|Label]] links become relative file links; anything that cannot resolve becomes plain text; rolls stay',()=>{
 const f=run(),docks=get(f,'4-World/Places/Greyfen-docks.md');
 assert(docks.includes('[Mara](../../3-People/NPCs/Mara.md)'));assert(docks.includes('Spot (1d20+5)'));assert(docks.includes('Lost page'));assert(!docks.includes('[['));assert(!docks.includes('ROLL-NOTE'));
 assert(get(f,'3-People/Ayla.md').includes('[Greyfen docks](../4-World/Places/Greyfen-docks.md)'));
 assert(get(f,'2-Story/Sessions/2026-11-01-First-night.md').includes('[Mara](../../3-People/NPCs/Mara.md)'));
 assert(get(f,'3-People/NPCs/Mara.md').includes('[Greyfen docks](../../4-World/Places/Greyfen-docks.md)'));
 // links by title work, and a link to a page players cannot read is only its words
 const ws=fixture([{id:'x1',worldId:'w',campaignId:'c1',parentId:null,title:'Link test',kind:'note',overviewVisibility:'players',body:'Go to [[greyfen docks]] then [[Borin]] or [[borin|the hidden one]]. Quiet [[borin]] end.',tabs:[{id:'g',title:'Notes',body:'Ask [[borin|the old man]] and [[Greyfen Docks]].',visibility:'gm'}],updatedAt:NOW}]);
 const t=get(run(ws,{includeGm:false}),'4-World/Lore/Link-test.md');
 assert(t.includes('[Greyfen docks](../Places/Greyfen-docks.md)'));assert(t.includes('then Borin or the hidden one. Quiet  end.'));
 const g=get(run(ws),'6-GM-Only/4-World/Lore/Link-test.md');assert(g.includes('[the old man](../../3-People/NPCs/Borin.md)'));assert(g.includes('[Greyfen docks](../../../4-World/Places/Greyfen-docks.md)'));
 const gmTwin=get(run(ws),'6-GM-Only/2-Story/Timeline.md');assert(gmTwin.includes('(Sessions/2026-11-10-Draft-night.md)'));
});

test('with includeGm false no GM content appears anywhere, and there is no 6-GM-Only folder or restore copy',()=>{
 const f=run(fixture(),{includeGm:false,tables:lib}),p=paths(f);
 assert(!p.some(x=>x.startsWith('6-GM-Only/')));assert(!p.includes('.rpg-tools/campaign.json'));assert(p.includes('.rpg-tools/files.json'));
 const all=f.map(x=>x.path+'\n'+x.text).join('\n');
 for(const m of GM_MARKERS)assert(!all.includes(m),`leaked ${m}`);
 for(const m of ['Hidden calendar','OTHER-CAMPAIGN','Another story','Draft night','Borin'.concat('-')])assert(!all.includes(m),`leaked ${m}`);
 assert(!/Random-Tables|Marsh encounters/.test(all));
 assert(JSON.parse(get(f,'.rpg-tools/files.json')).includeGm===false);
 assert.match(get(f,'AGENTS.md'),/player-safe export[\s\S]*no 6-GM-Only folder and no \.rpg-tools\/campaign\.json/);
 assert.match(get(f,'README.md'),/Not in this export/);
 // the public part of what has a GM part is still there
 assert(get(f,'4-World/Places/Greyfen-docks.md').includes('## History'));assert(get(f,'4-World/Maps/Coast-chart.md').includes('Lantern Rock'));assert(!get(f,'4-World/Maps/Coast-chart.md').includes('Hidden cove'));
 assert(get(f,'1-Now/Quests-and-Threads.md').includes('Ask at the docks'));assert(get(f,'3-People/NPCs/Mara.md').includes('- Health: 7'));
 assert(!p.some(x=>/Borin|Lore-of-salt|Draft/.test(x)));
});

test('with includeGm true the GM parts sit under 6-GM-Only at the same path, and public files stay player-only',()=>{
 const f=run(fixture(),{tables:lib}),pub=f.filter(x=>!x.path.startsWith('6-GM-Only/')&&!x.path.startsWith('.rpg-tools/campaign'));
 const pubText=pub.map(x=>x.text).join('\n');
 for(const m of GM_MARKERS)assert(!pubText.includes(m),`public tree leaked ${m}`);
 const at=(p)=>get(f,'6-GM-Only/'+p);
 assert(at('4-World/Places/Greyfen-docks.md').includes('GM-TAB-TEXT')&&at('4-World/Places/Greyfen-docks.md').includes('::: secret\nSECRET-LINE\n:::'));
 assert(at('3-People/NPCs/Borin.md').includes('GM-ONLY-PAGE'));assert(at('3-People/NPCs/Mara.md').includes('Secret fear: moths'));
 assert(at('1-Now/Ayla-Sheet-Tracker.md').includes('Secret fear: heights')&&at('1-Now/Ayla-Sheet-Tracker.md').includes('Doom: 1/10'));
 assert(at('1-Now/Quests-and-Threads.md').includes('OBJ-GM-ONLY')&&at('1-Now/Quests-and-Threads.md').includes('LOG-GM')&&at('1-Now/Quests-and-Threads.md').includes('PREP-GM')&&at('1-Now/Quests-and-Threads.md').includes('HIDDEN-QUEST'));
 assert(at('4-World/Maps/Coast-chart.md').includes('PIN-GM')&&at('4-World/Maps/Coast-chart.md').includes('Smugglers path'));
 assert(at('2-Story/Sessions/2026-11-01-First-night.md').includes('RECAP-GM')&&at('2-Story/Sessions/2026-11-01-First-night.md').includes('SESSION-SECRET'));
 assert(at('2-Story/Sessions/2026-11-10-Draft-night.md').includes('DRAFT-BODY'));
 assert(at('5-Rules-and-Setup/Campaign-Configuration.md').includes('GM-CAL-NOTE')&&at('5-Rules-and-Setup/Campaign-Configuration.md').includes('Hidden calendar'));
 assert(at('2-Story/Timeline.md').includes('GM-EVENT'));
 assert(at('5-Rules-and-Setup/Random-Tables/Marsh-encounters.md').includes('1-3: HIDDEN-TABLE-ROW'));
 assert(at('3-People/NPCs/Borin.md').startsWith('---\nrpg-tools-id: borin\nkind: character\nupdated: '+NOW+'\npart: gm-only\n---\n# Borin (GM only)'));
 assert(get(f,'.rpg-tools/campaign.json').includes('HIDDEN-QUEST'));
 assert(!get(f,'.rpg-tools/campaign.json').includes('OTHER-CAMPAIGN'));assert(!get(f,'.rpg-tools/campaign.json').includes('"hp": 99'));
 assert.match(get(f,'6-GM-Only/README.md'),/Spoilers: yes, all of it/);
 assert.match(get(f,'AGENTS.md'),/6-GM-Only\/Director-Notes\.md/);
});

test('a GM pin and a GM route are left out of the player map even on a shared map',()=>{
 const f=run(fixture(),{includeGm:false}),m=get(f,'4-World/Maps/Coast-chart.md');
 assert(m.includes('Salt Road: Greyfen docks -> Lantern Rock'));assert(!m.includes('Smugglers'));
 // the pin that links a page players cannot read shows no link
 assert(m.includes('- Lantern Rock at 80%, 50%\n'));assert(!m.includes('Borin'));
});

test('file names are readable ASCII and no path can escape, even for hostile titles',()=>{
 const titles=['../../etc/passwd','CON','con','NUL','COM1','LPT9','README','readme','🙂🙂','Ünïcödé Åsa','a'.repeat(160),'..','.','/abs/path','back\\slash','C:\\Windows','tab\tnew\nline','   ','Trailing dot.','Bjørn the Ærie',"quote's \"title\""];
 const extra=titles.map((t,i)=>({id:'h'+i,worldId:'w',campaignId:'c1',parentId:null,title:t.trim()||'blank',kind:'lore',overviewVisibility:'players',body:'text',updatedAt:NOW}));
 for(const gm of [true,false]){
  const f=run(fixture(extra),{includeGm:gm});
  for(const x of f){assertSafePath(x.path);assert(/^[A-Za-z0-9._\-/]+$/.test(x.path),x.path);assert(!x.path.split('/').includes('..'));assert(!x.path.startsWith('/'));assert(!x.path.includes('\\'));assert(x.path.split('/').every(s=>s.length<=80),x.path);}
  const lower=paths(f).map(x=>x.toLowerCase());assert.equal(new Set(lower).size,lower.length);
  assert(!paths(f).some(x=>/^(con|prn|aux|nul|com[1-9]|lpt[1-9]|readme)\./i.test(x.split('/').pop())&&x.split('/').pop()!=='README.md'));
 }
 assert.equal(fileStem('../../etc/passwd'),'etc-passwd');assert.equal(fileStem('CON'),'CON-page');assert.equal(fileStem('🙂','Place'),'Place');assert.equal(fileStem('Bjørn Ærie'),'Bjorn-AErie');assert(fileStem('x'.repeat(500)).length<=60);
 assert.throws(()=>assertSafePath('../x'),/Unsafe/);assert.throws(()=>assertSafePath('/x'),/Unsafe/);assert.throws(()=>assertSafePath('a\\b'),/Unsafe/);assert.throws(()=>assertSafePath('a/../b'),/Unsafe/);assert.throws(()=>assertSafePath('é.md'),/Unsafe/);
 const p=paths(run(fixture(extra)));assert(p.includes('4-World/Lore/etc-passwd.md'));assert(p.includes('4-World/Lore/CON-page.md'));assert(p.includes('4-World/Lore/README-page.md'));
});

test('pages with the same title get stable, unique names: the lowest id keeps the plain name',()=>{
 const mk=(id,t)=>({id,worldId:'w',campaignId:'c1',parentId:null,title:t,kind:'place',overviewVisibility:'players',body:id,updatedAt:NOW});
 const a=run(fixture([mk('z9','Quay'),mk('a1','Quay'),mk('m5','quay'),mk('b2','Quay-2')]));
 const names=paths(a).filter(x=>x.startsWith('4-World/Places/')&&/Quay/i.test(x));
 assert.deepEqual(names,['4-World/Places/Quay-2.md','4-World/Places/Quay-4.md','4-World/Places/Quay.md','4-World/Places/quay-3.md']);
 assert(get(a,'4-World/Places/Quay.md').includes('rpg-tools-id: a1'));assert(get(a,'4-World/Places/quay-3.md').includes('rpg-tools-id: m5'));
 const ws=fixture([mk('z9','Quay'),mk('a1','Quay')]);ws.entries.reverse();assert.equal(a.filter(x=>/quay/i.test(x.path)).length,4);
 const b=run(ws);assert(get(b,'4-World/Places/Quay.md').includes('rpg-tools-id: a1'));assert(get(b,'4-World/Places/Quay-2.md').includes('rpg-tools-id: z9'));
});

test('files.json maps page files to ids and holds the SHA-256 of every other file as written; the log counts the files',()=>{
 const f=run(fixture(),{tables:lib}),ids=JSON.parse(get(f,'.rpg-tools/files.json'));
 assert.equal(ids.pages['3-People/NPCs/Mara.md'],'mara');assert.equal(ids.pages['6-GM-Only/3-People/NPCs/Mara.md'],'mara');assert.equal(ids.pages['2-Story/Sessions/2026-11-01-First-night.md'],'s1');assert.equal(ids.campaignId,'c1');
 for(const x of f){if(x.path.startsWith('.rpg-tools/'))assert.equal(ids.hashes[x.path],undefined);else assert.equal(ids.hashes[x.path],createHash('sha256').update(x.text).digest('hex'),x.path);}
 for(const p of Object.keys(ids.pages))assert(get(f,p).startsWith('---\nrpg-tools-id: '+ids.pages[p]+'\n'));
 assert(get(f,'8-Archive/Export-Log.md').trimEnd().endsWith(`- ${AT} - ${f.length} files`));
 const again=run(fixture(),{tables:lib,exportedAt:'2026-11-17T00:00:00.000Z',exportLog:get(f,'8-Archive/Export-Log.md')});
 const log=get(again,'8-Archive/Export-Log.md');assert(log.includes(`- ${AT} - ${f.length} files\n- 2026-11-17T00:00:00.000Z - ${again.length} files`));
 assert(isRewrittenPath('README.md')&&isRewrittenPath('3-People/NPCs/README.md')&&isRewrittenPath('.rpg-tools/files.json')&&!isRewrittenPath('1-Now/Current-State.md'));assert(keepIfExists('5-Rules-and-Setup/Player-Wishes.md')&&!keepIfExists('README.md'));
 for(const s of ['','a','abc','x'.repeat(55),'x'.repeat(56),'x'.repeat(64),'x'.repeat(1000),'é€𝄞'])assert.equal(sha256Hex(new TextEncoder().encode(s)),createHash('sha256').update(s).digest('hex'));assert.equal(textHash('abc'),createHash('sha256').update('abc').digest('hex'));
});

test('only this campaign and shared lore are exported, and the text uses straight quotes',()=>{
 const f=run(),all=f.map(x=>x.text).join('\n');assert(!all.includes('OTHER-CAMPAIGN'));
 const generated=f.filter(x=>/README\.md$|^AGENTS\.md$|Save-Procedure|Player-Wishes|Overrides|Handoff|Director/.test(x.path)).map(x=>x.text).join('\n');assert(!/[\u2018\u2019\u201c\u201d\u2013\u2014]/.test(generated));
 assert.throws(()=>rpExportFiles(fixture(),'nope',{includeGm:true,exportedAt:AT}),/Campaign not found/);
});

/* ---- zip ---- */
const enc=new TextEncoder();
async function deflateRaw(data){const s=new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));return new Uint8Array(await new Response(s).arrayBuffer());}
/** A zip with a hand-built header. Each entry: name, data, method 0 or 8, optional flags, size overrides. */
async function buildZip(entries,{zip64=false}={}){
 const parts=[],central=[];let offset=0;
 for(const e of entries){
  const name=enc.encode(e.name),raw=typeof e.data==='string'?enc.encode(e.data):e.data,packed=(e.method??0)===8?await deflateRaw(raw):raw,usize=e.usize??raw.length,csize=e.csize??packed.length;
  const l=new DataView(new ArrayBuffer(30));l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,e.flags??0x0800,true);l.setUint16(8,e.method??0,true);l.setUint32(14,crc32(raw),true);l.setUint32(18,csize,true);l.setUint32(22,usize,true);l.setUint16(26,name.length,true);
  parts.push(new Uint8Array(l.buffer),name,packed);
  const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,e.flags??0x0800,true);c.setUint16(10,e.method??0,true);c.setUint32(16,crc32(raw),true);c.setUint32(20,csize,true);c.setUint32(24,usize,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
  central.push(new Uint8Array(c.buffer),name);offset+=30+name.length+packed.length;
 }
 const cdSize=central.reduce((n,p)=>n+p.length,0),end=new DataView(new ArrayBuffer(22));end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,cdSize,true);end.setUint32(16,offset,true);
 const all=[...parts,...central,...(zip64?[(()=>{const z=new Uint8Array(20);new DataView(z.buffer).setUint32(0,0x07064b50,true);return z;})()]:[]),new Uint8Array(end.buffer)];
 const out=new Uint8Array(all.reduce((n,p)=>n+p.length,0));let at=0;for(const p of all){out.set(p,at);at+=p.length;}return out;
}
const text=f=>new TextDecoder().decode(f.data);

test('zip round trip: an export written with zipFiles reads back unchanged, and is the same bytes every time',async()=>{
 const f=run(),zip=rpExportZip(f);assert.deepEqual(zip,rpExportZip(run()));
 const back=await readZip(zip);assert.deepEqual(back.map(x=>x.name),f.map(x=>x.path));assert.deepEqual(back.map(text),f.map(x=>x.text));
});

test('zip round trip: stored and deflated entries both read back, with checksums checked',async()=>{
 const body='Hello from The Salt Road. '.repeat(200),small='hi';
 const zip=await buildZip([{name:'a/stored.txt',data:small,method:0},{name:'a/deflated.txt',data:body,method:8},{name:'a/empty.txt',data:'',method:0},{name:'a/dir/',data:'',method:0}]);
 const back=await readZip(zip);assert.deepEqual(back.map(x=>x.name),['stored.txt','deflated.txt','empty.txt']);assert.equal(text(back[0]),small);assert.equal(text(back[1]),body);assert.equal(back[2].data.length,0);
 const bad=await buildZip([{name:'x.txt',data:body,method:8}]);bad[bad.length-22-46-5-3]^=0xff;await assert.rejects(readZip(bad),/damaged|decompressed|larger/);
});

test('a single shared top-level folder is stripped (GitHub Download ZIP); mixed layouts and macOS metadata are handled',async()=>{
 const one=await readZip(await buildZip([{name:'repo-main/README.md',data:'a'},{name:'repo-main/.rpg-tools/campaign.json',data:'{}'},{name:'repo-main/1-Now/x.md',data:'b'}]));
 assert.deepEqual(one.map(x=>x.name),['README.md','.rpg-tools/campaign.json','1-Now/x.md']);
 const mixed=await readZip(await buildZip([{name:'README.md',data:'a'},{name:'repo-main/x.md',data:'b'}]));assert.deepEqual(mixed.map(x=>x.name),['README.md','repo-main/x.md']);
 const two=await readZip(await buildZip([{name:'a/x.md',data:'a'},{name:'b/y.md',data:'b'}]));assert.deepEqual(two.map(x=>x.name),['a/x.md','b/y.md']);
 const mac=await readZip(await buildZip([{name:'repo-main/x.md',data:'a'},{name:'__MACOSX/repo-main/._x.md',data:'junk'}]));assert.deepEqual(mac.map(x=>x.name),['x.md']);
 const lone=await readZip(await buildZip([{name:'only/one.md',data:'a'}]));assert.deepEqual(lone.map(x=>x.name),['one.md']);
});

test('the zip reader refuses encrypted entries, zip64, too many files, too much data, unsafe names and junk',async()=>{
 await assert.rejects(readZip(await buildZip([{name:'a.txt',data:'x',flags:0x0801}])),/Encrypted/);
 await assert.rejects(readZip(await buildZip([{name:'a.txt',data:'x'}],{zip64:true})),/ZIP64/);
 const many=zipFiles(Array.from({length:5001},(_,i)=>({name:`f${i}.txt`,data:new Uint8Array(0)})));await assert.rejects(readZip(many),/more than 5000/);
 const ok=zipFiles(Array.from({length:5000},(_,i)=>({name:`f${i}.txt`,data:new Uint8Array(0)})));assert.equal((await readZip(ok)).length,5000);
 const big=new Uint8Array(30*1024*1024);await assert.rejects(readZip(await buildZip([{name:'a.bin',data:big,method:8},{name:'b.bin',data:big,method:8}])),/50 MB/);
 await assert.rejects(readZip(await buildZip([{name:'a.bin',data:new Uint8Array(100000),method:8,usize:10}])),/larger than it says|damaged/);
 for(const name of ['../evil.txt','a/../../evil.txt','/abs.txt','C:/x.txt','a//b.txt'])await assert.rejects(readZip(await buildZip([{name,data:'x'}])),/unsafe/i,name);
 assert.deepEqual((await readZip(await buildZip([{name:'a.txt',data:'x'},{name:'dir\\b.txt',data:'y'}]))).map(x=>x.name),['a.txt','dir/b.txt']);
 await assert.rejects(readZip(enc.encode('not a zip at all, just some text')),/not a ZIP/);
 await assert.rejects(readZip(new Uint8Array(0)),/not a ZIP/);
 const dup=await buildZip([{name:'a.txt',data:'1'},{name:'a.txt',data:'2'}]);await assert.rejects(readZip(dup),/two files/);
 const cut=await buildZip([{name:'a.txt',data:'hello world'}]);await assert.rejects(readZip(cut.slice(0,cut.length-30)),/ZIP|damaged/);
});

test('readRestoreCopy finds .rpg-tools/campaign.json and importCopy imports it as a new copy',async()=>{
 const f=run(),files=await readZip(rpExportZip(f)),r=readRestoreCopy(files);
 assert.equal(r.ok,true);assert.equal(r.from,'.rpg-tools/campaign.json');assert.equal(r.workspace.campaigns[0].id,'c1');assert(!r.workspace.entries.some(e=>e.title==='x'));
 const current=emptyWorkspace(),next=importCopy(current,r.workspace);assert.equal(next.campaigns.length,1);assert.notEqual(next.campaigns[0].id,'c1');assert.equal(next.entries.length,r.workspace.entries.length);
 const inFolder=readRestoreCopy((await readZip(await buildZip(f.map(x=>({name:'repo-main/'+x.path,data:x.text}))))));assert.equal(inFolder.ok,true);
});

test('readRestoreCopy gives a clear error for a missing, player-safe, broken or wrong file, and reads the old world-manager path',async()=>{
 const data=s=>enc.encode(s),file=(name,s)=>({name,data:data(s)});
 let r=readRestoreCopy([file('README.md','x')]);assert.equal(r.ok,false);assert.match(r.error,/No restore copy/);
 r=readRestoreCopy(await readZip(rpExportZip(run(fixture(),{includeGm:false}))));assert.equal(r.ok,false);assert.match(r.error,/player-safe/);
 r=readRestoreCopy([file('.rpg-tools/campaign.json','{nope')]);assert.equal(r.ok,false);assert.match(r.error,/not valid JSON/);
 r=readRestoreCopy([file('.rpg-tools/campaign.json','{"schemaVersion":2}')]);assert.equal(r.ok,false);assert.match(r.error,/not a valid campaign copy/);
 const two=fixture();two.campaigns.push({...two.campaigns[0],id:'c3',name:'Third'});r=readRestoreCopy([file('.rpg-tools/campaign.json',JSON.stringify(two))]);assert.equal(r.ok,false);assert.match(r.error,/exactly one campaign/);
  const scoped=JSON.stringify(workspaceSchema.parse(JSON.parse(get(run(),'.rpg-tools/campaign.json'))));
 r=readRestoreCopy([file('world-manager/c1/campaign.json','\uFEFF'+scoped)]);assert.equal(r.ok,true);assert.equal(r.from,'world-manager/c1/campaign.json');
 r=readRestoreCopy([file('world-manager/c1/campaign.json',scoped),file('world-manager/c2/campaign.json',scoped)]);assert.equal(r.ok,false);assert.match(r.error,/several old/);
 r=readRestoreCopy([file('world-manager/c1/campaign.json',scoped),file('.rpg-tools/campaign.json',scoped)]);assert.equal(r.from,'.rpg-tools/campaign.json');
});
