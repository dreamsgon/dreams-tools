import {createHash} from 'node:crypto';
// A small pretend GitHub (git data API, contents API, rate limits) for tests and screenshots.
export const sha1=(b)=>createHash('sha1').update(b).digest('hex');
export const blobId=(buf)=>sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`),buf]));
export const json=(status,data,headers={})=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});

/** A small pretend GitHub: one repository with git objects in memory. Records every request. */
export function fakeGithub({token='github_pat_TESTSECRET1234567890abcdef',repo='ayla/salt-road',branch='main',empty=false,emptyRef=409,push=true,privateRepo=true,truncate=false,defaultBranch='main'}={}){
  const g={blobs:new Map(),commits:new Map(),trees:new Map(),branches:new Map(),log:[],counter:0,empty,hooks:{},down:false,limit:null};
  const id=()=>createHash('sha1').update('x'+(++g.counter)).digest('hex');
  const addBlob=(text)=>{const buf=Buffer.from(text);const s=blobId(buf);g.blobs.set(s,buf);return s;};
  const addTree=(flat)=>{const s=id();g.trees.set(s,new Map(flat));return s;};
  const addCommit=(tree,parents,message='seed')=>{const s=id();g.commits.set(s,{tree,parents,message});return s;};
  /** Puts files on the branch as one commit. */
  g.seed=(files,{remove=[]}={})=>{const head=g.branches.get(branch);const flat=new Map(head?g.trees.get(g.commits.get(head).tree):[]);for(const p of remove)flat.delete(p);for(const [p,t] of Object.entries(files))flat.set(p,addBlob(t));g.branches.set(branch,addCommit(addTree(flat),head?[head]:[]));g.empty=false;};
  g.files=()=>{const h=g.branches.get(branch);const out={};if(!h)return out;for(const [p,s] of g.trees.get(g.commits.get(h).tree))out[p]=g.blobs.get(s).toString();return out;};
  g.head=()=>g.branches.get(branch);
  g.blobGets=()=>g.log.filter(r=>r.method==='GET'&&/\/git\/blobs\//.test(r.path)).length;
  g.fetch=async(url,init={})=>{
    const method=init.method??'GET',u=new URL(url),path=u.pathname+u.search;
    const headers=init.headers??{};
    g.log.push({method,url,path,auth:headers.Authorization,headers,body:init.body?JSON.parse(init.body):undefined});
    if(g.down)throw new TypeError('fetch failed: '+url);
    if(u.origin!=='https://api.github.com')return json(404,{message:'wrong host'});
    if(headers.Authorization!==`Bearer ${token}`)return json(401,{message:'Bad credentials'});
    const m=u.pathname.match(/^\/repos\/([^/]+\/[^/]+)(\/.*)?$/);
    if(!m||m[1]!==repo)return json(404,{message:'Not Found'});
    const rest=m[2]??'',body=init.body?JSON.parse(init.body):null;
    if(g.limit)return json(403,{message:'API rate limit exceeded'},{'x-ratelimit-remaining':'0','x-ratelimit-reset':'1900000000'});
    if(rest===''&&method==='GET')return json(200,{full_name:repo,private:privateRepo,default_branch:defaultBranch,permissions:{push,pull:true}});
    if(rest==='/branches')return g.empty?json(200,[]):json(200,[{name:branch}]);
    let r;
    if((r=rest.match(/^\/git\/ref\/heads\/(.+)$/))&&method==='GET'){
      if(g.empty)return emptyRef===409?json(409,{message:'Git Repository is empty.'}):json(404,{message:'Not Found'});
      const h=g.branches.get(decodeURIComponent(r[1]));return h?json(200,{ref:'refs/heads/'+r[1],object:{sha:h,type:'commit'}}):json(404,{message:'Not Found'});}
    if((r=rest.match(/^\/git\/commits\/([0-9a-f]+)$/))&&method==='GET'){const c=g.commits.get(r[1]);return c?json(200,{sha:r[1],tree:{sha:c.tree}}):json(404,{});}
    if((r=rest.match(/^\/git\/trees\/([^?]+)$/))&&method==='GET'){
      const [tid,prefix='']=decodeURIComponent(r[1]).split('|'),flat=g.trees.get(tid);if(!flat)return json(404,{});
      if(u.searchParams.get('recursive')){
        // Like GitHub, a subtree lists its files relative to itself.
        const all=[...flat].filter(([p])=>p.startsWith(prefix)).map(([p,s])=>({path:p.slice(prefix.length),type:'blob',sha:s,size:g.blobs.get(s).length}));
        if(truncate||(g.limit===null&&false))return json(200,{sha:tid,tree:all.slice(0,3),truncated:true});
        return json(200,{sha:tid,tree:all,truncated:false});}
      const out=[],dirs=new Set();
      for(const [p,s] of flat){if(!p.startsWith(prefix))continue;const rel=p.slice(prefix.length);const i=rel.indexOf('/');if(i<0)out.push({path:rel,type:'blob',sha:s,size:g.blobs.get(s).length});else dirs.add(rel.slice(0,i));}
      for(const d of dirs)out.push({path:d,type:'tree',sha:`${tid}|${prefix}${d}/`});
      return json(200,{sha:tid,tree:out,truncated:false});}
    if((r=rest.match(/^\/git\/blobs\/([0-9a-f]+)$/))&&method==='GET'){const b=g.blobs.get(r[1]);return b?json(200,{sha:r[1],encoding:'base64',content:b.toString('base64').replace(/(.{60})/g,'$1\n'),size:b.length}):json(404,{});}
    if(rest==='/git/blobs'&&method==='POST'){const buf=Buffer.from(body.content,'base64');const s=blobId(buf);g.blobs.set(s,buf);return json(201,{sha:s});}
    if(rest==='/git/trees'&&method==='POST'){
      g.hooks.beforeTree?.();const base=g.trees.get(body.base_tree);if(!base)return json(422,{message:'base tree not found'});const flat=new Map(base);
      for(const e of body.tree){if(e.sha===null)flat.delete(e.path);else{if(!g.blobs.has(e.sha))return json(422,{message:'missing blob'});flat.set(e.path,e.sha);}}
      return json(201,{sha:addTree(flat)});}
    if(rest==='/git/commits'&&method==='POST'){return json(201,{sha:addCommit(body.tree,body.parents,body.message)});}
    if((r=rest.match(/^\/git\/refs\/heads\/(.+)$/))&&method==='PATCH'){
      const name=decodeURIComponent(r[1]),cur=g.branches.get(name);if(!cur)return json(422,{message:'Reference does not exist'});
      if(body.force!==true&&!g.commits.get(body.sha)?.parents.includes(cur))return json(422,{message:'Update is not a fast forward'});
      g.branches.set(name,body.sha);return json(200,{ref:'refs/heads/'+name,object:{sha:body.sha}});}
    if((r=rest.match(/^\/contents\/(.+)$/))&&method==='PUT'){
      if(!g.empty)return json(422,{message:'sha missing'});
      const text=Buffer.from(body.content,'base64').toString();const flat=new Map([[decodeURIComponent(r[1]),addBlob(text)]]);
      const c=addCommit(addTree(flat),[],body.message);g.branches.set(body.branch||defaultBranch,c);g.empty=false;return json(201,{commit:{sha:c}});}
    return json(404,{message:'unhandled '+method+' '+rest});};
  return g;
}
