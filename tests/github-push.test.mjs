import test from 'node:test';
import assert from 'node:assert/strict';
const {checkRepo,checkBranch,preparePush,pushFiles,readRepoRestore,gitBlobSha,textBlobSha,parseRepo,validKey,GithubError,isHousekeeping}=await import('../lib/github-push.ts');
const {rpExportFiles,textHash}=await import('../lib/encyclopedia/rp-export.ts');
const {defaultCommitMessage,parseLastPush,lastPushKey}=await import('../lib/encyclopedia/rp-sheet.ts');
const {readKey,saveKey,forgetKey}=await import('../lib/github-key.ts');
const {demoWorkspace}=await import('../lib/encyclopedia/world-model.ts');

const TOKEN='github_pat_TESTSECRET1234567890abcdef',REPO='ayla/salt-road',ws=demoWorkspace(),cid=ws.campaigns[0].id;
const T1='2026-11-14T10:00:00.000Z',T2='2026-11-15T10:00:00.000Z',T3='2026-11-16T10:00:00.000Z';
const builder=(w,includeGm,at)=>(log)=>rpExportFiles(w,cid,{includeGm,exportedAt:at,exportLog:log});
const {fakeGithub,json,blobId}=await import('./helpers/fake-github.mjs');
const applyPush=async(g,w,{at=T1,includeGm=true,message='Session 1: A light in the fog',onProgress}={})=>{
  const prep=await preparePush(TOKEN,REPO,'main',includeGm,builder(w,includeGm,at),g.fetch);
  const res=await pushFiles(TOKEN,prep,message,g.fetch,onProgress);return {prep,res};
};
const fail=async(promise)=>{try{await promise;}catch(e){return e;}assert.fail('expected an error');};
const editedWs=(fn,base=ws)=>{const w=structuredClone(base);fn(w);return w;};
// The demo is mostly GM-only; make two pages public so the public tree has pages to change.
const wsP=editedWs(x=>{for(const id of ['demo-mara','demo-greyhaven'])x.entries.find(e=>e.id===id).overviewVisibility='players';});

