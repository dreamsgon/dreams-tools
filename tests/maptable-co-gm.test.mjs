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

const refuses = (w, change, pattern) => {
  const copy = maptableExport(w, 'salt', ref);
  change(copy);
  assert.throws(() => applyMaptableCoGm(w, 'salt', ref, copy), e => e instanceof MapCoGmError && pattern.test(e.message));
};
const cond = id => ({ id, name: id, color: '#ff0000', icon: 'x' });
const folder = (id, parentId = null) => ({ id, name: id, kind: 'folder', parentId });

test('pictures another campaign owns are read-only for the co-GM', () => {
  const w = fixture();
  w.assetCampaigns.face = 'grey';
  w.assetLocations.face = null;
  const copy = maptableExport(w, 'salt', ref);
  assert.equal(copy.assetCampaigns.face, null);
  const locked = new Set(['face']);
  const pattern = /another of the GM's campaigns/;
  const tries = [
    c => { c.assets.find(a => a.id === 'face').name = 'Renamed'; },
    c => { c.assets = c.assets.filter(a => a.id !== 'face'); },
    c => { c.assetCampaigns.face = 'salt'; },
  ];
  for (const change of tries) {
    const c = maptableExport(w, 'salt', ref);
    change(c);
    assert.match(maptableCoGmRefusal(copy, c, 'salt', ref, locked), pattern);
    refuses(w, change, pattern);
  }
  const ok = maptableExport(w, 'salt', ref);
  ok.scenes[0].name = 'Fine';
  assert.equal(applyMaptableCoGm(w, 'salt', ref, ok).assetCampaigns.face, 'grey');
});

test('a co-GM can move their own picture to unsorted and it sticks', () => {
  const w = fixture(), copy = maptableExport(w, 'salt', ref);
  copy.assetCampaigns.map1 = null;
  const next = applyMaptableCoGm(w, 'salt', ref, copy);
  assert.equal(next.assetCampaigns.map1, null);
  assert.equal(next.assetCampaigns.map2, 'grey');
});

test('shared things can be added and edited but not deleted', () => {
  const w = fixture();
  w.conditions = [cond('prone')];
  w.assetFolders = [folder('af')];
  w.conditionFolders = [folder('cf')];
  w.effectPresetFolders = [folder('pf')];
  w.conditionLocations = { prone: 'cf' };
  w.assetLocations = { shared: 'af', map2: 'af' };
  w.libraryLocations = { spy: 'af' };
  w.tokenFolders = [{ ...folder('tf'), campaignId: null }];
  w.libraryCampaigns.glob = null;
  w.tokenLibrary.push({ ...model.newToken('Glob'), id: 'glob' });
  w.tokenFolderLocations = { glob: 'tf' };
  const good = model.workspaceSchema.parse(w);
  const del = /delete things shared/;
  const tries = [
    c => { c.assets = c.assets.filter(a => a.id !== 'shared'); },
    c => { c.tokenLibrary = c.tokenLibrary.filter(t => t.id !== 'glob'); delete c.tokenFolderLocations.glob; },
    c => { c.conditions = []; delete c.conditionLocations.prone; },
    c => { c.assetFolders = []; delete c.assetLocations.shared; },
    c => { c.conditionFolders = []; c.conditionLocations = {}; },
    c => { c.effectPresetFolders = []; },
    c => { c.tokenFolders = []; c.tokenFolderLocations = {}; },
  ];
  for (const change of tries) refuses(good, change, del);
  const copy = maptableExport(good, 'salt', ref);
  copy.conditions[0].name = 'Prone!';
  copy.conditions.push(cond('blind'));
  copy.assetFolders.push(folder('af2'));
  copy.assetLocations.shared = 'af2';
  copy.assetLocations.map1 = 'af';
  const next = applyMaptableCoGm(good, 'salt', ref, copy);
  assert.deepEqual(next.conditions.map(c => c.name), ['Prone!', 'blind']);
  assert.deepEqual(next.assetFolders.map(f => f.id), ['af', 'af2']);
  assert.equal(next.assetLocations.shared, 'af2');
  assert.equal(next.assetLocations.map2, 'af');
  assert.equal(next.libraryLocations.spy, 'af');
  assert.equal(next.conditionLocations.prone, 'cf');
});

