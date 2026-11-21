/*
 * Morph: a fully custom skin, inspired by the look of the Animorphs paperbacks of the late nineties. An airbrushed
 * sunset sky over a quiet suburb, a see-through cube with a shape stepping out of it and changing, stage by stage,
 * into a hawk, the title in tall stretched chrome capitals and the small type wide and squared, like Eurostile
 * (Michroma and Saira here, nothing taken from the books). Every colour is a step on one sunset, amber to coral to
 * rose to orchid to violet to indigo, so nothing clashes. Each post carries one stage of the change in its corner,
 * so reading down a thread flips through it like the flip-book in the books' page corners. Categories are numbered
 * like a series. Nothing glows and nothing moves. Like every skin, its stylesheets go through the safety checks in
 * css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --mo-1: #ffb347; --mo-2: #f7764a; --mo-3: #e0457b; --mo-4: #a23cb8; --mo-5: #5b2db0; --mo-6: #23185c;
  --mo-ramp: linear-gradient(90deg, var(--mo-1), var(--mo-2) 25%, var(--mo-3) 50%, var(--mo-4) 75%, var(--mo-5));
  --mo-sky: linear-gradient(180deg, #8fb8f2 0%, #b7b2f0 34%, #e2b3e0 58%, #ffc2a8 80%, #ffd9a0 100%);
  --mo-star: transparent;
  --mo-town: #4a3c86; --mo-ground: #5c4c9c; --mo-tree: #3d3277; --mo-window: #5c4c9c;
  --mo-wire: rgba(43, 26, 102, .62); --mo-glass: rgba(255, 255, 255, .26); --mo-glass-2: rgba(255, 255, 255, .14);
  --mo-s1: #2b1a66; --mo-s2: #4a2a8c; --mo-s3: #8a2f9e; --mo-s4: #c23b6e; --mo-s5: #c2410c;
  --mo-title-ink: #1b1440; --mo-tag-ink: #2b1a66; --mo-tag-box: rgba(255, 255, 255, .55);
  --mo-nav: #23185c; --mo-nav-ink: #fff3e3;
  --mo-panel: #ffffff; --mo-line: #d9cdef; --mo-shadow: 0 10px 24px -16px rgba(35, 24, 92, .45);
  --mo-btn-ink: #1b1440;
  --mo-card: linear-gradient(180deg, #23185c 0%, #3a1f7a 70%, #5b2db0 100%); --mo-card-ink: #f6f0ff; --mo-card-quiet: #cfc2f2;
  --card-bg: #23185c; --card-ink: var(--mo-card-ink); --card-head: var(--mo-1); --card-line: rgba(255, 255, 255, .22);
}
:root[data-theme="dark"] {
  --mo-sky: linear-gradient(180deg, #0b0820 0%, #23185c 34%, #5b2db0 56%, #a23cb8 70%, #e0457b 82%, #f7764a 92%, #ffb347 100%);
  --mo-star: rgba(255, 244, 230, .9);
  --mo-town: #120c2e; --mo-ground: #1a1240; --mo-tree: #0e0a26; --mo-window: #ffb347;
  --mo-wire: rgba(255, 244, 232, .78); --mo-glass: rgba(255, 255, 255, .1); --mo-glass-2: rgba(255, 255, 255, .05);
  --mo-s1: #fff3e3; --mo-s2: #ffd9a8; --mo-s3: #ffc27a; --mo-s4: #ffb347; --mo-s5: #ffb347;
  --mo-title-ink: #fff3e3; --mo-tag-ink: #fff3e3; --mo-tag-box: rgba(11, 8, 32, .45);
  --mo-nav: #0b0820; --mo-nav-ink: #fff3e3;
  --mo-panel: #16113a; --mo-line: #362c6e; --mo-shadow: 0 14px 30px -14px rgba(0, 0, 0, .8);
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
const box = (x: number, y: number, w: number, h: number) => `left ${n(x)}px bottom ${n(y)}px / ${n(w)}px ${n(h)}px no-repeat`;
const rect = (c: string, x: number, y: number, w: number, h: number) => `linear-gradient(${c}, ${c}) ${box(x, y, w, h)}`;
const disc = (c: string, x: number, y: number, d: number) => `radial-gradient(circle closest-side, ${c} 94%, transparent 100%) ${box(x, y, d, d)}`;
/** A triangle pointing up (apex `apex` of the way along) or down, in its own box. */
const up = (c: string, x: number, y: number, w: number, h: number, apex = .5) => {
  const l = Math.atan(apex * w / h) * 180 / Math.PI, r = Math.atan((1 - apex) * w / h) * 180 / Math.PI;
  return `conic-gradient(from ${(180 - r).toFixed(1)}deg at ${(apex * 100).toFixed(0)}% 0, ${c} 0 ${(l + r).toFixed(1)}deg, transparent ${(l + r + .5).toFixed(1)}deg) ${box(x, y, w, h)}`;
};
const down = (c: string, x: number, y: number, w: number, h: number) => {
  const a = Math.atan(w / 2 / h) * 180 / Math.PI;
  return `conic-gradient(from ${(-a).toFixed(1)}deg at 50% 100%, ${c} 0 ${(2 * a).toFixed(1)}deg, transparent ${(2 * a + .5).toFixed(1)}deg) ${box(x, y, w, h)}`;
};

/**
 * The five stages of the change, each in a box 56 square with its bottom left at (x, y): a person (a head and
 * shoulders), the shoulders widening, a diamond, a gull's raised wings, and a hawk with its wings out and its tail.
 */
