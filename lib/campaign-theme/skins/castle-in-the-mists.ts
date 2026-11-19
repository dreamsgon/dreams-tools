/*
 * Castle in the Mists: a fully custom skin, inspired by Ravenloft and Curse of Strahd. Gothic horror in fog, iron and
 * a single red. The banner is a castle on a crag over a line of pines, with mist drifting across its foot, all drawn
 * with gradients (no picture, nothing from the books). Dark is a blood moon behind the castle; light is a grey
 * morning in the valley, with panels edged like mourning cards. Portraits stand in pointed arches, headings are in
 * blackletter after a drop of blood, and a red line bleeds across a row under the pointer. Like every skin, its
 * stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --cm-sky: linear-gradient(180deg, #a4a8b4 0%, #c6c8ce 50%, #e6e5e2 100%);
  --cm-stars: none;
  --cm-moon: radial-gradient(circle closest-side, rgba(255, 255, 255, .95) 0 28%, rgba(255, 255, 255, .42) 31%, transparent 100%);
  --cm-moon-at: right 90px top -44px;
  --cm-rock: #383a45;
  --cm-pine: #555862;
  --cm-window: #a3151c;
  --cm-fog: rgba(244, 244, 242, .96);
  --cm-fog-2: rgba(228, 228, 226, .72);
  --cm-title: #17151a;
  --cm-title-shadow: 0 1px 0 rgba(255, 255, 255, .6);
  --cm-banner-ink: #1c1a1d;
  --cm-banner-quiet: #3b3842;
  --cm-nav: rgba(237, 235, 232, .86);
  --cm-iron: #8a8680;
  --cm-iron-soft: #c6c2bb;
  --cm-slab: linear-gradient(180deg, #f2f0ed, #e9e7e3);
  --cm-page: radial-gradient(80% 420px at 50% 0%, rgba(255, 255, 255, .75), transparent 70%);
  --cm-shadow: 0 16px 34px -18px rgba(20, 18, 24, .5);
  --cm-plaque: linear-gradient(180deg, #19191f, #0e0e12); --cm-plaque-ink: #dcd9d4; --cm-plaque-quiet: #a5a1ab; --cm-plaque-red: #dc4a50; --cm-plaque-line: #3d3c47;
  --card-bg: var(--cm-plaque); --card-ink: var(--cm-plaque-ink); --card-head: var(--cm-plaque-ink); --card-line: var(--cm-plaque-line);
}
:root[data-theme="dark"] {
  --cm-sky: linear-gradient(180deg, #040407 0%, #0b0b11 48%, #181018 100%);
  --cm-stars: radial-gradient(1px 1px at 6% 16%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 17% 34%, #c9cfe0 50%, transparent 51%), radial-gradient(1.5px 1.5px at 29% 11%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 41% 27%, #c9cfe0 50%, transparent 51%), radial-gradient(1px 1px at 52% 8%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 96% 20%, #c9cfe0 50%, transparent 51%);
  --cm-moon: radial-gradient(circle closest-side, #e5524f 0%, #bd2027 24%, #8f131a 34%, rgba(208, 56, 62, .42) 35.5%, rgba(208, 56, 62, .13) 60%, transparent 100%);
  --cm-rock: #040406;
  --cm-pine: #08080b;
  --cm-window: #ff6a52;
  --cm-fog: rgba(176, 184, 202, .3);
  --cm-fog-2: rgba(140, 148, 172, .2);
  --cm-title: #ece8e2;
  --cm-title-shadow: 0 2px 18px rgba(0, 0, 0, .9);
  --cm-banner-ink: #dcd9d4;
  --cm-banner-quiet: #b9b5c2;
  --cm-nav: rgba(6, 6, 9, .72);
  --cm-iron: #3d3c47;
  --cm-iron-soft: #26252d;
  --cm-slab: linear-gradient(180deg, #18181d, #111115);
  --cm-page: radial-gradient(90% 460px at 50% 0%, rgba(120, 128, 150, .15), transparent 72%);
  --cm-shadow: 0 18px 40px -16px rgba(0, 0, 0, .9);
}`;

const KEYFRAMES = `@keyframes cm-drift { to { transform: translateX(-50%); } }
@keyframes cm-pulse { 50% { opacity: .35; } }`;

const ROCK = "var(--cm-rock)";
/** A block of stone, measured from the left and the bottom of the castle's box. */
const stone = (x: number, y: number, w: number, h: number) => `linear-gradient(${ROCK}, ${ROCK}) left ${x}px bottom ${y}px / ${w}px ${h}px no-repeat`;
/** A pointed roof (or a peak of rock): a wedge that widens downward from its tip. */
const peak = (x: number, y: number, w: number, h: number, colour = ROCK, repeat = "no-repeat") => {
  const half = Math.atan(w / 2 / h) * 180 / Math.PI;
  return `conic-gradient(from ${(180 - half).toFixed(1)}deg at 50% 0, ${colour} 0 ${(half * 2).toFixed(1)}deg, transparent ${(half * 2 + 0.6).toFixed(1)}deg) left ${x}px bottom ${y}px / ${w}px ${h}px ${repeat}`;
};
const battlements = (x: number, y: number, w: number) => `repeating-linear-gradient(90deg, ${ROCK} 0 6px, transparent 6px 10px) left ${x}px bottom ${y}px / ${w}px 6px no-repeat`;
/** The castle on its crag, in a box 380 by 262: one lit window, towers and their roofs, the keep, the wall, then the rock. */
const CASTLE = [
  `radial-gradient(closest-side, var(--cm-window) 0 60%, transparent 100%) left 239px bottom 190px / 7px 11px no-repeat`,
  peak(227, 225, 32, 37), stone(232, 120, 22, 105),
  peak(172, 200, 26, 28), stone(176, 120, 18, 80),
  peak(258, 174, 24, 24), stone(262, 112, 16, 62),
  peak(154, 160, 22, 20), stone(158, 115, 14, 45),
  battlements(190, 180, 70), stone(190, 120, 70, 60),
  battlements(150, 130, 140), stone(150, 108, 140, 22),
  peak(150, 0, 200, 170), peak(0, 0, 380, 140), peak(40, 0, 150, 84), peak(250, 0, 130, 70),
].join(", ");
/** The line of pines along the bottom: three sizes, overlapping so no two neighbours match. */
const PINE = "var(--cm-pine)";
const PINES = [peak(9, 0, 35, 62, PINE, "repeat-x"), peak(0, 0, 24, 46, PINE, "repeat-x"), peak(4, 0, 15, 30, PINE, "repeat-x")].join(", ");
/** The mist: soft banks along the bottom, twice as wide as its banner so it can drift across and loop. */
const MIST = "radial-gradient(42% 68% at 18% 100%, var(--cm-fog), transparent 72%) 0 0 / 50% 100% repeat-x, radial-gradient(36% 48% at 52% 100%, var(--cm-fog-2), transparent 72%) 0 0 / 50% 100% repeat-x, radial-gradient(34% 82% at 84% 100%, var(--cm-fog), transparent 72%) 0 0 / 50% 100% repeat-x, linear-gradient(0deg, var(--cm-fog) 0, transparent 46%)";
/** A small castle for a location with no picture: a tower and its roof on a hill, the moon behind it and mist below. */
const MINI = [
  "linear-gradient(0deg, var(--cm-fog) 0, transparent 38%)",
  `conic-gradient(from 153deg at 50% 0, ${ROCK} 0 54deg, transparent 54.6deg) 50% calc(100% - 64px) / 22px 22px no-repeat`,
  `linear-gradient(${ROCK}, ${ROCK}) 50% calc(100% - 22px) / 14px 44px no-repeat`,
  `conic-gradient(from 115deg at 50% 0, ${ROCK} 0 130deg, transparent 130.6deg) 50% 100% / 150px 34px no-repeat`,
  "var(--cm-moon) 50% calc(100% + 27px) / 150px 150px no-repeat", "var(--cm-sky)",
].join(", ");

