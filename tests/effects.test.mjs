import test from "node:test";
import assert from "node:assert/strict";
import { effectSchema, newScene } from "../lib/model.ts";
import { effectContains, effectPolygon, effectHandles } from "../lib/effects.ts";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { initialWorkspace } from "../lib/model.ts";
const renderSource = stripTypeScriptTypes(await readFile(new URL("../lib/render.ts", import.meta.url), "utf8"))
  .replaceAll('"./model"', JSON.stringify(new URL("../lib/model.ts", import.meta.url).href))
  .replaceAll('"./token-defaults"', JSON.stringify(new URL("../lib/token-defaults.ts", import.meta.url).href))
  .replaceAll('"./token-initials"', JSON.stringify(new URL("../lib/token-initials.ts", import.meta.url).href))
  .replaceAll('"./token-name"', JSON.stringify(new URL("../lib/token-name.ts", import.meta.url).href))
  .replaceAll('"./token-display-layout"', JSON.stringify(new URL("../lib/token-display-layout.ts", import.meta.url).href))
  .replaceAll('"./map-drawing"', JSON.stringify(new URL("../lib/map-drawing.ts", import.meta.url).href))
  .replaceAll('"./map-style"', JSON.stringify(new URL("../lib/map-style.ts", import.meta.url).href))
  .replaceAll('"./effects"', JSON.stringify(new URL("../lib/effects.ts", import.meta.url).href));
const { renderScene } = await import(`data:text/javascript;base64,${Buffer.from(renderSource).toString("base64")}`);
const grid = newScene().grid;
const effect = (values = {}) => effectSchema.parse({ id: "e", type: "circle", x: 200, y: 200, size: 2, color: "#ff4400", label: "", ...values });
test("legacy effects acquire visibility, duration and geometry defaults", () => {
  const e = effect();
  assert.equal(e.hidden, false);
  assert.equal(e.persistent, false);
  assert.equal(e.rotation, 0);
  assert.equal(e.width, 1);
  assert.deepEqual(e.points, []);
  assert.equal(effectContains(e, { x: 339, y: 200 }, grid), true);
  assert.equal(effectContains(e, { x: 341, y: 200 }, grid), false);
});
test("line rotation and width agree with containment and handles", () => {
  const e = effect({ type: "line", rotation: 90 });
  assert.equal(effectContains(e, { x: 200, y: 300 }, grid), true);
  assert.equal(effectContains(e, { x: 240, y: 300 }, grid), false);
  assert.equal(effectContains(e, { x: 200, y: 180 }, grid), false);
  assert.ok(Math.abs(effectHandles(e, grid).resize.y - 340) < 0.001);
});
test("cones respect reach and angle; custom vertices translate and rotate", () => {
  const cone = effect({ type: "cone" });
  assert.equal(effectContains(cone, { x: 300, y: 210 }, grid), true);
  assert.equal(effectContains(cone, { x: 180, y: 200 }, grid), false);
  assert.equal(effectContains(cone, { x: 340, y: 250 }, grid), false);
  const custom = effect({ type: "custom", rotation: 90, points: [{x:0,y:0},{x:100,y:0},{x:0,y:100}] });
  assert.equal(effectContains(custom, { x: 180, y: 220 }, grid), true);
  assert.equal(effectContains(custom, { x: 220, y: 220 }, grid), false);
  assert.deepEqual(effectPolygon(custom, grid)[0], { x: 200, y: 200 });
});
test("invalid effect geometry is rejected", () => {
  for (const values of [{ width: 0 }, { angle: 0 }, { rotation: Infinity }, { persistent: "yes" }]) assert.throws(() => effect(values));
});
test("hidden effects and labels stay out of player rendering but remain editable for GM", () => {
  const workspace = initialWorkspace(), scene = workspace.scenes[0];
  scene.grid.type = "none";
  const hidden = effect({ hidden: true, persistent: true, label: "Secret aura" });
  scene.effects.push(hidden);
  const calls = [];
  const ctx = new Proxy({}, { get: (_target, name) => (...args) => calls.push({ name, args }), set: () => true });
  renderScene(ctx, scene, workspace, new Map(), { player: true, selected: hidden.id });
  assert.ok(!calls.some(c => c.name === "arc" || c.name === "fillText"));
  calls.length = 0;
  renderScene(ctx, scene, workspace, new Map(), { selected: hidden.id });
  assert.ok(calls.some(c => c.name === "fillText" && c.args[0] === hidden.label));
  assert.equal(calls.filter(c => c.name === "arc").length, 3);
});
