import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, newToken, tokenSchema, uid } from '../lib/model.ts';
import { copyTokens, pasteTokens, duplicateTokens, nextTokenName, groupTokens, ungroupTokens, groupMembers, expandGroups, toggleInSelection, readClipboard, MAX_SCENE_TOKENS } from '../lib/token-clipboard.ts';

const scene = () => {
  const s = structuredClone(initialWorkspace().scenes[0]);
  s.tokens = []; s.effects = [];
  s.grid = { ...s.grid, type: 'square', size: 70, offsetX: 0, offsetY: 0, snap: true };
  return s;
};
const at = (s, name, col, row, extra = {}) => { const t = { ...newToken(name), x: (col + .5) * 70, y: (row + .5) * 70, ...extra }; s.tokens.push(t); return t; };

test('names count up from the highest number', () => {
  assert.equal(nextTokenName('Kael', ['Mira']), 'Kael');
  assert.equal(nextTokenName('Bandit', ['Bandit']), 'Bandit 2');
  assert.equal(nextTokenName('Bandit', ['Bandit', 'Bandit', 'Bandit 3']), 'Bandit 4');
  assert.equal(nextTokenName('Bandit 2', ['Bandit 1', 'Bandit 2']), 'Bandit 3');
  assert.equal(nextTokenName('Goblin (boss)', ['Goblin (boss)']), 'Goblin (boss) 2');
});

test('paste keeps spacing, snaps to the grid at the pointer and numbers names', () => {
  const s = scene();
  const a = at(s, 'Bandit', 2, 2), b = at(s, 'Bandit', 3, 3, { hidden: true, conditions: ['c1'], hp: 4 });
  const clip = copyTokens(s, [a.id, b.id]);
  const ids = pasteTokens(s, clip, { x: 10 * 70 + 3, y: 5 * 70 - 2 });
  assert.equal(ids.length, 2);
  const [pa, pb] = ids.map(id => s.tokens.find(t => t.id === id));
  assert.equal(pb.x - pa.x, 70); assert.equal(pb.y - pa.y, 70);
  assert.equal(pa.x % 70, 35); assert.equal(pa.y % 70, 35);
  assert.deepEqual([pa.name, pb.name], ['Bandit 3', 'Bandit 4']);
  assert.equal(pb.hidden, true); assert.deepEqual(pb.conditions, ['c1']); assert.equal(pb.hp, 4);
  assert.notEqual(pa.id, a.id);
  assert.equal(s.tokens.length, 4);
  for (const token of s.tokens) tokenSchema.parse(token);
});

test('paste into another scene scales to its grid, keeps auras, groups and riders among the copies', () => {
  const from = scene(), to = { ...scene(), id: uid(), grid: { ...scene().grid, size: 50 } };
  const horse = at(from, 'Horse', 1, 1), rider = at(from, 'Rider', 2, 1, { attachedToId: horse.id }), loner = at(from, 'Loner', 1, 2, { attachedToId: 'someone-else' });
  groupTokens(from, [horse.id, rider.id]);
  from.effects.push({ id: uid(), type: 'circle', x: horse.x, y: horse.y, size: 2, color: '#ff0000', label: 'Aura', persistent: true, tokenId: horse.id, hidden: false, rotation: 0, width: 1, angle: 90, points: [] });
  const piece = at(from, 'Crate', 4, 4, { pieceOf: 'stamp-1' });
  const ids = pasteTokens(to, copyTokens(from, [horse.id, rider.id, loner.id, piece.id]), { x: 300, y: 300 });
  const [h, r, l, c] = ids.map(id => to.tokens.find(t => t.id === id));
  assert.equal(r.x - h.x, 50, 'one square of the new grid');
  assert.equal(r.attachedToId, h.id);
  assert.equal(l.attachedToId, null);
  assert.ok(h.groupId && h.groupId === r.groupId && h.groupId !== from.tokens[0].groupId);
  assert.equal(c.pieceOf, undefined);
  assert.equal(to.effects.length, 1); assert.equal(to.effects[0].tokenId, h.id);
});

test('paste stops at the scene limit', () => {
  const s = scene();
  for (let i = 0; i < MAX_SCENE_TOKENS - 1; i++) s.tokens.push({ ...newToken('T'), x: 10, y: 10 });
  const a = at(scene(), 'A', 1, 1), b = at(scene(), 'B', 1, 2);
  const clip = { v: 1, sceneId: 'x', sceneName: 'x', gridSize: 70, tokens: [a, b], effects: [] };
  assert.equal(pasteTokens(s, clip, { x: 100, y: 100 }).length, 1);
  assert.equal(pasteTokens(s, clip, { x: 100, y: 100 }).length, 0);
});

test('duplicate puts copies one square away', () => {
  const s = scene(), a = at(s, 'Wolf', 1, 1);
  const [id] = duplicateTokens(s, [a.id]);
  const copy = s.tokens.find(t => t.id === id);
  assert.deepEqual([copy.x, copy.y, copy.name], [a.x + 70, a.y + 70, 'Wolf 2']);
});

test('groups select, toggle and ungroup together', () => {
  const s = scene(), a = at(s, 'A', 1, 1), b = at(s, 'B', 2, 1), c = at(s, 'C', 3, 1);
  assert.equal(groupTokens(s, [a.id]), null);
  groupTokens(s, [a.id, b.id]);
  assert.deepEqual(groupMembers(s, a.id).sort(), [a.id, b.id].sort());
  assert.deepEqual(expandGroups(s, [b.id, 'effect-1']), [a.id, b.id, 'effect-1']);
  assert.deepEqual(toggleInSelection(s, [c.id], a.id), [c.id, a.id, b.id]);
  assert.deepEqual(toggleInSelection(s, [c.id, a.id, b.id], b.id), [c.id]);
  assert.equal(ungroupTokens(s, [b.id]), 2);
  assert.deepEqual(groupMembers(s, a.id), [a.id]);
});

test('only well-formed clipboards are read back', () => {
  assert.equal(readClipboard(null), null);
  assert.equal(readClipboard({ v: 1, tokens: [], effects: [], gridSize: 70 }), null);
  assert.ok(readClipboard({ v: 1, tokens: [newToken('A')], effects: [], gridSize: 70, sceneId: 's', sceneName: 'S' }));
});
