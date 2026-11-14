import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkspace,defaultCharacter,workspaceSchema} from '../lib/encyclopedia/world-model.ts';
import {defaultOrg} from '../lib/encyclopedia/org-profile.ts';
import {tieTypesOf} from '../lib/encyclopedia/ties.ts';
import {webTies} from '../lib/encyclopedia/tie-web.ts';
import {familyGraph,familyLinks,familyTree} from '../lib/encyclopedia/family-tree.ts';
import {addFamily,addSuggestions,defaultFamilyOptions,defaultTieAmounts,familyName,generateFamily,generatedLinks,givenName,nameStyles,suggestTies} from '../lib/encyclopedia/relationship-generators.ts';
import {seeded} from '../lib/encyclopedia/world-generator.ts';

const C='demo-campaign',W='demo-world',T='2026-11-14T10:00:00.000Z';
const page=(id,title,kind,extra={})=>({id,worldId:W,campaignId:C,parentId:null,title,kind,body:'',updatedAt:T,overviewVisibility:'players',...extra});
const char=(id,title,extra={})=>page(id,title,'character',{character:defaultCharacter(),...extra});
let n=0;const ids=()=>`gen-${++n}`;
const types=tieTypesOf(null);

test('names come from our own lists, in each style', () => {
 const rng=seeded('names');
 for(const style of nameStyles){const g=givenName(rng,style),f=familyName(rng,style);assert.match(g,/^\p{Lu}/u);assert.match(f,/^\p{Lu}[\p{Ll}]+$/u,f);}
});

test('the same options give the same family, and a new seed another one', () => {
 const o=defaultFamilyOptions('one');
 assert.deepEqual(generateFamily(o),generateFamily(o));
 assert.notDeepEqual(generateFamily(o).people.map(p=>p.name),generateFamily({...o,seed:'two'}).people.map(p=>p.name));
});

test('a family around a character keeps their family name and grows up and down', () => {
 const f=generateFamily({...defaultFamilyOptions('sable'),above:2,below:true,children:'many',twists:'quiet'},{id:'sable',title:'Sable Duun'});
 assert.equal(f.surname,'Duun');
 assert.equal(f.people[0].existingId,'sable');
 const parentOf=k=>f.ties.filter(t=>t.typeId==='parent'&&t.to===k).map(t=>t.from);
 assert.equal(parentOf('p0').length,2);
 // Grandparents above the parents, and children below.
 const [a,b]=parentOf('p0');
 assert.ok(parentOf(a).length===2||parentOf(b).length===2);
 assert.ok(f.ties.filter(t=>t.typeId==='parent'&&t.from==='p0').length>=3);
 assert.ok(f.ties.some(t=>t.typeId==='partner'&&(t.from==='p0'||t.to==='p0')));
 assert.ok(f.people.filter(p=>p.born).every(p=>p.name.endsWith(' Duun')));
 assert.ok(!f.ties.some(t=>t.gm));
 // It draws as a tree with the same layout.
 const tree=familyTree(familyGraph(generatedLinks(f,types)),['p0']);
 assert.ok(tree.units.length>=3);
});

test('options: no parents, no children, and partners taking the name', () => {
 const f=generateFamily({...defaultFamilyOptions('x'),above:0,below:false,twists:'quiet'});
 assert.equal(f.people.length,1);assert.equal(f.ties.length,0);
 const t=generateFamily({...defaultFamilyOptions('y'),takeName:true,twists:'quiet'});
 assert.ok(t.people.every(p=>p.name.endsWith(` ${t.surname}`)));
 assert.ok(t.people.some(p=>p.note?.startsWith('Born a ')));
});

test('scandalous families have twists, GM only with a cover story where one fits', () => {
 let seen=0;
 for(let i=0;i<20;i++){const f=generateFamily({...defaultFamilyOptions(`s${i}`),twists:'scandalous'});
  const gm=f.ties.filter(t=>t.gm);seen+=gm.length+f.people.filter(p=>p.note?.startsWith('Estranged')).length+f.ties.filter(t=>t.typeId==='rival').length;
  for(const t of gm)if(t.typeId==='parent')assert.equal(t.cover.typeId,'ward');}
 assert.ok(seen>=20);
});

