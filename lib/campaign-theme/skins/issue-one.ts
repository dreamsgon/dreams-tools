/*
 * Issue One: a fully custom skin, inspired by the four-colour superhero comics of the newsstand years. The banner is
 * a cover: a sunburst behind a city skyline with lit windows, the title in fat yellow letters with a black outline
 * and a block shadow, set a little askew, the tagline in a caption box, and the issue's corner box at the top left.
 * Every panel has a thick ink line and a hard shadow, on newsprint spotted with halftone dots. Headings are
 * slanted caption boxes, yellow, blue and pink in turn. What a character says sits in a speech balloon whose tail
 * points at their portrait, the GM's posts are the narrator's yellow caption boxes, and a new post wears a tilted
 * NEW tag. By night the same issue is printed in midnight blue, with searchlight rays instead of the sunburst;
 * balloons and captions stay white and yellow. Buttons press down when clicked; nothing else moves.
 * Like every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --io-ink: #141414; --io-shadow: #141414; --io-yellow: #ffd60a; --io-red: #d81e2c; --io-blue: #1456c8; --io-sky: #6fd3f7; --io-pink: #ff8f9c;
  --io-dots: rgba(20, 20, 20, .13); --io-hover: #fff8d6; --io-box: var(--io-yellow); --io-heading: #141414; --io-name: #b3121f;
  --io-ray-a: #d81e2c; --io-ray-b: #f04a3e; --io-sun: #ffd60a; --io-city: #141414; --io-window: #ffe45c;
  --io-tint-a: #dff2ff; --io-tint-b: #fff3b8; --io-tint-c: #ffe2e6; --io-blank: #6fd3f7;
  --card-bg: #ffffff; --card-ink: #141414; --card-head: #d81e2c; --card-line: #141414;
}
:root[data-theme="dark"] {
  --io-ink: #000000; --io-shadow: #000000; --io-dots: rgba(255, 255, 255, .07); --io-hover: #2c3170; --io-heading: #ffd60a; --io-name: #ffd60a;
  --io-ray-a: #1b1f5c; --io-ray-b: #262b7a; --io-sun: #ffe45c; --io-city: #05060f; --io-window: #ffd60a;
  --io-tint-a: var(--panel); --io-tint-b: var(--panel); --io-tint-c: var(--panel); --io-blank: #2b3aa0;
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

/** Halftone dots, as on newsprint. */
const DOTS = "radial-gradient(var(--io-dots) 1.3px, transparent 1.8px) 0 0 / 9px 9px";

/* The cover. The skyline stands along the foot, the sun behind it, the rays behind that. */
/** A layer placed in pixels from the middle of the banner, so the buildings keep their places at any width. */
const mid = (image: string, dx: number, bottom: number, w: number, h: number) =>
  `${image} left calc(50% + ${dx + w / 2}px) bottom ${bottom}px / ${w}px ${h}px no-repeat`;
const flat = (c: string) => `linear-gradient(${c}, ${c})`;
/** The skyline: each building is where it starts from the middle, how wide and how tall. Taller ones get two columns of lit windows. */
const BUILDINGS: [number, number, number][] = [
  [-600, 60, 70], [-534, 44, 112], [-484, 70, 56], [-408, 50, 130], [-352, 64, 84], [-282, 40, 152], [-236, 58, 66], [-172, 46, 106], [-120, 62, 48],
  [-52, 50, 34], [4, 54, 44], [64, 48, 76], [118, 60, 52], [184, 44, 120], [234, 66, 78], [306, 42, 148], [354, 60, 60], [420, 52, 114], [478, 70, 50], [554, 46, 134],
];
const WINDOWS = "repeating-linear-gradient(180deg, var(--io-window) 0 6px, transparent 6px 14px)";
const SKYLINE = [
  ...BUILDINGS.filter(([, , h]) => h >= 70).flatMap(([x, w, h]) => [mid(WINDOWS, x + 9, 10, 6, h - 22), mid(WINDOWS, x + w - 15, 10, 6, h - 22)]),
  "linear-gradient(var(--io-city), var(--io-city)) left 0 bottom 0 / 100% 8px no-repeat",
  ...BUILDINGS.map(([x, w, h]) => mid(flat("var(--io-city)"), x, 0, w, h)),
];
const COVER = (name: string) => inParts(name, [
  DOTS, ...SKYLINE,
  "radial-gradient(circle 130px at 50% 100%, var(--io-sun) 0 126px, var(--io-city) 126.5px 130px, transparent 130.5px) center bottom / 264px 132px no-repeat",
  "repeating-conic-gradient(from 0deg at 50% 100%, var(--io-ray-a) 0 9deg, var(--io-ray-b) 9deg 18deg)",
]);

