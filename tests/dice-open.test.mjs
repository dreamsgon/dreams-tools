import test from "node:test";
import assert from "node:assert/strict";

const target = new EventTarget();
globalThis.window = target;
const { openDiceTray, onOpenDiceTray } = await import("../lib/dice-open.ts");

test("opening the tray reaches a listener with the panel asked for", () => {
  const seen = [];
  const stop = onOpenDiceTray(p => seen.push(p));
  openDiceTray();
  openDiceTray("log");
  stop();
  openDiceTray("dice");
  assert.deepEqual(seen, ["dice", "log"]);
});
