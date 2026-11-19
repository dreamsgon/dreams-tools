/*
 * Citadel Station: a fully custom skin, inspired by Mass Effect's orange and blue. A ship's interface throughout: the
 * banner is a planet's horizon under a chart of orbits (gradients only, no picture, nothing from the games), panels
 * have a notched corner, a blue bar marks what's there and orange marks what matters. Dark is the view from orbit and
 * light is daylight on the station. Like every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --cs-space: linear-gradient(180deg, #a9cdf0 0%, #d5e8f8 55%, #f1f7fc 100%);
  --cs-stars: none;
  --cs-halo: radial-gradient(46% 70% at 77% 104%, rgba(255, 255, 255, .95), transparent 70%);
  --cs-planet: radial-gradient(circle at 42% 4%, #ffffff 0%, #d7eafb 9%, #9cc7ee 24%, #5f9bd3 46%, #3d79b6 70%);
  --cs-rim: 0 0 0 1px rgba(255, 255, 255, .95), 0 -8px 44px 4px rgba(255, 255, 255, .85);
  --cs-ring: rgba(10, 102, 194, .34);
  --cs-star: rgba(255, 196, 120, .95);
  --cs-sweep: rgba(255, 255, 255, .5);
  --cs-banner-ink: #0f1c2b;
  --cs-banner-quiet: #1f4a78;
  --cs-title: #0b1a2c;
  --cs-title-glow: 0 1px 0 rgba(255, 255, 255, .7);
  --cs-nav: rgba(248, 250, 252, .78);
  --cs-mesh: rgba(10, 102, 194, .035);
  --cs-page: linear-gradient(180deg, #dbe8f5, transparent 420px);
  --cs-glow: none;
  --cs-glow-2: none;
  --cs-box: 0 0 0 1px color-mix(in srgb, var(--accent-2) 55%, transparent);
  --cs-mini: radial-gradient(150% 64% at 50% 126%, #3d79b6 0 60%, #9cc7ee 74%, #ffffff 80%, rgba(255, 255, 255, .6) 84%, transparent 98%), linear-gradient(180deg, #a9cdf0, #e6f1fb);
  --cs-wire: color-mix(in srgb, var(--accent-2) 42%, var(--line));
  --card-bg: var(--panel); --card-ink: var(--ink); --card-head: var(--accent); --card-line: var(--cs-wire);
}
:root[data-theme="dark"] {
  --cs-space: linear-gradient(180deg, #02050a 0%, #050d19 55%, #0a1a30 100%);
  --cs-stars: radial-gradient(1.5px 1.5px at 5% 22%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 13% 61%, #bcd9ff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 22% 12%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 34% 44%, #ffe2c2 50%, transparent 51%), radial-gradient(1px 1px at 43% 16%, #bcd9ff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 51% 68%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 58% 30%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 66% 9%, #ffe2c2 50%, transparent 51%), radial-gradient(1.5px 1.5px at 91% 52%, #bcd9ff 50%, transparent 51%), radial-gradient(1px 1px at 97% 18%, #fff 50%, transparent 51%);
  --cs-halo: radial-gradient(46% 72% at 77% 106%, rgba(63, 169, 255, .5), transparent 70%);
  --cs-planet: radial-gradient(circle at 42% 4%, #bfe3ff 0%, #4a9be0 5%, #1c5c9c 13%, #0c3157 27%, #06172b 46%, #030a14 70%);
  --cs-rim: 0 0 0 1px rgba(150, 210, 255, .7), 0 -8px 46px 2px rgba(63, 169, 255, .6), 0 -2px 12px rgba(190, 228, 255, .7);
  --cs-ring: rgba(63, 169, 255, .42);
  --cs-star: rgba(255, 170, 80, .95);
  --cs-sweep: rgba(63, 169, 255, .1);
  --cs-banner-ink: #dbe7f3;
  --cs-banner-quiet: #8fd0ff;
  --cs-title: #f4f9ff;
  --cs-title-glow: 0 0 22px rgba(63, 169, 255, .65), 0 0 2px rgba(63, 169, 255, .9);
  --cs-nav: rgba(4, 9, 16, .72);
  --cs-mesh: rgba(63, 169, 255, .03);
  --cs-page: radial-gradient(110% 480px at 50% 0%, #0a1a30, transparent 70%);
  --cs-glow: 0 0 12px color-mix(in srgb, var(--accent) 60%, transparent);
  --cs-glow-2: 0 0 12px color-mix(in srgb, var(--accent-2) 60%, transparent);
  --cs-box: 0 0 0 1px color-mix(in srgb, var(--accent-2) 60%, transparent), 0 0 18px color-mix(in srgb, var(--accent-2) 28%, transparent);
  --cs-mini: radial-gradient(150% 64% at 50% 126%, #06172b 0 58%, #1c5c9c 72%, #7cc4ff 79%, rgba(63, 169, 255, .5) 83%, transparent 98%), radial-gradient(1px 1px at 22% 18%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 71% 30%, #bcd9ff 50%, transparent 51%), radial-gradient(1px 1px at 48% 9%, #fff 50%, transparent 51%), linear-gradient(180deg, #02050a, #0a1a30);
}`;

const KEYFRAMES = `@keyframes cs-pulse { 50% { opacity: .3; } }
@keyframes cs-sweep { from { background-position: -80% 0; } to { background-position: 240% 0; } }`;

/** The page behind everything: a faint mesh, lit from the top. */
const PAGE = "background: repeating-linear-gradient(60deg, var(--cs-mesh) 0 1px, transparent 1px 26px), repeating-linear-gradient(-60deg, var(--cs-mesh) 0 1px, transparent 1px 26px), var(--cs-page), var(--bg);";
/** A notch off the bottom right, the mark of every panel. */
const NOTCH = "clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);";
/** Buttons: two opposite corners cut. */
const CUT_BUTTON = "clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));";
/** A small orange diamond before a heading. */
const DIAMOND = `content: ""; flex: none; display: inline-block; width: 9px; height: 9px; background: var(--accent); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);`;
/** The chart of orbits: a star, its rings and three worlds, drawn with gradients. */
const CHART = `background: radial-gradient(circle at 50% 50%, #fff 0 2px, var(--cs-star) 3px, transparent 15px), radial-gradient(circle at 31.7% 43.3%, var(--accent) 0 3px, transparent 4.5px), radial-gradient(circle at 78.1% 33.75%, var(--accent-2) 0 4px, transparent 5.5px), radial-gradient(circle at 20.1% 75.1%, #fff 0 2px, transparent 3.5px), repeating-radial-gradient(ellipse closest-side at 50% 50%, transparent 0 12.3%, var(--cs-ring) 12.3% 13%);
  -webkit-mask-image: radial-gradient(ellipse closest-side, #000 0 80%, transparent 93%); mask-image: radial-gradient(ellipse closest-side, #000 0 80%, transparent 93%);`;

