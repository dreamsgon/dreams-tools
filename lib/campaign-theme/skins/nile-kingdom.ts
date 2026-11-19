/*
 * Nile Kingdom: a fully custom skin, inspired by ancient Egypt. Sandstone, papyrus, lapis and gold.
 * The banner is the river at sunrise: three pyramids on the far bank with the sun coming up behind one of them,
 * a reed boat on the water and papyrus growing at both edges, under a winged sun and between two bands of colour
 * like a broad collar (lapis, gold, turquoise, carnelian). By night the same scene lies under the moon and stars.
 * The page behind everything is a sandstone wall by day and a tomb's ceiling by night, deep blue with rows of gold
 * stars. What you read is papyrus, with its fibres just visible. Names sit in cartouches, headings start with a
 * small pyramid over a band of the collar, big portraits are framed in gold and lapis, an unread topic has a small
 * sun, and the GM's posts are inscriptions in gold on lapis in both versions.
 * Like every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --nk-lapis: #1d4f9c; --nk-gold: #e3b23c; --nk-teal: #0f7a70; --nk-red: #a8321f;
  --nk-page: #dcc594; --nk-mortar: rgba(110, 80, 30, .2); --nk-ceiling: transparent; --nk-edge: #b9985a; --nk-fibre: rgba(120, 90, 40, .06);
  --nk-sky-a: #1f3f86; --nk-sky-b: #3e68b2; --nk-sky-c: #e8a85c; --nk-sky-d: #f0c078; --nk-error: #8a2a1e;
  --nk-star: transparent; --nk-orb: #ffe08a; --nk-halo: rgba(255, 214, 120, .5);
  --nk-lit: #e2bd72; --nk-shade: #a37a3c; --nk-dune: #cf9f55; --nk-sand: #d9a85c; --nk-sand-2: #c08a44;
  --nk-river: #3187ab; --nk-river-2: #1d4f9c; --nk-ripple: rgba(255, 244, 214, .5); --nk-glint: rgba(255, 224, 138, .55);
  --nk-reed: #2f6b3a; --nk-umbel: #5d9a4a; --nk-boat: #3a2410; --nk-sail: #fff4d6;
  --nk-title: #fff4d6; --nk-title-shadow: 0 2px 10px rgba(20, 16, 40, .7), 0 0 2px rgba(20, 16, 40, .6); --nk-nav: #14213f;
  --nk-btn: #1d4f9c; --nk-btn-on: #2a5fb0; --nk-btn-ink: #fff4d6; --nk-btn-line: rgba(227, 178, 60, .85); --nk-btn-edge: #153a75;
  --nk-s: 1; --nk-cx: 0px; --nk-w: 1;
  --card-bg: #f6ead0; --card-ink: #2b1d0e; --card-head: #1d4f9c; --card-line: #c9ae74;
}
:root[data-theme="dark"] {
  --nk-page: #080a17; --nk-mortar: transparent; --nk-ceiling: rgba(227, 178, 60, .24); --nk-edge: #36406b; --nk-fibre: rgba(255, 255, 255, .018);
  --nk-sky-a: #080c26; --nk-sky-b: #152050; --nk-sky-c: #333a7a; --nk-sky-d: #4a4a86; --nk-error: var(--danger);
  --nk-star: #ffffff; --nk-orb: #efe9d2; --nk-halo: rgba(239, 233, 210, .2);
  --nk-lit: #6a6795; --nk-shade: #2a2850; --nk-dune: #26254c; --nk-sand: #2e2c55; --nk-sand-2: #1f1e40;
  --nk-river: #1a2a60; --nk-river-2: #0c1436; --nk-ripple: rgba(239, 233, 210, .22); --nk-glint: rgba(239, 233, 210, .28);
  --nk-reed: #0a1f20; --nk-umbel: #10302c; --nk-boat: #05060f; --nk-sail: #8a87a8;
  --nk-title: #f3d27a; --nk-title-shadow: 0 2px 12px rgba(0, 0, 0, .75); --nk-nav: #070917;
  --nk-btn: #e3b23c; --nk-btn-on: #eec45a; --nk-btn-ink: #151a30; --nk-btn-line: rgba(21, 26, 48, .5); --nk-btn-edge: #a37c1f;
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

/** The band of colour, like a broad collar: lapis, turquoise and carnelian, each parted by gold. */
const COLLAR = "repeating-linear-gradient(90deg, var(--nk-lapis) 0 14px, var(--nk-gold) 14px 18px, var(--nk-teal) 18px 32px, var(--nk-gold) 32px 36px, var(--nk-red) 36px 50px, var(--nk-gold) 50px 54px)";

/* The far bank. Everything that stands on it is placed from the middle of the picture and multiplied by `--nk-s`,
   so the pyramids shrink together on a phone or in a smaller cover; `--nk-cx` moves them sideways. */
const flat = (c: string) => `linear-gradient(${c}, ${c})`;
const at = (image: string, dx: number, bottom: number, w: number, h: number) =>
  `${image} left calc(50% + var(--nk-cx) + ${dx + w / 2}px * var(--nk-s)) bottom calc(${bottom}px * var(--nk-s)) / calc(${w}px * var(--nk-s)) calc(${h}px * var(--nk-s)) no-repeat`;
