import test from "node:test";
import assert from "node:assert/strict";
import { libraryTokenDropPoint } from "../lib/library-token-drop.ts";

test("gallery drops use canvas offset, pan and zoom in world coordinates", () => {
  assert.deepEqual(libraryTokenDropPoint({ x: 410, y: 280 }, { left: 100, top: 50 },
    { x: -90, y: 30, scale: 2 }, { x: 0, y: 0, width: 1000, height: 800 }), { x: 200, y: 100 });
});

test("focused crop drops preserve the crop's absolute map coordinates", () => {
  const rect = { left: 100, top: 50 }, view = { x: -300, y: -200, scale: 1 };
  const crop = { x: 400, y: 300, width: 200, height: 100 };
  assert.deepEqual(libraryTokenDropPoint({ x: 300, y: 200 }, rect, view, crop), { x: 500, y: 350 });
  assert.equal(libraryTokenDropPoint({ x: 150, y: 200 }, rect, view, crop), null);
});

test("drops outside map bounds or with invalid coordinates are rejected", () => {
  const rect = { left: 0, top: 0 }, view = { x: 0, y: 0, scale: 1 }, bounds = { x: 0, y: 0, width: 500, height: 400 };
  for (const point of [{ x: -1, y: 100 }, { x: 501, y: 100 }, { x: 100, y: 401 }, { x: NaN, y: 0 }]) {
    assert.equal(libraryTokenDropPoint(point, rect, view, bounds), null);
  }
});
