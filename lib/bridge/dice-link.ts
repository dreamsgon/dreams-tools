/*
 * The RPG Tools Dice Link browser extension as RPG Tools serves it: /api/bridge/roll20/rpg-tools-dice-link.zip.
 * Its manifest is filled in with this site's address, so the extension runs on this RPG Tools and on Roll20 only.
 * The files live in integrations/roll20/dice-link.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { zipFiles } from "./zip.ts";

export const DICE_LINK_FILES = ["manifest.json", "background.js", "core.js", "rpgtools.js", "roll20.js", "popup.html", "popup.js"] as const;
export const DICE_LINK_FOLDER = "rpg-tools-dice-link";
const dir = () => path.join(process.cwd(), "integrations", "roll20", "dice-link");

/** The match pattern for this site. Browsers match any port, so the pattern leaves the port out. */
export function siteMatch(origin: string) {
  const u = new URL(origin);
  return `${u.protocol}//${u.hostname}/*`;
}

/** The manifest for this site. */
export const diceLinkManifest = (raw: string, origin: string) => raw.split("__RPG_TOOLS_MATCH__").join(siteMatch(origin));

/** The extension zip: one folder to unzip and load, with the manifest filled in for this site. */
export async function diceLinkZip(origin: string) {
  const files = await Promise.all(DICE_LINK_FILES.map(async name => {
    const raw = await readFile(path.join(dir(), name));
    const data = name === "manifest.json" ? new TextEncoder().encode(diceLinkManifest(raw.toString("utf8"), origin)) : new Uint8Array(raw);
    return { name: `${DICE_LINK_FOLDER}/${name}`, data };
  }));
  return zipFiles(files);
}
