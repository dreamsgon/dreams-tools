/*
 * Raid Night: a fully custom skin, inspired by online role-playing games in general rather than any one of them. The
 * banner is a game's screen: a mountain zone with a crystal sending a beam into the sky, and over it the interface a
 * player lives in, a round minimap and the party's health and mana. Under it runs an experience bar, and the forum's
 * links sit in the slots of an action bar with their key numbers. Light is the zone by day and dark is the same zone
 * under an aurora. Cards are the game's windows, headings carry the yellow mark of a quest, pinned topics and tags
 * borrow the colours of rare loot, posts show bars under the name, the GM speaks in raid warnings and the character
 * card is an inspect window. Titles are in Cinzel, text in Inter and labels in Saira. No game's interface art, icons,
 * names or logos: every shape is drawn here from gradients.
 */
import type { Theme } from "../model.ts";
import { buildSkin, canvas, sketch, stroke, type Kit } from "./kit.ts";

const VARS = `:root {
  --rn-gold: #8a5a00; --rn-edge: #a48a52; --rn-inner: rgba(255, 255, 255, .7); --rn-top: #f8f4e9; --rn-slot: #dde3ec; --rn-heading: #3d2c00; --rn-link: #6a35c9;
  --rn-quest: #c98a00; --rn-rare: #0b63c9; --rn-epic: #7a2fd6; --rn-legend: #c25e00; --rn-warn: #b3261e; --rn-warn-bg: #fdeceb; --rn-hp: #2a9d45; --rn-mp: #2f6fd6;
  --rn-shadow: 0 10px 22px -14px rgba(20, 26, 40, .6);
  --rn-sky: linear-gradient(180deg, #4d8fd4 0%, #a3c9ee 48%, #e6f0f8 82%);
  --rn-m1: #3c5472; --rn-m2: #6a85a6; --rn-m3: #a3b8d0; --rn-fog: linear-gradient(180deg, #0000, #e6f0f8); --rn-a1: transparent; --rn-a2: transparent;
  --rn-beam: rgba(255, 255, 255, .95); --rn-halo: rgba(255, 255, 255, .7); --rn-crystal: #58d2ff; --rn-star: transparent;
}
:root[data-theme="dark"] {
  --rn-gold: #f0b84a; --rn-edge: #6b5a35; --rn-inner: rgba(0, 0, 0, .6); --rn-top: #202634; --rn-slot: #0f131a; --rn-heading: #f0b84a; --rn-link: #c3a2ff;
  --rn-quest: #ffd100; --rn-rare: #4aa3ff; --rn-epic: #b98bff; --rn-legend: #ff9a3c; --rn-warn: #ff6b5e; --rn-warn-bg: #2a1212; --rn-hp: #3ecf5e; --rn-mp: #4a8dff;
  --rn-shadow: 0 0 0 1px rgba(0, 0, 0, .5), 0 12px 24px -14px #000;
  --rn-sky: linear-gradient(180deg, #04060d 0%, #101838 46%, #2b2a5e 82%);
  --rn-m1: #080b14; --rn-m2: #131a2e; --rn-m3: #202a4c; --rn-fog: linear-gradient(180deg, #0000, #0b0d12); --rn-a1: rgba(80, 255, 170, .24); --rn-a2: rgba(166, 116, 255, .28);
  --rn-beam: rgba(150, 232, 255, .9); --rn-halo: rgba(110, 220, 255, .45); --rn-crystal: #6fdcff; --rn-star: rgba(255, 255, 255, .8);
}`;

/* The minimap, 162 across: land, woods, a lake, a road, the player's arrow in the middle, quests in yellow, the party in blue and trouble in red. */
const m = canvas(162, 162);
const MAP = [
  m.tri("#ffe27a", 74, 73, 14, 16),
  m.oval("#ffd100", 108, 112, 10), m.oval("#ffd100", 38, 44, 10), m.oval("#4aa3ff", 58, 94, 8), m.oval("#4aa3ff", 94, 60, 8), m.oval("#ff5a4a", 122, 40, 8), m.oval("#ff5a4a", 132, 54, 6),
  m.rect("#c9b27a", 0, 78, 162, 4), m.rect("#c9b27a", 98, 78, 4, 84),
  m.oval("#2f6fa3", -24, -34, 104, 86), m.oval("#27432a", 100, 98, 76, 62), m.oval("#27432a", 6, 108, 54, 46), m.oval("#31502f", 108, 6, 64, 52),
  "#3f5d3c",
];
/* The party: four frames, each a face, health and something to spend. */
const p = canvas(190, 150);
const member = (row: number, face: string, hp: number, hue: string, mp: number, power: string) => {
  const y = 116 - row * 38;
  return [
    p.oval("rgba(255, 255, 255, .8)", 9, y + 9, 12), p.rect(face, 2, y + 2, 26, 26), p.rect("#c9973a", 0, y, 30, 30),
    p.rect(hue, 36, y + 17, 150 * hp, 11), p.rect(power, 36, y + 6, 150 * mp, 6), p.rect("rgba(0, 0, 0, .7)", 35, y + 5, 152, 24),
  ];
};
const PARTY = [
  ...member(0, "#9a3b3b", 1, "#3ecf5e", .46, "#d94c3d"), ...member(1, "#3b5f9a", .74, "#3ecf5e", .88, "#4a8dff"),
  ...member(2, "#3b8a5a", .9, "#3ecf5e", .62, "#e8c53a"), ...member(3, "#6a3b9a", .3, "#e0862a", .8, "#4a8dff"),
];

