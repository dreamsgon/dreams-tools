/*
 * Northern Hold: a fully custom skin, inspired by The Elder Scrolls V: Skyrim. Cold and spare, like that game's
 * interface: thin capitals set wide, bands of smoke in place of boxes, and hairlines that fade out at both ends.
 * The banner is a night in the mountains: a snow-capped peak over two ranges, an aurora, and a constellation picked
 * out in the sky, all drawn with gradients (no picture, nothing from the game). Light is the same range on a pale
 * winter morning. Nothing glows and nothing moves. Like every skin, its stylesheets go through the safety checks in
 * css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --nh-sky: linear-gradient(180deg, #c3ced6 0%, #dde4e8 58%, #f3f5f6 100%);
  --nh-aurora: radial-gradient(46% 70% at 78% 0%, rgba(255, 255, 255, .85), transparent 70%);
  --nh-star: transparent;
  --nh-star-line: transparent;
  --nh-far: #b3c0c9;
  --nh-mid: #8292a0;
  --nh-near: #4b5a64;
  --nh-snow: #ffffff;
  --nh-mist: rgba(255, 255, 255, .78);
  --nh-ground: #f4f6f7;
  --nh-title: #16191b;
  --nh-title-shadow: 0 1px 0 rgba(255, 255, 255, .5);
  --nh-banner-ink: #16191b;
  --nh-banner-quiet: #3f4a51;
  --nh-band: rgba(255, 255, 255, .7);
  --nh-line: #a9b1b6;
  --nh-smoke: linear-gradient(90deg, transparent, rgba(255, 255, 255, .72) 12%, rgba(255, 255, 255, .72) 88%, transparent);
  --nh-page: radial-gradient(80% 420px at 50% 0%, rgba(255, 255, 255, .8), transparent 70%);
  --nh-card: rgba(12, 14, 16, .95); --nh-card-ink: #e6e8ea; --nh-card-quiet: #9aa1a6; --nh-card-line: #5a6268; --nh-card-blue: #9fc0d3;
  --card-bg: var(--nh-card); --card-ink: var(--nh-card-ink); --card-head: var(--nh-card-ink); --card-line: var(--nh-card-line);
}
:root[data-theme="dark"] {
  --nh-sky: linear-gradient(180deg, #04060a 0%, #0a121e 56%, #182838 100%);
  --nh-aurora: linear-gradient(104deg, transparent 18%, rgba(70, 214, 160, .2) 34%, rgba(84, 150, 232, .16) 50%, rgba(150, 110, 220, .1) 62%, transparent 76%), radial-gradient(60% 80% at 60% 0%, rgba(60, 190, 160, .16), transparent 70%);
  --nh-star: #dfe8f2;
  --nh-star-line: rgba(190, 212, 236, .38);
  --nh-far: #213549;
  --nh-mid: #16222e;
  --nh-near: #06080b;
  --nh-snow: #a3b5c6;
  --nh-mist: rgba(120, 150, 180, .16);
  --nh-ground: #0b0f14;
  --nh-title: #eef1f3;
  --nh-title-shadow: 0 2px 14px rgba(0, 0, 0, .7);
  --nh-banner-ink: #e6e8ea;
  --nh-banner-quiet: #b4bdc4;
  --nh-band: rgba(0, 0, 0, .5);
  --nh-line: #4a5258;
  --nh-smoke: linear-gradient(90deg, transparent, rgba(255, 255, 255, .04) 12%, rgba(255, 255, 255, .04) 88%, transparent);
  --nh-page: radial-gradient(90% 460px at 50% 0%, rgba(110, 150, 190, .1), transparent 72%);
}`;

/**
 * A mountain: a wedge that widens downward from its tip. `apex` is how far along its box the tip sits (0 is the left
 * edge, 1 the right). `y` lifts it off the bottom.
 */
