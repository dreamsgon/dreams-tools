/*
 * Four Houses: a fully custom skin, inspired by Hogwarts. A castle school of magic, drawn only with colours and
 * shapes: no crest, no names and no artwork from the books or films.
 * By night the banner is the castle on its crag under a full moon, its windows lit, candles floating in the dark
 * and four long pennants hanging at the sides, one for each house: scarlet and gold, green and silver, blue and
 * bronze, yellow and black. By day the same castle is an ink drawing on parchment and the candles are out.
 * The page behind everything is the castle's stone wall, and what you read is parchment pinned to it, each sheet
 * with a fine second line inside its edge. Headings carry a small shield in a house's two colours, one house after
 * another. Portraits hang in gilt frames, an unread topic has a lit candle flame, and the GM's posts arrive as
 * letters: parchment in both versions, green ink for the name and a red wax seal.
 * Like every skin, its stylesheets go through the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --fh-page: #d8d1c3; --fh-mortar: rgba(70, 58, 44, .2); --fh-rule: #c9b27c; --fh-lattice: rgba(122, 96, 48, .2);
  --fh-scarlet: #8f1d28; --fh-emerald: #1f6b45; --fh-blue: #1f4e8c; --fh-yellow: #e0b021;
  --fh-gold: #d9a521; --fh-silver: #c3c8cf; --fh-bronze: #b0763a; --fh-black: #1d1a16;
  --fh-house: var(--fh-scarlet); --fh-metal: var(--fh-gold);
  --fh-sky: linear-gradient(180deg, #f4e9cc 0%, #ecd9ae 70%, #e2c88f 100%);
  --fh-castle: #4b3429; --fh-window: #f4e9cc; --fh-orb: #fbf3d6; --fh-orb-ring: rgba(176, 140, 74, .3);
  --fh-star: transparent; --fh-candle: transparent; --fh-flame: transparent; --fh-flame-core: transparent; --fh-halo: transparent;
  --fh-title: #5e1622; --fh-title-shadow: 0 1px 0 rgba(255, 255, 255, .45); --fh-tagline: #3c2a25;
  --fh-btn: #7a1f2b; --fh-btn-on: #8c2835; --fh-btn-ink: #f6e7c4; --fh-btn-line: rgba(233, 196, 106, .7); --fh-btn-edge: #5a141d;
  --fh-flame-edge: #a85d12; --fh-s: 1; --fh-cx: 0px;
  --card-bg: #f6eeda; --card-ink: #2c1c1a; --card-head: #7a1f2b; --card-line: #c9b27c;
}
:root[data-theme="dark"] {
  --fh-page: #0d0e15; --fh-mortar: rgba(255, 255, 255, .05); --fh-rule: #5b4630; --fh-lattice: rgba(233, 196, 106, .1);
  --fh-sky: linear-gradient(180deg, #0a0f2c 0%, #18204d 58%, #40336a 100%);
  --fh-castle: #07060d; --fh-window: #ffcf6b; --fh-orb: #f4ecd2; --fh-orb-ring: rgba(244, 236, 210, .16);
  --fh-star: #ffffff; --fh-candle: #f1e3c0; --fh-flame: #f5a93a; --fh-flame-core: #fff3c2; --fh-halo: rgba(255, 190, 90, .26);
  --fh-title: #ecc76e; --fh-title-shadow: 0 2px 12px rgba(0, 0, 0, .7); --fh-tagline: #efe4d2;
  --fh-btn: #d4a93f; --fh-btn-on: #e2ba55; --fh-btn-ink: #1c1418; --fh-btn-line: rgba(28, 20, 24, .45); --fh-btn-edge: #8a6a20;
  --fh-flame-edge: transparent;
}`;

/** Splits a long list of layers into custom properties, so no single value passes the safety check's length limit. */
const inParts = (name: string, items: string[]) => {
  const parts: string[][] = [[]];
  for (const item of items) {
    const last = parts[parts.length - 1];
    if (last.length && [...last, item].join(", ").length > 1800) parts.push([item]); else last.push(item);
  }
  return {
    declare: parts.map((part, i) => `--${name}-${i + 1}: ${part.join(", ")};`).join(" "),
    use: parts.map((_, i) => `var(--${name}-${i + 1})`).join(", "),
    /** The same properties emptied, for widths where these layers would crowd the words. */
    off: parts.map((_, i) => `--${name}-${i + 1}: none;`).join(" "),
  };
};

/* The castle. Every piece is placed from the middle of the picture and multiplied by `--fh-s`, so the whole
   castle shrinks together on a phone or in a smaller cover; `--fh-cx` moves it sideways. */
const C = "var(--fh-castle)";
const flat = (c: string) => `linear-gradient(${c}, ${c})`;
const at = (image: string, dx: number, bottom: number, w: number, h: number) =>
  `${image} left calc(50% + var(--fh-cx) + ${dx + w / 2}px * var(--fh-s)) bottom calc(${bottom}px * var(--fh-s)) / calc(${w}px * var(--fh-s)) calc(${h}px * var(--fh-s)) no-repeat`;
