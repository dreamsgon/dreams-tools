import test from "node:test";
import assert from "node:assert/strict";
import { initialWorkspace, newToken, workspaceSchema, isTokenBorder } from "../lib/model.ts";

test("border asset categories persist and recognize older token borders",()=>{
  const w=initialWorkspace();
  w.assets.push({id:"frame",name:"Gold frame",kind:"border",src:"/api/assets?id=frame",width:512,height:512});
  w.assets.push({id:"legacy",name:"Older frame",src:"/api/assets?id=legacy",width:512,height:512});
  w.scenes[0].tokens.push({...newToken(),borderAssetId:"legacy"});
  const restored=workspaceSchema.parse(JSON.parse(JSON.stringify(w)));
  assert.equal(isTokenBorder(restored,"frame"),true);
  assert.equal(isTokenBorder(restored,"legacy"),true);
  restored.assets[1].kind="image";
  assert.equal(isTokenBorder(restored,"legacy"),false);
  assert.equal(restored.scenes[0].tokens[0].borderAssetId,"legacy");
});