test('parseRepo, validKey, git blob ids',async()=>{
  assert.equal(parseRepo('Ayla/salt-road'),'Ayla/salt-road');assert.equal(parseRepo(' https://github.com/ayla/salt-road.git/ '),'ayla/salt-road');
  for(const bad of ['','ayla','a/b/c','../x','a/..','https://evil.example/a/b','a b/c'])assert.equal(parseRepo(bad),null,bad);
  assert.ok(validKey(TOKEN));assert.ok(!validKey('short'));assert.ok(!validKey('has space in it 1234'));assert.ok(!validKey('naïve-key-1234567'));
  assert.equal(await textBlobSha('hello\n'),'ce013625030ba8dba906f756967f9e9ca394464a');// git hash-object of "hello\n"
  assert.equal(await gitBlobSha(new Uint8Array()),'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(await textBlobSha('é'),blobId(Buffer.from('é')));
});

test('checkRepo: ok and the plain errors',async()=>{
  const g=fakeGithub();const info=await checkRepo(TOKEN,REPO,g.fetch);
  assert.deepEqual(info,{fullName:REPO,isPrivate:true,defaultBranch:'main'});
  const first=g.log[0];assert.equal(first.url,`https://api.github.com/repos/${REPO}`);assert.equal(first.auth,`Bearer ${TOKEN}`);
  let e=await fail(checkRepo('github_pat_WRONGWRONGWRONG1',REPO,g.fetch));assert.equal(e.code,'bad-key');assert.match(e.message,/did not accept that key/);
  e=await fail(checkRepo(TOKEN,'ayla/other',g.fetch));assert.equal(e.code,'no-access');assert.match(e.message,/can't find ayla\/other, or this key has no access/);
  e=await fail(checkRepo(TOKEN,REPO,fakeGithub({push:false}).fetch));assert.equal(e.code,'read-only');assert.match(e.message,/read .* but not write/);
  const limited=fakeGithub();limited.limit=true;e=await fail(checkRepo(TOKEN,REPO,limited.fetch));assert.equal(e.code,'rate-limit');assert.match(e.message,/request limit/);
  const down=fakeGithub();down.down=true;e=await fail(checkRepo(TOKEN,REPO,down.fetch));assert.equal(e.code,'network');assert.match(e.message,/Could not reach GitHub/);
  e=await fail(checkRepo('nope',REPO,g.fetch));assert.equal(e.code,'bad-key');
  e=await fail(checkRepo(TOKEN,'not a repo',g.fetch));assert.equal(e.code,'bad-input');
  assert.ok(e instanceof GithubError);
});

test('checkBranch: found, missing, empty (409 and 404 styles)',async()=>{
  const g=fakeGithub();g.seed({'README.md':'x'});
  assert.equal(await checkBranch(TOKEN,REPO,'main',g.fetch),'found');assert.equal(await checkBranch(TOKEN,REPO,'dev',g.fetch),'missing');
  assert.equal(await checkBranch(TOKEN,REPO,'main',fakeGithub({empty:true}).fetch),'empty');
  assert.equal(await checkBranch(TOKEN,REPO,'main',fakeGithub({empty:true,emptyRef:404}).fetch),'empty');
});

test('a first push to a repository with other files: one commit, only layout files, nothing forced',async()=>{
  const g=fakeGithub();g.seed({'notes.txt':'my own notes','README.md':'# My table\n','.github/workflows/x.yml':'on: push'});
  const msgs=[];const {prep,res}=await applyPush(g,ws,{onProgress:m=>msgs.push(m)});
  assert.ok(prep.changes.length>20);assert.deepEqual(prep.skipped.map(s=>[s.path,s.reason]),[['README.md','unowned']]);assert.equal(prep.nothingToPush,false);
  const files=g.files();
  assert.equal(files['notes.txt'],'my own notes');assert.equal(files['README.md'],'# My table\n');assert.equal(files['.github/workflows/x.yml'],'on: push');
  assert.ok(files['AGENTS.md']&&files['.rpg-tools/campaign.json']&&files['.rpg-tools/files.json']);
  assert.equal(res.commits,1);assert.equal(res.files,prep.changes.length+prep.removals.length);assert.equal(res.url,`https://github.com/${REPO}/commit/${g.head()}`);
  const commit=g.commits.get(g.head());assert.equal(commit.message,'Session 1: A light in the fog');assert.equal(commit.parents.length,2-1);
  const ref=g.log.filter(r=>r.method==='PATCH');assert.equal(ref.length,1);assert.equal(ref[0].body.force,false);
  assert.ok(msgs.some(m=>/Uploading files… \d+ of \d+/.test(m))&&msgs.some(m=>/Updating main/.test(m)));
  // files.json records the git blob id of what was written
  const map=JSON.parse(files['.rpg-tools/files.json']);assert.equal(map.gitBlobs['AGENTS.md'],await textBlobSha(files['AGENTS.md']));assert.ok(!('README.md' in map.hashes),'the skipped README is not recorded as ours');
  assert.equal(map.version,1);
});

test('an unchanged repository: nothing to push, and no file content is downloaded but the two housekeeping files',async()=>{
  const g=fakeGithub();g.seed({'README.md':'# a\n'});await applyPush(g,ws,{at:T1});
  const before=g.blobGets();g.log.length=0;
  const prep=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T2),g.fetch);
  assert.equal(prep.nothingToPush,true);assert.deepEqual(prep.removals,[]);assert.deepEqual(prep.changes.map(c=>c.path),['.rpg-tools/files.json','8-Archive/Export-Log.md']);assert.ok(prep.unchanged>20);
  assert.equal(g.blobGets(),2,'files.json and Export-Log.md only');assert.equal(g.log.filter(r=>r.method!=='GET').length,0);void before;
  assert.ok(prep.changes.every(c=>isHousekeeping(c.path)));
  assert.match(prep.changes.find(c=>c.path==='8-Archive/Export-Log.md').text,new RegExp(T1.replace(/\./g,'\\.')),'the old log line is kept');
});

