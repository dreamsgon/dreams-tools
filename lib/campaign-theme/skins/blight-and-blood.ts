/*
 * Blight and Blood: a fully custom skin, inspired by Dragon Age: Origins. Dark fantasy in bone, old leather and
 * spilled blood. The banner is a battlefield: a horde of spears and standards along the horizon with its fires
 * behind it, a dry spatter of blood in one corner and embers rising, all drawn with gradients and shadows (no
 * picture, nothing from the game). Dark is the night before the battle; light is a page of bone-white vellum.
 * Panels are iron-bound with a stud in each corner, portraits sit on shields, buttons are cut like blades and blood
 * wells a little way into a row under the pointer. Like every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --bb-sky: linear-gradient(180deg, #f3ecde 0%, #e9decb 60%, #dcc7ae 100%);
  --bb-stain: radial-gradient(38% 60% at 10% 14%, rgba(107, 82, 32, .12), transparent 70%), radial-gradient(30% 54% at 92% 30%, rgba(140, 28, 19, .07), transparent 70%);
  --bb-fire: radial-gradient(72% 120px at 50% 100%, rgba(140, 28, 19, .3), transparent 100%);
  --bb-horde: #2a1c17;
  --bb-smoke: rgba(42, 28, 23, .34);
  --bb-blood: #8c1c13;
  --bb-blood-2: #6a120c;
  --bb-ember: rgba(74, 44, 32, .5);
  --bb-title: #221611;
  --bb-title-shadow: 0 0 1px #f3ecde, 0 0 5px #f3ecde, 0 0 16px #f3ecde, 0 0 26px #f3ecde;
  --bb-banner-ink: #261a15;
  --bb-banner-quiet: #4d3d33;
  --bb-nav: rgba(242, 234, 223, .88);
  --bb-iron: #4a3a32;
  --bb-edge: #b9a58d;
  --bb-stud: #6b5a4e;
  --bb-stud-light: #b3a394;
  --bb-hide: linear-gradient(180deg, #f6efe4, #eee4d5);
  --bb-taint: radial-gradient(200px 120px at 100% 100%, rgba(74, 24, 16, .1), transparent 72%);
  --bb-page: radial-gradient(80% 420px at 50% 0%, rgba(140, 28, 19, .09), transparent 70%);
  --bb-shadow: 0 16px 34px -18px rgba(38, 20, 14, .55);
  --bb-band: linear-gradient(180deg, #a02317, #6f130c); --bb-band-ink: #f8eedf;
  --bb-writ: linear-gradient(180deg, #f8f1e5, #ece1cf); --bb-writ-ink: #261a15; --bb-writ-quiet: #655549; --bb-writ-line: #c4b29c; --bb-writ-mark: #8c1c13;
  --card-bg: var(--bb-writ); --card-ink: var(--bb-writ-ink); --card-head: var(--bb-band-ink); --card-line: var(--bb-writ-line);
}
:root[data-theme="dark"] {
  --bb-sky: linear-gradient(180deg, #070403 0%, #120a08 46%, #2a0f0a 100%);
  --bb-stain: radial-gradient(40% 60% at 12% 14%, rgba(120, 20, 14, .2), transparent 70%), radial-gradient(34% 54% at 90% 26%, rgba(110, 74, 34, .14), transparent 70%);
  --bb-fire: radial-gradient(72% 130px at 50% 100%, rgba(232, 104, 34, .6), transparent 100%);
  --bb-horde: #050302;
  --bb-smoke: rgba(5, 3, 2, .62);
  --bb-blood: #a8170f;
  --bb-blood-2: #720f0a;
  --bb-ember: #ffb45c;
  --bb-title: #f1e6d7;
  --bb-title-shadow: 0 2px 16px #000, 0 0 3px #000;
  --bb-banner-ink: #e6dbd0;
  --bb-banner-quiet: #c9b9a8;
  --bb-nav: rgba(10, 7, 6, .74);
  --bb-iron: #5c463a;
  --bb-edge: #3d2d27;
  --bb-stud: #6f5a4d;
  --bb-stud-light: #a8927f;
  --bb-hide: linear-gradient(180deg, #1c1512, #14100e);
  --bb-taint: radial-gradient(200px 120px at 100% 100%, rgba(130, 22, 14, .17), transparent 72%);
  --bb-page: radial-gradient(90% 460px at 50% 0%, rgba(176, 54, 24, .14), transparent 72%);
  --bb-shadow: 0 18px 40px -16px rgba(0, 0, 0, .9);
  --bb-writ: linear-gradient(180deg, #231a16, #15100e); --bb-writ-ink: #e6dbd0; --bb-writ-quiet: #a39489; --bb-writ-line: #3d2d27; --bb-writ-mark: #e0564a;
}`;

const KEYFRAMES = `@keyframes bb-rise { to { transform: translateY(-50%); } }
@keyframes bb-pulse { 50% { opacity: .35; } }`;

const HORDE_INK = "var(--bb-horde)";
/**
 * One value may be 2,000 characters at most (css.ts), so a long list of layers or shadows is handed over in parts:
 * `declare` sets each part as a variable and `use` puts them back together.
 */
