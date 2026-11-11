import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, newScene, pointOfInterestSchema, workspaceSchema } from '../lib/model.ts';
import { campaignForScene, sceneTargets, resolvePointOfInterestTarget, newPointOfInterest } from '../lib/exploration.ts';

test('old saved scenes receive exploration defaults without changing encounter content', () => {
  const old = initialWorkspace();
  delete old.scenes[0].mapType;
  delete old.scenes[0].pointsOfInterest;
  const parsed = workspaceSchema.parse(old);
  assert.equal(parsed.scenes[0].mapType, 'encounter');
  assert.deepEqual(parsed.scenes[0].pointsOfInterest, []);
  assert.deepEqual(parsed.scenes[0].grid, old.scenes[0].grid);
  assert.deepEqual(newScene().pointsOfInterest, []);
});

test('exploration schema round trips pins and limits untrusted data', () => {
  const w = initialWorkspace();
  w.scenes[0].mapType = 'world';
  const pin = {...newPointOfInterest({x: 20, y: 50}), notes: 'A quiet harbor', targetSceneId: 'deleted-scene'};
  w.scenes[0].pointsOfInterest.push(pin);
  assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(w))), w);
  for (const invalid of [{x: Infinity}, {activation:'triple'}, {notes:'x'.repeat(2001)}, {color:'red'}, {name:''}])
    assert.equal(pointOfInterestSchema.safeParse({...pin,...invalid}).success, false);
  w.scenes[0].pointsOfInterest = Array.from({length:501}, () => pin);
  assert.equal(workspaceSchema.safeParse(w).success, false);
});

test('destinations follow campaign ancestry and tolerate stale saved links', () => {
  const w = initialWorkspace();
  w.collections = [
    {id:'a',name:'A',kind:'campaign',parentId:null},
    {id:'b',name:'B',kind:'campaign',parentId:null},
    {id:'folder',name:'Folder',kind:'folder',parentId:'a'},
  ];
  const source = w.scenes[0]; source.containerId = 'folder';
  const target = newScene('Area'); target.containerId = 'a';
  const other = newScene('Other'); other.containerId = 'b';
  w.scenes.push(target, other, newScene('Loose'));
  assert.equal(campaignForScene(w, source), 'a');
  assert.deepEqual(sceneTargets(w, source.id).map(s => s.id), [target.id]);
  const pin = {...newPointOfInterest({x:0,y:0}, 'single'),targetSceneId:target.id};
  assert.equal(resolvePointOfInterestTarget(w,source.id,pin), target);
  target.containerId = 'b';
  assert.equal(resolvePointOfInterestTarget(w,source.id,pin), null);
  pin.targetSceneId = 'missing';
  assert.equal(resolvePointOfInterestTarget(w,source.id,pin), null);
  w.collections[0].parentId = 'folder';
  assert.equal(campaignForScene(w,source), null);
  assert.deepEqual(sceneTargets(w,source.id), []);
});
