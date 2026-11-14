import test from "node:test";
import assert from "node:assert/strict";
import { moveSibling, canMoveSibling, placeBeside, dropPlace } from "../lib/folder-order.ts";

const f = (id, parentId = null) => ({ id, parentId, name: id });
const ids = list => list.map(x => x.id).join(",");

test("moveSibling swaps with the neighbouring folder of the same parent only", () => {
  const list = [f("a"), f("a1", "a"), f("b"), f("b1", "b"), f("c")];
  assert.equal(ids(moveSibling(list, "b", -1).filter(x => !x.parentId)), "b,a,c");
  assert.equal(ids(moveSibling(list, "a", 1).filter(x => !x.parentId)), "b,a,c");
  assert.equal(ids(moveSibling(list, "c", -1).filter(x => !x.parentId)), "a,c,b");
});
test("moveSibling at an end returns the same array and leaves the input alone", () => {
  const list = [f("a"), f("b")];
  assert.equal(moveSibling(list, "a", -1), list);
  assert.equal(moveSibling(list, "b", 1), list);
  assert.equal(canMoveSibling(list, "a", 1), true);
  assert.equal(canMoveSibling(list, "a", -1), false);
  assert.equal(moveSibling(list, "missing", 1), list);
  assert.equal(ids(list), "a,b");
});
test("a folder with no sibling does not move", () => {
  const list = [f("a"), f("a1", "a"), f("b")];
  assert.equal(moveSibling(list, "a1", 1), list);
});
test("placeBeside puts a folder next to another and adopts its parent", () => {
  const list = [f("a"), f("b"), f("b1", "b"), f("c")];
  const before = placeBeside(list, "c", "a", "before");
  assert.equal(ids(before), "c,a,b,b1");
  const after = placeBeside(list, "a", "b1", "after");
  assert.equal(ids(after), "b,b1,a,c");
  assert.equal(after.find(x => x.id === "a").parentId, "b");
  assert.equal(placeBeside(list, "a", "a", "after"), list);
});
test("dropPlace splits a row into before, inside and after", () => {
  assert.equal(dropPlace(2, 40), "before");
  assert.equal(dropPlace(20, 40), "inside");
  assert.equal(dropPlace(38, 40), "after");
  assert.equal(dropPlace(1, 0), "inside");
});
test("moveSibling skips neighbours the list does not show", () => {
  const list = [{ id: "a", parentId: null, kind: "folder" }, { id: "camp", parentId: null, kind: "campaign" }, { id: "b", parentId: null, kind: "folder" }];
  const next = moveSibling(list, "b", -1, x => x.kind === "folder");
  assert.equal(ids(next), "b,camp,a");
});
