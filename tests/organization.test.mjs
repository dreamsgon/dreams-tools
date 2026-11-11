import test from "node:test";
import assert from "node:assert/strict";
import { initialWorkspace, newScene, newToken, workspaceSchema, canMoveCollection, collectionPath, moveAssetToCampaign, moveLibraryTokenToCampaign } from "../lib/model.ts";

test("asset transfers move saved presets while preserving placed tokens and image references", () => {
  const w=initialWorkspace();
  w.collections=[{id:"a",name:"A",kind:"campaign",parentId:null},{id:"b",name:"B",kind:"campaign",parentId:null}];
  w.assets.push({id:"art",name:"Map",src:"https://example.com/map.png",width:100,height:100});
  const token={...newToken("Hero"),assetId:"art"};
  w.tokenLibrary.push(token);
  w.scenes[0].mapId="art";
  w.scenes[0].tokens.push({...token,id:"placed"});
  const originalScene=structuredClone(w.scenes[0]);
  moveAssetToCampaign(w,"art","a");
  assert.equal(w.libraryCampaigns[token.id],"a");
  moveLibraryTokenToCampaign(w,token.id,"b");
  assert.equal(w.assetCampaigns.art,"b");
  assert.equal(w.libraryCampaigns[token.id],"b");
  assert.deepEqual(w.scenes[0],originalScene);
  assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(w))),w);
  moveAssetToCampaign(w,"art",null);
  assert.equal(w.libraryCampaigns[token.id],null);
  w.assetCampaigns.art="missing";
  assert.equal(workspaceSchema.safeParse(w).success,false);
});
test("old assets and token presets remain shared",()=>{
  const old=initialWorkspace();delete old.assetCampaigns;delete old.libraryCampaigns;
  const w=workspaceSchema.parse(old);
  assert.deepEqual(w.assetCampaigns,{});assert.deepEqual(w.libraryCampaigns,{});
});

test("legacy folder labels migrate without losing scenes and remain stable", () => {
  const old = initialWorkspace();
  delete old.collections;
  old.scenes.push(newScene("Second"));
  for (const s of old.scenes) { delete s.containerId; s.folder = "Old adventure"; }
  const migrated = workspaceSchema.parse(old);
  assert.equal(migrated.collections.length, 1);
  assert.equal(migrated.collections[0].name, "Old adventure");
  assert.equal(migrated.scenes[0].containerId, migrated.scenes[1].containerId);
  assert.deepEqual(workspaceSchema.parse(migrated), migrated);
});
test("campaign folders and nested scene folders survive saved-state round trip", () => {
  const w = initialWorkspace();
  w.collections = [
    {id:"games", name:"Games", kind:"folder", parentId:null},
    {id:"campaign", name:"Campaign", kind:"campaign", parentId:"games"},
    {id:"chapter", name:"Chapter 1", kind:"folder", parentId:"campaign"},
    {id:"dungeon", name:"Dungeon", kind:"folder", parentId:"chapter"},
  ];
  w.scenes[0].containerId = "dungeon";
  assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(w))),w);
  assert.equal(collectionPath(w.collections,"dungeon"),"Games / Campaign / Chapter 1 / Dungeon");
  assert.equal(canMoveCollection(w.collections,"campaign","dungeon"),false);
  assert.equal(canMoveCollection(w.collections,"campaign","campaign"),false);
  assert.equal(canMoveCollection(w.collections,"dungeon","games"),true);
  assert.equal(canMoveCollection(w.collections,"campaign",null),true);
  w.collections[0].parentId = "dungeon";
  assert.equal(workspaceSchema.safeParse(w).success,false);
});
test("orphan folders, orphan scenes and duplicate collection IDs are rejected", () => {
  const w = initialWorkspace();
  w.scenes[0].containerId = "missing";
  assert.equal(workspaceSchema.safeParse(w).success,false);
  w.scenes[0].containerId = null;
  w.collections = [{id:"a",name:"A",kind:"folder",parentId:"missing"}];
  assert.equal(workspaceSchema.safeParse(w).success,false);
  w.collections[0].parentId = null;
  w.collections.push({...w.collections[0]});
  assert.equal(workspaceSchema.safeParse(w).success,false);
});

test("asset folders persist, upgrade older workspaces, and reject cycles or missing destinations",()=>{
  const w=initialWorkspace();
  w.assetFolders=[{id:"a",name:"Maps",kind:"folder",parentId:null},{id:"b",name:"Dungeons",kind:"folder",parentId:"a"}];
  w.assetLocations.art="b";w.libraryLocations.hero="a";
  assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(w))),w);
  assert.equal(canMoveCollection(w.assetFolders,"a","b"),false);
  const cyclic=structuredClone(w);cyclic.assetFolders[0].parentId="b";
  assert.equal(workspaceSchema.safeParse(cyclic).success,false);
  const orphan=structuredClone(w);orphan.assetLocations.art="missing";
  assert.equal(workspaceSchema.safeParse(orphan).success,false);
  delete w.assetFolders;delete w.assetLocations;delete w.libraryLocations;
  const upgraded=workspaceSchema.parse(w);
  assert.deepEqual(upgraded.assetFolders,[]);assert.deepEqual(upgraded.assetLocations,{});assert.deepEqual(upgraded.libraryLocations,{});
});
