/* ZIP helpers for the RP repository export: write the files as a ZIP, and find the restore copy in a repository ZIP. */
import { zipFiles } from "../bridge/zip.ts";
import { workspaceSchema, type Workspace } from "./world-model.ts";
import type { RpFile } from "./rp-export.ts";

/** The export files as a ZIP (stored, fixed date): the same files always give the same bytes. */
export function rpExportZip(files: RpFile[]): Uint8Array {
  const enc = new TextEncoder();
  return zipFiles(files.map(f => ({ name: f.path, data: enc.encode(f.text) })));
}

export const RESTORE_PATH = ".rpg-tools/campaign.json";
export type RestoreResult = { ok: true; workspace: Workspace; from: string } | { ok: false; error: string };

/**
 * The full restore copy in a repository's files (after readZip). It is .rpg-tools/campaign.json, or for repositories made
 * by the older export world-manager/<campaign>/campaign.json. The result is a single-campaign workspace that importCopy
 * can import as a new copy.
 */
export function readRestoreCopy(files: { name: string; data: Uint8Array }[]): RestoreResult {
  const old = files.filter(f => /^world-manager\/[^/]+\/campaign\.json$/.test(f.name));
  const found = files.find(f => f.name === RESTORE_PATH) ?? (old.length === 1 ? old[0] : undefined);
  if (!found) {
    if (old.length > 1) return { ok: false, error: "This repository has several old campaign backups. Open the one you want and import its campaign.json." };
    const safe = files.some(f => f.name === ".rpg-tools/files.json");
    return { ok: false, error: safe ? "This is a player-safe export. It has no restore copy (.rpg-tools/campaign.json), so it cannot be imported." : "No restore copy found. Look for .rpg-tools/campaign.json in an RPG Tools export." };
  }
  let json: unknown;
  try { json = JSON.parse(new TextDecoder().decode(found.data).replace(/^﻿/, "")); } catch { return { ok: false, error: `${found.name} is not valid JSON.` }; }
  const parsed = workspaceSchema.safeParse(json);
  if (!parsed.success) { const i = parsed.error.issues[0]; return { ok: false, error: `${found.name} is not a valid campaign copy: ${i?.message ?? "unknown problem"}${i?.path.length ? ` (at ${i.path.join(".")})` : ""}.` }; }
  if (parsed.data.campaigns.length !== 1) return { ok: false, error: `${found.name} must hold exactly one campaign.` };
  return { ok: true, workspace: parsed.data, from: found.name };
}
