// Typing in a wiki page re-checks the Wiki on every key press. These keep those checks giving the same answers as the
// full ones they replace, and keep them quick in a big Wiki.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {demoWorkspace,workspaceSchema,checkWorkspace,canParent,parentChoices,folderPath,folderPaths} from '../lib/encyclopedia/world-model.ts';
import {splitWorkspace,bytes,partBytes,partSizes,sizeProblem} from '../lib/encyclopedia/wiki-parts.ts';
import {descendantCount,childIndex,mentionsOf} from '../lib/encyclopedia/page-tree.ts';

function bigWiki(n){
  const s=demoWorkspace(),base=s.entries.find(e=>e.id==='demo-mara');
  for(let i=0;i<n;i++)s.entries.push({...base,id:'p'+i,title:'Page '+i,kind:'note',character:undefined,parentId:i%10?'p'+(i-i%10):null,campaignId:'demo-campaign',body:`Page ${i} mentions [[demo-greyhaven|Greyhaven]] and “Ünïcödé” text.`});
  return s;
}
// What canParent answered before: a moved copy of the whole Wiki passes the schema.
function slowCanParent(entry,parent,s){
  if(parent.worldId!==entry.worldId||parent.campaignId!==entry.campaignId)return false;
  let current=parent;const seen=new Set();
  while(current){if(current.id===entry.id||seen.has(current.id))return false;seen.add(current.id);current=s.entries.find(e=>e.id===current.parentId);}
  return workspaceSchema.safeParse({...s,entries:s.entries.map(e=>e.id===entry.id?{...e,parentId:parent.id}:e)}).success;
}

test('the Move inside choices match moving a copy of the Wiki and checking it',()=>{
  const s=demoWorkspace(),base=s.entries[0];let parent=null;
  for(let i=0;i<20;i++){const id='depth-'+i;s.entries.push({...base,id,title:id,parentId:parent});parent=id;}
  s.entries.push({...base,id:'subtree',title:'Subtree',parentId:null},{...base,id:'child',title:'Child',parentId:'subtree'},{...base,id:'leaf',title:'Leaf',parentId:null});
  for(const entry of s.entries){
    const want=s.entries.filter(p=>slowCanParent(entry,p,s)).map(p=>p.id);
    assert.deepEqual(parentChoices(s,entry).map(p=>p.id),want,entry.id);
    for(const p of s.entries)assert.equal(canParent(entry,p,s),want.includes(p.id),`${entry.id} in ${p.id}`);
  }
  assert(canParent(s.entries.find(e=>e.id==='leaf'),s.entries.find(e=>e.id==='depth-19'),s));
  assert(!canParent(s.entries.find(e=>e.id==='subtree'),s.entries.find(e=>e.id==='depth-19'),s));
});

test('folderPaths matches folderPath for every page',()=>{
  const s=bigWiki(60),paths=folderPaths(s);
  for(const e of s.entries)assert.equal(paths.get(e.id),folderPath(s,e));
});

test('checkWorkspace agrees with the workspace schema, also for an edit after a check',()=>{
  const s=bigWiki(30);
  assert.equal(checkWorkspace(s).success,true);
  const edited={...s,entries:s.entries.map((e,i)=>i===5?{...e,body:e.body+' more'}:e)};
  assert.equal(checkWorkspace(edited).success,true);
  const cases=[
    {...s,entries:[...s.entries,{...s.entries[3]}]},
    {...s,entries:s.entries.map((e,i)=>i===4?{...e,title:''}:e)},
    {...s,entries:s.entries.map((e,i)=>i===6?{...e,body:'x'.repeat(100001)}:e)},
    {...s,entries:s.entries.map((e,i)=>i===7?{...e,parentId:e.id}:e)},
    {...s,entries:s.entries.map((e,i)=>i===8?{...e,campaignId:'missing'}:e)},
    {...s,campaigns:s.campaigns.map((c,i)=>i===0?{...c,name:''}:c)},
    {...s,schemaVersion:2},
  ];
  for(const bad of cases){
    const full=workspaceSchema.safeParse(bad),quick=checkWorkspace(bad);
    assert.equal(full.success,false);assert.equal(quick.success,false);
    assert.equal(quick.message,full.error.issues[0].message);
  }
});

test('part sizes add up to the size of the written-out part',()=>{
  const s=bigWiki(40);
  for(const part of splitWorkspace(s).parts.values())assert.equal(partBytes(part),bytes(part));
  assert.equal(partBytes({entries:[]}),bytes({entries:[]}));
  const sizes=partSizes(s);assert(sizes.every(x=>x.bytes>0));
  assert.equal(sizeProblem(s),null);
});

test('child lookups and mentions give the same answers in a big Wiki, quickly',()=>{
  const s=bigWiki(3000);
  assert.equal(descendantCount(s,'p0'),9);
  assert.deepEqual(childIndex(s.entries).get('p10').map(e=>e.id),s.entries.filter(e=>e.parentId==='p10').map(e=>e.id));
  const grey=s.entries.find(e=>e.id==='demo-greyhaven');
  const started=performance.now();
  const mentions=mentionsOf(s,grey);
  // Every page links Greyhaven by id; resolving every other link used to search the whole Wiki per link.
  assert(mentions.length>=3000);
  const edited={...s,entries:s.entries.map((e,i)=>i===s.entries.length-1?{...e,body:e.body+'x'}:e)};
  assert.equal(checkWorkspace(edited).success,true);sizeProblem(edited);parentChoices(edited,edited.entries[edited.entries.length-1]);
  assert(performance.now()-started<3000,'the checks a key press runs stay quick');
});