test('new, edited and removed pages become one commit; unchanged files are not uploaded',async()=>{
  const g=fakeGithub();g.seed({'README.md':'# a\n'});await applyPush(g,wsP,{at:T1});
  const w=editedWs(x=>{x.entries.find(e=>e.id==='demo-mara').body+='\n\nA new line about the harbor.';const c=structuredClone(x.entries.find(e=>e.id==='demo-mara'));Object.assign(c,{id:'new-npc',title:'Cael the ferryman',body:'Plies the river.'});x.entries.push(c);},wsP);
  const before=Object.keys(g.files());g.log.length=0;
  const prep=await preparePush(TOKEN,REPO,'main',true,builder(w,true,T2),g.fetch);
  const kinds=Object.groupBy?Object.groupBy(prep.changes.filter(c=>!isHousekeeping(c.path)),c=>c.kind):null;
  const nw=prep.changes.filter(c=>c.kind==='new').map(c=>c.path),ed=prep.changes.filter(c=>c.kind==='edit').map(c=>c.path);
  assert.ok(nw.some(p=>/Cael/.test(p)),'new page: '+nw);assert.ok(ed.some(p=>/Mara/.test(p)),'edited page: '+ed);
  assert.ok(prep.changes.length<prep.unchanged,'most files are untouched');void kinds;void before;
  await pushFiles(TOKEN,prep,'Session 2',g.fetch);
  const uploaded=g.log.filter(r=>r.method==='POST'&&/\/git\/blobs$/.test(r.path)).length;assert.equal(uploaded,prep.changes.length);
  assert.ok(Object.keys(g.files()).some(p=>/Cael/.test(p)));
  // Now drop that page: it is removed again with sha null in the tree call
  g.log.length=0;const prep2=await preparePush(TOKEN,REPO,'main',true,builder(wsP,true,T3),g.fetch);
  assert.ok(prep2.removals.some(r=>/Cael/.test(r.path)&&r.reason==='stale'),JSON.stringify(prep2.removals));
  await pushFiles(TOKEN,prep2,'Remove Cael',g.fetch);
  const treeCall=g.log.find(r=>r.method==='POST'&&/\/git\/trees$/.test(r.path));assert.ok(treeCall.body.tree.some(t=>/Cael/.test(t.path)&&t.sha===null));
  assert.ok(!Object.keys(g.files()).some(p=>/Cael/.test(p)));
});

test('a file the user edited in the repository is skipped and kept, also on the next push',async()=>{
  const g=fakeGithub();g.seed({'x.txt':'1'});await applyPush(g,wsP,{at:T1});
  const path='3-People/NPCs/Mara-Venn.md';assert.ok(path,'Mara page exists');
  g.seed({[path]:'# Mara\n\nEdited by hand in the repo.\n'});
  const w=editedWs(x=>{x.entries.find(e=>e.id==='demo-mara').body+='\n\nSomething new in the app.';},wsP);
  const prep=await preparePush(TOKEN,REPO,'main',true,builder(w,true,T2),g.fetch);
  assert.deepEqual(prep.skipped,[{path,reason:'edited'}]);assert.ok(!prep.changes.some(c=>c.path===path));
  await pushFiles(TOKEN,prep,'Update',g.fetch);
  assert.equal(g.files()[path],'# Mara\n\nEdited by hand in the repo.\n');
  const again=await preparePush(TOKEN,REPO,'main',true,builder(w,true,T3),g.fetch);
  assert.deepEqual(again.skipped,[{path,reason:'edited'}],'still counts as edited next time');
});

