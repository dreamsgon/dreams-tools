/*
 * Neon Wire: a fully custom skin. Where the skins in presets.ts are colours, fonts and a short stylesheet, this one
 * restyles every part of the forum: a sunset over a wire grid for the banner (gradients only, no picture), boards
 * and posts with clipped corners, a holo frame on portraits and terminal type throughout. Dark is the night drive
 * and light is the same road at daybreak. Like every skin, its stylesheet goes through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --nw-sky: linear-gradient(180deg, #33237f 0%, #7d44b4 36%, #e665a6 68%, #ffb88a 100%);
  --nw-stars: none;
  --nw-haze: radial-gradient(46% 70% at 78% 100%, rgba(255, 236, 170, .55), transparent 70%);
  --nw-sun: linear-gradient(180deg, #fff3b0 0%, #ffd45e 30%, #ff8f6b 62%, #ff4fa3 100%);
  --nw-floor: #24104a;
  --nw-shine: rgba(255, 190, 120, .5);
  --nw-mist: rgba(255, 150, 222, .3);
  --nw-wire: rgba(255, 150, 222, .85);
  --nw-horizon: #ffe9a8;
  --nw-title: #ffffff;
  --nw-title-glow: 3px 3px 0 #c2107a, 6px 6px 0 rgba(36, 16, 74, .55);
  --nw-nav: rgba(36, 16, 74, .94);
  --nw-scan: rgba(104, 52, 150, .045);
  --nw-lines: rgba(104, 52, 150, .1);
  --nw-page: linear-gradient(180deg, #f7e3f0, transparent 460px);
  --nw-glow: 1px 1px 0 color-mix(in srgb, var(--accent-2) 40%, transparent);
  --nw-glow-2: none;
  --nw-box: 0 0 0 transparent;
  --card-bg: color-mix(in srgb, var(--panel) 95%, transparent); --card-ink: var(--ink); --card-head: var(--accent); --card-line: var(--accent-2);
}
:root[data-theme="dark"] {
  --nw-sky: linear-gradient(180deg, #05031a 0%, #130a36 40%, #3c1062 74%, #8f1f6f 100%);
  --nw-stars: radial-gradient(2px 2px at 6% 18%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 17% 52%, #cfd6ff 50%, transparent 51%), radial-gradient(2px 2px at 29% 12%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 46% 58%, #cfd6ff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 70% 8%, #ffd6f3 50%, transparent 51%), radial-gradient(1px 1px at 41% 34%, #ffd6f3 50%, transparent 51%), radial-gradient(1px 1px at 53% 9%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 62% 27%, #cfd6ff 50%, transparent 51%), radial-gradient(2px 2px at 95% 12%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 86% 40%, #ffd6f3 50%, transparent 51%);
  --nw-haze: radial-gradient(46% 70% at 78% 100%, rgba(255, 61, 154, .5), transparent 70%);
  --nw-sun: linear-gradient(180deg, #ffe66d 0%, #ffb23f 32%, #ff5e8a 66%, #ff2e97 100%);
  --nw-floor: #080414;
  --nw-shine: rgba(255, 94, 138, .42);
  --nw-mist: rgba(255, 61, 154, .28);
  --nw-wire: rgba(46, 230, 214, .8);
  --nw-horizon: #ff3d9a;
  --nw-title: #ff4fa6;
  --nw-title-glow: 0 0 6px #ff3d9a, 0 0 26px rgba(255, 61, 154, .75), 0 0 60px rgba(255, 61, 154, .4);
  --nw-nav: rgba(7, 4, 20, .9);
  --nw-scan: rgba(46, 230, 214, .035);
  --nw-lines: rgba(8, 4, 20, .22);
  --nw-page: radial-gradient(110% 520px at 50% 0%, #1a0b36, transparent 70%);
  --nw-glow: 0 0 6px color-mix(in srgb, var(--accent) 80%, transparent), 0 0 20px color-mix(in srgb, var(--accent) 50%, transparent);
  --nw-glow-2: 0 0 8px color-mix(in srgb, var(--accent-2) 70%, transparent);
  --nw-box: 0 0 16px color-mix(in srgb, var(--accent-2) 35%, transparent);
}
`;

const KEYFRAMES = `@keyframes nw-blink { 50% { opacity: 0; } }
@keyframes nw-pulse { 50% { opacity: .35; } }
@keyframes nw-drive { to { background-position: 0 0, 0 0, 50% 0, 0 28px, 0 0; } }`;

/** The sunset over the wire grid, drawn behind `host`'s own content: sky, a striped sun and a floor running to the horizon. */
function sunset(host: string, { floor = 70, sun = 190 }: { floor?: number; sun?: number } = {}) {
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 0;
  background: var(--nw-stars), var(--nw-haze), var(--nw-sky);
  color: #f3ecff;
}
${host} > * { position: relative; z-index: 2; }
${host}::before {
  content: ""; position: absolute; z-index: 0; right: 8%; bottom: ${floor}px; width: ${sun}px; height: ${sun}px; border-radius: 50%;
  background: var(--nw-sun); transform: translateY(27%); pointer-events: none;
  -webkit-mask-image: linear-gradient(180deg, #000 0 47%, transparent 47% 49%, #000 49% 56%, transparent 56% 59.5%, #000 59.5% 65%, transparent 65% 70%, #000 70% 100%);
  mask-image: linear-gradient(180deg, #000 0 47%, transparent 47% 49%, #000 49% 56%, transparent 56% 59.5%, #000 59.5% 65%, transparent 65% 70%, #000 70% 100%);
}
${host}::after {
  content: ""; position: absolute; z-index: 1; left: 0; right: 0; top: calc(100% - ${floor}px); height: 200px; pointer-events: none;
  border-top: 2px solid var(--nw-horizon);
  background: radial-gradient(34% 80% at 80% 0%, var(--nw-shine), transparent 70%), linear-gradient(180deg, var(--nw-mist), transparent 34%), linear-gradient(90deg, var(--nw-wire) 0 2px, transparent 2px) 50% 0 / 60px 100%, linear-gradient(180deg, var(--nw-wire) 0 2px, transparent 2px) 0 0 / 100% 28px, var(--nw-floor);
  transform-origin: 50% 0; transform: perspective(210px) rotateX(62deg);
  box-shadow: 0 -2px 22px var(--nw-horizon);
  animation: nw-drive 2.4s linear infinite;
}`;
}
/** A corner cut off the top right, the mark of every panel. */
const CUT = "clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);";
const CUT_BUTTON = "clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);";

/* The Encyclopedia: the sidebar is the console, the campaign's overview gets the sunset, pages read like terminal files. */
const ENCYCLOPEDIA = `/* Neon Wire for the Encyclopedia. The colours and fonts come from the theme; this adds the sunset, the wires and the cut corners. */
${VARS}
body { background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), var(--nw-page), var(--bg); scrollbar-color: var(--accent) var(--panel); }
::selection { background: var(--accent); color: var(--on-accent); }

/* The console down the side. */
.sidebar { border-right: 1px solid color-mix(in srgb, var(--accent-2) 45%, var(--line)); background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), var(--panel); box-shadow: 1px 0 18px -10px var(--accent-2); }
.csw-name b { font-family: var(--font-display); letter-spacing: .08em; text-transform: uppercase; }
.csw-name small { font-family: var(--font-reading); color: var(--accent-2); }
.campaign-link { border-radius: 0; border-left: 3px solid transparent; }
.campaign-link:hover { color: var(--accent-2); }
.campaign-link.active { border-left-color: var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 22%, transparent), transparent); color: var(--accent); text-shadow: var(--nw-glow); }
.side-heading .section-toggle { font: 600 11px var(--font-reading); letter-spacing: .16em; color: var(--accent-2); }
.side-heading .section-toggle::after { content: " //"; color: var(--accent); }
.shared-tag { border-radius: 0; border: 1px solid color-mix(in srgb, var(--accent-2) 50%, transparent); background: transparent; color: var(--accent-2); font-family: var(--font-reading); }
.tree-row { border-radius: 0; }
.tree-row:hover { background: color-mix(in srgb, var(--accent-2) 10%, transparent); }
.tree-row:has(.active), .tree-item.active { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 22%, transparent), transparent); color: var(--accent); }
.section-overview, .side-section .text-button { font-family: var(--font-reading); }