const peak = (colour: string, x: number, w: number, h: number, apex: number, repeat = "no-repeat", y = 0) => {
  const left = Math.atan(apex * w / h) * 180 / Math.PI, right = Math.atan((1 - apex) * w / h) * 180 / Math.PI;
  return `conic-gradient(from ${(180 - right).toFixed(1)}deg at ${(apex * 100).toFixed(0)}% 0, ${colour} 0 ${(left + right).toFixed(1)}deg, transparent ${(left + right + 0.5).toFixed(1)}deg) left ${x}px bottom ${y}px / ${w}px ${h}px ${repeat}`;
};
/** A mountain with snow on it: the same wedge again, smaller, at the tip, with rock biting up into its lower edge. */
const snowy = (x: number, w: number, h: number, apex: number, cap: number) => {
  const cw = w * cap, ch = h * cap, cx = x + apex * (w - cw), cy = h - ch;
  const tooth = (at: number, tw: number, th: number, lean: number) => peak("var(--nh-mid)", Math.round(cx + cw * at), tw, th, lean, "no-repeat", Math.round(cy));
  return [tooth(.08, 26, 20, .4), tooth(.3, 34, 30, .6), tooth(.56, 30, 24, .35), tooth(.78, 24, 16, .6), peak("var(--nh-snow)", Math.round(cx), Math.round(cw), Math.round(ch), apex, "no-repeat", Math.round(cy)), peak("var(--nh-mid)", x, w, h, apex)];
};
/** A line between two stars, in the same box as the mountain: a hairline along the diagonal of the box they span. */
const STAR_LINE = "var(--nh-star-line)";
const thread = ([x1, y1]: number[], [x2, y2]: number[]) => {
  const rising = (x2 - x1) * (y2 - y1) > 0;
  return `linear-gradient(to ${rising ? "top left" : "top right"}, transparent calc(50% - .6px), ${STAR_LINE} calc(50% - .6px) calc(50% + .6px), transparent calc(50% + .6px)) left ${Math.min(x1, x2)}px bottom ${Math.min(y1, y2)}px / ${Math.abs(x2 - x1)}px ${Math.abs(y2 - y1)}px no-repeat`;
};
const star = ([x, y]: number[], size = 3) => `radial-gradient(circle closest-side, var(--nh-star) 55%, transparent 100%) left ${x - size}px bottom ${y - size}px / ${size * 2}px ${size * 2}px no-repeat`;
/** A constellation of our own: seven stars and the lines that join them, measured from the left and the bottom of the box. */
const STARS = [[452, 292], [500, 258], [556, 282], [606, 304], [540, 214], [488, 188], [592, 172]];
const CONSTELLATION = [
  ...STARS.map((at, i) => star(at, i === 1 || i === 3 ? 4 : 3)),
  thread(STARS[0], STARS[1]), thread(STARS[1], STARS[2]), thread(STARS[2], STARS[3]), thread(STARS[2], STARS[4]), thread(STARS[4], STARS[5]), thread(STARS[4], STARS[6]),
];
/**
 * One value may be 2,000 characters at most (css.ts), so a long list of layers is handed over in parts: `declare`
 * sets each part as a variable and `use` puts them back together.
 */
