/*
 * Champion: a fully custom skin, inspired by the interface of Dragon Age II. Three inks only: black, white and one
 * red, flat and sharp, with nothing that glows or moves. The banner is drawn like the game's woodcut story panels: a
 * flat red sun behind black crags, all gradients (no picture, nothing from the game). Panels are black plates with a
 * hairline and a red corner, headings are heavy capitals after a slanted red bar, names sit on slanted red plates,
 * portraits and buttons are cut on the same slant. Like every skin, its stylesheets go through the safety checks in
 * css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --ch-field: linear-gradient(180deg, #f8f6f3 0%, #e9e6e1 100%);
  --ch-crag: #111111;
  --ch-sun: #b3190f;
  --ch-haze: linear-gradient(0deg, rgba(179, 25, 15, .12), transparent 100%);
  --ch-title: #0c0c0c;
  --ch-title-shadow: none;
  --ch-banner-ink: #111111;
  --ch-banner-quiet: #4a4a4a;
  --ch-nav: rgba(255, 255, 255, .84);
  --ch-hair: rgba(0, 0, 0, .2);
  --ch-rule: #111111;
  --ch-line: #cfcac4;
  --ch-panel: #ffffff;
  --ch-page: linear-gradient(180deg, #ffffff, transparent 380px);
  --ch-shadow: 0 14px 30px -20px rgba(0, 0, 0, .45);
  --ch-red: #b3190f; --ch-red-ink: #ffffff;
  --ch-plate: #0d0d0d; --ch-plate-ink: #f2f2f2; --ch-plate-quiet: #a3a3a3; --ch-plate-line: #333333; --ch-plate-red: #e8493d;
  --card-bg: var(--ch-plate); --card-ink: var(--ch-plate-ink); --card-head: var(--ch-plate-ink); --card-line: var(--ch-plate-line);
}
:root[data-theme="dark"] {
  --ch-field: linear-gradient(180deg, #1c1c1c 0%, #0b0b0b 100%);
  --ch-crag: #000000;
  --ch-sun: #c4241a;
  --ch-haze: linear-gradient(0deg, rgba(196, 36, 26, .2), transparent 100%);
  --ch-title: #ffffff;
  --ch-title-shadow: 0 2px 14px rgba(0, 0, 0, .8);
  --ch-banner-ink: #f2f2f2;
  --ch-banner-quiet: #bdbdbd;
  --ch-nav: rgba(0, 0, 0, .72);
  --ch-hair: rgba(255, 255, 255, .2);
  --ch-rule: #5c5c5c;
  --ch-line: #2e2e2e;
  --ch-panel: #111111;
  --ch-page: linear-gradient(180deg, #171717, transparent 380px);
  --ch-shadow: 0 18px 40px -16px rgba(0, 0, 0, .9);
}`;

const CRAG = "var(--ch-crag)";
/**
 * A shard of rock: a wedge that widens downward from its tip. `apex` is how far along its box the tip sits (0 is the
 * left edge, 1 the right), so a shard can lean.
 */
