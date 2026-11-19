/*
 * Lance and Moons: a fully custom skin, inspired by the Dragonlance novels of the 1980s, the painted fantasy
 * paperbacks with silver titles and maps and poems inside. The banner is a night over the mountains with the world's
 * three moons, silver, red and the black one only its rim gives away, a few constellations drawn star to star, and a
 * lone tower of sorcery on the far ridge; by day it is an autumn twilight. Titles are silver capitals in Almendra,
 * text is EB Garamond, like the novels' pages. The three moons are the ornament everywhere: before every heading and
 * on top of every post. Rows carry a silver lance down their left edge. The GM's posts read like the poems set in
 * italic at the front of the books, and the character card is a page of parchment. Nothing glows and nothing moves.
 * Like every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --lm-silver: #dfe5ef; --lm-red: #c8423f; --lm-steel: #a99a77; --lm-lance: linear-gradient(180deg, #a3acbd, #5d6880 40%, #3c465c 60%, #8d97ab);
  --lm-panel: linear-gradient(180deg, #fcf8ee, #f4ecda); --lm-tint: rgba(154, 37, 41, .06);
  --lm-heading: #1d1f2b; --lm-rule: linear-gradient(90deg, #9a2529, rgba(154, 37, 41, .15));
  --lm-sky: linear-gradient(180deg, #232650 0%, #4a3f74 34%, #8e5677 60%, #d0786a 80%, #efb26c 100%);
  --lm-star: rgba(255, 246, 230, .55); --lm-line: rgba(255, 246, 230, .22);
  --lm-far: #5b3f63; --lm-near: #2c2140; --lm-nui-body: #2a2346; --lm-ground: #1f1830; --lm-window: #ffd99a;
  --lm-shadow: 0 10px 22px -14px rgba(40, 30, 20, .45);
  --lm-sol: 84px; --lm-sol-r: 150px; --lm-sol-t: 30px; --lm-lun: 52px; --lm-lun-r: 74px; --lm-lun-t: 96px; --lm-nui: 34px; --lm-nui-r: 262px; --lm-nui-t: 62px;
  --card-bg: #f7f0de; --card-ink: #1d1f2b; --card-head: #8e2224; --card-line: #a99a77;
}
:root[data-theme="dark"] {
  --lm-steel: #4d5b7e; --lm-lance: linear-gradient(180deg, #ffffff, #b9c1cf 40%, #7c879c 60%, #d6dce6);
  --lm-panel: linear-gradient(180deg, #121a31, #0d1326); --lm-tint: rgba(200, 66, 63, .07);
  --lm-heading: #ece6d8; --lm-rule: linear-gradient(90deg, #8f9bb8, rgba(143, 155, 184, .1));
  --lm-sky: linear-gradient(180deg, #05070f 0%, #0b1129 40%, #18224a 72%, #2c3766 100%);
  --lm-star: rgba(235, 240, 255, .9); --lm-line: rgba(200, 212, 245, .22);
  --lm-far: #1c2650; --lm-near: #0c1124; --lm-nui-body: #05070d; --lm-ground: #080b18; --lm-window: #e9eef8;
  --lm-shadow: 0 14px 30px -14px rgba(0, 0, 0, .85);
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
const n = (v: number) => +v.toFixed(1);

/** The three moons as a small ornament, 42 by 12: Solinari silver, Lunitari red, Nuitari black with only its rim to show. */
const MOONS = "radial-gradient(circle at 6px 50%, #eef1f7 3.5px, #8e97a8 3.8px 4.6px, transparent 5px), radial-gradient(circle at 21px 50%, #d0453f 4.4px, transparent 5px), radial-gradient(circle at 36px 50%, #0a0d18 3.7px, #8f9bb8 4.1px 4.7px, transparent 5.2px)";
const MOONS_BOX = (pos: string) => `${MOONS.split("), ").map((l, i, a) => (i < a.length - 1 ? l + ")" : l) + ` ${pos} / 42px 12px no-repeat`).join(", ")}`;

/* The banner's night, drawn from the bottom up. */
/** A row of peaks in a tile `tile` wide: one peak `w` wide and `h` tall whose left foot is at `x`, lifted `y`. */
const peaks = (c: string, tile: number, x: number, w: number, h: number, y: number) => {
  const a = Math.atan(w / 2 / h) * 180 / Math.PI;
  return `conic-gradient(from ${n(180 - a)}deg at ${n(x + w / 2)}px 0, ${c} 0 ${n(2 * a)}deg, transparent ${n(2 * a + .5)}deg) left 0 bottom ${y}px / ${tile}px ${h}px repeat-x`;
};
/** A lone tower of sorcery on the far ridge, at the right: a shaft, a pointed roof and two lit windows. */
const TOWER = [
  "linear-gradient(var(--lm-window), var(--lm-window)) right 13.6% bottom 108px / 3px 6px no-repeat",
  "linear-gradient(var(--lm-window), var(--lm-window)) right 13.6% bottom 90px / 3px 6px no-repeat",
  "conic-gradient(from 160deg at 50% 0, var(--lm-far) 0 40deg, transparent 40.5deg) right calc(13.6% - 6px) bottom 124px / 16px 22px no-repeat",
  "linear-gradient(var(--lm-far), var(--lm-far)) right calc(13.6% - 3px) bottom 60px / 10px 66px no-repeat",
];
const RIDGES = [
  "linear-gradient(var(--lm-ground), var(--lm-ground)) left 0 bottom 0 / 100% 14px no-repeat",
  peaks("var(--lm-near)", 520, 30, 240, 70, 10), peaks("var(--lm-near)", 380, 200, 170, 54, 10), peaks("var(--lm-near)", 610, 380, 220, 62, 8),
  ...TOWER,
  peaks("var(--lm-far)", 470, 60, 260, 118, 20), peaks("var(--lm-far)", 330, 140, 180, 92, 22), peaks("var(--lm-far)", 690, 330, 300, 136, 18),
];
/**
 * A constellation (`--lm-con` and `--lm-con-line` can hide it): its stars, and faint lines from each star to the next.
 * Points are in pixels in a box whose top left sits `dx` pixels in from the banner's `side` edge and `dy` from its top.
 * Every offset is in pixels, never a percentage, so the lines meet the stars whatever the banner's width.
 */
