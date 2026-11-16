import type { Stamp, StampPart } from "./map-stamps.ts";

/**
 * Space stamps for the Map Creator: stars, worlds, small bodies and phenomena, stations and ships, and markers for
 * orbits, lanes and hazards. Drawn as paths like every built-in stamp (40 units to a square), so Maptable and the
 * Map Creator draw them the same way. Glows are rings of see-through colour; worlds are lit from the upper left.
 */
type Category = "Stars" | "Worlds" | "Space" | "Stations and ships";
/** Library sections whose tiles sit on a night sky, since glows vanish on a light tile. */
export const spaceCategories: readonly string[] = ["Stars", "Worlds", "Space", "Stations and ships"];
const C = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
const E = (cx: number, cy: number, rx: number, ry: number) => `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
const P = (pts: number[][]) => `M ${pts.map(p => p.join(" ")).join(" L ")} Z`;
const fill = (d: string, f: string): StampPart => ({ d, fill: f });
const line = (d: string, stroke: string, width = 2): StampPart => ({ d, stroke, width });
const both = (d: string, f: string, stroke: string, width = 1.5): StampPart => ({ d, fill: f, stroke, width });
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A soft glow: rings of the colour, fading outwards, with a bright core. */
function glow(cx: number, cy: number, r: number, rim: string, mid: string, core: string, coreR = 0.32): StampPart[] {
  return [fill(C(cx, cy, r), `${rim}22`), fill(C(cx, cy, r * 0.8), `${rim}33`), fill(C(cx, cy, r * 0.62), `${mid}66`), fill(C(cx, cy, r * 0.46), `${mid}bb`), fill(C(cx, cy, r * coreR), core)];
}
/** A band across a sphere between two heights (as a share of the radius, -1 top to 1 bottom). */
function band(cx: number, cy: number, r: number, a: number, b: number) {
  const y1 = cy + a * r, y2 = cy + b * r, x1 = Math.sqrt(Math.max(0, r * r - (a * r) ** 2)), x2 = Math.sqrt(Math.max(0, r * r - (b * r) ** 2));
  return `M ${r1(cx - x1)} ${r1(y1)} H ${r1(cx + x1)} A ${r} ${r} 0 0 1 ${r1(cx + x2)} ${r1(y2)} H ${r1(cx - x2)} A ${r} ${r} 0 0 1 ${r1(cx - x1)} ${r1(y1)} Z`;
}
/** The night side of a sphere lit from the upper left. */
const night = (cx: number, cy: number, r: number) => { const k = r * Math.SQRT1_2, ax = r1(cx + k), ay = r1(cy - k), bx = r1(cx - k), by = r1(cy + k); return `M ${ax} ${ay} A ${r} ${r} 0 1 1 ${bx} ${by} A ${r} ${r1(r * 0.45)} -45 0 0 ${ax} ${ay} Z`; };
function sphere(cx: number, cy: number, r: number, base: string, extra: StampPart[] = [], air?: string): StampPart[] {
  return [...(air ? [fill(C(cx, cy, r * 1.12), `${air}55`)] : []), fill(C(cx, cy, r), base), ...extra, fill(night(cx, cy, r), "rgba(5,8,18,.5)"), fill(C(cx - r * 0.38, cy - r * 0.38, r * 0.22), "rgba(255,255,255,.18)"), line(C(cx, cy, r), "rgba(0,0,0,.45)", 1)];
}
const blobs = (cx: number, cy: number, r: number, color: string, seed: number, n = 5) => Array.from({ length: n }, (_, i) => {
  const a = seed + i * 2.4, d = r * (0.25 + ((i * 37 + seed * 11) % 10) / 20), s = r * (0.16 + ((i * 13) % 5) / 30);
  return fill(C(r1(cx + Math.cos(a) * d), r1(cy + Math.sin(a) * d), r1(s)), color);
});

const STAR = { O: ["#9db4ff", "#bfd0ff", "#ffffff"], B: ["#aabfff", "#cad7ff", "#ffffff"], A: ["#cad7ff", "#e4ebff", "#ffffff"], F: ["#f8f7ff", "#fff8ea", "#ffffff"], G: ["#ffd25c", "#ffe9a3", "#fffbe8"], K: ["#ff9a3c", "#ffc078", "#fff1dc"], M: ["#ff5a3a", "#ff8a5c", "#ffd8c8"] } as const;
const star = (k: keyof typeof STAR) => glow(40, 40, 38, STAR[k][0], STAR[k][1], STAR[k][2], 0.3);

const def = (id: string, name: string, category: Category, w: number, h: number, parts: StampPart[]): Stamp => ({ id: `space-${id}`, name, category, w, h, parts });
const W1 = 20, W2 = 40;
export const spaceStamps: Stamp[] = [
  // Stars, 2 × 2 squares.
  ...(["O", "B", "A", "F", "G", "K", "M"] as const).map(k => def(`star-${k.toLowerCase()}`, `Class ${k} star`, "Stars", 2, 2, star(k))),
  def("white-dwarf", "White dwarf", "Stars", 1, 1, glow(W1, W1, 18, "#9cc8ff", "#eaf4ff", "#ffffff", 0.18)),
  def("neutron-star", "Neutron star", "Stars", 1, 1, [line("M 22 1 L 18 39 M 25 1 L 21 39", "rgba(191,227,255,.55)", 1.5), ...glow(W1, W1, 12, "#bfe3ff", "#dff2ff", "#ffffff", 0.25)]),
  def("pulsar", "Pulsar", "Stars", 1, 1, [line("M 4 3 L 36 37", "rgba(159,231,255,.45)", 5), ...glow(W1, W1, 11, "#9fe7ff", "#cff4ff", "#ffffff", 0.3)]),
  def("black-hole", "Black hole", "Stars", 2, 2, [fill(C(40, 40, 38), "#ff6a2a18"), fill(C(40, 40, 28), "#ff6a2a40"), fill(C(40, 40, 20), "#ffb35caa"), both(E(40, 40, 37, 9), "none", "#ffcf8a", 3), fill(C(40, 40, 15), "#000000"), line("M 3 40 A 37 9 0 0 0 77 40", "#ffe2b0", 3)]),
  def("brown-dwarf", "Brown dwarf", "Stars", 1, 1, sphere(W1, W1, 13, "#6a2f3e", [fill(band(W1, W1, 13, -0.55, -0.25), "#8a4a5a"), fill(band(W1, W1, 13, 0.1, 0.35), "#8a4a5a")], "#a25a6a")),
  def("red-giant", "Red giant", "Stars", 3, 3, glow(60, 60, 58, "#c0301a", "#ff7a3a", "#ffd0a0", 0.62)),
  def("protostar", "Protostar", "Stars", 2, 2, [fill(E(40, 40, 38, 13), "#7a5a4a66"), ...glow(40, 40, 22, "#ffb36b", "#ffcf96", "#fff3d6", 0.35)]),
  // Worlds, 1 × 1 unless giant.
  def("rocky", "Rocky world", "Worlds", 1, 1, sphere(W1, W1, 15, "#8f877c", [...blobs(W1, W1, 15, "#6f685f", 1), fill(C(25, 14, 2.5), "#5f5850")])),
  def("desert", "Desert world", "Worlds", 1, 1, sphere(W1, W1, 15, "#d6a86e", [fill(band(W1, W1, 15, -0.2, 0.05), "#c08a50"), fill(band(W1, W1, 15, 0.35, 0.55), "#e8c48e")], "#e8c48e")),
  def("magma", "Magma world", "Worlds", 1, 1, sphere(W1, W1, 15, "#3a2826", [line("M 8 14 L 15 19 L 13 26 M 20 8 L 22 17 L 30 20 L 33 28 M 15 19 L 22 17", "#ff6a28", 1.6)], "#ff7a3c")),
  def("ice", "Ice world", "Worlds", 1, 1, sphere(W1, W1, 15, "#dbeaf3", [line("M 9 15 L 19 21 L 31 17 M 19 21 L 21 33", "#8fb6d0", 1), fill(C(15, 12, 3), "#f6fbff")])),
  def("ocean", "Ocean world", "Worlds", 1, 1, sphere(W1, W1, 15, "#1f5a96", [...blobs(W1, W1, 15, "#5f8a52", 2, 4), fill(band(W1, W1, 15, -0.5, -0.35), "rgba(245,248,250,.7)"), fill(band(W1, W1, 15, 0.3, 0.42), "rgba(245,248,250,.6)")], "#8cc8ff")),
  def("jungle", "Jungle world", "Worlds", 1, 1, sphere(W1, W1, 15, "#2f6a3a", [...blobs(W1, W1, 15, "#1e4f80", 3, 3), fill(band(W1, W1, 15, -0.15, 0.0), "rgba(245,248,250,.55)")], "#8cc8ff")),
  def("toxic", "Toxic world", "Worlds", 1, 1, sphere(W1, W1, 15, "#9a9a34", [fill(band(W1, W1, 15, -0.6, -0.3), "#c4ba5a"), fill(band(W1, W1, 15, 0.05, 0.3), "#c4ba5a"), fill(band(W1, W1, 15, 0.55, 0.75), "#7a7a2a")], "#e6d26e")),
  def("gas-giant", "Gas giant", "Worlds", 2, 2, sphere(W2, W2, 32, "#cc9f6e", [fill(band(W2, W2, 32, -0.8, -0.55), "#e8cea0"), fill(band(W2, W2, 32, -0.3, -0.1), "#a8703e"), fill(band(W2, W2, 32, 0.15, 0.35), "#e8cea0"), fill(band(W2, W2, 32, 0.55, 0.75), "#b07a48"), fill(E(52, 50, 6, 3.5), "#c05a3c")])),
  def("ice-giant", "Ice giant", "Worlds", 2, 2, sphere(W2, W2, 30, "#5fa0d2", [fill(band(W2, W2, 30, -0.5, -0.2), "#96cceb"), fill(band(W2, W2, 30, 0.3, 0.5), "#4a86ba")])),
  def("ringed-giant", "Ringed giant", "Worlds", 3, 2, [line("M 6 52 A 54 14 0 0 1 114 28", "rgba(225,205,170,.85)", 5), ...sphere(60, 40, 26, "#d8b680", [fill(band(60, 40, 26, -0.6, -0.35), "#ecd6aa"), fill(band(60, 40, 26, 0.0, 0.2), "#b48e5a"), fill(band(60, 40, 26, 0.45, 0.6), "#ecd6aa")]), line("M 6 52 A 54 14 0 0 0 114 28", "rgba(240,222,186,.95)", 5)]),
  def("rogue", "Rogue planet", "Worlds", 1, 1, [fill(C(W1, W1, 15), "#1d2533"), line(C(W1, W1, 15), "#5a6a80", 1.2), fill(C(15, 15, 3), "#2c3646")]),
  def("shattered", "Shattered world", "Worlds", 2, 2, [both(P([[20, 30], [34, 20], [44, 32], [30, 44]]), "#8a7f74", "#2a2420"), both(P([[48, 28], [64, 32], [60, 48], [46, 42]]), "#8a7f74", "#2a2420"), both(P([[20, 50], [36, 50], [40, 64], [24, 68]]), "#7a6f64", "#2a2420"), both(P([[46, 56], [56, 58], [54, 68], [44, 66]]), "#8a7f74", "#2a2420"), fill(C(40, 46, 5), "#ff8a3a"), fill(C(40, 46, 9), "#ff8a3a44")]),
  def("locked", "Tidally locked world", "Worlds", 1, 1, [fill(C(W1, W1, 15), "#1a1f2a"), fill(`M 20 5 A 15 15 0 0 1 20 35 Z`, "#d9b48a"), line("M 20 5 A 15 15 0 0 1 20 35", "rgba(122,209,160,.8)", 2.5), line(C(W1, W1, 15), "rgba(0,0,0,.45)", 1)]),
  def("city", "City world", "Worlds", 1, 1, [fill(C(W1, W1, 15), "#202634"), ...Array.from({ length: 22 }, (_, i) => { const a = i * 2.39, d = 2 + ((i * 7) % 12); return fill(C(r1(20 + Math.cos(a) * d), r1(20 + Math.sin(a) * d), 0.9 + (i % 3) * 0.3), i % 4 ? "#ffd27a" : "#fff2c8"); }), fill(night(W1, W1, 15), "rgba(5,8,18,.35)"), line(C(W1, W1, 15), "rgba(255,210,122,.4)", 1)]),
  def("moon", "Moon", "Worlds", 1, 1, sphere(W1, W1, 9, "#a39b90", [fill(C(17, 18, 2), "#7d756a"), fill(C(23, 23, 1.4), "#7d756a")])),
  // Small bodies, phenomena and markers.
  def("asteroid", "Asteroid", "Space", 1, 1, [both(P([[9, 18], [15, 10], [26, 11], [32, 18], [29, 29], [18, 32], [9, 26]]), "#7d746a", "#3a342e"), fill(C(17, 19, 2.5), "#5a524a"), fill(C(25, 24, 1.6), "#5a524a")]),
  def("asteroid-field", "Asteroid field", "Space", 2, 2, [[12, 30, 6], [30, 14, 5], [50, 22, 7], [62, 44, 5], [44, 50, 8], [22, 58, 6], [64, 66, 4], [34, 34, 3], [8, 52, 3], [56, 8, 3]].map(([x, y, r], i) => both(P(Array.from({ length: 6 }, (_, k) => [r1(x + Math.cos(k * 1.05 + i) * r * (k % 2 ? 0.8 : 1)), r1(y + Math.sin(k * 1.05 + i) * r * (k % 2 ? 0.8 : 1))])), i % 2 ? "#8a8177" : "#756c62", "#3a342e", 1))),
  def("comet", "Comet", "Space", 2, 1, [line("M 64 12 L 6 30", "rgba(207,232,255,.3)", 9), line("M 64 12 L 16 28", "rgba(159,208,255,.55)", 3.5), fill(C(66, 12, 5), "#f2fbff")]),
  def("ice-chunk", "Ice chunk", "Space", 1, 1, [both(P([[10, 19], [17, 10], [28, 13], [32, 23], [24, 31], [13, 28]]), "#cfe6f5", "#6f9fbf"), line("M 17 16 L 21 22 L 28 19", "#8fbfdf", 1)]),
  def("debris-disc", "Debris disc", "Space", 3, 2, [both(E(60, 40, 54, 16), "none", "rgba(185,169,154,.75)", 7), both(E(60, 40, 40, 11), "none", "rgba(185,169,154,.45)", 4), ...glow(60, 40, 10, "#ffe46b", "#fff0a6", "#ffffff", 0.4)]),
  def("nebula", "Nebula", "Space", 3, 3, [fill(C(46, 54, 36), "#7a5cff40"), fill(C(76, 68, 32), "#3fb0ff38"), fill(C(66, 40, 22), "#ff7ab840"), fill(C(54, 72, 18), "#7a5cff40"), fill(C(70, 56, 12), "#ffffff1a")]),
  def("dust-cloud", "Dust cloud", "Space", 3, 2, [fill(C(36, 42, 30), "#8a6a4a44"), fill(C(72, 38, 32), "#6a4f3a44"), fill(C(56, 56, 20), "#9a7a5a3a"), fill(C(92, 52, 18), "#8a6a4a33")]),
  def("ion-storm", "Ion storm", "Space", 2, 2, [fill(C(40, 40, 36), "#3a6fbf30"), fill(C(40, 40, 24), "#3a6fbf30"), fill(P([[32, 8], [44, 30], [36, 32], [50, 66], [44, 42], [54, 40], [40, 10]]), "#bfe3ff")]),
  def("wormhole", "Wormhole", "Space", 2, 2, [fill(C(40, 40, 36), "#3fb0ff22"), fill(C(40, 40, 28), "#7a5cff66"), fill(C(40, 40, 18), "#1a0a3a"), fill(C(40, 40, 10), "#000000"), line("M 16 52 A 26 10 30 0 1 64 28", "rgba(191,169,255,.75)", 1.5), line("M 22 30 A 20 7 -20 0 1 58 50", "rgba(191,169,255,.6)", 1.5)]),
  def("solar-flare", "Solar flare", "Space", 2, 2, [fill(C(20, 60, 24), "#ffb21f"), fill(C(20, 60, 30), "#ffb21f44"), fill("M 30 44 C 40 18 66 12 74 30 C 64 24 50 28 42 46 Z", "#ff6a2a"), fill("M 36 40 C 44 26 58 22 64 30 C 56 28 48 32 42 42 Z", "#ffd27a")]),
  def("anomaly", "Anomaly", "Space", 2, 2, [line(C(40, 40, 10), "#e5c27a", 2), line(C(40, 40, 20), "rgba(229,194,122,.7)", 1.5), line(C(40, 40, 30), "rgba(229,194,122,.4)", 1), fill(C(40, 40, 3), "#fff3d0")]),
  def("supernova-remnant", "Supernova remnant", "Space", 3, 3, [line(C(60, 60, 50), "rgba(255,178,31,.4)", 3), line(C(60, 60, 42), "rgba(255,122,184,.65)", 2.5), line(C(60, 60, 32), "rgba(63,176,255,.6)", 2), fill(C(60, 60, 26), "#ff7ab814"), fill(C(60, 60, 2.5), "#ffffff")]),
  def("orbit-ring", "Orbit ring", "Space", 4, 4, [line(C(80, 80, 72), "rgba(143,227,214,.7)", 1.5), fill(C(152, 80, 3), "#8fe3d6")]),
  def("green-zone", "Green zone band", "Space", 4, 4, [line(C(80, 80, 66), "rgba(127,220,154,.3)", 14), line(C(80, 80, 73), "rgba(127,220,154,.6)", 1), line(C(80, 80, 59), "rgba(127,220,154,.6)", 1)]),
  def("hazard", "Hazard", "Space", 1, 1, [both("M 20 5 L 35 33 L 5 33 Z", "#f0b56e", "#7a4a12", 1.5), line("M 20 14 V 24", "#3a2a10", 3), fill(C(20, 28.5, 1.8), "#3a2a10")]),
  def("waypoint", "Waypoint", "Space", 1, 1, [fill("M 20 36 C 20 36 9 24 9 16 A 11 11 0 0 1 31 16 C 31 24 20 36 20 36 Z", "#8fe3d6"), fill(C(20, 16, 4), "#05070d")]),
  // Stations and ships.
  def("station", "Station", "Stations and ships", 2, 2, [line(C(40, 40, 24), "#cfd8e2", 4), line("M 40 6 V 74 M 6 40 H 74", "#cfd8e2", 3), fill(C(40, 40, 8), "#cfd8e2"), fill(C(40, 40, 4), "#8fe3d6"), fill("M 2 34 H 12 V 46 H 2 Z M 68 34 H 78 V 46 H 68 Z", "#3f6fbf")]),
  def("ring-station", "Ring station", "Stations and ships", 3, 2, [both(E(60, 40, 52, 18), "none", "#cfd8e2", 6), line("M 60 22 V 58 M 8 40 H 112", "#8a96a3", 2.5), fill(C(60, 40, 7), "#e8eef5"), line(E(60, 40, 52, 18), "rgba(127,220,154,.6)", 1.5)]),
  def("shipyard", "Shipyard", "Stations and ships", 3, 2, [line("M 8 12 H 112 V 68 H 8 Z M 8 40 H 112 M 36 12 V 68 M 64 12 V 68 M 92 12 V 68", "#e0a84a", 2.5), fill("M 24 32 H 80 L 94 40 L 80 48 H 24 Z", "#cfd8e2"), fill("M 24 32 L 18 28 V 52 L 24 48 Z", "#8a96a3")]),
  def("jump-gate", "Jump gate", "Stations and ships", 2, 2, [fill(C(40, 40, 26), "#8fe3d630"), fill(C(40, 40, 18), "#8fe3d640"), line(C(40, 40, 30), "#8fe3d6", 6), ...[0, 1, 2, 3, 4, 5].map(i => fill(C(r1(40 + Math.cos(i * 1.047) * 30), r1(40 + Math.sin(i * 1.047) * 30), 4), "#cfd8e2"))]),
  def("beacon", "Beacon", "Stations and ships", 1, 1, [line("M 20 36 V 14", "#cfd8e2", 2.5), fill(C(20, 11, 4), "#ff5a5a"), line("M 12 4 A 10 10 0 0 0 12 18 M 28 4 A 10 10 0 0 1 28 18", "rgba(255,138,138,.75)", 1.5)]),
  def("satellite", "Satellite", "Stations and ships", 1, 1, [fill("M 16 16 H 24 V 24 H 16 Z", "#cfd8e2"), fill("M 2 17 H 14 V 23 H 2 Z M 26 17 H 38 V 23 H 26 Z", "#3f6fbf"), line("M 20 16 V 9", "#cfd8e2", 1.5), fill(C(20, 8, 2), "#cfd8e2")]),
  def("mining-rig", "Mining rig", "Stations and ships", 2, 2, [line("M 14 64 L 40 16 L 66 64 Z M 40 16 V 72 M 24 46 H 56", "#e0a84a", 3), both(P([[30, 66], [38, 60], [50, 62], [54, 72], [42, 78], [30, 74]]), "#7d746a", "#3a342e"), fill(C(40, 16, 4), "#ff8a3a")]),
  def("defense-platform", "Defense platform", "Stations and ships", 2, 2, [both("M 40 10 L 66 24 V 52 L 40 70 L 14 52 V 24 Z", "#3a4450", "#cfd8e2", 2), line("M 40 26 V 6 M 26 36 L 10 28 M 54 36 L 70 28", "#ff8a3a", 3), fill(C(40, 40, 8), "#5a6878"), fill(C(40, 40, 3), "#ff8a3a")]),
  def("derelict", "Derelict", "Stations and ships", 2, 1, [both("M 6 26 L 18 14 H 50 L 70 22 L 64 32 H 14 Z", "#4a4f56", "#8a929c"), line("M 38 14 L 44 26 L 36 32", "#1a1d22", 2), fill(C(58, 24, 1.6), "#ff5a5a"), fill("M 70 22 L 78 18 L 76 26 Z", "#4a4f56")]),
  def("wreck-field", "Wreck field", "Stations and ships", 2, 2, [[[10, 20], [22, 14], [26, 22], [14, 28]], [[38, 10], [54, 12], [52, 20], [40, 18]], [[50, 46], [68, 50], [62, 62], [48, 56]], [[14, 52], [30, 52], [32, 64], [16, 66]], [[34, 34], [44, 36], [42, 44], [32, 42]]].map(p => both(P(p), "#6a7079", "#2a2e33", 1.2))),
  def("space-elevator", "Space elevator", "Stations and ships", 1, 2, [fill(C(20, 82, 18), "#2f6f9f"), line("M 20 64 V 6", "#cfd8e2", 1.5), fill("M 14 2 H 26 V 9 H 14 Z", "#cfd8e2"), fill("M 17 30 H 23 V 35 H 17 Z", "#e0a84a")]),
  def("habitat", "Habitat cylinder", "Stations and ships", 2, 1, [fill("M 14 12 H 62 A 8 8 0 0 1 62 28 H 14 A 8 8 0 0 1 14 12 Z", "#8a96a3"), line("M 12 20 H 64", "#7fdc9a", 4), line("M 70 20 H 78", "#cfd8e2", 2), fill("M 72 12 H 76 V 28 H 72 Z", "#3f6fbf")]),
  def("dyson-swarm", "Dyson swarm", "Stations and ships", 3, 3, [...glow(60, 60, 18, "#ffe46b", "#fff0a6", "#ffffff", 0.45), ...Array.from({ length: 30 }, (_, i) => { const a = i / 30 * Math.PI * 2, d = 34 + (i % 3) * 8; return fill(`M ${r1(60 + Math.cos(a) * d - 2)} ${r1(60 + Math.sin(a) * d - 2)} h 4 v 4 h -4 Z`, "#cfd8e2"); })]),
  def("relay-buoy", "Relay buoy", "Stations and ships", 1, 1, [fill(C(20, 20, 4), "#cfd8e2"), line(C(20, 20, 9), "rgba(143,227,214,.7)", 1.5), line(C(20, 20, 15), "rgba(143,227,214,.4)", 1.5)]),
  def("starship", "Starship", "Stations and ships", 2, 1, [fill("M 74 20 L 56 10 H 18 L 8 14 V 26 L 18 30 H 56 Z", "#cfd8e2"), fill("M 56 10 L 64 15 V 25 L 56 30 Z", "#8fe3d6"), fill("M 24 4 H 40 L 44 10 H 22 Z M 24 36 H 40 L 44 30 H 22 Z", "#8a96a3"), fill("M 2 16 H 8 V 24 H 2 Z", "#ffb35c"), line("M 18 20 H 52", "#8a96a3", 1.5)]),
  def("shuttle", "Shuttle", "Stations and ships", 1, 1, [fill("M 34 20 L 24 12 H 10 L 6 20 L 10 28 H 24 Z", "#e8eef5"), fill("M 24 12 L 28 16 V 24 L 24 28 Z", "#8fe3d6"), fill("M 12 12 L 16 4 H 20 L 18 12 Z M 12 28 L 16 36 H 20 L 18 28 Z", "#8a96a3"), fill("M 2 18 H 6 V 22 H 2 Z", "#ffb35c")]),
  def("fighter", "Fighter", "Stations and ships", 1, 1, [fill("M 36 20 L 12 8 L 16 18 H 6 V 22 H 16 L 12 32 Z", "#cfd8e2"), fill("M 26 18 L 30 20 L 26 22 Z", "#8fe3d6"), fill("M 2 19 H 6 V 21 H 2 Z", "#ff8a3a")]),
  def("fleet", "Fleet", "Stations and ships", 2, 2, [[14, 52], [36, 30], [42, 60], [60, 40], [22, 20]].map(([x, y]) => fill(`M ${x + 12} ${y} L ${x - 6} ${y - 7} L ${x - 2} ${y} L ${x - 6} ${y + 7} Z`, "#cfd8e2"))),
];
