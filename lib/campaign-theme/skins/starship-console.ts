/*
 * Starship Console: a fully custom skin, inspired by the LCARS displays of Star Trek. Everything is a flat block of
 * colour on an empty field: a thick column down the left that turns through a rounded elbow into a bar, bars cut into
 * segments with a gap between them, buttons that are pills, and condensed capitals. The banner is one such frame with a
 * sensor display inside it, all gradients (no picture, nothing from the shows). Nothing glows and nothing moves. Like
 * every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --lc-void: #f3ede4;
  --lc-a: #b55400; --lc-b: #6a3fb0; --lc-c: #9a6324; --lc-d: #a33a4a; --lc-e: #3d5aa8;
  --lc-on: #fffaf2;
  --lc-ink-a: #a04a00;
  --lc-ring: rgba(106, 63, 176, .34);
  --lc-sweep: rgba(106, 63, 176, .1);
  --lc-panel: #fffaf2;
  --lc-line: #d8c7b0;
  --lc-scrim: linear-gradient(270deg, rgba(0, 0, 0, .78) 0%, rgba(0, 0, 0, .3) 55%, rgba(0, 0, 0, .12) 100%);
  --lc-strip: linear-gradient(90deg, var(--lc-a) 0 26%, transparent 26% calc(26% + 5px), var(--lc-c) calc(26% + 5px) 38%, transparent 38% calc(38% + 5px), var(--lc-b) calc(38% + 5px) 84%, transparent 84% calc(84% + 5px), var(--lc-d) calc(84% + 5px) 100%);
  --lc-w: 150px; --lc-top: 90px; --lc-bar: 22px; --lc-bar2: 14px; --lc-r: 30px; --lc-r2: 30px; --lc-round: 58px; --lc-nav: 34px; --lc-u: 1px;
  --lc-plate: #000000; --lc-plate-ink: #f3ead9; --lc-plate-quiet: #b9a9cf; --lc-plate-a: #ff9c33; --lc-plate-b: #c59bff; --lc-plate-c: #ffcc99;
  --card-bg: var(--lc-plate); --card-ink: var(--lc-plate-ink); --card-head: var(--lc-plate-a); --card-line: #3a3350;
}
:root[data-theme="dark"] {
  --lc-void: #000000;
  --lc-a: #ff9c33; --lc-b: #c59bff; --lc-c: #ffcc99; --lc-d: #e0747c; --lc-e: #8f9fff;
  --lc-on: #000000;
  --lc-ink-a: #ff9c33;
  --lc-ring: rgba(197, 155, 255, .42);
  --lc-sweep: rgba(197, 155, 255, .13);
  --lc-panel: #0b0b0f;
  --lc-line: #3a3350;
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

const flat = (colour: string) => `linear-gradient(var(--lc-${colour}), var(--lc-${colour}))`;
/** A bar cut into segments with a gap between them: each entry is a colour and where, in percent, its segment ends. */
const segments = (cuts: [string, number][]) => {
  let from = "0";
  return `linear-gradient(90deg, ${cuts.map(([colour, end], i) => {
    const piece = `var(--lc-${colour}) ${from} ${end}%${i < cuts.length - 1 ? `, transparent ${end}% calc(${end}% + 5px)` : ""}`;
    from = `calc(${end}% + 5px)`;
    return piece;
  }).join(", ")})`;
};
/** The rounded end of a bar, facing right. */
const cap = (colour: string, thick: string, y: string) => `radial-gradient(circle at 0 50%, var(--lc-${colour}) calc(${thick} / 2 - .5px), transparent calc(${thick} / 2)) right 0 ${y} / calc(${thick} / 2) ${thick} no-repeat`;

/**
 * The column down the left: a tall block at the top and at the bottom, three short ones between, each with its
 * number. It is one box, so the numbers are its own text, a line to a block: the wide word spacing puts each on a line.
 */
const COLUMN = `content: "02-4471 47-0926 13-8105" / ""; word-spacing: 400px; position: absolute; z-index: 0; left: 0; top: 0; bottom: 0; width: var(--lc-w); box-sizing: border-box; padding: calc(var(--lc-top) + 5px) 10px 0 0; overflow: hidden; pointer-events: none;
  text-align: right; font: 600 14px/49px var(--font-display); letter-spacing: .06em; color: var(--lc-on);
  background: ${[
    `${flat("a")} left top / 100% var(--lc-top) no-repeat`,
    `${flat("c")} left 0 top calc(var(--lc-top) + 5px) / 100% 44px no-repeat`,
    `${flat("e")} left 0 top calc(var(--lc-top) + 54px) / 100% 44px no-repeat`,
    `${flat("d")} left 0 top calc(var(--lc-top) + 103px) / 100% 44px no-repeat`,
    `${flat("b")} left 0 top calc(var(--lc-top) + 152px) / 100% 100% no-repeat`,
    "var(--lc-void)",
  ].join(", ")};`;

/** One unit of the sensor display: a pixel on a desk, less on a phone, so the whole display shrinks together. */
const u = (n: number) => `calc(var(--lc-u) * ${n})`;
/**
 * The sensor display, in a box 230 units square that sits `gap` units from one side and half way down: rings, a cross
 * hair, a pale sweep, a world, two moons and a scale beside it.
 */
