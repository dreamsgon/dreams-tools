import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,newToken,tokenSchema,workspaceSchema,moveAssetToCampaign} from '../lib/model.ts';
test('campaign party marker persists separately from individual party members',()=>{
 const w=initialWorkspace();
 w.collections=[{id:'a',kind:'campaign',name:'A',parentId:null}];
 const marker={...newToken('Party'),id:'marker',rosterRole:'party',partyMarker:true,showHp:false,hp:0,maxHp:1};
 w.tokenLibrary=[marker,{...newToken('Hero'),id:'hero',rosterRole:'party'}];w.libraryCampaigns={marker:'a',hero:'a'};
 w.scenes[0].tokens.push({...marker,id:'placed'});
 const restored=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
 assert.equal(restored.tokenLibrary[0].partyMarker,true);assert.equal(restored.tokenLibrary[0].showHp,false);
 assert.equal(restored.tokenLibrary[1].partyMarker,undefined);assert.equal(restored.scenes[0].tokens[0].partyMarker,true);
 assert.equal(restored.libraryCampaigns.marker,'a');
});
test('legacy tokens stay in library and campaign roster roles survive saves',()=>{
 const legacy=newToken();delete legacy.rosterRole;assert.equal(tokenSchema.parse(legacy).rosterRole,'library');
 const w=initialWorkspace();w.collections=[{id:'a',kind:'campaign',name:'A',parentId:null},{id:'b',kind:'campaign',name:'B',parentId:null}];
 w.tokenLibrary=[{...newToken('NPC'),id:'npc',rosterRole:'npc'},{...newToken('Hero'),id:'hero',rosterRole:'party'}];w.libraryCampaigns={npc:'a',hero:'b'};
 const restored=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));assert.equal(restored.tokenLibrary[0].rosterRole,'npc');assert.equal(restored.libraryCampaigns.hero,'b');
});
test('moving shared artwork does not move campaign NPCs or party members',()=>{
 const w=initialWorkspace();w.tokenLibrary=[{...newToken('Hero'),id:'hero',assetId:'art',rosterRole:'party'},{...newToken('NPC'),id:'npc',assetId:'art',rosterRole:'npc'}];w.libraryCampaigns={hero:'a',npc:'a'};
 moveAssetToCampaign(w,'art','b');assert.equal(w.libraryCampaigns.hero,'a');assert.equal(w.libraryCampaigns.npc,'a');
});
