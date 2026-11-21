/*
 * Agora: a fully custom skin, inspired by ancient Greece. White marble, Aegean blue and a little gold, with the Greek
 * key (the meander) running along every band, fluted columns down the side of every row and, in the banner, the
 * Aegean with its islands and the sun setting into it: by day a pale sun, by night the moon and stars. Portraits stand as grave stelae with
 * a pediment on top, small portraits are coins, and the character card is painted like black-figure pottery: black on
 * terracotta. All gradients, no pictures. Nothing glows and nothing moves. Like every skin, its stylesheets go through
 * the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --ag-sky: linear-gradient(180deg, #8fbfe4 0%, #c6dff0 58%, #efeadf 100%);
  --ag-sun: radial-gradient(circle closest-side, #fffdf3 0 46%, rgba(255, 240, 190, .5) 58%, rgba(255, 240, 190, 0) 100%);
  --ag-star: transparent;
  --ag-sea: linear-gradient(180deg, #3478b6 0%, #1b4d87 100%);
  --ag-wave: rgba(255, 255, 255, .2);
  --ag-isle: #8fb1cb;
  --ag-rock: #cbbb98; --ag-rock-2: #ae9c78;
  --ag-marble: #fbf8f1; --ag-shade: #d7ccb6; --ag-flute: #e7dece; --ag-cella: #b8aa8e;
  --ag-title: #12305a; --ag-title-shadow: 0 1px 0 rgba(255, 255, 255, .6); --ag-banner-ink: #1d3557;
  --ag-band: #f5f0e5; --ag-nav: #12305a; --ag-nav-ink: #f6f1e4;
  --ag-key: #1f5aa0; --ag-key-soft: #d8cdb8;
  --ag-panel: #fbf9f4; --ag-line: #d8cdb9; --ag-rule: #b9ab90;
  --ag-column: #ece4d5; --ag-groove: #d3c7b0;
  --ag-btn: #1f5aa0; --ag-btn-ink: #ffffff; --ag-btn-line: rgba(255, 255, 255, .4);
  --ag-coin: #c9a14a; --ag-coin-hi: #ecd28c; --ag-coin-ink: #3a2a08;
  --ag-clay: #cf7b46; --ag-figure: #1a120c; --ag-figure-quiet: #2e1a0f;
  --ag-shadow: 0 14px 30px -20px rgba(30, 40, 60, .45);
  --card-bg: var(--ag-clay); --card-ink: var(--ag-figure); --card-head: var(--ag-figure); --card-line: var(--ag-figure);
}
:root[data-theme="dark"] {
  --ag-sky: linear-gradient(180deg, #050b18 0%, #0c1c37 62%, #1b3254 100%);
  --ag-sun: radial-gradient(circle closest-side, #eef1f5 0 40%, rgba(214, 226, 245, .14) 52%, rgba(214, 226, 245, 0) 100%);
  --ag-star: rgba(236, 240, 250, .9);
  --ag-sea: linear-gradient(180deg, #112a4c 0%, #06132a 100%);
  --ag-wave: rgba(190, 210, 245, .1);
  --ag-isle: #17294a;
  --ag-rock: #1b2639; --ag-rock-2: #131b2b;
  --ag-marble: #d9dfe8; --ag-shade: #8a97ad; --ag-flute: #b5bfce; --ag-cella: #26324b;
  --ag-title: #e9c46a; --ag-title-shadow: 0 2px 14px rgba(0, 0, 0, .7); --ag-banner-ink: #dfe5ee;
  --ag-band: #0b1628; --ag-nav: #050b16; --ag-nav-ink: #e9e3d2;
  --ag-key: #c9a24a; --ag-key-soft: #263856;
  --ag-panel: #0f1b2e; --ag-line: #2a3d5c; --ag-rule: #3d5478;
  --ag-column: #1b2a43; --ag-groove: #13203a;
  --ag-btn: #e3bb55; --ag-btn-ink: #0a1422; --ag-btn-line: rgba(10, 20, 34, .35);
  --ag-shadow: 0 18px 40px -16px rgba(0, 0, 0, .9);
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

/**
 * The Greek key: a hook that turns in on itself, repeated along a band, drawn on a grid six strokes square. Each row
 * of the grid is one stripe repeated across, so `s` (the stroke) sets the whole size. `edge` and `off` say where the
 * band sits.
 */
const meander = (colour: string, s: number, edge: "top" | "bottom" = "top", off = 0) => {
  const rows: [number, number][][] = [[[0, 5]], [[0, 1], [4, 5]], [[0, 1], [2, 3], [4, 5]], [[0, 1], [2, 5]], [[0, 1]], [[0, 6]]];
  return rows.map((cells, k) => {
    const stops = cells.map(([a, b]) => `transparent ${a * s}px, ${colour} ${a * s}px ${b * s}px, transparent ${b * s}px`).join(", ");
    const at = edge === "top" ? `top ${off + k * s}px` : `bottom ${off + (5 - k) * s}px`;
    return `linear-gradient(90deg, ${stops}) left 0 ${at} / ${6 * s}px ${s}px repeat-x`;
  }).join(", ");
};