const scan = (side: "left" | "right", gap: number) => {
  const SIZE = 230;
  const at = (x: number, y: number, w: number, h: number, wide = u(w), tall = u(h)) =>
    `${side} ${u(gap + (side === "left" ? x : SIZE - x - w))} top calc(50% + ${u(y + h / 2 - SIZE / 2)}) / ${wide} ${tall} no-repeat`;
  const disc = (colour: string, x: number, y: number, d: number) => `radial-gradient(circle closest-side, var(--lc-${colour}) 94%, transparent 100%) ${at(x, y, d, d)}`;
  return [
    disc("c", 142, 46, 44), disc("a", 62, 150, 14), disc("d", 176, 138, 9), disc("b", 110, 110, 10),
    `radial-gradient(circle closest-side, transparent calc(100% - 3.5px), var(--lc-b) calc(100% - 3px) calc(100% - 1px), var(--lc-void) 100%) ${at(0, 0, SIZE, SIZE)}`,
    `linear-gradient(var(--lc-ring), var(--lc-ring)) ${at(0, SIZE / 2, SIZE, 0, u(SIZE), "1px")}`,
    `linear-gradient(var(--lc-ring), var(--lc-ring)) ${at(SIZE / 2, 0, 0, SIZE, "1px", u(SIZE))}`,
    `conic-gradient(from 22deg at 50% 50%, var(--lc-sweep) 0 58deg, transparent 58deg) ${at(0, 0, SIZE, SIZE)}`,
    `repeating-radial-gradient(circle at 50% 50%, transparent 0 ${u(27)}, var(--lc-ring) ${u(27)} calc(${u(27)} + 1.2px)) ${at(0, 0, SIZE, SIZE)}`,
    `repeating-linear-gradient(180deg, var(--lc-ring) 0 1px, transparent 1px ${u(10)}) ${at(side === "left" ? SIZE + 16 : -28, 0, 12, SIZE)}`,
    `${flat("a")} ${at(side === "left" ? SIZE + 16 : -28, 64, 12, 5)}`,
    `${flat("c")} ${at(side === "left" ? SIZE + 16 : -28, 148, 12, 5)}`,
  ];
};
/**
 * Everything to the right of the column: the bar along the top and the curve inside its elbow, and, when `foot` is
 * set, the same along the bottom. `display` is the sensor display's layers, or nothing.
 */
const bars = (name: string, foot: boolean, display: string[]) => inParts(name, [
  `radial-gradient(circle at 100% 100%, transparent calc(var(--lc-r) - .5px), var(--lc-a) var(--lc-r)) left 0 top var(--lc-bar) / var(--lc-r) var(--lc-r) no-repeat`,
  cap("a", "var(--lc-bar)", "top 0"),
  `${segments([["a", 46], ["c", 54], ["e", 82], ["a", 100]])} left top / calc(100% - var(--lc-bar) / 2) var(--lc-bar) no-repeat`,
  `${flat("void")} left top / 100% var(--lc-bar) no-repeat`,
  ...(foot ? [
    `radial-gradient(circle at 100% 0, transparent calc(var(--lc-r) - .5px), var(--lc-b) var(--lc-r)) left 0 bottom var(--lc-bar2) / var(--lc-r) var(--lc-r) no-repeat`,
    cap("b", "var(--lc-bar2)", "bottom 0"),
    `${segments([["b", 22], ["d", 31], ["c", 76], ["b", 100]])} left bottom / calc(100% - var(--lc-bar2) / 2) var(--lc-bar2) no-repeat`,
  ] : [
    `radial-gradient(circle at 100% 0, transparent calc(var(--lc-r2) - .5px), var(--lc-b) var(--lc-r2)) left 0 bottom var(--lc-nav) / var(--lc-r2) var(--lc-r2) no-repeat`,
  ]),
  ...display,
]);

/** For a location with no picture: a small sensor display. */
const MINI = [
  "radial-gradient(circle closest-side, var(--lc-c) 92%, transparent 100%) 70% 30% / 18px 18px no-repeat",
  "radial-gradient(circle closest-side, var(--lc-a) 90%, transparent 100%) 28% 72% / 8px 8px no-repeat",
  "linear-gradient(var(--lc-ring), var(--lc-ring)) center / 100% 1px no-repeat",
  "linear-gradient(var(--lc-ring), var(--lc-ring)) center / 1px 100% no-repeat",
  "repeating-radial-gradient(circle at 50% 50%, transparent 0 13px, var(--lc-ring) 13px 14.2px)",
  "var(--lc-void)",
].join(", ");

/** The page behind everything: the empty field. */
const PAGE = "background: var(--lc-void);";
/** Small labels: condensed capitals, set wide. */
const LABEL = "font-family: var(--font-display); font-weight: 500; text-transform: uppercase; letter-spacing: .1em;";
/* Text in the main colour uses --lc-ink-a, a shade darker in the light version so small lettering on the field still reads. */
/** A panel: a thick block down its left with rounded ends, and nothing else round it. */
const FRAME = "border: 0; border-left: 18px solid var(--lc-k, var(--lc-b)); border-radius: 24px 0 0 24px; background: var(--lc-panel);";
/** A card: a small elbow, a bar along the top that turns down the left. The curve inside it comes from the two edges. */
const ELBOW = "border: 0; border-top: 8px solid var(--lc-k, var(--lc-b)); border-left: 14px solid var(--lc-k, var(--lc-b)); border-radius: 26px 0 0 0; background: var(--lc-panel);";
/** Buttons that matter: a pill of solid colour with dark lettering. */
const PILL = "border: 0; border-radius: 999px; padding-inline: 20px; background: var(--lc-a); color: var(--lc-on);";
/** The colours that rows, cards and posts take in turn. */
const turns = (item: string) => `${item}:nth-child(4n+1) { --lc-k: var(--lc-b); }
${item}:nth-child(4n+2) { --lc-k: var(--lc-c); }
${item}:nth-child(4n+3) { --lc-k: var(--lc-e); }
${item}:nth-child(4n) { --lc-k: var(--lc-d); }`;
/** A heading: a block with a rounded end, the name, then a bar that runs to a rounded end. */
const heading = (h: string) => `${h} { display: flex; align-items: center; gap: 10px; font: 600 21px/28px var(--font-display); letter-spacing: .08em; text-transform: uppercase; color: var(--lc-k, var(--lc-ink-a)); }
${h}::before { content: ""; flex: none; align-self: flex-start; width: 46px; height: 28px; border-radius: 14px 0 0 14px; background: var(--lc-k, var(--lc-a)); }
${h}::after { content: ""; flex: 1; align-self: flex-start; min-width: 24px; height: 28px; border-radius: 0 14px 14px 0; background: var(--lc-k, var(--lc-a)); }`;
const TITLE = "font-family: var(--font-display); font-weight: 700; text-transform: uppercase; letter-spacing: .02em; color: var(--lc-ink-a); overflow-wrap: break-word;";