const shard = (x: number, w: number, h: number, apex: number, repeat = "no-repeat") => {
  const left = Math.atan(apex * w / h) * 180 / Math.PI, right = Math.atan((1 - apex) * w / h) * 180 / Math.PI;
  return `conic-gradient(from ${(180 - right).toFixed(1)}deg at ${(apex * 100).toFixed(0)}% 0, ${CRAG} 0 ${(left + right).toFixed(1)}deg, transparent ${(left + right + 0.5).toFixed(1)}deg) left ${x}px bottom 0 / ${w}px ${h}px ${repeat}`;
};
/** The crags and the sun behind them, in a box 520 by 260: shards in front, the flat red disc half sunk at the back. */
const CRAGS = [
  shard(268, 64, 246, .6), shard(214, 92, 186, .28), shard(322, 112, 204, .72), shard(140, 128, 128, .42), shard(408, 112, 150, .5), shard(40, 170, 84, .55),
  `linear-gradient(${CRAG}, ${CRAG}) left 0 bottom 0 / 100% 12px no-repeat`,
  "radial-gradient(circle closest-side, var(--ch-sun) 98.6%, transparent) left 150px bottom -70px / 280px 280px no-repeat",
].join(", ");
/** Low broken ground along the whole bottom: three sizes of shard, out of step with each other. */
const GROUND = [shard(0, 83, 26, .35, "repeat-x"), shard(20, 131, 38, .62, "repeat-x"), shard(9, 57, 17, .5, "repeat-x"), `linear-gradient(${CRAG}, ${CRAG}) left 0 bottom 0 / 100% 6px no-repeat`, "var(--ch-haze) left 0 bottom 0 / 100% 120px no-repeat"].join(", ");
/** For a location with no picture: three shards and the sun, small. */
const MINI = [
  `conic-gradient(from 166deg at 58% 0, ${CRAG} 0 26deg, transparent 26.5deg) 52% 100% / 30px 78px no-repeat`,
  `conic-gradient(from 150deg at 30% 0, ${CRAG} 0 46deg, transparent 46.5deg) 34% 100% / 44px 54px no-repeat`,
  `conic-gradient(from 148deg at 66% 0, ${CRAG} 0 52deg, transparent 52.5deg) 72% 100% / 50px 46px no-repeat`,
  `linear-gradient(${CRAG}, ${CRAG}) 0 100% / 100% 8px no-repeat`,
  "radial-gradient(circle closest-side, var(--ch-sun) 98%, transparent) 50% calc(100% + 16px) / 84px 84px no-repeat", "var(--ch-field)",
].join(", ");

/** The page behind everything: flat, a little lighter at the top. */
const PAGE = "background: var(--ch-page), var(--bg);";
/** A panel: a flat plate with a hairline round it, a heavier line along the top and a red corner. */
const FRAME = "border: 1px solid var(--ch-line); border-top-color: var(--ch-rule); border-radius: 0; background: linear-gradient(135deg, var(--accent) 0 8px, transparent 8.5px) left top / 20px 20px no-repeat, var(--ch-panel);";
/** A slanted red bar before a heading. */
const MARK = `content: ""; flex: none; display: inline-block; width: 8px; height: 18px; background: var(--accent); transform: skewX(-18deg);`;
/** Small labels: capitals, set wide. */
const LABEL = "font-family: var(--font-display); font-weight: 600; text-transform: uppercase; letter-spacing: .14em;";
/** Buttons that matter: a red plate cut on the slant. Under the keyboard's focus the cut goes so the ring shows. */
const SLANT = "border: 0; border-radius: 0; padding-inline: 20px; background: var(--ch-red); color: var(--ch-red-ink); clip-path: polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%);";
/** A row: a plate with a heavy edge on the left. Under the pointer the edge turns red and nothing else moves. */
const ROW = "border: 0; border-left: 3px solid var(--ch-rule); border-bottom: 1px solid var(--ch-line); border-radius: 0; background: var(--ch-panel); transition: border-color .15s, background-color .15s;";
const ROW_ON = "border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 5%, var(--ch-panel));";
/** The cut a portrait and a small picture share: the bottom right corner taken off on the slant. */
const CUT = "polygon(0 0, 100% 0, 100% 88%, 80% 100%, 0 100%)";
const SMALL_CUT = "polygon(0 0, 100% 0, 100% 68%, 68% 100%, 0 100%)";

/**
 * The woodcut, drawn behind `host`'s own content: a flat field, broken ground along the bottom and, at the right,
 * black crags with the red sun behind them. Nothing in it moves.
 */
