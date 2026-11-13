import { z } from "zod";
import { ACCENTS, FONT_ROLES, fontOption, fontStylesheetUrl } from "../appearance.ts";
import { imageIdSchema } from "./map-model.ts";

/*
 * A campaign's look: its accent, heading font, page surface and banner. It applies inside the
 * campaign (and, unless turned off, on the player site). Light or dark still follows each
 * person's own setting, so every surface has both versions.
 */

export const surfaces = ["plain", "parchment", "stone", "night"] as const;
export type Surface = typeof surfaces[number];
export const surfaceNames: Record<Surface, string> = { plain: "Plain", parchment: "Parchment", stone: "Stone", night: "Night" };
export const accentIds = ACCENTS.map(a => a.id) as [typeof ACCENTS[number]["id"], ...typeof ACCENTS[number]["id"][]];
/** Heading fonts offered for a campaign: a short list from the title fonts. */
export const lookFonts = ["cinzel", "spectral", "schibsted", "marcellus", "cormorant", "space-grotesk"] as const;

export const lookSchema = z.object({
  accent: z.enum(accentIds).optional(),
  headingFont: z.enum(lookFonts).optional(),
  surface: z.enum(surfaces).optional(),
  banner: z.object({ imageId: imageIdSchema, width: z.number().int().positive().max(20000), height: z.number().int().positive().max(20000), y: z.number().min(0).max(1) }).optional(),
  /** Use the look on the player site and shared links (on unless turned off). */
  players: z.boolean().optional(),
});
export type Look = z.infer<typeof lookSchema>;

export const hasLook = (l?: Look) => !!l && !!(l.accent || l.headingFont || (l.surface && l.surface !== "plain") || l.banner);

/** Attributes for the element the look applies to. Accent and surface colours come from CSS by attribute. */
export function lookAttributes(l?: Look): { "data-look-accent"?: string; "data-look-surface"?: string; style: Record<string, string> } {
  if (!l) return { style: {} };
  const font = l.headingFont ? fontOption("title", l.headingFont) : null;
  return {
    ...(l.accent ? { "data-look-accent": l.accent } : {}),
    ...(l.surface && l.surface !== "plain" ? { "data-look-surface": l.surface } : {}),
    style: font ? { "--font-display": font.stack } : {},
  };
}
export const lookFontUrl = (l?: Look) => l?.headingFont ? fontStylesheetUrl(fontOption("title", l.headingFont)) : null;
export const lookFontLabel = (id: typeof lookFonts[number]) => FONT_ROLES.title.options.find(o => o.id === id)?.label ?? id;

/** What players get: the look without the switch, or nothing when it is kept to the GM. */
export const playerLook = (l?: Look) => l && l.players !== false && hasLook(l) ? { accent: l.accent, headingFont: l.headingFont, surface: l.surface, banner: l.banner } : undefined;
