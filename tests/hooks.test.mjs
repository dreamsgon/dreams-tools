import test from "node:test";
import assert from "node:assert/strict";
import { hexHook, hookPlaceKinds, placeHook, roomHook, rumourHook, withHook } from "../lib/hooks.ts";
import { placeKinds, terrains } from "../lib/encyclopedia/map-model.ts";

test("hooks are the same for the same seed and vary between seeds", () => {
  assert.equal(placeHook("town", "a"), placeHook("town", "a"));
  assert.equal(hexHook("forest", "a"), hexHook("forest", "a"));
  const many = new Set(Array.from({ length: 30 }, (_, i) => roomHook(`s${i}`)));
  assert.ok(many.size > 20, `only ${many.size} different room hooks in 30 rolls`);
});

test("every kind of place and every terrain gets a full hook", () => {
  assert.deepEqual([...hookPlaceKinds].sort(), placeKinds.map(k => k.id).sort());
  for (const kind of [...hookPlaceKinds, null]) {
    const lines = placeHook(kind, "seed").split("\n");
    assert.deepEqual(lines.map(l => l.split(":")[0]), ["Lure", "Trouble", "Someone"]);
    assert.match(lines[2], /^Someone: \S.*, an? .+, wants to .+\. Secretly .+\.$/);
  }
  for (const t of [...terrains.map(t => t.id), null, "unknown"]) assert.match(hexHook(t, "seed"), /^Here: [A-Z].+\.$/);
  assert.match(rumourHook("x"), /^They say: .+\nTruth: .+$/);
});

test("towns and wild places draw from different tables", () => {
  const lures = kind => new Set(Array.from({ length: 40 }, (_, i) => placeHook(kind, `${i}`).split("\n")[0]));
  const town = lures("town"), ruin = lures("ruin");
  assert.equal([...town].filter(l => ruin.has(l)).length, 0);
});

test("a hook is added on its own lines, and only when it fits", () => {
  assert.equal(withHook("", "Hook", 10), "Hook");
  assert.equal(withHook("Old notes  \n", "Hook", 100), "Old notes\n\nHook");
  assert.equal(withHook("x".repeat(95), "Hook", 100), null);
});

test("every hook fits the smallest notes box it is offered for", () => {
  for (let i = 0; i < 200; i++) {
    assert.ok(roomHook(`${i}`).length <= 1000);
    assert.ok(rumourHook(`${i}`).length <= 400);
    assert.ok(placeHook("castle", `${i}`).length <= 3000);
  }
});