const inParts = (name: string, items: string[]) => {
  const parts: string[][] = [[]];
  for (const item of items) {
    const last = parts[parts.length - 1];
    if (last.length && [...last, item].join(", ").length > 1800) parts.push([item]); else last.push(item);
  }
  return { declare: parts.map((part, i) => `--${name}-${i + 1}: ${part.join(", ")};`).join(" "), use: parts.map((_, i) => `var(--${name}-${i + 1})`).join(", ") };
};
/** A rank of spears: `xs` are where the shafts stand in a strip `tile` wide, which then repeats along the bottom. */
const spears = (tile: number, height: number, xs: number[]) => {
  const stops: string[] = [];
  let at = 0;
  for (const x of xs) { stops.push(`transparent ${at}px ${x}px`, `${HORDE_INK} ${x}px ${x + 2}px`); at = x + 2; }
  stops.push(`transparent ${at}px`);
  return [
    `linear-gradient(90deg, ${stops.join(", ")}) left 0 bottom 0 / ${tile}px ${height}px repeat-x`,
    ...xs.map(x => `conic-gradient(from 163deg at ${x + 1}px 0, ${HORDE_INK} 0 34deg, transparent 34.6deg) left 0 bottom ${height}px / ${tile}px 12px repeat-x`),
  ];
};
/** A standard: a pole with its cloth hanging beside the top of it. `side` is 1 for cloth to the right, -1 to the left. */
const standard = (tile: number, x: number, height: number, cloth: [number, number], side: 1 | -1) => {
  const [w, h] = cloth, from = side === 1 ? x + 2 : x - w, tail = Math.round(w / 2), foot = height - h - 4 - tail;
  const point = (at: number) => `conic-gradient(from 333.4deg at ${at}px 100%, ${HORDE_INK} 0 53.2deg, transparent 53.8deg) left 0 bottom ${foot}px / ${tile}px ${tail}px repeat-x`;
  return [
    `linear-gradient(90deg, transparent 0 ${x}px, ${HORDE_INK} ${x}px ${x + 2}px, transparent ${x + 2}px) left 0 bottom 0 / ${tile}px ${height}px repeat-x`,
    `linear-gradient(90deg, transparent 0 ${from}px, ${HORDE_INK} ${from}px ${from + w}px, transparent ${from + w}px) left 0 bottom ${height - h - 4}px / ${tile}px ${h}px repeat-x`,
    point(from + w / 4), point(from + w * 3 / 4),
  ];
};
/** The horde along the horizon: heads, three ranks of spears and two standards, none of them repeating in step. */
const HORDE = inParts("bb-rank", [
  `linear-gradient(0deg, var(--bb-smoke), transparent) left 0 bottom 0 / 100% 150px no-repeat`,
  ...standard(389, 150, 112, [26, 36], 1), ...standard(523, 70, 96, [20, 28], -1),
  ...spears(97, 62, [9, 40, 71]), ...spears(61, 46, [17, 45]), ...spears(139, 78, [24, 88]), ...spears(43, 34, [11, 30]),
  `radial-gradient(8px 8px at 50% 100%, ${HORDE_INK} 96%, transparent) left 3px bottom 17px / 17px 8px repeat-x`,
  `radial-gradient(10px 10px at 50% 100%, ${HORDE_INK} 96%, transparent) left 0 bottom 17px / 29px 10px repeat-x`,
  `linear-gradient(${HORDE_INK}, ${HORDE_INK}) left 0 bottom 0 / 100% 18px no-repeat`,
  "var(--bb-fire)",
]);
/**
 * A spatter of blood, long dry: one small drop repeated as shadows. A few blots where it landed, then a thin line of
 * drops thrown out from them, smaller and wider apart the further they go. The numbers come from a fixed seed, so it
 * is the same spatter every time. It does not move.
 */