/* The bar along the top. */
.topbar { border-bottom: 0; background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), var(--bg); box-shadow: inset 0 -2px 0 var(--accent-2), 0 6px 22px -14px var(--accent-2); }
.save-chip { font-family: var(--font-reading); }
.search-box { border-radius: 0; border-color: var(--line-strong); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent-2); box-shadow: var(--nw-box); }
.quick-hint kbd { border-radius: 0; border-color: var(--accent-2); color: var(--accent-2); }

/* Buttons and boxes to type in. */
.button { border-radius: 0; font: 600 12px var(--font-reading); letter-spacing: .1em; text-transform: uppercase; }
.button.primary { border-color: var(--accent); ${CUT_BUTTON} transition: filter .15s; }
.button.primary:hover { filter: brightness(1.08); }
.button:not(.primary):hover { border-color: var(--accent-2); color: var(--accent-2); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent-2); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; font-family: var(--font-reading); caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: var(--nw-box); }

/* The campaign's overview: the sunset. */
${sunset(".dashboard-intro", { floor: 58, sun: 170 })}
.dashboard-intro { min-height: 250px; align-items: flex-start; margin-bottom: 26px; padding: 34px 34px 92px; }
.dashboard-intro .eyebrow { font: 600 12px var(--font-reading); letter-spacing: .14em; color: #8ff5ea; }
.dashboard-intro .eyebrow::before { content: "> "; color: var(--nw-horizon); }
.dashboard-intro h1 { font: 700 52px/1 var(--font-display); letter-spacing: .08em; text-transform: uppercase; color: var(--nw-title); text-shadow: var(--nw-title-glow); }
.dashboard-intro h1::after { content: "_"; margin-left: 2px; animation: nw-blink 1.1s steps(2) infinite; }
.dashboard-intro .subtitle { max-width: 60%; font: 400 14px var(--font-reading); color: #f3ecff; text-shadow: 0 1px 10px rgba(0, 0, 0, .6); }
.dashboard-intro .icon-button { border: 1px solid rgba(255, 255, 255, .45); background: rgba(7, 4, 20, .45); color: #fff; }
.overview-strip { border-color: var(--line-strong); font-family: var(--font-reading); }
.overview-strip strong { color: var(--accent-2); text-shadow: var(--nw-glow-2); }

/* Headings are comments in the code. */
.section-heading h2 { display: flex; align-items: center; gap: 10px; font: 600 15px var(--font-display); letter-spacing: .2em; text-transform: uppercase; color: var(--accent-2); text-shadow: var(--nw-glow-2); }
.section-heading h2::before { content: "//"; letter-spacing: 0; color: var(--accent); text-shadow: var(--nw-glow); }
.section-heading > span { font-family: var(--font-reading); }

/* Cards: one wire each, with a cut corner. */
.note-card { padding: 18px 18px 16px 20px; border: 0; border-left: 3px solid var(--accent); background: linear-gradient(90deg, var(--raised), var(--panel) 60%); ${CUT} transition: border-color .15s, background-color .15s; }
.note-card:hover { border-left-color: var(--accent-2); background: var(--raised); }
.note-card h3 { font-family: var(--font-display); letter-spacing: .08em; text-transform: uppercase; }
.note-card:hover h3 { color: var(--accent); }
.note-card p { font: 400 13px/1.55 var(--font-reading); }
.note-card .eyebrow, .card-footer { font-family: var(--font-reading); color: var(--accent-2); }
.note-card.add-card { border: 1px dashed var(--accent-2); background: transparent; clip-path: none; }
.note-card.add-card h3 { color: var(--accent-2); text-shadow: var(--nw-glow-2); }
.eyebrow { font-family: var(--font-reading); letter-spacing: .14em; }

/* A page: a terminal file. */
.article-meta { font-family: var(--font-reading); }
.kind-pill { padding: 1px 6px; border-radius: 0; border: 1px solid var(--accent); font-family: var(--font-reading); }
.article-title h1 { font-family: var(--font-display); letter-spacing: .06em; text-transform: uppercase; text-shadow: var(--nw-glow); }
.article-title h1::before { content: "> "; color: var(--accent-2); text-shadow: none; }
.tag-add, .who-button { border-radius: 0; font-family: var(--font-reading); }
.article-tabs { border-bottom: 1px solid var(--accent-2); }
.article-tabs button { border-radius: 0; font: 600 11.5px var(--font-reading); letter-spacing: .1em; text-transform: uppercase; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); background: linear-gradient(0deg, color-mix(in srgb, var(--accent) 22%, transparent), transparent); box-shadow: inset 0 -2px 0 var(--accent); text-shadow: var(--nw-glow); }
.picture-panel { border-radius: 0; border-color: var(--accent-2); ${CUT} }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-display); letter-spacing: .08em; text-transform: uppercase; color: var(--accent-2); text-shadow: var(--nw-glow-2); }
.prose h1::before, .prose h2::before, .prose h3::before { content: "// "; color: var(--accent); }
.prose a { color: var(--accent); text-underline-offset: 3px; }
.prose blockquote { border-left: 2px solid var(--accent-2); background: color-mix(in srgb, var(--accent-2) 8%, var(--raised)); }
.prose code, .prose pre { border-radius: 0; color: var(--accent-2); }
.article-aside .aside-section { border-top: 1px solid transparent; border-image: linear-gradient(90deg, var(--accent-2), transparent) 1; }
.article-aside .eyebrow { color: var(--accent-2); }
.article-aside .eyebrow::before { content: "// "; color: var(--accent); }
.backlink strong { color: var(--accent); }

