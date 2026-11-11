import test from "node:test";
import assert from "node:assert/strict";
import { initialWorkspace, workspaceSchema, canMoveCollection, collectionPath } from "../lib/model.ts";

const folder = (id, parentId = null) => ({id, name:id, kind:"folder", parentId});

test("older workspaces gain empty condition folders and locations", () => {
  const old = initialWorkspace();
  delete old.conditionFolders;
  delete old.conditionLocations;
  const upgraded = workspaceSchema.parse(old);
  assert.deepEqual(upgraded.conditionFolders, []);
  assert.deepEqual(upgraded.conditionLocations, {});
  assert.deepEqual(upgraded.conditions, old.conditions);
});

test("nested condition folders and root conditions survive saved-state round trip", () => {
  const w = initialWorkspace();
  w.conditionFolders = [folder("Combat"), folder("Wounds", "Combat")];
  w.conditionLocations = {marked:"Combat", injured:"Wounds", hidden:null};
  assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(w))), w);
  assert.equal(collectionPath(w.conditionFolders, "Wounds"), "Combat / Wounds");
});

test("condition folders reject duplicates, cycles, missing parents and invalid destinations", () => {
  const invalidFolders = [
    [folder("a"), folder("a")],
    [folder("a", "a")],
    [folder("a", "b"), folder("b", "a")],
    [folder("a", "missing")],
    [{...folder("a"), kind:"campaign"}],
  ];
  for (const conditionFolders of invalidFolders) {
    assert.equal(workspaceSchema.safeParse({...initialWorkspace(), conditionFolders}).success, false);
  }
  const w = initialWorkspace();
  w.conditionFolders = [folder("a")];
  w.conditionLocations.marked = "missing";
  assert.equal(workspaceSchema.safeParse(w).success, false);
});

test("condition folder moves protect against self, descendants, missing parents and existing cycles", () => {
  const folders = [folder("a"), folder("b", "a"), folder("c", "b")];
  assert.equal(canMoveCollection(folders, "a", "a"), false);
  assert.equal(canMoveCollection(folders, "a", "c"), false);
  assert.equal(canMoveCollection(folders, "c", "missing"), false);
  assert.equal(canMoveCollection(folders, "c", "a"), true);
  assert.equal(canMoveCollection(folders, "b", null), true);
  assert.equal(canMoveCollection([folder("a", "b"), folder("b", "a")], "c", "a"), false);
});