/* The zone behind the interface: mountains in three distances, a crystal and its beam, fog along the ground and an aurora at night. */
const k = sketch();
const STARS = [[3, 8], [9, 24], [18, 12], [27, 30], [36, 7], [44, 20], [52, 9], [63, 26], [70, 12], [79, 5], [86, 28], [94, 14]].map(([x, y]) => `radial-gradient(1.2px 1.2px at ${x}% ${y}%, var(--rn-star) 55%, #0000)`);
const SKY = [
  k.fill("var(--rn-fog)", 0, 0, 100, 26),
  k.tri("var(--rn-m1)", -12, 0, 44, 40), k.tri("var(--rn-m1)", 58, 0, 40, 34), k.tri("var(--rn-m1)", 84, 0, 34, 44),
  k.tri("var(--rn-crystal)", 46.6, 20, 3.2, 26), "radial-gradient(ellipse 9% 16% at 48.2% 62%, var(--rn-halo), #0000)",
  "linear-gradient(90deg, #0000 calc(48.2% - 5px), var(--rn-beam) calc(48.2% - 1px) calc(48.2% + 1px), #0000 calc(48.2% + 5px)) 0 0 / 100% 62% no-repeat",
  k.tri("var(--rn-m2)", 10, 0, 50, 54), k.tri("var(--rn-m2)", 44, 0, 44, 44), k.tri("var(--rn-m2)", 72, 0, 46, 58),
  k.tri("var(--rn-m3)", -6, 0, 40, 62), k.tri("var(--rn-m3)", 30, 0, 46, 66), k.tri("var(--rn-m3)", 62, 0, 40, 70),
  ...STARS,
  "radial-gradient(ellipse 34% 16% at 26% 18%, var(--rn-a1), #0000)", "radial-gradient(ellipse 30% 14% at 62% 12%, var(--rn-a2), #0000)", "radial-gradient(ellipse 22% 10% at 84% 24%, var(--rn-a1), #0000)",
  "var(--rn-sky)",
];
const MINI = [
  k.fill("var(--rn-fog)", 0, 0, 100, 30), k.tri("var(--rn-m1)", -10, 0, 60, 46), k.tri("var(--rn-crystal)", 62, 26, 8, 34),
  k.tri("var(--rn-m2)", 30, 0, 70, 62), k.tri("var(--rn-m3)", 0, 0, 56, 74), "radial-gradient(ellipse 60% 30% at 50% 16%, var(--rn-a1), #0000)", "var(--rn-sky)",
].join(", ");

const TITLE_TYPE = "font-family: var(--font-display); font-weight: 700; letter-spacing: .02em;";
const SMALL = "font-family: var(--font-sans); font-weight: 600; text-transform: uppercase; letter-spacing: .1em;";
const FRAME = "border: 1px solid var(--rn-edge); border-radius: var(--radius); background: linear-gradient(180deg, var(--rn-top), var(--panel) 44px); box-shadow: inset 0 0 0 1px var(--rn-inner), var(--rn-shadow);";
const BTN_BASE = "border-radius: 4px; font-family: var(--font-sans); font-weight: 700; text-transform: uppercase; letter-spacing: .1em;";
/* The yellow mark over someone with a quest to give. */
const QUEST = "linear-gradient(var(--rn-quest) 0 0) 50% 0 / 5px 62% no-repeat, radial-gradient(circle, var(--rn-quest) 0 2.6px, #0000 3.2px) 50% 100% / 7px 7px no-repeat";
/* An experience bar: filled most of the way, with a notch at every twentieth. */
const XP = "repeating-linear-gradient(90deg, #0000 0 calc(5% - 2px), #05070c calc(5% - 2px) 5%) 0 0 / 100% 7px no-repeat, linear-gradient(90deg, #8a4fe0 0 64%, #1a1f2b 64%) 0 0 / 100% 7px no-repeat";
const bars = (side: "left" | "right") => `linear-gradient(90deg, var(--rn-hp) 0 86%, rgba(0, 0, 0, .3) 86%) ${side} 22px bottom 11px / 170px 6px no-repeat, linear-gradient(90deg, var(--rn-mp) 0 62%, rgba(0, 0, 0, .3) 62%) ${side} 22px bottom 5px / 170px 4px no-repeat`;

