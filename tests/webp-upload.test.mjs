import test from 'node:test';
import assert from 'node:assert/strict';
import { convertible, pickUpload, toWebp } from '../lib/webp-upload.ts';

test('webp uploads: only still PNG and JPEG pictures are converted', () => {
  assert.equal(convertible('image/png'), true);
  assert.equal(convertible('image/jpeg'), true);
  for (const type of ['image/webp', 'image/gif', 'image/svg+xml', 'application/json', '']) assert.equal(convertible(type), false, type);
});

test('webp uploads: the WebP copy is used only when the browser made a real, smaller one', () => {
  const png = new Blob([new Uint8Array(100)], { type: 'image/png' });
  const small = new Blob([new Uint8Array(40)], { type: 'image/webp' });
  assert.equal(pickUpload(png, small), small);
  assert.equal(pickUpload(png, new Blob([new Uint8Array(140)], { type: 'image/webp' })), png, 'larger keeps the original');
  assert.equal(pickUpload(png, new Blob([new Uint8Array(40)], { type: 'image/png' })), png, 'a browser that cannot encode WebP returns PNG');
  assert.equal(pickUpload(png, new Blob([], { type: 'image/webp' })), png);
  assert.equal(pickUpload(png, null), png);
});

test('webp uploads: pictures that are not PNG or JPEG pass through untouched', async () => {
  const gif = new Blob([new Uint8Array(10)], { type: 'image/gif' });
  assert.equal(await toWebp(gif), gif);
});

test('webp uploads: the account choice is asked once, and signed-out or failed requests keep the default', async () => {
  const load = async () => import(`../lib/webp-upload.ts?${Math.random()}`);
  const answer = body => async () => ({ ok: true, json: async () => body });
  let m = await load(); let calls = 0;
  const off = async () => { calls++; return { ok: true, json: async () => ({ signedIn: true, webpUploads: false }) }; };
  assert.equal(await m.webpUploadsOn(off), false);
  assert.equal(await m.webpUploadsOn(off), false); assert.equal(calls, 1, 'cached for the page');
  m.rememberWebpUploads(true); assert.equal(await m.webpUploadsOn(off), true);
  m = await load(); assert.equal(await m.webpUploadsOn(answer({ signedIn: false })), true);
  m = await load(); assert.equal(await m.webpUploadsOn(async () => { throw Error('offline'); }), true);
  m = await load(); assert.equal(await m.webpUploadsOn(async () => ({ ok: false, json: async () => ({}) })), true);
});