/** A wedge rising to a point: `apex` is how far along its box the point sits. Islands and the pediment are wedges. */
const peak = (colour: string, x: number, w: number, h: number, apex: number, y = 0) => {
  const left = Math.atan(apex * w / h) * 180 / Math.PI, right = Math.atan((1 - apex) * w / h) * 180 / Math.PI;
  return `conic-gradient(from ${(180 - right).toFixed(1)}deg at ${(apex * 100).toFixed(0)}% 0, ${colour} 0 ${(left + right).toFixed(1)}deg, transparent ${(left + right + 0.5).toFixed(1)}deg) left ${x}px bottom ${y}px / ${w}px ${h}px no-repeat`;
};
const rect = (colour: string, x: number, y: number, w: number, h: number) => `linear-gradient(${colour}, ${colour}) left ${x}px bottom ${y}px / ${w}px ${h}px no-repeat`;

/** A few stars, which only the night version shows. */
const STARS = [[6, 12, 1], [15, 30, 1.5], [24, 8, 1], [33, 22, 1], [45, 14, 1.5], [52, 34, 1], [71, 9, 1], [83, 18, 1.5], [93, 28, 1]]
  .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, var(--ag-star) 50%, transparent 100%)`).join(", ");
/** The sea along the bottom (`h` high, starting `y` up), its waves, and islands on the horizon. */
const sea = (h: number, y = 0) => [
  peak("var(--ag-isle)", 40, 260, 26, .35, y + h - 2), peak("var(--ag-isle)", 220, 180, 16, .6, y + h - 2), peak("var(--ag-isle)", 560, 220, 20, .45, y + h - 2),
  `repeating-linear-gradient(180deg, transparent 0 9px, var(--ag-wave) 9px 10px) left 0 bottom ${y}px / 100% ${h - 6}px no-repeat`,
  `var(--ag-sea) left 0 bottom ${y}px / 100% ${h}px no-repeat`,
];
/** The sun (the moon at night), half set behind the sea at the right. Where it sits and how big are variables, as each banner's sea sits at its own height. */
const SUN = "var(--ag-sun) var(--ag-sun-at, right 12% bottom 54px) / var(--ag-sun-size, 120px) var(--ag-sun-size, 120px) no-repeat";

const M = "var(--ag-marble)", SH = "var(--ag-shade)";
/** For a location with no picture: a small temple front under the sky, standing on the shore at the foot of the box. */
const at = (x: number, y: number, w: number, h: number) => `calc(50% + ${x - 32 + w / 2}px) calc(100% - ${64 - y - h + 8}px) / ${w}px ${h}px no-repeat`;
const MINI = [
  `conic-gradient(from 116.6deg at 50% 0, ${M} 0 126.8deg, transparent 127.3deg) ${at(6, 8, 52, 13)}`,
  `linear-gradient(${M}, ${M}) ${at(8, 21, 48, 5)}`,
  `repeating-linear-gradient(90deg, ${M} 0 6px, transparent 6px 12px) ${at(11, 27, 42, 23)}`,
  `linear-gradient(var(--ag-cella), var(--ag-cella)) ${at(12, 27, 40, 23)}`,
  `linear-gradient(${M}, ${M}) ${at(8, 50, 48, 4)}`,
  `linear-gradient(${SH}, ${SH}) ${at(4, 54, 56, 4)}`,
  "var(--ag-sea) 0 100% / 100% 12px no-repeat", "var(--ag-sky)",
].join(", ");

/** The page behind everything: marble, a little warmer at the top. */
const PAGE = "background: linear-gradient(180deg, color-mix(in srgb, var(--ag-key) 5%, transparent), transparent 420px), var(--bg);";
/** Small labels: Roman capitals, set wide. */
const LABEL = "font-family: var(--font-display); font-weight: 600; text-transform: uppercase; letter-spacing: .14em;";
/** A panel: marble with a double rule along the top. */
const FRAME = "border: 1px solid var(--ag-line); border-top: 3px double var(--ag-rule); border-radius: 0; background: var(--ag-panel);";
/** A column down the left edge of a row: fluted, with a block at the top and the foot. */
const FLUTES = "linear-gradient(var(--ag-rule), var(--ag-rule)) left top / 14px 4px no-repeat border-box, linear-gradient(var(--ag-rule), var(--ag-rule)) left bottom / 14px 4px no-repeat border-box, repeating-linear-gradient(90deg, var(--ag-groove) 0 1px, var(--ag-column) 1px 4.5px) left top / 14px 100% no-repeat border-box";
/** A row: marble with a fluted column down its left. Under the pointer the marble warms a little toward the key colour. */
const ROW = `--ag-row: var(--ag-panel); border: 1px solid var(--ag-line); border-left: 14px solid transparent; border-radius: 0; background: ${FLUTES}, linear-gradient(var(--ag-row), var(--ag-row)) padding-box;`;
const ROW_ON = "--ag-row: color-mix(in srgb, var(--ag-key) 5%, var(--ag-panel));";
/** Buttons that matter: a block of the key colour with a fine rule just inside its edge. */
const SOLID = "border: 0; border-radius: 0; padding-inline: 18px; background: var(--ag-btn); color: var(--ag-btn-ink); box-shadow: inset 0 0 0 3px var(--ag-btn), inset 0 0 0 4px var(--ag-btn-line);";
/** A heading in the middle, with a band of the Greek key running out to either side. */
const keyed = (h: string, s = 3) => `${h} { display: flex; align-items: center; justify-content: center; gap: 18px; }
${h}::before, ${h}::after { content: ""; flex: 1; min-width: 30px; height: ${6 * s}px; background: ${meander("var(--ag-key)", s)}; opacity: .85; }`;
/** A portrait standing as a stele: a low pediment on top. */
const STELE = "polygon(0 9%, 50% 0, 100% 9%, 100% 100%, 0 100%)";
const TITLE = "font-family: var(--font-display); font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--ag-title); text-shadow: var(--ag-title-shadow); overflow-wrap: break-word;";

/**
 * The view, drawn behind `host`'s own content: the sky with the sun (or moon and stars) setting into the sea, islands
 * on the horizon and a band of the Greek key along the bottom.
 */
function view(host: string, name: string) {
  const back = inParts(name, [
    meander("var(--ag-key)", 3, "bottom", 0), "linear-gradient(var(--ag-band), var(--ag-band)) left bottom / 100% 18px no-repeat",
    ...sea(96, 18), SUN, STARS, "var(--ag-sky)",
  ]);
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 0; border-radius: 0;
  ${back.declare}
  background: ${back.use};
  color: var(--ag-banner-ink);
}
${host} > * { position: relative; z-index: 2; }`;
}
/** The same view on a phone: a smaller sun on the same horizon. */
const smallView = (host: string) => `${host} { --ag-sun-size: 70px; --ag-sun-at: right 8% bottom 79px; }`;

