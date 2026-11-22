import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,isStarterScene,withoutStarterScene,newScene,newToken,STARTER_SCENE_NAME} from '../lib/model.ts';
import {lastUsedCampaign} from '../lib/maptable-place.ts';

test('the scene a new Maptable starts with counts as the starter only while untouched', () => {
  const w = initialWorkspace(), s = w.scenes[0];
  assert.equal(s.name, STARTER_SCENE_NAME);
  assert.equal(isStarterScene(s), true);
  assert.equal(isStarterScene({...s, name: 'Harbor fight'}), false);
  assert.equal(isStarterScene({...s, containerId: 'camp'}), false);
  assert.equal(isStarterScene({...s, mapId: 'a1'}), false);
  assert.equal(isStarterScene({...s, tokens: [newToken('Goblin')]}), false);
  assert.equal(isStarterScene({...s, grid: {...s.grid, size: 50}}), false);
  assert.equal(isStarterScene(newScene()), false, 'an Untitled scene the GM made is theirs');
});

test('the starter scene goes once there is another scene, and never leaves the workspace empty', () => {
  const w = initialWorkspace();
  assert.equal(withoutStarterScene(w), w, 'alone, it stays: a workspace always has a scene');
  const other = {...newScene('Harbor'), containerId: 'camp'};
  const next = withoutStarterScene({...w, scenes: [...w.scenes, other]});
  assert.deepEqual(next.scenes.map(s => s.name), ['Harbor']);
  assert.equal(next.activeId, other.id, 'the open scene moves off the dropped one');
  const used = {...w.scenes[0], tokens: [newToken('Goblin')]};
  assert.equal(withoutStarterScene({...w, scenes: [used, other]}).scenes.length, 2, 'a starter scene the GM used is kept');
});

test('a bare /maptable opens the campaign used last, else the first one', () => {
  const data = {scenes: [], collections: [{id: 'f', kind: 'folder'}, {id: 'a', kind: 'campaign'}, {id: 'b', kind: 'campaign'}]};
  assert.equal(lastUsedCampaign(data, 'b'), 'b');
  assert.equal(lastUsedCampaign(data, 'gone'), 'a');
  assert.equal(lastUsedCampaign(data, null), 'a');
  assert.equal(lastUsedCampaign(data, 'f'), 'a', 'a folder is not a campaign');
  assert.equal(lastUsedCampaign({scenes: [], collections: []}, 'b'), null);
});