${KEYFRAMES}
@media (max-width: 640px) {
  .dashboard-intro { padding: 24px 18px 86px; }
  .dashboard-intro h1 { font-size: 34px; }
  .dashboard-intro::before { right: -36px; width: 120px; height: 120px; }
  .dashboard-intro .subtitle { max-width: 66%; }
}
@media (prefers-reduced-motion: reduce) {
  .dashboard-intro::after, .dashboard-intro h1::after { animation: none; }
}
`;

/* Maptable: the rail and panels are the console, the Scene Picker gets the sunset. The map itself keeps its own colours. */
const MAPTABLE = `/* Neon Wire for Maptable. The map itself keeps its own colours; everything around it joins the night drive. */
${VARS}
body { background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), var(--nw-page), var(--bg); scrollbar-color: var(--accent) var(--panel); }
::selection { background: var(--accent); color: var(--on-accent); }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 0; background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), var(--bg); box-shadow: inset 0 -2px 0 var(--accent-2), 0 6px 22px -14px var(--accent-2); }
.header-scene strong { color: var(--accent); text-shadow: var(--nw-glow); }
.csw-btn { border-radius: 0; }
.csw-name b { font-family: var(--font-display); letter-spacing: .08em; text-transform: uppercase; }
.save-chip { font-family: var(--font-reading); }

/* Buttons and boxes to type in. */
button.primary, .primary { border-radius: 0; font: 600 12px var(--font-reading); letter-spacing: .1em; text-transform: uppercase; ${CUT_BUTTON} transition: filter .15s; }
.primary:hover { filter: brightness(1.08); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent-2); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: var(--nw-box); }
input[type="range"] { accent-color: var(--accent); }

/* The tool rail: lit when on. */
.rail { border-right: 1px solid color-mix(in srgb, var(--accent-2) 45%, var(--line)); background: var(--bg); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--accent-2); }
.rail button.active { border-left: 3px solid var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 28%, transparent), transparent); color: var(--accent); filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 70%, transparent)); }

/* The side panel. */
.side-panel { border-right: 1px solid color-mix(in srgb, var(--accent-2) 45%, var(--line)); background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), var(--panel); }
.panel-title { border-bottom: 1px solid transparent; border-image: linear-gradient(90deg, var(--accent-2), transparent) 1; }
.panel-title h2 { font: 600 14px var(--font-display); letter-spacing: .2em; text-transform: uppercase; color: var(--accent-2); text-shadow: var(--nw-glow-2); }
.panel-title h2::before { content: "// "; letter-spacing: 0; color: var(--accent); text-shadow: var(--nw-glow); }
.organizer-scene { border-radius: 0; border-left: 3px solid transparent; }
.organizer-scene:hover { background: color-mix(in srgb, var(--accent-2) 10%, transparent); }
.organizer-scene.active { border-left-color: var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 24%, transparent), transparent); }
.organizer-scene strong { font-family: var(--font-display); letter-spacing: .06em; }
.organizer-scene.active strong { color: var(--accent); text-shadow: var(--nw-glow); }
.organizer-scene small, .scenes-backups summary { font-family: var(--font-reading); }
.scene-kind { border-radius: 0; color: var(--accent-2); }