/* The Encyclopedia: the campaign's overview gets the view, pages are marble with the key along their bands. */
const ENCYCLOPEDIA = `/* Agora for the Encyclopedia. The colours and fonts come from the theme; this adds the view, the columns and the Greek key. */
${VARS}
body { ${PAGE} scrollbar-color: var(--ag-rule) var(--panel); }
::selection { background: var(--ag-btn); color: var(--ag-btn-ink); }

/* The shelf down the side. */
.sidebar { border-right: 1px solid var(--ag-line); background: var(--ag-panel); }
.csw-name b { font: 700 15px var(--font-display); letter-spacing: .08em; text-transform: uppercase; }
.campaign-link { border-radius: 0; border-left: 3px solid transparent; }
.campaign-link:hover { color: var(--accent); }
.campaign-link.active { border-left-color: var(--ag-key); background: color-mix(in srgb, var(--ag-key) 9%, transparent); color: var(--ink); }
.side-heading .section-toggle { ${LABEL} font-size: 11.5px; color: var(--muted); }
.shared-tag { border-radius: 0; border: 1px solid var(--ag-line); background: transparent; color: var(--muted); ${LABEL} font-size: 9.5px; }
.tree-row { border-radius: 0; }
.tree-row:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.tree-row:has(.active), .tree-item.active { background: color-mix(in srgb, var(--ag-key) 9%, transparent); color: var(--ink); box-shadow: inset 3px 0 0 var(--ag-key); }

/* The bar along the top, with the key under it. */
.topbar { border-bottom: 0; background: ${meander("var(--ag-key-soft)", 2, "bottom")}, var(--ag-panel); padding-bottom: 12px; }
.search-box { border-radius: 0; border-color: var(--ag-line); background: var(--bg); }
.search-box:focus-within { border-color: var(--ag-key); }
.quick-hint kbd { border-radius: 0; border-color: var(--ag-line); }

/* Buttons and boxes to type in. */
.button { border-radius: 0; ${LABEL} font-size: 12px; }
.button.primary { ${SOLID} transition: filter .15s; }
.button.primary:hover { filter: brightness(1.08); }
.button:not(.primary) { border-color: var(--ag-rule); }
.button:not(.primary):hover { border-color: var(--ag-key); color: var(--accent); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; caret-color: var(--ag-key); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--ag-key); box-shadow: none; }

/* The campaign's overview: the view. */
${view(".dashboard-intro", "ag-enc")}
.dashboard-intro { min-height: 330px; align-items: flex-start; margin-bottom: 26px; padding: 40px 40px 150px; }
.dashboard-intro .eyebrow { ${LABEL} font-size: 12px; color: var(--ag-banner-ink); }
.dashboard-intro h1 { margin-top: 8px; font-size: 50px; line-height: 1.05; ${TITLE} }
.dashboard-intro .subtitle { max-width: 36ch; font: italic 400 18px/1.5 var(--font-reading); color: var(--ag-banner-ink); }
.dashboard-intro .icon-button { border: 1px solid var(--ag-line); background: var(--ag-panel); color: var(--ink); }
.overview-strip { border-color: var(--ag-line); }
.overview-strip strong { font: 700 19px var(--font-display); color: var(--accent); }

/* Headings: Roman capitals in the middle, the key running out to either side. */
.section-heading h2 { flex: 1; font: 700 18px var(--font-display); letter-spacing: .2em; text-transform: uppercase; }
${keyed(".section-heading h2", 2)}
.eyebrow { ${LABEL} font-size: 11px; }

/* Cards: marble with a fluted column down the left. Under the pointer the marble warms a little. */
.note-card { ${ROW} padding: 18px 20px; }
.note-card:hover { ${ROW_ON} }
.note-card h3 { font: 700 19px/1.2 var(--font-display); letter-spacing: .04em; }
.note-card:hover h3 { color: var(--accent); }
.note-card .eyebrow, .card-footer { color: var(--muted); }
.note-card.add-card { border: 1px dashed var(--ag-rule); background: transparent; }

/* A page. */
.kind-pill { padding: 2px 10px; border-radius: 0; border: 0; background: var(--ag-btn); color: var(--ag-btn-ink); ${LABEL} font-size: 10.5px; }
.article-title h1 { font-family: var(--font-display); font-weight: 700; letter-spacing: .06em; }
.tag-add, .who-button { border-radius: 0; }
.article-tabs { border-bottom: 1px solid var(--ag-rule); }
.article-tabs button { border-radius: 0; ${LABEL} font-size: 12px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); box-shadow: inset 0 -3px 0 var(--ag-key); }
.picture-panel { border-radius: 0; border-color: var(--ag-line); border-top: 3px double var(--ag-rule); }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-display); font-weight: 700; letter-spacing: .06em; }
.prose h2 { padding-bottom: 14px; background: ${meander("var(--ag-key-soft)", 2, "bottom")}; }
.prose h3 { color: var(--accent); }
.prose blockquote { border-left: 3px double var(--ag-rule); background: color-mix(in srgb, var(--ag-key) 5%, transparent); font-style: italic; }
.prose code, .prose pre { border-radius: 0; }
.article-aside .aside-section { border-top: 3px double var(--ag-rule); }
.article-aside .eyebrow { color: var(--accent); }

@media (max-width: 640px) {
  .dashboard-intro { min-height: 260px; padding: 26px 20px 140px; }
  .dashboard-intro h1 { font-size: 32px; }
  .dashboard-intro .subtitle { max-width: 24ch; font-size: 16px; }
  .section-heading h2 { font-size: 15px; letter-spacing: .14em; gap: 10px; }
  ${smallView(".dashboard-intro")}
}
@media (prefers-reduced-motion: reduce) {
  .button.primary { transition: none; }
}
`;

