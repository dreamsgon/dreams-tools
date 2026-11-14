import test from "node:test";
import assert from "node:assert/strict";
import { initialWorkspace, newToken, workspaceSchema, createTokenFolder, moveTokenToFolder, moveLibraryTokenToCampaign, tokenFoldersForCampaign } from "../lib/model.ts";

const base = () => {
  const w = initialWorkspace();
  w.collections = ["mash", "greyfen"].map(id => ({ id, name: id, kind: "campaign", parentId: null }));
  return w;
};

test("legacy mixed token folder trees migrate per campaign without changing assets", () => {
  const w = base(); delete w.tokenFolders; delete w.tokenFolderLocations;
  w.assetFolders = [{ id: "root", name: "Creatures", kind: "folder", parentId: null }, { id: "child", name: "Monsters", kind: "folder", parentId: "root" }];
  w.assetLocations = { image: "child" };
  w.tokenLibrary = ["m", "k", "s"].map(id => ({ ...newToken(id), id }));
  w.libraryCampaigns = { m: "mash", k: "greyfen", s: null };
  w.libraryLocations = { m: "child", k: "child", s: "child" };
  const migrated = workspaceSchema.parse(w);
  assert.equal(migrated.tokenFolders.length, 6);
  assert.deepEqual(migrated.assetFolders, w.assetFolders);
  assert.deepEqual(migrated.assetLocations, w.assetLocations);
  assert.deepEqual(migrated.libraryLocations, w.libraryLocations);
  assert.notEqual(migrated.tokenFolderLocations.m, migrated.tokenFolderLocations.k);
  for (const token of migrated.tokenLibrary) {
    const child = migrated.tokenFolders.find(f => f.id === migrated.tokenFolderLocations[token.id]);
    assert.equal(child.campaignId, migrated.libraryCampaigns[token.id]);
    assert.equal(migrated.tokenFolders.find(f => f.id === child.parentId).campaignId, child.campaignId);
  }
  assert.deepEqual(workspaceSchema.parse(migrated), migrated);
  assert.deepEqual(workspaceSchema.parse(w), migrated, "migration IDs stay stable across reads before saving");
});

test("new folders belong to current campaign and other campaigns never see them", () => {
  const w = base();
  const mash = createTokenFolder(w, "mash", "Mash NPCs"), greyfen = createTokenFolder(w, "greyfen", "Greyfen hounds");
  assert.deepEqual(tokenFoldersForCampaign(w, "mash").map(f => f.id), [mash.id]);
  assert.deepEqual(tokenFoldersForCampaign(w, "greyfen").map(f => f.id), [greyfen.id]);
  assert.equal(w.assetFolders.length, 0);
  assert.equal(createTokenFolder(w, "mash", "  "), undefined);
});

test("shared folders appear in campaign galleries only when they contain shared tokens", () => {
  const w = base(); const shared = createTokenFolder(w, null, "Shared"), empty = createTokenFolder(w, null, "Empty");
  w.tokenLibrary.push({ ...newToken("Shared NPC"), id: "shared" });
  assert.equal(moveTokenToFolder(w, "shared", shared.id), true);
  assert.deepEqual(tokenFoldersForCampaign(w, "mash").map(f => f.id), [shared.id]);
  assert.equal(tokenFoldersForCampaign(w, "mash").some(f => f.id === empty.id), false);
});

test("explicit folder moves transfer campaigns and campaign moves preserve independent hierarchy", () => {
  const w = base(); const root = createTokenFolder(w, "mash", "NPCs"), child = createTokenFolder(w, "mash", "Allies"); child.parentId = root.id;
  const other = createTokenFolder(w, "greyfen", "Goblins");
  w.tokenLibrary.push({ ...newToken("Friend"), id: "friend" }); w.libraryCampaigns.friend = "mash";
  assert.equal(moveTokenToFolder(w, "friend", other.id), true);
  assert.equal(w.libraryCampaigns.friend, "greyfen");
  assert.equal(moveTokenToFolder(w, "friend", child.id), true);
  assert.equal(w.libraryCampaigns.friend, "mash");
  moveLibraryTokenToCampaign(w, "friend", "greyfen");
  const moved = w.tokenFolders.find(f => f.id === w.tokenFolderLocations.friend);
  assert.equal(moved.campaignId, "greyfen"); assert.equal(moved.name, "Allies");
  assert.equal(w.tokenFolders.find(f => f.id === moved.parentId).name, "NPCs");
  assert.equal(child.campaignId, "mash"); assert.equal(workspaceSchema.safeParse(w).success, true);
  w.tokenFolderLocations.friend = child.id;
  assert.equal(workspaceSchema.safeParse(w).success, false);
});