/* Around the map: the wire floor, out past the edge of the map. */
.map-topbar { border-bottom: 1px solid color-mix(in srgb, var(--accent-2) 45%, var(--line)); background: var(--bg); }
.map-title { font-family: var(--font-reading); color: var(--accent-2); }
.board { background: radial-gradient(60% 50% at 50% 100%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%), linear-gradient(color-mix(in srgb, var(--accent-2) 9%, transparent) 1px, transparent 1px) 0 0 / 40px 40px, linear-gradient(90deg, color-mix(in srgb, var(--accent-2) 9%, transparent) 1px, transparent 1px) 0 0 / 40px 40px, var(--bg); }
.board-info { font-family: var(--font-reading); letter-spacing: .1em; color: var(--accent-2); }
.zoom-controls { border-radius: 0; border-color: var(--accent-2); box-shadow: var(--nw-box); }
.toolbar { border-radius: 0; border: 1px solid var(--accent-2); background: color-mix(in srgb, var(--panel) 92%, transparent); box-shadow: var(--nw-box); ${CUT_BUTTON} }
.toolbar button { border-radius: 0; font-family: var(--font-reading); letter-spacing: .04em; }
.toolbar button:hover { color: var(--accent-2); }
.toolbar button.active { background: var(--accent); color: var(--on-accent); }
.map-footer { font-family: var(--font-reading); }

/* The Scene Picker: the sunset. */
${sunset(".campaign-scenes-head", { floor: 48, sun: 150 })}
.campaign-scenes-head { min-height: 200px; align-items: flex-start; padding: 28px 28px 76px; }
.campaign-scenes-head small { font: 600 12px var(--font-reading); letter-spacing: .14em; color: #8ff5ea; }
.campaign-scenes-head small::before { content: "> "; color: var(--nw-horizon); }
.campaign-scenes-head h1 { font: 700 44px/1 var(--font-display); letter-spacing: .08em; text-transform: uppercase; color: var(--nw-title); text-shadow: var(--nw-title-glow); }
.campaign-scenes-head h1::after { content: "_"; margin-left: 2px; animation: nw-blink 1.1s steps(2) infinite; }
.campaign-scenes-back { font-family: var(--font-reading); }
.dashboard-continue { padding-left: 20px; border: 0; border-left: 3px solid var(--accent); background: linear-gradient(90deg, var(--raised), var(--panel) 60%); ${CUT} }
.dashboard-continue small { font-family: var(--font-reading); letter-spacing: .14em; color: var(--accent-2); }
.dashboard-continue strong { font-family: var(--font-display); letter-spacing: .08em; text-transform: uppercase; }
.campaign-scenes-kinds button { border-radius: 0; font-family: var(--font-reading); }
.campaign-scenes-group h2 { font: 600 14px var(--font-display); letter-spacing: .2em; text-transform: uppercase; color: var(--accent-2); }
.campaign-scenes-group h2::before { content: "// "; color: var(--accent); }
.campaign-scene-card { border-radius: 0; border-color: var(--line-strong); transition: border-color .15s, box-shadow .15s, transform .15s; }
.campaign-scene-card.last { border-color: var(--accent-2); }
/* Hover: the card lifts off a hard pink shadow, the way a cabinet button lights. */
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { border-color: var(--accent-2); background: var(--panel); transform: translate(-2px, -2px); box-shadow: 3px 3px 0 0 var(--accent); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card:active { transform: none; box-shadow: 0 0 0 1px var(--accent-2); }
.campaign-scene-card strong { font-family: var(--font-display); letter-spacing: .04em; }
.campaign-scene-card small, .campaign-scene-card span { font-family: var(--font-reading); }

${KEYFRAMES}
@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 170px; padding: 22px 18px 70px; }
  .campaign-scenes-head h1 { font-size: 30px; }
  .campaign-scenes-head::before { right: -36px; width: 110px; height: 110px; }
}
@media (prefers-reduced-motion: reduce) {
  .campaign-scenes-head::after, .campaign-scenes-head h1::after { animation: none; }
  .campaign-scene-card, .campaign-scene-card:hover { transform: none; transition: none; }
}
`;

/* The campaign's dashboard: the sunset behind its name, and cards with one wire each. */
const DASHBOARD = `/* Neon Wire for the campaign's dashboard. */
${VARS}
body { background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), var(--nw-page), var(--bg); }
::selection { background: var(--accent); color: var(--on-accent); }
.hub-crumbs { font: 12px var(--font-reading); }
.hub-crumbs a { color: var(--accent-2); }

