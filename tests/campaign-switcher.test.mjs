import test from 'node:test';
import assert from 'node:assert/strict';
import {pinsFromHome,openedFromHome,pinPosition,isPinned,hasHalf,hubHref,rowDetail,matchesQuery,switcherItems,navigable,moveIndex,folderChain,isSwitcherShortcut} from '../lib/campaign-switcher.ts';

const book=(id,name,world,over={})=>({id,name,description:'',worldId:'w-'+world,worldName:world,archived:false,pages:3,characters:0,maptableCampaignId:null,lastEdited:null,maps:0,latest:[],...over});
const row=(key,name,{e=null,m=null,folderId=null}={})=>({key,name,maptable:m,encyclopedia:e,folderId});
const map=(id,scenes=2)=>({id,name:id,scenes});
const summary=()=>({
  folders:[{id:'f1',name:'Active',parentId:null},{id:'f2',name:'Old games',parentId:null},{id:'f3',name:'Ancient',parentId:'f2'}],
  rows:[
    row('e:a','Ash Road',{e:book('a','Ash Road','Thedas',{lastEdited:'2026-11-10'}),m:map('ma'),folderId:'f1'}),
    row('e:b','Bright Fen',{e:book('b','Bright Fen','Eberron',{lastEdited:'2026-11-14'}),folderId:'f1'}),
    row('e:c','Cinder Keep',{e:book('c','Cinder Keep','Thedas',{lastEdited:'2026-11-12'}),folderId:'f3'}),
    row('e:d','Dusk Isle',{e:book('d','Dusk Isle','Thedas',{lastEdited:'2026-11-01'})}),
    row('e:e','Ember Hall',{e:book('e','Ember Hall','Eberron',{lastEdited:'2026-11-02'})}),
    row('e:f','Frost Pass',{e:book('f','Frost Pass','Eberron',{lastEdited:'2026-11-03'})}),
    row('e:g','Gale Deep',{e:book('g','Gale Deep','Old World',{archived:true,lastEdited:'2026-11-15'})}),
    row('m:h','Hollow Maps',{m:map('h',0)}),
  ],
  recent:[],worlds:[],loose:0,
});
const labels=items=>items.map(i=>i.type==='heading'?`# ${i.label}`:i.type==='folder'?`[${i.folder.name}${i.open?'-':'+'} ${i.count}]`:i.row.name);

test('pins read from the home response, or none when it is missing or odd',()=>{
  assert.deepEqual(pinsFromHome({layout:{pinnedCampaigns:['e:a','m:h',7,'']}}),['e:a','m:h']);
  for(const bad of [null,undefined,{},{layout:{}},{layout:{pinnedCampaigns:'e:a'}},{layout:{pinnedCampaigns:[]}},{error:'Not found'},'x'])assert.equal(pinsFromHome(bad),null);
});

test('a row is pinned by its key or either half',()=>{
  const s=summary(),a=s.rows[0],h=s.rows[7];
  assert.equal(isPinned(a,['e:a']),true);
  assert.equal(isPinned(a,['m:ma']),true,'its Maptable half');
  assert.equal(isPinned(h,['m:h']),true);
  assert.equal(isPinned(h,['e:h']),false);
  assert.equal(isPinned(a,null),false);
  assert.equal(pinPosition(a,['m:zzz','m:ma','e:a']),1);
});

test('a campaign without a half for the tool goes to its hub',()=>{
  const s=summary();
  assert.equal(hasHalf('encyclopedia',s.rows[0]),true);
  assert.equal(hasHalf('encyclopedia',s.rows[7]),false);
  assert.equal(hasHalf('maptable',s.rows[0]),true);
  assert.equal(hasHalf('maptable',s.rows[1]),false,'notes only');
  assert.equal(hasHalf('maptable',s.rows[7]),true,'a Maptable campaign with no scenes yet still opens in Maptable');
  assert.equal(rowDetail('maptable',s.rows[7]),'No scenes yet');
  assert.equal(hubHref({key:'e:a b'}),'/campaigns/e%3Aa%20b');
  assert.equal(rowDetail('maptable',s.rows[1]),'No maps yet · Add maps');
  assert.equal(rowDetail('maptable',s.rows[0]),'2 scenes');
  assert.equal(rowDetail('encyclopedia',s.rows[0]),'Thedas · 3 pages');
});

test('search matches the campaign or its world, ignoring case',()=>{
  const s=summary();
  assert.equal(matchesQuery(s.rows[0],'  ASH '),true);
  assert.equal(matchesQuery(s.rows[0],'thedas'),true);
  assert.equal(matchesQuery(s.rows[1],'thedas'),false);
  assert.equal(matchesQuery(s.rows[0],''),true);
  assert.deepEqual(labels(switcherItems(s,{query:'thedas'})),['# 3 matches','Ash Road','Cinder Keep','Dusk Isle']);
  assert.deepEqual(labels(switcherItems(s,{query:'old world'})),['# 1 match','Gale Deep'],'archived campaigns can be found by search');
  assert.deepEqual(labels(switcherItems(s,{query:'nothing'})),['# 0 matches']);
});

