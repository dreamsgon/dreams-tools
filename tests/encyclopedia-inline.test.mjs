import test from 'node:test';
import assert from 'node:assert/strict';
import {rollTarget,playerInline,plainExcerpt} from '../lib/encyclopedia/inline.ts';
import {demoWorkspace,playerCampaign} from '../lib/encyclopedia/world-model.ts';

test('only dice formulas are rolls; plain links and numbers stay links',()=>{
 assert.deepEqual(rollTarget('1d20+5'),{formula:'1d20+5',label:null});
 assert.deepEqual(rollTarget('2d8 + 3|Morningstar damage'),{formula:'2d8+3',label:'Morningstar damage'});
 assert.equal(rollTarget('1999'),null);
 assert.equal(rollTarget('Greyhaven'),null);
 assert.equal(rollTarget('demo-mara|Mara Venn'),null);
 assert.equal(rollTarget('1d20*2'),null);
});
test('players get rolls and notes as plain text, never the GM note',()=>{
 assert.equal(playerInline('Roll [[1d20+2]] or [[2d6|Flood damage]].'),'Roll 1d20+2 or Flood damage (2d6).');
 assert.equal(playerInline('A {{hidden tripwire|DC 12 Survival}} here, see [[Greyhaven]].'),'A hidden tripwire here, see [[Greyhaven]].');
 const s=demoWorkspace(),e=s.entries.find(e=>e.id==='demo-greyhaven');e.overviewVisibility='players';e.body='Trap {{wire|SECRET-NOTE}} deals [[2d6|damage]].';
 const text=JSON.stringify(playerCampaign(s,'demo-campaign'));assert(!text.includes('SECRET-NOTE'));assert(text.includes('Trap wire deals damage (2d6).'));
});
test('hover previews are short plain text without secrets',()=>{
 const t=plainExcerpt('# Title\n\nSee [[demo-mara|Mara]] and {{wire|note}}.\n::: secret\nHIDDEN\n:::\n'+'word '.repeat(100),60);
 assert(!t.includes('HIDDEN'));assert(t.startsWith('Title See Mara and wire.'));assert(t.length<=60);
});