/**
 * The frame, drawn behind `host`'s own content: the column down the left, an elbow into a bar at the top and another
 * at the bottom, and the sensor display `gap` pixels from the right, clear of the buttons the page puts there. Nothing in
 * it moves.
 */
function frame(host: string, name: string, gap: number) {
  const drawn = bars(name, true, scan("right", gap)), plain = bars(`${name}-plain`, true, []);
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 0; border-radius: var(--lc-round) 0 0 var(--lc-round);
  background: var(--lc-void); color: var(--ink);
}
${host} > * { position: relative; z-index: 2; }
${host}::before { ${COLUMN} }
${host}::after {
  content: ""; position: absolute; z-index: 0; left: var(--lc-w); right: 0; top: 0; bottom: 0; pointer-events: none;
  ${drawn.declare}
  ${plain.declare}
  background: ${drawn.use};
}`;
}
/** On a phone the frame keeps its bars but drops the sensor display, which would sit under the title. */
const plainFrame = (host: string, name: string) => `${host}::after { background: ${bars(`${name}-plain`, true, []).use}; }`;
/** The same frame, smaller, for a phone. */
const SMALL = "--lc-w: 46px; --lc-top: 58px; --lc-bar: 14px; --lc-bar2: 10px; --lc-r: 18px; --lc-round: 30px; --lc-u: .5px;";
const smallFrame = (host: string) => `${host} { ${SMALL} }
  ${host}::before { padding-right: 5px; font-size: 9.5px; letter-spacing: .02em; }`;

/* The Encyclopedia: the campaign's overview gets the frame, pages are blocks and pills on the field. */
const ENCYCLOPEDIA = `/* Starship Console for the Encyclopedia. The colours and fonts come from the theme; this adds the frame, the elbows and the pills. */
${VARS}
body { ${PAGE} scrollbar-color: var(--lc-b) var(--lc-void); }
::selection { background: var(--lc-a); color: var(--lc-on); }

/* The shelf down the side. */
.sidebar { border-right: 2px solid var(--lc-line); background: var(--lc-void); }
.csw-name b { font: 600 18px var(--font-display); letter-spacing: .06em; text-transform: uppercase; color: var(--lc-ink-a); }
.campaign-link { border-radius: 999px 0 0 999px; ${LABEL} font-size: 14px; }
.campaign-link:hover { color: var(--lc-ink-a); }
.campaign-link.active { background: var(--lc-b); color: var(--lc-on); }
.side-heading .section-toggle { ${LABEL} font-size: 13px; color: var(--lc-ink-a); }
.shared-tag { border-radius: 999px; border: 0; background: color-mix(in srgb, var(--lc-b) 24%, transparent); color: var(--ink); ${LABEL} font-size: 10px; }
.tree-row { border-radius: 999px 0 0 999px; }
.tree-row:hover { background: color-mix(in srgb, var(--lc-b) 12%, transparent); }
.tree-row:has(.active), .tree-item.active { background: color-mix(in srgb, var(--lc-b) 26%, transparent); color: var(--ink); box-shadow: inset 8px 0 0 var(--lc-a); }

/* The bar along the top, with a segmented strip under it. */
.topbar { border-bottom: 6px solid; border-image: var(--lc-strip) 1; background: var(--lc-void); }
.search-box { border-radius: 999px; border: 2px solid var(--lc-b); background: var(--lc-void); }
.search-box:focus-within { border-color: var(--lc-a); }
.quick-hint kbd { border-radius: 999px; border-color: var(--lc-line); }

/* Buttons and boxes to type in. */
.button { border-radius: 999px; ${LABEL} font-size: 13.5px; }
.button.primary { ${PILL} transition: filter .15s; }
.button.primary:hover { filter: brightness(1.08); }
.button:not(.primary) { border: 0; background: color-mix(in srgb, var(--lc-b) 24%, transparent); color: var(--ink); }
.button:not(.primary):hover { background: color-mix(in srgb, var(--lc-b) 36%, transparent); }
.icon-button { border-radius: 999px; }
.icon-button:hover { color: var(--lc-ink-a); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 14px; caret-color: var(--lc-a); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--lc-a); box-shadow: none; }

/* The campaign's overview: the frame. */
${frame(".dashboard-intro", "lc-enc", 64)}
.dashboard-intro { min-height: 320px; align-items: flex-start; margin-bottom: 26px; padding: calc(var(--lc-bar) + 34px) 350px calc(var(--lc-bar2) + 36px) calc(var(--lc-w) + var(--lc-r) + 26px); }
.dashboard-intro .eyebrow { ${LABEL} font-size: 15px; color: var(--lc-b); }
.dashboard-intro h1 { margin-top: 6px; font-size: 62px; line-height: 1; ${TITLE} }
.dashboard-intro .subtitle { max-width: 40ch; font: 400 16.5px/1.5 var(--font-reading); color: var(--ink); }
.dashboard-intro .icon-button { border: 0; background: color-mix(in srgb, var(--lc-b) 24%, var(--lc-void)); color: var(--ink); }
.overview-strip { border-color: var(--lc-line); border-radius: 0 20px 20px 0; }
.overview-strip strong { font: 600 22px var(--font-display); letter-spacing: .04em; color: var(--lc-ink-a); }

/* Headings: a block, the name, then a bar. */
.section-heading h2 { flex: 1; }
${heading(".section-heading h2")}
.eyebrow { ${LABEL} font-size: 12.5px; }

