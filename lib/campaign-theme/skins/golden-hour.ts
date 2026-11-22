/*
 * Golden Hour: a fully custom skin, inspired by Southern California. The banner is the last hour of light on the
 * coast: the sun going into the Pacific between rows of tall palms, a lifeguard tower on the sand and a headland up
 * the coast. Light is late afternoon, blue going to peach; dark is the afterglow, purple over magenta over orange.
 * The campaign's name is in Pacifico over three stacked shadows, as on a surf shop's sign; headings trail three
 * stripes in sunset colours, cards carry the same sunset along their foot, portraits are instant photographs and
 * the GM's posts are postcards. Text is in Jost. No place's signs, logos or art: every shape is drawn here from
 * gradients and outlines.
 */
import type { Theme } from "../model.ts";
import { buildSkin, outline, palm, sketch, spot, type Kit } from "./kit.ts";

const SUNSET = "linear-gradient(90deg, #ffc94a, #ff8a3c 50%, #ff4f7a)";
const VARS = `:root {
  --gh-heading: #12324a; --gh-mark: #d9561f; --gh-link: #a83a14; --gh-chip: #12324a; --gh-chip-ink: #fff6e0;
  --gh-band: #fbefd9; --gh-card: #fffaf0; --gh-shadow: 0 10px 22px -16px rgba(60, 30, 20, .55);
  --gh-sky: linear-gradient(180deg, #4fb0e4 0%, #9fd8f0 44%, #ffe8c8 72%, #ffd2a4 100%);
  --gh-sun: #fff3bf; --gh-glow: rgba(255, 246, 204, .85); --gh-sea: linear-gradient(180deg, #2bb3c2, #0d7f9c); --gh-glint: rgba(255, 255, 255, .8);
  --gh-sand: #f3dfb4; --gh-hill: #3f7f76; --gh-streak: rgba(255, 255, 255, .85); --gh-palm: #143836; --gh-star: transparent;
  --gh-title: #12324a; --gh-t1: #ffc94a; --gh-t2: #ff8a3c; --gh-t3: #ff5f7a; --gh-tag: #12324a; --gh-nav: #12324a;
}
:root[data-theme="dark"] {
  --gh-heading: #ffe9c9; --gh-mark: #ff9a4a; --gh-link: #ffb877; --gh-chip: #ffb054; --gh-chip-ink: #2a1220;
  --gh-band: #2e1c40; --gh-card: #2b1a3c; --gh-shadow: 0 0 0 1px rgba(0, 0, 0, .4), 0 12px 24px -16px #000;
  --gh-sky: linear-gradient(180deg, #170c36 0%, #55206c 34%, #c2386e 60%, #ff7a45 82%, #ffc266 100%);
  --gh-sun: #ffd45a; --gh-glow: rgba(255, 170, 90, .55); --gh-sea: linear-gradient(180deg, #6a2f72, #1e1240); --gh-glint: rgba(255, 196, 120, .85);
  --gh-sand: #2a1830; --gh-hill: #25123c; --gh-streak: rgba(255, 176, 150, .5); --gh-palm: #0d0616; --gh-star: rgba(255, 255, 255, .85);
  --gh-title: #fff3d6; --gh-t1: #ff9a4a; --gh-t2: #ff4f7a; --gh-t3: #7a2f9a; --gh-tag: #ffe9c9; --gh-nav: #140a20;
}`;

const quad = (x: number, y: number, w: number, h: number) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
/* A lifeguard tower: a cabin on legs with a ramp down to the sand and a flag. */
const TOWER = (x: number) => [
  quad(x + 6, 0, 5, 58), quad(x + 59, 0, 5, 58), [[x + 9, 6], [x + 62, 50], [x + 59, 54], [x + 6, 10]],
  quad(x - 6, 56, 84, 5), quad(x + 2, 61, 66, 44), [[x - 8, 105], [x + 78, 105], [x + 66, 120], [x + 4, 120]],
  [[x + 78, 56], [x + 132, 0], [x + 140, 0], [x + 84, 61]], quad(x + 34, 120, 2, 34), quad(x + 36, 142, 20, 12),
];
const RIGHT = outline(430, 330, [...palm(300, 306, -34), ...palm(190, 236, 28, .86), ...palm(388, 196, 22, .72)]);
const LEFT = outline(300, 320, [...palm(64, 284, 30, .95), ...TOWER(128)]);