function woodcut(host: string) {
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 0; border-top: 3px solid var(--accent); border-radius: 0;
  background: ${GROUND}, var(--ch-field);
  color: var(--ch-banner-ink); outline: 1px solid var(--ch-hair); outline-offset: -9px;
}
${host} > * { position: relative; z-index: 2; }
${host}::before {
  content: ""; position: absolute; z-index: 0; right: 3%; bottom: 0; width: 520px; height: 260px; pointer-events: none;
  background: ${CRAGS};
}`;
}
/** The same banner, smaller, for a phone. */
const smallWoodcut = (host: string) => `${host}::before { right: -40px; scale: .56; transform-origin: bottom right; }`;
const TITLE = "font-family: var(--font-display); font-weight: 800; text-transform: uppercase; letter-spacing: -.01em; color: var(--ch-title); text-shadow: var(--ch-title-shadow);";

/* The Encyclopedia: the campaign's overview gets the woodcut, pages are flat plates in three inks. */
const ENCYCLOPEDIA = `/* Champion for the Encyclopedia. The colours and fonts come from the theme; this adds the woodcut, the plates and the slanted red marks. */
${VARS}
body { ${PAGE} scrollbar-color: var(--ch-rule) var(--panel); }
::selection { background: var(--ch-red); color: #fff; }

/* The shelf down the side. */
.sidebar { border-right: 1px solid var(--ch-line); background: var(--ch-panel); }
.csw-name b { font: 800 16px var(--font-display); letter-spacing: .02em; text-transform: uppercase; }
.campaign-link { border-radius: 0; border-left: 3px solid transparent; }
.campaign-link:hover { color: var(--accent); }
.campaign-link.active { border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); color: var(--ink); }
.side-heading .section-toggle { ${LABEL} font-size: 11.5px; color: var(--muted); }
.shared-tag { border-radius: 0; border: 1px solid var(--ch-line); background: transparent; color: var(--muted); ${LABEL} font-size: 9.5px; }
.tree-row { border-radius: 0; }
.tree-row:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.tree-row:has(.active), .tree-item.active { background: color-mix(in srgb, var(--accent) 9%, transparent); color: var(--ink); box-shadow: inset 3px 0 0 var(--accent); }

/* The bar along the top. */
.topbar { border-bottom: 1px solid var(--ch-rule); background: var(--ch-panel); }
.search-box { border-radius: 0; border-color: var(--ch-line); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); }
.quick-hint kbd { border-radius: 0; border-color: var(--ch-line); }

/* Buttons and boxes to type in. */
.button { border-radius: 0; ${LABEL} font-size: 12px; }
.button.primary { ${SLANT} transition: filter .15s; }
.button.primary:hover { filter: brightness(1.08); }
.button.primary:focus-visible { clip-path: none; }
.button:not(.primary) { border-color: var(--ch-rule); }
.button:not(.primary):hover { border-color: var(--accent); color: var(--accent); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }

/* The campaign's overview: the woodcut. */
${woodcut(".dashboard-intro")}
.dashboard-intro { min-height: 310px; align-items: flex-start; margin-bottom: 26px; padding: 36px 36px 120px; }
.dashboard-intro .eyebrow { ${LABEL} font-size: 12px; color: var(--ch-banner-quiet); }
.dashboard-intro h1 { margin-top: 8px; font-size: 52px; line-height: 1; ${TITLE} }
.dashboard-intro .subtitle { max-width: 38ch; font: 400 17px/1.5 var(--font-reading); color: var(--ch-banner-ink); }
.dashboard-intro .icon-button { border: 1px solid var(--ch-hair); background: var(--ch-nav); color: var(--ch-banner-ink); }
.overview-strip { border-color: var(--ch-line); }
.overview-strip strong { font: 800 19px var(--font-display); color: var(--accent); }

/* Headings: a slanted red bar, the name in heavy capitals, then a hairline. */
.section-heading h2 { flex: 1; display: flex; align-items: center; gap: 12px; font: 800 19px var(--font-display); letter-spacing: .03em; text-transform: uppercase; }
.section-heading h2::before { ${MARK} }
.section-heading h2::after { content: ""; flex: 1; height: 1px; background: var(--ch-rule); }
.eyebrow { ${LABEL} font-size: 11px; }

/* Cards: plates with a red corner. Under the pointer the top line turns red. */
.note-card { ${FRAME} padding: 20px; transition: border-color .15s; }
.note-card:hover { border-top-color: var(--accent); }
.note-card h3 { font: 800 20px/1.15 var(--font-display); letter-spacing: 0; text-transform: none; }
.note-card:hover h3 { color: var(--accent); }
.note-card .eyebrow, .card-footer { color: var(--muted); }
.note-card.add-card { border: 1px dashed var(--ch-rule); background: transparent; }

