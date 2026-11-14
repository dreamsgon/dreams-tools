import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,newToken} from '../lib/model.ts';
import {filterGalleryTokens,galleryGroups,GALLERY_SIDES,roleSide} from '../lib/token-gallery.ts';
import {toggleArmed,armedAfterPlacing,encyclopediaPlacementId,encyclopediaEntryOf,armedPrompt} from '../lib/token-arming.ts';
import {contrastRatio,formatContrast,readable} from '../lib/contrast.ts';
import {SIDE_COLOURS,sidePatch} from '../lib/token-defaults.ts';

function world(){
 const w=initialWorkspace();
 w.collections.push({id:'camp',name:'Salt Road',kind:'campaign',parentId:null},{id:'camp2',name:'Other',kind:'campaign',parentId:null});
 const mk=(name,disposition,campaign)=>{const t={...newToken(name),disposition};w.tokenLibrary.push(t);w.libraryCampaigns[t.id]=campaign;w.tokenFolderLocations[t.id]=null;return t;};
 const ayla=mk('Ayla','party','camp'),rat=mk('Dock Rat','enemy','camp'),shared=mk('Smuggler','neutral',null),away=mk('Cael','ally','camp2');
 return {w,ayla,rat,shared,away};
}
const f=(over)=>({campaignId:'camp',scope:'campaign',side:'all',query:'',...over});

test('campaign switch keeps this campaign and shared tokens, All campaigns keeps everything',()=>{
 const {w}=world();
 assert.deepEqual(filterGalleryTokens(w,f()).map(t=>t.name).sort(),['Ayla','Dock Rat','Smuggler']);
 assert.equal(filterGalleryTokens(w,f({scope:'all'})).length,4);
});
test('side chips and search combine',()=>{
 const {w}=world();
 assert.deepEqual(filterGalleryTokens(w,f({side:'enemy'})).map(t=>t.name),['Dock Rat']);
 assert.deepEqual(filterGalleryTokens(w,f({scope:'all',side:'ally'})).map(t=>t.name),['Cael']);
 assert.deepEqual(filterGalleryTokens(w,f({query:'  ROAD '})).map(t=>t.name),[]);
 assert.deepEqual(filterGalleryTokens(w,f({query:'dock'})).map(t=>t.name),['Dock Rat']);
 assert.deepEqual(GALLERY_SIDES.map(s=>s.id),['all','party','ally','neutral','enemy']);
});
test('a token without a disposition falls under its role side',()=>{
 const {w}=world();
 const npc={...newToken('Guard'),rosterRole:'npc'};w.tokenLibrary.push(npc);
 assert.deepEqual(filterGalleryTokens(w,f({side:'enemy'})).map(t=>t.name).sort(),['Dock Rat','Guard']);
});
test('groups: folders in tree order with counts, then loose tokens; narrowing hides empty ones',()=>{
 const {w,ayla,rat,shared}=world();
 const folders=[{id:'a',name:'Party',kind:'folder',parentId:null},{id:'b',name:'Docks',kind:'folder',parentId:null},{id:'c',name:'Rats',kind:'folder',parentId:'b'}];
 const loc={[ayla.id]:'a',[rat.id]:'c',[shared.id]:null};
 const tokens=filterGalleryTokens(w,f());
 const groups=galleryGroups(folders,tokens,loc,false);
 assert.deepEqual(groups.map(g=>[g.name,g.tokens.length]),[['Party',1],['Docks',0],['Docks / Rats',1],['Not in a folder',1]]);
 assert.deepEqual(galleryGroups(folders,tokens,loc,true).map(g=>g.name),['Party','Docks / Rats','Not in a folder']);
 assert.deepEqual(galleryGroups(folders,[],{},true),[]);
});
test('a token whose folder is not listed is still shown, in no folder',()=>{
 const {ayla}=world();
 const groups=galleryGroups([],[ayla],{[ayla.id]:'gone'},false);
 assert.deepEqual(groups.map(g=>[g.name,g.tokens.length]),[['Not in a folder',1]]);
});
test('arming: click arms, same tile again disarms, another tile takes over',()=>{
 const a={id:'1',name:'Smuggler',source:'library'},b={id:'2',name:'Ayla',source:'library'};
 assert.equal(toggleArmed(null,a),a);
 assert.equal(toggleArmed(a,a),null);
 assert.equal(toggleArmed(a,b),b);
});
test('placing disarms unless Shift keeps it armed',()=>{
 const a={id:'1',name:'Smuggler',source:'library'};
 assert.equal(armedAfterPlacing(a,false),null);
 assert.equal(armedAfterPlacing(a,true),a);
 assert.equal(armedPrompt(a),'Click the map to place Smuggler');
});
test('Encyclopedia placement ids round-trip and never match a saved token id',()=>{
 const id=encyclopediaPlacementId('bram');
 assert.equal(encyclopediaEntryOf(id),'bram');
 assert.equal(encyclopediaEntryOf('4d2f'),null);
 assert.deepEqual(roleSide,{pc:'party',companion:'ally',npc:'neutral',creature:'enemy'});
});
test('contrast helper matches known values and flags poor colours',()=>{
 assert.equal(Math.round(contrastRatio('#000000','#ffffff')),21);
 assert.equal(contrastRatio('#ffffff','#ffffff'),1);
 assert.ok(Math.abs(contrastRatio('#ffffff','#777777')-4.48)<.02);
 assert.equal(readable(contrastRatio('#ffffff','#777777')),false);
 assert.equal(formatContrast(4.49),'4.4 : 1');
 for(const c of Object.values(SIDE_COLOURS)) assert.ok(readable(contrastRatio('#ffffff',c.fill)));
 assert.equal(contrastRatio('white','#000000'),contrastRatio('#xyz','#000000'));
});
test('changing side keeps custom colours, and only keeps side colours that were already on',()=>{
 const custom={...newToken('Custom'),sideColours:false,color:'#123456'};
 assert.deepEqual(sidePatch(custom,'enemy'),{disposition:'enemy'});
 const following={...newToken('Following'),sideColours:true};
 assert.deepEqual(sidePatch(following,'ally'),{disposition:'ally',sideColours:true});
 const picture={...newToken('Picture'),assetId:'a1'};
 assert.deepEqual(sidePatch(picture,'party'),{disposition:'party',useDispositionColor:true});
});

test('a saved token placed again gets the next number', async () => {
  const { placedName } = await import('../lib/token-clipboard.ts');
  assert.equal(placedName('Goblin', ['Bram']), 'Goblin');
  assert.equal(placedName('Goblin', ['Goblin']), 'Goblin 2');
  assert.equal(placedName('Goblin', ['Goblin', 'Goblin 2']), 'Goblin 3');
  assert.equal(placedName('Dock Rat', ['Dock Rat 1', 'Dock Rat 2']), 'Dock Rat 3');
  assert.equal(placedName('Dock Rat', ['Dock Rats 1']), 'Dock Rat');
});
