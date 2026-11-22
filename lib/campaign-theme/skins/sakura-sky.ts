/*
 * Sakura Sky: a fully custom skin, inspired by anime. The banner is the sky from a hundred opening credits: a tower
 * of summer cloud behind utility poles and their wires, rooftops along the bottom and petals on the wind. Light is a
 * summer afternoon; dark is the same street at dusk, with the windows lit, the first stars and a thin moon. Frames
 * are manga panels: an ink line, a hard coloured shadow and a corner of screentone. Titles are in Mochiy Pop One
 * with a title card's outline, text in Zen Maru Gothic. The GM's posts are narration boxes, the buttons press in and
 * the unread mark is a star. No characters, logos or art from any series: every shape is drawn here from gradients.
 */
import type { Theme } from "../model.ts";
import { buildSkin, canvas, scatter, sketch, spot, star, stroke, type Kit } from "./kit.ts";

const INK = "#1b2540";
const VARS = `:root {
  --sk-ink: ${INK}; --sk-pop: #ff8fb5; --sk-pop-2: #7cc8ff; --sk-heading: ${INK}; --sk-link: #c02563;
  --sk-tone: rgba(27, 37, 64, .16);
  --sk-sky: linear-gradient(180deg, #1667c9 0%, #3d9be6 38%, #8fd0f5 72%, #d8f1fb 100%);
  --sk-cloud-1: #ffffff; --sk-cloud-2: #dcecfa; --sk-cloud-3: #b9d6f2;
  --sk-glare: rgba(255, 255, 255, .85); --sk-star: transparent; --sk-moon: transparent; --sk-moon-cut: transparent;
  --sk-far: #6fa3d8; --sk-near: #1d3a6b; --sk-wire: #1d3a6b; --sk-win: #cfe6fa; --sk-petal: #ffc2d6;
  --sk-title: #ffffff; --sk-title-edge: ${INK}; --sk-title-drop: #ff8fb5;
  --sk-narr: #fff7d1; --sk-narr-ink: ${INK};
}
:root[data-theme="dark"] {
  --sk-ink: #b3a9f5; --sk-pop: #ff5c9a; --sk-pop-2: #5b7cff; --sk-heading: #fff1c9; --sk-link: #ff9cc0;
  --sk-tone: rgba(179, 169, 245, .2);
  --sk-sky: linear-gradient(180deg, #120f33 0%, #3a2470 34%, #b0478f 68%, #ff9a6b 90%, #ffd08a 100%);
  --sk-cloud-1: #ffc4c9; --sk-cloud-2: #d98ab3; --sk-cloud-3: #8d5aa6;
  --sk-glare: transparent; --sk-star: rgba(255, 255, 255, .9); --sk-moon: #fff3cf; --sk-moon-cut: #17123b;
  --sk-far: #4b2d78; --sk-near: #0b0a1c; --sk-wire: #0b0a1c; --sk-win: #ffd76a; --sk-petal: #ffb3cd;
  --sk-title: #fff8dc; --sk-title-edge: #17123b; --sk-title-drop: #ff5c9a;
  --sk-narr: #2a2450; --sk-narr-ink: #fff1c9;
}`;

/* The street, in a box 640 wide and 300 tall: rooftops, three poles and the wires between them. */
const c = canvas(640, 300), NEAR = "var(--sk-near)", WIRE = "var(--sk-wire)", WIN = "var(--sk-win)";
const pole = (x: number, h: number, arms: number[][]) => [
  ...arms.map(([y, w]) => c.rect(NEAR, x - w! / 2, y!, w!, 4)),
  ...arms.flatMap(([y, w]) => [-.42, 0, .42].map(k => c.rect(NEAR, x + w! * k - 1.5, y! + 4, 3, 5))),
  c.rect(NEAR, x - 3, 0, 6, h),
];
const windows = (x: number, y: number, cols: number, rows: number, lit: number[]) =>
  Array.from({ length: cols * rows }, (_, i) => lit.includes(i) ? c.rect(WIN, x + (i % cols) * 22, y - Math.floor(i / cols) * 22, 10, 12) : "").filter(Boolean);
