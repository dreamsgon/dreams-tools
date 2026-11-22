import test from 'node:test';
import assert from 'node:assert/strict';
import {typeGroups,typeGroupOf} from '../lib/encyclopedia/type-groups.ts';

const now='2026-11-22T00:00:00.000Z';
const e=(id,title,kind,parentId=null)=>({id,worldId:'w',campaignId:'c',parentId,title,kind,body:'',updatedAt:now});

test('Campaign Notes group by type: folders go with what is inside them', () => {
  const pages=[e('cult','Cultists','folder'),e('g','Galinix','character','cult'),e('h','Hazirawn','character','cult'),e('raid','Raiders','folder'),e('r1','Raider camp','place','raid'),e('r2','Langdedrosa','character','raid'),e('r3','Rezmir','character','raid'),
    e('lev','Levina','character'),e('s','Session notes','folder'),e('s1','Session 1','session','s'),e('loose','Loose threads','tasks'),e('empty','Someday','folder'),e('town','Greenest','place')];
  const groups=typeGroups(pages);
  assert.deepEqual(groups.map(g=>g.label),['Characters','Places','Sessions','Notes','Folders']);
  assert.deepEqual(groups[0].pages.map(p=>p.title),['Cultists','Raiders','Levina']);
  assert.deepEqual(groups[1].pages.map(p=>p.title),['Greenest']);
  assert.equal(typeGroupOf(pages,pages.find(p=>p.id==='s')),'sessions');
  assert.equal(typeGroupOf(pages,pages.find(p=>p.id==='empty')),'folders');
  assert.equal(groups.flatMap(g=>g.pages).length,pages.filter(p=>p.parentId===null).length,'every top-level page shows once');
});
