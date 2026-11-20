import test from 'node:test';
import assert from 'node:assert/strict';
const M=await import('../lib/encyclopedia/world-model.ts');
const {newMap}=await import('../lib/encyclopedia/map-model.ts');
const {workspaceSchema,campaignLoreWorldIds,visibleEntries,playerCampaign,campaignExport,setWorldLink,withoutWorldLinks,importCopy,resolveLink}=M;
const {applyCoGmEdit,CoGmEditError}=await import('../lib/encyclopedia/co-gm-edit.ts');
const {questsIn}=await import('../lib/encyclopedia/quests.ts');
const {linkSuggestions}=await import('../lib/encyclopedia/page-tree.ts');

const T='2026-11-20T10:00:00.000Z';
const page=(id,worldId,campaignId,title,extra={})=>({id,worldId,campaignId,parentId:null,title,kind:'note',body:'',updatedAt:T,...extra});
const gh={repository:'',branch:'main'};
// Two worlds. "salt" holds the campaign; "golarion" is linked to it. "elsewhere" is not.
function ws(link=['golarion']){
 return workspaceSchema.parse({schemaVersion:1,
  worlds:['salt','golarion','elsewhere'].map(id=>({id,name:id==='salt'?'The Salt Coast':id==='golarion'?'Golarion':'Elsewhere',description:'',archived:false})),
  campaigns:[{id:'c1',worldId:'salt',name:'Salt Road',description:'',github:gh,...(link?{linkedWorldIds:link}:{})},{id:'c2',worldId:'golarion',name:'Other',description:'',github:gh}],
  entries:[
   page('s-lore','salt',null,'Salt lore',{overviewVisibility:'players',body:'Open'}),
   page('g-open','golarion',null,'Absalom',{overviewVisibility:'players',body:'City of the Starstone ::: secret\nhidden\n:::'.replace('::: secret','\n::: secret')}),
   page('g-gm','golarion',null,'GM only lore',{body:'secret plans'}),
   page('g-tab','golarion',null,'Tabbed',{overviewVisibility:'players',body:'x',tabs:[{id:'t1',title:'Private',body:'nope',visibility:'gm'},{id:'t2',title:'Public',body:'yes',visibility:'players'}]}),
   page('g-camp','golarion','c2','Other campaign page',{overviewVisibility:'players',body:'not for c1'}),
   page('e-lore','elsewhere',null,'Unlinked',{overviewVisibility:'players'}),
  ]});
}

test('the helper returns the own world then valid linked worlds, with stale ids ignored',()=>{
 const s=ws(),c=s.campaigns[0];
 assert.deepEqual(campaignLoreWorldIds(s,c),['salt','golarion']);
 assert.deepEqual(campaignLoreWorldIds(s,{...c,linkedWorldIds:undefined}),['salt']);
 assert.deepEqual(campaignLoreWorldIds(s,{...c,linkedWorldIds:['gone','golarion','golarion','salt']}),['salt','golarion'],'unknown, repeated and own ids are ignored');
 const archived={...s,worlds:s.worlds.map(w=>w.id==='golarion'?{...w,archived:true}:w)};
 assert.deepEqual(campaignLoreWorldIds(archived,c),['salt'],'an archived world shows nothing');
 const tpl={...s,worlds:s.worlds.map(w=>w.id==='golarion'?{...w,isTemplate:true}:w)};
 assert.deepEqual(campaignLoreWorldIds(tpl,c),['salt']);
});

test('the schema keeps old saves valid and refuses bad links',()=>{
 assert.ok(ws(null).campaigns[0].linkedWorldIds===undefined);
 const base=ws(),bad=l=>workspaceSchema.safeParse({...base,campaigns:[{...base.campaigns[0],linkedWorldIds:l},base.campaigns[1]]}).success;
 assert.equal(bad(['golarion']),true);
 assert.equal(bad(['salt']),false,'never its own world');
 assert.equal(bad(['golarion','golarion']),false,'no duplicates');
 assert.equal(bad(Array.from({length:13},(_,i)=>`w${i}`)),false,'at most 12');
});

test('visible entries add linked shared lore only, and only inside the campaign',()=>{
 const s=ws(),ids=l=>l.map(e=>e.id).sort();
 assert.deepEqual(ids(visibleEntries(s,'salt','c1')),['g-gm','g-open','g-tab','s-lore']);
 assert.deepEqual(ids(visibleEntries(s,'salt',null)),['s-lore'],'the world view stays the world');
 assert.deepEqual(ids(visibleEntries(s,'golarion',null)),['g-gm','g-open','g-tab']);
 assert.deepEqual(ids(visibleEntries(ws(null),'salt','c1')),['s-lore'],'no links, no change');
});

test('links and suggestions resolve linked lore from the campaign',()=>{
 const s=ws(),from=page('n','salt','c1','Session');
 assert.equal(resolveLink(s,from,'Absalom')?.id,'g-open');
 assert.equal(resolveLink(s,from,'Unlinked'),undefined);
 assert.ok(linkSuggestions({...s,entries:[...s.entries,from]},from,'abs').some(x=>x.entry.id==='g-open'));
 assert.equal(questsIn(s,'salt','c1').length,0);
});

test('setWorldLink toggles, never links the own world, caps at 12, and unlinking removes the field',()=>{
 let s=ws(null);
 s=setWorldLink(s,'c1','golarion',true);assert.deepEqual(s.campaigns[0].linkedWorldIds,['golarion']);
 assert.equal(setWorldLink(s,'c1','salt',true).campaigns[0].linkedWorldIds.includes('salt'),false);
 assert.deepEqual(setWorldLink(s,'c1','golarion',true).campaigns,s.campaigns,'already on is a no-op');
 s=setWorldLink(s,'c1','golarion',false);assert.equal('linkedWorldIds' in s.campaigns[0],false);
 assert.equal(s.entries.length,ws(null).entries.length,'unlinking moves nothing');
 assert.deepEqual(withoutWorldLinks(ws(),'golarion').campaigns[0].linkedWorldIds,undefined);
});

