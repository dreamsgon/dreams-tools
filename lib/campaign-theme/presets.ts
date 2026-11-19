/*
 * Preset skins inspired by games and worlds. Each is only colours, fonts from the app's list and CSS (gradients,
 * borders, shadows): no logos, artwork, fonts or text from the works that inspired them. Every one has a light and a
 * dark version, and its stylesheet goes through the same safety checks as a GM's own (css.ts).
 *
 * The banner rules use `.board-head:not(.has-art)`, so a campaign's own banner picture still shows when the GM
 * switches the theme's banner to the picture.
 */
import type { ColourSet, Theme } from "./model.ts";
import { CITADEL_STATION } from "./skins/citadel-station.ts";
import { SWORD_COAST } from "./skins/sword-coast.ts";
import { CASTLE_IN_THE_MISTS } from "./skins/castle-in-the-mists.ts";
import { BLIGHT_AND_BLOOD } from "./skins/blight-and-blood.ts";
import { CHAMPION } from "./skins/champion.ts";
import { NORTHERN_HOLD } from "./skins/northern-hold.ts";

/** Page, panels, raised parts, lines, text, quiet text, accent, second accent. */
const set = (bg: string, panel: string, raised: string, line: string, ink: string, muted: string, accent: string, accent2: string): ColourSet => ({ bg, panel, raised, line, ink, muted, accent, accent2 });
type Fonts = Theme["fonts"];
const skin = (id: string, name: string, inspired: string, radius: number, fonts: Fonts, light: ColourSet, dark: ColourSet, css: string) =>
  ({ inspired, theme: { id: `preset-${id}`, name, mode: "both", radius, banner: "plain", fonts, colors: { light, dark }, css: css.trim() + "\n" } satisfies Theme });

