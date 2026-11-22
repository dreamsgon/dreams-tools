/*
 * Storm and Spire: a fully custom skin, inspired by the Eberron setting's mix of art deco, pulp adventure and film
 * noir: a city of towers under a ring of gold in the sky, an airship held up by a ring of fire, and a rail that runs
 * on lightning. Dark is the night shift in the city: rain, searchlights, lit windows, brass on deep navy. Light is the
 * morning edition: newsprint, ink navy and a travel poster's sunburst behind the towers. Titles are in Limelight (a
 * free face in the manner of 1930s cinema lettering), labels in Jost capitals set wide and text in Spectral. Frames
 * have stepped brass corners, headings trail three "speed lines", the links ride the lightning rail, three shard
 * colours (gold, crimson, indigo) mark a post, the GM's posts are clippings from a broadsheet and the character card
 * is a set of identification papers. No logos, marks, art or text from the setting: every shape is drawn here from
 * gradients. Nothing glows and nothing moves. Like every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Stepped corners for a frame: two nested brackets in each corner, as on a deco door plate. */
const bracket = (side: string, inset: number, len: number) => {
  const [h, v] = side.split(" ");
  const c = "linear-gradient(var(--ss-brass), var(--ss-brass))";
  return [`${c} ${h} ${inset}px ${v} ${inset}px / ${len}px 1px no-repeat`, `${c} ${h} ${inset}px ${v} ${inset}px / 1px ${len}px no-repeat`];
};
const CORNERS = ["left top", "right top", "left bottom", "right bottom"].flatMap(side => [...bracket(side, 4, 15), ...bracket(side, 7, 7)]).join(", ");

/* Windows: rows of light with the wall's own colour drawn over them in uneven columns, so they scatter. */
const COLS = [
  (c: string) => `${c} 0 3px, #0000 3px 5px, ${c} 5px 8px, #0000 8px 10px, ${c} 10px 17px, #0000 17px 19px`,
  (c: string) => `${c} 0 2px, #0000 2px 4px, ${c} 4px 11px, #0000 11px 13px, ${c} 13px 15px`,
];
const ROWS = [
  (c: string) => `#0000 0 4px, ${c} 4px 6px, #0000 6px 9px, ${c} 9px 11px, #0000 11px 21px`,
  (c: string) => `#0000 0 3px, ${c} 3px 5px, #0000 5px 16px, ${c} 16px 18px, #0000 18px 25px`,
];
/*
 * The pieces the city is built from, named once in the first rule because the drawing uses them hundreds of times and
 * every part's stylesheet carries the whole drawing: a flat fill in each of the three tower colours (--ss-a near,
 * --ss-b middle, --ss-c far), the two patterns of columns in the near and middle colours (--ss-w10 to --ss-w21), the
 * two patterns of lit rows (--ss-r0, --ss-r1) and a row of lamps.
 */