/* Maptable: marble round the table, and the Scene Picker gets the view. */
const MAPTABLE = `/* Agora for Maptable. The map itself keeps its own colours; everything around it is marble, blue and the Greek key. */
${VARS}
body { ${PAGE} scrollbar-color: var(--ag-rule) var(--panel); }
::selection { background: var(--ag-btn); color: var(--ag-btn-ink); }

/* The bar along the top, with the key under it. */
.app-header, .campaign-dashboard > header { border-bottom: 0; background: ${meander("var(--ag-key-soft)", 2, "bottom")}, var(--ag-panel); padding-bottom: 12px; }
.header-scene strong { font-family: var(--font-display); letter-spacing: .06em; color: var(--accent); }
.csw-btn { border-radius: 0; }
.csw-name b { font: 700 14px var(--font-display); letter-spacing: .08em; text-transform: uppercase; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${SOLID} ${LABEL} font-size: 12px; transition: filter .15s; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { background: var(--ag-btn); filter: brightness(1.08); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--ag-key); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--ag-key); box-shadow: none; }
input[type="range"] { accent-color: var(--ag-key); }

/* The tool rail: the key colour when on. */
.rail { border-right: 1px solid var(--ag-line); background: var(--ag-panel); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--accent); }
.rail button.active { border-left: 3px solid var(--ag-key); background: color-mix(in srgb, var(--ag-key) 10%, transparent); color: var(--accent); }

/* The side panel. */
.side-panel { border-right: 1px solid var(--ag-line); background: var(--ag-panel); }
.panel-title { border-bottom: 3px double var(--ag-rule); }
.panel-title h2 { font: 700 15px var(--font-display); letter-spacing: .16em; text-transform: uppercase; }
.organizer-scene { border-radius: 0; border-left: 3px solid transparent; white-space: normal; }
.organizer-scene:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.organizer-scene.active { border-left-color: var(--ag-key); background: color-mix(in srgb, var(--ag-key) 9%, transparent); }
.organizer-scene strong { font: 700 14.5px/1.25 var(--font-display); letter-spacing: .03em; }
.organizer-scene.active strong { color: var(--accent); }
.scene-kind { border-radius: 0; color: var(--muted); }

/* Around the map. */
.map-topbar { border-bottom: 1px solid var(--ag-line); background: var(--ag-panel); }
.map-title { ${LABEL} font-size: 11.5px; color: var(--muted); }
.board { background: var(--bg); }
.board-info { ${LABEL} color: var(--muted); }
.zoom-controls { border-radius: 0; border-color: var(--ag-rule); }
.toolbar { border-radius: 0; border: 1px solid var(--ag-line); border-top: 3px double var(--ag-rule); background: var(--ag-panel); box-shadow: var(--ag-shadow); }
.toolbar button { border-radius: 0; ${LABEL} font-size: 11.5px; }
.toolbar button:hover { color: var(--accent); }
.toolbar button.active { background: var(--ag-btn); color: var(--ag-btn-ink); }

/* The Scene Picker: the view. */
${view(".campaign-scenes-head", "ag-map")}
.campaign-scenes-head { min-height: 320px; align-items: flex-start; padding: 34px 34px 150px; }
.campaign-scenes-head small { ${LABEL} font-size: 12px; color: var(--ag-banner-ink); }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head h1 { margin-top: 6px; font-size: 46px; line-height: 1.05; ${TITLE} }
.dashboard-continue { ${ROW} padding: 18px 26px; }
.dashboard-continue:hover { ${ROW_ON} }
.dashboard-continue small { ${LABEL} font-size: 11.5px; color: var(--accent); }
.dashboard-continue strong { font: 700 22px var(--font-display); letter-spacing: .04em; }
.campaign-scenes-kinds button { border-radius: 0; ${LABEL} font-size: 11.5px; }
.campaign-scenes-group h2 { font: 700 17px var(--font-display); letter-spacing: .2em; text-transform: uppercase; }
${keyed(".campaign-scenes-group h2", 2)}
.campaign-scenes-group h2 span { ${LABEL} font-size: 11px; }
.campaign-scene-card { border: 1px solid var(--ag-line); border-top: 3px double var(--ag-rule); border-radius: 0; background: var(--ag-panel); transition: border-color .15s; }
.campaign-scene-card.last { border-top-color: var(--ag-key); }
/* Hover: the rule along the top turns to the key colour. Nothing lifts and nothing glows. */
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { border-top-color: var(--ag-key); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card strong { font: 700 15.5px/1.25 var(--font-display); letter-spacing: .03em; }
.campaign-scene-card em { ${LABEL} font-style: normal; font-size: 10.5px; color: var(--accent); }
.campaign-scene-card small { font-size: 13px; }
.campaign-scene-picture { border-bottom: 1px solid var(--ag-line); }

@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 240px; padding: 24px 20px 140px; }
  .dashboard-continue strong { font-size: 17px; letter-spacing: .02em; overflow-wrap: anywhere; }
  .campaign-scenes-head h1 { font-size: 30px; }
  ${smallView(".campaign-scenes-head")}
}
@media (prefers-reduced-motion: reduce) {
  .primary.primary.primary, .dashboard-continue-action, .campaign-scene-card { transition: none; }
}
`;