/* The coast, back to front: the sky, streaks of cloud, the sun and its glow, the sea with the sun's path on it, a headland, sand and foam. */
const k = sketch();
const streak = (x: number, y: number, w: number) => spot("radial-gradient(closest-side, var(--gh-streak) 60%, #0000)", x, y, w, 9);
const glint = (up: number, w: number) => spot("linear-gradient(var(--gh-glint) 0 0)", 50, 100, w, 3, 0, -up);
const STARS = [[6, 8], [15, 22], [27, 6], [38, 16], [61, 10], [72, 24], [84, 7], [93, 18]].map(([x, y]) => `radial-gradient(1.3px 1.3px at ${x}% ${y}%, var(--gh-star) 55%, #0000)`);
const SKY = [
  ...STARS,
  k.rect("var(--gh-sand)", 0, 0, 100, 7),
  glint(34, 150), glint(44, 110), glint(54, 190), glint(64, 80), glint(74, 130), glint(84, 220),
  k.dome("var(--gh-hill)", -14, 24, 46, 11), k.dome("var(--gh-hill)", 16, 24, 30, 6),
  k.fill("var(--gh-sea)", 0, 0, 100, 24.4),
  spot("radial-gradient(closest-side, var(--gh-sun) calc(100% - 1px), #0000)", 50, 100, 150, 150, 0, -24),
  "radial-gradient(ellipse 46% 70% at 50% 76%, var(--gh-glow), #0000)",
  streak(22, 30, 260), streak(30, 38, 170), streak(74, 24, 240), streak(68, 44, 150), streak(46, 14, 200),
  "var(--gh-sky)",
];
const MINI = [
  k.rect("var(--gh-sand)", 0, 0, 100, 10), k.fill("var(--gh-sea)", 0, 0, 100, 34),
  spot("radial-gradient(closest-side, var(--gh-sun) calc(100% - 1px), #0000)", 50, 64, 58, 58), "radial-gradient(ellipse 60% 70% at 50% 70%, var(--gh-glow), #0000)", "var(--gh-sky)",
].join(", ");

const TITLE_TYPE = "font-family: var(--font-sans); font-weight: 600; letter-spacing: .01em;";
const SCRIPT = "font-family: var(--font-display); font-weight: 400; letter-spacing: 0;";
const SMALL = "font-family: var(--font-sans); font-weight: 500; text-transform: uppercase; letter-spacing: .14em;";
const FRAME = `border: 1px solid var(--line); border-radius: var(--radius); background: ${SUNSET} left bottom / 100% 4px no-repeat, var(--panel); box-shadow: var(--gh-shadow);`;
const BTN_BASE = "border-radius: 999px; font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .1em;";
const STRIPES = "linear-gradient(#ffc94a 0 0) 0 0 / 100% 3px no-repeat, linear-gradient(#ff8a3c 0 0) 0 5px / 100% 3px no-repeat, linear-gradient(#ff4f7a 0 0) 0 10px / 100% 3px no-repeat";
const SUN_MARK = "radial-gradient(circle, #ffe08a 0 40%, #0000 42%), repeating-conic-gradient(#ff8a3c 0 15deg, #0000 15deg 30deg)";