/* A page. */
.kind-pill { padding: 2px 10px; border-radius: 0; border: 0; background: var(--ch-red); color: var(--ch-red-ink); ${LABEL} font-size: 10.5px; }
.article-title h1 { font-family: var(--font-display); font-weight: 800; letter-spacing: -.01em; text-transform: none; }
.tag-add, .who-button { border-radius: 0; }
.article-tabs { border-bottom: 1px solid var(--ch-rule); }
.article-tabs button { border-radius: 0; ${LABEL} font-size: 12px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); box-shadow: inset 0 -3px 0 var(--accent); }
.picture-panel { border-radius: 0; border-color: var(--ch-line); border-top-color: var(--ch-rule); }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-display); font-weight: 800; letter-spacing: 0; }
.prose h2 { padding-bottom: 5px; border-bottom: 1px solid var(--ch-rule); }
.prose h3 { color: var(--accent); }
.prose blockquote { border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--ink) 5%, transparent); }
.prose code, .prose pre { border-radius: 0; }
.article-aside .aside-section { border-top: 1px solid var(--ch-rule); }
.article-aside .eyebrow { color: var(--accent); }

@media (max-width: 640px) {
  .dashboard-intro { min-height: 250px; padding: 24px 20px 96px; }
  .dashboard-intro h1 { font-size: 34px; }
  .dashboard-intro .subtitle { max-width: 24ch; font-size: 15.5px; }
  ${smallWoodcut(".dashboard-intro")}
}
`;

/* Maptable: flat plates around the table, and the Scene Picker gets the woodcut. */
const MAPTABLE = `/* Champion for Maptable. The map itself keeps its own colours; everything around it is black, white and one red. */
${VARS}
body { ${PAGE} scrollbar-color: var(--ch-rule) var(--panel); }
::selection { background: var(--ch-red); color: #fff; }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 1px solid var(--ch-rule); background: var(--ch-panel); }
.header-scene strong { color: var(--accent); }
.csw-btn { border-radius: 0; }
.csw-name b { font: 800 15px var(--font-display); letter-spacing: .02em; text-transform: uppercase; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${SLANT} ${LABEL} font-size: 12px; transition: filter .15s; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { background: var(--ch-red); filter: brightness(1.08); }
.primary.primary.primary:focus-visible { clip-path: none; }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }
input[type="range"] { accent-color: var(--accent); }

/* The tool rail: a red edge when on. */
.rail { border-right: 1px solid var(--ch-line); background: var(--ch-panel); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--accent); }
.rail button.active { border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--accent); }

