import test from 'node:test';
import assert from 'node:assert/strict';
import {effectSchema,effectPresetSchema,initialWorkspace,workspaceSchema} from '../lib/model.ts';
import {effectContains,isOneOffArea} from '../lib/effects.ts';
const make=(values={})=>effectSchema.parse({id:'e',type:'square',x:200,y:200,size:2,color:'#336699',label:'Crate',...values});
test('object and label styles survive workspace and preset round trips',()=>{
 const w=initialWorkspace();const e=make({kind:'object',fillOpacity:.8,strokeWidth:5,strokeStyle:'dashed',labelSize:32,labelColor:'#ffffff',labelOffsetX:20,labelOffsetY:-30,showLabel:true});
 w.scenes[0].effects=[e];w.effectPresets=[effectPresetSchema.parse({...e,name:'Crate preset'})];
 const saved=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
 assert.deepEqual(saved.scenes[0].effects[0],e);assert.equal(saved.effectPresets[0].kind,'object');assert.equal(saved.effectPresets[0].labelSize,32);
 for(const patch of [{fillOpacity:2},{strokeWidth:-1},{labelSize:200},{kind:'bad'}])assert.equal(effectSchema.safeParse({...e,...patch}).success,false);
});
test('clearing one-off AoEs preserves objects, map labels, and persistent auras',()=>{
 const all=[make(),make({persistent:true}),make({kind:'object',persistent:false}),make({kind:'label',persistent:false})];
 assert.deepEqual(all.filter(e=>!isOneOffArea(e)),all.slice(1));
});
test('standalone labels can be picked across their text rather than an invisible shape',()=>{
 const e=make({kind:'label',label:'Long room label',labelSize:32});
 const grid=initialWorkspace().scenes[0].grid;
 assert.equal(effectContains(e,{x:350,y:195},grid),true);
 assert.equal(effectContains(e,{x:200,y:260},grid),false);
 assert.equal(effectContains({...e,labelOffsetX:100},{x:450,y:195},grid),true);
});

test('position locks persist for objects and labels while legacy areas stay unlocked',()=>{
 for(const kind of ['object','label']) {
  const w=initialWorkspace();w.scenes[0].effects=[make({kind,locked:true})];
  assert.equal(workspaceSchema.parse(JSON.parse(JSON.stringify(w))).scenes[0].effects[0].locked,true);
 }
 assert.equal(make().locked,undefined);
 assert.equal(effectSchema.safeParse({...make(),locked:'yes'}).success,false);
});
