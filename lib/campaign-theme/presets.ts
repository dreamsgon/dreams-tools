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
import { ISSUE_ONE } from "./skins/issue-one.ts";
import { FOUR_HOUSES } from "./skins/four-houses.ts";
import { NILE_KINGDOM } from "./skins/nile-kingdom.ts";
import { STORM_AND_SPIRE } from "./skins/storm-and-spire.ts";

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

  { inspired: "Hogwarts", theme: FOUR_HOUSES },

  { inspired: "Ravenloft and Curse of Strahd", theme: CASTLE_IN_THE_MISTS },

  { inspired: "Dragon Age: Origins", theme: BLIGHT_AND_BLOOD },

  { inspired: "Dragon Age II", theme: CHAMPION },

  { inspired: "Dragon Age: Inquisition", theme: INQUISITORS_TAROT },

  { inspired: "Star Trek (LCARS)", theme: STARSHIP_CONSOLE },

  { inspired: "Superhero comics", theme: ISSUE_ONE },

  { inspired: "Ancient Greece", theme: AGORA },

  { inspired: "Animorphs", theme: MORPH_SKIN },

  { inspired: "Star Wars", theme: GALACTIC_CRAWL },

  { inspired: "Ancient Egypt", theme: NILE_KINGDOM },

  { inspired: "Dragonlance", theme: LANCE_AND_MOONS },

  { inspired: "Eberron", theme: STORM_AND_SPIRE },

  { inspired: "World of Warcraft", theme: TWO_BANNERS },
];
