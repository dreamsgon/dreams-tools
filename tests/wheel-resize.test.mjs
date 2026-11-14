import test from "node:test";
import assert from "node:assert/strict";
import { wheelAmount, accumulateWheel, stepTokenSize, stepEffectSize, stepLabelSize, wheelResizeToken, wheelResizeEffect, wheelScaleShape, wheelScalable } from "../lib/wheel-resize.ts";

const grid = { type: "square", size: 70, offsetX: 0, offsetY: 0, units: 5, unit: "ft", snap: true };

test("shift-wheel takes deltaY, or deltaX when the browser swaps the axis", () => {
  assert.equal(wheelAmount({ deltaY: -100, deltaX: 0 }), -100);
  assert.equal(wheelAmount({ deltaY: 0, deltaX: -100 }), -100);
  assert.equal(wheelAmount({ deltaY: -3, deltaX: 0, deltaMode: 1 }), -48);
});

test("wheel travel adds up to a step; scrolling up is bigger", () => {
  assert.deepEqual(accumulateWheel(0, -50), { steps: 1, carry: 0 });
  assert.deepEqual(accumulateWheel(0, 50), { steps: -1, carry: 0 });
  let carry = 0, total = 0;
  for (let i = 0; i < 30; i++) { const r = accumulateWheel(carry, -2); carry = r.carry; total += r.steps; }
  assert.equal(total, 1);
  assert.deepEqual(accumulateWheel(0, -100), { steps: 1, carry: 0 }, "a full mouse notch is one step");
  assert.equal(accumulateWheel(0, -900).steps, 1, "one event is never more than one step");
  assert.equal(accumulateWheel(-30, 20).steps, 0);
  assert.deepEqual(accumulateWheel(-30, 20), { steps: 0, carry: 20 }, "reversing starts again");
});

test("token sizes use the same steps as the size buttons and stop at the ends", () => {
  assert.equal(stepTokenSize(1, 1), 2);
  assert.equal(stepTokenSize(1, -1), 0.5);
  assert.equal(stepTokenSize(1, 2), 3);
  assert.equal(stepTokenSize(20, 1), 20);
  assert.equal(stepTokenSize(0.25, -1), 0.25);
  assert.equal(stepTokenSize(1.5, 1), 2);
});

test("a token grows from its top-left corner and stays on the grid", () => {
  const token = { x: 105, y: 105, size: 1 };
  wheelResizeToken(token, grid, 1);
  assert.equal(token.size, 2);
  assert.deepEqual([token.x, token.y], [140, 140]);
});

test("area sizes step by quarter, half, then whole squares", () => {
  assert.equal(stepEffectSize(1, 1), 1.25);
  assert.equal(stepEffectSize(1.75, 1), 2);
  assert.equal(stepEffectSize(2, 1), 2.5);
  assert.equal(stepEffectSize(2, -1), 1.75);
  assert.equal(stepEffectSize(6, 1), 7);
  assert.equal(stepEffectSize(7, -1), 6);
  assert.equal(stepEffectSize(0.25, -1), 0.25);
  assert.equal(stepEffectSize(200, 1), 200);
  assert.equal(stepEffectSize(4, 3), 5.5);
});

test("an area resize scales a custom shape and reports no change at the limit", () => {
  const effect = { type: "custom", size: 2, points: [{ x: 0, y: 0 }, { x: 140, y: 0 }] };
  assert.equal(wheelResizeEffect(effect, 1), true);
  assert.equal(effect.size, 2.5);
  assert.deepEqual(effect.points[1], { x: 175, y: 0 });
  assert.equal(wheelResizeEffect({ type: "circle", size: 200, points: [] }, 1), false);
});

test("labels change text size within their limits", () => {
  const label = { kind: "label", type: "square", size: 1, points: [], labelSize: 24 };
  assert.equal(wheelResizeEffect(label, 1), true);
  assert.equal(label.labelSize, 26);
  assert.equal(stepLabelSize(40, 1), 44);
  assert.equal(stepLabelSize(44, -1), 40);
  assert.equal(stepLabelSize(120, 1), 120);
  assert.equal(stepLabelSize(10, -1, 10, 60), 10);
  assert.equal(stepLabelSize(60, 1, 10, 60), 60);
});

const stamp = (a, b) => ({ type: "stamp", points: [a, b] });
test("a stamp scales about its centre", () => {
  const next = wheelScaleShape(stamp({ x: 100, y: 100 }, { x: 200, y: 200 }), 1, 70, 1400, 980);
  assert.deepEqual(next, [{ x: 95, y: 95 }, { x: 205, y: 205 }]);
  const smaller = wheelScaleShape(stamp({ x: 100, y: 100 }, { x: 200, y: 200 }), -1, 70, 1400, 980);
  assert.deepEqual(smaller, [{ x: 105, y: 105 }, { x: 195, y: 195 }]);
});

test("stamps stop at half a square and 20 squares", () => {
  assert.equal(wheelScaleShape(stamp({ x: 0, y: 0 }, { x: 35, y: 35 }), -1, 70, 1400, 980), null);
  assert.equal(wheelScaleShape(stamp({ x: 0, y: 0 }, { x: 1400, y: 980 }), 1, 70, 1400, 980), null);
  const big = wheelScaleShape(stamp({ x: 0, y: 0 }, { x: 1380, y: 700 }), 3, 70, 2800, 2800);
  assert.ok(big[1].x - big[0].x <= 1400);
  const near = wheelScaleShape(stamp({ x: 0, y: 0 }, { x: 70, y: 700 }), -50, 70, 2800, 2800);
  assert.ok(near[1].x - near[0].x >= 35 - 1);
});

test("growing near an edge slides the shape back onto the map", () => {
  const next = wheelScaleShape(stamp({ x: 0, y: 0 }, { x: 100, y: 100 }), 1, 70, 1400, 980);
  assert.deepEqual(next[0], { x: 0, y: 0 });
  assert.equal(next[1].x, 110);
});

test("lines and rooms scale too, but doors and merged rooms do not", () => {
  assert.ok(wheelScaleShape({ type: "line", points: [{ x: 100, y: 100 }, { x: 300, y: 100 }] }, 1, 70, 1400, 980));
  assert.equal(wheelScalable({ type: "rect" }), true);
  assert.equal(wheelScalable({ type: "door" }), false);
  assert.equal(wheelScalable({ type: "merged" }), false);
});
