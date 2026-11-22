/*
 * Rainbow Meadow: a fully custom skin, inspired by My Little Pony and the pastel cartoons around it. The banner is a
 * rainbow over rolling hills, with clouds at its feet and sparkles in the sky; light is a sunny morning and dark is
 * the same meadow under the moon, with the rainbow turned to a soft night glow. Everything is round: pill buttons,
 * cards with a candy edge under them, portraits in rings of colour, a rainbow line under each post's name, a heart
 * for unread and a star for the GM. Titles are in Fredoka, text in Nunito. No characters, names, marks or art from
 * any show or toy line: every shape is drawn here from gradients.
 */
import type { Theme } from "../model.ts";
import { buildSkin, scatter, sketch, spot, star, stroke, type Kit } from "./kit.ts";

const VARS = `:root {
  --rm-edge: #efc3e3; --rm-under: #e3b8f0; --rm-heading: #6b2fa0; --rm-mark: #d83f97; --rm-link: #b3247b;
  --rm-chip: #ecdfff; --rm-chip-ink: #3c2a5a; --rm-band: #fff0f8; --rm-story: #fffaea; --rm-story-band: #ffefb0;
  --rm-sky: linear-gradient(180deg, #8fcbff 0%, #bfe2ff 40%, #ffe1f2 80%, #fff2d6 100%);
  --rm-r1: #ff7fbf; --rm-r2: #ffab6e; --rm-r3: #ffe066; --rm-r4: #8fe0a0; --rm-r5: #7fc0ff; --rm-r6: #b999f2;
  --rm-cloud: #ffffff; --rm-cloud-2: #f1e4ff;
  --rm-hill-1: #9be3a8; --rm-hill-2: #b9ecb0; --rm-hill-3: #cfe9d9; --rm-bloom: #ff8fc7; --rm-bloom-2: #fff3a8;
  --rm-spark: #ffffff; --rm-star: transparent; --rm-moon: transparent; --rm-moon-cut: transparent; --rm-glow: rgba(255, 255, 255, .7);
  --rm-title: #ff4fa8; --rm-title-edge: #ffffff; --rm-title-drop: #8a4fd6;
}
:root[data-theme="dark"] {
  --rm-edge: #57408f; --rm-under: #3b2873; --rm-heading: #ffd6f2; --rm-mark: #ff8fd0; --rm-link: #ffb3e0;
  --rm-chip: #3b2873; --rm-chip-ink: #f4eaff; --rm-band: #2a1b55; --rm-story: #2b2050; --rm-story-band: #4a3a1f;
  --rm-sky: linear-gradient(180deg, #100830 0%, #26135e 45%, #55298a 82%, #7d3a96 100%);
  --rm-r1: rgba(255, 127, 191, .8); --rm-r2: rgba(255, 171, 110, .8); --rm-r3: rgba(255, 224, 102, .8); --rm-r4: rgba(143, 224, 160, .8); --rm-r5: rgba(127, 192, 255, .8); --rm-r6: rgba(185, 153, 242, .8);
  --rm-cloud: #b7a2ec; --rm-cloud-2: #8a72c9;
  --rm-hill-1: #233a72; --rm-hill-2: #2c2f7d; --rm-hill-3: #44308c; --rm-bloom: #ff8fd0; --rm-bloom-2: #9ad8ff;
  --rm-spark: #fff6c9; --rm-star: rgba(255, 255, 255, .9); --rm-moon: #fff3cf; --rm-moon-cut: #150b3b; --rm-glow: transparent;
  --rm-title: #ffa3da; --rm-title-edge: #1c0f4a; --rm-title-drop: #6fc3ff;
}`;

const RAINBOW_LINE = "linear-gradient(90deg, #ff7fbf 0 16.6%, #ffab6e 16.6% 33.3%, #ffe066 33.3% 50%, #8fe0a0 50% 66.6%, #7fc0ff 66.6% 83.3%, #b999f2 83.3%)";
const HEART = "polygon(50% 100%, 8% 56%, 0 32%, 7% 12%, 24% 2%, 41% 7%, 50% 22%, 59% 7%, 76% 2%, 93% 12%, 100% 32%, 92% 56%)";

/* The meadow, back to front: the sky, the rainbow, hills, clouds at the rainbow's feet, flowers, the moon, stars and sparkles. */
const rnd = scatter(21), k = sketch();
const arc = (at: string, rx: number, ry: number, from: number, step: number) =>
  `radial-gradient(ellipse ${rx}% ${ry}% at ${at}, #0000 ${from}%, ${[1, 2, 3, 4, 5, 6].map(i => `var(--rm-r${7 - i}) ${from + step * (i - 1)}% ${from + step * i}%`).join(", ")}, #0000 ${from + step * 6 + .3}%)`;
