/*
 * Metro Line: a fully custom skin for games set in the present day. The banner is a city seen from a platform: glass
 * towers, a crane, an elevated line with a train on it, and the three colours of a transit map running under it all.
 * Light is a clear morning and dark is the same skyline at night with its windows lit. The rest borrows from signs
 * and phones: station plates for labels, a ring and a line for every heading, posts shaped like messages, the GM's
 * posts as service notices and the character card as a contact. Titles are in Schibsted Grotesk, text in Inter. No
 * city's or operator's marks, maps or names: every shape is drawn here from gradients.
 */
import type { Theme } from "../model.ts";
import { buildSkin, canvas, sketch, spot, type Kit } from "./kit.ts";

const VARS = `:root {
  --ml-blue: #0b5fd0; --ml-red: #d5311f; --ml-yellow: #f2b705; --ml-green: #17864a;
  --ml-plate: #14181d; --ml-plate-ink: #ffffff; --ml-btn: #0b5fd0; --ml-btn-on: #094fae; --ml-btn-ink: #ffffff; --ml-heading: #14181d; --ml-bubble: #eaf2fe;
  --ml-shadow: 0 1px 2px rgba(15, 23, 32, .06), 0 10px 22px -16px rgba(15, 23, 32, .4);
  --ml-sky: linear-gradient(180deg, #bcd8f0 0%, #dcebf7 58%, #f1f5f8 100%);
  --ml-1: #33475b; --ml-2: #566d84; --ml-3: #7f95aa; --ml-far: #b3c5d6; --ml-win: #bcd6ec; --ml-disc: #fff6cf; --ml-cloud: #ffffff;
  --ml-deck: #1f2a35; --ml-train: #f4f6f8; --ml-star: transparent; --ml-title: #14181d;
}
:root[data-theme="dark"] {
  --ml-blue: #6aa9ff; --ml-red: #ff7a66; --ml-yellow: #ffd24a; --ml-green: #4fd18b;
  --ml-plate: #eef2f6; --ml-plate-ink: #14181d; --ml-btn: #6aa9ff; --ml-btn-on: #8dbdff; --ml-btn-ink: #0d1014; --ml-heading: #ffffff; --ml-bubble: #152238;
  --ml-shadow: 0 0 0 1px rgba(0, 0, 0, .4), 0 12px 24px -16px #000;
  --ml-sky: linear-gradient(180deg, #060a13 0%, #0f1a2e 55%, #1e2f4d 100%);
  --ml-1: #080c14; --ml-2: #101826; --ml-3: #1a2536; --ml-far: #213049; --ml-win: #ffd98a; --ml-disc: #e9eef6; --ml-cloud: transparent;
  --ml-deck: #04070b; --ml-train: #cdd7e2; --ml-star: rgba(255, 255, 255, .8); --ml-title: #ffffff;
}`;