const inParts = (name: string, items: string[]) => {
  const parts: string[][] = [[]];
  for (const item of items) {
    const last = parts[parts.length - 1];
    if (last.length && [...last, item].join(", ").length > 1800) parts.push([item]); else last.push(item);
  }
  return { declare: parts.map((part, i) => `--${name}-${i + 1}: ${part.join(", ")};`).join(" "), use: parts.map((_, i) => `var(--${name}-${i + 1})`).join(", ") };
};
/** The great peak with its snow, the constellation over its shoulder, in a box 640 by 320. */
const PEAK = inParts("nh-peak", [...snowy(190, 330, 236, .56, .34), ...CONSTELLATION]);
/** The far range, pale with distance, along the whole bottom. */
const FAR = [peak("var(--nh-far)", 0, 230, 104, .42, "repeat-x"), peak("var(--nh-far)", 70, 310, 132, .6, "repeat-x"), peak("var(--nh-far)", 30, 170, 76, .5, "repeat-x")].join(", ");
/** The near range, dark, in front of everything, with mist lying in it. */
const NEAR = ["linear-gradient(0deg, var(--nh-mist), transparent) left 0 bottom 0 / 100% 100% no-repeat", peak("var(--nh-near)", 0, 150, 52, .38, "repeat-x"), peak("var(--nh-near)", 40, 210, 70, .64, "repeat-x"), peak("var(--nh-near)", 15, 97, 34, .5, "repeat-x"), "linear-gradient(var(--nh-near), var(--nh-near)) left 0 bottom 0 / 100% 8px no-repeat"].join(", ");
/** Sparse stars for the sky. Clear by day. */
const SKY_STARS = [[6, 14, 1], [14, 34, 1.5], [23, 9, 1], [31, 26, 1], [42, 16, 1.5], [55, 7, 1], [64, 30, 1], [88, 12, 1.5], [95, 38, 1]]
  .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, var(--nh-star) 50%, transparent 100%)`).join(", ");
/** For a location with no picture: one snowy peak under the sky. */
const MINI = [
  "linear-gradient(0deg, var(--nh-mist), transparent 40%)",
  "conic-gradient(from 146deg at 50% 0, var(--nh-near) 0 68deg, transparent 68.5deg) 20% 100% / 90px 34px no-repeat",
  "conic-gradient(from 150deg at 50% 0, var(--nh-snow) 0 60deg, transparent 60.5deg) 56% calc(100% - 58px) / 30px 26px no-repeat",
  "conic-gradient(from 150deg at 50% 0, var(--nh-mid) 0 60deg, transparent 60.5deg) 56% 100% / 97px 84px no-repeat",
  "conic-gradient(from 140deg at 50% 0, var(--nh-far) 0 80deg, transparent 80.5deg) 88% 100% / 110px 62px no-repeat",
  "var(--nh-aurora)", "var(--nh-sky)",
].join(", ");

/** The page behind everything: a little light at the top. */
const PAGE = "background: var(--nh-page), var(--bg);";
/** A hairline that fades out at both ends, top and bottom, and a band of smoke between them. */
const FRAME = "border: 0; border-top: 1px solid transparent; border-bottom: 1px solid transparent; border-image: linear-gradient(90deg, transparent, var(--nh-line) 12%, var(--nh-line) 88%, transparent) 1; border-radius: 0; background: var(--nh-smoke);";
/** Small labels: thin capitals, set wide. */
const LABEL = "font-family: var(--font-display); font-weight: 400; text-transform: uppercase; letter-spacing: .2em;";
/** A heading in the middle, between two lines that fade away from it. */
const HEADING = "justify-content: center; gap: 16px; font-family: var(--font-display); font-weight: 400; letter-spacing: .32em; text-transform: uppercase; color: var(--ink);";
const LINE_IN = `content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--nh-line));`;
const LINE_OUT = `content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, var(--nh-line), transparent);`;
/** A rule with a diamond at its middle, fading out at both ends. */
const KNOT = `content: ""; width: 260px; max-width: 80%; height: 11px; background: linear-gradient(90deg, transparent, currentColor 30%, currentColor 70%, transparent); clip-path: polygon(0 calc(50% - .5px), calc(50% - 6px) calc(50% - .5px), 50% 0, calc(50% + 6px) calc(50% - .5px), 100% calc(50% - .5px), 100% calc(50% + .5px), calc(50% + 6px) calc(50% + .5px), 50% 100%, calc(50% - 6px) calc(50% + .5px), 0 calc(50% + .5px));`;
/** Buttons that matter: the one solid thing on the page. */
const SOLID = "border: 1px solid var(--accent); border-radius: 0; background: var(--accent); color: var(--on-accent);";
/** A row: no box, only a hairline under it. Under the pointer a faint band shows and the name brightens. */
const ROW = "border: 0; border-bottom: 1px solid transparent; border-image: linear-gradient(90deg, transparent, var(--nh-line) 10%, var(--nh-line) 90%, transparent) 1; border-radius: 0; background: transparent; transition: background-color .15s;";
const ROW_ON = "background: var(--nh-smoke);";

/**
 * The mountains, drawn behind `host`'s own content: the sky with its aurora and stars, the far range, the great peak
 * and its constellation at the right, and the near range in front with mist in it.
 */
function mountains(host: string) {
  return `${host} {
  position: relative; overflow: hidden; isolation: isolate; border: 0; border-radius: 0;
  background: ${FAR}, ${SKY_STARS}, var(--nh-aurora), var(--nh-sky);
  color: var(--nh-banner-ink);
}
${host} > * { position: relative; z-index: 2; }
${host}::before {
  content: ""; position: absolute; z-index: 0; right: 0; bottom: 0; width: 640px; height: 320px; pointer-events: none;
  ${PEAK.declare}
  background: ${PEAK.use};
}
${host}::after {
  content: ""; position: absolute; z-index: 1; left: 0; bottom: 0; width: 100%; height: 110px; pointer-events: none;
  background: ${NEAR};
}`;
}
/** The same banner, smaller, for a phone. */
const smallMountains = (host: string) => `${host}::before { right: -40px; scale: .56; transform-origin: bottom right; }
  ${host}::after { height: 80px; }`;
const TITLE = "font-family: var(--font-display); font-weight: 300; text-transform: uppercase; letter-spacing: .26em; color: var(--nh-title); text-shadow: var(--nh-title-shadow);";

/* The Encyclopedia: the campaign's overview gets the mountains, pages are bands of smoke under thin capitals. */
const ENCYCLOPEDIA = `/* Northern Hold for the Encyclopedia. The colours and fonts come from the theme; this adds the mountains, the fading hairlines and the thin capitals. */
${VARS}
body { ${PAGE} scrollbar-color: var(--nh-line) var(--panel); }
::selection { background: var(--accent-2); color: #fff; }

/* The shelf down the side. */
.sidebar { border-right: 1px solid var(--line); background: var(--panel); }
.csw-name b { font: 400 16px var(--font-display); letter-spacing: .16em; text-transform: uppercase; }
.campaign-link { border-radius: 0; }
.campaign-link:hover { color: var(--ink); }
.campaign-link.active { background: linear-gradient(90deg, color-mix(in srgb, var(--accent-2) 22%, transparent), transparent); color: var(--ink); }
.side-heading .section-toggle { ${LABEL} font-size: 11.5px; color: var(--muted); }
.shared-tag { border-radius: 0; border: 1px solid var(--nh-line); background: transparent; color: var(--muted); ${LABEL} font-size: 9.5px; }
.tree-row { border-radius: 0; }
.tree-row:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.tree-row:has(.active), .tree-item.active { background: linear-gradient(90deg, color-mix(in srgb, var(--accent-2) 22%, transparent), transparent); color: var(--ink); }

/* The bar along the top. */
.topbar { border-bottom: 1px solid var(--line); background: var(--panel); }
.search-box { border-radius: 0; border-color: var(--nh-line); background: var(--bg); }
.search-box:focus-within { border-color: var(--accent-2); }
.quick-hint kbd { border-radius: 0; border-color: var(--nh-line); }

/* Buttons and boxes to type in. */
.button { border-radius: 0; ${LABEL} font-size: 12px; }
.button.primary { ${SOLID} transition: filter .15s; }
.button.primary:hover { filter: brightness(1.08); }
.button:not(.primary) { border-color: var(--nh-line); background: transparent; }
.button:not(.primary):hover { border-color: var(--ink); color: var(--ink); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--ink); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; caret-color: var(--accent-2); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: none; }