/** How high the water and the bank reach: the pyramids stand on this line. */
const WATER = 40, BANK = 60;
/** A pyramid: the side toward the sun lit, the other in shade. */
const pyramid = (dx: number, w: number, h: number) => {
  const a = +(Math.atan(w / 2 / h) * 180 / Math.PI).toFixed(2);
  return at(`conic-gradient(from ${+(180 - a).toFixed(2)}deg at 50% 0, var(--nk-lit) 0 ${a}deg, var(--nk-shade) ${a}deg ${+(2 * a).toFixed(2)}deg, transparent ${+(2 * a + .5).toFixed(2)}deg)`, dx, BANK - 1, w, h);
};
const dune = (dx: number, w: number, h: number) => at("radial-gradient(ellipse 50% 100% at 50% 100%, var(--nk-dune) 0 99%, transparent 100%)", dx, BANK - 1, w, h);
/** Papyrus at the water's edge: a stem and its fan of a head. Counted in from one edge, and shrunk with the rest. */
const REEDS: [number, number][] = [[14, 56], [27, 86], [41, 64], [55, 98], [71, 50], [86, 74]];
const reed = (side: "left" | "right") => ([x, h]: [number, number]) => [
  `conic-gradient(from -42deg at 50% 100%, var(--nk-umbel) 0 84deg, transparent 84.5deg) ${side} calc(${x - 10}px * var(--nk-s)) bottom calc(${h - 2}px * var(--nk-s)) / calc(22px * var(--nk-s)) calc(14px * var(--nk-s)) no-repeat`,
  `${flat("var(--nk-reed)")} ${side} calc(${x}px * var(--nk-s)) bottom 0 / 2px calc(${h}px * var(--nk-s)) no-repeat`,
];
/** A star: how far from the middle, how far down, how big. Kept to the sides, clear of the words. */
const STARS: [number, number, number][] = [
  [-552, 30, 2], [-498, 104, 3], [-446, 52, 2], [-410, 152, 2], [-372, 22, 2], [-530, 176, 2], [-384, 92, 2],
  [380, 36, 2], [392, 128, 2], [432, 70, 3], [476, 168, 2], [512, 26, 2], [548, 110, 2], [372, 190, 2],
];
const star = ([dx, top, size]: [number, number, number]) => `radial-gradient(circle closest-side, var(--nk-star) 0 55%, transparent 100%) left calc(50% + ${dx}px) top ${top}px / ${size}px ${size}px no-repeat`;
const SCENE = (name: string) => inParts(name, [
  /* Nearest first: the papyrus, the boat, the light on the water, the river, the bank. */
  ...REEDS.flatMap(reed("left")), ...REEDS.flatMap(reed("right")),
  at(flat("var(--nk-sail)"), -119, 34, 22, 18), at(flat("var(--nk-boat)"), -109, 22, 2, 34),
  at("radial-gradient(ellipse 50% 100% at 50% 0, transparent 0 68%, var(--nk-boat) 70% 99%, transparent 100%)", -148, 12, 80, 16),
  at("linear-gradient(90deg, transparent, var(--nk-glint) 50%, transparent)", 82, 0, 76, WATER),
  "repeating-linear-gradient(90deg, var(--nk-ripple) 0 26px, transparent 26px 70px) left 0 bottom calc(27px * var(--nk-s)) / 100% 1px no-repeat",
  "repeating-linear-gradient(90deg, transparent 0 34px, var(--nk-ripple) 34px 58px, transparent 58px 96px) left 0 bottom calc(13px * var(--nk-s)) / 100% 1px no-repeat",
  `linear-gradient(180deg, var(--nk-river), var(--nk-river-2)) left 0 bottom 0 / 100% calc(${WATER}px * var(--nk-s)) no-repeat`,
  `linear-gradient(180deg, var(--nk-sand), var(--nk-sand-2)) left 0 bottom calc(${WATER - 1}px * var(--nk-s)) / 100% calc(${BANK - WATER + 1}px * var(--nk-s)) no-repeat`,
  /* The three pyramids, the nearest and largest in front, and the dunes behind them. */
  pyramid(-250, 280, 160), pyramid(10, 220, 126), pyramid(172, 108, 64),
  dune(-600, 470, 30), dune(250, 520, 24),
  /* The sun (or the moon) coming up behind the second pyramid, and the stars. */
  at("radial-gradient(circle closest-side, var(--nk-orb) 0 97%, transparent 100%)", 70, 100, 100, 100),
  at("radial-gradient(circle closest-side, var(--nk-halo), transparent)", -10, 20, 260, 260),
  ...STARS.map(star),
  /* The sky. Its warm part is measured up from the foot, so it stays behind the pyramids however tall the words above them grow. */
  "linear-gradient(180deg, var(--nk-sky-a) 0%, var(--nk-sky-b) calc(100% - 224px * var(--nk-s) - 16px), var(--nk-sky-c) calc(100% - 50px * var(--nk-s)), var(--nk-sky-d) 100%)",
]);
/** How high the scene reaches, for the room the words leave under themselves. */
const SCENE_ROOM = "calc(224px * var(--nk-s) + 14px)";

/**
 * The winged sun over the title: a disc with a ring, and a wing at each side. A wing is rows of feathers, drawn as
 * bands that run along it and turn round its tip, so the straight part and the round tip share the same stops.
 * `--nk-w` shrinks it.
 */
const FEATHERS = "var(--nk-gold) 0 10%, var(--nk-lapis) 10% 36%, var(--nk-gold) 36% 44%, var(--nk-teal) 44% 66%, var(--nk-gold) 66% 74%, var(--nk-red) 74% 92%, var(--nk-gold) 92% 99%";
const wingPart = (image: string, dx: number, w: number) => `${image} left calc(50% + ${dx}px * var(--nk-w)) top calc(19px * var(--nk-w)) / calc(${w}px * var(--nk-w)) calc(26px * var(--nk-w)) no-repeat`;
const WINGS = [
  "radial-gradient(circle closest-side, var(--nk-gold) 0 56%, var(--nk-red) 60% 84%, var(--nk-gold) 88% 98%, transparent 100%) left 50% top calc(14px * var(--nk-w)) / calc(36px * var(--nk-w)) calc(36px * var(--nk-w)) no-repeat",
  wingPart(`linear-gradient(180deg, ${FEATHERS})`, -63, 98), wingPart(`radial-gradient(circle farthest-side at 100% 0, ${FEATHERS}, transparent 100%)`, -124, 26),
  wingPart(`linear-gradient(180deg, ${FEATHERS})`, 63, 98), wingPart(`radial-gradient(circle farthest-side at 0 0, ${FEATHERS}, transparent 100%)`, 124, 26),
].join(", ");