const SPRAY = (() => {
  let seed = 41;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const tone = (dark: boolean) => `var(--bb-blood${dark ? "-2" : ""})`;
  const drops: string[] = [];
  for (let i = 0; i < 5; i++) drops.push(`${Math.round((rnd() - .4) * 44)}px ${Math.round((rnd() - .5) * 16)}px 0 ${Math.round(3 + rnd() * 5)}px ${tone(i % 3 === 1)}`);
  for (let i = 0; i < 46; i++) {
    const far = rnd() ** 1.5, distance = 34 + 360 * far, angle = (rnd() - .5) * (0.3 + far * 0.5);
    const size = Math.max(-2, 2.5 - far * 5 + (rnd() - .5) * 2.5);
    drops.push(`${Math.round(distance * Math.cos(angle))}px ${Math.round(distance * Math.sin(angle))}px 0 ${size.toFixed(1)}px ${tone(rnd() < .3)}`);
  }
  return inParts("bb-drops", drops);
})();
/** Embers on the air: a strip of sparks, twice the banner's height so it can rise and loop. */
const EMBERS = [[7, 18, 1.5], [16, 62, 1], [24, 36, 2], [33, 84, 1], [41, 10, 1.5], [52, 55, 1], [60, 28, 2], [69, 76, 1], [78, 44, 1.5], [86, 8, 1], [93, 66, 2], [47, 92, 1.5]]
  .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, var(--bb-ember) 60%, transparent 100%) 0 0 / 100% 50% repeat-y`).join(", ");
/** For a location with no picture: a sword planted in a mound, the fires behind it. */
const MINI = [
  "linear-gradient(0deg, var(--bb-smoke) 0, transparent 40%)",
  `radial-gradient(circle closest-side, ${HORDE_INK} 92%, transparent) 50% calc(100% - 97px) / 8px 8px no-repeat`,
  `linear-gradient(${HORDE_INK}, ${HORDE_INK}) 50% calc(100% - 88px) / 4px 11px no-repeat`,
  `linear-gradient(${HORDE_INK}, ${HORDE_INK}) 50% calc(100% - 85px) / 24px 3px no-repeat`,
  `linear-gradient(${HORDE_INK}, ${HORDE_INK}) 50% calc(100% - 20px) / 5px 66px no-repeat`,
  `conic-gradient(from 115deg at 50% 0, ${HORDE_INK} 0 130deg, transparent 130.6deg) 50% 100% / 150px 32px no-repeat`,
  "radial-gradient(90% 90px at 50% 100%, rgba(232, 104, 34, .4), transparent 100%)", "var(--bb-sky)",
].join(", ");

/** The page behind everything: firelight at the top. */
const PAGE = "background: var(--bb-page), var(--bg);";
/** An iron stud in a corner of a panel. */
const stud = (x: string, y: string) => `radial-gradient(circle at 36% 34%, var(--bb-stud-light) 0 14%, var(--bb-stud) 46%, transparent 62%) ${x} 7px ${y} 7px / 8px 8px no-repeat`;
const STUDS = [stud("left", "top"), stud("right", "top"), stud("left", "bottom"), stud("right", "bottom")].join(", ");
/** A panel: hide bound in iron. A heavy edge along the top, a stud in each corner and the taint creeping in at one. */
const FRAME = `border: 1px solid var(--bb-edge); border-top: 3px solid var(--bb-iron); border-radius: 0; background: ${STUDS}, var(--bb-taint), var(--bb-hide);`;
/** Spilled blood before a heading: a drop and what flew off it. */
const SPLAT = `content: ""; flex: none; display: inline-block; width: 9px; height: 9px; margin-right: 9px; border-radius: 50%; background: var(--accent); box-shadow: 9px -5px 0 -3px var(--accent), 13px 3px 0 -3.5px var(--accent), -3px 8px 0 -3.5px var(--accent);`;
/** A stroke that runs out: a line of blood after a heading. */
const STROKE = `content: ""; flex: 1; height: 3px; background: linear-gradient(90deg, var(--accent), var(--bb-edge) 55%, transparent); clip-path: polygon(0 0, 100% 45%, 100% 55%, 0 100%);`;
/** Small labels: the display face in capitals, set wide. */
const LABEL = "font-family: var(--font-display); font-weight: 400; text-transform: uppercase; letter-spacing: .14em;";
/** Buttons that matter: cut like a blade, in blood. Under the keyboard's focus the cut goes so the ring shows. */
const BLADE = "border: 0; border-radius: 0; padding-inline: 22px; background: var(--bb-band); color: var(--bb-band-ink); clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%);";
/** A little blood wells into a row from its edge under the pointer. */
const WELL = "background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent) left / 0 100% no-repeat, var(--bb-hide); transition: background-size .45s ease, border-color .2s;";
const WELLED = "border-left-color: var(--accent); background-size: 36% 100%, auto;";
/** The shield a portrait sits on. Percentages of its box, which is five wide by eight tall. */
const SHIELD = (() => {
  const radius = 78, from = 46, end = Math.acos((radius - 50) / radius), points: [number, number][] = [];
  for (let a = 0; a < end; a += Math.PI / 36) points.push([radius - radius * Math.cos(a), from + (100 - from) * Math.sin(a) / Math.sin(end)]);
  const left = points.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).reverse(), right = points.map(([x, y]) => `${(100 - x).toFixed(1)}% ${y.toFixed(1)}%`);
  return `polygon(0 0, 100% 0, ${right.join(", ")}, 50% 100%, ${left.join(", ")})`;
})();
const SMALL_SHIELD = "polygon(0 0, 100% 0, 100% 56%, 50% 100%, 0 56%)";

/**
 * The battlefield, drawn behind `host`'s own content: the sky, the horde along the bottom with its fires, a spatter
 * of blood at the top right, and embers rising in front.
 */
function field(host: string) {
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 1px solid var(--bb-edge); border-top: 4px solid var(--accent); border-radius: 0;
  ${HORDE.declare}
  background: ${HORDE.use}, var(--bb-stain), var(--bb-sky);
  color: var(--bb-banner-ink);
}
${host} > * { position: relative; z-index: 2; }
${host}::before {
  content: ""; position: absolute; z-index: 0; right: 300px; top: 64px; width: 16px; height: 5px; border-radius: 50%; pointer-events: none;
  ${SPRAY.declare}
  background: var(--bb-blood); box-shadow: ${SPRAY.use}; rotate: -22deg; opacity: .8;
}
${host}::after {
  content: ""; position: absolute; z-index: 1; left: 0; top: 0; width: 100%; height: 200%; pointer-events: none;
  background: ${EMBERS}; animation: bb-rise 46s linear infinite;
}`;
}
/** The same banner on a phone: the spatter smaller. */
const smallField = (host: string) => `${host}::before { right: 150px; top: 30px; scale: .6; }`;
const TITLE = "font-family: var(--font-display); font-weight: 400; text-transform: uppercase; color: var(--bb-title); text-shadow: var(--bb-title-shadow);";
const STILL = (hosts: string) => `@media (prefers-reduced-motion: reduce) {\n  ${hosts} { animation: none; }\n}`;