/* The campaign's dashboard: the view behind its name, and marble cards. */
const DASHBOARD = `/* Agora for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--ag-btn); color: var(--ag-btn-ink); }
.hub-crumbs { ${LABEL} font-size: 12px; }
.hub-crumbs a { color: var(--accent); }

/* The top: the view. */
${view(".hub-head", "ag-hub")}
.hub-head { min-height: 340px; padding: 36px 36px 150px; }
.hub-title p { ${LABEL} font-size: 12px; color: var(--ag-banner-ink); }
.hub-title h1 { margin-top: 6px; font-size: 52px; line-height: 1.05; ${TITLE} }
.hub-chip { border-radius: 0; border-color: var(--ag-line); background: var(--ag-panel); color: var(--ink); ${LABEL} font-size: 10.5px; }
.hub-head .tag-add { border-radius: 0; border-color: var(--ag-line); background: var(--ag-panel); color: var(--ink); }
.hub-head .hub-button:not(.hub-button-primary) { background: var(--ag-panel); color: var(--ink); }

/* Buttons. */
.hub-button { border-radius: 0; ${LABEL} font-size: 12px; }
.hub-button-primary { ${SOLID} transition: filter .15s; }
.hub-button-primary:hover { filter: brightness(1.08); }
.hub-button:not(.hub-button-primary) { border-color: var(--ag-rule); }
.hub-button:not(.hub-button-primary):hover { border-color: var(--ag-key); color: var(--accent); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 3px double var(--ag-rule); }
.hub-tabs button, .hub-tabs a { border-radius: 0; ${LABEL} font-size: 12.5px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }
.mem-count { border-radius: 0; }

/* Cards: marble with a double rule along the top. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; font: 700 16px var(--font-display); letter-spacing: .16em; text-transform: uppercase; color: var(--ink); }
.hub-card-head a, .hub-card-head .hub-text-button { ${LABEL} font-size: 11.5px; }
.hub-scene-grid li { border-radius: 0; }

@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 24px 20px 140px; }
  .hub-title h1 { font-size: 32px; }
  ${smallView(".hub-head")}
}
@media (prefers-reduced-motion: reduce) {
  .hub-button-primary { transition: none; }
}
`;