/* The top: the sunset. */
${sunset(".hub-head", { floor: 58, sun: 180 })}
.hub-head { min-height: 260px; padding: 30px 30px 96px; }
.hub-title p { font: 600 12px var(--font-reading); letter-spacing: .14em; text-transform: uppercase; color: #8ff5ea; }
.hub-title p::before { content: "> "; color: var(--nw-horizon); }
.hub-title h1 { font: 700 54px/1 var(--font-display); letter-spacing: .08em; text-transform: uppercase; color: var(--nw-title); text-shadow: var(--nw-title-glow); }
.hub-title h1::after { content: "_"; margin-left: 2px; animation: nw-blink 1.1s steps(2) infinite; }
.hub-chip { border-radius: 0; border-color: #8ff5ea; background: rgba(7, 4, 20, .45); color: #8ff5ea; font-family: var(--font-reading); }
.hub-head .tag-add { border-radius: 0; border-color: rgba(255, 255, 255, .5); background: rgba(7, 4, 20, .45); color: #fff; font-family: var(--font-reading); }
.hub-head .hub-button:not(.hub-button-primary) { border-color: rgba(255, 255, 255, .45); background: rgba(7, 4, 20, .55); color: #fff; backdrop-filter: blur(4px); }
.hub-head .hub-button:not(.hub-button-primary):hover { border-color: #8ff5ea; color: #8ff5ea; }

/* Buttons. */
.hub-button { border-radius: 0; font: 600 12px var(--font-reading); letter-spacing: .08em; text-transform: uppercase; }
.hub-button-primary { ${CUT_BUTTON} box-shadow: none; transition: filter .15s; }
.hub-button-primary:hover { filter: brightness(1.08); }
.hub-button:not(.hub-button-primary):hover { border-color: var(--accent-2); color: var(--accent-2); }
.hub-text-button { font-family: var(--font-reading); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 1px solid var(--accent-2); }
.hub-tabs button, .hub-tabs a { border-radius: 0; font: 600 12px var(--font-reading); letter-spacing: .12em; text-transform: uppercase; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); background: linear-gradient(0deg, color-mix(in srgb, var(--accent) 22%, transparent), transparent); text-shadow: var(--nw-glow); }
.mem-count { border-radius: 0; font-family: var(--font-reading); }

/* Cards: one wire each, with a cut corner. */
.hub-card { border: 0; border-top: 2px solid var(--accent-2); border-radius: 0; background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), linear-gradient(180deg, var(--raised), var(--panel) 70%); ${CUT} }
.hub-card-head h2 { display: flex; align-items: center; gap: 8px; font: 600 13px var(--font-display); letter-spacing: .2em; text-transform: uppercase; color: var(--accent-2); text-shadow: var(--nw-glow-2); }
.hub-card-head h2::before { content: "//"; letter-spacing: 0; color: var(--accent); text-shadow: var(--nw-glow); }
.hub-card-head a, .hub-card-head .hub-text-button { font-family: var(--font-reading); }
.hub-card-head a:hover { color: var(--accent); }
.hub-muted { font: 400 13px/1.6 var(--font-reading); }
.hub-scene-grid li { border-radius: 0; }

${KEYFRAMES}
@media (max-width: 640px) {
  .hub-head { padding: 22px 18px 86px; }
  .hub-title h1 { font-size: 34px; }
  .hub-head::before { right: -36px; width: 120px; height: 120px; }
}
@media (prefers-reduced-motion: reduce) {
  .hub-head::after, .hub-title h1::after { animation: none; }
}
`;

export const NEON_WIRE: Theme = {
  id: "preset-neon", name: "Neon Wire", mode: "both", radius: 0, banner: "plain", fonts: { display: "chakra", reading: "mono", ui: "inter" },
  colors: {
    dark: { bg: "#07060f", panel: "#0e0b1c", raised: "#17122b", line: "#2c2450", ink: "#e4defa", muted: "#9186b8", accent: "#ff3d9a", accent2: "#2ee6d6" },
    light: { bg: "#efe6f5", panel: "#fbf7fd", raised: "#ebdff3", line: "#cdb9de", ink: "#1d1238", muted: "#5e5178", accent: "#c2107a", accent2: "#08757f" },
  },
  css: `/* Neon Wire: a terminal on the night drive. The banner is a sunset over a wire grid, drawn with gradients only.
   The light version is the same road at daybreak. Everything a version changes is a variable in the first two rules. */

${VARS}
body {
  background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), var(--nw-page), var(--bg);
  scrollbar-color: var(--accent) var(--panel);
}
::selection { background: var(--accent); color: var(--on-accent); }
a { text-underline-offset: 3px; }

/* The strip above the banner reads like a status line. */
.board-bar { border: 0; border-top: 2px solid var(--accent-2); background: var(--panel); font-family: var(--font-reading); }
.board-date { font: 12px var(--font-reading); letter-spacing: .04em; }
.board-date::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 9px; border-radius: 50%; background: var(--accent); box-shadow: var(--nw-glow); animation: nw-pulse 2.4s ease-in-out infinite; }
.board-date b { font: 600 12px var(--font-reading); letter-spacing: .06em; color: var(--accent-2); }
.circ { border-radius: 2px; border-color: var(--accent-2); background: transparent; color: var(--accent-2); font-family: var(--font-reading); }
.you b { font-family: var(--font-display); letter-spacing: .08em; text-transform: uppercase; }
.wait-count { border-radius: 0; font-family: var(--font-reading); }
.search-box { border-color: var(--line-strong); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent-2); box-shadow: var(--nw-box); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: sky, sun and a wire floor that runs to the horizon. */
.board-head { min-height: 310px; border: 0; text-align: left; }
.board-head:not(.has-art) {
  background: var(--nw-stars), var(--nw-haze), var(--nw-sky);
  --head-ink: #f3ecff; --head-title: var(--nw-title); --head-shadow: var(--nw-title-glow); --head-nav: var(--nw-nav); --head-line: var(--nw-horizon);
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 30px 30px 112px; overflow: hidden; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-head:not(.has-art) .board-head-text::before {
  content: ""; position: absolute; z-index: 0; right: 9%; bottom: 92px; width: 230px; height: 230px; border-radius: 50%;
  background: var(--nw-sun); transform: translateY(27%);
  -webkit-mask-image: linear-gradient(180deg, #000 0 47%, transparent 47% 49%, #000 49% 56%, transparent 56% 59.5%, #000 59.5% 65%, transparent 65% 70%, #000 70% 100%);
  mask-image: linear-gradient(180deg, #000 0 47%, transparent 47% 49%, #000 49% 56%, transparent 56% 59.5%, #000 59.5% 65%, transparent 65% 70%, #000 70% 100%);
}
.board-head:not(.has-art) .board-head-text::after {
  content: ""; position: absolute; z-index: 1; left: 0; right: 0; top: calc(100% - 92px); height: 200px;
  border-top: 2px solid var(--nw-horizon);
  background: radial-gradient(34% 80% at 80% 0%, var(--nw-shine), transparent 70%), linear-gradient(180deg, var(--nw-mist), transparent 34%), linear-gradient(90deg, var(--nw-wire) 0 2px, transparent 2px) 50% 0 / 60px 100%, linear-gradient(180deg, var(--nw-wire) 0 2px, transparent 2px) 0 0 / 100% 28px, var(--nw-floor);
  transform-origin: 50% 0; transform: perspective(210px) rotateX(62deg);
  box-shadow: 0 -2px 22px var(--nw-horizon);
  animation: nw-drive 2.4s linear infinite;
}
.board-title { font: 700 54px/1 var(--font-display); letter-spacing: .08em; }
.board-title a::after { content: "_"; margin-left: 2px; animation: nw-blink 1.1s steps(2) infinite; }
.board-tagline { margin-top: 12px; font: 400 14px var(--font-reading); color: #8ff5ea; text-shadow: 0 1px 10px rgba(0, 0, 0, .6); }
.board-tagline::before { content: "> "; color: var(--nw-horizon); }
.board-nav { justify-content: flex-start; padding: 0 14px; border-top: 0; background: repeating-linear-gradient(0deg, rgba(255, 255, 255, .03) 0 1px, transparent 1px 3px), var(--head-nav); }
.board-nav a { padding: 12px 16px; font: 600 12px var(--font-reading); letter-spacing: .12em; }
.board-nav a::before { content: "/"; margin-right: 3px; color: var(--nw-horizon); }
.board-nav a:hover { color: #8ff5ea; border-bottom-color: #8ff5ea; }

${KEYFRAMES}

/* Headings are comments in the code. */
.category-title { gap: 10px; font-size: 14px; letter-spacing: .2em; color: var(--accent-2); text-shadow: var(--nw-glow-2); }
.category-title::before { content: "//"; letter-spacing: 0; color: var(--accent); text-shadow: var(--nw-glow); }
.category-title::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, var(--accent-2), transparent); }
.tag { border-radius: 0; border-color: color-mix(in srgb, var(--accent-2) 50%, transparent); color: var(--accent-2); font: 600 10px var(--font-reading); text-shadow: none; }
.tag.new { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }

/* Boards and topics: one wire each, with a clipped corner. */
.category-forums, .topics { gap: 6px; }
.forum, .topic-row {
  border: 0; border-left: 3px solid var(--accent);
  background: linear-gradient(90deg, var(--raised), var(--panel) 46%);
  clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%);
  transition: border-color .15s, background-color .15s;
}
.forum:hover, .topic-row:hover { border-left-color: var(--accent-2); background: var(--raised); }
.topic-row.pinned { border-left: 3px solid var(--accent-2); }
.forum-name { font-size: 19px; letter-spacing: .1em; text-transform: uppercase; }
.forum-name a:hover, .topic-title a:hover { color: var(--accent); }
.forum-desc { margin-top: 5px; font: 400 13px/1.5 var(--font-reading); }
.forum-place { font: 11px var(--font-reading); letter-spacing: .06em; text-transform: uppercase; }
.forum-place a { color: var(--accent-2); }
.forum-counts, .topic-row .topic-counts { font-family: var(--font-reading); }
.forum-counts b { color: var(--accent-2); text-shadow: var(--nw-glow-2); }
.last-label { font-family: var(--font-reading); color: var(--accent-2); }
.forum-last a, .foot-list a { color: var(--ink); font: 600 14px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.forum-last small, .topic-last small, .foot-list small { font-family: var(--font-reading); font-size: 11px; }
.topic-title { font-size: 16px; letter-spacing: .08em; text-transform: uppercase; }
.topic-last b { font: 600 13px var(--font-reading); }
.unread-dot { border-radius: 0; background: var(--accent-2); box-shadow: var(--nw-glow-2); animation: nw-pulse 1.8s ease-in-out infinite; }
.portrait.small, .portrait.tiny { border-radius: 0; border: 0; box-shadow: none; background: var(--accent-2); color: var(--bg); clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%); }
/* A location with no picture gets its own small sunset, drawn to fit whatever shape the picture's box takes. */
.forum-art { border-right: 1px solid var(--accent-2); }
.forum-art:not([style]), .location-art.portrait-empty { position: relative; overflow: hidden; background: var(--nw-stars), var(--nw-sky); }
.forum-art:not([style]) { container-type: size; }
.forum-art:not([style])::before, .location-art.portrait-empty::before {
  content: ""; position: absolute; left: 50%; top: 68%; width: 56px; width: min(72cqw, 84cqh); aspect-ratio: 1; translate: -50% -60%; border-radius: 50%;
  background: var(--nw-sun);
  -webkit-mask-image: linear-gradient(180deg, #000 0 38%, transparent 38% 40.5%, #000 40.5% 47%, transparent 47% 50.5%, #000 50.5% 55%, transparent 55% 60%, #000 60% 100%);
  mask-image: linear-gradient(180deg, #000 0 38%, transparent 38% 40.5%, #000 40.5% 47%, transparent 47% 50.5%, #000 50.5% 55%, transparent 55% 60%, #000 60% 100%);
}
.forum-art:not([style])::after, .location-art.portrait-empty::after {
  content: ""; position: absolute; left: -40%; right: -40%; top: 68%; height: 120%;
  border-top: 2px solid var(--nw-horizon);
  background: linear-gradient(180deg, var(--nw-mist), transparent 30%), linear-gradient(90deg, var(--nw-wire) 0 1px, transparent 1px) 50% 0 / 22px 100%, linear-gradient(180deg, var(--nw-wire) 0 1px, transparent 1px) 0 0 / 100% 12px, var(--nw-floor);
  transform-origin: 50% 0; transform: perspective(90px) rotateX(58deg);
  box-shadow: 0 -1px 12px var(--nw-horizon);
}
.location-art.portrait-empty::before { width: 136px; }

/* A location's own page. */
.location { border: 0; border-left: 3px solid var(--accent-2); background: linear-gradient(90deg, var(--raised), var(--panel) 60%); clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%); }
.location-art { border-right: 1px solid var(--accent-2); }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { font: 600 11px var(--font-reading); letter-spacing: .14em; color: var(--accent-2); }
.location-name { letter-spacing: .08em; text-transform: uppercase; text-shadow: var(--nw-glow); }
.location-summary { font: 400 14px/1.6 var(--font-reading); }
.location-now { font: 12px var(--font-reading); }
.topic-main > small { font: 400 12px var(--font-reading); }
.topic-count { font-family: var(--font-reading); }
.topic-count b { color: var(--accent-2); text-shadow: var(--nw-glow-2); }

/* Topic pages. */
.crumbs { font: 12px var(--font-reading); }
.crumbs a { color: var(--accent-2); }
.topic-head { border: 0; border-left: 3px solid var(--accent); background: linear-gradient(90deg, var(--raised), var(--panel) 60%); }
.topic-head::before { content: "// thread file"; display: block; margin-bottom: 6px; font: 11px var(--font-reading); letter-spacing: .14em; text-transform: uppercase; color: var(--accent-2); }
.topic-name { font-size: 30px; letter-spacing: .08em; text-transform: uppercase; text-shadow: var(--nw-glow); }
.topic-head > .muted, .turn-line { font-family: var(--font-reading); font-size: 12px; }
.cast-chip, .today-chip { border-radius: 0; border-color: var(--line-strong); font-family: var(--font-reading); font-size: 12px; }

/* Posts: a wire frame with two corners cut, and a holo frame on the portrait. */
.posts { gap: 20px; }
.post { padding: 1px; border: 0; background: var(--line-strong); clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px)); }
.post.fresh { background: var(--accent); }
.post-band, .post.flip .post-band { padding: 10px 22px; border-bottom: 1px solid var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 16%, var(--raised)), var(--raised) 60%); clip-path: polygon(0 0, calc(100% - 17.4px) 0, 100% 17.4px, 100% 100%, 0 100%); }
.post.flip .post-band { background: linear-gradient(270deg, color-mix(in srgb, var(--accent) 16%, var(--raised)), var(--raised) 60%); }
.post-grid { background: var(--panel); clip-path: polygon(0 0, 100% 0, 100% 100%, 17.4px 100%, 0 calc(100% - 17.4px)); }
.post:has(.composer), .post:has(.composer) .post-grid, .post:has(.composer) .post-band { clip-path: none; }
.post-name { font-size: 22px; letter-spacing: .1em; text-shadow: var(--nw-glow); }
.post-name a::before { content: "> "; color: var(--accent-2); text-shadow: none; }
.post-meta { font: 11px var(--font-reading); letter-spacing: .04em; }
.post-meta a { color: var(--accent-2); }
.mini-portrait::before, .mini-portrait::after { content: ""; position: absolute; z-index: 3; width: 26px; height: 26px; pointer-events: none; }
.mini-portrait::before { top: -5px; left: -5px; border-top: 2px solid var(--accent-2); border-left: 2px solid var(--accent-2); }
.mini-portrait::after { right: -5px; bottom: -5px; border-right: 2px solid var(--accent); border-bottom: 2px solid var(--accent); }
.portrait.big { border-color: var(--line-strong); }
.portrait.big::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, var(--nw-lines) 0 1px, transparent 1px 3px), linear-gradient(180deg, transparent 55%, color-mix(in srgb, var(--accent) 30%, transparent)); }
.portrait.big.portrait-empty { background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--accent-2) 30%, transparent), transparent 58%), linear-gradient(var(--line) 1px, transparent 1px) 0 0 / 100% 25px, linear-gradient(90deg, var(--line) 1px, transparent 1px) 0 0 / 25px 100%, var(--raised); }
.portrait.big.portrait-empty span { font-size: 130px; color: transparent; -webkit-text-stroke: 2px var(--accent); text-shadow: 0 0 26px color-mix(in srgb, var(--accent) 60%, transparent); }
/* The character card that opens over a portrait: an ID file that slides up into place. */
.mini-card {
  display: flex; flex-direction: column; border: 1px solid var(--accent-2); border-top: 3px solid var(--accent);
  background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, var(--panel)), var(--panel) 96px);
  box-shadow: var(--nw-box), 0 18px 40px -14px rgba(0, 0, 0, .7);
  transform: translateY(10px); transition: opacity .18s ease, visibility .18s, transform .18s ease;
}
.mini-portrait:hover .mini-card, .mini-portrait:focus-within .mini-card, .mini.open .mini-card, .mini-card.shown { transform: none; }
.mini-card::before { content: "// ID FILE"; flex: none; margin-bottom: 8px; font: 600 10px var(--font-reading); letter-spacing: .2em; color: var(--accent-2); text-shadow: var(--nw-glow-2); }
.mini-role { border-bottom: 0; border-image: linear-gradient(90deg, var(--accent-2), transparent) 1; border-bottom: 1px solid; }
.mini-fields dt { font-family: var(--font-reading); color: var(--accent-2); }
.mini-link { align-self: flex-start; margin-top: auto; padding: 6px 12px; border: 1px solid var(--accent); font: 600 11px var(--font-reading); letter-spacing: .1em; text-transform: uppercase; text-decoration: none; transition: background-color .15s, color .15s; }
.mini-link:hover { background: var(--accent); color: var(--on-accent) !important; }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-name { text-shadow: var(--nw-glow); }
.mini-role, .mini-quote { font: 400 13px/1.5 var(--font-reading); }
.mini-fields dd { font: 400 13px/1.4 var(--font-reading); }
.mini-player { font: 11px/1.6 var(--font-reading); letter-spacing: .06em; text-transform: uppercase; }
.mini-player b { color: var(--accent-2); }
.post-text { font: 400 15px/1.8 var(--font-reading); }
.post-text blockquote { border-left: 2px solid var(--accent-2); background: color-mix(in srgb, var(--accent-2) 8%, var(--raised)); font-style: normal; }
.post-text pre { border: 1px solid var(--line); background: var(--bg); color: var(--accent-2); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { text-transform: uppercase; letter-spacing: .1em; }
.roll-card { border-radius: 0; font-family: var(--font-reading); }
.roll-group i, .roll-total, .roll-stamp { border-radius: 0; font-family: var(--font-reading); }
.post-actions { border-top: 1px dashed var(--line-strong); }
.post-actions button { font: 600 11px var(--font-reading); letter-spacing: .1em; }
.post-actions button:hover { color: var(--accent-2); }

/* Buttons and boxes to type in. */
.f-btn { border-radius: 0; font: 600 12px var(--font-reading); letter-spacing: .1em; text-transform: uppercase; }
.f-btn:not(.ghost) { border-color: var(--accent); background: var(--accent); clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px); transition: filter .15s; }
.f-btn:not(.ghost):hover:not(:disabled) { filter: brightness(1.08); }
.f-btn.ghost { border-color: var(--line-strong); }
.f-btn.ghost:hover:not(:disabled) { border-color: var(--accent-2); color: var(--accent-2) !important; }
.f-btn.small { font-size: 11px; }
input:not([type="checkbox"]), select, textarea { border-radius: 0; background: var(--bg); font-family: var(--font-reading); caret-color: var(--accent); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: var(--nw-box); }
textarea { font: 15px/1.7 var(--font-reading); }
.composer { border: 0; border-top: 2px solid var(--accent-2); }
.composer-kind, .as-label { font-family: var(--font-reading); color: var(--accent-2); }
.tools { border-radius: 0; background: var(--bg); }
.tools button { border-radius: 0; font-family: var(--font-reading); }

