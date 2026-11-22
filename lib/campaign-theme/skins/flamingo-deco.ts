/*
 * Flamingo Deco: a fully custom skin, inspired by Florida. The banner is a row of art deco hotels on the beach, in
 * pink, mint and lemon with fins, ledges and awnings, palms in front of them and two flamingos wading at the edge of
 * the water. Light is a bright morning with a sunburst behind the hotels; dark is the same street at night, the
 * hotels gone to navy and their trim lit like neon. Cards hang a scalloped awning from their top edge, headings
 * start at a rising sun and run out in waves, the unread mark is a slice of citrus and the GM's posts are written
 * on hotel paper. Titles are in Righteous, text in Space Grotesk. No hotel's or place's signs, logos or art: every
 * shape is drawn here from gradients and outlines.
 */
import type { Theme } from "../model.ts";
import { buildSkin, canvas, outline, palm, ribbon, round, sketch, spot, type Kit } from "./kit.ts";

const VARS = `:root {
  --fd-pink: #ee4f96; --fd-aqua: #12a9a4; --fd-yellow: #ffc93c; --fd-heading: #1f2a44; --fd-mark: #c81e6e; --fd-link: #b01a60;
  --fd-chip: #d3f3ec; --fd-chip-ink: #124b4a; --fd-btn: #c81e6e; --fd-btn-on: #a8175c; --fd-btn-ink: #ffffff; --fd-btn-shadow: 3px 3px 0 #12a9a4;
  --fd-band: #e9f8f4; --fd-paper: #fffdf6; --fd-shadow: 0 10px 22px -16px rgba(20, 50, 70, .5);
  --fd-sky: linear-gradient(180deg, #58c9d6 0%, #a8e6e2 46%, #fff0d2 70%);
  --fd-ray: rgba(255, 255, 255, .24); --fd-sun: #ffd45e; --fd-sea: linear-gradient(180deg, #19b5b0, #0a8a96); --fd-wave: rgba(255, 255, 255, .8);
  --fd-cloud: #ffffff; --fd-star: transparent;
  --fd-b1: #ff9fc2; --fd-b2: #a5ead9; --fd-b3: #ffe38a; --fd-b4: #fffaf0; --fd-b5: #9fdcf2; --fd-glass: #2f7f95; --fd-door: #1f2a44; --fd-walk: #f0dcb2; --fd-stripe: #ffffff;
  --fd-palm: #174b3f; --fd-bird: #f0447f;
  --fd-title: #c81e6e; --fd-title-shadow: 3px 3px 0 #ffffff, 6px 6px 0 #12a9a4; --fd-tag: #1f2a44; --fd-tag-shadow: none; --fd-nav: #c81e6e; --fd-nav-ink: #ffffff; --fd-nav-on: #ffe38a;
}
:root[data-theme="dark"] {
  --fd-pink: #ff6fb5; --fd-aqua: #4fe3d6; --fd-yellow: #ffd76a; --fd-heading: #ffffff; --fd-mark: #ff6fb5; --fd-link: #ff9fcd;
  --fd-chip: #1d3a5c; --fd-chip-ink: #bff5ee; --fd-btn: #ff6fb5; --fd-btn-on: #ff9fcd; --fd-btn-ink: #1a0a22; --fd-btn-shadow: 0 0 14px rgba(255, 111, 181, .55);
  --fd-band: #1c2249; --fd-paper: #191e42; --fd-shadow: 0 0 0 1px rgba(0, 0, 0, .4), 0 12px 24px -16px #000;
  --fd-sky: linear-gradient(180deg, #080a22 0%, #1c1650 44%, #6a2478 62%, #e0568c 70%);
  --fd-ray: rgba(255, 255, 255, .035); --fd-sun: #ff5fa8; --fd-sea: linear-gradient(180deg, #2a1c66, #0c0e2c); --fd-wave: rgba(255, 130, 200, .6);
  --fd-cloud: rgba(255, 255, 255, .07); --fd-star: rgba(255, 255, 255, .85);
  --fd-b1: #241a52; --fd-b2: #15244f; --fd-b3: #2a1d5c; --fd-b4: #1a1f4d; --fd-b5: #142a55; --fd-glass: #ffd98a; --fd-door: #ffd98a; --fd-walk: #0b0d28; --fd-stripe: #1a1440;
  --fd-palm: #05061a; --fd-bird: #ff6fb5;
  --fd-title: #fff1f8; --fd-title-shadow: 0 0 5px #ff6fb5, 0 0 16px #ff6fb5, 0 0 34px #ff2f97; --fd-tag: #d9fbf6; --fd-tag-shadow: 0 1px 2px #080a22, 0 0 10px #080a22; --fd-nav: #080a22; --fd-nav-ink: #f3f0ff; --fd-nav-on: #4fe3d6;
}`;

