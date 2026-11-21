/*
 * Inquisitor's Tarot: a fully custom skin, inspired by the menus of Dragon Age: Inquisition. Near-black panels framed
 * twice, a bronze line outside and a faint gold hairline inside like the game's tarot cards, with brighter brackets
 * at the corners; engraved capitals (Cinzel) over a book face (EB Garamond); a highlighted row is a soft band of
 * light with hairlines above and below that fade out at both ends, as in the game's menus; headings end in a line
 * with a small diamond at its middle; categories and portraits carry roman numerals like the cards; and a touch of
 * the Fade's green. By day it is vellum and dark ink. The banner is only gradients: no drawings. The GM's posts read
 * like a Codex page. Nothing glows under the pointer and nothing moves. Like every skin, its stylesheets go through
 * the safety checks in css.ts.
 */
import type { Theme } from "../model.ts";

/* Shared by every part: each part's stylesheet starts with these. Everything a version changes is a variable here. */
const VARS = `:root {
  --it-gold: #7d5f17; --it-gold-soft: rgba(125, 95, 23, .32); --it-bronze: #b49a5e; --it-fade: #17664f; --it-red: #7a1d1a;
  --it-panel: linear-gradient(180deg, #fbf8ef, #f2ecdc);
  --it-band: linear-gradient(90deg, transparent, rgba(125, 95, 23, .12) 18% 82%, transparent);
  --it-line: linear-gradient(90deg, transparent, #7d5f17 30% 70%, transparent);
  --it-sky: linear-gradient(180deg, #f6f1e3 0%, #ece4cf 60%, #e2d8bd 100%);
  --it-rift: rgba(23, 102, 79, .16); --it-dusk: rgba(125, 95, 23, .14); --it-vignette: rgba(80, 60, 20, .22);
  --it-title: linear-gradient(180deg, #8f6d1e 0%, #5a430e 55%, #7d5f17 100%); --it-title-shadow: drop-shadow(0 1px 0 rgba(255, 255, 255, .6));
  --it-head-ink: #3a301f; --it-nav: linear-gradient(180deg, #16201c, #0c120f); --it-nav-ink: #e6d6a8;
  --it-shadow: 0 10px 24px -16px rgba(60, 45, 15, .45);
  --it-codex: linear-gradient(180deg, #fbf6e6, #efe3c4);
  --card-bg: #0d1311; --card-ink: #e9e2cf; --card-head: #d4b064; --card-line: #6f5a2c;
}
:root[data-theme="dark"] {
  --it-gold: #d4b064; --it-gold-soft: rgba(212, 176, 100, .26); --it-bronze: #6f5a2c; --it-fade: #5fd0a8; --it-red: #7a1d1a;
  --it-panel: linear-gradient(180deg, rgba(22, 30, 27, .96), rgba(11, 15, 13, .96));
  --it-band: linear-gradient(90deg, transparent, rgba(212, 176, 100, .12) 18% 82%, transparent);
  --it-line: linear-gradient(90deg, transparent, #d4b064 30% 70%, transparent);
  --it-sky: linear-gradient(180deg, #0d1714 0%, #0a110f 55%, #070908 100%);
  --it-rift: rgba(95, 208, 168, .24); --it-dusk: rgba(212, 176, 100, .1); --it-vignette: rgba(0, 0, 0, .7);
  --it-title: linear-gradient(180deg, #f7e9b8 0%, #d9b867 50%, #a07c30 100%); --it-title-shadow: drop-shadow(0 2px 6px rgba(0, 0, 0, .7));
  --it-head-ink: #d8cfb8; --it-nav: linear-gradient(180deg, #121916, #080b0a);
  --it-shadow: 0 14px 30px -14px rgba(0, 0, 0, .85);
}`;

/** The brighter brackets at a frame's four corners, drawn just inside its line. */
const BRACKETS = ["left top", "right top", "left bottom", "right bottom"].flatMap(p => [
  `linear-gradient(var(--it-gold), var(--it-gold)) ${p} / 16px 2px no-repeat`,
  `linear-gradient(var(--it-gold), var(--it-gold)) ${p} / 2px 16px no-repeat`,
]).join(", ");
/** A frame, as on the game's tarot cards: a bronze line, a faint gold hairline inside it and brackets at the corners. */
const FRAME = `border: 1px solid var(--it-bronze); border-radius: 0; background: ${BRACKETS}, var(--it-panel); outline: 1px solid var(--it-gold-soft); outline-offset: -6px; box-shadow: var(--it-shadow);`;
/** Under the pointer, or chosen: the game's menu highlight, a soft band with hairlines that fade out at both ends. */
const BAND = "var(--it-line) left top / 100% 1px no-repeat, var(--it-line) left bottom / 100% 1px no-repeat, var(--it-band)";
const FRAME_ON = `background: ${BRACKETS}, var(--it-band), var(--it-panel);`;
/** Small labels: engraved capitals, widely spaced. */
const CAPS = "font-family: var(--font-display); font-weight: 600; text-transform: uppercase; letter-spacing: .14em;";
/** A heading's rule: a line fading out at both ends with a diamond at its middle (`rule("center")`), or fading to the right. */
const rule = (at: "center" | "left") => at === "center"
  ? `content: "◆"; display: block; width: min(440px, 90%); margin: 10px auto 0; font-size: 9px; line-height: 9px; text-align: center; color: var(--it-gold); background: linear-gradient(90deg, transparent, var(--it-gold) 35%, transparent 46% 54%, var(--it-gold) 65%, transparent) center / 100% 1px no-repeat;`
  : `content: "◆"; display: block; width: min(360px, 100%); margin: 10px 0 0; font-size: 9px; line-height: 9px; text-align: left; color: var(--it-gold); background: linear-gradient(90deg, transparent 14px, var(--it-gold) 14px, transparent) left center / 100% 1px no-repeat;`;
