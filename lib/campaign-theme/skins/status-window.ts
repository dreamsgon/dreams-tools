/*
 * Status Window: a fully custom skin, inspired by isekai stories, where someone wakes in another world that has
 * levels, skills and a voice that announces them. The banner is the moment of arrival: a summoning circle lit on the
 * grass with a column of light above it, a castle on its hill and mountains behind. Light is a clear day in the new
 * world and dark is its night under two moons. Everything else is the system's own windows: glass panels with a
 * bright edge and gold brackets at their corners, a gold diamond for anything unread, the GM's posts as notices from
 * the system and the character card as a status screen. Titles are in Marcellus, text in Source Serif and labels in
 * Chakra Petch. No series' characters, windows or art: every shape is drawn here from gradients.
 */
import type { Theme } from "../model.ts";
import { buildSkin, canvas, sketch, spot, type Kit } from "./kit.ts";

const VARS = `:root {
  --sw-cyan: #1d7fd1; --sw-edge: #7fb0e6; --sw-gold: #b07a00; --sw-gold-ink: #7a5200; --sw-heading: #14233d; --sw-link: #1a56bd;
  --sw-glass: linear-gradient(180deg, #fbfdff, #eef5ff); --sw-sys: linear-gradient(180deg, #fffdf4, #fff6dc); --sw-chip: #dfecfb; --sw-chip-ink: #173a6b;
  --sw-btn: #1d5fd1; --sw-btn-on: #174fb0; --sw-btn-ink: #ffffff; --sw-shadow: 0 0 0 1px rgba(255, 255, 255, .7), 0 10px 22px -14px rgba(29, 95, 209, .55);
  --sw-sky: linear-gradient(180deg, #4f9df0 0%, #a5d2fb 46%, #eaf6dc 78%);
  --sw-m1: #7fa0cf; --sw-m2: #a9c3e6; --sw-ground: linear-gradient(180deg, #9fd69a, #5fae7c); --sw-beam: rgba(255, 255, 255, .5); --sw-glow: rgba(255, 255, 255, .85);
  --sw-ring: #ffffff; --sw-moon: rgba(255, 255, 255, .6); --sw-moon2: transparent; --sw-star: transparent;
  --sw-castle: #4c68a6; --sw-win: #ffe9a8; --sw-flag: #d1373f;
  --sw-title: #14233d; --sw-title-shadow: 0 0 6px #ffffff, 0 0 18px #ffffff, 0 0 30px rgba(255, 255, 255, .9); --sw-nav: rgba(16, 36, 74, .92);
}
:root[data-theme="dark"] {
  --sw-cyan: #6fc3ff; --sw-edge: #3f78c2; --sw-gold: #ffd36a; --sw-gold-ink: #ffd36a; --sw-heading: #ffffff; --sw-link: #8fd0ff;
  --sw-glass: linear-gradient(180deg, rgba(22, 40, 78, .96), rgba(12, 22, 46, .96)); --sw-sys: linear-gradient(180deg, #1c1a12, #12162a); --sw-chip: #12294f; --sw-chip-ink: #cfe6ff;
  --sw-btn: #6fc3ff; --sw-btn-on: #a3d9ff; --sw-btn-ink: #06122a; --sw-shadow: 0 0 0 1px rgba(0, 0, 0, .5), 0 0 22px -8px rgba(111, 195, 255, .6);
  --sw-sky: linear-gradient(180deg, #04081a 0%, #0f1b46 48%, #2c4187 78%);
  --sw-m1: #0c1532; --sw-m2: #16234e; --sw-ground: linear-gradient(180deg, #0d2a3a, #06121e); --sw-beam: rgba(127, 224, 255, .2); --sw-glow: rgba(127, 224, 255, .6);
  --sw-ring: #8fe6ff; --sw-moon: #4666b8; --sw-moon2: #b0609a; --sw-star: rgba(255, 255, 255, .85);
  --sw-castle: #060b1e; --sw-win: #ffd98a; --sw-flag: #ff6f7a;
  --sw-title: #eef6ff; --sw-title-shadow: 0 0 6px #2d8fff, 0 0 18px #2d8fff, 0 0 34px #1565ff; --sw-nav: rgba(4, 9, 24, .9);
}`;

