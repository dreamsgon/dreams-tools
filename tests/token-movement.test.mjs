import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, pathDistance, snap, newToken } from '../lib/model.ts';
import { tokenDragPosition, startTokenMovePlan, appendTokenMovePoint, undoTokenMovePoint, tokenMovePlanValid, tokenMovePlanDestination } from '../lib/token-movement.ts';
const grid = initialWorkspace().scenes[0].grid;
test('off-center token grab tracks its center and respects large footprints and grid offsets', () => {
  const g = {...grid, type:'square', size:50, offsetX:10, offsetY:20, snap:true};
  const original = {x:60,y:70}, grab = {x:77,y:81};
  assert.deepEqual(tokenDragPosition(original,grab,{x:127,y:131},g,2),{x:110,y:120});
  assert.deepEqual(tokenDragPosition(original,grab,{x:134,y:137},{...g,snap:false},2),{x:117,y:126});
  assert.deepEqual(original,{x:60,y:70});
});
test('hex token drag snaps the center rather than the pointer', () => {
  for (const type of ['hex-flat','hex-pointy']) {
    const g = {...grid,type,snap:true};
    assert.deepEqual(tokenDragPosition({x:100,y:100},{x:120,y:110},{x:220,y:160},g,3),snap({x:200,y:150},g,3));
  }
});
test('waypoint routes preserve alternating diagonal costs across segments and scene units', () => {
  const g = {...grid,type:'square',size:50,units:5,diagonal:'alternating'};
  const origin = {x:25,y:25};
  const first = tokenDragPosition(origin,origin,{x:75,y:75},g);
  const last = tokenDragPosition(origin,origin,{x:125,y:125},g);
  assert.equal(pathDistance([origin,first,last],g),15);
  assert.equal(pathDistance([origin,first,last],{...g,diagonal:'equal'}),10);
  assert.ok(Math.abs(pathDistance([origin,first,last],{...g,diagonal:'euclidean'})-10*Math.SQRT2)<1e-8);
});

test('tap planner appends corners without moving scene tokens, undoes, and resolves only an explicit final destination', () => {
  const scene = initialWorkspace().scenes[0];
  scene.grid = {...scene.grid,type:'square',snap:true,size:50,units:5,diagonal:'alternating'};
  scene.tokens = [{...newToken(),id:'plan-token',x:25,y:25,size:1}];
  let plan = startTokenMovePlan(scene.id,scene.tokens[0]);
  assert.equal(tokenMovePlanDestination(plan,scene),null);
  plan = appendTokenMovePoint(plan,{x:75,y:25},scene.grid,scene);
  plan = appendTokenMovePoint(plan,{x:75,y:125},scene.grid,scene);
  plan = appendTokenMovePoint(plan,{x:175,y:125},scene.grid,scene);
  assert.deepEqual(plan.points,[{x:25,y:25},{x:75,y:25},{x:75,y:125},{x:175,y:125}]);
  assert.equal(pathDistance(plan.points,scene.grid),25);
  assert.deepEqual({x:scene.tokens[0].x,y:scene.tokens[0].y},{x:25,y:25});
  assert.deepEqual(tokenMovePlanDestination(plan,scene),{x:175,y:125});
  const undone = undoTokenMovePoint(plan);
  assert.deepEqual(tokenMovePlanDestination(undone,scene),{x:75,y:125});
  assert.equal(plan.points.length,4);
  assert.equal(appendTokenMovePoint(plan,{x:175,y:125},scene.grid,scene),plan);
});
test('planner rejects stale tokens and scenes at commit time', () => {
  const scene = initialWorkspace().scenes[0];
  scene.tokens = [{...newToken(),id:'plan-token',x:25,y:25,size:1}];
  const plan = appendTokenMovePoint(startTokenMovePlan(scene.id,scene.tokens[0]),{x:200,y:200},scene.grid,scene);
  assert.equal(tokenMovePlanValid(plan,scene),true);
  for (const patch of [{x:26},{y:30},{size:2}]) {
    const changed = {...scene,tokens:[{...scene.tokens[0],...patch}]};
    assert.equal(tokenMovePlanDestination(plan,changed),null);
  }
  assert.equal(tokenMovePlanDestination(plan,{...scene,id:'different'}),null);
  assert.equal(tokenMovePlanDestination(plan,{...scene,tokens:[]}),null);
});
test('tap planner uses large-token footprint snapping, hex centers, bounds, and a finite point limit', () => {
  const g = {...grid,type:'square',snap:true,size:50,offsetX:10,offsetY:20};
  const token = {...newToken(),id:'large',x:60,y:70,size:2};
  const plan = startTokenMovePlan('scene',token);
  assert.deepEqual(appendTokenMovePoint(plan,{x:107,y:112},g,{width:500,height:500}).points.at(-1),{x:110,y:120});
  assert.deepEqual(appendTokenMovePoint(plan,{x:-500,y:9999},g,{width:500,height:500}).points.at(-1),{x:0,y:500});
  for (const type of ['hex-flat','hex-pointy']) {
    assert.deepEqual(appendTokenMovePoint(plan,{x:210,y:155},{...g,type},{width:500,height:500}).points.at(-1),snap({x:210,y:155},{...g,type},2));
  }
  const full = {...plan,points:Array.from({length:200},(_,i)=>({x:i,y:0}))};
  assert.equal(appendTokenMovePoint(full,{x:200,y:200},g,{width:500,height:500}),full);
  assert.equal(undoTokenMovePoint(plan),plan);
});