/* The hotels, in a box 600 wide and 250 tall. Each has a fin up its middle with a spire, a ledge over every floor, and an awning over its door. */
const c = canvas(600, 250);
const hotel = (x: number, w: number, h: number, body: string, trim: string, gap = 20) => [
  c.rect(trim, x + w / 2 - 1.5, h + 24, 3, 22), c.rect(trim, x + w / 2 - 8, h, 16, 26), c.rect(trim, x + w / 2 - 15, h, 30, 12),
  c.rect(trim, x + w / 2 - 6, 36, 12, h - 36),
  c.fill(`repeating-linear-gradient(90deg, ${trim} 0 8px, var(--fd-stripe) 8px 16px)`, x + 4, 26, w - 8, 9), c.rect("var(--fd-door)", x + w / 2 - 7, 10, 14, 16),
  c.fill(`repeating-linear-gradient(0deg, ${trim} 0 3px, ${body} 3px 10px, #0000 10px 24px)`, x - 3, 36, w + 6, h - 42),
  c.fill(`repeating-linear-gradient(90deg, #0000 0 8px, var(--fd-glass) 8px ${gap}px)`, x + 6, 36, w - 12, h - 44),
  c.rect(body, x + 10, h, w - 20, 7), c.rect(body, x, 10, w, h - 10),
];
const HOTELS = [
  c.rect("var(--fd-walk)", 0, 0, 600, 10),
  ...hotel(20, 118, 150, "var(--fd-b1)", "var(--fd-aqua)"), ...hotel(146, 96, 200, "var(--fd-b2)", "var(--fd-pink)", 18),
  ...hotel(250, 132, 130, "var(--fd-b3)", "var(--fd-aqua)", 22), ...hotel(390, 100, 178, "var(--fd-b4)", "var(--fd-pink)", 18), ...hotel(498, 102, 142, "var(--fd-b5)", "var(--fd-yellow)"),
];
/* A flamingo on one leg, as outlines. */
function flamingo(x: number, s: number, flip = false): number[][][] {
  const to = (shape: number[][]) => shape.map(([px, py]) => [x + (flip ? -px! : px!) * s, py! * s]);
  return [
    round(28, 64, 22, 12), [[10, 68], [-2, 56], [14, 58]], ribbon([[44, 64], [56, 70], [61, 82], [54, 93], [50, 103], [54, 112]], 5.5),
    round(57, 113, 6, 6, 8), [[60, 118], [72, 111], [71, 102], [65, 108], [59, 108]],
    ribbon([[26, 56], [26, 0]], 2.6), ribbon([[33, 56], [43, 34], [31, 26]], 2.6),
  ].map(to);
}
const FRONT = outline(700, 290, [...flamingo(8, 1), ...flamingo(118, .8, true), ...palm(250, 236, 20, .82), ...palm(580, 262, -24, .9)]);

/* Behind them: the sky with a sunburst, clouds in stacked bars, the sea, and three rows of scalloped waves. */
const k = sketch();
const STARS = [[5, 10], [14, 26], [24, 7], [33, 20], [46, 9], [57, 28], [66, 6], [78, 18], [88, 9], [95, 30]].map(([x, y]) => `radial-gradient(1.3px 1.3px at ${x}% ${y}%, var(--fd-star) 55%, #0000)`);
const wave = (y: number, shift: number) => `radial-gradient(circle at 50% 100%, #0000 7px, var(--fd-wave) 7.6px 9px, #0000 9.6px) ${shift}px ${y}% / 24px 10px repeat-x`;
const pill = (x: number, y: number, w: number) => spot("radial-gradient(closest-side, var(--fd-cloud) calc(100% - 1px), #0000)", x, y, w, 16);
const SKY = [
  ...STARS,
  wave(79, 0), wave(87, 12), wave(95, 0),
  k.fill("var(--fd-sea)", 0, 0, 100, 30),
  pill(64, 9, 170), pill(61, 14, 110), pill(97, 20, 120),
  spot("radial-gradient(closest-side, var(--fd-sun) calc(100% - 1px), #0000)", 44, 70, 150, 150, 0, 30),
  "repeating-conic-gradient(from 3deg at 44.8% 70%, var(--fd-ray) 0 6deg, #0000 6deg 12deg)",
  "var(--fd-sky)",
];
const MINI = [
  wave(80, 0), wave(92, 12), k.fill("var(--fd-sea)", 0, 0, 100, 34),
  spot("radial-gradient(closest-side, var(--fd-sun) calc(100% - 1px), #0000)", 50, 62, 60, 60), "repeating-conic-gradient(from 3deg at 50% 66%, var(--fd-ray) 0 10deg, #0000 10deg 20deg)", "var(--fd-sky)",
].join(", ");