const STAGES: ((c: string, x: number, y: number, k?: number) => string[])[] = [
  (c, x, y, k = 1) => [disc(c, x + 18 * k, y + 30 * k, 20 * k), `radial-gradient(ellipse farthest-side at 50% 100%, ${c} 96%, transparent 100%) ${box(x + 4 * k, y, 48 * k, 28 * k)}`],
  (c, x, y, k = 1) => [`radial-gradient(ellipse closest-side, ${c} 94%, transparent 100%) ${box(x + 16 * k, y + 26 * k, 24 * k, 18 * k)}`, `radial-gradient(ellipse farthest-side at 50% 100%, ${c} 96%, transparent 100%) ${box(x - 2 * k, y + 2 * k, 60 * k, 24 * k)}`],
  (c, x, y, k = 1) => [up(c, x + 6 * k, y + 28 * k, 44 * k, 22 * k), down(c, x + 6 * k, y + 6 * k, 44 * k, 22 * k)],
  (c, x, y, k = 1) => [up(c, x - 2 * k, y + 18 * k, 32 * k, 20 * k, .75), up(c, x + 26 * k, y + 18 * k, 32 * k, 20 * k, .25), disc(c, x + 22 * k, y + 12 * k, 12 * k)],
  (c, x, y, k = 1) => [up(c, x - 8 * k, y + 24 * k, 38 * k, 14 * k, .9), up(c, x + 26 * k, y + 24 * k, 38 * k, 14 * k, .1), down(c, x + 21 * k, y + 8 * k, 14 * k, 18 * k), disc(c, x + 23 * k, y + 30 * k, 10 * k)],
];
/** One stage alone, drawn in a box 56 square: for the flip-book corner of a post or a row. */
const stage = (n: number, c: string) => STAGES[n](c, 7, 4, .8).join(", ");

/**
 * The cube and the change, in a box 600 by 260: a see-through cube drawn in wire at the right, a person standing in
 * it, and four more stages stepping out to the left and up, the last a hawk.
 */
const line = (c: string, x: number, y: number, w: number, h: number) => rect(c, x, y, w, h);
const edge = (x: number, y: number) => `linear-gradient(to bottom right, transparent calc(50% - 1.2px), var(--mo-wire) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1.2px)) ${box(x, y, 36, 36)}`;
const W = "var(--mo-wire)";
const CUBE_AT = { x: 420, y: 30, s: 140, d: 36 };
const MORPH = inParts("mo-morph", [
  ...STAGES[0]("var(--mo-s1)", 444, 42, 1.65), ...STAGES[1]("var(--mo-s2)", 330, 66, 1.45), ...STAGES[2]("var(--mo-s3)", 238, 98, 1.3),
  ...STAGES[3]("var(--mo-s4)", 134, 128, 1.4), ...STAGES[4]("var(--mo-s5)", 18, 150, 1.65),
  line(W, CUBE_AT.x, CUBE_AT.y, CUBE_AT.s, 2), line(W, CUBE_AT.x, CUBE_AT.y + CUBE_AT.s - 2, CUBE_AT.s, 2),
  line(W, CUBE_AT.x, CUBE_AT.y, 2, CUBE_AT.s), line(W, CUBE_AT.x + CUBE_AT.s - 2, CUBE_AT.y, 2, CUBE_AT.s),
  edge(CUBE_AT.x, CUBE_AT.y), edge(CUBE_AT.x + CUBE_AT.s - 1, CUBE_AT.y), edge(CUBE_AT.x, CUBE_AT.y + CUBE_AT.s - 1), edge(CUBE_AT.x + CUBE_AT.s - 1, CUBE_AT.y + CUBE_AT.s - 1),
  line(W, CUBE_AT.x + CUBE_AT.d, CUBE_AT.y + CUBE_AT.d, CUBE_AT.s, 2), line(W, CUBE_AT.x + CUBE_AT.d, CUBE_AT.y + CUBE_AT.d + CUBE_AT.s - 2, CUBE_AT.s, 2),
  line(W, CUBE_AT.x + CUBE_AT.d, CUBE_AT.y + CUBE_AT.d, 2, CUBE_AT.s), line(W, CUBE_AT.x + CUBE_AT.d + CUBE_AT.s - 2, CUBE_AT.y + CUBE_AT.d, 2, CUBE_AT.s),
  rect("var(--mo-glass)", CUBE_AT.x, CUBE_AT.y, CUBE_AT.s, CUBE_AT.s), rect("var(--mo-glass-2)", CUBE_AT.x + CUBE_AT.d, CUBE_AT.y + CUBE_AT.d, CUBE_AT.s, CUBE_AT.s),
]);

/**
 * A quiet suburb at dusk along the bottom, repeated every 640 pixels: pitched roofs, round trees, a few lit windows
 * and the ground. `y` lifts it.
 */
