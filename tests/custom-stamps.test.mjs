import test from "node:test";
import assert from "node:assert/strict";
import { customStamps, customStampAsset, defaultSquares, drawingStampAssets, findStamps, stampById, stampBox } from "../lib/map-stamps.ts";
import { shapeOps } from "../lib/map-style.ts";
import { stampPieces } from "../lib/map-export.ts";
import { assetSchema } from "../lib/model.ts";

const asset = (patch = {}) => ({ id: "a1", name: "Wagon.png", src: "/api/assets?id=6f1c2c1a-8a4b-4c3e-9a51-2f6a0f1b9d10", width: 400, height: 200, kind: "stamp", ...patch });
const shape = (patch = {}) => ({ id: "s1", type: "stamp", stamp: "asset:a1", rotation: 0, flip: false, roomParts: [], hidden: false, locked: false, name: "Wagon 3", folderId: null, smooth: false, points: [{ x: 0, y: 0 }, { x: 140, y: 70 }], fill: null, stroke: "#000000", thickness: 1, closed: false, ...patch });

test("an uploaded picture covers one square across its shorter side", () => {
  assert.deepEqual(defaultSquares(400, 200), { w: 2, h: 1 });
  assert.deepEqual(defaultSquares(100, 300), { w: 1, h: 3 });
  assert.deepEqual(defaultSquares(5000, 10), { w: 10, h: 1 });
});

test("only stamp assets become stamps, named without the file type, sized as chosen", () => {
  const list = customStamps([asset({ name: "wagon.png" }), asset({ id: "a2", kind: "image" }), asset({ id: "a3", name: "Cart.webp", squares: { w: 3, h: 2 } })]);
  assert.deepEqual(list.map(s => [s.id, s.name, s.w, s.h, s.category]), [["asset:a1", "Wagon", 2, 1, "Yours"], ["asset:a3", "Cart", 3, 2, "Yours"]]);
  assert.equal(stampById("asset:a3", list).name, "Cart");
  assert.equal(stampById("chest", list).name, "Chest", "built-in stamps still come first");
  assert.equal(findStamps("wag", list)[0].id, "asset:a1");
  assert.deepEqual(stampBox(list[0], { x: 100, y: 100 }, 70, 70, 700, 700), [{ x: 0, y: 70 }, { x: 140, y: 140 }]);
});

test("stamp assets keep their size in squares", () => {
  assert.ok(assetSchema.safeParse(asset({ squares: { w: 2, h: 1 } })).success);
  assert.equal(assetSchema.safeParse(asset({ squares: { w: 0, h: 1 } })).success, false);
});

test("a placed uploaded stamp draws its picture in its box, and names the asset to load", () => {
  assert.equal(customStampAsset("asset:a1"), "a1");
  assert.equal(customStampAsset("chest"), null);
  const ops = shapeOps(shape({ rotation: 90, flip: true }), { background: "#000000", style: null });
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0].image, { assetId: "a1", w: 140, h: 70 });
  assert.equal(ops[0].matrix.length, 6);
  assert.deepEqual(drawingStampAssets({ shapes: [shape(), shape({ id: "s2" }), shape({ id: "s3", stamp: "chest" }), { type: "rect" }] }), ["a1"]);
});

test("uploaded stamps can become pieces on the table too", () => {
  const d = { background: "#000000", style: null, shapes: [shape()], layerOrder: [], folders: [], layerState: {} };
  const [piece] = stampPieces(d, 70);
  assert.equal(piece.shapeId, "s1");
  assert.equal(piece.size, 2);
  assert.match(piece.lookName, /^Map piece: Wagon 2×1/);
});
