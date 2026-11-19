import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { SKIN_BOOT_DATA, SKIN_BOOT_FLAG, SKIN_BOOT_MS, bootArea, skinBootScript } from '../lib/campaign-theme/boot.ts';

test('the parts of a campaign are known by path', () => {
  assert.equal(bootArea('/encyclopedia'), 'encyclopedia');
  assert.equal(bootArea('/encyclopedia/w/abc'), 'encyclopedia');
  assert.equal(bootArea('/maptable'), 'maptable');
  assert.equal(bootArea('/forum'), 'forum');
  assert.equal(bootArea('/campaigns/e%3Aabc'), 'dashboard');
  assert.equal(bootArea('/campaigns/e%3Aabc/'), 'dashboard');
  assert.equal(bootArea('/campaigns'), null, 'the campaign list is not a campaign');
  assert.equal(bootArea('/'), null);
  assert.equal(bootArea('/encyclopediax'), null);
});

/** Runs the head script on a path, with what this browser kept. */
function boot(path, stored) {
  const dataset = {}, timers = [];
  const context = {
    location: { pathname: path },
    localStorage: { getItem: k => stored[k] ?? null },
    document: { documentElement: { dataset } },
    setTimeout: (f, ms) => timers.push({ f, ms }),
  };
  vm.runInNewContext(skinBootScript, context);
  return { held: () => SKIN_BOOT_DATA in dataset, timers };
}

test('the head script holds back only a part that last wore a theme, and not for long', () => {
  const worn = { [SKIN_BOOT_FLAG + 'maptable']: '1' };
  const held = boot('/maptable', worn);
  assert.ok(held.held());
  assert.equal(held.timers.length, 1);
  assert.equal(held.timers[0].ms, SKIN_BOOT_MS);
  held.timers[0].f();
  assert.ok(!held.held(), 'shown again at the latest after SKIN_BOOT_MS');
  assert.equal(boot('/encyclopedia', worn).held(), false, 'another part never wore one');
  assert.equal(boot('/', worn).held(), false, 'not a campaign part');
  assert.equal(boot('/maptable', {}).held(), false, 'nothing kept in this browser');
});

test('the head script never breaks the page when storage is off', () => {
  const context = { location: { pathname: '/forum' }, get localStorage() { throw new Error('denied'); }, document: {}, setTimeout() {} };
  assert.doesNotThrow(() => vm.runInNewContext(skinBootScript, context));
});