const TILE = 640;
const roof = (x: number, w: number, h: number, y: number) => {
  const a = Math.atan(w / 2 / h) * 180 / Math.PI;
  return `conic-gradient(from ${(180 - a).toFixed(1)}deg at ${x + w / 2}px 0, var(--mo-town) 0 ${(2 * a).toFixed(1)}deg, transparent ${(2 * a + .5).toFixed(1)}deg) left 0 bottom ${y}px / ${TILE}px ${h}px repeat-x`;
};
const HOUSES: [number, number, number, number][] = [[24, 72, 30, 22], [138, 54, 24, 18], [300, 84, 34, 24], [424, 48, 22, 16], [530, 66, 28, 20]];
const tree = (x: number, r: number, y: number) => `radial-gradient(circle ${r}px at ${x}px ${r}px, var(--mo-tree) 96%, transparent 100%) left 0 bottom ${y}px / ${TILE}px ${2 * r}px repeat-x`;
const town = (y: number) => [
  `linear-gradient(90deg, ${HOUSES.flatMap(([x, w]) => [`transparent ${x + 10}px`, `var(--mo-window) ${x + 10}px ${x + 17}px`, `transparent ${x + 17}px ${x + w - 17}px`, `var(--mo-window) ${x + w - 17}px ${x + w - 10}px`, `transparent ${x + w - 10}px`]).join(", ")}) left 0 bottom ${y + 12}px / ${TILE}px 7px repeat-x`,
  `linear-gradient(90deg, ${HOUSES.flatMap(([x, w]) => [`transparent ${x}px`, `var(--mo-town) ${x}px ${x + w}px`, `transparent ${x + w}px`]).join(", ")}) left 0 bottom ${y}px / ${TILE}px 34px repeat-x`,
  ...HOUSES.map(([x, w, b, h]) => roof(x - 6, w + 12, h, y + b)),
  tree(110, 20, y + 6), tree(250, 16, y + 4), tree(400, 22, y + 6), tree(610, 18, y + 4),
  `linear-gradient(90deg, transparent 106px, var(--mo-tree) 106px 114px, transparent 114px 246px, var(--mo-tree) 246px 254px, transparent 254px 396px, var(--mo-tree) 396px 404px, transparent 404px 606px, var(--mo-tree) 606px 614px, transparent 614px) left 0 bottom ${y}px / ${TILE}px 12px repeat-x`,
  `linear-gradient(var(--mo-ground), var(--mo-ground)) left 0 bottom 0 / 100% ${y + 2}px no-repeat`,
];
/** A few stars, which only the evening version shows. */
const STARS = [[5, 10, 1], [12, 26, 1.5], [21, 6, 1], [30, 18, 1], [39, 30, 1.5], [48, 9, 1], [58, 22, 1], [67, 5, 1.5], [76, 14, 1], [88, 8, 1.5], [95, 24, 1]]
  .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, var(--mo-star) 50%, transparent 100%)`).join(", ");

/** For a location with no picture: the sky, a roofline and a hawk. */
const MINI = [
  ...STAGES[4]("var(--mo-s5)", 0, 0).map(l => l.replace(/left (-?[\d.]+)px bottom (-?[\d.]+)px/, (_, x, y) => `left calc(50% + ${Number(x) - 28}px) bottom calc(50% + ${Number(y) - 18}px)`)),
  "linear-gradient(var(--mo-town), var(--mo-town)) 0 100% / 100% 10px no-repeat",
  "var(--mo-sky)",
].join(", ");

/** The page behind everything: a wash of the evening at the top. */
const PAGE = "background: linear-gradient(180deg, color-mix(in srgb, var(--mo-5) 9%, transparent), transparent 520px), var(--bg);";
/** Small labels: wide squared capitals. */
const LABEL = "font-family: var(--font-display); font-weight: 400; text-transform: uppercase; letter-spacing: .06em;";
/** Buttons and tabs: heavy squared capitals, narrower than the labels so they fit on one line. */
const BTN_TYPE = "font-family: var(--font-reading); font-weight: 700; text-transform: uppercase; letter-spacing: .07em;";
/** The sunset as a thin strip, along the top of a panel. */
const STRIP = (h: number) => `var(--mo-ramp) left top / 100% ${h}px no-repeat`;
/** A panel: a strip of the sunset along its top. */
const FRAME = `border: 1px solid var(--mo-line); border-radius: 8px; background: ${STRIP(4)}, var(--mo-panel); box-shadow: var(--mo-shadow);`;
/** Buttons that matter: the warm end of the sunset, dark lettering, a little shine along the top. */
const SUN_BTN = "border: 0; border-radius: 6px; background: linear-gradient(180deg, var(--mo-1), var(--mo-2)); color: var(--mo-btn-ink); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .55), 0 2px 0 color-mix(in srgb, var(--mo-2) 60%, #000);";
/** A row: a panel with the sunset down its left edge. Under the pointer it warms a little. */
const ROW = `border: 1px solid var(--mo-line); border-left: 0; border-radius: 0 8px 8px 0; background: linear-gradient(180deg, var(--mo-1), var(--mo-3) 50%, var(--mo-5)) left top / 5px 100% no-repeat, var(--mo-panel); padding-left: 20px; transition: background-color .15s;`;
const ROW_ON = "background-color: color-mix(in srgb, var(--mo-1) 7%, var(--mo-panel));";
/** The title: tall, stretched capitals in chrome with a dark edge. */
const CHROME_FILL = "linear-gradient(180deg, #ffffff 0%, #eef0fb 38%, #9aa3c4 50%, #5c6690 53%, #c9cfe8 70%, #ffffff 100%)";
/* The fill repeats once per line (1lh), so every line of a long title gets the full chrome; the first declaration is for browsers without lh. */
const CHROME = `background: ${CHROME_FILL}; background: ${CHROME_FILL} 0 0 / 100% 1lh repeat-y; -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(1px 0 0 #1b1440) drop-shadow(-1px 0 0 #1b1440) drop-shadow(0 1px 0 #1b1440) drop-shadow(0 -1px 0 #1b1440) drop-shadow(0 3px 0 rgba(27, 20, 64, .55));`;
const TITLE = `display: inline-block; font-family: var(--font-reading); font-weight: 800; text-transform: uppercase; letter-spacing: .02em; max-width: 100%; overflow-wrap: break-word; transform: scaleY(1.18); transform-origin: left center; ${CHROME}`;

/**
 * The cover, drawn behind `host`'s own content: the sky (with stars in the evening), the suburb along the bottom
 * and, at the right, the cube with the change stepping out of it.
 */
function cover(host: string, name: string) {
  const back = inParts(name, [...town(0), STARS, "var(--mo-sky)"]);
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 0; border-radius: 8px;
  ${back.declare}
  background: ${back.use};
  color: var(--mo-tag-ink);
}
${host} > * { position: relative; z-index: 2; }
${host}::before {
  content: ""; position: absolute; z-index: 0; right: 2%; bottom: 20px; width: 600px; height: 260px; pointer-events: none;
  ${MORPH.declare}
  background: ${MORPH.use};
}
${host}::after { content: ""; position: absolute; z-index: 1; left: 0; right: 0; top: 0; height: 5px; background: var(--mo-ramp); }`;
}
/** Narrower pages: the change at three quarters. Phones: at half, tucked into the corner. */
const midCover = (host: string) => `${host}::before { scale: .75; transform-origin: bottom right; }`;
const smallCover = (host: string) => `${host}::before { right: 4px; scale: .48; transform-origin: bottom right; }`;
/** A heading: the series number in a box, the name, then the sunset running out to the right. */
const numbered = (h: string, counter: string) => `${h} { display: flex; align-items: center; gap: 12px; counter-increment: ${counter}; }
${h}::before { content: "#" counter(${counter}, decimal-leading-zero); flex: none; padding: 3px 7px 2px; border: 2px solid currentColor; border-radius: 3px; font: 400 11px/1.2 var(--font-display); letter-spacing: .04em; }
${h}::after { content: ""; flex: 1; min-width: 20px; height: 3px; border-radius: 2px; background: var(--mo-ramp); }`;

/* The Encyclopedia: the campaign's overview gets the cover, pages are panels under a strip of the sunset. */
const ENCYCLOPEDIA = `/* Morph for the Encyclopedia. The colours and fonts come from the theme; this adds the cover, the sunset strips and the numbered headings. */
${VARS}
body { ${PAGE} scrollbar-color: var(--mo-4) var(--panel); counter-reset: mo-shelf; }
::selection { background: var(--mo-1); color: #1b1440; }

/* The shelf down the side. */
.sidebar { border-right: 1px solid var(--mo-line); background: var(--mo-panel); }
.csw-name b { font: 800 16px var(--font-reading); letter-spacing: .02em; text-transform: uppercase; }
.campaign-link { border-radius: 6px; }
.campaign-link:hover { color: var(--accent); }
.campaign-link.active { background: color-mix(in srgb, var(--mo-1) 14%, transparent); color: var(--ink); box-shadow: inset 4px 0 0 var(--mo-2); }
.side-heading .section-toggle { ${LABEL} font-size: 10.5px; color: var(--muted); }
.shared-tag { border-radius: 3px; ${LABEL} font-size: 9px; }
.tree-row { border-radius: 6px; }
.tree-row:hover { background: color-mix(in srgb, var(--mo-4) 9%, transparent); }
.tree-row:has(.active), .tree-item.active { background: color-mix(in srgb, var(--mo-1) 14%, transparent); color: var(--ink); box-shadow: inset 4px 0 0 var(--mo-2); }

/* The bar along the top, with the sunset under it. */
.topbar { border-bottom: 0; background: var(--mo-ramp) left bottom / 100% 3px no-repeat, var(--mo-panel); }
.search-box { border-radius: 6px; border-color: var(--mo-line); background: var(--bg); }
.search-box:focus-within { border-color: var(--mo-3); }

/* Buttons and boxes to type in. */
.button { border-radius: 6px; ${BTN_TYPE} font-size: 12px; }
.button.primary { ${SUN_BTN} transition: filter .15s; }
.button.primary:hover { background: linear-gradient(180deg, var(--mo-1), var(--mo-2)); color: var(--mo-btn-ink); filter: brightness(1.06); }
.button:not(.primary):hover { border-color: var(--mo-3); color: var(--accent); }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 6px; caret-color: var(--mo-2); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--mo-3); box-shadow: none; }