/* The side panel. */
.side-panel { border-right: 1px solid var(--ch-line); background: var(--ch-panel); }
.panel-title { border-bottom: 1px solid var(--ch-rule); }
.panel-title h2 { display: flex; align-items: center; gap: 10px; font: 800 15px var(--font-display); letter-spacing: .06em; text-transform: uppercase; }
.panel-title h2::before { ${MARK} height: 14px; }
.organizer-scene { border-radius: 0; border-left: 3px solid transparent; white-space: normal; }
.organizer-scene:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.organizer-scene.active { border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
.organizer-scene strong { font: 700 15px/1.2 var(--font-display); }
.organizer-scene.active strong { color: var(--accent); }
.scene-kind { border-radius: 0; color: var(--muted); }

/* Around the map. */
.map-topbar { border-bottom: 1px solid var(--ch-line); background: var(--ch-panel); }
.map-title { ${LABEL} font-size: 11.5px; color: var(--muted); }
.board { background: var(--bg); }
.board-info { ${LABEL} color: var(--muted); }
.zoom-controls { border-radius: 0; border-color: var(--ch-rule); }
.toolbar { border-radius: 0; border: 1px solid var(--ch-line); border-top: 2px solid var(--accent); background: var(--ch-panel); box-shadow: var(--ch-shadow); }
.toolbar button { border-radius: 0; ${LABEL} font-size: 11.5px; }
.toolbar button:hover { color: var(--accent); }
.toolbar button.active { background: var(--ch-red); color: var(--ch-red-ink); }

/* The Scene Picker: the woodcut. */
${woodcut(".campaign-scenes-head")}
.campaign-scenes-head { min-height: 280px; align-items: flex-start; padding: 30px 30px 110px; }
.campaign-scenes-head small { ${LABEL} font-size: 12px; color: var(--ch-banner-quiet); }
.campaign-scenes-head h1 { margin-top: 6px; font-size: 46px; line-height: 1; ${TITLE} }
.dashboard-continue { ${FRAME} padding: 20px 28px; transition: border-color .15s; }
.dashboard-continue:hover { border-top-color: var(--accent); }
.dashboard-continue small { ${LABEL} font-size: 11.5px; color: var(--accent); }
.dashboard-continue strong { font: 800 22px var(--font-display); }
.campaign-scenes-kinds button { border-radius: 0; ${LABEL} font-size: 11.5px; }
.campaign-scenes-group h2 { display: flex; align-items: center; gap: 12px; font: 800 18px var(--font-display); letter-spacing: .03em; text-transform: uppercase; }
.campaign-scenes-group h2::before { ${MARK} }
.campaign-scenes-group h2 span { ${LABEL} font-size: 11px; }
.campaign-scene-card { border: 1px solid var(--ch-line); border-top: 2px solid var(--ch-rule); border-radius: 0; background: var(--ch-panel); transition: border-color .15s; }
.campaign-scene-card.last { border-top-color: var(--accent); }
/* Hover: the top line turns red. Nothing lifts and nothing glows. */
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { border-top-color: var(--accent); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card strong { font: 700 16px/1.2 var(--font-display); }
.campaign-scene-card em { ${LABEL} font-style: normal; font-size: 10.5px; color: var(--accent); }
.campaign-scene-card small { font-size: 13px; }
.campaign-scene-picture { border-bottom: 1px solid var(--ch-line); }

@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 230px; padding: 22px 20px 96px; }
  .campaign-scenes-head h1 { font-size: 30px; }
  ${smallWoodcut(".campaign-scenes-head")}
}
`;

/* The campaign's dashboard: the woodcut behind its name, and plates. */
const DASHBOARD = `/* Champion for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--ch-red); color: #fff; }
.hub-crumbs { ${LABEL} font-size: 12px; }
.hub-crumbs a { color: var(--accent); }

/* The top: the woodcut. */
${woodcut(".hub-head")}
.hub-head { min-height: 330px; padding: 32px 32px 130px; }
.hub-title p { ${LABEL} font-size: 12px; color: var(--ch-banner-quiet); }
.hub-title h1 { margin-top: 6px; font-size: 54px; line-height: 1; ${TITLE} }
.hub-chip { border-radius: 0; border-color: var(--ch-hair); background: var(--ch-nav); color: var(--ch-banner-quiet); ${LABEL} font-size: 10.5px; }
.hub-head .tag-add { border-radius: 0; border-color: var(--ch-hair); background: var(--ch-nav); color: var(--ch-banner-ink); }
.hub-head .hub-button:not(.hub-button-primary) { border-color: var(--ch-rule); background: var(--ch-nav); color: var(--ch-banner-ink); }

/* Buttons. */
.hub-button { border-radius: 0; ${LABEL} font-size: 12px; }
.hub-button-primary { ${SLANT} transition: filter .15s; }
.hub-button-primary:hover { filter: brightness(1.08); }
.hub-button-primary:focus-visible { clip-path: none; }
.hub-button:not(.hub-button-primary):hover { border-color: var(--accent); color: var(--accent); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 1px solid var(--ch-rule); }
.hub-tabs button, .hub-tabs a { border-radius: 0; ${LABEL} font-size: 12.5px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }
.mem-count { border-radius: 0; }