/** Where the walls meet the crag. */
const BASE = 28;
/** Each tower or wall: where it starts from the middle, how wide, how tall, and how tall its pointed roof is (0 for a wall with battlements). */
const TOWERS: [number, number, number, number][] = [
  [-264, 30, 62, 26], [-236, 54, 40, 0], [-188, 30, 132, 42], [-160, 48, 68, 0], [-118, 26, 102, 32],
  [56, 32, 116, 36], [86, 56, 76, 0], [140, 28, 146, 44], [166, 46, 54, 0], [208, 32, 90, 30], [238, 28, 38, 0],
];
/** The great hall in the middle: a wide body under one steep roof, with a row of tall windows. */
const HALL = { x: -94, w: 154, h: 56, roof: 38 };
/** A pointed roof: a triangle a little wider than what it covers. */
const cone = (x: number, w: number, bottom: number, r: number) => {
  const rw = w + 10, a = +(Math.atan(rw / 2 / r) * 180 / Math.PI).toFixed(2);
  return at(`conic-gradient(from ${+(180 - a).toFixed(2)}deg at 50% 0, ${C} 0 ${+(2 * a).toFixed(2)}deg, transparent ${+(2 * a + .6).toFixed(2)}deg)`, x - 5, bottom, rw, r);
};
/** Battlements along the top of a wall, as a share of its width so they shrink with it. */
const battlements = (x: number, w: number, bottom: number) => {
  const step = +(100 / Math.round(w / 9)).toFixed(2);
  return at(`repeating-linear-gradient(90deg, ${C} 0 ${+(step * .56).toFixed(2)}%, transparent ${+(step * .56).toFixed(2)}% ${step}%)`, x, bottom, w, 5);
};
const lit = (x: number, bottom: number, w = 4, h = 9) => at(flat("var(--fh-window)"), x, bottom, w, h);
const CASTLE = [
  /* Lit windows: a few up each tower, a pair in each wall, and the hall's tall row. */
  ...TOWERS.flatMap(([x, w, h, roof], i) => roof
    ? [.3, .56, .8].filter((_, k) => (i + k) % 3 !== 0).map((f) => lit(x + w / 2 - 2, BASE + Math.round(h * f)))
    : [lit(x + Math.round(w * .26), BASE + Math.round(h * .5), 4, 7), lit(x + Math.round(w * .66), BASE + Math.round(h * .5), 4, 7)]),
  ...Array.from({ length: 7 }, (_, i) => lit(HALL.x + 14 + i * 20, BASE + 14, 6, 26)),
  /* The stone. */
  ...TOWERS.map(([x, w, h]) => at(flat(C), x, BASE, w, h)),
  ...TOWERS.map(([x, w, h, roof]) => roof ? cone(x, w, BASE + h - 1, roof) : battlements(x, w, BASE + h - 1)),
  at(flat(C), HALL.x, BASE, HALL.w, HALL.h), cone(HALL.x, HALL.w, BASE + HALL.h - 1, HALL.roof),
  at(flat(C), -22, BASE + HALL.h, 8, 34), cone(-22, 8, BASE + HALL.h + 33, 18),
  /* The crag it stands on and the shore, with the moon (or the sun) behind the right-hand towers. */
  at(`radial-gradient(ellipse 50% 100% at 50% 100%, ${C} 0 99%, transparent 100%)`, -320, 0, 640, 60),
  `${flat(C)} left 0 bottom 0 / 100% calc(8px * var(--fh-s)) no-repeat`,
  at("radial-gradient(circle closest-side, var(--fh-orb) 0 80%, var(--fh-orb-ring) 81% 98%, transparent 100%)", 92, 84, 124, 124),
];
/** How high the castle reaches, for the room the words leave under themselves. */
const CASTLE_ROOM = "calc(214px * var(--fh-s) + 14px)";

/** A star: how far from the middle, how far down, how big. Kept clear of the middle, where the words are. */
const STARS: [number, number, number][] = [
  [-560, 34, 3], [-505, 118, 2], [-452, 62, 2], [-418, 176, 3], [-372, 28, 2], [-345, 232, 2], [-548, 208, 2], [-478, 262, 2],
  [352, 44, 2], [398, 196, 2], [436, 92, 3], [470, 248, 2], [512, 30, 2], [548, 150, 3], [556, 84, 2], [530, 236, 2],
];
const star = ([dx, top, size]: [number, number, number]) => `radial-gradient(circle closest-side, var(--fh-star) 0 55%, transparent 100%) left calc(50% + ${dx}px) top ${top}px / ${size}px ${size}px no-repeat`;
/** A floating candle: its soft light, its flame and the candle itself. */
const CANDLES: [number, number][] = [[-440, 58], [-372, 128], [-428, 204], [-356, 262], [366, 70], [432, 136], [374, 214], [444, 268]];
const candle = ([dx, top]: [number, number]) => [
  `radial-gradient(circle closest-side, var(--fh-halo), transparent) left calc(50% + ${dx}px) top ${top - 19}px / 38px 38px no-repeat`,
  `radial-gradient(ellipse closest-side, var(--fh-flame-core) 0 34%, var(--fh-flame) 36% 94%, transparent 100%) left calc(50% + ${dx}px) top ${top - 6}px / 6px 11px no-repeat`,
  `${flat("var(--fh-candle)")} left calc(50% + ${dx}px) top ${top + 6}px / 5px 20px no-repeat`,
];
/**
 * A house's pennant, hung from the top edge: a long strip in the house's colour with a forked tail, a line of its
 * metal down each side and a round boss. Two hang at each side; `--fh-fx`, `--fh-fw`, `--fh-fh` and `--fh-ft`
 * say how far in, how wide, how long and how deep the fork, so a phone can hang smaller ones.
 */
