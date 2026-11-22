import test from 'node:test';
import assert from 'node:assert/strict';
import { demoWorkspace } from '../lib/encyclopedia/world-model.ts';
import { idsForSaving, namesForEditing } from '../lib/encyclopedia/link-names.ts';

const data = demoWorkspace();
const from = data.entries.find(e => e.id === 'demo-first');
const show = t => namesForEditing(data, from, t), save = t => idsForSaving(data, from, t);

test('Write shows links by page name, and saving puts the id back', () => {
  const saved = 'Met [[demo-mara|Mara Venn]] in [[demo-greyhaven|Greyhaven]].';
  assert.equal(show(saved), 'Met [[Mara Venn]] in [[Greyhaven]].');
  assert.equal(save(show(saved)), saved);
});

test('a typed name link is saved with the id and keeps its words', () => {
  assert.equal(save('Ask [[Mara Venn]] and [[mara venn]].'), 'Ask [[demo-mara|Mara Venn]] and [[demo-mara|mara venn]].');
  assert.equal(show(save('[[mara venn]]')), '[[mara venn]]');
});

test('another label, sections and embeds keep their parts', () => {
  for (const [saved, shown] of [
    ['[[demo-mara|the keeper]]', '[[Mara Venn|the keeper]]'],
    ['[[demo-greyhaven#At a glance]]', '[[Greyhaven#At a glance]]'],
    ['[[demo-greyhaven#At a glance|the city]]', '[[Greyhaven#At a glance|the city]]'],
    ['![[demo-mara]]', '![[Mara Venn]]'],
    ['![[demo-greyhaven#At a glance|full]]', '![[Greyhaven#At a glance|full]]'],
    ['[[[demo-mara|Mara Venn]]]{color=red}', '[[[Mara Venn]]]{color=red}'],
  ]) {
    assert.equal(show(saved), shown);
    assert.equal(save(shown), saved);
  }
  // A bare id link reads by name and comes back labelled with that name.
  assert.equal(save(show('[[demo-mara]]')), '[[demo-mara|Mara Venn]]');
});

test('a renamed page shows its new name and keeps the old words', () => {
  const renamed = { ...data, entries: data.entries.map(e => e.id === 'demo-mara' ? { ...e, title: 'Mara the Bold' } : e) };
  assert.equal(namesForEditing(renamed, from, '[[demo-mara|Mara Venn]]'), '[[Mara the Bold|Mara Venn]]');
  assert.equal(idsForSaving(renamed, from, '[[Mara the Bold|Mara Venn]]'), '[[demo-mara|Mara Venn]]');
});

test('rolls, tables, scenes, pictures, red links and code are left alone', () => {
  const text = '[[1d20+5|Attack]] [[table:Weather]] [[maptable:abc|Docks]] ![[picture:x|A map|right]] [[Nobody yet]] [[#Next session]] `[[demo-mara|Mara Venn]]`\n```\n[[Mara Venn]]\n```';
  assert.equal(show(text), text);
  assert.equal(save(text), text);
});

test('a name two pages share keeps its id, so the link cannot change page', () => {
  const twin = { id: 'demo-mara-2', worldId: 'demo-world', title: 'Mara Venn', kind: 'note', campaignId: 'demo-campaign', parentId: null, body: '', updatedAt: '' };
  const both = { ...data, entries: [...data.entries, twin] };
  // The name finds the campaign's own page first, so the shared-lore Mara stays an id link.
  assert.equal(namesForEditing(both, from, '[[demo-mara|Mara Venn]]'), '[[demo-mara|Mara Venn]]');
  assert.equal(namesForEditing(both, from, '[[demo-mara-2|Mara Venn]]'), '[[Mara Venn]]');
  assert.equal(idsForSaving(both, from, '[[demo-mara|Mara Venn]]'), '[[demo-mara|Mara Venn]]');
});
