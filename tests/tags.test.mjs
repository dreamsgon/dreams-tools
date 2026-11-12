import test from 'node:test';
import assert from 'node:assert/strict';
import {
 tagKey,cleanTagName,findTag,emptyTags,tagLibrarySchema,applyTagAction,importCharacterTags,
 tagsOn,campaignTargets,tagUses,kindsLabel,targetsWith,parseTagQuery,partialTag,suggestTags,
} from '../lib/tags.ts';
import {tagsKey,readTags,changeTags,tagAction,tagsWithImport,describeTagged} from '../lib/tags-server.ts';
import {emptyWorkspace} from '../lib/encyclopedia/world-model.ts';

class Bucket {
 data=new Map();n=0;
 async get(key){const v=this.data.get(key);return v?{etag:v.etag,json:async()=>JSON.parse(v.text)}:null;}
 async head(key){return this.get(key);}
 async put(key,text,options={}){const old=this.data.get(key);if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++this.n);this.data.set(key,{text,etag});return {etag};}
 async delete(key){this.data.delete(key);}
}

// Applies one action, checks the result is still a valid library, and returns it.
const run=(lib,action)=>tagLibrarySchema.parse(applyTagAction(lib,action));
const create=(lib,id,name,color='red')=>run(lib,{action:'create',id,name,color});
const withTags=(...names)=>names.reduce((lib,n,i)=>create(lib,'t'+(i+1),n,['red','blue','green','amber'][i%4]),emptyTags());

test('tagKey and cleanTagName ignore case, extra spaces and a leading #', () => {
  assert.equal(tagKey('#Act   Two '),'act two');
  assert.equal(tagKey('Villain'),tagKey('villain'));
  assert.equal(cleanTagName('##Big   Bad  '),'Big Bad');
  assert.equal(cleanTagName('#'),'');
  assert.equal(cleanTagName('x'.repeat(50)).length,40);
});

test('findTag matches by tagKey', () => {
  const lib=withTags('Villain','Act 2');
  assert.equal(findTag(lib,'#VILLAIN').id,'t1');
  assert.equal(findTag(lib,'act   2').id,'t2');
  assert.equal(findTag(lib,'goblin'),undefined);
});

test('create rejects duplicate names case-insensitively and empty names', () => {
  const lib=withTags('Villain');
  assert.throws(()=>applyTagAction(lib,{action:'create',id:'t9',name:'VILLAIN',color:'red'}),/already a tag called/);
  assert.throws(()=>applyTagAction(lib,{action:'create',id:'t9',name:'#   ',color:'red'}),/Give the tag a name/);
  assert.throws(()=>applyTagAction(lib,{action:'create',id:'t9',name:'',color:'red'}),/Give the tag a name/);
});

test('create with the same id twice is a no-op', () => {
  const once=create(emptyTags(),'t1','Villain');
  const twice=run(once,{action:'create',id:'t1',name:'Villain',color:'red'});
  assert.deepEqual(twice,once);
  assert.equal(twice.tags.length,1);
});

test('add puts a tag on a target without duplicates and rejects unknown tags', () => {
  let lib=withTags('Villain');
  lib=run(lib,{action:'add',target:'entry:p1',tagId:'t1'});
  lib=run(lib,{action:'add',target:'entry:p1',tagId:'t1'});
  assert.deepEqual(lib.on,{'entry:p1':['t1']});
  assert.throws(()=>applyTagAction(lib,{action:'add',target:'entry:p1',tagId:'nope'}),/no longer exists/);
});

test('add stops at 30 tags on one item', () => {
  let lib=emptyTags();
  for(let i=0;i<31;i++) lib=create(lib,'t'+i,'Tag '+i,'slate');
  for(let i=0;i<30;i++) lib=run(lib,{action:'add',target:'entry:big',tagId:'t'+i});
  assert.equal(lib.on['entry:big'].length,30);
  assert.throws(()=>applyTagAction(lib,{action:'add',target:'entry:big',tagId:'t30'}),/up to 30/);
});

