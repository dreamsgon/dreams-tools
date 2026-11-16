import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceSchema,demoWorkspace,playerCampaign,searchableText,importCopy} from '../lib/encyclopedia/world-model.ts';
import {galaxySchema,galaxyPresets,galaxyPresetIds,presetGalaxy,generateGalaxy,newGalaxy,generatedFacts,galaxyName,galaxyRandom,randomGalaxySettings,hasArms} from '../lib/encyclopedia/galaxies.ts';
import {defaultTab} from '../lib/encyclopedia/place.ts';

const C='demo-campaign',T='2026-11-16T10:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:'demo-world',campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,...extra});

test('every real galaxy is a valid galaxy with all its facts', () => {
  assert.ok(galaxyPresetIds.includes('milky') && galaxyPresetIds.includes('andromeda'));
  for (const id of galaxyPresetIds) {
    const g = presetGalaxy(id);
    assert.equal(galaxySchema.safeParse(g).success, true, id);
    assert.equal(g.preset, id);
    for (const v of Object.values(g.facts)) assert.ok(v.length > 0, `${id} has every fact`);
    assert.equal(g.summary, galaxyPresets[id].summary);
  }
  assert.equal(presetGalaxy('milky').facts.distance, 'Home');
  assert.equal(presetGalaxy('m87').arms, 0, 'an elliptical has no arms');
});

test('generated galaxies are repeatable and fit their shape and size', () => {
  const a = generateGalaxy({ shape: 'spiral', arms: 4, size: 'giant', seed: 'The Veyl Expanse' });
  const b = generateGalaxy({ shape: 'spiral', arms: 4, size: 'giant', seed: 'The Veyl Expanse' });
  assert.deepEqual(a, b, 'same settings, same galaxy');
  assert.equal(a.preset, undefined);
  assert.equal(a.facts.type, 'Spiral');
  assert.equal(a.facts.distance, 'Invented');
  const across = n => Number(n.facts.across.replace(/\D/g, ''));
  assert.ok(across(a) >= 150000, 'a giant is at least 150,000 ly across');
  const dwarf = generateGalaxy({ shape: 'irregular', arms: 5, size: 'dwarf', seed: 'x' });
  assert.equal(dwarf.arms, 0, 'arms only on spirals');
  assert.ok(across(dwarf) <= 15000);
  assert.equal(generateGalaxy({ shape: 'barred', arms: 9, size: 'medium', seed: 'x' }).arms, 6, 'arms are clamped');
  assert.equal(generateGalaxy({ shape: 'barred', arms: 0, size: 'medium', seed: 'x' }).arms, 2);
  assert.notDeepEqual(generatedFacts('spiral', 'medium', 'one'), generatedFacts('spiral', 'medium', 'two'));
  assert.equal(galaxySchema.safeParse(generateGalaxy({ shape: 'ring', arms: 3, size: 'medium', seed: '  ' })).success, true, 'a blank seed still makes a valid galaxy');
});

test('names and dice', () => {
  const name = galaxyName(galaxyRandom('seed'));
  assert.match(name, /^The [A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.equal(galaxyName(galaxyRandom('seed')), name, 'repeatable');
  for (let i = 0; i < 30; i++) {
    const r = randomGalaxySettings(galaxyRandom(`roll${i}`));
    assert.equal(r.seed, r.name);
    assert.equal(hasArms(r.shape) ? r.arms >= 2 && r.arms <= 5 : r.arms === 0, true);
  }
  assert.equal(newGalaxy('Home').shape, 'barred');
  assert.equal(newGalaxy('Home').seed, 'Home');
});

test('a galaxy page saves, searches and opens on its Galaxy tab', () => {
  const s = demoWorkspace();
  s.entries.push(page('mw', 'Milky Way', 'galaxy', { galaxy: { ...presetGalaxy('milky'), summary: 'Where the Veyl Run ends.' } }));
  assert.equal(workspaceSchema.safeParse(s).success, true);
  assert.match(searchableText(s.entries.at(-1)), /Veyl Run/);
  assert.match(searchableText(s.entries.at(-1)), /SBbc/);
  assert.equal(defaultTab('galaxy'), 'galaxy');
  const copy = importCopy(demoWorkspace(), s);
  assert.equal(copy.entries.find(e => e.title === 'Milky Way')?.galaxy?.preset, 'milky', 'a backup import keeps the galaxy');
});

test('galaxy details only belong on a galaxy page, and bad galaxies are refused', () => {
  const s = demoWorkspace();
  s.entries.push(page('p', 'Somewhere', 'place', { galaxy: presetGalaxy('milky') }));
  assert.equal(workspaceSchema.safeParse(s).success, false);
  const t = demoWorkspace();
  t.entries.push(page('g', 'Odd', 'galaxy', { galaxy: { ...presetGalaxy('milky'), arms: 9 } }));
  assert.equal(workspaceSchema.safeParse(t).success, false, 'arms are 0 to 6');
  const u = demoWorkspace();
  u.entries.push(page('g', 'Odd', 'galaxy', { galaxy: { ...presetGalaxy('milky'), preset: 'nowhere' } }));
  assert.equal(workspaceSchema.safeParse(u).success, false, 'only known real galaxies');
});

test('players never get the galaxy details, only tabs the GM shares', () => {
  const s = demoWorkspace();
  s.entries.push(page('mw', 'Milky Way', 'galaxy', { galaxy: { ...presetGalaxy('milky'), summary: 'GM summary' }, overviewVisibility: 'players', body: 'Our home.' }));
  const view = playerCampaign(s, C);
  const mw = view.entries.find(e => e.id === 'mw');
  assert.ok(mw, 'the shared overview reaches players');
  assert.equal('galaxy' in mw, false);
  assert.doesNotMatch(JSON.stringify(view), /GM summary/);
});
