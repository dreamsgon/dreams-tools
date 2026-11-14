import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkspace,newToken,tokenSchema,workspaceSchema} from '../lib/model.ts';
import {SIDE_COLOURS,DISPOSITION_COLORS,tokenSideLook,resolveTokenForCampaign,deriveRing} from '../lib/token-defaults.ts';

const lum=h=>{const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255].map(c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0)};
const contrast=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05)};

test('white letters reach 4.5:1 on every side fill',()=>{
 for(const [side,c] of Object.entries(SIDE_COLOURS)) assert.ok(contrast('#ffffff',c.fill)>=4.5,side+' '+contrast('#ffffff',c.fill));
 assert.deepEqual(SIDE_COLOURS.party,{fill:'#2f5fb3',ring:'#8db8ff'});
 assert.deepEqual(SIDE_COLOURS.enemy,{fill:'#b3322e',ring:'#ff7a70'});
});
const w=()=>initialWorkspace();
test('old default fill migrates to the side look',()=>{
 const t={...newToken('Orc'),rosterRole:'npc'};
 assert.equal(t.color,'#388565');
 const look=tokenSideLook(w(),null,t);
 assert.deepEqual(look,{fill:'#b3322e',ring:'#ff7a70',text:'#ffffff'});
 const r=resolveTokenForCampaign(w(),null,t);
 assert.equal(r.color,'#b3322e');assert.equal(r.borderColor,'#ff7a70');assert.equal(r.textColor,'#ffffff');
 const p=resolveTokenForCampaign(w(),null,{...t,rosterRole:'party'});
 assert.equal(p.color,'#2f5fb3');
 assert.equal(tokenSideLook(w(),null,{...t,disposition:'ally'}).fill,'#23784f');
 assert.equal(tokenSideLook(w(),null,{...t,rosterRole:'library'}).fill,'#8a5a12');
});
test('flag true applies to custom fill; flag false opts out of the old default',()=>{
 const t=newToken('X');
 assert.ok(tokenSideLook(w(),null,{...t,color:'#112233',sideColours:true}));
 assert.equal(tokenSideLook(w(),null,{...t,sideColours:false}),null);
 assert.ok(tokenSideLook(w(),null,{...t,color:'#388565'.toUpperCase()}));
});
test('custom colours, pictures and map pieces are untouched',()=>{
 const t={...newToken('X'),color:'#123456',borderColor:'#abcdef',useDispositionColor:true,disposition:'party'};
 assert.equal(tokenSideLook(w(),null,t),null);
 const r=resolveTokenForCampaign(w(),null,t);
 assert.equal(r.color,'#123456');assert.equal(r.borderColor,DISPOSITION_COLORS.party);assert.equal(r.textColor,undefined);
 const pic={...newToken('X'),assetId:'img',sideColours:true};
 assert.equal(tokenSideLook(w(),null,pic),null);
 assert.equal(resolveTokenForCampaign(w(),null,pic).color,pic.color);
 assert.equal(tokenSideLook(w(),null,{...newToken('X'),pieceOf:'s1',sideColours:true}),null);
});
test('disposition colour still works for side-colour tokens opting out',()=>{
 const t={...newToken('X'),sideColours:false,useDispositionColor:true,disposition:'enemy'};
 assert.equal(resolveTokenForCampaign(w(),null,t).borderColor,DISPOSITION_COLORS.enemy);
});
test('campaign overrides replace the fill and derive the ring',()=>{
 const ws=w();
 ws.collections=[{id:'c',name:'C',kind:'campaign',parentId:null,tokenDefaults:{partyZeroHp:'off',npcZeroHp:'off',showName:true,showHp:true,sideColours:{enemy:'#800000'}}}];
 const e={...newToken('Orc'),rosterRole:'npc'};
 const look=tokenSideLook(ws,'c',e);
 assert.equal(look.fill,'#800000');assert.equal(look.ring,deriveRing('#800000'));assert.match(look.ring,/^#[0-9a-f]{6}$/);
 assert.equal(tokenSideLook(ws,'c',{...e,rosterRole:'party'}).fill,'#2f5fb3');
 assert.equal(tokenSideLook(ws,'other',e).fill,'#b3322e');
 assert.equal(resolveTokenForCampaign(ws,'c',e).color,'#800000');
});
test('schemas accept the new fields',()=>{
 const t=newToken('X');
 assert.ok(tokenSchema.safeParse({...t,sideColours:true}).success);
 const ws=w();
 ws.collections=[{id:'c',name:'C',kind:'campaign',parentId:null,tokenDefaults:{partyZeroHp:'off',npcZeroHp:'off',showName:true,showHp:true,sideColours:{enemy:'#800000'}}}];
 assert.ok(workspaceSchema.safeParse(ws).success);
 ws.collections[0].tokenDefaults.sideColours={enemy:'red'};
 assert.ok(!workspaceSchema.safeParse(ws).success);
});
test('old default fill with an explicit border or letter colour stays custom unless flagged',()=>{
 const t={...newToken('X'),borderColor:'#123456'};
 assert.equal(tokenSideLook(w(),null,t),null);
 assert.equal(tokenSideLook(w(),null,{...newToken('X'),textColor:'#ff00aa'}),null);
 assert.equal(tokenSideLook(w(),null,{...t,sideColours:true}).ring,'#f2b544');
});