const STREET = [
  /* Wires first, so they cross in front of everything. */
  c.sag(WIRE, 40, 214, 262, 22, 2), c.sag(WIRE, 40, 190, 262, 26, 2),
  c.fall(WIRE, "right", 302, 196, 258, 40, 2), c.fall(WIRE, "right", 302, 174, 258, 42, 2),
  c.fall(WIRE, "right", 560, 150, 80, 50, 2), c.fall(WIRE, "right", 560, 132, 80, 46, 2),
  c.fall(WIRE, "left", 0, 226, 40, 30, 2), c.fall(WIRE, "left", 0, 200, 40, 36, 2),
  ...windows(376, 70, 4, 3, [0, 2, 5, 7, 8, 11]), ...windows(126, 36, 3, 1, [0, 2]), c.rect(WIN, 520, 22, 26, 14), c.rect(WIN, 30, 18, 14, 14),
  ...pole(40, 286, [[254, 56], [232, 66]]), ...pole(302, 252, [[232, 52], [210, 60]]), ...pole(560, 208, [[190, 44], [172, 50]]),
  c.rect(NEAR, 306, 170, 14, 26),
  /* Rooftops, left to right: a gabled house, a flat roof with a water tank, a low house, a block of flats, a long roof. */
  c.tri(NEAR, -8, 46, 106, 26), c.rect(NEAR, 0, 0, 90, 46),
  c.rect(NEAR, 148, 64, 34, 26), c.rect(NEAR, 110, 0, 104, 64),
  c.tri(NEAR, 222, 40, 116, 24), c.rect(NEAR, 232, 0, 96, 40),
  c.fill(`repeating-linear-gradient(90deg, ${NEAR} 0 2px, #0000 2px 10px)`, 360, 98, 112, 10), c.rect(NEAR, 360, 106, 112, 2), c.rect(NEAR, 360, 0, 112, 98),
  c.tri(NEAR, 480, 56, 170, 26), c.rect(NEAR, 490, 0, 150, 56),
];

/* The sky, back to front: the day or the dusk, haze, the tower of cloud, the moon and stars by night, glare by day, petals. */
const rnd = scatter(7);
const puff = (x: number, dx: number, up: number, d: number, tone = 2) =>
  spot(`radial-gradient(circle closest-side, var(--sk-cloud-1) 0 ${tone === 3 ? 40 : 62}%, var(--sk-cloud-${tone}) 99%, #0000 100%)`, x, 100, d, d, dx, -up);
const CLOUD = [
  puff(66, 10, 250, 120), puff(66, -70, 190, 150), puff(66, 80, 170, 150), puff(66, 0, 110, 210),
  puff(66, -150, 60, 200, 3), puff(66, 160, 40, 220, 3), puff(66, -30, -20, 280, 3), puff(66, -260, -30, 180, 3), puff(66, 270, -50, 200, 3),
];
const PETALS = Array.from({ length: 16 }, () => {
  const x = 4 + rnd() * 60, y = 6 + rnd() * 80, r = 3 + rnd() * 3;
  return `radial-gradient(${r.toFixed(1)}px ${(r * .6).toFixed(1)}px at ${x.toFixed(1)}% ${y.toFixed(1)}%, var(--sk-petal) 70%, #0000)`;
});
const STARS = Array.from({ length: 14 }, () => `radial-gradient(${(1 + rnd()).toFixed(1)}px ${(1 + rnd()).toFixed(1)}px at ${(rnd() * 100).toFixed(1)}% ${(rnd() * 46).toFixed(1)}%, var(--sk-star) 55%, #0000)`);
const k2 = sketch();
const SKY = [
  ...PETALS,
  "radial-gradient(circle at 8% -18%, var(--sk-glare) 0, #0000 34%)",
  spot("radial-gradient(closest-side, var(--sk-moon-cut) calc(100% - 1px), #0000)", 49, 9, 40, 40, 12, -5),
  spot("radial-gradient(closest-side, var(--sk-moon) calc(100% - 1px), #0000)", 49, 9, 44),
  ...STARS,
  ...CLOUD,
  k2.rect("var(--sk-far)", 0, 0, 100, 5),
  `linear-gradient(90deg, ${[[3, 9], [14, 7], [24, 12], [41, 6], [52, 10], [70, 8], [88, 9]].map(([x, w]) => `#0000 ${x}%, var(--sk-far) ${x}% ${x! + w!}%, #0000 ${x! + w!}%`).join(", ")}) 0 100% / 100% 13% no-repeat`,
  `linear-gradient(90deg, ${[[8, 5], [30, 7], [60, 6], [79, 5]].map(([x, w]) => `#0000 ${x}%, var(--sk-far) ${x}% ${x! + w!}%, #0000 ${x! + w!}%`).join(", ")}) 0 100% / 100% 20% no-repeat`,
  "var(--sk-sky)",
];

