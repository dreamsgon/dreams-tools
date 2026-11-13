import test from "node:test";
import assert from "node:assert/strict";
import { AUTOSAVE_KEY, readAutosave, writeAutosave, unsavedLabel } from "../lib/autosave.ts";
import { savePhase } from "../lib/save-phase.ts";

test("Save automatically is on unless switched off, and the choice is kept on this device", () => {
  const m = new Map(), before = globalThis.localStorage;
  globalThis.localStorage = { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  try {
    assert.equal(readAutosave(), true);
    writeAutosave(false);
    assert.equal(m.get(AUTOSAVE_KEY), "off");
    assert.equal(readAutosave(), false);
    writeAutosave(true);
    assert.equal(m.has(AUTOSAVE_KEY), false);
    assert.equal(readAutosave(), true);
    globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
    assert.equal(readAutosave(), true, "blocked storage means the default");
    writeAutosave(false); // does not throw
  } finally { globalThis.localStorage = before; }
});

test("the chip counts unsaved changes and reads the Encyclopedia's status too", () => {
  assert.equal(unsavedLabel(1), "1 unsaved change");
  assert.equal(unsavedLabel(3), "3 unsaved changes");
  assert.equal(unsavedLabel(0), "Some unsaved changes");
  assert.equal(savePhase("All changes saved", "", false), "saved");
  assert.equal(savePhase("Unsaved changes", "", false), "unsaved");
  assert.equal(savePhase("Saving…", "", false), "saving");
  assert.equal(savePhase("Unsaved changes", "Save failed", false), "failed");
  assert.equal(savePhase("Loading", "", false), "loading");
});