test('remove takes a tag off several targets and drops empty keys', () => {
  let lib=withTags('Villain','Act 2');
  lib={...lib,on:{'entry:a':['t1','t2'],'scene:s1':['t1'],'campaign:e:e1':['t2']}};
  lib=run(lib,{action:'remove',targets:['entry:a','scene:s1','campaign:e:e1'],tagId:'t1'});
  assert.deepEqual(lib.on,{'entry:a':['t2'],'campaign:e:e1':['t2']});
  lib=run(lib,{action:'remove',targets:['entry:a','entry:missing'],tagId:'t2'});
  assert.deepEqual(lib.on,{'campaign:e:e1':['t2']});
});

test('rename refuses a clash and says to use Merge, allows keeping its own name', () => {
  const lib=withTags('Villain','Boss');
  assert.throws(()=>applyTagAction(lib,{action:'rename',tagId:'t1',name:'boss'}),/Merge/);
  assert.throws(()=>applyTagAction(lib,{action:'rename',tagId:'t1',name:'  '}),/Give the tag a name/);
  const same=run(lib,{action:'rename',tagId:'t1',name:'Villain'});
  assert.equal(same.tags[0].name,'Villain');
  const cased=run(lib,{action:'rename',tagId:'t1',name:'#VILLAIN  '});
  assert.equal(cased.tags[0].name,'VILLAIN');
});

test('recolor changes the colour and rejects unknown tags', () => {
  const lib=withTags('Villain');
  assert.equal(run(lib,{action:'recolor',tagId:'t1',color:'teal'}).tags[0].color,'teal');
  assert.throws(()=>applyTagAction(lib,{action:'recolor',tagId:'nope',color:'teal'}),/no longer exists/);
});

test('merge moves assignments, avoids duplicates and removes the source tag', () => {
  let lib=withTags('Villain','Boss');
  lib={...lib,on:{'entry:a':['t1'],'entry:b':['t1','t2'],'scene:s1':['t2']}};
  lib=run(lib,{action:'merge',from:'t1',into:'t2'});
  assert.deepEqual(lib.tags.map(t=>t.id),['t2']);
  assert.deepEqual(lib.on,{'entry:a':['t2'],'entry:b':['t2'],'scene:s1':['t2']});
  assert.throws(()=>applyTagAction(lib,{action:'merge',from:'t2',into:'t2'}),/different tag/);
});

test('delete removes a tag everywhere and drops empty keys', () => {
  let lib=withTags('Villain','Boss');
  lib={...lib,on:{'entry:a':['t1'],'entry:b':['t1','t2']}};
  lib=run(lib,{action:'delete',tagId:'t1'});
  assert.deepEqual(lib.tags.map(t=>t.id),['t2']);
  assert.deepEqual(lib.on,{'entry:b':['t2']});
  assert.throws(()=>applyTagAction(lib,{action:'delete',tagId:'t1'}),/no longer exists/);
});

test('every action produces a library that passes tagLibrarySchema', () => {
  let lib=emptyTags();
  lib=run(lib,{action:'create',id:'t1',name:'Villain',color:'red'});
  lib=run(lib,{action:'create',id:'t2',name:'Boss',color:'blue'});
  lib=run(lib,{action:'add',target:'entry:p1',tagId:'t1'});
  lib=run(lib,{action:'add',target:'campaign:e:e1',tagId:'t2'});
  lib=run(lib,{action:'remove',targets:['entry:p1'],tagId:'t1'});
  lib=run(lib,{action:'rename',tagId:'t1',name:'Foe'});
  lib=run(lib,{action:'recolor',tagId:'t1',color:'pink'});
  lib=run(lib,{action:'add',target:'scene:s1',tagId:'t1'});
  lib=run(lib,{action:'merge',from:'t1',into:'t2'});
  lib=run(lib,{action:'delete',tagId:'t2'});
  assert.deepEqual(lib,{tags:[],on:{}});
});

