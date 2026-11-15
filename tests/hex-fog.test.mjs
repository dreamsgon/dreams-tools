import test from "node:test";
import assert from "node:assert/strict";
import { hexesAround, revealAroundTokens, revealHexes, REVEAL_AROUND_MAX } from "../lib/hex-fog.ts";
import { fogged } from "../lib/fog.ts";
import { setUpDrawnMapScene } from "../lib/map-export.ts";
import { defaultHexOptions, generateHexMap } from "../lib/hexmap/generate.ts";
import { hexCell, hexCenter, newScene, newToken, sceneSchema } from "../lib/model.ts";

const hexScene = (orient = "flat", around = 1) => {
  const made = generateHexMap({ ...defaultHexOptions, cols: 24, rows: 18, orient, settlements: 0, sites: 0 });
  const scene = Object.assign(newScene("Crawl"), { width: made.width, height: made.height, drawing: { background: "#cfc8b4", style: null, shapes: [], folders: [], layerOrder: [], hexes: made.layer } });
  setUpDrawnMapScene(scene, { fog: true, markers: false, grid: { size: 70, units: 5, unit: "ft" }, around });
  return scene;
};
const party = (scene, q, r, extra = {}) => ({ ...newToken("Party"), disposition: "party", ...hexCenter(q, r, scene.grid), ...extra });
const steps = (g, a, b) => { const p = hexCell(a, g), q = hexCell(b, g); return (Math.abs(p.q - q.q) + Math.abs(p.r - q.r) + Math.abs(p.q + p.r - q.q - q.r)) / 2; };

test("the hexes around a point: 1, 7, 19 and 37 hexes for 0 to 3 steps", () => {
  const scene = hexScene();
  const centre = hexCenter(6, 4, scene.grid);
  assert.deepEqual([0, 1, 2, 3].map(n => hexesAround(centre, scene.grid, n).length), [1, 7, 19, 37]);
  for (const c of hexesAround(centre, scene.grid, 2)) assert.ok(steps(scene.grid, centre, c) <= 2);
  assert.equal(REVEAL_AROUND_MAX, 3);
});

test("Use in Maptable with fog on a hex map can clear hexes around the party, saved with the scene", () => {
  const scene = hexScene("pointy", 2);
  assert.equal(scene.fog.around, 2);
  const parsed = sceneSchema.parse(JSON.parse(JSON.stringify(scene)));
  assert.equal(parsed.fog.around, 2);
  const older = JSON.parse(JSON.stringify(scene)); delete older.fog.around;
  assert.equal(sceneSchema.parse(older).fog.around, undefined, "scenes saved before this have it off");
  assert.ok(!sceneSchema.safeParse({ ...parsed, fog: { ...parsed.fog, around: 9 } }).success);
  const off = hexScene("flat", null);
  assert.equal(off.fog.around, undefined);
});

for (const orient of ["flat", "pointy"]) test(`a party token that moves clears the hexes around it for good (${orient} hexes)`, () => {
  const before = hexScene(orient, 1), g = before.grid;
  before.tokens = [party(before, 5, 4)];
  const placed = structuredClone(before); placed.tokens = [];
  revealAroundTokens(placed, before);
  const first = before.fog.strokes.length;
  assert.equal(first, 1, "arriving on the map clears its hexes");
  for (const c of hexesAround(before.tokens[0], g, 1)) assert.equal(fogged(before, c), false);
  assert.equal(fogged(before, hexCenter(8, 4, g)), true, "hexes further out stay fogged");
  // Moving two hexes over clears the new hexes and keeps the old ones clear.
  const after = structuredClone(before); Object.assign(after.tokens[0], hexCenter(7, 4, g));
  revealAroundTokens(before, after);
  assert.equal(after.fog.strokes.length, 2);
  for (const c of [...hexesAround(hexCenter(5, 4, g), g, 1), ...hexesAround(hexCenter(7, 4, g), g, 1)]) assert.equal(fogged(after, c), false);
  // The edges of a hex are clear too, not just its middle.
  const edge = hexCenter(8, 4, g);
  assert.equal(fogged(after, { x: edge.x + g.size * 0.8 * (orient === "flat" ? 1 : 0.85), y: edge.y }), false);
  // Stepping back into clear hexes adds nothing.
  const back = structuredClone(after); Object.assign(back.tokens[0], hexCenter(6, 4, g));
  revealAroundTokens(after, back);
  assert.equal(back.fog.strokes.length, 2);
});

test("only visible party tokens clear fog, and only when the scene asks for it", () => {
  const base = hexScene("flat", 0), g = base.grid;
  base.tokens = [party(base, 3, 3, { disposition: "enemy" }), party(base, 6, 3, { hidden: true }), party(base, 9, 3, { pieceOf: "shape-1" })];
  const moved = structuredClone(base);
  moved.tokens.forEach(t => Object.assign(t, { x: t.x + g.size * 1.5 }));
  revealAroundTokens(base, moved);
  assert.equal(moved.fog.strokes.length, 0);
  const off = structuredClone(base); delete off.fog.around; off.tokens = [party(off, 2, 2)];
  revealAroundTokens(undefined, off);
  assert.equal(off.fog.strokes.length, 0);
  const square = structuredClone(base); square.grid.type = "square"; square.tokens = [party(square, 2, 2)];
  revealAroundTokens(undefined, square);
  assert.equal(square.fog.strokes.length, 0, "square grids are left alone");
  const own = structuredClone(base); own.tokens = [party(own, 4, 4)];
  revealAroundTokens(undefined, own);
  assert.equal(fogged(own, hexCenter(4, 4, g)), false);
  assert.equal(fogged(own, hexCenter(5, 4, g)), true, "radius 0 clears only the hex it stands on");
});

test("a long crawl flattens the fog instead of running past the stroke limit", () => {
  const scene = hexScene("flat", 1), g = scene.grid;
  scene.fog.strokes = Array.from({ length: 1995 }, (_, k) => ({ mode: "reveal", shape: "rect", size: 5, points: [{ x: k % 40, y: 0 }, { x: k % 40 + 1, y: 1 }] }));
  scene.tokens = [party(scene, 10, 8)];
  revealAroundTokens(undefined, scene);
  assert.ok(scene.fog.strokes.length <= 3);
  assert.equal(scene.fog.around, 1);
  assert.equal(fogged(scene, hexCenter(10, 8, g)), false);
  assert.ok(sceneSchema.safeParse(JSON.parse(JSON.stringify(scene))).success);
});

test("revealing scattered hexes keeps them as separate outlines", () => {
  const scene = hexScene();
  const stroke = revealHexes([hexCenter(2, 2, scene.grid), hexCenter(10, 10, scene.grid)], scene.grid);
  assert.equal(stroke.shape, "merged");
  assert.equal(stroke.parts.length, 2);
  assert.equal(revealHexes([], scene.grid), null);
});
