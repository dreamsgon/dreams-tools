import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseVttImport, isVttImportFilename, MAX_VTT_IMPORT_BYTES } from "../lib/vtt-import.ts";

const image = (await readFile(new URL("./fixture-map.png", import.meta.url))).toString("base64");
const fixture = (patch = {}) => ({ format: 0.2, resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 20, y: 12 }, pixels_per_grid: 70 }, image, ...patch });
const parse = (value) => parseVttImport(JSON.stringify(value), "Dungeon.dd2vtt");

test("UVTT extensions share an image/grid import contract", () => {
  for (const extension of ["UVTT", "dd2vtt", "df2vtt"]) assert.ok(isVttImportFilename(`map.${extension}`));
  assert.equal(isVttImportFilename("map.json"), false);
  const result = parse(fixture());
  assert.equal(result.name, "Dungeon");
  assert.equal(result.width, 1400);
  assert.equal(result.height, 840);
  assert.equal(result.image.mimeType, "image/png");
  assert.equal(Buffer.from(result.image.bytes).toString("base64"), image);
  assert.deepEqual(result.grid, { size: 70, offsetX: 0, offsetY: 0 });
});

test("fractional origins align the overlay and preserve source metadata", () => {
  const result = parse(fixture({ resolution: { map_origin: { x: 3.25, y: -2.5 }, map_size: { x: 10.5, y: 5 }, pixels_per_grid: 100 } }));
  assert.deepEqual(result.grid, { size: 100, offsetX: -25, offsetY: -50 });
  assert.deepEqual(result.metadata.origin, { x: 3.25, y: -2.5 });
  assert.equal(result.width, 1050);
});

test("unsupported dynamic data is counted and explicitly warned, never applied", () => {
  const result = parse(fixture({ line_of_sight: [[{x:1,y:1},{x:2,y:2}]], portals: [{}], lights: [{}, {}], environment: { ambient_light: "ff0000" } }));
  assert.equal(result.metadata.counts.line_of_sight, 1);
  assert.equal(result.metadata.counts.portals, 1);
  assert.equal(result.metadata.counts.lights, 2);
  assert.match(result.warnings.join(" "), /not applied; fog remains manual/);
  assert.equal(result.lights, undefined);
});

test("accepts BOM and typed embedded image but rejects content type mismatch", () => {
  assert.equal(parseVttImport("\uFEFF" + JSON.stringify(fixture())).width, 1400);
  assert.equal(parse(fixture({ image: `data:image/png;base64,${image}` })).image.extension, "png");
  assert.throws(() => parse(fixture({ image: `data:image/webp;base64,${image}` })), /does not match/);
});

test("malformed input, unsafe images and invalid metadata fail before upload", () => {
  assert.throws(() => parseVttImport("{"), /Invalid UVTT JSON/);
  for (const value of [null, [], {}, {format:0.2}, fixture({format:"0.2"}), fixture({portals:{}})]) assert.throws(() => parse(value), /UVTT/);
  for (const badImage of ["https://example.com/map.png", "data:image/svg+xml;base64,PHN2Zz4=", "PHN2Zz4=", "!!!!", "a==="]) assert.throws(() => parse(fixture({image:badImage})), /UVTT/);
  for (const ppg of [0, 19, 501, "70", null]) assert.throws(() => parse(fixture({resolution:{map_size:{x:10,y:10},pixels_per_grid:ppg}})), /pixels per grid/);
  assert.throws(() => parse(fixture({ resolution: { map_size: { x: 200, y: 200 }, pixels_per_grid: 70 } })), /8000 pixels/);
  assert.throws(() => parseVttImport(" ".repeat(MAX_VTT_IMPORT_BYTES+1)), /48 MB/);
});
