// An edit to the open scene copies only that scene. It must give the same workspace as copying everything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, newScene, newToken } from '../lib/model.ts';
import { editWorkspace, activeSceneId } from '../lib/maptable-commit.ts';
import { jsonEqual } from '../lib/json-equal.ts';

function fixture() {
  const w = initialWorkspace();
  w.collections = [{ id: 'a', name: 'A', kind: 'campaign', parentId: null, tokenDefaults: { partyZeroHp: 'unconscious', npcZeroHp: 'dead', showName: true, showHp: true } }];
  w.scenes = [0, 1, 2].map(i => {
    const s = newScene('Scene ' + i); s.containerId = 'a';
    const parent = { ...newToken('Horse'), id: `horse${i}`, x: 100, y: 100 }, rider = { ...newToken('Rider'), id: `rider${i}`, x: 110, y: 100, attachedToId: `horse${i}` };
    const npc = { ...newToken('Bandit'), id: `npc${i}`, rosterRole: 'npc', hp: 5, conditions: ['prone'], x: 300, y: 300 };
    s.tokens.push(parent, rider, npc);
    s.effects.push({ id: `aura${i}`, type: 'circle', x: 300, y: 300, size: 3, color: '#ff0000', label: '', persistent: true, tokenId: `npc${i}`, reach: 1, hidden: false, rotation: 0, width: 1, angle: 90, points: [] });
    return s;
  });
  w.activeId = w.scenes[1].id;
  // Saved workspaces have been through the clean-ups once.
  return editWorkspace(w, () => {});
}
const edits = {
  'move a token': s => { s.tokens.find(t => t.id.startsWith('npc')).x += 50; },
  'drop an NPC to 0 HP': s => { s.tokens.find(t => t.id.startsWith('npc')).hp = 0; },
  'add a condition': s => { s.tokens.find(t => t.id.startsWith('horse')).conditions.push('poisoned'); },
  'move a mount with its rider': s => { s.tokens.find(t => t.id.startsWith('horse')).x += 70; },
  'remove the aura token': s => { s.tokens = s.tokens.filter(t => !t.id.startsWith('npc')); },
  'grow a token': s => { s.tokens.find(t => t.id.startsWith('npc')).size = 2; },
  'nothing': () => {},
};
for (const [name, edit] of Object.entries(edits)) test(`one-scene edit matches a full copy: ${name}`, () => {
  const w = fixture(), id = activeSceneId(w);
  const onScene = fn => x => fn(x.scenes.find(s => s.id === id));
  const full = editWorkspace(w, onScene(edit)), scoped = editWorkspace(w, onScene(edit), id);
  assert(jsonEqual(full, scoped), name);
  for (const s of scoped.scenes) if (s.id !== id) assert.equal(s, w.scenes.find(x => x.id === s.id), 'other scenes are shared, not copied');
  assert.notEqual(scoped.scenes.find(s => s.id === id), w.scenes.find(s => s.id === id));
});
test('the clean-ups run on the edited scene', () => {
  const w = fixture(), id = activeSceneId(w), on = fn => x => fn(x.scenes.find(s => s.id === id));
  const rode = editWorkspace(w, on(edits['move a mount with its rider']), id).scenes.find(s => s.id === id);
  assert.equal(rode.tokens.find(t => t.id.startsWith('rider')).x, 180);
  const down = editWorkspace(w, on(edits['drop an NPC to 0 HP']), id).scenes.find(s => s.id === id);
  assert.equal(down.tokens.find(t => t.id.startsWith('npc')).status, 'dead');
  const moved = editWorkspace(w, on(edits['move a token']), id).scenes.find(s => s.id === id);
  assert.equal(moved.effects[0].x, 350);
});
test('a one-scene edit leaves the previous workspace as it was', () => {
  const w = fixture(), before = structuredClone(w), id = activeSceneId(w);
  editWorkspace(w, x => { const s = x.scenes.find(s => s.id === id); s.tokens[0].x = 999; s.tokens[2].hp = 0; }, id);
  assert(jsonEqual(w, before));
});
test('the open scene is the active one, else the first', () => {
  const w = fixture(); assert.equal(activeSceneId(w), w.scenes[1].id);
  w.activeId = 'gone'; assert.equal(activeSceneId(w), w.scenes[0].id); assert.equal(activeSceneId(null), undefined);
});