/**
 * The view from orbit, drawn behind `host`'s own content: space, a planet's horizon rising at the lower right and a
 * chart of orbits above it. `cap` is how much of the planet shows, `chart` how wide the chart is.
 */
function orbit(host: string, { cap = 96, chart = 500 }: { cap?: number; chart?: number } = {}) {
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 0;
  background: var(--cs-stars), var(--cs-halo), var(--cs-space);
  color: var(--cs-banner-ink);
}
${host} > * { position: relative; z-index: 2; }
${host}::before {
  content: ""; position: absolute; z-index: 0; left: 24%; width: 106%; aspect-ratio: 1; top: calc(100% - ${cap}px); border-radius: 50%;
  background: var(--cs-planet); box-shadow: var(--cs-rim); pointer-events: none;
}
${host}::after {
  content: ""; position: absolute; z-index: 1; right: 3%; top: 8px; width: ${chart}px; height: ${Math.round(chart * 0.4)}px; rotate: -14deg; pointer-events: none;
  ${CHART}
}`;
}

/* The Encyclopedia: the campaign's overview gets the view from orbit, pages read like entries in a ship's records. */
const ENCYCLOPEDIA = `/* Citadel Station for the Encyclopedia. The colours and fonts come from the theme; this adds the view from orbit, the notched panels and the bars. */
${VARS}
body { ${PAGE} scrollbar-color: var(--accent-2) var(--panel); }
::selection { background: var(--accent-2); color: #fff; }

/* The console down the side. */
.sidebar { border-right: 1px solid var(--cs-wire); background: linear-gradient(180deg, color-mix(in srgb, var(--accent-2) 7%, var(--panel)), var(--panel) 240px); }
.csw-name b { font-family: var(--font-display); font-size: 17px; letter-spacing: .12em; text-transform: uppercase; }
.csw-name small { letter-spacing: .08em; color: var(--accent-2); }
.campaign-link { border-radius: 0; border-left: 3px solid transparent; }
.campaign-link:hover { color: var(--accent-2); }
.campaign-link.active { border-left-color: var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 18%, transparent), transparent); color: var(--accent); }
.side-heading .section-toggle { font: 700 12.5px var(--font-display); letter-spacing: .2em; text-transform: uppercase; color: var(--accent-2); }
.shared-tag { border-radius: 0; border: 1px solid var(--cs-wire); background: transparent; color: var(--accent-2); font: 600 10px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.tree-row { border-radius: 0; }
.tree-row:hover { background: color-mix(in srgb, var(--accent-2) 10%, transparent); }
.tree-row:has(.active), .tree-item.active { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 18%, transparent), transparent); color: var(--accent); }

/* The bar along the top. */
.topbar { border-bottom: 0; background: var(--bg); box-shadow: inset 0 -1px 0 var(--cs-wire), 0 8px 24px -18px var(--accent-2); }
.search-box { border-radius: 0; border-color: var(--cs-wire); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); box-shadow: var(--cs-glow); }
.quick-hint kbd { border-radius: 0; border-color: var(--cs-wire); color: var(--accent-2); }