/* The campaign's overview: the cover. */
${cover(".dashboard-intro", "mo-enc")}
.dashboard-intro::before { scale: .68; transform-origin: bottom right; }
.dashboard-intro { min-height: 330px; align-items: flex-start; margin-bottom: 26px; padding: 40px 40px 90px; }
.dashboard-intro > div:first-child { min-width: 0; max-width: calc(100% - 430px); }
.dashboard-intro .eyebrow { display: inline-block; padding: 4px 9px; background: var(--mo-tag-box); ${LABEL} font-size: 11px; color: var(--mo-tag-ink); }
.dashboard-intro h1 { margin: 20px 0 18px; font-size: 42px; line-height: 1; ${TITLE} }
.dashboard-intro .subtitle { max-width: 34ch; font: 500 17px/1.45 var(--font-reading); color: var(--mo-tag-ink); }
.dashboard-intro .icon-button { border: 0; background: var(--mo-tag-box); color: var(--mo-tag-ink); }
.overview-strip { border-color: var(--mo-line); border-radius: 8px; }
.overview-strip strong { font: 800 20px var(--font-reading); color: var(--accent); }

/* Headings: numbered like a series, then the sunset. */
.section-heading h2 { flex: 1; font: 700 18px var(--font-reading); letter-spacing: .04em; text-transform: uppercase; }
${numbered(".section-heading h2", "mo-shelf")}
.eyebrow { ${LABEL} font-size: 10.5px; }

/* Cards: panels under a strip of the sunset. Under the pointer they warm a little. */
.note-card { ${FRAME} transition: background-color .15s; }
.note-card:hover { transform: none; background-color: color-mix(in srgb, var(--mo-1) 6%, var(--mo-panel)); }
.note-card h3 { font: 700 19px/1.2 var(--font-reading); }
.note-card:hover h3 { color: var(--accent); }
.note-card.add-card { border: 2px dashed var(--mo-line); background: transparent; box-shadow: none; }

/* A page. */
.kind-pill { border-radius: 3px; border: 0; background: var(--mo-2); color: #1b1440; ${LABEL} font-size: 10px; }
.article-title h1 { font-family: var(--font-reading); font-weight: 800; letter-spacing: .01em; text-transform: uppercase; }
.article-tabs { border-bottom: 0; background: var(--mo-ramp) left bottom / 100% 2px no-repeat; }
.article-tabs button { ${BTN_TYPE} font-size: 12px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); box-shadow: inset 0 -3px 0 var(--mo-2); }
.picture-panel { border-radius: 8px; border-color: var(--mo-line); }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-reading); font-weight: 800; }
.prose h2 { padding-bottom: 6px; background: var(--mo-ramp) left bottom / 100% 2px no-repeat; }
.prose h3 { color: var(--accent); }
.prose blockquote { border-left: 4px solid var(--mo-3); background: color-mix(in srgb, var(--mo-4) 7%, transparent); }
.article-aside .eyebrow { color: var(--accent); }

