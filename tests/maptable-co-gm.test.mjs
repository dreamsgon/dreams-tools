import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../lib/model.ts';
import { maptableExport, applyMaptableCoGm, maptableCoGmRefusal, MapCoGmError } from '../lib/maptable-co-gm.ts';

const ref = 'a'.repeat(64);
const pic = (id, src) => ({ id, name: id, src, width: 10, height: 10 });
function fixture() {
  const w = model.initialWorkspace();
  w.collections = [
    { id: 'shelf', name: 'Shelf', kind: 'folder', parentId: null },
    { id: 'salt', name: 'The Salt Road', kind: 'campaign', parentId: 'shelf' },
    { id: 'act2', name: 'Act 2', kind: 'folder', parentId: 'salt' },
    { id: 'grey', name: 'Greyfen nights', kind: 'campaign', parentId: null },
  ];
  const marsh = { ...model.newScene('Greyfen marsh'), id: 'marsh', containerId: 'act2', mapId: 'map1' };
  marsh.tokens = [{ ...model.newToken('Bram'), id: 'bram', assetId: 'face' }];
  w.scenes = [{ ...w.scenes[0], id: 'secret', name: 'Private', containerId: 'grey', mapId: 'map2' }, marsh];
  w.activeId = 'secret';
  w.assets = [pic('map1', '/api/assets?id=11111111-1111-1111-1111-111111111111'), pic('map2', '/api/assets?id=22222222-2222-2222-2222-222222222222'), pic('face', 'https://example.com/f.png'), pic('shared', '/api/s3?key=uploads%2Fx.png')];
  w.assetCampaigns = { map1: 'salt', map2: 'grey', face: 'grey' };
  w.tokenLibrary = [{ ...model.newToken('Ostra'), id: 'ostra' }, { ...model.newToken('Spy'), id: 'spy' }];
  w.libraryCampaigns = { ostra: 'salt', spy: 'grey' };
  return model.workspaceSchema.parse(w);
}

test('a co-GM gets only their campaign, its pictures and the shared tools', () => {
  const w = fixture(), copy = maptableExport(w, 'salt', ref);
  assert.deepEqual(copy.scenes.map(s => s.id), ['marsh']);
  assert.equal(copy.activeId, 'marsh');
  assert.deepEqual(copy.collections.map(c => [c.id, c.parentId]), [['salt', null], ['act2', 'salt']]);
  assert.deepEqual(copy.tokenLibrary.map(t => t.id), ['ostra']);
  // map1 is the campaign's, face is used by a token on its map, shared isn't in any campaign; map2 is Greyfen's.
  assert.deepEqual(copy.assets.map(a => a.id), ['map1', 'face', 'shared']);
  assert.equal(copy.assets[0].src, `/api/assets?id=11111111-1111-1111-1111-111111111111&member=${ref}`);
  assert.equal(copy.assets[1].src, 'https://example.com/f.png');
  assert.equal(copy.assets[2].src, `/api/s3?key=uploads%2Fx.png&member=${ref}`);
  assert.ok(!JSON.stringify(copy).includes('Private') && !JSON.stringify(copy).includes('Spy'));
  assert.equal(maptableExport(w, 'nope', ref), null);
});

test('a co-GM save changes their campaign and leaves the rest of the GM\'s Maptable alone', () => {
  const w = fixture(), copy = maptableExport(w, 'salt', ref);
  copy.scenes[0].name = 'Greyfen marsh at night';
  copy.scenes.push({ ...model.newScene('Ferry landing'), id: 'ferry', containerId: 'salt' });
  copy.activeId = 'ferry';
  copy.assets.push(pic('new', `/api/assets?id=33333333-3333-3333-3333-333333333333&member=${ref}`));
  copy.assetCampaigns.new = 'salt';
  copy.tokenLibrary = [];
  const next = applyMaptableCoGm(w, 'salt', ref, copy);
  assert.deepEqual(next.scenes.map(s => s.name), ['Private', 'Greyfen marsh at night', 'Ferry landing']);
  assert.equal(next.activeId, 'secret');
  assert.equal(next.collections.find(c => c.id === 'salt').parentId, 'shelf');
  assert.equal(next.assets.find(a => a.id === 'map1').src, '/api/assets?id=11111111-1111-1111-1111-111111111111');
  assert.equal(next.assets.find(a => a.id === 'new').src, '/api/assets?id=33333333-3333-3333-3333-333333333333');
  assert.equal(next.assets.find(a => a.id === 'map2').src, '/api/assets?id=22222222-2222-2222-2222-222222222222');
  assert.deepEqual(next.tokenLibrary.map(t => t.id), ['spy']);
  assert.equal(next.libraryCampaigns.spy, 'grey');
});

test('a co-GM cannot reach outside their campaign or bring in someone else\'s pictures', () => {
  const w = fixture();
  const tries = [
    c => { c.collections[0].name = 'Renamed'; },
    c => { c.collections.push({ id: 'mine', name: 'Mine', kind: 'campaign', parentId: null }); },
    c => { c.collections.push({ id: 'loose', name: 'Loose', kind: 'folder', parentId: null }); c.scenes[0].containerId = 'loose'; },
    c => { c.scenes.push({ ...model.newScene('Sneaky'), id: 'secret', containerId: 'salt' }); },
    c => { c.assets.push(pic('own', '/api/assets?id=44444444-4444-4444-4444-444444444444')); },
    c => { c.assets.push(pic('other', `/api/assets?id=44444444-4444-4444-4444-444444444444&member=${'b'.repeat(64)}`)); },
  ];
  for (const change of tries) {
    const copy = maptableExport(w, 'salt', ref);
    change(copy);
    assert.throws(() => applyMaptableCoGm(w, 'salt', ref, copy), MapCoGmError);
  }
  const copy = maptableExport(w, 'salt', ref);
  assert.equal(maptableCoGmRefusal(copy, copy, 'salt', ref), null);
});
