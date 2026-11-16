import type { Stamp, StampLight, StampPart } from "./map-stamps.ts";

/**
 * More stamps for dungeons, houses, towns and the outdoors, and a Lights group whose stamps give light
 * (`light`: bright and dim reach in squares, and a colour). Drawn as paths at 40 units to a square like
 * every built-in stamp, so the Map Creator and Maptable draw them the same way; "ink" takes the map style's ink.
 */
type Category = "Dungeon" | "Furniture" | "Lights" | "Town" | "Outdoors";
type Parts = (StampPart | StampPart[])[];
const R = (x: number, y: number, w: number, h: number) => `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
const C = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
const ink = (d: string, fill?: string, width = 2): StampPart => fill ? { d, fill, stroke: "ink", width } : { d, stroke: "ink", width };
const paint = (d: string, fill: string): StampPart => ({ d, fill });
const line = (d: string, width = 1.5, stroke = "ink"): StampPart => ({ d, stroke, width });
const f = (n: number) => Math.round(n * 100) / 100;
const E = (cx: number, cy: number, rx: number, ry: number) => `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
const RR = (x: number, y: number, w: number, h: number, r: number) => `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
const poly = (pts: number[][]) => "M " + pts.map(p => `${f(p[0])} ${f(p[1])}`).join(" L ") + " Z";
const ngon = (cx: number, cy: number, r: number, n: number, rot = 0) => poly(Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }));
const star = (cx: number, cy: number, ro: number, ri: number, n: number, rot = -Math.PI / 2) => poly(Array.from({ length: n * 2 }, (_, i) => { const a = rot + i * Math.PI / n, r = i % 2 ? ri : ro; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }));
const ring = (cx: number, cy: number, r: number, n: number, rot = 0): [number, number, number][] => Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n; return [f(cx + Math.cos(a) * r), f(cy + Math.sin(a) * r), a]; });
/** A stroke with an ink outline around a coloured core. */
const outlined = (d: string, w: number, colour: string) => [line(d, w + 2.5), line(d, w, colour)];
const flame = (cx: number, cy: number, s: number) => [
  paint(`M ${cx} ${cy - s} Q ${f(cx + s * 0.9)} ${f(cy - s * 0.1)} ${cx} ${f(cy + s * 0.8)} Q ${f(cx - s * 0.9)} ${f(cy - s * 0.1)} ${cx} ${cy - s} Z`, "#e8742c"),
  paint(`M ${cx} ${f(cy - s * 0.5)} Q ${f(cx + s * 0.5)} ${f(cy + s * 0.1)} ${cx} ${f(cy + s * 0.55)} Q ${f(cx - s * 0.5)} ${f(cy + s * 0.1)} ${cx} ${f(cy - s * 0.5)} Z`, "#f6c34a"),
];
const candle = (x: number, y: number, r = 4) => [ink(C(x, y, r), "#f1ecdc", 1.2), ...flame(x, y, r * 0.8)];
const S = (id: string, name: string, category: Category, w: number, h: number, parts: Parts[], light?: StampLight): Stamp =>
  ({ id, name, category, w, h, parts: parts.flat(2), ...(light ? { light } : {}) });
const bone = (d: string) => [line(d, 5), line(d, 3, "#e8e2d0")];
// ---------- Dungeon ----------
const web = (() => {
  const arcs = [10, 19, 28, 36].map(r => `M ${r} 3 Q ${f(r * 0.55)} ${f(r * 0.55)} 3 ${r}`).join(" ");
  const spokes = [[37, 3], [37, 15], [33, 27], [25, 35], [15, 37], [3, 37]].map(p => `M 3 3 L ${p[0]} ${p[1]}`).join(" ");
  return [line(spokes, 1), line(arcs, 0.9), ink(C(14, 14, 2.6), "#6e6a60", 1), line("M 12 12 L 9 9 M 16 12 L 18 8 M 12 16 L 8 18 M 16 16 L 20 18", 0.9)];
})();
const dungeon = [
  S("sarcophagus", "Sarcophagus", "Dungeon", 1, 2, [[ink(RR(6, 4, 28, 72, 3), "#bdb7aa"), ink(RR(10, 8, 20, 64, 2), "#cfc9bb", 1.2), ink(C(20, 19, 5), "#a8a296", 1.2), ink("M 14 26 Q 20 24 26 26 L 25 60 Q 20 63 15 60 Z", "#a8a296", 1.2), line("M 15 36 L 25 44 M 25 36 L 15 44", 1)]]),
  S("coffin", "Coffin", "Dungeon", 1, 2, [[ink("M 13 5 H 27 L 33 22 L 28 75 H 12 L 7 22 Z", "#8a5a2b"), line("M 15 10 H 25 L 29 23 L 25 70 H 15 L 11 23 Z", 1), ...outlined("M 20 26 V 54 M 14 34 H 26", 1.8, "#e3b341")]]),
  S("bones", "Bone pile", "Dungeon", 1, 1, [[...bone("M 8 31 L 28 27"), ...bone("M 22 35 L 34 31"), ...bone("M 30 11 L 35 24"), ink(C(16, 16, 7), "#e8e2d0", 1.5), paint(C(13.5, 15, 1.8), "#2b2b2b"), paint(C(18.5, 15, 1.8), "#2b2b2b"), line("M 12 22 H 20", 1), paint(C(10, 36, 1.5), "#e8e2d0"), paint(C(31, 18, 1.5), "#e8e2d0")]]),
  S("iron-cage", "Iron cage", "Dungeon", 1, 1, [[ink(R(5, 5, 30, 30), "#8a8d92"), ink(C(20, 20, 13), "#9a9da2", 1.5), line("M 20 7 V 33 M 7 20 H 33 M 11 11 L 29 29 M 29 11 L 11 29", 1.4), line(C(20, 20, 8), 1.4), ink(C(20, 20, 3), "#6e7076", 1.5)]]),
  S("portcullis", "Portcullis", "Dungeon", 2, 1, [[ink(R(4, 11, 72, 18), "#a3a6ab"), line("M 12 11 V 29 M 20 11 V 29 M 28 11 V 29 M 36 11 V 29 M 44 11 V 29 M 52 11 V 29 M 60 11 V 29 M 68 11 V 29", 2.4), line("M 4 17 H 76 M 4 23 H 76", 1.6), ink(R(4, 8, 6, 24), "#8f8a80", 1.5), ink(R(70, 8, 6, 24), "#8f8a80", 1.5)]]),
  S("lever", "Lever", "Dungeon", 1, 1, [[ink(RR(9, 11, 22, 18, 2), "#9a958a"), line("M 14 20 H 26", 4), ...outlined("M 20 20 L 27 13", 3, "#b07a42"), ink(C(27, 13, 3.5), "#c0392b", 1.5), ink(C(20, 20, 2.5), "#6e7076", 1.2)]]),
  S("pit", "Pit", "Dungeon", 1, 1, [[ink("M 6 14 L 13 7 L 24 9 L 33 13 L 34 25 L 28 33 L 15 34 L 7 27 Z", "#2a2723"), paint("M 11 15 L 17 11 L 27 14 L 30 24 L 24 29 L 14 28 Z", "#0f0e0d"), line("M 6 14 L 3 11 M 34 25 L 37 28 M 13 7 L 12 4", 1.2)]]),
  S("rubble", "Rubble", "Dungeon", 1, 1, [[ink("M 6 24 L 10 16 L 19 17 L 21 26 L 12 30 Z", "#a8a296", 1.5), ink("M 20 12 L 27 8 L 33 13 L 30 20 L 22 19 Z", "#8f8a80", 1.5), ink("M 22 26 L 29 22 L 35 27 L 31 33 L 24 32 Z", "#bdb7aa", 1.5), ink(C(10, 9, 2.5), "#8f8a80", 1), ink(C(14, 34, 2), "#a8a296", 1), ink(C(34, 5, 1.8), "#a8a296", 1)]]),
  S("spider-web", "Spider web", "Dungeon", 1, 1, [web]),
  S("throne", "Throne", "Dungeon", 1, 1, [[ink(R(7, 5, 26, 7), "#c9a23a"), ink(R(7, 12, 5, 21), "#c9a23a", 1.5), ink(R(28, 12, 5, 21), "#c9a23a", 1.5), ink(R(12, 12, 16, 21), "#9a3b3b", 1.5), line("M 15 20 H 25", 1, "#c9a23a"), paint(C(20, 8.5, 1.8), "#c0392b")]]),
  S("weapon-rack", "Weapon rack", "Dungeon", 2, 1, [[ink(R(4, 16, 72, 8), "#8a5a2b"), ...[14, 26, 38, 50, 62].flatMap((x, i) => [line(`M ${x} 5 V 36`, 4), line(`M ${x} 5 V 36`, 2, "#c9ced4"), ...(i % 2 ? [] : [line(`M ${x - 4} 30 H ${x + 4}`, 2.5)])])]]),
  S("armour-stand", "Armour stand", "Dungeon", 1, 1, [[line("M 8 33 H 32", 2), ink(E(20, 20, 15, 7.5), "#9aa0a8"), line("M 7 20 L 4 26 M 33 20 L 36 26", 3, "#7d848c"), ink(C(20, 20, 6), "#7d848c", 1.5), line("M 15 20 H 25", 1.3), line("M 20 14 V 26", 1)]]),
  S("fountain", "Fountain", "Dungeon", 2, 2, [[ink(ngon(40, 40, 35, 8, Math.PI / 8), "#bdb7aa"), ink(ngon(40, 40, 29, 8, Math.PI / 8), "#6fa3bf", 1.5), line(C(40, 40, 22), 1, "#e6f3fa"), line(C(40, 40, 16), 1, "#e6f3fa"), ink(C(40, 40, 8), "#a8a296"), ink(C(40, 40, 3.5), "#6fa3bf", 1.2)]]),
  S("magic-circle", "Magic circle", "Dungeon", 2, 2, [[paint(C(40, 40, 33), "rgba(138,99,210,0.16)"), ink(C(40, 40, 34), undefined, 2), ink(C(40, 40, 29), undefined, 1.2), line(ring(40, 40, 24, 5, -Math.PI / 2).map((p, i) => `${i ? "L" : "M"} ${p[0]} ${p[1]}`).join(" ").replace(/$/, " Z"), 1), line([0, 2, 4, 1, 3, 0].map((k, i) => { const p = ring(40, 40, 28, 5, -Math.PI / 2)[k]; return `${i ? "L" : "M"} ${p[0]} ${p[1]}`; }).join(" "), 1.8, "#8a63d2"), line(ring(40, 40, 31.5, 16).map(p => `M ${f(40 + (p[0] - 40) * 0.96)} ${f(40 + (p[1] - 40) * 0.96)} L ${f(40 + (p[0] - 40) * 1.04)} ${f(40 + (p[1] - 40) * 1.04)}`).join(" "), 2, "#8a63d2"), paint(C(40, 40, 4), "#8a63d2")]]),
  S("rune-pedestal", "Rune pedestal", "Dungeon", 1, 1, [[ink(R(8, 8, 24, 24), "#a8a296"), ink(R(12, 12, 16, 16), "#bdb7aa", 1.2), line("M 20 15 V 26 M 15 18 L 20 22 L 25 18", 1.5, "#2b6f9a"), paint(C(20, 26, 1.2), "#2b6f9a")]]),
  S("broken-pillar", "Broken pillar", "Dungeon", 1, 1, [[ink("M 8 20 L 10 12 L 17 7 L 25 8 L 30 14 L 25 20 L 28 25 L 24 31 L 16 33 L 9 28 Z", "#9a958a"), line("M 11 20 L 14 13 L 20 10 M 12 24 L 16 29", 1), ink("M 30 27 L 36 25 L 37 32 L 31 34 Z", "#8f8a80", 1.5), ink(C(31, 8, 2), "#8f8a80", 1)]]),
];

// ---------- Furniture ----------
const chairs = ring(40, 40, 31, 6, Math.PI / 6).map(p => ink(C(p[0], p[1], 6), "#8a5a2b", 1.5));
const furniture = [
  S("bench", "Bench", "Furniture", 2, 1, [[ink(RR(6, 13, 68, 14, 2), "#b07a42"), line("M 6 20 H 74", 1), line("M 14 13 V 27 M 66 13 V 27", 1)]]),
  S("stool", "Stool", "Furniture", 1, 1, [[ink(C(20, 20, 9), "#b07a42"), line(C(20, 20, 5), 1)]]),
  S("wardrobe", "Wardrobe", "Furniture", 2, 1, [[ink(R(4, 8, 72, 24), "#8a5a2b"), ink(R(8, 11, 30, 14), "#a06a35", 1), ink(R(42, 11, 30, 14), "#a06a35", 1), line("M 40 8 V 32", 1.5), paint(C(36, 28.5, 1.6), "#e3b341"), paint(C(44, 28.5, 1.6), "#e3b341")]]),
  S("desk", "Desk with papers", "Furniture", 2, 1, [[ink(R(4, 8, 72, 24), "#9a6a35"), ink("M 15 14 L 29 12 L 31 23 L 17 25 Z", "#f1ecdc", 1), ink(R(34, 13, 12, 10), "#e8e2d0", 1), line("M 18 17 L 26 16 M 19 20 L 27 19 M 37 16 H 43 M 37 19 H 43", 0.8), ink(C(60, 16, 3), "#2b2b2b", 1), line("M 56 27 L 69 15", 1.4, "#e8e2d0"), line("M 52 8 V 32", 1)]]),
  S("fireplace", "Fireplace", "Furniture", 2, 1, [[ink(R(3, 3, 74, 34), "#a8a296"), ink(R(12, 3, 56, 20), "#2f2a27", 1.5), ...outlined("M 20 18 L 60 14 M 22 11 L 58 19", 3, "#6b4423"), ...flame(28, 13, 7), ...flame(40, 11, 8), ...flame(52, 13, 7), paint(C(33, 19, 1.4), "#e8742c"), paint(C(47, 20, 1.4), "#e8742c"), line("M 3 29 H 77 M 22 23 V 37 M 40 29 V 37 M 58 23 V 37", 1)]]),
  S("cauldron", "Cauldron", "Furniture", 1, 1, [[ink(C(5.5, 20, 2.5), "#3b3b40", 1.2), ink(C(34.5, 20, 2.5), "#3b3b40", 1.2), ink(C(20, 20, 13), "#3b3b40"), ink(C(20, 20, 9.5), "#2a2a2d", 1.2), paint(C(20, 20, 8), "#6fae4a"), paint(C(17, 17.5, 2.2), "#9ccf75"), paint(C(23, 23, 1.6), "#9ccf75"), paint(C(24, 16, 1.2), "#9ccf75")]]),
  S("anvil", "Anvil", "Furniture", 1, 1, [[ink("M 5 14 H 25 L 36 20 L 25 26 H 5 Z", "#6e7076"), line("M 8 20 H 28 M 25 14 V 26", 1), paint(R(11, 18.5, 3, 3), "#2b2b2b")]]),
  S("forge", "Forge", "Furniture", 2, 1, [[ink(R(4, 4, 48, 32), "#8f8a80"), ink(R(9, 9, 38, 22), "#3a3430", 1.5), paint(C(16, 24, 2.4), "#c9461f"), paint(C(36, 25, 2.4), "#c9461f"), paint(C(26, 27, 2), "#c9461f"), ...flame(22, 18, 7), ...flame(34, 17, 8), ink("M 52 11 L 74 15 V 25 L 52 29 Z", "#8a5a2b", 1.5), line("M 60 12.5 V 27.5 M 67 14 V 26", 1), line("M 52 20 H 47", 2.4)]]),
  S("workbench", "Workbench", "Furniture", 2, 1, [[ink(R(4, 9, 72, 22), "#b07a42"), line("M 4 20 H 76", 1), ...outlined("M 12 15 H 28", 1.6, "#6b4423"), ink(R(28, 12, 5, 6), "#6e7076", 1.2), ink("M 40 22 L 60 22 L 60 27 L 40 25 Z", "#c9ced4", 1.2), ink(R(66, 12, 7, 7), "#6e7076", 1.2), line("M 69.5 19 V 27", 1.5)]]),
  S("bathtub", "Bathtub", "Furniture", 2, 1, [[ink(RR(4, 6, 72, 28, 12), "#e8e4dc"), ink(RR(9, 11, 62, 18, 9), "#8fc1d8", 1.4), ink(C(14, 20, 2.6), "#c9ced4", 1), line("M 28 17 H 42 M 46 23 H 60", 1.2, "#e6f3fa")]]),
  S("double-bed", "Double bed", "Furniture", 2, 2, [[ink(R(6, 4, 68, 72), "#e7e2d8"), ink(R(6, 4, 68, 7), "#8a5a2b", 1.5), ink(RR(11, 14, 28, 14, 4), "#ffffff", 1.2), ink(RR(41, 14, 28, 14, 4), "#ffffff", 1.2), ink(R(6, 34, 68, 42), "#7a8fb0", 1.5), paint(R(7, 35, 66, 7), "#9fb1cc"), line("M 6 42 H 74 M 40 42 V 76", 1)]]),
  S("cot", "Cot", "Furniture", 1, 2, [[ink(R(7, 5, 26, 70), "#8a5a2b"), ink(R(10, 8, 20, 64), "#d9cfae", 1.2), ink(RR(13, 10, 14, 9, 3), "#ffffff", 1), ink(R(10, 30, 20, 42), "#8c8f6a", 1.2), line("M 10 36 H 30", 1)]]),
  S("rug", "Rug", "Furniture", 2, 3, [[ink(R(5, 6, 70, 108), "#8a3a3a"), ink(R(11, 12, 58, 96), "#d9b36a", 1), ink(R(16, 17, 48, 86), "#b5524a", 1), ink("M 40 30 L 58 60 L 40 90 L 22 60 Z", "#8a3a3a", 1.2), ink("M 40 42 L 50 60 L 40 78 L 30 60 Z", "#d9b36a", 1), paint(C(40, 60, 3), "#8a3a3a"), line([...Array(8)].map((_, i) => `M ${13 + i * 8.5} 2.5 V 6 M ${13 + i * 8.5} 114 V 117.5`).join(" "), 1.2, "#d9b36a")]]),
  S("sacks", "Sacks", "Furniture", 1, 1, [[ink(E(14, 25, 9, 8), "#c9b585", 1.5), ink(E(27, 24, 8, 8), "#b9a572", 1.5), ink(E(20, 13, 8, 7), "#d4c394", 1.5), line("M 17 15 L 23 13 M 11 21 L 17 22 M 25 20 L 30 21", 1)]]),
  S("potion-shelf", "Potion shelf", "Furniture", 2, 1, [[ink(R(4, 10, 72, 20), "#8a5a2b"), ...["#b04a6a", "#4a8fb0", "#6fae4a", "#c9a23a", "#8a63d2"].flatMap((c, i) => [ink(C(14 + i * 13, 20, 5), c, 1.2), paint(C(14 + i * 13, 20, 1.8), "#d8c9a0")])]]),
  S("round-table", "Round table", "Furniture", 2, 2, [[...chairs, ink(C(40, 40, 20), "#b07a42"), line(C(40, 40, 14), 1)]]),
];

// ---------- Lights ----------
const lights = [
  S("wall-torch", "Wall torch", "Lights", 1, 1, [[ink(R(11, 3, 18, 6), "#6e7076", 1.5), ...outlined("M 20 9 V 19", 3, "#6e7076"), ink(C(20, 24, 5.5), "#6b4423", 1.5), ...flame(20, 24, 10)]], { bright: 4, dim: 8, colour: "#ffb35c" }),
  S("brazier", "Brazier", "Lights", 1, 1, [[ink(C(20, 20, 14), "#5a5a60"), ink(C(20, 20, 10.5), "#2f2a27", 1.2), paint(C(13, 21, 2), "#c9461f"), paint(C(27, 22, 2), "#c9461f"), paint(C(20, 28, 2), "#c9461f"), ...flame(20, 19, 9)]], { bright: 4, dim: 8, colour: "#ffa047" }),
  S("candles", "Candle cluster", "Lights", 1, 1, [[ink(C(20, 21, 14), "#a3a39c", 1.5), ...candle(13, 24, 4.5), ...candle(27, 23, 4), ...candle(20, 13, 4)]], { bright: 1, dim: 3, colour: "#ffd27a" }),
  S("candelabra", "Candelabra", "Lights", 1, 1, [[...outlined("M 8 20 H 32 M 20 8 V 32", 2, "#c9a23a"), ink(C(20, 20, 5), "#c9a23a", 1.5), ...candle(8, 20, 3.2), ...candle(32, 20, 3.2), ...candle(20, 8, 3.2), ...candle(20, 32, 3.2), ...candle(20, 20, 3)]], { bright: 2, dim: 4, colour: "#ffd27a" }),
  S("lantern", "Lantern", "Lights", 1, 1, [[paint(C(20, 20, 15), "rgba(255,210,122,0.4)"), ink(R(10, 10, 20, 20), "#5a5a60"), ink(R(14, 14, 12, 12), "#ffd27a", 1.2), line("M 20 14 V 26 M 14 20 H 26", 1), paint(C(20, 20, 3), "#fff2b0"), line("M 14 10 Q 20 4 26 10", 1.5)]], { bright: 3, dim: 6, colour: "#ffd27a" }),
  S("chandelier", "Chandelier", "Lights", 2, 2, [[...outlined(C(40, 40, 28), 3.5, "#c9a23a"), ...outlined(C(40, 40, 13), 2, "#c9a23a"), ...outlined(ring(40, 40, 28, 8, 0).map(p => `M 40 40 L ${p[0]} ${p[1]}`).join(" "), 1.6, "#c9a23a"), ink(C(40, 40, 6), "#c9a23a", 1.5), ...ring(40, 40, 28, 8, 0).flatMap(p => candle(p[0], p[1], 4.2))]], { bright: 5, dim: 10, colour: "#ffd27a" }),
  S("magic-orb", "Magic orb", "Lights", 1, 1, [[paint(C(20, 20, 17), "rgba(143,208,255,0.35)"), ink(C(20, 20, 10), "#8fd0ff", 1.5), paint(C(16.5, 16.5, 3), "#e8f6ff"), line("M 13 22 Q 17 29 26 26", 1.2, "#e8f6ff")]], { bright: 4, dim: 8, colour: "#8fd0ff" }),
  S("glow-crystal", "Glowing crystal", "Lights", 1, 1, [[paint(C(20, 20, 17), "rgba(127,227,208,0.3)"), ink("M 6 28 L 9 14 L 15 12 L 17 28 Z", "#6fcfbb", 1.5), ink("M 23 28 L 25 15 L 32 13 L 35 27 Z", "#6fcfbb", 1.5), ink("M 20 5 L 27 14 L 25 31 L 14 31 L 13 14 Z", "#a5f0e0", 1.5), line("M 20 5 L 20 31 M 13 14 L 20 18 L 27 14", 1)]], { bright: 3, dim: 6, colour: "#7fe3d0" }),
];

// ---------- Town ----------
const town = [
  S("market-stall", "Market stall", "Town", 2, 1, [[...Array(8).fill(0).map((_, i) => paint(R(4 + i * 9, 5, 9, 30), i % 2 ? "#e8e2d0" : "#b5524a")), ink(R(4, 5, 72, 30), undefined, 2), line("M 4 20 H 76", 1.2), ...[[4, 5], [76, 5], [4, 35], [76, 35]].map(p => ink(C(p[0], p[1], 2.5), "#8a5a2b", 1))]]),
  S("cart", "Cart", "Town", 2, 1, [[...outlined("M 66 15 H 78 M 66 25 H 78", 2.4, "#8a5a2b"), ink(R(10, 9, 56, 22), "#b07a42"), line("M 10 16 H 66 M 10 24 H 66", 1), ink(RR(28, 3, 14, 6, 2), "#6b4423", 1.5), ink(RR(28, 31, 14, 6, 2), "#6b4423", 1.5), ink(E(24, 20, 7, 6), "#c9b585", 1.2), ink(E(46, 20, 7, 6), "#d4c394", 1.2)]]),
  S("wagon", "Wagon", "Town", 2, 3, [[...outlined("M 40 100 V 117", 3, "#8a5a2b"), ink(R(12, 10, 56, 88), "#8a5a2b"), ink(RR(15, 13, 50, 64, 14), "#e8e2d0"), line("M 15 28 H 65 M 15 40 H 65 M 15 52 H 65 M 15 64 H 65", 1), ink(R(15, 82, 50, 9), "#a06a35", 1.5), ...[[3, 20], [3, 64], [69, 20], [69, 64]].map(p => ink(RR(p[0], p[1], 8, 20, 2), "#6b4423", 1.5))]]),
  S("signpost", "Signpost", "Town", 1, 1, [[ink("M 20 8 H 31 L 37 13 L 31 18 H 20 Z", "#c08a4a", 1.3), ink("M 20 22 H 9 L 3 27 L 9 32 H 20 Z", "#c08a4a", 1.3), line("M 23 13 H 31 M 17 27 H 10", 1), ink(C(20, 20, 4.5), "#6b4423", 1.5)]]),
  S("hay-bale", "Hay bale", "Town", 1, 1, [[ink(RR(7, 10, 26, 20, 3), "#d9c27a"), line("M 11 14 H 29 M 10 18 H 30 M 11 22 H 29 M 10 26 H 30", 0.8, "#b09a50"), line("M 15 10 V 30 M 25 10 V 30", 1.4, "#8a6a2b")]]),
  S("fence", "Fence", "Town", 1, 1, [[ink(R(1, 18, 38, 4), "#b07a42", 1.5), ink(C(8, 20, 4), "#8a5a2b", 1.5), ink(C(32, 20, 4), "#8a5a2b", 1.5)]]),
  S("gravestone", "Gravestone", "Town", 1, 1, [[ink(RR(11, 14, 18, 22, 6), "#8a7a58", 1.5), ink(RR(10, 6, 20, 8, 2), "#bdb7aa"), line("M 20 17 V 30 M 16 21 H 24", 1.5, "#5f5440")]]),
  S("water-trough", "Water trough", "Town", 2, 1, [[ink(RR(5, 10, 70, 20, 3), "#8a5a2b"), ink(RR(9, 14, 62, 12, 2), "#6fa3bf", 1.2), line("M 16 20 H 30 M 42 18 H 58 M 50 23 H 62", 1, "#e6f3fa")]]),
  S("notice-board", "Notice board", "Town", 2, 1, [[ink(C(10, 31, 3), "#6b4423", 1.2), ink(C(70, 31, 3), "#6b4423", 1.2), ink(R(5, 7, 70, 22), "#a06a35"), ink(R(10, 11, 14, 14), "#f1ecdc", 1), ink(R(28, 12, 12, 12), "#e8e2d0", 1), ink(R(44, 11, 11, 14), "#f1ecdc", 1), ink(R(59, 12, 11, 12), "#e8e2d0", 1), line("M 13 15 H 21 M 13 19 H 21 M 31 16 H 37 M 31 20 H 37 M 47 15 H 52 M 47 19 H 52 M 62 16 H 67", 0.8), paint(C(17, 12.5, 1), "#c0392b"), paint(C(34, 13.5, 1), "#c0392b"), paint(C(49.5, 12.5, 1), "#c0392b"), paint(C(64.5, 13.5, 1), "#c0392b")]]),
  S("crates", "Crates", "Town", 1, 1, [[ink(R(4, 15, 22, 21), "#b07a42"), line("M 4 15 L 26 36 M 26 15 L 4 36", 1.2), ink("M 14 5 L 33 9 L 29 28 L 10 24 Z", "#c9954f"), line("M 14 5 L 29 28 M 33 9 L 10 24", 1.2)]]),
];

// ---------- Outdoors ----------
const branches = (parts: [string, number][], colour: string) => [...parts.map(([d, w]) => line(d, w + 2.5)), ...parts.map(([d, w]) => line(d, w, colour))];
const outdoors = [
  S("pine-tree", "Pine tree", "Outdoors", 2, 2, [[ink(star(40, 40, 35, 21, 12), "#3f6a45"), ink(star(40, 40, 24, 14, 12, -Math.PI / 2 + Math.PI / 12), "#4f7f53", 1.5), ink(star(40, 40, 13, 7, 8), "#66935a", 1.2), paint(C(40, 40, 3), "#6b4423")]]),
  S("dead-tree", "Dead tree", "Outdoors", 2, 2, [[...branches([["M 40 40 L 14 18 M 40 40 L 66 22 M 40 40 L 30 68 M 40 40 L 58 66", 4.5], ["M 22 26 L 11 30 M 21 25 L 18 10 M 58 28 L 71 36 M 55 30 L 61 13 M 34 58 L 19 64 M 52 56 L 67 61", 2.4]], "#7a6a55"), ink(C(40, 40, 7), "#6b5a46", 1.5), line(C(40, 40, 3.5), 1)]]),
  S("stump", "Stump", "Outdoors", 1, 1, [[ink(C(20, 20, 13), "#7a5a35"), paint(C(20, 20, 10), "#c9a26a"), line(C(20, 20, 7), 0.9), line(C(20, 20, 3.5), 0.9), line("M 20 20 L 29 15", 0.9)]]),
  S("fallen-log", "Fallen log", "Outdoors", 2, 1, [[ink(R(11, 5, 7, 7), "#8a5a2b", 1.5), ink(RR(5, 11, 70, 18, 8), "#8a5a2b"), line("M 14 17 H 68 M 12 23 H 70", 1), ink(E(12, 20, 4.5, 8), "#c9a26a", 1.5), line(E(12, 20, 2, 4), 0.8)]]),
  S("boulder", "Boulder", "Outdoors", 2, 2, [[ink("M 10 46 L 14 26 L 28 12 L 48 8 L 64 16 L 72 34 L 68 56 L 54 68 L 32 70 L 16 62 Z", "#8f8f8a"), paint("M 28 12 L 48 8 L 34 34 Z", "#a8a8a2"), paint("M 52 44 L 72 34 L 68 56 L 54 68 Z", "#7a7a74"), paint("M 16 62 L 30 56 L 54 68 L 32 70 Z", "#7a7a74"), line("M 28 12 L 34 34 L 14 26 M 34 34 L 48 8 M 34 34 L 52 44 L 72 34 M 52 44 L 54 68 M 34 34 L 30 56 L 16 62 M 30 56 L 54 68 M 52 44 L 30 56", 1.2)]]),
  S("standing-stone", "Standing stone", "Outdoors", 1, 1, [[ink("M 9 22 L 11 9 L 20 4 L 30 10 L 32 24 L 26 35 L 13 33 Z", "#9a958a"), paint("M 11 9 L 20 21 L 30 10 L 20 4 Z", "#b3aea2"), line("M 11 9 L 20 21 L 30 10 M 20 21 L 26 35", 1), line("M 15 26 H 20 M 22 24 V 30", 1.2, "#4f7a3a")]]),
  S("mushrooms", "Mushrooms", "Outdoors", 1, 1, [[ink(C(14, 24, 7.5), "#b5524a", 1.5), ink(C(28, 14, 6), "#d9a24a", 1.5), ink(C(27, 29, 4.5), "#b5524a", 1.5), ...[[11, 22, 1.5], [16, 27, 1.2], [15, 20, 1], [26, 12, 1.2], [30, 16, 1], [26, 28, 1]].map(p => paint(C(p[0], p[1], p[2]), "#f1ecdc"))]]),
  S("flowers", "Flower patch", "Outdoors", 1, 1, [[paint(C(13, 25, 8), "#6f9a52"), paint(C(27, 15, 8), "#6f9a52"), paint(C(24, 27, 7), "#7aa35f"), paint(C(14, 13, 6), "#7aa35f"), ...[[11, 22, "#e0709a"], [17, 28, "#f1ecdc"], [27, 12, "#e3b341"], [31, 19, "#e0709a"], [13, 12, "#f1ecdc"], [24, 27, "#9a7ad6"], [20, 19, "#e3b341"]].flatMap(([x, y, c]) => [ink(C(+x, +y, 3), String(c), 0.8), paint(C(+x, +y, 1.1), "#c9701f")])]]),
  S("tall-grass", "Tall grass", "Outdoors", 1, 1, [[paint(E(20, 21, 15, 12), "#a8c27a"), line(ring(20, 21, 1, 14, 0.2).map(([, , a], i) => { const r = 9 + (i % 3) * 3, x = f(20 + Math.cos(a) * r), y = f(21 + Math.sin(a) * r * 0.8); const bx = f(20 + Math.cos(a) * 3), by = f(21 + Math.sin(a) * 3); return `M ${bx} ${by} Q ${f(20 + Math.cos(a + 0.5) * r * 0.7)} ${f(21 + Math.sin(a + 0.5) * r * 0.6)} ${x} ${y}`; }).join(" "), 2, "#4f7a3a"), paint(C(20, 21, 2), "#4f7a3a")]]),
  S("reeds", "Reeds", "Outdoors", 1, 1, [[line(ring(20, 20, 1, 12, 0).map(([, , a], i) => { const r = 11 + (i % 2) * 4; return `M 20 20 Q ${f(20 + Math.cos(a + 0.4) * r * 0.6)} ${f(20 + Math.sin(a + 0.4) * r * 0.6)} ${f(20 + Math.cos(a) * r)} ${f(20 + Math.sin(a) * r)}`; }).join(" "), 2.2, "#6f9a52"), ink(E(16, 17, 2.2, 4.5), "#8a6a3a", 1), ink(E(24, 16, 2.2, 4.5), "#8a6a3a", 1), ink(E(21, 25, 2.2, 4.5), "#8a6a3a", 1)]]),
  S("lily-pads", "Lily pads", "Outdoors", 1, 1, [[paint(C(20, 20, 17), "rgba(63,111,143,0.35)"), ...[[12, 13, 6, 0.4], [28, 13, 5.5, 2.2], [13, 28, 6, 4.4], [28, 29, 5, 1.2]].map(([cx, cy, r, a]) => ink(`M ${cx} ${cy} L ${f(cx + Math.cos(a + 0.6) * r)} ${f(cy + Math.sin(a + 0.6) * r)} A ${r} ${r} 0 1 1 ${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)} Z`, "#6f9a52", 1.3)), ink(C(21, 21, 2.4), "#f1b3cc", 0.9), paint(C(21, 21, 0.9), "#e3b341")]]),
  S("pond", "Small pond", "Outdoors", 2, 2, [[ink("M 12 40 Q 8 20 28 14 Q 46 6 62 18 Q 76 30 68 50 Q 62 70 40 68 Q 18 70 12 40 Z", "#6fa3bf"), paint("M 22 40 Q 22 28 34 25 Q 48 20 56 30 Q 62 40 56 50 Q 48 58 36 57 Q 24 54 22 40 Z", "#4f87a8"), line("M 30 36 Q 38 31 46 34 M 44 46 Q 50 44 54 40", 1.2, "#cfe6f2"), ...[[14, 24, 3], [30, 12, 2.4], [66, 22, 3], [70, 48, 2.6], [55, 67, 3], [20, 62, 2.6]].map(p => ink(C(p[0], p[1], p[2]), "#9a958a", 1.2))]]),
];

/** The stamps added after the first set, by group. */
export const moreStamps: Stamp[] = [...dungeon, ...furniture, ...lights, ...town, ...outdoors];