/* The Encyclopedia: the campaign's overview gets the battlefield, pages read like a codex bound in iron. */
const ENCYCLOPEDIA = `/* Blight and Blood for the Encyclopedia. The colours and fonts come from the theme; this adds the battlefield, the iron-bound panels and the blood. */
${VARS}
body { ${PAGE} scrollbar-color: var(--bb-iron) var(--panel); }
::selection { background: var(--accent); color: #fff; }

/* The shelf down the side. */
.sidebar { border-right: 1px solid var(--bb-edge); background: var(--bb-hide); }
.csw-name b { font: 400 18px var(--font-display); letter-spacing: .06em; }
.csw-name small { font-family: var(--font-reading); font-style: italic; }
.campaign-link { border-radius: 0; border-left: 3px solid transparent; }
.campaign-link:hover { color: var(--accent); }
.campaign-link.active { border-left-color: var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 20%, transparent), transparent); color: var(--ink); }
.side-heading .section-toggle { ${LABEL} font-size: 12px; color: var(--muted); }
.shared-tag { border-radius: 0; border: 1px solid var(--bb-edge); background: transparent; color: var(--muted); ${LABEL} font-size: 10px; }
.tree-row { border-radius: 0; }
.tree-row:hover { background: color-mix(in srgb, var(--accent-2) 14%, transparent); }
.tree-row:has(.active), .tree-item.active { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 20%, transparent), transparent); color: var(--ink); box-shadow: inset 3px 0 0 var(--accent); }

/* The bar along the top. */
.topbar { border-bottom: 1px solid var(--bb-edge); background: var(--bb-hide); }
.search-box { border-radius: 0; border-color: var(--bb-edge); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
.quick-hint kbd { border-radius: 0; border-color: var(--bb-edge); }

/* Buttons and boxes to type in. */
.button { border-radius: 0; ${LABEL} font-size: 12.5px; }
.button.primary { ${BLADE} transition: filter .15s; }
.button.primary:hover { filter: brightness(1.08); }
.button.primary:focus-visible { clip-path: none; }
.button:not(.primary) { border-color: var(--bb-edge); }
.button:not(.primary):hover { border-color: var(--accent); color: var(--ink); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }

/* The campaign's overview: the battlefield. */
${field(".dashboard-intro")}
.dashboard-intro { min-height: 320px; align-items: flex-start; margin-bottom: 26px; padding: 34px 34px 150px; }
.dashboard-intro .eyebrow { ${LABEL} font-size: 12.5px; color: var(--bb-banner-quiet); }
.dashboard-intro h1 { margin-top: 8px; font-size: 46px; line-height: 1.05; letter-spacing: .1em; ${TITLE} }
.dashboard-intro .subtitle { max-width: 40ch; font: italic 400 18px/1.5 var(--font-reading); color: var(--bb-banner-ink); text-shadow: var(--bb-title-shadow); }
.dashboard-intro .icon-button { border: 1px solid var(--bb-edge); background: var(--bb-nav); color: var(--bb-banner-ink); }
.overview-strip { border-color: var(--bb-edge); }
.overview-strip strong { font: 600 19px var(--font-reading); color: var(--accent); }

/* Headings: spilled blood, the name in capitals, then a stroke that runs out. */
.section-heading h2 { flex: 1; display: flex; align-items: center; gap: 12px; font: 400 20px var(--font-display); letter-spacing: .16em; text-transform: uppercase; }
.section-heading h2::before { ${SPLAT} }
.section-heading h2::after { ${STROKE} }
.eyebrow { ${LABEL} font-size: 11.5px; }

/* Cards: bound in iron, and blood wells in from the edge under the pointer. */
.note-card { border: 1px solid var(--bb-edge); border-top: 3px solid var(--bb-iron); border-left: 3px solid var(--bb-iron); border-radius: 0; ${WELL} padding: 20px; }
.note-card:hover { ${WELLED} }
.note-card h3 { font: 400 22px/1.15 var(--font-display); letter-spacing: .04em; text-transform: none; }
.note-card:hover h3 { color: var(--accent); }
.note-card .eyebrow, .card-footer { color: var(--accent-2); }
.note-card.add-card { border: 1px dashed var(--bb-edge); background: transparent; }

/* A page: a leaf of the codex. */
.kind-pill { padding: 2px 10px; border-radius: 0; border: 1px solid var(--accent); ${LABEL} font-size: 11px; }
.article-title h1 { font-family: var(--font-display); font-weight: 400; letter-spacing: .05em; text-transform: none; }
.tag-add, .who-button { border-radius: 0; }
.article-tabs { border-bottom: 1px solid var(--bb-edge); }
.article-tabs button { border-radius: 0; ${LABEL} font-size: 12.5px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); box-shadow: inset 0 -3px 0 var(--accent); }
.picture-panel { border-radius: 0; border-color: var(--bb-edge); border-top: 3px solid var(--bb-iron); }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-display); font-weight: 400; letter-spacing: .05em; }
.prose h2 { padding-bottom: 5px; border-bottom: 0; background: linear-gradient(90deg, var(--accent), var(--bb-edge) 40%, transparent) left bottom / 100% 2px no-repeat; }
.prose h3 { color: var(--accent); }
.prose blockquote { border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent-2) 10%, transparent); font-style: italic; }
.prose code, .prose pre { border-radius: 0; }
.article-aside .aside-section { border-top: 1px solid var(--bb-edge); }
.article-aside .eyebrow { color: var(--accent); }

${KEYFRAMES}
@media (max-width: 640px) {
  .dashboard-intro { min-height: 270px; padding: 24px 18px 130px; }
  .dashboard-intro h1 { font-size: 30px; }
  .dashboard-intro .subtitle { max-width: 26ch; font-size: 16px; }
  ${smallField(".dashboard-intro")}
}
${STILL(".dashboard-intro::after")}
`;