/* Shared pieces of the look. */
/** A panel: a thick ink line and a hard shadow. `--io-fill` is what changes under the pointer. */
const PANEL = "border: 3px solid var(--io-ink); border-radius: 2px; background: var(--io-fill, var(--panel)); box-shadow: 5px 5px 0 var(--io-shadow);";
const PANEL_ON = "--io-fill: var(--io-hover);";
/** Display lettering (Bangers) and small labels (Comic Neue, bold capitals). */
const HEAD = "font-family: var(--font-display); font-weight: 400; letter-spacing: .04em; text-transform: uppercase;";
const SMALL = "font-family: var(--font-sans); font-weight: 700; text-transform: uppercase; letter-spacing: .04em;";
/** Buttons: inked, with a hard shadow; they press down when clicked. The main ones are red, the others paper. */
const BTN = `border: 2px solid var(--io-ink); border-radius: 2px; box-shadow: 3px 3px 0 var(--io-shadow); ${HEAD} letter-spacing: .06em;`;
const RED_BTN = `${BTN} background: var(--io-red); color: #ffffff;`;
const RED_ON = "background: #ef3040; color: #ffffff;";
const PAPER_BTN = `${BTN} background: var(--raised); color: var(--ink);`;
const PAPER_ON = "background: var(--io-yellow); border-color: var(--io-ink); color: #141414;";
const PRESS = "transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--io-shadow);";
/**
 * The title: fat yellow letters. The black outline is drawn first at twice its width and the letter filled over it,
 * so it never shows inside a letter; the block shadow is the same letters stepped down and to the right.
 */
const block = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}px ${i + 1}px 0 #141414`).join(", ");
const TITLE = `display: inline-block; max-width: 100%; overflow-wrap: break-word; ${HEAD} color: #ffd60a; -webkit-text-stroke: 6px #141414; paint-order: stroke fill; text-shadow: ${block(6)};`;
/** A caption box: paper, inked. */
const CAPTION = "display: inline-block; border: 3px solid #141414; background: #fffbe6; color: #141414; box-shadow: 3px 3px 0 #141414;";
/** A heading: a slanted caption box in the colour of its turn. */
const boxed = (h: string, size: number) => `${h} { display: inline-flex; align-items: center; gap: 10px; width: fit-content; max-width: 100%; padding: 5px 16px 4px; border: 3px solid var(--io-ink); background: var(--io-box); color: #141414; ${HEAD} font-size: ${size}px; text-shadow: none; transform: skew(-6deg); box-shadow: 4px 4px 0 var(--io-shadow); }`;
/** Small square portraits: a yellow chip, inked. */
const CHIP = "border-radius: 2px; border: 2px solid var(--io-ink); background: var(--io-yellow); color: #141414; font-family: var(--font-display); font-weight: 400; box-shadow: none;";

/** The cover for the other parts: the sunburst and the skyline behind the host's own content. */
function cover(host: string, name: string) {
  const back = COVER(name);
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 3px solid var(--io-ink); border-radius: 2px; box-shadow: 5px 5px 0 var(--io-shadow);
  ${back.declare}
  background: ${back.use};
}
${host} > * { position: relative; z-index: 2; }`;
}

/* The Encyclopedia: inked panels, with the cover over the overview. */
const ENCYCLOPEDIA = `/* Issue One for the Encyclopedia. The colours and fonts come from the theme. */
${VARS}
body { scrollbar-color: var(--io-ink) var(--panel); }
::selection { background: var(--io-yellow); color: #141414; }

/* The side. */
.sidebar { border-right: 3px solid var(--io-ink); }
.csw-name b { ${HEAD} font-size: 19px; }
.tree-row { border-radius: 2px; }
.tree-row:hover { background: var(--io-hover); }
.tree-row.selected { box-shadow: inset 4px 0 0 var(--accent); }
.side-heading .section-toggle { ${SMALL} font-size: 12px; color: var(--muted); }
.shared-tag { border-radius: 0; border: 2px solid var(--io-ink); ${SMALL} font-size: 10px; }

/* The bar along the top. */
.topbar { border-bottom: 3px solid var(--io-ink); }
.search-box { border-radius: 2px; border: 2px solid var(--io-ink); }
.search-box:focus-within { border-color: var(--accent-2); }

/* Buttons and boxes to type in. */
.button { ${PAPER_BTN} font-size: 15px; }
.button:hover { ${PAPER_ON} }
.button.primary { ${RED_BTN} font-size: 15px; }
.button.primary:hover { ${RED_ON} }
.button:active { ${PRESS} }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 2px; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: none; }

