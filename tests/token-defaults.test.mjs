import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWorkspace, newToken, workspaceSchema } from '../lib/model.ts';
import { resolvedToken, resolveTokenForCampaign, tokenCampaignId, tokenZeroHpPolicy, DISPOSITION_COLORS } from '../lib/token-defaults.ts';
import { applyWorkspaceHpStates } from '../lib/token-hp-state.ts';
function fixture() {
 const w=initialWorkspace();
 w.collections=[{id:'a',name:'A',kind:'campaign',parentId:null,tokenDefaults:{partyZeroHp:'unconscious',npcZeroHp:'dead',showName:false,showHp:false}},{id:'b',name:'B',kind:'campaign',parentId:null,tokenDefaults:{partyZeroHp:'off',npcZeroHp:'unconscious',showName:true,showHp:true}},{id:'folder',name:'Folder',kind:'folder',parentId:'a'}];
 w.scenes[0].containerId='folder'; return w;
}
test('campaign resolution traverses scene folders and preserves explicit and legacy visibility',()=>{
 const w=fixture(),id=w.scenes[0].id,t=newToken();
 assert.equal(tokenCampaignId(w,id),'a');
 assert.equal(resolvedToken(w,id,t).showName,false);
 assert.equal(resolveTokenForCampaign(w,'b',{...t,showName:false}).showName,false);
 assert.equal(resolveTokenForCampaign(w,'b',{...t,showName:false,nameVisibility:'inherit'}).showName,true);
 assert.equal(resolvedToken(w,id,{...t,nameVisibility:'show',hpVisibility:'hide'}).showName,true);
 assert.equal(resolvedToken(w,id,{...t,nameVisibility:'show',hpVisibility:'hide'}).showHp,false);
 assert.equal(tokenCampaignId(w,'missing'),null);
 w.collections[2].parentId='folder';assert.equal(tokenCampaignId(w,id),null);
});
test('disposition colors are opt in and role defaults do not overwrite custom borders',()=>{
 const w=fixture(),t={...newToken(),borderColor:'#123456',useDispositionColor:undefined};
 assert.equal(resolveTokenForCampaign(w,'a',t).borderColor,'#123456');
 for(const [role,disposition] of [['npc','enemy'],['party','party'],['library','neutral']]) assert.equal(resolveTokenForCampaign(w,'a',{...t,rosterRole:role,useDispositionColor:true}).borderColor,DISPOSITION_COLORS[disposition]);
 assert.equal(resolveTokenForCampaign(w,'a',{...t,disposition:'ally',useDispositionColor:true}).borderColor,DISPOSITION_COLORS.ally);
 assert.equal(t.borderColor,'#123456');
});
test('campaign defaults persist through schema validation and reject invalid fields',()=>{
 const w=fixture();assert.deepEqual(workspaceSchema.parse(w).collections[0].tokenDefaults,w.collections[0].tokenDefaults);
 w.collections[0].tokenDefaults.npcZeroHp='active';assert.throws(()=>workspaceSchema.parse(w));
});
test('HP inherits independently for scenes and library and exempts party markers',()=>{
 const w=fixture();w.scenes[0].tokens=[{...newToken(),id:'party',rosterRole:'party',hp:5},{...newToken(),id:'npc',rosterRole:'npc',hp:5},{...newToken(),id:'marker',rosterRole:'party',partyMarker:true,hp:5}];
 w.tokenLibrary=[{...newToken(),id:'library',rosterRole:'npc',hp:5}];w.libraryCampaigns.library='b';
 const next=structuredClone(w);for(const t of [...next.scenes[0].tokens,...next.tokenLibrary]) t.hp=0;
 applyWorkspaceHpStates(w,next);
 assert.equal(next.scenes[0].tokens.find(t=>t.id==='party').status,'unconscious');
 assert.equal(next.scenes[0].tokens[0].id,'npc');assert.equal(next.scenes[0].tokens[0].status,'dead');
 assert.equal(next.scenes[0].tokens.find(t=>t.id==='marker').status,undefined);
 assert.equal(next.tokenLibrary[0].status,'unconscious');
 assert.equal(tokenZeroHpPolicy(w,'a',{...next.scenes[0].tokens[2],partyMarker:true,zeroHpStatus:'dead'}),'dead');
});
test('campaign policy changes apply at zero and later explicit corpse order stays intact',()=>{
 const before=fixture();before.scenes[0].tokens=[{...newToken(),id:'other'},{...newToken(),id:'npc',hp:0,rosterRole:'npc',status:'active'}];
 const changed=structuredClone(before);changed.collections[0].tokenDefaults.npcZeroHp='unconscious';applyWorkspaceHpStates(before,changed);assert.equal(changed.scenes[0].tokens[1].status,'unconscious');
 const dead=structuredClone(changed);dead.collections[0].tokenDefaults.npcZeroHp='dead';applyWorkspaceHpStates(changed,dead);assert.equal(dead.scenes[0].tokens[0].id,'npc');
 const reordered=structuredClone(dead);reordered.scenes[0].tokens.reverse();applyWorkspaceHpStates(dead,reordered);assert.equal(reordered.scenes[0].tokens[1].id,'npc');
 const manual=structuredClone(reordered);manual.scenes[0].tokens[1].status='active';applyWorkspaceHpStates(reordered,manual);assert.equal(manual.scenes[0].tokens[1].status,'active');
});
