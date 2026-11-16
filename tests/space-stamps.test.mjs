import test from 'node:test';
import assert from 'node:assert/strict';
import {stamps,stampById,stampCategories,findStamps,stampBox} from '../lib/map-stamps.ts';
import {spaceStamps} from '../lib/space-stamps.ts';

test('space stamps join the library with their own categories', () => {
  assert.ok(spaceStamps.length>=60);
  assert.equal(new Set(stamps.map(s=>s.id)).size,stamps.length,'every stamp id is unique');
  for(const c of ['Stars','Worlds','Space','Stations and ships'])assert.ok(stampCategories.includes(c),c);
  for(const s of spaceStamps){
    assert.match(s.id,/^space-[a-z0-9-]+$/);
    assert.ok(stampCategories.includes(s.category),`${s.name}: ${s.category}`);
    assert.ok(s.w>=1&&s.h>=1&&s.w<=4&&s.h<=4,`${s.name} is a sensible size`);
    assert.ok(s.parts.length>0);
    for(const p of s.parts){assert.doesNotMatch(p.d,/NaN|undefined|Infinity/,s.name);assert.ok(p.fill||p.stroke,`${s.name}: every part is drawn`);}
    assert.equal(stampById(s.id),s);
  }
  assert.equal(stampById('chest').name,'Chest','the dungeon stamps are still there');
});

test('space stamps can be found by name or category and placed like any stamp', () => {
  assert.ok(findStamps('black hole').some(s=>s.id==='space-black-hole'));
  assert.ok(findStamps('worlds').length>=14,'a category name finds its stamps');
  assert.ok(findStamps('jump').some(s=>s.id==='space-jump-gate'));
  const [a,b]=stampBox(stampById('space-ringed-giant'),{x:100,y:100},null,50,1000,1000);
  assert.equal(b.x-a.x,150);assert.equal(b.y-a.y,100,'3 × 2 squares');
});