/* Cards: plates with a red corner. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; display: flex; align-items: center; gap: 10px; font: 800 16px var(--font-display); letter-spacing: .05em; text-transform: uppercase; color: var(--ink); }
.hub-card-head h2::before { ${MARK} height: 14px; }
.hub-card-head a, .hub-card-head .hub-text-button { ${LABEL} font-size: 11.5px; }
.hub-scene-grid li { border-radius: 0; }

@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 22px 20px 110px; }
  .hub-title h1 { font-size: 34px; }
  ${smallWoodcut(".hub-head")}
}
`;

export const CHAMPION: Theme = {
  id: "preset-champion", name: "Champion", mode: "both", radius: 0, banner: "picture", fonts: { display: "schibsted", reading: "schibsted", ui: "inter" },
  colors: {
    light: { bg: "#f2f0ed", panel: "#ffffff", raised: "#f0eeeb", line: "#cfcac4", ink: "#111111", muted: "#555555", accent: "#b3190f", accent2: "#1a1a1a" },
    dark: { bg: "#080808", panel: "#121212", raised: "#1a1a1a", line: "#333333", ink: "#f2f2f2", muted: "#a3a3a3", accent: "#e8493d", accent2: "#d9d9d9" },
  },
  css: `/* Champion: three inks only, black, white and one red, flat and sharp, with nothing that glows or moves. The banner is a woodcut: a flat red sun behind black crags, drawn with gradients.
   Dark is white on black; light is black on bone white. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--ch-rule) var(--panel); }
::selection { background: var(--ch-red); color: #fff; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border: 0; border-bottom: 1px solid var(--ch-line); background: var(--ch-panel); }
.board-date { ${LABEL} font-size: 11.5px; }
.board-date::before { ${MARK} width: 6px; height: 12px; margin-right: 10px; }
.board-date b { ${LABEL} font-size: 11.5px; color: var(--accent); }
.circ { border-radius: 0; border: 0; background: var(--ink); color: var(--bg); font: 700 12px var(--font-display); clip-path: ${SMALL_CUT}; }
.you b { font: 800 16px var(--font-display); letter-spacing: .02em; text-transform: uppercase; }
.search-box { border-color: var(--ch-line); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: a woodcut. A flat field, broken ground, black crags and the red sun behind them. */
.board-head { min-height: 340px; border: 0; border-top: 3px solid var(--accent); text-align: left; }
.board-head:not(.has-art) {
  background: var(--ch-field); outline: 1px solid var(--ch-hair); outline-offset: -9px;
  --head-ink: var(--ch-banner-ink); --head-title: var(--ch-title); --head-shadow: var(--ch-title-shadow); --head-nav: var(--ch-nav); --head-line: var(--ch-rule);
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: flex-start; padding: 54px 44px 120px; overflow: hidden; }
.board-head:not(.has-art) .board-head-text { background: ${GROUND}; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-head:not(.has-art) .board-head-text::before {
  content: ""; position: absolute; z-index: 0; right: 4%; bottom: 0; width: 520px; height: 260px;
  background: ${CRAGS};
}
.board-title { font: 800 62px/1 var(--font-display); letter-spacing: -.01em; text-transform: uppercase; }
.board-tagline { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; margin-top: 16px; ${LABEL} font-style: normal; font-size: 13px; letter-spacing: .2em; color: var(--ch-banner-quiet); }
.board-tagline::before { content: ""; width: 132px; height: 7px; background: var(--accent); clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%); }
.board-nav { justify-content: flex-start; padding: 0 28px; border-top: 1px solid var(--head-line); background: var(--head-nav); }
.board-nav a { padding: 12px 18px; ${LABEL} font-size: 12.5px; }
.board-nav a:hover { color: var(--accent); border-bottom-color: var(--accent); }
/* With a banner picture: the picture under a flat black wash, the same heavy title over it. */
.board-head.has-art {
  background: linear-gradient(90deg, rgba(0, 0, 0, .78) 0%, rgba(0, 0, 0, .42) 46%, rgba(0, 0, 0, .12) 100%), linear-gradient(180deg, transparent 60%, rgba(0, 0, 0, .8) 100%), var(--banner) center var(--banner-y, 50%) / cover no-repeat;
  --head-ink: #f2f2f2; --head-title: #ffffff; --head-shadow: 0 2px 14px rgba(0, 0, 0, .85); --head-nav: rgba(0, 0, 0, .72); --head-line: #5c5c5c;
}
.board-head.has-art .board-head-text { justify-content: center; padding: 60px 44px 70px; }
.board-head.has-art .board-tagline { color: #e2e2e2; text-shadow: 0 1px 8px #000; }
.board-head.has-art .board-tagline::before { background: #e8493d; }

/* Headings: a slanted red bar, the name in heavy capitals, then a hairline. */
.category-title { gap: 12px; font: 800 20px var(--font-display); letter-spacing: .03em; text-transform: uppercase; color: var(--ink); }
.category-title::before { ${MARK} }
.category-title::after { content: ""; flex: 1; height: 1px; background: var(--ch-rule); }
.tag { border-radius: 0; border-color: var(--ch-rule); color: var(--muted); ${LABEL} font-size: 9.5px; text-shadow: none; }
.tag.new { border-color: var(--ch-red); background: var(--ch-red); color: var(--ch-red-ink); }

/* Boards and topics: plates with a heavy edge. Under the pointer the edge turns red. */
.category-forums, .topics { gap: 6px; }
.forum, .topic-row { ${ROW} }
.forum:hover, .topic-row:hover { ${ROW_ON} }
.topic-row.pinned { border-left-color: var(--accent); }
.forum-name { font: 800 21px/1.15 var(--font-display); letter-spacing: 0; text-transform: none; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum:hover .forum-name a, .topic-row:hover .topic-title a, .forum-name a:hover, .topic-title a:hover { color: var(--accent); }
.forum-desc { font: 400 15.5px/1.45 var(--font-reading); font-style: normal; }
.forum-place { ${LABEL} font-size: 10.5px; }
.forum-place a { color: var(--accent); }
.forum-counts b { font: 800 19px var(--font-display); color: var(--ink); }
.last-label { ${LABEL} font-size: 10px; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 700 15px/1.3 var(--font-display); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { font: 700 18px/1.2 var(--font-display); letter-spacing: 0; text-transform: none; }
.topic-main small { font-style: normal; }
.topic-count b { font: 800 18px var(--font-display); color: var(--ink); }
.unread-dot { width: 9px; height: 9px; border-radius: 0; background: var(--accent); rotate: 45deg; box-shadow: none; }
/* Small portraits: inked squares with the corner cut. */
.portrait.small, .portrait.tiny { border-radius: 0; border: 0; background: var(--ink); color: var(--bg); font-family: var(--font-display); font-weight: 700; box-shadow: none; clip-path: ${SMALL_CUT}; }
/* A location with no picture gets its own small woodcut. */
.forum-art { border-right: 1px solid var(--ch-line); }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} }
.location-art { border-right: 1px solid var(--ch-line); }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${LABEL} font-size: 11.5px; color: var(--accent); }
.location-name { font-weight: 800; font-size: 34px; letter-spacing: -.01em; text-transform: uppercase; }
.location-summary { font: 400 16.5px/1.55 var(--font-reading); font-style: normal; }

/* Topic pages. */
.crumbs { ${LABEL} font-size: 11.5px; }
.crumbs a { color: var(--accent); }
.topic-head { ${FRAME} }
.topic-name { font: 800 34px/1.08 var(--font-display); letter-spacing: -.01em; text-transform: uppercase; }
.cast-chip, .today-chip { border-radius: 0; border-color: var(--ch-line); }

/* Posts: plates, the name on a slanted red plate and the portrait cut on the same slant. */
.posts { gap: 20px; }
.post { border: 1px solid var(--ch-line); border-top-color: var(--ch-rule); border-radius: 0; background: var(--ch-panel); }
.post.fresh { border-top-color: var(--accent); }
.post-band, .post.flip .post-band { padding: 0 24px 0 0; border-bottom: 1px solid var(--ch-line); background: none; }
.post.flip .post-band { padding: 0 0 0 24px; }
.post-name { font: 800 17px/1.1 var(--font-display); letter-spacing: .04em; text-transform: uppercase; }
.post-name a { display: inline-block; padding: 11px 34px 11px 24px; background: var(--ch-red); color: var(--ch-red-ink); clip-path: polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%); }
.post.flip .post-name a { padding: 11px 24px 11px 34px; clip-path: polygon(14px 0, 100% 0, 100% 100%, 0 100%); }
.post-meta { ${LABEL} font-size: 11px; }
.post-meta a { color: var(--muted); }
.mini-portrait { filter: drop-shadow(1px 0 0 var(--ch-rule)) drop-shadow(-1px 0 0 var(--ch-rule)) drop-shadow(0 -1px 0 var(--ch-rule)) drop-shadow(0 1px 0 var(--ch-rule)); }
.portrait.big { border: 0; clip-path: ${CUT}; }
.portrait.big::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(0deg, var(--ch-red) 0 5px, transparent 5px); }
.portrait.big.portrait-empty { background: var(--raised); }
.portrait.big.portrait-empty span { font: 800 120px var(--font-display); color: color-mix(in srgb, var(--ink) 22%, transparent); }
/* The character card that opens over a portrait: a black plate in both versions. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 18px; border: 1px solid var(--ch-plate-line); border-top: 3px solid var(--ch-plate-red);
  background: linear-gradient(135deg, var(--ch-plate-red) 0 8px, transparent 8.5px) left top / 20px 20px no-repeat, var(--ch-plate); color: var(--ch-plate-ink); box-shadow: var(--ch-shadow);
}
.mini-card > *, .mini-card dd { color: var(--ch-plate-ink); }
.mini-name { font: 800 22px/1.05 var(--font-display); letter-spacing: -.01em; text-transform: uppercase; }
.mini-role { margin: 6px 0 14px; padding-bottom: 14px; border-bottom: 1px solid var(--ch-plate-line); ${LABEL} font-style: normal; font-size: 11px; color: var(--ch-plate-red); }
.mini-quote { font: 400 15px/1.45 var(--font-reading); font-style: normal; color: var(--ch-plate-quiet); opacity: 1; }
.mini-traits .chip { border-radius: 0; }
.mini-fields dt { ${LABEL} font-size: 10.5px; color: var(--ch-plate-quiet); }
.mini-fields dd { font: 400 15px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 7px 22px; ${SLANT} color: var(--ch-red-ink) !important; ${LABEL} font-size: 11.5px; text-decoration: none; transition: filter .15s; }
.mini-link:hover { filter: brightness(1.08); }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${LABEL} font-size: 11px; line-height: 1.6; }
.mini-player b { color: var(--accent); }
.post-text { font: 400 17px/1.68 var(--font-reading); }
.post-text blockquote { border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--ink) 5%, transparent); }
.post-text pre { border: 1px solid var(--ch-line); background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { font-weight: 800; letter-spacing: 0; color: var(--ink); }
.roll-card { border-radius: 0; border-color: var(--ch-line); border-left: 3px solid var(--accent); }
.roll-group i, .roll-stamp { border-radius: 0; }
.roll-total { border-radius: 0; font: 800 17px/26px var(--font-display); }
.post-actions { border-top: 1px solid var(--ch-line); }
.post-actions button { ${LABEL} font-size: 11.5px; }
.post-actions button:hover { color: var(--accent); }

/* Buttons and boxes to type in. */
.f-btn { border-radius: 0; ${LABEL} font-size: 12px; }
.f-btn:not(.ghost) { ${SLANT} color: var(--ch-red-ink) !important; transition: filter .15s; }
.f-btn:not(.ghost):hover:not(:disabled) { filter: brightness(1.08); }
.f-btn:not(.ghost):focus-visible { clip-path: none; }
.f-btn.ghost { border-color: var(--ch-rule); background: transparent; }
.f-btn.ghost:hover:not(:disabled) { border-color: var(--accent); background: transparent; color: var(--accent) !important; }
.f-btn.small { font-size: 11px; }
input:not([type="checkbox"]), select, textarea { border-radius: 0; background: var(--bg); caret-color: var(--accent); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }
.composer { border: 0; border-top: 1px solid var(--ch-rule); }
.composer-kind, .as-label { ${LABEL} color: var(--accent); }
.tools { border-radius: 0; background: var(--bg); }
.tools button { border-radius: 0; }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 15px; letter-spacing: .05em; text-transform: uppercase; color: var(--ink); }
.foot-cols h3::before, .foot-line h3::before { ${MARK} height: 13px; }
.foot-staff b { font: 700 15px var(--font-display); }
.foot-stats b { font: 800 17px var(--font-display); color: var(--accent); }
.to-top { border-radius: 0; border-color: var(--ch-rule); color: var(--accent); }

@container page (max-width: 640px) {
  .board-head { min-height: 270px; }
  .board-head-text { padding: 30px 22px 100px; }
  .board-title { font-size: 36px; }
  .board-tagline { max-width: 70%; font-size: 11px; letter-spacing: .14em; }
  .board-head:not(.has-art) .board-head-text::before { right: -40px; scale: .56; transform-origin: bottom right; }
  .board-nav { padding: 0 8px; }
  .board-nav a { padding: 10px 10px; font-size: 11.5px; }
  .category-title { font-size: 17px; }
  .forum-name { font-size: 19px; }
  .topic-name { font-size: 25px; }
  .post-name { font-size: 15px; }
  .portrait.big.portrait-empty span { font-size: 60px; }
  .mini-card { box-shadow: 0 0 0 1px var(--bg), 0 22px 50px -8px rgba(0, 0, 0, .85); }
}
@media (prefers-reduced-motion: reduce) {
  .forum, .topic-row { transition: none; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
