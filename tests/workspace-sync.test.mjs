import test from "node:test";
import assert from "node:assert/strict";
import { workspaceSyncDecision, preserveActiveScene } from "../lib/workspace-sync.ts";

const snapshot = (overrides = {}) => ({ state: {}, revision: "a", generation: 2, savedGeneration: 2, saving: false, blocked: false, ...overrides });

test("unchanged cloud data is ignored; a clean idle workspace accepts a new revision", () => {
  const start = snapshot();
  assert.equal(workspaceSyncDecision(start, start, "a", false), "ignore");
  assert.equal(workspaceSyncDecision(start, start, "b", false), "apply");
});

test("a delayed response cannot replace edits, completed saves, undo, or reload", async () => {
  const start = snapshot();
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const check = async current => { await response; return workspaceSyncDecision(start, current, "b", false); };
  const results = [
    check({...start, state: {}}), // reload resets counters, but identity changes
    check({...start, generation: 3}),
    check({...start, generation: 3, savedGeneration: 3}),
    check({...start, revision: "c"}),
    check({...start, saving: true}),
    check({...start, blocked: true}),
  ];
  release();
  assert.deepEqual(await Promise.all(results), Array(6).fill("ignore"));
});

test("dirty stable data reports one conflict, while active editing defers clean updates", () => {
  const dirty = snapshot({ generation: 3 });
  assert.equal(workspaceSyncDecision(dirty, dirty, "b", false), "conflict");
  assert.equal(workspaceSyncDecision(dirty, {...dirty, blocked: true}, "b", false), "ignore");
  const clean = snapshot();
  assert.equal(workspaceSyncDecision(clean, clean, "b", true), "ignore");
});

test("active scene is local when retained; remote scene wins when the local scene was removed", () => {
  const incoming = {activeId: "remote", scenes: [{id: "local"}, {id: "remote"}]};
  assert.equal(preserveActiveScene(incoming, "local").activeId, "local");
  assert.equal(incoming.activeId, "remote");
  assert.equal(preserveActiveScene(incoming, "deleted"), incoming);
});
