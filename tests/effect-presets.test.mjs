import test from "node:test";
import assert from "node:assert/strict";
import { effectPresetSchema, initialWorkspace, workspaceSchema } from "../lib/model.ts";
const preset = () => effectPresetSchema.parse({id:"a",name:"Spirit guardians",type:"custom",size:3,color:"#ffffff",label:"Aura",persistent:true,hidden:true,rotation:45,width:2,angle:60,points:[{x:0,y:0},{x:100,y:0},{x:0,y:100}],x:100,y:200,tokenId:"token"});
test("presets preserve custom geometry and discard scene placement and attachment",()=>{
 const item=preset();
 assert.equal("x" in item,false); assert.equal("y" in item,false); assert.equal("tokenId" in item,false);
 const w=initialWorkspace(); w.effectPresets=[item];
 assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(w))).effectPresets,[item]);
});
test("legacy saves gain empty preset library",()=>{
 const w=initialWorkspace(); delete w.effectPresets; delete w.effectPresetFolders; delete w.presetLocations;
 const result=workspaceSchema.parse(w); assert.deepEqual(result.effectPresets,[]); assert.deepEqual(result.effectPresetFolders,[]); assert.deepEqual(result.presetLocations,{});
});
test("preset folders reject cycles and missing destinations",()=>{
 const w=initialWorkspace(); w.effectPresets=[preset()];
 w.effectPresetFolders=[{id:"f",name:"F",kind:"folder",parentId:"f"}];
 assert.equal(workspaceSchema.safeParse(w).success,false);
 w.effectPresetFolders=[{id:"f",name:"F",kind:"folder",parentId:null}]; w.presetLocations.a="missing";
 assert.equal(workspaceSchema.safeParse(w).success,false);
 w.presetLocations.a="f"; assert.equal(workspaceSchema.safeParse(w).success,true);
});
test("preset identifiers are unique",()=>{const w=initialWorkspace(); w.effectPresets=[preset(),preset()]; assert.equal(workspaceSchema.safeParse(w).success,false);});