test('tagsOn combines two keys without repeats, in the order tags were added', () => {
  const lib={...withTags('Villain','Act 2','Shop'),on:{'campaign:e:e1':['t1','t2'],'campaign:m:c1':['t2','t3']}};
  assert.deepEqual(tagsOn(lib,'campaign:e:e1','campaign:m:c1').map(t=>t.name),['Villain','Act 2','Shop']);
  assert.deepEqual(tagsOn(lib,'entry:none'),[]);
});

test('tagUses counts targets and kinds per tag', () => {
  const lib={...withTags('Villain','Act 2','Unused'),on:{'entry:p1':['t1','t2'],'scene:s1':['t1'],'campaign:e:e1':['t1']}};
  const uses=tagUses(lib);
  assert.equal(uses.get('t1').count,3);
  assert.deepEqual([...uses.get('t1').kinds].sort(),['campaign','entry','scene']);
  assert.equal(uses.get('t2').count,1);
  assert.deepEqual([...uses.get('t2').kinds],['entry']);
  assert.equal(uses.get('t3').count,0);
  assert.equal(uses.get('t3').kinds.size,0);
});

test('kindsLabel names the kinds in a fixed order', () => {
  assert.equal(kindsLabel(new Set(['entry','scene','campaign'])),'Pages, maps, campaigns');
  assert.equal(kindsLabel(new Set(['scene'])),'Maps');
  assert.equal(kindsLabel(new Set(['campaign','entry'])),'Pages, campaigns');
  assert.equal(kindsLabel(new Set()),'');
});

test('targetsWith returns only targets that have every given tag', () => {
  const lib={...withTags('Villain','Act 2'),on:{'entry:p1':['t1','t2'],'scene:s1':['t1'],'entry:p2':['t2']}};
  assert.deepEqual(targetsWith(lib,['t1','t2']),['entry:p1']);
  assert.deepEqual(targetsWith(lib,['t1']).sort(),['entry:p1','scene:s1']);
  assert.deepEqual(targetsWith(lib,[]),[]);
});

test('campaignTargets lists every key a campaign row may use, once each', () => {
  assert.deepEqual(campaignTargets({key:'e:e1',maptable:{id:'c1'},encyclopedia:{id:'e1'}}),['campaign:e:e1','campaign:m:c1']);
  assert.deepEqual(campaignTargets({key:'m:c1',maptable:{id:'c1'},encyclopedia:null}),['campaign:m:c1']);
  assert.deepEqual(campaignTargets({key:'e:e1',maptable:null,encyclopedia:{id:'e1'}}),['campaign:e:e1']);
});

test('parseTagQuery splits tags from words', () => {
  assert.deepEqual(parseTagQuery('#villain goblin #act-2'),{tags:['villain','act 2'],words:'goblin'});
  assert.deepEqual(parseTagQuery('  just words  '),{tags:[],words:'just words'});
});

test('partialTag reads the tag being typed at the end of the query', () => {
  assert.equal(partialTag('#vil'),'vil');
  assert.equal(partialTag('foo #'),'');
  assert.equal(partialTag('foo'),null);
  assert.equal(partialTag('foo #done bar'),null);
});

test('suggestTags puts starts-with matches before word and contains matches', () => {
  const lib=withTags('Angoblin','Bob the Gobbler','Goblin','Dragon');
  assert.deepEqual(suggestTags(lib,'gob').map(t=>t.name),['Goblin','Bob the Gobbler','Angoblin']);
  assert.deepEqual(suggestTags(lib,'gob',2).map(t=>t.name),['Goblin','Bob the Gobbler']);
  assert.deepEqual(suggestTags(lib,'  ').map(t=>t.name).length,4);
});