/* Maptable: hide and iron around the table, and the Scene Picker gets the battlefield. */
const MAPTABLE = `/* Blight and Blood for Maptable. The map itself keeps its own colours; everything around it is hide, iron and blood. */
${VARS}
body { ${PAGE} scrollbar-color: var(--bb-iron) var(--panel); }
::selection { background: var(--accent); color: #fff; }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 1px solid var(--bb-edge); background: var(--bb-hide); }
.header-scene strong { color: var(--accent); }
.csw-btn { border-radius: 0; }
.csw-name b { font: 400 17px var(--font-display); letter-spacing: .06em; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${BLADE} ${LABEL} font-size: 12.5px; transition: filter .15s; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { background: var(--bb-band); filter: brightness(1.08); }
.primary.primary.primary:focus-visible { clip-path: none; }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
input[type="range"] { accent-color: var(--accent); }

/* The tool rail: a blood edge when on. */
.rail { border-right: 1px solid var(--bb-edge); background: var(--bb-hide); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--accent); }
.rail button.active { border-left: 3px solid var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 24%, transparent), transparent); color: var(--accent); }

/* The side panel. */
.side-panel { border-right: 1px solid var(--bb-edge); background: var(--bb-hide); }
.panel-title { border-bottom: 1px solid var(--bb-edge); }
.panel-title h2 { display: flex; align-items: center; gap: 10px; font: 400 17px var(--font-display); letter-spacing: .16em; text-transform: uppercase; }
.panel-title h2::before { ${SPLAT} }
.organizer-scene { border-radius: 0; border-left: 3px solid transparent; white-space: normal; }
.organizer-scene:hover { background: color-mix(in srgb, var(--accent-2) 14%, transparent); }
.organizer-scene.active { border-left-color: var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 22%, transparent), transparent); }
.organizer-scene strong { font: 400 16.5px/1.2 var(--font-display); letter-spacing: .04em; }
.organizer-scene.active strong { color: var(--accent); }
.scene-kind { border-radius: 0; color: var(--accent-2); }

/* Around the map: firelight past the edge of the table. */
.map-topbar { border-bottom: 1px solid var(--bb-edge); background: var(--bb-hide); }
.map-title { ${LABEL} font-size: 12px; color: var(--muted); }
.board { background: radial-gradient(70% 60% at 50% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%), var(--bg); }
.board-info { ${LABEL} color: var(--accent-2); }
.zoom-controls { border-radius: 0; border-color: var(--bb-edge); }
.toolbar { border-radius: 0; border: 1px solid var(--bb-edge); border-top: 3px solid var(--bb-iron); background: var(--bb-hide); box-shadow: var(--bb-shadow); }
.toolbar button { border-radius: 0; ${LABEL} font-size: 12px; }
.toolbar button:hover { color: var(--accent); }
.toolbar button.active { background: var(--bb-band); color: var(--bb-band-ink); }

/* The Scene Picker: the battlefield. */
${field(".campaign-scenes-head")}
.campaign-scenes-head { min-height: 290px; align-items: flex-start; padding: 28px 28px 140px; }
.campaign-scenes-head small { ${LABEL} font-size: 12.5px; color: var(--bb-banner-quiet); }
.campaign-scenes-head h1 { margin-top: 6px; font-size: 42px; line-height: 1.05; letter-spacing: .1em; ${TITLE} }
.dashboard-continue { border: 1px solid var(--bb-edge); border-top: 3px solid var(--bb-iron); border-left: 3px solid var(--bb-iron); border-radius: 0; ${WELL} padding: 20px 28px; }
.dashboard-continue:hover { ${WELLED} }
.dashboard-continue small { ${LABEL} font-size: 12px; color: var(--accent); }
.dashboard-continue strong { font: 400 23px var(--font-display); letter-spacing: .05em; }
.campaign-scenes-kinds button { border-radius: 0; ${LABEL} font-size: 12px; }
.campaign-scenes-group h2 { display: flex; align-items: center; gap: 12px; font: 400 19px var(--font-display); letter-spacing: .16em; text-transform: uppercase; }
.campaign-scenes-group h2::before { ${SPLAT} }
.campaign-scenes-group h2 span { ${LABEL} font-size: 11.5px; }
.campaign-scene-card { border: 1px solid var(--bb-edge); border-top: 3px solid var(--bb-iron); border-radius: 0; background: var(--bb-hide); }
.campaign-scene-card.last { border-top-color: var(--accent-2); }
/* Hover: the card lifts a little and its iron edge turns to blood. */
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { border-top-color: var(--accent); transform: translateY(-2px); box-shadow: 0 12px 22px -18px rgba(0, 0, 0, .55); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card:active { transform: none; }
.campaign-scene-card { transition: border-color .2s, transform .18s, box-shadow .18s; }
.campaign-scene-card strong { font: 400 17px/1.2 var(--font-display); letter-spacing: .04em; }
.campaign-scene-card em { font: italic 400 13.5px var(--font-reading); color: var(--accent); }
.campaign-scene-card small { font-family: var(--font-reading); font-size: 14px; }
.campaign-scene-picture { border-bottom: 1px solid var(--bb-edge); }

${KEYFRAMES}
@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 250px; padding: 22px 18px 124px; }
  .campaign-scenes-head h1 { font-size: 28px; }
  ${smallField(".campaign-scenes-head")}
}
@media (prefers-reduced-motion: reduce) {
  .campaign-scenes-head::after { animation: none; }
  .campaign-scene-card, .campaign-scene-card:hover { transform: none; transition: none; }
}
`;

