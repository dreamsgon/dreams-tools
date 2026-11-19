/*
 * Two Banners: a fully custom skin, inspired by the look of World of Warcraft's interface. Gold-trimmed frames with
 * rivets in their corners, a quest log's parchment by day and dark stone by night, red buttons with gold lettering,
 * and titles in Metamorphous and text in Caudex (free faces close to the game's Morpheus and Friz Quadrata), with
 * Archivo Narrow for the small print, as the game uses Arial Narrow for chat. The banner is a stylised valley under
 * two moons, with two hanging banners, one blue and gold and one red and iron, and the links sit under an
 * experience bar. The character card is an item tooltip, a big portrait carries health and mana bars, and an unread
 * topic gets a quest giver's "!". No logos, crests or art from the game: the banners carry plain shapes. Nothing
 * glows and nothing moves. Like every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --tb-gold: #d4a826; --tb-gold-hi: #ffe38a; --tb-gold-lo: #7a5810; --tb-yellow: #ffd100;
  --tb-red: #8f1b14; --tb-blue: #1f4a9c; --tb-iron: #26262b;
  --tb-trim: linear-gradient(180deg, #f6dc7a, #a07a1c 45%, #e2bb4c 55%, #6e5214);
  --tb-stone: linear-gradient(180deg, #23263a, #121420);
  --tb-panel: radial-gradient(ellipse at 50% 35%, #fbf3dc 50%, #ecdcb0 100%);
  --tb-band: linear-gradient(180deg, #e6d29e, #d5bc80);
  --tb-heading: #6b1d0f; --tb-name: #6b1d0f; --tb-stud: #c9a13a; --tb-stud-edge: #5b420e;
  --tb-ghost: linear-gradient(180deg, #f1e3bd, #dcc690); --tb-ghost-ink: #3b2208; --tb-ghost-line: #8a6414;
  --tb-shadow: 0 0 0 1px rgba(43, 26, 8, .55), 0 6px 14px -8px rgba(43, 26, 8, .5);
  --tb-sky: linear-gradient(180deg, #4f9ae0 0%, #8cc4ef 42%, #d3eaf6 72%, #f7e7b5 100%);
  --tb-star: transparent; --tb-moon: rgba(255, 255, 255, .55); --tb-moon-2: rgba(200, 220, 255, .5); --tb-halo: transparent;
  --tb-cloud: rgba(255, 255, 255, .85);
  --tb-far: #8d93c8; --tb-cap: #f4f3fb; --tb-hill-2: #79a84b; --tb-hill-1: #4f8634; --tb-pine: #2f5e25; --tb-ground: #3f7029;
  --tb-title-edge: #2a1404;
  --card-bg: #070914; --card-ink: #ffffff; --card-head: #c27cff; --card-line: #8d929e;
}
:root[data-theme="dark"] {
  --tb-panel: linear-gradient(180deg, #171a26, #0d0f16);
  --tb-band: linear-gradient(180deg, #252a3d, #161927);
  --tb-heading: #ffd100; --tb-name: #ffd100; --tb-stud: #c9a13a; --tb-stud-edge: #3d2c08;
  --tb-ghost: linear-gradient(180deg, #2c2f3a, #181a21); --tb-ghost-ink: #ffd100; --tb-ghost-line: #000000;
  --tb-shadow: 0 0 0 1px #000, 0 8px 18px -8px rgba(0, 0, 0, .9);
  --tb-sky: linear-gradient(180deg, #050816 0%, #0c1536 38%, #1b2a5e 72%, #36467f 100%);
  --tb-star: rgba(235, 240, 255, .9); --tb-moon: #e9eef6; --tb-moon-2: #8fb8ff; --tb-halo: rgba(200, 215, 255, .16);
  --tb-cloud: transparent;
  --tb-far: #262c5c; --tb-cap: #4d568f; --tb-hill-2: #142a3a; --tb-hill-1: #0d1d2a; --tb-pine: #07121b; --tb-ground: #0a1620;
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
const deg = (w: number, h: number) => Math.atan(w / 2 / h) * 180 / Math.PI;

/* The valley, drawn from the bottom up and repeated along the banner. */
/** A row of peaks in a tile `tile` wide: one peak `w` wide and `h` tall whose left foot is at `x`, lifted `y`. */
const peaks = (c: string, tile: number, x: number, w: number, h: number, y: number) => {
  const a = deg(w, h);
  return `conic-gradient(from ${n(180 - a)}deg at ${n(x + w / 2)}px 0, ${c} 0 ${n(2 * a)}deg, transparent ${n(2 * a + .5)}deg) left 0 bottom ${y}px / ${tile}px ${h}px repeat-x`;
};
/** The snow on those peaks: the same peak's top fifth. */
const caps = (tile: number, x: number, w: number, h: number, y: number) => peaks("var(--tb-cap)", tile, x + w * .4, w * .2, h * .2, y + h * .8);
/** A row of rounded hills. */
const hills = (c: string, tile: number, cx: number, rx: number, ry: number, y: number) =>
  `radial-gradient(${rx}px ${ry}px at ${cx}px 100%, ${c} 98%, transparent 100%) left 0 bottom ${y}px / ${tile}px ${ry}px repeat-x`;