/* The foot of the forum. */
.board-foot { border: 0; border-top: 2px solid var(--accent); background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), var(--panel); box-shadow: 0 -10px 34px -18px var(--accent); }
.foot-cols h3, .foot-line h3 { letter-spacing: .18em; color: var(--accent-2); }
.foot-cols h3::before, .foot-line h3::before { content: "//"; letter-spacing: 0; color: var(--accent); }
.foot-line h3 small { font: 400 12px var(--font-reading); }
.foot-staff b { font-family: var(--font-display); letter-spacing: .08em; text-transform: uppercase; }
.foot-stats { font: 11.5px var(--font-reading); }
.foot-stats b { color: var(--accent-2); }
.foot-names, .foot-legend { font-family: var(--font-reading); font-size: 13px; }
.link-btn { font-family: var(--font-reading); }
.to-top { border-radius: 0; border-color: var(--accent-2); color: var(--accent-2); box-shadow: var(--nw-box); }

@container page (max-width: 640px) {
  .board-head { min-height: 250px; }
  .board-head-text { padding: 24px 18px 104px; }
  .board-title { font-size: 34px; }
  .board-head:not(.has-art) .board-head-text::before { right: -46px; width: 160px; height: 160px; }
  .board-tagline { max-width: 66%; }
  .portrait.big.portrait-empty span { font-size: 64px; }
  .mini-card { background: repeating-linear-gradient(0deg, var(--nw-scan) 0 1px, transparent 1px 3px), linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, var(--panel)), var(--panel) 96px); box-shadow: 0 0 0 1px var(--bg), var(--nw-box), 0 22px 50px -8px rgba(0, 0, 0, .85); }
  .mini-portrait::before, .mini-portrait::after { width: 16px; height: 16px; }
  .location-art.portrait-empty::before { width: 112px; }
  .board-nav { padding: 0 4px; }
  .board-nav a { padding: 11px 10px; }
  .topic-name { font-size: 22px; }
}
@media (prefers-reduced-motion: reduce) {
  .board-head-text::after, .board-title a::after, .board-date::before, .unread-dot { animation: none; }
  .mini-card { transform: none; transition: none; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