test('a file changed by an older export without git blob ids is compared by content, and written when it is unedited',async()=>{
  const g=fakeGithub();g.seed({'x.txt':'1'});await applyPush(g,wsP,{at:T1});
  const map=JSON.parse(g.files()['.rpg-tools/files.json']);delete map.gitBlobs;g.seed({'.rpg-tools/files.json':JSON.stringify(map,null,2)});
  const w=editedWs(x=>{x.entries.find(e=>e.id==='demo-mara').body+='\n\nMore.';},wsP);
  g.log.length=0;const prep=await preparePush(TOKEN,REPO,'main',true,builder(w,true,T2),g.fetch);
  assert.deepEqual(prep.skipped,[]);assert.ok(prep.changes.some(c=>/Mara/.test(c.path)&&c.kind==='edit'));
  assert.ok(g.blobGets()>=3,'changed files were downloaded to compare');
});

test('a player-safe push removes GM files, even edited ones, and the restore copy',async()=>{
  const g=fakeGithub();g.seed({'x.txt':'1'});await applyPush(g,ws,{at:T1,includeGm:true});
  const gm=Object.keys(g.files()).filter(p=>p.startsWith('6-GM-Only/'));assert.ok(gm.length>0);
  g.seed({[gm[0]]:'edited secret notes'});
  const prep=await preparePush(TOKEN,REPO,'main',false,builder(ws,false,T2),g.fetch);
  assert.ok(prep.removals.every(r=>r.reason==='gm'||r.reason==='stale'));
  assert.ok(gm.every(p=>prep.removals.some(r=>r.path===p&&r.reason==='gm')));assert.ok(prep.removals.some(r=>r.path==='.rpg-tools/campaign.json'));
  await pushFiles(TOKEN,prep,'Player-safe copy',g.fetch);
  const files=g.files();assert.ok(!Object.keys(files).some(p=>p.startsWith('6-GM-Only/')||p==='.rpg-tools/campaign.json'));assert.equal(files['x.txt'],'1');
  assert.equal(JSON.parse(files['.rpg-tools/files.json']).includeGm,false);
});

test('files outside the layout are never touched or removed',async()=>{
  const g=fakeGithub();g.seed({'docs/guide.md':'mine','1-Now/Extra-Notes.md':'a user file in a layout folder','.github/CODEOWNERS':'*'});
  const prep=await preparePush(TOKEN,REPO,'main',false,builder(ws,false,T1),g.fetch);
  await pushFiles(TOKEN,prep,'First',g.fetch);
  const files=g.files();assert.equal(files['docs/guide.md'],'mine');assert.equal(files['.github/CODEOWNERS'],'*');assert.equal(files['1-Now/Extra-Notes.md'],'a user file in a layout folder');
});

test('a truncated tree: only the RP folders are walked, and it is reported',async()=>{
  const g=fakeGithub({truncate:true});g.seed({'x.txt':'1','big/other/file.bin':'zz'});await applyPush(g,ws,{at:T1});
  const prep=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T2),g.fetch);
  assert.equal(prep.truncated,true);assert.equal(prep.nothingToPush,true,'the walk found every layout file');
  assert.ok(!g.log.some(r=>/trees\/[^?]*\|big/.test(r.path)),'did not descend into big/');
  assert.ok(g.log.some(r=>/trees\/[^?]*%7C|trees\/[^?]*\|/.test(r.path)),'walked subfolders one level at a time');
});

