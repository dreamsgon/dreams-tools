import test from "node:test";
import assert from "node:assert/strict";
import { effectSchema } from "../lib/model.ts";
import { resolveEffect, effectVisibleToPlayers, effectContains, effectHandles } from "../lib/effects.ts";
const aura = () => effectSchema.parse({id:"aura",type:"circle",x:20,y:30,size:2,color:"#ff4400",label:"Aura",persistent:true,tokenId:"hero"});
const token = {id:"hero",x:400,y:500,hidden:false};
test("legacy effects default to unattached", () => {
  const { tokenId, ...legacy } = aura();
  assert.equal(effectSchema.parse(legacy).tokenId, null);
});
test("attached aura tracks token coordinates without mutating stored effect", () => {
  const effect = aura();
  assert.deepEqual({x:resolveEffect(effect,[token]).x,y:resolveEffect(effect,[token]).y},{x:400,y:500});
  assert.equal(resolveEffect(effect,[{...token,x:600}]).x,600);
  assert.equal(effect.x,20);
  assert.equal(resolveEffect(effect,[]),effect);
  assert.equal(resolveEffect({...effect,tokenId:null},[token]).x,20);
});
test("hit detection and handles use the resolved aura center", () => {
  const effect = resolveEffect(aura(), [token]);
  const grid = {size:70};
  assert.equal(effectContains(effect,{x:400,y:500},grid),true);
  assert.equal(effectContains(effect,{x:20,y:30},grid),false);
  assert.deepEqual(effectHandles(effect,grid).resize,{x:540,y:500});
});
test("hidden token auras do not disclose player locations", () => {
  assert.equal(effectVisibleToPlayers(aura(),[token]),true);
  assert.equal(effectVisibleToPlayers(aura(),[{...token,hidden:true}]),false);
  assert.equal(effectVisibleToPlayers({...aura(),hidden:true},[token]),false);
});