/* Cards: a small elbow each, the colours taking turns. Under the pointer the elbow turns to the main colour. */
${turns(".note-card")}
.note-card { ${ELBOW} padding: 16px 20px 20px; transition: border-color .15s; }
.note-card:hover { border-color: var(--lc-a); }
.note-card h3 { font: 600 22px/1.15 var(--font-display); letter-spacing: .04em; text-transform: uppercase; }
.note-card:hover h3 { color: var(--lc-ink-a); }
.note-card .eyebrow { color: var(--lc-k, var(--lc-b)); }
.card-footer { color: var(--muted); }
.note-card.add-card { border: 2px dashed var(--lc-line); border-radius: 26px 0 0 0; background: transparent; }

/* A page. */
.kind-pill { padding: 2px 14px; border-radius: 999px; border: 0; background: var(--lc-a); color: var(--lc-on); ${LABEL} font-size: 12px; }
.article-title h1 { font-family: var(--font-display); font-weight: 700; letter-spacing: .02em; text-transform: uppercase; color: var(--lc-ink-a); }
.tag-add, .who-button { border-radius: 999px; }
.article-tabs { border-bottom: 6px solid; border-image: var(--lc-strip) 1; }
.article-tabs button { border-radius: 14px 14px 0 0; ${LABEL} font-size: 13.5px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { background: var(--lc-a); color: var(--lc-on); box-shadow: none; }
.picture-panel { border-radius: 0 26px 26px 0; border-color: var(--lc-line); }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-display); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.prose h2 { padding-bottom: 6px; border-bottom: 4px solid; border-image: var(--lc-strip) 1; color: var(--lc-ink-a); }
.prose h3 { color: var(--lc-b); }
.prose blockquote { border-left: 12px solid var(--lc-c); border-radius: 16px 0 0 16px; background: color-mix(in srgb, var(--lc-c) 9%, transparent); }
.prose code, .prose pre { border-radius: 10px; }
.article-aside .aside-section { border-top: 2px solid var(--lc-line); }
.article-aside .eyebrow { color: var(--lc-ink-a); }

/* Narrower pages (the shelf takes room too): the frame keeps its bars and drops the sensor display. */
@media (max-width: 1100px) {
  ${plainFrame(".dashboard-intro", "lc-enc")}
  .dashboard-intro { padding-right: 36px; }
}
@media (max-width: 640px) {
  ${smallFrame(".dashboard-intro")}
  .dashboard-intro { min-height: 270px; padding: 34px 18px 34px 66px; }
  .dashboard-intro h1 { font-size: 38px; }
  .dashboard-intro .subtitle { max-width: 26ch; font-size: 15px; }
  .section-heading h2 { font-size: 18px; }
  .section-heading h2::before { width: 24px; }
}
`;

/* Maptable: blocks and pills around the table, and the Scene Picker gets the frame. */
const MAPTABLE = `/* Starship Console for Maptable. The map itself keeps its own colours; everything around it is blocks and pills on the field. */
${VARS}
body { ${PAGE} scrollbar-color: var(--lc-b) var(--lc-void); }
::selection { background: var(--lc-a); color: var(--lc-on); }

/* The bar along the top, with a segmented strip under it. */
.app-header, .campaign-dashboard > header { border-bottom: 6px solid; border-image: var(--lc-strip) 1; background: var(--lc-void); }
.header-scene strong { font-family: var(--font-display); letter-spacing: .06em; text-transform: uppercase; color: var(--lc-ink-a); }
.csw-btn { border-radius: 999px; }
.csw-name b { font: 600 17px var(--font-display); letter-spacing: .06em; text-transform: uppercase; color: var(--lc-ink-a); }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${PILL} ${LABEL} font-size: 13.5px; transition: filter .15s; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { background: var(--lc-a); filter: brightness(1.08); }
.icon-button { border-radius: 999px; }
.icon-button:hover { color: var(--lc-ink-a); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 14px; caret-color: var(--lc-a); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--lc-a); box-shadow: none; }
input[type="range"] { accent-color: var(--lc-a); }

/* The tool rail: a pill of the main colour when on. */
.rail { border-right: 2px solid var(--lc-line); background: var(--lc-void); }
.rail button { border-radius: 999px; }
.rail button:hover { color: var(--lc-ink-a); }
.rail button.active { background: var(--lc-a); color: var(--lc-on); }

/* The side panel. */
.side-panel { border-right: 2px solid var(--lc-line); background: var(--lc-void); }
.panel-title { border-bottom: 4px solid; border-image: var(--lc-strip) 1; }
.panel-title h2 { font: 600 18px var(--font-display); letter-spacing: .08em; text-transform: uppercase; color: var(--lc-ink-a); }
.organizer-scene { border-radius: 16px 0 0 16px; border-left: 10px solid color-mix(in srgb, var(--lc-b) 40%, transparent); white-space: normal; }
.organizer-scene:hover { background: color-mix(in srgb, var(--lc-b) 12%, transparent); }
.organizer-scene.active { border-left-color: var(--lc-a); background: color-mix(in srgb, var(--lc-a) 14%, transparent); }
.organizer-scene strong { font: 600 16px/1.2 var(--font-display); letter-spacing: .05em; text-transform: uppercase; }
.organizer-scene.active strong { color: var(--lc-ink-a); }
.scene-kind { border-radius: 999px; color: var(--muted); }

/* Around the map. */
.map-topbar { border-bottom: 2px solid var(--lc-line); background: var(--lc-void); }
.map-title { ${LABEL} font-size: 13px; color: var(--lc-b); }
.board { background: var(--lc-void); }
.board-info { ${LABEL} color: var(--muted); }
.zoom-controls { border-radius: 999px; border-color: var(--lc-line); }
.toolbar { border-radius: 22px; border: 2px solid var(--lc-line); background: var(--lc-void); box-shadow: none; }
.toolbar button { border-radius: 999px; ${LABEL} font-size: 13px; }
.toolbar button:hover { color: var(--lc-ink-a); }
.toolbar button.active { background: var(--lc-a); color: var(--lc-on); }

