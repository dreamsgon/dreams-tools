import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCount,foldCrumbs} from '../lib/breadcrumbs.ts';

test('fitCount keeps every level when they fit, counting separators between levels', () => {
  // 100 + 50 + 30 = 180, plus two 16px separators = 212
  assert.equal(fitCount([100,50,30],212),3);
  assert.equal(fitCount([100,50,30],211),3,'three levels never fold, even when they do not fit');
  // 4 x 10 = 40, plus three 16px separators = 88
  assert.equal(fitCount([10,10,10,10],88),4);
});

test('fitCount never folds three or fewer levels', () => {
  assert.equal(fitCount([300,300,300],100),3);
  assert.equal(fitCount([300,300],10),2);
});

test('fitCount folds a long trail to the largest k that fits with the "…" button', () => {
  // widths [100 x 6]: all six = 600 + 5*16 = 680.
  // k=5: first 100 + last four 400 = 500, plus 4*16 = 64 -> 564, plus "…" 34 and its separator 16 -> 614.
  // k=4: 100 + 300 = 400, plus 3*16 = 48 -> 448, plus 50 -> 498.
  assert.equal(fitCount([100,100,100,100,100,100],680),6);
  assert.equal(fitCount([100,100,100,100,100,100],620),5);
  assert.equal(fitCount([100,100,100,100,100,100],614),5);
  assert.equal(fitCount([100,100,100,100,100,100],613),4);
  assert.equal(fitCount([100,100,100,100,100,100],498),4);
  assert.equal(fitCount([100,100,100,100,100,100],497),3);
});

test('fitCount uses the real widths, not just counts, when choosing k', () => {
  // widths [200, 40, 40, 40, 60, 80]: total 460 + 5*16 = 540.
  // k=5: 200 + (40+40+60+80) = 420, plus 4*16 = 64 -> 484, plus 50 -> 534.
  // k=4: 200 + (40+60+80) = 380, plus 3*16 = 48 -> 428, plus 50 -> 478.
  const w=[200,40,40,40,60,80];
  assert.equal(fitCount(w,540),6);
  assert.equal(fitCount(w,534),5);
  assert.equal(fitCount(w,533),4);
  assert.equal(fitCount(w,478),4);
  assert.equal(fitCount(w,477),3);
});

test('fitCount falls back to three when no larger k fits', () => {
  // [100 x 5]: k=4 needs 498, so 300 is too small; the minimum of three is returned.
  assert.equal(fitCount([100,100,100,100,100],300),3);
  // [100 x 4] never tries k=4 (the loop starts at k=3), so it is always three when folding.
  assert.equal(fitCount([100,100,100,100],200),3);
});

test('foldCrumbs shows everything when the trail fits the limit or has three or fewer items', () => {
  assert.deepEqual(foldCrumbs(['A','B','C','D'],4),{shown:['A','B','C','D'],hidden:[]});
  assert.deepEqual(foldCrumbs(['A','B','C','D'],6),{shown:['A','B','C','D'],hidden:[]});
  assert.deepEqual(foldCrumbs(['A','B','C'],2),{shown:['A','B','C'],hidden:[]});
});

test('foldCrumbs keeps the first item and the last max-1, hiding the middle in order', () => {
  // 6 items, max 4: first A, last three D E F; hidden B C
  assert.deepEqual(foldCrumbs(['A','B','C','D','E','F'],4),{shown:['A','D','E','F'],hidden:['B','C']});
});

test('foldCrumbs with max 3 keeps the first item and the last two', () => {
  // 7 items: shown A, F, G; hidden B C D E (in order)
  assert.deepEqual(foldCrumbs(['A','B','C','D','E','F','G'],3),{shown:['A','F','G'],hidden:['B','C','D','E']});
  // 5 items: shown A, D, E; hidden B C
  assert.deepEqual(foldCrumbs(['A','B','C','D','E'],3),{shown:['A','D','E'],hidden:['B','C']});
});
