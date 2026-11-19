/*
 * Sword Coast: a fully custom skin, inspired by Baldur's Gate 3 and by the look of Dungeons & Dragons rulebooks.
 * The banner is a walled city and its gate drawn with gradients and one outline (no picture, nothing from the game
 * or the books). Dark is night at the gate: dark leather, thin gilded frames with scooped corners, crimson buttons
 * and a touch of arcane violet for anything new. Light is a page from a rulebook: parchment, deep red headings, the
 * tapered red rule, a boxed read-aloud quote and a character card laid out like a stat block. Like every skin, its
 * stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --sc-sky: linear-gradient(180deg, #e6d8b8 0%, #efe3c8 55%, #f6edd8 100%);
  --sc-wash: radial-gradient(70% 70% at 50% 104%, rgba(143, 42, 32, .2), transparent 70%), radial-gradient(40% 55% at 10% 0%, rgba(187, 173, 130, .55), transparent 70%), radial-gradient(34% 46% at 94% 6%, rgba(187, 173, 130, .5), transparent 70%);
  --sc-stars: none;
  --sc-moon: radial-gradient(circle closest-side, rgba(143, 42, 32, .5) 0 29%, rgba(143, 42, 32, .14) 30% 39%, transparent 40%);
  --sc-moon-at: 88% 22%;
  --sc-mini-moon: radial-gradient(circle at 72% 24%, rgba(143, 42, 32, .5) 0 9px, transparent 10px);
  --sc-far: linear-gradient(180deg, rgba(88, 24, 13, .16), rgba(88, 24, 13, .36));
  --sc-windows: none;
  --sc-wall: #5e2a1c;
  --sc-gate: #f3e8cf;
  --sc-title-fill: linear-gradient(180deg, #96281d, #58180d);
  --sc-title-shadow: drop-shadow(0 1px 0 rgba(255, 255, 255, .55));
  --sc-banner-ink: #2a1f18;
  --sc-banner-quiet: #6b3a22;
  --sc-nav: rgba(245, 238, 225, .86);
  --sc-gold: #b3975a;
  --sc-gold-soft: #d3c198;
  --sc-head: #6b1a10;
  --sc-rule: #9c2b1b;
  --sc-leather: linear-gradient(180deg, #faf5e9, #f2e9d6);
  --sc-box: #faf7ea;
  --sc-sheet: linear-gradient(180deg, #f8efcd, #f0e2b4);
  --sc-btn: linear-gradient(180deg, #a03226, #6e1c14);
  --sc-btn-ink: #fbf1d9;
  --sc-trim: #d9bd7c;
  --sc-arcane: #5b3a8c;
  --sc-on-arcane: #ffffff;
  --sc-page: radial-gradient(60% 420px at 0% 0%, rgba(187, 173, 130, .5), transparent 70%), radial-gradient(50% 380px at 100% 0%, rgba(187, 173, 130, .4), transparent 70%);
  --sc-candle: inset 0 0 0 1px var(--sc-gold-soft);
  --sc-shadow: 0 16px 34px -18px rgba(60, 30, 10, .55);
  --card-bg: var(--panel); --card-ink: var(--ink); --card-head: var(--sc-head); --card-line: var(--sc-gold);
}
:root[data-theme="dark"] {
  --sc-sky: linear-gradient(180deg, #06050b 0%, #130c1e 34%, #3a1526 58%, #7c2b1e 78%, #a4481f 100%);
  --sc-wash: radial-gradient(60% 56% at 50% 100%, rgba(244, 150, 78, .55), transparent 72%);
  --sc-stars: radial-gradient(1.5px 1.5px at 4% 18%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 11% 42%, #f6e3b0 50%, transparent 51%), radial-gradient(1px 1px at 19% 9%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 27% 30%, #d9c8ff 50%, transparent 51%), radial-gradient(1px 1px at 36% 14%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 44% 6%, #f6e3b0 50%, transparent 51%), radial-gradient(1px 1px at 57% 12%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 66% 24%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 73% 8%, #d9c8ff 50%, transparent 51%), radial-gradient(1px 1px at 93% 16%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 97% 40%, #f6e3b0 50%, transparent 51%);
  --sc-moon: radial-gradient(circle closest-side, #f8eecb 0 27%, rgba(248, 238, 203, .3) 28%, transparent 100%);
  --sc-mini-moon: radial-gradient(circle at 72% 24%, #f8eecb 0 8px, rgba(248, 238, 203, .28) 9px, transparent 30px);
  --sc-far: linear-gradient(180deg, #27152a, #170b12);
  --sc-windows: radial-gradient(1.5px 2px at 13.5% 68%, #ffd98a 50%, transparent 51%), radial-gradient(1.5px 2px at 22.2% 60%, #ffd98a 50%, transparent 51%), radial-gradient(1.5px 2px at 31% 58%, #ffc46a 50%, transparent 51%), radial-gradient(1.5px 2px at 31.9% 72%, #ffd98a 50%, transparent 51%), radial-gradient(1.5px 2px at 48.8% 44%, #ffd98a 50%, transparent 51%), radial-gradient(1.5px 2px at 51.2% 56%, #ffc46a 50%, transparent 51%), radial-gradient(1.5px 2px at 50% 68%, #ffd98a 50%, transparent 51%), radial-gradient(1.5px 2px at 62.4% 72%, #ffd98a 50%, transparent 51%), radial-gradient(1.5px 2px at 72% 64%, #ffc46a 50%, transparent 51%), radial-gradient(1.5px 2px at 80.2% 58%, #ffd98a 50%, transparent 51%), radial-gradient(1.5px 2px at 90% 66%, #ffd98a 50%, transparent 51%);
  --sc-wall: #0b0708;
  --sc-gate: #f7b25c;
  --sc-title-fill: linear-gradient(180deg, #fcecb9 0%, #dcb86c 48%, #9a7432 100%);
  --sc-title-shadow: drop-shadow(0 2px 3px rgba(0, 0, 0, .9));
  --sc-banner-ink: #eadfcd;
  --sc-banner-quiet: #dcc89c;
  --sc-nav: rgba(8, 5, 5, .7);
  --sc-gold: #8a6d3b;
  --sc-gold-soft: #4a3a22;
  --sc-head: #dcb873;
  --sc-rule: #a8843f;
  --sc-leather: linear-gradient(180deg, #1d1612, #15100d);
  --sc-box: #1f1814;
  --sc-sheet: linear-gradient(180deg, #241b14, #15100c);
  --sc-btn: linear-gradient(180deg, #6a1e19, #3d100e);
  --sc-btn-ink: #f3dca4;
  --sc-trim: #b08f4e;
  --sc-arcane: #b48cf0;
  --sc-on-arcane: #1a1024;
  --sc-page: radial-gradient(90% 520px at 50% 0%, #1c1210, transparent 72%);
  --sc-candle: inset 0 0 44px rgba(220, 160, 80, .13), inset 0 0 0 1px rgba(201, 162, 90, .3);
  --sc-shadow: 0 18px 40px -16px rgba(0, 0, 0, .85);
}`;

const KEYFRAMES = `@keyframes sc-pulse { 50% { opacity: .35; } }`;

/** The far city: an outline of roofs, towers and spires, across the whole width. Heights are percentages of its box. */
type Roof = [from: number, to: number, height: number, spire?: number];
function skyline(roofs: Roof[]): string {
  const points = ["0 100%"];
  const at = (x: number, h: number) => points.push(`${+x.toFixed(2)}% ${+(100 - h).toFixed(2)}%`);
  for (const [from, to, height, spire] of roofs) {
    if (spire) { at(from, height - spire); at((from + to) / 2, height); at(to, height - spire); }
    else { at(from, height); at(to, height); }
  }
  return `polygon(${[...points, "100% 100%"].join(", ")})`;
}
const CITY = skyline([
  [0, 4, 30], [4, 7, 52, 18], [7, 12, 34], [12, 15, 46], [15, 21, 30], [21, 23.4, 72, 24], [23.4, 29, 38], [29, 30, 55], [30, 32, 50], [32, 33, 55], [33, 38, 36],
  [38, 41, 62, 20], [41, 45, 42], [45, 47, 90, 18], [47, 48.2, 74], [48.2, 51.8, 68], [51.8, 53, 74], [53, 55, 90, 18], [55, 61, 40], [61, 64, 58, 20], [64, 70, 34],
  [70, 71, 50], [71, 73, 45], [73, 74, 50], [74, 79, 32], [79, 81.4, 68, 24], [81.4, 88, 36], [88, 92, 48], [92, 96, 30], [96, 100, 46, 16],
]);