/** The page behind everything: mist gathering at the top. */
const PAGE = "background: var(--cm-page), var(--bg);";
/** A panel: a slab with a line around it and a second, finer line inside, like the border of a mourning card. */
const FRAME = "border: 1px solid var(--cm-iron); border-radius: 0; outline: 1px solid var(--cm-iron-soft); outline-offset: -5px; background: var(--cm-slab);";
/** A drop of blood before a heading. */
const DROP = `content: ""; flex: none; display: inline-block; width: 9px; height: 9px; background: var(--accent); border-radius: 0 50% 50% 50%; rotate: 45deg;`;
/** Small labels: the reading face in small capitals, because blackletter is unreadable small. */
const LABEL = "font-family: var(--font-reading); font-variant: small-caps; font-weight: 600; text-transform: none; letter-spacing: .1em;";
/** Buttons that matter: blood red with an engraved line inside. */
const SEAL = "border: 1px solid var(--accent); border-radius: 0; background: var(--accent); color: var(--on-accent); box-shadow: inset 0 0 0 2px var(--accent), inset 0 0 0 3px color-mix(in srgb, var(--on-accent) 38%, transparent);";
/** A red line that bleeds across the bottom of a row under the pointer. */
const BLEED = "background: linear-gradient(var(--accent), var(--accent)) left bottom / 0 2px no-repeat, var(--cm-slab); transition: background-size .45s ease, border-color .2s;";
const BLED = "border-color: var(--accent); background-size: 100% 2px, auto;";
/** The pointed arch a portrait stands in. Percentages of its box, which is five wide by eight tall. */
const ARCH = (() => {
  const radius = 74, ratio = 250 / 400, end = Math.acos((radius - 50) / radius), spring = radius * Math.sin(end) * ratio, points: [number, number][] = [];
  for (let a = 0; a < end; a += Math.PI / 36) points.push([radius - radius * Math.cos(a), spring - radius * Math.sin(a) * ratio]);
  const left = points.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`), right = points.map(([x, y]) => `${(100 - x).toFixed(1)}% ${y.toFixed(1)}%`).reverse();
  return `polygon(0 100%, ${left.join(", ")}, 50% 0, ${right.join(", ")}, 100% 100%)`;
})();

/**
 * The castle in the mists, drawn behind `host`'s own content: the sky and the moon, pines along the bottom, the
 * castle on its crag at the right, and the mist drifting across in front of them.
 */
function mists(host: string) {
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 1px solid var(--cm-iron); border-radius: 0;
  background: ${PINES}, var(--cm-stars), var(--cm-moon) var(--cm-moon-at) / 320px 320px no-repeat, var(--cm-sky);
  color: var(--cm-banner-ink);
}
${host} > * { position: relative; z-index: 2; }
${host}::before {
  content: ""; position: absolute; z-index: 0; right: 6%; bottom: 0; width: 380px; height: 262px; pointer-events: none;
  background: ${CASTLE};
}
${host}::after {
  content: ""; position: absolute; z-index: 1; left: 0; bottom: 0; width: 200%; height: 120px; pointer-events: none;
  background: ${MIST}; animation: cm-drift 90s linear infinite;
}`;
}
/** The same banner, smaller, for a phone. */
const smallMists = (host: string) => `${host} { --cm-moon-at: right -42px top 0; }
  ${host}::before { right: 0; scale: .62; transform-origin: bottom right; }
  ${host}::after { height: 84px; }`;
const TITLE = "font-family: var(--font-display); font-weight: 400; text-transform: none; color: var(--cm-title); text-shadow: var(--cm-title-shadow);";
const STILL = (hosts: string) => `@media (prefers-reduced-motion: reduce) {\n  ${hosts} { animation: none; }\n}`;

/* The Encyclopedia: the campaign's overview gets the castle, pages read like an old book of the valley. */
const ENCYCLOPEDIA = `/* Castle in the Mists for the Encyclopedia. The colours and fonts come from the theme; this adds the castle, the mourning-card frames and the blackletter headings. */
${VARS}
body { ${PAGE} scrollbar-color: var(--cm-iron) var(--panel); }
::selection { background: var(--accent); color: #fff; }

/* The shelf down the side. */
.sidebar { border-right: 1px solid var(--cm-iron); background: var(--cm-slab); }
.csw-name b { font: 400 21px var(--font-display); letter-spacing: .02em; }
.csw-name small { font-family: var(--font-reading); font-style: italic; }
.campaign-link { border-radius: 0; border-left: 2px solid transparent; }
.campaign-link:hover { color: var(--accent); }
.campaign-link.active { border-left-color: var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent); color: var(--ink); }
.side-heading .section-toggle { ${LABEL} font-size: 15px; color: var(--muted); }
.shared-tag { border-radius: 0; border: 1px solid var(--cm-iron); background: transparent; color: var(--muted); ${LABEL} font-size: 12px; }
.tree-row { border-radius: 0; }
.tree-row:hover { background: color-mix(in srgb, var(--accent-2) 14%, transparent); }
.tree-row:has(.active), .tree-item.active { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent); color: var(--ink); box-shadow: inset 2px 0 0 var(--accent); }

/* The bar along the top. */
.topbar { border-bottom: 1px solid var(--cm-iron); background: var(--cm-slab); }
.tool-switch-brand { font-family: var(--font-reading); font-weight: 700; letter-spacing: .02em; }
.search-box { border-radius: 0; border-color: var(--cm-iron); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
.quick-hint kbd { border-radius: 0; border-color: var(--cm-iron-soft); }

/* Buttons and boxes to type in. */
.button { border-radius: 0; ${LABEL} font-size: 16px; }
.button.primary { ${SEAL} transition: filter .15s; }
.button.primary:hover { filter: brightness(1.08); }
.button:not(.primary) { border-color: var(--cm-iron); }
.button:not(.primary):hover { border-color: var(--accent); color: var(--ink); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }

/* The campaign's overview: the castle in the mists. */
${mists(".dashboard-intro")}
.dashboard-intro { min-height: 320px; align-items: flex-start; margin-bottom: 26px; padding: 34px 34px 150px; }
.dashboard-intro .eyebrow { ${LABEL} font-size: 15px; color: var(--cm-banner-quiet); }
.dashboard-intro h1 { margin-top: 6px; font-size: 62px; line-height: 1; letter-spacing: .02em; ${TITLE} }
.dashboard-intro .subtitle { max-width: 40ch; font: italic 400 18px/1.5 var(--font-reading); color: var(--cm-banner-ink); }
.dashboard-intro .icon-button { border: 1px solid var(--cm-iron); background: var(--cm-nav); color: var(--cm-banner-ink); }
.overview-strip { border-color: var(--cm-iron-soft); }
.overview-strip strong { font: 600 19px var(--font-reading); color: var(--accent); }

/* Headings: a drop of blood, the name in blackletter, then a line that fades. */
.section-heading h2 { flex: 1; display: flex; align-items: center; gap: 12px; font: 400 27px var(--font-display); letter-spacing: .02em; text-transform: none; }
.section-heading h2::before { ${DROP} }
.section-heading h2::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, var(--cm-iron), transparent); }
.eyebrow { ${LABEL} font-size: 14px; }

/* Cards: mourning cards, and a red line bleeds across under the pointer. */
.note-card { ${FRAME} ${BLEED} padding: 20px; }
.note-card:hover { ${BLED} }
.note-card h3 { font: 400 25px/1.1 var(--font-display); letter-spacing: .02em; text-transform: none; }
.note-card:hover h3 { color: var(--accent); }
.note-card .eyebrow, .card-footer { color: var(--accent-2); }
.note-card.add-card { border: 1px dashed var(--cm-iron); outline: 0; background: transparent; }

/* A page: a leaf from an old book. */
.kind-pill { padding: 1px 9px; border-radius: 0; border: 1px solid var(--accent); ${LABEL} font-size: 13px; }
.article-title h1 { font-family: var(--font-display); font-weight: 400; letter-spacing: .02em; text-transform: none; }
.tag-add, .who-button { border-radius: 0; }
.article-tabs { border-bottom: 1px solid var(--cm-iron); }
.article-tabs button { border-radius: 0; ${LABEL} font-size: 16px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent); }
.picture-panel { border-radius: 0; border-color: var(--cm-iron); }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-display); font-weight: 400; letter-spacing: .02em; }
.prose h2 { padding-bottom: 4px; border-bottom: 1px solid var(--cm-iron); }
.prose h3 { color: var(--accent); }
.prose blockquote { border-left: 2px solid var(--accent); background: color-mix(in srgb, var(--accent-2) 10%, transparent); font-style: italic; }
.prose code, .prose pre { border-radius: 0; }
.article-aside .aside-section { border-top: 1px solid var(--cm-iron); }
.article-aside .eyebrow { color: var(--accent); }

${KEYFRAMES}
@media (max-width: 640px) {
  .dashboard-intro { min-height: 270px; padding: 24px 18px 130px; }
  .dashboard-intro h1 { font-size: 40px; }
  .dashboard-intro .subtitle { max-width: 24ch; font-size: 16px; }
  ${smallMists(".dashboard-intro")}
}
${STILL(".dashboard-intro::after")}
`;

/* Maptable: iron around the table, and the Scene Picker gets the castle. */
const MAPTABLE = `/* Castle in the Mists for Maptable. The map itself keeps its own colours; everything around it is iron and fog. */
${VARS}
body { ${PAGE} scrollbar-color: var(--cm-iron) var(--panel); }
::selection { background: var(--accent); color: #fff; }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 1px solid var(--cm-iron); background: var(--cm-slab); }
.tool-switch-brand { font-family: var(--font-reading); font-weight: 700; letter-spacing: .02em; }
.header-scene strong { color: var(--accent); }
.csw-btn { border-radius: 0; }
.csw-name b { font: 400 20px var(--font-display); letter-spacing: .02em; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${SEAL} ${LABEL} font-size: 16px; transition: filter .15s; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { background: var(--accent); filter: brightness(1.08); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
input[type="range"] { accent-color: var(--accent); }

/* The tool rail: a red edge when on. */
.rail { border-right: 1px solid var(--cm-iron); background: var(--cm-slab); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--accent); }
.rail button.active { border-left: 2px solid var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 20%, transparent), transparent); color: var(--accent); }

/* The side panel. */
.side-panel { border-right: 1px solid var(--cm-iron); background: var(--cm-slab); }
.panel-title { border-bottom: 1px solid var(--cm-iron); }
.panel-title h2 { display: flex; align-items: center; gap: 10px; font: 400 24px var(--font-display); letter-spacing: .02em; text-transform: none; }
.panel-title h2::before { ${DROP} }
.organizer-scene { border-radius: 0; border-left: 2px solid transparent; white-space: normal; }
.organizer-scene:hover { background: color-mix(in srgb, var(--accent-2) 14%, transparent); }
.organizer-scene.active { border-left-color: var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 18%, transparent), transparent); }
.organizer-scene strong { font: 400 19px/1.12 var(--font-display); letter-spacing: .02em; }
.organizer-scene.active strong { color: var(--accent); }
.scene-kind { border-radius: 0; color: var(--accent-2); }

/* Around the map: fog out past the edge of the table. */
.map-topbar { border-bottom: 1px solid var(--cm-iron); background: var(--cm-slab); }
.map-title { ${LABEL} font-size: 14.5px; color: var(--muted); }
.board { background: radial-gradient(70% 60% at 50% 0%, color-mix(in srgb, var(--accent-2) 16%, transparent), transparent 70%), var(--bg); }
.board-info { ${LABEL} color: var(--accent-2); }
.zoom-controls { border-radius: 0; border-color: var(--cm-iron); }
.toolbar { border-radius: 0; border: 1px solid var(--cm-iron); background: var(--cm-slab); box-shadow: 0 0 0 4px var(--bg), 0 0 0 5px var(--cm-iron-soft), var(--cm-shadow); }
.toolbar button { border-radius: 0; ${LABEL} font-size: 15.5px; }
.toolbar button:hover { color: var(--accent); }
.toolbar button.active { background: var(--accent); color: var(--on-accent); }

/* The Scene Picker: the castle in the mists. */
${mists(".campaign-scenes-head")}
.campaign-scenes-head { min-height: 290px; align-items: flex-start; padding: 28px 28px 140px; }
.campaign-scenes-head small { ${LABEL} font-size: 15px; color: var(--cm-banner-quiet); }
.campaign-scenes-head h1 { margin-top: 4px; font-size: 54px; line-height: 1; letter-spacing: .02em; ${TITLE} }
.dashboard-continue { ${FRAME} ${BLEED} padding: 20px 28px; }
.dashboard-continue:hover { ${BLED} }
.dashboard-continue small { ${LABEL} font-size: 14.5px; color: var(--accent); }
.dashboard-continue strong { font: 400 27px var(--font-display); letter-spacing: .02em; }
.campaign-scenes-kinds button { border-radius: 0; ${LABEL} font-size: 14.5px; }
.campaign-scenes-group h2 { display: flex; align-items: center; gap: 12px; font: 400 25px var(--font-display); letter-spacing: .02em; text-transform: none; }
.campaign-scenes-group h2::before { ${DROP} }
.campaign-scenes-group h2 span { ${LABEL} font-size: 14px; }
.campaign-scene-card { border: 1px solid var(--cm-iron); border-radius: 0; ${BLEED} }
.campaign-scene-card.last { border-color: var(--accent-2); }
/* Hover: the card rises out of the fog and a red line bleeds across its foot. */
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { ${BLED} transform: translateY(-2px); box-shadow: 0 12px 22px -18px rgba(0, 0, 0, .55); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card:active { transform: none; }
.campaign-scene-card { transition: background-size .45s ease, border-color .2s, transform .18s, box-shadow .18s; }
.campaign-scene-card strong { font: 400 20px/1.15 var(--font-display); letter-spacing: .02em; }
.campaign-scene-card em { font: italic 400 13.5px var(--font-reading); color: var(--accent); }
.campaign-scene-card small { font-family: var(--font-reading); font-size: 14px; }
.campaign-scene-picture { border-bottom: 1px solid var(--cm-iron); }

${KEYFRAMES}
@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 250px; padding: 22px 18px 124px; }
  .campaign-scenes-head h1 { font-size: 36px; }
  ${smallMists(".campaign-scenes-head")}
}
@media (prefers-reduced-motion: reduce) {
  .campaign-scenes-head::after { animation: none; }
  .campaign-scene-card, .campaign-scene-card:hover { transform: none; transition: none; }
}
`;

/* The campaign's dashboard: the castle behind its name, and mourning cards. */
const DASHBOARD = `/* Castle in the Mists for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--accent); color: #fff; }
.hub-crumbs { ${LABEL} font-size: 15px; }
.hub-crumbs a { color: var(--accent); }

/* The top: the castle in the mists. */
${mists(".hub-head")}
.hub-head { min-height: 340px; padding: 30px 30px 160px; }
.hub-title p { ${LABEL} font-size: 15px; color: var(--cm-banner-quiet); }
.hub-title h1 { margin-top: 4px; font-size: 64px; line-height: 1; letter-spacing: .02em; ${TITLE} }
.hub-chip { border-radius: 0; border-color: var(--cm-iron); background: var(--cm-nav); color: var(--cm-banner-quiet); ${LABEL} font-size: 13px; }
.hub-head .tag-add { border-radius: 0; border-color: var(--cm-iron); background: var(--cm-nav); color: var(--cm-banner-ink); }
.hub-head .hub-button:not(.hub-button-primary) { border-color: var(--cm-iron); background: var(--cm-nav); color: var(--cm-banner-ink); backdrop-filter: blur(4px); }

/* Buttons. */
.hub-button { border-radius: 0; ${LABEL} font-size: 16px; }
.hub-button-primary { ${SEAL} transition: filter .15s; }
.hub-button-primary:hover { filter: brightness(1.08); }
.hub-button:not(.hub-button-primary):hover { border-color: var(--accent); color: var(--ink); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 1px solid var(--cm-iron); }
.hub-tabs button, .hub-tabs a { border-radius: 0; ${LABEL} font-size: 16.5px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }
.mem-count { border-radius: 0; }

/* Cards: mourning cards. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; display: flex; align-items: center; gap: 10px; font: 400 24px var(--font-display); letter-spacing: .02em; text-transform: none; color: var(--ink); }
.hub-card-head h2::before { ${DROP} }
.hub-card-head a, .hub-card-head .hub-text-button { ${LABEL} font-size: 15px; }
.hub-scene-grid li { border-radius: 0; }

${KEYFRAMES}
@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 22px 18px 134px; }
  .hub-title h1 { font-size: 40px; }
  ${smallMists(".hub-head")}
}
${STILL(".hub-head::after")}
`;

export const CASTLE_IN_THE_MISTS: Theme = {
  id: "preset-mists", name: "Castle in the Mists", mode: "both", radius: 0, banner: "picture", fonts: { display: "pirata", reading: "spectral", ui: "inter" },
  colors: {
    light: { bg: "#dcdad6", panel: "#edebe8", raised: "#e3e1dd", line: "#b9b5ae", ink: "#1c1a1d", muted: "#55515a", accent: "#8a1218", accent2: "#3f4a63" },
    dark: { bg: "#0a0a0c", panel: "#131317", raised: "#1b1b21", line: "#33323c", ink: "#dcd9d4", muted: "#9a96a0", accent: "#d0383e", accent2: "#8f9bb3" },
  },
  css: `/* Castle in the Mists: gothic horror in fog, iron and a single red. The banner is a castle on a crag over a line of pines, with mist drifting across its foot, all drawn with gradients.
   Dark is a blood moon behind the castle; light is a grey morning in the valley. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--cm-iron) var(--panel); }
::selection { background: var(--accent); color: #fff; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border: 0; border-bottom: 1px solid var(--cm-iron); background: var(--cm-slab); }
.board-date { ${LABEL} font-size: 15px; }
.board-date::before { ${DROP} margin-right: 10px; }
.board-date b { ${LABEL} font-size: 15px; color: var(--accent); }
.circ { border-radius: 0; border-color: var(--cm-iron); background: var(--raised); color: var(--ink); font: 600 13px var(--font-reading); clip-path: polygon(0 100%, 0 38%, 50% 0, 100% 38%, 100% 100%); }
.you b { font: 400 21px var(--font-display); letter-spacing: .02em; }
.search-box { border-color: var(--cm-iron); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the sky and the moon, pines along the bottom, the castle on its crag and the mist drifting across. */
.board-head { min-height: 370px; border: 1px solid var(--cm-iron); text-align: left; }
.board-head:not(.has-art) {
  background: var(--cm-stars), var(--cm-moon) var(--cm-moon-at) / 320px 320px no-repeat, var(--cm-sky);
  --head-ink: var(--cm-banner-ink); --head-title: var(--cm-title); --head-shadow: var(--cm-title-shadow); --head-nav: var(--cm-nav); --head-line: var(--cm-iron);
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: flex-start; padding: 48px 40px 150px; overflow: hidden; }
.board-head:not(.has-art) .board-head-text { background: ${PINES}; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-head:not(.has-art) .board-head-text::before {
  content: ""; position: absolute; z-index: 0; right: 6%; bottom: 0; width: 380px; height: 262px;
  background: ${CASTLE};
}
.board-head:not(.has-art) .board-head-text::after {
  content: ""; position: absolute; z-index: 1; left: 0; bottom: 0; width: 200%; height: 120px;
  background: ${MIST}; animation: cm-drift 90s linear infinite;
}
.board-title { font: 400 70px/1 var(--font-display); letter-spacing: .02em; text-transform: none; }
.board-tagline { display: flex; align-items: center; gap: 12px; margin-top: 12px; font: italic 400 21px var(--font-reading); color: var(--cm-banner-quiet); }
.board-tagline::before { ${DROP} }
.board-nav { justify-content: flex-start; padding: 0 22px; border-top: 1px solid var(--cm-iron); background: var(--head-nav); backdrop-filter: blur(5px); }
.board-nav a { padding: 11px 18px; ${LABEL} font-size: 17px; }
.board-nav a:hover { color: var(--accent); border-bottom-color: var(--accent); }
/* With a banner picture: the picture under fog and shadow, the same blackletter title over it. */
.board-head.has-art {
  background: linear-gradient(180deg, rgba(6, 6, 9, .55) 0%, rgba(6, 6, 9, .1) 38%, rgba(6, 6, 9, .3) 64%, rgba(6, 6, 9, .9) 100%), radial-gradient(120% 100% at 50% 45%, transparent 50%, rgba(0, 0, 0, .66)), var(--banner) center var(--banner-y, 50%) / cover no-repeat;
  --head-ink: #dcd9d4; --head-title: #f0ece6; --head-shadow: 0 2px 16px #000, 0 0 3px #000; --head-nav: rgba(6, 6, 9, .72); --head-line: #3d3c47;
}
.board-head.has-art .board-head-text { justify-content: center; padding: 60px 40px 70px; }
.board-head.has-art .board-tagline { color: #dcd9d4; text-shadow: 0 1px 8px #000, 0 0 2px #000; }
.board-head.has-art .board-tagline::before { background: #e0494c; }

${KEYFRAMES}

/* Headings: a drop of blood, the name in blackletter, then a line that fades. */
.category-title { gap: 12px; font: 400 29px var(--font-display); letter-spacing: .02em; text-transform: none; color: var(--ink); }
.category-title::before { ${DROP} }
.category-title::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, var(--cm-iron), transparent); }
.tag { border-radius: 0; border-color: var(--cm-iron); color: var(--muted); ${LABEL} font-size: 12.5px; text-shadow: none; }
.tag.new { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }

/* Boards and topics: slabs with an iron edge. Under the pointer the edge turns red and a red line bleeds across the foot. */
.category-forums, .topics { gap: 8px; }
.forum, .topic-row { border: 1px solid var(--cm-iron); border-left: 3px solid var(--cm-iron); border-radius: 0; ${BLEED} }
.forum:hover, .topic-row:hover { ${BLED} }
.topic-row.pinned { border-left-color: var(--accent); }
.forum-name { font: 400 27px/1.1 var(--font-display); letter-spacing: .02em; text-transform: none; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum:hover .forum-name a, .topic-row:hover .topic-title a, .forum-name a:hover, .topic-title a:hover { color: var(--accent); }
.forum-desc { font: italic 400 16.5px/1.45 var(--font-reading); }
.forum-place { ${LABEL} font-size: 13.5px; }
.forum-place a { color: var(--accent-2); }
.forum-counts b { font: 600 19px var(--font-reading); color: var(--accent); }
.last-label { ${LABEL} font-size: 13px; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 600 16px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { font: 400 23px/1.15 var(--font-display); letter-spacing: .02em; text-transform: none; }
.topic-count b { font: 600 18px var(--font-reading); color: var(--accent); }
.unread-dot { width: 9px; height: 9px; background: var(--accent); border-radius: 0 50% 50% 50%; rotate: 45deg; box-shadow: none; animation: cm-pulse 2.6s ease-in-out infinite; }
/* Small portraits stand in a pointed niche. */
.portrait.small, .portrait.tiny { border-radius: 0; border: 0; background: color-mix(in srgb, var(--accent-2) 26%, var(--raised)); color: var(--ink); font-family: var(--font-reading); font-weight: 600; box-shadow: none; clip-path: polygon(0 100%, 0 38%, 50% 0, 100% 38%, 100% 100%); }
.portrait.small span, .portrait.tiny span { padding-top: 22%; }
/* A location with no picture gets its own small castle. */
.forum-art { border-right: 1px solid var(--cm-iron); }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} }
.location-art { border-right: 1px solid var(--cm-iron); }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${LABEL} font-size: 14.5px; color: var(--accent); }
.location-name { font-weight: 400; font-size: 38px; letter-spacing: .02em; text-transform: none; }
.location-summary { font: italic 400 17px/1.55 var(--font-reading); }

/* Topic pages. */
.crumbs { ${LABEL} font-size: 15px; }
.crumbs a { color: var(--accent-2); }
.topic-head { ${FRAME} }
.topic-name { font: 400 40px/1.05 var(--font-display); letter-spacing: .02em; text-transform: none; }
.cast-chip, .today-chip { border-radius: 0; border-color: var(--cm-iron); }

/* Posts: mourning cards, the name in blackletter and the portrait in a pointed arch. */
.posts { gap: 22px; }
.post { ${FRAME} }
.post.fresh { border-color: var(--accent); }
.post-band, .post.flip .post-band { padding: 14px 28px 10px; border-bottom: 0; background: linear-gradient(90deg, var(--cm-iron), transparent 82%) left 28px bottom 0 / calc(100% - 56px) 1px no-repeat; }
.post-name { font: 400 31px/1 var(--font-display); letter-spacing: .02em; text-transform: none; }
.post-name a { color: var(--ink); }
.post-name a::before { ${DROP} margin-right: 12px; vertical-align: 5px; }
.post-meta { ${LABEL} font-size: 14px; }
.post-meta a { color: var(--accent-2); }
.mini-portrait { filter: drop-shadow(1px 0 0 var(--cm-iron)) drop-shadow(-1px 0 0 var(--cm-iron)) drop-shadow(0 -1px 0 var(--cm-iron)) drop-shadow(0 1px 0 var(--cm-iron)); }
.portrait.big { border: 0; clip-path: ${ARCH}; }
.portrait.big::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, transparent 55%, rgba(8, 8, 12, .5)); }
.portrait.big.portrait-empty { background: radial-gradient(circle at 50% 44%, color-mix(in srgb, var(--accent-2) 30%, transparent), transparent 62%), var(--raised); }
.portrait.big.portrait-empty span { font: 400 130px var(--font-display); color: color-mix(in srgb, var(--accent-2) 70%, var(--ink)); }
/* The character card that opens over a portrait: a black plaque in both versions, which rises into place. */
.mini-card {
  display: flex; flex-direction: column; padding: 18px; border: 1px solid var(--cm-plaque-line); border-top: 3px solid var(--cm-plaque-red);
  background: var(--cm-plaque); color: var(--cm-plaque-ink); box-shadow: var(--cm-shadow);
  transform: translateY(10px); transition: opacity .2s ease, visibility .2s, transform .2s ease;
}
.mini-portrait:hover .mini-card, .mini-portrait:focus-within .mini-card, .mini.open .mini-card, .mini-card.shown { transform: none; }
.mini-card > *, .mini-card dd { color: var(--cm-plaque-ink); }
.mini-name { font: 400 32px/1 var(--font-display); letter-spacing: .02em; text-transform: none; }
.mini-role { position: relative; margin: 4px 0 14px; padding-bottom: 16px; border-bottom: 1px solid var(--cm-plaque-line); font: italic 400 16px/1.4 var(--font-reading); color: var(--cm-plaque-quiet); }
.mini-role::after { content: ""; position: absolute; left: 0; bottom: -5px; width: 9px; height: 9px; background: var(--cm-plaque-red); border-radius: 0 50% 50% 50%; rotate: 45deg; box-shadow: 0 0 0 4px #121216; }
.mini-quote { font: italic 400 16px/1.45 var(--font-reading); color: var(--cm-plaque-quiet); opacity: 1; }
.mini-traits .chip { border-radius: 0; }
.mini-fields dt { ${LABEL} font-size: 13.5px; color: var(--cm-plaque-red); }
.mini-fields dd { font: 400 15.5px/1.4 var(--font-reading); }
.mini-link { align-self: flex-start; margin-top: auto; padding: 5px 16px; border: 1px solid var(--cm-plaque-red); color: var(--cm-plaque-ink) !important; ${LABEL} font-size: 15.5px; text-decoration: none; transition: background-color .15s; }
.mini-link:hover { background: var(--cm-plaque-red); color: #0e0e12 !important; }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${LABEL} font-size: 14px; line-height: 1.5; }
.mini-player b { color: var(--accent); }
.post-text { font: 400 18px/1.7 var(--font-reading); }
.gm-body .post-text > p:first-child::first-letter { margin: 6px 10px 0 0; font: 400 74px/.74 var(--font-display); color: var(--accent); }
.post-text blockquote { border-left: 2px solid var(--accent); background: color-mix(in srgb, var(--accent-2) 10%, transparent); }
.post-text pre { border: 1px solid var(--cm-iron-soft); background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { font-weight: 400; letter-spacing: .02em; color: var(--ink); }
.post-text h3 { font-size: 27px; }
.post-text h4 { font-size: 23px; }
.roll-card { border-radius: 0; border-color: var(--cm-iron); border-left: 3px solid var(--accent); }
.roll-group i, .roll-stamp { border-radius: 0; }
.roll-total { border-radius: 0; font: 600 17px/26px var(--font-reading); }
.post-actions { border-top: 1px solid var(--cm-iron-soft); }
.post-actions button { ${LABEL} font-size: 15px; }
.post-actions button:hover { color: var(--accent); }

/* Buttons and boxes to type in. */
.f-btn { border-radius: 0; ${LABEL} font-size: 16px; }
.f-btn:not(.ghost) { ${SEAL} color: var(--on-accent) !important; transition: filter .15s; }
.f-btn:not(.ghost):hover:not(:disabled) { filter: brightness(1.08); }
.f-btn.ghost { border-color: var(--cm-iron); background: transparent; }
.f-btn.ghost:hover:not(:disabled) { border-color: var(--accent); background: transparent; color: var(--accent) !important; }
.f-btn.small { font-size: 14.5px; }
input:not([type="checkbox"]), select, textarea { border-radius: 0; background: var(--bg); caret-color: var(--accent); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
.composer { border: 0; border-top: 1px solid var(--cm-iron); }
.composer-kind, .as-label { ${LABEL} color: var(--accent); }
.tools { border-radius: 0; background: var(--bg); }
.tools button { border-radius: 0; }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { display: flex; align-items: center; gap: 10px; font-weight: 400; font-size: 23px; letter-spacing: .02em; text-transform: none; color: var(--ink); }
.foot-cols h3::before, .foot-line h3::before { ${DROP} }
.foot-staff b { font: 400 19px var(--font-display); letter-spacing: .02em; }
.foot-stats b { font: 600 17px var(--font-reading); color: var(--accent); }
.to-top { border-radius: 0; border-color: var(--cm-iron); color: var(--accent); }

@container page (max-width: 640px) {
  .board-head { min-height: 300px; --cm-moon-at: right -42px top 0; }
  .board-head-text { padding: 26px 18px 130px; }
  .board-title { font-size: 42px; }
  .board-tagline { max-width: 78%; font-size: 17px; }
  .board-head:not(.has-art) .board-head-text::before { right: 0; scale: .62; transform-origin: bottom right; }
  .board-head:not(.has-art) .board-head-text::after { height: 84px; }
  .board-nav { padding: 0 6px; }
  .board-nav a { padding: 10px 11px; font-size: 15.5px; }
  .category-title { font-size: 25px; }
  .forum-name { font-size: 24px; }
  .topic-name { font-size: 29px; }
  .post-name { font-size: 27px; }
  .portrait.big.portrait-empty span { font-size: 64px; }
  .mini-card { box-shadow: 0 0 0 1px var(--bg), 0 22px 50px -8px rgba(0, 0, 0, .85); }
}
@media (prefers-reduced-motion: reduce) {
  .board-head-text::after, .unread-dot { animation: none; }
  .mini-card { transform: none; transition: none; }
  .forum, .topic-row { transition: none; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
