import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,newToken,workspaceSchema,tokenSchema} from '../lib/model.ts';
import {resolveTokenForCampaign,applyCampaignDisplayDefaults} from '../lib/token-defaults.ts';
import {tokenHpLayout} from '../lib/token-display-layout.ts';
import {drawTokenName} from '../lib/token-name.ts';

test('spacing inherits independently, survives save, and bulk reset restores inheritance',()=>{
 const w=initialWorkspace();
 w.collections=[{id:'c',name:'C',kind:'campaign',parentId:null,tokenDefaults:{partyZeroHp:'off',npcZeroHp:'off',showName:true,showHp:true,nameSpacing:12,hpSpacing:9,nameHpSpacing:6}}];
 w.scenes[0].containerId='c';
 const t={...newToken(),nameSpacing:0,hpSpacing:20};w.scenes[0].tokens=[t];
 const saved=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
 const result=resolveTokenForCampaign(saved,'c',saved.scenes[0].tokens[0]);
 assert.deepEqual([result.nameSpacing,result.hpSpacing,result.nameHpSpacing],[0,20,6]);
 applyCampaignDisplayDefaults(saved,'c');
 const inherited=resolveTokenForCampaign(saved,'c',saved.scenes[0].tokens[0]);
 assert.deepEqual([inherited.nameSpacing,inherited.hpSpacing,inherited.nameHpSpacing],[12,9,6]);
 for(const key of ['nameSpacing','hpSpacing','nameHpSpacing']) for(const value of [-1,61]) assert.equal(tokenSchema.safeParse({...t,[key]:value}).success,false);
});
function nameRadius(t) {
 const points=[];
 const ctx=new Proxy({measureText:s=>({width:s.length*8}),translate:(x,y)=>points.push(Math.hypot(x-t.x,y-t.y))},{get:(o,k)=>k in o?o[k]:()=>{}});
 drawTokenName(ctx,t,100);return points[0];
}
test('name and HP spacing move their arcs independently, with extra clearance only on overlap',()=>{
 const t={...newToken('Mountain Troll'),showName:true,showHp:true,namePosition:'wrap',hpPosition:'wrap'};
 assert.equal(tokenHpLayout({...t,hpSpacing:15},100).ringRadius-tokenHpLayout(t,100).ringRadius,15);
 assert.ok(Math.abs(nameRadius({...t,nameSpacing:12})-nameRadius(t)-12)<1e-8);
 assert.equal(nameRadius({...t,nameHpSpacing:30}),nameRadius(t));
 const full={...t,hpBarWidth:2};
 assert.ok(Math.abs(nameRadius({...full,nameHpSpacing:13})-nameRadius(full)-10)<1e-8);
});
test('scene crop focus persists on reload, full-map choice persists, and legacy scenes default unfocused',()=>{
 const w=initialWorkspace();const s=w.scenes[0];s.crop={x:100,y:100,width:300,height:200};s.cropFocus=true;
 assert.equal(workspaceSchema.parse(JSON.parse(JSON.stringify(w))).scenes[0].cropFocus,true);
 s.cropFocus=false;assert.equal(workspaceSchema.parse(JSON.parse(JSON.stringify(w))).scenes[0].cropFocus,false);
 delete s.cropFocus;assert.equal(workspaceSchema.parse(JSON.parse(JSON.stringify(w))).scenes[0].cropFocus,undefined);
});