test('pinned, recent (up to 4, not pinned) and folders in the Campaigns page order',()=>{
  const s=summary();
  const items=switcherItems(s,{pins:['e:d','m:ma','e:zzz']});
  assert.deepEqual(labels(items),['# Pinned','Dusk Isle','Ash Road',
    '# Recent','Bright Fen','Cinder Keep','Frost Pass','Ember Hall',
    '# Folders','[Active+ 2]','[Old games+ 1]',
    '# Not in a folder','Dusk Isle','Ember Hall','Frost Pass','Hollow Maps']);
  assert.equal(items.find(i=>i.type==='row'&&i.row.key==='e:d').pinned,true);
  const recent=items.slice(items.findIndex(i=>i.id==='h-recent')+1,items.findIndex(i=>i.id==='h-folders')).filter(i=>i.type==='row');
  assert.ok(recent.length<=4&&recent.every(i=>!i.pinned));
});

test('Recent lists the campaigns you opened last first; opened times come from the home layout',()=>{
  const s=summary(), at='2026-11-19T12:00:00.000Z';
  const recent=switcherItems(s,{opened:{'e:e':at}}).filter(i=>i.id.startsWith('r:'));
  assert.equal(recent[0].row.key,'e:e');
  assert.deepEqual(openedFromHome({layout:{opened:{'e:a':at,'m:b':7}}}),{'e:a':at});
  for(const bad of [null,{},{layout:{}},{layout:{opened:[]}},{layout:{opened:{}}}])assert.equal(openedFromHome(bad),undefined);
});

test('without pins the Pinned section is left out; folders expand and nest',()=>{
  const s=summary();
  assert.equal(labels(switcherItems(s,{pins:null})).includes('# Pinned'),false);
  const open=labels(switcherItems(s,{expanded:new Set(['f1','f2','f3'])}));
  const from=open.indexOf('# Folders');
  assert.deepEqual(open.slice(from,from+8),['# Folders','[Active- 2]','Ash Road','Bright Fen','[Old games- 1]','[Ancient- 1]','Cinder Keep','# Not in a folder']);
  const nested=switcherItems(s,{expanded:new Set(['f2','f3'])}).find(i=>i.type==='row'&&i.row.key==='e:c'&&i.id.startsWith('c:'));
  assert.equal(nested.depth,2);
  const flat=labels(switcherItems({...s,folders:[]},{pins:null}));
  assert.ok(flat.includes('# All campaigns')&&!flat.includes('# Folders'));
  assert.deepEqual(labels(switcherItems({...s,rows:[],folders:[]})),[]);
});

test('arrow keys move over campaigns and folders, skip headings, and wrap',()=>{
  const items=switcherItems(summary(),{pins:['e:a']}),nav=navigable(items);
  assert.ok(nav.every(i=>items[i].type!=='heading'));
  assert.equal(nav.length,items.filter(i=>i.type!=='heading').length);
  assert.equal(moveIndex(-1,'ArrowDown',5),0);
  assert.equal(moveIndex(-1,'ArrowUp',5),4);
  assert.equal(moveIndex(4,'ArrowDown',5),0);
  assert.equal(moveIndex(0,'ArrowUp',5),4);
  assert.equal(moveIndex(2,'ArrowDown',5),3);
  assert.equal(moveIndex(2,'Home',5),0);
  assert.equal(moveIndex(2,'End',5),4);
  assert.equal(moveIndex(7,'x',5),4,'stays inside a shorter list');
  assert.equal(moveIndex(0,'ArrowDown',0),-1);
});

test('the folder holding the current campaign opens first; Ctrl/Cmd+Shift+O is the shortcut',()=>{
  const s=summary();
  assert.deepEqual(folderChain(s.folders,'f3'),['f3','f2']);
  assert.deepEqual(folderChain(s.folders,null),[]);
  assert.deepEqual(folderChain(s.folders,'gone'),[]);
  const key=(over)=>({key:'O',ctrlKey:true,metaKey:false,shiftKey:true,altKey:false,...over});
  assert.equal(isSwitcherShortcut(key({})),true);
  assert.equal(isSwitcherShortcut(key({key:'o',ctrlKey:false,metaKey:true})),true);
  assert.equal(isSwitcherShortcut(key({shiftKey:false})),false);
  assert.equal(isSwitcherShortcut(key({key:'k'})),false);
  assert.equal(isSwitcherShortcut(key({altKey:true})),false);
});