const WALL = "var(--sc-wall)";
const block = `linear-gradient(${WALL}, ${WALL})`;
const teeth = (on: number, off: number) => `repeating-linear-gradient(90deg, ${WALL} 0 ${on}px, transparent ${on}px ${on + off}px)`;
/** The near wall and its gate, drawn in layers: the lit arch, two gate towers, the gatehouse, then the wall and its battlements. */
const GATE = [
  `radial-gradient(50% 100% at 50% 100%, var(--sc-gate) 0 96%, transparent 100%) 50% 100% / 26px 32px no-repeat`,
  `${teeth(6, 4)} calc(50% - 44px) calc(100% - 56px) / 26px 6px no-repeat`,
  `${teeth(6, 4)} calc(50% + 44px) calc(100% - 56px) / 26px 6px no-repeat`,
  `${block} calc(50% - 44px) 100% / 26px 56px no-repeat`,
  `${block} calc(50% + 44px) 100% / 26px 56px no-repeat`,
  `${block} 50% 100% / 64px 42px no-repeat`,
  `${teeth(8, 6)} 0 calc(100% - 28px) / 100% 6px no-repeat`,
  `${block} 0 100% / 100% 28px no-repeat`,
].join(", ");
/** The same gate, small, for a location with no picture. */
const MINI = [
  `radial-gradient(50% 100% at 50% 100%, var(--sc-gate) 0 96%, transparent 100%) 50% 100% / 14px 18px no-repeat`,
  `${teeth(5, 4)} 50% calc(100% - 40px) / 41px 5px no-repeat`,
  `${block} 50% 100% / 41px 40px no-repeat`,
  `${teeth(6, 5)} 0 calc(100% - 22px) / 100% 5px no-repeat`,
  `${block} 0 100% / 100% 22px no-repeat`,
  "var(--sc-mini-moon)", "var(--sc-wash)", "var(--sc-sky)",
].join(", ");