/* The campaign's overview: the mountains. */
${mountains(".dashboard-intro")}
.dashboard-intro { min-height: 330px; align-items: flex-start; margin-bottom: 26px; padding: 38px 38px 140px; }
.dashboard-intro .eyebrow { ${LABEL} font-size: 12px; color: var(--nh-banner-quiet); }
.dashboard-intro h1 { margin-top: 10px; font-size: 40px; line-height: 1.15; ${TITLE} }
.dashboard-intro .subtitle { max-width: 40ch; font: 300 18px/1.5 var(--font-reading); color: var(--nh-banner-ink); }
.dashboard-intro .icon-button { border: 1px solid var(--nh-line); background: var(--nh-band); color: var(--nh-banner-ink); }
.overview-strip { border-color: var(--line); }
.overview-strip strong { font: 400 20px var(--font-display); color: var(--ink); }

/* Headings: thin capitals, then a line that fades. */
.section-heading h2 { flex: 1; display: flex; align-items: center; gap: 16px; font: 400 17px var(--font-display); letter-spacing: .3em; text-transform: uppercase; }
.section-heading h2::after { ${LINE_OUT} }
.eyebrow { ${LABEL} font-size: 11px; }

/* Cards: bands of smoke between two fading hairlines. Under the pointer the name brightens. */
.note-card { ${FRAME} padding: 22px 26px; }
.note-card h3 { font: 400 19px/1.25 var(--font-display); letter-spacing: .12em; text-transform: uppercase; color: color-mix(in srgb, var(--ink) 78%, var(--muted)); transition: color .15s; }
.note-card:hover h3 { color: var(--ink); }
.note-card .eyebrow, .card-footer { color: var(--accent-2); }
.note-card.add-card { border: 1px dashed var(--nh-line); border-image: none; background: transparent; }

/* A page. */
.kind-pill { padding: 2px 10px; border-radius: 0; border: 1px solid var(--nh-line); background: transparent; color: var(--ink); ${LABEL} font-size: 10.5px; }
.article-title h1 { font-family: var(--font-display); font-weight: 300; letter-spacing: .1em; text-transform: uppercase; }
.tag-add, .who-button { border-radius: 0; }
.article-tabs { border-bottom: 1px solid var(--line); }
.article-tabs button { border-radius: 0; ${LABEL} font-size: 12px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--ink); box-shadow: inset 0 -1px 0 var(--ink); background: transparent; }
.picture-panel { border-radius: 0; border-color: var(--nh-line); }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-display); font-weight: 400; letter-spacing: .14em; text-transform: uppercase; }
.prose h2 { padding-bottom: 6px; border-bottom: 1px solid transparent; border-image: linear-gradient(90deg, var(--nh-line), transparent) 1; }
.prose h3 { color: var(--accent-2); }
.prose blockquote { border-left: 1px solid var(--accent-2); background: transparent; font-weight: 300; }
.prose code, .prose pre { border-radius: 0; }
.article-aside .aside-section { border-top: 1px solid var(--line); }
.article-aside .eyebrow { color: var(--accent-2); }

@media (max-width: 640px) {
  .dashboard-intro { min-height: 270px; padding: 26px 20px 110px; }
  .dashboard-intro h1 { font-size: 25px; letter-spacing: .18em; }
  .dashboard-intro .subtitle { max-width: 24ch; font-size: 16px; }
  ${smallMountains(".dashboard-intro")}
}
`;

/* Maptable: quiet smoke around the table, and the Scene Picker gets the mountains. */
const MAPTABLE = `/* Northern Hold for Maptable. The map itself keeps its own colours; everything around it is thin capitals and fading hairlines. */
${VARS}
body { ${PAGE} scrollbar-color: var(--nh-line) var(--panel); }
::selection { background: var(--accent-2); color: #fff; }

/* The bar along the top. */
.app-header, .campaign-dashboard > header { border-bottom: 1px solid var(--line); background: var(--panel); }
.header-scene strong { color: var(--ink); }
.csw-btn { border-radius: 0; }
.csw-name b { font: 400 15px var(--font-display); letter-spacing: .16em; text-transform: uppercase; }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${SOLID} ${LABEL} font-size: 12px; transition: filter .15s; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { background: var(--accent); filter: brightness(1.08); }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--ink); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--accent-2); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: none; }
input[type="range"] { accent-color: var(--accent-2); }

