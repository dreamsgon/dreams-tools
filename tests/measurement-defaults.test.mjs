import test from 'node:test';
import assert from 'node:assert/strict';
import {newScene,gridSchema,pathDistance} from '../lib/model.ts';
test('new and missing-scale grids default to five feet without overwriting custom scales',()=>{
 const scene=newScene();assert.equal(scene.grid.units,5);assert.equal(scene.grid.unit,'ft');
 const {units,unit,...legacy}=scene.grid;const parsed=gridSchema.parse(legacy);assert.equal(parsed.units,5);assert.equal(parsed.unit,'ft');
 const custom=gridSchema.parse({...scene.grid,units:2,unit:'m'});assert.equal(custom.units,2);assert.equal(custom.unit,'m');
 assert.equal(pathDistance([{x:0,y:0},{x:custom.size,y:0},{x:custom.size*2,y:custom.size}],custom),4);
});