const VALLEY = [
  peaks("var(--tb-pine)", 150, 14, 16, 34, 26), peaks("var(--tb-pine)", 150, 34, 12, 26, 24), peaks("var(--tb-pine)", 230, 120, 18, 40, 22), peaks("var(--tb-pine)", 230, 142, 12, 28, 20),
  `linear-gradient(var(--tb-ground), var(--tb-ground)) left 0 bottom 0 / 100% 26px no-repeat`,
  hills("var(--tb-hill-1)", 520, 120, 260, 46, 14), hills("var(--tb-hill-1)", 380, 300, 200, 40, 10),
  hills("var(--tb-hill-2)", 610, 420, 300, 70, 18), hills("var(--tb-hill-2)", 450, 90, 220, 58, 22),
  caps(470, 60, 220, 130, 40), caps(330, 170, 150, 96, 40), caps(610, 300, 260, 150, 36),
  peaks("var(--tb-far)", 470, 60, 220, 130, 40), peaks("var(--tb-far)", 330, 170, 150, 96, 40), peaks("var(--tb-far)", 610, 300, 260, 150, 36),
];
/** Stars, which only the night shows. */
const STARS = [[6, 12, 1], [14, 30, 1.5], [22, 8, 1], [31, 22, 1], [43, 6, 1.5], [52, 26, 1], [61, 10, 1], [70, 32, 1.5], [79, 6, 1], [86, 20, 1], [94, 12, 1.5]]
  .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, var(--tb-star) 50%, transparent 100%)`).join(", ");
/**
 * Two moons, a big white one with a soft ring of light by night and a small blue one; by day they are faint, with
 * clouds. Where they sit is a variable (`--tb-moon-at`, `--tb-halo-at`, `--tb-moon-2-at`), so each banner can move them.
 */
const SKY = [
  "radial-gradient(circle closest-side, var(--tb-moon) 92%, transparent 100%) var(--tb-moon-at) / 46px 46px no-repeat",
  "radial-gradient(circle closest-side, var(--tb-halo), transparent) var(--tb-halo-at) / 100px 100px no-repeat",
  "radial-gradient(circle closest-side, var(--tb-moon-2) 92%, transparent 100%) var(--tb-moon-2-at) / 20px 20px no-repeat",
  "radial-gradient(60px 16px at 30% 22%, var(--tb-cloud) 60%, transparent 100%)", "radial-gradient(44px 12px at 34% 19%, var(--tb-cloud) 60%, transparent 100%)",
  "radial-gradient(70px 14px at 74% 40%, var(--tb-cloud) 60%, transparent 100%)", "radial-gradient(40px 11px at 70% 37%, var(--tb-cloud) 60%, transparent 100%)",
  STARS, "var(--tb-sky)",
];
/** Puts the moons with the big one's top right corner at (`right`, `top`). */
const moonsAt = (right: number, top: number) => `--tb-moon-at: right ${right}px top ${top}px; --tb-halo-at: right ${right - 27}px top ${top - 27}px; --tb-moon-2-at: right ${right + 58}px top ${top + 34}px;`;

/**
 * One hanging banner, as the background of a pseudo-element 130 wide and 240 tall: a gold pole with knobs, the cloth
 * with its trim and a band across the top, a ring, and a plain shape in the ring. The swallowtail is cut by clip-path.
 */
const FLAG_CLIP = "clip-path: polygon(0 0, 100% 0, 100% 13px, calc(100% - 10px) 13px, calc(100% - 10px) 100%, 50% 86%, 10px 100%, 10px 13px, 0 13px);";
const flag = (cloth: string, trim: string, mark: "diamond" | "chevron") => {
  const at = (x: number, y: number, w: number, h: number) => `left ${x}px top ${y}px / ${w}px ${h}px no-repeat`;
  const tri = (c: string, x: number, y: number, w: number, h: number, upward: boolean) => {
    const a = deg(w, h);
    return upward
      ? `conic-gradient(from ${n(180 - a)}deg at 50% 0, ${c} 0 ${n(2 * a)}deg, transparent ${n(2 * a + .5)}deg) ${at(x, y, w, h)}`
      : `conic-gradient(from ${n(-a)}deg at 50% 100%, ${c} 0 ${n(2 * a)}deg, transparent ${n(2 * a + .5)}deg) ${at(x, y, w, h)}`;
  };
  const shape = mark === "diamond"
    ? [tri("var(--tb-gold)", 52, 84, 26, 18, true), tri("var(--tb-gold)", 52, 102, 26, 18, false)]
    : [tri(cloth, 50, 92, 30, 14, false), tri("var(--tb-gold)", 48, 88, 34, 24, false)];
  return [
    `radial-gradient(circle closest-side, var(--tb-gold-hi) 0 50%, var(--tb-gold-lo) 80%, transparent 100%) ${at(0, 0, 14, 14)}`,
    `radial-gradient(circle closest-side, var(--tb-gold-hi) 0 50%, var(--tb-gold-lo) 80%, transparent 100%) left 116px top 0 / 14px 14px no-repeat`,
    `linear-gradient(180deg, var(--tb-gold-hi), var(--tb-gold) 50%, var(--tb-gold-lo)) ${at(4, 3, 122, 8)}`,
    ...shape,
    `radial-gradient(circle closest-side, transparent 70%, var(--tb-gold) 73% 88%, transparent 91%) ${at(35, 72, 60, 60)}`,
    `linear-gradient(${trim}, ${trim}) ${at(10, 34, 110, 5)}`,
    `linear-gradient(90deg, rgba(0, 0, 0, .3), transparent 26%, rgba(255, 255, 255, .08) 50%, transparent 74%, rgba(0, 0, 0, .3)) ${at(10, 11, 110, 229)}`,
    `linear-gradient(90deg, ${trim} 0 7px, ${cloth} 7px calc(100% - 7px), ${trim} calc(100% - 7px)) ${at(10, 11, 110, 229)}`,
  ];
};
const BLUE = inParts("tb-blue", flag("var(--tb-blue)", "var(--tb-gold)", "diamond"));
const RED = inParts("tb-red", flag("var(--tb-red)", "var(--tb-iron)", "chevron"));
const FLAG_BOX = `content: ""; position: absolute; z-index: 1; top: 0; width: 130px; height: 240px; pointer-events: none; ${FLAG_CLIP}`;

/** For a location with no picture: the valley at night or by day, with the moons. */
const MINI = [
  "radial-gradient(circle closest-side, var(--tb-moon) 92%, transparent 100%) right 22% top 14% / 26px 26px no-repeat",
  hills("var(--tb-hill-1)", 140, 40, 80, 24, 0), hills("var(--tb-hill-2)", 180, 120, 90, 36, 6),
  peaks("var(--tb-far)", 160, 30, 90, 56, 8), "var(--tb-sky)",
].join(", ");

/* Shared pieces of the look. */
/** The page behind everything: plain, with a little warmth at the top. */
const PAGE = "background: radial-gradient(ellipse 120% 600px at 50% 0, color-mix(in srgb, var(--tb-gold) 10%, transparent), transparent), var(--bg);";
/** Rivets in a frame's four corners. */
const STUD = "radial-gradient(circle closest-side, var(--tb-gold-hi) 0 35%, var(--tb-stud) 50% 70%, var(--tb-stud-edge) 80%, transparent 100%)";
const STUDS = ["left 3px top 3px", "right 3px top 3px", "left 3px bottom 3px", "right 3px bottom 3px"].map(p => `${STUD} ${p} / 9px 9px no-repeat`).join(", ");
/** A frame: gold trim with a dark edge outside it, rivets in the corners, parchment by day and stone by night. */
const FRAME = `border: 2px solid transparent; border-image: var(--tb-trim) 1; border-radius: 0; background: ${STUDS}, var(--tb-panel); box-shadow: var(--tb-shadow);`;
/** Under the pointer a frame warms a little. Nothing lifts and nothing glows. */
const FRAME_ON = `background: ${STUDS}, linear-gradient(color-mix(in srgb, var(--tb-gold) 7%, transparent), color-mix(in srgb, var(--tb-gold) 7%, transparent)), var(--tb-panel);`;
/** Text type. */
const TITLE_TYPE = "font-family: var(--font-display); font-weight: 400; letter-spacing: .01em;";
const SMALL = "font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .06em;";
/** The game's red buttons: deep red with a light top edge, a thin gold ring and gold lettering. */
const RED_BTN = "border: 1px solid #2a0805; border-radius: 4px; background: linear-gradient(180deg, #c42d22 0%, #8f1b14 52%, #6a110c 100%); color: #ffd100; box-shadow: inset 0 1px 0 rgba(255, 220, 150, .45), inset 0 -1px 0 rgba(0, 0, 0, .4), 0 0 0 1px rgba(212, 168, 38, .7); font-family: var(--font-reading); font-weight: 700; text-shadow: 0 1px 0 #000;";
const RED_ON = "background: linear-gradient(180deg, #d4392d 0%, #a0221a 52%, #771510 100%); color: #ffe066;";
/** Other buttons: stone by night, parchment by day. */
const GHOST_BTN = "border: 1px solid var(--tb-ghost-line); border-radius: 4px; background: var(--tb-ghost); color: var(--tb-ghost-ink); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12), 0 0 0 1px rgba(212, 168, 38, .35); font-family: var(--font-reading); font-weight: 700;";
/** The title: Metamorphous in gold metal, edged dark, the fill repeated once per line (with a fallback before it). */
const GOLD_FILL = "linear-gradient(180deg, #fff6c4 0%, #ffd94a 38%, #d79b12 54%, #ffe680 74%, #a8700a 100%)";
const GOLD = `background: ${GOLD_FILL}; background: ${GOLD_FILL} 0 0 / 100% 1lh repeat-y; -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(1px 0 0 var(--tb-title-edge)) drop-shadow(-1px 0 0 var(--tb-title-edge)) drop-shadow(0 1px 0 var(--tb-title-edge)) drop-shadow(0 -1px 0 var(--tb-title-edge)) drop-shadow(0 3px 0 rgba(26, 12, 2, .7));`;
const TITLE = `display: block; width: fit-content; max-width: 100%; overflow-wrap: break-word; ${TITLE_TYPE} ${GOLD}`;
/** The tagline or the line above a title: a strip of quest parchment. */
const SCROLL = "display: inline-block; padding: 5px 16px; border: 1px solid #8a6414; border-radius: 2px; background: linear-gradient(180deg, #f6e9c4, #e3cd96); color: #3b2208; box-shadow: 0 0 0 1px rgba(0, 0, 0, .6), 0 3px 0 rgba(0, 0, 0, .3); text-shadow: none;";
/** A heading between two gold rules that end in a knob, as over a zone's name. */
const ruled = (h: string) => `${h} { display: flex; align-items: center; gap: 14px; }
${h}::before, ${h}::after { content: ""; flex: 1; min-width: 24px; height: 9px; }
${h}::before { background: radial-gradient(circle closest-side, var(--tb-gold) 70%, transparent 100%) right center / 9px 9px no-repeat, linear-gradient(90deg, transparent, var(--tb-gold)) left center / calc(100% - 10px) 2px no-repeat; }
${h}::after { background: radial-gradient(circle closest-side, var(--tb-gold) 70%, transparent 100%) left center / 9px 9px no-repeat, linear-gradient(90deg, var(--tb-gold), transparent) right center / calc(100% - 10px) 2px no-repeat; }`;
/** A heading with one rule running out to its right. */
const ruledLeft = (h: string) => `${h} { display: flex; align-items: center; gap: 12px; }
${h}::after { content: ""; flex: 1; min-width: 24px; height: 9px; background: radial-gradient(circle closest-side, var(--tb-gold) 70%, transparent 100%) left center / 9px 9px no-repeat, linear-gradient(90deg, var(--tb-gold), transparent) right center / calc(100% - 10px) 2px no-repeat; }`;
/** The experience bar: purple segments filled most of the way, along the top of a dark band. */
const XP = "repeating-linear-gradient(90deg, transparent 0 calc(5% - 1px), rgba(0, 0, 0, .75) calc(5% - 1px) 5%) left top / 100% 9px no-repeat, linear-gradient(180deg, #b072ec, #7a34c4 55%, #5a2496) left top / 64% 9px no-repeat, linear-gradient(180deg, #1c1030, #120a1f) left top / 100% 9px no-repeat";

/**
 * The cover for the other parts: the valley under the moons behind the host's own content, with both banners
 * hanging at the right. `host` keeps its text clear of them with padding.
 */
function cover(host: string, name: string) {
  const back = inParts(name, [...VALLEY, ...SKY]);
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 2px solid transparent; border-image: var(--tb-trim) 1; border-radius: 0;
  ${back.declare} ${moonsAt(330, 118)}
  background: ${back.use};
  box-shadow: 0 0 0 1px #000;
}
${host} > * { position: relative; z-index: 2; }
${host}::before { ${FLAG_BOX} right: 170px; ${BLUE.declare} background: ${BLUE.use}; }
${host}::after { ${FLAG_BOX} right: 26px; ${RED.declare} background: ${RED.use}; }`;
}
const coverAt = (host: string, scale: number, gap: number) => `${host}::before, ${host}::after { scale: ${scale}; transform-origin: top right; }
  ${host}::before { right: ${gap}px; }`;