/** Buttons: dark with a bronze line and gold capitals; the main ones in the Inquisition's red. */
const BTN = "border: 1px solid var(--it-bronze); border-radius: 0; background: var(--it-panel); color: var(--it-gold); box-shadow: none; font-family: var(--font-display); font-weight: 600; text-transform: uppercase; letter-spacing: .12em;";
const BTN_ON = "border-color: var(--it-gold); background: var(--it-band), var(--it-panel);";
const RED_BTN = "border: 1px solid #c9a45c; border-radius: 0; background: linear-gradient(180deg, #8a2620, #5c1512); color: #f3e2a8; box-shadow: inset 0 0 0 2px rgba(0, 0, 0, .35); font-family: var(--font-display); font-weight: 600; text-transform: uppercase; letter-spacing: .12em; text-shadow: 0 1px 0 #000;";
const RED_ON = "background: linear-gradient(180deg, #9a2e27, #6a1915); color: #fff2c4;";
/** The banner, only gradients: a dark sky with the Fade's green light falling from the top, warmth at the foot and the
    edges darkened. Vellum by day. Framed twice, like a card. */
const SKY = "radial-gradient(ellipse 120% 95% at 50% 45%, transparent 45%, var(--it-vignette) 100%), radial-gradient(ellipse 45% 85% at 50% -12%, var(--it-rift), transparent 72%), linear-gradient(0deg, var(--it-dusk), transparent 45%), var(--it-sky)";
const CARD_EDGE = "border: 1px solid var(--it-bronze); outline: 1px solid var(--it-gold-soft); outline-offset: -9px;";
/** The title: engraved capitals in gold. */
const TITLE_FILL = `background: var(--it-title); background: var(--it-title) 0 0 / 100% 1lh repeat-y; -webkit-background-clip: text; background-clip: text; color: transparent; filter: var(--it-title-shadow);`;
const TITLE = `font-family: var(--font-display); font-weight: 600; text-transform: uppercase; letter-spacing: .1em; ${TITLE_FILL}`;
/** The page: plain, with the Fade's green faint at the very top. */
const PAGE = "background: radial-gradient(ellipse 70% 420px at 50% 0, color-mix(in srgb, var(--it-fade) 8%, transparent), transparent), var(--bg);";
/** For a location with no picture: the banner's sky in small. */
const MINI = "radial-gradient(ellipse 60% 90% at 50% -10%, var(--it-rift), transparent 75%), linear-gradient(0deg, var(--it-dusk), transparent 50%), var(--it-sky)";

/** The cover for the other parts: the banner's sky behind the host's own content, framed like a card. */
const cover = (host: string) => `${host} { position: relative; border-radius: 0; ${CARD_EDGE} background: ${SKY}; box-shadow: var(--it-shadow); }`;