const puff = (x: number, dx: number, up: number, d: number, tone = "") => spot(`radial-gradient(circle closest-side, var(--rm-cloud) 0 64%, var(--rm-cloud${tone}) 99%, #0000 100%)`, x, 100, d, d, dx, -up);
const cloud = (x: number, up: number, s = 1) => [puff(x, 0, up + 26 * s, 80 * s), puff(x, -50 * s, up + 6 * s, 70 * s, "-2"), puff(x, 52 * s, up, 76 * s, "-2"), puff(x, -96 * s, up - 8 * s, 56 * s, "-2"), puff(x, 100 * s, up - 10 * s, 54 * s, "-2")];
const sparkle = (x: number, y: number, r: number) => [
  `radial-gradient(ellipse ${n1(r * .22)}px ${n1(r)}px at ${x}% ${y}%, var(--rm-spark) 55%, #0000)`,
  `radial-gradient(ellipse ${n1(r)}px ${n1(r * .22)}px at ${x}% ${y}%, var(--rm-spark) 55%, #0000)`,
];
function n1(v: number) { return +v.toFixed(1); }
const SPARKLES = [[6, 18, 9], [14, 46, 6], [24, 12, 7], [33, 34, 5], [68, 30, 6], [77, 12, 9], [88, 40, 6], [95, 16, 7], [50, 6, 5], [42, 52, 4], [60, 54, 4]].flatMap(([x, y, r]) => sparkle(x!, y!, r!));
const STARS = Array.from({ length: 16 }, () => `radial-gradient(${(1 + rnd()).toFixed(1)}px ${(1 + rnd()).toFixed(1)}px at ${(rnd() * 100).toFixed(1)}% ${(rnd() * 50).toFixed(1)}%, var(--rm-star) 55%, #0000)`);
const SKY = [
  ...SPARKLES, ...STARS,
  spot("radial-gradient(closest-side, var(--rm-moon-cut) calc(100% - 1px), #0000)", 88, 10, 42, 42, 12, -6),
  spot("radial-gradient(closest-side, var(--rm-moon) calc(100% - 1px), #0000)", 88, 10, 46),
  "radial-gradient(circle, var(--rm-bloom) 2.5px, #0000 3px) 12px 100% / 58px 22px repeat-x",
  "radial-gradient(circle, var(--rm-bloom-2) 2px, #0000 2.6px) 40px 100% / 74px 44px repeat-x",
  k.dome("var(--rm-hill-1)", -12, 0, 70, 17), k.dome("var(--rm-hill-1)", 46, 0, 76, 14),
  ...cloud(13, 34), ...cloud(87, 30),
  k.dome("var(--rm-hill-2)", 22, 0, 62, 24), k.dome("var(--rm-hill-3)", -20, 0, 60, 31), k.dome("var(--rm-hill-3)", 64, 0, 58, 29),
  arc("50% 128%", 46, 128, 84.5, 2.2),
  "radial-gradient(ellipse 50% 60% at 50% 0, var(--rm-glow), #0000)",
  "var(--rm-sky)",
];
/* For a location with no picture: a small rainbow over one hill. */
const MINI = [
  k.dome("var(--rm-hill-1)", -10, 0, 120, 30), k.oval("var(--rm-cloud)", 4, 20, 34, 30), k.oval("var(--rm-cloud)", 66, 22, 30, 26),
  arc("50% 82%", 40, 64, 62, 6), "var(--rm-sky)",
].join(", ");

const TITLE_TYPE = "font-family: var(--font-display); font-weight: 600; letter-spacing: .005em;";
const SMALL = "font-family: var(--font-sans); font-weight: 800; text-transform: uppercase; letter-spacing: .09em;";
const FRAME = "border: 2px solid var(--rm-edge); border-radius: var(--radius); background: var(--panel); box-shadow: 0 5px 0 var(--rm-under);";
const BTN_BASE = "border: 2px solid #fff; border-radius: 999px; font-family: var(--font-sans); font-weight: 800; letter-spacing: .02em; text-transform: none; transition: none;";
const STAR = star(5, .5);
const fade = (to: "left" | "right") => `background: ${RAINBOW_LINE}; border-radius: 3px; mask-image: linear-gradient(${to === "right" ? 90 : 270}deg, #000 30%, #0000);`;