const SKY = inParts("ag-sky", [SUN, STARS, "var(--ag-sky)"]);
const SEA = inParts("ag-sea", sea(100));

export const AGORA: Theme = {
  id: "preset-agora", name: "Agora", mode: "both", radius: 0, banner: "picture", fonts: { display: "cinzel", reading: "spectral", ui: "inter" },
  colors: {
    light: { bg: "#f3efe6", panel: "#fbf9f4", raised: "#efe9dd", line: "#d8cdb9", ink: "#1b2433", muted: "#5a6170", accent: "#1f5aa0", accent2: "#8a6210" },
    dark: { bg: "#08111f", panel: "#0f1b2e", raised: "#16253d", line: "#2a3d5c", ink: "#eef0ea", muted: "#9fb0c4", accent: "#e3bb55", accent2: "#79b6ee" },
  },
  css: `/* Agora: white marble, Aegean blue and a little gold, the Greek key along every band and a fluted column down every row. The banner is the Aegean with its islands and the sun setting into it, drawn with gradients.
   Light is midday under a pale sun; dark is the same coast under the moon. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--ag-rule) var(--panel); }
::selection { background: var(--ag-btn); color: var(--ag-btn-ink); }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border: 1px solid var(--ag-line); border-bottom: 0; background: var(--ag-panel); }
.board-date { ${LABEL} font-size: 11.5px; }
.board-date b { ${LABEL} font-size: 11.5px; color: var(--accent); }
.you b { font: 700 15px var(--font-display); letter-spacing: .08em; text-transform: uppercase; }
.search-box { border-color: var(--ag-line); background: var(--bg); }
.search-box:focus-within { border-color: var(--ag-key); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the sky with the sun (or the moon and stars) setting into the sea, and islands on the horizon. */
.board-head { min-height: 330px; border: 0; text-align: left; }
.board-head:not(.has-art) {
  --ag-sun-at: right 12% bottom 98px;
  ${SKY.declare}
  background: ${SKY.use};
  --head-ink: var(--ag-banner-ink); --head-title: var(--ag-title); --head-shadow: var(--ag-title-shadow); --head-nav: var(--ag-nav); --head-line: transparent;
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: flex-start; padding: 58px 44px 140px; overflow: hidden; }
.board-head:not(.has-art) .board-head-text { ${SEA.declare} background: ${SEA.use}; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-title { font: 700 58px/1.05 var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.board-tagline { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; margin-top: 12px; font: italic 400 21px/1.35 var(--font-reading); color: var(--head-ink); text-shadow: none; }
.board-tagline::after { content: ""; width: 168px; height: 12px; background: ${meander("var(--head-title)", 2)}; }
/* The links: on a dark band under a strip of the Greek key. */
.board-nav { justify-content: flex-start; padding: 18px 28px 0; border-top: 0; background: ${meander("var(--ag-key)", 3)}, linear-gradient(var(--ag-band), var(--ag-band)) left top / 100% 18px no-repeat, var(--head-nav); }
.board-nav a { padding: 12px 18px; color: var(--ag-nav-ink); ${LABEL} font-size: 12.5px; letter-spacing: .2em; }
.board-nav a:hover { color: var(--ag-nav-ink); border-bottom-color: var(--ag-nav-ink); }
.board-nav a:focus-visible { outline: 2px solid var(--ag-nav-ink); outline-offset: -4px; }
/* With a banner picture: the picture under a soft wash on the left, the same capitals over it. */
.board-head.has-art {
  background: linear-gradient(90deg, rgba(6, 14, 30, .72) 0%, rgba(6, 14, 30, .35) 50%, rgba(6, 14, 30, .08) 100%), linear-gradient(180deg, transparent 62%, rgba(6, 14, 30, .6) 100%), var(--banner) var(--banner-x, 50%) var(--banner-y, 50%) / var(--banner-size, cover) no-repeat;
  --head-ink: #eef0ea; --head-title: #f3e3b0; --head-shadow: 0 2px 14px rgba(0, 0, 0, .85); --head-nav: #050b16; --head-line: transparent;
}
.board-head.has-art .board-head-text { justify-content: center; padding: 60px 44px 70px; }
.board-head.has-art .board-tagline { text-shadow: 0 1px 8px #000; }
.board-head.has-art .board-nav { background: ${meander("#c9a24a", 3)}, linear-gradient(#0b1628, #0b1628) left top / 100% 18px no-repeat, var(--head-nav); }

/* Headings: Roman capitals in the middle, the Greek key running out to either side. */
.category-title { font: 700 18px var(--font-display); letter-spacing: .24em; text-transform: uppercase; color: var(--ink); }
${keyed(".category-title")}
.tag { border-radius: 0; ${LABEL} font-size: 9.5px; text-shadow: none; }
.tag:not(.topic-tag) { border-color: var(--ag-rule); color: var(--muted); }
.tag.new { border-color: var(--ag-btn); background: var(--ag-btn); color: var(--ag-btn-ink); }

/* Boards and topics: marble with a fluted column down the left. Under the pointer the marble warms a little. */
.category-forums, .topics { gap: 6px; }
.forum, .topic-row { ${ROW} }
.forum:hover, .topic-row:hover { ${ROW_ON} }
.topic-row.pinned { border-left: 14px solid transparent; --ag-column: color-mix(in srgb, var(--ag-key) 35%, var(--ag-panel)); }
.forum-name { font: 700 20px/1.2 var(--font-display); letter-spacing: .04em; text-transform: none; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum:hover .forum-name a, .topic-row:hover .topic-title a, .forum-name a:hover, .topic-title a:hover { color: var(--accent); }
.forum-desc { font: italic 400 16px/1.45 var(--font-reading); }
.forum-place { ${LABEL} font-size: 10.5px; }
.forum-place a { color: var(--accent); }
.forum-counts b { font: 700 17px var(--font-display); color: var(--ink); }
.last-label { ${LABEL} font-size: 10px; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 600 15px/1.3 var(--font-display); letter-spacing: .02em; }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { font: 700 17px/1.25 var(--font-display); letter-spacing: .03em; text-transform: none; }
.topic-main small { font-style: normal; }
.topic-count b { font: 700 17px var(--font-display); color: var(--ink); }
.unread-dot { width: 9px; height: 9px; border-radius: 0; background: var(--ag-coin); rotate: 45deg; box-shadow: none; }
/* Small portraits: coins, gold with a raised rim. */
.portrait.small, .portrait.tiny { border-radius: 50%; border: 0; background: radial-gradient(circle at 35% 30%, var(--ag-coin-hi), var(--ag-coin) 70%); color: var(--ag-coin-ink); font-family: var(--font-display); font-weight: 700; box-shadow: inset 0 0 0 2px var(--ag-coin), inset 0 0 0 3px rgba(58, 42, 8, .35); }
.circ { border-radius: 50%; border: 0; background: radial-gradient(circle at 35% 30%, var(--ag-coin-hi), var(--ag-coin) 70%); color: var(--ag-coin-ink); font: 700 12px var(--font-display); box-shadow: inset 0 0 0 2px var(--ag-coin), inset 0 0 0 3px rgba(58, 42, 8, .35); }
/* A location with no picture gets its own small temple. */
.forum-art { border-right: 1px solid var(--ag-line); }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} }
.location-art { border-right: 1px solid var(--ag-line); }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${LABEL} font-size: 11.5px; color: var(--accent); }
.location-name { font-weight: 700; font-size: 32px; letter-spacing: .08em; text-transform: uppercase; }
.location-summary { font: italic 400 17px/1.55 var(--font-reading); }

/* Topic pages. */
.crumbs { ${LABEL} font-size: 11.5px; }
.crumbs a { color: var(--accent); }
.topic-head { ${FRAME} }
.topic-name { font: 700 32px/1.12 var(--font-display); letter-spacing: .06em; text-transform: uppercase; }
.cast-chip, .today-chip { border-radius: 0; border-color: var(--ag-line); }

/* Posts: marble under a band of the Greek key, the name in Roman capitals, the portrait a stele. */
.posts { gap: 22px; }
.post { border: 1px solid var(--ag-line); border-radius: 0; padding-top: 12px; background: ${meander("var(--ag-key-soft)", 2)}, var(--ag-panel); }
.post.fresh { background: ${meander("var(--ag-key)", 2)}, var(--ag-panel); }
.post-band, .post.flip .post-band { padding: 12px 24px 10px; border-bottom: 3px double var(--ag-rule); background: none; }
.post-name { font: 700 19px/1.15 var(--font-display); letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
.post-meta { ${LABEL} font-size: 10.5px; }
.post-meta a { color: var(--muted); }
.post.post-gm { background: ${meander("var(--ag-key)", 2)}, var(--ag-panel); box-shadow: none; }
.gm-band { border-bottom: 3px double var(--ag-rule); }
.gm-seal { background: radial-gradient(circle at 35% 30%, var(--ag-coin-hi), var(--ag-coin) 70%); color: var(--ag-coin-ink); box-shadow: inset 0 0 0 2px var(--ag-coin), inset 0 0 0 3px rgba(58, 42, 8, .35); }
.mini-portrait { filter: drop-shadow(0 6px 10px rgba(0, 0, 0, .18)); }
.portrait.big { border: 0; clip-path: ${STELE}; }
.portrait.big::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 12px; pointer-events: none; background: ${meander("var(--ag-key)", 2)}, var(--ag-band); }
.portrait.big.portrait-empty { background: linear-gradient(180deg, var(--raised), color-mix(in srgb, var(--ag-key) 8%, var(--raised))); }
.portrait.big.portrait-empty span { font: 700 96px var(--font-display); color: color-mix(in srgb, var(--ink) 18%, transparent); }
/* The character card that opens over a portrait: black-figure pottery, black on terracotta with the key along its top and foot. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 32px 20px 34px; border: 0;
  background: ${meander("var(--ag-figure)", 2, "top", 8)}, ${meander("var(--ag-figure)", 2, "bottom", 8)}, var(--ag-clay); color: var(--ag-figure); box-shadow: var(--ag-shadow);
}
.mini-card > *, .mini-card dd { color: var(--ag-figure); }
.mini-card :focus-visible { outline: 2px solid var(--ag-figure); outline-offset: 2px; }
.mini-name { font: 700 21px/1.1 var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.mini-role { margin: 6px 0 14px; padding-bottom: 12px; border-bottom: 3px double var(--ag-figure); font: italic 400 15px var(--font-reading); color: var(--ag-figure-quiet); }
.mini-quote { font: italic 400 15px/1.45 var(--font-reading); color: var(--ag-figure-quiet); opacity: 1; }
.mini-traits .chip { border-radius: 0; border-color: var(--ag-figure); color: var(--ag-figure); }
.mini-fields dt { ${LABEL} font-size: 10.5px; color: var(--ag-figure-quiet); }
.mini-fields dd { font: 400 15px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 7px 18px; border: 0; background: var(--ag-figure); color: var(--ag-clay) !important; ${LABEL} font-size: 11.5px; text-decoration: none; transition: filter .15s; }
.mini-link:hover { filter: brightness(1.3); }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${LABEL} font-size: 10.5px; line-height: 1.6; }
.mini-player b { color: var(--accent); }
.post-text { font: 400 17.5px/1.68 var(--font-reading); }
.post-text blockquote { border-left: 3px double var(--ag-rule); background: color-mix(in srgb, var(--ag-key) 5%, transparent); }
.post-text pre { border: 1px solid var(--ag-line); background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { font-weight: 700; letter-spacing: .08em; color: var(--accent); }
.roll-card { border-radius: 0; border-color: var(--ag-line); border-left: 3px double var(--ag-rule); }
.roll-group i, .roll-stamp { border-radius: 0; }
.roll-total { border-radius: 50%; border: 0; background: radial-gradient(circle at 35% 30%, var(--ag-coin-hi), var(--ag-coin) 70%); color: var(--ag-coin-ink); font: 700 15px/26px var(--font-display); }
.post-actions { border-top: 1px solid var(--ag-line); }
.post-actions button { ${LABEL} font-size: 11px; }
.post-actions button:hover { color: var(--accent); }

/* Buttons and boxes to type in. */
.f-btn { border-radius: 0; ${LABEL} font-size: 11.5px; }
.f-btn:not(.ghost) { ${SOLID} color: var(--ag-btn-ink) !important; transition: filter .15s; }
.f-btn:not(.ghost):hover:not(:disabled) { filter: brightness(1.08); }
.f-btn.ghost { border-color: var(--ag-rule); background: transparent; }
.f-btn.ghost:hover:not(:disabled) { border-color: var(--ag-key); background: transparent; color: var(--accent) !important; }
.f-btn.small { font-size: 10.5px; }
input:not([type="checkbox"]), select, textarea { border-radius: 0; background: var(--bg); caret-color: var(--ag-key); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--ag-key); box-shadow: none; }
.composer { border: 0; border-top: 3px double var(--ag-rule); }
.composer-kind, .as-label { ${LABEL} color: var(--accent); }
.tools { border-radius: 0; background: var(--bg); }
.tools button { border-radius: 0; }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { font-weight: 700; font-size: 14px; letter-spacing: .18em; text-transform: uppercase; color: var(--ink); }
.foot-staff b { font: 700 14px var(--font-display); letter-spacing: .04em; }
.foot-stats b { font: 700 16px var(--font-display); color: var(--accent); }
.to-top { border-radius: 0; border-color: var(--ag-rule); color: var(--accent); }

@container page (max-width: 640px) {
  .board-head:not(.has-art) { --ag-sun-at: right 8% bottom 119px; --ag-sun-size: 70px; }
  .board-head { min-height: 290px; }
  .board-head-text, .board-head:not(.has-art) .board-head-text { padding: 30px 22px 130px; }
  .board-head.has-art .board-head-text { padding: 36px 22px 40px; }
  .board-title { font-size: 32px; letter-spacing: .08em; }
  .board-tagline { max-width: 80%; font-size: 16px; }
  .board-tagline::after { width: 120px; }
  .board-nav { padding: 18px 8px 0; }
  .board-nav a { padding: 10px 10px; font-size: 11px; letter-spacing: .14em; }
  .category-title { font-size: 15px; letter-spacing: .16em; gap: 12px; }
  .forum-name { font-size: 18px; }
  .topic-name { font-size: 23px; }
  .location-name { font-size: 22px; }
  .post-name { font-size: 16px; }
  .portrait.big.portrait-empty span { font-size: 48px; }
  .mini-card { box-sizing: border-box; padding: 26px 14px 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .f-btn, .mini-link { transition: none; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
