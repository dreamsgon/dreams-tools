import test from 'node:test';
import assert from 'node:assert/strict';
import { BANNER_ZOOM_MAX, bannerBackground, bannerMoved, bannerZoomed, cleanFraming } from '../lib/banner-frame.ts';
import { lookSchema } from '../lib/encyclopedia/look.ts';
import { THEME_PRESETS, framedBanner, liveTheme } from '../lib/campaign-theme/model.ts';

// A 2000×1000 picture in a 1000×250 box: covering it takes 1000×500, so it can only move up and down.
const pic = { width: 2000, height: 1000, y: .5 }, box = { width: 1000, height: 250 };

test('banner framing: plain cover until zoomed; the chosen point stays put', () => {
  assert.deepEqual(bannerBackground(pic, box), { position: '50% 50%', size: 'cover' });
  assert.deepEqual(bannerBackground({ ...pic, x: .2, y: .75 }), { position: '20% 75%', size: 'cover' });
  assert.deepEqual(bannerBackground({ ...pic, zoom: 2 }, box), { position: '50% 50%', size: '2000px 1000px' });
  assert.equal(bannerBackground({ ...pic, zoom: 2 }, null).size, 'cover', 'before the box is measured');
});

test('banner framing: dragging follows the pointer, up to the picture’s edges', () => {
  // 250 pixels of picture to spare: dragging it down 50 shows a fifth of that more of the top.
  assert.equal(bannerMoved(pic, box, 0, 50).y, .3);
  assert.equal(bannerMoved(pic, box, 0, 1000).y, 0, 'stops at the top edge');
  assert.equal(bannerMoved(pic, box, 300, 0).x, .5, 'no room to move sideways without zoom');
  const zoomed = bannerZoomed(pic, 2); // 2000×1000: 1000 to spare across, 750 down
  assert.equal(bannerMoved(zoomed, box, 250, 0).x, .25);
  assert.equal(bannerMoved(zoomed, box, -250, -375).y, 1);
  assert.equal(bannerZoomed(pic, 9).zoom, BANNER_ZOOM_MAX);
  assert.equal(bannerZoomed(pic, .3).zoom, 1);
});

test('banner framing: saved without defaults, and the look keeps x and zoom', () => {
  assert.deepEqual(cleanFraming({ ...pic, x: .5, zoom: 1 }), pic);
  assert.deepEqual(cleanFraming({ ...pic, x: .33333, zoom: 1.256 }), { ...pic, x: .333, zoom: 1.26 });
  const banner = { imageId: '44444444-4444-4444-8444-444444444444', ...pic, x: .3, zoom: 1.5 };
  assert.deepEqual(lookSchema.parse({ banner }).banner, banner);
  assert.equal(lookSchema.safeParse({ banner: { ...banner, zoom: BANNER_ZOOM_MAX + 1 } }).success, false);
});

test('banner framing: every theme draws the forum banner with the GM’s framing, saved copies too', () => {
  const old = '.board-head.has-art { background: linear-gradient(#0000, #000a), var(--banner) center var(--banner-y, 50%) / cover no-repeat; }';
  assert.match(framedBanner(old), /var\(--banner\) var\(--banner-x, 50%\) var\(--banner-y, 50%\) \/ var\(--banner-size, cover\) no-repeat/);
  for (const t of THEME_PRESETS) {
    const css = liveTheme({ ...t, updatedAt: '2026-11-21T00:00:00Z' }, 'forum').css;
    assert.doesNotMatch(css, /var\(--banner\)\s+center\s+var\(--banner-y/, t.name);
  }
});