test('importCharacterTags creates tags once, reuses existing ones case-insensitively, and is a no-op the second time', () => {
  let n=0;const makeId=()=>'id'+(++n);
  const entries=[{id:'e1',character:{tags:['Goblin','goblin ','  ']}},{id:'e2',character:{tags:['GOBLIN']}}];
  const first=importCharacterTags(emptyTags(),entries,makeId);
  tagLibrarySchema.parse(first);
  assert.equal(first.imported,true);
  assert.deepEqual(first.tags,[{id:'id1',name:'Goblin',color:'red'}]);
  assert.deepEqual(first.on,{'entry:e1':['id1'],'entry:e2':['id1']});
  assert.equal(n,1);
  const second=importCharacterTags(first,entries,makeId);
  assert.deepEqual(second,first);
  assert.equal(n,1);

  const existing={tags:[{id:'x',name:'goblin',color:'blue'}],on:{}};
  const reused=importCharacterTags(existing,[{id:'e1',character:{tags:['GOBLIN']}}],makeId);
  assert.deepEqual(reused.tags,existing.tags);
  assert.deepEqual(reused.on,{'entry:e1':['x']});
  assert.equal(n,1);
});

test('tags-server: changeTags and tagAction save at tagsKey(owner) and read back', async () => {
  const b=new Bucket();
  assert.equal(tagsKey('owner-1'),'users/owner-1/tags.json');
  assert.equal(tagsKey('a/b c'),'users/a%2Fb%20c/tags.json');
  const lib=await tagAction(b,'owner-1',{action:'create',id:'t1',name:'Villain',color:'red'});
  assert.deepEqual(lib.tags,[{id:'t1',name:'Villain',color:'red'}]);
  const stored=JSON.parse(b.data.get(tagsKey('owner-1')).text);
  assert.deepEqual(stored,lib);
  const read=await readTags(b,'owner-1');
  assert.deepEqual(read.data,lib);
  assert.ok(read.etag);
  assert.deepEqual((await readTags(b,'nobody')).data,emptyTags());
  assert.equal((await readTags(b,'nobody')).etag,null);
});

test('tags-server: tagsWithImport imports once and does not call the book loader again', async () => {
  const b=new Bucket();
  let loads=0;
  const book=async()=>{loads++;return {entries:[{id:'e1',character:{tags:['Villain','#Act 2']}},{id:'e2',character:{tags:['villain']}}]};};
  const first=await tagsWithImport(b,'owner-1',book);
  assert.equal(loads,1);
  assert.equal(first.imported,true);
  assert.deepEqual(first.tags.map(t=>t.name),['Villain','Act 2']);
  assert.deepEqual(first.on,{'entry:e1':[first.tags[0].id,first.tags[1].id],'entry:e2':[first.tags[0].id]});
  const second=await tagsWithImport(b,'owner-1',book);
  assert.equal(loads,1);
  assert.deepEqual(second,first);
});

test('tags-server: changeTags retries when the etag changed in between', async () => {
  const b=new Bucket();
  await tagAction(b,'owner-1',{action:'create',id:'t1',name:'A',color:'red'});
  const realPut=b.put.bind(b);
  let puts=0;
  b.put=async(key,text,options)=>{
    puts++;
    if(puts===1){
      // Another tab saves first, so this save's etag is out of date.
      await realPut(key,JSON.stringify({tags:[{id:'t9',name:'Other',color:'green'}],on:{}}),{});
      return null;
    }
    return realPut(key,text,options);
  };
  const lib=await changeTags(b,'owner-1',l=>applyTagAction(l,{action:'create',id:'t2',name:'B',color:'blue'}));
  assert.equal(puts,2);
  assert.deepEqual(lib.tags.map(t=>t.name),['Other','B']);
  assert.deepEqual((await readTags(b,'owner-1')).data,lib);
});

test('tags-server: changeTags gives up after repeated clashes', async () => {
  const b=new Bucket();
  b.put=async()=>null;
  await assert.rejects(()=>changeTags(b,'owner-1',l=>applyTagAction(l,{action:'create',id:'t1',name:'A',color:'red'})),/Reload and try again/);
});