export const SKIN_PRESETS: { inspired: string; theme: Theme }[] = [
  /* Fully custom skins, each with its own stylesheet for every part of the campaign (skins/). */
  { inspired: "Baldur’s Gate 3 and D&D rulebooks", theme: SWORD_COAST },

  skin("imperial", "Imperial Province", "The Elder Scrolls IV: Oblivion", 0, { display: "uncial", reading: "fell", ui: "inter" },
    set("#d9c9a3", "#eadbb8", "#e0cfa8", "#b39a68", "#33240f", "#5f4b2c", "#7a2e12", "#3d5a2a"),
    set("#1a140c", "#251c11", "#2e2315", "#4f3d22", "#e8d9b5", "#b09c74", "#d9a24a", "#9cb86a"), `
/* Worn parchment: soft burnt edges, ruled headings and a journal's hand. */
.board-head:not(.has-art) {
  background: radial-gradient(ellipse at 50% 40%, transparent 40%, color-mix(in srgb, var(--ink) 28%, transparent) 130%), var(--raised);
}
.board-title { text-transform: none; letter-spacing: .02em; font-weight: 400; }
.forum, .topic-row, .post, .topic-head, .board-foot {
  border-color: var(--line-strong);
  box-shadow: inset 0 0 28px color-mix(in srgb, var(--accent) 12%, transparent), 0 1px 0 color-mix(in srgb, var(--ink) 18%, transparent);
}
.category-title { text-transform: none; letter-spacing: .03em; font-size: 19px; padding-bottom: 5px; border-bottom: 2px solid var(--line-strong); box-shadow: 0 3px 0 -2px var(--line-strong); }
.forum-name, .topic-title, .post-name, .topic-name { text-transform: none; letter-spacing: .02em; font-weight: 400; }
.post-text > p:first-child::first-letter { font-family: var(--font-display); font-size: 2.1em; line-height: .9; color: var(--accent); padding-right: 3px; }
.post-band { background: none; border-bottom: 1px solid var(--line-strong); }
.f-btn { border-radius: 0; box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--on-accent) 25%, transparent); }
`),

  { inspired: "The Elder Scrolls V: Skyrim", theme: NORTHERN_HOLD },

  { inspired: "Mass Effect (orange and blue)", theme: CITADEL_STATION },

  skin("four-houses", "Four Houses", "Hogwarts", 2, { display: "fell", reading: "spectral", ui: "inter" },
    set("#ebdfc6", "#f6eeda", "#efe4cb", "#cbb88e", "#2c1c1a", "#6a5547", "#7a1f2b", "#1f5a3d"),
    set("#120d10", "#1c1418", "#251a1f", "#44303a", "#efe4d2", "#b3a391", "#d4a93f", "#c9544f"), `
/* Candlelight on old stone, and four house colours along the banner. */
.board-head:not(.has-art) {
  background: radial-gradient(circle at 18% 20%, rgba(255, 196, 96, .28), transparent 34%), radial-gradient(circle at 82% 16%, rgba(255, 196, 96, .22), transparent 30%), linear-gradient(180deg, #2a1418, #140b0e);
  --head-ink: #efe4d2; --head-title: #e3bd5f; --head-line: #6b5330; --head-nav: rgba(0, 0, 0, .35); --head-shadow: 0 2px 10px rgba(0, 0, 0, .7);
}
.board-head { border-bottom: 0; }
.board-head::after { content: ""; display: block; height: 7px; background: linear-gradient(90deg, #8f1d28 0 25%, #d9a521 25% 50%, #1f4e8c 50% 75%, #1f6b45 75% 100%); }
.board-title { text-transform: none; letter-spacing: .03em; font-weight: 400; font-size: 48px; }
.category-title { text-transform: none; font-size: 21px; letter-spacing: .02em; font-weight: 400; border-bottom: 1px solid var(--line-strong); padding-bottom: 4px; }
.category:nth-of-type(4n + 1) .category-title { border-bottom-color: #8f1d28; }
.category:nth-of-type(4n + 2) .category-title { border-bottom-color: #d9a521; }
.category:nth-of-type(4n + 3) .category-title { border-bottom-color: #1f4e8c; }
.category:nth-of-type(4n + 4) .category-title { border-bottom-color: #1f6b45; }
.forum-name, .topic-title, .topic-name { text-transform: none; letter-spacing: .01em; font-weight: 400; }
.post { border-top: 3px double var(--line-strong); }
.post-name { text-transform: none; font-weight: 400; font-size: 24px; letter-spacing: .02em; }
.post-text > p:first-child::first-letter { font-family: var(--font-display); font-size: 1.9em; line-height: 1; color: var(--accent); }
`),

  { inspired: "Ravenloft and Curse of Strahd", theme: CASTLE_IN_THE_MISTS },

  { inspired: "Dragon Age: Origins", theme: BLIGHT_AND_BLOOD },

  { inspired: "Dragon Age II", theme: CHAMPION },

  skin("tarot", "Inquisitor’s Tarot", "Dragon Age: Inquisition", 0, { display: "cinzel", reading: "cormorant", ui: "inter" },
    set("#e6ebe3", "#f5f8f2", "#eaf0e6", "#bfcdbd", "#13211c", "#4f6359", "#7d6110", "#14705a"),
    set("#08110f", "#0f1b18", "#152420", "#274038", "#e4eee6", "#94aa9f", "#d9b65c", "#4fc3a1"), `
/* Every panel a tarot card: a gold line inside a dark frame, and a green tear in the sky. */
.board-head:not(.has-art) {
  background:
    radial-gradient(ellipse 9% 70% at 50% 0%, rgba(120, 255, 200, .85), rgba(60, 200, 150, .35) 55%, transparent 100%),
    radial-gradient(ellipse at 50% 0%, rgba(40, 150, 110, .45), transparent 62%),
    linear-gradient(180deg, #0b1a16, #060d0b);
  --head-ink: #e4eee6; --head-title: #e2c477; --head-line: #6d5a24; --head-nav: rgba(0, 0, 0, .4); --head-shadow: 0 2px 12px rgba(0, 0, 0, .8);
}
.board-head, .forum, .topic-row, .post, .topic-head, .board-foot { box-shadow: inset 0 0 0 4px var(--panel), inset 0 0 0 5px var(--accent); }
.board-head { box-shadow: inset 0 0 0 5px #060d0b, inset 0 0 0 6px #b8973f; }
.forum, .topic-row { padding: 16px 18px; }
.category-title { justify-content: center; }
.category-title::before, .category-title::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--accent)); }
.category-title::after { background: linear-gradient(270deg, transparent, var(--accent)); }
.portrait.big { box-shadow: 0 0 0 1px var(--accent), 0 0 0 5px var(--panel), 0 0 0 6px var(--accent); border: 0; margin: 6px; }
.post-band { background: none; border-bottom-color: var(--accent); margin: 0 5px; }
.post-name { letter-spacing: .14em; }
.topic-row.pinned { border-left: 1px solid var(--line); }
`),

  skin("console", "Starship Console", "Star Trek (LCARS)", 16, { display: "antonio", reading: "inter", ui: "inter" },
    set("#f3ede4", "#fffaf2", "#f5ecdf", "#d8c7b0", "#1b1524", "#5b4f6b", "#b55400", "#6a3fb0"),
    set("#000000", "#0b0b0f", "#15151c", "#3a3350", "#f3ead9", "#b9a9cf", "#ff9c33", "#c59bff"), `
/* A starship's display: one thick elbow of colour, pill buttons and bars with rounded ends. */
.board-head:not(.has-art) { background: var(--bg); --head-ink: var(--ink); --head-title: var(--accent); --head-shadow: none; --head-nav: transparent; --head-line: transparent; }
.board-head { border: 0; border-left: 76px solid var(--accent); border-top: 22px solid var(--accent); border-radius: 60px 0 0 0; text-align: right; min-height: 170px; }
.board-head-text { padding: 20px 22px 8px; }
.board-title { font-weight: 700; letter-spacing: .04em; font-size: 54px; }
.board-tagline { font-style: normal; font-family: var(--font-display); text-transform: uppercase; letter-spacing: .12em; font-size: 17px; color: var(--accent-2); }
.board-nav { justify-content: flex-end; gap: 6px; padding: 8px 14px 12px; }
.board-nav a { padding: 6px 22px; border-radius: 999px; background: var(--accent-2); color: var(--bg); border: 0; font-size: 14px; letter-spacing: .08em; }
.board-nav a:nth-child(2n) { background: var(--accent); }
.board-nav a:nth-child(3n) { background: color-mix(in srgb, var(--accent) 55%, var(--accent-2)); }
.board-nav a:hover { color: var(--bg); filter: brightness(1.15); }
.board-bar { border: 0; border-radius: 0 999px 999px 0; background: var(--raised); margin-bottom: 8px; }
.category-title { padding: 5px 20px; border-radius: 999px; background: var(--accent-2); color: var(--bg); font-size: 17px; letter-spacing: .1em; }
.category:nth-of-type(2n) .category-title { background: var(--accent); }
.category-title .tag { border-color: var(--bg); color: var(--bg); }
.forum, .topic-row, .topic-head { border: 0; border-left: 14px solid var(--accent); border-radius: 22px 0 0 22px; background: var(--panel); }
.forum:nth-child(2n), .topic-row:nth-child(2n) { border-left-color: var(--accent-2); }
.forum-art { border-radius: 8px 0 0 8px; }
.forum-name, .topic-title, .topic-name, .post-name { text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
.forum-desc, .topic-main small { font-style: normal; font-size: 14px; }
.post { border: 0; border-left: 14px solid var(--accent-2); border-radius: 26px 0 0 26px; overflow: hidden; }
.post-band, .post.flip .post-band { background: var(--accent-2); border: 0; }
.post-name { color: var(--bg); }
.post-band .post-meta, .post-band .post-meta a { color: var(--bg); }
.post-text { font-size: 16px; font-weight: 400; }
.f-btn { border-radius: 999px; text-transform: uppercase; font-family: var(--font-display); font-size: 14px; letter-spacing: .08em; }
.tag { border-radius: 999px; }
`),

  skin("issue-one", "Issue One", "Superhero comics", 4, { display: "bangers", reading: "comic", ui: "comic" },
    set("#fff3c4", "#ffffff", "#fff0b3", "#1a1a1a", "#141414", "#4a4a4a", "#d81e2c", "#1456c8"),
    set("#10122b", "#1a1d40", "#242859", "#7f8ae6", "#fdfbf0", "#b8bce6", "#ffd60a", "#ff6b7a"), `
/* A comic page: thick ink lines, hard shadows, halftone dots and caption boxes. */
.forum-page { background-image: radial-gradient(color-mix(in srgb, var(--ink) 14%, transparent) 1.2px, transparent 1.6px); background-size: 9px 9px; }
.board-head:not(.has-art) {
  background: radial-gradient(circle at 50% 110%, #ffd60a 0 30%, transparent 30.5%), repeating-conic-gradient(from 0deg at 50% 110%, #d81e2c 0 9deg, #f04a3e 9deg 18deg);
  --head-ink: #141414; --head-title: #ffffff; --head-nav: #141414; --head-line: #141414; --head-shadow: 3px 3px 0 #141414;
}
.board-head, .forum, .topic-row, .post, .topic-head, .board-foot, .board-bar { border: 3px solid #141414; box-shadow: 5px 5px 0 #141414; }
:root[data-theme="dark"] .forum, :root[data-theme="dark"] .topic-row, :root[data-theme="dark"] .post, :root[data-theme="dark"] .topic-head, :root[data-theme="dark"] .board-foot, :root[data-theme="dark"] .board-bar { border-color: #000; box-shadow: 5px 5px 0 #000; }
.board-bar { margin-bottom: 12px; }
.board-title { font-weight: 400; letter-spacing: .04em; font-size: 68px; transform: rotate(-2deg); }
.board-title a { -webkit-text-stroke: 2px #141414; }
.board-tagline { display: inline-block; margin-top: 10px; padding: 3px 12px; background: #ffffff; border: 2px solid #141414; color: #141414; font-style: normal; font-size: 16px; text-shadow: none; }
.board-nav a { color: #ffffff; font-size: 16px; font-weight: 400; letter-spacing: .08em; }
.board-nav a:hover { color: #ffd60a; border-bottom-color: #ffd60a; }
.category-forums, .topics, .posts { gap: 14px; }
.category-title { display: inline-flex; padding: 4px 14px; background: #ffd60a; color: #141414; border: 3px solid #141414; font-weight: 400; font-size: 22px; letter-spacing: .05em; transform: skew(-6deg); box-shadow: 3px 3px 0 #141414; }
.forum-name, .topic-title, .topic-name, .post-name { font-weight: 400; letter-spacing: .04em; }
.forum-name { font-size: 25px; } .topic-title { font-size: 21px; } .post-name { font-size: 27px; } .topic-name { font-size: 34px; }
.forum-desc, .topic-main small { font-style: normal; font-size: 15px; }
.post-band, .post.flip .post-band { background: var(--accent-2); border-bottom: 3px solid #141414; }
.post-name { color: #ffffff; text-shadow: 2px 2px 0 #141414; }
.post-band .post-meta, .post-band .post-meta a { color: #ffffff; }
.post-text { font-size: 17px; font-weight: 400; }
.f-btn { border: 2px solid #141414; box-shadow: 3px 3px 0 #141414; font-family: var(--font-display); font-size: 15px; font-weight: 400; letter-spacing: .06em; }
.f-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #141414; }
.tag.new { background: #ffd60a; color: #141414; border-color: #141414; transform: rotate(-4deg); }
`),

  skin("agora", "Agora", "Ancient Greece", 0, { display: "cinzel", reading: "source", ui: "inter" },
    set("#f2efe8", "#fbfaf6", "#f0ece2", "#cfc7b4", "#1c2a3a", "#57616d", "#1f5fa8", "#8f6b10"),
    set("#0a1422", "#111f33", "#182a44", "#2b4466", "#eef0ea", "#9fb0c4", "#e0b84a", "#6fb3f0"), `
/* White marble and Aegean blue: a key-pattern border, fluted columns and a temple's pediment. */
.board-head:not(.has-art) {
  background:
    linear-gradient(180deg, transparent 0 calc(100% - 46px), var(--panel) calc(100% - 46px)),
    conic-gradient(from 115deg at 50% 12%, var(--raised) 0 130deg, transparent 130deg),
    linear-gradient(180deg, color-mix(in srgb, var(--accent) 22%, var(--bg)), var(--bg));
  --head-nav: transparent; --head-line: transparent;
}
.board-head { border: 0; border-bottom: 10px solid transparent; border-image: repeating-linear-gradient(90deg, var(--accent) 0 12px, transparent 12px 16px, var(--accent) 16px 20px, transparent 20px 28px) 10; }
.board-title { letter-spacing: .3em; font-weight: 500; }
.board-nav a { letter-spacing: .24em; }
.category-title { justify-content: center; letter-spacing: .3em; padding: 8px 0; border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line-strong); }
.forum, .topic-row, .post, .topic-head { border-color: var(--line); border-left: 12px solid transparent; border-image: repeating-linear-gradient(90deg, var(--line) 0 2px, var(--raised) 2px 4px) 1 1 1 12; }
.forum-name, .topic-title, .topic-name { letter-spacing: .12em; font-weight: 500; }
.post-band { background: none; border-bottom: 3px double var(--line-strong); }
.post-name { letter-spacing: .2em; font-weight: 500; }
.portrait.big { border-radius: 125px 125px 0 0; }
.f-btn { letter-spacing: .16em; text-transform: uppercase; }
`),

  skin("morph", "Morph", "Animorphs", 10, { display: "space", reading: "inter", ui: "inter" },
    set("#eef3fb", "#ffffff", "#e9f0fa", "#c3d0e6", "#121a2b", "#4d5a73", "#c94705", "#6a2bd9"),
    set("#0a0d1c", "#121733", "#1a2147", "#2f3a73", "#eef1ff", "#a2abd6", "#ff8a3d", "#b48cff"), `
/* A nineties paperback: a sunset that shifts colour, a title mid-change and a flip-book square in every corner. */
@keyframes sky { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
@keyframes shift { 0%, 100% { letter-spacing: .02em; transform: skewX(0deg); } 50% { letter-spacing: .1em; transform: skewX(-7deg); } }
.board-head:not(.has-art) {
  background: linear-gradient(120deg, #ff7a18, #ff3d77, #7a2bff, #1fb5ff, #ff7a18); background-size: 300% 300%;
  animation: sky 18s linear infinite alternate;
  --head-ink: #ffffff; --head-title: #ffffff; --head-nav: rgba(10, 13, 28, .35); --head-line: rgba(255, 255, 255, .35); --head-shadow: 0 3px 0 rgba(10, 13, 28, .45);
}
.board-head { border: 0; border-radius: 18px; }
.board-title { font-weight: 700; text-transform: uppercase; letter-spacing: .02em; font-size: 60px; font-stretch: 75%; }
.board-title a { display: inline-block; }
.board-title a:hover { animation: shift 1.6s ease-in-out infinite; }
.board-tagline { font-style: normal; font-weight: 600; font-size: 16px; }
.category-title { font-weight: 700; font-size: 20px; letter-spacing: .02em; background: linear-gradient(90deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.category-title .tag { color: var(--muted); }
.forum, .topic-row, .post, .topic-head, .board-foot { position: relative; border-radius: 14px; border-color: var(--line); box-shadow: 0 6px 0 color-mix(in srgb, var(--accent-2) 18%, transparent); }
.forum::after, .post::after { content: ""; position: absolute; right: 8px; bottom: 8px; width: 16px; height: 16px; border-radius: 3px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); opacity: .7; }
.forum:hover::after { transform: rotate(45deg); border-radius: 50%; }
.forum-art { border-radius: 14px 0 0 14px; }
.forum-name, .topic-title, .topic-name, .post-name { font-weight: 700; letter-spacing: 0; text-transform: none; }
.forum-desc, .topic-main small { font-style: normal; font-size: 15px; }
.post { overflow: hidden; }
.post-band { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent-2) 22%, transparent)); }
.post-text { font-size: 16.5px; font-weight: 400; }
.f-btn { border-radius: 999px; font-weight: 700; }
.f-btn:not(.ghost) { border: 0; background: linear-gradient(90deg, var(--accent), var(--accent-2)); color: #ffffff !important; }
@media (prefers-reduced-motion: reduce) { .board-head:not(.has-art), .board-title a:hover { animation: none; } }
`),

  skin("crawl", "Galactic Crawl", "Star Wars", 0, { display: "jost", reading: "source", ui: "inter" },
    set("#ece6d8", "#f8f4ea", "#efe8d8", "#cdc2a8", "#1b1a17", "#5c5648", "#a04a00", "#0b5fa5"),
    set("#000000", "#0a0c10", "#12151b", "#262b36", "#e8eaf0", "#98a0b0", "#ffd83d", "#4fc3ff"), `
/* Deep space: a field of stars, a hollow yellow title and words that lean away into the distance. */
.board-head:not(.has-art) {
  background:
    radial-gradient(1.5px 1.5px at 12% 22%, #fff, transparent), radial-gradient(1px 1px at 28% 64%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 41% 14%, #cfe6ff, transparent), radial-gradient(1px 1px at 57% 48%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 69% 20%, #fff, transparent), radial-gradient(1px 1px at 83% 58%, #ffe9b0, transparent),
    radial-gradient(1px 1px at 92% 12%, #fff, transparent), radial-gradient(1px 1px at 7% 78%, #fff, transparent),
    radial-gradient(1px 1px at 48% 82%, #fff, transparent), radial-gradient(1.5px 1.5px at 76% 86%, #cfe6ff, transparent), #000;
  --head-ink: #ffd83d; --head-title: transparent; --head-nav: transparent; --head-line: #262b36; --head-shadow: none;
}
.board-head { border-color: #262b36; }
.board-title { font-weight: 700; letter-spacing: .06em; font-size: 64px; line-height: .95; }
.board-title a { -webkit-text-stroke: 2px #ffd83d; }
.board-tagline { font-style: normal; font-family: var(--font-display); font-weight: 500; text-transform: uppercase; letter-spacing: .2em; font-size: 17px; transform: perspective(240px) rotateX(24deg); transform-origin: 50% 100%; }
.board-nav a { color: #4fc3ff; letter-spacing: .3em; font-weight: 500; }
.board-nav a:hover { color: #ffffff; border-bottom-color: #4fc3ff; }
.category-title { letter-spacing: .34em; font-weight: 500; }
.category-title::before { content: ""; width: 34px; height: 2px; background: var(--accent-2); box-shadow: 0 0 8px var(--accent-2); }
.forum, .topic-row, .post, .topic-head { border-color: var(--line); }
:root[data-theme="dark"] .forum:hover, :root[data-theme="dark"] .topic-row:hover { border-color: var(--accent-2); box-shadow: 0 0 14px color-mix(in srgb, var(--accent-2) 35%, transparent); }
.forum-name, .topic-title, .topic-name, .post-name { text-transform: uppercase; letter-spacing: .16em; font-weight: 500; }
.post { border-left: 2px solid var(--accent-2); }
:root[data-theme="dark"] .post { box-shadow: -6px 0 16px -8px var(--accent-2); }
.post-band { background: none; }
.f-btn { text-transform: uppercase; letter-spacing: .2em; font-family: var(--font-display); font-weight: 500; }
`),

  skin("nile", "Nile Kingdom", "Ancient Egypt", 0, { display: "marcellus", reading: "spectral", ui: "inter" },
    set("#ead9b0", "#f6ead0", "#eedfbb", "#c9ae74", "#2b1d0e", "#665235", "#1d4f9c", "#0b6b62"),
    set("#0d1020", "#151a30", "#1d2340", "#36406b", "#f2e6c8", "#b3a987", "#e3b23c", "#3fc4b4"), `
/* Sandstone, lapis and gold: banded collars of colour, a sun over three pyramids and names in cartouches. */
.board-head:not(.has-art) {
  background:
    conic-gradient(from 135deg at 24% 58%, #b08a48 0 45deg, #7d5f2c 45deg 90deg, transparent 90deg),
    conic-gradient(from 135deg at 43% 40%, #c9a45c 0 45deg, #8a6a30 45deg 90deg, transparent 90deg),
    conic-gradient(from 135deg at 63% 62%, #b08a48 0 45deg, #7d5f2c 45deg 90deg, transparent 90deg),
    radial-gradient(circle at 82% 26%, #ffe08a 0 30px, rgba(255, 200, 90, .45) 32px, transparent 110px),
    linear-gradient(180deg, #2a4f9c, #e9a45a 70%, #d9954a);
  --head-ink: #fff4d6; --head-title: #fff4d6; --head-nav: #14213f; --head-line: #e3b23c; --head-shadow: 0 2px 10px rgba(30, 20, 5, .95), 0 0 3px rgba(30, 20, 5, .9);
}
.board-head { border: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-image: repeating-linear-gradient(90deg, #1d4f9c 0 14px, #e3b23c 14px 18px, #0f7a70 18px 32px, #e3b23c 32px 36px, #a8321f 36px 50px, #e3b23c 50px 54px) 10; }
.board-title { letter-spacing: .26em; font-weight: 400; }
.category-title { letter-spacing: .24em; font-weight: 400; padding-bottom: 8px; border-bottom: 5px solid transparent; border-image: repeating-linear-gradient(90deg, var(--accent) 0 10px, #e3b23c 10px 13px, var(--accent-2) 13px 23px, #e3b23c 23px 26px) 5; }
.forum, .topic-row, .post, .topic-head, .board-foot { border-color: var(--line-strong); }
.forum-name, .topic-title, .topic-name { letter-spacing: .1em; font-weight: 400; }
.post-band { background: none; border-bottom: 1px solid var(--line-strong); align-items: center; }
.post-name { padding: 3px 18px; border: 2px solid var(--accent); border-radius: 999px; box-shadow: inset 0 0 0 2px var(--panel), inset 0 0 0 3px #e3b23c; letter-spacing: .16em; font-weight: 400; font-size: 17px; }
.portrait.big { border: 3px solid #e3b23c; outline: 3px solid var(--accent); }
.f-btn { letter-spacing: .14em; text-transform: uppercase; }
`),

  skin("lance", "Lance and Moons", "Dragonlance", 3, { display: "marcellus", reading: "cormorant", ui: "inter" },
    set("#e9e1cf", "#f6f0e2", "#ede5d2", "#c8bb9c", "#1e2233", "#5a5a5f", "#8a5416", "#9a2529"),
    set("#0b0f1c", "#131a2c", "#1a233a", "#2f3c5c", "#ecdfc6", "#aaa594", "#d39a4a", "#e0686a"), `
/* A night sky over the mountains with three moons: silver, red and the one you can't see. Bronze frames below. */
.board-head:not(.has-art) {
  background:
    radial-gradient(circle at 79% 30%, #f1f3f8 0 22px, rgba(220, 228, 245, .28) 24px, transparent 62px),
    radial-gradient(circle at 87% 46%, #c8423f 0 13px, rgba(200, 66, 63, .25) 15px, transparent 42px),
    radial-gradient(circle at 71% 50%, #05070d 0 10px, rgba(60, 70, 110, .5) 11px, transparent 13px),
    conic-gradient(from 125deg at 58% 58%, #0a0e1a 0 110deg, transparent 110deg),
    conic-gradient(from 120deg at 76% 70%, #0d1322 0 120deg, transparent 120deg),
    conic-gradient(from 122deg at 93% 62%, #0a0e1a 0 116deg, transparent 116deg),
    linear-gradient(180deg, #0c1226, #1c2a4f 70%, #33406b);
  --head-ink: #ecdfc6; --head-title: #e2ae62; --head-nav: rgba(5, 7, 13, .55); --head-line: #8a6431; --head-shadow: 0 2px 12px #05070d;
}
.board-head { border: 2px solid #a87a3a; box-shadow: inset 0 0 0 3px #0c1226, inset 0 0 0 4px #a87a3a; text-align: left; }
.board-head-text { padding-left: 34px; }
.board-nav { justify-content: flex-start; padding-left: 20px; }
.board-title { letter-spacing: .12em; font-weight: 400; }
.category-title { letter-spacing: .2em; font-weight: 400; }
.category-title::before { content: "❖"; color: var(--accent-2); font-size: 13px; }
.forum, .topic-row, .post, .topic-head, .board-foot { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); box-shadow: inset 0 0 0 3px var(--panel), inset 0 0 0 4px color-mix(in srgb, var(--accent) 35%, transparent); }
.forum-name, .topic-title, .topic-name { font-weight: 400; letter-spacing: .08em; }
.post-band { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%); }
.post-name { font-weight: 400; letter-spacing: .14em; }
.topic-row.pinned { border-left-color: var(--accent-2); }
`),

  skin("two-banners", "Two Banners", "World of Warcraft", 6, { display: "marcellus", reading: "source", ui: "inter" },
    set("#dccba3", "#efe2c0", "#e5d5ad", "#b89c62", "#2a1c0c", "#5f4b2a", "#7a1512", "#1c4f96"),
    set("#0c0d10", "#16181d", "#1e2128", "#3b3a33", "#e9e3d0", "#a39f90", "#ffc21a", "#4da3ff"), `
/* Gold-trimmed windows, a quest log's parchment in light, and a banner split between red and blue. */
.board-head:not(.has-art) {
  background: radial-gradient(ellipse at 50% 100%, rgba(255, 194, 26, .35), transparent 60%), linear-gradient(90deg, #6b1210 0 49.6%, #d9a521 49.6% 50.4%, #173f7a 50.4% 100%);
  --head-ink: #f3ead2; --head-title: #ffd24a; --head-nav: rgba(0, 0, 0, .5); --head-line: #d9a521; --head-shadow: 0 2px 0 #000, 0 0 14px rgba(0, 0, 0, .8);
}
.board-head, .forum, .topic-row, .post, .topic-head, .board-foot { border: 2px solid transparent; border-image: linear-gradient(180deg, #f1d27a, #8a6a1e 45%, #d9b24a 55%, #6b5014) 2; }
.board-title { font-weight: 400; letter-spacing: .08em; }
.category-title { font-weight: 400; letter-spacing: .1em; font-size: 18px; text-shadow: 0 1px 0 color-mix(in srgb, #000 35%, transparent); }
.forum, .topic-row, .post, .topic-head { box-shadow: inset 0 0 24px color-mix(in srgb, #000 16%, transparent); }
.forum-name, .topic-title, .topic-name { font-weight: 400; letter-spacing: .04em; }
.forum-name a:hover, .topic-title a:hover { color: var(--accent-2); }
.forum-desc, .topic-main small { font-style: normal; font-size: 15px; }
.tag.new { border-color: #ffc21a; background: #ffc21a; color: #2a1c0c; font-weight: 800; }
.tag.new::before { content: "!"; }
.topic-row.pinned { border-image: linear-gradient(180deg, #c98bff, #6a2bb0) 2; }
.post-band { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent); }
.post-name { font-weight: 400; letter-spacing: .08em; text-shadow: 0 1px 0 color-mix(in srgb, #000 35%, transparent); }
.f-btn { font-family: var(--font-display); font-weight: 400; font-size: 13px; }
.f-btn:not(.ghost) { border: 1px solid #6b5014; background: linear-gradient(180deg, #a3221c, #6b1210); color: #ffd24a !important; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .25); }
`),
];