const pennant = (side: "left" | "right", slot: 0 | 1, house: string, metal: string) => {
  const x = slot ? "calc(var(--fh-fx) + var(--fh-fw) + var(--fh-fg))" : "var(--fh-fx)";
  const body = "calc(var(--fh-fh) - var(--fh-ft))", half = "calc(var(--fh-fw) / 2)", far = `calc(${x} + var(--fh-fw) / 2)`;
  const [near, away] = side === "left" ? ["to bottom right", "to bottom left"] : ["to bottom left", "to bottom right"];
  return [
    `radial-gradient(circle closest-side, ${metal} 0 92%, transparent 100%) ${side} calc(${x} + var(--fh-fw) * .3) top calc(var(--fh-fh) * .34) / calc(var(--fh-fw) * .4) calc(var(--fh-fw) * .4) no-repeat`,
    `linear-gradient(90deg, ${metal} 0 2px, transparent 2px calc(100% - 2px), ${metal} calc(100% - 2px)) ${side} ${x} top 0 / var(--fh-fw) ${body} no-repeat`,
    `${flat(house)} ${side} ${x} top 0 / var(--fh-fw) ${body} no-repeat`,
    `linear-gradient(${near}, ${house} 50%, transparent 51%) ${side} ${x} top calc(${body} - 1px) / ${half} var(--fh-ft) no-repeat`,
    `linear-gradient(${away}, ${house} 50%, transparent 51%) ${side} ${far} top calc(${body} - 1px) / ${half} var(--fh-ft) no-repeat`,
  ];
};
const FLAGS = inParts("fh-flags", [
  ...pennant("left", 0, "var(--fh-scarlet)", "var(--fh-gold)"), ...pennant("left", 1, "var(--fh-emerald)", "var(--fh-silver)"),
  ...pennant("right", 1, "var(--fh-blue)", "var(--fh-bronze)"), ...pennant("right", 0, "var(--fh-yellow)", "var(--fh-black)"),
]);
const LIGHTS = inParts("fh-lights", [...CANDLES.flatMap(candle), ...STARS.map(star)]);
const SCENE = (name: string) => inParts(name, [...CASTLE, "var(--fh-sky)"]);

/* Shared pieces of the look. */
/** The stone wall behind the page: courses of blocks, each course set half a block along from the last. */
const STONE = [
  "linear-gradient(var(--fh-mortar) 1px, transparent 1px) 0 0 / 100% 54px",
  "conic-gradient(from 270deg at 1px 54px, var(--fh-mortar) 0 90deg, transparent 0) 0 0 / 132px 108px",
  "conic-gradient(from 270deg at 1px 54px, var(--fh-mortar) 0 90deg, transparent 0) 66px 54px / 132px 108px",
].join(", ");
/** A sheet of parchment: an edge, and a fine second line just inside it. `--fh-fill` is what changes under the pointer. */
const SHEET = "border: 1px solid var(--line); border-radius: 2px; background: var(--fh-fill, var(--panel)); box-shadow: inset 0 0 0 3px var(--fh-fill, var(--panel)), inset 0 0 0 4px var(--fh-rule);";
const SHEET_ON = "--fh-fill: var(--raised);";
/** Display lettering (IM Fell English) and small labels (Spectral, spaced capitals). */
const HEAD = "font-family: var(--font-display); font-weight: 400; letter-spacing: .01em; text-transform: none;";
const SMALL = "font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .1em;";
/** Buttons: the main ones are the school's colour with a fine metal line inside the edge; the others are parchment. */
const MAIN_BTN = `border: 1px solid var(--fh-btn-edge); border-radius: 2px; background: var(--fh-btn); color: var(--fh-btn-ink); box-shadow: inset 0 0 0 2px var(--fh-btn), inset 0 0 0 3px var(--fh-btn-line); ${SMALL}`;
const MAIN_ON = "background: var(--fh-btn-on); color: var(--fh-btn-ink); box-shadow: inset 0 0 0 2px var(--fh-btn-on), inset 0 0 0 3px var(--fh-btn-line);";
const LINE_BTN = `border: 1px solid var(--line-strong); border-radius: 2px; background: var(--panel); color: var(--ink); box-shadow: none; ${SMALL}`;
const LINE_ON = "border-color: var(--accent); background: var(--panel); color: var(--accent);";
/** A heading: a small shield in a house's two colours, the words, and a line in the same two colours under them. */
const headed = (h: string, size: number) => `${h} {
  display: flex; align-items: center; gap: 11px; padding-bottom: 10px; ${HEAD} font-size: ${size}px; line-height: 1.15; color: var(--ink);
  background: linear-gradient(var(--fh-house), var(--fh-house)) left bottom / 100% 3px no-repeat, linear-gradient(var(--fh-metal), var(--fh-metal)) left bottom 4px / 100% 1px no-repeat;
}
${h}::before { content: ""; flex: none; width: 17px; height: 21px; background: linear-gradient(90deg, var(--fh-house) 50%, var(--fh-metal) 50%); clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%); }`;
/** One house after another. */
const houses = (item: string) => `${item}:nth-of-type(4n + 2) { --fh-house: var(--fh-emerald); --fh-metal: var(--fh-silver); }
${item}:nth-of-type(4n + 3) { --fh-house: var(--fh-blue); --fh-metal: var(--fh-bronze); }
${item}:nth-of-type(4n) { --fh-house: var(--fh-yellow); --fh-metal: var(--fh-black); }`;
/** The four houses' colours in a row, each over a fine line of its metal. */
const RIBBON = "background: linear-gradient(90deg, var(--fh-gold) 0 25%, var(--fh-silver) 25% 50%, var(--fh-bronze) 50% 75%, var(--fh-black) 75%) left bottom / 100% 2px no-repeat, linear-gradient(90deg, var(--fh-scarlet) 0 25%, var(--fh-emerald) 25% 50%, var(--fh-blue) 50% 75%, var(--fh-yellow) 75%);";
/** Small square portraits: a dark ground in a thin gilt edge. */
const MEDAL = "border-radius: 2px; border: 2px solid #a67c2e; background: #2a1c22; color: #ecc76e; font-family: var(--font-display); font-weight: 400;";
/** Where a picture is missing: a lattice, as on a book's endpaper. */
const LATTICE = "repeating-linear-gradient(45deg, var(--fh-lattice) 0 1px, transparent 1px 13px), repeating-linear-gradient(-45deg, var(--fh-lattice) 0 1px, transparent 1px 13px), var(--raised)";

