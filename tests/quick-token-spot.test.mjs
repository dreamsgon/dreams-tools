import test from 'node:test';
import assert from 'node:assert/strict';
import {freeSpotNear,newScene} from '../lib/model.ts';

test('quick tokens added one after another each get their own square near the middle', () => {
  const s = newScene('Docks'), g = {...s.grid, type: 'square', snap: true};
  const middle = {x: s.width / 2, y: s.height / 2}, placed = [];
  for (let i = 0; i < 9; i++) placed.push(freeSpotNear(middle, placed, g, s));
  assert.equal(new Set(placed.map(p => `${p.x},${p.y}`)).size, 9, 'no two on one square');
  for (const p of placed) assert.ok(Math.abs(p.x - middle.x) <= g.size * 1.5 && Math.abs(p.y - middle.y) <= g.size * 1.5, 'the first nine fill the 3 × 3 around the middle');
  assert.deepEqual(placed[0], freeSpotNear(middle, [], g, s), 'the first goes where a lone token always went');
});

test('a free spot stays on the map, and a map with no grid still spreads them', () => {
  const s = {width: 140, height: 140}, g = {type: 'none', size: 70, offsetX: 0, offsetY: 0, snap: false};
  const a = freeSpotNear({x: 0, y: 0}, [], g, s), b = freeSpotNear({x: 0, y: 0}, [a], g, s);
  assert.notDeepEqual(a, b);
  for (const p of [a, b]) assert.ok(p.x >= 0 && p.y >= 0 && p.x <= 140 && p.y <= 140);
});
