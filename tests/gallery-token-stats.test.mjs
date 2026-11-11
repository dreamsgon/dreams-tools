import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,newToken} from '../lib/model.ts';
import {saveTokenStatsToGallery} from '../lib/gallery-token-stats.ts';
test('saving reusable stats preserves saved identity, appearance, folders and condition ages',()=>{
 const w=initialWorkspace(),saved={...newToken('Saved'),assetId:'portrait',x:123,conditions:['old'],conditionRounds:{old:2}};
 w.tokenLibrary=[saved];w.tokenFolderLocations[saved.id]=null;
 const placed={...newToken('Placed'),ac:19,dc:16,passivePerception:14,tempHp:8,hp:21,maxHp:30,initiative:12,notes:'Statblock',showAc:true,conditionRounds:{new:7},conditions:['new']};
 saveTokenStatsToGallery(w,placed,saved.id);
 assert.equal(saved.ac,19);assert.equal(saved.hp,21);assert.equal(saved.notes,'Statblock');assert.equal(saved.name,'Saved');assert.equal(saved.assetId,'portrait');assert.equal(saved.x,123);assert.deepEqual(saved.conditions,['old']);assert.deepEqual(saved.conditionRounds,{old:2});
 placed.ac=undefined;saveTokenStatsToGallery(w,placed,saved.id);assert.equal(saved.ac,undefined);
 assert.throws(()=>saveTokenStatsToGallery(w,placed,'missing'));
});