/** The cover for the other parts: the castle at the foot, the host's own words above it. */
function cover(host: string, name: string) {
  const back = SCENE(name);
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 1px solid var(--line); border-radius: 2px; box-shadow: none; --fh-s: .6; --fh-cx: 150px;
  ${back.declare}
  background: ${back.use};
}
${host} > * { position: relative; z-index: 2; }`;
}
const COVER_ROOM = "calc(214px * var(--fh-s) + 20px)";
const COVER_TITLE = `${HEAD} line-height: 1.08; color: var(--fh-title); text-shadow: var(--fh-title-shadow); overflow-wrap: break-word;`;
const COVER_LABEL = `${SMALL} font-size: 11.5px; color: var(--fh-tagline);`;

/* The Encyclopedia: the school's library. */
const ENCYCLOPEDIA = `/* Four Houses for the Encyclopedia. The colours and fonts come from the theme. */
${VARS}
body { scrollbar-color: var(--fh-rule) var(--panel); }
::selection { background: var(--accent); color: var(--on-accent); }

/* The side. */
.csw-name b { ${HEAD} font-size: 19px; }
.tree-row { border-radius: 2px; }
.tree-row.selected { box-shadow: inset 3px 0 0 var(--accent); }
.side-heading .section-toggle { ${SMALL} font-size: 11.5px; color: var(--muted); }
.shared-tag { border-radius: 2px; ${SMALL} font-size: 9.5px; }

/* The bar along the top. */
.search-box { border-radius: 2px; }
.search-box:focus-within { border-color: var(--accent); }

/* Buttons and boxes to type in. */
.button { ${LINE_BTN} font-size: 12px; }
.button:hover { ${LINE_ON} }
.button.primary { ${MAIN_BTN} font-size: 12px; }
.button.primary:hover { ${MAIN_ON} }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 2px; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }

/* The campaign's overview: the castle. */
${cover(".dashboard-intro", "fh-enc")}
.dashboard-intro { min-height: 250px; align-items: flex-start; margin-bottom: 30px; padding: 30px 32px ${COVER_ROOM}; }
.dashboard-intro > div { min-width: 0; }
.dashboard-intro .eyebrow { ${COVER_LABEL} }
.dashboard-intro h1 { margin: 8px 0 10px; font-size: 48px; ${COVER_TITLE} }
.dashboard-intro .subtitle { max-width: 44ch; font: italic 400 18px/1.45 var(--font-reading); color: var(--fh-tagline); text-shadow: var(--fh-title-shadow); }
.dashboard-intro .icon-button { border: 1px solid var(--fh-rule); border-radius: 2px; background: var(--panel); color: var(--ink); }
.overview-strip strong { ${HEAD} font-size: 26px; color: var(--accent); }

/* Headings: a shield and a line in a house's colours. */
.section-heading { align-items: flex-end; }
${headed(".section-heading h2", 25)}
.section-heading h2 { flex: 1; }
.eyebrow { ${SMALL} font-size: 11px; }

/* Cards: sheets of parchment. */
.note-card { ${SHEET} --fh-fill: var(--raised); padding: 20px 20px 18px; transition: none; }
.note-card:hover { --fh-fill: color-mix(in srgb, var(--accent) 6%, var(--raised)); border-color: var(--fh-rule); transform: none; box-shadow: inset 0 0 0 3px var(--fh-fill), inset 0 0 0 4px var(--fh-rule); }
.note-card h3 { ${HEAD} font-size: 25px; line-height: 1.15; }
.note-card:hover h3 { color: var(--accent); }
.note-card.add-card { border: 1px dashed var(--line-strong); background: transparent; box-shadow: none; }

/* A page. */
.kind-pill { padding: 2px 9px; border-radius: 2px; ${SMALL} font-size: 10.5px; }
.article-title h1 { ${HEAD} }
.article-tabs button { ${SMALL} font-size: 11.5px; }
.picture-panel { border-radius: 2px; border: 1px solid var(--fh-rule); }
.prose { font-family: var(--font-reading); font-size: 18px; }
.prose h1, .prose h2, .prose h3 { ${HEAD} color: var(--accent); }
.prose blockquote { border-left: 3px solid var(--fh-rule); font-style: italic; }
.article-aside .eyebrow { color: var(--accent); }

@media (max-width: 640px) {
  .dashboard-intro { min-height: 0; padding: 22px 18px ${COVER_ROOM}; --fh-cx: 0px; }
  .dashboard-intro h1 { font-size: 36px; }
  .dashboard-intro .subtitle { font-size: 16.5px; }
  .section-heading h2 { font-size: 22px; }
}
`;

/* Maptable: parchment round the table, and the castle over the Scene Picker. */
const MAPTABLE = `/* Four Houses for Maptable. The map you play on keeps its own colours. */
${VARS}
body { scrollbar-color: var(--fh-rule) var(--panel); }
::selection { background: var(--accent); color: var(--on-accent); }