/* The campaign's dashboard: the battlefield behind its name, and iron-bound cards. */
const DASHBOARD = `/* Blight and Blood for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--accent); color: #fff; }
.hub-crumbs { ${LABEL} font-size: 12.5px; }
.hub-crumbs a { color: var(--accent); }

/* The top: the battlefield. */
${field(".hub-head")}
.hub-head { min-height: 340px; padding: 30px 30px 160px; }
.hub-title p { ${LABEL} font-size: 12.5px; color: var(--bb-banner-quiet); }
.hub-title h1 { margin-top: 6px; font-size: 48px; line-height: 1.05; letter-spacing: .1em; ${TITLE} }
.hub-chip { border-radius: 0; border-color: var(--bb-edge); background: var(--bb-nav); color: var(--bb-banner-quiet); ${LABEL} font-size: 11px; }
.hub-head .tag-add { border-radius: 0; border-color: var(--bb-edge); background: var(--bb-nav); color: var(--bb-banner-ink); }
.hub-head .hub-button:not(.hub-button-primary) { border-color: var(--bb-edge); background: var(--bb-nav); color: var(--bb-banner-ink); backdrop-filter: blur(4px); }

/* Buttons. */
.hub-button { border-radius: 0; ${LABEL} font-size: 12.5px; }
.hub-button-primary { ${BLADE} transition: filter .15s; }
.hub-button-primary:hover { filter: brightness(1.08); }
.hub-button-primary:focus-visible { clip-path: none; }
.hub-button:not(.hub-button-primary):hover { border-color: var(--accent); color: var(--ink); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 1px solid var(--bb-edge); }
.hub-tabs button, .hub-tabs a { border-radius: 0; ${LABEL} font-size: 13px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }
.mem-count { border-radius: 0; }

/* Cards: bound in iron. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; display: flex; align-items: center; gap: 10px; font: 400 18px var(--font-display); letter-spacing: .16em; text-transform: uppercase; color: var(--ink); }
.hub-card-head h2::before { ${SPLAT} }
.hub-card-head a, .hub-card-head .hub-text-button { ${LABEL} font-size: 12px; }
.hub-scene-grid li { border-radius: 0; }

${KEYFRAMES}
@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 22px 18px 134px; }
  .hub-title h1 { font-size: 30px; }
  ${smallField(".hub-head")}
}
${STILL(".hub-head::after")}
`;