/* The campaign's overview: the cover. */
${cover(".dashboard-intro", "io-enc")}
.dashboard-intro { min-height: 290px; align-items: flex-start; margin-bottom: 30px; padding: 30px 32px 150px; }
.dashboard-intro .eyebrow { display: inline-block; padding: 3px 10px; background: #141414; color: #ffffff; ${SMALL} font-size: 12px; }
.dashboard-intro h1 { margin: 12px 0 14px; font-size: 56px; line-height: 1.05; transform: rotate(-2deg); transform-origin: left center; ${TITLE} display: block; width: fit-content; }
.dashboard-intro .subtitle { ${CAPTION} max-width: 40ch; padding: 6px 14px; font: 700 15px/1.4 var(--font-sans); text-transform: uppercase; }
.dashboard-intro > div { min-width: 0; }
/* The Maps page keeps its short top: no label or caption there. */
.maps-directory .dashboard-intro .eyebrow, .maps-directory .dashboard-intro .subtitle { display: none; }
.dashboard-intro .icon-button { border: 2px solid #141414; border-radius: 2px; background: #ffffff; color: #141414; box-shadow: 3px 3px 0 #141414; }
.overview-strip { border-color: var(--io-ink); }
.overview-strip strong { ${HEAD} font-size: 24px; color: var(--accent); }

/* Headings: slanted caption boxes. */
.section-heading { align-items: center; }
${boxed(".section-heading h2", 22)}
.eyebrow { ${SMALL} font-size: 11.5px; }

/* Cards: inked panels. */
.note-card { ${PANEL} --io-fill: var(--raised); padding: 20px 20px 18px; transition: none; }
.note-card:hover { ${PANEL_ON} transform: none; box-shadow: 5px 5px 0 var(--io-shadow); }
.note-card h3 { ${HEAD} font-size: 25px; line-height: 1.1; }
.note-card:hover h3 { color: var(--accent); }
.note-card.add-card { border: 3px dashed var(--io-ink); background: transparent; box-shadow: none; }

/* A page. */
.kind-pill { padding: 2px 9px; border-radius: 0; border: 2px solid var(--io-ink); background: var(--io-yellow); color: #141414; ${SMALL} font-size: 11px; }
.article-title h1 { ${HEAD} color: var(--io-heading); }
.article-tabs { border-bottom: 3px solid var(--io-ink); }
.article-tabs button { ${HEAD} font-size: 16px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); box-shadow: inset 0 -3px 0 var(--accent); }
.picture-panel { border-radius: 2px; border: 3px solid var(--io-ink); }
.prose { font-family: var(--font-reading); font-size: 18px; }
.prose h1, .prose h2, .prose h3 { ${HEAD} color: var(--io-heading); }
.prose blockquote { border: 2px solid var(--io-ink); border-radius: 14px; background: var(--raised); font-style: normal; }
.article-aside .eyebrow { color: var(--accent); }

@media (max-width: 640px) {
  .dashboard-intro { min-height: 0; padding: 22px 18px 140px; }
  .dashboard-intro h1 { font-size: 38px; -webkit-text-stroke-width: 4px; text-shadow: ${block(4)}; }
  .dashboard-intro .subtitle { font-size: 13px; }
  .section-heading h2 { font-size: 18px; }
}
`;

/* Maptable: inked panels round the table, and the cover over the Scene Picker. */
const MAPTABLE = `/* Issue One for Maptable. The map you play on keeps its own colours. */
${VARS}
body { scrollbar-color: var(--io-ink) var(--panel); }
::selection { background: var(--io-yellow); color: #141414; }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 3px solid var(--io-ink); }
.header-scene strong { ${HEAD} font-size: 18px; color: var(--accent); }
.csw-name b { ${HEAD} font-size: 18px; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${RED_BTN} font-size: 15px; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { ${RED_ON} }
.primary.primary.primary:active { ${PRESS} }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 2px; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: none; }
input[type="range"] { accent-color: var(--io-red); }

/* The tool rail and the side panel. */
.rail { border-right: 3px solid var(--io-ink); }
.rail button { border-radius: 2px; }
.rail button:hover { color: var(--accent); }
.rail button.active { background: var(--io-yellow); color: #141414; }
.side-panel { border-right: 3px solid var(--io-ink); }
.panel-title { border-bottom: 3px solid var(--io-ink); }
.panel-title h2 { ${HEAD} font-size: 22px; color: var(--io-heading); }
.organizer-scene { border-radius: 2px; white-space: normal; }
.organizer-scene:hover { background: var(--io-hover); }
.organizer-scene.active { background: var(--io-yellow); }
.organizer-scene strong { font: 700 15px/1.25 var(--font-sans); }
.organizer-scene.active strong, .organizer-scene.active small { color: #141414; }
@media (max-width: 1000px) {
  .rail { border-right: 0; border-top: 3px solid var(--io-ink); }
  .side-panel { border: 3px solid var(--io-ink); border-bottom: 0; }
}

/* Around the map. */
.map-topbar { border-bottom: 3px solid var(--io-ink); }
.map-title, .board-info { ${SMALL} font-size: 12px; color: var(--muted); }
.toolbar { border-radius: 2px; border: 3px solid var(--io-ink); box-shadow: 4px 4px 0 var(--io-shadow); }
.toolbar button { border-radius: 2px; ${SMALL} font-size: 12px; }
.toolbar button:hover { color: var(--accent); }
.toolbar button.active { background: var(--io-yellow); color: #141414; }

/* The Scene Picker: the cover. */
${cover(".campaign-scenes-head", "io-map")}
.campaign-scenes-head { min-height: 280px; align-items: flex-start; padding: 28px 30px 150px; }
.campaign-scenes-head > div { flex: 1; min-width: 0; }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head small { display: inline-block; padding: 3px 10px; background: #141414; color: #ffffff; ${SMALL} font-size: 12px; }
.campaign-scenes-head h1 { margin-top: 12px; font-size: 52px; line-height: 1.05; transform: rotate(-2deg); transform-origin: left center; ${TITLE} display: block; width: fit-content; }
.dashboard-continue { ${PANEL} padding: 18px 24px; }
.dashboard-continue:hover { ${PANEL} ${PANEL_ON} padding: 18px 24px; }
.dashboard-continue small { ${SMALL} font-size: 12px; color: var(--accent); }
.dashboard-continue strong { ${HEAD} font-size: 28px; }
.campaign-scenes-kinds button { border-radius: 2px; ${SMALL} font-size: 12px; }
.campaign-scenes-group h2 { margin-bottom: 14px; }
${boxed(".campaign-scenes-group h2", 21)}
.campaign-scenes-group h2 span { ${SMALL} font-size: 11px; color: #141414; }
.campaign-scene-card { border: 3px solid var(--io-ink); border-radius: 2px; box-shadow: 4px 4px 0 var(--io-shadow); overflow: hidden; }
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { background: var(--io-hover); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card strong { font: 700 15px/1.25 var(--font-sans); }
.campaign-scene-card.last { box-shadow: 4px 4px 0 var(--io-red); }
.campaign-scene-card em { ${SMALL} font-style: normal; font-size: 11px; color: var(--accent); }

@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 0; flex-wrap: wrap; padding: 20px 18px 140px; }
  .campaign-scenes-head > div { flex: 1 1 100%; }
  .campaign-scenes-head h1 { font-size: 36px; -webkit-text-stroke-width: 4px; text-shadow: ${block(4)}; }
  .dashboard-continue strong { font-size: 23px; overflow-wrap: anywhere; }
  .campaign-scenes-group h2 { font-size: 18px; }
}
`;

/* The campaign's dashboard: the cover behind its name, and inked panels. */
const DASHBOARD = `/* Issue One for the campaign's dashboard. */
${VARS}
body { background: ${DOTS}, var(--bg); }
::selection { background: var(--io-yellow); color: #141414; }
.hub-crumbs { ${SMALL} font-size: 12px; }
.hub-crumbs a { color: var(--accent); }

/* The top: the cover. */
${cover(".hub-head", "io-hub")}
/* Not clipped, so the tag menu can open past the foot of the cover. */
.hub-head { overflow: visible; z-index: 3; }
.hub-head { min-height: 290px; padding: 28px 30px 150px; }
.hub-title p { display: inline-block; padding: 3px 10px; background: #141414; color: #ffffff; ${SMALL} font-size: 12px; }
.hub-title h1 { margin-top: 12px; font-size: 56px; line-height: 1.05; transform: rotate(-2deg); transform-origin: left center; ${TITLE} display: block; width: fit-content; }
.hub-chip { border-radius: 0; border: 2px solid #141414; background: #ffffff; color: #141414; ${SMALL} font-size: 11px; }
.hub-chip.on { border-color: #141414; background: #ffd60a; color: #141414; }
.hub-head .tag-add { border-radius: 0; border: 2px dashed #141414; background: #ffffff; color: #141414; }

/* Buttons. */
.hub-button { ${PAPER_BTN} font-size: 15px; }
.hub-button:not(.hub-button-primary):hover, .hub-button:not(.hub-button-primary):hover:not(:disabled) { ${PAPER_ON} }
.hub-head .hub-button:not(.hub-button-primary) { border-color: #141414; background: #ffffff; color: #141414; box-shadow: 3px 3px 0 #141414; }
.hub-button-primary, a.hub-button-primary { ${RED_BTN} font-size: 15px; }
.hub-head .hub-button-primary { border-color: #141414; box-shadow: 3px 3px 0 #141414; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { ${RED_ON} }
.hub-button:active { ${PRESS} }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 3px solid var(--io-ink); }
.hub-tabs button, .hub-tabs a { ${HEAD} font-size: 17px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }

/* Cards. */
.hub-card { ${PANEL} }
.hub-card-head h2 { flex: 1; ${HEAD} font-size: 24px; color: var(--io-heading); }
.hub-card-head a, .hub-card-head .hub-text-button { ${SMALL} font-size: 12px; }
.hub-scene-grid li { border-radius: 2px; }

@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 20px 18px 140px; }
  .hub-title h1 { font-size: 38px; -webkit-text-stroke-width: 4px; text-shadow: ${block(4)}; }
}
`;

const BANNER = COVER("io-cover");
/** The colours a balloon or a caption keeps in both versions: black ink on paper. */
const ON_PAPER = "--ink: #141414; --muted: #4a4a4a; --accent: #d81e2c; --accent-2: #1456c8; --line: #141414; --line-strong: #141414; --bg: #fff3c4; --panel: #ffffff; --raised: #fff0b3; --accent-soft: #ffe1e3; --danger: #a33a2e;";

export const ISSUE_ONE: Theme = {
  id: "preset-issue-one", name: "Issue One", mode: "both", radius: 2, banner: "picture", fonts: { display: "bangers", reading: "comic", ui: "comic" },
  colors: {
    light: { bg: "#fff3c4", panel: "#ffffff", raised: "#fff0b3", line: "#1a1a1a", ink: "#141414", muted: "#4a4a4a", accent: "#d81e2c", accent2: "#1456c8" },
    dark: { bg: "#10122b", panel: "#1a1d40", raised: "#242859", line: "#7f8ae6", ink: "#fdfbf0", muted: "#b8bce6", accent: "#ffd60a", accent2: "#ff6b7a" },
  },
  css: `/* Issue One: a four-colour superhero comic. The banner is the cover (sunburst, skyline, fat yellow title, a corner box), panels are inked with hard shadows on dotted newsprint,
   what characters say sits in speech balloons, and the GM narrates in yellow caption boxes. Midnight blue by night. Everything a version changes is a variable in the first two rules. */

${VARS}

body { background: ${DOTS}, var(--bg); scrollbar-color: var(--io-ink) var(--panel); }
::selection { background: var(--io-yellow); color: #141414; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border: 3px solid var(--io-ink); border-bottom: 0; border-radius: 2px 2px 0 0; box-shadow: 5px 5px 0 var(--io-shadow); }
.board-date { ${SMALL} font-size: 12px; }
.board-date b { color: var(--accent); }
.circ { ${CHIP} font-size: 15px; }
.you b { ${HEAD} font-size: 21px; color: var(--accent); }
.search-box { border-radius: 2px; border: 2px solid var(--io-ink); }
.search-box:focus-within { border-color: var(--accent-2); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the cover. The title a little askew, the tagline in a caption box, and the issue's corner box. */
.board-head { min-height: 380px; border: 3px solid var(--io-ink); border-radius: 0 0 2px 2px; text-align: center; box-shadow: 5px 5px 0 var(--io-shadow); }
.board-head:not(.has-art) { background: var(--io-ray-a); --head-ink: #141414; --head-title: #ffd60a; --head-shadow: none; --head-nav: transparent; --head-line: transparent; }
.board-head:not(.has-art) .board-head-text {
  ${BANNER.declare}
  background: ${BANNER.use};
}
.board-head::before { content: "No.1"; position: absolute; z-index: 1; top: 14px; left: 14px; padding: 16px 12px 5px; border: 3px solid #141414; background: linear-gradient(#1456c8, #1456c8) left top / 100% 10px no-repeat, #ffffff; color: #141414; font: 400 24px/1 var(--font-display); letter-spacing: .04em; box-shadow: 3px 3px 0 #141414; }
.board-head-text { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 30px 160px; }
.board-title { font: 400 78px/1.02 var(--font-display); letter-spacing: .04em; transform: rotate(-2deg); }
.board-title a { ${TITLE} }
.board-tagline { ${CAPTION} margin-top: 16px; max-width: 46em; padding: 6px 16px; font: 700 16px/1.4 var(--font-sans); font-style: normal; text-transform: uppercase; text-shadow: none; transform: rotate(1deg); }
/* The links: a black strip along the foot of the cover. */
.board-nav { position: relative; z-index: 1; justify-content: center; gap: 6px; padding: 0 16px; border-top: 3px solid #141414; background: #141414; }
.board-nav a { padding: 12px 16px 9px; border-bottom: 3px solid transparent; color: #ffffff; font: 400 18px var(--font-display); letter-spacing: .08em; }
.board-nav a:hover { color: #ffd60a; border-bottom-color: #ffd60a; }
.board-nav a:focus-visible { outline: 2px solid #ffd60a; outline-offset: -4px; }
/* With a banner picture: the picture as the cover's art, the same title and caption over it. */
.board-head.has-art { background: linear-gradient(180deg, rgba(20, 20, 20, .1), rgba(20, 20, 20, .45)), var(--banner) var(--banner-x, 50%) var(--banner-y, 50%) / var(--banner-size, cover) no-repeat; --head-shadow: none; --head-nav: transparent; --head-line: transparent; }
.board-head.has-art .board-head-text { padding: 70px 30px 50px; }

/* Headings: slanted caption boxes, yellow, blue and pink in turn. */
.category:nth-of-type(3n + 2) { --io-box: var(--io-sky); }
.category:nth-of-type(3n) { --io-box: var(--io-pink); }
.category-title { margin-bottom: 14px; }
${boxed(".category-title", 23)}
.tag { border-radius: 0; border: 2px solid var(--io-ink); ${SMALL} font-size: 10.5px; text-shadow: none; }
.tag:where(:not(.topic-tag)) { background: #ffffff; color: #141414; }
.tag.ai-kind.continuity { border-color: var(--io-ink); background: var(--io-yellow); color: #141414; }
.tag.ai-kind.spelling { border-color: var(--io-ink); background: var(--io-sky); color: #141414; }
/* A new post: a tilted yellow tag. */
.tag.new { border-color: #141414; background: var(--io-yellow); color: #141414; transform: rotate(-4deg); }

/* Boards and topics: inked panels. Under the pointer the paper warms. */
.category-forums, .topics { gap: 14px; }
.forum, .topic-row { ${PANEL} }
.topic-row { padding: 14px 20px; }
.forum:hover, .topic-row:hover { ${PANEL_ON} }
.topic-row.pinned { border-left: 3px solid var(--io-ink); background: linear-gradient(var(--io-red), var(--io-red)) left top / 8px 100% no-repeat, var(--io-fill, var(--panel)); padding-left: 26px; }
.topic-row.picked, .topic-row.picked:hover { --io-fill: color-mix(in srgb, var(--accent-2) 14%, var(--panel)); border-color: var(--io-ink); background: var(--io-fill); }
.forum-name { ${HEAD} font-size: 27px; line-height: 1.1; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum-name a:hover, .topic-title a:hover, .forum:hover .forum-name a, .topic-row:hover .topic-title a { color: var(--accent); }
.forum-desc { font: 400 16px/1.45 var(--font-reading); font-style: normal; }
.forum-place { ${SMALL} font-size: 11.5px; }
.forum-place a { color: var(--accent-2); }
.forum-counts b { ${HEAD} font-size: 24px; color: var(--ink); }
.last-label { ${SMALL} font-size: 11px; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 700 15.5px/1.3 var(--font-sans); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { ${HEAD} font-size: 22px; line-height: 1.2; }
.topic-main small { font-style: normal; }
.topic-count b { ${HEAD} font-size: 22px; color: var(--ink); }
/* Unread: a red dot, inked. */
.unread-dot { width: 13px; height: 13px; border-radius: 50%; border: 2px solid var(--io-ink); background: var(--io-red); box-shadow: none; }
.portrait.small, .portrait.tiny { ${CHIP} }
/* A location with no picture gets a blank panel of flat colour and dots. */
.forum-art { border-right: 3px solid var(--io-ink); border-radius: 0; }
.forum-art:not([style]) { background: ${DOTS}, var(--io-blank); }

/* A location's own page. */
.location { ${PANEL} overflow: hidden; }
.location-art { border-right: 3px solid var(--io-ink); }
.location-art.portrait-empty { background: ${DOTS}, var(--io-blank); }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${SMALL} font-size: 12px; color: var(--accent); }
.location-name { ${HEAD} font-size: 42px; line-height: 1.05; color: var(--io-heading); }
.location-summary { font: 400 17px/1.5 var(--font-reading); font-style: normal; }

/* Topic pages. */
.crumbs { ${SMALL} font-size: 12px; }
.crumbs a { color: var(--accent-2); }
.topic-head { ${PANEL} }
.topic-name { ${HEAD} font-size: 40px; line-height: 1.05; color: var(--io-heading); }
.cast-chip, .today-chip { border-radius: 2px; border: 2px solid var(--io-ink); }
.mod-tools { gap: 10px; margin-top: 14px; padding-top: 14px; border-top: 3px solid var(--io-ink); }
.mod-tools .f-btn.small { padding: 5px 12px 4px; }

/* Posts: panels of flat colour and dots, a band along the top with the name, blue and red in turn. */
.posts { gap: 22px; }
.post { ${PANEL} background: ${DOTS}, var(--io-tint, var(--panel)); }
.post:nth-of-type(3n + 1) { --io-tint: var(--io-tint-a); }
.post:nth-of-type(3n + 2) { --io-tint: var(--io-tint-b); }
.post:nth-of-type(3n) { --io-tint: var(--io-tint-c); }
.post.fresh { border-color: var(--io-ink); box-shadow: 5px 5px 0 var(--io-red); }
.post-band { padding: 10px 20px 8px; border-bottom: 3px solid var(--io-ink); background: var(--io-blue); }
.post.flip .post-band { background: var(--io-red); }
.post-name { ${HEAD} font-size: 28px; line-height: 1.05; color: #ffffff; text-shadow: 2px 2px 0 #141414; }
.post-band .post-meta, .post-band .post-meta a { color: #ffffff; ${SMALL} font-size: 12px; }
/* What a character says: a speech balloon, black on white in both versions, its tail pointing at the portrait. */
.post-grid .post-text {
  position: relative; padding: 16px 20px 6px; border: 3px solid #141414; border-radius: 24px; background: #ffffff; color: #141414; font: 400 17.5px/1.55 var(--font-reading);
  ${ON_PAPER}
}
.post-grid .post-text::before { content: ""; position: absolute; top: 26px; left: -24px; width: 24px; height: 22px; background: #141414; clip-path: polygon(100% 0, 0 34%, 100% 100%); }
.post-grid .post-text::after { content: ""; position: absolute; top: 30px; left: -15px; width: 17px; height: 14px; background: #ffffff; clip-path: polygon(100% 0, 0 34%, 100% 100%); }
.post.flip .post-grid .post-text::before { left: auto; right: -24px; clip-path: polygon(0 0, 100% 34%, 0 100%); }
.post.flip .post-grid .post-text::after { left: auto; right: -15px; clip-path: polygon(0 0, 100% 34%, 0 100%); }
.post-text blockquote { border-left: 4px solid var(--accent-2); font-style: normal; }
.post-text pre { border: 2px solid #141414; border-radius: 0; }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { ${HEAD} color: var(--accent); }
/* The GM's posts: the narrator's caption box, black on yellow in both versions. */
.post.post-gm, .post.post-gm.fresh { ${ON_PAPER} --io-heading: #141414; --io-tint: #ffe45c; --io-dots: rgba(20, 20, 20, .13); --io-name: #b3121f; --accent: #b3121f; border-color: #141414; color: #141414; }
.gm-band { border-bottom: 3px solid #141414; background: none; }
.post.post-gm .post-name { color: #141414; text-shadow: none; }
.post.post-gm .post-meta, .post.post-gm .post-meta a { color: #141414; ${SMALL} font-size: 12px; }
.gm-seal { border-radius: 50%; border: 2px solid #141414; background: var(--io-red); color: #ffffff; box-shadow: 2px 2px 0 #141414; font: 400 17px var(--font-display); }
.gm-body .post-text { font: 700 17.5px/1.55 var(--font-reading); }
.gm-body .post-text > p:first-child::first-letter { margin: 3px 13px 0 0; font: 400 54px/1 var(--font-display); color: #d81e2c; text-shadow: 2px 2px 0 #141414; }
/* A big portrait: an inked panel. */
.portrait.big { box-sizing: border-box; border: 3px solid var(--io-ink); border-radius: 2px; box-shadow: 4px 4px 0 var(--io-shadow); }
.portrait.big.portrait-empty { background: ${DOTS}, var(--io-blank); }
.portrait.big.portrait-empty span { ${HEAD} font-size: 120px; color: #ffffff; -webkit-text-stroke: 6px #141414; paint-order: stroke fill; text-shadow: ${block(4)}; }
/* The character card that opens over a portrait: a hero's file card, white in both versions. A red name, the role
   on a black label, and what they say in a small balloon. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 18px 16px 16px; border: 3px solid #141414; border-radius: 2px;
  background: radial-gradient(rgba(20, 20, 20, .1) 1.3px, transparent 1.8px) 0 0 / 9px 9px, #ffffff; color: #141414; box-shadow: 5px 5px 0 #141414;
}
.mini-card > *, .mini-card dd { color: #141414; }
.mini-card :focus-visible { outline: 2px solid #1456c8; outline-offset: 2px; }
.mini-name { font: 400 30px/1.05 var(--font-display); letter-spacing: .04em; color: #d81e2c; text-shadow: 1px 1px 0 #141414; overflow-wrap: anywhere; }
.mini-role { align-self: flex-start; margin: 8px 0 12px; padding: 2px 9px; background: #141414; color: #ffffff; ${SMALL} font-style: normal; font-size: 11.5px; }
.mini-quote { padding: 8px 12px; border: 2px solid #141414; border-radius: 14px; background: #ffffff; font: 400 15.5px/1.4 var(--font-reading); font-style: normal; color: #141414; opacity: 1; }
.mini-traits .chip { border-radius: 0; border: 2px solid #141414; background: #ffe45c; color: #141414 !important; }
.mini-fields dt { ${SMALL} font-size: 11px; color: #d81e2c; }
.mini-fields dd { font: 400 15px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 6px 14px 4px; border: 2px solid #141414; border-radius: 2px; background: #d81e2c; color: #ffffff !important; box-shadow: 3px 3px 0 #141414; font: 400 16px var(--font-display); letter-spacing: .06em; text-decoration: none; }
.mini-link:hover { background: #ef3040; }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${SMALL} font-size: 11.5px; line-height: 1.6; }
.mini-player b { color: var(--io-name); }
.roll-card { border-radius: 2px; border: 2px solid #141414; }
.post .post-text .roll-stamp.hit, .post .post-text .roll-stamp.nat { color: #2a6a38; }
.roll-total { border-radius: 50%; border: 2px solid #141414; background: var(--io-yellow); color: #141414; font: 400 17px/24px var(--font-display); }
.post-actions { border-top: 0; }
.post-actions button { ${SMALL} font-size: 12px; }
.post-actions button:hover { color: var(--accent); }

/* Buttons and boxes to type in. */
.f-btn:not(.small) { font-size: 17px; }
.f-btn.small { font-size: 14px; }
.f-btn.ghost { ${PAPER_BTN} color: var(--ink) !important; }
.f-btn.ghost:hover:not(:disabled) { ${PAPER_ON} color: #141414 !important; }
.f-btn:not(.ghost), .tools .tool-pop .f-btn:not(.ghost) { ${RED_BTN} color: #ffffff !important; }
.f-btn:not(.ghost):hover:not(:disabled) { ${RED_ON} }
.f-btn.ghost.on { ${PAPER_ON} color: #141414 !important; }
.f-btn.ghost.danger:hover:not(:disabled) { border-color: var(--io-ink); background: var(--io-red); color: #ffffff !important; }
.f-btn:active:not(:disabled) { ${PRESS} }
input:not([type="checkbox"]), select, textarea { border-radius: 2px; caret-color: var(--accent); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: none; }
.composer { border: 0; border-top: 3px solid var(--io-ink); }
.composer-kind, .as-label { ${SMALL} color: var(--accent); }

/* The foot of the forum. */
.board-foot { ${PANEL} }
.foot-cols h3, .foot-line h3 { ${HEAD} font-size: 22px; color: var(--io-heading); }
.foot-stats b { ${HEAD} font-size: 22px; color: var(--accent); }
.to-top { border-radius: 2px; color: var(--accent); }

@container page (max-width: 900px) {
  .board-title { font-size: 60px; }
}
@container page (max-width: 640px) {
  .board-head { min-height: 0; }
  .board-head::before { top: 10px; left: 10px; padding: 12px 8px 3px; font-size: 17px; background-size: 100% 7px; }
  .board-head-text { padding: 62px 14px 150px; }
  .board-head.has-art .board-head-text { padding: 62px 14px 36px; }
  .board-title { font-size: 44px; }
  .board-title a { -webkit-text-stroke-width: 4px; text-shadow: ${block(4)}; }
  .board-tagline { margin-top: 12px; padding: 5px 10px; font-size: 13px; }
  .board-nav { gap: 0; padding: 0 4px; }
  .board-nav a { padding: 11px 9px 8px; font-size: 16px; letter-spacing: .05em; }
  .category-title { font-size: 19px; padding: 4px 12px 3px; }
  .forum-name { font-size: 23px; }
  .topic-title { font-size: 20px; }
  .topic-name { font-size: 30px; }
  .location-name { font-size: 30px; }
  .post-name { font-size: 23px; }
  .portrait.big.portrait-empty span { font-size: 60px; -webkit-text-stroke-width: 4px; }
  .forum-location > :nth-child(2) { padding-top: 14px; }
  .forum-location > :last-child { padding-bottom: 16px; }
  .location-art { border-right: 0; border-bottom: 3px solid var(--io-ink); }
  .topic-row { padding: 16px 18px 14px; }
  .topic-row.pinned { padding-left: 24px; }
  /* On a phone the portrait sits above the words, so the balloon's tail points up at it. */
  .post-grid .post-text { font-size: 17px; }
  .post-grid .post-text::before, .post.flip .post-grid .post-text::before { top: -22px; left: 28px; right: auto; width: 22px; height: 22px; clip-path: polygon(0 100%, 34% 0, 100% 100%); }
  .post-grid .post-text::after, .post.flip .post-grid .post-text::after { top: -13px; left: 32px; right: auto; width: 14px; height: 15px; clip-path: polygon(0 100%, 34% 0, 100% 100%); }
  .mini-card { box-sizing: border-box; }
  .mini-name { font-size: 24px; }
  .mod-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .mod-tools .f-btn.small { justify-content: center; padding: 9px 6px 7px; }
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
