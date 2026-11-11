import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { S3Bucket, storageConfig } from '../lib/storage.ts';
import { createTransfer, readTransfer, storedJson, workspaceBody } from '../lib/transfers.ts';
import { readJsonResponse, stageTransfer } from '../lib/transfer-client.ts';
import { saveWorkspace, loadWorkspace } from '../lib/workspace-storage.ts';
import { initialWorkspace } from '../lib/model.ts';

const config = { bucket:'maptable-test',region:'us-east-1',prefix:'maptable',accessKeyId:'test-key',secretAccessKey:'test-secret' };
test('S3 PUTs use fixed UTF-8/binary byte lengths over Node HTTP, not chunked transfer',async()=>{
  const received=[];
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    received.push({headers:req.headers,bytes:Buffer.concat(chunks)});
    res.writeHead(200,{etag:'"saved"'});res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const url=`http://127.0.0.1:${server.address().port}/object`;
    const bucket=new S3Bucket(config,req=>fetch(new Request(url,req)));
    const backing=new Uint8Array([99,1,2,3,99]);
    const bodies=['{"name":"世界 🗺️"}',backing.subarray(1,4),new Uint8Array([4,5]).buffer,''];
    for(const body of bodies)await bucket.put('test.json',body,{onlyIf:{etagDoesNotMatch:'*'}});
    for(let i=0;i<bodies.length;i++){
      const expected=Buffer.from(bodies[i]);
      assert.deepEqual(received[i].bytes,expected);
      assert.equal(received[i].headers['content-length'],String(expected.byteLength));
      assert.equal(received[i].headers['transfer-encoding'],undefined);
      assert.equal(received[i].headers['if-none-match'],'*');
    }
  } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});