const TITLE_TYPE = "font-family: var(--font-display); font-weight: 400; letter-spacing: .02em;";
const SMALL = "font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .12em;";
/* An awning's scalloped edge, pink and aqua by turns, along the top of a card. */
const AWNING = "radial-gradient(circle at 50% 0, var(--fd-pink) 0 7px, #0000 7.6px) 0 0 / 32px 8px repeat-x, radial-gradient(circle at 50% 0, var(--fd-aqua) 0 7px, #0000 7.6px) 16px 0 / 32px 8px repeat-x";
const FRAME = `border: 1px solid var(--line); border-radius: var(--radius); background: ${AWNING}, var(--panel); box-shadow: var(--fd-shadow);`;
const BTN_BASE = "border-radius: 8px; font-family: var(--font-sans); font-weight: 700; text-transform: uppercase; letter-spacing: .08em;";
const WAVES = "radial-gradient(circle at 50% 100%, #0000 5px, var(--fd-aqua) 5.6px 7.4px, #0000 8px) 0 50% / 18px 9px repeat-x";
const RISING = "radial-gradient(circle at 50% 100%, var(--fd-yellow) 0 38%, #0000 40%), repeating-conic-gradient(from -96deg at 50% 100%, var(--fd-pink) 0 12deg, #0000 12deg 24deg)";
const CITRUS = "radial-gradient(circle, #0000 0 54%, #f28c1b 57%), repeating-conic-gradient(#ffcb47 0 38deg, #fff4cf 38deg 45deg)";