/* The castle on its hill, in a box 330 wide and 250 tall: a keep, four towers with pointed roofs, a wall with its battlements, lit windows and a flag. */
const c = canvas(330, 250), STONE = "var(--sw-castle)";
const tower = (x: number, w: number, h: number, roof: number) => [c.tri(STONE, x - 5, 56 + h, w + 10, roof), c.rect(STONE, x, 56, w, h)];
const CASTLE = [
  c.rect("var(--sw-flag)", 166, 236, 16, 8), c.rect(STONE, 164, 208, 2, 38),
  c.rect("var(--sw-win)", 104, 150, 6, 13), c.rect("var(--sw-win)", 232, 132, 6, 13), c.rect("var(--sw-win)", 150, 112, 8, 16), c.rect("var(--sw-win)", 172, 112, 8, 16),
  c.rect("var(--sw-win)", 68, 100, 5, 10), c.rect("var(--sw-win)", 262, 92, 5, 10), c.dome("var(--sw-win)", 154, 56, 22, 26),
  ...tower(94, 26, 122, 46), ...tower(222, 26, 104, 42), ...tower(60, 20, 70, 30), ...tower(254, 20, 62, 28),
  c.tri(STONE, 124, 152, 82, 58), c.rect(STONE, 130, 56, 70, 96),
  c.fill(`repeating-linear-gradient(90deg, ${STONE} 0 8px, #0000 8px 14px)`, 50, 84, 232, 7), c.rect(STONE, 50, 56, 232, 28),
  c.dome(STONE, -30, 0, 390, 62),
];

/* The summoning circle, flat on the grass: rings, and marks around them like the hours on a clock. */
const RINGS = "radial-gradient(closest-side, var(--sw-ring) 0 7%, #0000 8% 33%, var(--sw-ring) 34% 36%, #0000 37% 57%, var(--sw-ring) 58% 61%, #0000 62% 85%, var(--sw-ring) 86% 90%, #0000 91% 95%, var(--sw-ring) 96% 99%, #0000)";
const MARKS = "repeating-conic-gradient(var(--sw-ring) 0 2.5deg, #0000 2.5deg 15deg)";
const SHOWN = "radial-gradient(closest-side, #000 0 8%, #0000 8% 33%, #000 34% 61%, #0000 62% 66%, #000 67% 81%, #0000 82% 85%, #000 86% 90%, #0000 91% 95%, #000 96% 99%, #0000)";

const k = sketch();
const STARS = [[4, 9], [11, 28], [21, 14], [34, 6], [41, 26], [57, 10], [66, 24], [77, 7], [88, 20], [95, 9]].map(([x, y]) => `radial-gradient(1.3px 1.3px at ${x}% ${y}%, var(--sw-star) 55%, #0000)`);
const disc = (fill: string, x: number, y: number, w: number) => spot(`radial-gradient(closest-side, ${fill} calc(100% - 1px), #0000)`, x, y, w, w);
const SKY = [
  ...STARS,
  "radial-gradient(ellipse 26% 12% at 50% 80%, var(--sw-glow), #0000)",
  k.fill("var(--sw-ground)", 0, 0, 100, 34),
  "linear-gradient(90deg, #0000 41%, var(--sw-beam) 47% 53%, #0000 59%)",
  k.tri("var(--sw-m1)", -10, 34, 30, 14), k.tri("var(--sw-m1)", 74, 34, 34, 16), k.tri("var(--sw-m1)", 30, 34, 22, 8),
  k.tri("var(--sw-m2)", 4, 34, 34, 24), k.tri("var(--sw-m2)", 56, 34, 30, 27), k.tri("var(--sw-m2)", 84, 34, 26, 19),
  disc("var(--sw-moon)", 9, 9, 92), disc("var(--sw-moon2)", 19, 30, 34),
  "var(--sw-sky)",
];
const MINI = [
  "radial-gradient(ellipse 34% 12% at 50% 82%, var(--sw-glow), #0000)", k.fill("var(--sw-ground)", 0, 0, 100, 30),
  "linear-gradient(90deg, #0000 38%, var(--sw-beam) 46% 54%, #0000 62%)", k.tri("var(--sw-m2)", 0, 30, 60, 36), k.tri("var(--sw-m1)", 50, 30, 56, 26), "var(--sw-sky)",
].join(", ");

const TITLE_TYPE = "font-family: var(--font-display); font-weight: 400; letter-spacing: .02em;";
const SMALL = "font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .12em;";
/* Brackets at a window's four corners. */
const corners = (colour: string, size = 14) => ["0 0", "100% 0", "0 100%", "100% 100%"].flatMap(at => [`linear-gradient(${colour} 0 0) ${at} / ${size}px 2px no-repeat`, `linear-gradient(${colour} 0 0) ${at} / 2px ${size}px no-repeat`]).join(", ");
const FRAME = `border: 1px solid var(--sw-edge); border-radius: var(--radius); background: ${corners("var(--sw-gold)")}, var(--sw-glass); box-shadow: var(--sw-shadow);`;
const BTN_BASE = "border-radius: 3px; font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .1em;";
const DIAMOND = "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)";