test('an empty repository: README.md through the Contents API, then one more commit (409 and 404 styles)',async()=>{
  for(const style of [409,404]){
    const g=fakeGithub({empty:true,emptyRef:style});
    const {prep,res}=await applyPush(g,ws,{at:T1});
    assert.equal(prep.head,null);assert.equal(res.commits,2);const put=g.log.find(r=>r.method==='PUT');assert.match(put.path,/\/contents\/README\.md$/);assert.equal(put.body.branch,'main');
    assert.equal(put.auth,`Bearer ${TOKEN}`);
    const files=g.files();assert.ok(files['README.md']&&files['AGENTS.md']&&files['.rpg-tools/campaign.json']);assert.equal(res.files,prep.changes.length);
    assert.equal(g.log.filter(r=>r.method==='PATCH').length,1);
    const again=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T2),g.fetch);assert.equal(again.nothingToPush,true);
  }
  const g=fakeGithub({empty:true,defaultBranch:'trunk'});const prep=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T1),g.fetch);
  const e=await fail(pushFiles(TOKEN,prep,'x',g.fetch));assert.match(e.message,/default branch \(trunk\)/);assert.equal(g.log.filter(r=>r.method==='PUT').length,0);
});

test('a branch that does not exist is reported and not created',async()=>{
  const g=fakeGithub();g.seed({'a.txt':'1'});
  const e=await fail(preparePush(TOKEN,REPO,'draft',true,builder(ws,true,T1),g.fetch));assert.equal(e.code,'no-branch');assert.match(e.message,/does not exist/);assert.match(e.message,/does not create branches/);
  assert.ok(!g.log.some(r=>r.method!=='GET'));
});

test('the branch moving: before the upload, nothing is created; during it, the ref update is refused and nothing is forced',async()=>{
  const g=fakeGithub();g.seed({'a.txt':'1'});
  const prep=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T1),g.fetch);
  g.seed({'b.txt':'someone else pushed'});g.log.length=0;
  let e=await fail(pushFiles(TOKEN,prep,'Late',g.fetch));assert.equal(e.code,'moved');assert.match(e.message,/Nothing was pushed/);assert.ok(!g.log.some(r=>r.method!=='GET'),'no blobs, trees or commits were created');
  // Moves after the plan was checked, while the commit is being made
  const prep2=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T1),g.fetch);
  const was=g.head();g.hooks.beforeTree=()=>{g.hooks.beforeTree=null;g.seed({'c.txt':'raced'});};
  e=await fail(pushFiles(TOKEN,prep2,'Raced',g.fetch));assert.equal(e.code,'moved');
  assert.notEqual(g.head(),was);assert.equal(g.files()['c.txt'],'raced');assert.ok(!g.files()['AGENTS.md'],'our files did not land');
  assert.ok(g.log.filter(r=>r.method==='PATCH').every(r=>r.body.force===false));
});

test('an empty commit message is refused before anything is sent',async()=>{
  const g=fakeGithub();g.seed({'a.txt':'1'});const prep=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T1),g.fetch);g.log.length=0;
  const e=await fail(pushFiles(TOKEN,prep,'   ',g.fetch));assert.equal(e.code,'bad-input');assert.equal(g.log.length,0);
});