/* The tool rail. */
.rail { border-right: 1px solid var(--line); background: var(--panel); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--ink); }
.rail button.active { background: linear-gradient(90deg, color-mix(in srgb, var(--accent-2) 26%, transparent), transparent); color: var(--ink); }

/* The side panel. */
.side-panel { border-right: 1px solid var(--line); background: var(--panel); }
.panel-title { border-bottom: 1px solid transparent; border-image: linear-gradient(90deg, var(--nh-line), transparent) 1; }
.panel-title h2 { font: 400 14.5px var(--font-display); letter-spacing: .3em; text-transform: uppercase; }
.organizer-scene { border-radius: 0; white-space: normal; }
.organizer-scene:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.organizer-scene.active { background: linear-gradient(90deg, color-mix(in srgb, var(--accent-2) 24%, transparent), transparent); }
.organizer-scene strong { font: 400 14.5px/1.3 var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.organizer-scene.active strong { color: var(--ink); }
.scene-kind { border-radius: 0; color: var(--accent-2); }

/* Around the map. */
.map-topbar { border-bottom: 1px solid var(--line); background: var(--panel); }
.map-title { ${LABEL} font-size: 11.5px; color: var(--muted); }
.board { background: radial-gradient(70% 60% at 50% 0%, color-mix(in srgb, var(--accent-2) 10%, transparent), transparent 70%), var(--bg); }
.board-info { ${LABEL} color: var(--muted); }
.zoom-controls { border-radius: 0; border-color: var(--nh-line); }
.toolbar { border-radius: 0; border: 1px solid var(--nh-line); background: var(--panel); }
.toolbar button { border-radius: 0; ${LABEL} font-size: 11.5px; }
.toolbar button:hover { color: var(--ink); }
.toolbar button.active { background: var(--accent); color: var(--on-accent); }

/* The Scene Picker: the mountains. */
${mountains(".campaign-scenes-head")}
.campaign-scenes-head { min-height: 300px; align-items: flex-start; padding: 32px 32px 130px; }
.campaign-scenes-head small { ${LABEL} font-size: 12px; color: var(--nh-banner-quiet); }
.campaign-scenes-head h1 { margin-top: 8px; font-size: 34px; line-height: 1.15; ${TITLE} }
.dashboard-continue { ${FRAME} padding: 22px 30px; }
.dashboard-continue small { ${LABEL} font-size: 11.5px; color: var(--accent-2); }
.dashboard-continue strong { font: 400 21px var(--font-display); letter-spacing: .14em; text-transform: uppercase; }
.campaign-scenes-kinds button { border-radius: 0; ${LABEL} font-size: 11.5px; }
.campaign-scenes-group h2 { display: flex; align-items: center; gap: 16px; font: 400 16px var(--font-display); letter-spacing: .3em; text-transform: uppercase; }
.campaign-scenes-group h2::after { ${LINE_OUT} }
.campaign-scenes-group h2 span { ${LABEL} font-size: 11px; }
.campaign-scene-card { border: 1px solid var(--line); border-radius: 0; background: var(--panel); transition: border-color .15s; }
.campaign-scene-card.last { border-color: var(--accent-2); }
/* Hover: the frame brightens. Nothing lifts and nothing glows. */
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { border-color: var(--ink); }
.campaign-scene-card strong { font: 400 14.5px/1.3 var(--font-display); letter-spacing: .1em; text-transform: uppercase; }
.campaign-scene-card em { ${LABEL} font-style: normal; font-size: 10.5px; color: var(--accent-2); }
.campaign-scene-card small { font-size: 13px; font-weight: 300; }
.campaign-scene-picture { border-bottom: 1px solid var(--line); }

@media (max-width: 640px) {
  .campaign-scenes-head { min-height: 250px; padding: 24px 20px 104px; }
  .campaign-scenes-head h1 { font-size: 23px; letter-spacing: .18em; }
  ${smallMountains(".campaign-scenes-head")}
}
`;

/* The campaign's dashboard: the mountains behind its name, and bands of smoke. */
const DASHBOARD = `/* Northern Hold for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--accent-2); color: #fff; }
.hub-crumbs { ${LABEL} font-size: 12px; }
.hub-crumbs a { color: var(--accent-2); }

/* The top: the mountains. */
${mountains(".hub-head")}
.hub-head { min-height: 350px; padding: 34px 34px 150px; }
.hub-title p { ${LABEL} font-size: 12px; color: var(--nh-banner-quiet); }
.hub-title h1 { margin-top: 8px; font-size: 40px; line-height: 1.15; ${TITLE} }
.hub-chip { border-radius: 0; border-color: var(--nh-line); background: var(--nh-band); color: var(--nh-banner-quiet); ${LABEL} font-size: 10.5px; }
.hub-head .tag-add { border-radius: 0; border-color: var(--nh-line); background: var(--nh-band); color: var(--nh-banner-ink); }
.hub-head .hub-button:not(.hub-button-primary) { border-color: var(--nh-line); background: var(--nh-band); color: var(--nh-banner-ink); }

/* Buttons. */
.hub-button { border-radius: 0; ${LABEL} font-size: 12px; }
.hub-button-primary { ${SOLID} transition: filter .15s; }
.hub-button-primary:hover { filter: brightness(1.08); }
.hub-button:not(.hub-button-primary):hover { border-color: var(--ink); color: var(--ink); }

/* Dashboard, Front page and Members. */
.hub-tabs { border-bottom: 1px solid transparent; border-image: linear-gradient(90deg, var(--nh-line), transparent) 1; }
.hub-tabs button, .hub-tabs a { border-radius: 0; ${LABEL} font-size: 12.5px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--ink); }
.mem-count { border-radius: 0; }

