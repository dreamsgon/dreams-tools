import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignCharacters,encyclopediaCharacters,encyclopediaVehicles,pairedCampaign} from '../lib/encyclopedia-characters.ts';
const ch=(id,worldId,campaignId,extra={})=>({id,title:id.toUpperCase(),kind:'character',worldId,campaignId,character:{role:'npc',...extra}});
const raw={
 worlds:[{id:'w1',name:'Aster'},{id:'w2',name:'Brine'},{id:'wt',name:'Template',isTemplate:true}],
 campaigns:[{id:'c1',name:'Dawn',worldId:'w1',maptableCampaignId:'m1'},{id:'c2',name:'Dusk',worldId:'w1'},{id:'c3',name:'Tide',worldId:'w2',maptableCampaignId:'m3'}],
 entries:[ch('own','w1','c1'),ch('shared','w1',null),ch('sibling','w1','c2'),ch('other','w2','c3'),ch('tmpl','wt',null),{id:'place',title:'Place',kind:'place',worldId:'w1',campaignId:'c1'}]
};
const ids=l=>l.map(c=>c.id).sort();
test('a paired campaign lists only its own pages and its world\'s shared pages',()=>{
 assert.deepEqual(ids(campaignCharacters(raw,'m1',false)),['own','shared']);
 assert.deepEqual(ids(campaignCharacters(raw,'m3',false)),['other']);
});
test('showing everything keeps all non-template characters and marks the current world\'s origins',()=>{
 const all=campaignCharacters(raw,'m1',true);
 assert.deepEqual(ids(all),['other','own','shared','sibling']);
 const by=Object.fromEntries(all.map(c=>[c.id,c.origin]));
 assert.deepEqual(by,{own:'This campaign',shared:'Shared lore',sibling:'Dusk',other:undefined});
 assert.equal(all[0].world,'Aster');
});
test('an unpaired or missing campaign shows everything unmarked',()=>{
 for(const id of ['nope',null,undefined,'']){
  const l=campaignCharacters(raw,id,false);
  assert.deepEqual(ids(l),['other','own','shared','sibling']);
  assert.ok(l.every(c=>c.origin===undefined));
 }
 assert.equal(pairedCampaign(raw,'nope'),undefined);
 assert.equal(pairedCampaign(raw,'m1').id,'c1');
});
test('a co-GM workspace with one campaign stays one campaign',()=>{
 const one={worlds:raw.worlds.slice(0,1),campaigns:[raw.campaigns[0]],entries:[ch('own','w1','c1'),ch('shared','w1',null)]};
 assert.deepEqual(ids(campaignCharacters(one,'m1',false)),['own','shared']);
 assert.deepEqual(ids(campaignCharacters(one,'other-id',false)),['own','shared']);
});
test('encyclopediaCharacters still leaves out templates and non-characters',()=>{
 assert.deepEqual(ids(encyclopediaCharacters(raw)),['other','own','shared','sibling']);
});

test('vehicles become large tokens: ships 3×3, the rest 2×2, or bigger when the picture says so',()=>{
 const pic={imageId:'a'.repeat(32),width:400,height:400,x:0.5,y:0.5,size:0.5};
 const v=(id,typeId,extra={})=>({id,title:id.toUpperCase(),kind:'vehicle',worldId:'w1',campaignId:'c1',vehicle:{typeId},...extra});
 const list=encyclopediaVehicles({...raw,entries:[...raw.entries,v('ship','starship'),v('coach','carriage'),v('mine','my-type'),v('big','car',{picture:{...pic,squares:4}}),v('framed','airship',{picture:pic}),{...v('tmpl','car'),worldId:'wt'}]});
 const by=Object.fromEntries(list.map(c=>[c.id,c]));
 assert.deepEqual(Object.keys(by).sort(),['big','coach','framed','mine','ship'],'only vehicles, never from a template world');
 assert.deepEqual([by.ship.squares,by.coach.squares,by.mine.squares,by.big.squares,by.framed.squares],[3,2,2,4,3]);
 assert.equal(by.framed.picture.squares,3,'a picture framed at one square still makes a large token');
 assert.equal(by.ship.picture,undefined);assert.equal(by.ship.detail,'Vehicle · Dawn');
 assert.ok(!encyclopediaCharacters({...raw,entries:[v('ship','starship')]}).length,'vehicles are not characters');
});
