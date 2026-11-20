import test from 'node:test';
import assert from 'node:assert/strict';
import { centredCrop, clampCrop, cropSource, zoomCrop } from '../lib/avatar-crop.ts';

const F = 260;

test('avatar crop: a new picture starts centred, covering the frame', () => {
  const c = centredCrop(800, 400, F);
  assert.equal(c.zoom, 1);
  assert.equal(c.y, 0);
  assert.equal(c.x, (F - 800 * (F / 400)) / 2);
  assert.deepEqual(cropSource(c, 800, 400, F), { x: 200, y: 0, side: 400 });
});

test('avatar crop: the picture can never leave a gap in the frame', () => {
  assert.deepEqual(clampCrop({ zoom: 1, x: 50, y: 50 }, 400, 400, F), { zoom: 1, x: 0, y: 0 });
  assert.deepEqual(clampCrop({ zoom: 1, x: -999, y: -999 }, 400, 400, F), { zoom: 1, x: 0, y: 0 });
  assert.equal(clampCrop({ zoom: .2, x: 0, y: 0 }, 400, 400, F).zoom, 1, 'never smaller than the frame');
  assert.deepEqual(clampCrop({ zoom: Number.NaN, x: Number.NaN, y: 0 }, 400, 400, F), { zoom: 1, x: 0, y: 0 });
});

test('avatar crop: zooming keeps the point under the pointer still and crops less of the picture', () => {
  const start = centredCrop(400, 400, F), z = zoomCrop(start, 2, 400, 400, F);
  const src = cropSource(z, 400, 400, F);
  assert.equal(src.side, 200);
  assert.deepEqual([src.x, src.y], [100, 100], 'zoomed about the centre');
  const corner = zoomCrop(start, 2, 400, 400, F, { x: 0, y: 0 });
  assert.deepEqual(cropSource(corner, 400, 400, F), { x: 0, y: 0, side: 200 }, 'zoomed about the top-left corner');
});