const KIT: Kit = {
  id: "preset-rainbow-meadow", name: "Rainbow Meadow", inspired: "My Little Pony", p: "rm",
  about: "Pastel and round: a rainbow over rolling hills, candy-edged cards, pill buttons, hearts and stars.",
  radius: 16, fonts: { display: "fredoka", reading: "nunito", ui: "nunito" },
  colors: {
    light: { bg: "#fdf1f9", panel: "#ffffff", raised: "#faeaf6", line: "#ecc9e4", ink: "#3c2a5a", muted: "#6c5788", accent: "#b3247b", accent2: "#6a45c9" },
    dark: { bg: "#160f2c", panel: "#211640", raised: "#2a1d52", line: "#46327c", ink: "#f4eaff", muted: "#b9a7dc", accent: "#ff8fd0", accent2: "#9ad8ff" },
  },
  vars: VARS,
  page: "background: radial-gradient(ellipse 90% 480px at 50% 0, color-mix(in srgb, var(--rm-mark) 12%, transparent), transparent), var(--bg);",
  select: "background: #ffd0ea; color: #3c2a5a;", scroll: "var(--rm-mark) var(--panel)",
  hi: "var(--rm-heading)", mark: "var(--rm-mark)", link: "var(--rm-link)",
  frame: FRAME, frameOn: "border-color: var(--rm-mark); box-shadow: 0 5px 0 var(--rm-mark);", corner: "12px",
  titleType: TITLE_TYPE, small: SMALL,
  btn: `${BTN_BASE} background: linear-gradient(180deg, #ffc1e2, #ff8cc8); color: #4a1040 !important; box-shadow: 0 3px 0 #c9469a, 0 0 0 1px #f3a6d2;`,
  btnOn: "background: linear-gradient(180deg, #ffd3ea, #ffa0d2); color: #4a1040;",
  ghost: `${BTN_BASE} border-color: var(--rm-edge); background: var(--panel); color: var(--ink) !important; box-shadow: 0 3px 0 var(--rm-under);`,
  ghostOn: "border-color: var(--rm-mark); background: var(--raised); color: var(--ink);",
  chip: "border: 2px solid var(--rm-edge); border-radius: 999px; background: var(--rm-chip); color: var(--rm-chip-ink);",
  bar: "var(--panel)", rule: edge => `border-${edge}: 2px solid var(--rm-edge);`,
  heading: (h, side) => `${h} { display: flex; align-items: center; gap: 12px; }
${h}::before { content: ""; flex: none; width: 22px; height: 22px; background: linear-gradient(135deg, #ff7fbf, #b999f2); clip-path: ${STAR}; }
${h}::after { content: ""; flex: 1; min-width: 24px; height: 6px; ${fade("right")} }${side === "center" ? `
${h} { justify-content: center; }
${h}::before { flex: 1; min-width: 24px; width: auto; height: 6px; clip-path: none; ${fade("left")} }` : ""}`,
  tabOn: "color: var(--rm-heading); box-shadow: inset 0 -4px 0 var(--rm-mark);",
  title: `${TITLE_TYPE} font-weight: 700; color: var(--rm-title); text-shadow: ${stroke("var(--rm-title-edge)", 3)}, 0 7px 0 var(--rm-title-drop); padding: 4px 6px 10px;`,
  titleSizes: [60, 48, 34],
  tagline: "display: inline-block; padding: 6px 18px; border-radius: 999px; background: rgba(255, 255, 255, .86); color: #4a2a78; font: 700 16px/1.4 var(--font-reading); text-shadow: none; box-shadow: 0 3px 0 rgba(138, 79, 214, .35);",
  eyebrow: `display: inline-block; padding: 3px 12px; border: 2px solid #fff; border-radius: 999px; background: #ecdfff; color: #3c2a5a; ${SMALL} font-size: 10.5px; text-shadow: none;`,
  titleOnArt: `color: #ff8fd0; text-shadow: ${stroke("#fff", 3)}, 0 7px 0 #6a3fc0;`,
  nav: "justify-content: center; gap: 6px; padding: 9px 20px; border-top: 3px solid #fff; background: linear-gradient(90deg, #ffc4e1, #ffd9b8, #fff2b0, #c6f0cf, #bfe0ff, #dccbfa);",
  navLink: "padding: 6px 16px; border: 0; border-radius: 999px; color: #3c2a5a; font: 800 12.5px var(--font-sans); letter-spacing: .08em;",
  navOn: "background: rgba(255, 255, 255, .7); color: #7a1f5c; border: 0;",
  scene: {
    height: 400, align: "center",
    pad: ["112px 60px 130px", "104px 40px 124px", "96px 18px 110px"],
    back: SKY, boxes: [],
    edge: "border: 3px solid #fff; border-radius: calc(var(--radius) + 6px); box-shadow: 0 0 0 2px var(--rm-edge), 0 7px 0 2px var(--rm-under);",
  },
  mini: MINI,
  cardLabel: "Friendship card",
  extra: {
    forum: `.board-head { margin-bottom: 12px; }
.board-bar { margin-bottom: 10px; }
.category-forums, .topics { gap: 16px; }
/* Unread: a heart. */
.unread-dot { width: 14px; height: 13px; border-radius: 0; background: var(--rm-mark); clip-path: ${HEART}; }
.tag.new { border: 0; background: var(--rm-mark); color: var(--panel); }
.topic-row.pinned { box-shadow: inset 6px 0 0 var(--accent-2), 0 5px 0 var(--rm-under); }
.topic-row.picked { box-shadow: inset 6px 0 0 var(--rm-mark), 0 5px 0 var(--rm-under); }
.portrait.small, .portrait.tiny { border: 2px solid var(--panel); box-shadow: 0 0 0 2px var(--rm-mark); background: var(--rm-chip); color: var(--rm-chip-ink); }
.forum-art { border-right: 0; border-radius: calc(var(--radius) - 2px) 0 0 calc(var(--radius) - 2px); }
/* Posts: a rainbow line under the name, the portrait in rings of colour. */
.posts { gap: 26px; }
.post-band, .post.flip .post-band { border-bottom: 0; padding-bottom: 16px; background: ${RAINBOW_LINE} left bottom / 100% 5px no-repeat, var(--rm-band); }
.portrait.big { margin-bottom: 10px; border: 4px solid var(--panel); border-radius: 22px; box-shadow: 0 0 0 3px #ff7fbf, 0 0 0 6px #ffe066, 0 0 0 9px #7fc0ff; }
.portrait.big.portrait-empty { background: radial-gradient(circle at 50% 38%, var(--panel) 0, var(--rm-chip) 70%); }
.portrait.big.portrait-empty span { font-weight: 700; color: var(--rm-mark); }
/* The GM's posts are pages from a storybook, sealed with a star. */
.post.post-gm { border: 2px dashed #e0b84a; background: var(--rm-story); }
.post.post-gm .gm-band { border-bottom: 0; background: var(--rm-story-band); }
.gm-seal { border-radius: 0; clip-path: ${STAR}; width: 50px; height: 50px; background: linear-gradient(135deg, #ffe066, #ffab6e); color: #6b3a00; box-shadow: none; }
.mini-card { box-shadow: 0 5px 0 var(--rm-under), 0 14px 28px -12px rgba(60, 20, 90, .5); }
.mini-card::before { background: linear-gradient(90deg, #d83f97, #8a4fd6); color: #fff; }
.mini-traits .chip { border-width: 2px; border-radius: 999px; }
.roll-card { border: 2px solid var(--rm-edge); border-left-width: 6px; border-left-color: var(--rm-mark); border-radius: 999px; padding-right: 6px; }
.roll-total { border-radius: 999px; background: linear-gradient(180deg, #ffc1e2, #ff8cc8); color: #4a1040; }
.cast-chip, .today-chip { border-width: 2px; border-radius: 999px; }
.composer { border-top-style: dotted; border-top-width: 4px; }
.post-text blockquote { border-left-width: 6px; border-radius: 12px; }`,
    phone: ".portrait.big { box-shadow: 0 0 0 2px #ff7fbf, 0 0 0 4px #ffe066, 0 0 0 6px #7fc0ff; }",
    encyclopedia: `.prose h2 { padding-bottom: 8px; background: ${RAINBOW_LINE} left bottom / 120px 5px no-repeat; }
.picture-panel:not(.picture-empty) { border-width: 4px; border-color: var(--panel); box-shadow: 0 0 0 3px #ff7fbf, 0 0 0 6px #ffe066, 0 0 0 9px #7fc0ff; }
.kind-pill { padding: 3px 12px; }`,
    maptable: ".toolbar { border-width: 2px; border-radius: 999px; }",
  },
};

export const RAINBOW_MEADOW: Theme = buildSkin(KIT);