test('tags-server: changeTags does not write when nothing changed', async () => {
  const b=new Bucket();
  let puts=0;const realPut=b.put.bind(b);
  b.put=async(...a)=>{puts++;return realPut(...a);};
  await changeTags(b,'owner-1',l=>l);
  assert.equal(puts,0);
  assert.equal(b.data.has(tagsKey('owner-1')),false);
});

const mapWs=()=>({collections:[{id:'c1',name:'Camp',kind:'campaign',parentId:null}],scenes:[{id:'s1',name:'Cave',containerId:'c1'}]});
const bookWs=(extra={})=>{
  const w=emptyWorkspace();
  w.worlds.push({id:'w1',name:'Ashenwood',description:'',archived:false});
  w.campaigns.push({id:'e1',worldId:'w1',name:'Sunless Citadel',description:'',github:{repository:'',branch:'main'},maptableCampaignId:'c1',...extra});
  w.entries.push({id:'p1',worldId:'w1',campaignId:'e1',parentId:null,title:'Goblin Lair',kind:'place',body:'',updatedAt:'2026-03-01T00:00:00.000Z'});
  w.entries.push({id:'p2',worldId:'w1',campaignId:null,parentId:null,title:'Gods',kind:'lore',body:'',updatedAt:'2026-03-01T00:00:00.000Z'});
  return w;
};

test('describeTagged describes entries, scenes and campaigns with the right links', () => {
  const lib={...withTags('Villain','Dungeon'),on:{
    'entry:p1':['t1'],
    'entry:p2':['t2'],
    'scene:s1':['t2'],
    'campaign:e:e1':['t1'],
  }};
  const items=describeTagged(lib,mapWs(),bookWs());
  assert.deepEqual(items.map(i=>i.title),['Cave','Goblin Lair','Gods','Sunless Citadel']);
  const by=t=>items.find(i=>i.title===t);
  assert.equal(by('Goblin Lair').href,'/encyclopedia?entry=p1');
  assert.equal(by('Goblin Lair').kind,'entry');
  assert.equal(by('Goblin Lair').detail,'Place · Sunless Citadel');
  assert.equal(by('Gods').detail,'Lore · World lore');
  assert.equal(by('Cave').href,'/maptable?scene=s1');
  assert.equal(by('Cave').detail,'Scene in Maptable · Camp');
  assert.equal(by('Sunless Citadel').href,'/campaigns/e%3Ae1');
  assert.equal(by('Sunless Citadel').kind,'campaign');
  assert.deepEqual(by('Gods').tagIds,['t2']);
});

test('describeTagged skips missing targets and tags that are on nothing', () => {
  const lib={...withTags('Villain'),on:{
    'entry:ghost':['t1'],
    'scene:ghost':['t1'],
    'campaign:e:ghost':['t1'],
    'campaign:m:ghost':['t1'],
    'entry:p1':[],
  }};
  assert.deepEqual(describeTagged(lib,mapWs(),bookWs()),[]);
  // With no Maptable data, scene tags are skipped too.
  const onlyScene={...withTags('Villain'),on:{'scene:s1':['t1']}};
  assert.deepEqual(describeTagged(onlyScene,null,bookWs()),[]);
});

test('describeTagged shows a campaign once, with tags from both of its keys', () => {
  const lib={...withTags('Villain','Dungeon'),on:{
    'campaign:e:e1':['t1'],
    'campaign:m:c1':['t2','t1'],
  }};
  const items=describeTagged(lib,mapWs(),bookWs());
  const campaigns=items.filter(i=>i.kind==='campaign');
  assert.equal(campaigns.length,1);
  assert.equal(campaigns[0].title,'Sunless Citadel');
  assert.deepEqual([...campaigns[0].tagIds].sort(),['t1','t2']);
});

test('leading spaces before # are dropped', () => {
  assert.equal(cleanTagName('  #Act Two'), 'Act Two');
  assert.equal(tagKey('  #Act   Two '), 'act two');
});