/* A corner of screentone: dots that shrink as they leave the corner. */
const TONE = [[8, 8, 3.2], [20, 8, 2.8], [32, 8, 2.3], [44, 8, 1.8], [56, 8, 1.2], [8, 20, 2.8], [20, 20, 2.3], [32, 20, 1.8], [44, 20, 1.2], [8, 32, 2.3], [20, 32, 1.8], [32, 32, 1.2], [8, 44, 1.8], [20, 44, 1.2], [8, 56, 1.2]]
  .map(([x, y, r]) => `radial-gradient(circle ${r}px at right ${x}px top ${y}px, var(--sk-tone) 96%, #0000)`).join(", ");

/* For a location with no picture: a pole, its wires and a cloud. */
const MINI = [
  k2.rect(NEAR, 66, 0, 2.6, 82), k2.rect(NEAR, 55, 68, 25, 2.6), k2.rect(NEAR, 58, 54, 19, 2.6),
  k2.fill(`radial-gradient(ellipse 100% 100% at 0 0, #0000 calc(100% - 2px), ${WIRE} calc(100% - 1px) calc(100% - .5px), #0000)`, 0, 50, 56, 20),
  k2.fill(`radial-gradient(ellipse 100% 100% at 100% 0, #0000 calc(100% - 2px), ${WIRE} calc(100% - 1px) calc(100% - .5px), #0000)`, 79, 56, 21, 14),
  k2.rect(NEAR, 0, 0, 100, 12), k2.rect(NEAR, 8, 12, 30, 12), k2.rect(NEAR, 80, 12, 20, 20),
  k2.oval("var(--sk-cloud-1)", 10, 30, 44, 50), k2.oval("var(--sk-cloud-2)", -6, 14, 44, 44), k2.oval("var(--sk-cloud-2)", 30, 10, 50, 46),
  "var(--sk-sky)",
].join(", ");

const TITLE_TYPE = "font-family: var(--font-display); font-weight: 400; letter-spacing: .01em;";
const SMALL = "font-family: var(--font-sans); font-weight: 700; text-transform: uppercase; letter-spacing: .1em;";
const FRAME = "border: 2px solid var(--sk-ink); border-radius: var(--radius); background: var(--sk-dots), var(--panel); box-shadow: 5px 5px 0 var(--sk-pop);";
const BTN_BASE = "border: 2px solid var(--sk-ink); border-radius: 999px; font-family: var(--font-sans); font-weight: 700; letter-spacing: .03em; text-transform: none; transition: none;";
const slashes = (side: "left" | "right") => `linear-gradient(${side === "left" ? 115 : 65}deg, #0000 0 20%, var(--sk-pop) 20% 42%, #0000 42% 56%, var(--sk-pop-2) 56% 78%, #0000 78%)`;
const DOTS_LINE = "radial-gradient(circle, var(--sk-ink) 2px, #0000 2.6px) left center / 12px 12px repeat-x";