/* The Encyclopedia: stone and gold round the side, parchment pages by day, and the cover over the overview. */
const ENCYCLOPEDIA = `/* Two Banners for the Encyclopedia. The colours and fonts come from the theme; this adds the frames, the cover and the red buttons. */
${VARS}
body { ${PAGE} scrollbar-color: var(--tb-gold-lo) var(--panel); }
::selection { background: var(--tb-yellow); color: #2a1404; }

/* The side: stone by night, parchment by day, edged in gold. */
.sidebar { border-right: 2px solid transparent; border-image: var(--tb-trim) 1; background: var(--tb-panel); }
.csw-name b { ${TITLE_TYPE} font-size: 17px; color: var(--tb-heading); }
.campaign-link { border-radius: 2px; }
.campaign-link:hover { color: var(--tb-heading); }
.campaign-link.active { background: color-mix(in srgb, var(--tb-gold) 16%, transparent); color: var(--tb-heading); box-shadow: inset 3px 0 0 var(--tb-gold); }
.side-heading .section-toggle { ${SMALL} font-size: 11px; color: var(--muted); }
.shared-tag { border-radius: 2px; ${SMALL} font-size: 9.5px; }
.tree-row { border-radius: 2px; }
.tree-row:hover { background: color-mix(in srgb, var(--tb-gold) 9%, transparent); }
.tree-row:has(.active), .tree-item.active { background: color-mix(in srgb, var(--tb-gold) 16%, transparent); color: var(--tb-heading); box-shadow: inset 3px 0 0 var(--tb-gold); }

/* The bar along the top: stone, with gold under it. */
.topbar { border-bottom: 0; background: var(--tb-trim) left bottom / 100% 2px no-repeat, var(--tb-panel); }
.search-box { border-radius: 3px; border-color: var(--line); background: var(--bg); }
.search-box:focus-within { border-color: var(--tb-gold); }

/* Buttons and boxes to type in. */
.button { ${GHOST_BTN} font-size: 13px; }
.button:hover { border-color: var(--tb-gold); color: var(--tb-ghost-ink); }
.button.primary { ${RED_BTN} font-size: 13px; }
.button.primary:hover { ${RED_ON} }
.icon-button:hover { color: var(--tb-heading); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 3px; caret-color: var(--tb-gold); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--tb-gold); box-shadow: none; }

/* The campaign's overview: the cover. */
${cover(".dashboard-intro", "tb-enc")}
.dashboard-intro { min-height: 320px; align-items: flex-start; margin-bottom: 26px; padding: 40px 330px 130px 40px; }
.dashboard-intro .eyebrow { ${SCROLL} ${SMALL} font-size: 11px; }
.dashboard-intro h1 { margin: 16px 0 10px; font-size: 50px; line-height: 1.1; ${TITLE} }
.dashboard-intro .subtitle { display: inline-block; max-width: 40ch; padding: 6px 12px; background: rgba(8, 9, 16, .72); font: italic 400 17px/1.45 var(--font-reading); color: #f3e6c0; }
.dashboard-intro .icon-button { border: 1px solid #000; background: linear-gradient(180deg, #2c2f3a, #181a21); color: #ffd100; }
.overview-strip { border-color: var(--line); }
.overview-strip strong { font: 700 19px var(--font-reading); color: var(--tb-heading); }

/* Headings: a gold rule running out to the right. */
.section-heading h2 { flex: 1; ${TITLE_TYPE} font-size: 22px; color: var(--tb-heading); }
${ruledLeft(".section-heading h2")}
.eyebrow { ${SMALL} font-size: 10.5px; }

/* Cards: framed in gold with rivets, like entries in a quest log. */
.note-card { ${FRAME} padding: 18px 20px; transition: none; }
.note-card:hover { ${FRAME_ON} transform: none; }
.note-card h3 { ${TITLE_TYPE} font-size: 21px; color: var(--tb-heading); }
.note-card.add-card { border: 2px dashed var(--line); border-image: none; background: transparent; box-shadow: none; }

/* A page: Metamorphous over Caudex, a red label, gold rules. */
.kind-pill { border-radius: 2px; border: 1px solid #2a0805; background: linear-gradient(180deg, #a3221c, #6b1210); color: #ffd100; ${SMALL} font-size: 10px; }
.article-title h1 { ${TITLE_TYPE} color: var(--tb-heading); }
.article-tabs { border-bottom: 0; background: var(--tb-trim) left bottom / 100% 2px no-repeat; }
.article-tabs button { font: 700 14px var(--font-reading); }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--tb-heading); box-shadow: inset 0 -3px 0 var(--tb-gold); }
.picture-panel { border-radius: 0; border: 2px solid transparent; border-image: var(--tb-trim) 1; }
.prose { font-family: var(--font-reading); }
.prose h1, .prose h2, .prose h3 { ${TITLE_TYPE} color: var(--tb-heading); }
.prose h2 { padding-bottom: 6px; background: linear-gradient(90deg, var(--tb-gold), transparent) left bottom / 100% 2px no-repeat; }
.prose blockquote { border-left: 3px solid var(--tb-gold); background: color-mix(in srgb, var(--tb-gold) 8%, transparent); font-style: italic; }
.article-aside .eyebrow { color: var(--tb-heading); }

/* The Encyclopedia keeps its 270px side down to 720px, so its cover steps down sooner than the others. */
@media (max-width: 1380px) {
  ${coverAt(".dashboard-intro", .75, 128)}
  .dashboard-intro { padding-right: 250px; ${moonsAt(240, 112)} }
  .dashboard-intro h1 { font-size: 42px; }
}
@media (max-width: 640px) {
  .dashboard-intro { min-height: 0; padding: 24px 20px 120px; }
  .dashboard-intro > div:first-child { padding-right: 120px; }
  .dashboard-intro h1 { font-size: 30px; }
  .dashboard-intro .subtitle { font-size: 15px; }
  .dashboard-intro { ${moonsAt(24, 116)} }
  ${coverAt(".dashboard-intro", .42, 70)}
  .dashboard-intro::after { right: 12px; }
  .dashboard-intro > .icon-button { position: absolute; z-index: 3; left: 20px; bottom: 18px; }
}
`;