test('restore from GitHub: the new path, the old world-manager path, and what is not restorable',async()=>{
  const g=fakeGithub();g.seed({'x.txt':'1'});await applyPush(g,ws,{at:T1});
  g.log.length=0;let r=await readRepoRestore(TOKEN,REPO,'main',g.fetch);
  assert.equal(r.ok,true);assert.equal(r.workspace.campaigns.length,1);assert.equal(r.workspace.campaigns[0].id,cid);assert.equal(r.date,T1);assert.ok(r.files>20);
  assert.equal(g.blobGets(),2,'only campaign.json and the log were downloaded');
  // old layout
  const old=fakeGithub();const copy=JSON.parse(g.files()['.rpg-tools/campaign.json']);old.seed({[`world-manager/${cid}/campaign.json`]:JSON.stringify(copy),'world-manager/README.md':'old'});
  r=await readRepoRestore(TOKEN,REPO,'main',old.fetch);assert.equal(r.ok,true);assert.equal(r.workspace.campaigns[0].name,copy.campaigns[0].name);
  // two old backups
  const two=fakeGithub();two.seed({'world-manager/a/campaign.json':'{}','world-manager/b/campaign.json':'{}'});
  r=await readRepoRestore(TOKEN,REPO,'main',two.fetch);assert.equal(r.ok,false);assert.match(r.error,/several old campaign backups/);
  // player-safe, numbered, unknown, broken json, empty
  const safe=fakeGithub();safe.seed({'.rpg-tools/files.json':'{}','1-Now/a.md':'x'});r=await readRepoRestore(TOKEN,REPO,'main',safe.fetch);assert.deepEqual([r.ok,r.kind],[false,'player-safe']);
  const num=fakeGithub();num.seed({'1-Now/a.md':'x','3-People/b.md':'y'});r=await readRepoRestore(TOKEN,REPO,'main',num.fetch);assert.deepEqual([r.ok,r.kind],[false,'numbered']);
  const unk=fakeGithub();unk.seed({'a.txt':'x'});r=await readRepoRestore(TOKEN,REPO,'main',unk.fetch);assert.deepEqual([r.ok,r.kind],[false,'unknown']);
  const bad=fakeGithub();bad.seed({'.rpg-tools/campaign.json':'{nope'});r=await readRepoRestore(TOKEN,REPO,'main',bad.fetch);assert.equal(r.ok,false);assert.match(r.error,/not valid JSON/);
  r=await readRepoRestore(TOKEN,REPO,'main',fakeGithub({empty:true}).fetch);assert.equal(r.ok,false);assert.match(r.error,/is empty/);
  const e=await fail(readRepoRestore(TOKEN,REPO,'nope',g.fetch));assert.equal(e.code,'no-branch');
  // size limit
  const huge=fakeGithub();huge.seed({'.rpg-tools/campaign.json':'{}'});const h=huge.head();const t=huge.commits.get(h).tree;const flat=huge.trees.get(t);
  const origFetch=huge.fetch;const big=async(url,init)=>{const res=await origFetch(url,init);if(/trees\/[^/?]+\?recursive/.test(url)){const b=await res.json();b.tree.forEach(x=>{x.size=60*1024*1024;});return json(200,b);}return res;};void flat;
  r=await readRepoRestore(TOKEN,REPO,'main',big);assert.equal(r.ok,false);assert.match(r.error,/too big/);
  // truncated tree still finds the restore copy
  const tr=fakeGithub({truncate:true});tr.seed({'x.txt':'1'});await applyPush(tr,ws,{at:T1});r=await readRepoRestore(TOKEN,REPO,'main',tr.fetch);assert.equal(r.ok,true);assert.equal(r.truncated,true);
});

test('the key goes only to https://api.github.com, only in the Authorization header, and never into an error',async()=>{
  const g=fakeGithub();g.seed({'README.md':'# a\n'});
  const prep=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T1),g.fetch);await pushFiles(TOKEN,prep,'Go',g.fetch);await readRepoRestore(TOKEN,REPO,'main',g.fetch);await checkRepo(TOKEN,REPO,g.fetch);
  assert.ok(g.log.length>10);
  for(const r of g.log){
    assert.ok(r.url.startsWith('https://api.github.com/repos/'),r.url);assert.ok(!r.url.includes(TOKEN)&&!r.url.includes('github_pat'),'key in a URL');
    assert.equal(r.auth,`Bearer ${TOKEN}`);assert.ok(!JSON.stringify(r.body??'').includes(TOKEN),'key in a body');
    assert.deepEqual(Object.keys(r.headers).filter(h=>r.headers[h].includes?.(TOKEN)),['Authorization']);
  }
  // Errors, including ones where GitHub's own message repeats the key
  const echo=async()=>json(403,{message:`Resource not accessible with ${TOKEN}`});
  const scenarios=[()=>checkRepo(TOKEN,REPO,echo),()=>checkRepo(TOKEN,'nope/none',g.fetch),()=>checkRepo('github_pat_BADBADBADBADBAD',REPO,g.fetch),()=>checkRepo(TOKEN,REPO,async()=>{throw new TypeError(`request to https://api.github.com failed, reason: Bearer ${TOKEN}`);}),
    ()=>checkRepo(TOKEN,REPO,async()=>json(500,{message:TOKEN})),()=>checkRepo(TOKEN,REPO,async()=>json(418,{message:`teapot ${TOKEN}`})),()=>preparePush(TOKEN,REPO,'nope',true,builder(ws,true,T1),g.fetch),
    ()=>readRepoRestore(TOKEN,REPO,'nope',g.fetch),()=>pushFiles(TOKEN,prep,'late',g.fetch),()=>checkBranch(TOKEN,REPO,'main',echo)];
  for(const s of scenarios){const e=await fail(s());assert.ok(!e.message.includes(TOKEN),e.message);assert.ok(!/github_pat_[A-Za-z0-9]/.test(e.message),e.message);assert.ok(!JSON.stringify(e).includes(TOKEN));}
});

