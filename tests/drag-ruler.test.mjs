import test from 'node:test';
import assert from 'node:assert/strict';
import { dragRuler, freeDistance, onGrid, rulerBand, formatDistance } from '../lib/drag-ruler.ts';
import { pathDistance } from '../lib/model.ts';
import { tokenDragPosition } from '../lib/token-movement.ts';

const grid = { type: 'square', size: 60, offsetX: 0, offsetY: 0, snap: true, units: 5, unit: 'ft', diagonal: 'alternating', color: '#000', opacity: 1, labels: false, labelMode: 'cells', labelTheme: 'light' };
const cell = (col, row) => ({ x: col * 60 + 30, y: row * 60 + 30 });

test('legs and total match the scene measurement on the grid', () => {
  const points = [cell(3, 4), cell(6, 4), cell(8, 7)];
  for (const diagonal of ['equal', 'alternating', 'euclidean']) {
    const g = { ...grid, diagonal }, ruler = dragRuler(points, g);
    assert.equal(ruler.total, Math.round(pathDistance(points, g) * 100) / 100, diagonal);
    assert.equal(ruler.legs.length, 2);
    assert.equal(ruler.legs[0], 15);
  }
  assert.deepEqual(dragRuler(points, grid).legs, [15, 20]);
});

test('squares along the path are coloured by speed: walk, dash, beyond', () => {
  const ruler = dragRuler([cell(3, 4), cell(6, 4), cell(8, 7)], grid, { speed: 30 });
  assert.deepEqual(ruler.cells.map(item => item.band), ['walk', 'walk', 'walk', 'walk', 'walk', 'dash']);
  assert.deepEqual(ruler.cells[0].center, cell(4, 4));
  assert.equal(dragRuler([cell(0, 0), cell(13, 0)], grid, { speed: 30 }).cells.at(-1).band, 'over');
  assert.equal(dragRuler([cell(0, 0), cell(3, 0)], grid).cells.length, 0, 'no speed, no colours');
  assert.equal(rulerBand(30, 30), 'walk');
  assert.equal(rulerBand(35, 30), 'dash');
  assert.equal(rulerBand(65, 30), 'over');
  assert.equal(rulerBand(500, null), 'walk');
});

test('a large token colours every square it covers', () => {
  const start = { x: 120, y: 120 }, end = { x: 180, y: 120 };
  const ruler = dragRuler([start, end], grid, { size: 2, speed: 30 });
  assert.equal(ruler.total, 5);
  assert.equal(ruler.cells.length, 4);
});

test('Alt drags leave the grid and measure straight lines', () => {
  const original = cell(1, 1), grab = original;
  const free = tokenDragPosition(original, grab, { x: 137, y: 101 }, grid, 1, true);
  assert.deepEqual(free, { x: 137, y: 101 });
  assert.deepEqual(tokenDragPosition(original, grab, { x: 137, y: 101 }, grid), cell(2, 1));
  assert.equal(onGrid(free, grid), false);
  assert.equal(onGrid(cell(2, 1), grid), true);
  const ruler = dragRuler([original, free], grid);
  assert.equal(ruler.total, Math.round(freeDistance(original, free, grid) * 100) / 100);
  assert.equal(ruler.total, Math.round(Math.hypot(47, 11) / 60 * 5 * 100) / 100);
  assert.equal(ruler.cells.length, 0);
});

test('hex paths count one hex a step', () => {
  const hex = { ...grid, type: 'hex-pointy' };
  const start = { x: 60, y: 60 }, end = { x: 60 + 60 * Math.sqrt(3) * 3, y: 60 };
  const ruler = dragRuler([start, end], hex, { speed: 10 });
  assert.equal(ruler.total, 15);
  assert.deepEqual(ruler.cells.map(item => item.band), ['walk', 'walk', 'dash']);
});

test('distances are rounded for labels', () => {
  assert.equal(formatDistance(12.3456, 'ft'), '12.35 ft');
  assert.equal(formatDistance(30, ''), '30');
});

test('a token speed is optional and saved with the token', async () => {
  const { tokenSchema, newToken } = await import('../lib/model.ts');
  const token = newToken('Kael');
  assert.equal(tokenSchema.parse(token).speed, undefined);
  assert.equal(tokenSchema.parse({ ...token, speed: 30 }).speed, 30);
  assert.throws(() => tokenSchema.parse({ ...token, speed: -5 }));
});
