import test from "node:test";
import assert from "node:assert/strict";
import { polygonContains, polygonMidpoints } from "../lib/fog.ts";
const polygon = [{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:50,y:50},{x:0,y:100}];
test("fog picking respects concave regions", () => {
  assert.equal(polygonContains(polygon, {x:50,y:20}), true);
  assert.equal(polygonContains(polygon, {x:50,y:90}), false);
  assert.equal(polygonContains(polygon, {x:150,y:20}), false);
});
test("fog insert handles include closing edge and preserve original vertices", () => {
  const before = structuredClone(polygon);
  const handles = polygonMidpoints(polygon);
  assert.deepEqual(handles[0], {x:50,y:0});
  assert.deepEqual(handles.at(-1), {x:0,y:50});
  assert.equal(handles.length, polygon.length);
  assert.deepEqual(polygon, before);
});