/* The bar along the top. */
.header-scene strong { ${HEAD} font-size: 19px; color: var(--accent); }
.csw-name b { ${HEAD} font-size: 19px; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${MAIN_BTN} font-size: 12px; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { ${MAIN_ON} }
.icon-button:hover { color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 2px; caret-color: var(--accent); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }
input[type="range"] { accent-color: var(--accent); }

/* The tool rail and the side panel. */
.rail button { border-radius: 2px; }
.rail button:hover { color: var(--accent); }
.panel-title h2 { ${HEAD} font-size: 24px; }
.organizer-scene { border-radius: 2px; white-space: normal; }
.organizer-scene.active { box-shadow: inset 3px 0 0 var(--accent); }
.organizer-scene.active strong { color: var(--accent); }
.organizer-scene strong { font: 600 15.5px/1.25 var(--font-reading); }

/* Around the map. */
.map-title, .board-info { ${SMALL} font-size: 11px; color: var(--muted); }
.toolbar { border-radius: 2px; border: 1px solid var(--fh-rule); }
.toolbar button { border-radius: 2px; ${SMALL} font-size: 11px; }
.toolbar button:hover { color: var(--accent); }

/* The Scene Picker: the castle. */
${cover(".campaign-scenes-head", "fh-map")}
.campaign-scenes-head { min-height: 240px; align-items: flex-start; padding: 28px 30px ${COVER_ROOM}; }
.campaign-scenes-head > div { flex: 1; min-width: 0; }
.campaign-scenes-head > button { flex: none; }
.campaign-scenes-head small { ${COVER_LABEL} }
.campaign-scenes-head h1 { margin-top: 8px; font-size: 46px; ${COVER_TITLE} }
.dashboard-continue { ${SHEET} padding: 18px 24px; }
.dashboard-continue:hover { ${SHEET} ${SHEET_ON} padding: 18px 24px; }
.dashboard-continue small { ${SMALL} font-size: 11px; color: var(--accent); }
.dashboard-continue strong { ${HEAD} font-size: 28px; }
.campaign-scenes-kinds button { border-radius: 2px; ${SMALL} font-size: 11px; }
.campaign-scenes-group h2 { margin-bottom: 14px; }
${headed(".campaign-scenes-group h2", 24)}
${houses(".campaign-scenes-group")}
.campaign-scenes-group h2 span { ${SMALL} font-size: 10.5px; color: var(--muted); }
.campaign-scene-card { border: 1px solid var(--line); border-radius: 2px; box-shadow: none; overflow: hidden; }
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { border-color: var(--fh-rule); background: var(--raised); }
.campaign-scene-card.last { border-color: var(--accent); }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--accent); }
.campaign-scene-card strong { font: 600 15.5px/1.25 var(--font-reading); }
.campaign-scene-card em { ${SMALL} font-style: normal; font-size: 10.5px; color: var(--accent); }

@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 0; flex-wrap: wrap; padding: 20px 18px ${COVER_ROOM}; --fh-cx: 0px; }
  .campaign-scenes-head > div { flex: 1 1 100%; }
  .campaign-scenes-head h1 { font-size: 34px; }
  .dashboard-continue strong { font-size: 23px; overflow-wrap: anywhere; }
  .campaign-scenes-group h2 { font-size: 21px; }
}
`;

/* The campaign's dashboard: the castle behind its name, and sheets of parchment on the stone. */
const DASHBOARD = `/* Four Houses for the campaign's dashboard. */
${VARS}
body { background: ${STONE}, var(--fh-page); }
::selection { background: var(--accent); color: var(--on-accent); }
.hub-crumbs { ${SMALL} font-size: 11.5px; }
.hub-crumbs a { color: var(--accent); }

/* The top: the castle. Not clipped, so the tag menu can open past its foot. */
${cover(".hub-head", "fh-hub")}
.hub-head { min-height: 250px; padding: 28px 30px ${COVER_ROOM}; overflow: visible; z-index: 3; }
.hub-title p { ${COVER_LABEL} }
.hub-title h1 { margin-top: 8px; font-size: 48px; ${COVER_TITLE} }
.hub-chip { border-radius: 2px; border-color: var(--fh-rule); background: var(--panel); color: var(--muted); ${SMALL} font-size: 10.5px; }
.hub-chip.on { border-color: var(--accent); color: var(--accent); }
.hub-head .tag-add { border-radius: 2px; background: var(--panel); }