/* The Encyclopedia: dark menus with the game's highlight, card-framed pages, and the cover over the overview. */
const ENCYCLOPEDIA = `/* Inquisitor's Tarot for the Encyclopedia. The colours and fonts come from the theme. */
${VARS}
body { ${PAGE} scrollbar-color: var(--it-bronze) var(--panel); }
.dashboard { counter-reset: it-shelf; }
::selection { background: var(--it-gold); color: #0b0f0d; }

/* The side, like the game's menus: a chosen or pointed-at line is a band of light between fading hairlines. */
.sidebar { border-right: 1px solid var(--it-bronze); background: var(--it-panel); }
.csw-name b { ${CAPS} font-size: 13px; color: var(--it-gold); }
.campaign-link, .tree-row { border-radius: 0; }
.campaign-link:not(.active):hover, .tree-row:hover { background: ${BAND}; }
.campaign-link.active, .tree-row:has(.active), .tree-item.active { background: ${BAND}; color: var(--it-gold); box-shadow: none; }
.side-heading .section-toggle { ${CAPS} font-size: 10.5px; color: var(--muted); }
.shared-tag { border-radius: 0; ${CAPS} font-size: 9px; }

/* The bar along the top, over a fading hairline. */
.topbar { border-bottom: 0; background: var(--it-line) left bottom / 100% 1px no-repeat, var(--it-panel); }
.search-box { border-radius: 0; border-color: color-mix(in srgb, var(--it-bronze) 60%, var(--it-gold)); background: var(--bg); }
.search-box:focus-within { border-color: var(--it-gold); }

/* Buttons and boxes to type in. */
.button { ${BTN} font-size: 11.5px; }
.button:hover { ${BTN_ON} color: var(--it-gold); }
.button.primary { ${RED_BTN} font-size: 11.5px; }
.button.primary:hover { ${RED_ON} }
.icon-button { border-radius: 0; }
.icon-button:hover { color: var(--it-gold); }
input:not([type="checkbox"]):not([type="radio"]), select, textarea { border-radius: 0; caret-color: var(--it-gold); }
input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus { border-color: var(--it-gold); box-shadow: none; }

/* The campaign's overview: the cover. */
${cover(".dashboard-intro")}
.dashboard-intro { align-items: flex-start; margin-bottom: 26px; padding: 44px 44px 40px; }
.dashboard-intro .eyebrow { ${CAPS} font-size: 11px; color: var(--it-head-ink); }
.dashboard-intro h1 { margin: 14px 0 0; font-size: 46px; line-height: 1.15; ${TITLE} }
.dashboard-intro h1::after { ${rule("left")} }
.dashboard-intro .subtitle { max-width: 46ch; font: italic 400 19px/1.5 var(--font-reading); color: var(--it-head-ink); }
.dashboard-intro .icon-button { border: 1px solid var(--it-bronze); color: var(--it-gold); }
.overview-strip { border-color: var(--it-bronze); }
.overview-strip strong { font: 600 19px var(--font-display); color: var(--it-gold); }

/* Headings: a roman numeral, engraved capitals, the rule under them. */
.section-heading { align-items: flex-end; }
.section-heading h2 { ${CAPS} font-size: 16px; color: var(--ink); }
.dashboard .section-heading h2 { counter-increment: it-shelf; }
.dashboard .section-heading h2::before { content: counter(it-shelf, upper-roman) " · "; color: var(--it-gold); }
.section-heading h2::after { ${rule("left")} }
.eyebrow { ${CAPS} font-size: 10px; }

/* Cards, as the game's tarot: framed twice, brackets at the corners. Under the pointer, the menu's band of light. */
.note-card { ${FRAME} padding: 22px 22px 18px; transition: none; }
.note-card:hover { ${FRAME_ON} transform: none; border-color: var(--it-bronze); }
.note-card h3 { font: 600 19px/1.25 var(--font-display); letter-spacing: .04em; }
.note-card:hover h3 { color: var(--it-gold); }
.note-card.add-card:not(:focus-visible) { outline: 0; }
.note-card.add-card { border: 1px dashed var(--it-bronze); background: transparent; box-shadow: none; }

/* A page, like a Codex entry. */
.kind-pill { border-radius: 0; border: 1px solid var(--it-bronze); background: transparent; color: var(--it-gold); ${CAPS} font-size: 10px; }
.article-title h1 { ${CAPS} font-weight: 600; letter-spacing: .08em; }
.article-tabs { border-bottom: 0; background: var(--it-line) left bottom / 100% 1px no-repeat; }
.article-tabs button { ${CAPS} font-size: 11px; }
.article-tabs button[aria-selected="true"], .article-tabs button.active { color: var(--it-gold); background: ${BAND}; box-shadow: none; }
.picture-panel { border-radius: 0; ${CARD_EDGE} }
.prose { font-family: var(--font-reading); font-size: 19px; }
.prose h1, .prose h2, .prose h3 { font-family: var(--font-display); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.prose h2 { font-size: 22px; padding-bottom: 8px; background: var(--it-line) left bottom / 100% 1px no-repeat; }
.prose h3 { font-size: 18px; color: var(--it-gold); }
.prose blockquote { border-left: 1px solid var(--it-gold); background: var(--it-band); font-style: italic; }
.article-aside .eyebrow { color: var(--it-gold); }

@media (max-width: 640px) {
  .dashboard-intro { padding: 28px 22px 26px; }
  .dashboard-intro h1 { font-size: 28px; letter-spacing: .04em; overflow-wrap: anywhere; }
  .dashboard-intro .subtitle { font-size: 16.5px; }
}
`;