const KIT: Kit = {
  id: "preset-raid-night", name: "Raid Night", inspired: "MMOs", p: "rn",
  about: "A game's own screen: a minimap, party frames, an experience bar and the forum's links on an action bar.",
  radius: 6, fonts: { display: "cinzel", reading: "inter", ui: "saira" },
  colors: {
    light: { bg: "#d9dee6", panel: "#eef1f5", raised: "#e2e7ee", line: "#b4bdcb", ink: "#1a1f2a", muted: "#4d5666", accent: "#8a5a00", accent2: "#6a35c9" },
    dark: { bg: "#0b0d12", panel: "#151922", raised: "#1c222e", line: "#343c4c", ink: "#e8e6df", muted: "#9aa3b2", accent: "#f0b84a", accent2: "#b98bff" },
  },
  vars: VARS,
  page: "background: var(--bg);",
  select: "background: var(--rn-epic); color: #ffffff;", scroll: "var(--rn-edge) var(--bg)",
  hi: "var(--rn-heading)", mark: "var(--rn-gold)", link: "var(--rn-link)",
  frame: FRAME, frameOn: "border-color: var(--rn-gold);", corner: "4px",
  titleType: TITLE_TYPE, small: SMALL,
  btn: `${BTN_BASE} border: 1px solid #d9a441; background: linear-gradient(180deg, #a82222, #6a0f0f); color: #ffe08a !important; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .25);`,
  btnOn: "border-color: #ffd76a; background: linear-gradient(180deg, #c62b2b, #861414); color: #fff3c4;",
  ghost: `${BTN_BASE} border: 1px solid var(--rn-edge); background: var(--rn-slot); color: var(--ink) !important;`,
  ghostOn: "border-color: var(--rn-gold); background: var(--raised); color: var(--ink);",
  chip: "border: 1px solid var(--rn-edge); border-radius: 3px; background: var(--rn-slot); color: var(--ink);",
  bar: "var(--panel)", rule: edge => `border-${edge}: 1px solid var(--rn-edge);`,
  heading: (h, side) => `${h} { display: flex; align-items: center; gap: 12px; }
${h}::before { content: ""; flex: none; width: 10px; height: 24px; background: ${QUEST}; }
${h}::after { content: ""; flex: 1; min-width: 28px; height: 1px; background: linear-gradient(90deg, var(--rn-edge), #0000); }${side === "center" ? `\n${h} { justify-content: flex-start; }` : ""}`,
  tabOn: "color: var(--rn-heading); box-shadow: inset 0 -3px 0 var(--rn-gold);",
  title: `${TITLE_TYPE} color: #ffd97a; text-shadow: ${stroke("#1c1202", 2)}, 0 5px 0 #1c1202, 0 8px 18px rgba(0, 0, 0, .6);`,
  titleSizes: [56, 44, 30],
  tagline: `font: 600 15px/1.5 var(--font-sans); letter-spacing: .1em; text-transform: uppercase; color: #ffffff; text-shadow: ${stroke("#10131a", 1)}, 0 2px 6px rgba(0, 0, 0, .7);`,
  eyebrow: `display: inline-block; padding: 3px 10px; border: 1px solid #d9a441; border-radius: 3px; background: #10131a; color: #ffd97a; ${SMALL} font-size: 10.5px; text-shadow: none;`,
  titleOnArt: `color: #ffd97a; text-shadow: ${stroke("#1c1202", 2)}, 0 5px 0 #1c1202, 0 8px 18px rgba(0, 0, 0, .6);`,
  nav: `justify-content: flex-start; gap: 6px; padding: 15px 20px 8px; border-top: 1px solid #05070c; background: ${XP}, linear-gradient(180deg, #1a1f2b, #0d1016); counter-reset: rn-slot;`,
  navLink: "position: relative; padding: 11px 14px 9px 24px; border: 1px solid #5c4a24; border-radius: 4px; background: linear-gradient(180deg, #2b3242, #151922); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .6); color: #f0d9a0; font: 600 12.5px var(--font-sans); letter-spacing: .1em; counter-increment: rn-slot;",
  navOn: "border-color: #ffd76a; color: #ffffff;",
  scene: {
    height: 390, align: "left",
    pad: ["46px 450px 110px 40px", "38px 330px 110px 30px", "22px 110px 130px 18px"],
    back: SKY,
    boxes: [
      { css: "right: 24px; top: 22px; width: 162px; height: 162px; border: 3px solid #c9973a; border-radius: 50%; box-shadow: 0 0 0 2px #1a1206, 0 8px 18px rgba(0, 0, 0, .55); transform-origin: top right;", layers: MAP, mid: "scale: .8;", phone: "right: 14px; top: 16px; scale: .5;" },
      { css: "right: 226px; top: 34px; width: 190px; height: 150px; transform-origin: top right;", layers: PARTY, mid: "right: 176px; scale: .7;", phone: "display: none;" },
    ],
    edge: "border: 1px solid var(--rn-edge); border-radius: var(--radius);",
  },
  mini: MINI,
  cardLabel: "Inspect",
  extra: {
    forum: `.board-bar { margin-bottom: 10px; }
.board-head { box-shadow: var(--rn-shadow); }
/* Each link is a slot on the action bar, with the key that presses it. */
.board-nav a::before { content: counter(rn-slot); position: absolute; left: 7px; top: 3px; font: 600 9.5px var(--font-sans); letter-spacing: 0; color: #9aa3b2; }
.tag.new { border: 0; background: var(--rn-rare); color: var(--panel); }
/* Unread: the mark of a quest waiting. */
.unread-dot { width: 9px; height: 20px; border-radius: 0; background: ${QUEST}; box-shadow: none; }
/* Pinned is legendary, picked is epic. */
.topic-row.pinned { box-shadow: inset 4px 0 0 var(--rn-legend), inset 0 0 0 1px var(--rn-inner), var(--rn-shadow); }
.topic-row.picked { box-shadow: inset 4px 0 0 var(--rn-epic), inset 0 0 0 1px var(--rn-inner), var(--rn-shadow); }
.topic-row.pinned .topic-name { color: var(--rn-legend); }
.portrait.small, .portrait.tiny { border: 2px solid #c9973a; border-radius: 4px; background: var(--rn-slot); color: var(--ink); }
.forum-art, .location-art { border-right: 1px solid var(--rn-edge); }
.forum-location { overflow: hidden; }
/* Posts: health and mana under the name, as on a unit frame. */
.post-band { padding-bottom: 26px; border-bottom: 1px solid var(--rn-edge); background: ${bars("left")}, linear-gradient(180deg, var(--rn-top), var(--raised)); }
.post.flip .post-band { padding-bottom: 26px; border-bottom: 1px solid var(--rn-edge); background: ${bars("right")}, linear-gradient(180deg, var(--rn-top), var(--raised)); }
.portrait.big { border: 3px solid #c9973a; border-radius: 4px; box-shadow: 0 0 0 1px #1a1206, 0 8px 16px -8px #000; background: var(--rn-slot); }
.portrait.big.portrait-empty span { font: 700 84px var(--font-display); color: var(--rn-heading); }
/* The GM speaks in raid warnings. */
.post.post-gm { border-color: var(--rn-warn); background: var(--panel); }
.post.post-gm .gm-band { border-bottom: 1px solid var(--rn-warn); background: var(--rn-warn-bg); }
.post.post-gm .gm-band .post-name { color: var(--rn-warn); text-transform: uppercase; letter-spacing: .06em; }
.gm-seal { border-radius: 4px; border: 2px solid #c9973a; background: #10131a; color: #ffd100; box-shadow: none; }
/* The character card is an inspect window, the name in the purple of something epic. */
.mini-card { border: 1px solid var(--rn-edge); box-shadow: inset 0 0 0 1px var(--rn-inner), 0 16px 30px -12px #000; }
.mini-card::before { background: #10131a; color: #ffd97a; }
.mini-name { color: var(--rn-epic); }
.roll-card { border: 1px solid var(--rn-edge); }
.roll-total { border-radius: 4px; border: 1px solid #d9a441; background: #10131a; color: #ffd97a; }
.cast-chip, .today-chip { border-radius: 4px; }`,
    phone: ".board-nav { gap: 4px; padding: 13px 10px 8px; }\n.board-nav a { padding: 10px 9px 8px 18px; letter-spacing: .04em; }\n.board-nav a::before { left: 5px; }",
    encyclopedia: `.prose h2 { padding-bottom: 8px; border-bottom: 1px solid var(--rn-edge); }
.picture-panel:not(.picture-empty) { border: 3px solid #c9973a; box-shadow: 0 0 0 1px #1a1206, 0 8px 16px -8px #000; }
/* The minimap sits under the banner's own buttons here. */
.dashboard-intro::before { top: 62px; }
.dashboard-intro { box-shadow: var(--rn-shadow); }`,
    dashboard: ".hub-head { box-shadow: var(--rn-shadow); }",
    maptable: ".campaign-scenes-head { box-shadow: var(--rn-shadow); }\n.toolbar { border-color: var(--rn-edge); }",
  },
};

export const RAID_NIGHT: Theme = buildSkin(KIT);