export const BLIGHT_AND_BLOOD: Theme = {
  id: "preset-blight", name: "Blight and Blood", mode: "both", radius: 0, banner: "picture", fonts: { display: "marcellus", reading: "spectral", ui: "inter" },
  colors: {
    light: { bg: "#e3d9cb", panel: "#f2eadf", raised: "#e9dfd1", line: "#c4b29c", ink: "#261a15", muted: "#655549", accent: "#8c1c13", accent2: "#6b5220" },
    dark: { bg: "#0d0a09", panel: "#171210", raised: "#201916", line: "#3d2d27", ink: "#e6dbd0", muted: "#a39489", accent: "#d8483b", accent2: "#b99b6b" },
  },
  css: `/* Blight and Blood: dark fantasy in bone, old leather and spilled blood. The banner is a battlefield: a horde of spears and standards along the horizon with its fires behind it, a dry spatter of blood in one corner and embers rising, all drawn with gradients and shadows.
   Dark is the night before the battle; light is a page of bone-white vellum. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--bb-iron) var(--panel); }
::selection { background: var(--accent); color: #fff; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border: 0; border-bottom: 1px solid var(--bb-edge); background: var(--bb-hide); }
.board-date { ${LABEL} font-size: 12.5px; }
.board-date::before { ${SPLAT} margin-right: 16px; }
.board-date b { ${LABEL} font-size: 12.5px; color: var(--accent); }
.circ { border-radius: 0; border: 0; background: var(--bb-iron); color: #f1e6d7; font: 400 12px var(--font-display); clip-path: ${SMALL_SHIELD}; }
.you b { font: 400 17px var(--font-display); letter-spacing: .08em; text-transform: uppercase; }
.search-box { border-color: var(--bb-edge); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the horde and its fires along the bottom, a spatter of blood in one corner and embers rising. */
.board-head { min-height: 360px; border: 1px solid var(--bb-edge); border-top: 4px solid var(--accent); }
.board-head:not(.has-art) {
  background: var(--bb-stain), var(--bb-sky);
  --head-ink: var(--bb-banner-ink); --head-title: var(--bb-title); --head-shadow: var(--bb-title-shadow); --head-nav: var(--bb-nav); --head-line: var(--bb-edge);
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 62px 40px 150px; overflow: hidden; }
.board-head:not(.has-art) .board-head-text { ${HORDE.declare} background: ${HORDE.use}; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-head:not(.has-art) .board-head-text::before {
  content: ""; position: absolute; z-index: 0; left: 64px; top: 46px; width: 16px; height: 5px; border-radius: 50%;
  ${SPRAY.declare}
  background: var(--bb-blood); box-shadow: ${SPRAY.use}; rotate: -7deg; opacity: .8;
}
.board-head:not(.has-art) .board-head-text::after {
  content: ""; position: absolute; z-index: 1; left: 0; top: 0; width: 100%; height: 200%;
  background: ${EMBERS}; animation: bb-rise 46s linear infinite;
}
.board-title { font: 400 56px/1.08 var(--font-display); letter-spacing: .16em; text-transform: uppercase; }
.board-tagline { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 14px; font: italic 400 21px var(--font-reading); color: var(--bb-banner-ink); text-shadow: var(--bb-title-shadow); }
.board-tagline::after { content: ""; width: 150px; height: 4px; background: var(--accent); clip-path: polygon(0 50%, 50% 0, 100% 50%, 50% 100%); }
.board-nav { border-top: 1px solid var(--head-line); background: var(--head-nav); backdrop-filter: blur(5px); }
.board-nav a { padding: 12px 20px; ${LABEL} font-size: 13.5px; }
.board-nav a:hover { color: var(--accent); border-bottom-color: var(--accent); }
/* With a banner picture: the picture under smoke and shadow, the same title over it. */
.board-head.has-art {
  background: linear-gradient(180deg, rgba(13, 8, 6, .6) 0%, rgba(13, 8, 6, .12) 38%, rgba(13, 8, 6, .35) 64%, rgba(13, 8, 6, .92) 100%), radial-gradient(120% 100% at 50% 45%, transparent 50%, rgba(20, 4, 2, .7)), var(--banner) var(--banner-x, 50%) var(--banner-y, 50%) / var(--banner-size, cover) no-repeat;
  --head-ink: #e6dbd0; --head-title: #f4eadb; --head-shadow: 0 2px 16px #000, 0 0 3px #000; --head-nav: rgba(10, 7, 6, .74); --head-line: #4a3229;
}
.board-head.has-art .board-head-text { justify-content: center; padding: 60px 40px 70px; }
.board-head.has-art .board-tagline { color: #e6dbd0; text-shadow: 0 1px 8px #000, 0 0 2px #000; }
.board-head.has-art .board-tagline::after { background: #e0564a; }

${KEYFRAMES}

/* Headings: spilled blood, the name in capitals, then a stroke that runs out. */
.category-title { gap: 12px; font: 400 21px var(--font-display); letter-spacing: .18em; text-transform: uppercase; color: var(--ink); }
.category-title::before { ${SPLAT} }
.category-title::after { ${STROKE} }
.tag { border-radius: 0; border-color: var(--bb-edge); color: var(--muted); ${LABEL} font-size: 10px; text-shadow: none; }
.tag.new { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }

/* Boards and topics: hide with an iron edge. Under the pointer the edge turns to blood and it wells into the row. */
.category-forums, .topics { gap: 8px; }
.forum, .topic-row { border: 1px solid var(--bb-edge); border-left: 4px solid var(--bb-iron); border-radius: 0; ${WELL} }
.forum:hover, .topic-row:hover { ${WELLED} }
.topic-row.pinned { border-left-color: var(--accent); }
.forum-name { font: 400 23px/1.15 var(--font-display); letter-spacing: .05em; text-transform: none; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum:hover .forum-name a, .topic-row:hover .topic-title a, .forum-name a:hover, .topic-title a:hover { color: var(--accent); }
.forum-desc { font: italic 400 16.5px/1.45 var(--font-reading); }
.forum-place { ${LABEL} font-size: 11px; }
.forum-place a { color: var(--accent-2); }
.forum-counts b { font: 600 19px var(--font-reading); color: var(--accent); }
.last-label { ${LABEL} font-size: 10.5px; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 600 16px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { font: 400 20px/1.2 var(--font-display); letter-spacing: .04em; text-transform: none; }
.topic-count b { font: 600 18px var(--font-reading); color: var(--accent); }
.unread-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); box-shadow: 7px -4px 0 -3px var(--accent), -3px 6px 0 -3.5px var(--accent); animation: bb-pulse 2.6s ease-in-out infinite; }
/* Small portraits sit on a small shield. */
.portrait.small, .portrait.tiny { border-radius: 0; border: 0; background: color-mix(in srgb, var(--accent-2) 30%, var(--raised)); color: var(--ink); font-family: var(--font-display); font-weight: 400; box-shadow: none; clip-path: ${SMALL_SHIELD}; }
.portrait.small span, .portrait.tiny span { padding-bottom: 14%; }
/* A location with no picture gets a sword planted in a mound. */
.forum-art { border-right: 1px solid var(--bb-edge); }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} }
.location-art { border-right: 1px solid var(--bb-edge); }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${LABEL} font-size: 12px; color: var(--accent); }
.location-name { font-weight: 400; font-size: 31px; letter-spacing: .08em; text-transform: uppercase; }
.location-summary { font: italic 400 17px/1.55 var(--font-reading); }

/* Topic pages. */
.crumbs { ${LABEL} font-size: 12px; }
.crumbs a { color: var(--accent-2); }
.topic-head { ${FRAME} }
.topic-name { font: 400 33px/1.12 var(--font-display); letter-spacing: .08em; text-transform: uppercase; }
.cast-chip, .today-chip { border-radius: 0; border-color: var(--bb-edge); }

/* Posts: iron-bound leaves, the name in capitals over a stroke of blood, the portrait on a shield. */
.posts { gap: 22px; }
.post { ${FRAME} }
.post.fresh { border-top-color: var(--accent); }
.post-band, .post.flip .post-band { padding: 16px 28px 11px; border-bottom: 0; background: linear-gradient(90deg, var(--accent), var(--bb-edge) 34%, transparent 86%) left 28px bottom 0 / calc(100% - 56px) 2px no-repeat; }
.post-name { font: 400 24px/1.1 var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.post-name a { color: var(--ink); }
.post-name a::before { ${SPLAT} margin-right: 18px; vertical-align: 4px; }
.post-meta { ${LABEL} font-size: 11.5px; }
.post-meta a { color: var(--accent-2); }
.mini-portrait { filter: drop-shadow(1px 0 0 var(--bb-iron)) drop-shadow(-1px 0 0 var(--bb-iron)) drop-shadow(0 -2px 0 var(--bb-iron)) drop-shadow(0 1px 0 var(--bb-iron)); }
.portrait.big { border: 0; clip-path: ${SHIELD}; }
.portrait.big::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, transparent 50%, rgba(40, 8, 4, .55)); }
.portrait.big.portrait-empty { background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 62%), var(--raised); }
.portrait.big.portrait-empty span { padding-bottom: 22%; font: 400 104px var(--font-display); color: color-mix(in srgb, var(--accent-2) 70%, var(--ink)); }
/* The character card that opens over a portrait: a writ with a band of blood across its head, which drops into place. */
.mini-card {
  display: flex; flex-direction: column; padding: 18px; border: 1px solid var(--bb-writ-line); border-top: 0;
  background: var(--bb-writ); color: var(--bb-writ-ink); box-shadow: var(--bb-shadow);
  transform: translateY(-10px); transition: opacity .2s ease, visibility .2s, transform .2s ease;
}
.mini-portrait:hover .mini-card, .mini-portrait:focus-within .mini-card, .mini.open .mini-card, .mini-card.shown { transform: none; }
.mini-card > *, .mini-card dd { color: var(--bb-writ-ink); }
.mini-card > .mini-name { flex: none; margin: -18px -18px 0; padding: 15px 18px 12px; background: var(--bb-band); color: var(--bb-band-ink); font: 400 21px/1.15 var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.mini-role { position: relative; margin: 12px 0 14px; padding-bottom: 14px; border-bottom: 1px solid var(--bb-writ-line); font: italic 400 16px/1.4 var(--font-reading); color: var(--bb-writ-quiet); }
.mini-quote { font: italic 400 16px/1.45 var(--font-reading); color: var(--bb-writ-quiet); opacity: 1; }
.mini-traits .chip { border-radius: 0; }
.mini-fields dt { ${LABEL} font-size: 11px; color: var(--bb-writ-mark); }
.mini-fields dd { font: 400 15.5px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 7px 22px; ${BLADE} color: var(--bb-band-ink) !important; ${LABEL} font-size: 12px; text-decoration: none; transition: filter .15s; }
.mini-link:hover { filter: brightness(1.08); }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${LABEL} font-size: 11.5px; line-height: 1.6; }
.mini-player b { color: var(--accent); }
.post-text { font: 400 18px/1.7 var(--font-reading); }
.gm-body .post-text > p:first-child::first-letter { margin: 7px 10px 0 0; font: 400 70px/.74 var(--font-display); color: var(--accent); }
.post-text blockquote { border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent-2) 10%, transparent); }
.post-text pre { border: 1px solid var(--bb-edge); background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { font-weight: 400; letter-spacing: .06em; color: var(--ink); }
.post-text h3 { font-size: 23px; }
.post-text h4 { font-size: 20px; }
.roll-card { border-radius: 0; border-color: var(--bb-edge); border-left: 4px solid var(--accent); }
.roll-group i, .roll-stamp { border-radius: 0; }
.roll-total { border-radius: 0; font: 600 17px/26px var(--font-reading); }
.post-actions { border-top: 1px solid var(--bb-edge); }
.post-actions button { ${LABEL} font-size: 12px; }
.post-actions button:hover { color: var(--accent); }

/* Buttons and boxes to type in. */
.f-btn { border-radius: 0; ${LABEL} font-size: 12.5px; }
.f-btn:not(.ghost) { ${BLADE} color: var(--bb-band-ink) !important; transition: filter .15s; }
.f-btn:not(.ghost):hover:not(:disabled) { filter: brightness(1.08); }
.f-btn:not(.ghost):focus-visible { clip-path: none; }
.f-btn.ghost { border-color: var(--bb-edge); background: transparent; }
.f-btn.ghost:hover:not(:disabled) { border-color: var(--accent); background: transparent; color: var(--accent) !important; }
.f-btn.small { font-size: 11.5px; }
input:not([type="checkbox"]), select, textarea { border-radius: 0; background: var(--bg); caret-color: var(--accent); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
.composer { border: 0; border-top: 1px solid var(--bb-edge); }
.composer-kind, .as-label { ${LABEL} color: var(--accent); }
.tools { border-radius: 0; background: var(--bg); }
.tools button { border-radius: 0; }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { display: flex; align-items: center; gap: 10px; font-weight: 400; font-size: 17px; letter-spacing: .16em; text-transform: uppercase; color: var(--ink); }
.foot-cols h3::before, .foot-line h3::before { ${SPLAT} }
.foot-staff b { font: 400 16px var(--font-display); letter-spacing: .06em; }
.foot-stats b { font: 600 17px var(--font-reading); color: var(--accent); }
.to-top { border-radius: 0; border-color: var(--bb-edge); color: var(--accent); }

@container page (max-width: 640px) {
  .board-head { min-height: 300px; }
  .board-head-text { padding: 34px 18px 130px; }
  .board-title { font-size: 31px; letter-spacing: .12em; }
  .board-tagline { font-size: 17px; }
  .board-head:not(.has-art) .board-head-text::before { left: 16px; top: 9px; scale: .55; }
  .board-nav a { padding: 10px 11px; font-size: 12px; }
  .category-title { font-size: 18px; }
  .forum-name { font-size: 21px; }
  .topic-name { font-size: 24px; }
  .post-name { font-size: 20px; }
  .portrait.big.portrait-empty span { font-size: 54px; }
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
