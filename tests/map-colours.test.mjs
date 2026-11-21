import test from "node:test";
import assert from "node:assert/strict";
import { biomeIds, biomes } from "../lib/hexmap/biomes.ts";
import { terrains } from "../lib/encyclopedia/map-model.ts";

/**
 * Map colours must stay tellable apart, including for colour-blind players. Distances are in
 * OKLab (×100); colour blindness is simulated with Machado, Oliveira and Fernandes (2009) at full
 * strength. Glyphs (trees, peaks, marsh reeds) and labels help too, so the bars sit below the
 * 15 a chart would need, but well above the near-identical pairs these maps used to have.
 */
const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linear = hex => [1, 3, 5].map(i => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};
const simulate = (rgb, kind) => MACHADO[kind].map(row => Math.max(0, Math.min(1, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])));
function oklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const distance = (a, b, kind) => { const x = oklab(kind ? simulate(linear(a), kind) : linear(a)), y = oklab(kind ? simulate(linear(b), kind) : linear(b)); return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
/** The closest pair in a set of named colours, by normal vision and by the worse of the two red-green simulations. */
function closest(colours, skip = () => false) {
  const names = Object.keys(colours); let normal = { d: Infinity }, cvd = { d: Infinity };
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const [a, b] = [names[i], names[j]]; if (skip(a, b)) continue;
    const n = distance(colours[a], colours[b]), c = Math.min(distance(colours[a], colours[b], "protan"), distance(colours[a], colours[b], "deutan"));
    if (n < normal.d) normal = { d: n, pair: `${a}/${b}` };
    if (c < cvd.d) cvd = { d: c, pair: `${a}/${b}` };
  }
  return { normal, cvd };
}

test("hex map biomes have ground colours you can tell apart", () => {
  const { normal, cvd } = closest(Object.fromEntries(biomeIds.map(id => [id, biomes[id].flat])));
  assert.ok(normal.d >= 7.5, `${normal.pair} are too alike (${normal.d.toFixed(1)})`);
  assert.ok(cvd.d >= 6, `${cvd.pair} are too alike for red-green colour blindness (${cvd.d.toFixed(1)})`);
});

test("hex map biome forests stay apart, and every forest stands out from its trees", () => {
  const { normal, cvd } = closest(Object.fromEntries(biomeIds.map(id => [id, biomes[id].forest])));
  assert.ok(normal.d >= 7, `${normal.pair} forests are too alike (${normal.d.toFixed(1)})`);
  assert.ok(cvd.d >= 4, `${cvd.pair} forests are too alike for red-green colour blindness (${cvd.d.toFixed(1)})`);
  for (const id of biomeIds) assert.ok(distance(biomes[id].tree, biomes[id].forest) >= 15, `${id} trees vanish into their forest`);
});

test("world map land colours are not near-identical", () => {
  // Kinds that are the same family on purpose (the whites of ice, the blues of water) are skipped.
  const land = Object.fromEntries(terrains.filter(t => !t.water && !["snow", "glacier", "mountains", "hills", "forest", "marsh"].includes(t.id)).map(t => [t.id, t.color]));
  const { normal, cvd } = closest(land);
  assert.ok(normal.d >= 5, `${normal.pair} are too alike (${normal.d.toFixed(1)})`);
  assert.ok(cvd.d >= 3, `${cvd.pair} are too alike for red-green colour blindness (${cvd.d.toFixed(1)})`);
});