/** The page behind everything: stained parchment by day, a dark room lit from above by night. */
const PAGE = "background: var(--sc-page), var(--bg);";
/** A gilded frame with scooped corners: the mark of every panel. `--sc-ring` is the colour of its line. */
const corner = (x: string, y: string, layer: (at: string) => string) => `${layer(`circle at ${x} ${y}`)} ${x} ${y} / 51% 51% no-repeat`;
const corners = (layer: (at: string) => string, box = "") => [corner("0", "0", layer), corner("100%", "0", layer), corner("0", "100%", layer), corner("100%", "100%", layer)].map(l => l + box).join(", ");
const SCOOP = corners(at => `radial-gradient(${at}, transparent 9px, #000 9.5px)`);
const RING = corners(at => `radial-gradient(${at}, transparent 9px, var(--sc-ring) 9.5px 10.5px, transparent 11px)`, " border-box");
const FRAME = `--sc-ring: var(--sc-gold); border: 1px solid var(--sc-ring); border-radius: 0; background: ${RING}, var(--sc-leather); -webkit-mask: ${SCOOP}; mask: ${SCOOP};`;
/** Buttons that matter: a crimson plaque with gilded edges and pointed ends. */
const PLAQUE = "border: 0; border-radius: 0; background: var(--sc-btn); box-shadow: inset 0 1px 0 var(--sc-trim), inset 0 -1px 0 var(--sc-trim); clip-path: polygon(9px 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 9px 100%, 0 50%);";
/** The tapered rule from a stat block, pointing right or left. */
const TAPER = `content: ""; flex: 1; min-width: 24px; height: 5px; background: var(--sc-rule);`;
const TAPER_RIGHT = `${TAPER} clip-path: polygon(0 0, 100% 50%, 0 100%);`;
const TAPER_LEFT = `${TAPER} clip-path: polygon(100% 0, 0 50%, 100% 100%);`;
/** A small diamond before a heading. */
const GEM = `content: ""; flex: none; display: inline-block; width: 8px; height: 8px; background: var(--sc-rule); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);`;

/**
 * The city at dusk, drawn behind `host`'s own content: the sky, a moon (a red sun by day), the far city's outline and
 * the wall with its gate along the bottom. `far` is how tall the city stands.
 */
function city(host: string, { far = 110 }: { far?: number } = {}) {
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 1px solid var(--sc-gold); border-radius: 0;
  background: var(--sc-stars), var(--sc-moon) var(--sc-moon-at) / 170px 170px no-repeat, var(--sc-wash), var(--sc-sky);
  color: var(--sc-banner-ink);
}
${host} > * { position: relative; z-index: 2; }
${host}::before {
  content: ""; position: absolute; z-index: 0; left: 0; right: 0; bottom: 26px; height: ${far}px; pointer-events: none;
  background: var(--sc-windows), var(--sc-far); clip-path: ${CITY};
}
${host}::after {
  content: ""; position: absolute; z-index: 1; left: 0; right: 0; bottom: 0; height: 64px; pointer-events: none;
  background: ${GATE};
}`;
}
/** A banner's title: engraved capitals filled with gold (deep red by day). */
const TITLE = "background: var(--sc-title-fill); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; filter: var(--sc-title-shadow);";

/* The Encyclopedia: the campaign's overview gets the city, pages read like a rulebook. */
const ENCYCLOPEDIA = `/* Sword Coast for the Encyclopedia. The colours and fonts come from the theme; this adds the city, the gilded frames and the rulebook's headings. */
${VARS}
body { ${PAGE} scrollbar-color: var(--sc-gold) var(--panel); }
::selection { background: var(--accent-2); color: #fff; }

/* The shelf down the side. */
.sidebar { border-right: 1px solid var(--sc-gold); background: var(--sc-leather); }
.csw-name b { font-family: var(--font-display); font-size: 15px; letter-spacing: .08em; color: var(--sc-head); }
.csw-name small { font-family: var(--font-reading); font-style: italic; }
.campaign-link { border-radius: 0; border-left: 2px solid transparent; }
.campaign-link:hover { color: var(--sc-head); }
.campaign-link.active { border-left-color: var(--sc-rule); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 20%, transparent), transparent); color: var(--sc-head); }
.side-heading .section-toggle { font: 700 11.5px var(--font-display); letter-spacing: .16em; text-transform: uppercase; color: var(--sc-head); }
.shared-tag { border-radius: 0; border: 1px solid var(--sc-gold); background: transparent; color: var(--accent); font: 700 9.5px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.tree-row { border-radius: 0; }
.tree-row:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.tree-row:has(.active), .tree-item.active { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 22%, transparent), transparent); color: var(--sc-head); }

/* The bar along the top. */
.topbar { border-bottom: 1px solid var(--sc-gold); background: var(--sc-leather); }
.search-box { border-radius: 2px; border-color: var(--sc-gold); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
.quick-hint kbd { border-radius: 2px; border-color: var(--sc-gold-soft); }

/* Buttons and boxes to type in. */
.button { border-radius: 0; font: 700 12.5px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.button.primary { ${PLAQUE} padding-inline: 20px; color: var(--sc-btn-ink); transition: filter .15s; }
.button.primary:hover { filter: brightness(1.18); }
.button:not(.primary) { border-color: var(--sc-gold); }
.button:not(.primary):hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--ink); }
.icon-button { border-radius: 2px; }
.icon-button:hover { color: var(--sc-head); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 2px; caret-color: var(--accent-2); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }

/* The campaign's overview: the city at dusk. */
${city(".dashboard-intro", { far: 104 })}
.dashboard-intro { --sc-moon-at: 78% 16%; min-height: 300px; align-items: flex-start; margin-bottom: 26px; padding: 34px 34px 150px; }
.dashboard-intro .eyebrow { font: 700 12px var(--font-display); letter-spacing: .24em; color: var(--sc-banner-quiet); }
.dashboard-intro h1 { margin-top: 8px; font: 900 50px/1.05 var(--font-display); letter-spacing: .06em; ${TITLE} }
.dashboard-intro .subtitle { max-width: 46ch; font: italic 400 18px/1.5 var(--font-reading); color: var(--sc-banner-ink); }
.dashboard-intro .icon-button { border: 1px solid var(--sc-gold); background: var(--sc-nav); color: var(--sc-banner-ink); }
.overview-strip { border-color: var(--sc-gold-soft); }
.overview-strip strong { font: 700 17px var(--font-display); color: var(--sc-head); }

/* Headings: the name, then the tapered rule. */
.section-heading h2 { flex: 1; display: flex; align-items: center; gap: 14px; font: 700 17px var(--font-display); letter-spacing: .14em; text-transform: uppercase; color: var(--sc-head); }
.section-heading h2::after { ${TAPER_RIGHT} }
.eyebrow { font-family: var(--font-display); font-size: 11.5px; letter-spacing: .14em; }

/* Cards: gilded frames that catch the candlelight under the pointer. */
.note-card { ${FRAME} padding: 20px; transition: box-shadow .2s; }
.note-card:hover { --sc-ring: var(--accent); box-shadow: var(--sc-candle); }
.note-card h3 { font-family: var(--font-display); font-size: 19px; letter-spacing: .06em; color: var(--sc-head); }
.note-card .eyebrow, .card-footer { color: var(--accent-2); }
.note-card.add-card { border: 1px dashed var(--sc-gold); background: transparent; -webkit-mask: none; mask: none; }

/* A page: a chapter from the book. */
.kind-pill { padding: 1px 9px; border-radius: 0; border: 1px solid var(--sc-gold); font: 700 11px var(--font-display); letter-spacing: .14em; }
.article-title h1 { font-family: var(--font-display); letter-spacing: .05em; color: var(--sc-head); }
.tag-add, .who-button { border-radius: 2px; }
.article-tabs { border-bottom: 1px solid var(--sc-gold); }
.article-tabs button { border-radius: 0; font: 700 12.5px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--sc-head); background: linear-gradient(0deg, color-mix(in srgb, var(--accent) 18%, transparent), transparent); box-shadow: inset 0 -2px 0 var(--sc-rule); }
.picture-panel { border-radius: 0; border-color: var(--sc-gold); }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-display); letter-spacing: .05em; color: var(--sc-head); }
.prose h2 { padding-bottom: 4px; border-bottom: 2px solid var(--sc-gold); }
.prose blockquote { border: 0; border-left: 2px solid var(--sc-rule); border-right: 2px solid var(--sc-rule); background: var(--sc-box); }
.prose code, .prose pre { border-radius: 2px; }
.prose hr { height: 5px; border: 0; background: var(--sc-rule); clip-path: polygon(0 0, 100% 50%, 0 100%); }
.article-aside .aside-section { border-top: 2px solid var(--sc-gold-soft); }
.article-aside .eyebrow { color: var(--sc-head); }

@media (max-width: 640px) {
  .dashboard-intro { --sc-moon-at: 104% 40%; min-height: 250px; padding: 24px 18px 124px; }
  .dashboard-intro h1 { font-size: 30px; }
  .dashboard-intro .subtitle { max-width: 30ch; font-size: 16px; }
  .dashboard-intro::before { height: 80px; }
}
`;

/* Maptable: the rail and panels are leather and gilt, the Scene Picker gets the city. */
const MAPTABLE = `/* Sword Coast for Maptable. The map itself keeps its own colours; everything around it is leather and gilt. */
${VARS}
body { ${PAGE} scrollbar-color: var(--sc-gold) var(--panel); }
::selection { background: var(--accent-2); color: #fff; }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 1px solid var(--sc-gold); background: var(--sc-leather); }
.header-scene strong { color: var(--sc-head); }
.csw-btn { border-radius: 2px; }
.csw-name b { font-family: var(--font-display); font-size: 14.5px; letter-spacing: .08em; }

/* Buttons and boxes to type in. */
/* Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${PLAQUE} padding-inline: 20px; color: var(--sc-btn-ink); font: 700 12.5px var(--font-display); letter-spacing: .12em; text-transform: uppercase; transition: filter .15s; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { background: var(--sc-btn); filter: brightness(1.18); }
.icon-button { border-radius: 2px; }
.icon-button:hover { color: var(--sc-head); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 2px; caret-color: var(--accent-2); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
input[type="range"] { accent-color: var(--accent); }

/* The tool rail: gilded when on. */
.rail { border-right: 1px solid var(--sc-gold); background: var(--sc-leather); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--sc-head); }
.rail button.active { border-left: 2px solid var(--sc-rule); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 24%, transparent), transparent); color: var(--sc-head); }