/* Buttons. */
.hub-button { ${LINE_BTN} font-size: 12px; }
.hub-button:not(.hub-button-primary):hover, .hub-button:not(.hub-button-primary):hover:not(:disabled) { ${LINE_ON} }
.hub-button-primary, a.hub-button-primary { ${MAIN_BTN} font-size: 12px; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { ${MAIN_ON} }
.hub-button.mem-ban-button { border-color: var(--danger); background: var(--danger); color: #ffffff; }
.hub-button.mem-ban-button:hover:not(:disabled) { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 85%, #000000); color: #ffffff; }

/* Dashboard, Front page and Members. */
.hub-tabs button, .hub-tabs a { ${SMALL} font-size: 12px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--accent); }

/* Cards. */
.hub-card { ${SHEET} }
.hub-card-head h2 { flex: 1; ${HEAD} font-size: 25px; }
.hub-card-head a, .hub-card-head .hub-text-button { ${SMALL} font-size: 11px; }
.hub-scene-grid li { border-radius: 2px; }

@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 20px 18px ${COVER_ROOM}; --fh-cx: 0px; }
  .hub-title h1 { font-size: 36px; }
  .hub-tabs button, .hub-tabs a { font-size: 11px; letter-spacing: .06em; }
}
`;

const BANNER = SCENE("fh-castle");
/** The colours a letter keeps in both versions: ink on parchment. */
const ON_PAPER = "--ink: #2c1c1a; --muted: #6a5547; --accent: #7a1f2b; --accent-2: #1f5a3d; --line: #cbb88e; --line-strong: #a8925f; --bg: #ebdfc6; --panel: #f6eeda; --raised: #efe4cb; --accent-soft: #ecd9cc; --danger: #a33a2e; --on-accent: #fff6e0; --fh-rule: #c9b27c;";

export const FOUR_HOUSES: Theme = {
  id: "preset-four-houses", name: "Four Houses", mode: "both", radius: 2, banner: "picture", fonts: { display: "fell", reading: "spectral", ui: "spectral" },
  colors: {
    light: { bg: "#ebdfc6", panel: "#f6eeda", raised: "#efe4cb", line: "#cbb88e", ink: "#2c1c1a", muted: "#6a5547", accent: "#7a1f2b", accent2: "#1f5a3d" },
    dark: { bg: "#120d10", panel: "#1c1418", raised: "#251a1f", line: "#44303a", ink: "#efe4d2", muted: "#b3a391", accent: "#d4a93f", accent2: "#d9706a" },
  },
  css: `/* Four Houses: a castle school of magic. The banner is the castle under the moon, with floating candles and a pennant for each of the four houses; by day it is an ink drawing on parchment.
   The page is the castle's stone wall and what you read is parchment pinned to it. Headings carry a house's shield, portraits hang in gilt frames, and the GM writes letters sealed with wax.
   Everything a version changes is a variable in the first two rules. */

${VARS}