/* Shared pieces of the look. */
/** The wall behind the page. By day, courses of sandstone blocks; by night, a tomb's ceiling with rows of gold stars. */
const WALL = [
  "radial-gradient(circle, var(--nk-ceiling) 0 1.1px, transparent 1.7px) 0 0 / 46px 46px",
  "radial-gradient(circle, var(--nk-ceiling) 0 1.1px, transparent 1.7px) 23px 23px / 46px 46px",
  "linear-gradient(var(--nk-mortar) 1px, transparent 1px) 0 0 / 100% 68px",
  "conic-gradient(from 270deg at 1px 68px, var(--nk-mortar) 0 90deg, transparent 0) 0 0 / 176px 136px",
  "conic-gradient(from 270deg at 1px 68px, var(--nk-mortar) 0 90deg, transparent 0) 88px 68px / 176px 136px",
].join(", ");
/** A sheet of papyrus, its fibres just visible. `--nk-fill` is what changes under the pointer. */
const PAPYRUS = "repeating-linear-gradient(0deg, var(--nk-fibre) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, var(--nk-fibre) 0 1px, transparent 1px 7px)";
const SHEET = `border: 1px solid var(--nk-edge); border-radius: 0; background: ${PAPYRUS}, var(--nk-fill, var(--panel)); box-shadow: none;`;
const SHEET_ON = "--nk-fill: var(--raised);";
/** Display lettering (Marcellus): headings as written, small labels in spaced capitals. */
const HEAD = "font-family: var(--font-display); font-weight: 400; letter-spacing: .03em; text-transform: none;";
const CAPS = "font-family: var(--font-display); font-weight: 400; text-transform: uppercase; letter-spacing: .16em;";
const SMALL = "font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .12em;";
/** Counts are set in the reading face: Marcellus draws its 0 as a plain ring. */
const COUNT = "font-family: var(--font-reading); font-weight: 600; letter-spacing: 0; text-transform: none;";
/** Buttons: the main ones are lapis (gold by night) with a fine line inside the edge; the others are papyrus. */
const MAIN_BTN = `border: 1px solid var(--nk-btn-edge); border-radius: 0; background: var(--nk-btn); color: var(--nk-btn-ink); box-shadow: inset 0 0 0 2px var(--nk-btn), inset 0 0 0 3px var(--nk-btn-line); ${SMALL}`;
const MAIN_ON = "background: var(--nk-btn-on); color: var(--nk-btn-ink); box-shadow: inset 0 0 0 2px var(--nk-btn-on), inset 0 0 0 3px var(--nk-btn-line);";
const LINE_BTN = `border: 1px solid var(--line-strong); border-radius: 0; background: var(--panel); color: var(--ink); box-shadow: none; ${SMALL}`;
const LINE_ON = "border-color: var(--accent); background: var(--panel); color: var(--accent);";
/** A heading: a small pyramid, the words in spaced capitals, and a band of the collar under them. */
const headed = (h: string, size: number) => `${h} {
  display: flex; align-items: center; gap: 12px; padding-bottom: 12px; ${CAPS} font-size: ${size}px; line-height: 1.2; color: var(--ink);
  background: ${COLLAR} left bottom / 100% 5px no-repeat;
}
${h}::before { content: ""; flex: none; width: 22px; height: 14px; background: conic-gradient(from 141.84deg at 50% 0, #e3b23c 0 38.16deg, #9a6f24 38.16deg 76.32deg, transparent 76.8deg); }`;
/** A name in a cartouche: an oval drawn twice, gold inside lapis, with the bar across its end. */
const CARTOUCHE = "position: relative; display: inline-block; max-width: calc(100% - 12px); padding: 5px 20px 4px; border: 2px solid var(--nk-gold); border-radius: 22px; overflow-wrap: anywhere; box-shadow: inset 0 0 0 2px var(--nk-ring-gap, var(--raised)), inset 0 0 0 3px var(--accent);";
const cartouche = (item: string) => `${item} { ${CARTOUCHE} }
${item}::after { content: ""; position: absolute; top: -4px; bottom: -4px; right: -9px; width: 3px; background: var(--nk-gold); }`;
/** Small square portraits: lapis in a gold edge. */
const MEDAL = "border-radius: 0; border: 2px solid #e3b23c; background: #16234a; color: #f3d27a; font-family: var(--font-display); font-weight: 400;";
/** Where a picture is missing: a pyramid under the sun. */
const BLANK = "radial-gradient(circle at 68% 34%, var(--nk-orb) 0 13px, transparent 14px), conic-gradient(from 135deg at 44% 44%, var(--nk-lit) 0 45deg, var(--nk-shade) 45deg 90deg, transparent 90.4deg), linear-gradient(180deg, var(--nk-sky-a), var(--nk-sky-b) 46%, var(--nk-sky-c) 86%, var(--nk-sky-d))";