/* Maptable: the War Table. Dark rails and panels, card-framed scenes, and the cover over the Scene Picker. */
const MAPTABLE = `/* Inquisitor's Tarot for Maptable. The map itself keeps its own colours. */
${VARS}
body { ${PAGE} scrollbar-color: var(--it-bronze) var(--panel); counter-reset: it-shelf; }
::selection { background: var(--it-gold); color: #0b0f0d; }

/* The bar along the top, over a fading hairline. */
.app-header, .campaign-dashboard > header { border-bottom: 0; background: var(--it-line) left bottom / 100% 1px no-repeat, var(--it-panel); }
.header-scene strong { ${CAPS} color: var(--it-gold); }
.csw-name b { ${CAPS} font-size: 12.5px; color: var(--it-gold); }

/* Buttons and boxes to type in. Three times over, to outrank the app's own rule for the dark version. */
.primary.primary.primary, .dashboard-continue-action { ${RED_BTN} font-size: 11.5px; }
.primary.primary.primary:hover, .dashboard-continue:hover .dashboard-continue-action { ${RED_ON} }
.icon-button:hover { color: var(--it-gold); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea { border-radius: 0; caret-color: var(--it-gold); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus, select:focus, textarea:focus { border-color: var(--it-gold); box-shadow: none; }
input[type="range"] { accent-color: var(--it-gold); }

/* The tool rail and the side panel: the menu's band of light for what is on. */
.rail { border-right: 1px solid var(--it-bronze); background: var(--it-panel); }
.rail button { border-radius: 0; }
.rail button:hover { color: var(--it-gold); }
.rail button.active { background: ${BAND}; color: var(--it-gold); box-shadow: none; }
.side-panel { border-right: 1px solid var(--it-bronze); background: var(--it-panel); }
.panel-title { border-bottom: 0; background: var(--it-line) left bottom / 100% 1px no-repeat; }
.panel-title h2 { ${CAPS} font-size: 13px; }
.organizer-scene { border-radius: 0; white-space: normal; }
.organizer-scene:hover, .organizer-scene.active { background: ${BAND}; box-shadow: none; }
.organizer-scene strong { font: 600 16px/1.25 var(--font-reading); }
.organizer-scene.active strong { color: var(--it-gold); }
@media (max-width: 1000px) {
  .rail { border-right: 0; border-top: 1px solid var(--it-bronze); }
  .side-panel { border: 1px solid var(--it-bronze); border-bottom: 0; }
}

/* Around the map. */
.map-topbar { border-bottom: 1px solid var(--it-bronze); background: var(--it-panel); }
.map-title, .board-info { ${CAPS} font-size: 10px; color: var(--muted); }
.toolbar { border-radius: 0; border: 1px solid var(--it-bronze); background: var(--it-panel); outline: 1px solid var(--it-gold-soft); outline-offset: -4px; box-shadow: var(--it-shadow); }
.toolbar button { border-radius: 0; ${CAPS} font-size: 10px; }
.toolbar button:hover { color: var(--it-gold); }
.toolbar button.active { background: ${BAND}; color: var(--it-gold); }

/* The Scene Picker: the cover, and each scene a card. */
${cover(".campaign-scenes-head")}
.campaign-scenes-head { align-items: flex-start; padding: 40px 40px 34px; }
.campaign-scenes-head > div { flex: 1; min-width: 0; }
.campaign-scenes-head small { ${CAPS} font-size: 11px; color: var(--it-head-ink); }
.campaign-scenes-head h1 { margin-top: 12px; font-size: 44px; line-height: 1.15; ${TITLE} }
.campaign-scenes-head h1::after { ${rule("left")} }
.dashboard-continue { ${FRAME} padding: 20px 26px; }
.dashboard-continue:hover { border: 1px solid var(--it-bronze); border-radius: 0; ${FRAME_ON} padding: 20px 26px; box-shadow: var(--it-shadow); }
.dashboard-continue small { ${CAPS} font-size: 10.5px; color: var(--it-gold); }
.dashboard-continue strong { font: 600 22px var(--font-display); letter-spacing: .04em; }
.campaign-scenes-kinds button { border-radius: 0; ${CAPS} font-size: 10px; }
.campaign-scenes-group h2 { ${CAPS} font-size: 15px; counter-increment: it-shelf; }
.campaign-scenes-group h2::before { content: counter(it-shelf, upper-roman) " · "; color: var(--it-gold); }
.campaign-scenes-group h2 span { letter-spacing: .08em; font-size: 10px; }
.campaign-scene-card { ${FRAME} overflow: hidden; }
.campaign-scene-card:hover, .campaign-scene-card:focus-visible { ${FRAME_ON} }
.campaign-scene-card:hover strong, .campaign-scene-card:focus-visible strong { color: var(--it-gold); }
.campaign-scene-card strong { font: 600 16px/1.25 var(--font-reading); }
.campaign-scene-card em { ${CAPS} font-style: normal; font-size: 9.5px; color: var(--it-gold); }

@media (max-width: 640px) {
  .campaign-scenes-head { padding: 26px 22px 24px; }
  .campaign-scenes-head h1 { font-size: 28px; letter-spacing: .04em; overflow-wrap: anywhere; }
  .dashboard-continue strong { font-size: 19px; overflow-wrap: anywhere; }
}
`;

/* The campaign's dashboard: the cover behind its name, and card-framed panels. */
const DASHBOARD = `/* Inquisitor's Tarot for the campaign's dashboard. */
${VARS}
body { ${PAGE} }
::selection { background: var(--it-gold); color: #0b0f0d; }
.hub-crumbs { ${CAPS} font-size: 10.5px; }
.hub-crumbs a { color: var(--it-gold); }

/* The top: the cover. */
${cover(".hub-head")}
.hub-head { padding: 40px 40px 34px; }
.hub-title p { ${CAPS} font-size: 11px; color: var(--it-head-ink); }
.hub-title h1 { margin-top: 12px; font-size: 48px; line-height: 1.15; ${TITLE} }
.hub-title h1::after { ${rule("left")} }
.hub-chip { border-radius: 0; border: 1px solid var(--it-bronze); background: transparent; color: var(--it-head-ink); ${CAPS} font-size: 9px; }
.hub-head .tag-add { border-radius: 0; border-color: var(--it-bronze); color: var(--it-head-ink); }

/* Buttons. */
.hub-button { ${BTN} font-size: 11px; }
.hub-button:not(.hub-button-primary):hover, .hub-button:not(.hub-button-primary):hover:not(:disabled) { ${BTN_ON} color: var(--it-gold); }
.hub-button-primary, a.hub-button-primary { ${RED_BTN} font-size: 11px; }
.hub-button-primary:hover, .hub-button-primary:hover:not(:disabled), a.hub-button-primary:hover { ${RED_ON} }

/* Dashboard, Front page and Members: the menu's tabs. */
.hub-tabs { border-bottom: 0; background: var(--it-line) left bottom / 100% 1px no-repeat; }
.hub-tabs button, .hub-tabs a { ${CAPS} font-size: 11px; }
.hub-tabs [aria-selected="true"], .hub-tabs [aria-current="page"] { color: var(--it-gold); background: ${BAND}; }

/* Cards, framed like the tarot. */
.hub-card { ${FRAME} }
.hub-card-head h2 { flex: 1; ${CAPS} font-size: 14px; color: var(--ink); }
.hub-card-head a, .hub-card-head .hub-text-button { ${CAPS} font-size: 10px; }
.hub-scene-grid li { border-radius: 0; }

@media (max-width: 640px) {
  .hub-head { padding: 26px 22px 24px; }
  .hub-title h1 { font-size: 28px; letter-spacing: .04em; overflow-wrap: anywhere; }
}
`;