@media (max-width: 1100px) {
  .dashboard-intro::before { scale: .55; }
  .dashboard-intro > div:first-child { max-width: calc(100% - 350px); }
}
@media (max-width: 640px) {
  .dashboard-intro { min-height: 280px; padding: 26px 20px 150px; }
  .dashboard-intro > div:first-child { max-width: none; }
  .dashboard-intro h1 { font-size: 34px; }
  .dashboard-intro .subtitle { max-width: 26ch; font-size: 15.5px; }
  ${smallCover(".dashboard-intro")}
}
@media (prefers-reduced-motion: reduce) {
  .button.primary, .note-card { transition: none; }
}
`;

/* Maptable: panels round the table, and the Scene Picker gets the cover. */
const MAPTABLE = `/* Morph for Maptable. The map itself keeps its own colours; everything around it takes the sunset. */
${VARS}
body { ${PAGE} scrollbar-color: var(--mo-4) var(--panel); counter-reset: mo-shelf; }
::selection { background: var(--mo-1); color: #1b1440; }

/* The bar along the top, with the sunset under it. */
.app-header, .campaign-dashboard > header { border-bottom: 0; background: var(--mo-ramp) left bottom / 100% 3px no-repeat, var(--mo-panel); }
.header-scene strong { font-family: var(--font-reading); font-weight: 800; text-transform: uppercase; color: var(--accent); }
.csw-name b { font: 800 15px var(--font-reading); letter-spacing: .02em; text-transform: uppercase; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${SUN_BTN} ${BTN_TYPE} font-size: 12px; transition: filter .15s; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { background: linear-gradient(180deg, var(--mo-1), var(--mo-2)); filter: brightness(1.06); }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 6px; caret-color: var(--mo-2); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--mo-3); box-shadow: none; }
input[type="range"] { accent-color: var(--mo-2); }

/* The tool rail: the warm end of the sunset when on. */
.rail { border-right: 1px solid var(--mo-line); background: var(--mo-panel); }
.rail button:hover { color: var(--accent); }
.rail button.active { background: color-mix(in srgb, var(--mo-1) 16%, transparent); color: var(--accent); box-shadow: inset 3px 0 0 var(--mo-2); }

/* The side panel. */
.side-panel { border-right: 1px solid var(--mo-line); background: var(--mo-panel); }
.panel-title { border-bottom: 0; background: var(--mo-ramp) left bottom / 100% 2px no-repeat; }
.panel-title h2 { font: 800 15px var(--font-reading); letter-spacing: .04em; text-transform: uppercase; }
.organizer-scene { border-radius: 6px; white-space: normal; }
.organizer-scene:hover { background: color-mix(in srgb, var(--mo-4) 9%, transparent); }
.organizer-scene.active { background: color-mix(in srgb, var(--mo-1) 14%, transparent); box-shadow: inset 4px 0 0 var(--mo-2); }
.organizer-scene strong { font: 700 15px/1.2 var(--font-reading); }
.organizer-scene.active strong { color: var(--accent); }

/* Around the map. */
.map-topbar { border-bottom: 1px solid var(--mo-line); background: var(--mo-panel); }
.map-title { ${LABEL} font-size: 10.5px; color: var(--muted); }
.board-info { ${LABEL} font-size: 10px; color: var(--muted); }
.toolbar { border-radius: 8px; border: 1px solid var(--mo-line); background: ${STRIP(3)}, var(--mo-panel); box-shadow: var(--mo-shadow); }
.toolbar button { border-radius: 6px; ${BTN_TYPE} font-size: 11.5px; }
.toolbar button:hover { color: var(--accent); }
.toolbar button.active { background: linear-gradient(180deg, var(--mo-1), var(--mo-2)); color: #1b1440; }

/* The Scene Picker: the cover. */
${cover(".campaign-scenes-head", "mo-map")}
.campaign-scenes-head { min-height: 320px; align-items: flex-start; padding: 34px 34px 90px; }
.campaign-scenes-head > div { flex: 1; min-width: 0; padding-right: 300px; }
.campaign-scenes-head::before { scale: .7; transform-origin: bottom right; }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head small { display: inline-block; padding: 4px 9px; background: var(--mo-tag-box); ${LABEL} font-size: 11px; color: var(--mo-tag-ink); }
.campaign-scenes-head h1 { margin-top: 16px; font-size: 48px; line-height: 1; ${TITLE} }
.dashboard-continue { ${FRAME} padding: 18px 24px; transition: background-color .15s; }
.dashboard-continue:hover { ${FRAME} padding: 18px 24px; background-color: color-mix(in srgb, var(--mo-1) 6%, var(--mo-panel)); }
.dashboard-continue small { ${LABEL} font-size: 10.5px; color: var(--accent); }
.dashboard-continue strong { font: 800 22px var(--font-reading); text-transform: uppercase; }
.campaign-scenes-kinds button { border-radius: 6px; ${BTN_TYPE} font-size: 11.5px; }
.campaign-scenes-group h2 { font: 700 17px var(--font-reading); letter-spacing: .04em; text-transform: uppercase; }
${numbered(".campaign-scenes-group h2", "mo-shelf")}
.campaign-scenes-group h2 span { ${LABEL} font-size: 10px; }
.campaign-scene-card { ${FRAME} overflow: hidden; transition: background-color .15s; }
/* Hover: the card warms a little. Nothing lifts and nothing glows. */
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { background-color: color-mix(in srgb, var(--mo-1) 6%, var(--mo-panel)); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card strong { font: 700 15.5px/1.25 var(--font-reading); }
.campaign-scene-card em { ${LABEL} font-style: normal; font-size: 10px; color: var(--accent); }
.campaign-scene-picture { margin-top: 4px; }

@media (max-width: 900px) {
  .campaign-scenes-head::before { scale: .55; }
  .campaign-scenes-head > div { padding-right: 180px; }
  .campaign-scenes-head h1 { font-size: 38px; }
}
@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 250px; padding: 24px 20px 140px; }
  .campaign-scenes-head > div { padding-right: 0; }
  .campaign-scenes-head h1 { font-size: 32px; }
  .dashboard-continue strong { font-size: 18px; overflow-wrap: anywhere; }
  ${smallCover(".campaign-scenes-head")}
}
@media (prefers-reduced-motion: reduce) {
  .primary.primary.primary, .dashboard-continue-action, .dashboard-continue, .campaign-scene-card { transition: none; }
}
`;

/* The campaign's dashboard: the cover behind its name, and panels. */
const DASHBOARD = `/* Morph for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--mo-1); color: #1b1440; }
.hub-crumbs { ${LABEL} font-size: 11px; }
.hub-crumbs a { color: var(--accent); }

/* The top: the cover. */
${cover(".hub-head", "mo-hub")}
.hub-head { min-height: 340px; padding: 36px 660px 90px 36px; }
.hub-title p { display: inline-block; padding: 4px 9px; background: var(--mo-tag-box); ${LABEL} font-size: 11px; color: var(--mo-tag-ink); }
.hub-title h1 { margin-top: 16px; font-size: 54px; line-height: 1; ${TITLE} }
.hub-chip { border-radius: 3px; border: 0; background: var(--mo-tag-box); color: var(--mo-tag-ink); ${LABEL} font-size: 9.5px; }
.hub-head .tag-add { border-radius: 3px; border-color: transparent; background: var(--mo-tag-box); color: var(--mo-tag-ink); }
.hub-head .hub-button:not(.hub-button-primary) { border-color: transparent; background: var(--mo-panel); color: var(--ink); }