/** The cover for the other parts: the river and the pyramids at the foot, the host's own words above them. */
function cover(host: string, name: string) {
  const back = SCENE(name);
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 0; border-bottom: 8px solid transparent; border-image: ${COLLAR} 8; border-radius: 0; box-shadow: none; --nk-s: .6; --nk-cx: 150px;
  ${back.declare}
  background: ${back.use};
}
${host} > * { position: relative; z-index: 2; }
${host} :focus-visible { outline-color: #f6d77e; }`;
}
const COVER_ROOM = "calc(224px * var(--nk-s) + 22px)";
const COVER_TITLE = `${CAPS} letter-spacing: .12em; line-height: 1.15; color: var(--nk-title); text-shadow: var(--nk-title-shadow); overflow-wrap: break-word;`;
const COVER_LABEL = `${SMALL} font-size: 11.5px; color: var(--nk-title); text-shadow: var(--nk-title-shadow);`;
/** Buttons and chips that sit on the sky rather than on papyrus. */
const ON_SKY = "border-color: rgba(255, 244, 214, .6); background: rgba(12, 18, 44, .5); color: #fff4d6;";

/* The Encyclopedia: the house of books. */
const ENCYCLOPEDIA = `/* Nile Kingdom for the Encyclopedia. The colours and fonts come from the theme. */
${VARS}
body { scrollbar-color: var(--nk-edge) var(--panel); }
::selection { background: var(--accent); color: var(--on-accent); }

/* The side. */
.csw-name b { ${HEAD} font-size: 18px; }
.tree-row { border-radius: 0; }
.tree-row.selected { box-shadow: inset 3px 0 0 var(--accent); }
.side-heading .section-toggle { ${SMALL} font-size: 11px; color: var(--muted); }
.shared-tag { border-radius: 0; ${SMALL} font-size: 9.5px; }

/* The bar along the top. */
.search-box { border-radius: 0; }
.search-box:focus-within { border-color: var(--accent); }

/* Buttons and boxes to type in. */
.button { ${LINE_BTN} font-size: 12px; }
.button:hover { ${LINE_ON} }
.button.primary { ${MAIN_BTN} font-size: 12px; }
.button.primary:hover { ${MAIN_ON} }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }

/* The campaign's overview: the river at sunrise. */
${cover(".dashboard-intro", "nk-enc")}
.dashboard-intro { min-height: 250px; align-items: flex-start; margin-bottom: 30px; padding: 30px 32px ${COVER_ROOM}; }
.dashboard-intro > div { min-width: 0; }
.dashboard-intro .eyebrow { ${COVER_LABEL} }
.dashboard-intro h1 { margin: 10px 0 10px; font-size: 38px; ${COVER_TITLE} }
.dashboard-intro .subtitle { max-width: 44ch; font: italic 400 18px/1.45 var(--font-reading); color: var(--nk-title); text-shadow: var(--nk-title-shadow); }
.dashboard-intro .icon-button { border: 1px solid; border-radius: 0; ${ON_SKY} }
.overview-strip strong { ${COUNT} font-size: 25px; color: var(--accent); }

/* Headings: a pyramid and a band of the collar. */
.section-heading { align-items: flex-end; }
${headed(".section-heading h2", 19)}
.section-heading h2 { flex: 1; }
.eyebrow { ${SMALL} font-size: 11px; }

/* Cards: sheets of papyrus. */
.note-card { ${SHEET} --nk-fill: var(--raised); padding: 20px 20px 18px; transition: none; }
.note-card:hover { --nk-fill: color-mix(in srgb, var(--accent) 7%, var(--raised)); border-color: var(--nk-gold); transform: none; box-shadow: none; }
.note-card h3 { ${HEAD} font-size: 23px; line-height: 1.2; }
.note-card:hover h3 { color: var(--accent); }
.note-card.add-card { border: 1px dashed var(--line-strong); background: transparent; }

/* A page. */
.kind-pill { padding: 2px 9px; border-radius: 0; ${SMALL} font-size: 10.5px; }
.article-title h1 { ${HEAD} }
.article-tabs button { ${SMALL} font-size: 11.5px; }
.picture-panel { border-radius: 0; border: 2px solid var(--nk-gold); outline: 2px solid var(--nk-lapis); }
.prose { font-family: var(--font-reading); font-size: 18px; }
.prose h1, .prose h2, .prose h3 { ${HEAD} color: var(--accent); }
.prose blockquote { border-left: 4px solid var(--nk-gold); font-style: italic; }
.article-aside .eyebrow { color: var(--accent); }

@media (max-width: 1000px) {
  .dashboard-intro { --nk-cx: 70px; }
}
@media (max-width: 640px) {
  .dashboard-intro { min-height: 0; padding: 22px 18px ${COVER_ROOM}; --nk-cx: 0px; }
  .dashboard-intro h1 { font-size: 28px; }
  .dashboard-intro .subtitle { font-size: 16.5px; }
  .section-heading h2 { font-size: 17px; }
}
`;

