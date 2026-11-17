import test from "node:test";
import assert from "node:assert/strict";
import { sceneDeleteQuestion, sceneMoveQuestion } from "../lib/scene-confirm.ts";

const collections = [{ id: "c1", name: "Lost Mine", kind: "campaign", parentId: null }, { id: "f1", name: "Phandalin", kind: "folder", parentId: "c1" }];

test("moving a scene names it and where it goes", () => {
  const q = sceneMoveQuestion(collections, ["Tresendar Manor"], "f1");
  assert.equal(q.title, "Move “Tresendar Manor”?");
  assert.match(q.message, /Lost Mine \/ Phandalin/);
  assert.match(q.message, /tokens, fog/);
  assert.equal(q.confirm, "Move scene");
  assert.match(sceneMoveQuestion(collections, ["A"], null).message, /no campaign/);
  const many = sceneMoveQuestion(collections, ["A", "B", "C"], "c1");
  assert.equal(many.title, "Move 3 scenes?");
  assert.equal(many.confirm, "Move scenes");
});

test("deleting a scene is a danger question that names it", () => {
  const q = sceneDeleteQuestion("Cragmaw Hideout");
  assert.equal(q.title, "Delete “Cragmaw Hideout”?");
  assert.equal(q.danger, true);
  assert.equal(q.confirm, "Delete scene");
});