function storage() {
  const objects = new Map(), requests = []; let revision = 0;
  const bucket = new S3Bucket(config,async req => {
    requests.push(req);
    const key = new URL(req.url).pathname, previous = objects.get(key);
    if (req.method === 'PUT') {
      if ((req.headers.get('if-none-match')==='*'&&previous) || (req.headers.has('if-match')&&req.headers.get('if-match')!==previous?.etag)) return new Response(null,{status:412});
      const value = {etag:`"revision-${++revision}"`,bytes:await req.arrayBuffer(),type:req.headers.get('content-type')};
      objects.set(key,value);return new Response(null,{headers:{etag:value.etag}});
    }
    if(req.method==='DELETE'){objects.delete(key);return new Response(null,{status:204});}
    if(!previous)return new Response(null,{status:404});
    return new Response(req.method==='HEAD'?null:previous.bytes,{headers:{etag:previous.etag,'content-length':String(previous.bytes.byteLength),'content-type':previous.type}});
  });
  return {bucket,objects,requests};
}
test('S3 adapter preserves conditional initial writes and revision conflicts across concurrent saves',async()=>{
  const {bucket,requests}=storage(), w=initialWorkspace();
  const initial=await saveWorkspace(bucket,'users/alice/',w,null);
  assert.ok(initial.revision);
  assert.equal(await saveWorkspace(bucket,'users/alice/',w,null),null);
  const one=structuredClone(w),two=structuredClone(w);one.scenes[0].name='One';two.scenes[0].name='Two';
  const results=await Promise.all([saveWorkspace(bucket,'users/alice/',one,initial.revision),saveWorkspace(bucket,'users/alice/',two,initial.revision)]);
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(await loadWorkspace(bucket,'users/bob/'),null);
  const rootWrites=requests.filter(r=>r.method==='PUT'&&new URL(r.url).pathname.endsWith('/workspace.json'));
  assert.equal(rootWrites[0].headers.get('if-none-match'),'*');
  assert.ok(rootWrites.slice(1).every(r=>r.headers.get('if-match')===`"${initial.revision}"`));
  assert.ok(rootWrites.every(r=>r.headers.get('authorization').includes('AWS4-HMAC-SHA256')));
});
test('S3 conditional 409 does not retry without a precondition; missing ETags fail closed',async()=>{
  let count=0;
  const bucket=new S3Bucket(config,async()=>{count++;return new Response(null,{status:409});});
  assert.equal(await bucket.put('workspace.json','{}',{onlyIf:{etagMatches:'old'}}),null);assert.equal(count,1);
  const bad=new S3Bucket(config,async()=>new Response(null,{status:200}));
  await assert.rejects(()=>bad.put('workspace.json','{}'),/revision/);
});
test('signed uploads bind account, purpose, exact size and MIME type; credentials never include secret',()=>{
  const bucket=new S3Bucket({...config,sessionToken:'temporary-session'});
  const transfer=createTransfer(bucket,'users/alice/',{purpose:'image',size:1234,type:'image/png'});
  const policy=JSON.parse(Buffer.from(transfer.fields.policy,'base64').toString());
  assert.equal(transfer.fields.key,`maptable/transfers/users/alice/image/${transfer.id}`);
  assert.ok(policy.conditions.some(c=>Array.isArray(c)&&c[0]==='content-length-range'&&c[1]===1234&&c[2]===1234));
  assert.ok(policy.conditions.some(c=>c['Content-Type']==='image/png'));
  assert.equal(transfer.fields['x-amz-security-token'],'temporary-session');
  assert.ok(!JSON.stringify(transfer).includes('test-secret'));
  assert.throws(()=>createTransfer(bucket,'users/alice/',{purpose:'image',size:21*1024*1024,type:'image/png'}));
  assert.throws(()=>createTransfer(bucket,'users/alice/',{purpose:'image',size:10,type:'text/html'}));
  assert.throws(()=>bucket.objectUrl('../users/bob'));
  assert.throws(()=>storageConfig({}),/not configured/);
});
test('staged content cannot be read by another account or for a different purpose',async()=>{
  const {bucket}=storage(),id=crypto.randomUUID(),key=`transfers/users/alice/workspace/${id}`;
  await bucket.put(key,JSON.stringify({revision:'r1',patch:{activeId:'s'}}),{httpMetadata:{contentType:'application/json'}});
  await assert.rejects(()=>readTransfer(bucket,'users/bob/','workspace',id),/missing/);
  await assert.rejects(()=>readTransfer(bucket,'users/alice/','image',id),/missing/);
  await assert.rejects(()=>readTransfer(bucket,'users/alice/','workspace','../workspace.json'),/Invalid/);
  const body=await workspaceBody(new Request('https://app.test',{method:'PUT',body:JSON.stringify({transferId:id})}),bucket,'users/alice/');
  assert.equal(body.revision,'r1');assert.equal(await bucket.get(key),null);
});
test('large JSON responses use short lived signed storage reads without leaking cookies or bearer keys',async()=>{
  const {bucket}=storage(),data={name:'Large map',value:'x'.repeat(3_000_001)};
  const response=await storedJson(bucket,'users/alice/',data,{headers:{ETag:'"r1"'}});
  assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('etag'),'"r1"');
  const envelope=await response.clone().json();const url=new URL(envelope.downloadUrl);
  assert.equal(url.searchParams.get('X-Amz-Expires'),'300');assert.match(url.pathname,/transfers\/users\/alice\/downloads/);
  const actual=await readJsonResponse(response,async(target,init)=>{assert.equal(init.credentials,'omit');assert.equal(init.headers,undefined);return Response.json(data);});
  assert.deepEqual(actual,data);
});
test('browser stages only transfer metadata through the app; file bytes go directly to S3',async()=>{
  const calls=[],blob=new Blob(['map'],{type:'image/png'});
  const id=await stageTransfer(blob,'image',async(url,init)=>{
    calls.push({url,init});
    if(url==='/api/transfers')return Response.json({id:'transfer',url:'https://bucket.s3.us-east-1.amazonaws.com/',fields:{key:'scoped-key',policy:'signed'}});
    assert.equal(init.credentials,'omit');assert.equal(init.headers,undefined);assert.equal(init.body.get('file').size,3);
    return new Response(null,{status:204});
  });
  assert.equal(id,'transfer');assert.deepEqual(JSON.parse(calls[0].init.body),{purpose:'image',type:'image/png',size:3});assert.equal(calls.length,2);
});

