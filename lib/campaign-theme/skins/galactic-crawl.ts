/*
 * Galactic Crawl: a fully custom skin, inspired by Star Wars. By night it is the opening of the films: black space,
 * a field of stars, the title in hollow yellow letters, the tagline leaning away like the crawl, and a planet's
 * limb rising at the foot of the banner. By day it is the desert planet: two suns setting over the dunes and a
 * small domed homestead. Panels are flat console plates with one corner cut, drawn in hairlines; headings sit
 * behind a small laser sword whose blade is blue, green or red in turn; the main buttons are the crawl's yellow.
 * The GM's posts arrive as holograms, blue and scanned in both versions, big portraits carry the same faint scan
 * lines, and the character card is a datapad. Lettering is Jost throughout, capitals with room between them.
 * The title's letters are filled with the sky's own colour over a doubled outline, so the outline never crosses
 * itself inside a letter. Nothing glows under the pointer and nothing moves.
 * Like every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --gc-page: var(--bg); --gc-line: #b9ab8c; --gc-fill: var(--panel); --gc-heading: #1b1a17; --gc-hot: #a04a00;
  --gc-yellow: #ffd83d; --gc-blue: #2f8fff; --gc-green: #2fb344; --gc-red: #e2382c; --gc-blade: var(--gc-blue);
  --gc-btn: #1b1a17; --gc-btn-ink: #ffd83d; --gc-btn-on: #33302a;
  --gc-title-fill: #f3d6a6; --gc-title-line: #2b190b; --gc-crawl: #2b190b; --gc-nav: #1d140d; --gc-nav-ink: #f3d9a4; --gc-nav-on: #ffffff;
  --gc-scan: rgba(11, 95, 165, .1); --gc-lift: 0px;
  --card-bg: #05080d; --card-ink: #e8eaf0; --card-head: #ffd83d; --card-line: #1f5d8f;
}
:root[data-theme="dark"] {
  --gc-line: #2a3140; --gc-heading: #ffd83d; --gc-hot: #ffd83d;
  --gc-btn: #ffd83d; --gc-btn-ink: #0a0a0a; --gc-btn-on: #ffe672;
  --gc-title-fill: #000000; --gc-title-line: #ffd83d; --gc-crawl: #ffd83d; --gc-nav: #000000; --gc-nav-ink: #4fc3ff; --gc-nav-on: #ffffff;
  --gc-scan: rgba(79, 195, 255, .1); --gc-core: #ffffff;
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

/* The two banners. Both keep their drawing in a band along the foot (`--gc-lift` raises it over the links), under the words. */
/**
 * By night: a field of stars, and a planet's limb with a thin line of lit air along it. A star beside a word reads
 * as a full stop or an apostrophe, so each banner keeps its stars out of the part where its words are: the middle
 * for the forum's banner, the left for the covers of the other parts.
 */