const KIT: Kit = {
  id: "preset-flamingo-deco", name: "Flamingo Deco", inspired: "Florida", p: "fd",
  about: "Art deco hotels on the beach in pink, mint and lemon, with flamingos, awnings and a neon night.",
  radius: 14, fonts: { display: "righteous", reading: "space", ui: "space" },
  colors: {
    light: { bg: "#effaf7", panel: "#ffffff", raised: "#e6f6f2", line: "#b9e2da", ink: "#1f2a44", muted: "#51607a", accent: "#c81e6e", accent2: "#0b7c82" },
    dark: { bg: "#0d1128", panel: "#151a3a", raised: "#1c2249", line: "#323a70", ink: "#f3f0ff", muted: "#a9b0d8", accent: "#ff6fb5", accent2: "#4fe3d6" },
  },
  vars: VARS,
  page: "background: var(--bg);",
  select: "background: var(--fd-pink); color: #ffffff;", scroll: "var(--fd-aqua) var(--panel)",
  hi: "var(--fd-heading)", mark: "var(--fd-mark)", link: "var(--fd-link)",
  frame: FRAME, frameOn: "border-color: var(--fd-mark);", corner: "8px",
  titleType: TITLE_TYPE, small: SMALL,
  btn: `${BTN_BASE} border: 0; background: var(--fd-btn); color: var(--fd-btn-ink) !important; box-shadow: var(--fd-btn-shadow);`,
  btnOn: "background: var(--fd-btn-on); color: var(--fd-btn-ink);",
  ghost: `${BTN_BASE} border: 2px solid var(--fd-aqua); background: transparent; color: var(--ink) !important;`,
  ghostOn: "border-color: var(--fd-aqua); background: color-mix(in srgb, var(--fd-aqua) 18%, transparent); color: var(--ink);",
  chip: "border: 0; border-radius: 999px; background: var(--fd-chip); color: var(--fd-chip-ink);",
  bar: "var(--panel)", rule: edge => `border-${edge}: 1px solid var(--line);`,
  heading: (h, side) => `${h} { display: flex; align-items: center; gap: 12px; text-transform: uppercase; }
${h}::before { content: ""; flex: none; width: 34px; height: 17px; border-radius: 34px 34px 0 0; background: ${RISING}; }
${h}::after { content: ""; flex: 1; min-width: 28px; height: 10px; background: ${WAVES}; mask-image: linear-gradient(90deg, #000 30%, #0000); }${side === "center" ? `\n${h} { justify-content: flex-start; }` : ""}`,
  tabOn: "color: var(--fd-heading); box-shadow: inset 0 -3px 0 var(--fd-pink);",
  title: `${TITLE_TYPE} text-transform: uppercase; color: var(--fd-title); text-shadow: var(--fd-title-shadow);`,
  titleSizes: [58, 46, 32],
  tagline: "font: 600 14px/1.5 var(--font-sans); letter-spacing: .14em; text-transform: uppercase; color: var(--fd-tag); text-shadow: var(--fd-tag-shadow);",
  eyebrow: `display: inline-block; padding: 4px 12px; border-radius: 999px; background: var(--fd-chip); color: var(--fd-chip-ink); ${SMALL} font-size: 10.5px; text-shadow: none;`,
  titleOnArt: "color: #fff1f8; text-shadow: 0 0 5px #ff6fb5, 0 0 16px #ff2f97, 0 3px 14px rgba(0, 0, 0, .7);",
  nav: "justify-content: flex-start; padding: 0 28px; border-top: 0; background: var(--fd-nav);",
  navLink: "padding: 13px 16px 11px; color: var(--fd-nav-ink); font: 700 12.5px var(--font-sans); letter-spacing: .14em;",
  navOn: "color: var(--fd-nav-on); border-bottom-color: var(--fd-nav-on);",
  scene: {
    height: 400, align: "left",
    pad: ["46px 470px 172px 44px", "38px 330px 150px 32px", "24px 18px 176px"],
    back: SKY,
    boxes: [
      { css: "right: 0; bottom: 0; width: 600px; height: 250px; transform-origin: bottom right;", layers: HOTELS, mid: "scale: .72;", phone: "scale: .52;" },
      { css: "right: 0; bottom: 0; width: 700px; height: 290px; transform-origin: bottom right; background: linear-gradient(90deg, var(--fd-bird) 0 18%, var(--fd-palm) 18%);", shape: FRONT, mid: "scale: .72;", phone: "scale: .52;" },
    ],
    edge: "border: 1px solid var(--line); border-radius: var(--radius);",
  },
  mini: MINI,
  cardLabel: "Guest registry",
  extra: {
    forum: `.board-bar { margin-bottom: 10px; background: var(--panel); }
.board-head { box-shadow: var(--fd-shadow); }
.board-head.has-art .board-tagline { color: #ffffff; }
.tag.new { border: 0; background: var(--fd-yellow); color: #3a2400; }
/* Unread: a slice of citrus. */
.unread-dot { width: 15px; height: 15px; background: ${CITRUS}; box-shadow: none; }
.topic-row.pinned { box-shadow: inset 5px 0 0 var(--fd-aqua), var(--fd-shadow); }
.topic-row.picked { box-shadow: inset 5px 0 0 var(--fd-pink), var(--fd-shadow); }
.portrait.small, .portrait.tiny { border: 2px solid var(--panel); box-shadow: 0 0 0 2px var(--fd-aqua); background: var(--fd-chip); color: var(--fd-chip-ink); }
.forum-art, .location-art { border-right: 0; border-radius: 60px 60px 6px 6px; }
.forum, .forum-location, .topic-row, .topic-head { padding-top: 22px; }
/* Posts: the name under the awning, the portrait in an arched window. */
.post { background: ${AWNING}, var(--panel); }
.post-band, .post.flip .post-band { padding-top: 18px; border-bottom: 1px solid var(--line); background: none; }
.portrait.big { border: 4px solid var(--fd-aqua); border-radius: 999px 999px 10px 10px; box-shadow: 0 0 0 4px var(--panel), 0 0 0 6px var(--fd-pink); margin: 8px 10px 14px; background: var(--fd-chip); }
.portrait.big.portrait-empty { background: linear-gradient(180deg, var(--fd-b5), var(--fd-b1)); }
.portrait.big.portrait-empty span { font: 400 84px var(--font-display); color: var(--fd-heading); }
/* The GM's posts are on hotel paper: a band in the hotel's colours and a rising sun for a crest. */
.post.post-gm { border-color: var(--fd-mark); background: var(--fd-paper); }
.post.post-gm .gm-band { border-bottom: 3px double var(--fd-aqua); background: var(--fd-band); }
.gm-seal { border-radius: 50%; background: ${CITRUS}; color: #7a3d00; box-shadow: 0 0 0 3px var(--panel); }
.mini-card { border-width: 1px; }
.mini-card::before { background: var(--fd-mark); color: var(--fd-btn-ink); }
.roll-total { border-radius: 8px; background: var(--fd-chip); color: var(--fd-chip-ink); }
.cast-chip, .today-chip { border-radius: 999px; }`,
    encyclopedia: `.prose h2 { padding-bottom: 14px; background: ${WAVES.replace("0 50%", "0 100%")}; background-size: 18px 9px; }
.picture-panel:not(.picture-empty) { border: 4px solid var(--fd-aqua); box-shadow: 0 0 0 4px var(--panel), 0 0 0 6px var(--fd-pink); margin: 6px; }
.dashboard-intro { box-shadow: var(--fd-shadow); }`,
    dashboard: ".hub-head { box-shadow: var(--fd-shadow); }",
    maptable: ".campaign-scenes-head { box-shadow: var(--fd-shadow); }\n.toolbar { border-color: var(--line); }",
  },
};

export const FLAMINGO_DECO: Theme = buildSkin(KIT);
