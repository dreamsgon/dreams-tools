import test from 'node:test';
import assert from 'node:assert/strict';
const {parseRepoLink,findAccess,appCanReach,checkRepo}=await import('../lib/github-push.ts');
const {readKey,saveKey,keysFor,saveAccountKey,readAccountKey,saveSignIn,readSignIn,forgetSignIn,hasAnyKey}=await import('../lib/github-key.ts');
const {appConfig,exchange,finishPage,authorizeUrl}=await import('../lib/github-app.ts');
const {fakeGithub,json}=await import('./helpers/fake-github.mjs');

const TOKEN='github_pat_TESTSECRET1234567890abcdef',OTHER='github_pat_OTHERKEY0000000000000000',REPO='ayla/salt-road';
const fail=async(p)=>{try{await p;}catch(e){return e;}assert.fail('expected an error');};

test('parseRepoLink: links, owner/repo, clone addresses, tree links',()=>{
  for(const [input,want] of [
    ['ayla/salt-road',{repo:'ayla/salt-road'}],
    ['https://github.com/dreamsgon/evil-tod-a',{repo:'dreamsgon/evil-tod-a'}],
    ['  https://github.com/dreamsgon/evil-tod-a/  ',{repo:'dreamsgon/evil-tod-a'}],
    ['github.com/dreamsgon/evil-tod-a',{repo:'dreamsgon/evil-tod-a'}],
    ['www.github.com/Dreamsgon/Evil-ToD-A.git',{repo:'Dreamsgon/Evil-ToD-A'}],
    ['https://github.com/dreamsgon/evil-tod-a.git',{repo:'dreamsgon/evil-tod-a'}],
    ['git@github.com:dreamsgon/evil-tod-a.git',{repo:'dreamsgon/evil-tod-a'}],
    ['https://github.com/dreamsgon/evil-tod-a?tab=readme-ov-file#top',{repo:'dreamsgon/evil-tod-a'}],
    ['https://github.com/dreamsgon/evil-tod-a/issues/3',{repo:'dreamsgon/evil-tod-a'}],
    ['https://github.com/ayla/salt-road/tree/dev',{repo:'ayla/salt-road',branch:'dev'}],
    ['https://github.com/ayla/salt-road/tree/main/Campaigns/Salt%20Road',{repo:'ayla/salt-road',branch:'main',folder:'Campaigns/Salt Road'}],
  ])assert.deepEqual(parseRepoLink(input),want,input);
  for(const bad of ['','ayla','https://gitlab.com/a/b','https://evil.example/a/b','../x/y','a b/c'])assert.equal(parseRepoLink(bad),null,bad);
});

test('findAccess: tries each saved key and keeps the one that can write',async()=>{
  const g=fakeGithub();
  const got=await findAccess([OTHER,TOKEN],REPO,g.fetch);
  assert.equal(got.token,TOKEN);assert.equal(got.info.defaultBranch,'main');
  // No key reaches it: the clearest error wins (not found beats a key GitHub turned down).
  const e=await fail(findAccess([OTHER,TOKEN],'ayla/other',g.fetch));
  assert.equal(e.code,'no-access');assert.match(e.message,/edit the key and add other under Repository access/);
  assert.ok(!e.message.includes(TOKEN));
  assert.equal((await fail(findAccess([],REPO,g.fetch))).code,'bad-key');
  const ro=await fail(findAccess([OTHER,TOKEN],REPO,fakeGithub({push:false}).fetch));assert.equal(ro.code,'read-only');
  const down=fakeGithub();down.down=true;assert.equal((await fail(findAccess([TOKEN],REPO,down.fetch))).code,'network');
});

test('findAccess: the default branch comes from GitHub',async()=>{
  const g=fakeGithub({defaultBranch:'master',branch:'master'});
  assert.equal((await findAccess([TOKEN],REPO,g.fetch)).info.defaultBranch,'master');
});

