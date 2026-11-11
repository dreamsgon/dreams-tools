import test from 'node:test';
import assert from 'node:assert/strict';
import {newToken, initialWorkspace, tokenSchema, workspaceSchema} from '../lib/model.ts';
import {resolveTokenForCampaign, resolvedToken} from '../lib/token-defaults.ts';
import {drawTokenHp, tokenHpLayout, tokenNameFontSize} from '../lib/token-display-layout.ts';
import {drawTokenName} from '../lib/token-name.ts';
function context() {
  const calls=[];
  return new Proxy({calls,measureText:s=>({width:s.length*10})},{
    get:(o,k)=>k in o?o[k]:(...args)=>calls.push([k,...args]),
    set:(o,k,v)=>{o[k]=v;calls.push(['set',k,v]);return true;}
  });
}
test('campaign sizes inherit through folders, preserve independent overrides, and restore independently',()=>{
  const w=initialWorkspace();
  w.collections=[
    {id:'c',name:'Campaign',kind:'campaign',parentId:null,tokenDefaults:{partyZeroHp:'off',npcZeroHp:'off',showName:true,showHp:true,nameScale:2,hpBarWidth:1.5,hpBarHeight:14}},
    {id:'f',name:'Folder',kind:'folder',parentId:'c'}
  ];
  w.scenes[0].containerId='f';
  const token=newToken();
  const sizes=t=>[t.nameScale,t.hpBarWidth,t.hpBarHeight];
  assert.deepEqual(sizes(resolvedToken(w,w.scenes[0].id,token)),[2,1.5,14]);
  const custom={...token,nameScale:1,hpBarHeight:7};
  assert.deepEqual(sizes(resolvedToken(w,w.scenes[0].id,custom)),[1,1.5,7]);
  w.collections[0].tokenDefaults={...w.collections[0].tokenDefaults,nameScale:3,hpBarWidth:2,hpBarHeight:20};
  assert.deepEqual(sizes(resolveTokenForCampaign(w,'c',custom)),[1,2,7]);
  assert.deepEqual(sizes(resolveTokenForCampaign(w,'c',{...custom,nameScale:undefined})),[3,2,7]);
  assert.deepEqual(sizes(resolveTokenForCampaign(w,null,token)),[1,1,7]);
  assert.equal(token.nameScale,undefined,'resolving must not freeze defaults into saved tokens');
  const saved=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
  assert.deepEqual(sizes(resolveTokenForCampaign(saved,'c',token)),[3,2,20]);
  for(const [key,value] of [['nameScale',4],['hpBarWidth',0],['hpBarHeight',41]]) {
    const invalid=structuredClone(w);invalid.collections[0].tokenDefaults[key]=value;
    assert.equal(workspaceSchema.safeParse(invalid).success,false);
  }
});
test('campaign placements inherit, explicit placements win, and clearing restores inheritance',()=>{
  const w=initialWorkspace();
  w.collections=[{id:'c',name:'C',kind:'campaign',parentId:null,tokenDefaults:{partyZeroHp:'off',npcZeroHp:'off',showName:true,showHp:true,namePosition:'top',hpPosition:'side'}}];
  const t=newToken();
  assert.equal(resolveTokenForCampaign(w,'c',t).namePosition,'top');
  assert.equal(resolveTokenForCampaign(w,'c',t).hpPosition,'side');
  const override={...t,namePosition:'bottom',hpPosition:'wrap'};
  assert.equal(resolveTokenForCampaign(w,'c',override).namePosition,'bottom');
  assert.equal(resolveTokenForCampaign(w,'c',override).hpPosition,'wrap');
  assert.equal(resolveTokenForCampaign(w,'c',{...override,namePosition:undefined}).namePosition,'top');
  assert.equal(resolveTokenForCampaign(w,null,t).hpPosition,'bottom');
  const saved=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
  assert.equal(saved.collections[0].tokenDefaults.namePosition,'top');
  assert.equal(saved.collections[0].tokenDefaults.hpPosition,'side');
});
test('sizes persist for scene and gallery tokens and reject nonfinite or out-of-range values',()=>{
  const w=initialWorkspace(), t={...newToken(),nameScale:2,hpBarWidth:1.5,hpBarHeight:20,hpPosition:'wrap'};
  w.scenes[0].tokens=[t];w.tokenLibrary=[{...t,id:'saved'}];
  const saved=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
  for(const copy of [saved.scenes[0].tokens[0],saved.tokenLibrary[0]]) {
    assert.equal(copy.nameScale,2);assert.equal(copy.hpBarWidth,1.5);assert.equal(copy.hpBarHeight,20);assert.equal(copy.hpPosition,'wrap');
  }
  for(const [key,values] of Object.entries({nameScale:[0,4,NaN],hpBarWidth:[0,3,Infinity],hpBarHeight:[1,41]}))
    for(const value of values) assert.equal(tokenSchema.safeParse({...t,[key]:value}).success,false);
});
test('larger text and HP thickness retain a gap between bottom and top labels',()=>{
  for(const position of ['bottom','top','side']) {
    const t={...newToken('Troll'),namePosition:position,hpPosition:position,nameScale:3,hpBarHeight:40};
    const ctx=context();drawTokenName(ctx,t,40);
    assert.equal(tokenNameFontSize(t,40),57.599999999999994);
    const [,x,y]=ctx.calls.find(c=>c[0]==='translate');
    const half=tokenNameFontSize(t,40)/2+3;
    if(position==='bottom') assert.ok(y-half>t.y+40+6+40);
    if(position==='top') assert.ok(y+half<t.y-40-6-40);
    if(position==='side') assert.ok(x-half>t.x+40+6+40);
  }
});
test('horizontal and vertical HP bars use custom dimensions and clamp fill to the track',()=>{
  for(const hpPosition of ['bottom','top','side']) {
    for(const hp of [0,5,20]) {
      const t={...newToken(),hp,hpPosition,hpBarWidth:1.5,hpBarHeight:12,maxHp:10};
      const ctx=context();drawTokenHp(ctx,t,40);
      const rects=ctx.calls.filter(c=>c[0]==='fillRect');
      const ratio=Math.min(hp/10,1);
      assert.equal(rects.length,2);
      assert.deepEqual(rects[0].slice(3),hpPosition==='side'?[12,120]:[120,12]);
      assert.deepEqual(rects[1].slice(3),hpPosition==='side'?[12,120*ratio]:[120*ratio,12]);
    }
  }
});
test('wrapped HP uses a proportional arc and hiding removes its footprint',()=>{
  const t={...newToken(),hpPosition:'wrap',hpBarWidth:2,hpBarHeight:18,hp:5,maxHp:10};
  const ctx=context();drawTokenHp(ctx,t,40);
  const arcs=ctx.calls.filter(c=>c[0]==='arc');
  assert.equal(arcs.length,2);
  assert.equal(arcs[0][5]-arcs[0][4],2*Math.PI);
  assert.equal(arcs[1][5]-arcs[1][4],Math.PI);
  const hidden={...t,showHp:false},empty=context();drawTokenHp(empty,hidden,40);
  assert.deepEqual(empty.calls,[]);
  assert.equal(tokenHpLayout(hidden,40).bottom,0);
});
