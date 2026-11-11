import test from 'node:test';
import assert from 'node:assert/strict';
import {newScene} from '../lib/model.ts';
import {snapCropToGrid} from '../lib/crop-snap.ts';
test('crop edges snap to offset grid lines and stay in map bounds',()=>{
 const s=newScene();s.grid.offsetX=15;s.grid.offsetY=-10;
 const r=snapCropToGrid({x:89,y:65,width:141,height:142},s);
 assert.deepEqual(r,{x:85,y:60,width:140,height:140});
 assert.deepEqual(snapCropToGrid({x:1399,y:999,width:1,height:1},s),{x:1345,y:970,width:55,height:30});
});
test('tiny drags yield a nonzero grid region and precise/non-square crop is preserved',()=>{
 const s=newScene();assert.deepEqual(snapCropToGrid({x:71,y:71,width:1,height:1},s),{x:70,y:70,width:70,height:70});
 const c={x:33.2,y:52.3,width:101.8,height:88.2};s.grid.type='hex-flat';assert.deepEqual(snapCropToGrid(c,s),c);
});
