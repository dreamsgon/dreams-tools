import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, newToken, tokenSchema } from '../lib/model.ts';
import { normalizeAngle, turnToken, flipToken, facingFromPointer, stepSize, sizeLabel, sizeFromHandle, resizeToken, resetTransform, footprint } from '../lib/token-transform.ts';

const grid = { ...initialWorkspace().scenes[0].grid, type: 'square', size: 70, offsetX: 0, offsetY: 0, snap: true };

test('turning wraps around and flips toggle', () => {
  assert.equal(normalizeAngle(270), -90);
  assert.equal(normalizeAngle(-180), 180);
  const token = newToken('Ogre');
  turnToken(token, 90); turnToken(token, 135);
  assert.equal(token.facing, -135);
  flipToken(token, 'x');
  assert.equal(token.flipX, true);
  flipToken(token, 'x');
  assert.equal(token.flipX, undefined);
  flipToken(token, 'y');
  resetTransform(token);
  assert.deepEqual([token.facing, token.flipX, token.flipY], [undefined, undefined, undefined]);
});

test('the turn handle snaps to 15° unless Alt is held', () => {
  const centre = { x: 100, y: 100 };
  assert.equal(facingFromPointer(centre, { x: 100, y: 0 }), 0);
  assert.equal(facingFromPointer(centre, { x: 200, y: 100 }), 90);
  assert.equal(facingFromPointer(centre, { x: 100 + 100 * Math.sin(0.4), y: 100 - 100 * Math.cos(0.4) }), 30);
  assert.equal(facingFromPointer(centre, { x: 100 + 100 * Math.sin(0.4), y: 100 - 100 * Math.cos(0.4) }, true), 23);
});

test('sizes step through common sizes and read as D&D sizes', () => {
  assert.equal(stepSize(1, 1), 2);
  assert.equal(stepSize(1, -1), 0.5);
  assert.equal(stepSize(0.25, -1), 0.25);
  assert.equal(stepSize(20, 1), 20);
  assert.equal(stepSize(1.5, 1), 2);
  assert.equal(sizeLabel(1), 'Medium 1×1');
  assert.equal(sizeLabel(2), 'Large 2×2');
  assert.equal(sizeLabel(0.5), 'Tiny ½');
  assert.equal(sizeLabel(4), 'Gargantuan 4×4');
});

test('resizing keeps the top-left corner and lands on the grid', () => {
  const token = { ...newToken('Wolf'), x: 175, y: 105, size: 1 };
  assert.deepEqual(footprint(token, grid), { left: 140, top: 70, side: 70 });
  assert.equal(sizeFromHandle(token, grid, { x: 140 + 150, y: 70 + 120 }), 2);
  assert.equal(sizeFromHandle(token, grid, { x: 140 + 30, y: 70 + 20 }), 0.5);
  assert.equal(sizeFromHandle(token, grid, { x: 140 + 150, y: 70 + 120 }, true), 2.15);
  resizeToken(token, grid, 2);
  assert.deepEqual([token.x, token.y, token.size], [210, 140, 2]);
  resizeToken(token, grid, 99);
  assert.equal(token.size, 20);
});

test('facing and flips are optional and saved with the token', () => {
  const token = newToken('Ogre');
  assert.equal(tokenSchema.parse(token).facing, undefined);
  const parsed = tokenSchema.parse({ ...token, facing: 45, flipX: true });
  assert.deepEqual([parsed.facing, parsed.flipX, parsed.flipY], [45, true, undefined]);
});
