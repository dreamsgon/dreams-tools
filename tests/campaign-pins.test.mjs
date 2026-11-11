import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,workspaceSchema} from '../lib/model.ts';
test('campaign pins survive save and preserve folder membership',()=>{
 const w=initialWorkspace();w.collections=[{id:'folder',kind:'folder',name:'Games',parentId:null},{id:'game',kind:'campaign',name:'Game',parentId:'folder',pinned:true}];
 const restored=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
 assert.equal(restored.collections[1].pinned,true);assert.equal(restored.collections[1].parentId,'folder');
 restored.collections[1].pinned=false;assert.equal(workspaceSchema.parse(restored).collections[1].pinned,false);
});
test('legacy campaigns remain unpinned',()=>{const w=initialWorkspace();w.collections=[{id:'a',kind:'campaign',name:'A',parentId:null}];assert.equal(workspaceSchema.parse(w).collections[0].pinned,undefined);});
