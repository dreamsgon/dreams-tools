import test from 'node:test';
import assert from 'node:assert/strict';
const {isThisCampaign,planBringBack,applyBringBack,parseFilesMap,saveBringBack,readBringSources,choicesFor,defaultChoice,isRebuilt}=await import('../lib/encyclopedia/rp-bring-back.ts');
const {rpExportFiles,textHash,planWrite,sameApartFromOwned}=await import('../lib/encyclopedia/rp-export.ts');
const {preparePush,pushFiles,readRepoChanges,textBlobSha}=await import('../lib/github-push.ts');
const {workspaceSchema,defaultCharacter}=await import('../lib/encyclopedia/world-model.ts');
const {zipFiles}=await import('../lib/bridge/zip.ts');
const {readZip}=await import('../lib/zip-read.ts');
const {fakeGithub}=await import('./helpers/fake-github.mjs');

const T0='2026-11-14T10:00:00.000Z',NOW='2026-11-16T09:00:00.000Z',TOKEN='github_pat_TESTSECRET1234567890abcdef',REPO='ayla/salt-road';
const entry=(id,title,kind,extra={})=>({id,worldId:'w1',campaignId:'c1',parentId:null,title,kind,body:'',updatedAt:T0,...extra});
const baseWs=()=>workspaceSchema.parse({schemaVersion:1,worlds:[{id:'w1',name:'The Lantern Coast',description:'',archived:false}],
 campaigns:[{id:'c1',worldId:'w1',name:'The Salt Road',description:'',github:{repository:REPO,branch:'main'}}],
 entries:[
  entry('mara','Mara','character',{overviewVisibility:'players',body:'The keeper of maps.\n\nShe trades at [[docks|Greyfen docks]].',character:{...defaultCharacter(),role:'npc'},
    tabs:[{id:'t1',title:'History',body:'Came from the north.',visibility:'players'},{id:'t2',title:'Secrets',body:'She sold the map.',visibility:'gm'}]}),
  entry('ayla','Ayla','character',{overviewVisibility:'players',body:'A scout.',character:{...defaultCharacter(),role:'pc',statsVisibility:'players',trackers:[{id:'k1',label:'Hit points',value:12,max:14,shape:'bar',colour:'green'}]}}),
  entry('docks','Greyfen docks','place',{overviewVisibility:'players',body:'Busy docks.'}),
  entry('bram','Bram','character',{overviewVisibility:'gm',body:'Bram is the culprit.',character:{...defaultCharacter(),role:'npc'}}),
  entry('borin','Borin','character',{overviewVisibility:'players',body:'A dockhand.\n\n::: secret\nBorin owes a debt.\n:::',character:{...defaultCharacter(),role:'npc'}}),
  entry('s1','The first night','session',{overviewVisibility:'players',body:'The party arrived.',recap:{status:'published',mine:true,playedOn:'2026-11-08',timeline:[],quotes:[],gmNotes:'',review:[]}}),
 ]});
const exportOf=(ws,at=T0)=>rpExportFiles(ws,'c1',{includeGm:true,exportedAt:at});
const byPath=(files)=>Object.fromEntries(files.map(f=>[f.path,f.text]));
/** The repository after a push: every exported file. `edit` changes it like an AI GM would. */
function repoAfter(ws,edit={},{remove=[]}={}){
  const files=byPath(exportOf(ws));for(const [p,t] of Object.entries(edit))files[p]=t;for(const p of remove)delete files[p];
  return {map:parseFilesMap(files['.rpg-tools/files.json']),files:Object.entries(files).map(([path,text])=>({path,text})),log:files['8-Archive/Export-Log.md'],raw:files};
}
const plan=(ws,repo,o={})=>planBringBack(ws,'c1',{map:repo.map,files:repo.files,log:repo.log},{now:NOW,newId:(()=>{let n=0;return()=>`n${++n}`;})(),...o});
const sel=(p,over={})=>({checked:new Set(p.rows.map(r=>r.key)),choices:{},show:false,...over});
const apply=(ws,p,s=sel(p),o={})=>{const r=applyBringBack(ws,p,s,{now:NOW,newId:(()=>{let n=100;return()=>`m${++n}`;})(),...o});assert.ok(r.ok,r.error);return r;};
const page=(ws,id)=>ws.entries.find(e=>e.id===id);
const MARA='3-People/NPCs/Mara.md',MARA_GM='6-GM-Only/3-People/NPCs/Mara.md',DOCKS='4-World/Places/Greyfen-docks.md',STATE='1-Now/Current-State.md',SHEET='1-Now/Ayla-Sheet-Tracker.md';