export const INQUISITORS_TAROT: Theme = {
  id: "preset-tarot", name: "Inquisitor’s Tarot", mode: "both", radius: 0, banner: "picture", fonts: { display: "cinzel", reading: "garamond", ui: "garamond" },
  colors: {
    light: { bg: "#ece6d6", panel: "#f7f3e8", raised: "#efe8d7", line: "#cbbd99", ink: "#1f1a12", muted: "#5b5140", accent: "#7d5f17", accent2: "#17664f" },
    dark: { bg: "#070908", panel: "#0e1311", raised: "#151c19", line: "#2c3a33", ink: "#e9e2cf", muted: "#a39d8a", accent: "#d4b064", accent2: "#5fd0a8" },
  },
  css: `/* Inquisitor's Tarot: the menus of a dark fantasy game. Panels framed twice like its tarot cards, engraved capitals over a book face, the menu's band of light
   for what is chosen, roman numerals, and a touch of the Fade's green. Vellum by day. The banner is only gradients. Everything a version changes is a variable in the first two rules. */

${VARS}

body { ${PAGE} scrollbar-color: var(--it-bronze) var(--panel); counter-reset: it-arcana; }
::selection { background: var(--it-gold); color: #0b0f0d; }
a { text-underline-offset: 3px; }

/* The strip above the banner. */
.board-bar { ${FRAME} border-bottom: 0; outline: 0; background: ${BRACKETS.split(", ").slice(0, 4).join(", ")}, var(--it-panel); }
.board-date { ${CAPS} font-size: 10px; }
.board-date b { color: var(--it-gold); }
.circ { border-radius: 0; border: 1px solid var(--it-gold); background: var(--it-panel); color: var(--it-gold); font: 600 11px var(--font-display); }
.you b { ${CAPS} font-size: 13px; color: var(--it-gold); }
.search-box { border-radius: 0; border-color: color-mix(in srgb, var(--it-bronze) 60%, var(--it-gold)); background: var(--bg); }
.search-box:focus-within { border-color: var(--it-gold); }
.search-box input:not([type="checkbox"]), .search-box input:not([type="checkbox"]):focus { border: 0; background: transparent; box-shadow: none; }

/* The banner: only gradients. A dark sky, the Fade's green light falling from the top, the edges darkened, framed
   twice like a card; the title in engraved gold over a rule with a diamond at its middle. */
.board-head { min-height: 300px; ${CARD_EDGE} text-align: center; box-shadow: var(--it-shadow); }
.board-head:not(.has-art) { background: ${SKY}; --head-ink: var(--it-head-ink); --head-title: var(--it-gold); --head-shadow: none; --head-nav: transparent; --head-line: transparent; }
.board-head-text { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 56px 48px 46px; }
.board-title { font: 600 54px/1.15 var(--font-display); letter-spacing: .1em; }
.board-title a { ${TITLE} text-shadow: none; }
.board-title::after { ${rule("center")} }
.board-tagline { margin-top: 16px; font: italic 400 21px/1.45 var(--font-reading); color: var(--head-ink); text-shadow: none; }
/* The links: the game's menu tabs, with diamonds between them and its band of light under the pointer. */
.board-nav { justify-content: center; gap: 0; padding: 0 16px; border-top: 0; background: var(--it-line) left top / 100% 1px no-repeat, var(--it-nav); }
.board-nav a { padding: 14px 18px; border-bottom: 0; color: var(--it-nav-ink, var(--it-gold)); ${CAPS} font-size: 11.5px; }
.board-nav a + a::before { content: "◆"; margin-right: 20px; margin-left: -18px; font-size: 7px; vertical-align: 2px; color: var(--it-bronze); }
.board-nav a:hover { color: #f3e2a8; background: var(--it-line) left top / 100% 1px no-repeat, linear-gradient(90deg, transparent, rgba(212, 176, 100, .14) 20% 80%, transparent); }
.board-nav a:focus-visible { outline: 1px solid #d4b064; outline-offset: -5px; }
/* With a banner picture: the picture under a dark wash at its middle, the same gold title and rule over it. */
.board-head.has-art { background: radial-gradient(ellipse 70% 80% at 50% 50%, rgba(5, 8, 7, .62), rgba(5, 8, 7, .2) 75%), var(--banner) var(--banner-x, 50%) var(--banner-y, 50%) / var(--banner-size, cover) no-repeat; --head-ink: #e9e2cf; --head-shadow: none; --head-nav: transparent; --head-line: transparent; }
.board-head.has-art .board-title a { background: linear-gradient(180deg, #f7e9b8 0%, #d9b867 50%, #a07c30 100%); background: linear-gradient(180deg, #f7e9b8 0%, #d9b867 50%, #a07c30 100%) 0 0 / 100% 1lh repeat-y; -webkit-background-clip: text; background-clip: text; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, .8)); }
.board-head.has-art .board-title::after { color: #d4b064; background: linear-gradient(90deg, transparent, #d4b064 35%, transparent 46% 54%, #d4b064 65%, transparent) center / 100% 1px no-repeat; }

/* Headings: the card's roman numeral, engraved capitals, and the rule with its diamond under them. */
.category { counter-increment: it-arcana; }
.category-title { flex-wrap: wrap; justify-content: center; gap: 4px 12px; ${CAPS} font-size: 17px; color: var(--ink); text-shadow: none; }
.category .category-title::before { content: counter(it-arcana, upper-roman); color: var(--it-gold); }
/* The rule takes a line of its own under the heading, drawn 440px wide at most. */
.category-title::after { ${rule("center")} flex: 0 0 100%; margin-top: 4px; background-size: min(440px, 90%) 1px; }
.tag { border-radius: 0; ${CAPS} letter-spacing: .1em; font-size: 9px; text-shadow: none; }
.tag:where(:not(.topic-tag)) { border-color: var(--it-bronze); color: var(--muted); }
.tag.new { border-color: var(--it-fade); background: transparent; color: var(--it-fade); }

/* Boards and topics: card frames. Under the pointer, the menu's band of light. */
.category-forums, .topics { gap: 10px; }
.forum, .topic-row { ${FRAME} }
/* Room inside the inner hairline, so a topic's tick box and labels never touch it. */
.topic-row { padding: 16px 20px; }
.forum:hover, .topic-row:hover { ${FRAME_ON} }
.topic-row.pinned { border-left: 1px solid var(--it-bronze); box-shadow: inset 3px 0 0 var(--it-gold), var(--it-shadow); }
.topic-row.picked { border-color: var(--it-bronze); background: ${BRACKETS}, linear-gradient(color-mix(in srgb, var(--it-fade) 12%, transparent), color-mix(in srgb, var(--it-fade) 12%, transparent)), var(--it-panel); box-shadow: inset 3px 0 0 var(--it-fade), var(--it-shadow); }
.forum-name { font: 600 20px/1.2 var(--font-display); letter-spacing: .04em; }
.forum-name a, .topic-title a { color: var(--ink); }
.forum-name a:hover, .topic-title a:hover, .forum:hover .forum-name a, .topic-row:hover .topic-title a { color: var(--it-gold); }
.forum-desc { font: italic 400 17px/1.45 var(--font-reading); }
.forum-place { ${CAPS} font-size: 9px; }
.forum-place a { color: var(--it-gold); }
.forum-counts b { font: 600 18px var(--font-display); color: var(--ink); }
.last-label { ${CAPS} font-size: 9px; color: var(--it-gold); }
.forum-last a, .foot-list a { color: var(--ink); font: 500 16px/1.3 var(--font-reading); }
.forum-last a:hover, .foot-list a:hover { color: var(--it-gold); }
.topic-title { font: 600 17px/1.3 var(--font-display); letter-spacing: .03em; text-transform: none; }
.topic-main small { font-style: normal; }
.topic-count b { font: 600 17px var(--font-display); color: var(--ink); }
/* Unread: a small diamond in the Fade's green. */
.unread-dot { width: 8px; height: 8px; border-radius: 0; rotate: 45deg; background: var(--it-fade); box-shadow: none; }
/* Small portraits: diamonds, framed in gold. */
.portrait.small, .portrait.tiny { border-radius: 0; border: 1px solid var(--it-gold); background: var(--it-panel); color: var(--it-gold); font-family: var(--font-display); font-weight: 600; box-shadow: none; }
/* A location with no picture gets the banner's sky in small, framed like a card. */
.forum-art { border-right: 1px solid var(--it-bronze); border-radius: 0; outline: 1px solid var(--it-gold-soft); outline-offset: -6px; }
.forum-art:not([style]) { background: ${MINI}; }

/* A location's own page. */
.location { ${FRAME} overflow: hidden; }
.location-art { border-right: 1px solid var(--it-bronze); }
.location-art.portrait-empty { background: ${MINI}; }
.location-art.portrait-empty span { visibility: hidden; }
.location-kind { ${CAPS} font-size: 10px; color: var(--it-gold); }
.location-name { font-weight: 600; font-size: 32px; letter-spacing: .08em; text-transform: uppercase; }
.location-summary { font: italic 400 18px/1.55 var(--font-reading); }

/* Topic pages. */
.crumbs { ${CAPS} font-size: 10px; }
.crumbs a { color: var(--it-gold); }
.topic-head { ${FRAME} }
.topic-name { font: 600 34px/1.15 var(--font-display); letter-spacing: .06em; text-transform: uppercase; }
.cast-chip, .today-chip { border-radius: 0; border-color: var(--it-bronze); }

/* Posts: card frames, the name in engraved capitals over a fading rule. */
.posts { gap: 22px; counter-reset: it-card; }
.post { position: relative; ${FRAME} counter-increment: it-card; }
.post::before { content: "◆"; position: absolute; z-index: 1; top: -8px; left: 50%; translate: -50% 0; padding: 0 8px; font-size: 11px; line-height: 14px; color: var(--it-gold); background: var(--bg); }
.post.fresh { box-shadow: inset 0 0 0 1px var(--it-fade), var(--it-shadow); }
.post-band, .post.flip .post-band { padding: 16px 24px 10px; border-bottom: 0; background: var(--it-line) left bottom / 100% 1px no-repeat; }
.post-name { ${CAPS} font-size: 18px; color: var(--it-gold); }
.post-meta { font: italic 400 15px var(--font-reading); }
.post-meta a { color: var(--muted); }
/* The GM's posts read like a page of the Codex: vellum and dark ink, by day and by night. */
:root[data-theme="dark"] .post.post-gm { --ink: #1f1a12; --muted: #5b5140; --bg: #ece6d6; --raised: #efe8d7; --panel: #f7f3e8; --line: #cbbd99; --accent: #7d5f17; --accent-2: #17664f; --accent2: #17664f; --it-gold: #7d5f17; --it-gold-soft: rgba(125, 95, 23, .32); --it-bronze: #b49a5e; --it-fade: #17664f; --it-line: linear-gradient(90deg, transparent, #7d5f17 30% 70%, transparent); --it-band: linear-gradient(90deg, transparent, rgba(125, 95, 23, .12) 18% 82%, transparent); }
.post.post-gm { background: ${BRACKETS}, var(--it-codex); color: #1f1a12; }
.post.post-gm::before { background: var(--bg); }
:root[data-theme="dark"] .post.post-gm::before { background: #070908; color: #d4b064; }
.gm-band { border-bottom: 0; background: var(--it-line) left bottom / 100% 1px no-repeat; }
.post.post-gm .post-name { color: #5a430e; }
.post.post-gm .gm-band small, .post.post-gm .post-meta, .post.post-gm .post-meta a { color: #5b5140; }
.post.post-gm .post-text { color: #1f1a12; }
.gm-seal { border-radius: 0; border: 1px solid #c9a45c; background: linear-gradient(180deg, #8a2620, #5c1512); color: #f3e2a8; box-shadow: none; }
/* A big portrait: a tarot card, framed twice, its roman numeral on a plate at the foot. */
.portrait.big { border: 1px solid var(--it-bronze); border-radius: 0; outline: 1px solid var(--it-gold); outline-offset: -8px; box-shadow: var(--it-shadow); }
.post .portrait.big::after { content: counter(it-card, upper-roman); position: absolute; left: 50%; bottom: 14px; translate: -50% 0; min-width: 40px; padding: 3px 10px 2px; border: 1px solid var(--it-gold); background: #0b0f0d; color: #e6d6a8; font: 600 12px/1.4 var(--font-display); letter-spacing: .14em; text-align: center; pointer-events: none; }
.portrait.big.portrait-empty { background: ${MINI}; }
.portrait.big.portrait-empty span { font: 600 96px var(--font-display); color: color-mix(in srgb, var(--it-gold) 70%, transparent); }
/* The character card that opens over a portrait: a tarot card. Dark in both versions, framed twice, the name in
   engraved gold over the rule with its diamond, what they say in italic. It fades in and does not move. */
.mini-card {
  display: flex; flex-direction: column; align-items: center; padding: 22px 20px 18px; border: 1px solid #6f5a2c; border-radius: 0; text-align: center;
  background: radial-gradient(ellipse 80% 50% at 50% 0, rgba(95, 208, 168, .14), transparent 70%), linear-gradient(180deg, #121a17, #090c0b); color: #e9e2cf;
  outline: 1px solid rgba(212, 176, 100, .45); outline-offset: -7px; box-shadow: 0 14px 30px -10px rgba(0, 0, 0, .8);
}
.mini-card > *, .mini-card dd { color: #e9e2cf; }
.mini-card :focus-visible { outline: 1px solid #d4b064; outline-offset: 2px; }
.mini-name { font: 600 19px/1.2 var(--font-display); letter-spacing: .12em; text-transform: uppercase; color: #d4b064; }
.mini-name::after { content: "◆"; display: block; width: 160px; margin: 8px auto 0; font-size: 8px; line-height: 8px; color: #d4b064; background: linear-gradient(90deg, transparent, #d4b064 35%, transparent 45% 55%, #d4b064 65%, transparent) center / 100% 1px no-repeat; }
.mini-role { margin: 8px 0 10px; padding: 0; border: 0; ${CAPS} font-style: normal; font-size: 10px; color: #a39d8a; }
.mini-quote { font: italic 400 17px/1.45 var(--font-reading); color: #e9e2cf; opacity: 1; }
.mini-traits .chip { border-radius: 0; border-color: #6f5a2c; }
.mini-fields { text-align: left; }
.mini-fields dt { ${CAPS} font-size: 9.5px; color: #d4b064; }
.mini-fields dd { font: 400 16px/1.4 var(--font-reading); }
.mini-card > .mini-link { align-self: center; margin-top: auto; padding: 7px 16px; ${RED_BTN} color: #f3e2a8 !important; font-size: 10.5px; text-decoration: none; }
.mini-link:hover { ${RED_ON} }
.mini-card > :nth-last-child(2) { margin-bottom: 14px; }
.mini-player { ${CAPS} font-size: 9.5px; line-height: 1.8; }
.mini-player b { color: var(--it-gold); }
.post-text { font: 400 19px/1.65 var(--font-reading); }
.post-text blockquote { border-left: 1px solid var(--it-gold); background: var(--it-band); }
.post-text pre { border: 1px solid var(--it-bronze); border-radius: 0; background: var(--bg); }
.post-text h3, .post-text h4, .post-text h5, .post-text h6 { font-family: var(--font-display); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--it-gold); }
.roll-card { border-radius: 0; border: 1px solid var(--it-bronze); }
.roll-total { border-radius: 0; border: 1px solid var(--it-gold); background: transparent; color: var(--it-gold); font: 600 16px/26px var(--font-display); }
.post-actions { border-top: 0; background: var(--it-line) left top / 100% 1px no-repeat; }
.post-actions button { ${CAPS} font-size: 9.5px; }
.post-actions button:hover { color: var(--it-gold); }

/* A topic's tools: spaced out, with the line above them as a fading hairline. */
.mod-tools { gap: 10px; margin-top: 14px; padding-top: 16px; border-top: 0; background: var(--it-line) left top / 100% 1px no-repeat; }
.mod-tools .f-btn.small { padding: 7px 12px; }
.mod-tools .f-select { ${CAPS} font-size: 10px; }
.mod-tools .f-select select { padding: 5px 8px; border: 1px solid var(--it-bronze); }

/* Buttons and boxes to type in. */
.f-btn.ghost { ${BTN} color: var(--it-gold) !important; }
.f-btn:not(.small) { font-size: 11px; }
.f-btn.ghost:hover:not(:disabled) { ${BTN_ON} }
.f-btn:not(.ghost), .tools .tool-pop .f-btn:not(.ghost) { ${RED_BTN} color: #f3e2a8 !important; }
.f-btn:not(.ghost):hover:not(:disabled) { ${RED_ON} }
input:not([type="checkbox"]), select, textarea { border-radius: 0; background: var(--bg); caret-color: var(--it-gold); }
input:not([type="checkbox"]):focus, select:focus, textarea:focus { border-color: var(--it-gold); box-shadow: none; }
.composer { border: 0; background: var(--it-line) left top / 100% 1px no-repeat; }
.composer-kind, .as-label { ${CAPS} color: var(--it-gold); }

/* The foot of the forum. */
.board-foot { ${FRAME} }
.foot-cols h3, .foot-line h3 { ${CAPS} font-size: 13px; color: var(--it-gold); }
.foot-stats b { font: 600 17px var(--font-display); color: var(--it-gold); }
.to-top { border-radius: 0; color: var(--it-gold); }

@container page (max-width: 640px) {
  .board-head { min-height: 230px; }
  .board-head-text { padding: 40px 26px 34px; }
  .board-head.has-art .board-head-text { padding: 40px 22px 36px; }
  .board-title { font-size: 30px; letter-spacing: .04em; overflow-wrap: anywhere; }
  .board-tagline { font-size: 17px; }
  .board-nav { padding: 0 4px; }
  .board-nav a { padding: 12px 8px; font-size: 10px; letter-spacing: .1em; }
  .board-nav a + a::before { margin-right: 10px; margin-left: -8px; }
  .category-title { font-size: 15px; }
  .forum-name { font-size: 18px; }
  .topic-name { font-size: 24px; }
  .location-name { font-size: 23px; }
  .post .portrait.big::after { bottom: 8px; font-size: 10px; min-width: 30px; padding: 2px 6px 1px; }
  .portrait.big.portrait-empty span { font-size: 52px; }
  .forum-location > :nth-child(2) { padding-top: 14px; }
  .forum-location > :last-child { padding-bottom: 16px; }
  .location-art { border-right: 0; border-bottom: 1px solid var(--it-bronze); }
  .mini-card { box-sizing: border-box; }
  /* The tarot card opens centred in the post, level with the top of the portrait: it is placed against the
     portrait's column, which spans the post on phones, rather than against the narrow portrait. */
  .post-side { position: relative; }
  .mini-portrait { position: static; }
  .mini-card { inset: 0 0 auto 0; width: 100%; min-height: 212px; }
  /* A topic's tools in two even columns, the board to move it to across both. */
  .mod-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .mod-tools .f-btn.small { justify-content: center; padding: 9px 8px; }
  .mod-tools .f-select { grid-column: 1 / -1; justify-content: space-between; }
  .mod-tools .f-select select { flex: 1; }
  .mod-tools .rename-form, .mod-tools .form-error { grid-column: 1 / -1; }
  .topic-row { padding: 18px 20px 16px; }
  .mini-name { font-size: 16px; overflow-wrap: anywhere; }
  .mini-fields dd { font-size: 14.5px; }
  .post-text { font-size: 18px; }
}
`,
  areas: { encyclopedia: ENCYCLOPEDIA, maptable: MAPTABLE, dashboard: DASHBOARD },
};