/* The Scene Picker: the frame. */
${frame(".campaign-scenes-head", "lc-map", 190)}
.campaign-scenes-head { min-height: 300px; align-items: flex-start; padding: calc(var(--lc-bar) + 32px) 30px calc(var(--lc-bar2) + 34px) calc(var(--lc-w) + var(--lc-r) + 26px); }
.campaign-scenes-head small { ${LABEL} font-size: 15px; color: var(--lc-b); }
.campaign-scenes-head h1 { margin-top: 4px; margin-right: 340px; font-size: 56px; line-height: 1; ${TITLE} }
.dashboard-continue { border: 0; border-left: 30px solid var(--lc-a); border-radius: 40px 0 0 40px; background: var(--lc-panel); padding: 18px 28px; transition: background-color .15s; }
.dashboard-continue:hover { background: color-mix(in srgb, var(--lc-a) 8%, var(--lc-panel)); }
.dashboard-continue small { ${LABEL} font-size: 13px; color: var(--lc-b); }
.dashboard-continue strong { font: 600 26px var(--font-display); letter-spacing: .04em; text-transform: uppercase; }
.campaign-scenes-kinds button { border-radius: 999px; ${LABEL} font-size: 13px; }
${heading(".campaign-scenes-group h2")}
.campaign-scenes-group h2 span { ${LABEL} font-size: 13px; color: var(--muted); }
${turns(".campaign-scene-card")}
.campaign-scene-card { ${ELBOW} overflow: hidden; transition: border-color .15s; }
.campaign-scene-card.last { --lc-k: var(--lc-a); }
/* Hover: the elbow turns to the main colour. Nothing lifts and nothing glows. */
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { border-color: var(--lc-a); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--lc-ink-a); }
.campaign-scene-card strong { font: 600 18px/1.2 var(--font-display); letter-spacing: .05em; text-transform: uppercase; }
.campaign-scene-card em { ${LABEL} font-style: normal; font-size: 12px; color: var(--lc-k, var(--lc-b)); }
.campaign-scene-card small { font-size: 13px; }
.campaign-scene-picture { border-bottom: 0; }

/* Narrower pages: the frame keeps its bars and drops the sensor display. */
@media (max-width: 900px) {
  ${plainFrame(".campaign-scenes-head", "lc-map")}
  .campaign-scenes-head h1 { margin-right: 0; }
}
@media (max-width: 640px) {
  ${smallFrame(".campaign-scenes-head")}
  .campaign-scenes-head { min-height: 250px; padding: 32px 18px 32px 66px; }
  .campaign-scenes-head h1 { margin-right: 0; font-size: 34px; }
}
`;

/* The campaign's dashboard: the frame round its name, and elbow cards. */
const DASHBOARD = `/* Starship Console for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--lc-a); color: var(--lc-on); }
.hub-crumbs { ${LABEL} font-size: 13.5px; }
.hub-crumbs a { color: var(--lc-b); }

/* The top: the frame. */
${frame(".hub-head", "lc-hub", 44)}
.hub-head { min-height: 330px; padding: calc(var(--lc-bar) + 34px) 330px calc(var(--lc-bar2) + 36px) calc(var(--lc-w) + var(--lc-r) + 26px); }
.hub-title p { ${LABEL} font-size: 15px; color: var(--lc-b); }
.hub-title h1 { margin-top: 4px; font-size: 64px; line-height: 1; ${TITLE} }
.hub-chip { border-radius: 999px; border: 0; background: color-mix(in srgb, var(--lc-b) 24%, var(--lc-void)); color: var(--ink); ${LABEL} font-size: 12px; }
.hub-head .tag-add { border-radius: 999px; border-color: var(--lc-line); background: var(--lc-void); color: var(--ink); }
.hub-head .hub-button:not(.hub-button-primary) { background: color-mix(in srgb, var(--lc-b) 24%, var(--lc-void)); }

