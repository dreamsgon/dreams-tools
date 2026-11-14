import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenInitials,sceneInitials} from '../lib/token-initials.ts';

test('examples',()=>{
 for(const [n,e] of [['Gorim Saelac','GS'],['Goblin 2','GO2'],['Goblin Archer 1','GA1'],['Bram','BR'],['A','A'],['12','12'],['  ',''],['','']]) assert.equal(tokenInitials(n),e,n);
});
test('punctuation, accents, non-Latin and astral characters',()=>{
 assert.equal(tokenInitials('(Elite) Guard'),'EG');
 assert.equal(tokenInitials('Émile Zola'),'ÉZ');
 assert.equal(tokenInitials('éclair'),'ÉC');
 assert.equal(tokenInitials('Ωmega'),'ΩM');
 assert.equal(tokenInitials('魔王 3'),'魔王3');
 assert.equal(tokenInitials('𐐀𐐁𐐂'),'𐐀𐐁');
 assert.equal(tokenInitials('--- 4'),'4');
});
const ids=(names)=>names.map((name,i)=>({id:String(i),name}));
test('clashes lengthen the first word',()=>{
 const m=sceneInitials(ids(['Gorim Saelac','Grey Sentinel']));
 assert.equal(m.get('0'),'GOS');assert.equal(m.get('1'),'GRS');
 const s=sceneInitials(ids(['Goblin','Gorgon']));
 assert.equal(s.get('0'),'GOB');assert.equal(s.get('1'),'GOR');
});
test('no clash keeps base; identical names share initials',()=>{
 const m=sceneInitials(ids(['Goblin','Goblin','Bram']));
 assert.deepEqual([...m.values()],['GO','GO','BR']);
 const n=sceneInitials(ids(['Goblin 1','Goblin 2','Gorgon 1']));
 assert.deepEqual([...n.values()],['GOB1','GO2','GOR1']); // Gorgon 1 clashes with Goblin 1; Goblin 2 stays short
});
test('clash between numbered names is resolved',()=>{
 const m=sceneInitials(ids(['Goblin 1','Gorgon 1']));
 assert.equal(m.get('0'),'GOB1');assert.equal(m.get('1'),'GOR1');
});
test('order independent',()=>{
 const names=['Gorim Saelac','Grey Sentinel','Goblin','Gorgon','Goblin','Bram','Brand','Bran'];
 const a=sceneInitials(names.map((name,i)=>({id:name+i,name})));
 const rev=[...names].reverse();
 const b=sceneInitials(rev.map(name=>({id:name,name})));
 for(const n of new Set(names)) assert.equal(a.get(n+names.indexOf(n)),b.get(n));
});
test('limit of four letters, then the clash stays',()=>{
 const m=sceneInitials(ids(['Aaaaax','Aaaaay']));
 assert.equal(m.get('0'),'AAAA');assert.equal(m.get('1'),'AAAA');
 const k=sceneInitials(ids(['Aaaaax Bob','Aaaaay Bob']));
 assert.equal(k.get('0'),'AAAB');
 assert.equal(sceneInitials(ids(['Ab','Ac'])).get('0'),'AB');
});
test('500 tokens fast and stable',()=>{
 const t=Array.from({length:500},(_,i)=>({id:'t'+i,name:`Gob${i%37}x ${i}`}));
 const s=Date.now();const m=sceneInitials(t);
 assert.ok(Date.now()-s<500);assert.equal(m.size,500);
});