/* Cards: bands of smoke between two fading hairlines. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; font: 400 15px var(--font-display); letter-spacing: .3em; text-transform: uppercase; color: var(--ink); }
.hub-card-head a, .hub-card-head .hub-text-button { ${LABEL} font-size: 11.5px; color: var(--accent-2); }
.hub-scene-grid li { border-radius: 0; }

@media (max-width: 640px) {
  .hub-head { min-height: 0; padding: 24px 20px 120px; }
  .hub-title h1 { font-size: 25px; letter-spacing: .18em; }
  ${smallMountains(".hub-head")}
}
`;

export const NORTHERN_HOLD: Theme = {
  id: "preset-northern-hold", name: "Northern Hold", mode: "both", radius: 0, banner: "picture", fonts: { display: "jost", reading: "jost", ui: "jost" },
  colors: {
    light: { bg: "#e9ebec", panel: "#f7f8f8", raised: "#eef0f1", line: "#c9ced1", ink: "#16191b", muted: "#596167", accent: "#2b3338", accent2: "#3d6c85" },
    dark: { bg: "#0b0c0d", panel: "#131516", raised: "#1a1d1f", line: "#2e3336", ink: "#e6e8ea", muted: "#9aa1a6", accent: "#d6dadd", accent2: "#7fa3b8" },
  },
  css: `/* Northern Hold: cold and spare. Thin capitals set wide, bands of smoke in place of boxes, and hairlines that fade out at both ends. The banner is a night in the mountains, drawn with gradients: a snow-capped peak, an aurora and a constellation.
   Light is the same range on a pale winter morning. Nothing glows and nothing moves. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--nh-line) var(--panel); }
::selection { background: var(--accent-2); color: #fff; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { border: 0; border-bottom: 1px solid transparent; border-image: linear-gradient(90deg, transparent, var(--nh-line) 12%, var(--nh-line) 88%, transparent) 1; background: transparent; }
.board-date { ${LABEL} font-size: 11.5px; }
.board-date b { ${LABEL} font-size: 11.5px; color: var(--accent-2); }
.circ { border: 1px solid var(--nh-line); background: transparent; color: var(--ink); font: 400 12px var(--font-display); }
.you b { font: 400 16px var(--font-display); letter-spacing: .16em; text-transform: uppercase; }
.search-box { border-color: var(--nh-line); background: transparent; }
.search-box:focus-within { border-color: var(--accent-2); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: the sky with its aurora, the far range, the great peak and its constellation, and the near range in mist. */
.board-head { min-height: 380px; border: 0; }
.board-head:not(.has-art) {
  background: ${SKY_STARS}, var(--nh-aurora), var(--nh-sky);
  --head-ink: var(--nh-banner-ink); --head-title: var(--nh-title); --head-shadow: var(--nh-title-shadow); --head-nav: var(--nh-ground); --head-line: transparent;
}
.board-head-text { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 62px 40px 160px; overflow: hidden; }
.board-head:not(.has-art) .board-head-text { background: ${FAR}; }
.board-title, .board-tagline { position: relative; z-index: 2; }
.board-head:not(.has-art) .board-head-text::before {
  content: ""; position: absolute; z-index: 0; right: 0; bottom: 0; width: 640px; height: 320px;
  ${PEAK.declare}
  background: ${PEAK.use};
}
.board-head:not(.has-art) .board-head-text::after {
  content: ""; position: absolute; z-index: 1; left: 0; bottom: 0; width: 100%; height: 110px;
  background: ${NEAR};
}
.board-title { font: 300 46px/1.15 var(--font-display); letter-spacing: .34em; margin-right: -.34em; text-transform: uppercase; }
.board-tagline { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-top: 16px; ${LABEL} font-style: normal; font-weight: 300; font-size: 15px; letter-spacing: .16em; color: var(--nh-banner-quiet); }
.board-tagline::before { ${KNOT} }
.board-nav { border-top: 0; background: var(--head-nav); }
.board-nav a { padding: 12px 22px; ${LABEL} font-size: 13px; letter-spacing: .28em; }
.board-nav a + a::before { content: "◇"; margin-right: 44px; margin-left: -22px; font-size: 8px; vertical-align: 2px; opacity: .6; }
.board-nav a:hover { color: var(--head-title); border-bottom-color: transparent; }
/* With a banner picture: the picture under a soft dark sky, the same thin title over it. */
.board-head.has-art {
  background: linear-gradient(180deg, rgba(4, 6, 10, .6) 0%, rgba(4, 6, 10, .18) 40%, rgba(4, 6, 10, .3) 66%, rgba(4, 6, 10, .88) 100%), var(--banner) center var(--banner-y, 50%) / cover no-repeat;
  --head-ink: #e6e8ea; --head-title: #f3f5f6; --head-shadow: 0 2px 14px rgba(0, 0, 0, .85); --head-nav: rgba(0, 0, 0, .55); --head-line: transparent;
}
.board-head.has-art .board-head-text { justify-content: center; padding: 60px 40px 70px; }
.board-head.has-art .board-tagline { color: #dfe4e8; text-shadow: 0 1px 8px #000; }

/* Headings: thin capitals in the middle, between two lines that fade away. */
.category-title { ${HEADING} font-size: 17px; }
.category-title::before { ${LINE_IN} }
.category-title::after { ${LINE_OUT} }
.tag { border-radius: 0; border-color: var(--nh-line); color: var(--muted); ${LABEL} font-size: 9.5px; text-shadow: none; }
.tag.new { border-color: var(--accent-2); background: transparent; color: var(--accent-2); }

/* Boards and topics: no boxes, only a hairline under each. Under the pointer a faint band shows and the name brightens. */
.category-forums, .topics { gap: 0; }
.forum, .topic-row { ${ROW} }
.forum:hover, .topic-row:hover { ${ROW_ON} }
.topic-row.pinned { border-left: 0; }
.forum-name { font: 400 19px/1.25 var(--font-display); letter-spacing: .16em; text-transform: uppercase; }
.forum-name a, .topic-title a { color: color-mix(in srgb, var(--ink) 80%, var(--muted)); transition: color .15s; }
.forum:hover .forum-name a, .topic-row:hover .topic-title a, .forum-name a:hover, .topic-title a:hover { color: var(--ink); }
.forum-desc { font: 300 16px/1.45 var(--font-reading); font-style: normal; }
.forum-place { ${LABEL} font-size: 10.5px; }
.forum-place a { color: var(--accent-2); }
.forum-counts b { font: 400 19px var(--font-display); color: var(--ink); }
.last-label { ${LABEL} font-size: 10px; color: var(--accent-2); }
.forum-last a, .foot-list a { color: var(--ink); font: 400 15.5px/1.3 var(--font-display); }
.forum-last a:hover, .foot-list a:hover { color: var(--accent-2); }
.topic-title { font: 400 16.5px/1.3 var(--font-display); letter-spacing: .12em; text-transform: uppercase; }
.topic-main small { font-style: normal; font-weight: 300; }
.topic-count b { font: 400 18px var(--font-display); color: var(--ink); }
.unread-dot { width: 8px; height: 8px; border-radius: 0; background: var(--accent-2); rotate: 45deg; box-shadow: none; }
.portrait.small, .portrait.tiny { border: 1px solid var(--nh-line); background: transparent; color: var(--ink); font-family: var(--font-display); font-weight: 400; box-shadow: none; }
/* A location with no picture gets one snowy peak. */
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${LABEL} font-size: 11.5px; color: var(--accent-2); }
.location-name { font-weight: 300; font-size: 30px; letter-spacing: .2em; text-transform: uppercase; }
.location-summary { font: 300 17px/1.55 var(--font-reading); font-style: normal; }