/* Maptable: stone and gold round the table, the tool rail as an action bar, and the cover over the Scene Picker. */
const MAPTABLE = `/* Two Banners for Maptable. The map itself keeps its own colours. */
${VARS}
body { ${PAGE} scrollbar-color: var(--tb-gold-lo) var(--panel); }
::selection { background: var(--tb-yellow); color: #2a1404; }

/* The bar along the top: stone, with gold under it. */
.app-header, .campaign-dashboard > header { border-bottom: 0; background: var(--tb-trim) left bottom / 100% 2px no-repeat, var(--tb-panel); }
.header-scene strong { ${TITLE_TYPE} color: var(--tb-heading); }
.csw-name b { ${TITLE_TYPE} font-size: 16px; color: var(--tb-heading); }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${RED_BTN} font-size: 13px; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { ${RED_ON} }
.icon-button:hover { color: var(--tb-heading); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 3px; caret-color: var(--tb-gold); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--tb-gold); box-shadow: none; }
input[type="range"] { accent-color: var(--tb-gold); }

/* The tool rail: square action buttons, gold-edged when on. */
.rail { border-right: 2px solid transparent; border-image: var(--tb-trim) 1; background: var(--tb-panel); }
.rail button { border-radius: 3px; }
.rail button:hover { color: var(--tb-heading); }
.rail button.active { background: linear-gradient(180deg, #2c2f3a, #181a21); color: #ffd100; box-shadow: inset 0 0 0 2px var(--tb-gold), 0 0 0 1px #000; }

/* The side panel. */
.side-panel { border-right: 2px solid transparent; border-image: var(--tb-trim) 1; background: var(--tb-panel); }
.panel-title { border-bottom: 0; background: var(--tb-trim) left bottom / 100% 2px no-repeat; }
.panel-title h2 { ${TITLE_TYPE} font-size: 19px; color: var(--tb-heading); }
.organizer-scene { border-radius: 2px; white-space: normal; }
.organizer-scene:hover { background: color-mix(in srgb, var(--tb-gold) 9%, transparent); }
.organizer-scene.active { background: color-mix(in srgb, var(--tb-gold) 16%, transparent); box-shadow: inset 3px 0 0 var(--tb-gold); }
.organizer-scene strong { font: 700 15px/1.25 var(--font-reading); }
.organizer-scene.active strong { color: var(--tb-heading); }
/* Under 1000px the rail becomes a bar along the bottom and the side panel a sheet: gold along their tops instead. */
@media (max-width: 1000px) {
  .rail { border-right: 0; border-top: 2px solid transparent; }
  .side-panel { border: 2px solid transparent; border-bottom: 0; border-radius: 0; }
}

/* Around the map: the toolbar as an action bar. */
.map-topbar { border-bottom: 2px solid transparent; border-image: var(--tb-trim) 1; background: var(--tb-panel); }
.map-title { ${SMALL} font-size: 11px; color: var(--muted); }
.board-info { ${SMALL} font-size: 11px; color: var(--muted); }
.toolbar { border-radius: 0; border: 2px solid transparent; border-image: var(--tb-trim) 1; background: linear-gradient(180deg, #23263a, #121420); color: #e9e3d0; box-shadow: 0 0 0 1px #000; }
.toolbar button { border-radius: 3px; border: 1px solid #000; background: linear-gradient(180deg, #2c2f3a, #181a21); color: #e9e3d0; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1); font: 700 12.5px var(--font-reading); }
.toolbar button:hover { color: #ffd100; }
.toolbar button.active { color: #ffd100; box-shadow: inset 0 0 0 2px var(--tb-gold); }

/* The Scene Picker: the cover. */
${cover(".campaign-scenes-head", "tb-map")}
.campaign-scenes-head { min-height: 300px; align-items: flex-start; padding: 34px 330px 130px 34px; }
.campaign-scenes-head > div { flex: 1; min-width: 0; }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head small { ${SCROLL} ${SMALL} font-size: 11px; }
.campaign-scenes-head h1 { margin-top: 14px; font-size: 48px; line-height: 1.1; ${TITLE} }
.dashboard-continue { ${FRAME} padding: 18px 24px; }
.dashboard-continue:hover { ${FRAME} ${FRAME_ON} padding: 18px 24px; }
.dashboard-continue small { ${SMALL} font-size: 11px; color: var(--tb-heading); }
.dashboard-continue strong { ${TITLE_TYPE} font-size: 24px; color: var(--tb-heading); }
.campaign-scenes-kinds button { border-radius: 3px; font: 700 13px var(--font-reading); }
.campaign-scenes-group h2 { ${TITLE_TYPE} font-size: 21px; color: var(--tb-heading); }
${ruledLeft(".campaign-scenes-group h2")}
.campaign-scenes-group h2 span { ${SMALL} font-size: 10.5px; }
.campaign-scene-card { ${FRAME} overflow: hidden; }
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { ${FRAME_ON} }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--tb-heading); }
.campaign-scene-card strong { font: 700 15.5px/1.25 var(--font-reading); }
.campaign-scene-card em { ${SMALL} font-style: normal; font-size: 10.5px; color: var(--tb-heading); }

@media (max-width: 1100px) {
  ${coverAt(".campaign-scenes-head", .75, 128)}
  .campaign-scenes-head { padding-right: 250px; ${moonsAt(240, 112)} }
  .campaign-scenes-head h1 { font-size: 40px; }
}
@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 0; flex-wrap: wrap; padding: 24px 20px 120px; }
  .campaign-scenes-head > div { flex: 1 1 100%; padding-right: 120px; }
  .campaign-scenes-head h1 { font-size: 30px; }
  .dashboard-continue strong { font-size: 20px; overflow-wrap: anywhere; }
  ${coverAt(".campaign-scenes-head", .42, 70)}
  .campaign-scenes-head::after { right: 12px; }
  .campaign-scenes-head { ${moonsAt(24, 116)} }
}
`;

