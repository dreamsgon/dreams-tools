/*
 * The RPG Tools extension for Fantasy Grounds Unity as RPG Tools serves it: /api/bridge/fantasygrounds/rpg-tools.ext.
 * An .ext file is a zip with extension.xml at its root. The files live in integrations/fantasygrounds/rpg-tools.
 * It holds no campaign data. Its script is filled in with this site's address, so /rpgtools test knows where to look.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { zipFiles } from "./zip.ts";

export const FG_EXTENSION = "rpg-tools.ext";
export const FG_FILES = ["extension.xml", "scripts/rpgtools.lua"] as const;
const dir = () => path.join(process.cwd(), "integrations", "fantasygrounds", "rpg-tools");

/** The script for this site: its address in place of the placeholder. */
export const fantasyGroundsScript = (raw: string, origin: string) => raw.split("__RPG_TOOLS_ORIGIN__").join(new URL(origin).origin);

/** The extension for this site, ready to drop into Fantasy Grounds' extensions folder. */
export async function fantasyGroundsExtension(origin: string) {
  const files = await Promise.all(FG_FILES.map(async name => {
    const raw = await readFile(path.join(dir(), name));
    const data = name === "scripts/rpgtools.lua" ? new TextEncoder().encode(fantasyGroundsScript(raw.toString("utf8"), origin)) : new Uint8Array(raw);
    return { name, data };
  }));
  return zipFiles(files);
}

const ECHO_MAX = 8000, SIZE_MAX = 300_000;
/**
 * /api/bridge/fantasygrounds/ping: a public answer, holding no data, for /rpgtools test in Fantasy Grounds. It checks
 * that Fantasy Grounds can reach this site, how long an address it can send (?echo=, answered with the length only)
 * and how big an answer it can read (?size=, answered with that many letters).
 */
export function fantasyGroundsPing(url: URL) {
  const echo = url.searchParams.get("echo"), size = Number(url.searchParams.get("size"));
  return {
    ok: true, app: "RPG Tools",
    ...(echo !== null ? { echo: Math.min(echo.length, ECHO_MAX) } : {}),
    ...(Number.isInteger(size) && size > 0 ? { pad: "x".repeat(Math.min(size, SIZE_MAX)) } : {}),
  };
}