test('player data includes a linked world\'s player-visible lore with the same filtering as the own world',()=>{
 const p=playerCampaign(ws(),'c1'),by=new Map(p.entries.map(e=>[e.id,e]));
 assert.ok(by.has('s-lore')&&by.has('g-open'),'player-visible pages appear');
 assert.equal(by.has('g-gm'),false,'a GM-only page in the linked world is not sent');
 assert.equal(by.has('g-camp'),false,'another campaign\'s page in that world is not sent');
 assert.equal(by.has('e-lore'),false,'an unlinked world is not sent');
 const text=JSON.stringify(p);
 assert.equal(/secret plans|hidden|nope/.test(text),false,'secrets, GM pages and private tabs never reach players');
 assert.deepEqual(by.get('g-tab').tabs.map(t=>t.title),['Overview','Public']);
 assert.equal(p.world.name,'The Salt Coast');
});

test('an unlinked or archived link sends nothing from that world',()=>{
 assert.equal(playerCampaign(ws(null),'c1').entries.some(e=>e.id==='g-open'),false);
 const s=ws(),archived={...s,worlds:s.worlds.map(w=>w.id==='golarion'?{...w,archived:true}:w)};
 assert.equal(playerCampaign(archived,'c1').entries.some(e=>e.id==='g-open'),false);
});

test('a masked map in linked lore keeps the same masking as the own world',()=>{
 const s=ws(),map=(id,worldId)=>page(id,worldId,null,'Map '+id,{kind:'map',overviewVisibility:'players',mapData:{...newMap('world'),visibility:'players',pins:[{id:'gm-pin-'+id,title:'HIDDEN-PIN',x:.3,y:.5,notes:'HIDDEN-NOTE',entryId:null,visibility:'gm'}]}});
 const parsed=workspaceSchema.safeParse({...s,entries:[...s.entries,map('m-own','salt'),map('m-linked','golarion')]});
 assert.ok(parsed.success,parsed.success?'':JSON.stringify(parsed.error.issues.slice(0,2)));
 const by=new Map(playerCampaign(parsed.data,'c1').entries.map(e=>[e.id,e]));
 assert.deepEqual(Object.keys(by.get('m-linked').mapData).sort(),Object.keys(by.get('m-own').mapData).sort());
 assert.equal(/HIDDEN-PIN|HIDDEN-NOTE/.test(JSON.stringify([...by.values()])),false,'GM-only map details never reach players');
});

test('exports keep the link but only include linked lore when asked; the agent export stays campaign-scoped',()=>{
 const s=ws(),plain=campaignExport(s,'c1');
 assert.deepEqual(plain.worlds.map(w=>w.id),['salt']);
 assert.equal(plain.entries.some(e=>e.worldId==='golarion'),false);
 assert.deepEqual(plain.campaigns[0].linkedWorldIds,['golarion']);
 const linked=campaignExport(s,'c1',{linked:true});
 assert.deepEqual(linked.worlds.map(w=>w.id),['salt','golarion']);
 assert.deepEqual(linked.entries.map(e=>e.id).sort(),['g-gm','g-open','g-tab','s-lore']);
});

test('importing a copy remaps linked worlds that came along and drops the rest',()=>{
 const s=ws(),out=importCopy({schemaVersion:1,worlds:[],campaigns:[],entries:[]},campaignExport(s,'c1',{linked:true}));
 const c=out.campaigns[0];
 assert.equal(c.linkedWorldIds.length,1);
 assert.ok(out.worlds.some(w=>w.id===c.linkedWorldIds[0]&&/Golarion/.test(w.name)));
 const lone=importCopy({schemaVersion:1,worlds:[],campaigns:[],entries:[]},campaignExport(s,'c1'));
 assert.equal('linkedWorldIds' in lone.campaigns[0],false,'a link to a world that did not come along is dropped');
});

test('a co-GM sees linked lore, keeps the link, and cannot change linked pages',()=>{
 const full=ws(),mine=()=>structuredClone(campaignExport(full,'c1',{linked:true}));
 assert.ok(mine().entries.some(e=>e.id==='g-gm'),'a co-GM reads linked GM notes like their own world\'s');
 const ok=mine();ok.entries=ok.entries.map(e=>e.id==='s-lore'?{...e,body:'Edited'}:e);
 const next=applyCoGmEdit(full,'c1',ok);
 assert.deepEqual(next.campaigns[0].linkedWorldIds,['golarion']);
 assert.equal(next.entries.find(e=>e.id==='s-lore').body,'Edited');
 const edit=mine();edit.entries=edit.entries.map(e=>e.id==='g-open'?{...e,body:'Changed'}:e);
 assert.throws(()=>applyCoGmEdit(full,'c1',edit),e=>e instanceof CoGmEditError&&/linked/i.test(e.message));
 const del=mine();del.entries=del.entries.filter(e=>e.id!=='g-open');
 assert.throws(()=>applyCoGmEdit(full,'c1',del),e=>e instanceof CoGmEditError);
 const relink=mine();relink.campaigns[0]={...relink.campaigns[0],linkedWorldIds:[]};
 assert.throws(()=>applyCoGmEdit(full,'c1',relink),e=>e instanceof CoGmEditError);
 const gm=mine();gm.entries=gm.entries.filter(e=>e.id!=='g-gm');
 assert.throws(()=>applyCoGmEdit(full,'c1',gm),e=>e instanceof CoGmEditError);
});
