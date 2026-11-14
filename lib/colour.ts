import { z } from "zod";

/** A colour from the browser's colour picker: # and six hex digits. */
export const hexColourPattern = /^#[0-9a-fA-F]{6}$/;
export const isHexColour = (value: unknown): value is `#${string}` => typeof value === "string" && hexColourPattern.test(value);
export const hexColour = z.string().refine(isHexColour, "Use a colour like #3b6fb6");

/**
 * How to draw a colour that is either one of a set of named colours (styled by a class like `mem-blue`)
 * or any #rrggbb the person picked. A picked colour gets `<prefix>-custom` and the colour as `--c`.
 */
export function colourStyle(prefix: string, colour: string): { className: string; style?: Record<string, string> } {
  return isHexColour(colour) ? { className: `${prefix}-custom`, style: { "--c": colour } } : { className: `${prefix}-${colour}` };
}