/** A sign-in key: GitHub's /repos answer is the person's own access, so the app's installations decide. */
function appGithub({selection='selected',repos=[REPO],owner='ayla'}={}){
  const token='ghu_SIGNEDIN000000000000000000';
  const base=fakeGithub({token});
  const fetch=async(url,init={})=>{
    const u=new URL(url);
    if(u.pathname==='/user/installations')return json(200,{installations:[{id:7,account:{login:owner},repository_selection:selection}]});
    if(u.pathname==='/user/installations/7/repositories')return json(200,{repositories:repos.map(full_name=>({full_name}))});
    return base.fetch(url,init);
  };
  return {token,fetch};
}
test('sign-in keys: only repositories the app was added to',async()=>{
  let a=appGithub();assert.equal(await appCanReach(a.token,REPO,a.fetch),true);
  assert.equal((await findAccess([a.token],REPO,a.fetch)).token,a.token);
  a=appGithub({repos:[]});assert.equal(await appCanReach(a.token,REPO,a.fetch),false);
  const e=await fail(findAccess([a.token],REPO,a.fetch));assert.equal(e.code,'no-app');assert.match(e.message,/hasn't been added to ayla\/salt-road/);
  a=appGithub({repos:[],selection:'all'});assert.equal(await appCanReach(a.token,REPO,a.fetch),true);
  a=appGithub({owner:'someone-else',selection:'all'});assert.equal(await appCanReach(a.token,REPO,a.fetch),false);
  // A pasted key that works still wins over a sign-in that can't reach the repository.
  a=appGithub({repos:[]});const both=fakeGithub();
  const mixed=async(url,init)=>init?.headers?.Authorization===`Bearer ${TOKEN}`?both.fetch(url,init):a.fetch(url,init);
  assert.equal((await findAccess([a.token,TOKEN],REPO,mixed)).token,TOKEN);
});

test('the key store: one key for every campaign, the sign-in, and every saved key to try',()=>{
  const was=globalThis.window,data=new Map();
  const ls={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]??null,get length(){return data.size;}};
  globalThis.window={localStorage:ls};
  try{
    assert.deepEqual(keysFor(REPO),[]);assert.equal(hasAnyKey(),false);
    saveKey('ayla/old-campaign',OTHER);
    assert.deepEqual(keysFor(REPO),[OTHER],'a key saved for another campaign is tried too');
    assert.equal(saveAccountKey(TOKEN),true);assert.equal(readAccountKey(),TOKEN);
    assert.deepEqual(keysFor(REPO),[TOKEN,OTHER]);
    saveKey(REPO,TOKEN);assert.deepEqual(keysFor(REPO),[TOKEN,OTHER],'no repeats');
    saveSignIn({token:'ghu_A00000000000000',refresh:'ghr_R',expires:1,login:'ayla'});
    assert.deepEqual(keysFor('ayla/new'),['ghu_A00000000000000',TOKEN,OTHER]);
    // A repository connected by sign-in follows the renewed key instead of keeping a stale copy.
    saveKey('ayla/new','ghu_A00000000000000');assert.equal(data.get('rpg-tools:github-key:ayla/new'),'@signin');
    saveSignIn({...readSignIn(),token:'ghu_B00000000000000'});assert.equal(readKey('ayla/new'),'ghu_B00000000000000');
    assert.ok(!keysFor('x/y').includes('@signin'));
    forgetSignIn();assert.equal(readKey('ayla/new'),null);
    data.set('rpg-tools:github-signin','{not json');assert.equal(readSignIn(),null);
  }finally{if(was===undefined)delete globalThis.window;else globalThis.window=was;}
  assert.deepEqual(keysFor(REPO),[],'no window: nothing, no throw');
});

test('GitHub App: off without settings, swaps a code, never shows GitHub\'s reply',async()=>{
  assert.equal(appConfig({}),null);assert.equal(appConfig({GITHUB_APP_CLIENT_ID:'Iv23abc'}),null);
  const cfg=appConfig({GITHUB_APP_CLIENT_ID:'Iv23abc',GITHUB_APP_CLIENT_SECRET:'shh'});assert.deepEqual(cfg,{clientId:'Iv23abc',clientSecret:'shh'});
  const url=new URL(authorizeUrl(cfg,'st4te','https://x.example/api/github/callback'));
  assert.equal(url.origin,'https://github.com');assert.equal(url.searchParams.get('state'),'st4te');assert.equal(url.searchParams.get('client_id'),'Iv23abc');
  let sent;
  const gh=async(u,init)=>{sent={u,body:new URLSearchParams(init.body)};return json(200,{access_token:'ghu_NEW000000000000',refresh_token:'ghr_NEW',expires_in:28800});};
  const t=await exchange(cfg,{code:'c0de',redirectUri:'https://x.example/api/github/callback'},gh,1000);
  assert.equal(sent.u,'https://github.com/login/oauth/access_token');assert.equal(sent.body.get('client_secret'),'shh');assert.equal(sent.body.get('code'),'c0de');
  assert.deepEqual(t,{token:'ghu_NEW000000000000',refresh:'ghr_NEW',expires:1000+28800*1000});
  await exchange(cfg,{refresh:'ghr_OLD'},gh);assert.equal(sent.body.get('grant_type'),'refresh_token');assert.equal(sent.body.get('refresh_token'),'ghr_OLD');
  const bad=await fail(exchange(cfg,{refresh:'ghr_OLD'},async()=>json(200,{error:'bad_refresh_token',error_description:'secret stuff'})));
  assert.match(bad.message,/Sign in with GitHub again/);assert.ok(!bad.message.includes('secret'));
  assert.match((await fail(exchange(cfg,{code:'x',redirectUri:'r'},async()=>{throw new TypeError('down');}))).message,/Could not reach GitHub/);
});

test('the sign-in window page: keeps the key in this browser and can\'t be broken out of',()=>{
  const html=finishPage({ok:true,tokens:{token:'ghu_X</script><script>alert(1)//',refresh:'r'},login:'ayla'},'rpg-tools:github-signin');
  assert.ok(!html.includes('</script><script>alert'),'a key or name can\'t close the script');
  assert.match(html,/localStorage\.setItem\("rpg-tools:github-signin"/);
  assert.match(html,/postMessage\(.*location\.origin\)/);
  const err=finishPage({ok:false,error:'<b>no</b>'},'k');assert.ok(!err.includes('<b>no</b>'));
});

test('checkRepo is unchanged for a pasted key',async()=>{
  assert.equal((await checkRepo(TOKEN,REPO,fakeGithub().fetch)).fullName,REPO);
});