test('the key store: per repository, guarded, forgotten on request',()=>{
  const was=globalThis.window;const data=new Map();
  globalThis.window={localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
  try{
    assert.equal(readKey(REPO),null);assert.equal(saveKey(REPO,TOKEN),true);assert.equal(readKey('AYLA/salt-road'),TOKEN);assert.equal(readKey('ayla/other'),null);
    assert.ok([...data.keys()].every(k=>k.startsWith('rpg-tools:github-key:')));forgetKey(REPO);assert.equal(readKey(REPO),null);
    globalThis.window={get localStorage(){throw new Error('blocked');}};assert.equal(readKey(REPO),null);assert.equal(saveKey(REPO,TOKEN),false);forgetKey(REPO);
  }finally{if(was===undefined)delete globalThis.window;else globalThis.window=was;}
  assert.equal(saveKey(REPO,TOKEN),false,'no window: nothing stored, no throw');
});

test('default commit message and the stored last push',()=>{
  const w=structuredClone(ws);
  assert.equal(defaultCommitMessage(w,cid),'Session 1: A light in the fog');
  w.entries.push({id:'s2',worldId:'demo-world',campaignId:cid,parentId:null,title:'The drowned bell',kind:'session',body:'',updatedAt:'2026-12-01T10:00:00.000Z'});
  assert.equal(defaultCommitMessage(w,cid),'Session 2: The drowned bell');
  w.entries.push({id:'s3',worldId:'demo-world',campaignId:cid,parentId:null,title:'Session 9: Salt',kind:'session',body:'',updatedAt:'2026-12-02T10:00:00.000Z'});
  assert.equal(defaultCommitMessage(w,cid),'Session 9: Salt');
  const none=structuredClone(ws);none.entries=none.entries.filter(e=>e.kind!=='session');assert.equal(defaultCommitMessage(none,cid),'Update The Salt Road');
  assert.equal(lastPushKey('c1'),'rpg-tools:rp-last-push:c1');
  const ok={at:T1,repository:REPO,branch:'main',url:`https://github.com/${REPO}/commit/abc`};assert.deepEqual(parseLastPush(JSON.stringify(ok)),ok);
  assert.equal(parseLastPush('nope'),null);assert.equal(parseLastPush(null),null);assert.equal(parseLastPush(JSON.stringify({at:'x',repository:'a/b',branch:'m'})),null);
  assert.equal(parseLastPush(JSON.stringify({...ok,url:'javascript:alert(1)'})).url,undefined);
});

test('files.json stays readable by planWrite and the CLI: the extra gitBlobs field is additive',async()=>{
  const g=fakeGithub();g.seed({'x.txt':'1'});await applyPush(g,ws,{at:T1});
  const map=JSON.parse(g.files()['.rpg-tools/files.json']);assert.equal(map.format,'rpg-tools-files');assert.equal(map.campaignId,cid);assert.ok(map.pages&&map.hashes);
  for(const [p,h] of Object.entries(map.hashes))if(p in g.files())assert.equal(h,textHash(g.files()[p]),p);
});

test('a huge file edited in the repository is left alone instead of blocking the push',async()=>{
  const g=fakeGithub();g.seed({'x.txt':'1'});await applyPush(g,wsP,{at:T1});
  const path='3-People/NPCs/Mara-Venn.md';g.seed({[path]:'x'.repeat(5_100_000)});
  const prep=await preparePush(TOKEN,REPO,'main',true,builder(wsP,true,T2),g.fetch);
  assert.ok(prep.skipped.some(s=>s.path===path));assert.ok(!prep.changes.some(c=>c.path===path));assert.ok(!prep.removals.some(r=>r.path===path));
});

test('an empty repository that gained commits after the plan is not pushed onto',async()=>{
  const g=fakeGithub({empty:true});
  const prep=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T1),g.fetch);
  g.seed({'AGENTS.md':'someone else'});g.log.length=0;
  const e=await fail(pushFiles(TOKEN,prep,'Late',g.fetch));assert.equal(e.code,'moved');
  assert.ok(!g.log.some(r=>r.method!=='GET'));assert.equal(g.files()['AGENTS.md'],'someone else');
});