/* Buttons and boxes to type in. */
.button { border-radius: 0; font: 600 14px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.button.primary { border-color: var(--accent); ${CUT_BUTTON} transition: filter .15s; }
.button.primary:hover { filter: brightness(1.12); }
.button:not(.primary) { border-color: var(--cs-wire); }
.button:not(.primary):hover { border-color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 14%, transparent); color: var(--ink); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: var(--cs-glow); }

/* The campaign's overview: the view from orbit. */
${orbit(".dashboard-intro", { cap: 84, chart: 460 })}
.dashboard-intro { min-height: 250px; align-items: flex-start; margin-bottom: 26px; padding: 36px 34px 96px; ${NOTCH} }
.dashboard-intro .eyebrow { display: flex; align-items: center; gap: 10px; font: 600 13px var(--font-display); letter-spacing: .26em; color: var(--cs-banner-quiet); }
.dashboard-intro .eyebrow::before { ${DIAMOND} }
.dashboard-intro h1 { margin-top: 10px; padding-left: 18px; border-left: 4px solid var(--accent); font: 700 54px/1 var(--font-display); letter-spacing: .12em; text-transform: uppercase; color: var(--cs-title); text-shadow: var(--cs-title-glow); }
.dashboard-intro .subtitle { max-width: 44ch; padding-left: 22px; font-size: 15px; color: var(--cs-banner-ink); }
.dashboard-intro .icon-button { border: 1px solid var(--cs-ring); background: var(--cs-nav); color: var(--cs-banner-ink); }
.overview-strip { border-color: var(--cs-wire); }
.overview-strip strong { font: 700 17px var(--font-display); color: var(--accent-2); }

/* Headings: a diamond, then the name. */
.section-heading h2 { display: flex; align-items: center; gap: 12px; font: 700 18px var(--font-display); letter-spacing: .22em; text-transform: uppercase; }
.section-heading h2::before { ${DIAMOND} }
.eyebrow { font-family: var(--font-display); font-size: 12.5px; letter-spacing: .18em; }

/* Cards: a blue bar that turns orange under the pointer. */
.note-card { padding: 18px 18px 16px 20px; border: 0; border-left: 3px solid var(--accent-2); background: linear-gradient(100deg, color-mix(in srgb, var(--accent-2) 10%, var(--panel)), var(--panel) 48%); ${NOTCH} transition: border-color .15s, background .15s; }
.note-card:hover { border-left-color: var(--accent); background: linear-gradient(100deg, color-mix(in srgb, var(--accent) 16%, var(--panel)), var(--panel) 62%); }
.note-card h3 { font-family: var(--font-display); font-size: 21px; letter-spacing: .1em; text-transform: uppercase; }
.note-card:hover h3 { color: var(--accent); }
.note-card .eyebrow, .card-footer { color: var(--accent-2); }
.note-card.add-card { border: 1px dashed var(--cs-wire); background: transparent; clip-path: none; }
.note-card.add-card h3 { color: var(--accent-2); }

/* A page: an entry in the ship's records. */
.kind-pill { padding: 1px 8px; border-radius: 0; border: 1px solid var(--accent); font: 600 12px var(--font-display); letter-spacing: .16em; }
.article-title h1 { padding-left: 16px; border-left: 4px solid var(--accent); font-family: var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.tag-add, .who-button { border-radius: 0; }
.article-tabs { border-bottom: 1px solid var(--cs-wire); }
.article-tabs button { border-radius: 0; font: 600 14px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); background: linear-gradient(0deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent); box-shadow: inset 0 -2px 0 var(--accent); }
.picture-panel { border-radius: 0; border-color: var(--cs-wire); }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.prose h1::before, .prose h2::before { ${DIAMOND} margin-right: 12px; vertical-align: 3px; }
.prose h3 { color: var(--accent-2); }
.prose blockquote { border-left: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--raised)); }
.prose code, .prose pre { border-radius: 0; color: var(--accent-2); }
.article-aside .aside-section { border-top: 1px solid transparent; border-image: linear-gradient(90deg, var(--accent-2), transparent) 1; }
.article-aside .eyebrow { color: var(--accent-2); }

${KEYFRAMES}
@media (max-width: 640px) {
  .dashboard-intro { min-height: 210px; padding: 24px 18px 84px; }
  .dashboard-intro h1 { padding-left: 12px; font-size: 32px; }
  .dashboard-intro .subtitle { max-width: 30ch; padding-left: 16px; }
  .dashboard-intro::before { left: 12%; width: 150%; top: calc(100% - 62px); }
  .dashboard-intro::after { right: -140px; top: 36px; width: 280px; height: 112px; opacity: .7; }
}
`;

/* Maptable: the rail and panels are the ship's console, the Scene Picker gets the view from orbit. */
const MAPTABLE = `/* Citadel Station for Maptable. The map itself keeps its own colours; everything around it is the ship's console. */
${VARS}
body { ${PAGE} scrollbar-color: var(--accent-2) var(--panel); }
::selection { background: var(--accent-2); color: #fff; }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 0; background: var(--bg); box-shadow: inset 0 -1px 0 var(--cs-wire), 0 8px 24px -18px var(--accent-2); }
.header-scene strong { color: var(--accent); }
.csw-btn { border-radius: 0; }
.csw-name b { font-family: var(--font-display); font-size: 16px; letter-spacing: .12em; text-transform: uppercase; }

/* Buttons and boxes to type in. */
button.primary, .primary { border-radius: 0; font: 600 14px var(--font-display); letter-spacing: .14em; text-transform: uppercase; ${CUT_BUTTON} transition: filter .15s; }
.primary:hover { filter: brightness(1.12); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: var(--cs-glow); }
input[type="range"] { accent-color: var(--accent); }

/* The tool rail: orange when on. */
.rail { border-right: 1px solid var(--cs-wire); background: var(--bg); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--accent-2); }
.rail button.active { border-left: 3px solid var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 22%, transparent), transparent); color: var(--accent); }