/* The skyline, in a box 640 wide and 290 tall: towers in three greys with glass in rows, a crane, and the elevated line. */
const c = canvas(640, 290), TONE = ["", "var(--ml-1)", "var(--ml-2)", "var(--ml-3)"];
const tower = (tone: 1 | 2 | 3, x: number, w: number, h: number, gap = 12) => [
  c.fill(`repeating-linear-gradient(90deg, ${TONE[tone]} 0 4px, #0000 4px ${gap}px)`, x + 4, 46, w - 8, h - 54),
  c.fill("repeating-linear-gradient(0deg, #0000 0 8px, var(--ml-win) 8px 13px)", x + 4, 46, w - 8, h - 54),
  c.rect(TONE[tone]!, x, 30, w, h - 30),
];
const CITY = [
  /* The train: a stripe of the line's colour under its windows. */
  c.fill("repeating-linear-gradient(90deg, var(--ml-1) 0 12px, #0000 12px 16px)", 258, 42, 150, 7), c.rect("var(--ml-red)", 250, 36, 166, 3),
  c.rect("var(--ml-deck)", 332, 33, 2, 20), c.fill("radial-gradient(ellipse 100% 100% at 100% 100%, var(--ml-train) 98%, #0000)", 250, 33, 14, 20), c.rect("var(--ml-train)", 264, 33, 152, 20),
  /* The elevated line and its piers. */
  c.rect("var(--ml-deck)", 0, 26, 640, 7), c.fill("repeating-linear-gradient(90deg, var(--ml-deck) 0 8px, #0000 8px 96px)", 20, 0, 620, 26),
  /* A crane on the half-built tower. */
  c.rect("var(--ml-yellow)", 414, 262, 120, 3), c.rect("var(--ml-yellow)", 446, 214, 4, 62), c.rect("var(--ml-deck)", 520, 244, 1, 18), c.rect("var(--ml-deck)", 514, 236, 13, 8),
  /* Towers, nearest first. */
  ...tower(1, 96, 62, 196), c.rect("var(--ml-1)", 124, 196, 2, 34),
  ...tower(1, 268, 58, 250, 10), c.rect("var(--ml-1)", 278, 250, 38, 12), c.rect("var(--ml-1)", 296, 262, 2, 26),
  ...tower(1, 506, 108, 136, 14),
  ...tower(2, 18, 72, 128), ...tower(2, 334, 82, 176, 14), ...tower(2, 596, 44, 190, 10),
  ...tower(3, 166, 96, 156, 16), ...tower(3, 420, 68, 214), c.rect("var(--ml-3)", 0, 30, 640, 20),
];

const k = sketch();
const blocks = (h: number, list: number[][]) => `linear-gradient(90deg, ${list.map(([x, w]) => `#0000 ${x}%, var(--ml-far) ${x}% ${x! + w!}%, #0000 ${x! + w!}%`).join(", ")}) 0 100% / 100% ${h}% no-repeat`;
const STARS = [[5, 12], [13, 30], [22, 8], [31, 22], [43, 12], [52, 34], [60, 6], [71, 20], [83, 10], [94, 26]].map(([x, y]) => `radial-gradient(1.2px 1.2px at ${x}% ${y}%, var(--ml-star) 55%, #0000)`);
const pill = (x: number, y: number, w: number) => spot("radial-gradient(closest-side, var(--ml-cloud) calc(100% - 1px), #0000)", x, y, w, 20);
const SKY = [
  ...STARS,
  pill(50, 10, 130), pill(53, 15, 90), pill(4, 62, 120), pill(7, 67, 84),
  spot("radial-gradient(closest-side, var(--ml-disc) calc(100% - 1px), #0000)", 91, 8, 54),
  k.rect("var(--ml-far)", 0, 0, 100, 9), blocks(22, [[2, 6], [11, 4], [19, 8], [33, 5], [44, 7], [58, 5], [70, 6], [84, 7]]), blocks(34, [[5, 3], [24, 4], [47, 3], [62, 4], [88, 3]]),
  "var(--ml-sky)",
];
const MINI = [
  k.rect("var(--ml-red)", 0, 6, 100, 3), k.rect("var(--ml-deck)", 0, 9, 100, 5),
  k.rect("var(--ml-1)", 12, 14, 20, 56), k.rect("var(--ml-2)", 40, 14, 24, 72), k.rect("var(--ml-1)", 70, 14, 18, 44), k.rect("var(--ml-3)", 0, 14, 100, 22),
  "var(--ml-sky)",
].join(", ");

const TITLE_TYPE = "font-family: var(--font-display); font-weight: 700; letter-spacing: -.01em;";
const SMALL = "font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .06em;";
const FRAME = "border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); box-shadow: var(--ml-shadow);";
const BTN_BASE = "border-radius: 8px; font-family: var(--font-sans); font-weight: 600; letter-spacing: 0; text-transform: none;";
const PLATE = "border: 0; border-radius: 4px; background: var(--ml-plate); color: var(--ml-plate-ink);";
/* A line that ends in a station: the heading's rule. */
const LINE = "radial-gradient(circle at calc(100% - 8px) 50%, var(--bg) 0 3px, var(--ml-blue) 3.6px 7.4px, #0000 8px), linear-gradient(var(--ml-blue) 0 0) left center / calc(100% - 12px) 4px no-repeat";
const LINES = "linear-gradient(var(--ml-red) 0 0) 0 0 / 100% 4px no-repeat, linear-gradient(var(--ml-yellow) 0 0) 0 4px / 100% 4px no-repeat, linear-gradient(var(--ml-blue) 0 0) 0 8px / 100% 4px no-repeat";