/* The campaign's dashboard: the cover behind its name, and gold-framed cards. */
const DASHBOARD = `/* Two Banners for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--tb-yellow); color: #2a1404; }
.hub-crumbs { ${SMALL} font-size: 11.5px; }
.hub-crumbs a { color: var(--tb-heading); }

/* The top: the cover. */
${cover(".hub-head", "tb-hub")}
.hub-head { min-height: 320px; padding: 34px 330px 130px 34px; }
.hub-title p { ${SCROLL} ${SMALL} font-size: 11px; }
.hub-title h1 { margin-top: 14px; font-size: 52px; line-height: 1.1; ${TITLE} }
.hub-chip { border-radius: 2px; border: 1px solid #8a6414; background: linear-gradient(180deg, #f6e9c4, #e3cd96); color: #3b2208; ${SMALL} font-size: 10px; }
.hub-head .tag-add { border-radius: 2px; border-color: #8a6414; background: rgba(8, 9, 16, .55); color: #f3e6c0; }
.hub-head .hub-button:not(.hub-button-primary) { border: 1px solid #000; background: linear-gradient(180deg, #2c2f3a, #181a21); color: #ffd100; }

/* Buttons. */
.hub-button { ${GHOST_BTN} font-size: 13px; }
.hub-button-primary, a.hub-button-primary { ${RED_BTN} font-size: 13px; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { ${RED_ON} }
.hub-button:not(.hub-button-primary):hover, .hub-button:not(.hub-button-primary):hover:not(:disabled) { border-color: var(--tb-gold); background: var(--tb-ghost); color: var(--tb-ghost-ink); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 0; background: var(--tb-trim) left bottom / 100% 2px no-repeat; }
.hub-tabs button, .hub-tabs a { font: 700 14px var(--font-reading); }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--tb-heading); }

/* Cards: gold frames with rivets. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; ${TITLE_TYPE} font-size: 20px; color: var(--tb-heading); }
.hub-card-head a, .hub-card-head .hub-text-button { ${SMALL} font-size: 11px; }
.hub-scene-grid li { border-radius: 2px; }

@media (max-width: 1100px) {
  ${coverAt(".hub-head", .75, 128)}
  .hub-head { padding-right: 250px; ${moonsAt(240, 112)} }
  .hub-title h1 { font-size: 44px; }
}
@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 24px 20px 120px; }
  .hub-title { padding-right: 120px; }
  .hub-title h1 { font-size: 32px; }
  ${coverAt(".hub-head", .42, 70)}
  .hub-head::after { right: 12px; }
  .hub-head { ${moonsAt(24, 116)} }
}
`;