body { background: ${STONE}, var(--fh-page); scrollbar-color: var(--fh-rule) var(--fh-page); }
::selection { background: var(--accent); color: var(--on-accent); }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border-radius: 2px 2px 0 0; }
.board-date { ${SMALL} font-size: 11px; }
.board-date b { color: var(--accent); }
.circ { ${MEDAL} font-size: 15px; }
.you b { ${HEAD} font-size: 20px; color: var(--accent); }
.search-box { border-radius: 2px; }
.search-box:focus-within { border-color: var(--accent); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the castle on its crag, the moon behind it, candles in the air and the houses' pennants at the sides. */
.board-head { min-height: 0; border: 1px solid var(--line); border-radius: 0 0 2px 2px; text-align: center; --fh-fx: 30px; --fh-fw: 40px; --fh-fh: 158px; --fh-ft: 22px; --fh-fg: 12px; }
.board-head:not(.has-art) { background: var(--fh-castle); --head-ink: #f0e2c0; --head-title: var(--fh-title); --head-shadow: var(--fh-title-shadow); --head-nav: transparent; --head-line: transparent; }
.board-head:not(.has-art) .board-head-text {
  ${FLAGS.declare}
  ${LIGHTS.declare}
  ${BANNER.declare}
  background: ${FLAGS.use}, ${LIGHTS.use}, ${BANNER.use};
}
.board-head-text { padding: 56px 150px ${CASTLE_ROOM}; }
.board-title { max-width: 640px; margin-inline: auto; font: 400 62px/1.08 var(--font-display); letter-spacing: .02em; text-transform: none; overflow-wrap: break-word; }
.board-title a { color: var(--fh-title); text-shadow: var(--fh-title-shadow); }
.board-tagline { max-width: 29em; margin: 12px auto 0; font: italic 400 21px/1.4 var(--font-display); color: var(--fh-tagline); text-shadow: var(--fh-title-shadow); }
/* The links stand on the shore; under them, the four houses in a row. */
.board-nav { gap: 4px; border-top: 0; background: var(--fh-castle); }
.board-nav a { padding: 12px 16px 11px; color: #f0e2c0; ${SMALL} font-size: 12px; letter-spacing: .16em; }
.board-nav a:hover { color: #ecc76e; border-bottom-color: #ecc76e; }
.board-nav a:focus-visible { outline: 2px solid #ecc76e; outline-offset: -4px; }
.board-head::after { content: ""; display: block; height: 8px; ${RIBBON} }
/* With a banner picture: the picture under a dark wash, the title in gold. */
.board-head.has-art { background: linear-gradient(180deg, rgba(10, 8, 20, .3), rgba(10, 8, 20, .68)), var(--banner) var(--banner-x, 50%) var(--banner-y, 50%) / var(--banner-size, cover) no-repeat; --fh-title: #f0cf7a; --fh-tagline: #f4ecd8; --fh-title-shadow: 0 2px 12px rgba(0, 0, 0, .75); --head-nav: transparent; --head-line: transparent; }
.board-head.has-art .board-head-text { padding: 80px 40px 60px; }
.board-head.has-art .board-nav { background: rgba(7, 6, 13, .72); }

/* Headings: one house after another. */
${houses(".category")}
.category-title { margin-bottom: 16px; }
.topics-head .category-title, .reply-head .category-title { margin-bottom: 0; }
.category-title .tag { background: var(--panel); }
${headed(".category-title", 28)}
.tag { border-radius: 2px; text-shadow: none; }
.tag:where(:not(.topic-tag)) { ${SMALL} font-size: 10px; }
/* Plain tags only: the ones that mean something (private, reported, a fight, a turn) keep their own colours. */
.tag:where(:not(.topic-tag, .private, .reported, .fight, .turn-meta, .ai-mark, .ai-kind, .new)) { border-color: var(--fh-rule); color: var(--muted); }
.tag.new { border-color: var(--fh-scarlet); background: var(--fh-scarlet); color: #f6e7c4; }

/* Boards and topics: sheets of parchment. Under the pointer the sheet darkens a little. */
.category-forums, .topics { gap: 12px; }
.forum, .topic-row { ${SHEET} }
.topic-row { padding: 15px 22px; }
.forum:hover, .topic-row:hover { ${SHEET_ON} }
.topic-row.pinned { border-left: 3px solid var(--accent); }
.topic-row.picked, .topic-row.picked:hover { --fh-fill: var(--accent-soft); background: var(--fh-fill); }
.forum-name { ${HEAD} font-size: 27px; line-height: 1.15; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum-name a:hover, .topic-title a:hover, .forum:hover .forum-name a, .topic-row:hover .topic-title a { color: var(--accent); }
.forum-desc { font: italic 400 17px/1.45 var(--font-reading); }
.forum-place { ${SMALL} font-size: 10.5px; }
.forum-counts b { ${HEAD} font-size: 25px; color: var(--accent); }
.last-label { ${SMALL} font-size: 10px; color: var(--accent); }
.forum-last a, .foot-list a { color: var(--ink); font: 600 16px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent); }
.topic-title { ${HEAD} font-size: 23px; line-height: 1.2; }
.topic-count b { ${HEAD} font-size: 23px; color: var(--accent); }
/* Unread: a lit candle flame. */
.unread-dot { width: 9px; height: 9px; border: 1px solid var(--fh-flame-edge); border-radius: 0 50% 50% 50%; background: radial-gradient(circle at 62% 62%, #fff3c2 0 22%, #f5a93a 70%); box-shadow: none; transform: rotate(45deg); }
.portrait.small, .portrait.tiny { ${MEDAL} }
/* A location's picture sits inside the sheet's second line; with no picture it is a lattice. */
.forum-art { margin: 4px 0 4px 4px; border-right: 1px solid var(--fh-rule); border-radius: 0; }
.forum-art:not([style]) { background: ${LATTICE}; }

/* A location's own page. */
.location { ${SHEET} overflow: hidden; }
.location-art { width: auto !important; height: auto !important; margin: 4px 0 4px 4px; border-right: 1px solid var(--fh-rule); }
.location-art.portrait-empty { background: ${LATTICE}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${SMALL} font-size: 11px; color: var(--accent); }
.location-name { ${HEAD} font-size: 44px; line-height: 1.08; }
.location-summary { font: italic 400 18px/1.5 var(--font-reading); }

/* Topic pages. */
.crumbs { ${SMALL} font-size: 11px; }
.topic-head { ${SHEET} }
.topic-name { ${HEAD} font-size: 42px; line-height: 1.08; }
.cast-chip, .today-chip { border-radius: 2px; }
.mod-tools { gap: 10px; margin-top: 14px; padding-top: 14px; }
.mod-tools .f-btn.small { padding: 6px 12px; }

/* Posts: a sheet each, the name on a band along the top under a line of the school's colour. */
.posts { gap: 20px; }
.post { ${SHEET} }
.post.fresh { border-color: var(--accent); }
.post-band, .post.flip .post-band { margin: 4px 4px 0; padding: 12px 20px 10px; border-bottom: 1px solid var(--fh-rule); background: linear-gradient(var(--accent), var(--accent)) left top / 100% 3px no-repeat, var(--raised); }
.post-name { ${HEAD} font-size: 28px; line-height: 1.1; color: var(--ink); }
.post-band .post-meta, .post-band .post-meta a { ${SMALL} font-size: 10.5px; color: var(--muted); }
.post-text { font: 400 18.5px/1.62 var(--font-reading); }
.post-text blockquote { border-left: 3px solid var(--fh-rule); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { ${HEAD} color: var(--accent); }
/* The GM's posts: a letter. Parchment in both versions, the name in green ink, and a red wax seal. */
.post.post-gm, .post.post-gm.fresh { ${ON_PAPER} ${SHEET} color: #2c1c1a; }
.post.post-gm .roll-stamp.hit, .post.post-gm .roll-stamp.nat { color: #2a6a38; }
.gm-band { margin: 4px 4px 0; border-bottom: 1px solid #c9b27c; background: none; }
.post.post-gm .post-name { color: #1f5a3d; }
.post.post-gm .post-meta, .post.post-gm .post-meta a { ${SMALL} font-size: 10.5px; color: #6a5547; }
.gm-seal { border: 0; border-radius: 50%; background: radial-gradient(circle at 36% 30%, #b8384a, #8f1d28 55%, #5e121c); color: #f3d9a0; box-shadow: inset 0 0 0 3px rgba(94, 18, 28, .55), inset 0 0 0 4px rgba(243, 217, 160, .35); font: 400 16px var(--font-display); }
.gm-body .post-text > p:first-child::first-letter { margin: 5px 5px 0 0; font: 400 58px/.86 var(--font-display); color: #1f5a3d; }
/* A big portrait hangs in a gilt frame; with no picture it is a dark canvas with the initial in gold. */
.portrait.big { box-sizing: border-box; border: 7px solid #a67c2e; border-image: linear-gradient(135deg, #ecd692, #a67c2e 28%, #f3dc9a 50%, #8a6420 74%, #d9b560) 1; border-radius: 0; box-shadow: inset 0 0 0 1px rgba(40, 26, 10, .7); outline: 1px solid #5d4416; }
.portrait.big.portrait-empty { background: radial-gradient(ellipse at 50% 34%, #4d3644, #1e141b 80%); }
.portrait.big.portrait-empty span { ${HEAD} font-size: 112px; color: #ecc76e; text-shadow: 0 2px 0 rgba(0, 0, 0, .45); }
/* The character card that opens over a portrait: a school record on parchment, in both versions. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; padding: 22px 20px 18px; border: 1px solid #a8925f; border-radius: 0;
  background: #f6eeda; color: #2c1c1a; box-shadow: inset 0 0 0 4px #f6eeda, inset 0 0 0 5px #c9b27c;
}
.mini-card > *, .mini-card dd { color: #2c1c1a; }
.mini-card :focus-visible { outline: 2px solid #1f5a3d; outline-offset: 2px; }
.mini-name { font: 400 29px/1.1 var(--font-display); letter-spacing: .01em; text-transform: none; color: #7a1f2b; overflow-wrap: anywhere; }
.mini-role { margin: 4px 0 12px; padding-bottom: 10px; border-bottom: 1px solid #c9b27c; ${SMALL} font-style: normal; font-size: 10.5px; color: #6a5547; }
.mini-quote { padding-left: 12px; border-left: 3px solid #c9b27c; font: italic 400 16.5px/1.45 var(--font-reading); color: #2c1c1a; opacity: 1; }
.mini-traits .chip { border-radius: 2px; border-color: #c9b27c; background: transparent; color: #2c1c1a !important; }
.mini-fields dt { ${SMALL} font-size: 10px; color: #7a1f2b; }
.mini-fields dd { font: 400 16px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: flex-start; margin-top: auto; padding: 7px 14px; border: 1px solid #5a141d; border-radius: 2px; background: #7a1f2b; color: #f6e7c4 !important; box-shadow: inset 0 0 0 2px #7a1f2b, inset 0 0 0 3px rgba(233, 196, 106, .7); ${SMALL} font-size: 11px; text-decoration: none; }
.mini-link:hover { background: #8c2835; }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${SMALL} font-size: 10.5px; line-height: 1.7; }
.mini-player b { color: var(--accent); }
.roll-card { border-radius: 2px; }
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
.f-btn:not(.ghost), .tools .tool-pop .f-btn:not(.ghost) { ${MAIN_BTN} color: var(--fh-btn-ink) !important; }
.f-btn:not(.ghost):hover:not(:disabled) { ${MAIN_ON} }
input:not([type="checkbox"]), select, textarea { border-radius: 2px; caret-color: var(--accent); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: none; }
.composer-kind, .as-label { ${SMALL} color: var(--accent); }

/* The foot of the forum. */
.board-foot { ${SHEET} }
.foot-cols h3, .foot-line h3 { ${HEAD} font-size: 23px; }
.foot-stats b { ${HEAD} font-size: 23px; color: var(--accent); }
.to-top { border-radius: 2px; color: var(--accent); }

@container page (max-width: 1120px) {
  /* Too narrow for the candles and stars between the title and the pennants. */
  .board-head:not(.has-art) .board-head-text { ${LIGHTS.off} }
}
@container page (max-width: 900px) {
  .board-head { --fh-fx: 18px; --fh-fw: 30px; --fh-fh: 124px; --fh-ft: 17px; --fh-fg: 9px; }
  .board-head-text { padding: 50px 104px ${CASTLE_ROOM}; }
  .board-title { font-size: 50px; }
}
@container page (max-width: 640px) {
  /* On a phone the pennants are short and hang in the top corners, the title under them. */
  .board-head { --fh-s: .62; --fh-fx: 10px; --fh-fw: 20px; --fh-fh: 60px; --fh-ft: 12px; --fh-fg: 6px; }
  .board-head-text { padding: 76px 16px ${CASTLE_ROOM}; }
  .board-head.has-art .board-head-text { padding: 54px 16px 40px; }
  .board-title { font-size: 38px; }
  .board-tagline { margin-top: 8px; font-size: 17.5px; }
  .board-nav { gap: 0; }
  .board-nav a { padding: 11px 9px 10px; font-size: 11px; letter-spacing: .12em; }
  .category-title { font-size: 24px; }
  .forum-name { font-size: 24px; }
  .topic-title { font-size: 21px; }
  .topic-name { font-size: 31px; }
  .location-name { font-size: 32px; }
  .post-name { font-size: 24px; }
  .portrait.big { border-width: 5px; }
  .portrait.big.portrait-empty span { font-size: 58px; }
  .forum-location > :nth-child(2) { padding-top: 14px; }
  .forum-location > :last-child { padding-bottom: 16px; }
  .location-art { height: 140px !important; margin: 4px 4px 0; border-right: 0; border-bottom: 1px solid var(--fh-rule); }
  .topic-row { padding: 16px 18px 14px; }
  .post-text { font-size: 17.5px; }
  .mini-card { box-sizing: border-box; }
  .mini-name { font-size: 24px; }
  .mod-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .mod-tools .f-btn.small { justify-content: center; padding: 9px 4px; letter-spacing: .05em; white-space: nowrap; }
  .mod-tools .f-select { grid-column: 1 / -1; justify-content: space-between; }
  .mod-tools .f-select select { flex: 1; }
  .mod-tools .rename-form, .mod-tools .form-error { grid-column: 1 / -1; }
  /* The character card opens across the post, level with the portrait, rather than off its left edge. */
  .post-side { position: relative; }
  .mini-portrait { position: static; }
  .mini-card { inset: 0 0 auto 0; width: 100%; min-height: 212px; box-shadow: inset 0 0 0 4px #f6eeda, inset 0 0 0 5px #c9b27c, 0 8px 24px rgba(0, 0, 0, .35); }
  .preview-card .mini-card { inset: 0; width: auto; min-height: 0; box-shadow: inset 0 0 0 4px #f6eeda, inset 0 0 0 5px #c9b27c; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
