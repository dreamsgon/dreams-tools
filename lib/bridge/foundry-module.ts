/*
 * The Foundry module as RPG Tools serves it, so a GM installs it in Foundry from one manifest address:
 * /api/bridge/foundry/module.json (its download is /api/bridge/foundry/rpg-tools-bridge.zip on the same site).
 * The files live in integrations/foundry/rpg-tools-bridge.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { zipFiles } from "./zip.ts";

export const FOUNDRY_FILES = ["module.json", "scripts/main.mjs", "scripts/core.mjs", "lang/en.json", "README.md"] as const;
const dir = () => path.join(process.cwd(), "integrations", "foundry", "rpg-tools-bridge");

/** The manifest with its own address and download filled in for this site. */
export function manifestFor(raw: string, origin: string) {
  const m = JSON.parse(raw) as Record<string, unknown>;
  return { ...m, manifest: `${origin}/api/bridge/foundry/module.json`, download: `${origin}/api/bridge/foundry/rpg-tools-bridge.zip` };
}

export async function foundryManifest(origin: string) {
  return manifestFor(await readFile(path.join(dir(), "module.json"), "utf8"), origin);
}

/** The module zip, with module.json at the top and the manifest filled in for this site. */
export async function foundryZip(origin: string) {
  const enc = new TextEncoder();
  const files = await Promise.all(FOUNDRY_FILES.map(async name => {
    if (name === "module.json") return { name, data: enc.encode(JSON.stringify(await foundryManifest(origin), null, 2) + "\n") };
    return { name, data: new Uint8Array(await readFile(path.join(dir(), name))) };
  }));
  return zipFiles(files);
}