const STARS: [number, number, number, string][] = [
  [3, 9, 1, "#ffffff"], [9, 5, 1.4, "#cfe6ff"], [16, 11, 1, "#ffffff"], [24, 4, 1.5, "#ffffff"], [31, 9, 1, "#ffe9b0"], [38, 5, 1, "#ffffff"],
  [45, 10, 1.4, "#ffffff"], [52, 4, 1, "#cfe6ff"], [59, 8, 1, "#ffffff"], [66, 5, 1.5, "#ffe9b0"], [73, 10, 1, "#ffffff"], [80, 4, 1, "#ffffff"],
  [87, 9, 1.4, "#cfe6ff"], [94, 5, 1, "#ffffff"], [98, 12, 1, "#ffffff"],
  [2, 28, 1, "#ffffff"], [6, 44, 1.5, "#ffffff"], [10, 60, 1, "#cfe6ff"], [4, 70, 1, "#ffffff"], [13, 36, 1, "#ffe9b0"],
  [90, 26, 1, "#ffffff"], [95, 40, 1.4, "#ffffff"], [88, 56, 1, "#ffe9b0"], [97, 64, 1, "#ffffff"], [92, 72, 1.5, "#cfe6ff"],
  [70, 30, 1, "#ffffff"], [76, 46, 1.4, "#ffffff"], [82, 20, 1, "#cfe6ff"], [72, 60, 1, "#ffffff"], [84, 38, 1, "#ffffff"],
  [18, 72, 1, "#ffffff"], [27, 76, 1.4, "#ffffff"], [36, 71, 1, "#cfe6ff"], [47, 75, 1, "#ffffff"], [57, 72, 1.5, "#ffe9b0"], [66, 76, 1, "#ffffff"], [78, 73, 1, "#ffffff"],
];
const SPACE = (name: string, words: "middle" | "left") => inParts(name, [
  "radial-gradient(ellipse 72% 100% at 50% 100%, #08111d 0, #0c1f33 84%, #1b5586 92.5%, #a8dcff 95.5%, transparent 96.5%) left 0 bottom var(--gc-lift) / 100% 76px no-repeat",
  ...STARS.filter(([x, y]) => y < 14 || y > 68 || (words === "middle" ? x < 15 || x > 86 : x > 68))
    .map(([x, y, r, c]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, ${c} 50%, transparent 100%)`),
  "#000000",
]);
/** A layer placed in pixels from the middle of the banner, so the suns and the homestead keep their distance at any width. */
const mid = (image: string, dx: number, bottom: number, w: number, h: number) =>
  `${image} left calc(50% + ${dx + w / 2}px) bottom calc(var(--gc-lift) + ${bottom}px) / ${w}px ${h}px no-repeat`;
const flat = (c: string) => `linear-gradient(${c}, ${c})`;
/** By day: two suns going down over the dunes, a domed homestead and its two thin masts. */
const DESERT = (name: string) => inParts(name, [
  "radial-gradient(ellipse 70% 100% at 46% 100%, #40220f 0 97%, transparent 100%) left 0 bottom var(--gc-lift) / 100% 20px no-repeat",
  mid(flat("#40220f"), -166, 30, 2, 30), mid(flat("#40220f"), -168, 52, 6, 8), mid(flat("#40220f"), -84, 30, 2, 22), mid(flat("#40220f"), -86, 46, 6, 6),
  mid(flat("#3a1e0d"), -134, 28, 7, 9),
  mid("radial-gradient(ellipse 50% 100% at 50% 100%, #e6c59a 0 60%, #c79d70 96%, transparent 100%)", -152, 28, 44, 20),
  "radial-gradient(ellipse 58% 100% at 78% 100%, #6b3f22 0 97%, transparent 100%) left 0 bottom var(--gc-lift) / 100% 40px no-repeat",
  "radial-gradient(ellipse 62% 100% at 24% 100%, #8a5630 0 97%, transparent 100%) left 0 bottom var(--gc-lift) / 100% 52px no-repeat",
  mid("radial-gradient(circle closest-side, #fffaf0 0, #fff0cf 70%, #ffe2a8 96%, transparent 100%)", 52, 46, 46, 46),
  mid("radial-gradient(circle closest-side, rgba(255, 240, 207, .55), transparent)", 12, 6, 126, 126),
  mid("radial-gradient(circle closest-side, #ffd0a6 0, #ff9c6b 72%, #ef7d55 96%, transparent 100%)", 118, 34, 34, 34),
  mid("radial-gradient(circle closest-side, rgba(255, 156, 107, .4), transparent)", 90, 6, 90, 90),
  "linear-gradient(180deg, #b98862 0%, #dba878 38%, #f1c890 72%, #f9dfb0 100%)",
]);

/* Shared pieces of the look. */
/**
 * A console plate: flat, edged in hairlines, with its top right corner cut. The edges are drawn, not a border, so
 * the cut is clean; `--gc-edge` is their colour, which is all that changes under the pointer.
 */
const EDGES = [
  "linear-gradient(to top right, transparent calc(50% - 1.3px), var(--gc-edge) calc(50% - 1.3px) calc(50% - .1px), var(--gc-page) 50%) right top / 16px 16px no-repeat",
  "linear-gradient(var(--gc-edge), var(--gc-edge)) left top / calc(100% - 16px) 1px no-repeat",
  "linear-gradient(var(--gc-edge), var(--gc-edge)) right 0 top 16px / 1px calc(100% - 16px) no-repeat",
  "linear-gradient(var(--gc-edge), var(--gc-edge)) left bottom / 100% 1px no-repeat",
  "linear-gradient(var(--gc-edge), var(--gc-edge)) left top / 1px 100% no-repeat",
].join(", ");
const PLATE = `border: 0; border-radius: 0; --gc-edge: var(--gc-line); background: ${EDGES}, var(--gc-fill); box-shadow: none;`;
const PLATE_ON = "--gc-edge: var(--accent-2);";
/** Lettering: capitals with room between them. `wide` is how much room. */
const caps = (wide = ".14em") => `font-family: var(--font-display); font-weight: 500; text-transform: uppercase; letter-spacing: ${wide};`;
const SMALL = "font-family: var(--font-sans); font-weight: 500; text-transform: uppercase; letter-spacing: .12em;";
/** Buttons: the main ones are the crawl's yellow (dark with yellow letters by day), the others a hairline. Corners cut. */
const CUT = "clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px));";
const MAIN_BTN = `border: 0; border-radius: 0; background: var(--gc-btn); color: var(--gc-btn-ink); box-shadow: none; ${SMALL} ${CUT}`;
const MAIN_ON = "background: var(--gc-btn-on); color: var(--gc-btn-ink);";
/** The cut corners would cut a ring round the button too, so the ring for the keyboard is drawn inside it. */
const RING = "outline: 2px solid var(--gc-btn-ink); outline-offset: -4px;";
const LINE_BTN = `border: 1px solid var(--gc-line); border-radius: 0; background: transparent; color: var(--ink); box-shadow: none; ${SMALL}`;
const LINE_ON = "border-color: var(--accent-2); background: transparent; color: var(--accent-2);";
/** The laser sword before a heading: a short hilt, then the blade, a pale core between two lines of its colour (by day the blade is its colour all through, to show on the sand). */
const SWORD = "linear-gradient(90deg, #6d7480 0 3px, #2b3038 3px 5px, #9aa3b0 5px 12px, #2b3038 12px 14px, #c3cad4 14px 19px, #4a515c 19px 21px, transparent 21px), linear-gradient(180deg, var(--gc-blade) 0, var(--gc-core, var(--gc-blade)) 34% 66%, var(--gc-blade) 100%) 21px 2px / calc(100% - 21px) 4px no-repeat";
const sworded = (h: string) => `${h} { display: flex; align-items: center; gap: 14px; }
${h}::before { content: ""; flex: none; width: 66px; height: 8px; border-radius: 0 3px 3px 0; background: ${SWORD}; box-shadow: none; }
${h}::after { content: ""; flex: 1; min-width: 20px; height: 1px; background: linear-gradient(90deg, var(--gc-line), transparent); }`;
/**
 * The title: hollow letters. The outline is drawn first at twice its width and the letter's own shape is then
 * filled with the sky's colour over it, so where a letter's strokes cross, the outline does not show through.
 */
const TITLE = `display: block; max-width: 100%; overflow-wrap: break-word; font-family: var(--font-display); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--gc-title-fill); -webkit-text-stroke: 4px var(--gc-title-line); paint-order: stroke fill; text-shadow: none;`;
/** Faint scan lines, as over a hologram. */
const SCAN = "repeating-linear-gradient(0deg, var(--gc-scan) 0 1px, transparent 1px 4px)";
/** Small square portraits: console lights. */
const CHIP = "border-radius: 0; border: 1px solid var(--gc-line); background: var(--raised); color: var(--accent-2); font-family: var(--font-sans); font-weight: 500; box-shadow: none;";

/** The cover for the other parts: the same sky behind the host's own content, the words at the left. */
function cover(host: string, name: string) {
  const day = DESERT(`${name}-day`), night = SPACE(`${name}-night`, "left");
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 1px solid var(--gc-line); border-radius: 0; box-shadow: none;
  ${day.declare}
  background: ${day.use};
}
:root[data-theme="dark"] ${host} {
  ${night.declare}
  background: ${night.use};
}
${host} > * { position: relative; z-index: 2; }`;
}

/* The Encyclopedia: console plates, with the sky over the overview. */
const ENCYCLOPEDIA = `/* Galactic Crawl for the Encyclopedia. The colours and fonts come from the theme. */
${VARS}
body { background: var(--bg); scrollbar-color: var(--gc-line) var(--panel); }
::selection { background: var(--gc-yellow); color: #0a0a0a; }

/* The side. */
.sidebar { border-right: 1px solid var(--gc-line); }
.csw-name b { ${caps(".1em")} font-size: 14px; }
.tree-row { border-radius: 0; }
.tree-row:hover { background: transparent; box-shadow: inset 2px 0 0 var(--gc-line); }
.tree-row:has(.active), .tree-item.active { background: transparent; color: var(--accent); box-shadow: inset 2px 0 0 var(--accent-2); }
.side-heading .section-toggle { ${SMALL} font-size: 11.5px; color: var(--muted); }
.shared-tag { border-radius: 0; ${SMALL} font-size: 10px; }

/* The bar along the top. */
.topbar { border-bottom: 1px solid var(--gc-line); }
.search-box { border-radius: 0; border-color: var(--gc-line); }
.search-box:focus-within { border-color: var(--accent-2); }

/* Buttons and boxes to type in. */
.button { ${LINE_BTN} font-size: 12px; }
.button:hover { ${LINE_ON} }
.button.primary { ${MAIN_BTN} font-size: 12px; }
.button.primary:hover { ${MAIN_ON} }
.button.primary:focus-visible { ${RING} }
.icon-button:hover { color: var(--accent-2); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; caret-color: var(--accent-2); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: none; }

/* The campaign's overview: the sky. */
${cover(".dashboard-intro", "gc-enc")}
.dashboard-intro { min-height: 260px; align-items: flex-start; margin-bottom: 26px; padding: 34px 36px 116px; }
.dashboard-intro .eyebrow { ${SMALL} font-size: 12px; color: var(--gc-crawl); }
.dashboard-intro h1 { margin: 10px 0 10px; font-size: 46px; line-height: 1.1; ${TITLE} }
.dashboard-intro .subtitle { max-width: 44ch; font: 500 15px/1.5 var(--font-display); text-transform: uppercase; letter-spacing: .14em; color: var(--gc-crawl); }
.dashboard-intro .icon-button { border: 1px solid var(--gc-crawl); border-radius: 0; background: transparent; color: var(--gc-crawl); }
.overview-strip { border-color: var(--gc-line); }
.overview-strip strong { font: 700 19px var(--font-display); color: var(--gc-hot); }

/* Headings: the laser sword, then a line running out to the right. */
.section-heading h2 { flex: 1; ${caps(".22em")} font-size: 16px; color: var(--gc-heading); }
${sworded(".section-heading h2")}
.eyebrow { ${SMALL} font-size: 11px; }

/* Cards: console plates. */
/* The Encyclopedia's page is the panel colour, so its cards are a step lighter and their cut corners show the page. */
.note-card { ${PLATE} --gc-page: var(--panel); --gc-fill: var(--raised); padding: 20px 20px 18px; transition: none; }
.note-card:hover { ${PLATE_ON} transform: none; box-shadow: none; }
.note-card h3 { ${caps(".1em")} font-size: 17px; line-height: 1.3; }
.note-card:hover h3 { color: var(--accent-2); }
.note-card.add-card { border: 1px dashed var(--gc-line); background: transparent; }

/* A page. */
.kind-pill { padding: 2px 9px; border-radius: 0; border: 1px solid var(--accent-2); background: transparent; color: var(--accent-2); ${SMALL} font-size: 10.5px; }
.article-title h1 { font-family: var(--font-display); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--gc-heading); }
.article-tabs { border-bottom: 1px solid var(--gc-line); }
.article-tabs button { ${SMALL} font-size: 12px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent-2); }
.picture-panel { border-radius: 0; border-color: var(--gc-line); }
.prose { font-family: var(--font-reading); font-size: 18px; }
.prose h1, .prose h2, .prose h3 { ${caps(".12em")} color: var(--gc-heading); }
.prose h2 { padding-bottom: 6px; background: linear-gradient(90deg, var(--accent-2), transparent) left bottom / 100% 1px no-repeat; }
.prose blockquote { border-left: 2px solid var(--accent-2); background: ${SCAN}; }
.article-aside .eyebrow { color: var(--accent-2); }

@media (max-width: 640px) {
  .dashboard-intro { min-height: 0; padding: 24px 20px 110px; }
  .dashboard-intro h1 { font-size: 28px; -webkit-text-stroke-width: 2.5px; }
  .dashboard-intro .subtitle { font-size: 12.5px; letter-spacing: .1em; }
  .section-heading h2 { font-size: 14px; letter-spacing: .14em; gap: 10px; }
  .section-heading h2::before { width: 48px; }
  .section-heading h2::after { display: none; }
}
`;

/* Maptable: console plates round the table, and the sky over the Scene Picker. */
const MAPTABLE = `/* Galactic Crawl for Maptable. The map you play on keeps its own colours. */
${VARS}
body { background: var(--bg); scrollbar-color: var(--gc-line) var(--panel); }
::selection { background: var(--gc-yellow); color: #0a0a0a; }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 1px solid var(--gc-line); }
.header-scene strong { ${caps(".1em")} color: var(--accent); }
.csw-name b { ${caps(".1em")} font-size: 13.5px; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${MAIN_BTN} font-size: 12px; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { ${MAIN_ON} }
.primary.primary.primary:focus-visible { ${RING} }
.icon-button:hover { color: var(--accent-2); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--accent-2); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: none; }
input[type="range"] { accent-color: var(--gc-blue); }

/* The tool rail and the side panel. */
.rail { border-right: 1px solid var(--gc-line); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--accent-2); }
.rail button.active { background: transparent; color: var(--accent); box-shadow: inset 2px 0 0 var(--accent-2); }
.side-panel { border-right: 1px solid var(--gc-line); }
.panel-title { border-bottom: 1px solid var(--gc-line); }
.panel-title h2 { ${caps(".18em")} font-size: 14px; color: var(--gc-heading); }
.organizer-scene { border-radius: 0; white-space: normal; }
.organizer-scene:hover { background: transparent; box-shadow: inset 2px 0 0 var(--gc-line); }
.organizer-scene.active { background: transparent; box-shadow: inset 2px 0 0 var(--accent-2); }
.organizer-scene strong { font: 500 14px/1.3 var(--font-sans); letter-spacing: .04em; }
.organizer-scene.active strong { color: var(--accent); }
@media (max-width: 1000px) {
  .rail { border-right: 0; border-top: 1px solid var(--gc-line); }
  .side-panel { border: 1px solid var(--gc-line); border-bottom: 0; }
}

/* Around the map. */
.map-topbar { border-bottom: 1px solid var(--gc-line); }
.map-title, .board-info { ${SMALL} font-size: 11.5px; color: var(--muted); }
.toolbar { border-radius: 0; border: 1px solid var(--gc-line); box-shadow: none; }
.toolbar button { border-radius: 0; ${SMALL} font-size: 11.5px; }
.toolbar button:hover { color: var(--accent-2); }
.toolbar button.active { background: transparent; color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent-2); }

/* The Scene Picker: the sky. */
${cover(".campaign-scenes-head", "gc-map")}
.campaign-scenes-head { min-height: 250px; align-items: flex-start; padding: 32px 34px 112px; }
.campaign-scenes-head > div { flex: 1; min-width: 0; }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head small { ${SMALL} font-size: 12px; color: var(--gc-crawl); }
.campaign-scenes-head h1 { margin-top: 8px; font-size: 42px; line-height: 1.1; ${TITLE} }
.dashboard-continue { ${PLATE} padding: 18px 24px; }
.dashboard-continue:hover { ${PLATE} ${PLATE_ON} padding: 18px 24px; }
.dashboard-continue small { ${SMALL} font-size: 11.5px; color: var(--accent-2); }
.dashboard-continue strong { ${caps(".1em")} font-size: 19px; }
.campaign-scenes-kinds button { border-radius: 0; ${SMALL} font-size: 11.5px; }
.campaign-scenes-group h2 { ${caps(".22em")} font-size: 15px; color: var(--gc-heading); }
${sworded(".campaign-scenes-group h2")}
.campaign-scenes-group h2 span { ${SMALL} font-size: 11px; }
.campaign-scene-card { border: 1px solid var(--gc-line); border-radius: 0; box-shadow: none; overflow: hidden; }
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { border-color: var(--accent-2); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent-2); }
.campaign-scene-card strong { font: 500 14px/1.3 var(--font-sans); text-transform: uppercase; letter-spacing: .08em; }
.campaign-scene-card em { ${SMALL} font-style: normal; font-size: 10.5px; color: var(--accent-2); }

@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 0; flex-wrap: wrap; padding: 22px 20px 108px; }
  .campaign-scenes-head > div { flex: 1 1 100%; }
  .campaign-scenes-head h1 { font-size: 26px; -webkit-text-stroke-width: 2.5px; }
  .dashboard-continue strong { font-size: 16px; overflow-wrap: anywhere; }
  .campaign-scenes-group h2 { font-size: 13px; letter-spacing: .14em; gap: 10px; }
  .campaign-scenes-group h2::before { width: 48px; }
}
`;

/* The campaign's dashboard: the sky behind its name, and console plates. */
const DASHBOARD = `/* Galactic Crawl for the campaign's dashboard. */
${VARS}
body { background: var(--bg); }
::selection { background: var(--gc-yellow); color: #0a0a0a; }
.hub-crumbs { ${SMALL} font-size: 11.5px; }
.hub-crumbs a { color: var(--accent-2); }

/* The top: the sky. */
${cover(".hub-head", "gc-hub")}
.hub-head { min-height: 260px; padding: 32px 34px 112px; }
.hub-title p { ${SMALL} font-size: 12px; color: var(--gc-crawl); }
.hub-title h1 { margin-top: 8px; font-size: 46px; line-height: 1.1; ${TITLE} }
.hub-chip { border-radius: 0; border: 1px solid var(--gc-crawl); background: transparent; color: var(--gc-crawl); ${SMALL} font-size: 10.5px; }
.hub-head .tag-add { border-radius: 0; border-color: var(--gc-crawl); color: var(--gc-crawl); }

/* Buttons. */
.hub-button { ${LINE_BTN} font-size: 12px; }
.hub-button:not(.hub-button-primary):hover, .hub-button:not(.hub-button-primary):hover:not(:disabled) { ${LINE_ON} }
.hub-head .hub-button:not(.hub-button-primary) { border-color: var(--gc-crawl); color: var(--gc-crawl); }
.hub-head .hub-button:not(.hub-button-primary):hover, .hub-head .hub-button:not(.hub-button-primary):hover:not(:disabled) { border-color: var(--gc-crawl); background: var(--gc-crawl); color: var(--gc-title-fill); }
.hub-button-primary, a.hub-button-primary { ${MAIN_BTN} font-size: 12px; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { ${MAIN_ON} }
.hub-button-primary:focus-visible { ${RING} }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 1px solid var(--gc-line); }
.hub-tabs button, .hub-tabs a { ${SMALL} font-size: 12px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }

/* Cards. */
.hub-card { ${PLATE} }
.hub-card-head h2 { flex: 1; ${caps(".2em")} font-size: 15px; color: var(--gc-heading); }
.hub-card-head a, .hub-card-head .hub-text-button { ${SMALL} font-size: 11px; }
.hub-scene-grid li { border-radius: 0; }

@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 22px 20px 108px; }
  .hub-title h1 { font-size: 28px; -webkit-text-stroke-width: 2.5px; }
}
`;

const DAY = DESERT("gc-day"), NIGHT = SPACE("gc-night", "middle");

export const GALACTIC_CRAWL: Theme = {
  id: "preset-crawl", name: "Galactic Crawl", mode: "both", radius: 0, banner: "picture", fonts: { display: "jost", reading: "jost", ui: "jost" },
  colors: {
    light: { bg: "#e9dfc9", panel: "#f8f3e7", raised: "#efe7d5", line: "#cdc2a8", ink: "#1b1a17", muted: "#5c5648", accent: "#a04a00", accent2: "#0b5fa5" },
    dark: { bg: "#000000", panel: "#0a0c10", raised: "#12151b", line: "#262b36", ink: "#e8eaf0", muted: "#98a0b0", accent: "#ffd83d", accent2: "#4fc3ff" },
  },
  css: `/* Galactic Crawl: by night the opening of the films (stars, a hollow yellow title, a tagline leaning away, a planet's limb), by day two suns setting over the dunes.
   Console plates with a cut corner, a laser sword before each heading, holograms for the GM. Everything a version changes is a variable in the first two rules. */

${VARS}

body { background: var(--bg); scrollbar-color: var(--gc-line) var(--panel); }
::selection { background: var(--gc-yellow); color: #0a0a0a; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border: 1px solid var(--gc-line); border-bottom: 0; border-radius: 0; }
.board-date { ${SMALL} font-size: 11.5px; }
.board-date b { color: var(--accent); }
.circ { ${CHIP} font-size: 12px; }
.you b { ${caps(".1em")} font-size: 14px; color: var(--gc-hot); }
.search-box { border-radius: 0; border-color: var(--gc-line); }
.search-box:focus-within { border-color: var(--accent-2); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the words in the middle, the drawing in a band along the foot, over the links. */
.board-head { min-height: 340px; border: 1px solid var(--gc-line); border-radius: 0; text-align: center; box-shadow: none; --gc-lift: 43px; }
.board-head:not(.has-art) {
  ${DAY.declare}
  background: ${DAY.use};
  --head-ink: var(--gc-crawl); --head-title: var(--gc-title-fill); --head-shadow: none; --head-nav: transparent; --head-line: transparent;
}
:root[data-theme="dark"] .board-head:not(.has-art) {
  ${NIGHT.declare}
  background: ${NIGHT.use};
}
.board-head-text { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 46px 40px 126px; }
.board-title { font: 700 64px/1.08 var(--font-display); letter-spacing: .06em; }
.board-title a { ${TITLE} }
/* The tagline leans away, like the crawl. */
.board-tagline { margin-top: 16px; max-width: 52em; font: 500 16px/1.5 var(--font-display); font-style: normal; text-transform: uppercase; letter-spacing: .2em; color: var(--gc-crawl); text-shadow: none; transform: perspective(260px) rotateX(22deg); transform-origin: 50% 100%; }
/* The links: a dark strip under the sky. */
.board-nav { position: relative; z-index: 1; justify-content: center; gap: 8px; padding: 0 20px; border-top: 1px solid var(--gc-line); background: var(--gc-nav); }
.board-nav a { padding: 13px 16px 11px; border-bottom: 2px solid transparent; color: var(--gc-nav-ink); font: 500 12.5px var(--font-display); letter-spacing: .26em; }
.board-nav a:hover { color: var(--gc-nav-on); border-bottom-color: var(--gc-yellow); }
.board-nav a:focus-visible { outline: 2px solid var(--gc-yellow); outline-offset: -4px; }
/* With a banner picture: the picture under a dark wash, the title in solid yellow over it (hollow letters need a plain sky behind them). */
.board-head.has-art { background: linear-gradient(180deg, rgba(0, 0, 0, .45), rgba(0, 0, 0, .7)), var(--banner) var(--banner-x, 50%) var(--banner-y, 50%) / var(--banner-size, cover) no-repeat; --head-shadow: none; --head-nav: transparent; --head-line: transparent; }
.board-head.has-art .board-head-text { padding: 56px 40px; }
.board-head.has-art .board-title a { color: #ffd83d; -webkit-text-stroke: 0; }
.board-head.has-art .board-tagline { color: #ffd83d; }

/* Headings: the laser sword, blue, green and red in turn, then a line running out to the right. */
.category:nth-of-type(3n + 2) { --gc-blade: var(--gc-green); }
.category:nth-of-type(3n) { --gc-blade: var(--gc-red); }
.category-title { ${caps(".26em")} font-size: 16px; color: var(--gc-heading); text-shadow: none; }
${sworded(".category-title")}
.category-title::after { order: 9; }
.tag { border-radius: 0; ${SMALL} font-size: 10px; text-shadow: none; }
.tag:where(:not(.topic-tag)) { border-color: var(--gc-line); color: var(--muted); }
.tag.new { border-color: var(--gc-yellow); background: var(--gc-yellow); color: #0a0a0a; }

/* Boards and topics: console plates. Under the pointer only the hairline changes colour. */
.category-forums, .topics { gap: 10px; }
.forum, .topic-row { ${PLATE} }
.topic-row { padding: 14px 20px; }
.forum:hover, .topic-row:hover { ${PLATE_ON} }
.topic-row.pinned { border-left: 0; background: linear-gradient(var(--gc-hot), var(--gc-hot)) left top / 3px 100% no-repeat, ${EDGES}, var(--gc-fill); }
.topic-row.picked { --gc-edge: var(--accent-2); --gc-fill: color-mix(in srgb, var(--accent-2) 10%, var(--panel)); }
.forum-name { ${caps(".14em")} font-size: 17px; line-height: 1.3; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum-name a:hover, .topic-title a:hover, .forum:hover .forum-name a, .topic-row:hover .topic-title a { color: var(--accent-2); }
.forum-desc { font: 400 16px/1.5 var(--font-reading); font-style: normal; }
.forum-place { ${SMALL} font-size: 11px; }
.forum-place a { color: var(--accent-2); }
.forum-counts b { font: 700 17px var(--font-display); color: var(--ink); }
.last-label { ${SMALL} font-size: 10.5px; color: var(--accent-2); }
.forum-last a, .foot-list a { color: var(--ink); font: 500 15px/1.35 var(--font-sans); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent-2); }
.topic-title { ${caps(".1em")} font-size: 15.5px; line-height: 1.35; }
.topic-main small { font-style: normal; }
.topic-count b { font: 700 16px var(--font-display); color: var(--ink); }
/* Unread: a small light on the console. */
.unread-dot { width: 8px; height: 8px; border-radius: 0; background: var(--accent-2); box-shadow: none; }
.portrait.small, .portrait.tiny { ${CHIP} }
/* A location with no picture gets a scanned blank. */
.forum-art { border-right: 1px solid var(--gc-line); border-radius: 0; }
.forum-art:not([style]) { background: ${SCAN}, var(--raised); }

/* A location's own page. */
.location { ${PLATE} overflow: hidden; }
.location-art { border-right: 1px solid var(--gc-line); }
.location-art.portrait-empty { background: ${SCAN}, var(--raised); }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${SMALL} font-size: 11.5px; color: var(--accent-2); }
.location-name { font: 700 30px/1.15 var(--font-display); text-transform: uppercase; letter-spacing: .08em; color: var(--gc-heading); }
.location-summary { font: 400 17px/1.55 var(--font-reading); font-style: normal; }

/* Topic pages. */
.crumbs { ${SMALL} font-size: 11.5px; }
.crumbs a { color: var(--accent-2); }
.topic-head { ${PLATE} }
.topic-name { font: 700 30px/1.15 var(--font-display); text-transform: uppercase; letter-spacing: .08em; color: var(--gc-heading); }
.cast-chip, .today-chip { border-radius: 0; border-color: var(--gc-line); }
.mod-tools { gap: 8px; margin-top: 14px; padding-top: 14px; border-top-color: var(--gc-line); }
.mod-tools .f-btn.small { padding: 6px 12px; }

/* Posts: console plates with a line of the second accent down the left. */
.posts { gap: 20px; }
.post { ${PLATE} background: linear-gradient(var(--accent-2), var(--accent-2)) left top / 2px 100% no-repeat, ${EDGES}, var(--gc-fill); }
.post.fresh { --gc-edge: var(--accent-2); }
.post-band, .post.flip .post-band { padding: 14px 24px 12px; border-bottom: 1px solid var(--gc-line); background: none; }
.post-name { ${caps(".16em")} font-size: 17px; line-height: 1.2; color: var(--gc-heading); }
.post-meta { ${SMALL} font-size: 11px; }
.post-meta a { color: var(--muted); }
/* The GM's posts arrive as holograms: blue, scanned, in both versions. */
.post.post-gm {
  --ink: #d8f1ff; --muted: #8fb8d0; --accent: #7fd6ff; --accent-2: #ffd83d; --line: #1f4a66; --bg: #030a10; --panel: #06121c; --raised: #0a1b29; --gc-heading: #7fd6ff; --gc-line: #1f4a66; --gc-edge: #2f8fff; --line-strong: #2a6a96;
  --gc-fill: repeating-linear-gradient(0deg, rgba(79, 195, 255, .08) 0 1px, transparent 1px 4px), linear-gradient(180deg, #071726, #04101b);
  color: #d8f1ff; background: linear-gradient(#2f8fff, #2f8fff) left top / 2px 100% no-repeat, ${EDGES}, var(--gc-fill);
}
.gm-band { border-bottom: 1px solid #1f4a66; }
.gm-seal { border-radius: 0; border: 1px solid #7fd6ff; background: transparent; color: #7fd6ff; box-shadow: none; font: 500 13px var(--font-sans); letter-spacing: .08em; }
/* A big portrait: a hairline frame and the hologram's faint scan lines over the picture. */
.portrait.big { border: 1px solid var(--gc-line); border-radius: 0; box-shadow: none; }
.post .portrait.big::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: ${SCAN}; }
.portrait.big.portrait-empty { background: var(--raised); }
.portrait.big.portrait-empty span { font: 700 96px var(--font-display); color: transparent; -webkit-text-stroke: 2px var(--accent-2); }
/* The character card that opens over a portrait: a datapad, dark in both versions. Yellow name, blue labels, and
   what they say behind a blue line. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 20px 18px 16px; border: 1px solid #1f5d8f; border-radius: 0;
  background: repeating-linear-gradient(0deg, rgba(79, 195, 255, .06) 0 1px, transparent 1px 4px), #05080d; color: #e8eaf0; box-shadow: 0 12px 24px -12px rgba(0, 0, 0, .7);
}
.mini-card > *, .mini-card dd { color: #e8eaf0; }
.mini-card :focus-visible { outline: 2px solid #ffd83d; outline-offset: 2px; }
.mini-name { font: 700 19px/1.25 var(--font-display); text-transform: uppercase; letter-spacing: .14em; color: #ffd83d; overflow-wrap: anywhere; }
.mini-role { margin: 6px 0 10px; padding-bottom: 8px; border-bottom: 1px solid #1f5d8f; ${SMALL} font-style: normal; font-size: 11px; color: #4fc3ff; }
.mini-quote { padding-left: 12px; border-left: 2px solid #4fc3ff; font: 400 15.5px/1.5 var(--font-reading); font-style: normal; color: #e8eaf0; opacity: 1; }
.mini-traits .chip { border-radius: 0; border-color: #1f5d8f; color: #e8eaf0 !important; }
.mini-fields dt { ${SMALL} font-size: 10.5px; color: #4fc3ff; }
.mini-fields dd { font: 400 15px/1.45 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 8px 16px; border: 0; border-radius: 0; background: #ffd83d; color: #0a0a0a !important; ${SMALL} font-size: 11.5px; text-decoration: none; ${CUT} }
.mini-link:hover { background: #ffe672; }
.mini-card > .mini-link:focus-visible { outline: 2px solid #0a0a0a; outline-offset: -4px; }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${SMALL} font-size: 11px; line-height: 1.7; }
.mini-player b { color: var(--accent); }
.post-text { font: 400 17.5px/1.65 var(--font-reading); }
.post-text blockquote { border-left: 2px solid var(--accent-2); background: ${SCAN}; }
.post-text pre { border: 1px solid var(--gc-line); border-radius: 0; }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { ${caps(".12em")} color: var(--gc-heading); }
.roll-card { border-radius: 0; border: 1px solid var(--gc-line); border-left: 3px solid var(--gc-yellow); }
.roll-total { border-radius: 0; border: 0; background: var(--gc-yellow); color: #0a0a0a; font: 700 14px/26px var(--font-display); }
.post-actions { border-top: 1px solid var(--gc-line); }
.post-actions button { ${SMALL} font-size: 11px; }
.post-actions button:hover { color: var(--accent-2); }

/* Buttons and boxes to type in. */
.f-btn:not(.small) { font-size: 12px; }
.f-btn.small { font-size: 10.5px; }
.f-btn.ghost { ${LINE_BTN} color: var(--ink) !important; }
.f-btn.ghost:hover:not(:disabled) { ${LINE_ON} color: var(--accent-2) !important; }
.f-btn:not(.ghost), .tools .tool-pop .f-btn:not(.ghost) { ${MAIN_BTN} color: var(--gc-btn-ink) !important; }
.f-btn:not(.ghost):hover:not(:disabled) { ${MAIN_ON} }
.f-btn:not(.ghost):focus-visible { ${RING} }
input:not([type="checkbox"]), select, textarea { border-radius: 0; caret-color: var(--accent-2); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: none; }
.composer { border: 0; border-top: 1px solid var(--gc-line); }
.composer-kind, .as-label { ${SMALL} color: var(--accent-2); }

/* The foot of the forum. */
.board-foot { ${PLATE} }
.foot-cols h3, .foot-line h3 { ${caps(".2em")} font-size: 13.5px; color: var(--gc-heading); }
.foot-stats b { font: 700 16px var(--font-display); color: var(--gc-hot); }
.to-top { border-radius: 0; color: var(--accent-2); }

@container page (max-width: 900px) {
  .board-title { font-size: 48px; }
}
@container page (max-width: 640px) {
  .board-head { min-height: 0; }
  .board-head-text { padding: 30px 16px 112px; }
  .board-head.has-art .board-head-text { padding: 40px 16px; }
  .board-title { font-size: 30px; letter-spacing: .04em; }
  .board-title a { -webkit-text-stroke-width: 2.5px; }
  .board-head.has-art .board-title a { -webkit-text-stroke-width: 0; }
  /* On a phone the tagline lies flat, so it stays easy to read when it wraps. */
  .board-tagline { margin-top: 12px; font-size: 12.5px; letter-spacing: .12em; transform: none; }
  .board-nav { gap: 0; padding: 0 4px; }
  .board-nav a { padding: 12px 8px 10px; font-size: 11px; letter-spacing: .14em; }
  .category-title { font-size: 13.5px; letter-spacing: .14em; gap: 10px; }
  .category-title::before { width: 48px; }
  .forum-name { font-size: 15px; letter-spacing: .08em; }
  .forum-desc { font-size: 15px; }
  .topic-title { font-size: 14.5px; letter-spacing: .06em; }
  .topic-name { font-size: 21px; letter-spacing: .05em; }
  .location-name { font-size: 21px; letter-spacing: .05em; }
  .post-name { font-size: 15px; letter-spacing: .1em; }
  .portrait.big.portrait-empty span { font-size: 48px; }
  .forum-location > :nth-child(2) { padding-top: 14px; }
  .forum-location > :last-child { padding-bottom: 16px; }
  .location-art { border-right: 0; border-bottom: 1px solid var(--gc-line); }
  .topic-row { padding: 16px 18px 14px; }
  .mini-card { box-sizing: border-box; }
  .mini-name { font-size: 16px; letter-spacing: .1em; }
  .post-text { font-size: 17px; }
  .mod-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .mod-tools .f-btn.small { justify-content: center; padding: 10px 6px; letter-spacing: .08em; }
  .mod-tools .f-select { grid-column: 1 / -1; justify-content: space-between; }
  .mod-tools .f-select select { flex: 1; }
  .mod-tools .rename-form, .mod-tools .form-error { grid-column: 1 / -1; }
  /* The character card opens across the post, level with the portrait, rather than off its left edge. */
  .post-side { position: relative; }
  .mini-portrait { position: static; }
  .mini-card { inset: 0 0 auto 0; width: 100%; min-height: 212px; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