test('adding a family saves valid characters, ties and an organization', () => {
 const s=demoWorkspace();s.entries.push(char('sable','Sable Duun'));
 const f=generateFamily({...defaultFamilyOptions('save'),above:2,house:true,twists:'scandalous'},{id:'sable',title:'Sable Duun'});
 const r=addFamily(s,f,{worldId:W,campaignId:C},types,T,ids);
 assert.ok(!('error' in r));
 assert.ok(workspaceSchema.safeParse(r.s).success,JSON.stringify(workspaceSchema.safeParse(r.s).error?.issues?.[0]));
 assert.equal(r.s.entries.length,s.entries.length+f.people.length-1+1);
 const house=r.s.entries.find(e=>e.id===r.houseId);
 assert.equal(house.title,'The Duun family');assert.equal(house.org.type,'Family');
 assert.ok(house.org.blocks.find(b=>b.kind==='members').members.some(m=>m.entryId==='sable'));
 // Every family tie lands, and the family draws from the saved ties.
 const people=new Set(r.s.entries.filter(e=>e.kind==='character').map(e=>e.id));
 const g=familyGraph(familyLinks(webTies(r.s,W,C),id=>people.has(id)));
 assert.equal(g.links.length,generatedLinks(f,types).length);
 assert.ok(r.s.entries.filter(e=>e.title.endsWith('Duun')).every(e=>e.overviewVisibility==='gm'||e.id==='sable'));
});

test('a family started from shared lore is made in the shared lore', () => {
 const s=demoWorkspace();s.entries.push({...char('elder','Elder Mott'),campaignId:null});
 const f=generateFamily(defaultFamilyOptions('lore'),{id:'elder',title:'Elder Mott'});
 const r=addFamily(s,f,{worldId:W,campaignId:null},types,T,ids);
 assert.ok(r.s.entries.filter(e=>e.title.endsWith('Mott')&&e.id!=='elder').every(e=>e.campaignId===null));
 assert.ok(workspaceSchema.safeParse(r.s).success);
});

test('suggested ties fit their pages, skip pairs already tied, and keep what is kept', () => {
 const pages=[char('a','Ottoline Fenn'),char('b','Brother Hesk'),char('c','Wren'),page('o','The Lanternwrights','faction',{org:defaultOrg()}),page('d','Harrowmere Docks','place'),page('v','The Patient Heron','vehicle'),page('l','Mercy of Thorns','lore')];
 const amounts={...defaultTieAmounts(),conflict:'lots',dealings:'lots',belonging:'lots'};
 const list=suggestTies(pages,types,amounts,'one',{tied:new Set(['a|b'])});
 assert.ok(list.length>=6);
 const byId=new Map(pages.map(p=>[p.id,p]));
 for(const x of list){const t=types.find(t=>t.id===x.typeId);assert.ok(t.from.includes(byId.get(x.fromId).kind)&&t.to.includes(byId.get(x.toId).kind),`${x.typeId} ${x.fromId}->${x.toId}`);assert.ok(x.note.length>10);}
 assert.ok(!list.some(x=>[x.fromId,x.toId].sort().join('|')==='a|b'));
 const pairs=list.map(x=>[x.fromId,x.toId].sort().join('|'));assert.equal(new Set(pairs).size,pairs.length);
 assert.ok(!list.some(x=>types.find(t=>t.id===x.typeId).group==='family'));
 // Rerolling keeps what is kept.
 const kept=[{...list[0],keep:true}],again=suggestTies(pages,types,amounts,'two',{keep:kept});
 assert.deepEqual(again[0],kept[0]);
 assert.deepEqual(suggestTies(pages,types,amounts,'one'),suggestTies(pages,types,amounts,'one'));
 // Everything off: nothing.
 assert.equal(suggestTies(pages,types,Object.fromEntries(Object.keys(amounts).map(k=>[k,'off'])),'x').length,0);
});

test('adding suggestions saves them as ties on the page they start from', () => {
 const s=demoWorkspace();s.entries.push(char('a','Ottoline Fenn'),char('b','Brother Hesk'));
 const r=addSuggestions(s,[{key:'1',fromId:'a',toId:'b',typeId:'rival',gm:true,note:'Old grudge'},{key:'2',fromId:'a',toId:'b',typeId:'owns',gm:false,note:''}],types,T,ids);
 assert.equal(r.added,1);
 const a=r.s.entries.find(e=>e.id==='a');
 assert.deepEqual({...a.ties[0],id:'x'},{id:'x',toId:'b',typeId:'rival',note:'Old grudge',gm:true});
 assert.ok(workspaceSchema.safeParse(r.s).success);
});

test('nobody is offered two marriages or betrothals', () => {
 const pages=Array.from({length:8},(_,i)=>char(`c${i}`,`Person ${i}`));
 const amounts={...Object.fromEntries(Object.keys(defaultTieAmounts()).map(k=>[k,'off'])),family:'lots',heart:'lots'};
 for(let i=0;i<10;i++){
  const list=suggestTies(pages,types,amounts,`m${i}`,{spoken:new Set(['c0'])});
  const count=new Map();for(const x of list)if(['partner','betrothed'].includes(x.typeId))for(const id of [x.fromId,x.toId])count.set(id,(count.get(id)??0)+1);
  assert.ok([...count.values()].every(n=>n===1));assert.ok(!count.has('c0'));
 }
});