/* The side panel. */
.side-panel { border-right: 1px solid var(--sc-gold); background: var(--sc-leather); }
.panel-title { border-bottom: 1px solid var(--sc-gold); }
.panel-title h2 { display: flex; align-items: center; gap: 10px; font: 700 15px var(--font-display); letter-spacing: .14em; text-transform: uppercase; color: var(--sc-head); }
.panel-title h2::before { ${GEM} }
.organizer-scene { border-radius: 0; border-left: 2px solid transparent; }
.organizer-scene:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.organizer-scene.active { border-left-color: var(--sc-rule); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 22%, transparent), transparent); }
.organizer-scene strong { font-family: var(--font-reading); font-size: 16px; }
.organizer-scene.active strong { color: var(--sc-head); }
.scene-kind { border-radius: 2px; color: var(--accent); }

/* Around the map: the tabletop. */
.map-topbar { border-bottom: 1px solid var(--sc-gold); background: var(--sc-leather); }
.map-title { font: 700 11.5px var(--font-display); letter-spacing: .12em; text-transform: uppercase; color: var(--sc-head); }
.board { background: radial-gradient(70% 60% at 50% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%), var(--bg); }
.board-info { font-family: var(--font-display); letter-spacing: .12em; color: var(--accent); }
.zoom-controls { border-radius: 2px; border-color: var(--sc-gold); }
.toolbar { border-radius: 0; border: 1px solid var(--sc-gold); background: var(--sc-leather); box-shadow: 0 0 0 3px var(--bg), 0 0 0 4px var(--sc-gold-soft), var(--sc-shadow); }
.toolbar button { border-radius: 0; font: 700 12px var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.toolbar button:hover { color: var(--sc-head); }
.toolbar button.active { background: var(--sc-btn); color: var(--sc-btn-ink); box-shadow: inset 0 1px 0 var(--sc-trim), inset 0 -1px 0 var(--sc-trim); }

/* The Scene Picker: the city at dusk. */
${city(".campaign-scenes-head", { far: 92 })}
.campaign-scenes-head { --sc-moon-at: 70% 10%; min-height: 250px; align-items: flex-start; padding: 28px 28px 130px; }
.campaign-scenes-head small { font: 700 12px var(--font-display); letter-spacing: .24em; color: var(--sc-banner-quiet); }
.campaign-scenes-head h1 { margin-top: 6px; font: 900 42px/1.05 var(--font-display); letter-spacing: .06em; ${TITLE} }
.dashboard-continue { ${FRAME} padding: 20px 28px; }
.dashboard-continue small { font: 700 11.5px var(--font-display); letter-spacing: .2em; color: var(--accent-2); }
.dashboard-continue strong { font-family: var(--font-display); font-size: 19px; letter-spacing: .06em; color: var(--sc-head); }
.campaign-scenes-kinds button { border-radius: 0; font: 700 11.5px var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.campaign-scenes-group h2 { display: flex; align-items: center; gap: 14px; font: 700 16px var(--font-display); letter-spacing: .14em; text-transform: uppercase; color: var(--sc-head); }
.campaign-scenes-group h2::after { ${TAPER_RIGHT} }
.campaign-scenes-group h2 span { order: 2; }
.campaign-scene-card { ${FRAME} transition: transform .18s, box-shadow .18s; }
.campaign-scene-card.last { --sc-ring: var(--accent-2); }
/* Hover: the card lifts and catches the candlelight. */
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { --sc-ring: var(--accent); transform: translateY(-3px); box-shadow: var(--sc-candle); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--sc-head); }
.campaign-scene-card:active { transform: none; }
.campaign-scene-card strong { font-family: var(--font-display); font-size: 14.5px; letter-spacing: .05em; }
.campaign-scene-card em { font: italic 400 13px var(--font-reading); color: var(--accent-2); }
.campaign-scene-card small { font-family: var(--font-reading); font-size: 14px; }
.campaign-scene-picture { border-bottom: 1px solid var(--sc-ring); }

@media (max-width: 640px) {
  .campaign-scenes-head { --sc-moon-at: 108% 46%; min-height: 220px; padding: 22px 18px 116px; }
  .campaign-scenes-head h1 { font-size: 28px; }
  .campaign-scenes-head::before { height: 72px; }
}
@media (prefers-reduced-motion: reduce) {
  .campaign-scene-card, .campaign-scene-card:hover { transform: none; transition: none; }
}
`;

/* The campaign's dashboard: the city behind its name, and gilded cards. */
const DASHBOARD = `/* Sword Coast for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--accent-2); color: #fff; }
.hub-crumbs { font: 700 11.5px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.hub-crumbs a { color: var(--accent); }

/* The top: the city at dusk. */
${city(".hub-head", { far: 110 })}
.hub-head { min-height: 320px; padding: 30px 30px 160px; }
.hub-title p { font: 700 12px var(--font-display); letter-spacing: .24em; text-transform: uppercase; color: var(--sc-banner-quiet); }
.hub-title h1 { margin-top: 6px; font: 900 52px/1.05 var(--font-display); letter-spacing: .06em; ${TITLE} }
.hub-chip { border-radius: 0; border-color: var(--sc-gold); background: var(--sc-nav); color: var(--sc-banner-quiet); font: 700 10.5px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.hub-head .tag-add { border-radius: 0; border-color: var(--sc-gold); background: var(--sc-nav); color: var(--sc-banner-ink); }
.hub-head .hub-button:not(.hub-button-primary) { border-color: var(--sc-gold); background: var(--sc-nav); color: var(--sc-banner-ink); backdrop-filter: blur(4px); }

/* Buttons. */
.hub-button { border-radius: 0; font: 700 12.5px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.hub-button-primary { ${PLAQUE} padding-inline: 20px; color: var(--sc-btn-ink); transition: filter .15s; }
.hub-button-primary:hover { filter: brightness(1.18); }
.hub-button:not(.hub-button-primary):hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--panel)); color: var(--ink); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 1px solid var(--sc-gold); }
.hub-tabs button, .hub-tabs a { border-radius: 0; font: 700 13px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--sc-head); background: linear-gradient(0deg, color-mix(in srgb, var(--accent) 18%, transparent), transparent); }
.mem-count { border-radius: 2px; }