const BANNER_SKY = inParts("tb-sky", SKY);
const BANNER_VALLEY = inParts("tb-vale", VALLEY);

export const TWO_BANNERS: Theme = {
  id: "preset-two-banners", name: "Two Banners", mode: "both", radius: 3, banner: "picture", fonts: { display: "metamorphous", reading: "caudex", ui: "archivo" },
  colors: {
    light: { bg: "#e9dcb8", panel: "#f6ecd0", raised: "#efe1bb", line: "#b99b5f", ink: "#2b1a08", muted: "#5e4a2c", accent: "#8f1b14", accent2: "#1d4b94" },
    dark: { bg: "#08090d", panel: "#12141b", raised: "#1a1d26", line: "#3a3a3f", ink: "#ece4cf", muted: "#a8a08c", accent: "#ffd100", accent2: "#5aa9ff" },
  },
  css: `/* Two Banners: a fantasy game's interface. Gold-trimmed frames with rivets, a quest log's parchment by day and dark stone by night, red buttons with gold lettering,
   a valley under two moons with a blue banner and a red one, and an experience bar over the links. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--tb-gold-lo) var(--panel); }
::selection { background: var(--tb-yellow); color: #2a1404; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { ${FRAME} border-bottom: 0; }
.board-date { ${SMALL} font-size: 11.5px; }
.board-date b { color: var(--tb-heading); }
.circ { border-radius: 50%; border: 2px solid var(--tb-gold); background: linear-gradient(180deg, #2c2f3a, #181a21); color: #ffd100; font: 700 12px var(--font-reading); box-shadow: 0 0 0 1px #000; }
.you b { ${TITLE_TYPE} font-size: 18px; color: var(--tb-heading); }
.search-box { border-radius: 3px; border-color: var(--line); background: var(--bg); }
.search-box:focus-within { border-color: var(--tb-gold); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: a valley under two moons, a banner hanging at either side, the title in gold between them. */
.board-head { min-height: 360px; border: 2px solid transparent; border-image: var(--tb-trim) 1; text-align: center; box-shadow: 0 0 0 1px #000; }
.board-head:not(.has-art) {
  ${BANNER_SKY.declare} ${moonsAt(170, 12)}
  background: ${BANNER_SKY.use};
  --head-ink: #3b2208; --head-title: #ffd94a; --head-shadow: none; --head-nav: #121420; --head-line: transparent;
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; padding: 48px 180px 140px; overflow: hidden; }
.board-head:not(.has-art) .board-head-text { ${BANNER_VALLEY.declare} background: ${BANNER_VALLEY.use}; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-head:not(.has-art) .board-head-text::before { ${FLAG_BOX} left: 22px; ${BLUE.declare} background: ${BLUE.use}; }
.board-head:not(.has-art) .board-head-text::after { ${FLAG_BOX} right: 22px; ${RED.declare} background: ${RED.use}; }
.board-title { margin-top: 6px; font: 400 64px/1.1 var(--font-display); }
.board-title a { ${TITLE} display: inline-block; text-shadow: none; }
.board-tagline { margin-top: 18px; ${SCROLL} font: italic 400 17px/1.4 var(--font-reading); }
/* The links: on dark stone under the experience bar. */
.board-nav { justify-content: center; padding: 9px 24px 0; border-top: 0; background: ${XP}, linear-gradient(180deg, #23263a, #121420); }
.board-nav a { padding: 11px 16px; color: #ffd100; font: 700 15px var(--font-reading); text-shadow: 0 1px 0 #000; }
.board-nav a:hover { color: #ffffff; border-bottom-color: var(--tb-gold); }
.board-nav a:focus-visible { outline: 2px solid #ffd100; outline-offset: -4px; }
/* With a banner picture: the picture under a soft dark wash in the middle, the same gold title over it. */
.board-head.has-art {
  background: radial-gradient(ellipse 60% 70% at 50% 50%, rgba(8, 9, 16, .55), rgba(8, 9, 16, .15) 70%, transparent), var(--banner) center var(--banner-y, 50%) / cover no-repeat;
  --head-ink: #f3e6c0; --head-title: #ffd94a; --head-shadow: none; --head-nav: #121420; --head-line: transparent;
}
.board-head.has-art .board-head-text { justify-content: center; padding: 60px 40px; }

/* Headings: between two gold rules, as over a zone's name. */
.category-title { justify-content: center; ${TITLE_TYPE} font-size: 24px; color: var(--tb-heading); text-shadow: none; }
${ruled(".category-title")}
.tag { border-radius: 2px; ${SMALL} font-size: 10px; text-shadow: none; }
.tag:where(:not(.topic-tag)) { border-color: var(--line); color: var(--muted); }
.tag.new { border-color: #2a1404; background: #ffd100; color: #2a1404; font-weight: 700; }
.tag.new::before { content: "! "; font-family: var(--font-display); }

/* Boards and topics: gold frames with rivets. */
.category-forums, .topics { gap: 10px; }
.forum, .topic-row { ${FRAME} }
.forum:hover, .topic-row:hover { ${FRAME_ON} }
/* Pinned and picked topics, and a fresh post, keep a mark inside the gold. */
.topic-row.pinned { box-shadow: inset 4px 0 0 var(--tb-red), var(--tb-shadow); }
.topic-row.picked { background: ${STUDS}, linear-gradient(color-mix(in srgb, var(--accent-2) 14%, transparent), color-mix(in srgb, var(--accent-2) 14%, transparent)), var(--tb-panel); box-shadow: inset 4px 0 0 var(--accent-2), var(--tb-shadow); }
.forum-name { ${TITLE_TYPE} font-size: 23px; line-height: 1.15; }
.forum-name a, .topic-title a { color: var(--tb-name); }
.forum-name a:hover, .topic-title a:hover { color: var(--accent-2); }
.forum-desc { font: 400 16px/1.45 var(--font-reading); font-style: normal; }
.forum-place { ${SMALL} font-size: 10.5px; }
.forum-place a { color: var(--accent-2); }
.forum-counts b { font: 700 18px var(--font-reading); color: var(--ink); }
.last-label { ${SMALL} font-size: 10px; color: var(--tb-heading); }
.forum-last a, .foot-list a { color: var(--ink); font: 700 15px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent-2); }
.topic-title { font: 700 18px/1.25 var(--font-reading); letter-spacing: 0; text-transform: none; }
.topic-main small { font-style: normal; }
.topic-count b { font: 700 17px var(--font-reading); color: var(--ink); }
/* Unread: a quest giver's "!". */
.unread-dot { display: inline-grid; place-items: center; width: 14px; height: 22px; border-radius: 0; background: none; box-shadow: none; }
.unread-dot::before { content: "!"; font: 400 24px/1 var(--font-display); color: #ffd100; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 2px 0 #000; }
/* Small portraits: round, in a gold ring, as on a unit frame. */
.portrait.small, .portrait.tiny { border-radius: 50%; border: 2px solid var(--tb-gold); background: linear-gradient(180deg, #2c2f3a, #181a21); color: #ffd100; font-family: var(--font-reading); font-weight: 700; box-shadow: 0 0 0 1px #000; }
/* A location with no picture gets its own small valley under the moon. */
.forum-art { border-right: 2px solid transparent; border-image: var(--tb-trim) 1; border-radius: 0; }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} overflow: hidden; }
.location-art { border-right: 2px solid transparent; border-image: var(--tb-trim) 1; }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${SMALL} font-size: 11px; color: var(--tb-heading); }
.location-name { ${TITLE_TYPE} font-size: 38px; color: var(--tb-name); }
.location-summary { font: italic 400 17px/1.55 var(--font-reading); }

/* Topic pages. */
.crumbs { ${SMALL} font-size: 11.5px; }
.crumbs a { color: var(--accent-2); }
.topic-head { ${FRAME} }
.topic-name { ${TITLE_TYPE} font-size: 38px; line-height: 1.1; color: var(--tb-name); }
.cast-chip, .today-chip { border-radius: 2px; border-color: var(--line); }

/* Posts: gold frames with a name band like a unit frame's. */
.posts { gap: 22px; }
.post { ${FRAME} overflow: hidden; }
.post.fresh { box-shadow: inset 0 0 0 1px var(--tb-gold), var(--tb-shadow); }
.post-band, .post.flip .post-band { padding: 12px 22px 10px; border-bottom: 2px solid transparent; border-image: var(--tb-trim) 1; background: var(--tb-band); }
.post-name { ${TITLE_TYPE} font-size: 24px; line-height: 1.1; color: var(--tb-name); }
.post-meta { font: 500 13px var(--font-sans); }
.post-meta a { color: var(--muted); }
/* The GM's posts read like a quest giver's words: parchment by day and by night. */
.post.post-gm { background: ${STUDS}, radial-gradient(ellipse at 50% 35%, #fbf3dc 50%, #ecdcb0 100%); color: #2b1a08; }
.post.post-gm .gm-band { border-bottom: 2px solid transparent; border-image: var(--tb-trim) 1; background: linear-gradient(180deg, #e6d29e, #d5bc80); }
.post.post-gm .post-name { color: #6b1d0f; }
.post.post-gm .gm-band small, .post.post-gm .post-meta, .post.post-gm .post-meta a { color: #5e4a2c; }
.post.post-gm .post-text { color: #2b1a08; }
.post.post-gm .post-text a { color: #1d4b94; }
:root[data-theme="dark"] .post.post-gm { --ink: #2b1a08; --muted: #5e4a2c; --bg: #f1e6c4; --raised: #efe1bb; --panel: #fbf3dc; --line: #b99b5f; --accent: #8f1b14; --accent-2: #1d4b94; --accent2: #1d4b94; --tb-heading: #6b1d0f; --tb-ghost: linear-gradient(180deg, #f1e3bd, #dcc690); --tb-ghost-ink: #3b2208; --tb-ghost-line: #8a6414; }
.gm-seal { border-radius: 50%; border: 2px solid var(--tb-gold); background: linear-gradient(180deg, #c42d22, #6a110c); color: #ffd100; box-shadow: 0 0 0 1px #000; }
/* A big portrait: framed in gold, with health and mana bars along its foot. */
.portrait.big { border: 2px solid transparent; border-image: var(--tb-trim) 1; border-radius: 0; box-shadow: 0 0 0 1px #000; }
.portrait.big::after {
  content: ""; position: absolute; left: 8px; right: 8px; bottom: 8px; height: 22px; pointer-events: none; border: 1px solid #000; outline: 1px solid rgba(212, 168, 38, .8);
  background: linear-gradient(180deg, #4fd34f, #1e9a1e 55%, #157515) left top / 100% 10px no-repeat, linear-gradient(180deg, #4f86f0, #2453c4 55%, #1a3d96) left bottom / 76% 10px no-repeat, linear-gradient(#000, #000) left center / 100% 2px no-repeat, rgba(0, 0, 0, .75);
}
.portrait.big.portrait-empty { background: radial-gradient(ellipse at 50% 30%, #2b3058, #0c0e1c 75%); }
.portrait.big.portrait-empty span { font: 400 110px var(--font-display); color: rgba(255, 209, 0, .7); }
/* The character card that opens over a portrait: an item's tooltip. Dark in both versions, the name in epic purple,
   what they say in gold between quotation marks, as flavour text. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 14px 16px; border: 2px solid #8d929e; border-radius: 6px;
  background: #070914; color: #ffffff; box-shadow: inset 0 0 0 1px #000, 0 0 0 1px #000, 0 12px 26px -8px rgba(0, 0, 0, .7);
}
.mini-card > *, .mini-card dd { color: #ffffff; }
.mini-card :focus-visible { outline: 2px solid #ffd100; outline-offset: 2px; }
.mini-name { font: 700 21px/1.15 var(--font-reading); color: #c27cff; }
.mini-role { margin: 2px 0 8px; padding: 0; border: 0; font: 400 14px/1.4 var(--font-reading); font-style: normal; color: #ffffff; }
.mini-quote { font: italic 400 15px/1.45 var(--font-reading); color: #ffd100; opacity: 1; }
.mini-quote::before { content: "“"; }
.mini-quote::after { content: "”"; }
.mini-traits .chip { border: 0; border-radius: 0; padding: 0; background: none; color: #1eff00 !important; font: 400 14px var(--font-reading); }
.mini-fields dt { ${SMALL} font-size: 10px; color: #9d9d9d; }
.mini-fields dd { font: 400 15px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 6px 14px; ${RED_BTN} color: #ffd100 !important; font-size: 13px; text-decoration: none; }
.mini-link:hover { ${RED_ON} }
.mini-card > :nth-last-child(2) { margin-bottom: 12px; }
.mini-player { font: 500 12.5px/1.6 var(--font-sans); }
.mini-player b { color: var(--tb-heading); }
.post-text { font: 400 17.5px/1.65 var(--font-reading); }
.post-text blockquote { border-left: 3px solid var(--tb-gold); background: color-mix(in srgb, var(--tb-gold) 8%, transparent); }
.post-text pre { border: 1px solid var(--line); border-radius: 2px; background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { ${TITLE_TYPE} color: var(--tb-heading); }
.roll-card { border-radius: 2px; border: 1px solid var(--line); border-left: 3px solid var(--tb-gold); }
.roll-total { border-radius: 3px; border: 1px solid #000; background: linear-gradient(180deg, #2c2f3a, #181a21); color: #ffd100; font: 700 16px/26px var(--font-reading); box-shadow: inset 0 0 0 1px var(--tb-gold); }
.post-actions { border-top: 1px solid var(--line); }
.post-actions button { font: 600 13px var(--font-sans); }
.post-actions button:hover { color: var(--tb-heading); }

/* Buttons and boxes to type in. */
.f-btn:not(.small) { font-size: 14px; }
.f-btn.ghost { ${GHOST_BTN} color: var(--tb-ghost-ink) !important; }
.f-btn:not(.ghost), .tools .tool-pop .f-btn:not(.ghost) { ${RED_BTN} color: #ffd100 !important; }
.f-btn:not(.ghost):hover:not(:disabled) { ${RED_ON} }
.f-btn.ghost:hover:not(:disabled) { border-color: var(--tb-gold); background: var(--tb-ghost); }
input:not([type="checkbox"]), select, textarea { border-radius: 3px; background: var(--bg); caret-color: var(--tb-gold); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--tb-gold); box-shadow: none; }
.composer { border: 0; background: var(--tb-trim) left top / 100% 2px no-repeat; }
.composer-kind, .as-label { ${SMALL} color: var(--tb-heading); }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { ${TITLE_TYPE} font-size: 18px; color: var(--tb-heading); }
.foot-stats b { font: 700 17px var(--font-reading); color: var(--tb-heading); }
.to-top { border-radius: 3px; color: var(--tb-heading); }

@container page (max-width: 900px) {
  .board-head-text { padding: 40px 130px 130px; }
  .board-title { font-size: 48px; }
  .board-head:not(.has-art) .board-head-text::before, .board-head:not(.has-art) .board-head-text::after { scale: .72; }
  .board-head:not(.has-art) .board-head-text::before { transform-origin: top left; }
  .board-head:not(.has-art) { ${moonsAt(122, 8)} }
  .board-head:not(.has-art) .board-head-text::after { transform-origin: top right; }
}
@container page (max-width: 640px) {
  .board-head { min-height: 300px; }
  .board-head-text { padding: 24px 62px 110px; }
  .board-head.has-art .board-head-text { padding: 36px 20px 40px; }
  .board-title { font-size: 32px; }
  .board-tagline { font-size: 14px; padding: 4px 10px; }
  .board-head:not(.has-art) .board-head-text::before, .board-head:not(.has-art) .board-head-text::after { scale: .42; }
  .board-head:not(.has-art) .board-head-text::before { left: 8px; }
  .board-head:not(.has-art) { --tb-moon-at: right 70px top 112px; --tb-halo-at: right 43px top 85px; --tb-moon-2-at: right 30px top 128px; }
  .board-head:not(.has-art) .board-head-text::after { right: 8px; }
  .board-nav { padding: 9px 6px 0; }
  .board-nav a { padding: 10px 9px; font-size: 13.5px; }
  .category-title { font-size: 19px; gap: 8px; }
  .forum-name { font-size: 20px; }
  .topic-name { font-size: 27px; }
  .location-name { font-size: 26px; }
  .post-name { font-size: 20px; }
  .portrait.big.portrait-empty span { font-size: 56px; }
  .portrait.big::after { left: 4px; right: 4px; bottom: 4px; height: 12px; background-size: 100% 5px, 76% 5px, 100% 2px, auto; }
  .mini-card { box-sizing: border-box; }
  .location-art { border-right: 0; border-bottom: 2px solid transparent; }
  /* A place's row stacks beside its picture on phones: room above the name and below the latest post, clear of the rivets. */
  .forum-location > :nth-child(2) { padding-top: 14px; }
  .forum-location > :last-child { padding-bottom: 16px; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