test('picture addresses are parsed strictly and keep the GM\'s spelling', () => {
  const w = fixture();
  w.assets.push(pic('odd', '/api/s3?key=a%20b%2Fc.png'));
  w.assetCampaigns.odd = 'salt';
  const good = model.workspaceSchema.parse(w);
  const copy = maptableExport(good, 'salt', ref);
  copy.scenes[0].name = 'x';
  assert.equal(applyMaptableCoGm(good, 'salt', ref, copy).assets.find(a => a.id === 'odd').src, '/api/s3?key=a%20b%2Fc.png');
  const id = '44444444-4444-4444-4444-444444444444';
  const m = `member=${ref}`;
  const bad = [`/api/assets?id=${id}&id=${id}&${m}`, `/api/assets?id=${id}&${m}&${m}`, `/api/assets?id=${id}&${m}&x=1`, `/api/assets?key=${id}&${m}`, `/api/s3?id=${id}&${m}`, `/api/assets?id=${id}&member=${'b'.repeat(64)}`, `/api/assets?id=${id}&${m}#`, `/api/assets?id=${id}`];
  for (const src of bad) refuses(good, c => { c.assets.push(pic('n', src)); }, /somewhere else/);
  const c2 = maptableExport(good, 'salt', ref);
  c2.assets.push(pic('n', `/api/s3?key=a%20b&${m}`), pic('h', 'https://example.com/h.png'));
  const next = applyMaptableCoGm(good, 'salt', ref, c2);
  assert.equal(next.assets.find(a => a.id === 'n').src, '/api/s3?key=a%20b');
  assert.equal(next.assets.find(a => a.id === 'h').src, 'https://example.com/h.png');
});

test('duplicate ids in the incoming copy are refused', () => {
  const w = fixture();
  const dups = [c => c.assets.push(pic('map1', 'https://example.com/z.png')), c => c.conditions.push(cond('a'), cond('a')), c => c.scenes.push({ ...c.scenes[0] })];
  for (const change of dups) {
    const copy = maptableExport(w, 'salt', ref);
    change(copy);
    assert.equal(maptableCoGmRefusal(maptableExport(w, 'salt', ref), copy, 'salt', ref), 'Two things share an id; reload and try again.');
    assert.throws(() => applyMaptableCoGm(w, 'salt', ref, copy), /share an id/);
  }
});

test('a campaign nested in the co-GM\'s campaign is left out of their copy', () => {
  const w = fixture();
  w.collections.push({ id: 'inner', name: 'Inner', kind: 'campaign', parentId: 'act2' }, folder('innerf', 'inner'));
  w.scenes.push({ ...model.newScene('Deep'), id: 'deep', containerId: 'innerf', mapId: 'map2' });
  const good = model.workspaceSchema.parse(w);
  const copy = maptableExport(good, 'salt', ref);
  assert.deepEqual(copy.collections.map(c => c.id), ['salt', 'act2']);
  assert.deepEqual(copy.scenes.map(s => s.id), ['marsh']);
  copy.scenes[0].name = 'Changed';
  const next = applyMaptableCoGm(good, 'salt', ref, copy);
  assert.ok(next.scenes.some(s => s.id === 'deep') && next.collections.some(c => c.id === 'innerf'));
});

test('an invalid incoming copy gives a plain error, not a ZodError', () => {
  const w = fixture(), copy = maptableExport(w, 'salt', ref);
  copy.version = 2;
  assert.throws(() => applyMaptableCoGm(w, 'salt', ref, copy), e => e instanceof MapCoGmError && e.message.length > 0);
  assert.throws(() => applyMaptableCoGm(w, 'salt', ref, null), MapCoGmError);
});