test('a campaign kept in a folder: pushes and reads touch only that folder',async()=>{
 const {cleanFolder,readRepoChanges}=await import('../lib/github-push.ts');
 assert.equal(cleanFolder(' /Campaigns/Salt Road/ '),'Campaigns/Salt Road');assert.equal(cleanFolder(''),'');
 for(const bad of ['../x','a/../b','.git','a/.hidden','x'.repeat(81),'a|b'])assert.equal(cleanFolder(bad),null,bad);
 const g=fakeGithub();g.seed({'README.md':'my repo\n','Campaigns/Other/1-Campaign/Overview.md':'another campaign\n'});
 const dir='Campaigns/Salt Road';
 const prep=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T1),g.fetch,dir);
 assert.equal(prep.dir,dir);assert.ok(prep.changes.every(c=>!c.path.startsWith('Campaigns/')),'paths in the plan are inside the folder');
 assert.ok(!prep.removals.length,'nothing outside the folder is removed');
 await pushFiles(TOKEN,prep,'Into a folder',g.fetch);
 const files=g.files();
 assert.equal(files['README.md'],'my repo\n');assert.equal(files['Campaigns/Other/1-Campaign/Overview.md'],'another campaign\n');
 const mine=Object.keys(files).filter(p=>p.startsWith(dir+'/'));
 assert.ok(mine.includes(`${dir}/.rpg-tools/files.json`)&&mine.includes(`${dir}/.rpg-tools/campaign.json`));
 assert.ok(Object.keys(files).every(p=>p.startsWith(dir+'/')||p==='README.md'||p.startsWith('Campaigns/Other/')));
 // Reading it back finds the campaign in the folder, and a second push with nothing new changes nothing.
 const restored=await readRepoRestore(TOKEN,REPO,'main',g.fetch,dir);assert.ok(restored.ok,restored.error);assert.equal(restored.workspace.campaigns[0].id,cid);
 const changes=await readRepoChanges(TOKEN,REPO,'main',g.fetch,undefined,dir);assert.ok(changes.ok);assert.ok(changes.files.every(f=>!f.path.startsWith('Campaigns/')));
 const again=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T1),g.fetch,dir);assert.ok(again.nothingToPush);
 // The top of the repository doesn't see the folder's campaign.
 assert.equal((await readRepoRestore(TOKEN,REPO,'main',g.fetch)).ok,false);
 // A folder not made yet reads as empty, and a bad folder is refused before anything is asked of GitHub.
 const none=await preparePush(TOKEN,REPO,'main',true,builder(ws,true,T1),g.fetch,'Campaigns/New');assert.ok(none.changes.every(c=>c.kind==='new'));
 assert.equal((await fail(preparePush(TOKEN,REPO,'main',true,builder(ws,true,T1),g.fetch,'../up'))).code,'bad-input');
});
