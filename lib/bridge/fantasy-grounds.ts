/*
 * The RPG Tools extension for Fantasy Grounds Unity as RPG Tools serves it: /api/bridge/fantasygrounds/rpg-tools.ext.
 * An .ext file is a zip with extension.xml at its root. The files live in integrations/fantasygrounds/rpg-tools.
 * It holds no campaign data and no site address: Fantasy Grounds can't reach the web, so files are carried by hand.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { zipFiles } from "./zip.ts";

export const FG_EXTENSION = "rpg-tools.ext";
export const FG_FILES = ["extension.xml", "scripts/rpgtools.lua"] as const;
const dir = () => path.join(process.cwd(), "integrations", "fantasygrounds", "rpg-tools");

/** The extension, ready to drop into Fantasy Grounds' extensions folder. */
export async function fantasyGroundsExtension() {
  const files = await Promise.all(FG_FILES.map(async name => ({ name, data: new Uint8Array(await readFile(path.join(dir(), name))) })));
  return zipFiles(files);
}
