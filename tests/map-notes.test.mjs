import test from 'node:test';
import assert from 'node:assert/strict';
import { pointOfInterestSchema } from '../lib/model.ts';
import { addNotePage, hasNote, linkablePages, notePages, playerNote, removeNotePage, MAX_NOTE_PAGES } from '../lib/map-notes.ts';
import { demoWorkspace } from '../lib/encyclopedia/world-model.ts';
import { playersScenes } from '../lib/mcp/players-only.ts';

const marker = (extra = {}) => pointOfInterestSchema.parse({ id: 'm1', name: 'Greyfen marsh', x: 10, y: 20, color: '#d4a654', ...extra });
/** The demo Encyclopedia, with "The Salt Road" paired to Maptable campaign "map-salt". */
function book() {
  const s = demoWorkspace();
  s.campaigns[0].maptableCampaignId = 'map-salt';
  const hag = { id: 'bog-hag', worldId: 'demo-world', title: 'Bog Hag', kind: 'character', campaignId: 'demo-campaign', parentId: null, updatedAt: new Date().toISOString(),
    body: 'Lives in the reeds.\n::: secret\nShe owes the reeve a debt.\n:::', overviewVisibility: 'players' };
  const other = { ...hag, id: 'winter-only', title: 'Winter guest', campaignId: 'demo-campaign-two', body: 'Not in this campaign.' };
  s.entries.push(hag, other);
  return s;
}

test('markers keep read-aloud text, linked pages and the player choice; older markers still load', () => {
  const old = marker();
  assert.equal(old.readAloud, undefined);
  assert.equal(old.pages, undefined);
  const full = marker({ readAloud: 'Black water laps at the reeds.', pages: ['bog-hag'], playersSee: true });
  assert.deepEqual(full.pages, ['bog-hag']);
  assert.throws(() => marker({ readAloud: 'x'.repeat(4001) }));
  assert.throws(() => marker({ pages: Array.from({ length: 21 }, (_, i) => `p${i}`) }));
  assert.equal(hasNote(old), false);
  assert.equal(hasNote(full), true);
});

test('adding and removing pages keeps each page once, up to the limit', () => {
  const p = marker();
  assert.equal(addNotePage(p, 'a'), true);
  assert.equal(addNotePage(p, 'a'), false);
  for (let i = 1; i < MAX_NOTE_PAGES; i++) addNotePage(p, `p${i}`);
  assert.equal(p.pages.length, MAX_NOTE_PAGES);
  assert.equal(addNotePage(p, 'one-more'), false);
  removeNotePage(p, 'a');
  assert.equal(p.pages.includes('a'), false);
});

test('the GM can link pages from the paired campaign and its world, without folders', () => {
  const s = book();
  const pages = linkablePages(s, 'map-salt');
  const ids = pages.map(p => p.id);
  assert.ok(ids.includes('bog-hag') && ids.includes('demo-greyhaven') && ids.includes('demo-mara'));
  assert.ok(!ids.includes('winter-only'), 'another campaign’s pages are left out');
  assert.ok(!pages.some(p => p.id === 'demo-places'), 'folders are left out');
  assert.equal(pages.find(p => p.id === 'bog-hag').group, 'Characters');
  // Not paired: every page outside templates, with its campaign named.
  assert.ok(linkablePages(s, 'map-other').some(p => p.id === 'winter-only' && p.kind.includes('Winter at Greyhaven')));
  assert.deepEqual(linkablePages(null, 'map-salt'), []);
});

test('a note shows its pages in order, skips deleted ones and never shows secrets in the excerpt', () => {
  const s = book();
  const pages = notePages(s, ['bog-hag', 'gone', 'demo-greyhaven']);
  assert.deepEqual(pages.map(p => p.id), ['bog-hag', 'demo-greyhaven']);
  assert.ok(!pages[0].excerpt.includes('debt'));
});

test('players see a note only when it is shared, and only pages already shared with them', () => {
  const s = book();
  const p = marker({ readAloud: 'Black water laps at the reeds.', pages: ['bog-hag', 'demo-mara'], notes: 'GM: the hag is watching.' });
  assert.equal(playerNote(p, s, 'map-salt'), null, 'not shared');
  p.playersSee = true;
  const note = playerNote(p, s, 'map-salt');
  assert.equal(note.readAloud, 'Black water laps at the reeds.');
  assert.deepEqual(note.pages.map(x => x.id), ['bog-hag'], 'Mara’s page is GM-only');
  assert.ok(!JSON.stringify(note).includes('debt'), 'secrets stay out');
  assert.ok(!JSON.stringify(note).includes('watching'), 'quick notes stay out');
  assert.equal(playerNote({ ...p, hidden: true }, s, 'map-salt'), null, 'hidden markers show nothing');
  assert.deepEqual(playerNote(p, s, null).pages, [], 'without a paired campaign, only the read-aloud text');
  assert.equal(playerNote({ ...p, readAloud: '', pages: [] }, s, 'map-salt'), null, 'nothing to show');
});

test('the players-only view for the AI drops read-aloud text and pages from unshared notes', () => {
  const scene = { pointsOfInterest: [marker({ id: 'a', readAloud: 'Shared', pages: ['x'], playersSee: true, notes: 'gm' }), marker({ id: 'b', readAloud: 'Not shared', pages: ['y'] })], tokens: [], effects: [], fog: { enabled: false, base: false, strokes: [] } };
  const [a, b] = playersScenes([scene], () => false)[0].pointsOfInterest;
  assert.equal(a.readAloud, 'Shared');
  assert.equal(a.notes, undefined);
  assert.equal(b.readAloud, undefined);
  assert.equal(b.pages, undefined);
});
