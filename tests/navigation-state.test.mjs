import test from "node:test";
import assert from "node:assert/strict";
import { navigationStorageKey, parseNavigationState } from "../lib/navigation-state.ts";
import { preserveActiveScene } from "../lib/workspace-sync.ts";

const navigation = { version: 1, dashboard: false, creatorOpen: true, panel: "fog", sidebar: false,
  activeId: "map-2", location: "folder", dashboardLocation: null, conditionLocation: "conditions", overview: { id: "camp" } };

test("refresh navigation round trips dashboard, creator and collapsed sidebar states", () => {
  for (const value of [navigation, { ...navigation, dashboard: true, creatorOpen: false, panel: null, overview: { id: null } }]) {
    assert.deepEqual(parseNavigationState(JSON.stringify(value)), value);
  }
});

test("malformed and obsolete navigation cannot restore invalid controls", () => {
  for (const value of [null, "{", "null", "[]", JSON.stringify({ ...navigation, version: 2 }),
    JSON.stringify({ ...navigation, panel: "unknown" }), JSON.stringify({ ...navigation, sidebar: "false" }),
    JSON.stringify({ ...navigation, activeId: {} }), JSON.stringify({ ...navigation, location: "" })]) {
    assert.equal(parseNavigationState(value), null);
  }
});

test("the open campaign on the dashboard is restored, and older saves without it still load", () => {
  const { overview: _, ...older } = navigation;
  assert.deepEqual(parseNavigationState(JSON.stringify(older)), { ...older, overview: null });
  assert.deepEqual(parseNavigationState(JSON.stringify({ ...navigation, overview: { id: "" } })), { ...navigation, overview: null });
  assert.deepEqual(parseNavigationState(JSON.stringify({ ...navigation, overview: { id: 5 } })), { ...navigation, overview: null });
});

test("storage keys isolate accounts and encode identifier separators", () => {
  assert.notEqual(navigationStorageKey("alice"), navigationStorageKey("bob"));
  assert.equal(navigationStorageKey("a/b"), "maptable:navigation:v1:a%2Fb");
});

test("restored map must still exist and does not mutate downloaded workspace", () => {
  const workspace = { activeId: "map-1", scenes: [{ id: "map-1" }, { id: "map-2" }] };
  assert.equal(preserveActiveScene(workspace, navigation.activeId).activeId, "map-2");
  assert.equal(workspace.activeId, "map-1");
  assert.equal(preserveActiveScene(workspace, "deleted"), workspace);
});

test("the last place is kept per tab and per browser, and the tab's copy wins", async () => {
  const { readRemembered, remember } = await import("../lib/navigation-state.ts");
  const store = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  const before = { s: globalThis.sessionStorage, l: globalThis.localStorage };
  try {
    globalThis.sessionStorage = store(); globalThis.localStorage = store();
    remember("k", "a");
    assert.equal(readRemembered("k"), "a");
    globalThis.sessionStorage = store(); // a new tab or a browser restart
    assert.equal(readRemembered("k"), "a");
    globalThis.sessionStorage.setItem("k", "tab");
    assert.equal(readRemembered("k"), "tab");
    globalThis.sessionStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    assert.equal(readRemembered("k"), null);
    remember("k", "x"); // storage is optional
  } finally { globalThis.sessionStorage = before.s; globalThis.localStorage = before.l; }
});