const constellation = (side: "left" | "right", dx: number, dy: number, pts: [number, number][]) => {
  const at = (x: number, y: number, w: number) => `${side} ${side === "left" ? dx + x : dx - x - w}px top ${dy + y}px`;
  const lines = pts.slice(1).map(([x2, y2], i) => {
    const [x1, y1] = pts[i];
    const left = Math.min(x1, x2), top = Math.min(y1, y2), w = Math.max(2, Math.abs(x2 - x1)), h = Math.max(2, Math.abs(y2 - y1));
    const dir = (x2 - x1) * (y2 - y1) > 0 ? "to top right" : "to bottom right";
    return `linear-gradient(${dir}, transparent calc(50% - .7px), var(--lm-con-line, var(--lm-line)) calc(50% - .5px) calc(50% + .5px), transparent calc(50% + .7px)) ${at(left, top, w)} / ${w}px ${h}px no-repeat`;
  });
  const stars = pts.map(([x, y]) => `radial-gradient(circle closest-side, var(--lm-con, var(--lm-star)) 40%, transparent 100%) ${at(x - 3, y - 3, 6)} / 6px 6px no-repeat`);
  return [...stars, ...lines];
};
const STARS = [[4, 12, 1], [11, 30, 1.2], [19, 8, 1], [27, 22, 1], [36, 6, 1.4], [45, 34, 1], [53, 14, 1], [62, 28, 1.2], [68, 6, 1], [93, 10, 1], [97, 30, 1.2]]
  .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, var(--lm-star) 50%, transparent 100%)`).join(", ");
/** A moon's disc, its colours lit from the front, with a soft hard edge. */
const disc = (stops: string) => `radial-gradient(circle closest-side, ${stops}, transparent 100%)`;
const SOLINARI = disc("#ffffff 0, #eef1f7 40%, #c9d0de 82%, #9ea8bd 97%");
const LUNITARI = disc("#f39183 0, #d4483f 48%, #a52d29 84%, #7c1f1c 97%");
/**
 * One moon at the right of the sky: `name` is its variables, a right offset, a top offset and a size, so each banner
 * and each width can move it. A light falls on its upper left, and a faint halo sits round it.
 */
const moon = (name: string, body: string, light: string, halo: string) => {
  const r = `var(--lm-${name}-r)`, t = `var(--lm-${name}-t)`, s = `var(--lm-${name})`;
  return [
    ...(light ? [`radial-gradient(circle closest-side, ${light}, transparent) right calc(${r} + ${s} * .31) top calc(${t} + ${s} * .07) / calc(${s} * .62) calc(${s} * .62) no-repeat`] : []),
    `${body} right ${r} top ${t} / ${s} ${s} no-repeat`,
    `radial-gradient(circle closest-side, ${halo}, transparent) right calc(${r} - ${s} / 2) top calc(${t} - ${s} / 2) / calc(${s} * 2) calc(${s} * 2) no-repeat`,
  ];
};
/** The three moons: Solinari large and silver, Lunitari red, Nuitari black, only its rim to show where it is. */
const SKY_MOONS = [
  ...moon("sol", SOLINARI, "rgba(255, 255, 255, .7)", "rgba(220, 230, 250, .16)"),
  ...moon("lun", LUNITARI, "rgba(255, 190, 170, .45)", "rgba(220, 80, 70, .13)"),
  ...moon("nui", disc("var(--lm-nui-body) 86%, rgba(150, 165, 205, .6) 90% 96%"), "", "rgba(150, 165, 205, .06)"),
];
const NIGHT = (name: string) => inParts(name, [
  ...RIDGES, ...SKY_MOONS,
    ...constellation("left", 44, 6, [[0, 40], [34, 22], [70, 30], [96, 6], [128, 18]]),
    ...constellation("right", 430, 30, [[0, 0], [26, 30], [60, 26], [84, 54]]),
  STARS, "var(--lm-sky)",
]);
/** The moons placed for a narrow banner: smaller, tucked into the top right. */
/** On a phone the black moon moves up beside the red one, so the title keeps the width. */
const PHONE_MOONS = "--lm-nui-r: 28px; --lm-nui-t: 16px;";
const SMALL_MOONS = "--lm-con: transparent; --lm-con-line: transparent; --lm-sol: 52px; --lm-sol-r: 64px; --lm-sol-t: 16px; --lm-lun: 32px; --lm-lun-r: 22px; --lm-lun-t: 58px; --lm-nui: 22px; --lm-nui-r: 132px; --lm-nui-t: 34px;";

/** For a location with no picture: the moons over a ridge, in small. */
const MINI = [
  `${SOLINARI} right 22% top 14px / 26px 26px no-repeat`,
  `${LUNITARI} right 10% top 44px / 15px 15px no-repeat`,
  peaks("var(--lm-near)", 140, 10, 90, 30, 0), peaks("var(--lm-far)", 160, 50, 100, 52, 6), "var(--lm-sky)",
].join(", ");

/* Shared pieces of the look. */
/** The page: plain paper by day; by night a few faint stars at the top. */
const PAGE = "background: radial-gradient(ellipse 80% 480px at 50% 0, var(--lm-tint), transparent), var(--bg);";
/** A panel: a steel line, a faint second line inside it, the novels' paper by day and the night sky's blue by night. */
const FRAME = "border: 1px solid var(--lm-steel); border-radius: 2px; background: var(--lm-panel); outline: 1px solid color-mix(in srgb, var(--lm-steel) 45%, transparent); outline-offset: -5px; box-shadow: var(--lm-shadow);";
/** A row: a panel with a silver lance down its left edge. Under the pointer it warms a little toward the red moon. */
const ROW = `${FRAME} border-left: 0; background: var(--lm-lance) left top / 4px 100% no-repeat, var(--lm-panel); padding-left: 18px;`;
const ROW_ON = "background: var(--lm-lance) left top / 4px 100% no-repeat, linear-gradient(var(--lm-tint), var(--lm-tint)), var(--lm-panel);";
/** Small labels: small capitals. */
const SMALL = "font-family: var(--font-reading); font-weight: 600; font-variant: small-caps; text-transform: lowercase; letter-spacing: .08em;";
/** Headings: Almendra. */
const HEAD = "font-family: var(--font-display); font-weight: 700; letter-spacing: .01em;";
/** The silver of the title: bright metal, edged dark, the fill repeated once per line (with a fallback before it). */
const SILVER_FILL = "linear-gradient(180deg, #ffffff 0%, #e6eaf2 42%, #8e97a8 52%, #e8ecf3 70%, #b7bfcc 100%)";
const SILVER = `background: ${SILVER_FILL}; background: ${SILVER_FILL} 0 0 / 100% 1lh repeat-y; -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(1px 0 0 #0a0d1c) drop-shadow(-1px 0 0 #0a0d1c) drop-shadow(0 1px 0 #0a0d1c) drop-shadow(0 3px 4px rgba(5, 7, 15, .7));`;
const TITLE = `display: block; width: fit-content; max-width: 100%; overflow-wrap: break-word; ${HEAD} ${SILVER}`;
/** Buttons: the main ones in the red moon's red with silver lettering; the others steel lines. */
const RED_BTN = "border: 1px solid #5a1416; border-radius: 2px; background: linear-gradient(180deg, #b23431, #8a2224 55%, #6e1719); color: #f5efe2; box-shadow: inset 0 1px 0 rgba(255, 210, 200, .35); font-family: var(--font-reading); font-weight: 600; letter-spacing: .04em;";
const RED_ON = "background: linear-gradient(180deg, #c03b37, #962628 55%, #7a1b1d); color: #ffffff;";
const STEEL_BTN = "border: 1px solid var(--lm-steel); border-radius: 2px; background: transparent; color: var(--ink); box-shadow: none; font-family: var(--font-reading); font-weight: 600; letter-spacing: .04em;";
const STEEL_ON = "border-color: var(--accent-2); background: linear-gradient(var(--lm-tint), var(--lm-tint)); color: var(--ink);";
/** A heading: the three moons, the words, and a fading rule running out to the right. */
const mooned = (h: string) => `${h} { display: flex; align-items: center; gap: 12px; }
${h}::before { content: ""; flex: none; width: 42px; height: 12px; background: ${MOONS_BOX("left top")}; }
${h}::after { content: ""; flex: 1; min-width: 24px; height: 1px; background: var(--lm-rule); }`;

/** The cover for the other parts: the night behind the host's own content, with the moons at the right. */
function cover(host: string, name: string) {
  const back = NIGHT(name);
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 1px solid var(--lm-steel); border-radius: 2px;
  outline: 1px solid rgba(220, 228, 245, .25); outline-offset: -6px;
  ${back.declare}
  background: ${back.use};
  box-shadow: var(--lm-shadow);
  /* The covers are smaller than the forum's banner, so they leave the constellations out. */
  --lm-con: transparent; --lm-con-line: transparent;
}
${host} > * { position: relative; z-index: 2; }`;
}

/* The Encyclopedia: the novels' pages, with the cover over the overview. */
const ENCYCLOPEDIA = `/* Lance and Moons for the Encyclopedia. The colours and fonts come from the theme. */
${VARS}
body { ${PAGE} scrollbar-color: var(--lm-steel) var(--panel); }
::selection { background: var(--lm-red); color: #ffffff; }

/* The side. */
.sidebar { border-right: 1px solid var(--lm-steel); background: var(--lm-panel); }
.csw-name b { ${HEAD} font-size: 17px; }
.tree-row { border-radius: 2px; }
.tree-row:hover { background: linear-gradient(var(--lm-tint), var(--lm-tint)); }
.tree-row:has(.active), .tree-item.active { background: linear-gradient(var(--lm-tint), var(--lm-tint)); color: var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
.side-heading .section-toggle { ${SMALL} font-size: 13px; color: var(--muted); }
.shared-tag { border-radius: 2px; ${SMALL} font-size: 11px; }

/* The bar along the top. */
.topbar { border-bottom: 1px solid var(--lm-steel); background: var(--lm-panel); }
.search-box { border-radius: 2px; border-color: var(--lm-steel); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); }

/* Buttons and boxes to type in. */
.button { ${STEEL_BTN} font-size: 13.5px; }
.button:hover { ${STEEL_ON} }
.button.primary { ${RED_BTN} font-size: 13.5px; }
.button.primary:hover { ${RED_ON} }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 2px; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }

/* The campaign's overview: the cover. */
${cover(".dashboard-intro", "lm-enc")}
.dashboard-intro { min-height: 300px; align-items: flex-start; margin-bottom: 26px; padding: 40px 340px 120px 40px; }
.dashboard-intro .eyebrow { ${SMALL} font-size: 14px; color: #dfe5ef; }
.dashboard-intro h1 { margin: 10px 0 12px; font-size: 52px; line-height: 1.1; ${TITLE} }
.dashboard-intro .subtitle { max-width: 40ch; font: italic 400 19px/1.45 var(--font-reading); color: #e9e3d6; }
/* The settings button sits low at the right, on the mountains, out of the moons' way. */
.dashboard-intro .icon-button { position: absolute; right: 16px; bottom: 16px; border: 1px solid rgba(220, 228, 245, .5); background: rgba(5, 7, 15, .5); color: #dfe5ef; }
.dashboard-intro .icon-button:hover { border-color: #dfe5ef; background: rgba(5, 7, 15, .7); color: #ffffff; }
.overview-strip { border-color: var(--lm-steel); }
.overview-strip strong { ${HEAD} font-size: 20px; color: var(--accent); }

/* Headings: the three moons, then a rule running out to the right. */
.section-heading h2 { flex: 1; ${HEAD} font-size: 24px; color: var(--lm-heading); }
${mooned(".section-heading h2")}
.eyebrow { ${SMALL} font-size: 12.5px; }

/* Cards: panels with the silver lance down their left edge. */
.note-card { ${ROW} padding: 20px 20px 18px 24px; transition: none; }
.note-card:hover { ${ROW_ON} transform: none; }
.note-card h3 { ${HEAD} font-size: 22px; }
.note-card:hover h3 { color: var(--accent); }
.note-card.add-card { border: 1px dashed var(--lm-steel); background: transparent; box-shadow: none; }
.note-card.add-card:not(:focus-visible) { outline: 0; }

/* A page, like the novels' own. */
.kind-pill { padding: 2px 8px; border-radius: 2px; border: 1px solid var(--accent); background: transparent; color: var(--accent); ${SMALL} font-size: 12px; }
.article-title h1 { ${HEAD} }
.article-tabs { border-bottom: 1px solid var(--lm-steel); }
.article-tabs button { ${SMALL} font-size: 13.5px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent); }
.picture-panel { border-radius: 2px; border-color: var(--lm-steel); }
.prose { font-family: var(--font-reading); font-size: 19px; }
.prose h1, .prose h2, .prose h3 { ${HEAD} }
.prose h2 { padding-bottom: 6px; background: var(--lm-rule) left bottom / 100% 1px no-repeat; }
.prose h3 { color: var(--accent); }
.prose blockquote { border-left: 2px solid var(--accent); background: linear-gradient(var(--lm-tint), var(--lm-tint)); font-style: italic; }
.article-aside .eyebrow { color: var(--accent); }

@media (max-width: 1100px) {
  .dashboard-intro { padding-right: 230px; ${SMALL_MOONS} }
  .dashboard-intro h1 { font-size: 42px; }
}
@media (max-width: 640px) {
  .dashboard-intro { min-height: 0; padding: 26px 20px 110px; ${PHONE_MOONS} }
  .dashboard-intro > div:first-child { padding-right: 120px; }
  .dashboard-intro h1 { font-size: 31px; }
  .dashboard-intro .subtitle { font-size: 16.5px; }
  .section-heading h2 { font-size: 21px; }
  .section-heading h2::after { display: none; }
}
`;

/* Maptable: steel and paper round the table, and the cover over the Scene Picker. */
const MAPTABLE = `/* Lance and Moons for Maptable. The map itself keeps its own colours. */
${VARS}
body { ${PAGE} scrollbar-color: var(--lm-steel) var(--panel); }
::selection { background: var(--lm-red); color: #ffffff; }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 1px solid var(--lm-steel); background: var(--lm-panel); }
.header-scene strong { ${HEAD} color: var(--accent); }
.csw-name b { ${HEAD} font-size: 16px; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${RED_BTN} font-size: 13.5px; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { ${RED_ON} }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 2px; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }
input[type="range"] { accent-color: var(--lm-red); }

/* The tool rail and the side panel. */
.rail { border-right: 1px solid var(--lm-steel); background: var(--lm-panel); }
.rail button { border-radius: 2px; }
.rail button:hover { color: var(--accent); }
.rail button.active { background: linear-gradient(var(--lm-tint), var(--lm-tint)); color: var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
.side-panel { border-right: 1px solid var(--lm-steel); background: var(--lm-panel); }
.panel-title { border-bottom: 1px solid var(--lm-steel); }
.panel-title h2 { ${HEAD} font-size: 19px; }
.organizer-scene { border-radius: 2px; white-space: normal; }
.organizer-scene:hover { background: linear-gradient(var(--lm-tint), var(--lm-tint)); }
.organizer-scene.active { background: linear-gradient(var(--lm-tint), var(--lm-tint)); box-shadow: inset 3px 0 0 var(--accent); }
.organizer-scene strong { font: 600 16px/1.25 var(--font-reading); }
.organizer-scene.active strong { color: var(--accent); }
@media (max-width: 1000px) {
  .rail { border-right: 0; border-top: 1px solid var(--lm-steel); }
  .side-panel { border: 1px solid var(--lm-steel); border-bottom: 0; }
}

/* Around the map. */
.map-topbar { border-bottom: 1px solid var(--lm-steel); background: var(--lm-panel); }
.map-title, .board-info { ${SMALL} font-size: 13px; color: var(--muted); }
.toolbar { border-radius: 2px; border: 1px solid var(--lm-steel); background: var(--lm-panel); box-shadow: var(--lm-shadow); }
.toolbar button { border-radius: 2px; font: 600 13px var(--font-reading); }
.toolbar button:hover { color: var(--accent); }
.toolbar button.active { background: linear-gradient(var(--lm-tint), var(--lm-tint)); color: var(--accent); }

/* The Scene Picker: the cover. */
${cover(".campaign-scenes-head", "lm-map")}
.campaign-scenes-head { min-height: 290px; align-items: flex-start; padding: 36px 340px 110px 36px; }
.campaign-scenes-head > div { flex: 1; min-width: 0; }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head small { ${SMALL} font-size: 14px; color: #dfe5ef; }
.campaign-scenes-head h1 { margin-top: 8px; font-size: 48px; line-height: 1.1; ${TITLE} }
.dashboard-continue { ${ROW} padding: 18px 24px; }
.dashboard-continue:hover { ${ROW} ${ROW_ON} padding: 18px 24px; }
.dashboard-continue small { ${SMALL} font-size: 13px; color: var(--accent); }
.dashboard-continue strong { ${HEAD} font-size: 24px; }
.campaign-scenes-kinds button { border-radius: 2px; font: 600 13px var(--font-reading); }
.campaign-scenes-group h2 { ${HEAD} font-size: 21px; color: var(--lm-heading); }
${mooned(".campaign-scenes-group h2")}
.campaign-scenes-group h2 span { ${SMALL} font-size: 12.5px; }
.campaign-scene-card { ${FRAME} overflow: hidden; }
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { background: linear-gradient(var(--lm-tint), var(--lm-tint)), var(--lm-panel); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card strong { font: 600 16px/1.25 var(--font-reading); }
.campaign-scene-card em { ${SMALL} font-style: normal; font-size: 12px; color: var(--accent); }

@media (max-width: 1100px) {
  .campaign-scenes-head { padding-right: 230px; ${SMALL_MOONS} }
  .campaign-scenes-head h1 { font-size: 40px; }
}
@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 0; flex-wrap: wrap; padding: 24px 20px 100px; ${PHONE_MOONS} }
  .campaign-scenes-head > div { flex: 1 1 100%; padding-right: 120px; }
  .campaign-scenes-head h1 { font-size: 30px; }
  .dashboard-continue strong { font-size: 20px; overflow-wrap: anywhere; }
}
`;

/* The campaign's dashboard: the cover behind its name, and steel-lined panels. */
const DASHBOARD = `/* Lance and Moons for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--lm-red); color: #ffffff; }
.hub-crumbs { ${SMALL} font-size: 13px; }
.hub-crumbs a { color: var(--accent); }

/* The top: the cover. */
${cover(".hub-head", "lm-hub")}
.hub-head { min-height: 300px; padding: 36px 340px 110px 36px; }
.hub-title p { ${SMALL} font-size: 14px; color: #dfe5ef; }
.hub-title h1 { margin-top: 8px; font-size: 52px; line-height: 1.1; ${TITLE} }
.hub-chip { border-radius: 2px; border: 1px solid rgba(220, 228, 245, .5); background: rgba(5, 7, 15, .4); color: #e9e3d6; ${SMALL} font-size: 12px; }
.hub-head .tag-add { border-radius: 2px; border-color: rgba(220, 228, 245, .5); color: #e9e3d6; }
.hub-head .hub-button:not(.hub-button-primary) { border-color: rgba(220, 228, 245, .55); background: rgba(5, 7, 15, .45); color: #f5efe2; }

/* Buttons. */
.hub-button { ${STEEL_BTN} font-size: 13.5px; }
.hub-button:not(.hub-button-primary):hover, .hub-button:not(.hub-button-primary):hover:not(:disabled) { ${STEEL_ON} }
.hub-head .hub-button:not(.hub-button-primary):hover, .hub-head .hub-button:not(.hub-button-primary):hover:not(:disabled) { border-color: #dfe5ef; background: rgba(5, 7, 15, .6); color: #ffffff; }
.hub-button-primary, a.hub-button-primary { ${RED_BTN} font-size: 13.5px; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { ${RED_ON} }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 1px solid var(--lm-steel); }
.hub-tabs button, .hub-tabs a { ${SMALL} font-size: 14px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }

/* Cards. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; ${HEAD} font-size: 21px; color: var(--lm-heading); }
.hub-card-head a, .hub-card-head .hub-text-button { ${SMALL} font-size: 12.5px; }
.hub-scene-grid li { border-radius: 2px; }

@media (max-width: 1100px) {
  .hub-head { padding-right: 230px; ${SMALL_MOONS} }
  .hub-title h1 { font-size: 44px; }
}
@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 24px 20px 100px; ${PHONE_MOONS} }
  .hub-title { padding-right: 120px; }
  .hub-title h1 { font-size: 31px; }
}
`;

const BANNER = NIGHT("lm-sky");

export const LANCE_AND_MOONS: Theme = {
  id: "preset-lance", name: "Lance and Moons", mode: "both", radius: 2, banner: "picture", fonts: { display: "almendra", reading: "garamond", ui: "garamond" },
  colors: {
    light: { bg: "#efe6d2", panel: "#faf5ea", raised: "#f1e8d5", line: "#cdbf9f", ink: "#1d1f2b", muted: "#5a5560", accent: "#9a2529", accent2: "#2f4a7a" },
    dark: { bg: "#080b16", panel: "#10162a", raised: "#161e36", line: "#2c3858", ink: "#ece6d8", muted: "#a9a8b4", accent: "#e8766e", accent2: "#a9bce2" },
  },
  css: `/* Lance and Moons: an eighties fantasy paperback. A night of three moons over the mountains with a tower on the far ridge (an autumn twilight by day),
   silver titles, the novels' paper and type, a silver lance down every row and the three moons as the ornament. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--lm-steel) var(--panel); }
::selection { background: var(--lm-red); color: #ffffff; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { ${FRAME} border-bottom: 0; outline: 0; }
.board-date { ${SMALL} font-size: 13px; }
.board-date b { color: var(--accent); }
.circ { border-radius: 50%; border: 1px solid var(--lm-steel); background: radial-gradient(circle at 35% 30%, #ffffff, #dfe5ef 40%, #9aa4b8); color: #1d1f2b; font: 700 12px var(--font-reading); }
.you b { ${HEAD} font-size: 18px; }
.search-box { border-radius: 2px; border-color: var(--lm-steel); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: a night of three moons over the mountains, the title in silver at the left. */
.board-head { min-height: 330px; border: 1px solid var(--lm-steel); outline: 1px solid rgba(220, 228, 245, .25); outline-offset: -6px; text-align: left; box-shadow: var(--lm-shadow); }
.board-head:not(.has-art) {
  ${BANNER.declare}
  background: ${BANNER.use};
  --head-ink: #e9e3d6; --head-title: #ffffff; --head-shadow: none; --head-nav: transparent; --head-line: transparent;
}
.board-head-text { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding: 46px 380px 110px 44px; }
.board-title { font: 700 62px/1.1 var(--font-display); }
.board-title a { ${TITLE} text-shadow: none; }
.board-tagline { margin-top: 14px; max-width: 34em; font: italic 400 21px/1.45 var(--font-reading); color: var(--head-ink); text-shadow: 0 1px 3px rgba(5, 7, 15, .8); }
/* The links: on the night's darkest blue, under a silver line. */
.board-nav { justify-content: flex-start; padding: 0 28px; border-top: 0; background: linear-gradient(90deg, rgba(223, 229, 239, .7), rgba(223, 229, 239, .1)) left top / 100% 1px no-repeat, linear-gradient(180deg, #0e1430, #080b1a); }
.board-nav a { padding: 13px 16px; border-bottom: 2px solid transparent; color: #e9e3d6; font: 700 16px var(--font-display); }
.board-nav a:hover { color: #ffffff; border-bottom-color: #c8423f; }
.board-nav a:focus-visible { outline: 2px solid #dfe5ef; outline-offset: -4px; }
/* With a banner picture: the picture under a dark wash at the left, the same silver title over it. */
.board-head.has-art { background: linear-gradient(90deg, rgba(5, 7, 15, .72) 0%, rgba(5, 7, 15, .3) 55%, rgba(5, 7, 15, .05) 100%), var(--banner) center var(--banner-y, 50%) / cover no-repeat; --head-ink: #e9e3d6; --head-shadow: none; --head-nav: transparent; --head-line: transparent; }
.board-head.has-art .board-head-text { padding: 56px 44px; }

/* Headings: the three moons, the words in Almendra, a fading rule out to the right. */
.category-title { ${HEAD} font-size: 24px; color: var(--lm-heading); text-shadow: none; }
${mooned(".category-title")}
.category-title::after { order: 9; }
.tag { border-radius: 2px; ${SMALL} font-size: 11.5px; text-shadow: none; }
.tag:where(:not(.topic-tag)) { border-color: var(--lm-steel); color: var(--muted); }
.tag.new { border-color: var(--lm-red); background: var(--lm-red); color: #ffffff; }

/* Boards and topics: panels with the silver lance down their left edge. */
.category-forums, .topics { gap: 10px; }
.forum, .topic-row { ${ROW} }
.topic-row { padding: 14px 18px 14px 20px; }
.forum:hover, .topic-row:hover { ${ROW_ON} }
.topic-row.pinned { border-left: 0; background: linear-gradient(180deg, #e0574f, #8d2622) left top / 4px 100% no-repeat, var(--lm-panel); }
.topic-row.picked { border-color: var(--accent-2); background: var(--lm-lance) left top / 4px 100% no-repeat, linear-gradient(color-mix(in srgb, var(--accent-2) 12%, transparent), color-mix(in srgb, var(--accent-2) 12%, transparent)), var(--lm-panel); }
.forum-name { ${HEAD} font-size: 23px; line-height: 1.15; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum-name a:hover, .topic-title a:hover, .forum:hover .forum-name a, .topic-row:hover .topic-title a { color: var(--accent); }
.forum-desc { font: italic 400 17px/1.45 var(--font-reading); }
.forum-place { ${SMALL} font-size: 12px; }
.forum-place a { color: var(--accent); }
.forum-counts b { ${HEAD} font-size: 19px; color: var(--ink); }
.last-label { ${SMALL} font-size: 12px; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 600 16px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { ${HEAD} font-size: 19px; line-height: 1.25; text-transform: none; }
.topic-main small { font-style: normal; }
.topic-count b { ${HEAD} font-size: 18px; color: var(--ink); }
/* Unread: a small red moon. */
.unread-dot { width: 10px; height: 10px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #f07b6f, #c8423f 50%, #8d2622); box-shadow: 0 0 0 1px rgba(220, 228, 245, .4); }
/* Small portraits: silver moons. */
.portrait.small, .portrait.tiny { border-radius: 50%; border: 1px solid var(--lm-steel); background: radial-gradient(circle at 35% 30%, #ffffff, #dfe5ef 40%, #9aa4b8); color: #1d1f2b; font-family: var(--font-reading); font-weight: 700; box-shadow: none; }
/* A location with no picture gets the moons over a ridge, in small. */
.forum-art { border-right: 1px solid var(--lm-steel); border-radius: 0; }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} overflow: hidden; }
.location-art { border-right: 1px solid var(--lm-steel); }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${SMALL} font-size: 13px; color: var(--accent); }
.location-name { ${HEAD} font-size: 36px; }
.location-summary { font: italic 400 18px/1.55 var(--font-reading); }

/* Topic pages. */
.crumbs { ${SMALL} font-size: 13px; }
.crumbs a { color: var(--accent); }
.topic-head { ${FRAME} }
.topic-name { ${HEAD} font-size: 38px; line-height: 1.1; }
.cast-chip, .today-chip { border-radius: 2px; border-color: var(--lm-steel); }
.mod-tools { gap: 8px; margin-top: 14px; padding-top: 14px; border-top-color: var(--lm-steel); }
.mod-tools .f-btn.small { padding: 6px 12px; }

/* Posts: panels with the three moons sitting on their top edge. */
.posts { gap: 24px; }
.post { position: relative; ${FRAME} }
.post::before { content: ""; position: absolute; z-index: 1; top: -7px; left: 50%; translate: -50% 0; width: 58px; height: 14px; background: ${MOONS_BOX("center")}, var(--bg); }
.post.fresh { box-shadow: inset 0 0 0 1px var(--accent-2), var(--lm-shadow); }
.post-band, .post.flip .post-band { padding: 16px 24px 10px; border-bottom: 1px solid color-mix(in srgb, var(--lm-steel) 60%, transparent); background: none; }
.post-name { ${HEAD} font-size: 24px; line-height: 1.1; color: var(--lm-heading); }
.post-meta { font: italic 400 15px var(--font-reading); }
.post-meta a { color: var(--muted); }
/* The GM's posts read like the poems at the front of the novels: italic, under a red rule, the red moon's warmth on the page. */
.post.post-gm { background: linear-gradient(var(--lm-tint), var(--lm-tint)), var(--lm-panel); }
.gm-band { border-bottom: 1px solid color-mix(in srgb, var(--lm-steel) 60%, transparent); }
.post.post-gm .post-text { padding-left: 18px; border-left: 2px solid var(--accent); font-style: italic; }
.gm-seal { border-radius: 50%; border: 1px solid #5a1416; background: radial-gradient(circle at 35% 30%, #f07b6f, #c8423f 50%, #8d2622); color: #ffffff; box-shadow: none; }
/* A big portrait: a plate in the book, framed with a steel line and a fine one inside it. */
.portrait.big { border: 1px solid var(--lm-steel); border-radius: 2px; outline: 1px solid rgba(220, 228, 245, .45); outline-offset: -7px; box-shadow: var(--lm-shadow); }
.portrait.big.portrait-empty { background: ${MINI}; }
.portrait.big.portrait-empty span { ${HEAD} font-size: 100px; color: rgba(233, 227, 214, .7); }
/* The character card that opens over a portrait: a page of parchment, the name in Almendra and red, what they say
   in italic under a red rule. Paper in both versions. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 20px 18px 16px; border: 1px solid #a99a77; border-radius: 2px;
  background: linear-gradient(180deg, #fbf6e9, #efe3c6); color: #1d1f2b; outline: 1px solid rgba(169, 154, 119, .55); outline-offset: -5px; box-shadow: 0 12px 26px -10px rgba(10, 10, 20, .6);
}
.mini-card > *, .mini-card dd { color: #1d1f2b; }
.mini-card :focus-visible { outline: 2px solid #9a2529; outline-offset: 2px; }
.mini-name { font: 700 23px/1.15 var(--font-display); color: #8e2224; overflow-wrap: anywhere; }
.mini-name::before { content: ""; display: block; width: 42px; height: 12px; margin-bottom: 8px; background: ${MOONS_BOX("left top")}; }
.mini-role { margin: 4px 0 10px; padding-bottom: 8px; border-bottom: 1px solid #c9b993; ${SMALL} font-style: normal; font-size: 13px; color: #5a5560; }
.mini-quote { padding-left: 12px; border-left: 2px solid #9a2529; font: italic 400 17px/1.45 var(--font-reading); color: #1d1f2b; opacity: 1; }
.mini-traits .chip { border-radius: 2px; border-color: #a99a77; color: #1d1f2b !important; }
.mini-fields dt { ${SMALL} font-size: 12px; color: #8e2224; }
.mini-fields dd { font: 400 16px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 7px 16px; ${RED_BTN} color: #f5efe2 !important; font-size: 13.5px; text-decoration: none; }
.mini-link:hover { ${RED_ON} }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${SMALL} font-size: 12.5px; line-height: 1.6; }
.mini-player b { color: var(--accent); }
.post-text { font: 400 19px/1.65 var(--font-reading); }
.post-text blockquote { border-left: 2px solid var(--accent); background: linear-gradient(var(--lm-tint), var(--lm-tint)); }
.post-text pre { border: 1px solid var(--lm-steel); border-radius: 2px; background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { ${HEAD} color: var(--accent); }
.roll-card { border-radius: 2px; border: 1px solid var(--lm-steel); border-left: 3px solid var(--lm-red); }
.roll-total { border-radius: 50%; border: 1px solid #5a1416; background: radial-gradient(circle at 35% 30%, #f07b6f, #c8423f 50%, #8d2622); color: #ffffff; font: 700 15px/26px var(--font-reading); }
.post-actions { border-top: 1px solid color-mix(in srgb, var(--lm-steel) 60%, transparent); }
.post-actions button { ${SMALL} font-size: 13px; }
.post-actions button:hover { color: var(--accent); }

/* Buttons and boxes to type in. */
.f-btn:not(.small) { font-size: 14px; }
.f-btn.ghost { ${STEEL_BTN} color: var(--ink) !important; }
.f-btn.ghost:hover:not(:disabled) { ${STEEL_ON} }
.f-btn:not(.ghost), .tools .tool-pop .f-btn:not(.ghost) { ${RED_BTN} color: #f5efe2 !important; }
.f-btn:not(.ghost):hover:not(:disabled) { ${RED_ON} }
input:not([type="checkbox"]), select, textarea { border-radius: 2px; background: var(--bg); caret-color: var(--accent); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }
.composer { border: 0; border-top: 1px solid var(--lm-steel); }
.composer-kind, .as-label { ${SMALL} color: var(--accent); }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { ${HEAD} font-size: 19px; color: var(--lm-heading); }
.foot-stats b { ${HEAD} font-size: 18px; color: var(--accent); }
.to-top { border-radius: 2px; color: var(--accent); }

@container page (max-width: 900px) {
  .board-head:not(.has-art) { ${SMALL_MOONS} }
  .board-head-text { padding-right: 220px; }
  .board-title { font-size: 48px; }
}
@container page (max-width: 640px) {
  .board-head { min-height: 260px; }
  .board-head-text { padding: 30px 22px 96px; }
  .board-head:not(.has-art) { ${PHONE_MOONS} }
  .board-head:not(.has-art) .board-title { padding-right: 120px; }
  .board-head.has-art .board-head-text { padding: 40px 22px; }
  .board-title { font-size: 34px; }
  .board-tagline { font-size: 17px; }
  .board-nav { padding: 0 8px; }
  .board-nav a { padding: 11px 9px; font-size: 14px; }
  .category-title { font-size: 20px; gap: 9px; }
  .forum-name { font-size: 20px; }
  .topic-name { font-size: 28px; }
  .location-name { font-size: 26px; }
  .post-name { font-size: 20px; }
  .portrait.big.portrait-empty span { font-size: 54px; }
  .forum-location > :nth-child(2) { padding-top: 14px; }
  .forum-location > :last-child { padding-bottom: 16px; }
  .location-art { border-right: 0; border-bottom: 1px solid var(--lm-steel); }
  .topic-row { padding: 16px 18px 14px 20px; }
  .mini-card { box-sizing: border-box; }
  .mini-name { font-size: 18px; }
  .post-text { font-size: 18px; }
  .mod-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .mod-tools .f-btn.small { justify-content: center; padding: 9px 8px; }
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