/* Topic pages. */
.crumbs { ${LABEL} font-size: 11.5px; }
.crumbs a { color: var(--accent-2); }
.topic-head { ${FRAME} }
.topic-name { font: 300 30px/1.2 var(--font-display); letter-spacing: .2em; text-transform: uppercase; color: var(--ink); }
.cast-chip, .today-chip { border-radius: 0; border-color: var(--nh-line); background: transparent; }

/* Posts: bands of smoke between two fading hairlines, the name in thin capitals over a line that fades. */
.posts { gap: 26px; }
.post { ${FRAME} }
.post.fresh { border-image: linear-gradient(90deg, transparent, var(--accent-2) 12%, var(--accent-2) 88%, transparent) 1; }
.post-band, .post.flip .post-band { padding: 16px 30px 12px; border-bottom: 0; background: linear-gradient(90deg, var(--nh-line), transparent 70%) left 30px bottom 0 / calc(100% - 60px) 1px no-repeat; }
.post-name { font: 400 20px/1.2 var(--font-display); letter-spacing: .22em; text-transform: uppercase; }
.post-name a { color: var(--ink); }
.post-meta { ${LABEL} font-size: 11px; }
.post-meta a { color: var(--accent-2); }
.portrait.big { border: 1px solid var(--nh-line); border-radius: 0; }
.portrait.big::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, transparent 55%, rgba(4, 6, 10, .5)); }
.portrait.big.portrait-empty { background: var(--nh-smoke); }
.portrait.big.portrait-empty span { font: 300 120px var(--font-display); color: color-mix(in srgb, var(--ink) 30%, transparent); }
/* The character card that opens over a portrait: dark smoke in both versions, everything in the middle. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; align-items: center; padding: 22px 18px 18px; border: 1px solid var(--nh-card-line);
  background: var(--nh-card); color: var(--nh-card-ink); text-align: center; box-shadow: 0 18px 40px -16px rgba(0, 0, 0, .8);
}
.mini-card > *, .mini-card dd { color: var(--nh-card-ink); }
.mini-name { font: 400 20px/1.2 var(--font-display); letter-spacing: .24em; margin-right: -.24em; text-transform: uppercase; }
.mini-role { display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 6px 0 14px; ${LABEL} font-style: normal; font-size: 11px; color: var(--nh-card-blue); }
.mini-role::after { ${KNOT} width: 180px; color: var(--nh-card-line); }
.mini-quote { font: 300 15.5px/1.5 var(--font-reading); font-style: italic; color: var(--nh-card-quiet); opacity: 1; }
.mini-traits { justify-content: center; }
.mini-traits .chip { border-radius: 0; }
.mini-fields dt { ${LABEL} font-size: 10.5px; color: var(--nh-card-quiet); }
.mini-fields dd { font: 400 15.5px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: center; margin-top: auto; padding: 7px 20px; border: 1px solid var(--nh-card-line); color: var(--nh-card-ink) !important; ${LABEL} font-size: 11.5px; text-decoration: none; transition: border-color .15s; }
.mini-link:hover { border-color: var(--nh-card-ink); }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${LABEL} font-size: 11px; line-height: 1.6; }
.mini-player b { color: var(--accent-2); font-weight: 400; }
.post-text { font: 400 17.5px/1.7 var(--font-reading); }
.post-text blockquote { border-left: 1px solid var(--accent-2); background: transparent; font-weight: 300; }
.post-text pre { border: 1px solid var(--nh-line); background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { font-weight: 400; letter-spacing: .14em; text-transform: uppercase; color: var(--ink); }
.roll-card { border-radius: 0; border-color: var(--nh-line); background: transparent; }
.roll-group i, .roll-stamp { border-radius: 0; }
.roll-total { border-radius: 0; font: 400 17px/26px var(--font-display); }
.post-actions { border-top: 0; }
.post-actions button { ${LABEL} font-size: 11.5px; }
.post-actions button:hover { color: var(--ink); }

/* Buttons and boxes to type in. */
.f-btn { border-radius: 0; ${LABEL} font-size: 12px; }
.f-btn:not(.ghost) { ${SOLID} color: var(--on-accent) !important; transition: filter .15s; }
.f-btn:not(.ghost):hover:not(:disabled) { filter: brightness(1.08); }
.f-btn.ghost { border-color: var(--nh-line); background: transparent; }
.f-btn.ghost:hover:not(:disabled) { border-color: var(--ink); background: transparent; color: var(--ink) !important; }
.f-btn.small { font-size: 11px; }
input:not([type="checkbox"]), select, textarea { border-radius: 0; background: transparent; caret-color: var(--accent-2); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--accent-2); box-shadow: none; }
.composer { border: 0; border-top: 1px solid transparent; border-image: linear-gradient(90deg, transparent, var(--nh-line) 12%, var(--nh-line) 88%, transparent) 1; }
.composer-kind, .as-label { ${LABEL} color: var(--accent-2); }
.tools { border-radius: 0; background: transparent; }
.tools button { border-radius: 0; }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { font-weight: 400; font-size: 14.5px; letter-spacing: .28em; text-transform: uppercase; color: var(--ink); }
.foot-staff b { font: 400 15px var(--font-display); letter-spacing: .1em; }
.foot-stats b { font: 400 17px var(--font-display); color: var(--ink); }
.to-top { border-radius: 0; border-color: var(--nh-line); color: var(--ink); }

@container page (max-width: 640px) {
  .board-head { min-height: 300px; }
  .board-head-text { padding: 34px 18px 120px; }
  .board-title { font-size: 25px; letter-spacing: .24em; margin-right: -.24em; }
  .board-tagline { font-size: 12px; }
  .board-head:not(.has-art) .board-head-text::before { right: -40px; scale: .56; transform-origin: bottom right; }
  .board-head:not(.has-art) .board-head-text::after { height: 80px; }
  .board-nav a { padding: 10px 9px; font-size: 11px; letter-spacing: .18em; }
  .board-nav a + a::before { margin-right: 18px; margin-left: -9px; }
  .category-title { font-size: 14.5px; letter-spacing: .24em; }
  .forum-name { font-size: 17px; letter-spacing: .12em; }
  .topic-name { font-size: 21px; letter-spacing: .14em; }
  .post-name { font-size: 17px; }
  .portrait.big.portrait-empty span { font-size: 60px; }
  .mini-card { box-shadow: 0 0 0 1px var(--bg), 0 22px 50px -8px rgba(0, 0, 0, .85); }
}
@media (prefers-reduced-motion: reduce) {
  .forum, .topic-row { transition: none; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