/* Buttons. */
.hub-button { border-radius: 999px; ${LABEL} font-size: 13.5px; }
.hub-button-primary { ${PILL} transition: filter .15s; }
.hub-button-primary:hover { filter: brightness(1.08); }
.hub-button:not(.hub-button-primary) { border: 0; background: color-mix(in srgb, var(--lc-b) 24%, transparent); color: var(--ink); }
.hub-button:not(.hub-button-primary):hover { background: color-mix(in srgb, var(--lc-b) 36%, transparent); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 6px solid; border-image: var(--lc-strip) 1; }
.hub-tabs button, .hub-tabs a { border-radius: 14px 14px 0 0; ${LABEL} font-size: 14px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { background: var(--lc-a); color: var(--lc-on); }
.mem-count { border-radius: 999px; }

/* Cards: a small elbow each, the colours taking turns. */
${turns(".hub-card")}
.hub-card { ${ELBOW} }
.hub-card-head h2 { flex: 1; font: 600 20px var(--font-display); letter-spacing: .08em; text-transform: uppercase; color: var(--lc-k, var(--lc-ink-a)); }
.hub-card-head a, .hub-card-head .hub-text-button { ${LABEL} font-size: 13px; }
.hub-scene-grid li { border-radius: 0 16px 16px 0; }

/* Narrower pages: the frame keeps its bars and drops the sensor display. */
@media (max-width: 900px) {
  ${plainFrame(".hub-head", "lc-hub")}
  .hub-head { padding-right: 32px; }
}
@media (max-width: 640px) {
  ${smallFrame(".hub-head")}
  .hub-head { min-height: 0; padding: 32px 18px 34px 66px; }
  .hub-title h1 { font-size: 38px; }
}
`;

const FORUM_BARS = bars("lc-top", false, []);
const FORUM_SCAN = bars("lc-all", false, scan("left", 50));

export const STARSHIP_CONSOLE: Theme = {
  id: "preset-console", name: "Starship Console", mode: "both", radius: 16, banner: "picture", fonts: { display: "antonio", reading: "inter", ui: "inter" },
  colors: {
    light: { bg: "#f3ede4", panel: "#fffaf2", raised: "#f5ecdf", line: "#d8c7b0", ink: "#1b1524", muted: "#5b4f6b", accent: "#b55400", accent2: "#6a3fb0" },
    dark: { bg: "#000000", panel: "#0b0b0f", raised: "#15151c", line: "#3a3350", ink: "#f3ead9", muted: "#b9a9cf", accent: "#ff9c33", accent2: "#c59bff" },
  },
  css: `/* Starship Console: flat blocks of colour on an empty field. A thick column turns through a rounded elbow into a bar, bars are cut into segments, buttons are pills and the lettering is condensed capitals. Nothing glows and nothing moves.
   Dark is the display itself, colour on black; light is the same console by day. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--lc-b) var(--lc-void); }
::selection { background: var(--lc-a); color: var(--lc-on); }
a { text-underline-offset: 3px; }

/* The strip above the banner: a block with a rounded end, then the day and who is here. */
.board-bar { margin-bottom: 8px; border: 0; border-left: 30px solid var(--lc-c); border-radius: 20px 0 0 20px; background: var(--lc-panel); }
.board-date { ${LABEL} font-size: 14px; }
.board-date b { ${LABEL} font-size: 14px; color: var(--lc-ink-a); }
.circ { border-radius: 999px 0 0 999px; border: 0; background: var(--lc-b); color: var(--lc-on); font: 600 14px var(--font-display); letter-spacing: .04em; }
.you b { font: 600 18px var(--font-display); letter-spacing: .06em; text-transform: uppercase; }
.search-box { border-radius: 999px; border: 2px solid var(--lc-b); background: var(--lc-void); }
.search-box:focus-within { border-color: var(--lc-a); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: one frame. The column down the left turns into a bar along the top, and at the bottom into the links, which are the bar's own segments. */
.board-head { min-height: 330px; border: 0; border-radius: var(--lc-round) 0 0 var(--lc-round); isolation: isolate; text-align: right; }
.board-head:not(.has-art) {
  background: var(--lc-void);
  --head-ink: var(--ink); --head-title: var(--lc-ink-a); --head-shadow: none; --head-nav: transparent; --head-line: transparent;
}
.board-head::before { ${COLUMN} }
.board-head::after {
  content: ""; position: absolute; z-index: 0; left: var(--lc-w); right: 0; top: 0; bottom: 0; pointer-events: none;
  ${FORUM_BARS.declare}
  background: ${FORUM_BARS.use};
}
.board-head:not(.has-art)::after {
  ${FORUM_SCAN.declare}
  background: ${FORUM_SCAN.use};
}
.board-head-text { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; padding: calc(var(--lc-bar) + 30px) 40px 30px calc(var(--lc-w) + 60px); }
.board-title { font: 700 66px/1 var(--font-display); letter-spacing: .02em; text-transform: uppercase; }
.board-tagline { display: flex; flex-direction: column; align-items: flex-end; gap: 16px; margin-top: 12px; ${LABEL} font-style: normal; font-size: 19px; letter-spacing: .16em; color: var(--lc-b); text-shadow: none; }
.board-tagline::after { content: ""; width: 260px; height: 9px; border-radius: 0 5px 5px 0; background: ${segments([["a", 24], ["c", 34], ["b", 80], ["d", 100]])}; }
.board-nav { position: relative; z-index: 2; flex-wrap: nowrap; justify-content: flex-end; gap: 5px; height: var(--lc-nav); margin-left: var(--lc-w); border: 0; background: none; }
.board-nav::before { content: ""; flex: 1; min-width: 20px; background: var(--lc-b); }
.board-nav::after { content: ""; flex: none; width: 40px; border-radius: 0 17px 17px 0; background: var(--lc-b); }
.board-nav a { display: flex; align-items: flex-end; justify-content: flex-end; padding: 0 12px 3px 26px; border: 0; background: var(--lc-c); color: var(--lc-on); font: 600 15px/1.2 var(--font-display); letter-spacing: .08em; transition: filter .15s; }
.board-nav a:nth-of-type(4n+2) { background: var(--lc-a); }
.board-nav a:nth-of-type(4n+3) { background: var(--lc-e); }
.board-nav a:nth-of-type(4n) { background: var(--lc-d); }
.board-nav a:hover { color: var(--lc-on); filter: brightness(1.1); }
.board-nav a:focus-visible { outline: 2px solid var(--lc-on); outline-offset: -5px; }
/* With a banner picture: the picture inside the same frame, darker toward the title. */
.board-head.has-art {
  background: var(--lc-scrim), var(--banner) center var(--banner-y, 50%) / cover no-repeat;
  --head-ink: #f3ead9; --head-title: #ffab52; --head-shadow: 0 2px 14px rgba(0, 0, 0, .9); --head-nav: transparent; --head-line: transparent;
}
.board-head.has-art .board-tagline { color: #e3d2ff; text-shadow: 0 1px 8px #000; }

/* Headings: a block, the name, then a bar. The colours take turns. */
${heading(".category-title")}
.category:nth-of-type(3n+2) .category-title { --lc-k: var(--lc-b); }
.category:nth-of-type(3n) .category-title { --lc-k: var(--lc-c); }
.tag { border-radius: 999px; }
.tag:not(.topic-tag) { border-color: var(--lc-line); color: var(--muted); }
.tag { ${LABEL} font-size: 11px; text-shadow: none; }
.tag.new { border-color: var(--lc-a); background: var(--lc-a); color: var(--lc-on); }

/* Boards and topics: a block down the left with rounded ends, the colours taking turns. Under the pointer the block turns to the main colour. */
.category-forums, .topics { gap: 5px; }
${turns(".forum")}
${turns(".topic-row")}
.forum, .topic-row { ${FRAME} transition: border-color .15s, background-color .15s; }
.forum:hover, .topic-row:hover { border-left-color: var(--lc-a); background: color-mix(in srgb, var(--lc-a) 6%, var(--lc-panel)); }
.topic-row.pinned { border-left: 18px solid var(--lc-a); }
.forum-name { font: 600 23px/1.15 var(--font-display); letter-spacing: .05em; text-transform: uppercase; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum:hover .forum-name a, .topic-row:hover .topic-title a, .forum-name a:hover, .topic-title a:hover { color: var(--lc-ink-a); }
.forum-desc { font: 400 14.5px/1.45 var(--font-reading); font-style: normal; }
.forum-place { ${LABEL} font-size: 12px; }
.forum-place a { color: var(--lc-b); }
.forum-counts b { font: 600 21px var(--font-display); letter-spacing: .04em; color: var(--lc-k, var(--lc-ink-a)); }
.last-label { ${LABEL} font-size: 11.5px; color: var(--lc-ink-a); }
.forum-last a, .foot-list a { color: var(--ink); font: 500 17px/1.25 var(--font-display); letter-spacing: .04em; text-transform: uppercase; }
.forum-last a:hover, .foot-list a:hover { color: var(--lc-ink-a); }
.topic-title { font: 600 20px/1.2 var(--font-display); letter-spacing: .05em; text-transform: uppercase; }
.topic-main small { font-style: normal; }
.topic-count b { font: 600 20px var(--font-display); letter-spacing: .04em; color: var(--lc-k, var(--lc-ink-a)); }
.unread-dot { width: 16px; height: 8px; border-radius: 4px; background: var(--lc-a); box-shadow: none; }
/* Small portraits: a block with one rounded end. */
.portrait.small, .portrait.tiny { border-radius: 999px 0 0 999px; border: 0; background: var(--lc-b); color: var(--lc-on); font-family: var(--font-display); font-weight: 600; box-shadow: none; }
/* A location with no picture gets its own small sensor display. */
.forum-art { border-right: 0; }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${ELBOW} overflow: hidden; }
.location-art { border-right: 0; }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${LABEL} font-size: 13px; color: var(--lc-b); }
.location-name { font-weight: 700; font-size: 38px; letter-spacing: .03em; text-transform: uppercase; color: var(--lc-ink-a); }
.location-summary { font: 400 16px/1.55 var(--font-reading); font-style: normal; }

/* Topic pages. */
.crumbs { ${LABEL} font-size: 13px; }
.crumbs a { color: var(--lc-b); }
.topic-head { --lc-k: var(--lc-a); ${ELBOW} border-top-width: 10px; border-left-width: 18px; border-radius: 32px 0 0 0; }
.topic-name { font: 700 38px/1.08 var(--font-display); letter-spacing: .03em; text-transform: uppercase; color: var(--lc-ink-a); }
.cast-chip, .today-chip { border-radius: 999px; border-color: var(--lc-line); }

/* Posts: an elbow each. The name sits on the bar along the top, which turns down the left side through a curve. */
.posts { gap: 22px; }
.post { --lc-k: var(--lc-b); border: 0; border-left: 18px solid var(--lc-k); border-radius: 30px 0 0 24px; background: none; }
.post:nth-child(3n+2) { --lc-k: var(--lc-c); }
.post:nth-child(3n) { --lc-k: var(--lc-e); }
.post.fresh { --lc-k: var(--lc-a); }
.post-band, .post.flip .post-band { align-items: center; margin-left: -18px; padding: 5px 22px 5px 36px; border: 0; border-radius: 30px 17px 17px 0; background: var(--lc-k); }
.post-name { font: 600 21px/1.15 var(--font-display); letter-spacing: .07em; text-transform: uppercase; }
.post-band .post-name, .gm-band .post-name { color: var(--lc-on); }
.post-meta { ${LABEL} font-size: 12.5px; }
.post-band .post-meta, .post-band .post-meta a, .gm-band .post-meta, .gm-band .post-meta a { color: var(--lc-on); }
/* The game master's narration: the same elbow in the main colour, its seal a pill. */
.post.post-gm { --lc-k: var(--lc-a); background: var(--lc-panel); box-shadow: none; }
.gm-band { margin-left: -18px; padding: 8px 22px 8px 36px; border: 0; border-radius: 30px 17px 17px 0; background: var(--lc-k); color: var(--lc-on); }
.gm-band small { font: 500 13px var(--font-display); font-style: normal; letter-spacing: .1em; text-transform: uppercase; color: var(--lc-on); }
.gm-seal { width: 52px; height: 30px; border-radius: 999px; background: var(--lc-on); color: var(--lc-k); font: 600 16px var(--font-display); box-shadow: none; }
.post-band .tag { border-color: var(--lc-on); background: transparent; color: var(--lc-on); }
.post-grid { background: radial-gradient(circle at 100% 100%, transparent 15.5px, var(--lc-k) 16px) left top / 16px 16px no-repeat, var(--lc-panel); }
.mini-portrait { filter: none; }
.portrait.big { border: 0; border-radius: 0 0 34px 0; }
.portrait.big::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 9px; pointer-events: none; background: ${segments([["k, var(--lc-b)", 58], ["a", 74], ["k, var(--lc-b)", 100]])}; }
.portrait.big.portrait-empty { background: var(--raised); }
.portrait.big.portrait-empty span { font: 700 130px var(--font-display); color: color-mix(in srgb, var(--lc-k, var(--lc-b)) 34%, transparent); }
/* The character card that opens over a portrait: a black display in both versions, in its own elbow. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 16px 18px 18px; border: 0; border-top: 10px solid var(--lc-plate-a); border-left: 22px solid var(--lc-plate-a); border-radius: 34px 0 0 0;
  background: var(--lc-plate); color: var(--lc-plate-ink); box-shadow: 0 0 0 3px var(--lc-plate), 0 20px 44px -14px rgba(0, 0, 0, .8);
}
.mini-card > *, .mini-card dd { color: var(--lc-plate-ink); }
.mini-name { font: 700 27px/1.05 var(--font-display); letter-spacing: .04em; text-transform: uppercase; color: var(--lc-plate-a); }
.mini-role { margin: 4px 0 12px; padding-bottom: 12px; border-bottom: 4px solid var(--lc-plate-b); ${LABEL} font-style: normal; font-size: 13px; color: var(--lc-plate-b); }
.mini-quote { font: 400 14.5px/1.45 var(--font-reading); font-style: normal; color: var(--lc-plate-quiet); opacity: 1; }
.mini-traits .chip { border-radius: 999px; }
.mini-fields dt { ${LABEL} font-size: 12px; color: var(--lc-plate-c); }
.mini-fields dd { font: 400 14.5px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 5px 22px; border-radius: 999px; background: var(--lc-plate-a); color: #000 !important; ${LABEL} font-weight: 600; font-size: 13px; text-decoration: none; transition: filter .15s; }
.mini-link:hover { filter: brightness(1.08); }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${LABEL} font-size: 12.5px; line-height: 1.6; }
.mini-player b { color: var(--lc-ink-a); }
.post-text { font: 400 16.5px/1.68 var(--font-reading); }
.post-text blockquote { border-left: 12px solid var(--lc-c); border-radius: 16px 0 0 16px; background: color-mix(in srgb, var(--lc-c) 9%, transparent); }
.post-text pre { border: 2px solid var(--lc-line); border-radius: 14px; background: var(--lc-void); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--lc-ink-a); }
.roll-card { border: 0; border-left: 12px solid var(--lc-c); border-radius: 16px 0 0 16px; }
.roll-group i, .roll-stamp { border-radius: 999px; }
.roll-total { border-radius: 999px; font: 600 17px/26px var(--font-display); }
.post-actions { border-top: 2px solid var(--lc-line); }
.post-actions button { ${LABEL} font-size: 13px; }
.post-actions button:hover { color: var(--lc-ink-a); }

/* Buttons and boxes to type in. */
.f-btn { border: 0; border-radius: 999px; ${LABEL} font-size: 13.5px; }
.f-btn:not(.ghost) { ${PILL} color: var(--lc-on) !important; transition: filter .15s; }
.f-btn:not(.ghost):hover:not(:disabled) { filter: brightness(1.08); }
.f-btn.ghost { background: color-mix(in srgb, var(--lc-b) 24%, transparent); }
.f-btn.ghost:hover:not(:disabled) { background: color-mix(in srgb, var(--lc-b) 36%, transparent); color: var(--ink) !important; }
.f-btn.small { font-size: 12.5px; }
input:not([type="checkbox"]), select, textarea { border-radius: 14px; background: var(--lc-void); caret-color: var(--lc-a); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--lc-a); box-shadow: none; }
.composer { --lc-k: var(--lc-a); ${FRAME} }
.composer-kind, .as-label { ${LABEL} color: var(--lc-ink-a); }
.tools { border-radius: 14px; background: var(--lc-void); }
.tools button { border-radius: 10px; }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { font-weight: 600; font-size: 17px; letter-spacing: .08em; text-transform: uppercase; color: var(--lc-ink-a); }
.foot-staff b { font: 500 17px var(--font-display); letter-spacing: .04em; text-transform: uppercase; }
.foot-stats b { font: 600 19px var(--font-display); letter-spacing: .04em; color: var(--lc-ink-a); }
.to-top { border: 0; border-radius: 999px; background: var(--lc-a); color: var(--lc-on); }

