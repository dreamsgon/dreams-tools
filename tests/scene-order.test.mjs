import test from 'node:test';
import assert from 'node:assert/strict';
import {scenesInOrder,neighbourScene} from '../lib/scene-order.ts';
import {parseNavigationState} from '../lib/navigation-state.ts';

const s=(id,containerId)=>({id,name:id,containerId});
const w={collections:[
 {id:'camp',name:'Citadel',kind:'campaign',parentId:null},
 {id:'act1',name:'Act 1',kind:'folder',parentId:'camp'},
 {id:'act2',name:'Act 2',kind:'folder',parentId:'camp'},
 {id:'deep',name:'Cellars',kind:'folder',parentId:'act2'},
 {id:'other',name:'One-shots',kind:'campaign',parentId:null},
],scenes:[s('world','camp'),s('gate','act2'),s('village','act1'),s('cellar','deep'),s('ambush','act1'),s('cave','other'),s('loose',null)]};

test('scenes follow the panel order: subfolders first, then the folder’s own scenes',()=>{
  assert.deepEqual(scenesInOrder(w,'camp').map(i=>i.scene.id),['village','ambush','cellar','gate','world']);
  assert.deepEqual(scenesInOrder(w,'camp').find(i=>i.scene.id==='cellar').folders.map(f=>f.name),['Act 2','Cellars']);
  assert.deepEqual(scenesInOrder(w,null).map(i=>i.scene.id),['loose'],'other campaigns are left out');
});

test('previous and next wrap round inside the campaign',()=>{
  assert.equal(neighbourScene(w,'camp','ambush',1).id,'cellar');
  assert.equal(neighbourScene(w,'camp','village',-1).id,'world');
  assert.equal(neighbourScene(w,'camp','world',1).id,'village');
  assert.equal(neighbourScene(w,null,'loose',1),null,'one scene has no neighbour');
});

test('the scene settings panel is remembered like the other panels',()=>{
  const base={version:1,dashboard:false,creatorOpen:false,sidebar:true,activeId:null,location:null,dashboardLocation:null,conditionLocation:null};
  assert.equal(parseNavigationState(JSON.stringify({...base,panel:'scene'})).panel,'scene');
  assert.equal(parseNavigationState(JSON.stringify({...base,panel:'nope'})),null);
});
