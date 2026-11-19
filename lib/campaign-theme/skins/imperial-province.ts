/*
 * Imperial Province: a fully custom skin, inspired by The Elder Scrolls IV: Oblivion and its menus, which are all
 * one worn parchment journal. Every panel is parchment with a brown ink frame and a small curl in each corner, the
 * lettering is the game's soft calligraphic hand (Fondamento) over an old book face (IM Fell English), and headings
 * are the journal's red-brown. The banner is the province's map, drawn in ink and wash: a lake with a walled city
 * on its island and a tall white tower at its heart, mountains to the north, a road, a compass rose, and a red
 * marker over the city like the one that leads you to a quest. The links sit on the compass strip from the bottom
 * of the screen, and a red marker drops over the one under the pointer. Unread topics carry the same red marker,
 * the character card is the journal's own page with the three bars of health, magicka and fatigue, and the GM's
 * posts are scrolls. By night the journal is dark leather with gold ink. Nothing glows and nothing moves.
 * Like every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  /* The page behind the journal is the province's grey-green stone, so the parchment stands apart from it. */
  --ip-page: #c2c7b3;
  --ip-frame: #6b4a22; --ip-red: #7a2e12; --ip-marker: #a3231a; --ip-heading: #6a240c;
  --ip-paper: radial-gradient(ellipse 60% 80% at 12% 0, rgba(255, 247, 220, .55), transparent 70%), radial-gradient(ellipse 50% 70% at 100% 100%, rgba(140, 100, 40, .14), transparent 70%), linear-gradient(180deg, #efe1bc, #e4d2a6);
  --ip-burn: inset 0 0 26px rgba(120, 82, 30, .2);
  --ip-band: linear-gradient(90deg, transparent, rgba(110, 70, 20, .13) 10% 90%, transparent);
  --ip-rule: linear-gradient(90deg, #6b4a22, rgba(107, 74, 34, .12));
  --ip-strip: linear-gradient(180deg, #dccb9c, #c9b47f); --ip-strip-ink: #33240f; --ip-tick: rgba(60, 40, 15, .5);
  --ip-map: radial-gradient(ellipse 40% 60% at 24% 30%, rgba(255, 246, 215, .5), transparent 70%), radial-gradient(ellipse 30% 50% at 60% 80%, rgba(150, 110, 50, .12), transparent 70%), linear-gradient(180deg, #ead9ae, #dcc892);
  --ip-map-ink: #5c4220; --ip-map-shade: #a88b58; --ip-map-wash: #f1e4bf; --ip-map-lake: #a9bcb6; --ip-map-shore: #7f968f;
  --ip-map-land: #e2d1a1; --ip-map-tree: #7f8a55; --ip-map-edge: rgba(110, 70, 25, .3); --ip-map-title: #5a1c0a; --ip-map-text: #3d2a12; --ip-map-lift: rgba(255, 245, 215, .5);
  --ip-s: 1; --ip-lift: 58px;
  --card-bg: #f1e3be; --card-ink: #33240f; --card-head: #6a240c; --card-line: #b39a68;
}
:root[data-theme="dark"] {
  --ip-page: #0f1612;
  --ip-frame: #8a6a36; --ip-red: #d9a24a; --ip-marker: #c8362a; --ip-heading: #e2b866;
  --ip-paper: radial-gradient(ellipse 60% 80% at 12% 0, rgba(120, 90, 45, .2), transparent 70%), radial-gradient(ellipse 50% 70% at 100% 100%, rgba(0, 0, 0, .28), transparent 70%), linear-gradient(180deg, #2a2013, #221a0f);
  --ip-burn: inset 0 0 26px rgba(0, 0, 0, .4);
  --ip-band: linear-gradient(90deg, transparent, rgba(217, 162, 74, .1) 10% 90%, transparent);
  --ip-rule: linear-gradient(90deg, #8a6a36, rgba(138, 106, 54, .1));
  --ip-strip: linear-gradient(180deg, #32261a, #251c11); --ip-strip-ink: #e8d9b5; --ip-tick: rgba(217, 190, 130, .4);
  --ip-map: radial-gradient(ellipse 40% 60% at 24% 30%, rgba(120, 90, 45, .22), transparent 70%), radial-gradient(ellipse 30% 50% at 60% 80%, rgba(0, 0, 0, .2), transparent 70%), linear-gradient(180deg, #2d2315, #20180e);
  --ip-map-ink: #b89a62; --ip-map-shade: #15100a; --ip-map-wash: #54432a; --ip-map-lake: #2b3d3e; --ip-map-shore: #49615f;
  --ip-map-land: #382c1c; --ip-map-tree: #66733f; --ip-map-edge: rgba(0, 0, 0, .5); --ip-map-title: #e8c477; --ip-map-text: #e8d9b5; --ip-map-lift: rgba(0, 0, 0, .6);
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

/*
 * The map. Everything is placed in pixels from the banner's right and bottom edges and multiplied by `--ip-s`, so a
 * narrow banner draws the same map smaller; `--ip-lift` raises it clear of the links along the banner's foot.
 */
const u = (v: number) => `calc(${n(v)}px * var(--ip-s))`;
const put = (image: string, right: number, bottom: number, w: number, h: number) =>
  `${image} right ${u(right)} bottom calc(${n(bottom)}px * var(--ip-s) + var(--ip-lift)) / ${u(w)} ${u(h)} no-repeat`;
const fill = (c: string) => `linear-gradient(${c}, ${c})`;
/** A mountain, lit from the left: one triangle, its right half in shade. */
const mount = (right: number, bottom: number, w: number, h: number) => {
  const a = n(Math.atan(w / 2 / h) * 180 / Math.PI);
  return put(`conic-gradient(from ${n(180 - a)}deg at 50% 0, var(--ip-map-shade) 0 ${a}deg, var(--ip-map-wash) ${a}deg ${n(2 * a)}deg, transparent ${n(2 * a + .5)}deg)`, right, bottom, w, h);
};
/** A pointed shape with its tip up, in one colour: the tower, and roofs. */
const spire = (c: string, right: number, bottom: number, w: number, h: number) => {
  const a = n(Math.atan(w / 2 / h) * 180 / Math.PI);
  return put(`conic-gradient(from ${n(180 - a)}deg at 50% 0, ${c} 0 ${n(2 * a)}deg, transparent ${n(2 * a + .5)}deg)`, right, bottom, w, h);
};
const hill = (right: number, bottom: number, w: number, h: number) =>
  put("radial-gradient(ellipse 50% 100% at 50% 100%, var(--ip-map-land) 0 88%, var(--ip-map-ink) 94% 98%, transparent 100%)", right, bottom, w, h);
const tree = (right: number, bottom: number) => put("radial-gradient(circle closest-side, var(--ip-map-tree) 0 80%, transparent 100%)", right, bottom, 9, 9);
/** The compass rose: four two-tone points, a ring and a boss. Its centre is `cx` from the right and `cy` from the bottom. */
const rose = (cx: number, cy: number) => {
  const len = 44, wid = 16, a = n(Math.atan(wid / 2 / len) * 180 / Math.PI);
  const point = (from: number, at: string) => `conic-gradient(from ${n(from)}deg at ${at}, var(--ip-map-ink) 0 ${a}deg, var(--ip-map-shade) ${a}deg ${n(2 * a)}deg, transparent ${n(2 * a + .5)}deg)`;
  return [
    put("radial-gradient(circle closest-side, var(--ip-map-ink) 0 80%, transparent 100%)", cx - 5, cy - 5, 10, 10),
    put(point(180 - a, "50% 0"), cx - wid / 2, cy, wid, len),
    put(point(-a, "50% 100%"), cx - wid / 2, cy - len, wid, len),
    put(point(270 - a, "100% 50%"), cx - len, cy - wid / 2, len, wid),
    put(point(90 - a, "0 50%"), cx, cy - wid / 2, len, wid),
    put("radial-gradient(circle closest-side, transparent 0 82%, var(--ip-map-ink) 86% 93%, transparent 100%)", cx - 30, cy - 30, 60, 60),
    put("radial-gradient(circle closest-side, transparent 0 90%, var(--ip-map-ink) 93% 97%, transparent 100%)", cx - 22, cy - 22, 44, 44),
  ];
};
/** The province: the lake, its island, the walled city and the tower, with the red marker over it. */
const CITY = [
  put("conic-gradient(from -30deg at 50% 100%, var(--ip-marker) 0 60deg, transparent 60.5deg)", 233, 196, 14, 12),
  mount(233, 62, 14, 124),
  spire("var(--ip-map-ink)", 231, 60, 18, 128),
  spire("var(--ip-map-ink)", 220, 58, 40, 30),
  put(fill("var(--ip-map-ink)"), 262, 58, 9, 11), spire("var(--ip-map-ink)", 260, 69, 13, 8),
  put(fill("var(--ip-map-ink)"), 205, 58, 10, 14), spire("var(--ip-map-ink)", 203, 72, 14, 9),
  put(fill("var(--ip-map-ink)"), 278, 56, 7, 8), put(fill("var(--ip-map-ink)"), 194, 56, 7, 9),
  put("radial-gradient(ellipse closest-side, transparent 0 80%, var(--ip-map-ink) 85% 95%, transparent 100%)", 190, 46, 100, 26),
  put("radial-gradient(ellipse closest-side, var(--ip-map-land) 0 88%, var(--ip-map-ink) 95% 98%, transparent 100%)", 162, 38, 156, 42),
];
const ROAD = [
  put("repeating-linear-gradient(90deg, var(--ip-map-ink) 0 6px, transparent 6px 11px)", 392, 58, 96, 1.5),
  put(fill("var(--ip-map-ink)"), 318, 57, 74, 3),
];
const LAND = [
  ...[[352, 82], [364, 74], [377, 84], [390, 76], [403, 86], [416, 78], [344, 70], [56, 70], [68, 62], [44, 60], [80, 72]].map(([r, b]) => tree(r, b)),
  put("radial-gradient(ellipse closest-side, var(--ip-map-lake) 0 90%, var(--ip-map-shore) 96%, transparent 100%)", 84, 18, 312, 88),
  hill(404, 22, 120, 26), hill(22, 28, 78, 18),
  /* Two ranges north of the lake, the nearer peaks first. */
  mount(22, 96, 44, 34), mount(186, 102, 50, 38), mount(70, 98, 64, 52), mount(146, 100, 68, 56), mount(34, 96, 74, 64), mount(100, 98, 84, 80),
  mount(296, 102, 48, 34), mount(408, 96, 52, 36), mount(368, 98, 60, 46), mount(322, 100, 72, 60),
];
const PARCHMENT = [
  "linear-gradient(90deg, var(--ip-map-edge), transparent 9%)", "linear-gradient(270deg, var(--ip-map-edge), transparent 9%)",
  "linear-gradient(180deg, var(--ip-map-edge), transparent 22%)", "linear-gradient(0deg, var(--ip-map-edge), transparent 26%)",
  "var(--ip-map)",
];
const MAP = (name: string) => inParts(name, [...CITY, ...ROAD, ...rose(70, 214), ...LAND, ...PARCHMENT]);

/** For a location with no picture: the tower on its island, in small, always at the middle of the box. */
const MINI = [
  "conic-gradient(from 176deg at 50% 0, var(--ip-map-ink) 0 8deg, transparent 8.5deg) center calc(50% - 13px) / 12px 46px no-repeat",
  "radial-gradient(ellipse closest-side, var(--ip-map-land) 0 88%, var(--ip-map-ink) 95% 98%, transparent 100%) center calc(50% + 10px) / 58px 16px no-repeat",
  "radial-gradient(ellipse closest-side, var(--ip-map-lake) 0 90%, var(--ip-map-shore) 96%, transparent 100%) center calc(50% + 12px) / 110px 34px no-repeat",
  "var(--ip-map)",
].join(", ");

/* Shared pieces of the look. */
/** The four corner curls of a frame: a quarter ring in each corner, joining the two sides. */
const CURLS = ["0 0", "100% 0", "0 100%", "100% 100%"].map(at => `radial-gradient(circle at ${at}, transparent 9px, var(--ip-frame) 9.5px 10.5px, transparent 11px) ${at} / 12px 12px no-repeat`).join(", ");
/** A panel: parchment, a brown ink frame with a curl in each corner, and edges a little darker, as if handled for years. */
const FRAME = `border: 1.5px solid var(--ip-frame); border-radius: 0; background: ${CURLS}, var(--ip-paper); box-shadow: var(--ip-burn);`;
/** Under the pointer or chosen: the journal's highlight, a soft band that fades out at both ends. */
const FRAME_ON = `background: ${CURLS}, var(--ip-band), var(--ip-paper);`;
/** Headings and names: the game's hand. Small labels are the same hand, small, never capitals. */
const HEAD = "font-family: var(--font-display); font-weight: 400; letter-spacing: .01em; text-transform: none;";
const SMALL = "font-family: var(--font-sans); font-weight: 400; letter-spacing: .02em; text-transform: none;";
/** Buttons: the main ones are worn brown leather with parchment lettering, the others an ink line on the page. */
const LEATHER = "border: 1px solid #24150a; border-radius: 3px; background: linear-gradient(180deg, #74502a, #50331a 55%, #3a230f); color: #f3e3b8; box-shadow: inset 0 1px 0 rgba(255, 225, 170, .3); font-family: var(--font-sans); font-weight: 400; letter-spacing: .02em; text-transform: none;";
const LEATHER_ON = "background: linear-gradient(180deg, #84602f, #5c3c1f 55%, #452a12); color: #fff3d0;";
const INK_BTN = "border: 1px solid var(--ip-frame); border-radius: 3px; background: transparent; color: var(--ink); box-shadow: none; font-family: var(--font-sans); font-weight: 400; letter-spacing: .02em; text-transform: none;";
const INK_ON = "border-color: var(--accent); background: var(--ip-band); color: var(--ink);";
/** The red marker that leads to a quest: a small triangle, point down. */
const MARKER = "conic-gradient(from -30deg at 50% 100%, var(--ip-marker) 0 60deg, transparent 60.5deg)";
/** A heading: a small ink diamond, the words, and a rule fading out to the right. */
const ruled = (h: string) => `${h} { display: flex; align-items: center; gap: 12px; }
${h}::before { content: ""; flex: none; width: 8px; height: 8px; rotate: 45deg; background: var(--ip-frame); }
${h}::after { content: ""; flex: 1; min-width: 24px; height: 1px; background: var(--ip-rule); }`;
/** The title on the map: the journal's red-brown ink. */
const TITLE = `display: block; width: fit-content; max-width: 100%; overflow-wrap: break-word; ${HEAD} color: var(--ip-map-title); text-shadow: 0 1px 0 var(--ip-map-lift);`;
/** Small round portraits: bronze medallions. */
const MEDAL = "border-radius: 50%; border: 2px solid var(--ip-frame); background: radial-gradient(circle at 35% 30%, #f3e6c2, #d9c592 60%, #b89e62); color: #33240f; font-family: var(--font-sans); font-weight: 400; box-shadow: none;";

/** The cover for the other parts: the map behind the host's own content. */
function cover(host: string, name: string) {
  const back = MAP(name);
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 1.5px solid var(--ip-frame); border-radius: 0;
  outline: 1px solid var(--ip-map-ink); outline-offset: -7px;
  --ip-s: .7; --ip-lift: 14px;
  ${back.declare}
  background: ${back.use};
  box-shadow: none;
}
${host} > * { position: relative; z-index: 2; }`;
}
/** How much room the map needs at the right of a title, at the current scale. */
const MAP_ROOM = "calc(500px * var(--ip-s))";

/* The Encyclopedia: the journal's pages, with the map over the overview. */
const ENCYCLOPEDIA = `/* Imperial Province for the Encyclopedia. The colours and fonts come from the theme. */
${VARS}
body { background: var(--ip-page); scrollbar-color: var(--ip-frame) var(--panel); }
::selection { background: var(--ip-marker); color: #ffffff; }

/* The side. */
.sidebar { border-right: 1.5px solid var(--ip-frame); background: var(--ip-paper); }
.csw-name b { ${HEAD} font-size: 18px; }
.tree-row { border-radius: 0; }
.tree-row:hover { background: var(--ip-band); }
.tree-row:has(.active), .tree-item.active { background: var(--ip-band); color: var(--accent); }
.side-heading .section-toggle { ${SMALL} font-size: 14px; color: var(--muted); }
.shared-tag { border-radius: 3px; ${SMALL} font-size: 11.5px; }

/* The bar along the top. */
.topbar { border-bottom: 1.5px solid var(--ip-frame); background: var(--ip-paper); }
.search-box { border-radius: 3px; border-color: var(--ip-frame); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); }

/* Buttons and boxes to type in. */
.button { ${INK_BTN} font-size: 14.5px; }
.button:hover { ${INK_ON} }
.button.primary { ${LEATHER} font-size: 14.5px; }
.button.primary:hover { ${LEATHER_ON} }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 3px; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }

/* The campaign's overview: the map. */
${cover(".dashboard-intro", "ip-enc")}
.dashboard-intro { min-height: 230px; align-items: flex-start; margin-bottom: 26px; padding: 34px ${MAP_ROOM} 40px 36px; }
.dashboard-intro .eyebrow { ${SMALL} font-size: 15px; color: var(--ip-map-text); }
.dashboard-intro h1 { margin: 8px 0 10px; font-size: 50px; line-height: 1.1; ${TITLE} }
.dashboard-intro .subtitle { max-width: 36ch; font: italic 400 19px/1.45 var(--font-reading); color: var(--ip-map-text); }
/* The settings button sits low at the left, clear of the map. */
.dashboard-intro .icon-button { position: absolute; left: 16px; bottom: 16px; border: 1px solid var(--ip-map-ink); border-radius: 3px; background: transparent; color: var(--ip-map-text); }
.dashboard-intro .icon-button:hover { background: var(--ip-band); color: var(--ip-map-title); }
.dashboard-intro > div:first-child { padding-bottom: 30px; }
.overview-strip { border-color: var(--ip-frame); }
.overview-strip strong { ${HEAD} font-size: 21px; color: var(--accent); }

/* Headings: an ink diamond, then a rule running out to the right. */
.section-heading h2 { flex: 1; ${HEAD} font-size: 26px; color: var(--ip-heading); }
${ruled(".section-heading h2")}
.eyebrow { ${SMALL} font-size: 13.5px; }

/* Cards: parchment in an ink frame. */
.note-card { ${FRAME} padding: 20px 20px 18px; transition: none; }
.note-card:hover { ${FRAME_ON} transform: none; box-shadow: var(--ip-burn); }
.note-card h3 { ${HEAD} font-size: 23px; }
.note-card:hover h3 { color: var(--accent); }
.note-card.add-card { border: 1.5px dashed var(--ip-frame); background: transparent; box-shadow: none; }

/* A page of the journal. */
.kind-pill { padding: 2px 9px; border-radius: 3px; border: 1px solid var(--accent); background: transparent; color: var(--accent); ${SMALL} font-size: 13px; }
.article-title h1 { ${HEAD} color: var(--ip-heading); }
.article-tabs { border-bottom: 1.5px solid var(--ip-frame); }
.article-tabs button { ${SMALL} font-size: 15px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent); }
.picture-panel { border-radius: 0; border-color: var(--ip-frame); }
.prose { font-family: var(--font-reading); font-size: 19px; }
.prose h1, .prose h2, .prose h3 { ${HEAD} color: var(--ip-heading); }
.prose h2 { padding-bottom: 6px; background: var(--ip-rule) left bottom / 100% 1px no-repeat; }
.prose blockquote { border-left: 2px solid var(--accent); background: var(--ip-band); font-style: italic; }
.article-aside .eyebrow { color: var(--accent); }

@media (max-width: 1100px) {
  .dashboard-intro { --ip-s: .55; }
  .dashboard-intro h1 { font-size: 40px; }
}
@media (max-width: 640px) {
  .dashboard-intro { min-height: 0; padding: 24px 20px calc(260px * var(--ip-s) + 30px); --ip-s: .5; }
  .dashboard-intro > div:first-child { padding: 0 44px 0 0; }
  .dashboard-intro .icon-button { left: auto; bottom: auto; right: 14px; top: 14px; }
  .dashboard-intro h1 { font-size: 32px; }
  .dashboard-intro .subtitle { font-size: 17px; }
  .section-heading h2 { font-size: 22px; }
  .section-heading h2::after { display: none; }
}
`;

/* Maptable: parchment round the table, and the map over the Scene Picker. */
const MAPTABLE = `/* Imperial Province for Maptable. The map you play on keeps its own colours. */
${VARS}
body { background: var(--ip-page); scrollbar-color: var(--ip-frame) var(--panel); }
::selection { background: var(--ip-marker); color: #ffffff; }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 1.5px solid var(--ip-frame); background: var(--ip-paper); }
.header-scene strong { ${HEAD} color: var(--accent); }
.csw-name b { ${HEAD} font-size: 17px; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${LEATHER} font-size: 14.5px; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { ${LEATHER_ON} }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 3px; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }
input[type="range"] { accent-color: var(--ip-marker); }

/* The tool rail and the side panel. */
.rail { border-right: 1.5px solid var(--ip-frame); background: var(--ip-paper); }
.rail button { border-radius: 3px; }
.rail button:hover { color: var(--accent); }
.rail button.active { background: var(--ip-band); color: var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
.side-panel { border-right: 1.5px solid var(--ip-frame); background: var(--ip-paper); }
.panel-title { border-bottom: 1px solid var(--ip-frame); }
.panel-title h2 { ${HEAD} font-size: 21px; color: var(--ip-heading); }
.organizer-scene { border-radius: 0; white-space: normal; }
.organizer-scene:hover { background: var(--ip-band); }
.organizer-scene.active { background: var(--ip-band); }
.organizer-scene strong { font: 400 16.5px/1.25 var(--font-sans); }
.organizer-scene.active strong { color: var(--accent); }
@media (max-width: 1000px) {
  .rail { border-right: 0; border-top: 1.5px solid var(--ip-frame); }
  .side-panel { border: 1.5px solid var(--ip-frame); border-bottom: 0; }
}

/* Around the map. */
.map-topbar { border-bottom: 1.5px solid var(--ip-frame); background: var(--ip-paper); }
.map-title, .board-info { ${SMALL} font-size: 14px; color: var(--muted); }
.toolbar { border-radius: 3px; border: 1.5px solid var(--ip-frame); background: var(--ip-paper); box-shadow: none; }
.toolbar button { border-radius: 3px; font: 400 14px var(--font-sans); }
.toolbar button:hover { color: var(--accent); }
.toolbar button.active { background: var(--ip-band); color: var(--accent); }

/* The Scene Picker: the map. */
${cover(".campaign-scenes-head", "ip-map")}
.campaign-scenes-head { min-height: 220px; align-items: flex-start; padding: 32px ${MAP_ROOM} 40px 34px; }
.campaign-scenes-head > div { flex: 1; min-width: 0; }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head small { ${SMALL} font-size: 15px; color: var(--ip-map-text); }
.campaign-scenes-head h1 { margin-top: 6px; font-size: 46px; line-height: 1.1; ${TITLE} }
.dashboard-continue { ${FRAME} padding: 18px 24px; }
.dashboard-continue:hover { ${FRAME} ${FRAME_ON} padding: 18px 24px; }
.dashboard-continue small { ${SMALL} font-size: 14px; color: var(--accent); }
.dashboard-continue strong { ${HEAD} font-size: 25px; }
.campaign-scenes-kinds button { border-radius: 3px; font: 400 14px var(--font-sans); }
.campaign-scenes-group h2 { ${HEAD} font-size: 23px; color: var(--ip-heading); }
${ruled(".campaign-scenes-group h2")}
.campaign-scenes-group h2 span { ${SMALL} font-size: 13.5px; }
.campaign-scene-card { border: 1.5px solid var(--ip-frame); border-radius: 0; background: var(--ip-paper); box-shadow: none; overflow: hidden; }
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { background: var(--ip-band), var(--ip-paper); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card strong { font: 400 17px/1.25 var(--font-sans); }
.campaign-scene-card em { ${SMALL} font-style: normal; font-size: 13px; color: var(--accent); }

@media (max-width: 1100px) {
  .campaign-scenes-head { --ip-s: .55; }
  .campaign-scenes-head h1 { font-size: 38px; }
}
@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 0; flex-wrap: wrap; padding: 22px 20px calc(260px * var(--ip-s) + 30px); --ip-s: .5; }
  .campaign-scenes-head > div { flex: 1 1 100%; }
  .campaign-scenes-head h1 { font-size: 31px; }
  .dashboard-continue strong { font-size: 21px; overflow-wrap: anywhere; }
}
`;

/* The campaign's dashboard: the map behind its name, and parchment panels. */
const DASHBOARD = `/* Imperial Province for the campaign's dashboard. */
${VARS}
body { background: var(--ip-page); }
::selection { background: var(--ip-marker); color: #ffffff; }
.hub-crumbs { ${SMALL} font-size: 14px; }
.hub-crumbs a { color: var(--accent); }

/* The top: the map. */
${cover(".hub-head", "ip-hub")}
.hub-head { min-height: 230px; padding: 32px ${MAP_ROOM} 36px 34px; }
.hub-title p { ${SMALL} font-size: 15px; color: var(--ip-map-text); }
.hub-title h1 { margin-top: 6px; font-size: 50px; line-height: 1.1; ${TITLE} }
.hub-chip { border-radius: 3px; border: 1px solid var(--ip-map-ink); background: transparent; color: var(--ip-map-text); ${SMALL} font-size: 13px; }
.hub-head .tag-add { border-radius: 3px; border-color: var(--ip-map-ink); color: var(--ip-map-text); }

/* Buttons. */
.hub-button { ${INK_BTN} font-size: 14.5px; }
.hub-button:not(.hub-button-primary):hover, .hub-button:not(.hub-button-primary):hover:not(:disabled) { ${INK_ON} }
.hub-head .hub-button:not(.hub-button-primary) { border-color: var(--ip-map-ink); color: var(--ip-map-text); }
.hub-button-primary, a.hub-button-primary { ${LEATHER} font-size: 14.5px; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { ${LEATHER_ON} }

/* Dashboard, Front page and Members: the journal's tabs. */
.hub-tabs { border-bottom: 1.5px solid var(--ip-frame); }
.hub-tabs button, .hub-tabs a { ${SMALL} font-size: 15.5px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }

/* Cards. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; ${HEAD} font-size: 23px; color: var(--ip-heading); }
.hub-card-head a, .hub-card-head .hub-text-button { ${SMALL} font-size: 14px; }
.hub-scene-grid li { border-radius: 0; }

@media (max-width: 1100px) {
  .hub-head { --ip-s: .55; }
  .hub-title h1 { font-size: 42px; }
}
@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 22px 20px calc(260px * var(--ip-s) + 30px); --ip-s: .5; }
  .hub-title h1 { font-size: 32px; }
}
`;

const BANNER = MAP("ip-land");

export const IMPERIAL_PROVINCE: Theme = {
  id: "preset-imperial", name: "Imperial Province", mode: "both", radius: 0, banner: "picture", fonts: { display: "fondamento", reading: "fell", ui: "fondamento" },
  colors: {
    light: { bg: "#d9c9a3", panel: "#eadbb8", raised: "#e0cfa8", line: "#b39a68", ink: "#33240f", muted: "#5f4b2c", accent: "#7a2e12", accent2: "#3d5a2a" },
    dark: { bg: "#1a140c", panel: "#251c11", raised: "#2e2315", line: "#4f3d22", ink: "#e8d9b5", muted: "#b09c74", accent: "#d9a24a", accent2: "#9cb86a" },
  },
  css: `/* Imperial Province: the journal from Oblivion. Parchment panels in ink frames with a curl in each corner, the province's map for a banner (a tower on a lake island,
   mountains, a compass rose and a red quest marker), the links on the compass strip, and dark leather with gold ink by night. Everything a version changes is a variable in the first two rules. */

${VARS}

body { background: var(--ip-page); scrollbar-color: var(--ip-frame) var(--panel); }
::selection { background: var(--ip-marker); color: #ffffff; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border: 1.5px solid var(--ip-frame); border-bottom: 0; border-radius: 0; background: var(--ip-paper); }
.board-date { ${SMALL} font-size: 14px; }
.board-date b { color: var(--accent); }
.circ { ${MEDAL} font-size: 13px; }
.you b { ${HEAD} font-size: 19px; color: var(--ip-heading); }
.search-box { border-radius: 3px; border-color: var(--ip-frame); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the province's map, the title in the journal's red ink at the left. */
.board-head { min-height: 340px; border: 1.5px solid var(--ip-frame); border-radius: 0; text-align: left; box-shadow: none; }
.board-head:not(.has-art) {
  outline: 1px solid var(--ip-map-ink); outline-offset: -7px;
  ${BANNER.declare}
  background: ${BANNER.use};
  --head-ink: var(--ip-map-text); --head-title: var(--ip-map-title); --head-shadow: none; --head-nav: transparent; --head-line: transparent;
}
.board-head-text { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding: 44px ${MAP_ROOM} 60px 46px; }
.board-title { font: 400 62px/1.1 var(--font-display); text-transform: none; letter-spacing: .01em; }
.board-title a { ${TITLE} }
.board-tagline { margin-top: 12px; max-width: 30em; font: italic 400 22px/1.4 var(--font-reading); color: var(--head-ink); text-shadow: none; }
/* The links: the compass strip. Bronze rails above and below, the compass's ticks, and a red marker over the link under the pointer. */
.board-nav {
  position: relative; z-index: 1; justify-content: flex-start; gap: 6px; padding: 4px 30px; border-top: 0;
  background: linear-gradient(180deg, #2a1a0a, #7a5a2c 45%, #3a2410) left top / 100% 4px no-repeat, linear-gradient(180deg, #3a2410, #7a5a2c 55%, #2a1a0a) left bottom / 100% 4px no-repeat,
    repeating-linear-gradient(90deg, var(--ip-tick) 0 1px, transparent 1px 14px) left 4px / 100% 5px no-repeat, var(--ip-strip);
}
.board-nav a { padding: 15px 16px 11px; border: 0; color: var(--ip-strip-ink); font: 400 18px var(--font-display); text-transform: none; letter-spacing: .01em; }
.board-nav a:hover { color: var(--ip-red); background: ${MARKER} center 3px / 12px 10px no-repeat; }
.board-nav a:focus-visible { outline: 2px solid var(--ip-red); outline-offset: -4px; }
/* With a banner picture: the picture under a parchment-dark wash at the left, the title in parchment over it. */
.board-head.has-art { background: linear-gradient(90deg, rgba(26, 17, 8, .74) 0%, rgba(26, 17, 8, .3) 55%, rgba(26, 17, 8, .05) 100%), var(--banner) center var(--banner-y, 50%) / cover no-repeat; --head-ink: #f0e2bd; --head-shadow: none; --head-nav: transparent; --head-line: transparent; }
.board-head.has-art .board-head-text { padding: 56px 46px; }
.board-head.has-art .board-title a { color: #f6e7bd; text-shadow: 0 2px 4px rgba(15, 9, 3, .8); }
.board-head.has-art .board-tagline { text-shadow: 0 1px 3px rgba(15, 9, 3, .8); }

/* Headings: an ink diamond, the words in the journal's red ink, a rule fading out to the right. */
.category-title { ${HEAD} font-size: 27px; color: var(--ip-heading); text-shadow: none; }
${ruled(".category-title")}
.category-title::after { order: 9; }
.tag { border-radius: 3px; ${SMALL} font-size: 12.5px; text-shadow: none; }
.tag:where(:not(.topic-tag)) { border-color: var(--ip-frame); color: var(--muted); }
.tag.new { border-color: var(--ip-marker); background: var(--ip-marker); color: #ffffff; }

/* Boards and topics: parchment in an ink frame. Under the pointer, the journal's soft band. */
.category-forums, .topics { gap: 10px; }
.forum, .topic-row { ${FRAME} }
.topic-row { padding: 14px 20px; }
.forum:hover, .topic-row:hover { ${FRAME_ON} }
.topic-row.pinned { border-left: 1.5px solid var(--ip-frame); background: ${CURLS}, linear-gradient(var(--accent-2), var(--accent-2)) left 5px top 12px / 3px calc(100% - 24px) no-repeat, var(--ip-paper); }
.topic-row.picked { border-color: var(--accent-2); background: ${CURLS}, linear-gradient(color-mix(in srgb, var(--accent-2) 12%, transparent), color-mix(in srgb, var(--accent-2) 12%, transparent)), var(--ip-paper); }
.topic-row.pinned:hover { background: ${CURLS}, linear-gradient(var(--accent-2), var(--accent-2)) left 5px top 12px / 3px calc(100% - 24px) no-repeat, var(--ip-band), var(--ip-paper); }
.topic-row.picked:hover { background: ${CURLS}, linear-gradient(color-mix(in srgb, var(--accent-2) 12%, transparent), color-mix(in srgb, var(--accent-2) 12%, transparent)), var(--ip-band), var(--ip-paper); }
.forum-name { ${HEAD} font-size: 25px; line-height: 1.15; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum-name a:hover, .topic-title a:hover, .forum:hover .forum-name a, .topic-row:hover .topic-title a { color: var(--accent); }
.forum-desc { font: italic 400 17.5px/1.45 var(--font-reading); }
.forum-place { ${SMALL} font-size: 13.5px; }
.forum-place a { color: var(--accent); }
.forum-counts b { ${HEAD} font-size: 20px; color: var(--ink); }
.last-label { ${SMALL} font-size: 13px; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 400 15.5px/1.3 var(--font-sans); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { ${HEAD} font-size: 21px; line-height: 1.25; }
.topic-main small { font-style: normal; }
.topic-count b { ${HEAD} font-size: 19px; color: var(--ink); }
/* Unread: the red quest marker. */
.unread-dot { width: 12px; height: 10px; border-radius: 0; background: ${MARKER}; box-shadow: none; }
/* Small portraits: bronze medallions. */
.portrait.small, .portrait.tiny { ${MEDAL} }
/* A location with no picture gets the tower on its island, in small. */
.forum-art { border-right: 1.5px solid var(--ip-frame); border-radius: 0; }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} overflow: hidden; }
.location-art { border-right: 1.5px solid var(--ip-frame); }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${SMALL} font-size: 14px; color: var(--accent); }
.location-name { ${HEAD} font-size: 38px; color: var(--ip-heading); }
.location-summary { font: italic 400 18.5px/1.55 var(--font-reading); }

/* Topic pages. */
.crumbs { ${SMALL} font-size: 14px; }
.crumbs a { color: var(--accent); }
.topic-head { ${FRAME} }
.topic-name { ${HEAD} font-size: 40px; line-height: 1.1; color: var(--ip-heading); }
.cast-chip, .today-chip { border-radius: 3px; border-color: var(--ip-frame); }
.mod-tools { gap: 8px; margin-top: 14px; padding-top: 14px; border-top-color: var(--ip-frame); }
.mod-tools .f-btn.small { padding: 6px 12px; }

/* Posts: pages of the journal. The name is in red ink over a rule that fades at both ends. */
.posts { gap: 22px; }
.post { ${FRAME} }
.post.fresh { box-shadow: inset 0 0 0 1.5px var(--accent-2), var(--ip-burn); }
.post-band, .post.flip .post-band { padding: 16px 24px 12px; border-bottom: 0; background: linear-gradient(90deg, transparent, var(--ip-frame) 12% 88%, transparent) left bottom / 100% 1px no-repeat; }
.post-name { ${HEAD} font-size: 26px; line-height: 1.1; color: var(--ip-heading); }
.post-meta { font: italic 400 15.5px var(--font-reading); }
.post-meta a { color: var(--muted); }
/* The GM's posts are scrolls: parchment in both versions, rolled at the top and the foot. */
.post.post-gm {
  --ink: #33240f; --muted: #5f4b2c; --accent: #7a2e12; --accent-2: #3d5a2a; --line: #b39a68; --bg: #e0cfa8; --panel: #eadbb8; --raised: #e0cfa8; --ip-heading: #6a240c; --ip-frame: #6b4a22;
  border-color: #6b4a22; color: #33240f; box-shadow: none;
  background: linear-gradient(180deg, #8f7340, #e8d6a6 45%, #b79a5e 80%, #7d6234) left top / 100% 12px no-repeat, linear-gradient(180deg, #7d6234, #b79a5e 20%, #e8d6a6 55%, #8f7340) left bottom / 100% 12px no-repeat,
    radial-gradient(ellipse 60% 80% at 12% 0, rgba(255, 247, 220, .55), transparent 70%), linear-gradient(180deg, #efe1bc, #e4d2a6);
  padding: 12px 0;
}
.post.post-gm.fresh { box-shadow: inset 0 0 0 1.5px #3d5a2a; }
.gm-band { border-bottom: 0; background: linear-gradient(90deg, transparent, #6b4a22 12% 88%, transparent) left bottom / 100% 1px no-repeat; }
.gm-seal { ${MEDAL} border-color: #6b4a22; }
/* A big portrait: a plate in the journal, in an ink frame with a curl in each corner. */
.portrait.big { border: 1.5px solid var(--ip-frame); border-radius: 0; box-shadow: none; }
.portrait.big.portrait-empty { background: var(--ip-map); }
.portrait.big.portrait-empty span { ${HEAD} font-size: 110px; color: var(--ip-map-title); text-shadow: 0 1px 0 var(--ip-map-lift); }
/* The character card that opens over a portrait: the journal's own page, parchment in both versions. The name is in
   red ink, under it the three bars of health, magicka and fatigue, and what they say in italic. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 20px 18px 16px; border: 1.5px solid #6b4a22; border-radius: 0;
  background: radial-gradient(ellipse 60% 80% at 12% 0, rgba(255, 247, 220, .6), transparent 70%), linear-gradient(180deg, #f1e3be, #e2cf9f); color: #33240f; box-shadow: 0 12px 24px -12px rgba(20, 12, 4, .6);
}
.mini-card > *, .mini-card dd { color: #33240f; }
.mini-card :focus-visible { outline: 2px solid #7a2e12; outline-offset: 2px; }
.mini-name { font: 400 25px/1.15 var(--font-display); color: #6a240c; text-transform: none; letter-spacing: .01em; overflow-wrap: anywhere; }
.mini-name::after {
  content: ""; display: block; width: 120px; height: 20px; margin-top: 8px; border-radius: 2px;
  background: linear-gradient(90deg, #8a1c14, #c43c2c) 2px 2px / calc(100% - 4px) 4px no-repeat, linear-gradient(90deg, #1d3c8a, #3f74c9) 2px 8px / calc(100% - 4px) 4px no-repeat,
    linear-gradient(90deg, #2a6a22, #58a342) 2px 14px / calc(100% - 4px) 4px no-repeat, linear-gradient(180deg, #5a3d1c, #2c1a0a);
}
.mini-role { margin: 8px 0 10px; padding-bottom: 8px; border-bottom: 1px solid #b39a68; ${SMALL} font-style: normal; font-size: 14px; color: #5f4b2c; }
.mini-quote { padding-left: 12px; border-left: 2px solid #7a2e12; font: italic 400 17.5px/1.45 var(--font-reading); color: #33240f; opacity: 1; }
.mini-traits .chip { border-radius: 3px; border-color: #6b4a22; color: #33240f !important; }
.mini-fields dt { ${SMALL} font-size: 13px; color: #7a2e12; }
.mini-fields dd { font: 400 16.5px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 7px 16px; ${LEATHER} color: #f3e3b8 !important; font-size: 14.5px; text-decoration: none; }
.mini-link:hover { ${LEATHER_ON} }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${SMALL} font-size: 13.5px; line-height: 1.6; }
.mini-player b { color: var(--accent); }
.post-text { font: 400 19.5px/1.6 var(--font-reading); }
.post-text blockquote { border-left: 2px solid var(--accent); background: var(--ip-band); }
.post-text pre { border: 1px solid var(--ip-frame); border-radius: 0; background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { ${HEAD} color: var(--ip-heading); }
.roll-card { border-radius: 0; border: 1px solid var(--ip-frame); border-left: 3px solid var(--ip-marker); }
.roll-total { ${MEDAL} font-size: 15px; line-height: 24px; }
.post-actions { border-top: 0; background: linear-gradient(90deg, transparent, var(--ip-frame) 12% 88%, transparent) left top / 100% 1px no-repeat; }
.post-actions button { ${SMALL} font-size: 14px; }
.post-actions button:hover { color: var(--accent); }

/* Buttons and boxes to type in. */
.f-btn:not(.small) { font-size: 15px; }
.f-btn.ghost { ${INK_BTN} color: var(--ink) !important; }
.f-btn.ghost:hover:not(:disabled) { ${INK_ON} }
.f-btn:not(.ghost), .tools .tool-pop .f-btn:not(.ghost) { ${LEATHER} color: #f3e3b8 !important; }
.f-btn:not(.ghost):hover:not(:disabled) { ${LEATHER_ON} }
input:not([type="checkbox"]), select, textarea { border-radius: 3px; background: var(--bg); caret-color: var(--accent); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }
.composer { border: 0; border-top: 1.5px solid var(--ip-frame); }
.composer-kind, .as-label { ${SMALL} color: var(--accent); }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { ${HEAD} font-size: 21px; color: var(--ip-heading); }
.foot-stats b { ${HEAD} font-size: 19px; color: var(--accent); }
.to-top { border-radius: 3px; color: var(--accent); }

@container page (max-width: 900px) {
  .board-head { --ip-s: .74; }
  .board-title { font-size: 48px; }
}
@container page (max-width: 640px) {
  .board-head { min-height: 0; --ip-s: .56; }
  .board-head-text { padding: 26px 22px 26px; }
  .board-head:not(.has-art) .board-head-text { padding-bottom: calc(260px * var(--ip-s) + 16px); }
  .board-head.has-art .board-head-text { padding: 40px 22px; }
  .board-title { font-size: 36px; }
  .board-tagline { font-size: 18px; }
  .board-nav { gap: 0; padding: 4px 8px; }
  .board-nav a { padding: 14px 9px 10px; font-size: 16px; }
  .category-title { font-size: 22px; gap: 9px; }
  .forum-name { font-size: 21px; }
  .topic-name { font-size: 29px; }
  .location-name { font-size: 27px; }
  .post-name { font-size: 21px; }
  .portrait.big.portrait-empty span { font-size: 54px; }
  .forum-location > :nth-child(2) { padding-top: 14px; }
  .forum-location > :last-child { padding-bottom: 16px; }
  .location-art { border-right: 0; border-bottom: 1.5px solid var(--ip-frame); }
  .topic-row { padding: 16px 20px 14px; }
  .mini-card { box-sizing: border-box; }
  .mini-name { font-size: 20px; }
  .post-text { font-size: 18.5px; }
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