const KIT: Kit = {
  id: "preset-golden-hour", name: "Golden Hour", inspired: "Southern California", p: "gh",
  about: "The sun going into the Pacific between tall palms, with a surf sign's script and three sunset stripes.",
  radius: 12, fonts: { display: "pacifico", reading: "jost", ui: "jost" },
  colors: {
    light: { bg: "#f8eedb", panel: "#fffaf0", raised: "#f5e8d0", line: "#e2cda6", ink: "#2a2233", muted: "#665965", accent: "#b9461a", accent2: "#0b6f89" },
    dark: { bg: "#190f25", panel: "#241634", raised: "#2e1c40", line: "#4a2f5c", ink: "#fdeede", muted: "#c9aec0", accent: "#ffb054", accent2: "#ff7fae" },
  },
  vars: VARS,
  page: "background: radial-gradient(ellipse 100% 520px at 50% 0, color-mix(in srgb, var(--gh-mark) 14%, transparent), transparent), var(--bg);",
  select: "background: #ffc94a; color: #2a1220;", scroll: "var(--gh-mark) var(--panel)",
  hi: "var(--gh-heading)", mark: "var(--gh-mark)", link: "var(--gh-link)",
  frame: FRAME, frameOn: "border-color: var(--gh-mark);", corner: "8px",
  titleType: TITLE_TYPE, small: SMALL,
  btn: `${BTN_BASE} border: 0; background: ${SUNSET}; color: #2a1220 !important;`,
  btnOn: "background: linear-gradient(90deg, #ffd874, #ffa25e 50%, #ff7396); color: #2a1220;",
  ghost: `${BTN_BASE} border: 2px solid var(--gh-mark); background: transparent; color: var(--ink) !important;`,
  ghostOn: "border-color: var(--gh-mark); background: color-mix(in srgb, var(--gh-mark) 16%, transparent); color: var(--ink);",
  chip: "border: 0; border-radius: 6px; background: var(--gh-chip); color: var(--gh-chip-ink);",
  bar: "var(--panel)", rule: edge => `border-${edge}: 1px solid var(--line);`,
  heading: (h, side) => `${h} { display: flex; align-items: center; gap: 14px; ${SCRIPT} }
${h}::before { content: ""; flex: none; width: 28px; height: 14px; border-radius: 28px 28px 0 0; background: linear-gradient(180deg, #ffc94a, #ff8a3c); }
${h}::after { content: ""; flex: 1; min-width: 24px; height: 13px; background: ${STRIPES}; mask-image: linear-gradient(90deg, #000 20%, #0000); }${side === "center" ? `
${h} { justify-content: center; }
${h}::before { flex: 1; min-width: 24px; width: auto; height: 13px; border-radius: 0; background: ${STRIPES}; mask-image: linear-gradient(270deg, #000 20%, #0000); }` : ""}`,
  tabOn: "color: var(--gh-heading); box-shadow: inset 0 -3px 0 var(--gh-mark);",
  title: `${SCRIPT} color: var(--gh-title); text-shadow: 0 3px 0 var(--gh-t1), 0 6px 0 var(--gh-t2), 0 9px 0 var(--gh-t3); padding: 6px 12px 14px; line-height: 1.24;`,
  titleSizes: [64, 52, 36],
  tagline: "font: 500 15px/1.5 var(--font-sans); letter-spacing: .16em; text-transform: uppercase; color: var(--gh-tag); text-shadow: none;",
  eyebrow: `display: inline-block; padding: 4px 12px; border-radius: 6px; background: #12324a; color: #fff6e0; ${SMALL} font-size: 10.5px; text-shadow: none;`,
  titleOnArt: "color: #fff3d6; text-shadow: 0 3px 0 #ff9a4a, 0 6px 0 #ff4f7a, 0 9px 0 #7a2f9a;",
  nav: "justify-content: center; padding: 0 20px; border-top: 0; background: var(--gh-nav);",
  navLink: "padding: 13px 18px 11px; color: #fff6e0; font: 500 12.5px var(--font-sans); letter-spacing: .18em;",
  navOn: "color: #ffc94a; border-bottom-color: #ff8a3c;",
  scene: {
    height: 420, align: "center",
    pad: ["54px 240px 180px", "46px 170px 176px", "30px 20px 180px"],
    back: SKY,
    boxes: [
      { css: `right: 0; bottom: 0; width: 430px; height: 330px; transform-origin: bottom right; background: var(--gh-palm);`, shape: RIGHT, mid: "scale: .74;", phone: "scale: .5;" },
      { css: `left: 0; bottom: 0; width: 300px; height: 320px; transform-origin: bottom left; background: var(--gh-palm);`, shape: LEFT, mid: "scale: .72;", phone: "scale: .5;" },
    ],
    edge: "border: 1px solid var(--line); border-radius: var(--radius);",
  },
  mini: MINI,
  cardLabel: "Wish you were here",
  extra: {
    forum: `.board-bar { margin-bottom: 10px; background: var(--panel); }
.board-head { box-shadow: var(--gh-shadow); }
.board-head.has-art .board-tagline { color: #fff3d6; }
.tag.new { border: 0; background: ${SUNSET}; color: #2a1220; }
/* Unread: a small sun. */
.unread-dot { width: 12px; height: 12px; background: #ffc94a; box-shadow: 0 0 0 3px #ff8a3c; }
.topic-row.pinned { box-shadow: inset 5px 0 0 var(--accent-2), var(--gh-shadow); }
.topic-row.picked { box-shadow: inset 5px 0 0 var(--gh-mark), var(--gh-shadow); }
.portrait.small, .portrait.tiny { border: 2px solid #ffffff; box-shadow: 0 0 0 2px var(--gh-mark); background: #12324a; color: #fff6e0; }
.forum-art, .location-art { border-right: 0; }
.forum-location { overflow: hidden; }
.forum-name, .topic-name, .location-name { font-weight: 600; }
/* Posts: the name over the sunset, the portrait as an instant photograph, a little askew. */
.post-band, .post.flip .post-band { border-bottom: 0; padding-bottom: 14px; background: ${SUNSET} left bottom / 100% 3px no-repeat, var(--gh-band); }
.post { background: var(--panel); }
.portrait.big { box-sizing: border-box; border: 10px solid #ffffff; border-bottom-width: 36px; border-radius: 3px; rotate: -1.4deg; box-shadow: 0 8px 16px -8px rgba(0, 0, 0, .6); background: #12324a; }
.post.flip .portrait.big { rotate: 1.4deg; }
.portrait.big.portrait-empty { background: linear-gradient(180deg, #5a1f6e, #c2386e 55%, #ff8a3c); }
.portrait.big.portrait-empty span { font: 400 84px var(--font-display); color: #fff3d6; }
/* The GM's posts are postcards: a sunset across the top and a sun for a stamp. */
.post.post-gm { border-color: var(--gh-mark); background: var(--gh-card); }
.post.post-gm .gm-band { border-bottom: 0; background: ${SUNSET}; }
.post.post-gm .gm-band .post-name, .post.post-gm .gm-band small, .post.post-gm .gm-band .post-meta, .post.post-gm .gm-band .post-meta a { color: #2a1220; }
.gm-seal { background: ${SUN_MARK}; color: #7a2a00; box-shadow: 0 0 0 3px #fff6e0; }
.mini-card { border-width: 1px; background: ${SUNSET} left bottom / 100% 4px no-repeat, var(--panel); }
.mini-card::before { background: ${SUNSET}; color: #2a1220; }
.mini-name { ${SCRIPT} font-size: 24px; }
.roll-total { border-radius: 999px; background: #12324a; color: #fff6e0; }
.cast-chip, .today-chip { border-radius: 999px; }
.post-name { font-weight: 600; }`,
    phone: ".portrait.big { border-width: 6px; border-bottom-width: 20px; }",
    encyclopedia: `.article-title h1 { ${SCRIPT} }
.prose h2 { padding-bottom: 16px; background: ${STRIPES.replace(/ 0 (\d+)px \//g, (_, y) => ` left 0 bottom ${10 - +y}px /`).replace(/100% 3px/g, "110px 3px")}; }
.picture-panel:not(.picture-empty) { border: 10px solid #ffffff; border-bottom-width: 30px; border-radius: 3px; box-shadow: 0 8px 16px -8px rgba(0, 0, 0, .6); }
.dashboard-intro { box-shadow: var(--gh-shadow); }`,
    dashboard: ".hub-head { box-shadow: var(--gh-shadow); }",
    maptable: ".campaign-scenes-head { box-shadow: var(--gh-shadow); }\n.toolbar { border-color: var(--line); }",
  },
};

export const GOLDEN_HOUR: Theme = buildSkin(KIT);