test('files.json is read, and an export from another campaign is not offered',()=>{
  const ws=baseWs(),repo=repoAfter(ws);
  assert.equal(repo.map.campaignId,'c1');assert.equal(repo.map.includeGm,true);assert.ok(repo.map.hashes[MARA]);assert.equal(repo.map.pages[MARA],'mara');
  assert.equal(parseFilesMap('not json'),null);assert.equal(parseFilesMap('{"format":"other"}'),null);
  assert.equal(isThisCampaign(repo.map,'c1'),true);assert.equal(isThisCampaign(repo.map,'c9'),false);assert.equal(isThisCampaign(null,'c1'),false);
  // A copy restored as a new campaign has new ids, so its export is of another campaign: only the restore choice shows.
  const copy=structuredClone(ws);copy.campaigns[0].id='c2';for(const e of copy.entries)e.campaignId='c2';
  assert.equal(isThisCampaign(repoAfter(ws).map,copy.campaigns[0].id),false);
});

test('an edited overview and tab come back exactly: wording, unicode and CRLF, with the page history kept',()=>{
  const ws=baseWs(),repo0=repoAfter(ws),old=repo0.raw[MARA];
  const text='The keeper of maps – “Mara” of Greyfen docks.\r\nShe trades at [Greyfen docks](../../4-World/Places/Greyfen-docks.md). 🌊\r\n\r\n  Indented line.';
  const edited=old.replace('The keeper of maps.\n\nShe trades at [Greyfen docks](../../4-World/Places/Greyfen-docks.md).',text).replace('Came from the north.','Came from the north.\nShe spoke of the “Lantern Coast”.');
  const repo=repoAfter(ws,{[MARA]:edited}),p=plan(ws,repo);
  assert.equal(p.rows.length,1);const row=p.rows[0];
  assert.deepEqual([row.path,row.tag,row.matched,row.maps],[MARA,'Edit',true,'Mara · Overview, History']);
  assert.deepEqual(row.overwrites,['mara']);assert.deepEqual(choicesFor(row),['repo']);
  const r=apply(ws,p),mara=page(r.workspace,'mara');
  // Only the overview (wording kept exactly, the link is a page link again) and the History tab changed; the GM tab did not.
  assert.equal(mara.body,text.replace('[Greyfen docks](../../4-World/Places/Greyfen-docks.md)','[[docks|Greyfen docks]]').trim());
  assert.ok(mara.body.includes('\r\n')&&mara.body.includes('“Mara”')&&mara.body.includes('🌊'));
  assert.equal(mara.tabs.find(t=>t.id==='t1').body,'Came from the north.\nShe spoke of the “Lantern Coast”.');
  assert.equal(mara.tabs.find(t=>t.id==='t2').body,'She sold the map.');assert.equal(mara.updatedAt,NOW);
  // The earlier version goes to page history first.
  assert.deepEqual(r.keep.map(k=>k.id),['mara']);assert.equal(r.keep[0].snapshot.body,page(ws,'mara').body);assert.equal(r.keep[0].snapshot.tabs.find(t=>t.id==='t1').body,'Came from the north.');
  // The page now exports the text the repository has (apart from the front matter's date).
  assert.ok(sameApartFromOwned(MARA,byPath(exportOf(r.workspace,NOW))[MARA],edited));
  assert.equal(page(ws,'mara').body.includes('Greyfen docks'),true,'the input workspace is not changed');
});

test('a Windows (CRLF) file keeps its line endings in the page text',()=>{
  const ws=baseWs(),repo0=repoAfter(ws),crlf=repo0.raw[DOCKS].replace('Busy docks.','Busy docks.\n\nThe tide bell rings at dusk.').replace(/\n/g,'\r\n');
  const p=plan(ws,repoAfter(ws,{[DOCKS]:crlf}));assert.equal(p.rows.length,1);assert.ok(p.rows[0].matched);
  const r=apply(ws,p);assert.equal(page(r.workspace,'docks').body,'Busy docks.\r\n\r\nThe tide bell rings at dusk.');
});

test('a new session file becomes a new page (GM-only unless "show to players")',()=>{
  const ws=baseWs(),file='# Lamp at Greyfen\n\nThe party followed the lamp past [Mara](../../3-People/NPCs/Mara.md).\n';
  const repo=repoAfter(ws,{'2-Story/Sessions/2026-11-15-Lamp-at-Greyfen.md':file}),p=plan(ws,repo);
  assert.equal(p.rows.length,1);assert.deepEqual([p.rows[0].path,p.rows[0].tag,p.rows[0].maps],['2-Story/Sessions/2026-11-15-Lamp-at-Greyfen.md','New','New session page']);
  assert.deepEqual(choicesFor(p.rows[0]),['repo']);
  const r=apply(ws,p),made=r.workspace.entries.find(e=>e.title==='Lamp at Greyfen');
  assert.equal(made.kind,'session');assert.equal(made.overviewVisibility,'gm');assert.equal(made.recap.playedOn,'2026-11-15');assert.equal(made.recap.status,'draft');
  assert.equal(made.body,'The party followed the lamp past [[mara|Mara]].');
  assert.equal(r.workspace.entries.find(e=>e.id===made.parentId).title,'Sessions');assert.equal(r.workspace.entries.length,ws.entries.length+2,'the page and its Sessions folder');
  const shown=apply(ws,p,sel(p,{show:true})).workspace.entries.find(e=>e.title==='Lamp at Greyfen');
  assert.equal(shown.overviewVisibility,'players');assert.equal(shown.recap.status,'published');
  // Nothing changes until applied.
  assert.equal(ws.entries.length,6);
});