/* Narrower pages: the frame keeps its bars and drops the sensor display, and the links wrap. */
@container page (max-width: 900px) {
  .board-head:not(.has-art)::after { background: ${FORUM_BARS.use}; }
  .board-head-text { padding-left: calc(var(--lc-w) + 30px); }
  .board-nav { flex-wrap: wrap; height: auto; }
  .board-nav::before { display: none; }
  .board-nav::after { flex: 1 0 18px; width: auto; }
  .board-nav a { flex: 1 0 auto; height: 30px; }
}
@container page (max-width: 640px) {
  .board-head { ${SMALL} --lc-r2: 0px; min-height: 250px; }
  .board-head::before { padding-right: 5px; font-size: 9.5px; letter-spacing: .02em; }
  .board-head-text { padding: 30px 16px 22px 60px; }
  .board-title { font-size: 40px; }
  .board-tagline { gap: 12px; font-size: 13px; letter-spacing: .12em; }
  .board-tagline::after { width: 150px; height: 7px; }
  .board-nav::after { border-radius: 0 13px 13px 0; }
  .board-nav a { height: 26px; padding: 0 8px 2px 10px; font-size: 12.5px; }
  .board-bar { border-left-width: 16px; }
  .category-title { font-size: 18px; }
  .forum, .topic-row { border-left-width: 12px; border-radius: 18px 0 0 18px; }
  .forum-name { font-size: 20px; }
  .topic-name { font-size: 28px; }
  .location-name { font-size: 24px; }
  .post { border-left-width: 12px; }
  .post-band, .post.flip .post-band { align-items: flex-start; margin-left: -12px; padding-left: 26px; }
  .post-name { font-size: 19px; }
  .portrait.big.portrait-empty span { font-size: 64px; }
  .mini-card { box-sizing: border-box; border-left-width: 14px; border-radius: 26px 0 0 0; }
}
@media (prefers-reduced-motion: reduce) {
  .forum, .topic-row, .board-nav a, .f-btn, .mini-link { transition: none; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
