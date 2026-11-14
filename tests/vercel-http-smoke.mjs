// Run after npm run build. Uses no live accounts, credentials or cloud writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const reservation=createServer();
await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const port=reservation.address().port;
await new Promise(resolve=>reservation.close(resolve));
const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),'start','--hostname','127.0.0.1','--port',String(port)],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe'],
  env:{...process.env,MAPTABLE_AWS_ACCESS_KEY_ID:'',MAPTABLE_AWS_SECRET_ACCESS_KEY:'',MAPTABLE_AWS_SESSION_TOKEN:'',MAPTABLE_S3_BUCKET:'',S3_BUCKET:''}
});
let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
try{
  let ready=false;
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error(output);
    try{const response=await fetch(base+'/account');if(response.status===200){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.ok(ready,output);
  const html=await (await fetch(base+'/account')).text();assert.match(html,/Register/);assert.match(html,/Forgot password/);assert.doesNotMatch(html,/Continue with ChatGPT/);
  const map=await fetch(base+'/maptable',{redirect:'manual'});assert.equal(map.status,307);assert.match(map.headers.get('location'),/\/account$/);
  const home=await (await fetch(base+'/')).text();assert.match(home,/RPG Encyclopedia/);assert.match(home,/href="\/maptable"/);assert.match(home,/href="\/encyclopedia"/);assert.match(home,/href="\/campaigns"/);
  assert.match(await (await fetch(base+'/campaigns')).text(),/Sign in to see your campaigns/);
  const encyclopedia=await fetch(base+'/encyclopedia',{redirect:'manual'});assert.equal(encyclopedia.status,307);assert.match(encyclopedia.headers.get('location'),/\/account$/);
  assert.equal((await fetch(base+'/encyclopedia/player')).status,200);
  const forged={'oai-authenticated-user-id':'attacker','oai-authenticated-user-email':'attacker@example.com'};
  for(const path of ['/api/workspace','/api/assets?id=00000000-0000-0000-0000-000000000000','/api/settings','/api/s3?key=maps/test.png','/api/campaigns','/api/campaigns?download=backup']){
    const response=await fetch(base+path,{headers:forged});assert.equal(response.status,401,path);assert.equal((await response.json()).error,'Unauthorized');
  }
  for(const path of ['/api/encyclopedia/workspace','/api/encyclopedia/map-images?id=00000000-0000-0000-0000-000000000000','/api/encyclopedia/history?entry=demo-greyhaven','/api/encyclopedia/maptable-scenes','/api/encyclopedia/tables'])assert.equal((await fetch(base+path,{headers:forged})).status,401);
  for(const path of ['/api/encyclopedia/player-links','/api/encyclopedia/agent-access','/api/encyclopedia/mcp','/api/encyclopedia/history','/api/encyclopedia/discord-roll'])assert.equal((await fetch(base+path,{method:'POST',headers:{...forged,'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(base+'/api/encyclopedia/player-view',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"token":"invalid"}'})).status,404);
  assert.equal((await fetch(base+'/api/campaigns',{method:'POST',headers:{...forged,'Content-Type':'application/json'},body:'{"action":"pair","pairs":[]}'})).status,401);
  assert.equal((await fetch(base+'/api/members?campaignId=demo-campaign',{headers:forged})).status,401);
  assert.equal((await fetch(base+'/api/members?mine=1',{headers:forged})).status,401);
  assert.equal((await fetch(base+'/api/members',{method:'POST',headers:{...forged,'Content-Type':'application/json'},body:JSON.stringify({action:'join',token:'a'.repeat(64),name:'Mara'})})).status,401);
  assert.equal((await fetch(base+'/api/members',{method:'POST',headers:{...forged,'Content-Type':'application/json'},body:JSON.stringify({action:'ban',campaignId:'demo-campaign',userId:'x',email:true,ip:false,note:''})})).status,401);
  assert.deepEqual(await (await fetch(base+'/api/notifications',{headers:forged})).json(),{items:[],unread:0});
  const agent=await fetch(base+'/api/agent/maps');assert.equal(agent.status,401);
  const transfer=await fetch(base+'/api/transfers',{method:'POST',headers:{...forged,'Content-Type':'application/json'},body:JSON.stringify({purpose:'image',size:10,type:'image/png'})});assert.equal(transfer.status,401);
  const account=await fetch(base+'/api/account',{method:'POST',headers:{Origin:'https://unrelated.example','Content-Type':'application/json'},body:'{}'});assert.equal(account.status,403);
  console.log('PASS: RPG Tools home, encyclopedia/player routes, production account page, protected map and encyclopedia redirects, forged identity rejection, private APIs, transfers, campaign authentication, and cross-origin account protection.');
}finally{
  child.kill();
  await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});
}