const KIT: Kit = {
  id: "preset-sakura-sky", name: "Sakura Sky", inspired: "Anime", p: "sk",
  about: "Manga panels under a summer sky: ink lines, hard shadows and screentone, with a tower of cloud behind the wires.",
  radius: 10, fonts: { display: "mochiy", reading: "zenmaru", ui: "zenmaru" },
  colors: {
    light: { bg: "#e6f2fb", panel: "#ffffff", raised: "#eef6fc", line: "#c3d8ea", ink: "#1b2540", muted: "#55627f", accent: "#c02563", accent2: "#1865c7" },
    dark: { bg: "#110f24", panel: "#1b1838", raised: "#242047", line: "#3d3672", ink: "#f3efff", muted: "#b0a9d6", accent: "#ff8fb8", accent2: "#7cc4ff" },
  },
  vars: `${VARS}\n:root { --sk-dots: ${TONE}; }`,
  page: "background: radial-gradient(circle, var(--sk-tone) 1px, #0000 1.4px) 0 0 / 14px 14px, var(--bg);",
  select: "background: var(--sk-pop); color: #1b2540;", scroll: "var(--sk-pop) var(--panel)",
  hi: "var(--sk-heading)", mark: "var(--sk-ink)", link: "var(--sk-link)",
  frame: FRAME, frameOn: "box-shadow: 5px 5px 0 var(--sk-pop-2);", corner: "8px",
  titleType: TITLE_TYPE, small: SMALL,
  btn: `${BTN_BASE} background: var(--sk-pop); color: #1b2540 !important; box-shadow: 3px 3px 0 var(--sk-ink);`,
  btnOn: "background: var(--sk-pop); color: #1b2540; translate: 2px 2px; box-shadow: 1px 1px 0 var(--sk-ink);",
  ghost: `${BTN_BASE} background: var(--panel); color: var(--ink) !important; box-shadow: 3px 3px 0 var(--sk-pop-2);`,
  ghostOn: "background: var(--panel); border-color: var(--sk-ink); translate: 2px 2px; box-shadow: 1px 1px 0 var(--sk-pop-2);",
  chip: "border: 2px solid var(--sk-ink); border-radius: 999px; background: var(--sk-pop-2); color: #1b2540;",
  bar: "var(--panel)", rule: edge => `border-${edge}: 2px solid var(--sk-ink);`,
  heading: (h, side) => `${h} { display: flex; align-items: center; gap: 12px; }
${h}::before { content: ""; flex: none; width: 30px; height: 20px; background: ${slashes("left")}; }
${h}::after { content: ""; flex: 1; min-width: 24px; height: 12px; background: ${DOTS_LINE}; mask-image: linear-gradient(90deg, #000, #0000); opacity: .5; }${side === "center" ? `\n${h} { justify-content: center; }` : ""}`,
  tabOn: "color: var(--sk-heading); box-shadow: inset 0 -4px 0 var(--sk-pop);",
  title: `${TITLE_TYPE} color: var(--sk-title); text-shadow: ${stroke("var(--sk-title-edge)", 3)}, 6px 7px 0 var(--sk-title-drop); padding: 4px 8px 10px 4px;`,
  titleSizes: [54, 42, 30],
  tagline: `display: inline-block; padding: 6px 16px; border: 2px solid ${INK}; border-radius: 999px; background: #fff; color: ${INK}; font: 500 15.5px/1.4 var(--font-reading); box-shadow: 3px 3px 0 #ff8fb5; text-shadow: none;`,
  eyebrow: `display: inline-block; padding: 3px 12px; border: 2px solid ${INK}; border-radius: 999px; background: #7cc8ff; color: ${INK}; ${SMALL} font-size: 10.5px; text-shadow: none;`,
  titleOnArt: `color: #fff; text-shadow: ${stroke(INK, 3)}, 6px 7px 0 #ff8fb5;`,
  nav: `justify-content: flex-start; gap: 6px; padding: 9px 26px; border-top: 2px solid ${INK}; background: ${INK};`,
  navLink: "padding: 6px 14px; border: 0; border-radius: 999px; color: #fff; font: 700 12.5px var(--font-sans); letter-spacing: .08em;",
  navOn: `background: #ff8fb5; color: ${INK}; border: 0;`,
  scene: {
    height: 380, align: "left",
    pad: ["40px 430px 150px 44px", "34px 300px 150px 32px", "22px 18px 170px"],
    back: SKY,
    boxes: [{
      css: "right: 0; bottom: 0; width: 640px; height: 300px; transform-origin: bottom right;", layers: STREET,
      mid: "scale: .74;", phone: "scale: .52;",
    }],
    edge: `border: 2px solid ${INK}; border-radius: var(--radius);`,
  },
  mini: MINI,
  cardLabel: "Character profile",
  extra: {
    forum: `/* The strip above the banner keeps the panel's shadow off, and the banner gets it instead. */
.board-head { box-shadow: 6px 6px 0 var(--sk-pop); margin-bottom: 8px; }
.board-bar { margin-bottom: 10px; }
/* Unread: a star. */
.unread-dot { width: 15px; height: 15px; border-radius: 0; background: var(--sk-pop); clip-path: ${star(5, .48)}; }
.tag.new { rotate: -3deg; border: 2px solid var(--sk-ink); background: #ffe14d; color: #1b2540; }
.portrait.small, .portrait.tiny { background: var(--sk-pop-2); color: #1b2540; }
/* Posts: the name on a band of screentone, the portrait as a panel of its own. */
.post-band, .post.flip .post-band { border-bottom: 2px solid var(--sk-ink); background: radial-gradient(circle, var(--sk-tone) 1.6px, #0000 2px) 0 0 / 9px 9px, color-mix(in srgb, var(--sk-pop) 24%, var(--panel)); }
.post.flip .post-band { background: radial-gradient(circle, var(--sk-tone) 1.6px, #0000 2px) 0 0 / 9px 9px, color-mix(in srgb, var(--sk-pop-2) 24%, var(--panel)); }
.post.flip { box-shadow: 5px 5px 0 var(--sk-pop-2); }
.portrait.big { border: 3px solid var(--sk-ink); border-radius: 12px; box-shadow: 5px 5px 0 var(--sk-pop); }
.post.flip .portrait.big { box-shadow: -5px 5px 0 var(--sk-pop-2); }
.portrait.big.portrait-empty { background: repeating-conic-gradient(from 0deg at 50% 120%, color-mix(in srgb, var(--sk-pop) 34%, var(--panel)) 0 5deg, var(--panel) 5deg 10deg); }
.portrait.big.portrait-empty span { color: var(--sk-heading); text-shadow: 3px 3px 0 var(--sk-pop); }
/* The GM's posts are narration boxes: a caption in a box with a yellow head. */
.post.post-gm { border-style: solid; background: var(--sk-narr); color: var(--sk-narr-ink); box-shadow: 5px 5px 0 #ffd23f; }
.post.post-gm .gm-band { border-bottom: 2px solid var(--sk-ink); background: #ffd23f; }
.post.post-gm .gm-band .post-name, .post.post-gm .gm-band small, .post.post-gm .gm-band .post-meta, .post.post-gm .gm-band .post-meta a { color: #1b2540; }
.post.post-gm .post-text { color: var(--sk-narr-ink); }
.gm-seal { border-radius: 0; clip-path: ${star(8, .72)}; background: #1b2540; color: #ffd23f; box-shadow: none; }
.mini-card { box-shadow: 5px 5px 0 var(--sk-pop); }
.mini-card::before { background: var(--sk-pop); color: #1b2540; border-bottom: 2px solid var(--sk-ink); }
.roll-card { border: 2px solid var(--sk-ink); border-left-width: 6px; }
.roll-total { border: 2px solid var(--sk-ink); border-radius: 999px; background: #ffe14d; color: #1b2540; }
.cast-chip, .today-chip { border: 2px solid var(--sk-ink); border-radius: 999px; }
.composer { border-top-style: dashed; }`,
    encyclopedia: `.note-card:hover { translate: -1px -1px; }
.picture-panel:not(.picture-empty) { box-shadow: 5px 5px 0 var(--sk-pop); }
.prose h2 { padding-bottom: 6px; border-bottom: 3px solid var(--sk-pop); }`,
    maptable: `.campaign-scene-card { box-shadow: 4px 4px 0 var(--sk-pop); }
.toolbar { border-width: 2px; box-shadow: 4px 4px 0 var(--sk-pop); }`,
  },
};

export const SAKURA_SKY: Theme = buildSkin(KIT);