/* Maptable: papyrus round the table, and the river over the Scene Picker. */
const MAPTABLE = `/* Nile Kingdom for Maptable. The map you play on keeps its own colours. */
${VARS}
body { scrollbar-color: var(--nk-edge) var(--panel); }
::selection { background: var(--accent); color: var(--on-accent); }

/* The bar along the top. */
.header-scene strong { ${HEAD} font-size: 18px; color: var(--accent); }
.csw-name b { ${HEAD} font-size: 18px; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${MAIN_BTN} font-size: 12px; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { ${MAIN_ON} }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }
input[type="range"] { accent-color: var(--accent); }

/* The tool rail and the side panel. */
.rail button { border-radius: 0; }
.rail button:hover { color: var(--accent); }
.panel-title h2 { ${CAPS} font-size: 17px; }
.organizer-scene { border-radius: 0; white-space: normal; }
.organizer-scene.active { box-shadow: inset 3px 0 0 var(--accent); }
.organizer-scene strong { font: 600 15.5px/1.25 var(--font-reading); }
.organizer-scene.active strong { color: var(--accent); }

/* Around the map. */
.map-title, .board-info { ${SMALL} font-size: 11px; color: var(--muted); }
.toolbar { border-radius: 0; border: 1px solid var(--nk-edge); }
.toolbar button { border-radius: 0; ${SMALL} font-size: 11px; }
.toolbar button:hover { color: var(--accent); }

/* The Scene Picker: the river at sunrise. */
${cover(".campaign-scenes-head", "nk-map")}
.campaign-scenes-head { min-height: 240px; align-items: flex-start; padding: 28px 30px ${COVER_ROOM}; }
.campaign-scenes-head > div { flex: 1; min-width: 0; }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head small { ${COVER_LABEL} }
.campaign-scenes-head h1 { margin-top: 10px; font-size: 36px; ${COVER_TITLE} }
.dashboard-continue { ${SHEET} padding: 18px 24px; }
.dashboard-continue:hover { ${SHEET} ${SHEET_ON} padding: 18px 24px; }
.dashboard-continue small { ${SMALL} font-size: 11px; color: var(--accent); }
.dashboard-continue strong { ${HEAD} font-size: 26px; }
.campaign-scenes-kinds button { border-radius: 0; ${SMALL} font-size: 11px; }
.campaign-scenes-group h2 { margin-bottom: 14px; }
${headed(".campaign-scenes-group h2", 18)}
.campaign-scenes-group h2 span { ${SMALL} font-size: 10.5px; color: var(--muted); }
.campaign-scene-card { border: 1px solid var(--nk-edge); border-radius: 0; box-shadow: none; overflow: hidden; }
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { border-color: var(--nk-gold); background: var(--raised); }
.campaign-scene-card.last { border-color: var(--accent); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card strong { font: 600 15.5px/1.25 var(--font-reading); }
.campaign-scene-card em { ${SMALL} font-style: normal; font-size: 10.5px; color: var(--accent); }

@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 0; flex-wrap: wrap; padding: 20px 18px ${COVER_ROOM}; --nk-cx: 0px; }
  .campaign-scenes-head > div { flex: 1 1 100%; }
  .campaign-scenes-head h1 { font-size: 26px; }
  .dashboard-continue strong { font-size: 22px; overflow-wrap: anywhere; }
  .campaign-scenes-group h2 { font-size: 16px; }
}
`;

/* The campaign's dashboard: the river behind its name, and sheets of papyrus on the wall. */
const DASHBOARD = `/* Nile Kingdom for the campaign's dashboard. */
${VARS}
body { background: ${WALL}, var(--nk-page); }
::selection { background: var(--accent); color: var(--on-accent); }
.hub-crumbs { ${SMALL} font-size: 11.5px; }
.hub-crumbs a { color: var(--accent); }

/* The top: the river at sunrise. Not clipped, so the tag menu can open past its foot. */
${cover(".hub-head", "nk-hub")}
.hub-head { min-height: 250px; padding: 28px 30px ${COVER_ROOM}; overflow: visible; z-index: 3; }
.hub-title p { ${COVER_LABEL} }
.hub-title h1 { margin-top: 10px; font-size: 38px; ${COVER_TITLE} }
.hub-chip { border-radius: 0; ${ON_SKY} ${SMALL} font-size: 10.5px; }
.hub-chip.on { border-color: #e3b23c; color: #f6d77e; }
.hub-head .tag-add { border-radius: 0; ${ON_SKY} }
.hub-head .tag-chip { background: rgba(12, 18, 44, .5); color: #fff4d6; }
.hub-head .tag-more, .hub-head .tag-chip-remove, .hub-head .tag-error { color: #fff4d6; }
.hub-error { color: var(--nk-error); }

/* Buttons. The plain ones in the top sit on the sky. */
.hub-button { ${LINE_BTN} font-size: 12px; }
.hub-button:not(.hub-button-primary):hover, .hub-button:not(.hub-button-primary):hover:not(:disabled) { ${LINE_ON} }
.hub-head .hub-button:not(.hub-button-primary) { ${ON_SKY} }
.hub-head .hub-button:not(.hub-button-primary):hover, .hub-head .hub-button:not(.hub-button-primary):hover:not(:disabled) { border-color: #e3b23c; background: rgba(12, 18, 44, .62); color: #f6d77e; }
.hub-button-primary, a.hub-button-primary { ${MAIN_BTN} font-size: 12px; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { ${MAIN_ON} }
.hub-button.mem-ban-button { border-color: var(--danger); background: var(--danger); color: var(--on-accent); }
.hub-button.mem-ban-button:hover:not(:disabled) { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 85%, #000000); color: var(--on-accent); }

/* Dashboard, Front page and Members. */
.hub-tabs button, .hub-tabs a { ${SMALL} font-size: 12px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }

/* Cards. */
.hub-card { ${SHEET} }
.hub-grid-edit .hub-card { border-style: dashed; }
.hub-solo.on { border-left: 3px solid var(--accent); }
.hub-card.mem-asking { border-color: var(--warning, #c98a2e); background: color-mix(in srgb, var(--warning-soft, #fbeccf) 55%, var(--panel)); }
.hub-card-head h2 { flex: 1; ${CAPS} font-size: 17px; }
.hub-card-head a, .hub-card-head .hub-text-button { ${SMALL} font-size: 11px; }

@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 20px 18px ${COVER_ROOM}; --nk-cx: 0px; }
  .hub-title h1 { font-size: 28px; }
  .hub-tabs button, .hub-tabs a { font-size: 11px; letter-spacing: .06em; }
}
`;