const KIT: Kit = {
  id: "preset-status-window", name: "Status Window", inspired: "Isekai", p: "sw",
  about: "A summoning circle, a castle on its hill, and every panel a window from the system of another world.",
  radius: 4, fonts: { display: "marcellus", reading: "source", ui: "chakra" },
  colors: {
    light: { bg: "#e6effb", panel: "#f8fbff", raised: "#e3edfa", line: "#b7cdea", ink: "#14233d", muted: "#4a5d7c", accent: "#1d5fd1", accent2: "#8a5e00" },
    dark: { bg: "#070d1c", panel: "#0e1830", raised: "#13213f", line: "#24406e", ink: "#e6f1ff", muted: "#94a9c9", accent: "#6fc3ff", accent2: "#ffd36a" },
  },
  vars: VARS,
  page: "background: radial-gradient(ellipse 90% 480px at 50% 0, color-mix(in srgb, var(--sw-cyan) 16%, transparent), transparent), var(--bg);",
  select: "background: var(--sw-cyan); color: var(--sw-btn-ink);", scroll: "var(--sw-edge) var(--bg)",
  hi: "var(--sw-heading)", mark: "var(--sw-cyan)", link: "var(--sw-link)",
  frame: FRAME, frameOn: "border-color: var(--sw-gold);", corner: "3px",
  titleType: TITLE_TYPE, small: SMALL,
  btn: `${BTN_BASE} border: 1px solid var(--sw-btn); background: var(--sw-btn); color: var(--sw-btn-ink) !important;`,
  btnOn: "border-color: var(--sw-btn-on); background: var(--sw-btn-on); color: var(--sw-btn-ink);",
  ghost: `${BTN_BASE} border: 1px solid var(--sw-edge); background: color-mix(in srgb, var(--sw-cyan) 8%, transparent); color: var(--ink) !important;`,
  ghostOn: "border-color: var(--sw-cyan); background: color-mix(in srgb, var(--sw-cyan) 22%, transparent); color: var(--ink);",
  chip: "border: 1px solid var(--sw-edge); border-radius: 2px; background: var(--sw-chip); color: var(--sw-chip-ink);",
  bar: "var(--panel)", rule: edge => `border-${edge}: 1px solid var(--sw-edge);`,
  heading: (h, side) => `${h} { display: flex; align-items: center; gap: 12px; }
${h}::before { content: ""; flex: none; width: 13px; height: 13px; background: var(--sw-gold); clip-path: ${DIAMOND}; }
${h}::after { content: ""; flex: 1; min-width: 28px; height: 7px; background: linear-gradient(var(--sw-cyan) 0 0) 0 0 / 100% 1px no-repeat, linear-gradient(var(--sw-cyan) 0 0) 0 100% / 34% 3px no-repeat; mask-image: linear-gradient(90deg, #000 40%, #0000); }${side === "center" ? `\n${h} { justify-content: flex-start; }` : ""}`,
  tabOn: "color: var(--sw-heading); box-shadow: inset 0 -3px 0 var(--sw-gold);",
  title: `${TITLE_TYPE} color: var(--sw-title); text-shadow: var(--sw-title-shadow);`,
  titleSizes: [58, 46, 32],
  tagline: `display: inline-block; padding: 7px 16px; border: 1px solid var(--sw-edge); border-radius: 3px; background: ${corners("var(--sw-gold)", 8)}, var(--sw-glass); color: var(--ink); font: 500 14px/1.5 var(--font-sans); letter-spacing: .06em; text-shadow: none;`,
  eyebrow: `display: inline-block; padding: 3px 10px; border: 1px solid var(--sw-gold); border-radius: 2px; background: var(--sw-sys); color: var(--sw-gold-ink); ${SMALL} font-size: 10.5px; text-shadow: none;`,
  titleOnArt: "color: #eef6ff; text-shadow: 0 0 6px #2d8fff, 0 0 18px #1565ff, 0 3px 14px rgba(0, 0, 0, .7);",
  nav: "justify-content: center; gap: 6px; padding: 0 20px; border-top: 1px solid var(--sw-edge); background: var(--sw-nav);",
  navLink: "padding: 13px 18px 11px; color: #dbe9ff; font: 600 12.5px var(--font-sans); letter-spacing: .16em;",
  navOn: "color: #ffd36a; border-bottom-color: #ffd36a;",
  scene: {
    height: 420, align: "center",
    pad: ["48px 250px 178px", "40px 150px 170px", "26px 18px 172px"],
    back: SKY,
    boxes: [
      { css: "right: 24px; bottom: 0; width: 330px; height: 250px; transform-origin: bottom right;", layers: CASTLE, mid: "right: 0; scale: .66;", phone: "scale: .44;" },
      { css: `left: 50%; bottom: 10px; width: 420px; height: 420px; translate: -50% 0; transform-origin: 50% 100%; transform: scaleY(.22); border-radius: 50%; background: ${RINGS}, ${MARKS}; mask-image: ${SHOWN};`, mid: "scale: .82;", phone: "scale: .6;" },
    ],
    edge: "border: 1px solid var(--sw-edge); border-radius: var(--radius);",
  },
  mini: MINI,
  cardLabel: "Status",
  extra: {
    forum: `.board-bar { margin-bottom: 10px; }
.board-head { box-shadow: var(--sw-shadow); }
.tag.new { border: 1px solid var(--sw-gold); background: var(--sw-sys); color: var(--sw-gold-ink); }
/* Unread: a gold diamond, the mark of something new from the system. */
.unread-dot { width: 13px; height: 13px; border-radius: 0; background: var(--sw-gold); clip-path: ${DIAMOND}; }
.topic-row.pinned { box-shadow: inset 4px 0 0 var(--sw-gold), var(--sw-shadow); }
.topic-row.picked { box-shadow: inset 4px 0 0 var(--sw-cyan), var(--sw-shadow); }
.portrait.small, .portrait.tiny { border: 1px solid var(--sw-edge); border-radius: 3px; background: var(--sw-chip); color: var(--sw-chip-ink); }
.forum-art, .location-art { border-right: 1px solid var(--sw-edge); }
.forum-location { overflow: hidden; }
/* Posts: the name on the window's bar, the portrait framed in gold. */
.post-band, .post.flip .post-band { border-bottom: 1px solid var(--sw-edge); background: linear-gradient(90deg, color-mix(in srgb, var(--sw-cyan) 24%, transparent), transparent 70%); }
.post.flip .post-band { background: linear-gradient(270deg, color-mix(in srgb, var(--sw-cyan) 24%, transparent), transparent 70%); }
.post-name { letter-spacing: .03em; }
.portrait.big { border: 1px solid var(--sw-edge); border-radius: 3px; box-shadow: 0 0 0 4px var(--panel), 0 0 0 5px var(--sw-gold); margin: 6px 6px 10px; background: var(--sw-chip); }
.portrait.big.portrait-empty span { font: 400 88px var(--font-display); color: var(--sw-heading); }
/* The GM's posts are notices from the system: gold where every other window is blue. */
.post.post-gm { border-color: var(--sw-gold); background: ${corners("var(--sw-gold)", 22)}, var(--sw-sys); }
.post.post-gm .gm-band { border-bottom: 1px solid var(--sw-gold); background: linear-gradient(90deg, color-mix(in srgb, var(--sw-gold) 26%, transparent), transparent 75%); }
.post.post-gm .gm-band .post-name { color: var(--sw-gold-ink); letter-spacing: .08em; text-transform: uppercase; }
.gm-seal { border-radius: 3px; background: var(--sw-gold); color: var(--panel); box-shadow: 0 0 0 3px var(--panel), 0 0 0 4px var(--sw-gold); }
.mini-card { border: 1px solid var(--sw-edge); background: var(--sw-glass); }
.mini-card::before { background: linear-gradient(90deg, var(--sw-btn), color-mix(in srgb, var(--sw-btn) 55%, transparent)); color: var(--sw-btn-ink); }
.mini-traits .chip { border-radius: 2px; }
.roll-card { border: 1px solid var(--sw-edge); }
.roll-total { border-radius: 3px; background: var(--sw-gold); color: var(--panel); }
.cast-chip, .today-chip { border-radius: 3px; }`,
    encyclopedia: `.prose h2 { padding-bottom: 8px; border-bottom: 1px solid var(--sw-edge); }
.picture-panel:not(.picture-empty) { border: 1px solid var(--sw-edge); box-shadow: 0 0 0 4px var(--panel), 0 0 0 5px var(--sw-gold); margin: 5px; }
.dashboard-intro { box-shadow: var(--sw-shadow); }`,
    dashboard: ".hub-head { box-shadow: var(--sw-shadow); }",
    maptable: ".campaign-scenes-head { box-shadow: var(--sw-shadow); }\n.toolbar { border-color: var(--sw-edge); }",
  },
};

export const STATUS_WINDOW: Theme = buildSkin(KIT);