const COLOUR = ["", "var(--ss-1)", "var(--ss-2)", "var(--ss-3)"], FLAT = ["", "var(--ss-a)", "var(--ss-b)", "var(--ss-c)"];
const PIECES = [
  ...[1, 2, 3].map(i => `--ss-${"abc"[i - 1]}: linear-gradient(${COLOUR[i]} 0 0);`),
  ...[1, 2].flatMap(i => [0, 1].map(k => `--ss-w${i}${k}: repeating-linear-gradient(90deg, ${COLS[k](COLOUR[i])});`)),
  ...[0, 1].map(k => `--ss-r${k}: repeating-linear-gradient(${ROWS[k]("var(--ss-l)")});`),
  "--ss-lamps: repeating-linear-gradient(90deg, var(--ss-l) 0 2px, #0000 2px 6px);",
].join(" ");

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --ss-brass: #a67b22; --ss-brass-hi: #d8b45c; --ss-brass-lo: #6e5114;
  --ss-trim: linear-gradient(180deg, #c9a044, #8c661a 48%, #b98f35 52%, #7a5914);
  --ss-storm: #0e7286; --ss-crimson: #9c2f1f; --ss-indigo: #35377e; --ss-gold: #c0902a;
  --ss-heading: #14283a; --ss-edge: #bba878; --ss-ghost-ink: #14283a;
  --ss-panel: linear-gradient(180deg, #f9f3e4, #f2e9d5);
  --ss-band: linear-gradient(180deg, #ece2c8, #e4d8ba);
  --ss-shadow: 0 10px 20px -14px rgba(20, 32, 46, .6);
  --ss-corners: ${CORNERS};
  ${PIECES}
  --ss-sky: linear-gradient(180deg, #efb97c 0%, #f5d8a6 44%, #faecd0 100%);
  --ss-ray: rgba(255, 255, 255, .3); --ss-sun: rgba(255, 250, 232, .95); --ss-beam: transparent; --ss-rain: transparent; --ss-star: transparent;
  --ss-ring: rgba(150, 96, 14, .7); --ss-ring-dim: rgba(150, 96, 14, .28);
  --ss-moon-1: rgba(255, 255, 255, .6); --ss-moon-2: rgba(255, 255, 255, .5); --ss-moon-3: rgba(255, 255, 255, .55); --ss-moon-4: rgba(255, 255, 255, .65);
  --ss-1: #14283a; --ss-2: #2b5165; --ss-3: #8fb0ad;
  --ss-l: rgba(255, 240, 204, .78); --ss-fin: #e6c170; --ss-beacon: transparent;
  --ss-hull: #14283a; --ss-fire-a: #ffd27a; --ss-fire-b: #e8611a; --ss-fire-glow: rgba(232, 97, 26, .16);
  --ss-title-fill: linear-gradient(180deg, #24506a 0%, #14283a 55%, #0d1b28 100%); --ss-title-edge: rgba(255, 249, 232, .92); --ss-title-drop: rgba(166, 123, 34, .55);
}
:root[data-theme="dark"] {
  --ss-brass: #d2a550; --ss-brass-hi: #f6dd96; --ss-brass-lo: #7a5c1c;
  --ss-trim: linear-gradient(180deg, #f1d589, #a67b24 48%, #dcb65e 52%, #8a671e);
  --ss-storm: #63d8ea; --ss-crimson: #e0573f; --ss-indigo: #8384e6; --ss-gold: #f0c860;
  --ss-heading: #efcf85; --ss-edge: #2f3f54; --ss-ghost-ink: #efcf85;
  --ss-panel: linear-gradient(180deg, #131c28, #0d141d);
  --ss-band: linear-gradient(180deg, #1c2838, #141d2a);
  --ss-shadow: 0 0 0 1px rgba(0, 0, 0, .55), 0 12px 24px -14px #000;
  --ss-sky: linear-gradient(180deg, #04070d 0%, #091322 40%, #133045 78%, #214a5c 100%);
  --ss-ray: transparent; --ss-sun: transparent; --ss-beam: rgba(255, 238, 196, .1); --ss-rain: rgba(190, 220, 240, .045); --ss-star: rgba(236, 242, 255, .85);
  --ss-ring: rgba(246, 208, 110, .85); --ss-ring-dim: rgba(246, 208, 110, .3);
  --ss-moon-1: #f2e6c8; --ss-moon-2: #f0a37c; --ss-moon-3: #a9c9ff; --ss-moon-4: #e9eef6;
  --ss-1: #04080e; --ss-2: #0b1522; --ss-3: #15293a;
  --ss-l: #ffc55a; --ss-fin: #63d8ea; --ss-beacon: #ff5a3c;
  --ss-hull: #070c14; --ss-fire-a: #ffd27a; --ss-fire-b: #ff6a1f; --ss-fire-glow: rgba(255, 106, 31, .2);
  --ss-title-fill: linear-gradient(180deg, #fff3c4 0%, #f2cc6a 40%, #c28f24 56%, #f6dc90 78%, #9a6c14 100%); --ss-title-edge: #04070d; --ss-title-drop: rgba(0, 0, 0, .7);
}`;

/** Splits a long list of layers into custom properties, so no single value passes the safety check's length limit. */
const inParts = (name: string, items: string[]) => {
  const parts: string[][] = [[]];
  for (const item of items) {
    const last = parts[parts.length - 1];
    if (last.length && [...last, item].join(", ").length > 1800) parts.push([item]); else last.push(item);
  }
  return { declare: parts.map((part, i) => `--${name}-${i + 1}: ${part.join(", ")};`).join(" "), use: parts.map((_, i) => `var(--${name}-${i + 1})`).join(", ") };
};
const n = (v: number) => +v.toFixed(1);
const deg = (w: number, h: number) => Math.atan(w / 2 / h) * 180 / Math.PI;

/*
 * The city, drawn in a box 720 wide and 320 tall, and the airship in one 110 tall. Both are measured from the box's
 * bottom left corner, and written as short as they will go, from the pieces named above.
 */
let boxHeight = 320;
const px = (v: number) => v ? `${n(v)}px` : "0";
const at = (x: number, y: number, w: number, h: number) => `${px(x)} ${px(boxHeight - y - h)}/${px(w)} ${px(h)} no-repeat`;
const rect = (fill: string, x: number, y: number, w: number, h: number) => `${fill} ${at(x, y, w, h)}`;
const flat = (c: string) => `linear-gradient(${c} 0 0)`;
/** A triangle with its point at the top. */
const tri = (c: string, x: number, y: number, w: number, h: number) => {
  const a = deg(w, h);
  return `conic-gradient(from ${n(180 - a)}deg at 50% 0, ${c} 0 ${n(2 * a)}deg, #0000 ${n(2 * a + .5)}deg) ${at(x, y, w, h)}`;
};
/**
 * One tower: tiers that step in as they rise (each `[width, height]`, from the ground up, centred on `cx`), a spire,
 * windows when `lit`, and on the great towers a fin of light up the middle and a beacon on the spire.
 */
function tower(depth: 1 | 2 | 3, cx: number, tiers: number[][], spire: number, opts: { lit?: boolean; fin?: boolean; k?: number } = {}) {
  const windows: string[] = [], body: string[] = [], c = FLAT[depth];
  let y = 0;
  tiers.forEach(([w, h], i) => {
    const x = cx - w / 2, k = ((opts.k ?? 0) + i) % 2;
    if (opts.lit && w >= 20 && h >= 20) {
      windows.push(`var(--ss-w${depth}${k}) ${at(x + 4, y + 4, w - 8, h - 8)}`, `var(--ss-r${k}) ${at(x + 4, y + 4, w - 8, h - 8)}`);
    }
    body.push(rect(c, x, y, w, h));
    y += h;
  });
  const fin = opts.fin ? [
    `radial-gradient(circle closest-side, var(--ss-beacon) 45%, #0000) ${at(cx - 3, y + spire - 3, 6, 6)}`,
    rect(flat("var(--ss-fin)"), cx - .5, tiers[0][1], 1, y - tiers[0][1]),
  ] : [];
  const top = spire ? [tri(COLOUR[depth], cx - 4, y, 8, 12), rect(c, cx - 1, y, 2, spire)] : [];
  return [...fin, ...windows, ...top, ...body];
}
/** A bridge between two towers, with a row of lamps. */
const bridge = (x: number, y: number, len: number) => [`var(--ss-lamps) ${at(x, y + 1, len, 1)}`, rect(FLAT[2], x, y, len, 4)];
const CITY = [
  rect(FLAT[1], 0, 0, 720, 5),
  /* The nearest row: low roofs at the left, one dark block before the great towers. */
  ...tower(1, 612, [[58, 84], [40, 30]], 0, { lit: true, k: 1 }),
  ...tower(1, 34, [[42, 34], [22, 12]], 0, { lit: true }),
  ...tower(1, 100, [[60, 28], [40, 14]], 8, { lit: true, k: 1 }),
  ...tower(1, 250, [[56, 32], [34, 14]], 8, { lit: true }),
  /* Bridges from tower to tower. */
  ...bridge(500, 100, 17), ...bridge(419, 70, 17), ...bridge(603, 128, 17), ...bridge(346, 44, 19), ...bridge(500, 52, 17),
  /* The great towers. */
  ...tower(2, 560, [[86, 150], [66, 60], [46, 44], [26, 26]], 34, { lit: true, fin: true }),
  ...tower(2, 655, [[70, 120], [52, 54], [34, 36]], 26, { lit: true, fin: true, k: 1 }),
  ...tower(2, 468, [[64, 130], [46, 50], [28, 30]], 22, { lit: true, fin: true, k: 1 }),
  ...tower(2, 392, [[54, 96], [38, 40], [22, 24]], 18, { lit: true }),
  ...tower(2, 704, [[50, 170], [34, 40]], 20, { lit: true }),
  ...tower(2, 322, [[48, 62], [32, 24], [16, 14]], 10, { lit: true, k: 1 }),
  ...tower(2, 176, [[44, 42], [24, 12]], 0, { lit: true, k: 1 }),
  /* Farther off: thin towers in the haze, with no windows. */
  ...tower(3, 610, [[44, 250], [28, 30]], 20), ...tower(3, 515, [[40, 200], [26, 40]], 16), ...tower(3, 430, [[36, 150], [22, 30]], 12),
  ...tower(3, 352, [[30, 96], [18, 20]], 10), ...tower(3, 286, [[34, 70]], 8), ...tower(3, 214, [[30, 56]], 0), ...tower(3, 140, [[36, 44]], 6), ...tower(3, 66, [[30, 52]], 0),
];
const CITY_PARTS = inParts("ss-city", CITY);
const CITY_BOX = `content: ""; position: absolute; z-index: 1; right: 0; bottom: 0; width: 720px; height: 320px; pointer-events: none; transform-origin: bottom right; ${CITY_PARTS.declare} background: ${CITY_PARTS.use};`;

const T1 = COLOUR[1], T3 = COLOUR[3];
/** The haze of the rest of the city along the foot of a banner, repeated so it reaches the left edge of any screen. */
const far = (tile: number, h: number, blocks: number[][]) => {
  const stops = blocks.map(([x, w]) => `#0000 ${x}px, ${T3} ${x}px ${x + w}px, #0000 ${x + w}px`).join(", ");
  return `linear-gradient(90deg, ${stops}) 0 100%/${tile}px ${h}px repeat-x`;
};
const HAZE = [
  far(310, 44, [[24, 28], [130, 20], [236, 34]]), far(430, 62, [[60, 22], [300, 28]]), far(530, 30, [[0, 60], [180, 70], [330, 50], [440, 44]]), far(610, 78, [[400, 18]]),
  `${FLAT[3]} 0 100%/100% 16px no-repeat`,
].join(", ");

/**
 * The airship, in a box 230 wide and 110 tall: a long hull with a fin, a cabin and a row of lit ports, flying
 * through a ring of fire. The near half of the ring is drawn over the hull and the far half behind it.
 */
boxHeight = 110;
const SHIP = [
  `radial-gradient(ellipse 17px 50px at 100% 50%, transparent 68%, var(--ss-fire-a) 74%, var(--ss-fire-b) 90%, transparent 97%) ${at(101, 5, 17, 100)}`,
  `repeating-linear-gradient(90deg, var(--ss-l) 0 2px, #0000 2px 9px) ${at(64, 51, 110, 2)}`,
  rect(flat("var(--ss-brass-hi)"), 30, 57, 166, 1),
  `radial-gradient(ellipse closest-side, var(--ss-hull) 96%, transparent 100%) ${at(10, 42, 204, 30)}`,
  rect(flat("var(--ss-hull)"), 78, 34, 64, 10), tri("var(--ss-hull)", 6, 58, 40, 24),
  `radial-gradient(ellipse closest-side, transparent 68%, var(--ss-fire-b) 74%, var(--ss-fire-a) 90%, transparent 97%) ${at(101, 5, 34, 100)}`,
  `radial-gradient(ellipse closest-side, var(--ss-fire-glow), transparent) ${at(58, -15, 120, 140)}`,
].join(", ");
const SHIP_BOX = `content: ""; position: absolute; z-index: 1; width: 230px; height: 110px; pointer-events: none; transform-origin: bottom right; background: ${SHIP};`;

/*
 * The sky. A ring of gold shards crosses it as three thin arcs of one ellipse with sparks along them, placed from a
 * fixed seed; a handful of the moons; by night stars, two searchlights and rain; by day a sunburst from behind the towers.
 */
const RING_AT = "at 105% 140%", RING_CX = 105, RING_CY = 140, RING_RX = 100, RING_RY = 125;
const arc = (c: string, from: number, to: number) => `radial-gradient(ellipse ${RING_RX}% ${RING_RY}% ${RING_AT}, #0000 ${n(from - .1)}%, ${c} ${from}% ${to}%, #0000 ${n(to + .1)}%)`;
let seed = 13;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const t = (94 + i * 4.3 + rnd() * 3) * Math.PI / 180, f = .978 + rnd() * .02, r = n(.8 + rnd() * 1.1);
  return `radial-gradient(${r}px ${r}px at ${n(RING_CX + RING_RX * f * Math.cos(t))}% ${n(RING_CY - RING_RY * f * Math.sin(t))}%, var(--ss-ring) 55%, #0000)`;
});
const moon = (c: string, x: number, y: number, size: number) => `radial-gradient(circle closest-side, ${c} 90%, #0000) ${x}% ${y}%/${size}px ${size}px no-repeat`;
const STARS = [[4, 14, 1], [11, 40, 1], [19, 9, 1.4], [27, 30, 1], [35, 16, 1], [44, 7, 1.4], [53, 34, 1], [63, 18, 1], [71, 6, 1.2], [80, 38, 1], [96, 8, 1.2]]
  .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, var(--ss-star) 50%, #0000)`);
const SKY = [
  ...SPARKS, arc("var(--ss-ring)", 98.9, 99.05), arc("var(--ss-ring-dim)", 98.2, 98.5), arc("var(--ss-ring-dim)", 99.5, 99.6),
  moon("var(--ss-moon-1)", 58, 5, 15), moon("var(--ss-moon-2)", 63, 24, 7), moon("var(--ss-moon-3)", 70, 8, 9), moon("var(--ss-moon-4)", 88, 7, 19), moon("var(--ss-moon-3)", 96, 30, 5), moon("var(--ss-moon-2)", 79, 18, 6),
  ...STARS,
  "conic-gradient(from -36deg at 66% 100%, #0000 0, var(--ss-beam) 1.5deg 6deg, #0000 8deg)",
  "conic-gradient(from 14deg at 90% 100%, #0000 0, var(--ss-beam) 1.5deg 5deg, #0000 7deg)",
  "conic-gradient(from -64deg at 97% 100%, #0000 0, var(--ss-beam) 1deg 4deg, #0000 5.5deg)",
  "radial-gradient(circle at 76% 104%, var(--ss-sun) 0, #0000 46%)",
  "repeating-conic-gradient(from 270deg at 76% 104%, var(--ss-ray) 0 4deg, #0000 4deg 8deg)",
  "repeating-linear-gradient(101deg, #0000 0 9px, var(--ss-rain) 9px 10px)",
  "var(--ss-sky)",
];
const SKY_PARTS = inParts("ss-sky-l", SKY);

/** For a location with no picture: three towers against the sky, with the ring over them. */
const strip = (c: string, h: number, blocks: number[][]) =>
  `linear-gradient(90deg, ${blocks.map(([a, b]) => `#0000 ${a}%, ${c} ${a}% ${b}%, #0000 ${b}%`).join(", ")}) left 0 bottom 0 / 100% ${h}% no-repeat`;
const MINI = [
  "radial-gradient(ellipse 100% 125% at 105% 150%, #0000 98.6%, var(--ss-ring) 98.9% 99.3%, #0000 99.6%)",
  strip(T1, 40, [[12, 30], [40, 60], [70, 86]]), strip(T1, 52, [[15, 27], [73, 83]]), strip(T1, 60, [[43, 57]]), strip(T1, 72, [[46, 54]]), strip(T1, 86, [[49.4, 50.6]]), strip(T1, 62, [[20.4, 21.6], [77.4, 78.6]]),
  strip(T3, 28, [[0, 8], [32, 38], [62, 68], [90, 100]]), strip(T3, 16, [[0, 100]]),
  "var(--ss-sky)",
].join(", ");

/* Shared pieces of the look. */
/** The page behind everything: plain, with a faint fan of light at the top. */
const PAGE = "background: radial-gradient(ellipse 110% 520px at 50% 0, color-mix(in srgb, var(--ss-brass) 9%, transparent), transparent), var(--bg);";
/** A frame: a hairline edge and stepped brass corners, paper by day and night-blue enamel by night. */
const FRAME = "border: 1px solid var(--ss-edge); border-radius: 0; background: var(--ss-corners), var(--ss-panel); box-shadow: var(--ss-shadow);";
/** Under the pointer a frame takes a little brass. Nothing lifts and nothing glows. */
const WASH = "linear-gradient(color-mix(in srgb, var(--ss-brass) 7%, transparent), color-mix(in srgb, var(--ss-brass) 7%, transparent))";
const FRAME_ON = `border-color: var(--ss-brass); background: var(--ss-corners), ${WASH}, var(--ss-panel);`;
/** Text type. */
const TITLE_TYPE = "font-family: var(--font-display); font-weight: 400; letter-spacing: .015em;";
const SMALL = "font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .14em;";
/** A night-blue plate with brass lettering: the same in both versions. */
const PLATE = "linear-gradient(180deg, #1d3348, #111f2d)";
const PLATE_INK = "#f1d68e";
/** The main buttons: a brass plate, engraved in ink, with a line inside its edge. */
const BRASS_BTN = "border: 1px solid #5c4410; border-radius: 0; background: linear-gradient(180deg, #f3d98f 0%, #d0a446 46%, #b38628 54%, #d9b057 100%); color: #1a1508; box-shadow: inset 0 0 0 2px rgba(255, 244, 204, .35), inset 0 0 0 3px rgba(92, 68, 16, .55); font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .1em; text-shadow: 0 1px 0 rgba(255, 244, 204, .5);";
const BRASS_ON = "background: linear-gradient(180deg, #f8e3a6 0%, #dab255 46%, #bf9232 54%, #e2bc66 100%); color: #1a1508;";
/** Other buttons: an outline of brass with a second line inside it. */
const GHOST_BTN = "border: 1px solid var(--ss-brass); border-radius: 0; background: transparent; color: var(--ss-ghost-ink); box-shadow: inset 0 0 0 2px transparent, inset 0 0 0 3px color-mix(in srgb, var(--ss-brass) 40%, transparent); font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .1em;";
const GHOST_ON = "border-color: var(--ss-brass); background: color-mix(in srgb, var(--ss-brass) 14%, transparent); color: var(--ss-ghost-ink);";
/** The title: Limelight filled with brass by night and ink by day, edged so it reads over the sky. */
const FILL = `background: var(--ss-title-fill); background: var(--ss-title-fill) 0 0 / 100% 1lh repeat-y; -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(1px 0 0 var(--ss-title-edge)) drop-shadow(-1px 0 0 var(--ss-title-edge)) drop-shadow(0 1px 0 var(--ss-title-edge)) drop-shadow(0 -1px 0 var(--ss-title-edge)) drop-shadow(3px 3px 0 var(--ss-title-drop));`;
const TITLE = `display: block; width: fit-content; max-width: 100%; overflow-wrap: break-word; ${TITLE_TYPE} ${FILL}`;
/** The tagline, or the line above a title: a plate, as on a carriage door. */
const PLAQUE = `display: inline-block; padding: 5px 14px; border: 1px solid #8c6a22; border-radius: 0; background: ${PLATE}; color: ${PLATE_INK}; box-shadow: inset 0 0 0 2px #111f2d, inset 0 0 0 3px rgba(210, 165, 80, .45); text-shadow: none;`;
/** Three speed lines, longest at the top, fading away from the words. */
const lines = (dir: "left" | "right") => {
  const fade = dir === "left" ? "linear-gradient(90deg, transparent, var(--ss-brass))" : "linear-gradient(90deg, var(--ss-brass), transparent)";
  const side = dir === "left" ? "right" : "left";
  return `${fade} ${side} 0 top 0 / 100% 1px no-repeat, ${fade} ${side} 0 top 4px / 62% 1px no-repeat, ${fade} ${side} 0 top 8px / 30% 1px no-repeat`;
};
/** A heading between two sets of speed lines. */
const ruled = (h: string) => `${h} { display: flex; align-items: center; gap: 16px; }
${h}::before, ${h}::after { content: ""; flex: 1; min-width: 24px; height: 9px; }
${h}::before { background: ${lines("left")}; }
${h}::after { background: ${lines("right")}; }`;
/** A heading with one set running out to its right. */
const ruledLeft = (h: string) => `${h} { display: flex; align-items: center; gap: 14px; }
${h}::after { content: ""; flex: 1; min-width: 24px; height: 9px; background: ${lines("right")}; }`;
/** Three shards, gold over crimson over indigo: the sky, the ground and what lies under it. */
const SHARDS = "linear-gradient(90deg, var(--ss-gold) 0 30%, transparent 30% 35%, var(--ss-crimson) 35% 65%, transparent 65% 70%, var(--ss-indigo) 70%)";
/** The lightning rail: a line of light through a row of stones, along the top of a dark band. */
const RAIL = "radial-gradient(circle closest-side, #e6fbff 25%, #63d8ea 60%, transparent 100%) left 9px top 0 / 44px 7px repeat-x, linear-gradient(90deg, transparent, #63d8ea 8%, #63d8ea 92%, transparent) left 0 top 3px / 100% 1px no-repeat";
/** A thin line of brass along one edge of a bar. */
const hairline = (edge: "top" | "bottom") => `var(--ss-trim) left ${edge} / 100% 2px no-repeat`;

/**
 * The cover for the other parts: the sky behind the host's own content, the city at the right and the airship
 * low over the roofs. `host` keeps its text clear of them with padding.
 */
function cover(host: string, name: string) {
  const back = inParts(name, [HAZE, ...SKY]);
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 1px solid var(--ss-brass-lo); border-radius: 0;
  ${back.declare}
  background: ${back.use};
  box-shadow: var(--ss-shadow);
}
${host} > * { position: relative; z-index: 2; }
${host}::before { ${CITY_BOX} }
${host}::after { ${SHIP_BOX} right: 400px; bottom: 58px; scale: .8; }`;
}
const coverAt = (host: string, city: number, ship: number, shipRight: number, shipBottom: number) => `${host}::before { scale: ${city}; }
  ${host}::after { scale: ${ship}; right: ${shipRight}px; bottom: ${shipBottom}px; }`;

/* The Encyclopedia: enamel and brass round the side, newsprint pages by day, and the cover over the overview. */
const ENCYCLOPEDIA = `/* Storm and Spire for the Encyclopedia. The colours and fonts come from the theme; this adds the frames, the cover and the brass buttons. */
${VARS}
body { ${PAGE} scrollbar-color: var(--ss-brass-lo) var(--panel); }
::selection { background: var(--ss-brass-hi); color: #14181d; }

/* The side: edged in brass. */
.sidebar { border-right: 2px solid transparent; border-image: var(--ss-trim) 1; background: var(--ss-panel); }
.csw-name b { ${TITLE_TYPE} font-size: 17px; color: var(--ss-heading); }
.campaign-link { border-radius: 0; }
.campaign-link:hover { color: var(--ss-heading); }
.campaign-link.active { background: color-mix(in srgb, var(--ss-brass) 16%, transparent); color: var(--ss-heading); box-shadow: inset 3px 0 0 var(--ss-brass); }
.side-heading .section-toggle { ${SMALL} font-size: 10.5px; color: var(--muted); }
.shared-tag { border-radius: 0; ${SMALL} font-size: 9.5px; }
.tree-row { border-radius: 0; }
.tree-row:hover { background: color-mix(in srgb, var(--ss-brass) 9%, transparent); }
.tree-row:has(.active), .tree-item.active { background: color-mix(in srgb, var(--ss-brass) 16%, transparent); color: var(--ss-heading); box-shadow: inset 3px 0 0 var(--ss-brass); }

/* The bar along the top, with brass under it. */
.topbar { border-bottom: 0; background: ${hairline("bottom")}, var(--ss-panel); }
.search-box { border-radius: 0; border-color: var(--line); background: var(--bg); }
.search-box:focus-within { border-color: var(--ss-brass); }

/* Buttons and boxes to type in. */
.button { ${GHOST_BTN} font-size: 11.5px; }
.button:hover { ${GHOST_ON} }
.button.primary { ${BRASS_BTN} font-size: 11.5px; }
.button.primary:hover { ${BRASS_ON} }
.icon-button:hover { color: var(--ss-heading); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; caret-color: var(--ss-storm); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--ss-brass); box-shadow: none; }

/* The campaign's overview: the cover. */
${cover(".dashboard-intro", "ss-enc")}
.dashboard-intro { min-height: 320px; align-items: flex-start; margin-bottom: 26px; padding: 40px 340px 150px 40px; }
.dashboard-intro .eyebrow { ${PLAQUE} ${SMALL} font-size: 10.5px; }
.dashboard-intro h1 { margin: 16px 0 12px; font-size: 52px; line-height: 1.1; ${TITLE} }
.dashboard-intro .subtitle { display: inline-block; max-width: 40ch; padding: 6px 12px; border-left: 3px solid #d2a550; background: rgba(9, 15, 23, .78); font: italic 400 17px/1.45 var(--font-reading); color: #f3e8cc; }
.dashboard-intro .icon-button { border: 1px solid #8c6a22; background: ${PLATE}; color: ${PLATE_INK}; }
.overview-strip { border-color: var(--line); }
.overview-strip strong { font: 600 19px var(--font-sans); color: var(--ss-heading); }

/* Headings: speed lines running out to the right. */
.section-heading h2 { flex: 1; ${TITLE_TYPE} font-size: 23px; color: var(--ss-heading); }
${ruledLeft(".section-heading h2")}
.eyebrow { ${SMALL} font-size: 10.5px; }

/* Cards: framed, with stepped brass corners. */
.note-card { ${FRAME} padding: 18px 20px; transition: none; }
.note-card:hover { ${FRAME_ON} transform: none; }
.note-card h3 { ${TITLE_TYPE} font-size: 21px; color: var(--ss-heading); }
.note-card.add-card { border: 1px dashed var(--line); background: transparent; box-shadow: none; }

/* A page: Limelight over Spectral, a plate for its kind, speed lines under its headings. */
.kind-pill { padding: 3px 9px 2px; border-radius: 0; border: 1px solid #8c6a22; background: ${PLATE}; color: ${PLATE_INK}; ${SMALL} font-size: 10px; }
.article-title h1 { ${TITLE_TYPE} color: var(--ss-heading); }
.article-tabs { border-bottom: 0; background: ${hairline("bottom")}; }
.article-tabs button { ${SMALL} font-size: 11.5px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--ss-heading); box-shadow: inset 0 -3px 0 var(--ss-brass); }
.picture-panel { border-radius: 0; border: 1px solid var(--ss-brass); outline: 1px solid var(--ss-brass); outline-offset: -6px; }
.prose { font-family: var(--font-reading); }
.prose h1, .prose h2, .prose h3 { ${TITLE_TYPE} color: var(--ss-heading); }
.prose h2 { padding-bottom: 14px; background: ${lines("right").replace(/top (\d)/g, "bottom $1")}; }
.prose blockquote { border-left: 4px double var(--ss-brass); background: color-mix(in srgb, var(--ss-brass) 8%, transparent); font-style: italic; }
.article-aside .eyebrow { color: var(--ss-heading); }

/* The Encyclopedia keeps its 270px side down to 720px, so its cover steps down sooner than the others. */
@media (max-width: 1380px) {
  ${coverAt(".dashboard-intro", .72, .6, 290, 44)}
  .dashboard-intro { padding-right: 250px; }
  .dashboard-intro h1 { font-size: 42px; }
}
@media (max-width: 640px) {
  .dashboard-intro { min-height: 0; padding: 24px 20px 170px; }
  .dashboard-intro h1 { font-size: 30px; }
  .dashboard-intro .subtitle { font-size: 15px; }
  ${coverAt(".dashboard-intro", .5, .5, 200, 92)}
  .dashboard-intro > .icon-button { position: absolute; z-index: 3; right: 14px; top: 14px; }
}
`;

/* Maptable: brass round the table, the tool rail as a row of plates, and the cover over the Scene Picker. */
const MAPTABLE = `/* Storm and Spire for Maptable. The map itself keeps its own colours. */
${VARS}
body { ${PAGE} scrollbar-color: var(--ss-brass-lo) var(--panel); }
::selection { background: var(--ss-brass-hi); color: #14181d; }

/* The bar along the top, with brass under it. */
.app-header, .campaign-dashboard > header { border-bottom: 0; background: ${hairline("bottom")}, var(--ss-panel); }
.header-scene strong { ${TITLE_TYPE} color: var(--ss-heading); }
.csw-name b { ${TITLE_TYPE} font-size: 16px; color: var(--ss-heading); }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${BRASS_BTN} font-size: 11.5px; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { ${BRASS_ON} }
.icon-button:hover { color: var(--ss-heading); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--ss-storm); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--ss-brass); box-shadow: none; }
input[type="range"] { accent-color: var(--ss-brass); }

/* The tool rail: square plates, ringed in brass when on. */
.rail { border-right: 2px solid transparent; border-image: var(--ss-trim) 1; background: var(--ss-panel); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--ss-heading); }
.rail button.active { background: ${PLATE}; color: ${PLATE_INK}; box-shadow: inset 0 0 0 1px #d2a550, inset 0 0 0 3px #111f2d, inset 0 0 0 4px rgba(210, 165, 80, .5); }

/* The side panel. */
.side-panel { border-right: 2px solid transparent; border-image: var(--ss-trim) 1; background: var(--ss-panel); }
.panel-title { border-bottom: 0; background: ${hairline("bottom")}; }
.panel-title h2 { ${TITLE_TYPE} font-size: 19px; color: var(--ss-heading); }
.organizer-scene { border-radius: 0; white-space: normal; }
.organizer-scene:hover { background: color-mix(in srgb, var(--ss-brass) 9%, transparent); }
.organizer-scene.active { background: color-mix(in srgb, var(--ss-brass) 16%, transparent); box-shadow: inset 3px 0 0 var(--ss-brass); }
.organizer-scene strong { font: 600 15px/1.25 var(--font-reading); }
.organizer-scene.active strong { color: var(--ss-heading); }
/* Under 1000px the rail becomes a bar along the bottom and the side panel a sheet: brass along their tops instead. */
@media (max-width: 1000px) {
  .rail { border-right: 0; border-top: 2px solid transparent; }
  .side-panel { border: 2px solid transparent; border-bottom: 0; border-radius: 0; }
}

/* Around the map: the toolbar as a night-blue plate. */
.map-topbar { border-bottom: 2px solid transparent; border-image: var(--ss-trim) 1; background: var(--ss-panel); }
.map-title { ${SMALL} font-size: 10.5px; color: var(--muted); }
.board-info { ${SMALL} font-size: 10.5px; color: var(--muted); }
.toolbar { border-radius: 0; border: 1px solid #8c6a22; background: ${PLATE}; color: #efe6cf; box-shadow: inset 0 0 0 2px #111f2d, inset 0 0 0 3px rgba(210, 165, 80, .45), 0 8px 18px -10px #000; }
.toolbar button { border-radius: 0; border: 1px solid rgba(210, 165, 80, .35); background: transparent; color: #efe6cf; font: 600 12px var(--font-sans); letter-spacing: .06em; }
.toolbar button:hover { color: ${PLATE_INK}; border-color: #d2a550; }
.toolbar button.active { color: ${PLATE_INK}; box-shadow: inset 0 0 0 1px #d2a550; }

/* The Scene Picker: the cover. */
${cover(".campaign-scenes-head", "ss-map")}
.campaign-scenes-head { min-height: 300px; align-items: flex-start; padding: 34px 340px 150px 34px; }
.campaign-scenes-head > div { flex: 1; min-width: 0; }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head small { ${PLAQUE} ${SMALL} font-size: 10.5px; }
.campaign-scenes-head h1 { margin-top: 14px; font-size: 48px; line-height: 1.1; ${TITLE} }
.dashboard-continue { ${FRAME} padding: 18px 24px; }
.dashboard-continue:hover { ${FRAME} ${FRAME_ON} padding: 18px 24px; }
.dashboard-continue small { ${SMALL} font-size: 10.5px; color: var(--ss-heading); }
.dashboard-continue strong { ${TITLE_TYPE} font-size: 24px; color: var(--ss-heading); }
.campaign-scenes-kinds button { border-radius: 0; ${SMALL} font-size: 11px; }
.campaign-scenes-group h2 { ${TITLE_TYPE} font-size: 21px; color: var(--ss-heading); }
${ruledLeft(".campaign-scenes-group h2")}
.campaign-scenes-group h2 span { ${SMALL} font-size: 10.5px; }
.campaign-scene-card { ${FRAME} overflow: hidden; }
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { ${FRAME_ON} }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--ss-heading); }
.campaign-scene-card strong { font: 600 15.5px/1.25 var(--font-reading); }
.campaign-scene-card em { ${SMALL} font-style: normal; font-size: 10px; color: var(--ss-heading); }

@media (max-width: 1100px) {
  ${coverAt(".campaign-scenes-head", .72, .6, 290, 44)}
  .campaign-scenes-head { padding-right: 250px; }
  .campaign-scenes-head h1 { font-size: 40px; }
}
@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 0; flex-wrap: wrap; padding: 24px 20px 170px; }
  .campaign-scenes-head > div { flex: 1 1 100%; }
  .campaign-scenes-head h1 { font-size: 30px; }
  .dashboard-continue strong { font-size: 20px; overflow-wrap: anywhere; }
  ${coverAt(".campaign-scenes-head", .5, .5, 200, 92)}
}
`;

/* The campaign's dashboard: the cover behind its name, and framed cards. */
const DASHBOARD = `/* Storm and Spire for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--ss-brass-hi); color: #14181d; }
.hub-crumbs { ${SMALL} font-size: 11px; }
.hub-crumbs a { color: var(--ss-heading); }

/* The top: the cover. */
${cover(".hub-head", "ss-hub")}
.hub-head { min-height: 320px; padding: 34px 340px 150px 34px; }
.hub-title p { ${PLAQUE} ${SMALL} font-size: 10.5px; }
.hub-title h1 { margin-top: 14px; font-size: 54px; line-height: 1.1; ${TITLE} }
.hub-chip { border-radius: 0; border: 1px solid #8c6a22; background: ${PLATE}; color: ${PLATE_INK}; ${SMALL} font-size: 9.5px; }
.hub-head .tag-add { border-radius: 0; border-color: #d2a550; background: rgba(17, 31, 45, .88); color: #f3e8cc; }
.hub-head .hub-button:not(.hub-button-primary) { border: 1px solid #8c6a22; background: ${PLATE}; color: ${PLATE_INK}; box-shadow: inset 0 0 0 2px #111f2d, inset 0 0 0 3px rgba(210, 165, 80, .45); }

/* Buttons. */
.hub-button { ${GHOST_BTN} font-size: 11.5px; }
.hub-button-primary, a.hub-button-primary { ${BRASS_BTN} font-size: 11.5px; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { ${BRASS_ON} }
.hub-button:not(.hub-button-primary):hover, .hub-button:not(.hub-button-primary):hover:not(:disabled) { ${GHOST_ON} }
.hub-head .hub-button:not(.hub-button-primary):hover, .hub-head .hub-button:not(.hub-button-primary):hover:not(:disabled) { border-color: #d2a550; background: ${PLATE}; color: #fff3c4; }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 0; background: ${hairline("bottom")}; }
.hub-tabs button, .hub-tabs a { ${SMALL} font-size: 11.5px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--ss-heading); }

/* Cards: frames with stepped brass corners. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; ${TITLE_TYPE} font-size: 21px; text-transform: none; color: var(--ss-heading); }
.hub-card-head a, .hub-card-head .hub-text-button { ${SMALL} font-size: 10.5px; }
.hub-scene-grid li { border-radius: 0; }

@media (max-width: 1100px) {
  ${coverAt(".hub-head", .72, .6, 290, 44)}
  .hub-head { padding-right: 250px; }
  .hub-title h1 { font-size: 44px; }
}
@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 24px 20px 170px; }
  .hub-title h1 { font-size: 32px; }
  ${coverAt(".hub-head", .5, .5, 200, 92)}
}
`;

export const STORM_AND_SPIRE: Theme = {
  id: "preset-storm-and-spire", name: "Storm and Spire", mode: "both", radius: 0, banner: "picture", fonts: { display: "limelight", reading: "spectral", ui: "jost" },
  colors: {
    light: { bg: "#e8dfc9", panel: "#f6efde", raised: "#ede4cd", line: "#c8b891", ink: "#17202b", muted: "#525c66", accent: "#85570f", accent2: "#0e6474" },
    dark: { bg: "#080c12", panel: "#111923", raised: "#18222f", line: "#2c3a4c", ink: "#ebe4d2", muted: "#a1aab5", accent: "#e0b25a", accent2: "#63d8ea" },
  },
  css: `/* Storm and Spire: art deco and pulp noir. A city of towers under a ring of gold, an airship in a ring of fire and a rail that runs on lightning;
   brass on night-blue after dark, ink on newsprint by day. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--ss-brass-lo) var(--panel); }
::selection { background: var(--ss-brass-hi); color: #14181d; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { ${FRAME} border-bottom: 0; box-shadow: none; }
.board-date { ${SMALL} font-size: 11px; }
.board-date b { color: var(--ss-heading); }
.circ { border-radius: 0; border: 1px solid #d2a550; background: ${PLATE}; color: ${PLATE_INK}; font: 600 11px var(--font-sans); letter-spacing: .06em; box-shadow: inset 0 0 0 2px #111f2d, inset 0 0 0 3px rgba(210, 165, 80, .45); }
.you b { ${TITLE_TYPE} font-size: 17px; color: var(--ss-heading); }
.search-box { border-radius: 0; border-color: var(--line); background: var(--bg); }
.search-box:focus-within { border-color: var(--ss-brass); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the city at the right under the ring, the airship low over the roofs, the title in Limelight at the left. */
.board-head { min-height: 384px; border: 1px solid var(--ss-brass-lo); text-align: left; }
.board-head:not(.has-art) {
  ${SKY_PARTS.declare}
  background: ${SKY_PARTS.use};
  --head-ink: #f0e3c0; --head-title: #f2cc6a; --head-shadow: none; --head-nav: #111f2d; --head-line: transparent;
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; padding: 46px 400px 160px 48px; overflow: hidden; }
.board-head:not(.has-art) .board-head-text { background: ${HAZE}; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-head:not(.has-art) .board-head-text::before { ${CITY_BOX} }
.board-head:not(.has-art) .board-head-text::after { ${SHIP_BOX} right: 410px; bottom: 62px; scale: .85; }
.board-title { margin: 0; font: 400 62px/1.1 var(--font-display); letter-spacing: .015em; text-transform: none; }
.board-title a { ${TITLE} display: inline-block; text-shadow: none; }
.board-tagline { margin-top: 18px; ${PLAQUE} font: italic 400 17px/1.4 var(--font-reading); }
/* The links ride the lightning rail. */
.board-nav { justify-content: flex-start; padding: 8px 32px 0; border-top: 0; background: ${RAIL}, ${PLATE}; }
.board-nav a { padding: 12px 16px 11px; color: #f0e3c0; ${SMALL} font-size: 12px; }
.board-nav a:hover { color: #9eeaf5; border-bottom-color: #63d8ea; }
.board-nav a:focus-visible { outline: 2px solid #63d8ea; outline-offset: -4px; }
/* With a banner picture: the picture under a dark wash at the left, the title in brass over it. */
.board-head.has-art {
  background: linear-gradient(90deg, rgba(6, 10, 16, .78), rgba(6, 10, 16, .35) 55%, rgba(6, 10, 16, .1)), var(--banner) var(--banner-x, 50%) var(--banner-y, 50%) / var(--banner-size, cover) no-repeat;
  --head-ink: #f0e3c0; --head-title: #f2cc6a; --head-shadow: none; --head-nav: #111f2d; --head-line: transparent;
  --ss-title-fill: linear-gradient(180deg, #fff3c4 0%, #f2cc6a 40%, #c28f24 56%, #f6dc90 78%, #9a6c14 100%); --ss-title-edge: #04070d; --ss-title-drop: rgba(0, 0, 0, .7);
}
.board-head.has-art .board-head-text { justify-content: center; padding: 60px 48px; }

/* Headings: between speed lines. */
.category-title { justify-content: center; ${TITLE_TYPE} font-size: 25px; text-transform: none; color: var(--ss-heading); text-shadow: none; }
${ruled(".category-title")}
.tag { border-radius: 0; ${SMALL} font-size: 9.5px; text-shadow: none; }
.tag:where(:not(.topic-tag)) { border-color: var(--line); color: var(--muted); }
.tag.new { border-color: var(--ss-crimson); background: var(--ss-crimson); color: #fff6e6; }

/* Boards and topics: frames with stepped brass corners. */
.category-forums, .topics { gap: 10px; }
.forum, .topic-row { ${FRAME} }
.forum { padding: 16px 20px; }
.topic-row { padding: 14px 20px; }
.forum:hover, .topic-row:hover { ${FRAME_ON} }
/* Pinned and picked topics, and a fresh post, keep a mark inside the frame. */
.topic-row.pinned { border-left: 1px solid var(--ss-edge); box-shadow: inset 4px 0 0 var(--ss-crimson), var(--ss-shadow); }
.topic-row.picked { background: var(--ss-corners), linear-gradient(color-mix(in srgb, var(--accent-2) 14%, transparent), color-mix(in srgb, var(--accent-2) 14%, transparent)), var(--ss-panel); box-shadow: inset 4px 0 0 var(--accent-2), var(--ss-shadow); }
.forum-name { ${TITLE_TYPE} font-size: 23px; line-height: 1.15; text-transform: none; }
.forum-name a, .topic-title a { color: var(--ss-heading); text-decoration: none; }
.forum-name a:hover, .topic-title a:hover { color: var(--ss-storm); }
.forum-desc { font: 400 16px/1.45 var(--font-reading); font-style: normal; }
.forum-place { ${SMALL} font-size: 10px; }
.forum-place a { color: var(--ss-storm); }
.forum-counts b { font: 600 18px var(--font-sans); color: var(--ink); }
.last-label { ${SMALL} font-size: 9.5px; color: var(--ss-heading); }
.forum-last a, .foot-list a { color: var(--ink); font: 600 15px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--ss-storm); }
.topic-title { font: 600 18px/1.25 var(--font-reading); letter-spacing: 0; text-transform: none; }
.topic-row.unread .topic-title a { color: var(--ss-heading); }
.topic-main small { font-style: normal; }
.topic-count b { font: 600 17px var(--font-sans); color: var(--ink); }
/* Unread: a shard of storm-blue, set on its point. */
.unread-dot { width: 9px; height: 9px; border-radius: 0; rotate: 45deg; background: linear-gradient(135deg, #d9f8ff, var(--ss-storm) 55%, #0b5566); box-shadow: 0 0 0 1px rgba(4, 12, 18, .6); }
/* Small portraits: under an arch, as in a doorway. */
.portrait.small, .portrait.tiny { border-radius: 46% 46% 0 0 / 36% 36% 0 0; border: 1px solid var(--ss-brass); background: ${PLATE}; color: ${PLATE_INK}; font-family: var(--font-sans); font-weight: 600; box-shadow: 0 0 0 1px rgba(4, 8, 14, .7); }
/* A location with no picture gets three towers under the ring. */
.forum-art { border-right: 1px solid var(--ss-brass); border-radius: 0; }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} overflow: hidden; }
.location-art { border-right: 1px solid var(--ss-brass); }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${SMALL} font-size: 10.5px; color: var(--ss-storm); }
.location-name { ${TITLE_TYPE} font-size: 38px; text-transform: none; color: var(--ss-heading); }
.location-summary { font: italic 400 17px/1.55 var(--font-reading); }

/* Topic pages. */
.crumbs { ${SMALL} font-size: 11px; }
.crumbs a { color: var(--ss-storm); }
.topic-head { ${FRAME} }
.topic-name { ${TITLE_TYPE} font-size: 38px; line-height: 1.1; text-transform: none; color: var(--ss-heading); }
.cast-chip, .today-chip { border-radius: 0; border-color: var(--line); }

/* Posts: framed, with the name on a band over three shards. */
.posts { gap: 22px; }
.post { ${FRAME} overflow: hidden; }
.post.fresh { border-color: var(--ss-brass); box-shadow: inset 0 0 0 1px var(--ss-brass), var(--ss-shadow); }
.post-band, .post.flip .post-band { padding: 13px 22px 13px; border-bottom: 1px solid var(--ss-edge); background: ${SHARDS} left 22px bottom 0 / 60px 3px no-repeat, var(--ss-band); }
.post.flip .post-band { background-position: right 22px bottom 0, 0 0; }
.post-name { ${TITLE_TYPE} font-size: 24px; line-height: 1.1; text-transform: none; color: var(--ss-heading); }
.post-meta { font: 500 12.5px var(--font-sans); letter-spacing: .04em; }
.post-meta a { color: var(--muted); }
/* The GM's posts are clippings from the broadsheet: newsprint by day and by night, under a double rule. */
.post.post-gm { border-color: #a8966a; background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(60, 48, 24, .035) 3px 4px), #efe6cf; color: #1b1a17; }
.post.post-gm .gm-band { border-bottom: 4px double #1b1a17; background: #e6dcc1; }
.post.post-gm .post-name { color: #14181d; }
.post.post-gm .gm-band small, .post.post-gm .post-meta, .post.post-gm .post-meta a { color: #5a5345; }
.post.post-gm .post-text { color: #1b1a17; }
.post.post-gm .post-text a { color: #0e6474; }
:root[data-theme="dark"] .post.post-gm { --ink: #1b1a17; --muted: #5a5345; --bg: #e9dfc6; --raised: #e6dcc1; --panel: #efe6cf; --line: #b9a67c; --accent: #85570f; --accent-2: #0e6474; --accent2: #0e6474; --ss-heading: #14283a; --ss-brass: #a67b22; --ss-ghost-ink: #14283a; --ss-storm: #0e7286; --ss-edge: #bba878; }
.gm-seal { border-radius: 0; rotate: 45deg; scale: .78; border: 1px solid #5c4410; background: linear-gradient(135deg, #f3d98f, #b38628); color: #1a1508; box-shadow: 0 0 0 3px #efe6cf, 0 0 0 4px #8c6a22; }
.gm-seal > * { rotate: -45deg; }
/* A big portrait: a brass frame with a second line inside it. */
.portrait.big { border: 1px solid var(--ss-brass); border-radius: 0; outline: 1px solid color-mix(in srgb, var(--ss-brass-hi) 80%, transparent); outline-offset: -7px; box-shadow: 0 0 0 1px rgba(4, 8, 14, .6); }
.portrait.big.portrait-empty { background: repeating-conic-gradient(from 270deg at 50% 100%, rgba(210, 165, 80, .16) 0 6deg, transparent 6deg 12deg), linear-gradient(180deg, #1d3348, #0d1722); }
.portrait.big.portrait-empty span { font: 400 110px var(--font-display); color: rgba(241, 214, 142, .8); }
/* The character card that opens over a portrait: identification papers. Cream in both versions, under a
   night-blue head, with the traits stamped in red. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 0 16px 14px; border: 1px solid #8c6a22; border-radius: 0;
  background: repeating-radial-gradient(circle at 100% 0, transparent 0 9px, rgba(140, 106, 34, .07) 9px 10px), #f4ecd6; color: #1a2430;
  box-shadow: inset 0 0 0 3px #f4ecd6, inset 0 0 0 4px rgba(140, 106, 34, .55), 0 14px 28px -10px rgba(0, 0, 0, .65);
}
.mini-card::before { content: "Identification papers"; flex: none; margin: 0 -16px 12px; padding: 8px 16px 7px; background: ${PLATE}; color: ${PLATE_INK}; ${SMALL} font-size: 9.5px; }
.mini-card > *, .mini-card dd { color: #1a2430; }
.mini-card :focus-visible { outline: 2px solid #0e6474; outline-offset: 2px; }
.mini-name { font: 400 22px/1.15 var(--font-display); letter-spacing: .01em; text-transform: none; color: #14283a; }
.mini-role { margin: 2px 0 8px; padding: 0 0 8px; border-bottom: 3px double #8c6a22; font: 400 14.5px/1.4 var(--font-reading); font-style: normal; color: #3b4651; }
.mini-quote { font: italic 400 15px/1.45 var(--font-reading); color: #3b4651; opacity: 1; }
.mini-traits .chip { border: 1px solid #9c2f1f; border-radius: 0; background: none; color: #9c2f1f !important; ${SMALL} font-size: 9.5px; }
.mini-fields dt { ${SMALL} font-size: 9px; color: #7a5a14; }
.mini-fields dd { font: 500 15px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 6px 14px; ${BRASS_BTN} color: #1a1508 !important; font-size: 11px; text-decoration: none; }
.mini-link:hover { ${BRASS_ON} }
.mini-card > :nth-last-child(2) { margin-bottom: 12px; }
.mini-player { font: 500 12.5px/1.6 var(--font-sans); }
.mini-player b { color: var(--ss-heading); }
.post-text { font: 400 17.5px/1.65 var(--font-reading); }
.post-text blockquote { border-left: 4px double var(--ss-brass); background: color-mix(in srgb, var(--ss-brass) 8%, transparent); }
.post-text pre { border: 1px solid var(--line); border-radius: 0; background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { ${TITLE_TYPE} color: var(--ss-heading); }
.roll-card { border-radius: 0; border: 1px solid var(--line); border-left: 3px solid var(--ss-storm); }
.roll-total { border-radius: 0; border: 1px solid #5c4410; background: linear-gradient(180deg, #f3d98f, #b38628); color: #1a1508; font: 400 17px/26px var(--font-display); }
.post-actions { border-top: 1px solid var(--line); }
.post-actions button { ${SMALL} font-size: 10.5px; }
.post-actions button:hover { color: var(--ss-heading); }

/* Buttons and boxes to type in. */
.f-btn { font-size: 11.5px; }
.f-btn.small { font-size: 10.5px; }
.f-btn.ghost { ${GHOST_BTN} color: var(--ss-ghost-ink) !important; }
.f-btn:not(.ghost), .tools .tool-pop .f-btn:not(.ghost) { ${BRASS_BTN} color: #1a1508 !important; }
.f-btn:not(.ghost):hover:not(:disabled) { ${BRASS_ON} }
.f-btn.ghost:hover:not(:disabled) { ${GHOST_ON} }
input:not([type="checkbox"]), select, textarea { border-radius: 0; background: var(--bg); caret-color: var(--ss-storm); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--ss-brass); box-shadow: none; }
.composer { border: 0; background: ${hairline("top")}; }
.composer-kind, .as-label { ${SMALL} color: var(--ss-heading); }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { ${TITLE_TYPE} font-size: 19px; text-transform: none; color: var(--ss-heading); }
.foot-stats b { font: 600 17px var(--font-sans); color: var(--ss-heading); }
.to-top { border-radius: 0; color: var(--ss-heading); }

@container page (max-width: 900px) {
  .board-head-text { padding: 40px 290px 150px 36px; }
  .board-title { font-size: 48px; }
  .board-head:not(.has-art) .board-head-text::before { scale: .78; }
  .board-head:not(.has-art) .board-head-text::after { scale: .66; right: 320px; bottom: 48px; }
}
@container page (max-width: 640px) {
  .board-head { min-height: 330px; }
  .board-head-text { padding: 24px 20px 176px; }
  .board-head.has-art .board-head-text { padding: 36px 20px 40px; }
  .board-title { font-size: 34px; }
  .board-tagline { margin-top: 12px; font-size: 14px; padding: 4px 10px; }
  .board-head:not(.has-art) .board-head-text::before { scale: .5; }
  .board-head:not(.has-art) .board-head-text::after { scale: .5; right: 200px; bottom: 92px; }
  .board-nav { padding: 8px 6px 0; }
  .board-nav a { padding: 11px 8px 10px; font-size: 10.5px; letter-spacing: .1em; }
  .category-title { font-size: 20px; gap: 10px; }
  .forum, .topic-row { padding: 14px 16px; }
  .forum-name { font-size: 20px; }
  .topic-name { font-size: 27px; }
  .location-name { font-size: 26px; }
  .post-name { font-size: 20px; }
  .portrait.big.portrait-empty span { font-size: 56px; }
  .portrait.big { outline-offset: -4px; }
  .mini-card { box-sizing: border-box; }
  .location-art { border-right: 0; border-bottom: 1px solid var(--ss-brass); }
  /* A place's row stacks beside its picture on phones: room above the name and below the latest post, clear of the corners. */
  .forum-location > :nth-child(2) { padding-top: 14px; }
  .forum-location > :last-child { padding-bottom: 16px; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
