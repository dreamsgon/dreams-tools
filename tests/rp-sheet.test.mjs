import test from 'node:test';
import assert from 'node:assert/strict';
const {folderRows,zipName,classifyZip,exportedAt,shortDate,lastExportKey}=await import('../lib/encyclopedia/rp-sheet.ts');
const {rpExportFiles}=await import('../lib/encyclopedia/rp-export.ts');
const {rpExportZip,readRestoreCopy}=await import('../lib/encyclopedia/rp-zip.ts');
const {readZip}=await import('../lib/zip-read.ts');
const {emptyWorkspace,demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');

const ws=demoWorkspace(),cid=ws.campaigns[0].id,AT='2026-11-14T10:00:00.000Z';

test('folder rows count files per folder and hide 6-GM-Only without GM content',()=>{
  const on=rpExportFiles(ws,cid,{includeGm:true,exportedAt:AT}),off=rpExportFiles(ws,cid,{includeGm:false,exportedAt:AT});
  const a=folderRows(on.map(f=>f.path)),b=folderRows(off.map(f=>f.path));
  assert.deepEqual(a.slice(0,2).map(r=>r.name),['README.md','AGENTS.md']);
  assert.ok(a.some(r=>r.name==='6-GM-Only/'));assert.ok(!b.some(r=>r.name==='6-GM-Only/'));
  assert.equal(a.find(r=>r.name==='.rpg-tools/').detail,'restore copy');assert.equal(b.find(r=>r.name==='.rpg-tools/').detail,'page map');
  const count=r=>+r.detail.split(' ')[0];
  const total=a.filter(r=>/files?$/.test(r.detail)).reduce((n,r)=>n+count(r),0);
  assert.equal(total,on.filter(f=>f.path.includes('/')&&!f.path.startsWith('.rpg-tools/')).length);
  assert.ok(a.some(r=>r.name==='7-Library/ · 8-Archive/'));
});
test('folder rows say "1 file" for one',()=>{
  assert.deepEqual(folderRows(['1-Now/a.md']),[{name:'1-Now/',detail:'1 file'}]);
  assert.deepEqual(folderRows([]),[]);
});
test('zip name is a safe slug',()=>{
  assert.equal(zipName('The Salt Road'),'the-salt-road-rp.zip');
  assert.equal(zipName('Café: Ünder/Dark?'),'cafe-under-dark-rp.zip');
  assert.equal(zipName('???'),'campaign-rp.zip');
  assert.equal(zipName('  --x--  '),'x-rp.zip');
  assert.ok(zipName('a'.repeat(200)).length<=57);
  assert.ok(!zipName('../../etc/passwd').includes('/'));
});
test('classifyZip tells the four cases apart',async()=>{
  const on=rpExportFiles(ws,cid,{includeGm:true,exportedAt:AT}),off=rpExportFiles(ws,cid,{includeGm:false,exportedAt:AT});
  assert.equal(classifyZip(on.map(f=>f.path)),'restore');
  assert.equal(classifyZip(off.map(f=>f.path)),'player-safe');
  assert.equal(classifyZip(['README.md','1-Now/Current-State.md']),'numbered');
  assert.equal(classifyZip(['3-People/Ayla.md']),'numbered');
  assert.equal(classifyZip(['notes.txt','src/a.js']),'unknown');
  assert.equal(classifyZip(['world-manager/camp/campaign.json']),'restore');
  assert.equal(classifyZip([]),'unknown');
});
test('a real export ZIP round-trips: classified, read back, dated',async()=>{
  const on=rpExportFiles(ws,cid,{includeGm:true,exportedAt:AT});
  const entries=await readZip(rpExportZip(on));
  assert.equal(entries.length,on.length);
  assert.equal(classifyZip(entries.map(e=>e.name)),'restore');
  const r=readRestoreCopy(entries);assert.ok(r.ok);assert.equal(r.workspace.campaigns[0].name,'The Salt Road');
  const log=new TextDecoder().decode(entries.find(e=>e.name==='8-Archive/Export-Log.md').data);
  assert.equal(exportedAt(log),AT);
  const safe=await readZip(rpExportZip(rpExportFiles(ws,cid,{includeGm:false,exportedAt:AT})));
  assert.equal(classifyZip(safe.map(e=>e.name)),'player-safe');assert.equal(readRestoreCopy(safe).ok,false);
});
test('exportedAt takes the newest log line and ignores junk',()=>{
  assert.equal(exportedAt('# Log\n\n- 2026-01-02T00:00:00.000Z - 4 files\n- 2026-03-04T00:00:00.000Z - 5 files\n- nonsense\n'),'2026-03-04T00:00:00.000Z');
  assert.equal(exportedAt(''),null);assert.equal(exportedAt(undefined),null);assert.equal(exportedAt('- 2026-99-99T99 - x'),null);
});
test('shortDate omits the year this year only',()=>{
  const now=new Date('2026-11-16T12:00:00Z');
  assert.equal(shortDate('2026-11-14T12:00:00Z',now),'Nov 14');
  assert.equal(shortDate('2025-03-02T12:00:00Z',now),'Mar 2, 2025');
  assert.equal(shortDate('garbage',now),'');
  assert.equal(lastExportKey('c1'),'rpg-tools:rp-last-export:c1');
});