/* Buttons. */
.hub-button { border-radius: 6px; ${BTN_TYPE} font-size: 12px; }
.hub-button-primary, a.hub-button-primary { ${SUN_BTN} transition: filter .15s; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { background: linear-gradient(180deg, var(--mo-1), var(--mo-2)); color: var(--mo-btn-ink); filter: brightness(1.06); }
.hub-button:not(.hub-button-primary):hover { border-color: var(--mo-3); color: var(--accent); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 0; background: var(--mo-ramp) left bottom / 100% 2px no-repeat; }
.hub-tabs button, .hub-tabs a { ${BTN_TYPE} font-size: 12px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }

/* Cards: panels under a strip of the sunset. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; font: 800 16px var(--font-reading); letter-spacing: .04em; text-transform: uppercase; color: var(--ink); }
.hub-card-head a, .hub-card-head .hub-text-button { ${LABEL} font-size: 10.5px; }
.hub-scene-grid li { border-radius: 6px; }

@media (max-width: 1100px) {
  ${midCover(".hub-head")}
  .hub-head { padding-right: 500px; }
  .hub-title h1 { font-size: 46px; }
}
@media (max-width: 900px) {
  .hub-head::before { scale: .55; }
  .hub-head { padding-right: 360px; }
  .hub-title h1 { font-size: 38px; }
}
@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 24px 20px 150px; }
  .hub-title h1 { font-size: 34px; }
  ${smallCover(".hub-head")}
}
@media (prefers-reduced-motion: reduce) {
  .hub-button-primary { transition: none; }
}
`;

const SKY = inParts("mo-sky", [STARS, "var(--mo-sky)"]);
const TOWN = inParts("mo-burb", town(0));
/** The flip-book: one stage of the change in the corner of each post and row, in turn. */
const flip = (item: string, size: number) => STAGES.map((_, n) => `${item}:nth-child(5n+${n + 1})::after { background: ${stage(n, "var(--mo-flip)")}; }`).join("\n") + `
${item}::after { content: ""; position: absolute; right: 10px; bottom: 10px; width: 56px; height: 56px; scale: ${size / 56}; transform-origin: bottom right; pointer-events: none; }`;

export const MORPH_SKIN: Theme = {
  id: "preset-morph", name: "Morph", mode: "both", radius: 8, banner: "picture", fonts: { display: "michroma", reading: "saira", ui: "saira" },
  colors: {
    light: { bg: "#f6f2fb", panel: "#ffffff", raised: "#efe8fa", line: "#d9cdef", ink: "#1b1440", muted: "#5d5480", accent: "#b93d0b", accent2: "#6d33d6" },
    dark: { bg: "#0d0a24", panel: "#16113a", raised: "#1f1850", line: "#362c6e", ink: "#f3eefc", muted: "#b3a8d6", accent: "#ffa14a", accent2: "#c99bff" },
  },
  css: `/* Morph: a late-nineties paperback cover. An airbrushed sunset over a quiet suburb, a see-through cube with a shape stepping out of it and changing into a hawk, chrome capitals and wide squared type.
   Every colour is a step on one sunset, so nothing clashes. Light is the afternoon; dark is the evening. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--mo-4) var(--panel); counter-reset: mo-book; --mo-flip: color-mix(in srgb, var(--mo-4) 40%, transparent); }
::selection { background: var(--mo-1); color: #1b1440; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border: 1px solid var(--mo-line); border-bottom: 0; border-radius: 8px 8px 0 0; background: var(--mo-panel); }
.board-date { ${LABEL} font-size: 10.5px; }
.board-date b { ${LABEL} font-size: 10.5px; color: var(--accent); }
.circ { border-radius: 6px; border: 0; background: linear-gradient(135deg, var(--mo-1), var(--mo-3)); color: #1b1440; font: 800 12px var(--font-reading); }
.you b { font: 800 16px var(--font-reading); letter-spacing: .02em; text-transform: uppercase; }
.search-box { border-radius: 6px; border-color: var(--mo-line); background: var(--bg); }
.search-box:focus-within { border-color: var(--mo-3); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the cover. The sky, the suburb along the bottom, and the cube with the change stepping out of it. */
.board-head { min-height: 340px; border: 0; text-align: left; }
.board-head:not(.has-art) {
  ${SKY.declare}
  background: ${SKY.use};
  --head-ink: var(--mo-tag-ink); --head-title: var(--mo-title-ink); --head-shadow: none; --head-nav: var(--mo-nav); --head-line: transparent;
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; padding: 44px 40px 80px; overflow: hidden; }
.board-head:not(.has-art) .board-head-text { padding-right: 650px; ${TOWN.declare} background: ${TOWN.use}; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-head:not(.has-art) .board-head-text::before {
  content: ""; position: absolute; z-index: 0; right: 2%; bottom: 20px; width: 600px; height: 260px;
  ${MORPH.declare}
  background: ${MORPH.use};
}
.board-title { margin-top: 10px; font: 800 60px/1.12 var(--font-reading); }
.board-title a { ${TITLE} text-shadow: none; }
/* The tagline: wide capitals in a box, as on a cover. */
.board-tagline { margin-top: 26px; padding: 7px 12px; border: 2px solid currentColor; background: var(--mo-tag-box); ${LABEL} font-style: normal; font-size: 12px; line-height: 1.5; color: var(--mo-tag-ink); text-shadow: none; }
/* The links: on a dark band, under a strip of the sunset. */
.board-nav { justify-content: flex-start; padding: 5px 24px 0; border-top: 0; background: ${STRIP(5)}, var(--head-nav); }
.board-nav a { padding: 12px 16px; color: var(--mo-nav-ink); ${BTN_TYPE} font-size: 12.5px; }
.board-nav a:hover { color: var(--mo-nav-ink); border-bottom-color: var(--mo-1); }
.board-nav a:focus-visible { outline: 2px solid var(--mo-1); outline-offset: -4px; }
/* With a banner picture: the picture under a soft wash on the left, the same chrome title over it. */
.board-head.has-art {
  background: linear-gradient(90deg, rgba(11, 8, 32, .7) 0%, rgba(11, 8, 32, .3) 55%, rgba(11, 8, 32, .05) 100%), var(--banner) var(--banner-x, 50%) var(--banner-y, 50%) / var(--banner-size, cover) no-repeat;
  --head-ink: #fff3e3; --head-title: #ffffff; --head-shadow: none; --head-nav: #0b0820; --head-line: transparent;
}
.board-head.has-art .board-head-text { justify-content: center; padding: 56px 40px 60px; }
.board-head.has-art .board-tagline { color: #fff3e3; background: rgba(11, 8, 32, .45); }

/* Headings: numbered like a series, the name, then the sunset running out to the right. */
.category { counter-increment: mo-book; }
.category-title { font: 800 19px var(--font-reading); letter-spacing: .04em; text-transform: uppercase; color: var(--ink); }
.category-title { display: flex; align-items: center; gap: 12px; }
.category .category-title::before { content: "#" counter(mo-book, decimal-leading-zero); flex: none; padding: 3px 7px 2px; border: 2px solid var(--accent); border-radius: 3px; font: 400 11px/1.2 var(--font-display); letter-spacing: .04em; color: var(--accent); }
.category-title::after { content: ""; flex: 1; min-width: 20px; height: 3px; border-radius: 2px; background: var(--mo-ramp); }
.tag { border-radius: 3px; ${LABEL} font-size: 9px; text-shadow: none; }
.tag:where(:not(.topic-tag)) { border-color: var(--mo-line); color: var(--muted); }
.tag.new { border-color: var(--mo-1); background: var(--mo-1); color: #1b1440; }

/* Boards and topics: panels with the sunset down their left edge, and a stage of the change in the corner. */
.category-forums, .topics { gap: 8px; }
.forum, .topic-row { position: relative; ${ROW} }
.forum:hover, .topic-row:hover { ${ROW_ON} }
.forum-location { padding-left: 5px; }
${flip(".forum", 22)}
.forum-name { font: 800 20px/1.15 var(--font-reading); letter-spacing: .01em; text-transform: none; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum:hover .forum-name a, .topic-row:hover .topic-title a, .forum-name a:hover, .topic-title a:hover { color: var(--accent); }
.forum-desc { font: 400 15.5px/1.45 var(--font-reading); font-style: normal; }
.forum-place { ${LABEL} font-size: 9.5px; }
.forum-place a { color: var(--accent); }
.forum-counts b { font: 800 18px var(--font-reading); color: var(--ink); }
.last-label { ${LABEL} font-size: 9px; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 700 15px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { font: 700 17px/1.25 var(--font-reading); letter-spacing: 0; text-transform: none; }
.topic-main small { font-style: normal; }
.topic-count b { font: 800 17px var(--font-reading); color: var(--ink); }
.unread-dot { width: 9px; height: 9px; border-radius: 2px; background: var(--mo-1); box-shadow: none; }
/* Small portraits: rounded squares on the warm end of the sunset. */
.portrait.small, .portrait.tiny { border-radius: 6px; border: 0; background: linear-gradient(135deg, var(--mo-1), var(--mo-3)); color: #1b1440; font-family: var(--font-reading); font-weight: 800; box-shadow: none; }
/* A location with no picture gets its own small sky with a hawk over a roofline. */
.forum-art { border-right: 0; border-radius: 0; }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} overflow: hidden; }
.location-art { border-right: 0; }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${LABEL} font-size: 10.5px; color: var(--accent); }
.location-name { font-weight: 800; font-size: 34px; letter-spacing: .01em; text-transform: uppercase; }
.location-summary { font: 400 16.5px/1.55 var(--font-reading); font-style: normal; }

/* Topic pages. */
.crumbs { ${LABEL} font-size: 10.5px; }
.crumbs a { color: var(--accent); }
.topic-head { ${FRAME} }
.topic-name { font: 800 34px/1.1 var(--font-reading); letter-spacing: .01em; text-transform: uppercase; }
.cast-chip, .today-chip { border-radius: 6px; border-color: var(--mo-line); }

/* Posts: panels under a strip of the sunset, the name in heavy capitals, and in the corner one stage of the change,
   so reading down a thread flips through it like the flip-book in the books' page corners. */
.posts { gap: 22px; }
.post { position: relative; border: 1px solid var(--mo-line); border-radius: 8px; overflow: hidden; background: ${STRIP(5)}, var(--mo-panel); box-shadow: var(--mo-shadow); }
${flip(".post", 34)}
.post-band, .post.flip .post-band { padding: 14px 22px 10px; border-bottom: 1px solid var(--mo-line); background: none; }
.post-name { font: 800 21px/1.1 var(--font-reading); letter-spacing: .02em; text-transform: uppercase; color: var(--ink); }
.post-meta { ${LABEL} font-size: 9.5px; }
.post-meta a { color: var(--muted); }
.post.post-gm { background: ${STRIP(5)}, linear-gradient(180deg, color-mix(in srgb, var(--mo-5) 10%, var(--mo-panel)), var(--mo-panel) 160px); box-shadow: var(--mo-shadow); }
.gm-band { border-bottom: 1px solid var(--mo-line); }
.gm-seal { border-radius: 6px; background: linear-gradient(135deg, var(--mo-1), var(--mo-3)); color: #1b1440; box-shadow: none; }
.portrait.big { border: 0; border-radius: 8px; }
.portrait.big::after { content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: 8px; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .5); background: var(--mo-ramp) left bottom / 100% 6px no-repeat; }
.portrait.big.portrait-empty { background: var(--mo-sky); }
.portrait.big.portrait-empty span { font: 800 120px var(--font-reading); color: color-mix(in srgb, var(--mo-tag-ink) 60%, transparent); }
/* The character card that opens over a portrait: an evening sky, the name in the warm end of the sunset and the
   first letter of what they say set large, like the back cover's opening capital. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 20px 18px 18px; border: 0; border-radius: 8px;
  background: ${STRIP(5)}, var(--mo-card); color: var(--mo-card-ink); box-shadow: var(--mo-shadow);
}
.mini-card > *, .mini-card dd { color: var(--mo-card-ink); }
.mini-card :focus-visible { outline: 2px solid var(--mo-1); outline-offset: 2px; }
.mini-name { font: 800 24px/1.05 var(--font-reading); letter-spacing: .02em; text-transform: uppercase; color: var(--mo-1); }
.mini-role { margin: 6px 0 12px; padding-bottom: 10px; border-bottom: 0; background: var(--mo-ramp) left bottom / 100% 2px no-repeat; ${LABEL} font-style: normal; font-size: 10px; color: var(--mo-card-quiet); }
.mini-quote { font: 400 15px/1.45 var(--font-reading); font-style: normal; color: var(--mo-card-ink); opacity: 1; }
.mini-quote::first-letter { float: left; margin: 2px 3px 0 0; font: 800 40px/.85 var(--font-reading); color: var(--mo-1); }
.mini-traits .chip { border-radius: 3px; }
.mini-fields dt { ${LABEL} font-size: 9.5px; color: var(--mo-card-quiet); }
.mini-fields dd { font: 400 15px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 7px 16px; ${SUN_BTN} color: #1b1440 !important; ${BTN_TYPE} font-size: 12px; text-decoration: none; transition: filter .15s; }
.mini-link:hover { filter: brightness(1.06); }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${LABEL} font-size: 9.5px; line-height: 1.7; }
.mini-player b { color: var(--accent); }
.post-text { font: 400 17px/1.65 var(--font-reading); }
.post-text blockquote { border-left: 4px solid var(--mo-3); background: color-mix(in srgb, var(--mo-4) 7%, transparent); }
.post-text pre { border: 1px solid var(--mo-line); border-radius: 6px; background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { font-weight: 800; text-transform: uppercase; color: var(--accent); }
.roll-card { border-radius: 6px; border-color: var(--mo-line); border-left: 4px solid var(--mo-2); }
.roll-total { border-radius: 6px; border: 0; background: linear-gradient(180deg, var(--mo-1), var(--mo-2)); color: #1b1440; font: 800 16px/26px var(--font-reading); }
.post-actions { border-top: 1px solid var(--mo-line); padding-right: 52px; }
.post-actions button { ${BTN_TYPE} font-size: 11px; }
.post-actions button:hover { color: var(--accent); }

/* Buttons and boxes to type in. */
.f-btn { border-radius: 6px; ${BTN_TYPE} font-size: 12px; }
.f-btn:not(.ghost) { ${SUN_BTN} color: #1b1440 !important; transition: filter .15s; }
.f-btn:not(.ghost):hover:not(:disabled) { filter: brightness(1.06); }
.tools .tool-pop .f-btn:not(.ghost) { ${SUN_BTN} }
.f-btn.ghost:hover:not(:disabled) { border-color: var(--mo-3); background: transparent; color: var(--accent) !important; }
input:not([type="checkbox"]), select, textarea { border-radius: 6px; background: var(--bg); caret-color: var(--mo-2); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--mo-3); box-shadow: none; }
.composer { border: 0; background: var(--mo-ramp) left top / 100% 3px no-repeat; }
.composer-kind, .as-label { ${LABEL} color: var(--accent); }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { font-weight: 800; font-size: 14px; letter-spacing: .04em; text-transform: uppercase; color: var(--ink); }
.foot-stats b { font: 800 17px var(--font-reading); color: var(--accent); }
.to-top { border-radius: 6px; color: var(--accent); }

@container page (max-width: 1100px) {
  .board-head:not(.has-art) .board-head-text { padding-right: 490px; }
  .board-title { font-size: 50px; }
  .board-head:not(.has-art) .board-head-text::before { scale: .75; transform-origin: bottom right; }
}
@container page (max-width: 900px) {
  .board-head:not(.has-art) .board-head-text { padding-right: 350px; }
  .board-title { font-size: 40px; }
  .board-head:not(.has-art) .board-head-text::before { scale: .55; }
}
@container page (max-width: 640px) {
  .board-head { min-height: 300px; }
  .board-head-text, .board-head:not(.has-art) .board-head-text { padding: 28px 20px 150px; }
  .board-head.has-art .board-head-text { padding: 36px 20px 40px; }
  .board-title { font-size: 38px; }
  .board-tagline { margin-top: 20px; font-size: 10px; }
  .board-head:not(.has-art) .board-head-text::before { right: 4px; scale: .48; transform-origin: bottom right; }
  .board-nav { padding: 5px 6px 0; }
  .board-nav a { padding: 10px 9px; font-size: 11px; }
  .category-title { font-size: 16px; }
  .forum-name { font-size: 18px; }
  .topic-name { font-size: 25px; }
  .location-name { font-size: 24px; }
  .post-name { font-size: 18px; }
  .portrait.big.portrait-empty span { font-size: 60px; }
  .mini-card { box-sizing: border-box; padding: 16px 14px 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .forum, .topic-row, .f-btn, .mini-link { transition: none; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