const BANNER = SCENE("nk-scene");
/** The colours an inscription keeps in both versions: gold and cream on lapis. */
const ON_LAPIS = "--ink: #f2e6c8; --muted: #b9af8e; --accent: #e3b23c; --accent-2: #3fc4b4; --line: #36406b; --line-strong: #5564a0; --bg: #0d1020; --panel: #16234a; --raised: #1d2c5a; --accent-soft: #3a3622; --danger: #f0a196; --on-accent: #151a30; --nk-edge: #e3b23c; --nk-btn: #e3b23c; --nk-btn-on: #eec45a; --nk-btn-ink: #151a30; --nk-btn-line: rgba(21, 26, 48, .5); --nk-btn-edge: #a37c1f;";

export const NILE_KINGDOM: Theme = {
  id: "preset-nile", name: "Nile Kingdom", mode: "both", radius: 0, banner: "picture", fonts: { display: "marcellus", reading: "spectral", ui: "spectral" },
  colors: {
    light: { bg: "#ead9b0", panel: "#f6ead0", raised: "#eedfbb", line: "#c9ae74", ink: "#2b1d0e", muted: "#5c4a2e", accent: "#1d4f9c", accent2: "#0b6b62" },
    dark: { bg: "#0d1020", panel: "#151a30", raised: "#1d2340", line: "#36406b", ink: "#f2e6c8", muted: "#b3a987", accent: "#e3b23c", accent2: "#3fc4b4" },
  },
  css: `/* Nile Kingdom: ancient Egypt in sandstone, papyrus, lapis and gold. The banner is the river at sunrise (three pyramids, a reed boat, papyrus at the edges) under a winged sun, between two bands
   of colour like a broad collar; by night the same scene lies under the moon. The page is a sandstone wall by day and a tomb's starry ceiling by night, and what you read is papyrus.
   Names sit in cartouches and the GM's posts are inscriptions in gold on lapis. Everything a version changes is a variable in the first two rules. */

${VARS}

body { background: ${WALL}, var(--nk-page); scrollbar-color: var(--nk-edge) var(--nk-page); }
::selection { background: var(--accent); color: var(--on-accent); }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border-radius: 0; }
.board-date { ${SMALL} font-size: 11px; }
.board-date b { color: var(--accent); }
.circ { ${MEDAL} font-size: 14px; }
.you b { ${HEAD} font-size: 19px; color: var(--accent); }
.search-box { border-radius: 0; }
.search-box:focus-within { border-color: var(--accent); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the river at sunrise, between two bands of the collar, with the winged sun over the title. */
.board-head { min-height: 0; border: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-image: ${COLLAR} 10; border-radius: 0; text-align: center; }
.board-head:not(.has-art) { background: var(--nk-nav); --head-ink: #fff4d6; --head-title: var(--nk-title); --head-shadow: var(--nk-title-shadow); --head-nav: transparent; --head-line: transparent; }
.board-head:not(.has-art) .board-head-text {
  ${BANNER.declare}
  background: ${WINGS}, ${BANNER.use};
}
.board-head-text { padding: 84px 110px ${SCENE_ROOM}; }
.board-title { max-width: 660px; margin-inline: auto; font: 400 48px/1.16 var(--font-display); letter-spacing: .2em; text-transform: uppercase; overflow-wrap: break-word; }
.board-title a { color: var(--nk-title); text-shadow: var(--nk-title-shadow); }
.board-tagline { max-width: 30em; margin: 12px auto 0; font: italic 400 20px/1.4 var(--font-reading); color: var(--nk-title); text-shadow: var(--nk-title-shadow); }
/* The links: a strip of deep lapis under the water, with a gold line. */
.board-nav { gap: 4px; border-top: 2px solid var(--nk-gold); background: var(--nk-nav); }
.board-nav a { padding: 12px 16px 11px; color: #fff4d6; ${SMALL} font-size: 12.5px; letter-spacing: .2em; }
.board-nav a:hover { color: #f6d77e; border-bottom-color: #e3b23c; }
.board-nav a:focus-visible { outline: 2px solid #e3b23c; outline-offset: -4px; }
.board-title a:focus-visible { outline-color: #f6d77e; }
/* With a banner picture: the picture under a dark wash, with the winged sun and the title over it. */
.board-head.has-art { background: linear-gradient(180deg, rgba(8, 12, 30, .35), rgba(8, 12, 30, .68)), var(--banner) center var(--banner-y, 50%) / cover no-repeat; --nk-title: #fff4d6; --nk-title-shadow: 0 2px 12px rgba(0, 0, 0, .8); --head-nav: transparent; --head-line: transparent; }
.board-head.has-art .board-head-text { padding: 90px 40px 56px; background: ${WINGS}; }
.board-head.has-art .board-nav { background: rgba(7, 9, 23, .74); }

/* Headings: a pyramid and a band of the collar. */
.category-title { margin-bottom: 16px; }
.topics-head .category-title, .reply-head .category-title { margin-bottom: 0; }
${headed(".category-title", 21)}
.category-title .tag { background: var(--panel); }
.tag { border-radius: 0; text-shadow: none; }
.tag:where(:not(.topic-tag)) { ${SMALL} font-size: 10px; }
/* Plain tags only: the ones that mean something (private, reported, a fight, a turn) keep their own colours. */
.tag:where(:not(.topic-tag, .private, .reported, .fight, .turn-meta, .ai-mark, .ai-kind, .new)) { border-color: var(--nk-edge); color: var(--muted); }
.tag.new { border-color: var(--nk-red); background: var(--nk-red); color: #fff4d6; }

/* Boards and topics: sheets of papyrus. Under the pointer the sheet darkens a little and its edge turns gold. */
.category-forums, .topics { gap: 12px; }
.forum, .topic-row { ${SHEET} }
.topic-row { padding: 15px 22px; }
.forum:hover, .topic-row:hover { ${SHEET_ON} border-color: var(--nk-gold); }
.topic-row.pinned { border-left: 3px solid var(--accent); }
.topic-row.picked, .topic-row.picked:hover { --nk-fill: var(--accent-soft); background: ${PAPYRUS}, var(--nk-fill); }
.forum-name { ${HEAD} font-size: 25px; line-height: 1.2; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum-name a:hover, .topic-title a:hover, .forum:hover .forum-name a, .topic-row:hover .topic-title a { color: var(--accent); }
.forum-desc { font: italic 400 17px/1.45 var(--font-reading); }
.forum-place { ${SMALL} font-size: 10.5px; }
.forum-counts b { ${COUNT} font-size: 24px; color: var(--accent); }
.last-label { ${SMALL} font-size: 10px; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 600 16px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { ${HEAD} font-size: 22px; line-height: 1.25; }
.topic-count b { ${COUNT} font-size: 22px; color: var(--accent); }
/* Unread: a small sun, gold in a ring of carnelian. */
.unread-dot { width: 12px; height: 12px; border: 0; border-radius: 50%; background: radial-gradient(circle closest-side, #f6cf5f 0 44%, #a8321f 50% 72%, #c8962a 78% 100%); box-shadow: none; }
.portrait.small, .portrait.tiny { ${MEDAL} }
/* A location with no picture: a pyramid under the sun. */
.forum-art { border-right: 1px solid var(--nk-edge); border-radius: 0; }
.forum-art:not([style]) { background: ${BLANK}; }

/* A location's own page. */
.location { ${SHEET} overflow: hidden; }
.location-art { border-right: 1px solid var(--nk-edge); }
.location-art.portrait-empty { background: ${BLANK}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${SMALL} font-size: 11px; color: var(--accent); }
.location-name { ${CAPS} letter-spacing: .1em; font-size: 32px; line-height: 1.15; }
.location-summary { font: italic 400 18px/1.5 var(--font-reading); }

/* Topic pages. */
.crumbs { ${SMALL} font-size: 11px; }
.topic-head { ${SHEET} }
.topic-name { ${CAPS} letter-spacing: .08em; font-size: 31px; line-height: 1.18; }
.cast-chip, .today-chip { border-radius: 0; }
.mod-tools { gap: 10px; margin-top: 14px; padding-top: 14px; }
.mod-tools .f-btn.small { padding: 6px 12px; }

/* Posts: a sheet each under a band of the collar, with the name in a cartouche. */
.posts { gap: 20px; }
.post { ${SHEET} }
.post.fresh { border-color: var(--accent); }
.post-band, .post.flip .post-band { align-items: center; padding: 17px 22px 12px; border-bottom: 1px solid var(--nk-edge); background: ${COLLAR} left top / 100% 5px no-repeat, var(--raised); }
.post-name { ${CAPS} letter-spacing: .14em; font-size: 17px; line-height: 1.3; color: var(--ink); }
${cartouche(".post-name")}
.post.flip .post-name { margin-right: 10px; }
.post-band .post-meta, .post-band .post-meta a { ${SMALL} font-size: 10.5px; color: var(--muted); }
.post-text { font: 400 18.5px/1.62 var(--font-reading); }
.post-text blockquote { border-left: 4px solid var(--nk-gold); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { ${HEAD} color: var(--accent); }
/* The GM's posts: an inscription. Gold and cream on lapis in both versions, under a sun disc. */
.post.post-gm, .post.post-gm.fresh { ${ON_LAPIS} --nk-fibre: rgba(255, 255, 255, .02); --nk-ring-gap: #16234a; border: 1px solid #e3b23c; background: ${PAPYRUS}, #16234a; color: #f2e6c8; box-shadow: inset 0 0 0 3px #16234a, inset 0 0 0 4px rgba(227, 178, 60, .55); }
.gm-band { margin: 4px 4px 0; border-bottom: 1px solid rgba(227, 178, 60, .55); background: none; }
.post.post-gm .post-name { width: fit-content; color: #f3d27a; }
.post.post-gm .post-meta, .post.post-gm .post-meta a { ${SMALL} font-size: 10.5px; color: #b9af8e; }
.post.post-gm .roll-stamp.hit, .post.post-gm .roll-stamp.nat { color: #84c891; }
.gm-seal { border: 0; border-radius: 50%; background: radial-gradient(circle closest-side, #f6cf5f 0 58%, #a8321f 62% 80%, #e3b23c 84% 100%); color: #3a2410; box-shadow: none; font: 400 13px var(--font-display); letter-spacing: .04em; }
.gm-body .post-text > p:first-child::first-letter { margin: 5px 3px 0 0; font: 400 56px/.86 var(--font-display); color: #e3b23c; }
/* A big portrait is framed in gold and lapis; with no picture it is a lapis ground with the initial in gold. */
.portrait.big { box-sizing: border-box; border: 4px solid #e3b23c; border-radius: 0; outline: 3px solid var(--nk-lapis); outline-offset: 0; box-shadow: inset 0 0 0 1px #8a6420; }
.portrait.big.portrait-empty { background: radial-gradient(circle at 50% 42%, #2a4f9c 0 34%, #16234a 78%); }
.portrait.big.portrait-empty span { ${HEAD} font-size: 104px; color: #f3d27a; text-shadow: 0 2px 0 rgba(0, 0, 0, .4); }
.post-side { padding: 3px; }
/* The character card that opens over a portrait: a sheet of papyrus in both versions, under a band of the collar,
   with the name in a cartouche. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 26px 18px 18px; border: 1px solid #b9985a; border-radius: 0;
  background: ${COLLAR} left top / 100% 7px no-repeat, #f6ead0; color: #2b1d0e; box-shadow: none; --nk-ring-gap: #f6ead0; --accent: #1d4f9c;
}
.mini-card > *, .mini-card dd { color: #2b1d0e; }
.mini-card :focus-visible { outline: 2px solid #1d4f9c; outline-offset: 2px; }
.mini-name { align-self: flex-start; font: 400 16px/1.3 var(--font-display); letter-spacing: .12em; text-transform: uppercase; color: #2b1d0e; overflow-wrap: anywhere; }
${cartouche(".mini-name")}
.mini-card:has(.card-rows) .mini-name { align-self: center; }
.mini-role { margin: 12px 0 12px; padding-bottom: 10px; border-bottom: 1px solid #c9ae74; ${SMALL} font-style: normal; font-size: 10.5px; color: #5c4a2e; }
.mini-quote { padding-left: 12px; border-left: 4px solid #e3b23c; font: italic 400 16.5px/1.45 var(--font-reading); color: #2b1d0e; opacity: 1; }
.mini-traits .chip { border-radius: 0; border-color: #c9ae74; background: transparent; color: #2b1d0e !important; }
.mini-fields dt { ${SMALL} font-size: 10px; color: #1d4f9c; }
.mini-fields dd { font: 400 16px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 8px 14px 7px; border: 1px solid #153a75; border-radius: 0; background: #1d4f9c; color: #fff4d6 !important; box-shadow: inset 0 0 0 2px #1d4f9c, inset 0 0 0 3px rgba(227, 178, 60, .85); ${SMALL} font-size: 11px; text-decoration: none; }
.mini-link:hover { background: #2a5fb0; }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${SMALL} font-size: 10.5px; line-height: 1.7; }
.mini-player b { color: var(--accent); }
.roll-card { border-radius: 0; }
.post-actions button { ${SMALL} font-size: 10.5px; }
.post-actions button:hover { color: var(--accent); }

/* Buttons and boxes to type in. */
.f-btn:not(.small) { font-size: 12.5px; }
.f-btn.small { font-size: 11px; }
.f-btn.ghost { ${LINE_BTN} color: var(--ink) !important; }
.f-btn.ghost:hover:not(:disabled) { ${LINE_ON} color: var(--accent) !important; }
.f-btn.ghost.on { border-color: var(--accent-2); color: var(--accent-2) !important; }
.f-btn.ghost.due { border-color: var(--accent); color: var(--accent) !important; }
.f-btn.ghost.danger:hover:not(:disabled) { border-color: var(--danger); color: var(--danger) !important; }
.f-btn:not(.ghost), .tools .tool-pop .f-btn:not(.ghost) { ${MAIN_BTN} color: var(--nk-btn-ink) !important; }
.f-btn:not(.ghost):hover:not(:disabled) { ${MAIN_ON} }
input:not([type="checkbox"]), select, textarea { border-radius: 0; caret-color: var(--accent); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }
.composer-kind, .as-label { ${SMALL} color: var(--accent); }

/* The foot of the forum. */
.board-foot { ${SHEET} background: ${COLLAR} left top / 100% 6px no-repeat, ${PAPYRUS}, var(--panel); }
.foot-cols h3, .foot-line h3 { ${CAPS} font-size: 15px; }
.foot-stats b { ${COUNT} font-size: 22px; color: var(--accent); }
.to-top { border-radius: 0; color: var(--accent); }

@container page (max-width: 900px) {
  .board-head-text { padding: 80px 70px ${SCENE_ROOM}; }
  .board-title { font-size: 40px; letter-spacing: .16em; }
}
@container page (max-width: 640px) {
  .board-head { --nk-s: .62; --nk-w: .78; border-top-width: 8px; border-bottom-width: 8px; }
  .board-head-text { padding: 66px 16px ${SCENE_ROOM}; }
  .board-head.has-art .board-head-text { padding: 66px 16px 40px; }
  .board-title { font-size: 29px; letter-spacing: .14em; }
  .board-tagline { margin-top: 8px; font-size: 17px; }
  .board-nav { gap: 0; }
  .board-nav a { padding: 11px 8px 10px; font-size: 11px; letter-spacing: .12em; }
  .category-title { font-size: 18px; letter-spacing: .12em; }
  .forum-name { font-size: 22px; }
  .topic-title { font-size: 20px; }
  .topic-name { font-size: 23px; }
  .location-name { font-size: 24px; }
  .post-name { font-size: 15px; letter-spacing: .1em; }
  .portrait.big { border-width: 3px; outline-width: 2px; }
  .portrait.big.portrait-empty span { font-size: 54px; }
  .forum-location > :nth-child(2) { padding-top: 14px; }
  .forum-location > :last-child { padding-bottom: 16px; }
  .location-art { border-right: 0; border-bottom: 1px solid var(--nk-edge); }
  .topic-row { padding: 16px 18px 14px; }
  .post-text { font-size: 17.5px; }
  .mini-card { box-sizing: border-box; }
  .mod-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .mod-tools .f-btn.small { justify-content: center; padding: 9px 4px; letter-spacing: .05em; white-space: nowrap; }
  .mod-tools .f-select { grid-column: 1 / -1; justify-content: space-between; }
  .mod-tools .f-select select { flex: 1; }
  .mod-tools .rename-form, .mod-tools .form-error { grid-column: 1 / -1; }
  /* The character card opens across the post, level with the portrait, rather than off its left edge. */
  .post-side { position: relative; }
  .mini-portrait { position: static; }
  .mini-card { inset: 0 0 auto 0; width: 100%; min-height: 212px; box-shadow: 0 8px 24px rgba(0, 0, 0, .35); }
  .preview-card .mini-card { inset: 0; width: auto; min-height: 0; box-shadow: none; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