test('the GM-only mirror goes to the GM part of the page, never the public part',()=>{
  const ws=baseWs(),old=repoAfter(ws).raw;
  const gm=old[MARA_GM].replace('She sold the map.','She sold the map twice.\n\nBorin knows.'),bram=old['6-GM-Only/3-People/NPCs/Bram.md'].replace('Bram is the culprit.','Bram is the culprit and the ferryman.');
  const p=plan(ws,repoAfter(ws,{[MARA_GM]:gm,'6-GM-Only/3-People/NPCs/Bram.md':bram}));
  assert.deepEqual(p.rows.map(r=>[r.path,r.maps,r.matched]),[['6-GM-Only/3-People/NPCs/Bram.md','Bram · Overview (GM only)',true],[MARA_GM,'Mara · Secrets (GM tab)',true]]);
  const w=apply(ws,p).workspace;
  assert.equal(page(w,'mara').tabs.find(t=>t.id==='t2').body,'She sold the map twice.\n\nBorin knows.');assert.equal(page(w,'mara').body,page(ws,'mara').body,'the public overview is untouched');
  assert.equal(page(w,'mara').tabs.find(t=>t.id==='t1').body,'Came from the north.');assert.equal(page(w,'bram').body,'Bram is the culprit and the ferryman.');assert.equal(page(w,'bram').overviewVisibility,'gm');
  // Text added at the top of a GM twin of a public page has no part to go to: it becomes a GM tab.
  const odd=plan(ws,repoAfter(ws,{[MARA_GM]:old[MARA_GM].replace('# Mara (GM only)\n','# Mara (GM only)\n\nShe fears the sea.\n')}));
  assert.equal(odd.rows[0].matched,false);assert.match(odd.rows[0].maps,/Can't be matched to a page part/);
  const o=apply(ws,odd).workspace;assert.equal(page(o,'mara').body,page(ws,'mara').body);const tab=page(o,'mara').tabs.at(-1);assert.equal(tab.visibility,'gm');assert.match(tab.body,/She fears the sea\./);
});

test('a new GM-only file for a public page becomes a GM tab of that page',()=>{
  const ws=baseWs(),repo=repoAfter(ws,{'6-GM-Only/4-World/Places/Greyfen-docks.md':'# Greyfen docks (GM only)\n\nA smuggler tunnel runs under pier 3.\n'});
  const p=plan(ws,repo);assert.deepEqual(p.rows.map(r=>[r.tag,r.maps]),[['New','Greyfen docks · GM tab (new)']]);
  const d=page(apply(ws,p).workspace,'docks');assert.equal(d.body,'Busy docks.');assert.deepEqual(d.tabs.map(t=>[t.title,t.visibility,t.body]),[['GM notes from the repo','gm','A smuggler tunnel runs under pier 3.']]);
});

test('Both changed: keep the app\'s, take the repo\'s, or keep both (the default)',()=>{
  const ws0=baseWs(),old=repoAfter(ws0).raw;
  // The app edited the page after the push...
  const ws=structuredClone(ws0);page(ws,'docks').body='Busy docks, newly repainted.';page(ws,'docks').updatedAt='2026-11-15T08:00:00.000Z';
  // ...and the AI GM edited the file.
  const repo={...repoAfter(ws0,{[DOCKS]:old[DOCKS].replace('Busy docks.','Busy docks. A new pier opened.')}),};
  const p=planBringBack(ws,'c1',{map:repo.map,files:repo.files,log:repo.log},{now:NOW});
  assert.equal(p.rows.length,1);const row=p.rows[0];assert.deepEqual([row.tag,row.matched],['Both',true]);assert.deepEqual(choicesFor(row),['app','repo','both']);assert.equal(defaultChoice(row),'both');
  assert.match(row.note,/Edited here too/);
  const pick=c=>apply(ws,p,sel(p,{choices:{[row.key]:c}}));
  const app=pick('app');assert.equal(page(app.workspace,'docks').body,'Busy docks, newly repainted.');assert.equal(page(app.workspace,'docks').tabs,undefined);assert.equal(app.count,0);assert.deepEqual(app.keep,[]);
  const repoWins=pick('repo');assert.equal(page(repoWins.workspace,'docks').body,'Busy docks. A new pier opened.');assert.deepEqual(repoWins.keep.map(k=>k.snapshot.body),['Busy docks, newly repainted.']);
  const both=pick('both');assert.equal(page(both.workspace,'docks').body,'Busy docks, newly repainted.');
  const tab=page(both.workspace,'docks').tabs[0];assert.equal(tab.title,'Repo version Nov 16');assert.equal(tab.visibility,'gm');assert.equal(tab.body,'Busy docks. A new pier opened.');assert.deepEqual(both.keep,[]);
  assert.equal(sel(p).choices[row.key],undefined);assert.equal(applyBringBack(ws,p,sel(p),{now:NOW}).workspace.entries.find(e=>e.id==='docks').tabs.length,1,'unpicked rows use the default');
});

test('generated files are never brought back',()=>{
  const ws=baseWs(),repo=repoAfter(ws,{'README.md':'# changed\n','AGENTS.md':'# mine\n','1-Now/README.md':'# 1-Now\nedited\n','4-World/README.md':'x','8-Archive/Export-Log.md':'# Export Log\n\n- 2030-01-01T00:00:00.000Z - 3 files\n','.rpg-tools/files.json':repoAfter(ws).raw['.rpg-tools/files.json'],'5-Rules-and-Setup/Save-Procedure.md':'# mine\n'});
  const p=plan(ws,repo);assert.deepEqual(p.rows,[]);
  for(const x of ['README.md','AGENTS.md','1-Now/README.md','4-World/README.md','8-Archive/Export-Log.md','.rpg-tools/files.json','.rpg-tools/campaign.json','5-Rules-and-Setup/Save-Procedure.md'])assert.ok(p.rebuilt.includes(x),x);
  assert.ok(isRebuilt('6-GM-Only/5-Rules-and-Setup/Random-Tables/Weather.md'));assert.ok(!isRebuilt(MARA));
  assert.equal(p.since,'2030-01-01T00:00:00.000Z');
});

test('a file removed in the repository is listed only; no page is deleted',()=>{
  const ws=baseWs(),p=plan(ws,repoAfter(ws,{},{remove:[DOCKS,'3-People/Ayla.md']}));
  assert.deepEqual(p.rows,[]);assert.deepEqual(p.removed,['3-People/Ayla.md',DOCKS]);
  assert.equal(apply(ws,p).workspace.entries.length,ws.entries.length);
});

test('a file that cannot be inverted safely is added as a new tab, not guessed',()=>{
  const ws=baseWs(),old=repoAfter(ws).raw;
  // Borin's overview has a secret line that the public file does not show, so the public text cannot be put back as the page text.
  const p=plan(ws,repoAfter(ws,{'3-People/NPCs/Borin.md':old['3-People/NPCs/Borin.md'].replace('A dockhand.','A dockhand who drinks.')}));
  assert.equal(p.rows.length,1);const row=p.rows[0];assert.deepEqual([row.matched,row.tag],[false,'Edit']);assert.match(row.maps,/Borin · Can't be matched to a page part/);assert.match(row.note,/new GM-only tab/);
  assert.deepEqual(choicesFor(row),['repo']);assert.deepEqual(row.overwrites,[]);
  const r=apply(ws,p),b=page(r.workspace,'borin');assert.equal(b.body,page(ws,'borin').body,'the page text is not touched');
  assert.deepEqual(b.tabs.map(t=>[t.title,t.visibility,t.body]),[['Repo version Nov 16','gm','A dockhand who drinks.']]);assert.deepEqual(r.keep,[]);
  // Sections the app writes from data are left as they are; the free text still comes back.
  const sheet=old[SHEET].replace('## Played changes\n\nNone yet.','## Played changes\n\nHit 3 times.');
  const q=plan(ws,repoAfter(ws,{[SHEET]:sheet}));assert.deepEqual(q.rows,[]);assert.equal(q.kept[0].path,SHEET);
  const mara=plan(ws,repoAfter(ws,{[MARA]:old[MARA].replace('The keeper of maps.','The keeper of maps and tides.')+'\n## Details\n\n- Made up: yes\n'}));
  assert.equal(mara.rows[0].matched,true);assert.match(mara.rows[0].note,/Details stays as the app makes it/);
});

test('Current State goes to the front page "Where we are"; trackers go to the character',()=>{
  const ws=baseWs(),old=repoAfter(ws).raw;
  const state=old[STATE].replace('None recorded yet. The GM writes the exact opening situation and the next decision here at the end of each session.','The party stands at Greyfen docks. Mara waits with a lantern.');
  const sheet=old[SHEET].replace('- Hit points: 12/14','- Hit points: 9/14');
  const p=plan(ws,repoAfter(ws,{[STATE]:state,[SHEET]:sheet}));
  assert.deepEqual(p.rows.map(r=>[r.path,r.tag,r.maps]),[[SHEET,'Edit','Ayla · Trackers'],[STATE,'Edit','Front page · Where we are']]);
  const w=apply(ws,p).workspace,c=w.campaigns[0],where=c.frontPage.widgets.find(x=>x.id==='where');
  assert.deepEqual([where.type,where.title,where.body],['text','Where we are','The party stands at Greyfen docks. Mara waits with a lantern.']);assert.equal(c.frontPage.widgets.some(x=>x.id==='welcome'),false);
  assert.equal(page(w,'ayla').character.trackers[0].value,9);assert.equal(page(w,'ayla').character.trackers[0].max,14);
  // The export now writes the front page text, so the next push sees the same file.
  assert.ok(sameApartFromOwned(STATE,byPath(exportOf(w,NOW))[STATE],state));assert.ok(sameApartFromOwned(SHEET,byPath(exportOf(w,NOW))[SHEET],sheet));
});

test('a ZIP is read the same way, and a 409 asks for a new review',async()=>{
  const ws=baseWs(),old=repoAfter(ws).raw,enc=new TextEncoder();
  const edited={...old,[DOCKS]:old[DOCKS].replace('Busy docks.','Busy docks, busier now.')};
  const zip=zipFiles(Object.entries(edited).map(([name,t])=>({name,data:enc.encode(t)}))),entries=await readZip(zip);
  const read=await readBringSources(entries.map(e=>({name:e.name,size:e.data.length,bytes:async()=>e.data})));
  assert.ok(read.ok);const input={map:read.map,files:read.files,log:read.log},p=planBringBack(ws,'c1',input,{now:NOW});assert.deepEqual(p.rows.map(r=>r.path),[DOCKS]);
  // A pretend notes server with a revision.
  const server=(wsNow)=>{const s={ws:wsNow,revision:7,puts:0,history:[],raced:false};
    s.fetch=async(url,init={})=>{
      const json=(status,d)=>new Response(JSON.stringify(d),{status,headers:{'content-type':'application/json'}});
      if(url==='/api/encyclopedia/workspace'&&!init.method)return json(200,{data:s.ws,revision:s.revision});
      if(url==='/api/encyclopedia/workspace'&&init.method==='PUT'){const b=JSON.parse(init.body);if(s.race){s.race=false;s.ws=editedWs(s.ws);s.revision++;}if(b.revision!==s.revision)return json(409,{error:'changed'});s.puts++;s.ws=b.data;s.revision++;return json(200,{revision:s.revision});}
      if(url==='/api/encyclopedia/history'){s.history.push(JSON.parse(init.body));return json(200,{kept:true});}
      return json(404,{});};return s;};
  const editedWs=(w)=>{const c=structuredClone(w);page(c,'docks').body='Changed meanwhile.';return c;};
  const s=server(ws),ok=await saveBringBack({fetch:s.fetch,campaignId:'c1',plan:p,input,sel:sel(p),now:NOW});
  assert.deepEqual([ok.status,ok.count],['done',1]);assert.equal(s.puts,1);assert.equal(page(s.ws,'docks').body,'Busy docks, busier now.');assert.equal(s.history.length,1);assert.equal(s.history[0].entryId,'docks');assert.equal(s.history[0].snapshot.body,'Busy docks.');
  // The notes change between the read and the save: a 409. Nothing is saved; the plan is made again.
  const r=server(ws);r.race=true;const lost=await saveBringBack({fetch:r.fetch,campaignId:'c1',plan:p,input,sel:sel(p),now:NOW});
  assert.equal(lost.status,'changed');assert.equal(r.puts,0);assert.equal(page(r.ws,'docks').body,'Changed meanwhile.');assert.equal(lost.plan.rows[0].tag,'Both','the page was edited here, so the re-reviewed row is Both');
  // The notes already differ at the start: the new plan is returned without a save attempt.
  const q=server(editedWs(ws)),pre=await saveBringBack({fetch:q.fetch,campaignId:'c1',plan:p,input,sel:sel(p),now:NOW});assert.equal(pre.status,'changed');assert.equal(q.puts,0);
  // Page history that cannot keep the old text: it is kept as a GM tab instead.
  const h=server(ws);const base=h.fetch;h.fetch=async(u,i)=>u==='/api/encyclopedia/history'?new Response('{}',{status:500}):base(u,i);
  const kept=await saveBringBack({fetch:h.fetch,campaignId:'c1',plan:p,input,sel:sel(p),now:NOW});assert.equal(kept.status,'done');
  assert.deepEqual(page(h.ws,'docks').tabs.map(t=>[t.title,t.visibility,t.body]),[['Before bring back 2026-11-16','gm','Busy docks.']]);assert.equal(page(h.ws,'docks').body,'Busy docks, busier now.');
  // A signed-out account.
  const out=await saveBringBack({fetch:async()=>new Response('{}',{status:401}),campaignId:'c1',plan:p,input,sel:sel(p)});assert.deepEqual([out.status,out.message],['error','Sign in again to bring back changes.']);
});

test('push, repository edit, bring back, push again: nothing is stuck',async()=>{
  const ws=baseWs(),g=fakeGithub();g.seed({'notes.txt':'mine'});
  const builder=(w,at)=>(log)=>rpExportFiles(w,'c1',{includeGm:true,exportedAt:at,exportLog:log});
  const first=await preparePush(TOKEN,REPO,'main',true,builder(ws,T0),g.fetch);await pushFiles(TOKEN,first,'Session 1',g.fetch);
  const files=g.files();
  // After a session the AI GM adds a session file, edits Mara and the front page text, and edits the GM mirror. It also touches a README (rebuilt).
  g.seed({
    '2-Story/Sessions/2026-11-15-Lamp-at-Greyfen.md':'# Lamp at Greyfen\n\nThe party followed the lamp.\n',
    [MARA]:files[MARA].replace('The keeper of maps.','The keeper of maps and secrets.'),
    [MARA_GM]:files[MARA_GM].replace('She sold the map.','She sold the map to Borin.'),
    [STATE]:files[STATE].replace('None recorded yet. The GM writes the exact opening situation and the next decision here at the end of each session.','Dusk at Greyfen docks.'),
  });
  // Bring back: only files that differ from the recorded git blob ids are downloaded.
  g.log.length=0;const got=await readRepoChanges(TOKEN,REPO,'main',g.fetch);assert.ok(got.ok);
  assert.equal(got.downloaded,4,'the changed and new Markdown files only');assert.ok(g.log.every(r=>r.auth===`Bearer ${TOKEN}`&&r.url.startsWith('https://api.github.com/repos/')),'the key goes only to api.github.com');
  assert.equal(g.blobGets(),6,'files.json, the export log and the four files');
  const p=planBringBack(ws,'c1',{map:got.map,files:got.files,log:got.log},{now:NOW});
  assert.deepEqual(p.rows.map(r=>[r.tag,r.path]),[['New','2-Story/Sessions/2026-11-15-Lamp-at-Greyfen.md'],['Edit',STATE],['Edit',MARA],['Edit',MARA_GM]]);
  assert.equal(p.since,T0);
  const r=apply(ws,p,sel(p,{show:true}),{now:'2026-11-16T09:00:00.000Z'});
  // Push again: the changed files are recognised as the app's own, so nothing is listed as edited in the repository.
  const second=await preparePush(TOKEN,REPO,'main',true,builder(r.workspace,T1),g.fetch);
  assert.deepEqual(second.skipped,[],'no file is left as is as "edited in the repository"');
  const wrote=second.changes.map(c=>c.path);for(const x of [MARA,MARA_GM,STATE,'2-Story/Sessions/2026-11-15-Lamp-at-Greyfen.md'])assert.ok(wrote.includes(x),x+' is rewritten as the app\'s own file');
  await pushFiles(TOKEN,second,'Session 2',g.fetch);
  // files.json matches the files again, and a third push has nothing to do.
  const after=g.files(),map=JSON.parse(after['.rpg-tools/files.json']);
  for(const x of [MARA,MARA_GM,STATE,'2-Story/Sessions/2026-11-15-Lamp-at-Greyfen.md']){assert.equal(map.hashes[x],textHash(after[x]),x);assert.equal(map.gitBlobs[x],await textBlobSha(after[x]),x);}
  assert.match(after[MARA],/The keeper of maps and secrets\./);assert.match(after[MARA_GM],/She sold the map to Borin\./);
  const third=await preparePush(TOKEN,REPO,'main',true,builder(r.workspace,T1),g.fetch);
  assert.deepEqual(third.skipped,[]);assert.equal(third.nothingToPush,true);
});
const T1='2026-11-16T12:00:00.000Z';

test('planWrite treats a repository file equal to the new text as unchanged',()=>{
  const ws=baseWs(),files=exportOf(ws,T0),next=exportOf(ws,T1),prev=JSON.parse(files.find(f=>f.path==='.rpg-tools/files.json').text);
  const have=new Map(files.map(f=>[f.path,textHash(f.text)]));
  const edited=new Map(have);edited.set(MARA,'0'.repeat(64));
  const nextMara=next.find(f=>f.path===MARA);edited.set(MARA,textHash(nextMara.text));
  assert.deepEqual(planWrite(edited,prev,next,true).skip,[]);
});

/* ---- review fixes ---- */
const pushOnce=async(g,w,at,msg)=>{const b=(log)=>rpExportFiles(w,'c1',{includeGm:true,exportedAt:at,exportLog:log});const p=await preparePush(TOKEN,REPO,'main',true,b,g.fetch);if(!p.nothingToPush||p.changes.length)await pushFiles(TOKEN,p,msg,g.fetch);return p;};
const fixture=async()=>{const ws=baseWs(),g=fakeGithub();g.seed({'notes.txt':'mine'});await pushOnce(g,ws,T0,'one');return {ws,g,files:g.files()};};
const bringAll=async(ws,g,o={show:true})=>{const got=await readRepoChanges(TOKEN,REPO,'main',g.fetch);assert.ok(got.ok);const p=planBringBack(ws,'c1',{map:got.map,files:got.files,log:got.log},{now:NOW});return {p,...applyBringBack(ws,p,sel(p,o),{now:NOW})};};

test('a file cannot claim a page of another world, and a tracker file cannot point at one',()=>{
  const ws=baseWs();
  ws.worlds.push({id:'w2',name:'Elsewhere',description:'',archived:false});
  ws.entries.push(entry('foreign','Foreign','character',{worldId:'w2',campaignId:null,overviewVisibility:'players',body:'Not yours.',character:{...defaultCharacter(),role:'npc',trackers:[{id:'k9',label:'Hit points',value:5,max:5,shape:'bar',colour:'green'}]}}));
  const parsed=workspaceSchema.parse(ws),repo=repoAfter(parsed);
  repo.map.pages['3-People/Ayla.md']='foreign';
  const claim=repo.raw[MARA].replace(/rpg-tools-id: mara/,'rpg-tools-id: foreign').replace('The keeper of maps.','Taken over.');
  const sheet=repo.raw[SHEET].replace('12/14','1/14');
  const r2=repoAfter(parsed,{[MARA]:claim,[SHEET]:sheet});r2.map.pages['3-People/Ayla.md']='foreign';
  const p=plan(parsed,r2),r=apply(parsed,p);
  assert.deepEqual(page(r.workspace,'foreign'),page(parsed,'foreign'),'the other world\'s page is untouched');
  assert.equal(page(r.workspace,'mara').body.includes('Taken over.'),true,'the file still maps to its own page by path');
  assert.deepEqual(p.kept.map(k=>k.path),[SHEET]);
  // Even a hand-made edit list cannot touch it.
  const forced=applyBringBack(parsed,{...p,rows:[{...p.rows[0],edits:[{op:'body',id:'foreign',text:'x'},{op:'trackers',id:'foreign',items:[{label:'Hit points',value:0,max:5}]}]}]},{checked:new Set([p.rows[0].key]),choices:{},show:false},{now:NOW});
  assert.ok(forced.ok);assert.deepEqual(page(forced.workspace,'foreign'),page(parsed,'foreign'));
});

test('push after bring back keeps a CRLF file CRLF, and the file map matches what was written',async()=>{
  const {ws,g,files}=await fixture();
  g.seed({[DOCKS]:files[DOCKS].replace('Busy docks.','Busy docks at dusk.').replace(/\n/g,'\r\n')});
  const {workspace}=await bringAll(ws,g);
  const second=await pushOnce(g,workspace,T1,'two'),after=g.files();
  assert.ok(second.changes.some(c=>c.path===DOCKS));
  assert.ok(/\r\n/.test(after[DOCKS])&&!/(?<!\r)\n/.test(after[DOCKS]),'still CRLF throughout');
  const map=JSON.parse(after['.rpg-tools/files.json']);assert.equal(map.hashes[DOCKS],textHash(after[DOCKS]));assert.equal(map.gitBlobs[DOCKS],await textBlobSha(after[DOCKS]));
  const third=await preparePush(TOKEN,REPO,'main',true,(log)=>rpExportFiles(workspace,'c1',{includeGm:true,exportedAt:T1,exportLog:log}),g.fetch);
  assert.equal(third.nothingToPush,true);assert.deepEqual(third.skipped,[]);
});

test('a new file whose title differs from its name is moved, not left beside the new page file',async()=>{
  const {ws,g}=await fixture();
  g.seed({'2-Story/Sessions/2026-11-15-Lamp-at-Greyfen.md':'# The Lamp\n\nThe party followed the lamp.\n'});
  const {p,workspace}=await bringAll(ws,g);assert.equal(p.rows.length,1);
  const second=await pushOnce(g,workspace,T1,'two');
  assert.deepEqual(second.removals,[{path:'2-Story/Sessions/2026-11-15-Lamp-at-Greyfen.md',reason:'moved'}]);
  const sessions=Object.keys(g.files()).filter(f=>f.startsWith('2-Story/Sessions/')&&/Lamp/.test(f));
  assert.deepEqual(sessions,['2-Story/Sessions/2026-11-15-The-Lamp.md']);
  // Bringing back again finds nothing new, and a third push has nothing to do.
  const again=await bringAll(workspace,g);assert.equal(again.p.rows.length,0);
  assert.equal((await preparePush(TOKEN,REPO,'main',true,(log)=>rpExportFiles(workspace,'c1',{includeGm:true,exportedAt:T1,exportLog:log}),g.fetch)).nothingToPush,true);
});

test('a new file already brought back (not pushed yet) is not offered as a second page',async()=>{
  const {ws,g}=await fixture();
  g.seed({'2-Story/Sessions/2026-11-15-The-Lamp.md':'# The Lamp\n\nThe party followed the lamp.\n'});
  const first=await bringAll(ws,g);assert.equal(first.p.rows.length,1);
  const again=await bringAll(first.workspace,g);assert.equal(again.p.rows.length,0);assert.deepEqual(again.p.already,['2-Story/Sessions/2026-11-15-The-Lamp.md']);
});

test('a person\'s edit to a data section or the front matter is never overwritten by a push',async()=>{
  const {ws,g,files}=await fixture();
  // The tracker numbers are edited in the repository, but the person keeps the app's numbers (nothing brought back).
  g.seed({[SHEET]:files[SHEET].replace('12/14','9/14'),[MARA]:files[MARA].replace('kind: character','kind: character\ntags: [mine]')});
  const p=await pushOnce(g,ws,T1,'two');
  assert.deepEqual(p.skipped.map(s=>s.path).sort(),[MARA,SHEET].sort());
  assert.match(g.files()[SHEET],/9\/14/);assert.match(g.files()[MARA],/tags: \[mine\]/);
  // Once the change is brought back, the file is the app's own again.
  const {workspace}=await bringAll(ws,g);
  assert.equal((await preparePush(TOKEN,REPO,'main',true,(log)=>rpExportFiles(workspace,'c1',{includeGm:true,exportedAt:T1,exportLog:log}),g.fetch)).skipped.some(s=>s.path===SHEET),false);
});

test('a data section that moved on in the app does not stop the app\'s own file being updated',async()=>{
  const {ws,g,files}=await fixture();
  g.seed({[MARA]:files[MARA].replace('The keeper of maps.','The keeper of maps and secrets.')});
  const {workspace}=await bringAll(ws,g);
  const moved=structuredClone(workspace);moved.entries.find(e=>e.id==='mara').character.group='Harbour';
  const p=await preparePush(TOKEN,REPO,'main',true,(log)=>rpExportFiles(moved,'c1',{includeGm:true,exportedAt:T1,exportLog:log}),g.fetch);
  assert.deepEqual(p.skipped,[]);
});

test('Where we are: secret lines, another kind of widget or a repeated heading is not guessed',()=>{
  const edit=(ws,text)=>{const repo=repoAfter(ws),p=plan(ws,repoAfter(ws,{[STATE]:repo.raw[STATE].replace(/(## Next session starting point\n\n)[\s\S]*$/,`$1${text}\n`)}));return p;};
  const withWidget=(w)=>{const ws=baseWs();ws.campaigns[0].frontPage={widgets:[w]};return workspaceSchema.parse(ws);};
  const secret=withWidget({id:'where',type:'text',title:'Where we are',body:'Dusk.\n::: secret\nThe duke is dead.\n:::'});
  const p1=edit(secret,'Night.');assert.equal(p1.rows[0].matched,false);assert.deepEqual(p1.rows[0].edits.map(e=>e.op),['newnote']);
  const links=withWidget({id:'where',type:'links',title:'Where we are',links:[]});
  const p2=edit(links,'Night.');assert.equal(p2.rows[0].matched,false);
  const dup=withWidget({id:'where',type:'text',title:'Where we are',body:'Dusk.\n## Party\nA list'});
  const p3=edit(dup,'Night.\n## Party\nB list');assert.equal(p3.rows[0].matched,false);
  const ok=withWidget({id:'where',type:'text',title:'Where we are',body:'Dusk.'});
  assert.equal(edit(ok,'Night.').rows[0].matched,true);
});

test('too many bytes is reported before page history is written', async()=>{
  const ws=baseWs();for(let i=0;i<22;i++)ws.entries.push(entry('big'+i,'Big '+i,'note',{body:'y'.repeat(95_000)}));const repo=repoAfter(ws,{[MARA]:repoAfter(ws).raw[MARA].replace('The keeper of maps.','The keeper of maps and secrets.')}),input={map:repo.map,files:repo.files,log:repo.log},p=plan(ws,repo);
  const calls=[];
  const out=await saveBringBack({fetch:async(url,init)=>{calls.push(`${init?.method??'GET'} ${url}`);return url.includes('workspace')&&!init?.method?new Response(JSON.stringify({data:ws,revision:3})):new Response('{}');},campaignId:'c1',plan:p,input,sel:sel(p),now:NOW});
  assert.equal(out.status,'error');assert.match(out.message,/2 MB/);assert.deepEqual(calls,['GET /api/encyclopedia/workspace'],'nothing was written');
});