/* Cards: gilded frames with scooped corners. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; display: flex; align-items: center; gap: 12px; font: 700 15px var(--font-display); letter-spacing: .14em; text-transform: uppercase; color: var(--sc-head); }
.hub-card-head h2::after { ${TAPER_RIGHT} }
.hub-card-head a, .hub-card-head .hub-text-button { font: 700 12px var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.hub-scene-grid li { border-radius: 0; }

@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 22px 18px 130px; }
  .hub-title h1 { font-size: 32px; }
  .hub-head::before { height: 80px; }
}
`;

export const SWORD_COAST: Theme = {
  id: "preset-sword-coast", name: "Sword Coast", mode: "both", radius: 2, banner: "plain", fonts: { display: "cinzel", reading: "spectral", ui: "inter" },
  colors: {
    light: { bg: "#e8dfcf", panel: "#f5eee1", raised: "#ece3d2", line: "#c9b99c", ink: "#2a1f18", muted: "#6a5a4c", accent: "#8a5a14", accent2: "#8f2a20" },
    dark: { bg: "#0e0b0a", panel: "#17120f", raised: "#1f1814", line: "#3a2c20", ink: "#e9dfcd", muted: "#a8998a", accent: "#c9a25a", accent2: "#d0584a" },
  },
  css: `/* Sword Coast: night at the city gate, or a page from the rulebook. The banner is a walled city drawn with gradients and one outline.
   Dark is leather, gilt and crimson; light is parchment with deep red headings. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--sc-gold) var(--panel); }
::selection { background: var(--accent-2); color: #fff; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border: 0; border-bottom: 1px solid var(--sc-gold); background: var(--sc-leather); }
.board-date { font: 700 11.5px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.board-date::before { ${GEM} margin-right: 10px; }
.board-date b { font: 700 11.5px var(--font-display); letter-spacing: .12em; color: var(--sc-head); }
.circ { border-color: var(--sc-gold); background: var(--raised); color: var(--sc-head); font-family: var(--font-display); box-shadow: 0 0 0 2px var(--panel), 0 0 0 3px var(--sc-gold-soft); }
.you b { font-family: var(--font-display); font-size: 14px; letter-spacing: .08em; color: var(--sc-head); }
.search-box { border-color: var(--sc-gold); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the sky, a moon (a red sun by day), the far city and the wall with its lit gate. */
.board-head { min-height: 350px; margin: 4px; border: 1px solid var(--sc-gold); outline: 1px solid var(--sc-gold-soft); outline-offset: 3px; }
.board-head:not(.has-art) {
  background: var(--sc-stars), var(--sc-moon) var(--sc-moon-at) / 170px 170px no-repeat, var(--sc-wash), var(--sc-sky);
  --head-ink: var(--sc-banner-ink); --head-title: var(--sc-head); --head-shadow: none; --head-nav: var(--sc-nav); --head-line: var(--sc-gold);
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; padding: 46px 24px 176px; overflow: hidden; text-align: center; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-head:not(.has-art) .board-head-text::before {
  content: ""; position: absolute; z-index: 0; left: 0; right: 0; bottom: 26px; height: 130px;
  background: var(--sc-windows), var(--sc-far); clip-path: ${CITY};
}
.board-head:not(.has-art) .board-head-text::after {
  content: ""; position: absolute; z-index: 1; left: 0; right: 0; bottom: 0; height: 64px;
  background: ${GATE};
}
.board-title { font: 900 58px/1.05 var(--font-display); letter-spacing: .08em; }
.board-head:not(.has-art) .board-title { filter: var(--sc-title-shadow); }
.board-head:not(.has-art) .board-title a { background: var(--sc-title-fill); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; }
.board-tagline { display: flex; align-items: center; gap: 14px; margin-top: 12px; font: italic 400 20px var(--font-reading); color: var(--sc-banner-quiet); text-shadow: none; }
.board-tagline::before { ${TAPER_LEFT} flex: none; width: 54px; height: 4px; }
.board-tagline::after { ${TAPER_RIGHT} flex: none; width: 54px; height: 4px; }
.board-nav { border-top: 1px solid var(--sc-gold); background: var(--head-nav); backdrop-filter: blur(5px); }
.board-nav a { position: relative; padding: 12px 22px; font: 700 12.5px var(--font-display); letter-spacing: .16em; }
.board-nav a + a::before { content: "◆"; position: absolute; left: -4px; top: 50%; translate: 0 -50%; font-size: 7px; color: var(--sc-gold); }
.board-nav a:hover { color: var(--accent-2); border-bottom-color: var(--sc-rule); }

${KEYFRAMES}

/* Headings: the name between two tapered rules. */
.category-title { justify-content: center; gap: 14px; font-size: 18px; letter-spacing: .16em; color: var(--sc-head); }
.category-title::before { ${TAPER_LEFT} }
.category-title::after { ${TAPER_RIGHT} }
.tag { border-radius: 0; border-color: var(--sc-gold); color: var(--accent); font: 700 9.5px var(--font-display); letter-spacing: .14em; text-shadow: none; }
.tag.new { border-color: var(--sc-arcane); background: var(--sc-arcane); color: var(--sc-on-arcane); }

/* Boards and topics: gilded frames with scooped corners, which catch the candlelight under the pointer. */
.category-forums, .topics { gap: 8px; }
.forum, .topic-row { ${FRAME} transition: box-shadow .2s; }
.forum:hover, .topic-row:hover { --sc-ring: var(--accent); box-shadow: var(--sc-candle); }
.topic-row.pinned { --sc-ring: var(--accent-2); }
.forum-name { font-size: 21px; letter-spacing: .06em; }
.forum-name a, .topic-title a { color: var(--sc-head); }
.forum-name a:hover, .topic-title a:hover { color: var(--accent-2); }
.forum-desc { font: italic 400 16.5px/1.45 var(--font-reading); }
.forum-place { font: 700 10.5px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.forum-place a { color: var(--accent); }
.forum-counts b { font: 700 16px var(--font-display); color: var(--sc-head); }
.last-label { font-family: var(--font-display); font-size: 10px; letter-spacing: .18em; color: var(--accent-2); }
.forum-last a, .foot-list a { color: var(--ink); font: 600 16px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent-2); }
.topic-title { font-size: 17px; letter-spacing: .05em; }
.topic-count b { font: 700 15px var(--font-display); color: var(--sc-head); }
/* Anything new carries a touch of arcane violet. */
.unread-dot { border-radius: 0; background: var(--sc-arcane); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); box-shadow: none; animation: sc-pulse 2.4s ease-in-out infinite; }
.portrait.small, .portrait.tiny { border-radius: 50%; border: 1px solid var(--sc-gold); background: var(--raised); color: var(--sc-head); box-shadow: 0 0 0 2px var(--panel), 0 0 0 3px var(--sc-gold-soft); }
/* A location with no picture gets its own small gate. */
.forum-art { border-right: 1px solid var(--sc-ring, var(--sc-gold)); }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} }
.location-art { border-right: 1px solid var(--sc-gold); }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { font: 700 11px var(--font-display); letter-spacing: .2em; color: var(--accent-2); }
.location-name { letter-spacing: .06em; color: var(--sc-head); }
.location-summary { font: italic 400 17px/1.55 var(--font-reading); }

