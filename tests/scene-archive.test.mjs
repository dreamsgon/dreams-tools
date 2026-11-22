import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../lib/model.ts';
import { loadWorkspace, saveWorkspace } from '../lib/workspace-storage.ts';
import { archiveMap, bringBackMap, archiveKey } from '../lib/scene-archive-server.ts';
import { archivedIn, archiveScene } from '../lib/scene-archive.ts';
import { mergeMaptable } from '../lib/maptable-merge.ts';
import { maptableExport, applyMaptableCoGm } from '../lib/maptable-co-gm.ts';
import { campaignSession } from '../lib/campaigns-server.ts';
import { startBackup, deleteCampaign } from '../lib/campaign-backup-server.ts';

class Bucket {
  data = new Map(); n = 0;
  obj(v) { return { etag: v.etag, size: v.text.length, httpMetadata: { contentType: 'application/json' }, json: async () => JSON.parse(v.text), arrayBuffer: async () => new TextEncoder().encode(v.text).buffer }; }
  async get(key) { const v = this.data.get(key); return v ? this.obj(v) : null; }
  async head(key) { return this.get(key); }
  async put(key, body, options = {}) { const old = this.data.get(key); if (options.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null; if (options.onlyIf?.etagDoesNotMatch === '*' && old) return null; const etag = String(++this.n); this.data.set(key, { etag, text: typeof body === 'string' ? body : new TextDecoder().decode(body) }); return { etag }; }
  async delete(key) { this.data.delete(key); }
  async signedGet(key) { return 'https://signed.example/' + key; }
}
const P = 'users/u/';
const pic = (id) => ({ id, name: id, src: `/api/assets?id=${id}`, width: 10, height: 10 });
function maps() {
  const w = model.initialWorkspace();
  w.collections = [{ id: 'm1', name: 'Salt Road', kind: 'campaign', parentId: null }, { id: 'act1', name: 'Act 1', kind: 'folder', parentId: 'm1' }];
  const keep = { ...model.newScene('Harbour'), id: 'harbour', containerId: 'm1' };
  const old = { ...model.newScene('Old crypt'), id: 'crypt', containerId: 'act1', mapId: 'map1' };
  old.tokens = [{ ...model.newToken('Ghoul'), id: 'ghoul', assetId: 'face' }];
  w.scenes = [keep, old];
  w.activeId = 'crypt';
  w.assets = [pic('map1'), pic('face')];
  w.assetCampaigns = { map1: 'm1', face: null };
  return model.workspaceSchema.parse(w);
}
async function setup() { const b = new Bucket(), saved = await saveWorkspace(b, P, maps(), null); return { b, revision: saved.revision }; }

test('archiving a map moves it to its own file, and bringing it back restores it where it was', async () => {
  const { b, revision } = await setup();
  const done = await archiveMap(b, P, revision, 'crypt', new Date('2026-11-22T00:00:00Z'));
  assert.ok(done);
  const after = (await loadWorkspace(b, P)).workspace;
  assert.deepEqual(after.scenes.map(s => s.id), ['harbour'], 'it no longer loads with the maps');
  assert.equal(after.activeId, 'harbour');
  assert.deepEqual(after.archivedScenes.map(s => [s.id, s.name, s.containerId, s.tokens]), [['crypt', 'Old crypt', 'act1', 1]]);
  assert.deepEqual(archivedIn(after, 'm1').map(s => s.id), ['crypt'], 'listed in its campaign');
  assert.deepEqual(archivedIn(after, null), []);
  const file = JSON.parse(b.data.get(archiveKey(P, 'crypt')).text);
  assert.equal(file.scene.tokens[0].id, 'ghoul');
  assert.deepEqual(file.assets.map(a => a.id).sort(), ['face', 'map1'], 'its pictures go with it');

  // Its map picture is removed from the library meanwhile: bringing it back puts the picture back too.
  const current = await loadWorkspace(b, P);
  const trimmed = await saveWorkspace(b, P, { ...current.workspace, assets: [], assetCampaigns: {} }, current.revision);
  const back = await bringBackMap(b, P, trimmed.revision, 'crypt');
  assert.ok(back);
  const restored = (await loadWorkspace(b, P)).workspace;
  const crypt = restored.scenes.find(s => s.id === 'crypt');
  assert.equal(crypt.containerId, 'act1');
  assert.equal(crypt.tokens[0].name, 'Ghoul');
  assert.deepEqual(restored.assets.map(a => a.id).sort(), ['face', 'map1']);
  assert.equal(restored.assetCampaigns.map1, 'm1');
  assert.deepEqual(restored.archivedScenes, []);
  assert.ok(!b.data.has(archiveKey(P, 'crypt')), 'the file goes once it is back');
});

test('an archive that loses a race leaves no file, and a stale revision changes nothing', async () => {
  const { b, revision } = await setup();
  assert.equal(await archiveMap(b, P, 'stale', 'crypt'), null);
  assert.ok(!b.data.has(archiveKey(P, 'crypt')));
  const put = b.put.bind(b);
  b.put = async (key, body, options) => key === P + 'workspace.json' ? null : put(key, body, options);
  assert.equal(await archiveMap(b, P, revision, 'crypt'), null);
  assert.ok(!b.data.has(archiveKey(P, 'crypt')), 'the file written first is removed again');
  b.put = put;
  assert.equal((await loadWorkspace(b, P)).workspace.scenes.length, 2);
});

test('the last map stays, and a map whose folder is gone comes back outside any folder', async () => {
  const w = maps();
  assert.throws(() => archiveScene({ ...w, scenes: [w.scenes[0]] }, 'harbour', 'x'), /at least one map/);
  const { b, revision } = await setup();
  const done = await archiveMap(b, P, revision, 'crypt');
  const current = await loadWorkspace(b, P);
  const without = await saveWorkspace(b, P, { ...current.workspace, collections: current.workspace.collections.filter(c => c.id !== 'act1') }, current.revision);
  await bringBackMap(b, P, without.revision, 'crypt');
  assert.equal((await loadWorkspace(b, P)).workspace.scenes.find(s => s.id === 'crypt').containerId, null);
  assert.ok(done);
  const latest = (await loadWorkspace(b, P)).revision;
  await assert.rejects(() => bringBackMap(b, P, latest, 'crypt'), /isn't archived/);
});

test('another tab or a co-GM editing an archived map does not bring it back', async () => {
  const base = maps(), { next: theirs } = archiveScene(base, 'crypt', '2026-11-22T00:00:00Z');
  const mine = structuredClone(base); mine.scenes[1].name = 'Old crypt, edited';
  const joined = mergeMaptable(base, mine, theirs);
  assert.deepEqual(joined.merged.scenes.map(s => s.id), ['harbour']);
  assert.equal(joined.merged.archivedScenes.length, 1);

  const ref = 'a'.repeat(64), copy = maptableExport(base, 'm1', ref);
  assert.equal(maptableExport(theirs, 'm1', ref).archivedScenes, undefined, 'a co-GM never sees the archive list');
  const saved = applyMaptableCoGm(theirs, 'm1', ref, copy);
  assert.deepEqual(saved.scenes.map(s => s.id), ['harbour']);
  assert.equal(saved.archivedScenes.length, 1, "the GM's archive list stays");
});

test('a campaign backup includes its archived maps, and deleting the campaign removes their files', async () => {
  const b = new Bucket(), s = campaignSession(b, 'owner-1');
  const first = await saveWorkspace(b, s.prefix, maps(), null);
  assert.ok(await archiveMap(b, s.prefix, first.revision, 'crypt'));
  const backup = await startBackup(s, b, 'm:m1');
  assert.deepEqual(backup.backup.maptable.scenes.map(x => x.id).sort(), ['crypt', 'harbour']);
  const gone = await deleteCampaign(s, b, 'm:m1', 'salt road');
  assert.equal(gone.deleted, 'Salt Road');
  assert.ok(!b.data.has(archiveKey(s.prefix, 'crypt')));
  assert.deepEqual((await loadWorkspace(b, s.prefix)).workspace.archivedScenes, []);
});

test('a scene holds up to 2,000 tokens', () => {
  const w = maps();
  w.scenes[0].tokens = Array.from({ length: 2000 }, (_, i) => ({ ...model.newToken(`T${i}`), id: `t${i}` }));
  assert.ok(model.workspaceSchema.safeParse(w).success);
  w.scenes[0].tokens.push({ ...model.newToken('One more'), id: 'extra' });
  assert.ok(!model.workspaceSchema.safeParse(w).success);
});
