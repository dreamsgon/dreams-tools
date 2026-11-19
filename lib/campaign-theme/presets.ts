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
import { STARSHIP_CONSOLE } from "./skins/starship-console.ts";
import { AGORA } from "./skins/agora.ts";
import { MORPH_SKIN } from "./skins/morph.ts";
import { TWO_BANNERS } from "./skins/two-banners.ts";
import { INQUISITORS_TAROT } from "./skins/inquisitors-tarot.ts";
import { LANCE_AND_MOONS } from "./skins/lance-and-moons.ts";
import { IMPERIAL_PROVINCE } from "./skins/imperial-province.ts";
import { GALACTIC_CRAWL } from "./skins/galactic-crawl.ts";

/** Page, panels, raised parts, lines, text, quiet text, accent, second accent. */
const set = (bg: string, panel: string, raised: string, line: string, ink: string, muted: string, accent: string, accent2: string): ColourSet => ({ bg, panel, raised, line, ink, muted, accent, accent2 });
type Fonts = Theme["fonts"];
const skin = (id: string, name: string, inspired: string, radius: number, fonts: Fonts, light: ColourSet, dark: ColourSet, css: string) =>
  ({ inspired, theme: { id: `preset-${id}`, name, mode: "both", radius, banner: "plain", fonts, colors: { light, dark }, css: css.trim() + "\n" } satisfies Theme });

export const SKIN_PRESETS: { inspired: string; theme: Theme }[] = [
  /* Fully custom skins, each with its own stylesheet for every part of the campaign (skins/). */
  { inspired: "Baldur’s Gate 3 and D&D rulebooks", theme: SWORD_COAST },

  { inspired: "The Elder Scrolls IV: Oblivion", theme: IMPERIAL_PROVINCE },

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

  { inspired: "Dragon Age: Inquisition", theme: INQUISITORS_TAROT },

  { inspired: "Star Trek (LCARS)", theme: STARSHIP_CONSOLE },

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

  { inspired: "Ancient Greece", theme: AGORA },

  { inspired: "Animorphs", theme: MORPH_SKIN },

  { inspired: "Star Wars", theme: GALACTIC_CRAWL },

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

  { inspired: "Dragonlance", theme: LANCE_AND_MOONS },

  { inspired: "World of Warcraft", theme: TWO_BANNERS },
];
