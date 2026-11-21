import test from "node:test";
import assert from "node:assert/strict";
import { gridStep } from "../lib/encyclopedia/grid-keys.ts";

test("arrow keys move one cell and stop at the edges", () => {
  assert.deepEqual(gridStep("ArrowRight", { c: 2, r: 3 }, 10, 8), { c: 3, r: 3 });
  assert.deepEqual(gridStep("ArrowLeft", { c: 0, r: 3 }, 10, 8), { c: 0, r: 3 });
  assert.deepEqual(gridStep("ArrowUp", { c: 4, r: 0 }, 10, 8), { c: 4, r: 0 });
  assert.deepEqual(gridStep("ArrowDown", { c: 4, r: 7 }, 10, 8), { c: 4, r: 7 });
  assert.deepEqual(gridStep("ArrowDown", { c: 4, r: 2 }, 10, 8), { c: 4, r: 3 });
});

test("Home and End go to the ends of the row; other keys do nothing", () => {
  assert.deepEqual(gridStep("Home", { c: 5, r: 2 }, 10, 8), { c: 0, r: 2 });
  assert.deepEqual(gridStep("End", { c: 5, r: 2 }, 10, 8), { c: 9, r: 2 });
  assert.equal(gridStep("Enter", { c: 5, r: 2 }, 10, 8), null);
  assert.equal(gridStep("a", { c: 5, r: 2 }, 10, 8), null);
});