/* The side panel. */
.side-panel { border-right: 1px solid var(--cs-wire); background: linear-gradient(180deg, color-mix(in srgb, var(--accent-2) 7%, var(--panel)), var(--panel) 240px); }
.panel-title { border-bottom: 1px solid transparent; border-image: linear-gradient(90deg, var(--accent-2), transparent) 1; }
.panel-title h2 { display: flex; align-items: center; gap: 10px; font: 700 17px var(--font-display); letter-spacing: .22em; text-transform: uppercase; }
.panel-title h2::before { ${DIAMOND} }
.organizer-scene { border-radius: 0; border-left: 3px solid transparent; }
.organizer-scene:hover { background: color-mix(in srgb, var(--accent-2) 10%, transparent); }
.organizer-scene.active { border-left-color: var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 20%, transparent), transparent); }
.organizer-scene strong { font-family: var(--font-display); font-size: 15.5px; letter-spacing: .03em; }
.organizer-scene.active strong { color: var(--accent); }
.scene-kind { border-radius: 0; color: var(--accent-2); }

/* Around the map: a faint mesh out past the edge of the map. */
.map-topbar { border-bottom: 1px solid var(--cs-wire); background: var(--bg); }
.map-title { font: 600 13px var(--font-display); letter-spacing: .14em; text-transform: uppercase; color: var(--accent-2); }
.board { background: radial-gradient(70% 55% at 50% 0%, color-mix(in srgb, var(--accent-2) 12%, transparent), transparent 70%), repeating-linear-gradient(60deg, color-mix(in srgb, var(--accent-2) 7%, transparent) 0 1px, transparent 1px 30px), repeating-linear-gradient(-60deg, color-mix(in srgb, var(--accent-2) 7%, transparent) 0 1px, transparent 1px 30px), var(--bg); }
.board-info { font-family: var(--font-display); letter-spacing: .16em; color: var(--accent-2); }
.zoom-controls { border-radius: 0; border-color: var(--cs-wire); }
.toolbar { border-radius: 0; border: 1px solid var(--cs-wire); background: color-mix(in srgb, var(--panel) 94%, transparent); box-shadow: var(--cs-box); }
.toolbar button { border-radius: 0; font: 600 14px var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.toolbar button:hover { color: var(--accent-2); }
.toolbar button.active { background: var(--accent); color: var(--on-accent); }

/* The Scene Picker: the view from orbit. */
${orbit(".campaign-scenes-head", { cap: 66, chart: 400 })}
.campaign-scenes-head { min-height: 200px; align-items: flex-start; padding: 30px 28px 80px; ${NOTCH} }
.campaign-scenes-head small { display: flex; align-items: center; gap: 10px; font: 600 13px var(--font-display); letter-spacing: .26em; color: var(--cs-banner-quiet); }
.campaign-scenes-head small::before { ${DIAMOND} }
.campaign-scenes-head h1 { margin-top: 8px; padding-left: 16px; border-left: 4px solid var(--accent); font: 700 46px/1 var(--font-display); letter-spacing: .12em; text-transform: uppercase; color: var(--cs-title); text-shadow: var(--cs-title-glow); }
.dashboard-continue { padding-left: 20px; border: 0; border-left: 3px solid var(--accent); background: linear-gradient(100deg, color-mix(in srgb, var(--accent) 12%, var(--panel)), var(--panel) 55%); ${NOTCH} }
.dashboard-continue small { font: 600 12.5px var(--font-display); letter-spacing: .22em; color: var(--accent-2); }
.dashboard-continue strong { font-family: var(--font-display); font-size: 21px; letter-spacing: .1em; text-transform: uppercase; }
.campaign-scenes-kinds button { border-radius: 0; font: 600 13px var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.campaign-scenes-group h2 { display: flex; align-items: center; gap: 12px; font: 700 17px var(--font-display); letter-spacing: .22em; text-transform: uppercase; }
.campaign-scenes-group h2::before { ${DIAMOND} }
.campaign-scene-card { border-radius: 0; border-color: var(--cs-wire); transition: border-color .15s, box-shadow .15s, transform .15s; }
.campaign-scene-card.last { border-color: var(--accent-2); }
/* Hover: the card comes forward and its top edge lights orange. */
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { border-color: var(--accent); background: var(--panel); transform: translateY(-3px); box-shadow: 0 -2px 0 var(--accent), 0 18px 30px -18px var(--accent-2), var(--cs-glow); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card strong { flex-wrap: wrap; gap: 2px 8px; font-family: var(--font-display); font-size: 16.5px; letter-spacing: .08em; text-transform: uppercase; }
.campaign-scene-card em { font: 600 11px var(--font-display); letter-spacing: .16em; color: var(--accent-2); }
.campaign-scene-card:active { transform: none; box-shadow: none; }

${KEYFRAMES}
@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 170px; padding: 22px 18px 70px; }
  .campaign-scenes-head h1 { padding-left: 12px; font-size: 30px; }
  .campaign-scenes-head::before { left: 12%; width: 150%; top: calc(100% - 52px); }
  .campaign-scenes-head::after { right: -140px; top: 36px; width: 260px; height: 104px; opacity: .7; }
}
@media (prefers-reduced-motion: reduce) {
  .campaign-scene-card, .campaign-scene-card:hover { transform: none; transition: none; }
}
`;

/* The campaign's dashboard: the view from orbit behind its name, and notched cards with a lit top edge. */
const DASHBOARD = `/* Citadel Station for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--accent-2); color: #fff; }
.hub-crumbs { font: 600 13px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.hub-crumbs a { color: var(--accent-2); }

/* The top: the view from orbit. */
${orbit(".hub-head", { cap: 92, chart: 480 })}
.hub-head { min-height: 270px; padding: 32px 30px 104px; ${NOTCH} }
.hub-title p { display: flex; align-items: center; gap: 10px; font: 600 13px var(--font-display); letter-spacing: .26em; text-transform: uppercase; color: var(--cs-banner-quiet); }
.hub-title p::before { ${DIAMOND} }
.hub-title h1 { margin-top: 8px; padding-left: 18px; border-left: 4px solid var(--accent); font: 700 56px/1 var(--font-display); letter-spacing: .12em; text-transform: uppercase; color: var(--cs-title); text-shadow: var(--cs-title-glow); }
.hub-chip { border-radius: 0; border-color: var(--cs-ring); background: var(--cs-nav); color: var(--cs-banner-quiet); font: 600 12px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.hub-head .tag-add { border-radius: 0; border-color: var(--cs-ring); background: var(--cs-nav); color: var(--cs-banner-ink); }
.hub-head .hub-button:not(.hub-button-primary) { border-color: var(--cs-ring); background: var(--cs-nav); color: var(--cs-banner-ink); backdrop-filter: blur(4px); }

/* Buttons. */
.hub-button { border-radius: 0; font: 600 14px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.hub-button-primary { ${CUT_BUTTON} box-shadow: none; transition: filter .15s; }
.hub-button-primary:hover { filter: brightness(1.12); }
.hub-button:not(.hub-button-primary):hover { border-color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 16%, var(--panel)); color: var(--ink); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 1px solid var(--cs-wire); }
.hub-tabs button, .hub-tabs a { border-radius: 0; font: 600 14.5px var(--font-display); letter-spacing: .16em; text-transform: uppercase; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); background: linear-gradient(0deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent); }
.mem-count { border-radius: 0; }

/* Cards: a blue edge along the top that starts orange, and a notch. */
.hub-card { border: 0; border-radius: 0; background: linear-gradient(90deg, var(--accent) 0 54px, var(--accent-2) 54px 100%) top / 100% 2px no-repeat, linear-gradient(180deg, color-mix(in srgb, var(--accent-2) 8%, var(--panel)), var(--panel) 120px); ${NOTCH} }
.hub-card-head h2 { display: flex; align-items: center; gap: 10px; font: 700 16px var(--font-display); letter-spacing: .22em; text-transform: uppercase; color: var(--ink); }
.hub-card-head h2::before { ${DIAMOND} }
.hub-card-head a, .hub-card-head .hub-text-button { font: 600 14px var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.hub-scene-grid li { border-radius: 0; }

${KEYFRAMES}
@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 22px 18px 90px; }
  .hub-title h1 { padding-left: 12px; font-size: 34px; }
  .hub-head::before { left: 12%; width: 150%; top: calc(100% - 66px); }
  .hub-head::after { right: -140px; top: 36px; width: 280px; height: 112px; opacity: .7; }
}
`;

export const CITADEL_STATION: Theme = {
  id: "preset-citadel", name: "Citadel Station", mode: "both", radius: 0, banner: "plain", fonts: { display: "rajdhani", reading: "inter", ui: "inter" },
  colors: {
    light: { bg: "#e8eef4", panel: "#f8fafc", raised: "#edf2f7", line: "#c2cfdc", ink: "#0f1c2b", muted: "#4d6074", accent: "#b85200", accent2: "#0a66c2" },
    dark: { bg: "#05090f", panel: "#0b131d", raised: "#111c2a", line: "#1f3247", ink: "#dbe7f3", muted: "#8ba0b6", accent: "#ff8a1f", accent2: "#3fa9ff" },
  },
  css: `/* Citadel Station: a ship's interface. The banner is a planet's horizon under a chart of orbits, drawn with gradients only.
   Dark is the view from orbit; light is daylight on the station. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--accent-2) var(--panel); }
::selection { background: var(--accent-2); color: #fff; }
a { text-underline-offset: 3px; }

/* The strip above the banner: a status line. */
.board-bar { border: 0; border-bottom: 1px solid var(--cs-wire); background: linear-gradient(90deg, color-mix(in srgb, var(--accent-2) 10%, var(--panel)), var(--panel) 50%); }
.board-date { font: 600 13px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.board-date::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 10px; background: var(--accent); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); animation: cs-pulse 2.6s ease-in-out infinite; }
.board-date b { font: 700 13px var(--font-display); letter-spacing: .14em; color: var(--accent-2); }
.circ { border-radius: 0; border-color: var(--cs-wire); background: color-mix(in srgb, var(--accent-2) 12%, transparent); color: var(--accent-2); font-family: var(--font-display); clip-path: polygon(22% 0, 100% 0, 100% 78%, 78% 100%, 0 100%, 0 22%); }
.you b { font-family: var(--font-display); font-size: 16px; letter-spacing: .12em; text-transform: uppercase; }
.wait-count { border-radius: 0; }
.search-box { border-color: var(--cs-wire); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); box-shadow: var(--cs-glow); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: space, a planet's horizon rising at the lower right, and a chart of orbits above it. */
.board-head { min-height: 300px; border: 0; text-align: left; ${NOTCH} }
.board-head:not(.has-art) {
  background: var(--cs-stars), var(--cs-halo), var(--cs-space);
  --head-ink: var(--cs-banner-ink); --head-title: var(--cs-title); --head-shadow: var(--cs-title-glow); --head-nav: var(--cs-nav); --head-line: var(--cs-ring);
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 30px 30px 96px; overflow: hidden; }
.board-head:not(.has-art) .board-head-text { background: linear-gradient(100deg, transparent 0 40%, var(--cs-sweep) 50%, transparent 60% 100%) -80% 0 / 60% 100% no-repeat; animation: cs-sweep 9s ease-in-out infinite; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-head:not(.has-art) .board-head-text::before {
  content: ""; position: absolute; z-index: 0; left: 24%; width: 106%; aspect-ratio: 1; top: calc(100% - 104px); border-radius: 50%;
  background: var(--cs-planet); box-shadow: var(--cs-rim);
}
.board-head:not(.has-art) .board-head-text::after {
  content: ""; position: absolute; z-index: 1; right: 3%; top: 10px; width: 540px; height: 216px; rotate: -14deg;
  ${CHART}
}
.board-title { padding-left: 18px; border-left: 4px solid var(--accent); font: 700 58px/1 var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.board-tagline { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding-left: 22px; font: 600 15px var(--font-display); letter-spacing: .22em; text-transform: uppercase; color: var(--cs-banner-quiet); }
.board-tagline::before { ${DIAMOND} background: var(--accent-2); }
.board-nav { justify-content: flex-start; padding: 0 14px; border-top: 1px solid var(--cs-ring); background: var(--head-nav); backdrop-filter: blur(6px); }
.board-nav a { padding: 12px 18px; font: 600 15px var(--font-display); letter-spacing: .2em; }
.board-nav a:hover { color: var(--accent); border-bottom-color: var(--accent); }

${KEYFRAMES}

/* Headings: a diamond, the name, then a line out to the edge. */
.category-title { gap: 12px; font-size: 17px; letter-spacing: .24em; }
.category-title::before { ${DIAMOND} }
.category-title::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, var(--accent-2), transparent); }
.tag { border-radius: 0; border-color: var(--cs-wire); color: var(--accent-2); font: 600 11px var(--font-display); letter-spacing: .14em; text-shadow: none; }
.tag.new { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }

/* Boards and topics: a blue bar that turns orange under the pointer, and a notched corner. */
.category-forums, .topics { gap: 6px; }
.forum, .topic-row {
  border: 0; border-left: 3px solid var(--accent-2);
  background: linear-gradient(90deg, var(--cs-wire), transparent 70%) top / 100% 1px no-repeat, linear-gradient(100deg, color-mix(in srgb, var(--accent-2) 10%, var(--panel)), var(--panel) 46%);
  ${NOTCH}
  transition: border-color .15s, background .15s;
}
.forum:hover, .topic-row:hover { border-left-color: var(--accent); background: linear-gradient(90deg, var(--accent), transparent 70%) top / 100% 1px no-repeat, linear-gradient(100deg, color-mix(in srgb, var(--accent) 15%, var(--panel)), var(--panel) 60%); }
.topic-row.pinned { border-left: 3px solid var(--accent); }
.forum-name { font-size: 22px; letter-spacing: .12em; text-transform: uppercase; }
.forum-name a:hover, .topic-title a:hover { color: var(--accent); }
.forum-desc { margin-top: 4px; font: 400 14px/1.5 var(--font-reading); font-style: normal; }
.forum-place { font: 600 12px var(--font-display); letter-spacing: .16em; text-transform: uppercase; }
.forum-place a { color: var(--accent-2); }
.forum-counts b { font: 700 17px var(--font-display); color: var(--accent-2); }
.last-label { font-family: var(--font-display); font-size: 11.5px; letter-spacing: .2em; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 600 14px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { font-size: 18px; letter-spacing: .1em; text-transform: uppercase; }
.topic-main > small { font-style: normal; }
.topic-count b { font: 700 16px var(--font-display); color: var(--accent-2); }
.unread-dot { border-radius: 0; background: var(--accent); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); box-shadow: none; animation: cs-pulse 2s ease-in-out infinite; }
.portrait.small, .portrait.tiny { border-radius: 0; border: 0; box-shadow: none; background: color-mix(in srgb, var(--accent-2) 24%, var(--raised)); color: var(--ink); clip-path: polygon(22% 0, 100% 0, 100% 78%, 78% 100%, 0 100%, 0 22%); }
/* A location with no picture gets its own small horizon. */
.forum-art { border-right: 1px solid var(--cs-wire); }
.forum-art:not([style]) { background: var(--cs-mini); }