const KIT: Kit = {
  id: "preset-metro-line", name: "Metro Line", inspired: "The present day", p: "ml",
  about: "A city of glass towers over an elevated line, with the plain type and coloured lines of station signs.",
  radius: 10, fonts: { display: "schibsted", reading: "inter", ui: "inter" },
  colors: {
    light: { bg: "#edf0f3", panel: "#ffffff", raised: "#f2f4f7", line: "#d3d9e0", ink: "#14181d", muted: "#55606b", accent: "#0b5fd0", accent2: "#c22b1a" },
    dark: { bg: "#0c0f13", panel: "#151a20", raised: "#1c232b", line: "#2b3540", ink: "#eef2f6", muted: "#9aa7b4", accent: "#6aa9ff", accent2: "#ff7a66" },
  },
  vars: VARS,
  page: "background: var(--bg);",
  select: "background: var(--ml-blue); color: var(--ml-btn-ink);", scroll: "var(--line) var(--bg)",
  hi: "var(--ml-heading)", mark: "var(--ml-blue)", link: "var(--ml-blue)",
  frame: FRAME, frameOn: "border-color: var(--ml-blue);", corner: "8px",
  titleType: TITLE_TYPE, small: SMALL,
  btn: `${BTN_BASE} border: 1px solid var(--ml-btn); background: var(--ml-btn); color: var(--ml-btn-ink) !important;`,
  btnOn: "border-color: var(--ml-btn-on); background: var(--ml-btn-on); color: var(--ml-btn-ink);",
  ghost: `${BTN_BASE} border: 1px solid var(--line-strong); background: var(--panel); color: var(--ink) !important;`,
  ghostOn: "border-color: var(--ml-blue); background: var(--raised); color: var(--ink);",
  chip: PLATE,
  bar: "var(--panel)", rule: edge => `border-${edge}: 1px solid var(--line);`,
  heading: (h, side) => `${h} { display: flex; align-items: center; gap: 12px; }
${h}::before { content: ""; flex: none; box-sizing: border-box; width: 20px; height: 20px; border: 5px solid var(--ml-red); border-radius: 50%; background: var(--panel); }
${h}::after { content: ""; flex: 1; min-width: 28px; height: 16px; background: ${LINE}; }${side === "center" ? `\n${h} { justify-content: flex-start; }` : ""}`,
  tabOn: "color: var(--ml-heading); box-shadow: inset 0 -3px 0 var(--ml-blue);",
  title: `${TITLE_TYPE} font-weight: 800; letter-spacing: -.02em; color: var(--ml-title); text-shadow: none;`,
  titleSizes: [56, 44, 31],
  tagline: "display: inline-flex; align-items: center; gap: 9px; padding: 6px 12px; border-radius: 6px; background: var(--ml-plate); color: var(--ml-plate-ink); font: 500 14.5px/1.4 var(--font-sans); text-shadow: none;",
  eyebrow: `display: inline-block; padding: 4px 10px; ${PLATE} ${SMALL} font-size: 10.5px; text-shadow: none;`,
  nav: `justify-content: flex-start; padding: 12px 24px 0; border-top: 0; background: ${LINES}, #14181d;`,
  navLink: "padding: 12px 16px; color: #ffffff; font: 600 13px var(--font-sans); letter-spacing: .02em; text-transform: none;",
  navOn: "color: #ffffff; background: rgba(255, 255, 255, .12); border-bottom-color: #ffffff;",
  scene: {
    height: 370, align: "left",
    pad: ["44px 440px 140px 44px", "36px 300px 140px 32px", "22px 18px 168px"],
    back: SKY,
    boxes: [{ css: "right: 0; bottom: 0; width: 640px; height: 290px; transform-origin: bottom right;", layers: CITY, mid: "scale: .72;", phone: "scale: .52;" }],
    edge: "border: 1px solid var(--line); border-radius: var(--radius);",
  },
  mini: MINI,
  cardLabel: "Contact",
  extra: {
    forum: `.board-bar { margin-bottom: 10px; }
.board-head { box-shadow: var(--ml-shadow); }
/* The name starts at a station, and the line under it says the service is running. */
.board-title a::before { content: ""; display: inline-block; box-sizing: border-box; width: .62em; height: .62em; margin-right: .26em; border: .15em solid var(--ml-red); border-radius: 50%; background: #ffffff; }
.board-tagline::before { content: ""; flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--ml-green); }
.board-head.has-art .board-tagline { background: #14181d; color: #ffffff; }
.tag { border-radius: 4px; }
.tag.new { border: 0; background: var(--ml-red); color: var(--panel); }
.unread-dot { width: 10px; height: 10px; background: var(--ml-blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ml-blue) 24%, transparent); }
.topic-row.pinned { box-shadow: inset 4px 0 0 var(--ml-red), var(--ml-shadow); }
.topic-row.picked { box-shadow: inset 4px 0 0 var(--ml-blue), var(--ml-shadow); }
.portrait.small, .portrait.tiny { border: 0; background: var(--ml-plate); color: var(--ml-plate-ink); }
.forum-art, .location-art { border-right: 0; }
.forum-location { overflow: hidden; }
/* Posts are messages: one corner square, and every other one tinted and turned the other way. */
.post { border-radius: 18px 18px 18px 4px; }
.post.flip { border-radius: 18px 18px 4px 18px; background: var(--ml-bubble); }
.post-band, .post.flip .post-band { border-bottom: 1px solid var(--line); background: none; }
.post-name { font-size: 20px; }
.portrait.big { border: 0; border-radius: 14px; }
.portrait.big.portrait-empty { background: var(--ml-plate); }
.portrait.big.portrait-empty span { font: 800 92px var(--font-display); color: var(--ml-plate-ink); }
/* The GM's posts are service notices: a plate across the top and the line's red down the side. */
.post.post-gm { border-radius: 4px 18px 18px 18px; border-color: var(--line); box-shadow: inset 5px 0 0 var(--ml-red), var(--ml-shadow); }
.post.post-gm .gm-band { background: var(--ml-plate); }
.post.post-gm .gm-band .post-name, .post.post-gm .gm-band .post-meta, .post.post-gm .gm-band .post-meta a { color: var(--ml-plate-ink); }
.post.post-gm .gm-band small { color: var(--ml-plate-ink); opacity: .75; }
.gm-seal { border-radius: 8px; background: var(--ml-red); color: #ffffff; box-shadow: none; }
:root[data-theme="dark"] .gm-seal { color: #14181d; }
.mini-card { border: 1px solid var(--line); box-shadow: 0 16px 30px -12px rgba(0, 0, 0, .5); }
.mini-card::before { background: var(--ml-blue); color: var(--ml-btn-ink); }
.mini-traits .chip { border-radius: 4px; }
.roll-card { border: 1px dashed var(--line-strong); border-left: 4px solid var(--ml-yellow); }
.roll-total { background: var(--ml-plate); color: var(--ml-plate-ink); }
.cast-chip, .today-chip { border-radius: 999px; }`,
    encyclopedia: `.prose h2 { padding-bottom: 8px; border-bottom: 4px solid var(--ml-blue); }
.picture-panel:not(.picture-empty) { border: 1px solid var(--line); box-shadow: var(--ml-shadow); }
.dashboard-intro, .hub-head, .campaign-scenes-head { box-shadow: var(--ml-shadow); }`,
    dashboard: ".hub-head { box-shadow: var(--ml-shadow); }",
    maptable: `.campaign-scenes-head { box-shadow: var(--ml-shadow); }
.toolbar { border-color: var(--line); box-shadow: var(--ml-shadow); }`,
  },
};

export const METRO_LINE: Theme = buildSkin(KIT);