/* Topic pages. */
.crumbs { font: 700 11px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.crumbs a { color: var(--accent); }
.topic-head { ${FRAME} }
.topic-name { font-size: 30px; letter-spacing: .06em; color: var(--sc-head); }
.cast-chip, .today-chip { border-radius: 999px; border-color: var(--sc-gold); }

/* Posts: a gilded frame, the name over a tapered rule and the portrait under an arch. */
.posts { gap: 22px; }
.post { ${FRAME} }
.post.fresh { --sc-ring: var(--sc-arcane); }
.post:has(.composer) { -webkit-mask: none; mask: none; }
.post-band, .post.flip .post-band { padding: 12px 26px; border-bottom: 1px solid var(--sc-gold-soft); background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent); }
.post-name { font-size: 22px; letter-spacing: .08em; }
.post-name a { color: var(--sc-head); }
.post-meta { font: 700 10.5px var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.post-meta a { color: var(--accent); }
.portrait.big { border: 1px solid var(--sc-gold); border-radius: 50% 50% 0 0 / 28% 28% 0 0; box-shadow: 0 0 0 3px var(--panel), 0 0 0 4px var(--sc-gold-soft); }
.portrait.big::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, transparent 62%, rgba(0, 0, 0, .34)); }
.portrait.big.portrait-empty { background: radial-gradient(circle at 50% 36%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 62%), var(--sc-leather); }
.portrait.big.portrait-empty span { font: 900 112px var(--font-display); color: var(--sc-gold); }
/* The character card that opens over a portrait: a sheet laid out like a stat block, which slides up into place. */
.mini-card {
  display: flex; flex-direction: column; border: 1px solid var(--sc-gold); border-top: 4px double var(--sc-rule); border-bottom: 4px double var(--sc-rule);
  background: var(--sc-sheet); box-shadow: 0 0 0 5px var(--panel), var(--sc-shadow);
  transform: translateY(10px); transition: opacity .18s ease, visibility .18s, transform .18s ease;
}
.mini-portrait:hover .mini-card, .mini-portrait:focus-within .mini-card, .mini.open .mini-card, .mini-card.shown { transform: none; }
.mini-card::before { content: "Character sheet"; flex: none; margin-bottom: 4px; font: 700 10.5px var(--font-display); letter-spacing: .2em; text-transform: uppercase; color: var(--accent-2); }
.mini-name { font-size: 22px; letter-spacing: .06em; color: var(--sc-head); }
.mini-role { padding-bottom: 12px; border: 0; background: linear-gradient(90deg, var(--sc-rule), transparent) left bottom / 100% 3px no-repeat; font: italic 400 16px/1.4 var(--font-reading); }
.mini-quote { font: italic 400 16px/1.45 var(--font-reading); }
.mini-fields dt { font: 700 11px var(--font-display); letter-spacing: .12em; color: var(--sc-head); }
.mini-fields dd { font: 400 15.5px/1.4 var(--font-reading); }
.mini-player { font: 700 10.5px/1.6 var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.mini-player b { color: var(--accent-2); }
.mini-link { align-self: flex-start; margin-top: auto; padding: 7px 18px; ${PLAQUE} color: var(--sc-btn-ink) !important; font: 700 11.5px var(--font-display); letter-spacing: .14em; text-transform: uppercase; text-decoration: none; transition: filter .15s; }
.mini-link:hover { filter: brightness(1.18); }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.post-text { font: 400 18px/1.7 var(--font-reading); }
.gm-body .post-text > p:first-child::first-letter { margin: 6px 10px 0 0; font: 900 62px/.8 var(--font-display); color: var(--sc-head); }
/* A quote is boxed like read-aloud text. */
.post-text blockquote { border: 0; border-left: 2px solid var(--sc-rule); border-right: 2px solid var(--sc-rule); background: var(--sc-box); }
.post-text pre { border: 1px solid var(--sc-gold-soft); background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { color: var(--sc-head); letter-spacing: .06em; }
.post-text h3 { padding-bottom: 3px; border-bottom: 2px solid var(--sc-gold); }
/* Dice: the total sits on the face of a die. */
.roll-card { border-radius: 0; border-color: var(--sc-gold); border-left: 3px solid var(--sc-rule); background: var(--sc-box); }
.roll-group i { border-radius: 2px; }
.roll-total { min-width: 34px; height: 36px; padding: 0 5px; border-radius: 0; background: var(--sc-btn); color: var(--sc-btn-ink); font: 700 15px/36px var(--font-display); clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
.roll-stamp { border-radius: 0; font-family: var(--font-display); }
.post-actions { border-top: 1px solid var(--sc-gold-soft); }
.post-actions button { font: 700 11px var(--font-display); letter-spacing: .12em; }
.post-actions button:hover { color: var(--accent-2); }

/* Buttons and boxes to type in. */
.f-btn { border-radius: 0; font: 700 12px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.f-btn:not(.ghost) { ${PLAQUE} padding-inline: 20px; color: var(--sc-btn-ink) !important; transition: filter .15s; }
.f-btn:not(.ghost):hover:not(:disabled) { filter: brightness(1.18); }
.f-btn.ghost { border-color: var(--sc-gold); background: transparent; }
.f-btn.ghost:hover:not(:disabled) { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--ink) !important; }
.f-btn.small { font-size: 11px; }
input:not([type="checkbox"]), select, textarea { border-radius: 2px; background: var(--bg); caret-color: var(--accent-2); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
.composer { border: 0; border-top: 4px double var(--sc-gold); }
.composer-kind, .as-label { font-family: var(--font-display); letter-spacing: .1em; color: var(--sc-head); }
.tools { border-radius: 2px; background: var(--bg); }
.tools button { border-radius: 2px; }

/* The foot of the forum. */
.board-foot { border: 1px solid var(--sc-gold); border-top: 4px double var(--sc-gold); background: var(--sc-leather); }
.foot-cols h3, .foot-line h3 { display: flex; align-items: center; gap: 10px; letter-spacing: .14em; color: var(--sc-head); }
.foot-cols h3::before, .foot-line h3::before { ${GEM} }
.foot-staff b { font-family: var(--font-display); letter-spacing: .08em; }
.foot-stats b { font: 700 14px var(--font-display); color: var(--sc-head); }
.to-top { border-radius: 50%; border-color: var(--sc-gold); color: var(--sc-head); box-shadow: 0 0 0 2px var(--panel), 0 0 0 3px var(--sc-gold-soft); }

@container page (max-width: 640px) {
  .board-head { min-height: 280px; --sc-moon-at: 112% 56%; }
  .board-head-text { padding: 30px 14px 138px; }
  .board-title { font-size: 31px; letter-spacing: .05em; }
  .board-tagline { gap: 10px; font-size: 16px; }
  .board-tagline::before, .board-tagline::after { width: 26px; }
  .board-head:not(.has-art) .board-head-text::before { height: 92px; }
  .board-nav a { padding: 11px 12px; font-size: 11px; letter-spacing: .1em; }
  .category-title { font-size: 15.5px; }
  .topic-name { font-size: 22px; }
  .portrait.big.portrait-empty span { font-size: 56px; }
  .mini-card { box-shadow: 0 0 0 1px var(--bg), 0 22px 50px -8px rgba(0, 0, 0, .8); }
}
@media (prefers-reduced-motion: reduce) {
  .unread-dot { animation: none; }
  .mini-card { transform: none; transition: none; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