/* A location's own page. */
.location { border: 0; border-left: 3px solid var(--accent); background: linear-gradient(100deg, color-mix(in srgb, var(--accent-2) 10%, var(--panel)), var(--panel) 60%); ${NOTCH} }
.location-art { border-right: 1px solid var(--cs-wire); }
.location-art.portrait-empty { background: var(--cs-mini); }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { font: 600 12.5px var(--font-display); letter-spacing: .22em; color: var(--accent-2); }
.location-name { letter-spacing: .12em; text-transform: uppercase; }
.location-summary { font: 400 15px/1.6 var(--font-reading); font-style: normal; }

/* Topic pages. */
.crumbs { font: 600 13px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.crumbs a { color: var(--accent-2); }
.topic-head { border: 0; border-left: 3px solid var(--accent); background: linear-gradient(90deg, var(--cs-wire), transparent 70%) top / 100% 1px no-repeat, linear-gradient(100deg, color-mix(in srgb, var(--accent-2) 10%, var(--panel)), var(--panel) 60%); }
.topic-head::before { content: "Log entry"; display: block; margin-bottom: 4px; font: 600 12px var(--font-display); letter-spacing: .26em; text-transform: uppercase; color: var(--accent-2); }
.topic-name { font-size: 32px; letter-spacing: .1em; text-transform: uppercase; }
.cast-chip, .today-chip { border-radius: 0; border-color: var(--cs-wire); }

/* Posts: a wire frame with two opposite corners cut, and a readout over the portrait. */
.posts { gap: 20px; }
.post { padding: 1px; border: 0; background: var(--cs-wire); clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); }
.post.fresh { background: var(--accent); }
.post-band, .post.flip .post-band { padding: 10px 24px; border-bottom: 1px solid var(--accent-2); background: linear-gradient(90deg, color-mix(in srgb, var(--accent-2) 22%, var(--raised)), var(--raised) 60%); clip-path: polygon(15.4px 0, 100% 0, 100% 100%, 0 100%, 0 15.4px); }
.post.flip .post-band { background: linear-gradient(270deg, color-mix(in srgb, var(--accent-2) 22%, var(--raised)), var(--raised) 60%); }
.post-grid { background: var(--panel); clip-path: polygon(0 0, 100% 0, 100% calc(100% - 15.4px), calc(100% - 15.4px) 100%, 0 100%); }
.post:has(.composer), .post:has(.composer) .post-grid, .post:has(.composer) .post-band { clip-path: none; }
.post-name { font-size: 24px; letter-spacing: .14em; }
.post-name a::before { ${DIAMOND} margin-right: 12px; vertical-align: 3px; }
.post-meta { font: 600 12px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.post-meta a { color: var(--accent-2); }
.mini-portrait::before, .mini-portrait::after { content: ""; position: absolute; z-index: 3; height: 3px; pointer-events: none; }
.mini-portrait::before { top: -6px; left: 0; right: 0; background: linear-gradient(90deg, var(--accent) 0 32%, transparent 32% 35%, var(--accent-2) 35% 100%); }
.mini-portrait::after { bottom: -6px; right: 0; width: 38%; background: var(--accent-2); }
.portrait.big { border-color: var(--cs-wire); }
.portrait.big::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, transparent 60%, color-mix(in srgb, var(--accent-2) 26%, transparent)); }
.portrait.big.portrait-empty { background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--accent-2) 26%, transparent), transparent 60%), repeating-linear-gradient(60deg, var(--cs-wire) 0 1px, transparent 1px 24px), repeating-linear-gradient(-60deg, var(--cs-wire) 0 1px, transparent 1px 24px), var(--raised); }
.portrait.big.portrait-empty span { font: 700 120px var(--font-display); color: transparent; -webkit-text-stroke: 2px var(--accent-2); }
/* The character card that opens over a portrait: a dossier that slides up into place. */
.mini-card {
  display: flex; flex-direction: column; border: 1px solid var(--accent-2); border-top: 3px solid var(--accent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent-2) 14%, var(--panel)), var(--panel) 110px);
  box-shadow: var(--cs-box), 0 18px 40px -14px rgba(0, 0, 0, .6);
  transform: translateY(10px); transition: opacity .18s ease, visibility .18s, transform .18s ease;
}
.mini-portrait:hover .mini-card, .mini-portrait:focus-within .mini-card, .mini.open .mini-card, .mini-card.shown { transform: none; }
.mini-card::before { content: "Dossier"; flex: none; margin-bottom: 6px; font: 600 12px var(--font-display); letter-spacing: .28em; text-transform: uppercase; color: var(--accent-2); }
.mini-name { font-size: 22px; letter-spacing: .12em; }
.mini-role { font: 400 14px/1.5 var(--font-reading); font-style: normal; border-bottom: 1px solid; border-image: linear-gradient(90deg, var(--accent-2), transparent) 1; }
.mini-quote { font: 400 14px/1.5 var(--font-reading); }
.mini-fields dt { font: 600 11.5px var(--font-display); letter-spacing: .2em; color: var(--accent-2); }
.mini-fields dd { font: 400 14px/1.4 var(--font-reading); }
.mini-player { font: 600 12px/1.6 var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.mini-player b { color: var(--accent-2); }
.mini-link { align-self: flex-start; margin-top: auto; padding: 6px 14px; border: 1px solid var(--accent); font: 600 13px var(--font-display); letter-spacing: .16em; text-transform: uppercase; text-decoration: none; transition: background-color .15s, color .15s; }
.mini-link:hover { background: var(--accent); color: var(--on-accent) !important; }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.post-text { font: 400 16px/1.75 var(--font-reading); }
.post-text blockquote { border-left: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--raised)); font-style: normal; }
.post-text pre { border: 1px solid var(--cs-wire); background: var(--bg); color: var(--accent-2); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { text-transform: uppercase; letter-spacing: .12em; }
.roll-card, .roll-group i, .roll-total, .roll-stamp { border-radius: 0; }
.post-actions { border-top: 1px solid var(--cs-wire); }
.post-actions button { font: 600 13px var(--font-display); letter-spacing: .14em; }
.post-actions button:hover { color: var(--accent); }

/* Buttons and boxes to type in. */
.f-btn { border-radius: 0; font: 600 14px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.f-btn:not(.ghost) { border-color: var(--accent); background: var(--accent); ${CUT_BUTTON} transition: filter .15s; }
.f-btn:not(.ghost):hover:not(:disabled) { filter: brightness(1.12); }
.f-btn.ghost { border-color: var(--cs-wire); }
.f-btn.ghost:hover:not(:disabled) { border-color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 14%, transparent); color: var(--ink) !important; }
.f-btn.small { font-size: 12.5px; }
input:not([type="checkbox"]), select, textarea { border-radius: 0; background: var(--bg); caret-color: var(--accent); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: var(--cs-glow); }
.composer { border: 0; border-top: 2px solid var(--accent-2); }
.composer-kind, .as-label { font-family: var(--font-display); letter-spacing: .14em; color: var(--accent-2); }
.tools { border-radius: 0; background: var(--bg); }
.tools button { border-radius: 0; }

/* The foot of the forum. */
.board-foot { border: 0; background: linear-gradient(90deg, var(--accent) 0 80px, var(--accent-2) 80px 100%) top / 100% 2px no-repeat, linear-gradient(180deg, color-mix(in srgb, var(--accent-2) 8%, var(--panel)), var(--panel) 140px); }
.foot-cols h3, .foot-line h3 { display: flex; align-items: center; gap: 10px; letter-spacing: .22em; }
.foot-cols h3::before, .foot-line h3::before { ${DIAMOND} }
.foot-staff b { font-family: var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.foot-stats b { font: 700 15px var(--font-display); color: var(--accent-2); }
.to-top { border-radius: 0; border-color: var(--accent-2); color: var(--accent-2); box-shadow: var(--cs-box); }

@container page (max-width: 640px) {
  .board-head { min-height: 236px; }
  .board-head-text { padding: 24px 18px 88px; }
  .board-title { padding-left: 12px; font-size: 34px; letter-spacing: .1em; }
  .board-tagline { max-width: 84%; padding-left: 16px; font-size: 13px; letter-spacing: .16em; }
  .board-head:not(.has-art) .board-head-text::before { left: 12%; width: 150%; top: calc(100% - 66px); }
  .board-head:not(.has-art) .board-head-text::after { right: -150px; top: 44px; width: 320px; height: 128px; opacity: .75; }
  .board-nav { padding: 0 4px; }
  .board-nav a { padding: 11px 10px; font-size: 13.5px; letter-spacing: .14em; }
  .topic-name { font-size: 24px; }
  .portrait.big.portrait-empty span { font-size: 60px; }
  .mini-card { box-shadow: 0 0 0 1px var(--bg), var(--cs-box), 0 22px 50px -8px rgba(0, 0, 0, .8); }
}
@media (prefers-reduced-motion: reduce) {
  .board-head-text, .board-date::before, .unread-dot { animation: none; }
  .mini-card { transform: none; transition: none; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
