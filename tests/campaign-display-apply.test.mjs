import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,newScene,newToken,workspaceSchema,tokenSchema} from '../lib/model.ts';
import {applyCampaignDisplayDefaults,resolveTokenForCampaign} from '../lib/token-defaults.ts';
import {drawTokenHp,tokenHpLayout} from '../lib/token-display-layout.ts';

test('bulk application is campaign scoped, includes nested scenes and owned gallery, and preserves combat data',()=>{
 const w=initialWorkspace();
 const defaults={partyZeroHp:'off',npcZeroHp:'off',showName:false,showHp:true,nameScale:2,hpBarWidth:1.5,hpBarHeight:12,namePosition:'top',hpPosition:'wrap',hpBarColor:'#123456'};
 w.collections=[{id:'a',name:'A',kind:'campaign',parentId:null,tokenDefaults:defaults},{id:'folder',name:'F',kind:'folder',parentId:'a'},{id:'b',name:'B',kind:'campaign',parentId:null}];
 const t={...newToken('Troll'),nameVisibility:'show',hpVisibility:'hide',showHp:false,namePosition:'side',hpPosition:'top',nameScale:.5,hpBarWidth:2,hpBarHeight:3,hpBarColor:'#abcdef',hp:4,maxHp:10,hidden:true,status:'dead',zeroHpStatus:'dead',notes:'Keep',conditions:['poisoned']};
 const a={...newScene(),containerId:'a',tokens:[structuredClone(t)]};
 const nested={...newScene(),containerId:'folder',tokens:[{...t,id:'nested'},{...t,id:'marker',partyMarker:true}]};
 const b={...newScene(),containerId:'b',tokens:[{...t,id:'other'}]};
 const unfiled={...newScene(),tokens:[{...t,id:'unfiled'}]};
 w.scenes=[a,nested,b,unfiled];
 w.tokenLibrary=[{...t,id:'owned'},{...t,id:'shared'},{...t,id:'foreign'}];
 w.libraryCampaigns={owned:'a',foreign:'b'};
 const before=structuredClone(w);
 assert.equal(applyCampaignDisplayDefaults(w,'a'),4);
 for(const changed of [a.tokens[0],nested.tokens[0],w.tokenLibrary[0]]) {
  const actual=resolveTokenForCampaign(w,'a',changed);
  assert.equal(actual.showName,false);assert.equal(actual.showHp,true);
  assert.equal(actual.nameScale,2);assert.equal(actual.hpBarColor,'#123456');assert.equal(actual.hpPosition,'wrap');
  for(const key of ['nameScale','namePosition','hpPosition','hpBarHeight','hpBarWidth','hpBarColor'])assert.equal(changed[key],undefined);
  for(const key of ['hp','maxHp','hidden','status','zeroHpStatus','notes','conditions','x','y','assetId'])assert.deepEqual(changed[key],t[key]);
 }
 assert.equal(nested.tokens[1].hpVisibility,'hide');
 assert.equal(nested.tokens[1].hpBarColor,'#abcdef');
 assert.deepEqual(w.scenes.slice(2),before.scenes.slice(2));
 assert.deepEqual(w.tokenLibrary.slice(1),before.tokenLibrary.slice(1));
 const after=structuredClone(w);assert.equal(applyCampaignDisplayDefaults(w,'missing'),0);assert.deepEqual(w,after);
 const roundTrip=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
 assert.equal(resolveTokenForCampaign(roundTrip,'a',roundTrip.scenes[0].tokens[0]).hpBarColor,'#123456');
});

function context(){const calls=[];return new Proxy({calls},{get:(o,k)=>k in o?o[k]:(...args)=>calls.push([k,...args]),set:(o,k,v)=>{o[k]=v;calls.push(['set',k,v]);return true;}});}
test('HP color supports campaign inheritance, custom override and explicit automatic mode',()=>{
 const w=initialWorkspace();
 w.collections=[{id:'a',name:'A',kind:'campaign',parentId:null,tokenDefaults:{partyZeroHp:'off',npcZeroHp:'off',showName:true,showHp:true,hpBarColor:'#123456'}}];
 const t={...newToken(),hp:1,maxHp:10,hpPosition:'wrap'};
 for(const [patch,expected] of [[{},'#123456'],[{hpBarColor:'#abcdef'},'#abcdef'],[{hpBarColor:null},'#df6b62']]){
  const ctx=context();drawTokenHp(ctx,resolveTokenForCampaign(w,'a',{...t,...patch}),40);
  assert.ok(ctx.calls.some(c=>c[0]==='set'&&c[1]==='strokeStyle'&&c[2]===expected));
 }
 assert.equal(tokenSchema.safeParse({...t,hpBarColor:'red'}).success,false);
});
test('wrapped HP follows the border tightly regardless of condition badges and rounds arc ends',()=>{
 const t={...newToken(),hpPosition:'wrap',borderWidth:4,hpBarHeight:10};
 const layout=tokenHpLayout(t,40);
 assert.equal(layout.ringRadius-40-layout.thickness/2,3);
 assert.equal(tokenHpLayout({...t,conditions:['poisoned']},40).ringRadius,layout.ringRadius);
 const ctx=context();drawTokenHp(ctx,t,40);
 assert.ok(ctx.calls.some(c=>c[0]==='set'&&c[1]==='lineCap'&&c[2]==='round'));
 const full=context();drawTokenHp(full,{...t,hpBarWidth:2},40);
 assert.ok(full.calls.some(c=>c[0]==='set'&&c[1]==='lineCap'&&c[2]==='butt'),'closed rings avoid a doubled seam');
});
